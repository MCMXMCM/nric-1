import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Note } from '../types/nostr/types';

interface UseMetadataPrefetchOptions {
  notes: Note[];
  relayUrls: string[];
  enabled?: boolean;
  prefetchCount?: number; // How many notes ahead to prefetch
}

/**
 * Hook that prefetches metadata for note authors in the feed
 * This replaces the old metadata store prefetching logic
 */
export function useMetadataPrefetch({
  notes,
  relayUrls,
  enabled = true,
  prefetchCount = 10
}: UseMetadataPrefetchOptions) {
  const queryClient = useQueryClient();
  const activeQueriesRef = useRef<Set<string>>(new Set());
  
  // Helper function to check if metadata is already cached
  const isMetadataCached = useCallback((pubkey: string) => {
    const queryKey = ['metadata', pubkey];
    const queryData = queryClient.getQueryData(queryKey);
    return !!queryData;
  }, [queryClient]);

  // Prefetch metadata for a batch of pubkeys
  const prefetchMetadata = useCallback(async (pubkeys: string[]) => {
    if (!enabled || relayUrls.length === 0) return;
    
    const pubkeysToFetch = pubkeys.filter(pubkey => {
      // Skip if already cached or currently being fetched
      return !isMetadataCached(pubkey) && !activeQueriesRef.current.has(pubkey);
    });

    if (pubkeysToFetch.length === 0) return;

    // Track that we're fetching these pubkeys
    pubkeysToFetch.forEach(pubkey => activeQueriesRef.current.add(pubkey));

    try {
      // Prefetch in parallel with a reasonable limit
      const batchSize = 5;
      for (let i = 0; i < pubkeysToFetch.length; i += batchSize) {
        const batch = pubkeysToFetch.slice(i, i + batchSize);
        
        await Promise.all(
          batch.map(async (pubkey) => {
            try {
              const queryKey = ['metadata', pubkey];
              
              await queryClient.prefetchQuery({
                queryKey,
                queryFn: async () => {
                  const { fetchUserMetadata } = await import('../utils/profileMetadataUtils');
                  return await fetchUserMetadata({ pubkeyHex: pubkey, relayUrls });
                },
                staleTime: 0,
                gcTime: 10 * 60 * 1000, // 10 minutes
              });
            } catch (error) {
              console.warn(`Failed to prefetch metadata for ${pubkey.slice(0, 8)}:`, error);
            } finally {
              // Remove from active queries when done
              activeQueriesRef.current.delete(pubkey);
            }
          })
        );

        // Small delay between batches to avoid overwhelming relays
        if (i + batchSize < pubkeysToFetch.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    } catch (error) {
      console.error('Error in metadata prefetch batch:', error);
      // Clean up tracking
      pubkeysToFetch.forEach(pubkey => activeQueriesRef.current.delete(pubkey));
    }
  }, [enabled, relayUrls, isMetadataCached, queryClient]);

  // Get pubkeys that need prefetching based on current notes
  const getPubkeysForPrefetch = useCallback(() => {
    if (!notes || notes.length === 0) return [];
    
    // Get unique pubkeys from notes, prioritizing earlier notes
    const seenPubkeys = new Set<string>();
    const pubkeysInOrder: string[] = [];
    
    // Take up to prefetchCount notes for prefetching
    const notesToCheck = notes.slice(0, prefetchCount);
    
    notesToCheck.forEach(note => {
      if (note.pubkey && !seenPubkeys.has(note.pubkey)) {
        seenPubkeys.add(note.pubkey);
        pubkeysInOrder.push(note.pubkey);
      }
    });
    
    return pubkeysInOrder;
  }, [notes, prefetchCount]);

  // Prefetch metadata when notes change
  useEffect(() => {
    if (!enabled) return;
    
    const pubkeysToFetch = getPubkeysForPrefetch();
    if (pubkeysToFetch.length > 0) {
      prefetchMetadata(pubkeysToFetch);
    }
  }, [enabled, getPubkeysForPrefetch, prefetchMetadata]);

  // Cleanup function
  useEffect(() => {
    return () => {
      activeQueriesRef.current.clear();
    };
  }, []);

  return {
    prefetchMetadata,
    isMetadataCached,
    activePrefetches: activeQueriesRef.current.size
  };
}
