import { useEffect } from "react";

interface UseNostrFeedNavigationEffectsProps {
  location: any;
  state: any;
  navigate: any;
  feedQuery: any;
  queryClient: any;
  currentFilterHash: string;
  readRelaysKey: string;
  pageSize: number;
  isNoteRoute: boolean;
  isInitialized: boolean;
  fetchAfterConnectRef: any;
  relayStatuses: any[];
  operationsRef: any;
}

export const useNostrFeedNavigationEffects = ({
  location,
  state,
  navigate,
  feedQuery,
  queryClient,
  currentFilterHash,
  readRelaysKey,
  pageSize,
  isNoteRoute,
  isInitialized,
  fetchAfterConnectRef,
  relayStatuses,
  operationsRef,
}: UseNostrFeedNavigationEffectsProps) => {
  // ✅ Simplified relay connection handling - no buffer restoration interference
  useEffect(() => {
    if (
      fetchAfterConnectRef.current &&
      relayStatuses.length > 0 &&
      relayStatuses.some((s) => s.connected) &&
      !state.isFetchingPage &&
      state.isPageVisible &&
      state.notes.length === 0
    ) {
      fetchAfterConnectRef.current = false;
      operationsRef.current?.fetchNotesPage();
    }
  }, [
    relayStatuses,
    state.isFetchingPage,
    state.isPageVisible,
    state.notes.length,
  ]);

  // Disable automatic URL syncing to avoid back-stack loops; sharing uses explicit links.
  useEffect(() => {
    // This effect is kept for potential future use
  }, [state.notes.length]);

  // No automatic index sync on route; NoteView manages its own display.

  // ✅ Enhanced router state restoration with better timing
  useEffect(() => {
    const s = location.state as any;
    const restoreIndex = typeof s?.restoreIndex === "number" ? s.restoreIndex : null;
    
    // Only restore if we have meaningful data and the restoration is valid
    if (restoreIndex != null && state.notes.length > 0) {
      console.log("📍 Restoring index from router state:", {
        restoreIndex,
        notesLength: state.notes.length,
        timestamp: s?.timestamp
      });
      
      // Validate restoration isn't too old (30 minutes max)
      const timestamp = s?.timestamp;
      const isStale = timestamp && (Date.now() - timestamp) > 30 * 60 * 1000;
      
      if (isStale) {
        console.log("⏰ Router restoration state is stale, skipping");
        navigate(location.pathname, {
          replace: true,
          state: { fromFeed: true },
        });
        return;
      }
      
      const clamped = Math.max(0, Math.min(restoreIndex, state.notes.length - 1));
      
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        state.setCurrentIndex(clamped);
        
        // Clean up router state after restoration
        navigate(location.pathname, {
          replace: true,
          state: { fromFeed: true, feedIndex: clamped },
        });
      });
    }
  }, [
    location.state,
    state.notes.length,
    navigate,
    location.pathname,
    state.setCurrentIndex,
  ]);

  // Handle navigation back to feed - ensure proper state synchronization
  useEffect(() => {
    const isReturningToFeed =
      location.state?.fromFeed || location.state?.feedIndex !== undefined;

    // ✅ Simplified - no competing restoration systems

    if (isReturningToFeed && !isNoteRoute && isInitialized) {
      console.log("✅ Returning to feed - trusting TanStack Query cache completely");

      // ✅ Let TanStack Query handle everything - no manual syncing needed
      // The placeholderData in useFeedQuery will preserve the data
      // Only sync if we have a clear mismatch (edge case)
      if (
        feedQuery.notes &&
        feedQuery.notes.length > 0 &&
        state.notes.length === 0
      ) {
        console.log("🔄 Syncing cached feed data to local state");
        state.setNotes(feedQuery.notes);
      }

      // Restore the feed index if available
      const feedIndex = location.state?.feedIndex;
      if (typeof feedIndex === "number" && state.notes.length > 0) {
        const clamped = Math.max(
          0,
          Math.min(feedIndex, state.notes.length - 1)
        );
        state.setCurrentIndex(clamped);
      }
    }
  }, [
    location.state,
    isNoteRoute,
    isInitialized,
    feedQuery.notes,
    state.notes.length,
    queryClient,
    currentFilterHash,
    readRelaysKey,
    pageSize,
    state.setCurrentIndex,
  ]);
};
