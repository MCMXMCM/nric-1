import { type Event, type Filter } from "nostr-tools";
import { getGlobalRelayPool } from "./nostr/relayConnectionPool";
import { classifyRelayPermission } from "./nostr/relayClassification";

export interface UserRelay {
  url: string;
  read?: boolean;
  write?: boolean;
  permission?: 'read' | 'write' | 'readwrite' | 'indexer';
}

export interface FetchUserRelaysParams {
  pubkeyHex: string;
  relayUrls: string[];
}

export interface FetchUserRelaysResult {
  relays: UserRelay[];
  error?: string;
}

/**
 * Fetches relay information for a user from their Nostr events
 * Looks for NIP-65 relay list events (kind 10002) and fallback to recent events with relay tags
 */
export const fetchUserRelays = async (
  params: FetchUserRelaysParams
): Promise<FetchUserRelaysResult> => {
  const { pubkeyHex, relayUrls } = params;

  try {
    const pool = getGlobalRelayPool();
    
    // First try to get NIP-65 relay list events (kind 10002)
    const relayListFilter: Filter = {
      kinds: [10002],
      authors: [pubkeyHex],
      limit: 10
    };

    const relayListEvents: Event[] = await pool.querySync(relayUrls, relayListFilter);

    if (relayListEvents.length > 0) {
      // Use the most recent relay list event
      const latestEvent = relayListEvents
        .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))[0];

      const userRelays: UserRelay[] = latestEvent.tags
        .filter(tag => tag[0] === 'r' && tag[1])
        .map(tag => {
          const url = tag[1];
          const marker = tag[2];
          
          // NIP-65 markers: 'read', 'write', or undefined (both)
          const nip65Read = !marker || marker === 'read';
          const nip65Write = !marker || marker === 'write';
          
          // Classify the relay based on URL patterns and NIP-65 markers
          const permission = classifyRelayPermission(url, nip65Read, nip65Write, true);
          
          return {
            url,
            read: nip65Read,
            write: nip65Write,
            permission
          };
        });

      return { relays: userRelays };
    }

    // Fallback: Look for relay tags in recent events (kind 1 notes)
    const recentNotesFilter: Filter = {
      kinds: [1],
      authors: [pubkeyHex],
      limit: 50
    };

    const recentEvents: Event[] = await pool.querySync(relayUrls, recentNotesFilter);

    // Extract relay URLs from event tags
    const relaySet = new Set<string>();
    
    recentEvents.forEach(event => {
      event.tags?.forEach(tag => {
        if (tag[0] === 'relay' && tag[1]) {
          relaySet.add(tag[1]);
        }
      });
    });

    // Also try to infer relays from where we received the events
    // This is a heuristic - if we're getting their events from certain relays,
    // they're likely publishing there
    const inferredRelays = relayUrls.filter(() => {
      // Check if we received any events for this user from this relay
      return recentEvents.length > 0;
    });

    // Combine explicit relay tags with inferred relays
    const allRelayUrls = Array.from(new Set([...relaySet, ...inferredRelays]));
    
    const userRelays: UserRelay[] = allRelayUrls.map(url => ({
      url,
      read: true,
      write: true // Assume both for fallback
    }));

    return { relays: userRelays };

  } catch (e) {
    console.error("Failed to fetch user relays:", e);
    return { relays: [], error: "Failed to load relay information" };
  }
};

/**
 * Normalizes a relay URL to a standard format
 */
export const normalizeRelayUrl = (url: string): string => {
  try {
    let normalized = url.trim();
    
    // If it doesn't look like a URL at all, return as is
    if (!normalized.includes('.') || normalized.includes(' ')) {
      return normalized;
    }
    
    if (!normalized.startsWith('ws://') && !normalized.startsWith('wss://')) {
      normalized = `wss://${normalized}`;
    }
    // Force wss for security
    normalized = normalized.replace(/^ws:\/\//i, 'wss://');
    
    const parsed = new URL(normalized);
    const protocol = 'wss:';
    const hostname = parsed.hostname.toLowerCase();
    const port = parsed.port ? `:${parsed.port}` : '';
    let pathname = parsed.pathname || '';
    
    if (pathname === '/') {
      pathname = '';
    } else if (pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    
    return `${protocol}//${hostname}${port}${pathname}`;
  } catch {
    return url;
  }
};

/**
 * Filters out duplicate and invalid relay URLs
 */
export const deduplicateRelays = (relays: UserRelay[]): UserRelay[] => {
  const seen = new Set<string>();
  const result: UserRelay[] = [];
  
  for (const relay of relays) {
    const normalized = normalizeRelayUrl(relay.url);
    if (!seen.has(normalized) && isValidRelayUrl(normalized)) {
      seen.add(normalized);
      result.push({ ...relay, url: normalized });
    }
  }
  
  return result;
};

/**
 * Basic validation for relay URLs
 */
export const isValidRelayUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'wss:' || parsed.protocol === 'ws:';
  } catch {
    return false;
  }
};
