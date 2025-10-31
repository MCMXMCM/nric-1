import { NPool, NRelay1 } from '@nostrify/nostrify';
import type { NostrFilter, NostrEvent } from '@nostrify/nostrify';
import { getOutboxRouter, type OutboxRouterConfig } from './outboxRouter';
import type { RelayPermission } from '../../types/nostr/types';

export interface OutboxNPoolConfig {
  relayUrls: string[];
  relayPermissions: Map<string, RelayPermission>;
  outboxConfig?: OutboxRouterConfig;
}

/**
 * NPool implementation with outbox model routing
 * Replaces dynamic relay fetching with user-specific relay selection
 */
export class OutboxNPool {
  private pool: NPool;
  private outboxRouter = getOutboxRouter();

  constructor(config: OutboxNPoolConfig) {
    this.pool = new NPool({
      open: (url: string) => {
        console.log("🔌 Opening relay connection:", url);
        return new NRelay1(url);
      },
      reqRouter: async (filters: NostrFilter[]) => {
        return this.routeQuery(filters);
      },
      eventRouter: async (event: NostrEvent) => {
        return this.routeEvent(event);
      }
    });

    // Initialize outbox router with config
    this.outboxRouter = getOutboxRouter(config.outboxConfig);
  }

  /**
   * Route queries using the outbox model
   */
  private async routeQuery(filters: NostrFilter[]): Promise<Map<string, NostrFilter[]>> {
    try {
      // Use outbox router for intelligent relay selection
      const outboxRoutes = await this.outboxRouter.routeQuery(filters);
      
      if (outboxRoutes.size > 0) {
        console.log(`📦 Outbox routing: ${outboxRoutes.size} relays selected`);
        return outboxRoutes;
      }
    } catch (error) {
      console.warn('Outbox routing failed, falling back to permission-based routing:', error);
    }

    // Fallback to permission-based routing
    return this.getPermissionBasedRoutes(filters);
  }

  /**
   * Route events using the outbox model
   */
  private async routeEvent(event: NostrEvent): Promise<string[]> {
    try {
      // Use outbox router for intelligent relay selection
      const outboxRelays = await this.outboxRouter.routeEvent(event);
      
      if (outboxRelays.length > 0) {
        console.log(`📦 Outbox event routing: ${outboxRelays.length} relays selected`);
        return outboxRelays;
      }
    } catch (error) {
      console.warn('Outbox event routing failed, falling back to permission-based routing:', error);
    }

    // Fallback to permission-based routing
    return this.getPermissionBasedEventRoutes(event);
  }

  /**
   * Query multiple relays (async version)
   */
  async query(filter: any): Promise<any[]> {
    try {
      console.log('📦 OutboxNPool: query called with filter:', filter);
      
      // Use the underlying NPool for querying with proper timeout handling
      const events = await Promise.race([
        this.pool.query([filter]),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Query timeout after 30 seconds')), 30000)
        )
      ]) as any[];
      
      console.log('📦 OutboxNPool: query returned', events?.length || 0, 'events');
      return events || [];
    } catch (error) {
      console.error('OutboxNPool query failed:', error);
      // Return empty array instead of throwing to prevent infinite scroll from breaking
      return [];
    }
  }

  /**
   * Query multiple relays synchronously (compatible with RelayConnectionPool interface)
   * NPool doesn't have querySync, so we implement it using the async query method
   */
  async querySync(_relayUrls: string[], filter: any): Promise<any[]> {
    try {
      console.log('📦 OutboxNPool: querySync called', {
        filter,
        hasUntil: !!filter.until,
        until: filter.until,
        limit: filter.limit,
        hasAuthors: !!filter.authors,
        authorCount: filter.authors?.length || 0
      });
      
      // Use a longer timeout (30 seconds) to allow slow relays to respond
      // This is especially important for pagination where we need complete results
      const timeoutPromise = new Promise<any[]>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Query timeout after 30 seconds'));
        }, 30000);
      });
      
      const events = await Promise.race([
        this.pool.query([filter]),
        timeoutPromise
      ]) as any[];
      
      console.log('📦 OutboxNPool: querySync returned', events?.length || 0, 'events', {
        hasUntil: !!filter.until,
        until: filter.until
      });
      return events || [];
    } catch (error) {
      // Check if it's a timeout or routing issue
      if (error instanceof Error && error.message.includes('timeout')) {
        console.warn('📦 OutboxNPool: Query timeout - relays may be slow or unavailable', {
          hasUntil: !!filter.until,
          until: filter.until
        });
      } else {
        console.error('📦 OutboxNPool querySync failed:', error);
      }
      // Return empty array to allow pagination to continue
      // The pagination logic should handle empty results gracefully
      return [];
    }
  }

  /**
   * Subscribe to multiple relays (compatible with RelayConnectionPool interface)
   */
  subscribeMany(_relayUrls: string[], _filters: any[], _params?: any): { close: () => void } {
    try {
      // NPool doesn't have subscribeMany, so we need to create a subscription manually
      // For now, return a mock subscription that does nothing
      // TODO: Implement proper subscription using NPool's internal mechanisms
      console.warn('OutboxNPool: subscribeMany not fully implemented, using mock subscription');
      return {
        close: () => {
          console.log('OutboxNPool: Mock subscription closed');
        }
      };
    } catch (error) {
      console.error('OutboxNPool subscribeMany failed:', error);
      throw error;
    }
  }

  /**
   * Subscribe to real-time events (compatible with RelayConnectionPool interface)
   */
  subscribe(filters: any[], _params?: any): { close: () => void } {
    try {
      console.log('📦 OutboxNPool: subscribe called with filters:', filters);
      
      // NPool doesn't have a direct subscribe method, so we need to implement it
      // For now, return a mock subscription that does nothing
      // TODO: Implement proper subscription using NPool's internal mechanisms
      console.warn('OutboxNPool: subscribe not fully implemented, using mock subscription');
      return {
        close: () => {
          console.log('OutboxNPool: Mock subscription closed');
        }
      };
    } catch (error) {
      console.error('OutboxNPool subscribe failed:', error);
      throw error;
    }
  }

  /**
   * Fallback: Permission-based query routing
   */
  private getPermissionBasedRoutes(filters: NostrFilter[]): Map<string, NostrFilter[]> {
    // This would use the existing relay permission logic
    // For now, return a simple fallback
    const fallbackRelays = [
      'wss://nos.lol',
      'wss://relay.snort.social',
      'wss://nostr.mom',
      'wss://purplepag.es'
    ];
    
    const routes = new Map<string, NostrFilter[]>();
    for (const relay of fallbackRelays) {
      routes.set(relay, filters);
    }
    return routes;
  }

  /**
   * Fallback: Permission-based event routing
   */
  private getPermissionBasedEventRoutes(_event: NostrEvent): string[] {
    // This would use the existing relay permission logic
    // For now, return a simple fallback
    return [
      'wss://nos.lol',
      'wss://relay.snort.social',
      'wss://nostr.mom',
      'wss://purplepag.es'
    ];
  }

  /**
   * Discover outbox events for users
   */
  async discoverOutboxEvents(pubkeys: string[]): Promise<void> {
    const discoveryRelays = [
      'wss://nos.lol',
      'wss://relay.snort.social',
      'wss://nostr.mom',
      'wss://purplepag.es'
    ];

    await this.outboxRouter.discoverOutboxEvents(pubkeys, discoveryRelays);
  }

  /**
   * Get outbox statistics
   */
  async getOutboxStats() {
    return this.outboxRouter.getStats();
  }

  /**
   * Clean up old outbox data
   */
  async cleanupOutboxData() {
    await this.outboxRouter.cleanup();
  }

  /**
   * Proxy methods to the underlying NPool
   */
  async *req(filters: NostrFilter[]) {
    yield* this.pool.req(filters);
  }

  async event(event: NostrEvent) {
    return this.pool.event(event);
  }

  async close() {
    return this.pool.close();
  }
}

/**
 * Create an OutboxNPool instance
 */
export const createOutboxNPool = (config: OutboxNPoolConfig): OutboxNPool => {
  return new OutboxNPool(config);
};
