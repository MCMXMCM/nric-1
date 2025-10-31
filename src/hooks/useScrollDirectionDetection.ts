import { useEffect, useRef, useCallback } from 'react';

export interface ScrollDirectionDetectionOptions {
  threshold?: number; // Minimum scroll distance to trigger
  onScrollUp?: () => void;
  onScrollDown?: () => void;
  enabled?: boolean;
}

/**
 * Hook to detect scroll direction and trigger callbacks
 * Useful for auto-clearing new notes buffer when user scrolls up
 */
export function useScrollDirectionDetection(options: ScrollDirectionDetectionOptions) {
  const {
    threshold = 50,
    onScrollUp,
    onScrollDown,
    enabled = true
  } = options;

  const lastScrollY = useRef(0);
  const scrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleScroll = useCallback(() => {
    if (!enabled) return;

    const currentScrollY = window.scrollY;
    const scrollDifference = currentScrollY - lastScrollY.current;

    // Clear any existing timeout
    if (scrollTimeout.current) {
      clearTimeout(scrollTimeout.current);
    }

    // Debounce scroll events
    scrollTimeout.current = setTimeout(() => {
      if (Math.abs(scrollDifference) > threshold) {
        if (scrollDifference < 0 && onScrollUp) {
          // User scrolled up
          onScrollUp();
        } else if (scrollDifference > 0 && onScrollDown) {
          // User scrolled down
          onScrollDown();
        }
      }
      
      lastScrollY.current = currentScrollY;
    }, 100); // 100ms debounce
  }, [enabled, threshold, onScrollUp, onScrollDown]);

  useEffect(() => {
    if (!enabled) return;

    // Initialize last scroll position
    lastScrollY.current = window.scrollY;

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimeout.current) {
        clearTimeout(scrollTimeout.current);
      }
    };
  }, [enabled, handleScroll]);

  return {
    currentScrollY: lastScrollY.current
  };
}
