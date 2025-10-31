import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useUnifiedWebSocketManager } from './useUnifiedWebSocketManager';
import { getGlobalRelayPool } from '../utils/nostr/relayConnectionPool';
import { type Event, type Filter } from 'nostr-tools';
import { CACHE_KEYS } from '../utils/cacheKeys';
import type { Metadata } from '../types/nostr/types';
import { useOutboxRelayManager } from './useOutboxRelayManager';

interface ProcessedEvent {
  event: Event;
  shouldUpdateMetadata: boolean;
}

interface UseEnhancedProfileMetadataConfig {
  pubkeyHex: string;
  relayUrls: string[];
  enabled?: boolean;
  realtimeEnabled?: boolean;
  onMetadataUpdate?: (metadata: Metadata) => void;
}

/**
 * Enhanced profile metadata hook with real-time WebSocket updates
 * Integrates with TanStack Query and provides live updates for profile metadata
 */
export function useEnhancedProfileMetadata(config: UseEnhancedProfileMetadataConfig) {
  const {
    pubkeyHex,
    relayUrls,
    enabled = true,
    realtimeEnabled = false,
    onMetadataUpdate
  } = config;

  const queryClient = useQueryClient();
  const wsManager = useUnifiedWebSocketManager();
  
  // Initialize outbox relay manager for discovery
  const { discoverOutboxEvents: _discoverOutboxEvents } = useOutboxRelayManager({
    autoInitialize: true
  });
  
  // Track seen metadata events to prevent duplicates
  const seenEventIds = useRef<Set<string>>(new Set());
  const lastUpdateTime = useRef<number>(Date.now());


  // Rate limiting for cache updates
  const lastCacheUpdateRef = useRef<number>(0);
  const pendingUpdatesRef = useRef<ProcessedEvent[]>([]);
  const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable query key
  const queryKey = useMemo(
    () => CACHE_KEYS.METADATA(pubkeyHex),
    [pubkeyHex]
  );

  // Enhanced enabled condition
  const queryEnabled = useMemo(() => {
    return Boolean(
      pubkeyHex && 
      relayUrls.length > 0 && 
      enabled
    );
  }, [pubkeyHex, relayUrls, enabled]);

  /**
   * Process incoming WebSocket event for metadata
   */
  const processEvent = useCallback((event: any): ProcessedEvent | null => {
    try {
      // Only process metadata events (kind 0)
      if (event.kind !== 0) {
        return null;
      }

      // Only process events from the target pubkey
      if (event.pubkey !== pubkeyHex) {
        return null;
      }

      // Check if we've already seen this event
      const deduplicated = seenEventIds.current.has(event.id);
      if (!deduplicated) {
        seenEventIds.current.add(event.id);
      }

      return {
        event,
        shouldUpdateMetadata: !deduplicated
      };
    } catch (error) {
      console.error('Failed to process metadata event:', error);
      return null;
    }
  }, [pubkeyHex]);

  /**
   * Parse metadata from event content
   */
  const parseMetadataFromEvent = useCallback((event: Event): Metadata | null => {
    try {
      const content = event.content;
      if (!content || content.trim() === '') {
        return null;
      }

      const parsed = JSON.parse(content) as any;
      
      // Validate and normalize metadata
      const metadata: Metadata = {
        name: parsed.name || '',
        display_name: parsed.display_name || parsed.displayName || '',
        about: parsed.about || '',
        picture: parsed.picture || '',
        banner: parsed.banner || '',
        website: parsed.website || '',
        lud16: parsed.lud16 || '',
        nip05: parsed.nip05 || '',
      };

      return metadata;
    } catch (error) {
      console.error('Failed to parse metadata from event:', error);
      return null;
    }
  }, []);

  /**
   * Batched cache update function with rate limiting
   */
  const executeBatchedCacheUpdate = useCallback(() => {
    const updates = [...pendingUpdatesRef.current];
    pendingUpdatesRef.current = [];

    if (updates.length === 0) return;

    console.log(`📝 Profile metadata: Executing batched cache update: ${updates.length} new events`);

    // Process updates and get the most recent metadata
    let latestMetadata: Metadata | null = null;
    let latestTimestamp = 0;

    updates.forEach(update => {
      if (update.shouldUpdateMetadata && update.event.created_at > latestTimestamp) {
        const metadata = parseMetadataFromEvent(update.event);
        if (metadata) {
          latestMetadata = metadata;
          latestTimestamp = update.event.created_at;
        }
      }
    });

    // Update cache if we have new metadata
    if (latestMetadata) {
      queryClient.setQueryData(queryKey, latestMetadata);
      lastCacheUpdateRef.current = Date.now();
      lastUpdateTime.current = Date.now();

      // Call the callback
      if (onMetadataUpdate) {
        onMetadataUpdate(latestMetadata);
      }
    }
  }, [queryClient, queryKey, parseMetadataFromEvent, onMetadataUpdate]);

  /**
   * Handle real-time events with batching and rate limiting
   */
  const handleRealtimeEvent = useCallback((event: any) => {
    const processed = processEvent(event);
    if (!processed) return;

    // Add to pending updates
    pendingUpdatesRef.current.push(processed);

    // Clear existing timer
    if (updateTimerRef.current) {
      clearTimeout(updateTimerRef.current);
    }

    // Rate limit cache updates to avoid overwhelming the UI
    const timeSinceLastUpdate = Date.now() - lastCacheUpdateRef.current;
    const minUpdateInterval = 1000; // 1 second minimum between cache updates

    if (timeSinceLastUpdate >= minUpdateInterval) {
      // Execute immediately if enough time has passed
      executeBatchedCacheUpdate();
    } else {
      // Schedule for later
      const delay = minUpdateInterval - timeSinceLastUpdate;
      updateTimerRef.current = setTimeout(executeBatchedCacheUpdate, delay);
    }
  }, [processEvent, executeBatchedCacheUpdate]);

  // Main query for metadata
  const metadataQuery = useQuery<Metadata | null>({
    queryKey,
    enabled: queryEnabled,
    staleTime: 5 * 60 * 1000, // 5 minutes (metadata changes less frequently)
    gcTime: 30 * 60 * 1000, // 30 minutes
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const pool = getGlobalRelayPool();
      
      const filter: Filter = {
        kinds: [0],
        authors: [pubkeyHex],
        limit: 1
      };
      
      const events: Event[] = await pool.querySync(relayUrls, filter);
      
      if (events.length === 0) {
        return null;
      }
      
      // Get the most recent metadata event
      const latestEvent = events.sort((a, b) => b.created_at - a.created_at)[0];
      
      // Update seen IDs
      events.forEach(event => seenEventIds.current.add(event.id));
      
      return parseMetadataFromEvent(latestEvent);
    },
  });

  // Set up real-time WebSocket subscription for metadata
  useEffect(() => {
    if (!realtimeEnabled || !queryEnabled || !pubkeyHex || !relayUrls.length) {
      return;
    }

    // Build filter for metadata events (kind 0)
    const filter = {
      kinds: [0],
      authors: [pubkeyHex],
      since: Math.floor(Date.now() / 1000), // Only get events from now forward
      limit: undefined // Remove limit for real-time feed
    };

    console.log('🔴 Setting up real-time profile metadata subscription', {
      pubkey: pubkeyHex.slice(0, 8),
      relayUrls: relayUrls.length,
      filter
    });

    const unsubscribe = wsManager.subscribe({
      id: `profile-metadata-${pubkeyHex}`,
      relayUrls,
      filter,
      enabled: true,
      onEvent: handleRealtimeEvent,
      queryKey
    });

    return () => {
      unsubscribe();
      
      // Clear pending updates
      if (updateTimerRef.current) {
        clearTimeout(updateTimerRef.current);
        updateTimerRef.current = null;
      }
      pendingUpdatesRef.current = [];
    };
  }, [
    realtimeEnabled,
    queryEnabled,
    pubkeyHex,
    relayUrls,
    wsManager,
    handleRealtimeEvent,
    queryKey
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (updateTimerRef.current) {
        clearTimeout(updateTimerRef.current);
      }
    };
  }, []);

  // Calculate real-time statistics
  const realtimeStats = useMemo(() => {
    const timeSinceLastUpdate = Date.now() - lastUpdateTime.current;
    return {
      isConnected: realtimeEnabled && queryEnabled,
      lastUpdateTime: lastUpdateTime.current,
      timeSinceLastUpdate,
      seenEventsCount: seenEventIds.current.size,
      pendingUpdatesCount: pendingUpdatesRef.current.length
    };
  }, [realtimeEnabled, queryEnabled, lastUpdateTime.current]);

  // Derived values
  const metadata = metadataQuery.data || null;
  const isLoadingMeta = metadataQuery.isPending;
  const metadataError = metadataQuery.error;

  // Display name logic
  const displayTitle = useMemo(() => {
    if (!metadata) return pubkeyHex.slice(0, 8) + '…';
    
    return (
      metadata.display_name ||
      metadata.name ||
      pubkeyHex.slice(0, 8) + '…'
    );
  }, [metadata, pubkeyHex]);

  return {
    // Standard query interface
    ...metadataQuery,
    
    // Metadata data
    metadata,
    isLoadingMeta,
    metadataError,
    displayTitle,
    
    // Real-time specific data
    realtimeStats,
    
    // Actions
    refetchMetadata: metadataQuery.refetch,
    
    // Utility functions
    clearSeenEvents: () => seenEventIds.current.clear(),
    forceUpdateCache: executeBatchedCacheUpdate,
  };
}
