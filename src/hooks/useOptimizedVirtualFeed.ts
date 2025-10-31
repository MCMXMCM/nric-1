import { useRef, useEffect, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRouter } from '@tanstack/react-router';
import type { Note } from '../types/nostr/types';

interface OptimizedVirtualFeedConfig {
  notes: Note[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  parentRef: React.RefObject<HTMLDivElement>;
  estimateSize?: (index: number) => number;
  overscan?: number;
  // Navigation state preservation
  preserveScrollOnNavigation?: boolean;
  scrollRestorationKey?: string;
}

interface ScrollState {
  scrollTop: number;
  focusedIndex: number;
  timestamp: number;
}

const SCROLL_STATE_KEY = 'virtualFeedScrollState';
const SCROLL_STATE_MAX_AGE = 30 * 60 * 1000; // 30 minutes

/**
 * Optimized virtual feed hook that follows best practices for:
 * - Dynamic sizing with debounced updates
 * - Proper overscan for smooth scrolling
 * - Scroll state preservation during navigation
 * - Infinite scroll integration
 */
export function useOptimizedVirtualFeed(config: OptimizedVirtualFeedConfig) {
  const {
    notes,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    parentRef,
    estimateSize,
    overscan = 5,
    preserveScrollOnNavigation = true,
    scrollRestorationKey = 'main-feed'
  } = config;

  const router = useRouter();
  
  // Get router instance for navigation functions
  // routerInstance removed - unused variable
  const isRestoringScroll = useRef(false);
  const lastScrollTop = useRef(0);
  const scrollSaveTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Enhanced size estimation with dynamic adjustment
  const dynamicEstimateSize = useCallback((index: number) => {
    if (estimateSize) {
      return estimateSize(index);
    }

    // Default estimation based on content analysis
    const note = notes[index];
    if (!note) return 200; // Default fallback

    let estimatedHeight = 120; // Base height for note header/footer

    // Estimate content height
    const contentLines = Math.ceil(note.content.length / 60); // ~60 chars per line
    estimatedHeight += contentLines * 20; // ~20px per line

    // Add height for media
    const hasImage = note.imageUrls && note.imageUrls.length > 0;
    const hasVideo = note.videoUrls && note.videoUrls.length > 0;
    
    if (hasImage) estimatedHeight += 300; // Estimated image height
    if (hasVideo) estimatedHeight += 200; // Estimated video height

    // Add height for replies/reposts
    if (note.tags.some(tag => tag[0] === 'e')) estimatedHeight += 40; // Reply indicator
    if (note.kind === 6) estimatedHeight += 60; // Repost content

    return Math.min(Math.max(estimatedHeight, 150), 800); // Clamp between 150-800px
  }, [estimateSize, notes]);

  // Create virtualizer with optimized settings
  const virtualizer = useVirtualizer({
    count: notes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: dynamicEstimateSize,
    overscan,
    
    // Enable smooth scrolling behavior
    scrollMargin: parentRef.current?.offsetTop ?? 0,
    
    // Optimize for dynamic content
    measureElement: (element) => {
      // Skip measurements during scroll restoration to prevent jitter
      if (isRestoringScroll.current) {
        return 200; // Return default height instead of undefined
      }
      
      return element.getBoundingClientRect().height;
    },
  });

  // Save scroll state for navigation preservation
  const saveScrollState = useCallback(() => {
    if (!preserveScrollOnNavigation || !parentRef.current) return;

    const scrollTop = parentRef.current.scrollTop;
    const virtualItems = virtualizer.getVirtualItems();
    const focusedIndex = virtualItems.length > 0 ? virtualItems[0].index : 0;

    const scrollState: ScrollState = {
      scrollTop,
      focusedIndex,
      timestamp: Date.now()
    };

    try {
      sessionStorage.setItem(
        `${SCROLL_STATE_KEY}-${scrollRestorationKey}`,
        JSON.stringify(scrollState)
      );
    } catch (error) {
      console.warn('Failed to save scroll state:', error);
    }
  }, [preserveScrollOnNavigation, virtualizer, scrollRestorationKey]);

  // Debounced scroll state saving
  useEffect(() => {
    if (!preserveScrollOnNavigation || !parentRef.current) return;

    const handleScroll = () => {
      const scrollTop = parentRef.current?.scrollTop ?? 0;
      lastScrollTop.current = scrollTop;

      // Clear existing timeout
      if (scrollSaveTimeout.current) {
        clearTimeout(scrollSaveTimeout.current);
      }

      // Debounce save operation
      scrollSaveTimeout.current = setTimeout(saveScrollState, 150);
    };

    const element = parentRef.current;
    element.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      element.removeEventListener('scroll', handleScroll);
      if (scrollSaveTimeout.current) {
        clearTimeout(scrollSaveTimeout.current);
      }
    };
  }, [saveScrollState, preserveScrollOnNavigation]);

  // Restore scroll state on mount/navigation
  useEffect(() => {
    if (!preserveScrollOnNavigation || notes.length === 0) return;

    const routerState = router.state.location.state as any;
    const isReturningFromNavigation = routerState?.fromFeed || routerState?.restoreIndex !== undefined;

    if (!isReturningFromNavigation) return;

    try {
      const savedState = sessionStorage.getItem(`${SCROLL_STATE_KEY}-${scrollRestorationKey}`);
      if (!savedState) return;

      const scrollState: ScrollState = JSON.parse(savedState);
      
      // Check if saved state is not too old
      if (Date.now() - scrollState.timestamp > SCROLL_STATE_MAX_AGE) {
        sessionStorage.removeItem(`${SCROLL_STATE_KEY}-${scrollRestorationKey}`);
        return;
      }

      // Wait for virtualizer to be ready
      const restoreScroll = () => {
        if (!parentRef.current) return;

        isRestoringScroll.current = true;

        // Try to restore to the same item first
        if (scrollState.focusedIndex < notes.length) {
          virtualizer.scrollToIndex(scrollState.focusedIndex, {
            align: 'start',
            behavior: 'auto'
          });
        } else {
          // Fallback to scroll position
          parentRef.current.scrollTop = scrollState.scrollTop;
        }

        // Allow measurements after a brief delay
        setTimeout(() => {
          isRestoringScroll.current = false;
        }, 500);
      };

      // Delay restoration to ensure DOM is ready
      requestAnimationFrame(() => {
        setTimeout(restoreScroll, 100);
      });

    } catch (error) {
      console.warn('Failed to restore scroll state:', error);
    }
  }, [virtualizer, preserveScrollOnNavigation, router.state.location.state, scrollRestorationKey]); // Remove notes.length dependency to prevent restoration on new notes

  // Infinite scroll with proper buffering
  useEffect(() => {
    // Skip during scroll restoration
    if (isRestoringScroll.current) return;

    const virtualItems = virtualizer.getVirtualItems();
    if (virtualItems.length === 0) return;

    const lastItem = virtualItems[virtualItems.length - 1];
    
    // Calculate dynamic buffer based on viewport and scroll speed
    const viewportHeight = parentRef.current?.clientHeight ?? 800;
    const averageItemHeight = virtualizer.getTotalSize() / notes.length || 200;
    const itemsPerViewport = Math.ceil(viewportHeight / averageItemHeight);
    
    // Use 2-3 viewports as buffer, minimum 10 items
    const bufferSize = Math.max(itemsPerViewport * 2, 10);
    const triggerIndex = notes.length - bufferSize;

    if (
      lastItem.index >= triggerIndex &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      console.log(`🔄 Infinite scroll triggered at index ${lastItem.index}/${notes.length}`);
      fetchNextPage();
    }
  }, [
    virtualizer,
    notes.length,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage
  ]);

  // Height update optimization with debouncing
  const updateItemHeight = useCallback((index: number, height: number) => {
    // Skip updates during scroll restoration
    if (isRestoringScroll.current) return;

    // Only update if height changed significantly (>10px)
    const currentSize = virtualizer.options.estimateSize(index);
    if (Math.abs(height - currentSize) < 10) return;

    // Debounce the measurement
    requestAnimationFrame(() => {
      const element = document.querySelector(`[data-index="${index}"]`) as HTMLElement;
      
      if (element) {
        virtualizer.measureElement(element);
      }
    });
  }, [virtualizer]);

  // Cleanup scroll state on unmount
  useEffect(() => {
    return () => {
      if (scrollSaveTimeout.current) {
        clearTimeout(scrollSaveTimeout.current);
      }
    };
  }, []);

  return {
    virtualizer,
    virtualItems: virtualizer.getVirtualItems(),
    totalSize: virtualizer.getTotalSize(),
    
    // Utility functions
    updateItemHeight,
    scrollToIndex: (index: number, options?: { align?: 'start' | 'center' | 'end' | 'auto'; behavior?: 'auto' | 'smooth' }) => {
      virtualizer.scrollToIndex(index, options);
    },
    scrollToTop: () => {
      parentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    },
    
    // State
    isRestoringScroll: isRestoringScroll.current,
    
    // Manual scroll state management
    saveScrollState,
    clearScrollState: () => {
      try {
        sessionStorage.removeItem(`${SCROLL_STATE_KEY}-${scrollRestorationKey}`);
      } catch (error) {
        console.warn('Failed to clear scroll state:', error);
      }
    }
  };
}
