import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchUserMetadata } from '../utils/profileMetadataUtils';
import { CACHE_KEYS } from '../utils/cacheKeys';

import type { Metadata } from '../types/nostr/types';

interface UseMetadataQueryOptions {
  pubkeyHex: string | null;
  relayUrls: string[];
  enabled?: boolean;
}

/**
 * Hook that manages metadata fetching with TanStack Query using unified cache key
 * All metadata queries now use the same cache key: ['metadata', pubkeyHex]
 * This enables metadata reuse across different contexts (feed, profile, contacts, etc.)
 */
export function useMetadataQuery({
  pubkeyHex,
  relayUrls,
  enabled = true,
}: UseMetadataQueryOptions) {

  const queryClient = useQueryClient();

  // Unified cache key - no longer includes relayKey to enable cross-relay metadata sharing
  // Metadata is user-specific, not relay-specific, so we can share it globally
  const queryKey = pubkeyHex ? CACHE_KEYS.METADATA(pubkeyHex) : ['metadata', null];

  return useQuery({
    queryKey,
    enabled: Boolean(pubkeyHex && relayUrls.length > 0) && enabled,
    queryFn: async (): Promise<{ metadata: Metadata | null; error?: string }> => {
      // First check if we already have this metadata cached
      const cachedData = queryClient.getQueryData(queryKey) as
        | { metadata: Metadata | null; error?: string }
        | Metadata
        | undefined;

      if (cachedData) {
        // Ensure the cached data has the expected structure
        // Some parts of the code might cache just the metadata object, others the full result
        if (cachedData && typeof cachedData === 'object') {
          if ('metadata' in cachedData) {
            // Already has the correct structure { metadata: ..., error?: ... }
            console.log(`📋 Using cached metadata for ${pubkeyHex?.slice(0, 8)}`);
            return cachedData as { metadata: Metadata | null; error?: string };
          } else {
            // Cached data is just the metadata object, wrap it properly
            console.log(`📋 Using cached metadata (wrapped) for ${pubkeyHex?.slice(0, 8)}`);
            return { metadata: cachedData as Metadata };
          }
        }
      }

      const result = await fetchUserMetadata({
        pubkeyHex: pubkeyHex as string,
        relayUrls,
      });

      // Sync to display names cache when metadata is fetched
      if (result.metadata && pubkeyHex) {
        try {
          const { addDisplayNameToCache } = await import('../utils/nostr/userDisplayNames');
          addDisplayNameToCache(pubkeyHex, result.metadata);
        } catch (error) {
          // Silently fail - display name cache update is not critical
          console.warn('Failed to update display name cache:', error);
        }
      }

      return result;
    },
    // Metadata doesn't change frequently, so use 2 minute stale time
    staleTime: 2 * 60 * 1000, // 2 minutes - metadata doesn't change frequently
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnMount: false, // Avoid unnecessary refetches when data is fresh
    // Show cached data immediately while fetching
    placeholderData: (): { metadata: Metadata | null; error?: string } | undefined => {
      const cachedData = queryClient.getQueryData(queryKey) as
        | { metadata: Metadata | null; error?: string }
        | Metadata
        | undefined;

      if (cachedData && typeof cachedData === 'object') {
        if ('metadata' in cachedData) {
          // Already has the correct structure
          return cachedData as { metadata: Metadata | null; error?: string };
        } else {
          // Cached data is just the metadata object, wrap it properly
          return { metadata: cachedData as Metadata };
        }
      }
      return undefined;
    },
  });
}

/**
 * Hook for logged-in user metadata that automatically fetches and syncs
 */
export function useCurrentUserMetadata(
  pubkeyHex: string | null,
  relayUrls: string[]
) {
  return useMetadataQuery({
    pubkeyHex,
    relayUrls,
    enabled: Boolean(pubkeyHex),
  });
}
