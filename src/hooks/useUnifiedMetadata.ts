import { useQuery } from '@tanstack/react-query';
import { useMemo, useEffect, useRef } from 'react';
import { CACHE_KEYS } from '../utils/cacheKeys';
import { fetchUserMetadata } from '../utils/profileMetadataUtils';
import { useDisplayNames } from './useDisplayNames';
import { useNostrFeedState } from './useNostrFeedState';
import type { Metadata } from '../types/nostr/types';

// Check if we're in scroll restoration mode (global flag for iOS Safari)
const isScrollRestorationActive = (): boolean => {
  try {
    return sessionStorage.getItem('virtualScrollRestorationLock') === 'true' ||
           sessionStorage.getItem('bufferRestorationActive') === 'true';
  } catch {
    return false;
  }
};

interface UseUnifiedMetadataOptions {
  pubkeyHex: string | null;
  relayUrls: string[];
  enabled?: boolean;
  /**
   * Whether to update display names cache when metadata is loaded
   * @default true
   */
  updateDisplayNames?: boolean;
  /**
   * Whether to update global metadata state when metadata is loaded
   * @default true
   */
  updateGlobalState?: boolean;
  /**
   * Extra relays to try if primary relays don't have metadata
   * @default []
   */
  extraRelays?: string[];
}

interface UseUnifiedMetadataResult {
  metadata: Metadata | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  displayName: string;
  npub: string | null;
}

/**
 * Unified metadata hook that consolidates all metadata loading patterns
 * This replaces useMetadataQuery, useProfileMetadata, and other fragmented approaches
 * 
 * Features:
 * - Single source of truth for metadata caching
 * - Automatic display name synchronization
 * - Global state updates for cross-component consistency
 * - Consistent error handling and loading states
 * - Optimized for performance with proper stale/gc times
 */
export function useUnifiedMetadata({
  pubkeyHex,
  relayUrls,
  enabled = true,
  updateDisplayNames = true,
  updateGlobalState = true,
  extraRelays = [],
}: UseUnifiedMetadataOptions): UseUnifiedMetadataResult {
  const { displayNames, getDisplayNameForPubkey, addDisplayNamesFromMetadata } = useDisplayNames(relayUrls);
  const { metadata: globalMetadata, setMetadata: setGlobalMetadata } = useNostrFeedState();

  // Generate npub for fallback display
  const npub = useMemo(() => {
    if (!pubkeyHex) return null;
    try {
      // Import nip19 from nostr-tools
      const { nip19 } = eval('require("nostr-tools")');
      return nip19.npubEncode(pubkeyHex);
    } catch {
      // Fallback to simple truncation if nip19 fails
      return pubkeyHex.slice(0, 16) + '...';
    }
  }, [pubkeyHex]);

  // Unified cache key - consistent across all metadata operations
  const queryKey = pubkeyHex ? CACHE_KEYS.METADATA(pubkeyHex) : ['metadata', null];
  
  // Debug query key changes (reduced frequency to avoid spam)
  useEffect(() => {
    // Only log when pubkey actually changes, not on every render
    if (pubkeyHex) {
      console.log('🔍 useUnifiedMetadata query key changed:', {
        pubkeyHex: pubkeyHex?.slice(0, 8),
        queryKey,
        enabled: Boolean(pubkeyHex && relayUrls.length > 0 && enabled)
      });
    }
  }, [pubkeyHex]); // Only depend on pubkeyHex to reduce logging frequency

  // Check if we have global metadata as initial data - memoize to prevent unnecessary changes
  const initialData = useMemo(() => {
    if (!pubkeyHex || !globalMetadata?.[pubkeyHex]) return undefined;
    return { metadata: globalMetadata[pubkeyHex], error: undefined };
  }, [pubkeyHex, pubkeyHex && globalMetadata?.[pubkeyHex]]); // Only depend on specific metadata entry

  // Main metadata query
  const {
    data: queryResult,
    isLoading,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey,
    enabled: Boolean(pubkeyHex && relayUrls.length > 0 && enabled),
    queryFn: async () => {
      console.log(`🔄 Fetching metadata for ${pubkeyHex?.slice(0, 8)}...`);
      const result = await fetchUserMetadata({
        pubkeyHex: pubkeyHex as string,
        relayUrls,
        extraRelays
      });
      console.log(`✅ Metadata loaded for ${pubkeyHex?.slice(0, 8)}:`, result.metadata?.display_name || result.metadata?.name || 'no name');
      return result;
    },
    // Optimized caching strategy
    staleTime: 3 * 60 * 1000, // 3 minutes - metadata doesn't change frequently
    gcTime: 15 * 60 * 1000, // 15 minutes - keep in memory longer
    refetchOnMount: false, // Avoid unnecessary refetches
    refetchOnWindowFocus: false,
    // Use global metadata as initial data if available
    initialData,
    initialDataUpdatedAt: initialData ? Date.now() - (2 * 60 * 1000) : undefined, // Mark as 2 minutes old
  });

  // Extract metadata and error from query result
  const metadata = queryResult?.metadata || null;
  const error = queryError 
    ? (queryError as any)?.message || 'Failed to load metadata'
    : queryResult?.error || null;

  // Get display name (reactive to display name cache updates)
  const displayName = useMemo(() => {
    if (!pubkeyHex) return '';
    const cachedDisplayName = getDisplayNameForPubkey(pubkeyHex);
    
    // If we have a cached display name that's not just the npub, use it
    if (cachedDisplayName && cachedDisplayName !== npub) {
      return cachedDisplayName;
    }
    
    // Otherwise try to get from current metadata
    if (metadata?.display_name) return metadata.display_name;
    if (metadata?.name) return metadata.name;
    
    // Fallback to npub or pubkey
    return cachedDisplayName || npub || pubkeyHex?.slice(0, 16) + '...' || '';
  }, [pubkeyHex, metadata, getDisplayNameForPubkey, npub, displayNames]);

  // Track previous metadata to prevent unnecessary updates
  const prevMetadataRef = useRef<Metadata | null>(null);
  const prevPubkeyRef = useRef<string | null>(null);

  // Update display names cache when metadata changes - skip during scroll restoration
  useEffect(() => {
    if (!updateDisplayNames || !metadata || !pubkeyHex) return;

    // Skip metadata updates during scroll restoration to prevent interference
    if (isScrollRestorationActive()) {
      return;
    }

    // Skip if metadata hasn't actually changed
    if (
      prevPubkeyRef.current === pubkeyHex &&
      prevMetadataRef.current &&
      JSON.stringify(prevMetadataRef.current) === JSON.stringify(metadata)
    ) {
      return;
    }

    try {
      addDisplayNamesFromMetadata({ [pubkeyHex]: metadata });
      console.log(`📝 Updated display name cache for ${pubkeyHex.slice(0, 8)}: ${metadata.display_name || metadata.name || 'no name'}`);
      prevMetadataRef.current = metadata;
      prevPubkeyRef.current = pubkeyHex;
    } catch (error) {
      console.warn('Failed to update display names cache:', error);
    }
  }, [metadata, pubkeyHex, addDisplayNamesFromMetadata, updateDisplayNames]);

  // Update global metadata state when metadata changes - optimize to prevent unnecessary updates
  useEffect(() => {
    if (!updateGlobalState || !metadata || !pubkeyHex) return;

    // Skip metadata updates during scroll restoration to prevent interference
    if (isScrollRestorationActive()) {
      return;
    }

    // Check if this metadata is already in global state with a more efficient comparison
    const existingMetadata = globalMetadata?.[pubkeyHex];
    if (existingMetadata && (
      existingMetadata.display_name === metadata.display_name &&
      existingMetadata.name === metadata.name &&
      existingMetadata.picture === metadata.picture &&
      existingMetadata.about === metadata.about
    )) {
      return;
    }

    try {
      setGlobalMetadata(prev => {
        // Only update if the metadata actually changed
        if (prev[pubkeyHex] && (
          prev[pubkeyHex].display_name === metadata.display_name &&
          prev[pubkeyHex].name === metadata.name &&
          prev[pubkeyHex].picture === metadata.picture &&
          prev[pubkeyHex].about === metadata.about
        )) {
          return prev; // No change needed
        }

        return {
          ...prev,
          [pubkeyHex]: metadata,
        };
      });
      console.log(`🌐 Updated global metadata for ${pubkeyHex.slice(0, 8)}`);
    } catch (error) {
      console.warn('Failed to update global metadata:', error);
    }
  }, [metadata, pubkeyHex, setGlobalMetadata, updateGlobalState, pubkeyHex && globalMetadata?.[pubkeyHex]]);

  return {
    metadata,
    isLoading,
    error,
    refetch,
    displayName,
    npub,
  };
}

/**
 * Batch metadata loading hook for loading multiple user metadata efficiently
 * Replaces useBatchedMetadataLoading with unified caching strategy
 */
export function useUnifiedBatchMetadata({
  pubkeys,
  relayUrls,
  enabled = true,
}: {
  pubkeys: string[];
  relayUrls: string[];
  enabled?: boolean;
}) {
  const { addDisplayNamesFromMetadata } = useDisplayNames(relayUrls);
  const { setMetadata: setGlobalMetadata } = useNostrFeedState();

  // Generate a stable key for the batch
  const batchKey = useMemo(() => {
    return [...pubkeys].sort().join(',');
  }, [pubkeys]);

  const relayKey = useMemo(() => {
    return JSON.stringify([...relayUrls].sort());
  }, [relayUrls]);

  const {
    data: batchMetadata,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['batch-metadata', batchKey, relayKey],
    enabled: Boolean(pubkeys.length > 0 && relayUrls.length > 0 && enabled),
    queryFn: async () => {
      console.log(`🔄 Batch loading metadata for ${pubkeys.length} users...`);
      
      const { getGlobalRelayPool } = await import('../utils/nostr/relayConnectionPool');
      const pool = getGlobalRelayPool();
      
      const filter = {
        kinds: [0],
        authors: pubkeys,
        limit: pubkeys.length,
      };
      
      const events = await pool.querySync(relayUrls, filter);
      const result: Record<string, Metadata> = {};
      
      events.forEach((event: any) => {
        try {
          const content = JSON.parse(event.content || '{}');
          result[event.pubkey] = {
            name: content.name || '',
            display_name: content.display_name || content.displayName || '',
            picture: content.picture || '',
            about: content.about || '',
            nip05: content.nip05 || '',
            website: content.website || content.lud16 || '',
            banner: content.banner || '',
            lud16: content.lud16 || '',
          };
        } catch (error) {
          console.warn(`Failed to parse metadata for ${event.pubkey}:`, error);
        }
      });
      
      console.log(`✅ Batch loaded metadata for ${Object.keys(result).length}/${pubkeys.length} users`);
      return result;
    },
    staleTime: 3 * 60 * 1000, // 3 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
  });

  // Update display names and global state when batch metadata loads - skip during scroll restoration
  useEffect(() => {
    if (!batchMetadata || Object.keys(batchMetadata).length === 0) return;

    // Skip metadata updates during scroll restoration to prevent interference
    if (isScrollRestorationActive()) {
      return;
    }

    try {
      // Update display names cache
      addDisplayNamesFromMetadata(batchMetadata);

      // Update global metadata state
      setGlobalMetadata(prev => ({
        ...prev,
        ...batchMetadata,
      }));

      console.log(`📝 Updated caches for ${Object.keys(batchMetadata).length} users from batch`);
    } catch (error) {
      console.warn('Failed to update caches from batch metadata:', error);
    }
  }, [batchMetadata, addDisplayNamesFromMetadata, setGlobalMetadata]);

  return {
    metadata: batchMetadata || {},
    isLoading,
    error: error ? (error as any)?.message || 'Failed to load batch metadata' : null,
    refetch,
  };
}
