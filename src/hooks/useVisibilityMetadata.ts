import { useRef, useEffect, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchUserMetadata } from '../utils/profileMetadataUtils';
import { CACHE_KEYS } from '../utils/cacheKeys';
import type { Metadata } from '../types/nostr/types';

interface UseVisibilityMetadataOptions {
  pubkeyHex: string | null;
  relayUrls: string[];
  extraRelays?: string[];
  /**
   * Whether to fetch metadata immediately (bypass visibility check)
   * @default false
   */
  enabled?: boolean;
  /**
   * Intersection observer options for visibility detection
   */
  intersectionOptions?: IntersectionObserverInit;
  /**
   * Whether to retry metadata fetch if it fails
   * @default true
   */
  retryOnFailure?: boolean;
}

interface UseVisibilityMetadataResult {
  metadata: Metadata | null;
  isLoading: boolean;
  error: string | null;
  isVisible: boolean;
  refetch: () => void;
  visibilityRef: (node: HTMLElement | null) => void;
}

/**
 * Hook for fetching metadata when a component becomes visible
 * This provides on-demand metadata loading for components like UserInfoCard
 * that may not need metadata until they're actually displayed to the user.
 */
export function useVisibilityMetadata({
  pubkeyHex,
  relayUrls,
  extraRelays = [],
  enabled = false,
  intersectionOptions = {
    rootMargin: '50px', // Start fetching 50px before component is visible
    threshold: 0.1, // Trigger when 10% of component is visible
  },
  retryOnFailure = true,
}: UseVisibilityMetadataOptions): UseVisibilityMetadataResult {
  const elementRef = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [hasBeenVisible, setHasBeenVisible] = useState(false);

  // Intersection observer for visibility detection
  useEffect(() => {
    const element = elementRef.current;
    if (!element || !pubkeyHex) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            if (!hasBeenVisible) {
              setHasBeenVisible(true);
              console.log(`👁️ Component became visible, fetching metadata for ${pubkeyHex.slice(0, 8)}...`);
            }
          } else {
            setIsVisible(false);
          }
        });
      },
      intersectionOptions
    );

    observer.observe(element);

    return () => {
      observer.unobserve(element);
    };
  }, [pubkeyHex, intersectionOptions, hasBeenVisible]);

  // Metadata query - only enabled when component is visible or explicitly enabled
  const {
    data: metadataResult,
    isLoading,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: pubkeyHex ? CACHE_KEYS.METADATA(pubkeyHex) : ['visibility-metadata', null],
    enabled: Boolean(pubkeyHex && relayUrls.length > 0 && (enabled || hasBeenVisible)),
    queryFn: async () => {
      console.log(`🔄 Visibility metadata fetch for ${pubkeyHex?.slice(0, 8)} with ${relayUrls.length + extraRelays.length} relays`);
      return await fetchUserMetadata({ 
        pubkeyHex: pubkeyHex as string, 
        relayUrls,
        extraRelays
      });
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - metadata doesn't change frequently
    gcTime: 15 * 60 * 1000, // 15 minutes - keep in memory longer
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: retryOnFailure ? 2 : false, // Retry failed fetches
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
  });

  const metadata = metadataResult?.metadata ?? null;
  const error = queryError ? (queryError as Error).message : (metadataResult?.error || null);

  // Return ref for attaching to DOM element
  const visibilityRef = useCallback((node: HTMLElement | null) => {
    elementRef.current = node;
  }, []);

  return {
    metadata,
    isLoading,
    error,
    isVisible,
    refetch,
    // Expose the ref for component to use
    visibilityRef,
  };
}

export default useVisibilityMetadata;
