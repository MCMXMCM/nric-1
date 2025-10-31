import { initDB } from './db';
import { OUTBOX_EVENTS_STORE, ROUTING_TABLE_STORE } from './constants';
import type { Event } from 'nostr-tools';

/**
 * Normalize relay URL to prevent duplicates
 * - Ensures wss:// protocol
 * - Removes trailing slash
 * - Lowercases the URL
 */
function normalizeRelayUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    // Remove trailing slash and lowercase
    return urlObj.toString().replace(/\/$/, '').toLowerCase();
  } catch {
    // If URL parsing fails, do basic cleanup
    return url.replace(/\/$/, '').toLowerCase();
  }
}

export interface OutboxEvent {
  id: string;
  pubkey: string;
  created_at: number;
  content: string;
  tags: string[][];
  sig: string;
  kind: number;
  stored_at: number; // When we stored this event
}

export interface RoutingEntry {
  id: string; // Composite key: `${user}_${relay}`
  user: string; // User pubkey
  relay: string; // Relay URL
  permission: 'read' | 'write' | 'readwrite' | 'indexer';
  last_seen: number; // When we last saw this user use this relay
  source_event_id: string; // ID of the NIP-65 event that created this entry
}

export interface CachedRelayInfo {
  relay: string;
  permission: 'read' | 'write' | 'readwrite' | 'indexer';
  cached_at: number;
}

/**
 * Outbox storage layer for managing NIP-65 relay list events and routing table
 * Implements the outbox model for efficient relay selection
 */
export class OutboxStorage {
  private db: Promise<IDBDatabase>;

  constructor() {
    this.db = initDB();
  }

  /**
   * Store a NIP-65 relay list event
   */
  async storeOutboxEvent(event: Event): Promise<void> {
    const db = await this.db;
    const outboxEvent: OutboxEvent = {
      id: event.id,
      pubkey: event.pubkey,
      created_at: event.created_at,
      content: event.content,
      tags: event.tags,
      sig: event.sig,
      kind: event.kind,
      stored_at: Date.now()
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([OUTBOX_EVENTS_STORE], 'readwrite');
      const store = transaction.objectStore(OUTBOX_EVENTS_STORE);
      const request = store.put(outboxEvent);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Get the latest relay list event for a user
   */
  async getLatestRelayListEvent(pubkey: string): Promise<OutboxEvent | null> {
    const db = await this.db;
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([OUTBOX_EVENTS_STORE], 'readonly');
      const store = transaction.objectStore(OUTBOX_EVENTS_STORE);
      const index = store.index('author_created');
      
      // Query for events by this author, sorted by created_at descending
      const range = IDBKeyRange.bound([pubkey, 0], [pubkey, Number.MAX_SAFE_INTEGER]);
      const request = index.getAll(range);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const events = request.result as OutboxEvent[];
        if (events.length === 0) {
          resolve(null);
          return;
        }
        
        // Sort by created_at descending and return the latest
        const sorted = events.sort((a, b) => b.created_at - a.created_at);
        resolve(sorted[0]);
      };
    });
  }

  /**
   * Get all relay list events for multiple users
   */
  async getRelayListEvents(pubkeys: string[]): Promise<OutboxEvent[]> {
    const events: OutboxEvent[] = [];
    
    for (const pubkey of pubkeys) {
      const event = await this.getLatestRelayListEvent(pubkey);
      if (event) {
        events.push(event);
      }
    }
    
    return events;
  }

  /**
   * Store routing table entries from a NIP-65 event
   */
  async storeRoutingEntries(event: OutboxEvent): Promise<void> {
    const db = await this.db;
    
    // Extract relay URLs and permissions from the event
    const relayEntries: Omit<RoutingEntry, 'id'>[] = [];
    
    console.log(`📦 Extracting routing entries from event ${event.id} for ${event.pubkey.slice(0, 8)}`);
    
    for (const tag of event.tags) {
      if (tag[0] === 'r' && tag[1]) {
        const rawRelay = tag[1];
        const marker = tag[2];
        
        // Normalize relay URL to prevent duplicates
        const relay = normalizeRelayUrl(rawRelay);
        
        // Determine permission based on NIP-65 marker
        let permission: 'read' | 'write' | 'readwrite' | 'indexer' = 'readwrite';
        if (marker === 'read') {
          permission = 'read';
        } else if (marker === 'write') {
          permission = 'write';
        }
        
        relayEntries.push({
          user: event.pubkey,
          relay,
          permission,
          last_seen: event.created_at,
          source_event_id: event.id
        });
      }
    }

    console.log(`📦 Extracted ${relayEntries.length} relay entries for ${event.pubkey.slice(0, 8)}`);

    // Store each routing entry
    for (const entry of relayEntries) {
      const routingEntry: RoutingEntry = {
        id: `${entry.user}_${entry.relay}`,
        ...entry
      };

      console.log(`📦 Storing routing entry: ${entry.user.slice(0, 8)} -> ${entry.relay} (${entry.permission})`);

      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([ROUTING_TABLE_STORE], 'readwrite');
        const store = transaction.objectStore(ROUTING_TABLE_STORE);
        const request = store.put(routingEntry);
        
        request.onerror = () => {
          console.error(`📦 ❌ Failed to store routing entry:`, request.error);
          reject(request.error);
        };
        request.onsuccess = () => {
          console.log(`📦 ✅ Stored routing entry: ${entry.user.slice(0, 8)} -> ${entry.relay}`);
          resolve();
        };
      });
    }
    
    console.log(`📦 ✅ Completed storing ${relayEntries.length} routing entries for ${event.pubkey.slice(0, 8)}`);
  }

  /**
   * Get relays for a specific user from the routing table
   */
  async getUserRelays(pubkey: string): Promise<RoutingEntry[]> {
    const db = await this.db;
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([ROUTING_TABLE_STORE], 'readonly');
      const store = transaction.objectStore(ROUTING_TABLE_STORE);
      const index = store.index('user');
      const request = index.getAll(pubkey);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const entries = request.result as RoutingEntry[];
        resolve(entries.sort((a, b) => b.last_seen - a.last_seen));
      };
    });
  }

  /**
   * Get relays for multiple users
   */
  async getRelaysForUsers(pubkeys: string[]): Promise<Map<string, RoutingEntry[]>> {
    const result = new Map<string, RoutingEntry[]>();
    
    for (const pubkey of pubkeys) {
      const relays = await this.getUserRelays(pubkey);
      if (relays.length > 0) {
        result.set(pubkey, relays);
      }
    }
    
    return result;
  }

  /**
   * Get subset of contacts that have discovered relay preferences
   * Used to build progressive following feeds during discovery
   */
  async getContactsWithRelays(contactPubkeys: string[]): Promise<string[]> {
    const relayMap = await this.getRelaysForUsers(contactPubkeys);
    return contactPubkeys.filter(pubkey => {
      const relays = relayMap.get(pubkey);
      return relays && relays.length > 0;
    });
  }

  /**
   * Get all relays that a user has used (for publishing)
   */
  async getPublishRelays(pubkey: string): Promise<string[]> {
    const relays = await this.getUserRelays(pubkey);
    return relays
      .filter(entry => 
        entry.permission === 'write' || 
        entry.permission === 'readwrite'
      )
      .map(entry => entry.relay);
  }

  /**
   * Get all relays that can read for a user
   */
  async getReadRelays(pubkey: string): Promise<string[]> {
    const relays = await this.getUserRelays(pubkey);
    return relays
      .filter(entry => 
        entry.permission === 'read' || 
        entry.permission === 'readwrite' ||
        entry.permission === 'indexer'
      )
      .map(entry => entry.relay);
  }

  /**
   * Clean up old routing entries (older than 30 days)
   */
  async cleanupOldEntries(): Promise<void> {
    const db = await this.db;
    const cutoffTime = Date.now() - (30 * 24 * 60 * 60 * 1000); // 30 days ago
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([ROUTING_TABLE_STORE], 'readwrite');
      const store = transaction.objectStore(ROUTING_TABLE_STORE);
      const request = store.getAll();
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const entries = request.result as RoutingEntry[];
        const toDelete = entries.filter(entry => entry.last_seen < cutoffTime);
        
        if (toDelete.length === 0) {
          resolve();
          return;
        }
        
        let completed = 0;
        for (const entry of toDelete) {
          const deleteRequest = store.delete(entry.id);
          deleteRequest.onerror = () => reject(deleteRequest.error);
          deleteRequest.onsuccess = () => {
            completed++;
            if (completed === toDelete.length) {
              resolve();
            }
          };
        }
      };
    });
  }

  /**
   * Get the most recent stored_at timestamp from outbox events
   */
  async getLastStoredTimestamp(): Promise<number> {
    const db = await this.db;
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([OUTBOX_EVENTS_STORE], 'readonly');
      const store = transaction.objectStore(OUTBOX_EVENTS_STORE);
      const index = store.index('created_at');
      
      // Get the most recent event by created_at
      const request = index.openCursor(null, 'prev');
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const event = cursor.value as OutboxEvent;
          resolve(event.stored_at);
        } else {
          resolve(0);
        }
      };
    });
  }

  /**
   * Get statistics about the outbox storage
   */
  async getStats(): Promise<{
    totalEvents: number;
    totalRoutingEntries: number;
    uniqueUsers: number;
    uniqueRelays: number;
  }> {
    const db = await this.db;
    
    const [events, routingEntries] = await Promise.all([
      new Promise<number>((resolve, reject) => {
        const transaction = db.transaction([OUTBOX_EVENTS_STORE], 'readonly');
        const store = transaction.objectStore(OUTBOX_EVENTS_STORE);
        const request = store.count();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      }),
      new Promise<RoutingEntry[]>((resolve, reject) => {
        const transaction = db.transaction([ROUTING_TABLE_STORE], 'readonly');
        const store = transaction.objectStore(ROUTING_TABLE_STORE);
        const request = store.getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      })
    ]);

    const uniqueUsers = new Set(routingEntries.map(entry => entry.user)).size;
    const uniqueRelays = new Set(routingEntries.map(entry => entry.relay)).size;

    console.log('📦 OutboxStorage: getStats routingEntries:', routingEntries);
    console.log('📦 OutboxStorage: getStats uniqueUsers:', uniqueUsers, 'uniqueRelays:', uniqueRelays);

    return {
      totalEvents: events,
      totalRoutingEntries: routingEntries.length,
      uniqueUsers,
      uniqueRelays
    };
  }

  /**
   * Get total number of users
   */
  async getTotalUsers(): Promise<number> {
    const stats = await this.getStats();
    return stats.uniqueUsers;
  }

  /**
   * Get total number of relays
   */
  async getTotalRelays(): Promise<number> {
    const stats = await this.getStats();
    return stats.uniqueRelays;
  }

  /**
   * Get total number of events
   */
  async getTotalEvents(): Promise<number> {
    const stats = await this.getStats();
    return stats.totalEvents;
  }

  /**
   * Get all tracked users with their relay counts
   */
  async getAllUsers(): Promise<Array<{ pubkey: string; relayCount: number; lastSeen: number }>> {
    const db = await this.db;
    
    console.log('📦 OutboxStorage: getAllUsers called');
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([ROUTING_TABLE_STORE], 'readonly');
      const store = transaction.objectStore(ROUTING_TABLE_STORE);
      const request = store.getAll();
      
      request.onerror = () => {
        console.error('📦 OutboxStorage: getAllUsers error:', request.error);
        reject(request.error);
      };
      request.onsuccess = () => {
        const entries = request.result as RoutingEntry[];
        console.log('📦 OutboxStorage: getAllUsers raw entries:', entries);
        console.log('📦 OutboxStorage: getAllUsers entry count:', entries.length);
        
        if (entries.length === 0) {
          console.log('📦 OutboxStorage: No routing entries found in database');
          resolve([]);
          return;
        }
        
        const userMap = new Map<string, { relayCount: number; lastSeen: number }>();
        
        for (const entry of entries) {
          const existing = userMap.get(entry.user);
          if (existing) {
            existing.relayCount++;
            existing.lastSeen = Math.max(existing.lastSeen, entry.last_seen);
          } else {
            userMap.set(entry.user, {
              relayCount: 1,
              lastSeen: entry.last_seen
            });
          }
        }
        
        const users = Array.from(userMap.entries()).map(([pubkey, data]) => ({
          pubkey,
          relayCount: data.relayCount,
          lastSeen: data.lastSeen
        }));
        
        console.log('📦 OutboxStorage: getAllUsers processed users:', users);
        console.log('📦 OutboxStorage: getAllUsers returning', users.length, 'users');
        resolve(users.sort((a, b) => b.lastSeen - a.lastSeen));
      };
    });
  }

  /**
   * Get all discovered relays with their user counts
   */
  async getAllRelays(): Promise<Array<{ relay: string; userCount: number; permissions: string[]; lastSeen: number }>> {
    const db = await this.db;
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([ROUTING_TABLE_STORE], 'readonly');
      const store = transaction.objectStore(ROUTING_TABLE_STORE);
      const request = store.getAll();
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const entries = request.result as RoutingEntry[];
        const relayMap = new Map<string, { userCount: number; permissions: Set<string>; lastSeen: number }>();
        
        for (const entry of entries) {
          const existing = relayMap.get(entry.relay);
          if (existing) {
            existing.userCount++;
            existing.permissions.add(entry.permission);
            existing.lastSeen = Math.max(existing.lastSeen, entry.last_seen);
          } else {
            relayMap.set(entry.relay, {
              userCount: 1,
              permissions: new Set([entry.permission]),
              lastSeen: entry.last_seen
            });
          }
        }
        
        const relays = Array.from(relayMap.entries()).map(([relay, data]) => ({
          relay,
          userCount: data.userCount,
          permissions: Array.from(data.permissions),
          lastSeen: data.lastSeen
        }));
        
        resolve(relays.sort((a, b) => b.userCount - a.userCount));
      };
    });
  }

  /**
   * Get cached relay info for a user from localStorage (fast)
   */
  getCachedRelaysForUser(pubkey: string): CachedRelayInfo[] | null {
    try {
      const cacheKey = `outbox-relays-${pubkey}`;
      const cached = localStorage.getItem(cacheKey);
      if (!cached) return null;
      
      const data = JSON.parse(cached);
      const { relays, cached_at } = data;
      
      // Check if cache is still valid (2 hours)
      if (!this.isCacheValid(cached_at)) {
        localStorage.removeItem(cacheKey);
        return null;
      }
      
      return relays || null;
    } catch (error) {
      console.warn('Failed to get cached relays:', error);
      return null;
    }
  }

  /**
   * Set cached relay info for a user in localStorage
   */
  setCachedRelaysForUser(pubkey: string, relays: CachedRelayInfo[]): void {
    try {
      const cacheKey = `outbox-relays-${pubkey}`;
      const data = {
        relays,
        cached_at: Date.now()
      };
      localStorage.setItem(cacheKey, JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to cache relays:', error);
    }
  }

  /**
   * Check if cache timestamp is within 2-hour window
   */
  isCacheValid(timestamp: number): boolean {
    const twoHours = 2 * 60 * 60 * 1000; // 2 hours in milliseconds
    return Date.now() - timestamp < twoHours;
  }

  /**
   * Get cached or stored relays for a user (fast path with fallback)
   */
  async getCachedOrStoredRelays(pubkey: string): Promise<CachedRelayInfo[]> {
    // Try cache first (fastest)
    const cached = this.getCachedRelaysForUser(pubkey);
    if (cached && cached.length > 0) {
      return cached;
    }

    // Fall back to IndexedDB storage
    try {
      const stored = await this.getUserRelays(pubkey);
      const relayInfo: CachedRelayInfo[] = stored.map(entry => ({
        relay: entry.relay,
        permission: entry.permission,
        cached_at: Date.now()
      }));

      // Cache the result for future use
      if (relayInfo.length > 0) {
        this.setCachedRelaysForUser(pubkey, relayInfo);
      }

      return relayInfo;
    } catch (error) {
      console.warn('Failed to get stored relays:', error);
      return [];
    }
  }

  /**
   * Clear all outbox data (for explicit cache clearing)
   */
  async clearAllOutboxData(): Promise<void> {
    const db = await this.db;
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([OUTBOX_EVENTS_STORE, ROUTING_TABLE_STORE], 'readwrite');
      
      let completed = 0;
      const totalOperations = 2;
      
      const checkComplete = () => {
        completed++;
        if (completed === totalOperations) {
          resolve();
        }
      };
      
      // Clear outbox events
      const outboxStore = transaction.objectStore(OUTBOX_EVENTS_STORE);
      const outboxRequest = outboxStore.clear();
      outboxRequest.onerror = () => reject(outboxRequest.error);
      outboxRequest.onsuccess = () => checkComplete();
      
      // Clear routing table
      const routingStore = transaction.objectStore(ROUTING_TABLE_STORE);
      const routingRequest = routingStore.clear();
      routingRequest.onerror = () => reject(routingRequest.error);
      routingRequest.onsuccess = () => checkComplete();
    });
  }
}

// Global instance
let outboxStorage: OutboxStorage | null = null;

export const getOutboxStorage = (): OutboxStorage => {
  if (!outboxStorage) {
    outboxStorage = new OutboxStorage();
  }
  return outboxStorage;
};
