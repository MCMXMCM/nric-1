import React from 'react';
import { nip19 } from 'nostr-tools';
import { useMetadataQuery } from './useMetadataQuery';
import { getDisplayName } from '../utils/nostr/userDisplayNames';

interface UseCreatedByDisplayNameOptions {
  pubkey: string;
  relayUrls: string[];
  isMobile?: boolean;
  getDisplayNameForPubkey: (pubkey: string) => string;
}

interface UseCreatedByDisplayNameResult {
  displayText: string | null;
  isLoading: boolean;
  npub: string;
  hasDisplayName: boolean;
}

/**
 * Hook to get display name for a note author with metadata fetching
 * 
 * @param options - Configuration options
 * @param options.pubkey - The public key in hex format
 * @param options.relayUrls - Array of relay URLs to fetch metadata from
 * @param options.isMobile - Whether the app is in mobile mode (affects npub truncation)
 * @param options.getDisplayNameForPubkey - Function to get existing display names
 * 
 * @returns Object containing display text, loading state, npub, and display name status
 */
export const useCreatedByDisplayName = ({
  pubkey,
  relayUrls,
  isMobile = false,
  getDisplayNameForPubkey,
}: UseCreatedByDisplayNameOptions): UseCreatedByDisplayNameResult => {
  const npub = nip19.npubEncode(pubkey);
  
  // Check memory cache first for faster lookup
  const cachedDisplayName = React.useMemo(() => getDisplayName(pubkey), [pubkey]);
  
  // Check if we have a display name already (from cache or getDisplayNameForPubkey)
  const currentDisplayName = cachedDisplayName || getDisplayNameForPubkey(pubkey);

  // If we already have a display name that's different from npub, use it
  const hasDisplayName = cachedDisplayName !== null || currentDisplayName !== npub;

  // Only fetch metadata if we don't have a display name
  const { data: metadataResult, isPending: isLoadingMetadata } =
    useMetadataQuery({
      pubkeyHex: hasDisplayName ? null : pubkey,
      relayUrls,
      enabled: !hasDisplayName && relayUrls.length > 0,
    });

  // Determine what to display
  const displayUserNameOrNpub = React.useMemo(() => {
    if (hasDisplayName) {
      return currentDisplayName;
    }

    if (isLoadingMetadata) {
      // Show abbreviated npub instead of null (loading spinner)
      return isMobile && npub.length > 16
        ? `${npub.slice(0, 8)}...${npub.slice(-6)}`
        : npub.slice(0, 12) + "...";
    }

    if (metadataResult?.metadata) {
      const displayName =
        metadataResult.metadata.display_name || metadataResult.metadata.name;
      if (displayName && displayName.trim()) {
        return displayName.trim();
      }
    }

    // Fall back to npub
    return isMobile && npub.length > 16
      ? `${npub.slice(0, 8)}...${npub.slice(-6)}`
      : npub;
  }, [
    hasDisplayName,
    currentDisplayName,
    isLoadingMetadata,
    metadataResult,
    npub,
    isMobile,
  ]);

  return {
    displayText: displayUserNameOrNpub,
    isLoading: !hasDisplayName && isLoadingMetadata,
    npub,
    hasDisplayName,
  };
};
