import { useMemo, useRef } from "react";
import { nip19 } from "nostr-tools";
import { useUnifiedMetadata } from "./useUnifiedMetadata";
import { useNote } from "./useNote";
import { getGlobalRelayPool } from "../utils/nostr/relayConnectionPool";

export interface UseParentNoteDataOptions {
  parentNoteId?: string;
  parentNote?: any;
  relayUrls: string[];
}

export interface UseParentNoteDataResult {
  parentDisplayName: string | null;
  isParentDisplayNameLoading: boolean;
  parentNpubForLinks: string | null;
  parentNoteNotFound: boolean;
}

/**
 * Hook to fetch and format parent note data for reply context
 */
export const useParentNoteData = ({
  parentNoteId,
  parentNote,
  relayUrls,
}: UseParentNoteDataOptions): UseParentNoteDataResult => {
  // Create a ref for the relay pool
  const poolRef = useRef(getGlobalRelayPool());
  
  // Fetch parent note if we have parentNoteId but no parentNote
  const { note: fetchedParentNote, isLoading: isLoadingParentNote } = useNote({
    noteId: parentNoteId || "",
    relayUrls,
    enabled: !!parentNoteId && !parentNote,
    poolRef,
    buildAugmentedRelays: (relays) => relays,
  });

  // Use provided parentNote or fetched parentNote
  const actualParentNote = parentNote || fetchedParentNote;

  // Get parent note pubkey
  const parentPubkey = useMemo(() => {
    if (actualParentNote?.pubkey) {
      return actualParentNote.pubkey;
    }
    return null;
  }, [actualParentNote?.pubkey]);

  // Get parent npub for links
  const parentNpubForLinks = useMemo(() => {
    if (parentPubkey) {
      try {
        return nip19.npubEncode(parentPubkey);
      } catch {
        return null;
      }
    }
    return null;
  }, [parentPubkey]);

  // Get parent display name using unified metadata (always fetches)
  const {
    displayName: parentDisplayName,
    isLoading: isParentDisplayNameLoading,
  } = useUnifiedMetadata({
    pubkeyHex: parentPubkey || "",
    relayUrls: parentPubkey ? relayUrls : [],
    enabled: !!parentPubkey,
    updateDisplayNames: true,
    updateGlobalState: true,
  });

  // Determine if parent note was not found
  // True if we tried to fetch (parentNoteId exists), query completed, but no note was found
  const parentNoteNotFound = !!parentNoteId && !isLoadingParentNote && !actualParentNote;

  return {
    parentDisplayName: parentPubkey ? parentDisplayName : null,
    isParentDisplayNameLoading: parentPubkey ? (isLoadingParentNote || isParentDisplayNameLoading) : false,
    parentNpubForLinks,
    parentNoteNotFound,
  };
};
