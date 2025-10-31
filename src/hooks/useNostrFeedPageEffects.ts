import { useEffect } from "react";
import { debounce } from "../utils/nostr/utils";

interface UseNostrFeedPageEffectsProps {
  state: any;
  operations: any;
  handlePrefetch: (newIndex: number, totalNotes: number) => void;
}

export const useNostrFeedPageEffects = ({
  state,
}: UseNostrFeedPageEffectsProps) => {
  // Keyboard navigation - REMOVED: This conflicts with the new hotkey system
  // The new hotkey system in useFeedHotkeys handles j/k navigation
  // This old handler was causing race conditions with the new system

  // Page visibility handler
  useEffect(() => {
    const handleVisibilityChange = () => {
      state.setIsPageVisible(!document.hidden);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [state]);

  // Mobile detection
  useEffect(() => {
    const handleResize = debounce(() => {
      state.setIsMobile(window.innerWidth < 640);
    }, 250);

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [state]);

  // Expose bumpDisplayIndex globally for swipe navigation in NoteContainer
  useEffect(() => {
    (window as any).__feed = {
      bumpDisplayIndex: state.bumpDisplayIndex,
    };

    return () => {
      delete (window as any).__feed;
    };
  }, [state.bumpDisplayIndex]);
};
