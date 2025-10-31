import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { 
  fetchRelayInfo, 
  fetchMultipleRelayInfo, 
  getRelayDisplayName,
  requiresAuth,
  requiresPayment,
  getMinPowDifficulty,
  getRelayLimitations
} from '../utils/nostr/relayInfo';
import type { 
  RelayInfo, 
  RelayInfoResult
} from '../utils/nostr/relayInfo';

export interface UseRelayInfoOptions {
  relayUrl?: string;
  relayUrls?: string[];
  enabled?: boolean;
  staleTime?: number;
  cacheTime?: number;
}

export interface UseRelayInfoResult {
  relayInfo: RelayInfo | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  displayName: string;
  needsAuth: boolean;
  needsPayment: boolean;
  minPowDifficulty: number | undefined;
  limitations: string[];
}

export interface UseMultipleRelayInfoResult {
  relayInfos: Map<string, RelayInfoResult>;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  getRelayInfo: (url: string) => RelayInfo | null;
  getDisplayName: (url: string) => string;
}

/**
 * Hook to fetch and manage relay information for a single relay
 */
export function useRelayInfo({
  relayUrl,
  enabled = true,
  staleTime = 5 * 60 * 1000, // 5 minutes
  cacheTime = 30 * 60 * 1000, // 30 minutes
}: UseRelayInfoOptions): UseRelayInfoResult {
  
  const queryKey = useMemo(() => 
    relayUrl ? ['relay-info', relayUrl] : ['relay-info', null],
    [relayUrl]
  );

  const {
    data: result,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey,
    enabled: Boolean(relayUrl && enabled),
    queryFn: () => fetchRelayInfo(relayUrl!),
    staleTime,
    gcTime: cacheTime,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
  });

  const relayInfo = result?.info || null;
  const errorMessage = error?.message || result?.error || null;

  // Computed values
  const displayName = useMemo(() => 
    getRelayDisplayName(relayUrl || '', relayInfo || undefined),
    [relayUrl, relayInfo]
  );

  const needsAuth = useMemo(() => 
    requiresAuth(relayInfo || undefined),
    [relayInfo]
  );

  const needsPayment = useMemo(() => 
    requiresPayment(relayInfo || undefined),
    [relayInfo]
  );

  const minPowDifficulty = useMemo(() => 
    getMinPowDifficulty(relayInfo || undefined),
    [relayInfo]
  );

  const limitations = useMemo(() => 
    getRelayLimitations(relayInfo || undefined),
    [relayInfo]
  );

  return {
    relayInfo,
    isLoading,
    error: errorMessage,
    refetch,
    displayName,
    needsAuth,
    needsPayment,
    minPowDifficulty,
    limitations,
  };
}

/**
 * Hook to fetch and manage relay information for multiple relays
 */
export function useMultipleRelayInfo({
  relayUrls = [],
  enabled = true,
  staleTime = 5 * 60 * 1000, // 5 minutes
  cacheTime = 30 * 60 * 1000, // 30 minutes
}: UseRelayInfoOptions): UseMultipleRelayInfoResult {
  
  const queryKey = useMemo(() => 
    ['multiple-relay-info', ...relayUrls.sort()],
    [relayUrls]
  );

  const {
    data: results,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey,
    enabled: Boolean(relayUrls.length > 0 && enabled),
    queryFn: () => fetchMultipleRelayInfo(relayUrls),
    staleTime,
    gcTime: cacheTime,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
  });

  const relayInfos = results || new Map<string, RelayInfoResult>();
  const errorMessage = error?.message || null;

  // Helper functions
  const getRelayInfo = useCallback((url: string): RelayInfo | null => {
    return relayInfos.get(url)?.info || null;
  }, [relayInfos]);

  const getDisplayName = useCallback((url: string): string => {
    const info = getRelayInfo(url);
    return getRelayDisplayName(url, info || undefined);
  }, [getRelayInfo]);

  return {
    relayInfos,
    isLoading,
    error: errorMessage,
    refetch,
    getRelayInfo,
    getDisplayName,
  };
}

/**
 * Hook to prefetch relay information for a list of relays
 * This is useful for warming up the cache before users need the data
 */
export function useRelayInfoPrefetch() {
  const queryClient = useQueryClient();

  const prefetchRelayInfo = useCallback(async (relayUrls: string[]) => {
    const promises = relayUrls.map(url => 
      queryClient.prefetchQuery({
        queryKey: ['relay-info', url],
        queryFn: () => fetchRelayInfo(url),
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
      })
    );

    await Promise.allSettled(promises);
  }, [queryClient]);

  const invalidateRelayInfo = useCallback((relayUrl: string) => {
    queryClient.invalidateQueries({
      queryKey: ['relay-info', relayUrl],
    });
  }, [queryClient]);

  const clearRelayInfoCache = useCallback(() => {
    queryClient.removeQueries({
      queryKey: ['relay-info'],
    });
  }, [queryClient]);

  return {
    prefetchRelayInfo,
    invalidateRelayInfo,
    clearRelayInfoCache,
  };
}
