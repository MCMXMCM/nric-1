import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation } from "@tanstack/react-router";

/**
 * Build a stable storage key for a scroll container.
 * We scope by pathname so each route gets its own persisted position.
 */
const buildStorageKey = (id: string, pathname: string) =>
  `scroll-pos:${pathname}:${id}`;

export interface UseScrollRestorationOptions {
  /**
   * Debounce interval in ms for saving scroll position. Defaults to 100ms.
   */
  saveDebounceMs?: number;
  /**
   * When false, the hook is disabled (no save/restore).
   */
  enabled?: boolean;
}

/**
 * Track and restore scroll position for an overflowing container.
 * - Restores on mount (layout effect) to avoid visual flash.
 * - Saves on scroll with a debounced handler.
 */
export function useScrollRestoration<T extends HTMLElement>(
  ref: { current: T | null },
  id: string,
  options?: UseScrollRestorationOptions
) {
  const { pathname } = useLocation();
  const debounceMs = options?.saveDebounceMs ?? 100;
  const enabled = options?.enabled ?? true;
  const debounceTimerRef = useRef<number | null>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const savedRef = useRef<{ scrollTop?: number; scrollLeft?: number } | null>(
    null
  );
  const restoredRef = useRef(false);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const mutationObserverRef = useRef<MutationObserver | null>(null);
  const saveDisabledUntilRef = useRef<number>(0);
  const reapplyTimerRef = useRef<number | null>(null);
  const restoredOnceRef = useRef(false);

  const resolveScrollableTarget = (element: HTMLElement | null): HTMLElement | null => {
    let node: HTMLElement | null = element;
    while (node && node !== document.body) {
      try {
        const style = window.getComputedStyle(node);
        const overflowY = style.overflowY;
        const canScroll =
          (overflowY === "auto" || overflowY === "scroll") &&
          node.scrollHeight > node.clientHeight;
        if (canScroll) return node;
      } catch {}
      node = node.parentElement;
    }
    return null;
  };

  // Restore on mount
  useLayoutEffect(() => {
    if (!enabled) return;
    const canApply = (el: HTMLElement, saved: { scrollTop?: number; scrollLeft?: number }) => {
      const maxY = Math.max(0, el.scrollHeight - el.clientHeight);
      return typeof saved.scrollTop === "number" && saved.scrollTop <= maxY + 1; // allow 1px tolerance
    };

    const applyIfPossible = (el: HTMLElement) => {
      const saved = savedRef.current;
      if (!saved) return false;
      if (canApply(el, saved)) {
        if (typeof saved.scrollTop === "number") el.scrollTop = saved.scrollTop;
        if (typeof saved.scrollLeft === "number") el.scrollLeft = saved.scrollLeft;
        restoredRef.current = true;
        return true;
      }
      return false;
    };

    const restoreFromStorage = (el: HTMLElement | null) => {
      if (!el) return;
      const key = buildStorageKey(id, pathname);
      try {
        const raw = sessionStorage.getItem(key);
        if (!raw) return;
        const parsed = JSON.parse(raw) as {
          scrollTop?: number;
          scrollLeft?: number;
        };
        savedRef.current = parsed;
        // Temporarily disable smooth scrolling and overflow anchoring during restore
        const prevScrollBehavior = (el.style as any).scrollBehavior || "";
        const prevOverflowAnchor = el.style.getPropertyValue("overflow-anchor") || "auto";
        try {
          el.style.setProperty("scroll-behavior", "auto", "important");
          el.style.setProperty("overflow-anchor", "none");
        } catch {}
        // Apply immediately (browser clamps if needed), and suppress saving briefly
        if (typeof parsed.scrollTop === "number") el.scrollTop = parsed.scrollTop;
        if (typeof parsed.scrollLeft === "number") el.scrollLeft = parsed.scrollLeft;
        // Restore style on next frame
        try {
          requestAnimationFrame(() => {
            try {
              if (prevScrollBehavior) el.style.setProperty("scroll-behavior", prevScrollBehavior);
              else el.style.removeProperty("scroll-behavior");
              if (prevOverflowAnchor) el.style.setProperty("overflow-anchor", prevOverflowAnchor);
              else el.style.removeProperty("overflow-anchor");
            } catch {}
          });
        } catch {}
        saveDisabledUntilRef.current = Date.now() + 1000;
      } catch {}
      queueMicrotask(() => {
        try {
          const raw2 = sessionStorage.getItem(key);
          if (!raw2) return;
          const parsed2 = JSON.parse(raw2) as {
            scrollTop?: number;
            scrollLeft?: number;
          };
          if (typeof parsed2.scrollTop === "number") el.scrollTop = parsed2.scrollTop;
          if (typeof parsed2.scrollLeft === "number") el.scrollLeft = parsed2.scrollLeft;
          // Only mark restored if target can actually hold the saved position
          const saved = savedRef.current || parsed2;
          if (canApply(el, saved)) {
            restoredRef.current = true;
            restoredOnceRef.current = true;
          }
        } catch {}
      });
      // Try again on next frame
      try {
        requestAnimationFrame(() => {
          if (!restoredRef.current) {
            const t = targetRef.current;
            if (t) applyIfPossible(t);
          }
        });
      } catch {}
      // Start a short periodic re-apply loop to handle content growth that doesn't resize client box
      if (reapplyTimerRef.current !== null) {
        window.clearInterval(reapplyTimerRef.current);
        reapplyTimerRef.current = null;
      }
      let attempts = 0;
      reapplyTimerRef.current = window.setInterval(() => {
        attempts += 1;
        const t = targetRef.current;
        if (!t || !savedRef.current) return;
        if (applyIfPossible(t) || attempts >= 30) {
          if (reapplyTimerRef.current !== null) {
            window.clearInterval(reapplyTimerRef.current);
            reapplyTimerRef.current = null;
          }
        }
      }, 100);
    };

    // Resolve immediately
    const immediate = resolveScrollableTarget(ref.current) || (ref.current as unknown as HTMLElement | null);
    targetRef.current = immediate;
    restoreFromStorage(immediate);

    // If not scrollable yet, poll briefly to catch post-mount layout changes
    if (!immediate) {
      let attempts = 0;
      pollTimerRef.current = window.setInterval(() => {
        attempts += 1;
        const candidate = resolveScrollableTarget(ref.current) || (ref.current as unknown as HTMLElement | null);
        if (candidate) {
          targetRef.current = candidate;
          restoreFromStorage(candidate);
          if (pollTimerRef.current !== null) {
            window.clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }
        } else if (attempts >= 20) {
          if (pollTimerRef.current !== null) {
            window.clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }
        }
      }, 100);
    }

    // Observe for size/content changes to re-apply if content grows later
    const el = targetRef.current;
    if (el && typeof ResizeObserver !== "undefined") {
      resizeObserverRef.current = new ResizeObserver(() => {
        if (restoredRef.current) return;
        applyIfPossible(el);
      });
      try {
        resizeObserverRef.current.observe(el);
      } catch {}
    } else if (el) {
      try {
        mutationObserverRef.current = new MutationObserver(() => {
          if (restoredRef.current) return;
          applyIfPossible(el);
        });
        mutationObserverRef.current.observe(el, { childList: true, subtree: true });
      } catch {}
    }

    return () => {
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      if (reapplyTimerRef.current !== null) {
        window.clearInterval(reapplyTimerRef.current);
        reapplyTimerRef.current = null;
      }
      if (resizeObserverRef.current && targetRef.current) {
        try {
          resizeObserverRef.current.unobserve(targetRef.current);
        } catch {}
      }
      resizeObserverRef.current = null;
      if (mutationObserverRef.current) {
        try {
          mutationObserverRef.current.disconnect();
        } catch {}
      }
      mutationObserverRef.current = null;
      // Clean any temporary style changes if restore never succeeded
      const t = targetRef.current;
      if (t && !restoredOnceRef.current) {
        try {
          t.style.removeProperty("scroll-behavior");
          t.style.removeProperty("overflow-anchor");
        } catch {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, pathname, enabled]);

  // Save on scroll
  useEffect(() => {
    if (!enabled) return;
    let element = resolveScrollableTarget(ref.current) || (ref.current as unknown as HTMLElement | null);
    targetRef.current = element;
    if (!element) return;

    const key = buildStorageKey(id, pathname);

    const saveNow = () => {
      try {
        sessionStorage.setItem(
          key,
          JSON.stringify({
            scrollTop: element.scrollTop,
            scrollLeft: element.scrollLeft,
          })
        );
      } catch {
        // ignore storage errors
      }
    };

    const onScroll = () => {
      if (Date.now() < saveDisabledUntilRef.current) {
        return;
      }
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = window.setTimeout(saveNow, debounceMs);
    };

    // Block saving briefly when user clicks (likely navigation) to avoid clamped writes
    const onClickCapture = () => {
      try {
        saveDisabledUntilRef.current = Date.now() + 1500;
      } catch {}
    };

    element.addEventListener("scroll", onScroll, { passive: true });
    element.addEventListener("click", onClickCapture, true);

    // Save once on unmount in case the last movement didn't trigger due to debounce
    return () => {
      element.removeEventListener("scroll", onScroll as EventListener);
      element.removeEventListener("click", onClickCapture, true);
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
        // If a save is pending and not suppressed, flush it before unmount
        if (Date.now() >= saveDisabledUntilRef.current) {
          saveNow();
        }
      }
      // Otherwise, skip unmount save to avoid writing clamped values during navigation
    };
  }, [ref, id, pathname, debounceMs, enabled]);
}

export default useScrollRestoration;


