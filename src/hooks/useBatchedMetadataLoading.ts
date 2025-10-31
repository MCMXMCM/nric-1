import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getGlobalRelayPool } from '../utils/nostr/relayConnectionPool';
import type { Event, Filter } from 'nostr-tools';
import type { Metadata } from '../types/nostr/types';
import { CACHE_KEYS } from '../utils/cacheKeys';

interface BatchedMetadataConfig {
  allPubkeys: string[];
  relayUrls: string[];
  batchSize?: number;
  overscan?: number;
  visibleRange?: { start: number; end: number };
  enabled?: boolean;
}

interface BatchedMetadataResult {
  loadedMetadata: Record<string, Metadata>;
  loadedBatches: Set<number>;
  isLoadingBatch: boolean;
  loadBatch: (batchIndex: number) => void;
  isBatchLoaded: (batchIndex: number) => boolean;
}

/**
 * Hook for managing batched metadata loading with lazy loading based on scroll position
 */
export function useBatchedMetadataLoading({
  allPubkeys,
  relayUrls,
  batchSize = 20,
  overscan = 5,
  visibleRange = { start: 0, end: 0 },
  enabled = true,
}: BatchedMetadataConfig): BatchedMetadataResult {
  const queryClient = useQueryClient();
  const [loadedBatches, setLoadedBatches] = useState<Set<number>>(new Set());
  const [loadedMetadata, setLoadedMetadata] = useState<Record<string, Metadata>>({});

  // Stable relay key for query keys
  const relayKey = useMemo(() => {
    try {
      return JSON.stringify([...(relayUrls || [])].sort());
    } catch {
      return String(relayUrls.length);
    }
  }, [relayUrls]);

  // Calculate which batches should be loaded based on visible range
  const batchesToLoad = useMemo(() => {
    if (!enabled || allPubkeys.length === 0) return [];
    
    const startBatch = Math.floor(Math.max(0, visibleRange.start - overscan) / batchSize);
    const endBatch = Math.floor(Math.min(allPubkeys.length, visibleRange.end + overscan) / batchSize);
    
    const batches: number[] = [];
    for (let i = startBatch; i <= endBatch; i++) {
      if (!loadedBatches.has(i)) {
        batches.push(i);
      }
    }
    return batches;
  }, [visibleRange, overscan, batchSize, allPubkeys.length, loadedBatches, enabled]);

  // Get pubkeys for a specific batch
  const getBatchPubkeys = useCallback((batchIndex: number): string[] => {
    const start = batchIndex * batchSize;
    const end = Math.min(allPubkeys.length, start + batchSize);
    return allPubkeys.slice(start, end);
  }, [allPubkeys, batchSize]);

  // Load a specific batch
  const loadBatch = useCallback((batchIndex: number) => {
    if (loadedBatches.has(batchIndex)) return;
    
    const batchPubkeys = getBatchPubkeys(batchIndex);
    if (batchPubkeys.length === 0) return;

    console.log(`📋 Loading metadata batch ${batchIndex}:`, batchPubkeys.length, 'contacts');

    const queryKey = CACHE_KEYS.PROFILE.CONTACTS_METADATA(batchPubkeys, relayKey);
    
    // Use queryClient.fetchQuery to load the batch
    queryClient.fetchQuery({
      queryKey,
      queryFn: async () => {
        const pool = getGlobalRelayPool();
        const filter: Filter = {
          kinds: [0],
          authors: batchPubkeys,
          limit: batchPubkeys.length,
        };
        
        const events: Event[] = await pool.querySync(relayUrls, filter);
        const newMd: Record<string, Metadata> = {};
        
        events.forEach((ev: Event) => {
          try {
            const content = JSON.parse(ev.content);
            newMd[ev.pubkey] = {
              name: content.name || "",
              display_name: content.display_name || content.displayName || "",
              picture: content.picture || "",
              about: content.about || "",
              nip05: content.nip05 || "",
              website: content.website || content.lud16 || "",
            };
          } catch {}
        });
        
        return newMd;
      },
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
    }).then((metadata) => {
      // Mark batch as loaded
      setLoadedBatches(prev => new Set(prev).add(batchIndex));
      
      // Update loaded metadata
      setLoadedMetadata(prev => ({
        ...prev,
        ...metadata,
      }));
      
      console.log(`✅ Metadata batch ${batchIndex} loaded:`, Object.keys(metadata).length, 'profiles');
    }).catch((error) => {
      console.error(`❌ Failed to load metadata batch ${batchIndex}:`, error);
    });
  }, [loadedBatches, getBatchPubkeys, relayKey, relayUrls, queryClient]);

  // Load batches that should be loaded
  useEffect(() => {
    if (!enabled) return;
    
    batchesToLoad.forEach(batchIndex => {
      loadBatch(batchIndex);
    });
  }, [batchesToLoad, loadBatch, enabled]);

  // Collect all loaded metadata from query cache
  useEffect(() => {
    if (!enabled) return;

    const allMetadata: Record<string, Metadata> = {};
    
    // Get all loaded batches and collect their metadata
    loadedBatches.forEach(batchIndex => {
      const batchPubkeys = getBatchPubkeys(batchIndex);
      const queryKey = CACHE_KEYS.PROFILE.CONTACTS_METADATA(batchPubkeys, relayKey);
      const cachedData = queryClient.getQueryData<Record<string, Metadata>>(queryKey);
      
      if (cachedData) {
        Object.assign(allMetadata, cachedData);
      }
    });
    
    setLoadedMetadata(allMetadata);
  }, [loadedBatches, getBatchPubkeys, relayKey, queryClient, enabled]);

  // Check if a batch is loaded
  const isBatchLoaded = useCallback((batchIndex: number): boolean => {
    return loadedBatches.has(batchIndex);
  }, [loadedBatches]);

  // Check if any batch is currently loading
  const isLoadingBatch = useMemo(() => {
    return batchesToLoad.length > 0;
  }, [batchesToLoad.length]);

  return {
    loadedMetadata,
    loadedBatches,
    isLoadingBatch,
    loadBatch,
    isBatchLoaded,
  };
}
