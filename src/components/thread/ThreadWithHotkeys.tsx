import React, { useEffect, useRef, useState } from "react";
import { HotkeyProvider, useHotkeyContext } from "../../contexts/HotkeyContext";
import { ThreadHotkeyManager } from "./ThreadHotkeyManager";
import { ShortcutHelp } from "../hotkeys/ShortcutHelp";

interface ThreadWithHotkeysProps {
  children: React.ReactNode;
  totalItems: number;
  enabled?: boolean;
  isLoadingComments?: boolean;
  onNavigateUp?: () => void;
  onNavigateDown?: () => void;
  onNavigateFirst?: () => void;
  onNavigateLast?: () => void;
  onLink?: () => void;
  onReply?: () => void;
  onLike?: () => void;
  onBookmark?: () => void;
  onCollapse?: () => void;
  onFocusThread?: () => void;
  onScrollToParent?: () => void;
  onBackToFeed?: () => void;
  onHelpToggle?: () => void;
  onEscape?: () => void;
}

const FocusStyleUpdater: React.FC = () => {
  const { focusState } = useHotkeyContext();
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (focusState.focusedIndex < 0 || !focusState.isKeyboardNavigationActive) {
      return;
    }

    const applyFocus = () => {
      const candidates = document.querySelectorAll(
        `[data-index="${focusState.focusedIndex}"][data-note-id]`
      );
      let focused: Element | null = null;
      for (const c of Array.from(candidates)) {
        const el = c as HTMLElement;
        const rect = el.getBoundingClientRect();
        if (rect.height > 0 && rect.width > 0 && el.offsetParent !== null) {
          focused = el;
          break;
        }
      }
      if (!focused) {
        // Clear any existing retry timeout
        if (retryTimeoutRef.current) {
          clearTimeout(retryTimeoutRef.current);
        }

        // Retry for a few frames until the element is in the DOM and visible
        const tryApply = (attemptsLeft: number) => {
          if (attemptsLeft <= 0) return;

          retryTimeoutRef.current = setTimeout(() => {
            const retry = document.querySelector(
              `[data-index="${focusState.focusedIndex}"][data-note-id]`
            ) as HTMLElement | null;
            if (!retry) {
              tryApply(attemptsLeft - 1);
              return;
            }
            // Clear previous AFTER we found a new target
            document.querySelectorAll("[data-note-id]").forEach((el) => {
              el.classList.remove("focused", "focus-visible");
              (el as HTMLElement).style.border = "";
              (el as HTMLElement).style.outline = "";
            });
            retry.classList.add("focused");
            if (document.hasFocus()) retry.classList.add("focus-visible");
            const computed = window.getComputedStyle(retry);
            const borderColor =
              computed.getPropertyValue("--border-color").trim() || "#666";
            retry.style.border = `2px dotted ${borderColor}`;
            retry.style.outline = "none";
            retry.scrollIntoView({
              block: "nearest",
              behavior: "instant" as any,
            });
          }, 50); // Small delay between retries
        };
        tryApply(8); // Increased retry attempts
        return;
      }
      // Clear previous AFTER we found a new target
      document.querySelectorAll("[data-note-id]").forEach((el) => {
        el.classList.remove("focused", "focus-visible");
        (el as HTMLElement).style.border = "";
        (el as HTMLElement).style.outline = "";
      });
      focused.classList.add("focused");
      if (document.hasFocus()) focused.classList.add("focus-visible");
      const computed = window.getComputedStyle(focused);
      const borderColor =
        computed.getPropertyValue("--border-color").trim() || "#666";
      (focused as HTMLElement).style.border = `2px dotted ${borderColor}`;
      (focused as HTMLElement).style.outline = "none";
      (focused as HTMLElement).scrollIntoView({
        block: "nearest",
        behavior: "instant" as any,
      });
    };

    applyFocus();
  }, [focusState.focusedIndex, focusState.isKeyboardNavigationActive]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  return null;
};

const InitFocusOnMount: React.FC<{ 
  enabled: boolean; 
  totalItems: number; 
  isLoadingComments: boolean;
}> = ({
  enabled,
  totalItems,
  isLoadingComments,
}) => {
  const { focusState, activateKeyboardNavigation, setFocusedIndex } =
    useHotkeyContext();
  const didInitRef = useRef(false);
  const lastTotalItemsRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    // Avoid stealing focus if user is typing in an input/textarea/select or in a dialog
    const active = document.activeElement as HTMLElement | null;
    const tag = active?.tagName?.toLowerCase();
    const isTypingTarget = tag && ["input", "textarea", "select"].includes(tag);
    const inDialog = !!active?.closest('[role="dialog"]');
    if (isTypingTarget || inDialog) return;

    // Only initialize focus when:
    // 1. Comments are not loading
    // 2. We have items to focus on
    // 3. We haven't initialized yet OR totalItems increased from 0 to positive
    const shouldInitialize = !isLoadingComments && 
      totalItems > 0 && 
      (!didInitRef.current || (lastTotalItemsRef.current === 0 && totalItems > 0));

    if (shouldInitialize) {
      // Small delay to ensure DOM is fully rendered
      const timeoutId = setTimeout(() => {
        requestAnimationFrame(() => {
          activateKeyboardNavigation();
          setFocusedIndex(0);
          didInitRef.current = true;
          lastTotalItemsRef.current = totalItems;
        });
      }, 100);

      return () => clearTimeout(timeoutId);
    }

    // Update lastTotalItemsRef to track changes
    lastTotalItemsRef.current = totalItems;
  }, [
    enabled,
    totalItems,
    isLoadingComments,
    focusState.focusedIndex,
    activateKeyboardNavigation,
    setFocusedIndex,
  ]);

  return null;
};

const KeyboardNavigationActivator: React.FC<{
  enabled: boolean;
  totalItems: number;
}> = ({ enabled, totalItems }) => {
  const { focusState, activateKeyboardNavigation, setFocusedIndex } = useHotkeyContext();
  const lastTotalItemsRef = useRef(totalItems);

  // Re-activate keyboard navigation when totalItems changes (new comments loaded)
  useEffect(() => {
    if (enabled && totalItems > 0 && totalItems !== lastTotalItemsRef.current) {
      // If keyboard navigation is not active but we have items, activate it
      if (!focusState.isKeyboardNavigationActive) {
        // Small delay to ensure DOM is updated
        setTimeout(() => {
          activateKeyboardNavigation();
          // Also set focus to first item if no item is currently focused
          if (focusState.focusedIndex < 0) {
            setFocusedIndex(0);
          }
        }, 100);
      }
      lastTotalItemsRef.current = totalItems;
    }
  }, [
    enabled,
    totalItems,
    focusState.isKeyboardNavigationActive,
    focusState.focusedIndex,
    activateKeyboardNavigation,
    setFocusedIndex,
  ]);

  return null;
};

export const ThreadWithHotkeys: React.FC<ThreadWithHotkeysProps> = ({
  children,
  totalItems,
  enabled = true,
  isLoadingComments = false,
  onNavigateUp,
  onNavigateDown,
  onNavigateFirst,
  onNavigateLast,
  onLink,
  onReply,
  onLike,
  onBookmark,
  onCollapse,
  onFocusThread,
  onScrollToParent,
  onBackToFeed,
  onHelpToggle,
  onEscape,
}) => {
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);

  // Thread-specific shortcut definitions
  const navigationShortcuts = [
    { key: "↑ / k", description: "Previous note" },
    { key: "↓ / j", description: "Next note" },
    { key: "Home", description: "First note" },
    { key: "End", description: "Last note" },
  ];

  const actionShortcuts = [
    { key: "l", description: "Copy link" },
    { key: "r", description: "Reply" },
    { key: "z", description: "Like" },
    { key: "B", description: "Bookmark" },
    { key: "c", description: "Collapse/Expand" },
    { key: "f", description: "Focus thread" },
    { key: "p", description: "Scroll to parent" },
    { key: "b", description: "Back to feed" },
  ];

  const globalShortcuts = [
    { key: "Shift + ?", description: "Toggle help menu" },
    { key: "Esc", description: "Close modal / Clear focus" },
  ];

  const handleHelpToggle = () => {
    setShowShortcutHelp(true);
    onHelpToggle?.();
  };

  const handleEscape = () => {
    setShowShortcutHelp(false);
    onEscape?.();
  };
  return (
    <HotkeyProvider totalItems={totalItems} enabled={enabled}>
      <ThreadHotkeyManager
        onNavigateUp={onNavigateUp}
        onNavigateDown={onNavigateDown}
        onNavigateFirst={onNavigateFirst}
        onNavigateLast={onNavigateLast}
        hasNotes={totalItems > 0}
        enabled={enabled}
        onLink={onLink}
        onReply={onReply}
        onLike={onLike}
        onBookmark={onBookmark}
        onCollapse={onCollapse}
        onFocusThread={onFocusThread}
        onScrollToParent={onScrollToParent}
        onBackToFeed={onBackToFeed}
        onHelpToggle={handleHelpToggle}
        onEscape={handleEscape}
      />
      <InitFocusOnMount enabled={enabled} totalItems={totalItems} isLoadingComments={isLoadingComments} />
      <KeyboardNavigationActivator enabled={enabled} totalItems={totalItems} />
      <FocusStyleUpdater />
      {children}

      {/* Shortcut Help Modal */}
      <ShortcutHelp
        isOpen={showShortcutHelp}
        onClose={() => setShowShortcutHelp(false)}
        shortcuts={{
          navigation: navigationShortcuts,
          actions: actionShortcuts,
          global: globalShortcuts,
        }}
      />
    </HotkeyProvider>
  );
};
