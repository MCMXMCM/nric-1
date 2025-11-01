import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { useCallback } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';
import type { Metadata } from '../types/nostr/types';
import { acquireQuerySlot, releaseQuerySlot } from '../utils/nostr/queryThrottle';

interface UseNostrifyProfileMetadataConfig {
  pubkeyHex: string;
  relayUrls: string[];
  enabled?: boolean;
  realtimeEnabled?: boolean;
}

interface UseNostrifyProfileMetadataResult {
  metadata: Metadata | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  lastUpdated?: number;
}

/**
 * Hook for fetching profile metadata using Nostrify
 */
export function useNostrifyProfileMetadata(config: UseNostrifyProfileMetadataConfig): UseNostrifyProfileMetadataResult {
  const { nostr } = useNostr();
  const {
    pubkeyHex,
    relayUrls,
    enabled = true
  } = config;

  // Parse metadata from event
  const parseMetadataFromEvent = useCallback((event: NostrEvent): Metadata | null => {
    try {
      if (!event.content) return null;
      
      const parsed = JSON.parse(event.content);
      
      // Validate required fields
      if (typeof parsed !== 'object' || parsed === null) return null;
      
        return {
          name: parsed.name || '',
          about: parsed.about || '',
          picture: parsed.picture || '',
          banner: parsed.banner || '',
          nip05: parsed.nip05 || '',
          lud06: parsed.lud06 || '',
          lud16: parsed.lud16 || '',
          website: parsed.website || '',
          display_name: parsed.display_name || parsed.name || ''
        };
    } catch (error) {
      console.warn('Failed to parse metadata:', error);
      return null;
    }
  }, []);

  const query = useQuery({
    queryKey: ['nostrify-profile-metadata', pubkeyHex, relayUrls],
    enabled: enabled && !!pubkeyHex && relayUrls.length > 0,
    queryFn: async () => {
      // If Nostrify is not ready/available, use phased fallback directly
      if (!nostr) {
        try {
          const { getCachedOutboxRelaysForProfile } = await import('../utils/outboxIntegration');
          const outboxRelays = await getCachedOutboxRelaysForProfile(pubkeyHex);
          const blendedRelays = outboxRelays.length > 0 
            ? [...outboxRelays.slice(0, 5), ...relayUrls.slice(0, 2)]
            : relayUrls;
          const { fetchUserMetadata } = await import('../utils/profileMetadataUtils');
          const result = await fetchUserMetadata({ pubkeyHex, relayUrls: blendedRelays, useOutboxRelays: true });
          return result.metadata || null;
        } catch (fallbackErr) {
          console.warn('⚠️ Metadata fallback (no Nostrify) failed:', fallbackErr);
          return null;
        }
      }

      try {
        // Get cached outbox relays for this user (fast)
        const { getCachedOutboxRelaysForProfile } = await import('../utils/outboxIntegration');
        const outboxRelays = await getCachedOutboxRelaysForProfile(pubkeyHex);
        
        // Blend outbox relays with configured relays for better coverage
        const blendedRelays = outboxRelays.length > 0 
          ? [...outboxRelays.slice(0, 5), ...relayUrls.slice(0, 2)] // Prioritize outbox, add fallbacks
          : relayUrls;
        
        if (import.meta.env.DEV) {
          console.log(`🔍 Metadata query for ${pubkeyHex.slice(0, 8)}:`, {
            outboxRelays: outboxRelays.length,
            configuredRelays: relayUrls.length,
            blendedRelays: blendedRelays.length,
            usingOutbox: outboxRelays.length > 0
          });
        }

        // Use shorter timeout if there have been recent connection failures
        const recentFailures = (globalThis as any).__nostrifyRecentFailures || 0;
        const timeoutMs = recentFailures > 2 ? 5000 : 12000; // Prevent indefinite hangs on slow/unresponsive relays

        let queryPromise: Promise<NostrEvent[]>;
        try {
          queryPromise = nostr.query([{
            kinds: [0],
            authors: [pubkeyHex],
            limit: 1
          }]);
        } catch (e: any) {
          // Handle synchronous throw (e.g., pool not ready)
          console.warn('⚠️ Nostrify query threw before awaiting, falling back:', e);
          queryPromise = Promise.resolve([] as NostrEvent[]);
        }
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Metadata query timeout')), timeoutMs)
        );
        let events = await Promise.race([queryPromise, timeoutPromise]).catch((err) => {
          console.warn('⏰ Metadata query timed out or failed, attempting fallback:', err);
          return [] as NostrEvent[];
        });
        
        // If timed out or no events, try phased fallback fetch via profileMetadataUtils
        if (!events || events.length === 0) {
          try {
            const { fetchUserMetadata } = await import('../utils/profileMetadataUtils');
            const result = await fetchUserMetadata({ 
              pubkeyHex, 
              relayUrls: blendedRelays,
              useOutboxRelays: true 
            });
            if (result?.metadata) {
              // Synthesize a minimal event-like object for parsing path consistency
              const synthetic: NostrEvent = {
                id: 'synthetic',
                pubkey: pubkeyHex,
                created_at: Math.floor(Date.now() / 1000),
                kind: 0,
                tags: [],
                sig: '',
                content: JSON.stringify(result.metadata)
              } as unknown as NostrEvent;
              events = [synthetic];
            }
          } catch (fallbackErr) {
            console.warn('⚠️ Metadata fallback fetch failed:', fallbackErr);
          }
        }
        
        if (events.length === 0) {
          console.log('ℹ️ No metadata found for', pubkeyHex.slice(0, 8));
          return null;
        }
        
        // Get the most recent metadata event
        const latestEvent = events.sort((a, b) => b.created_at - a.created_at)[0];
        const metadata = parseMetadataFromEvent(latestEvent);
        
        if (import.meta.env.DEV) {
          console.log('✅ Metadata loaded for', pubkeyHex.slice(0, 8), metadata);
        }
        
        return metadata;
      } catch (error) {
        console.error('❌ Failed to query metadata:', error);
        // Fail softly to avoid UI hanging in loading state
        return null;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    refetchOnWindowFocus: false,
    retry: 3, // Retry up to 3 times
    retryDelay: attemptIndex => Math.min(1000 * Math.pow(2, attemptIndex), 5000), // Exponential backoff
  });

  // Set up real-time updates if enabled
  // TODO: Implement real-time metadata updates with Nostrify

  return {
    metadata: query.data || null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    lastUpdated: query.dataUpdatedAt
  };
}

/**
 * Hook for fetching multiple profile metadata entries
 */
export function useNostrifyMultipleProfileMetadata(config: {
  pubkeys: string[];
  relayUrls: string[];
  enabled?: boolean;
}) {
  const { nostr } = useNostr();
  const { pubkeys, relayUrls, enabled = true } = config;

  const query = useQuery({
    queryKey: ['nostrify-multiple-profile-metadata', pubkeys, relayUrls],
    enabled: enabled && pubkeys.length > 0,
    queryFn: async () => {
      // Acquire throttle slot for metadata queries
      const slotId = await acquireQuerySlot('metadata');
      
      try {
        let events: NostrEvent[] = [];
        if (nostr) {
          // Add timeout protection (8 seconds for batch metadata)
          const timeoutMs = 8000;
          let queryPromise: Promise<NostrEvent[]>;
          try {
            queryPromise = nostr.query([{
              kinds: [0],
              authors: pubkeys,
              limit: pubkeys.length
            }]);
          } catch {
            queryPromise = Promise.resolve([] as NostrEvent[]);
          }
          const timeoutPromise = new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Metadata query timeout')), timeoutMs)
          );
          // Phase 1: Try with Nostrify pool
          events = await Promise.race([queryPromise, timeoutPromise]).catch(() => []);
        }
        
        // Phase 2: If no events, use phased fallback from profileMetadataUtils
        if (events.length === 0) {
          console.log('📝 Metadata query returned no events, trying phased fallback...');
          try {
            const { fetchUserMetadata } = await import('../utils/profileMetadataUtils');
            
            // Batch fetch using fetchUserMetadata for each pubkey (with throttling)
            // Limit to 20 at once to prevent overwhelming relays
            const pubkeysToFetch = pubkeys.slice(0, 20);
            const metadataResults = await Promise.all(
              pubkeysToFetch.map(pk => 
                fetchUserMetadata({ pubkeyHex: pk, relayUrls })
              )
            );
            
            // Convert results to events array for consistent processing
            events = metadataResults
              .filter(result => result.metadata)
              .map(result => ({
                id: `fallback-${result.metadata?.name || 'unknown'}`,
                pubkey: pubkeysToFetch[metadataResults.indexOf(result)],
                created_at: Math.floor(Date.now() / 1000),
                kind: 0,
                tags: [],
                sig: '',
                content: JSON.stringify(result.metadata)
              })) as NostrEvent[];
            
            console.log(`✅ Fallback metadata fetch: ${events.length} results`);
          } catch (fallbackError) {
            console.warn('⚠️ Fallback metadata fetch failed:', fallbackError);
          }
        }
        
        // Group events by author and get the latest for each
        const metadataMap = new Map<string, Metadata>();
        
        events.forEach(event => {
          try {
            const parsed = JSON.parse(event.content);
            if (typeof parsed === 'object' && parsed !== null) {
              const metadata: Metadata = {
                name: parsed.name || '',
                about: parsed.about || '',
                picture: parsed.picture || '',
                banner: parsed.banner || '',
                nip05: parsed.nip05 || '',
                lud06: parsed.lud06 || '',
                lud16: parsed.lud16 || '',
                website: parsed.website || '',
                display_name: parsed.display_name || parsed.name || ''
              };
              
              // Only update if this is newer than what we have
              const existing = metadataMap.get(event.pubkey);
              if (!existing) {
                metadataMap.set(event.pubkey, metadata);
              }
            }
          } catch (error) {
            console.warn('Failed to parse metadata for', event.pubkey, error);
          }
        });
        
        return metadataMap;
      } finally {
        // Always release the throttle slot
        releaseQuerySlot(slotId);
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => {
      // Don't retry timeouts - use fallback instead
      if (error.message.includes('timeout')) return false;
      return failureCount < 2;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * Math.pow(2, attemptIndex), 3000),
  });

  return {
    metadataMap: query.data || new Map(),
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch
  };
}

/**
 * Hook for fetching profile contacts using Nostrify
 */
export function useNostrifyProfileContacts(config: {
  pubkeyHex: string;
  relayUrls: string[];
  mode: 'following' | 'followers';
  enabled?: boolean;
  realtimeEnabled?: boolean;
}) {
  const { nostr } = useNostr();
  const {
    pubkeyHex,
    relayUrls,
    mode,
    enabled = true
  } = config;

  const query = useQuery({
    queryKey: ['nostrify-profile-contacts', pubkeyHex, mode, relayUrls],
    enabled: enabled && !!pubkeyHex,
    queryFn: async () => {
      let filter: any;
      
      if (mode === 'following') {
        filter = {
          kinds: [3],
          authors: [pubkeyHex],
          limit: 1
        };
      } else {
        filter = {
          kinds: [3],
          '#p': [pubkeyHex],
          limit: 5000
        };
      }

      // Try Nostrify first when available, else legacy pool fallback
      let events: any[] = [];
      if (nostr) {
        try {
          events = await nostr.query([filter]);
        } catch (e) {
          events = [];
        }
      }

      if (!events || events.length === 0) {
        try {
          const { getGlobalRelayPool } = await import('../utils/nostr/relayConnectionPool');
          const pool = getGlobalRelayPool();
          const relaysToUse = relayUrls && relayUrls.length > 0 ? relayUrls : [];
          if (relaysToUse.length > 0) {
            events = await pool.querySync(relaysToUse, filter);
          }
        } catch (fallbackErr) {
          console.warn('⚠️ Contacts fallback failed:', fallbackErr);
        }
      }
      
      if (mode === 'following') {
        const latest = events.sort((a, b) => b.created_at - a.created_at)[0];
        const pTags = (latest?.tags || []).filter((t: string[]) => t[0] === 'p' && t[1]);
        return pTags.map((t: string[]) => t[1]);
      } else {
        return Array.from(new Set(events.map((ev) => ev.pubkey)));
      }
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
  });

  // Set up real-time updates if enabled
  // TODO: Implement real-time contact updates with Nostrify

  return {
    contacts: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch
  };
}
