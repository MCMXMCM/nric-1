/**
 * Unified Connection Manager for Nostr
 * Coordinates between NDK and SimplePool to prevent conflicts and ensure stability
 */

import NDK from '@nostr-dev-kit/ndk';
import { SimplePool, Relay } from 'nostr-tools';
import { RelayConnectionPool } from './relayConnectionPool';
import { getGlobalWebSocketManager } from '../websocketManager';
import type { Filter } from 'nostr-tools';

interface UnifiedConnectionConfig {
  useSimplePoolForQueries: boolean;
  useNDKForPublishing: boolean;
  maxConcurrentConnections: number;
  connectionTimeout: number;
  enableWebSocketManager: boolean;
}

const DEFAULT_CONFIG: UnifiedConnectionConfig = {
  useSimplePoolForQueries: true, // SimplePool is more stable for queries
  useNDKForPublishing: false,    // Disabled to prevent conflicts with Nostrify
  maxConcurrentConnections: 15,
  connectionTimeout: 10000,
  enableWebSocketManager: true,
};

export class UnifiedConnectionManager {
  private ndk: NDK | null = null;
  private simplePool: SimplePool | null = null;
  private _relayPool: RelayConnectionPool | null = null;
  private config: UnifiedConnectionConfig;
  private isDestroyed = false;
  private activeConnections: Set<string> = new Set();

  constructor(config: Partial<UnifiedConnectionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the unified connection manager
   */
  async initialize(relayUrls: string[]): Promise<void> {
    if (this.isDestroyed) {
      throw new Error('UnifiedConnectionManager has been destroyed');
    }

    // Initialize SimplePool for queries
    if (this.config.useSimplePoolForQueries) {
      this.simplePool = new SimplePool();
      this._relayPool = new RelayConnectionPool({
        maxConnections: this.config.maxConcurrentConnections,
        connectionTimeout: this.config.connectionTimeout,
      });
    }

    // Initialize NDK for publishing
    if (this.config.useNDKForPublishing) {
      this.ndk = new NDK({
        explicitRelayUrls: relayUrls,
      });

      // Connect NDK with timeout
      await this.connectNDKWithTimeout();
    }

  }

  /**
   * Connect NDK with timeout to prevent hanging
   */
  private async connectNDKWithTimeout(): Promise<void> {
    if (!this.ndk) return;

    const connectPromise = this.ndk.connect();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('NDK connection timeout')), this.config.connectionTimeout);
    });

    try {
      await Promise.race([connectPromise, timeoutPromise]);

    } catch (error) {
      console.warn('NDK connection failed, falling back to SimplePool only:', error);
      this.ndk = null;
    }
  }

  /**
   * Get a relay connection for queries
   */
  async getQueryConnection(url: string): Promise<Relay> {
    if (this.isDestroyed) {
      throw new Error('UnifiedConnectionManager has been destroyed');
    }

    if (!this.relayPool) {
      throw new Error('SimplePool not initialized');
    }

    // Check concurrent connection limit
    if (this.activeConnections.size >= this.config.maxConcurrentConnections) {
      throw new Error(`Maximum concurrent connections (${this.config.maxConcurrentConnections}) reached`);
    }

    this.activeConnections.add(url);

    try {
      const connection = await this.relayPool.getConnection(url);
      return connection;
    } catch (error) {
      this.activeConnections.delete(url);
      throw error;
    }
  }

  /**
   * Query multiple relays (uses SimplePool for stability)
   */
  async queryRelays(relayUrls: string[], filters: Filter[]): Promise<any[]> {
    if (!this.simplePool) {
      throw new Error('SimplePool not initialized');
    }

    try {
      return await this.simplePool.querySync(relayUrls, filters as any);
    } catch (error) {
      console.warn('SimplePool query failed, attempting with RelayConnectionPool:', error);

      // Fallback to relay pool for individual queries
      if (this._relayPool) {
        const results: any[] = [];
        for (const url of relayUrls) {
          try {
            await this.getQueryConnection(url);
            // This is a simplified fallback - in practice you'd need to implement
            // the query logic here

          } catch (relayError) {
            console.warn(`Fallback query failed for ${url}:`, relayError);
          }
        }
        return results;
      }

      throw error;
    }
  }

  /**
   * Publish an event (uses SimplePool for consistency)
   */
  async publishEvent(relayUrls: string[], event: any): Promise<string[]> {
    // Use SimplePool for publishing to maintain consistency
    if (this.simplePool) {
      try {
        const result = await this.simplePool.publish(relayUrls, event);
        return Promise.all(result);
      } catch (error) {
        console.warn('SimplePool publish failed:', error);
        throw error;
      }
    }

    throw new Error('No publishing mechanism available');
  }

  /**
   * Subscribe to multiple relays
   */
  subscribeMany(relayUrls: string[], filters: Filter[], params?: any) {
    if (!this.simplePool) {
      throw new Error('SimplePool not initialized');
    }

    return this.simplePool.subscribeMany(relayUrls, filters, params);
  }

  /**
   * Close connections to specific relays
   */
  closeConnections(relayUrls: string[]): void {
    relayUrls.forEach(url => {
      this.activeConnections.delete(url);
    });

    if (this._relayPool) {
      this._relayPool.close(relayUrls);
    }
  }

  /**
   * Get the relay connection pool (for backward compatibility)
   */
  get relayPool(): RelayConnectionPool | null {
    return this._relayPool;
  }

  /**
   * Get connection statistics
   */
  getConnectionStats(): {
    simplePoolStats?: any;
    ndkConnected: boolean;
    activeConnections: number;
    maxConnections: number;
  } {
    const stats = {
      ndkConnected: !!this.ndk,
      activeConnections: this.activeConnections.size,
      maxConnections: this.config.maxConcurrentConnections,
    };

    if (this._relayPool) {
      const poolStats = this._relayPool.getConnectionStats();
      return { ...stats, simplePoolStats: poolStats };
    }

    return stats;
  }

  /**
   * Check if a relay is connected
   */
  isConnected(url: string): boolean {
    if (this._relayPool) {
      return this._relayPool.isConnected(url);
    }
    return false;
  }

  /**
   * Force cleanup of stale connections
   */
  forceCleanup(): void {

    if (this.relayPool) {
      this.relayPool.forceCleanup();
    }

    // Clear active connections tracking
    this.activeConnections.clear();

    // Force cleanup WebSocket manager if enabled
    if (this.config.enableWebSocketManager) {
      const wsManager = getGlobalWebSocketManager();
      wsManager.forceCleanup();
    }
  }

  /**
   * Destroy the unified manager
   */
  destroy(): void {
    if (this.isDestroyed) return;

    this.isDestroyed = true;

    // Close all active connections
    if (this._relayPool) {
      this._relayPool.destroy();
      this._relayPool = null;
    }

    // Disconnect NDK
    if (this.ndk) {
      // NDK doesn't have a destroy method, but we can try to disconnect
      try {
        // Note: NDK may not have a disconnect method, this is a best-effort cleanup

      } catch (error) {
        console.warn('Error during NDK cleanup:', error);
      }
      this.ndk = null;
    }

    // Clean up SimplePool
    if (this.simplePool) {
      // SimplePool doesn't have a destroy method in nostr-tools
      this.simplePool = null;
    }

    // Clear active connections
    this.activeConnections.clear();

    // Clean up WebSocket manager
    if (this.config.enableWebSocketManager) {
      const wsManager = getGlobalWebSocketManager();
      wsManager.destroy();
    }
  }
}

// Global instance
let globalUnifiedManager: UnifiedConnectionManager | null = null;

export const getGlobalUnifiedConnectionManager = (): UnifiedConnectionManager => {
  if (!globalUnifiedManager) {
    globalUnifiedManager = new UnifiedConnectionManager();
  }
  return globalUnifiedManager;
};

export const destroyGlobalUnifiedConnectionManager = (): void => {
  if (globalUnifiedManager) {
    globalUnifiedManager.destroy();
    globalUnifiedManager = null;
  }
};
