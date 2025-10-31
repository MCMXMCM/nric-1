import { useState, useEffect, useRef, useCallback } from 'react';

interface UseScrollDetectionOptions {
  threshold?: number;
  debounceMs?: number;
  enabled?: boolean;
  scrollElementRef?: React.RefObject<HTMLElement>;
}

/**
 * Hook to detect when user is actively scrolling
 * Returns a boolean indicating if the user is currently scrolling
 */
export function useScrollDetection(options: UseScrollDetectionOptions = {}) {
  const {
    threshold = 5, // Minimum scroll distance to consider as "scrolling"
    debounceMs = 150, // How long to wait after scroll stops before setting isScrolling to false
    enabled = true,
    scrollElementRef
  } = options;

  const [isScrolling, setIsScrolling] = useState(false);
  const lastScrollY = useRef(0);
  const scrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isScrollingRef = useRef(false);

  const handleScroll = useCallback(() => {
    if (!enabled) return;

    // Use the provided scroll element or fall back to window
    const scrollElement = scrollElementRef?.current;
    const currentScrollY = scrollElement ? scrollElement.scrollTop : window.scrollY;
    const scrollDifference = Math.abs(currentScrollY - lastScrollY.current);

    // Clear any existing timeout
    if (scrollTimeout.current) {
      clearTimeout(scrollTimeout.current);
    }

    // If user has scrolled more than threshold, mark as scrolling
    if (scrollDifference > threshold && !isScrollingRef.current) {
      isScrollingRef.current = true;
      setIsScrolling(true);
    }

    // Set up timeout to stop scrolling state after user stops
    scrollTimeout.current = setTimeout(() => {
      isScrollingRef.current = false;
      setIsScrolling(false);
    }, debounceMs);

    lastScrollY.current = currentScrollY;
  }, [enabled, threshold, debounceMs, scrollElementRef]);

  useEffect(() => {
    if (!enabled) return;

    // Use the provided scroll element or fall back to window
    const scrollElement = scrollElementRef?.current;
    const targetElement = scrollElement || window;
    
    // Initialize last scroll position
    lastScrollY.current = scrollElement ? scrollElement.scrollTop : window.scrollY;

    targetElement.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      targetElement.removeEventListener('scroll', handleScroll);
      if (scrollTimeout.current) {
        clearTimeout(scrollTimeout.current);
      }
    };
  }, [enabled, handleScroll, scrollElementRef]);

  return isScrolling;
}
