import { useEffect, useRef, useMemo } from 'react';
import { useQueryClient, type QueryKey, type InfiniteData, QueryClient } from '@tanstack/react-query';
import type { Note } from '../types/nostr/types';
import { getGlobalRelayPool } from '../utils/nostr/relayConnectionPool';

interface WebSocketSubscription {
  id: string;
  relayUrls: string[];
  filter: any; // Nostr Filter type
  onEvent?: (event: any) => void; // Nostr Event type
  queryKey?: QueryKey; // Link to TanStack Query cache
  enabled: boolean;
}

interface NotePage {
  notes: Note[];
  nextCursor?: number;
}

interface UnifiedWebSocketManagerOptions {
  maxConnections?: number;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
}

/**
 * Unified WebSocket Manager that integrates directly with TanStack Query
 * Provides centralized connection management and smart cache updates
 */
export class UnifiedWebSocketManager {
  private subscriptions = new Map<string, WebSocketSubscription>();
  private activeConnections = new Map<string, { close: () => void }>();
  private queryClient: QueryClient;
  private options: Required<UnifiedWebSocketManagerOptions>;
  private isDestroyed = false;
  private eventBuffer = new Map<string, Event[]>(); // Buffer events during connection setup
  private connectionPromises = new Map<string, Promise<void>>();

  constructor(queryClient: QueryClient, options: UnifiedWebSocketManagerOptions = {}) {
    this.queryClient = queryClient;
    this.options = {
      maxConnections: options.maxConnections ?? 20,
      reconnectDelay: options.reconnectDelay ?? 3000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 5,
    };
  }

  /**
   * Subscribe to real-time events with automatic cache integration
   */
  subscribe(subscription: WebSocketSubscription): () => void {
    if (this.isDestroyed) {
      console.warn('Cannot subscribe: WebSocketManager is destroyed');
      return () => {};
    }

    // Store subscription
    this.subscriptions.set(subscription.id, subscription);

    // Set up connections for enabled subscriptions
    if (subscription.enabled) {
      this.setupSubscription(subscription);
    }

    // Return cleanup function
    return () => {
      this.unsubscribe(subscription.id);
    };
  }

  /**
   * Update an existing subscription (e.g., when relays change)
   */
  updateSubscription(id: string, updates: Partial<WebSocketSubscription>): void {
    const existing = this.subscriptions.get(id);
    if (!existing) {
      console.warn(`Subscription ${id} not found`);
      return;
    }

    const updated = { ...existing, ...updates };
    this.subscriptions.set(id, updated);

    // If relays or filter changed, restart the subscription
    if (updates.relayUrls || updates.filter || updates.enabled !== undefined) {
      this.cleanupSubscription(id);
      if (updated.enabled) {
        this.setupSubscription(updated);
      }
    }
  }

  /**
   * Unsubscribe from events
   */
  unsubscribe(id: string): void {
    this.cleanupSubscription(id);
    this.subscriptions.delete(id);
  }

  /**
   * Clean up all subscriptions and connections
   */
  destroy(): void {
    this.isDestroyed = true;
    
    // Clean up all subscriptions
    for (const id of this.subscriptions.keys()) {
      this.cleanupSubscription(id);
    }
    
    this.subscriptions.clear();
    this.activeConnections.clear();
    this.eventBuffer.clear();
    this.connectionPromises.clear();
  }

  /**
   * Set up WebSocket subscription for real-time events
   */
  private async setupSubscription(subscription: WebSocketSubscription): Promise<void> {
    const { id } = subscription;

    try {
      // Prevent duplicate connection attempts
      if (this.connectionPromises.has(id)) {
        await this.connectionPromises.get(id);
        return;
      }

      const connectionPromise = this.establishConnection(subscription);
      this.connectionPromises.set(id, connectionPromise);
      
      await connectionPromise;
      
      this.connectionPromises.delete(id);
    } catch (error) {
      console.error(`Failed to setup subscription ${id}:`, error);
      this.connectionPromises.delete(id);
    }
  }

  /**
   * Establish WebSocket connection and set up event handling
   */
  private async establishConnection(subscription: WebSocketSubscription): Promise<void> {
    const { id, relayUrls, filter, onEvent, queryKey } = subscription;

    try {
      const relayPool = getGlobalRelayPool();
      
      // Create subscription with enhanced event handling
      const sub = relayPool.subscribeMany(relayUrls, [filter], {
        onevent: (event: Event) => {
          this.handleEvent(event, { onEvent, queryKey, subscriptionId: id });
        },
        onclose: (reason: string) => {
          console.log(`Subscription ${id} closed:`, reason);
          this.handleConnectionClose(id, reason);
        },
        oneose: () => {
          console.log(`Subscription ${id} established (EOSE received)`);
          this.flushEventBuffer(id);
        }
      });

      // Store connection for cleanup
      this.activeConnections.set(id, sub);
      
    } catch (error) {
      console.error(`Failed to establish connection for subscription ${id}:`, error);
      throw error;
    }
  }

  /**
   * Handle incoming WebSocket events with smart cache updates
   */
  private handleEvent(
    event: any, 
    context: { 
      onEvent?: (event: any) => void; 
      queryKey?: QueryKey; 
      subscriptionId: string;
    }
  ): void {
    const { onEvent, queryKey, subscriptionId } = context;

    // Call custom event handler if provided
    if (onEvent) {
      onEvent(event);
    }

    // Update TanStack Query cache if queryKey is provided
    if (queryKey) {
      this.updateQueryCache(event, queryKey);
    }

    // Buffer events if connection is still establishing
    if (!this.activeConnections.has(subscriptionId)) {
      this.bufferEvent(subscriptionId, event);
    }
  }

  /**
   * Update TanStack Query cache with new event data
   */
  private updateQueryCache(event: Event, queryKey: QueryKey): void {
    try {
      // Handle infinite query updates (most common case for feeds)
      this.queryClient.setQueryData(queryKey, (oldData: InfiniteData<NotePage> | undefined) => {
        if (!oldData) return oldData;

        const newNote = this.eventToNote(event);
        if (!newNote) return oldData;

        // Add to first page (most recent)
        const firstPage = oldData.pages[0];
        if (!firstPage) return oldData;

        // Check for duplicates
        const noteExists = firstPage.notes.some(note => note.id === newNote.id);
        if (noteExists) return oldData;

        return {
          ...oldData,
          pages: [
            {
              ...firstPage,
              notes: [newNote, ...firstPage.notes]
            },
            ...oldData.pages.slice(1)
          ]
        };
      });
    } catch (error) {
      console.error('Failed to update query cache:', error);
    }
  }

  /**
   * Convert Nostr event to Note format
   */
  private eventToNote(event: any): Note | null {
    try {
      // Basic event to note conversion
      // This should match your existing event processing logic
      return {
        id: event.id,
        pubkey: event.pubkey,
        created_at: event.created_at,
        kind: event.kind || 1,
        tags: event.tags,
        content: event.content,
        imageUrls: [],
        videoUrls: [],
        receivedAt: Date.now()
      };
    } catch (error) {
      console.error('Failed to convert event to note:', error);
      return null;
    }
  }

  /**
   * Buffer events during connection establishment
   */
  private bufferEvent(subscriptionId: string, event: any): void {
    const buffer = this.eventBuffer.get(subscriptionId) || [];
    buffer.push(event);
    this.eventBuffer.set(subscriptionId, buffer);

    // Limit buffer size to prevent memory issues
    if (buffer.length > 100) {
      buffer.shift(); // Remove oldest event
    }
  }

  /**
   * Flush buffered events once connection is established
   */
  private flushEventBuffer(subscriptionId: string): void {
    const buffer = this.eventBuffer.get(subscriptionId);
    if (!buffer || buffer.length === 0) return;

    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return;

    // Process buffered events
    buffer.forEach(event => {
      this.handleEvent(event, {
        onEvent: subscription.onEvent,
        queryKey: subscription.queryKey,
        subscriptionId
      });
    });

    // Clear buffer
    this.eventBuffer.delete(subscriptionId);
  }

  /**
   * Handle connection close and implement reconnection logic
   */
  private handleConnectionClose(subscriptionId: string, _reason: string): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription || !subscription.enabled) return;

    // Clean up current connection
    this.activeConnections.delete(subscriptionId);

    // Implement exponential backoff reconnection
    setTimeout(() => {
      if (this.subscriptions.has(subscriptionId) && !this.isDestroyed) {
        console.log(`Attempting to reconnect subscription ${subscriptionId}`);
        this.setupSubscription(subscription);
      }
    }, this.options.reconnectDelay);
  }

  /**
   * Clean up a specific subscription
   */
  private cleanupSubscription(id: string): void {
    // Close active connection
    const connection = this.activeConnections.get(id);
    if (connection) {
      try {
        connection.close();
      } catch (error) {
        console.warn(`Error closing connection ${id}:`, error);
      }
      this.activeConnections.delete(id);
    }

    // Clear event buffer
    this.eventBuffer.delete(id);
    
    // Clear connection promises
    this.connectionPromises.delete(id);
  }
}

// Global UnifiedWebSocketManager instance
let globalUnifiedWebSocketManager: UnifiedWebSocketManager | null = null;

export const getGlobalUnifiedWebSocketManager = (queryClient: QueryClient, options: UnifiedWebSocketManagerOptions = {}): UnifiedWebSocketManager => {
  if (!globalUnifiedWebSocketManager) {
    globalUnifiedWebSocketManager = new UnifiedWebSocketManager(queryClient, options);
  }
  return globalUnifiedWebSocketManager;
};

export const destroyGlobalUnifiedWebSocketManager = (): void => {
  if (globalUnifiedWebSocketManager) {
    globalUnifiedWebSocketManager.destroy();
    globalUnifiedWebSocketManager = null;
  }
};

/**
 * React hook for unified WebSocket management
 * Uses a global instance to prevent destruction during component unmounts
 */
export function useUnifiedWebSocketManager(
  options: UnifiedWebSocketManagerOptions = {}
): UnifiedWebSocketManager {
  const queryClient = useQueryClient();
  
  // Get global manager instance (stable reference)
  const manager = useMemo(
    () => getGlobalUnifiedWebSocketManager(queryClient, options),
    [queryClient] // Only recreate if queryClient changes
  );

  // No cleanup on unmount - let the global instance persist
  return manager;
}

/**
 * Hook for subscribing to real-time events with automatic cleanup
 */
export function useRealtimeSubscription(
  subscription: Omit<WebSocketSubscription, 'id'> & { id?: string }
): {
  isConnected: boolean;
  reconnectAttempts: number;
} {
  const manager = useUnifiedWebSocketManager();
  const subscriptionId = subscription.id || `subscription-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const isConnectedRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);

  // Set up subscription
  useEffect(() => {
    const fullSubscription: WebSocketSubscription = {
      ...subscription,
      id: subscriptionId,
    };

    const unsubscribe = manager.subscribe(fullSubscription);
    
    return unsubscribe;
  }, [manager, subscriptionId, subscription.enabled, JSON.stringify(subscription.relayUrls), JSON.stringify(subscription.filter)]);

  return {
    isConnected: isConnectedRef.current,
    reconnectAttempts: reconnectAttemptsRef.current,
  };
}
