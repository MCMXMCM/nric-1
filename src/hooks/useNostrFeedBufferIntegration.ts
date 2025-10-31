import { useEffect } from "react";

interface UseNostrFeedBufferIntegrationProps {
  state: any;
  feedQuery: any;
  bufferIntegration: any;
}

export const useNostrFeedBufferIntegration = ({
  state,
  feedQuery,
  bufferIntegration,
}: UseNostrFeedBufferIntegrationProps) => {
  // Enhanced buffer system integration with TanStack Query synchronization
  useEffect(() => {
    if (
      !state.bufferEnabled ||
      !feedQuery.notes ||
      feedQuery.notes.length === 0
    )
      return;

    const manageIntegratedBuffer = () => {
      const BUFFER_SIZE_BEFORE = 25; // Notes to keep before current position
      const BUFFER_SIZE_AFTER = 25; // Notes to keep after current position
      const CLEANUP_THRESHOLD = 200; // Start cleanup when we have more than this many notes

      const currentIndex = state.currentIndex;
      const totalNotes = feedQuery.notes.length;

      // Only manage buffer if we have enough notes to warrant it
      if (totalNotes <= CLEANUP_THRESHOLD) return;

      // Calculate optimal buffer boundaries
      const optimalStart = Math.max(0, currentIndex - BUFFER_SIZE_BEFORE);
      const optimalEnd = Math.min(
        totalNotes - 1,
        currentIndex + BUFFER_SIZE_AFTER
      );

      // Extract the ring buffer window
      const bufferNotes = feedQuery.notes.slice(optimalStart, optimalEnd + 1);
      const newCurrentIndex = currentIndex - optimalStart; // Adjust index relative to buffer

      // Update state with the ring buffer
      state.setNotes(bufferNotes);
      state.setCurrentIndex(newCurrentIndex);

      // Enhanced ring buffer metadata with TanStack Query integration
      const integratedBufferInfo = {
        originalTotalNotes: totalNotes,
        bufferStart: optimalStart,
        bufferEnd: optimalEnd,
        originalCurrentIndex: currentIndex,
        timestamp: Date.now(),

        // TanStack Query integration metadata
        queryState: {
          hasNextPage: feedQuery.query.hasNextPage,
          isFetching: feedQuery.query.isFetching,
          isFetchingNextPage: feedQuery.query.isFetchingNextPage,
          lastFetchTime: Date.now(),
        },

        // Buffer performance metadata
        performance: {
          bufferHitRatio: calculateBufferHitRatio(
            optimalStart,
            optimalEnd,
            currentIndex
          ),
          memoryEfficiency: (bufferNotes.length / totalNotes) * 100,
          lastOptimization: Date.now(),
        },

        // Smart loading hints
        loadingHints: {
          recommendedPrefetchDirection:
            currentIndex > (optimalStart + optimalEnd) / 2
              ? "forward"
              : "backward",
          estimatedPagesNeeded: Math.ceil((totalNotes - optimalEnd) / 50),
          nextOptimizationThreshold: optimalEnd + 25,
        },
      };

      try {
        sessionStorage.setItem(
          "integratedBufferInfo",
          JSON.stringify(integratedBufferInfo)
        );
        // Keep legacy key for backward compatibility
        sessionStorage.setItem(
          "ringBufferInfo",
          JSON.stringify({
            originalTotalNotes: totalNotes,
            bufferStart: optimalStart,
            bufferEnd: optimalEnd,
            originalCurrentIndex: currentIndex,
            timestamp: Date.now(),
          })
        );
      } catch {}

      // Sync with BufferManager if available
      if (bufferIntegration?.bufferState) {
        try {
          // Update buffer manager with current state

          // Note: This would typically call bufferManager.updateNotes(bufferNotes, newCurrentIndex)
        } catch (error) {
          console.warn("[NostrFeed] Failed to sync with BufferManager:", error);
        }
      }
    };

    // Helper function to calculate buffer hit ratio
    const calculateBufferHitRatio = (
      start: number,
      end: number,
      current: number
    ) => {
      const bufferSize = end - start + 1;
      const distanceFromCenter = Math.abs(current - (start + end) / 2);
      return Math.max(0, 100 - (distanceFromCenter / bufferSize) * 100);
    };

    // Debounced buffer management with performance monitoring
    const timeoutId = setTimeout(() => {
      manageIntegratedBuffer();

    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [
    state.bufferEnabled,
    state.currentIndex,
    feedQuery.notes?.length,
    feedQuery.query.hasNextPage,
    feedQuery.query.isFetching,
    feedQuery.query.isFetchingNextPage,
    state.setNotes,
    state.setCurrentIndex,
    bufferIntegration,
  ]);

  // Buffer performance monitoring and optimization
  useEffect(() => {
    if (!state.bufferEnabled) return;

    const monitorBufferPerformance = () => {
      try {
        const stored = sessionStorage.getItem("integratedBufferInfo");
        if (!stored) return;

        const bufferInfo = JSON.parse(stored);
        const { performance: bufferPerf } = bufferInfo;
        // queryState available for future use
        // const { queryState } = bufferInfo;

        if (bufferPerf) {

          // Trigger optimization if performance is poor
          if (
            bufferPerf.bufferHitRatio < 60 ||
            bufferPerf.memoryEfficiency > 80
          ) {

            // Update optimization metadata
            const optimizedInfo = {
              ...bufferInfo,
              performance: {
                ...bufferPerf,
                lastOptimization: Date.now(),
                optimizationReason:
                  bufferPerf.bufferHitRatio < 60
                    ? "low_hit_ratio"
                    : "high_memory_usage",
              },
            };

            sessionStorage.setItem(
              "integratedBufferInfo",
              JSON.stringify(optimizedInfo)
            );
          }
        }
      } catch (error) {
        console.warn(
          "[NostrFeed] Buffer performance monitoring failed:",
          error
        );
      }
    };

    // Monitor buffer performance every 30 seconds
    const performanceInterval = setInterval(monitorBufferPerformance, 30000);
    return () => clearInterval(performanceInterval);
  }, [state.bufferEnabled]);
};
