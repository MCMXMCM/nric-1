import type { NostrEvent, NostrFilter } from "@nostrify/nostrify";
import { type Filter, type Event } from "nostr-tools";
import type { Metadata, Note } from "../types/nostr/types";
import { extractImageUrls, extractVideoUrls } from "./nostr/utils";
import { CACHE_KEYS } from "./cacheKeys";
import { recordRelaySuccess, recordRelayFailure, getHealthyFallbackRelays } from "./relayHealthMonitor";
// Note: Removed dbSaveNote import - TanStack Query handles note caching

export interface FetchMetadataParams {
  pubkeyHex: string;
  relayUrls: string[];
  extraRelays?: string[];
}

export interface FetchMetadataResult {
  metadata: Metadata | null;
  error?: string;
}

/**
 * Fallback relays for metadata fetching when user's read relays don't have the data
 * These are reliable public read relays that often have metadata for random pubkeys
 * Organized by reliability and performance characteristics
 */
const METADATA_FALLBACK_RELAYS = [
  // Primary fallback relays - most reliable for metadata
  'wss://purplepag.es',          // Purple Pages relay
  'wss://relay.nostr.band',      // Excellent metadata coverage
  'wss://search.nos.today',      // Good search and metadata support
  'wss://relay.damus.io',        // Damus relay, good metadata coverage
  
  // Secondary fallback relays - additional coverage
  'wss://nos.lol',               // Nostr relay with good metadata
  'wss://relay.snort.social',    // Snort social relay
  'wss://relay.nostr.bg',        // Nostr Bulgaria relay
  'wss://relay.bitcoinmaximalist.org', // Bitcoin maximalist relay
  
  // Tertiary fallback relays - broader coverage
  'wss://relay.mostr.pub',       // Mostr relay
  'wss://relay.nostr.wine',      // Nostr wine relay
  'wss://relay.plebeian.market', // Plebeian market relay
  'wss://relay.bitcoinmaximalist.com', // Bitcoin maximalist relay
];

/**
 * Relay health check timeout for fallback relays
 */
const RELAY_TIMEOUT = 8000; // 8 seconds timeout for fallback relays

/**
 * Fetches user metadata (kind 0 event) using a phased relay strategy for reliability
 * Phase 1: Try user's read relays (prioritized subset)
 * Phase 2: If no result, try fallback public relays with health checking
 * Phase 3: If extraRelays provided, try those as well
 */
export const fetchUserMetadata = async (
  params: FetchMetadataParams & { useOutboxRelays?: boolean }
): Promise<FetchMetadataResult> => {
  const { pubkeyHex, relayUrls, extraRelays = [], useOutboxRelays = true } = params;

  if (!pubkeyHex) {
    return { metadata: null, error: "Invalid parameters" };
  }

  // Prefer Nostrify pool when available; fallback to legacy pool only if needed
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nostrifyPool: any = (globalThis as any).__nostrifyPool;
  const filter: NostrFilter | Filter = { kinds: [0], authors: [pubkeyHex], limit: 10 } as any;
  let allEvents: Array<NostrEvent | Event> = [];

  // Inflight dedupe per pubkey to prevent duplicate concurrent metadata fetches
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g: any = globalThis as any;
  if (!g.__metadataInflight) g.__metadataInflight = new Map<string, Promise<FetchMetadataResult>>();
  if (g.__metadataInflight.has(pubkeyHex)) {
    return g.__metadataInflight.get(pubkeyHex)!;
  }

  // Reduced throttling for better performance
  // Allow 4 concurrent metadata queries (increased from 2)
  // Remove delays for faster loading
  if (!g.__metadataThrottle) {
    g.__metadataThrottle = { active: 0, queue: [] };
  }
  
  const throttle = g.__metadataThrottle;
  if (throttle.active >= 4) {
    // Wait for a slot to become available
    await new Promise(resolve => {
      throttle.queue.push(resolve);
    });
  }
  
  // No delay for faster metadata loading
  throttle.active++;

  const exec = (async (): Promise<FetchMetadataResult> => {

  try {
    // Get outbox relays if enabled and available
    let outboxRelays: string[] = [];
    if (useOutboxRelays) {
      try {
        const { getCachedOutboxRelaysForProfile } = await import('./outboxIntegration');
        outboxRelays = await getCachedOutboxRelaysForProfile(pubkeyHex);
      } catch (error) {
        console.warn('Failed to get outbox relays:', error);
      }
    }

    // Phase 1: Try outbox relays first (most likely to have user's metadata)
    if (outboxRelays.length > 0) {
      console.log(`🔄 Metadata Phase 1: Trying ${outboxRelays.length} outbox relays for ${pubkeyHex.slice(0, 8)}...`);
      
      try {
        if (nostrifyPool) {
          // Add timeout to prevent hanging on failed connections
          const queryPromise = nostrifyPool.query([filter as NostrFilter]);
          const timeoutPromise = new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Outbox relay timeout')), RELAY_TIMEOUT)
          );
          const outboxEvents = await Promise.race([queryPromise, timeoutPromise]);
          allEvents.push(...outboxEvents);
          console.log(`✅ Phase 1: Found ${outboxEvents.length} events from outbox relays`);
        } else {
          const { getGlobalRelayPool } = await import('./nostr/relayConnectionPool');
          const pool = getGlobalRelayPool();
          const outboxEvents = await pool.querySync(outboxRelays, filter as Filter);
          allEvents.push(...outboxEvents);
          console.log(`✅ Phase 1: Found ${outboxEvents.length} events from outbox relays`);
        }
      } catch (error) {
        console.warn('Phase 1 (outbox) failed:', error);
      }
    }

    // Phase 1b: Try configured relays if outbox didn't work or wasn't available
    if (allEvents.length === 0 && relayUrls && relayUrls.length > 0) {
      const primaryRelays = relayUrls.slice(0, 3);
      console.log(`🔄 Metadata Phase 1b: Trying ${primaryRelays.length} configured relays for ${pubkeyHex.slice(0, 8)}...`);
      
      try {
        if (nostrifyPool) {
          // Add timeout to prevent hanging on failed connections
          const queryPromise = nostrifyPool.query([filter as NostrFilter]);
          const timeoutPromise = new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Primary relay timeout')), RELAY_TIMEOUT)
          );
          const primaryEvents = await Promise.race([queryPromise, timeoutPromise]);
          allEvents.push(...primaryEvents);
          console.log(`✅ Phase 1b: Found ${primaryEvents.length} events from configured relays`);
        } else {
          const { getGlobalRelayPool } = await import('./nostr/relayConnectionPool');
          const pool = getGlobalRelayPool();
          const primaryEvents = await pool.querySync(primaryRelays, filter as Filter);
          allEvents.push(...primaryEvents);
          console.log(`✅ Phase 1b: Found ${primaryEvents.length} events from configured relays`);
        }
      } catch (error) {
        console.warn('Phase 1b failed:', error);
        // Record metadata failures separately from feed failures
        if (typeof window !== 'undefined' && (window as any).__relayHealthMonitor) {
          primaryRelays.forEach(relay => {
            (window as any).__relayHealthMonitor.recordFailure(relay, 'metadata');
          });
        }
      }
    }

    // Phase 2: If no results, try fallback relays with health monitoring
    if (allEvents.length === 0) {
      // Get healthy fallback relays based on performance history
      const healthyFallbackRelays = getHealthyFallbackRelays(METADATA_FALLBACK_RELAYS, 8);
      console.log(`🔄 Metadata Phase 2: Trying ${healthyFallbackRelays.length} healthy fallback relays for ${pubkeyHex.slice(0, 8)}...`);
      
      try {
        const startTime = Date.now();
        if (nostrifyPool) {
          // Add timeout to prevent hanging on failed connections
          const queryPromise = nostrifyPool.query([filter as NostrFilter]);
          const timeoutPromise = new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Fallback relay timeout')), RELAY_TIMEOUT)
          );
          const fallbackEvents = await Promise.race([queryPromise, timeoutPromise]);
          const responseTime = Date.now() - startTime;
          allEvents.push(...fallbackEvents);
          console.log(`✅ Phase 2: Found ${fallbackEvents.length} events from fallback relays (${responseTime}ms)`);
          healthyFallbackRelays.forEach((relay) => recordRelaySuccess(relay, responseTime));
        } else {
          // Legacy fallback
          const { getGlobalRelayPool } = await import('./nostr/relayConnectionPool');
          const pool = getGlobalRelayPool();
          // Try fallback relays with timeout
          const fallbackPromise = pool.querySync(healthyFallbackRelays, filter as Filter);
          const timeoutPromise = new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Fallback relay timeout')), RELAY_TIMEOUT)
          );
          const fallbackEvents = await Promise.race([fallbackPromise, timeoutPromise]);
          const responseTime = Date.now() - startTime;
          allEvents.push(...fallbackEvents);
          console.log(`✅ Phase 2: Found ${fallbackEvents.length} events from fallback relays (${responseTime}ms)`);
          healthyFallbackRelays.forEach((relay) => recordRelaySuccess(relay, responseTime));
        }
      } catch (error) {
        console.warn('Phase 2 failed:', error);
        
        // Record failure for all healthy relays that were tried
        healthyFallbackRelays.forEach(relay => recordRelayFailure(relay, 'metadata'));
        
        // If all fallback relays fail, try a smaller subset of most reliable ones
        console.log(`🔄 Metadata Phase 2b: Trying most reliable fallback relays for ${pubkeyHex.slice(0, 8)}...`);
        try {
          const reliableRelays = getHealthyFallbackRelays(METADATA_FALLBACK_RELAYS.slice(0, 4), 4);
          const startTime = Date.now();
          if (nostrifyPool) {
            // Add timeout to prevent hanging on failed connections
            const queryPromise = nostrifyPool.query([filter as NostrFilter]);
            const timeoutPromise = new Promise<never>((_, reject) => 
              setTimeout(() => reject(new Error('Reliable relay timeout')), RELAY_TIMEOUT / 2)
            );
            const reliableEvents = await Promise.race([queryPromise, timeoutPromise]);
            const responseTime = Date.now() - startTime;
            allEvents.push(...reliableEvents);
            console.log(`✅ Phase 2b: Found ${reliableEvents.length} events from reliable relays (${responseTime}ms)`);
            reliableRelays.forEach((relay) => recordRelaySuccess(relay, responseTime));
          } else {
            const { getGlobalRelayPool } = await import('./nostr/relayConnectionPool');
            const pool = getGlobalRelayPool();
            const reliableEvents = await Promise.race([
              pool.querySync(reliableRelays, filter as Filter),
              new Promise<never>((_, reject) => 
                setTimeout(() => reject(new Error('Reliable relay timeout')), RELAY_TIMEOUT / 2)
              )
            ]);
            const responseTime = Date.now() - startTime;
            allEvents.push(...reliableEvents);
            console.log(`✅ Phase 2b: Found ${reliableEvents.length} events from reliable relays (${responseTime}ms)`);
            reliableRelays.forEach((relay) => recordRelaySuccess(relay, responseTime));
          }
        } catch (reliableError) {
          console.warn('Phase 2b failed:', reliableError);
          // Record failure for reliable relays
          const reliableRelays = getHealthyFallbackRelays(METADATA_FALLBACK_RELAYS.slice(0, 4), 4);
          reliableRelays.forEach(relay => recordRelayFailure(relay, 'metadata'));
        }
      }
    }

    // Phase 3: Try extra relays if provided and still no results
    if (allEvents.length === 0 && extraRelays.length > 0) {
      console.log(`🔄 Metadata Phase 3: Trying ${extraRelays.length} extra relays for ${pubkeyHex.slice(0, 8)}...`);
      
      try {
        let phase3Events: Array<NostrEvent | Event> = [];
        if (nostrifyPool) {
          // Add timeout to prevent hanging on failed connections
          const queryPromise = nostrifyPool.query([filter as NostrFilter]);
          const timeoutPromise = new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Extra relay timeout')), RELAY_TIMEOUT)
          );
          phase3Events = await Promise.race([queryPromise, timeoutPromise]);
        } else {
          const { getGlobalRelayPool } = await import('./nostr/relayConnectionPool');
          const pool = getGlobalRelayPool();
          phase3Events = await pool.querySync(extraRelays, filter as Filter);
        }
        allEvents.push(...phase3Events);
        console.log(`✅ Phase 3: Found ${phase3Events.length} events from extra relays`);
      } catch (error) {
        console.warn('Phase 3 failed:', error);
      }
    }

    if (allEvents.length === 0) {
      console.log(`❌ No metadata found for ${pubkeyHex.slice(0, 8)} after trying all phases`);
      return { metadata: null };
    }

    // Select the newest event by created_at (per Nostr best practices)
    const newest = allEvents
      .filter(event => event && event.created_at) // Filter out invalid events
      .slice()
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))[0];

    if (!newest) {
      return { metadata: null };
    }

    try {
      const content = JSON.parse(newest.content || '{}');
      
      const metadata: Metadata = {
        name: content.name || "",
        display_name: content.display_name || content.displayName || "",
        picture: content.picture || "",
        about: content.about || "",
        nip05: content.nip05 || "",
        website: content.website || "",
        banner: content.banner || "",
        lud16: content.lud16 || "",
        lud06: content.lud06 || "",
      };
      
      console.log(`✅ Metadata loaded for ${pubkeyHex.slice(0, 8)}: ${metadata.display_name || metadata.name || 'no name'}`);
      return { metadata };
    } catch (parseError) {
      console.error('Failed to parse metadata content:', parseError);
      return { metadata: null };
    }
  } catch (e) {
    console.error("Failed to fetch metadata:", e);
    return { metadata: null, error: "Failed to load profile" };
  }
  })();

  g.__metadataInflight.set(pubkeyHex, exec);
  const result = await exec;
  // Clear inflight entry after resolution
  g.__metadataInflight.delete(pubkeyHex);
  
  // Release throttle slot
  throttle.active--;
  if (throttle.queue.length > 0) {
    const next = throttle.queue.shift();
    if (next) next();
  }
  
  return result;
};

export interface LoadNotesParams {
  pubkeyHex: string;
  relayUrls: string[];
  until?: number;
  pageSize?: number;
}

export interface LoadNotesResult {
  notes: Note[];
  loaded: number;
  error?: string;
}

/**
 * Loads user notes with pagination
 * Uses Nostrify pool with outbox routing when available
 */
export const loadUserNotes = async (
  params: LoadNotesParams,
  queryClient?: any
): Promise<LoadNotesResult> => {
  const { pubkeyHex, relayUrls, until, pageSize = 10 } = params;

  try {
    const filter: Filter = {
      kinds: [1],
      authors: [pubkeyHex],
      limit: pageSize,
      ...(until ? { until } : {}),
    };
    
    // Prefer Nostrify pool with outbox routing when available
    // This ensures we query the user's actual write relays from their NIP-65 relay list
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nostrifyPool: any = (globalThis as any).__nostrifyPool;
    let events: Event[] = [];
    
    if (nostrifyPool && nostrifyPool.isReady && nostrifyPool.isReady()) {
      // Nostrify pool will use outbox routing to find user's write relays
      console.log(`📦 Loading profile notes via outbox model for ${pubkeyHex.slice(0, 8)}`);
      try {
        events = await nostrifyPool.query([filter]);
      } catch (error) {
        console.warn(`⚠️ Nostrify pool query failed for ${pubkeyHex.slice(0, 8)}, falling back to legacy pool:`, error);
        const { getGlobalRelayPool } = await import('./nostr/relayConnectionPool');
        const pool = getGlobalRelayPool();
        events = await pool.querySync(relayUrls, filter);
      }
    } else {
      // Fallback to legacy pool (shouldn't happen in normal usage)
      console.log(`⚠️ Nostrify pool not available or not ready, using legacy pool for ${pubkeyHex.slice(0, 8)}`);
      const { getGlobalRelayPool } = await import('./nostr/relayConnectionPool');
      const pool = getGlobalRelayPool();
      events = await pool.querySync(relayUrls, filter);
    }
    
    const notes: Note[] = events
      .map((ev) => {
        const imageUrls = extractImageUrls(ev.content);
        const videoUrls = extractVideoUrls(ev.content);
        
        const note: Note = {
          id: ev.id,
          content: ev.content || "",
          pubkey: ev.pubkey,
          created_at: ev.created_at,
          kind: (ev as any).kind,
          tags: ev.tags || [],
          imageUrls,
          videoUrls,
          receivedAt: Date.now(),
        };

        // Cache the note individually for reuse across contexts (same as feed query)
        if (queryClient) {
          queryClient.setQueryData(CACHE_KEYS.NOTE(note.id), note);
        }
        
        return note;
      })
      .sort((a, b) => b.created_at - a.created_at);

    return { notes, loaded: events.length };
  } catch (e) {
    console.error("Failed to fetch notes:", e);
    return { notes: [], loaded: 0, error: "Failed to load notes" };
  }
};
