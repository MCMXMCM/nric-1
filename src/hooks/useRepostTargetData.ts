import { useMemo, useRef } from "react";
import { nip19 } from "nostr-tools";
import { useUnifiedMetadata } from "./useUnifiedMetadata";
import { useNote } from "./useNote";
import { getGlobalRelayPool } from "../utils/nostr/relayConnectionPool";

export interface UseRepostTargetDataOptions {
  repostTargetId?: string;
  repostTargetNote?: any;
  relayUrls: string[];
}

export interface UseRepostTargetDataResult {
  repostTargetDisplayName: string | null;
  isRepostTargetDisplayNameLoading: boolean;
  repostTargetNpubForLinks: string | null;
}

/**
 * Hook to fetch and format repost target note data for repost context
 */
export const useRepostTargetData = ({
  repostTargetId,
  repostTargetNote,
  relayUrls,
}: UseRepostTargetDataOptions): UseRepostTargetDataResult => {
  // Create a ref for the relay pool
  const poolRef = useRef(getGlobalRelayPool());
  
  // Fetch repost target note if we have repostTargetId but no repostTargetNote
  const { note: fetchedRepostTargetNote, isLoading: isLoadingRepostTargetNote } = useNote({
    noteId: repostTargetId || "",
    relayUrls,
    enabled: !!repostTargetId && !repostTargetNote,
    poolRef,
    buildAugmentedRelays: (relays) => relays,
  });

  // Use provided repostTargetNote or fetched repostTargetNote
  const actualRepostTargetNote = repostTargetNote || fetchedRepostTargetNote;

  // Get repost target note pubkey
  const repostTargetPubkey = useMemo(() => {
    if (actualRepostTargetNote?.pubkey) {
      return actualRepostTargetNote.pubkey;
    }
    return null;
  }, [actualRepostTargetNote?.pubkey]);

  // Get repost target npub for links
  const repostTargetNpubForLinks = useMemo(() => {
    if (repostTargetPubkey) {
      try {
        return nip19.npubEncode(repostTargetPubkey);
      } catch {
        return null;
      }
    }
    return null;
  }, [repostTargetPubkey]);

  // Get repost target display name using unified metadata (always fetches)
  const {
    displayName: repostTargetDisplayName,
    isLoading: isRepostTargetDisplayNameLoading,
  } = useUnifiedMetadata({
    pubkeyHex: repostTargetPubkey || "",
    relayUrls: repostTargetPubkey ? relayUrls : [],
    enabled: !!repostTargetPubkey,
    updateDisplayNames: true,
    updateGlobalState: true,
  });

  return {
    repostTargetDisplayName: repostTargetPubkey ? repostTargetDisplayName : null,
    isRepostTargetDisplayNameLoading: repostTargetPubkey ? (isLoadingRepostTargetNote || isRepostTargetDisplayNameLoading) : false,
    repostTargetNpubForLinks,
  };
};
