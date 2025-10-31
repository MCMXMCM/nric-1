import React, { useState, useCallback, useEffect, useRef } from "react";
import { HotkeyProvider, useHotkeyContext } from "../../contexts/HotkeyContext";
import { ShortcutHelp } from "../hotkeys/ShortcutHelp";
import { FeedHotkeyManager } from "./FeedHotkeyManager";
import type { HotkeyAction } from "../../types/hotkeys";

interface FeedWithHotkeysProps {
  children: React.ReactNode;
  notes: any[];
  virtualizer?: any; // TanStack Virtualizer instance
  onNavigateUp?: () => void;
  onNavigateDown?: () => void;
  onNavigateFirst?: () => void;
  onNavigateLast?: () => void;
  onNavigatePageUp?: () => void;
  onNavigatePageDown?: () => void;
  onLink?: () => void;
  onThread?: () => void;
  onRepost?: () => void;
  onZap?: () => void;
  onReply?: () => void;
  onLike?: () => void;
  onBookmark?: () => void;
  onProfile?: () => void;
  onOpenNote?: () => void;
  onParentThread?: () => void;
  onRootThread?: () => void;
  onToggleMedia?: () => void;
  isModalOpen?: boolean;
  enabled?: boolean;
}

export const FeedWithHotkeys: React.FC<FeedWithHotkeysProps> = ({
  children,
  notes,
  virtualizer,
  onNavigateUp,
  onNavigateDown,
  onNavigateFirst,
  onNavigateLast,
  onNavigatePageUp,
  onNavigatePageDown,
  onLink,
  onThread,
  onRepost,
  onZap,
  onReply,
  onLike,
  onBookmark,
  onProfile,
  onOpenNote,
  onParentThread,
  onRootThread,
  onToggleMedia,
  isModalOpen = false,
  enabled = true,
}) => {
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  // Fallback: pick up virtualizer instance published by the feed when available
  const [externalVirtualizer, setExternalVirtualizer] = useState<any>(null);
  useEffect(() => {
    const v = (window as any).__mainFeedVirtualizer;
    if (v) setExternalVirtualizer(v);
  }, []);

  // Internal component to persist/restore focused index across route navigations
  const FocusPersistor: React.FC<{ notes: any[]; enabled: boolean }> = ({
    notes,
    enabled,
  }) => {
    const { focusState, setFocusedIndex, activateKeyboardNavigation } =
      useHotkeyContext();

    // Persist focused index before route changes initiated by hotkeys
    useEffect(() => {
      if (!enabled) return;

      try {
        const state = {
          index: focusState.focusedIndex,
          timestamp: Date.now(),
        };
        sessionStorage.setItem("feed:lastFocusedIndex", JSON.stringify(state));
      } catch {}
    }, [enabled, focusState.focusedIndex]);

    // Restore focused index on mount if router indicates return from note/thread/profile or scroll restoration marked
    useEffect(() => {
      if (!enabled || notes.length === 0) return;

      // Detect return via history.state flags set elsewhere
      let isReturning = false;
      try {
        const hist = window.history.state as any;
        isReturning = Boolean(
          hist?.fromNote ||
            hist?.fromThread ||
            hist?.fromProfile ||
            hist?.fromFeed ||
            hist?.scrollRestored
        );
      } catch {}

      if (!isReturning) return;

      try {
        const raw = sessionStorage.getItem("feed:lastFocusedIndex");
        if (!raw) return;
        const saved = JSON.parse(raw) as { index: number; timestamp: number };
        if (typeof saved.index !== "number" || saved.index < 0) return;
        // Clamp to available notes
        const clamped = Math.max(0, Math.min(saved.index, notes.length - 1));

        // Initialize keyboard nav and apply focus on next frame to ensure DOM is ready
        requestAnimationFrame(() => {
          activateKeyboardNavigation();
          setFocusedIndex(clamped);
        });
      } catch {}
    }, [enabled, notes.length, activateKeyboardNavigation, setFocusedIndex]);

    return null;
  };

  // Update focus styles for notes using hotkey system focus state
  const FocusStyleUpdater: React.FC = () => {
    const { focusState } = useHotkeyContext();

    useEffect(() => {
      if (!enabled) return;

      const updateFocusStyles = () => {
        // Remove focus from ALL elements with data-index (more comprehensive clearing)
        document.querySelectorAll("[data-index]").forEach((element) => {
          element.classList.remove("focused", "focus-visible");
          // Clear any inline border styles
          (element as HTMLElement).style.border = "";
          (element as HTMLElement).style.outline = "";
        });

        // Only add focus if keyboard navigation is active and a note is focused
        if (
          focusState.isKeyboardNavigationActive &&
          focusState.focusedIndex >= 0
        ) {
          // Get ALL elements with this index and apply focus to the FIRST visible one only
          const candidates = document.querySelectorAll(
            `[data-index="${focusState.focusedIndex}"]`
          );

          // Find the first visible element (not hidden or display:none)
          let focusedElement: Element | null = null;
          for (const candidate of Array.from(candidates)) {
            const htmlEl = candidate as HTMLElement;
            const rect = htmlEl.getBoundingClientRect();
            // Check if element is visible and has dimensions
            if (
              rect.height > 0 &&
              rect.width > 0 &&
              htmlEl.offsetParent !== null
            ) {
              focusedElement = candidate;
              break;
            }
          }

          if (focusedElement) {
            focusedElement.classList.add("focused");
            if (document.hasFocus()) {
              focusedElement.classList.add("focus-visible");
            }

            // Apply dotted border directly via inline styles (like the working blue border)
            const computedStyle = window.getComputedStyle(focusedElement);
            const borderColor =
              computedStyle.getPropertyValue("--border-color").trim() || "#666";
            (focusedElement as HTMLElement).style.border =
              `2px dotted ${borderColor}`;
            (focusedElement as HTMLElement).style.outline = "none";
          }
        }
      };

      updateFocusStyles();
    }, [
      focusState.focusedIndex,
      focusState.isKeyboardNavigationActive,
      enabled,
      notes.length,
    ]);

    return null;
  };

  // Component to sync virtualizer scrolling with hotkey system focus state
  const VirtualizerSync: React.FC<{ virtualizer: any }> = ({ virtualizer }) => {
    const { focusState, deactivateKeyboardNavigation } = useHotkeyContext();
    const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastScrollTimeRef = useRef<number>(0);
    const isProgrammaticScrollRef = useRef<boolean>(false);
    const lastScrollPositionRef = useRef<number>(0);

    // Handle scroll events to detect user scrolling and break out of keyboard navigation
    useEffect(() => {
      if (!enabled) return;

      let scrollElement: HTMLElement | null = null;

      const vInstance = virtualizer || externalVirtualizer;
      if (vInstance) {
        // Try to get scroll element from virtualizer
        scrollElement =
          vInstance.scrollElement || vInstance.options?.scrollElement;
      }

      // If no virtualizer or no scroll element from virtualizer, find it from DOM
      if (!scrollElement) {
        // Look for common scroll container patterns
        scrollElement =
          document.querySelector("[data-scroll-element]") ||
          document.querySelector(".notes-container") ||
          document.querySelector('[style*="overflow"]') ||
          document.querySelector("main") ||
          document.body;
      }

      if (!scrollElement) return;

      const handleScroll = () => {
        // Skip if this is a programmatic scroll from keyboard navigation
        if (isProgrammaticScrollRef.current) {
          isProgrammaticScrollRef.current = false;
          return;
        }

        // Skip if scroll restoration is active to prevent conflicts
        try {
          const isScrollRestoring =
            sessionStorage.getItem("virtualScrollRestorationLock") === "true";
          if (isScrollRestoring) {
            console.log(
              "🔄 Scroll restoration active, skipping focus deactivation"
            );
            return;
          }
        } catch {}

        // If user manually scrolled and keyboard navigation is active, deactivate it
        if (focusState.isKeyboardNavigationActive) {
          const now = Date.now();
          const timeSinceLastKeyboardNav =
            now - focusState.lastKeyboardNavigationTime;

          // Only deactivate if enough time has passed since last keyboard navigation
          // Increased delay to prevent deactivating during rapid j/k presses
          // Also check if this is a significant user scroll (not just drift correction)
          const scrollDelta = Math.abs(
            scrollElement.scrollTop - lastScrollPositionRef.current
          );
          if (timeSinceLastKeyboardNav > 200 && scrollDelta > 50) {
            console.log(
              "👆 User scroll detected, deactivating keyboard navigation"
            );
            deactivateKeyboardNavigation();
          }
        }

        // Track scroll position for delta calculation
        lastScrollPositionRef.current = scrollElement.scrollTop;
      };

      scrollElement.addEventListener("scroll", handleScroll, { passive: true });

      return () => {
        scrollElement.removeEventListener("scroll", handleScroll);
      };
    }, [
      enabled,
      virtualizer,
      focusState.isKeyboardNavigationActive,
      focusState.lastKeyboardNavigationTime,
      deactivateKeyboardNavigation,
    ]);

    useEffect(() => {
      if (
        !enabled ||
        focusState.focusedIndex < 0 ||
        !focusState.isKeyboardNavigationActive
      )
        return;

      const now = Date.now();
      const timeSinceLastScroll = now - lastScrollTimeRef.current;

      // If we have a virtualizer, use it for scrolling
      const vInstance = virtualizer || externalVirtualizer;
      if (vInstance) {
        // Throttle scroll calls to prevent excessive scrolling during rapid key presses
        // Allow immediate scrolling if enough time has passed, otherwise debounce
        if (timeSinceLastScroll > 16) {
          // ~60fps throttling
          // Clear any pending scroll operation
          if (scrollTimeoutRef.current) {
            clearTimeout(scrollTimeoutRef.current);
            scrollTimeoutRef.current = null;
          }

          // Mark this as programmatic scroll
          isProgrammaticScrollRef.current = true;

          // Use immediate scrolling for rapid navigation
          // This allows users to press j/k rapidly without blocking
          vInstance.scrollToIndex(focusState.focusedIndex, {
            align: "start",
            behavior: "instant", // Use 'instant' to prevent conflicts with scroll restoration
          });

          // No scroll adjustment needed - the container padding already provides the correct spacing

          lastScrollTimeRef.current = now;
          // Verify visibility on next frame and correct if needed using virtualizer positions
          requestAnimationFrame(() => {
            try {
              const scrollEl: HTMLElement | null =
                (vInstance.options as any)?.getScrollElement?.() || null;
              if (!scrollEl) return;
              const items = vInstance.getVirtualItems?.() || [];
              const target = items.find((it: any) => it.index === focusState.focusedIndex);
              if (!target) return;
              const containerRect = scrollEl.getBoundingClientRect();
              const el = document.querySelector(
                `[data-index="${focusState.focusedIndex}"]`
              ) as HTMLElement | null;
              if (!el) return;
              const rect = el.getBoundingClientRect();
              const outOfView = rect.top < containerRect.top + 4 || rect.bottom > containerRect.bottom - 4;
              if (outOfView) {
                isProgrammaticScrollRef.current = true;
                // Force exact alignment using virtualizer coordinates
                const targetStart = typeof target.start === "number" ? target.start : 0;
                scrollEl.scrollTop = targetStart;
              }
            } catch {}
          });
        } else {
          // Debounce rapid scroll calls
          if (scrollTimeoutRef.current) {
            clearTimeout(scrollTimeoutRef.current);
          }

          scrollTimeoutRef.current = setTimeout(() => {
            isProgrammaticScrollRef.current = true;
            vInstance.scrollToIndex(focusState.focusedIndex, {
              align: "start",
              behavior: "instant",
            });

            // No scroll adjustment needed - the container padding already provides the correct spacing

            lastScrollTimeRef.current = Date.now();
            // Verify visibility after the debounced scroll as well
            requestAnimationFrame(() => {
              try {
                const scrollEl: HTMLElement | null =
                  (vInstance.options as any)?.getScrollElement?.() || null;
                if (!scrollEl) return;
                const items = vInstance.getVirtualItems?.() || [];
                const target = items.find((it: any) => it.index === focusState.focusedIndex);
                if (!target) return;
                const containerRect = scrollEl.getBoundingClientRect();
                const el = document.querySelector(
                  `[data-index="${focusState.focusedIndex}"]`
                ) as HTMLElement | null;
                if (!el) return;
                const rect = el.getBoundingClientRect();
                const outOfView = rect.top < containerRect.top + 4 || rect.bottom > containerRect.bottom - 4;
                if (outOfView) {
                  isProgrammaticScrollRef.current = true;
                  const targetStart = typeof target.start === "number" ? target.start : 0;
                  scrollEl.scrollTop = targetStart;
                }
              } catch {}
            });
            scrollTimeoutRef.current = null;
          }, 16 - timeSinceLastScroll);
        }
      } else {
        // If no virtualizer, try to scroll to the focused note element directly
        const focusedElement = document.querySelector(
          `[data-index="${focusState.focusedIndex}"]`
        );
        if (focusedElement) {
          // Mark this as programmatic scroll
          isProgrammaticScrollRef.current = true;

          // Scroll the element into view
          focusedElement.scrollIntoView({
            behavior: "instant",
            block: "start",
            inline: "nearest",
          });

          lastScrollTimeRef.current = Date.now();
        }
      }
    }, [focusState.focusedIndex, enabled, virtualizer, externalVirtualizer]);

    // Cleanup timeout on unmount
    useEffect(() => {
      return () => {
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }
      };
    }, []);

    return null;
  };

  // Handle keyboard navigation - these will be called by the hotkey system
  const handleNavigateUp = useCallback(() => {
    onNavigateUp?.();
  }, [onNavigateUp]);

  const handleNavigateDown = useCallback(() => {
    onNavigateDown?.();
  }, [onNavigateDown]);

  const handleNavigateFirst = useCallback(() => {
    onNavigateFirst?.();
  }, [onNavigateFirst]);

  const handleNavigateLast = useCallback(() => {
    onNavigateLast?.();
  }, [onNavigateLast]);

  const handleNavigatePageUp = useCallback(() => {
    onNavigatePageUp?.();
  }, [onNavigatePageUp]);

  const handleNavigatePageDown = useCallback(() => {
    onNavigatePageDown?.();
  }, [onNavigatePageDown]);

  // Handle hotkey actions
  const handleHotkeyAction = useCallback(
    (action: HotkeyAction) => {
      switch (action) {
        case "help-toggle":
          setShowShortcutHelp((prev) => !prev);
          break;
        case "escape":
          if (showShortcutHelp) {
            setShowShortcutHelp(false);
          }
          break;
        default:
          // Other actions are handled by the individual callbacks
          break;
      }
    },
    [showShortcutHelp]
  );

  // Handle focus changes from the hotkey system
  const handleFocusChange = useCallback(() => {
    // The hotkey system now manages focus state directly
  }, []);

  // Define shortcuts for help modal
  const navigationShortcuts = [
    { key: "↑", description: "Previous note" },
    { key: "↓", description: "Next note" },
    { key: "j", description: "Next note (Vim)" },
    { key: "k", description: "Previous note (Vim)" },
    { key: "Home", description: "First note" },
    { key: "End", description: "Last note" },
    { key: "Page Up", description: "Scroll up" },
    { key: "Page Down", description: "Scroll down" },
    { key: "g + g", description: "Go to top" },
  ];

  const actionShortcuts = [
    { key: "l", description: "Copy note link" },
    { key: "t", description: "View thread" },
    { key: "r", description: "Repost note" },
    { key: "z", description: "Zap note" },
    { key: "R", description: "Reply to note" },
    { key: "L", description: "Like note" },
    { key: "B", description: "Bookmark note" },
    { key: "p", description: "Parent thread" },
    { key: "Space", description: "Toggle media" },
    { key: "Enter", description: "Open note detail" },
    { key: "P", description: "Parent thread" },
    { key: "Shift + T", description: "Root thread" },
  ];

  const globalShortcuts = [
    { key: "Shift + ?", description: "Toggle help menu" },
    { key: "Esc", description: "Close modal / Clear focus" },
  ];

  return (
    <HotkeyProvider
      totalItems={notes.length}
      initialIndex={0}
      onAction={handleHotkeyAction}
      onFocusChange={handleFocusChange}
      enabled={enabled}
    >
      {/* Persist and restore focused note across route navigation */}
      <FocusPersistor notes={notes} enabled={enabled} />
      {/* Hotkey Manager - registers all the shortcuts */}
      <FeedHotkeyManager
        onNavigateUp={handleNavigateUp}
        onNavigateDown={handleNavigateDown}
        onNavigateFirst={handleNavigateFirst}
        onNavigateLast={handleNavigateLast}
        onNavigatePageUp={handleNavigatePageUp}
        onNavigatePageDown={handleNavigatePageDown}
        onLink={onLink}
        onThread={onThread}
        onRepost={onRepost}
        onZap={onZap}
        onReply={onReply}
        onLike={onLike}
        onBookmark={onBookmark}
        onProfile={onProfile}
        onOpenNote={onOpenNote}
        onParentThread={onParentThread}
        onRootThread={onRootThread}
        onToggleMedia={onToggleMedia}
        onHelpToggle={() => setShowShortcutHelp(true)}
        onEscape={() => setShowShortcutHelp(false)}
        isModalOpen={isModalOpen}
        hasNotes={notes.length > 0}
        enabled={enabled}
      />

      {/* Focus Style Updater - updates DOM focus styles based on hotkey system state */}
      <FocusStyleUpdater />

      {/* Virtualizer Sync - syncs virtualizer scrolling with hotkey system focus state */}
      <VirtualizerSync virtualizer={virtualizer} />

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
