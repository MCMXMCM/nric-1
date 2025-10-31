import { useMemo, useCallback } from "react";

interface UseNostrFeedNavigationProps {
  state: any;
  feedQuery: any;
  handlePrefetch: (newIndex: number, totalNotes: number) => void;
}

export const useNostrFeedNavigation = ({
  state,
  feedQuery,
  handlePrefetch,
}: UseNostrFeedNavigationProps) => {
  // Enhanced navigation with ring buffer support
  const enhancedNavigation = useMemo(() => {
    if (!state.bufferEnabled) {
      return {
        navigateToIndex: (index: number) => {
          state.setCurrentIndex(
            Math.max(0, Math.min(index, state.notes.length - 1))
          );
        },
        navigateForward: (steps: number = 1) => {
          const newIndex = Math.min(
            state.currentIndex + steps,
            state.notes.length - 1
          );
          state.setCurrentIndex(newIndex);
        },
        navigateBackward: (steps: number = 1) => {
          const newIndex = Math.max(0, state.currentIndex - steps);
          state.setCurrentIndex(newIndex);
        },
        canNavigateForward: () => state.currentIndex < state.notes.length - 1,
        canNavigateBackward: () => state.currentIndex > 0,
      };
    }

    // Buffer-enabled navigation with smart bidirectional loading
    return {
      navigateToIndex: async (index: number) => {

        // Get integrated buffer info to understand our position in the full feed
        let ringBufferInfo = null;
        let integratedBufferInfo = null;

        try {
          // Try to get enhanced buffer info first
          const integratedStored = sessionStorage.getItem(
            "integratedBufferInfo"
          );
          if (integratedStored) {
            integratedBufferInfo = JSON.parse(integratedStored);
            ringBufferInfo = integratedBufferInfo; // Use as fallback
          } else {
            // Fall back to legacy buffer info
            const stored = sessionStorage.getItem("ringBufferInfo");
            if (stored) {
              ringBufferInfo = JSON.parse(stored);
            }
          }
        } catch {}

        // If we're using ring buffer, calculate the actual global index
        let globalIndex = index;
        if (ringBufferInfo && state.bufferEnabled) {
          globalIndex = ringBufferInfo.bufferStart + index;

        }

        // Check if we need to load more data forward (older notes)
        const currentNotesCount = feedQuery.notes?.length || 0;

        if (globalIndex >= currentNotesCount && feedQuery.query.hasNextPage) {

          // Use integrated buffer info for smarter loading decisions
          let pagesNeeded = Math.min(
            Math.ceil((globalIndex - currentNotesCount + 25) / 50), // Add 25 note buffer
            3 // Default limit to 3 pages for navigation
          );

          // Enhanced loading strategy based on buffer performance
          if (integratedBufferInfo?.performance) {
            const { bufferHitRatio, memoryEfficiency } =
              integratedBufferInfo.performance;

            // Adjust loading strategy based on performance metrics
            if (bufferHitRatio > 80 && memoryEfficiency < 30) {
              // High hit ratio but low memory efficiency - load more aggressively
              pagesNeeded = Math.min(pagesNeeded + 1, 5);

            } else if (bufferHitRatio < 50) {
              // Low hit ratio - be more conservative
              pagesNeeded = Math.max(pagesNeeded - 1, 1);

            }
          }

          // Use loading hints if available
          if (integratedBufferInfo?.loadingHints?.estimatedPagesNeeded) {
            const hintedPages = Math.min(
              integratedBufferInfo.loadingHints.estimatedPagesNeeded,
              4
            );
            pagesNeeded = Math.min(pagesNeeded, hintedPages);

          }

          try {

            for (
              let i = 0;
              i < pagesNeeded && feedQuery.query.hasNextPage;
              i++
            ) {
              await feedQuery.query.fetchNextPage();

              // Adaptive delay based on buffer state
              if (i < pagesNeeded - 1) {
                const delay = integratedBufferInfo?.queryState?.isFetching
                  ? 100
                  : 50;
                await new Promise((resolve) => setTimeout(resolve, delay));
              }
            }

          } catch (error) {
            console.error(
              "[NostrFeed] Failed to load forward data for navigation:",
              error
            );
          }
        }

        // Handle backward navigation (newer notes) - this is more complex as TanStack Query doesn't support backward pagination
        // For now, we'll rely on the ring buffer to handle this case
        if (ringBufferInfo && globalIndex < ringBufferInfo.bufferStart) {

          // Try to expand the ring buffer to include the target index
          const expandedStart = Math.max(0, globalIndex - 10); // Add some buffer
          const expandedEnd = Math.min(
            ringBufferInfo.originalTotalNotes - 1,
            ringBufferInfo.bufferEnd
          );

          if (expandedStart < ringBufferInfo.bufferStart && feedQuery.notes) {
            // Extract expanded buffer from full notes
            const expandedNotes = feedQuery.notes.slice(
              expandedStart,
              expandedEnd + 1
            );
            const newLocalIndex = globalIndex - expandedStart;

            state.setNotes(expandedNotes);
            state.setCurrentIndex(newLocalIndex);

            // Update ring buffer info
            const newRingBufferInfo = {
              ...ringBufferInfo,
              bufferStart: expandedStart,
              bufferEnd: expandedEnd,
            };

            try {
              sessionStorage.setItem(
                "ringBufferInfo",
                JSON.stringify(newRingBufferInfo)
              );
            } catch {}

            return;
          }
        }

        // Navigate to the index (will be clamped to available notes)
        const finalIndex = Math.max(0, Math.min(index, state.notes.length - 1));
        state.setCurrentIndex(finalIndex);

        // ✅ No buffer system needed - TanStack Query handles everything
      },

      navigateForward: async (steps: number = 1) => {
        const targetIndex = state.currentIndex + steps;
        await enhancedNavigation.navigateToIndex(targetIndex);
      },

      navigateBackward: async (steps: number = 1) => {
        const targetIndex = state.currentIndex - steps;
        await enhancedNavigation.navigateToIndex(targetIndex);
      },

      canNavigateForward: () => {
        // Get ring buffer info to understand our position
        let ringBufferInfo = null;
        try {
          const stored = sessionStorage.getItem("ringBufferInfo");
          if (stored) {
            ringBufferInfo = JSON.parse(stored);
          }
        } catch {}

        if (ringBufferInfo) {
          // In ring buffer mode, check if we can navigate within buffer or expand it
          const globalIndex = ringBufferInfo.bufferStart + state.currentIndex;
          return (
            globalIndex < ringBufferInfo.originalTotalNotes - 1 ||
            feedQuery.query.hasNextPage
          );
        }

        // Fallback to normal check
        return (
          state.currentIndex < state.notes.length - 1 ||
          feedQuery.query.hasNextPage
        );
      },

      canNavigateBackward: () => {
        // Get ring buffer info to understand our position
        let ringBufferInfo = null;
        try {
          const stored = sessionStorage.getItem("ringBufferInfo");
          if (stored) {
            ringBufferInfo = JSON.parse(stored);
          }
        } catch {}

        if (ringBufferInfo) {
          // In ring buffer mode, check if we can navigate backward within buffer or expand it
          const globalIndex = ringBufferInfo.bufferStart + state.currentIndex;
          return globalIndex > 0;
        }

        // Fallback to normal check
        return state.currentIndex > 0;
      },
    };
  }, [
    state.bufferEnabled,
    state.currentIndex,
    state.notes.length,
    feedQuery.notes?.length,
    feedQuery.query.hasNextPage,
    feedQuery.query.fetchNextPage,
    // bufferIntegration removed
    state.setCurrentIndex,
  ]);

  // Direction-based navigation wrapper for FeedControls
  const handleDirectionalNavigation = useCallback(
    async (direction: "up" | "down") => {
      const currentIndex = state.currentIndex;
      const totalNotes = state.notes.length;

      const newIndex =
        direction === "up"
          ? Math.max(0, currentIndex - 1)
          : Math.min(totalNotes - 1, currentIndex + 1);

      // ✅ Simplified navigation - no buffer complexity
      {
        // Simple navigation for buffer-disabled mode
        state.setLastNavigationSource("button");
        state.updateCurrentIndex(newIndex, handlePrefetch);
        state.setDisplayIndex(newIndex + 1);
      }
    },
    [
      state.currentIndex,
      state.notes.length,
      state.bufferEnabled,
      enhancedNavigation.navigateToIndex,
      state.setDisplayIndex,
      state.setLastNavigationSource,
      state.updateCurrentIndex,
    ]
  );

  return {
    enhancedNavigation,
    handleDirectionalNavigation,
  };
};
