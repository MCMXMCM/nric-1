import { useState, useEffect, useMemo } from "react";
import { useParams } from "@tanstack/react-router";
import type { Metadata } from "../types/nostr/types";
import { useDisplayNames } from "./useDisplayNames";
import {
  decodeRouteParam,
  formatTruncated,
  isSelfProfile,
} from "../utils/profileUtils";
import {
  fetchUserMetadata,
} from "../utils/profileMetadataUtils";
import { useQuery } from "@tanstack/react-query";
import { CACHE_KEYS } from "../utils/cacheKeys";

/**
 * Hook to manage profile metadata loading only (no notes)
 * This allows the profile layout to load independently of section content
 */
export const useProfileMetadata = (
  nostrClient: any,
  relayUrls: string[],
  userPubkey: string | undefined,
  globalMetadata?: Record<string, Metadata>
) => {
  const { npub: routeParam } = useParams({ strict: false }) as { npub: string };
  const { getDisplayNameForPubkey, addDisplayNamesFromMetadata } = useDisplayNames(relayUrls);

  // Profile identity state
  const [pubkeyHex, setPubkeyHex] = useState<string | null>(null);
  const [npubBech32, setNpubBech32] = useState<string | null>(null);

  // Computed values
  const isSelf = useMemo(() => {
    return isSelfProfile(pubkeyHex, userPubkey);
  }, [pubkeyHex, userPubkey]);

  // Prepare initial data for SWR behavior using global cache
  const initialMetadataResult = useMemo(() => {
    if (pubkeyHex && globalMetadata && globalMetadata[pubkeyHex]) {
      return { metadata: globalMetadata[pubkeyHex] } as { metadata: Metadata };
    }
    return undefined;
  }, [pubkeyHex, globalMetadata]);

  // Metadata query (kind 0) with stable caching
  const {
    data: metadataResult,
    isPending: isLoadingMeta,
    error: metadataError,
    refetch: refetchMetadata,
  } = useQuery({
    queryKey: pubkeyHex ? CACHE_KEYS.METADATA(pubkeyHex) : ['metadata', null],
    enabled: Boolean(pubkeyHex && nostrClient && relayUrls.length > 0),
    queryFn: async () => {
      return await fetchUserMetadata({ pubkeyHex: pubkeyHex as string, relayUrls });
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    initialData: initialMetadataResult,
    initialDataUpdatedAt: initialMetadataResult ? Date.now() - (60 * 1000) : undefined,
  });

  const metadata: Metadata | null = metadataResult?.metadata ?? null;
  const metaError: string | null = metadataError ? (metadataError as any)?.message || "Failed to load profile" : (metadataResult?.error || null);

  // Use global metadata if available AND more recent, otherwise use fetched metadata
  const effectiveMetadata = useMemo(() => {
    if (!pubkeyHex) return null;
    
    const globalMeta = globalMetadata?.[pubkeyHex];
    const queryMeta = metadata;
    
    // If we have both, use the more recent one
    if (globalMeta && queryMeta) {
      // Global metadata doesn't have timestamp, so prefer query result for consistency
      return queryMeta;
    }
    
    return queryMeta || globalMeta || null;
  }, [pubkeyHex, globalMetadata, metadata]);

  // Display title computation
  const displayTitle = useMemo(() => {
    if (!pubkeyHex) return "Profile";
    
    const displayName = getDisplayNameForPubkey(pubkeyHex);
    if (displayName) return displayName;
    
    if (effectiveMetadata) {
      const metaDisplayName = effectiveMetadata.display_name || 
                             (effectiveMetadata as any).displayName || 
                             effectiveMetadata.name;
      if (metaDisplayName) return metaDisplayName.trim();
    }
    
    return npubBech32 ? formatTruncated(npubBech32) : "Profile";
  }, [pubkeyHex, effectiveMetadata, getDisplayNameForPubkey, npubBech32]);

  // Route parameter parsing effect
  useEffect(() => {
    if (!routeParam) {
      setPubkeyHex(null);
      setNpubBech32(null);
      return;
    }

    const { hex, npub, error } = decodeRouteParam(routeParam);
    if (error || !hex || !npub) {
      console.error("Failed to decode route param:", routeParam, error);
      setPubkeyHex(null);
      setNpubBech32(null);
      return;
    }

    setPubkeyHex(hex);
    setNpubBech32(npub);
  }, [routeParam]);

  // Update display names when metadata is fetched
  useEffect(() => {
    if (effectiveMetadata && pubkeyHex) {
      addDisplayNamesFromMetadata({ [pubkeyHex]: effectiveMetadata });
    }
  }, [effectiveMetadata, pubkeyHex, addDisplayNamesFromMetadata]);

  return {
    // Identity
    pubkeyHex,
    npubBech32,
    isSelf,
    displayTitle,
    
    // Metadata
    metadata: effectiveMetadata,
    isLoadingMeta,
    metaError,
    
    // Utilities
    getDisplayNameForPubkey,
    addDisplayNamesFromMetadata,
    refetchMetadata,
  };
};
