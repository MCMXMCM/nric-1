import { useEffect, useRef } from "react";
import { CACHE_KEYS } from "../utils/cacheKeys";

interface UseNostrFeedFilterEffectsProps {
  state: any;
  operations: any;
  readRelaysKey: string;
  pageSize: number;
  uiShowReplies: boolean;
  uiShowReposts: boolean;
  uiFilterByImageNotesOnly: boolean;
  uiCustomHashtags: string[];
  queryClient: any;
  setLastFilterChangeTime: (time: number) => void;
}

export const useNostrFeedFilterEffects = ({
  state,
  operations,
  readRelaysKey,
  pageSize,
  uiShowReplies,
  uiShowReposts,
  uiFilterByImageNotesOnly,
  uiCustomHashtags,
  queryClient,
  setLastFilterChangeTime,
}: UseNostrFeedFilterEffectsProps) => {
  // Filter change effect - debounced to handle rapid filter changes
  const prevFiltersRef = useRef({
    showReplies: uiShowReplies,
    showReposts: uiShowReposts,
    customHashtags: uiCustomHashtags,
  });

  // Track if this is an initialization or automatic change vs user change
  const isUserFilterChangeRef = useRef(false);
  const lastUserInteractionRef = useRef(Date.now());
  const filterChangeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  
  // Track current query key to cancel previous queries when filters change
  const currentQueryKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const current = {
      showReplies: uiShowReplies,
      showReposts: uiShowReposts,
      customHashtags: uiCustomHashtags,
    };

    const prev = prevFiltersRef.current;

    // Deep comparison for arrays to avoid false positives
    const hasChanged =
      current.showReplies !== prev.showReplies ||
      current.showReposts !== prev.showReposts ||
      JSON.stringify(current.customHashtags) !==
        JSON.stringify(prev.customHashtags);

    if (hasChanged && state.isInitialized) {
      const timeSinceLastInteraction =
        Date.now() - lastUserInteractionRef.current;

      // Only reset index if it's been more than 2 seconds since last user interaction
      // This helps distinguish between user-initiated changes and automatic/system changes
      const isLikelyUserChange =
        timeSinceLastInteraction < 2000 || isUserFilterChangeRef.current;

      if (isLikelyUserChange) {

      } else {

      }

      // Clear any existing timeout to debounce rapid changes
      if (filterChangeTimeoutRef.current) {
        clearTimeout(filterChangeTimeoutRef.current);
      }

      // Cancel any ongoing queries from previous filter changes immediately
      if (currentQueryKeyRef.current) {
        const oldQueryKey = JSON.parse(currentQueryKeyRef.current);
        queryClient.cancelQueries({ queryKey: oldQueryKey });
      }

      // Get the new filter hash and query key immediately
      const newFilterHash = operations.getCurrentFilterHash();
      const newQueryKey = CACHE_KEYS.FEED.NOTES(
        newFilterHash,
        readRelaysKey,
        pageSize
      );
      
      // Store current query key for cancellation
      currentQueryKeyRef.current = JSON.stringify(newQueryKey);

      // Reset loading states immediately to prevent stuck loading indicators
      state.setIsCheckingForNewNotes(false);
      state.setIsFetchingPage(false);
      state.setNewNotesFound(0);
      state.setShowNoNewNotesMessage(false);

      // Debounce the filter change handling to prevent race conditions from rapid changes
      filterChangeTimeoutRef.current = setTimeout(async () => {
        // Double-check we're still handling the same filter change
        const currentNewQueryKey = JSON.stringify(CACHE_KEYS.FEED.NOTES(
          operations.getCurrentFilterHash(),
          readRelaysKey,
          pageSize
        ));
        
        if (currentQueryKeyRef.current !== currentNewQueryKey) {
          // Filter changed again during debounce, skip this execution
          return;
        }

        // Reset feed state for the new filter
        state.setNotes([]);
        state.setCurrentIndex(0);
        state.setDisplayIndex(1);
        state.setHasMorePages(true);

        // Cancel all existing feed queries to prevent race conditions
        await queryClient.cancelQueries({ queryKey: ["feed"] });
        
        // Remove any existing query data for the new filter hash to ensure fresh fetch
        queryClient.removeQueries({ queryKey: newQueryKey, exact: true });
        
        // Also remove any stale queries that might interfere
        queryClient.removeQueries({ 
          queryKey: ["feed"], 
          predicate: (query: any) => {
            // Remove queries that don't match our current filter hash
            const queryKeyStr = JSON.stringify(query.queryKey);
            const currentKeyStr = JSON.stringify(newQueryKey);
            return queryKeyStr !== currentKeyStr;
          }
        });

        // Force a complete reset of the infinite query state
        queryClient.resetQueries({ queryKey: newQueryKey, exact: true });

        // Reset the user change flag and clear timeout reference
        isUserFilterChangeRef.current = false;
        filterChangeTimeoutRef.current = null;
        
        console.log('🔄 Filter change processing complete for:', operations.getCurrentFilterHash()?.slice(0, 8));
      }, 300); // Slightly increased debounce time to allow for contact loading
    }

    prevFiltersRef.current = current;

    // Cleanup timeout on unmount
    return () => {
      if (filterChangeTimeoutRef.current) {
        clearTimeout(filterChangeTimeoutRef.current);
      }
    };
  }, [
    uiShowReplies,
    uiShowReposts,
    uiFilterByImageNotesOnly,
    uiCustomHashtags,
    state.isInitialized,
    operations,
    readRelaysKey,
    pageSize,
    queryClient,
  ]);

  // Listen for logout events and clear feed state
  useEffect(() => {
    const handleSignOut = () => {
      console.log('🔄 Logout detected - clearing feed state');

      // Clear feed state to prevent infinite loops
      state.setNotes([]);
      state.setCurrentIndex(0);
      state.setDisplayIndex(1);
      state.setIsInitialized(false);
      state.setHasMorePages(true);
      state.setIsFetchingPage(false);

      // Clear localStorage indexes
      try {
        localStorage.removeItem("currentIndex");
        localStorage.removeItem("displayIndex");
      } catch {}

      // Invalidate all feed queries to prevent stale data
      queryClient.invalidateQueries({ queryKey: ["feed"] });

    };

    window.addEventListener("nostrSignOut", handleSignOut);
    return () => window.removeEventListener("nostrSignOut", handleSignOut);
  }, [queryClient, state]);


  return {
    setLastFilterChangeTime,
  };
};
