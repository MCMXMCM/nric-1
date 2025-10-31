import { useEffect, useRef, useState } from 'react';

interface UseIntersectionObserverOptions {
  threshold?: number | number[];
  rootMargin?: string;
  root?: Element | null;
  enabled?: boolean;
}

/**
 * Enhanced Intersection Observer hook that's scroll restoration aware
 */
export function useIntersectionObserver(
  options: UseIntersectionObserverOptions = {}
) {
  const {
    threshold = 0.1,
    rootMargin = '50px',
    root = null,
    enabled = true,
  } = options;

  const [entries, setEntries] = useState<Map<Element, IntersectionObserverEntry>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const elementsRef = useRef<Set<Element>>(new Set());

  // Check if scroll restoration is active to pause observation
  const isScrollRestoring = () => {
    try {
      return sessionStorage.getItem("virtualScrollRestorationLock") === "true";
    } catch {
      return false;
    }
  };

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !window.IntersectionObserver) {
      return;
    }

    // Create intersection observer with scroll restoration awareness
    observerRef.current = new IntersectionObserver(
      (observerEntries) => {
        // During scroll restoration, delay intersection updates to prevent interference
        if (isScrollRestoring()) {
          // Queue updates for after scroll restoration completes
          setTimeout(() => {
            if (!isScrollRestoring()) {
              setEntries(prev => {
                const newEntries = new Map(prev);
                observerEntries.forEach(entry => {
                  newEntries.set(entry.target, entry);
                });
                return newEntries;
              });
            }
          }, 300); // Wait for scroll restoration to complete
          return;
        }

        // Normal intersection handling
        setEntries(prev => {
          const newEntries = new Map(prev);
          observerEntries.forEach(entry => {
            newEntries.set(entry.target, entry);
          });
          return newEntries;
        });
      },
      {
        threshold,
        rootMargin,
        root,
      }
    );

    // Re-observe all elements with new observer
    elementsRef.current.forEach(element => {
      observerRef.current?.observe(element);
    });

    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, [threshold, rootMargin, root, enabled]);

  const observe = (element: Element) => {
    if (!element || !observerRef.current) return;

    elementsRef.current.add(element);
    observerRef.current.observe(element);
  };

  const unobserve = (element: Element) => {
    if (!element || !observerRef.current) return;

    elementsRef.current.delete(element);
    observerRef.current.unobserve(element);
    setEntries(prev => {
      const newEntries = new Map(prev);
      newEntries.delete(element);
      return newEntries;
    });
  };

  const disconnect = () => {
    observerRef.current?.disconnect();
    elementsRef.current.clear();
    setEntries(new Map());
  };

  return {
    entries,
    observe,
    unobserve,
    disconnect,
    // Utility function to check if element is intersecting
    isIntersecting: (element: Element) => entries.get(element)?.isIntersecting ?? false,
  };
}

/**
 * Hook for lazy loading media with scroll restoration awareness
 */
export function useLazyMediaLoading(
  threshold: number = 0.1,
  rootMargin: string = '100px'
) {
  const { entries, observe, unobserve, isIntersecting } = useIntersectionObserver({
    threshold,
    rootMargin,
    enabled: true,
  });

  const [loadedElements] = useState<Set<Element>>(new Set());

  const shouldLoad = (element: Element): boolean => {
    // If already loaded, return true
    if (loadedElements.has(element)) {
      return true;
    }

    // During scroll restoration, don't trigger new loads to prevent layout shifts
    if (sessionStorage.getItem("virtualScrollRestorationLock") === "true") {
      return false;
    }

    // Check if element is intersecting
    return isIntersecting(element);
  };

  const markAsLoaded = (element: Element) => {
    loadedElements.add(element);
  };

  return {
    observe,
    unobserve,
    shouldLoad,
    markAsLoaded,
    isIntersecting,
    entries,
  };
}
