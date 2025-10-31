import { useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';
import type { Metadata } from '../types/nostr/types';

interface NostrifyBatchedMetadataConfig {
  allPubkeys: string[];
  relayUrls: string[];
  batchSize?: number;
  overscan?: number;
  visibleRange?: { start: number; end: number };
  enabled?: boolean;
}

interface NostrifyBatchedMetadataResult {
  loadedMetadata: Record<string, Metadata>;
  loadedBatches: Set<number>;
  isLoadingBatch: boolean;
  isBatchLoaded: (batchIndex: number) => boolean;
}

/**
 * Hook for managing batched metadata loading using Nostrify
 * This replaces useBatchedMetadataLoading with the new nostrify system
 */
export function useNostrifyBatchedMetadata({
  allPubkeys,
  relayUrls,
  batchSize = 20,
  overscan = 5,
  visibleRange = { start: 0, end: 0 },
  enabled = true,
}: NostrifyBatchedMetadataConfig): NostrifyBatchedMetadataResult {
  const { nostr } = useNostr();

  // Calculate which pubkeys are currently visible (with overscan)
  const visiblePubkeys = useMemo(() => {
    if (!enabled || allPubkeys.length === 0) return [];
    
    const start = Math.max(0, visibleRange.start - overscan);
    const end = Math.min(allPubkeys.length, visibleRange.end + overscan);
    
    return allPubkeys.slice(start, end);
  }, [allPubkeys, visibleRange, overscan, enabled]);

  // Calculate batch indices for visible pubkeys
  const visibleBatchIndices = useMemo(() => {
    if (allPubkeys.length === 0) return new Set<number>();
    
    const startBatch = Math.floor(Math.max(0, visibleRange.start - overscan) / batchSize);
    const endBatch = Math.floor(Math.min(allPubkeys.length - 1, visibleRange.end + overscan) / batchSize);
    
    const batches = new Set<number>();
    for (let i = startBatch; i <= endBatch; i++) {
      batches.add(i);
    }
    return batches;
  }, [visibleRange, overscan, batchSize, allPubkeys.length]);

  // Query for visible pubkeys metadata
  const { data: metadataResult, isLoading } = useQuery({
    queryKey: ['nostrify-visible-metadata', visiblePubkeys, relayUrls],
    enabled: enabled && !!nostr && visiblePubkeys.length > 0,
    queryFn: async () => {
      if (!nostr) throw new Error('Nostrify not available');
      
      console.log(`📋 Loading metadata for ${visiblePubkeys.length} visible contacts`);
      
      const events = await nostr.query([{
        kinds: [0],
        authors: visiblePubkeys,
        limit: visiblePubkeys.length
      }]);
      
      const metadata: Record<string, Metadata> = {};
      
      // Group events by author and get the latest for each
      events.forEach((event: NostrEvent) => {
        try {
          const parsed = JSON.parse(event.content);
          if (typeof parsed === 'object' && parsed !== null) {
            const meta: Metadata = {
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
            
            metadata[event.pubkey] = meta;
          }
        } catch (error) {
          console.warn('Failed to parse metadata for', event.pubkey, error);
        }
      });
      
      console.log(`✅ Metadata loaded for ${Object.keys(metadata).length} profiles`);
      
      return metadata;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    refetchOnWindowFocus: false,
    // Keep previous data while loading new data to prevent flickering
    placeholderData: (previousData) => previousData,
  });

  const loadedMetadata = metadataResult || {};

  // Check if a batch is loaded
  const isBatchLoaded = useCallback((batchIndex: number): boolean => {
    return visibleBatchIndices.has(batchIndex);
  }, [visibleBatchIndices]);

  return {
    loadedMetadata,
    loadedBatches: visibleBatchIndices,
    isLoadingBatch: isLoading,
    isBatchLoaded,
  };
}
