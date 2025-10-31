import { useEffect } from "react";

interface UseNostrFeedInitializationProps {
  nostrClient: any;
  state: any;
  ctxPubkey: string;
  readRelays: string[];
  readRelaysKey: string;
  getPubkeysNeedingFetch: (pubkeys: string[]) => string[];
  fetchDisplayNames: (pubkeys: string[]) => void;
  addDisplayNamesFromMetadata: (metadata: any) => void;
}

export const useNostrFeedInitialization = ({
  nostrClient,
  state,
  ctxPubkey,
  readRelays,
  readRelaysKey,
  getPubkeysNeedingFetch,
  fetchDisplayNames,
  addDisplayNamesFromMetadata,
}: UseNostrFeedInitializationProps) => {
  // Fetch logged-in user's metadata when they log in
  useEffect(() => {
    if (!ctxPubkey || !nostrClient || readRelays.length === 0) return;

    // Avoid redundant updates if metadata already exists for ctxPubkey
    const alreadyHaveMetadata = !!state.metadata[ctxPubkey];

    // Check if we need to fetch the user's display name
    const need = getPubkeysNeedingFetch([ctxPubkey]);
    if (need.length > 0) {
      fetchDisplayNames(need);
    }

    if (alreadyHaveMetadata) return;

    // Also fetch full metadata for the logged-in user
    const fetchUserMetadata = async () => {
      try {
        const { fetchUserMetadata: fetchMeta } = await import(
          "../utils/profileMetadataUtils"
        );
        const result = await fetchMeta({
          pubkeyHex: ctxPubkey,
          relayUrls: readRelays,
        });
        if (result.metadata && !result.error) {
          // Only set if it actually changed
          state.setMetadata((prev: any) => {
            const prevMeta = prev[ctxPubkey];
            if (prevMeta) return prev; // no change
            return { ...prev, [ctxPubkey]: result.metadata! };
          });
          addDisplayNamesFromMetadata({ [ctxPubkey]: result.metadata! });
        }
      } catch (error) {
        console.warn("Failed to fetch logged-in user metadata:", error);
      }
    };

    fetchUserMetadata();
  }, [ctxPubkey, nostrClient, readRelaysKey]);

  // Listen for profile updates and refresh logged-in user metadata
  useEffect(() => {
    if (ctxPubkey && state.metadata[ctxPubkey]) {
      // Update display names cache when metadata changes
      addDisplayNamesFromMetadata({
        [ctxPubkey]: state.metadata[ctxPubkey],
      });
    }
  }, [ctxPubkey, state.metadata]);

  // Initialize feed: hydrate from cache and mark initialized. Query hook handles network fetches.
  useEffect(() => {
    const initializeFeed = async () => {
      if (!nostrClient || state.isInitialized) return;

      try {
        // Metadata now handled via TanStack Query persistence

        // Notes are managed by TanStack Query; persisted cache will hydrate feedQuery.
        // Metadata is now handled via TanStack Query persistence

        // Prime display names for any existing notes in state
        if (state.notes.length > 0) {
          const pubkeysToFetch = state.notes.map((n: any) => n.pubkey);
          const need = getPubkeysNeedingFetch(pubkeysToFetch);
          if (need.length > 0) fetchDisplayNames(need);
        }

        // Deprecated: DB cache stats removed in favor of TanStack persisted cache summary in Settings.
        state.setCacheStats({
          notesCount: 0,
          metadataCount: 0, // Metadata handled by TanStack Query persistence
          contactsCount: state.contacts.length,
          asciiCacheCount: Object.keys(state.asciiCache).length,
          zapTotalsCount: 0, // Zap totals handled by TanStack Query persistence
        });

        state.setIsInitialized(true);
      } catch (error) {
        console.error("Error initializing feed:", error);
        state.setIsInitialized(true);
      }
    };

    initializeFeed();
  }, [nostrClient, state.isInitialized]);
};
