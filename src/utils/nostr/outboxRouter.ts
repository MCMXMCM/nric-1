import { getOutboxStorage } from './outboxStorage';
import type { NostrFilter, NostrEvent } from '@nostrify/nostrify';
import { getGlobalRelayPool } from './relayConnectionPool';
import type { Event } from 'nostr-tools';

export interface OutboxRouterConfig {
  maxRelaysPerQuery?: number;
  fallbackRelays?: string[];
  enableOutboxModel?: boolean;
}

/**
 * Outbox router that implements the outbox model for efficient relay selection
 * Replaces dynamic relay fetching with user-specific relay routing
 */
export class OutboxRouter {
  private outboxStorage = getOutboxStorage();
  private config: Required<OutboxRouterConfig>;
  private pool = getGlobalRelayPool();

  constructor(config: OutboxRouterConfig = {}) {
    this.config = {
      // Reduce max relays per query to limit fan-out and avoid rate limits
      maxRelaysPerQuery: config.maxRelaysPerQuery ?? 3,
      fallbackRelays: config.fallbackRelays ?? [
        'wss://nos.lol',
        'wss://relay.snort.social',
        'wss://nostr.mom',
        'wss://purplepag.es'
      ],
      enableOutboxModel: config.enableOutboxModel ?? true
    };
  }

  /**
   * Process and store NIP-65 events to build the routing table
   */
  async processOutboxEvents(events: Event[]): Promise<void> {
    if (!this.config.enableOutboxModel) return;

    console.log(`📦 Processing ${events.length} events...`);

    for (const event of events) {
      if (event.kind === 10002) { // NIP-65 relay list events
        try {
          console.log(`📦 Processing NIP-65 event for ${event.pubkey.slice(0, 8)}:`, {
            id: event.id,
            relayCount: event.tags.filter(t => t[0] === 'r').length,
            tags: event.tags.filter(t => t[0] === 'r').slice(0, 3) // Show first 3 relays
          });

          // Store the outbox event
          await this.outboxStorage.storeOutboxEvent(event);
          console.log(`📦 ✅ Stored outbox event for ${event.pubkey.slice(0, 8)}`);
          
          // Extract and store routing entries
          await this.outboxStorage.storeRoutingEntries({
            id: event.id,
            pubkey: event.pubkey,
            created_at: event.created_at,
            content: event.content,
            tags: event.tags,
            sig: event.sig,
            kind: event.kind,
            stored_at: Date.now()
          });
          
          console.log(`📦 ✅ Stored routing entries for ${event.pubkey.slice(0, 8)}: ${event.tags.filter(t => t[0] === 'r').length} relays`);
        } catch (error) {
          console.error(`📦 ❌ Failed to process outbox event for ${event.pubkey.slice(0, 8)}:`, error);
        }
      } else {
        console.log(`📦 Skipping non-NIP-65 event: kind ${event.kind}`);
      }
    }
  }

  /**
   * Route queries to the best relays based on the outbox model
   */
  async routeQuery(filters: NostrFilter[]): Promise<Map<string, NostrFilter[]>> {
    if (!this.config.enableOutboxModel) {
      console.log('📦 Outbox model disabled, using fallback routes');
      return this.getFallbackRoutes(filters);
    }

    try {
      // Extract authors from filters
      const authors = new Set<string>();
      for (const filter of filters) {
        if (filter.authors) {
          filter.authors.forEach(author => authors.add(author));
        }
      }

      // Log filter details for debugging pagination
      const hasUntil = filters.some(f => f.until);
      const untilValue = filters.find(f => f.until)?.until;
      console.log('📦 OutboxRouter: routeQuery called', {
        authorCount: authors.size,
        filterCount: filters.length,
        hasUntil,
        until: untilValue,
        limit: filters[0]?.limit
      });

      if (authors.size === 0) {
        console.log('📦 No authors in filter, using fallback routes');
        return this.getFallbackRoutes(filters);
      }

      // Get relays for these authors from the routing table
      const userRelays = await this.outboxStorage.getRelaysForUsers([...authors]);
      
      if (userRelays.size === 0) {
        console.warn('📦 ⚠️ No outbox data found for these authors. You may need to run "Discover Now" first.');
        console.log('📦 Using fallback relays:', this.config.fallbackRelays);
        return this.getFallbackRoutes(filters);
      }

      // Build relay -> filters mapping
      const routes = new Map<string, NostrFilter[]>();
      const usedRelays = new Set<string>();

      for (const [, relays] of userRelays) {
        // Get read-capable relays for this author
        const readRelays = relays.filter(relay => 
          relay.permission === 'read' || 
          relay.permission === 'readwrite' ||
          relay.permission === 'indexer'
        );

        // Limit to maxRelaysPerQuery
        const selectedRelays = readRelays
          .slice(0, this.config.maxRelaysPerQuery)
          .map(relay => relay.relay);

        for (const relay of selectedRelays) {
          if (!usedRelays.has(relay)) {
            routes.set(relay, filters);
            usedRelays.add(relay);
          }
        }
      }

      // If no relays found, add a single fallback relay to reduce load
      if (routes.size === 0) {
        console.log(`📦 No outbox relays found, adding a single fallback relay`);
        const fallbackRoutes = this.getFallbackRoutes(filters);
        const first = Array.from(fallbackRoutes.entries())[0];
        if (first) routes.set(first[0], first[1]);
      }

      const relayList = Array.from(routes.keys());
      console.log(`📦 Outbox routing: ${routes.size} relays for ${authors.size} authors`, {
        hasUntil,
        until: untilValue,
        relays: relayList.slice(0, 3)
      });
      return routes;

    } catch (error) {
      console.warn('Outbox routing failed, using fallback:', error);
      return this.getFallbackRoutes(filters);
    }
  }

  /**
   * Route events to the best relays for publishing
   */
  async routeEvent(event: NostrEvent): Promise<string[]> {
    if (!this.config.enableOutboxModel) {
      return this.config.fallbackRelays;
    }

    try {
      // Get the author's preferred relays for publishing
      const publishRelays = await this.outboxStorage.getPublishRelays(event.pubkey);
      
      if (publishRelays.length === 0) {
        console.log(`📦 No publish relays found for ${event.pubkey.slice(0, 8)}, using fallback`);
        return this.config.fallbackRelays;
      }

      // Limit to reasonable number of relays
      const selectedRelays = publishRelays.slice(0, this.config.maxRelaysPerQuery);
      
      console.log(`📦 Publishing to ${selectedRelays.length} outbox relays for ${event.pubkey.slice(0, 8)}`);
      return selectedRelays;

    } catch (error) {
      console.warn('Outbox event routing failed, using fallback:', error);
      return this.config.fallbackRelays;
    }
  }

  /**
   * Discover and store outbox events for users
   */
  async discoverOutboxEvents(pubkeys: string[], discoveryRelays: string[]): Promise<{ 
    success: boolean; 
    eventsFound: number; 
    usersDiscovered: number;
    error?: string;
  }> {
    if (!this.config.enableOutboxModel) {
      return { success: false, eventsFound: 0, usersDiscovered: 0, error: 'Outbox model disabled' };
    }

    if (pubkeys.length === 0) {
      return { success: false, eventsFound: 0, usersDiscovered: 0, error: 'No pubkeys provided' };
    }

    if (discoveryRelays.length === 0) {
      return { success: false, eventsFound: 0, usersDiscovered: 0, error: 'No discovery relays provided' };
    }

    try {
      console.log(`📦 Starting outbox discovery for ${pubkeys.length} users on ${discoveryRelays.length} relays`);
      
      // Query for NIP-65 events from these users
      // Apply a 90-day cutoff to reduce payloads
      const ninetyDaysAgo = Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000);
      const filter = {
        kinds: [10002], // NIP-65 relay list events
        authors: pubkeys,
        since: ninetyDaysAgo,
        limit: Math.max(1, Math.min(2 * pubkeys.length, 200)) // cap to avoid huge responses
      } as any;

      console.log(`📦 Querying relays:`, discoveryRelays);
      console.log(`📦 Filter details:`, {
        kinds: filter.kinds,
        authors: pubkeys.slice(0, 3), // Show first 3 authors
        since: new Date(filter.since * 1000).toISOString(),
        limit: filter.limit
      });
      
      // Route via global semaphore if available to throttle discovery
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g: any = globalThis as any;
      if (g.__nostrifyQuerySemaphore && typeof g.__nostrifyQuerySemaphore.acquire === 'function') {
        const events = await g.__nostrifyQuerySemaphore.acquire(() => this.pool.querySync(discoveryRelays, filter));
        
        console.log(`📦 Query completed, found ${events.length} events`);
        
        if (events.length > 0) {
          console.log(`📦 Found ${events.length} NIP-65 events, processing...`);
          console.log(`📦 Sample event:`, {
            id: events[0]?.id,
            pubkey: events[0]?.pubkey?.slice(0, 8),
            kind: events[0]?.kind,
            tags: events[0]?.tags?.filter((t: string[]) => t[0] === 'r').length
          });
          
          await this.processOutboxEvents(events);
          
          // Count unique users discovered
          const uniqueUsers = new Set(events.map((e: { pubkey: string }) => e.pubkey));
          const usersDiscovered = uniqueUsers.size;
          
          console.log(`📦 ✅ Discovery complete: ${events.length} events from ${usersDiscovered} users`);
          return { success: true, eventsFound: events.length, usersDiscovered };
        } else {
          console.log(`📦 ⚠️ No NIP-65 events found for these users`);
          return { success: true, eventsFound: 0, usersDiscovered: 0 };
        }
      }

      const events = await this.pool.querySync(discoveryRelays, filter);
      
      if (events.length > 0) {
        console.log(`📦 Found ${events.length} NIP-65 events, processing...`);
        await this.processOutboxEvents(events);
        
        // Count unique users discovered
        const uniqueUsers = new Set(events.map(e => e.pubkey));
        const usersDiscovered = uniqueUsers.size;
        
        console.log(`📦 ✅ Discovery complete: ${events.length} events from ${usersDiscovered} users`);
        return { success: true, eventsFound: events.length, usersDiscovered };
      } else {
        console.log(`📦 ⚠️ No NIP-65 events found for these users`);
        return { success: true, eventsFound: 0, usersDiscovered: 0 };
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('📦 ❌ Failed to discover outbox events:', error);
      return { success: false, eventsFound: 0, usersDiscovered: 0, error: errorMsg };
    }
  }

  /**
   * Get fallback routes when outbox model fails
   */
  private getFallbackRoutes(filters: NostrFilter[]): Map<string, NostrFilter[]> {
    // Return a prioritized single-entry map to limit fallback fan-out
    const routes = new Map<string, NostrFilter[]>();
    if (this.config.fallbackRelays.length > 0) {
      routes.set(this.config.fallbackRelays[0], filters);
    }
    return routes;
  }

  /**
   * Get statistics about the outbox router
   */
  async getStats(): Promise<{
    storage: {
      totalEvents: number;
      totalRoutingEntries: number;
      uniqueUsers: number;
      uniqueRelays: number;
    };
    config: OutboxRouterConfig;
  }> {
    const storageStats = await this.outboxStorage.getStats();
    
    return {
      storage: storageStats,
      config: this.config
    };
  }

  /**
   * Clean up old routing data
   */
  async cleanup(): Promise<void> {
    await this.outboxStorage.cleanupOldEntries();
  }
}

// Global instance
let outboxRouter: OutboxRouter | null = null;

export const getOutboxRouter = (config?: OutboxRouterConfig): OutboxRouter => {
  if (!outboxRouter) {
    outboxRouter = new OutboxRouter(config);
  }
  return outboxRouter;
};
