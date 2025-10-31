import { useCallback } from "react";
import { nip19 } from "nostr-tools";
import { setCustomHashtags as storeSetCustomHashtags } from "../components/lib/uiStore";
import {
  createHashtagClickHandler,
  createHashtagRemoveHandler,
  createPrefetchHandler,
  createMediaLoadErrorHandler,
  createAsciiRenderedHandler,
} from "../components/feed/eventHandlers";

interface UseNostrFeedEventHandlersProps {
  state: any;
  operations: any;
  uiCustomHashtags: string[];
  feedQuery: any;
}

export const useNostrFeedEventHandlers = ({
  state,
  operations,
  uiCustomHashtags,
  feedQuery,
}: UseNostrFeedEventHandlersProps) => {
  const handleAsciiRendered = useCallback(
    createAsciiRenderedHandler(state.setAsciiCache),
    [state]
  );

  const handleMediaLoadError = useCallback(
    createMediaLoadErrorHandler(state.setNotes),
    [state]
  );

  const handleHashtagClick = useCallback(
    createHashtagClickHandler(
      () => uiCustomHashtags,
      (tags: string[]) => storeSetCustomHashtags(tags)
    ),
    [uiCustomHashtags]
  );

  const handleHashtagRemove = useCallback(
    createHashtagRemoveHandler(uiCustomHashtags, (tags: string[]) =>
      storeSetCustomHashtags(tags)
    ),
    [uiCustomHashtags]
  );

  // Intelligent prefetch system with buffer integration
  const handlePrefetch = useCallback(
    (newIndex: number, totalNotes: number) => {
      // Get buffer information for intelligent prefetching
      let integratedBufferInfo = null;
      try {
        const stored = sessionStorage.getItem("integratedBufferInfo");
        if (stored) {
          integratedBufferInfo = JSON.parse(stored);
        }
      } catch {}

      // Use integrated buffer info to make smarter prefetch decisions
      if (integratedBufferInfo?.loadingHints) {
        const { recommendedPrefetchDirection, nextOptimizationThreshold } =
          integratedBufferInfo.loadingHints;

        // Check if we should prefetch based on buffer optimization threshold
        if (newIndex >= nextOptimizationThreshold - 10) {

          // Prefetch in the recommended direction
          if (
            recommendedPrefetchDirection === "forward" &&
            feedQuery.query.hasNextPage &&
            !feedQuery.query.isFetchingNextPage
          ) {
            feedQuery.query.fetchNextPage().catch((error: any) => {
              console.warn("[NostrFeed] Intelligent prefetch failed:", error);
            });
          }
        }
      } else {
        // Fall back to legacy prefetch handler
        const legacyPrefetch = createPrefetchHandler(
          operations.getPageSize,
          state.hasMorePages,
          state.isFetchingPage,
          () => feedQuery.query.fetchNextPage()
        );
        legacyPrefetch(newIndex, totalNotes);
      }
    },
    [operations, state.hasMorePages, state.isFetchingPage, feedQuery.query]
  );

  // Helpers for Note route header actions
  const getHexNoteIdFromPath = useCallback((): string | null => {
    try {
      const path = window.location.pathname || "";
      if (!path.startsWith("/note/")) return null;
      const bech32 = path.slice("/note/".length);
      if (!bech32) return null;
      try {
        const decoded = nip19.decode(bech32);
        if (decoded.type === "note" && typeof decoded.data === "string") {
          return decoded.data;
        } else if (decoded.type === "nevent") {
          const data: any = decoded.data as any;
          if (typeof data?.id === "string") return data.id;
        }
      } catch {}
      return null;
    } catch {
      return null;
    }
  }, []);

  const handleShareCurrent = useCallback(() => {
    try {
      const url = window.location.href;
      if ((navigator as any)?.share) {
        (navigator as any).share({ title: "Nostr Note", url }).catch(() => {});
      } else if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(url).catch(() => {});
      }
    } catch {}
  }, []);

  return {
    handleAsciiRendered,
    handleMediaLoadError,
    handleHashtagClick,
    handleHashtagRemove,
    handlePrefetch,
    getHexNoteIdFromPath,
    handleShareCurrent,
  };
};
