import { useCallback, useRef, useEffect } from 'react';
import { useRouter } from '@tanstack/react-router';
import { Virtualizer } from '@tanstack/react-virtual';

interface ScrollState {
  scrollTop: number;
  focusedIndex: number;
  focusedOffset: number;
  timestamp: number;
  noteIds: string[]; // For validation
  totalSize: number;
  viewportHeight: number;
}

interface RouterAwareScrollRestorationConfig {
  virtualizer: Virtualizer<HTMLDivElement, Element> | null;
  scrollElement: HTMLElement | null;
  notes: Array<{ id: string }>;
  storageKey?: string;
  maxAge?: number; // milliseconds
  debug?: boolean;
  onRestoreStart?: () => void;
  onRestoreComplete?: () => void;
}

const DEFAULT_MAX_AGE = 30 * 60 * 1000; // 30 minutes
const RESTORATION_DELAY = 100; // ms to wait before restoration
const RESTORATION_TIMEOUT = 2000; // ms to wait for restoration to complete

/**
 * Router-aware scroll restoration that properly integrates with TanStack Router
 * and virtual scrolling. Handles navigation state and prevents conflicts.
 */
export function useRouterAwareScrollRestoration(config: RouterAwareScrollRestorationConfig) {
  const {
    virtualizer,
    scrollElement,
    notes,
    storageKey = 'scroll-state',
    maxAge = DEFAULT_MAX_AGE,
    debug = false,
    onRestoreStart,
    onRestoreComplete
  } = config;

  const router = useRouter();
  const isRestoringRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoreTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // One-shot restoration control
  const pendingRestoreRef = useRef(false);
  const restoredOnceRef = useRef(false);

  // Generate storage key based on current route
  const getStorageKey = useCallback(() => {
    const pathname = router.state.location.pathname;
    const search = router.state.location.search;
    return `${storageKey}-${pathname}${search ? `-${btoa(JSON.stringify(search)).slice(0, 8)}` : ''}`;
  }, [router.state.location, storageKey]);

  // Save scroll state with debouncing to prevent excessive saves
  const saveScrollState = useCallback(() => {
    if (!scrollElement || !virtualizer || notes.length === 0) return;
    
    try {
      const scrollTop = scrollElement.scrollTop;
      const virtualItems = virtualizer.getVirtualItems();
      
      // Find the focused item (first visible item)
      const focusedItem = virtualItems[0];
      if (!focusedItem) return;
      
      const focusedIndex = focusedItem.index;
      // Calculate how far into the focused item we've scrolled
      // This should be positive when we've scrolled past the start of the item
      const focusedOffset = scrollTop - focusedItem.start;
      
      const scrollState: ScrollState = {
        scrollTop,
        focusedIndex,
        focusedOffset,
        timestamp: Date.now(),
        noteIds: notes.slice(0, Math.min(100, notes.length)).map(n => n.id), // Sample for validation
        totalSize: virtualizer.getTotalSize(),
        viewportHeight: scrollElement.clientHeight
      };
      
      const key = getStorageKey();
      const existingState = sessionStorage.getItem(key);
      
      // Only save if state has meaningfully changed to reduce storage churn
      let shouldSave = true;
      if (existingState) {
        try {
          const existing: ScrollState = JSON.parse(existingState);
          const indexDiff = Math.abs(existing.focusedIndex - focusedIndex);
          const offsetDiff = Math.abs(existing.focusedOffset - focusedOffset);
          
          // Skip saving if position hasn't changed significantly (less than 50px difference)
          if (indexDiff === 0 && offsetDiff < 50) {
            shouldSave = false;
          }
        } catch {}
      }
      
      if (shouldSave) {
        sessionStorage.setItem(key, JSON.stringify(scrollState));
        
        if (debug) {
          console.log(`💾 Saved scroll state: index ${focusedIndex}, offset ${focusedOffset}px (scrollTop: ${scrollTop}, itemStart: ${focusedItem.start})`);
        }
      }
    } catch (error) {
      console.warn('Failed to save scroll state:', error);
    }
  }, [scrollElement, virtualizer, notes, getStorageKey, debug]);

  // Restore scroll state
  const restoreScrollState = useCallback(() => {
    if (!scrollElement || !virtualizer || notes.length === 0 || isRestoringRef.current) return;
    if (restoredOnceRef.current) return; // One-shot guard per mount/navigation
    
    try {
      // Mark restoration lock to prevent other systems from interpreting this as user scroll
      try {
        sessionStorage.setItem('virtualScrollRestorationLock', 'true');
      } catch {}
      const key = getStorageKey();
      const saved = sessionStorage.getItem(key);
      if (!saved) return;
      
      const scrollState: ScrollState = JSON.parse(saved);
      
      // Validate saved state
      if (Date.now() - scrollState.timestamp > maxAge) {
        sessionStorage.removeItem(key);
        return;
      }
      
      // Validate note IDs to ensure we're restoring to the same content
      const currentNoteIds = notes.slice(0, Math.min(100, notes.length)).map(n => n.id);
      const hasMatchingContent = scrollState.noteIds.some(id => currentNoteIds.includes(id));
      
      if (!hasMatchingContent) {
        if (debug) {
          console.log('📍 Content mismatch, skipping scroll restoration');
        }
        return;
      }
      
      isRestoringRef.current = true;
      pendingRestoreRef.current = false;
      
      if (onRestoreStart) {
        onRestoreStart();
      }
      // Mark this navigation entry as restored and consume navigation flags to prevent re-restoration
      try {
        const currentState: any = { ...window.history.state };
        if (currentState) {
          if (currentState.fromFeed !== undefined) delete currentState.fromFeed;
          if (currentState.fromProfile !== undefined) delete currentState.fromProfile;
          if (currentState.restoreIndex !== undefined) delete currentState.restoreIndex;
          currentState.scrollRestored = true;
          window.history.replaceState(currentState, '');
        }
      } catch {}

      
      if (debug) {
        console.log(`🔄 Restoring scroll state: index ${scrollState.focusedIndex}, offset ${scrollState.focusedOffset}px (viewport: ${scrollElement.clientHeight}px)`);
      }
      
      // Restore scroll position with improved accuracy
      if (scrollState.focusedIndex < notes.length) {
        // Strategy 1: Use scrollToIndex for initial positioning
        virtualizer.scrollToIndex(scrollState.focusedIndex, {
          align: 'start',
          behavior: 'auto'
        });
        
        // Strategy 2: Fine-tune with offset after virtualizer has positioned the item
        const fineTuneRestore = () => {
          if (!scrollElement) return;
          
          // Get the current virtual items to find the actual position
          const currentVirtualItems = virtualizer.getVirtualItems();
          const currentFocusedItem = currentVirtualItems.find(item => item.index === scrollState.focusedIndex);
          
          if (currentFocusedItem) {
            let targetScrollTop: number;
            
            if (scrollState.focusedOffset > 0) {
              // Calculate the target scroll position: item start + how far we were into the item
              targetScrollTop = currentFocusedItem.start + scrollState.focusedOffset;
            } else {
              // If offset is 0 or negative, just position at the start of the item
              targetScrollTop = currentFocusedItem.start;
            }
            
            // Validate the target position is reasonable
            const maxScrollTop = Math.max(0, virtualizer.getTotalSize() - scrollElement.clientHeight);
            const clampedScrollTop = Math.max(0, Math.min(targetScrollTop, maxScrollTop));
            
            // Apply the scroll position
            scrollElement.scrollTop = clampedScrollTop;
            
            if (debug) {
              console.log(`🎯 Fine-tuned scroll: itemStart(${currentFocusedItem.start}) + offset(${scrollState.focusedOffset}) = ${clampedScrollTop} (max: ${maxScrollTop})`);
            }
          } else {
            // Strategy 3: Fallback to saved scroll position if we can't find the focused item
            const maxScrollTop = Math.max(0, virtualizer.getTotalSize() - scrollElement.clientHeight);
            const fallbackScrollTop = Math.max(0, Math.min(scrollState.scrollTop, maxScrollTop));
            scrollElement.scrollTop = fallbackScrollTop;
            
            if (debug) {
              console.log(`⚠️ Fallback to saved scrollTop: ${fallbackScrollTop} (original: ${scrollState.scrollTop})`);
            }
          }
        };
        
        // Execute fine-tuning with appropriate delay
        // Mark when restoration started to prevent fine-tuning after user scrolls
        const restorationStartTime = Date.now();
        (scrollElement as any).restorationStartTime = restorationStartTime;
        
        setTimeout(() => {
          // Check if this restoration is still the current one (prevent stale timeouts)
          if ((scrollElement as any).restorationStartTime !== restorationStartTime) {
            if (debug) {
              console.log('🔄 Restoration superseded, skipping fine-tuning');
            }
            return;
          }
          
          // Check if user has scrolled AT ALL since restoration started (strict check)
          const lastScrollTime = (scrollElement as any).lastScrollTime || 0;
          if (lastScrollTime > restorationStartTime) {
            if (debug) {
              console.log('👆 User scrolled after restoration, skipping fine-tuning to prevent jump');
            }
            return;
          }
          
          // Additional check: don't fine-tune if restoration is no longer active
          if (!isRestoringRef.current) {
            if (debug) {
              console.log('⚠️ Restoration no longer active, skipping fine-tuning');
            }
            return;
          }
          
          // Check if fine-tuning is actually needed by comparing current position with target
          const currentScrollTop = scrollElement.scrollTop;
          const targetScrollTop = scrollState.focusedIndex * 200 + scrollState.focusedOffset; // Rough estimate
          const positionDifference = Math.abs(currentScrollTop - targetScrollTop);
          
          // Only fine-tune if there's a significant difference (more than 50px)
          if (positionDifference < 50) {
            if (debug) {
              console.log('🎯 Position already accurate, skipping fine-tuning');
            }
            return;
          }
          
          fineTuneRestore();
        }, 100);
      } else {
        // Fallback to direct scroll position for out-of-bounds indices
        const maxScrollTop = Math.max(0, virtualizer.getTotalSize() - scrollElement.clientHeight);
        const clampedScrollTop = Math.max(0, Math.min(scrollState.scrollTop, maxScrollTop));
        scrollElement.scrollTop = clampedScrollTop;
        
        if (debug) {
          console.log(`📍 Index out of bounds, using direct scroll: ${clampedScrollTop}`);
        }
      }
      
      // Complete restoration after timeout
      if (restoreTimeoutRef.current) {
        clearTimeout(restoreTimeoutRef.current);
      }
      
      restoreTimeoutRef.current = setTimeout(() => {
        isRestoringRef.current = false;
        restoredOnceRef.current = true;
        // Clear restoration lock on completion
        try {
          sessionStorage.removeItem('virtualScrollRestorationLock');
        } catch {}
        if (onRestoreComplete) {
          onRestoreComplete();
        }
        if (debug) {
          console.log('✅ Scroll restoration complete');
        }
      }, RESTORATION_TIMEOUT);
      
    } catch (error) {
      console.warn('Failed to restore scroll state:', error);
      isRestoringRef.current = false;
      // Clear restoration lock on error
      try {
        sessionStorage.removeItem('virtualScrollRestorationLock');
      } catch {}
    }
  }, [scrollElement, virtualizer, notes, getStorageKey, maxAge, debug, onRestoreStart, onRestoreComplete]);

  // Debounced save on scroll
  const handleScroll = useCallback(() => {
    if (isRestoringRef.current) return;
    
    // Track scroll time to prevent fine-tuning interference
    (scrollElement as any).lastScrollTime = Date.now();
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(() => {
      saveScrollState();
    }, 150); // Debounce scroll saves
  }, [saveScrollState, scrollElement]);

  // Set up scroll listener
  useEffect(() => {
    if (!scrollElement) return;
    
    scrollElement.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      scrollElement.removeEventListener('scroll', handleScroll);
    };
  }, [scrollElement, handleScroll]);

  // Track previous location to detect navigation changes
  const previousLocationRef = useRef<string>('');
  
  // Handle navigation events - mark pending restore once per navigation
  useEffect(() => {
    const currentPath = router.state.location.pathname;
    const currentSearch = router.state.location.search || '';
    const currentLocation = `${currentPath}${currentSearch}`;
    
    const routerState = router.state.location.state as any;
    // Recognize returns from feed or profile-based feeds
    let isReturningFromNavigation =
      routerState?.fromFeed ||
      routerState?.fromProfile ||
      routerState?.restoreIndex !== undefined;

    // Enhanced fallback detection for browser back button and iOS Safari swipe:
    // Check if we're returning to a feed-like route (home, profile, or npub) and have saved state
    const isFeedLikeRoute =
      currentPath === '/' ||
      currentPath.startsWith('/profile') ||
      currentPath.startsWith('/npub/');
    
    // iOS Safari specific detection
    const isIOSSafari = /iPad|iPhone|iPod/.test(navigator.userAgent) && /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
    
    if (!isReturningFromNavigation && isFeedLikeRoute) {
      try {
        const key = getStorageKey();
        const saved = sessionStorage.getItem(key);
        
        // Check if we actually navigated (location changed) and have saved state
        const didNavigate = previousLocationRef.current && previousLocationRef.current !== currentLocation;
        
        if (saved && didNavigate) {
          isReturningFromNavigation = true;
          
          if (debug) {
            const navigationType = isIOSSafari ? 'iOS Safari navigation' : 'Browser back button';
            console.log(`🔄 ${navigationType} detected: ${previousLocationRef.current} → ${currentLocation}`);
          }
        }
      } catch {}
    }
    
    // Update the previous location reference
    previousLocationRef.current = currentLocation;
    
    if (isReturningFromNavigation) {
      pendingRestoreRef.current = true;
      if (debug) {
        console.log('🔄 Navigation return detected, pending scroll restoration');
      }
    }
  }, [router.state.location.state, router.state.location.pathname, router.state.location.search, getStorageKey, debug]);

  // Perform the pending restoration once data is available, only once per navigation
  useEffect(() => {
    if (!pendingRestoreRef.current) return;
    if (restoredOnceRef.current) return;
    if (!scrollElement || !virtualizer) return;
    if (notes.length === 0) return;

    const isIOSSafari = /iPad|iPhone|iPod/.test(navigator.userAgent) && /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
    const delay = isIOSSafari ? RESTORATION_DELAY + 100 : RESTORATION_DELAY;

    const t = setTimeout(() => {
      restoreScrollState();
    }, delay);

    return () => clearTimeout(t);
  }, [notes.length, scrollElement, virtualizer, restoreScrollState, router.state.location.pathname, router.state.location.search]);

  // Save state before navigation
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveScrollState();
    };
    
    // Enhanced navigation detection for browser back/forward buttons
    const handlePopState = () => {
      if (debug) {
        console.log('🔄 PopState event detected, saving scroll state');
      }
      // Save current state before the navigation completes
      saveScrollState();
    };
    
    // Additional handler for when user navigates away (covers more cases)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (debug) {
          console.log('🔄 Page becoming hidden, saving scroll state');
        }
        saveScrollState();
      }
    };

    // iOS Safari specific handlers for swipe gesture navigation
    const isIOSSafari = /iPad|iPhone|iPod/.test(navigator.userAgent) && /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
    
    // iOS Safari swipe gesture detection
    const handleIOSSwipeNavigation = () => {
      if (debug) {
        console.log('🔄 iOS Safari navigation detected, saving scroll state');
      }
      // Save state when iOS Safari navigation is detected
      saveScrollState();
    };

    // Enhanced pagehide handler for iOS Safari (fires on swipe navigation)
    const handlePageHide = (event: PageTransitionEvent) => {
      if (debug) {
        console.log('🔄 PageHide event detected:', event.persisted);
      }
      // Save state when page is being hidden (including iOS swipe navigation)
      saveScrollState();
    };

    // Enhanced pageshow handler for iOS Safari (fires when returning from swipe navigation)
    const handlePageShow = (event: PageTransitionEvent) => {
      if (debug) {
        console.log('🔄 PageShow event detected:', event.persisted);
      }
      // If this is a restored page (from iOS swipe), we need to restore scroll state
      if (event.persisted) {
        // Small delay to allow DOM to settle
        setTimeout(() => {
          restoreScrollState();
        }, 100);
      }
    };
    
    // Save on page unload
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    // Save on browser back/forward button (popstate fires before navigation)
    window.addEventListener('popstate', handlePopState);
    
    // Save when page becomes hidden (covers tab switches, etc.)
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Save on route changes
    const unsubscribe = router.subscribe('onBeforeLoad', () => {
      if (debug) {
        console.log('🔄 Router onBeforeLoad, saving scroll state');
      }
      saveScrollState();
    });

    // iOS Safari specific event handlers
    if (isIOSSafari) {
      // PageHide/PageShow events are more reliable for iOS Safari navigation
      window.addEventListener('pagehide', handlePageHide);
      window.addEventListener('pageshow', handlePageShow);
      
      // Additional touch event handlers for iOS Safari swipe detection
      let touchStartX = 0;
      let touchStartTime = 0;
      
      const handleTouchStart = (e: TouchEvent) => {
        touchStartX = e.touches[0].clientX;
        touchStartTime = Date.now();
      };
      
      const handleTouchEnd = (e: TouchEvent) => {
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndTime = Date.now();
        const deltaX = touchEndX - touchStartX;
        const deltaTime = touchEndTime - touchStartTime;
        
        // Detect right-to-left swipe (going back) with sufficient distance and speed
        if (deltaX < -50 && deltaTime < 500 && Math.abs(deltaX) > 100) {
          if (debug) {
            console.log('🔄 iOS Safari swipe back detected');
          }
          handleIOSSwipeNavigation();
        }
      };
      
      document.addEventListener('touchstart', handleTouchStart, { passive: true });
      document.addEventListener('touchend', handleTouchEnd, { passive: true });
      
      // Cleanup function for iOS Safari handlers
      const cleanupIOS = () => {
        window.removeEventListener('pagehide', handlePageHide);
        window.removeEventListener('pageshow', handlePageShow);
        document.removeEventListener('touchstart', handleTouchStart);
        document.removeEventListener('touchend', handleTouchEnd);
      };
      
      // Return cleanup function that includes iOS handlers
      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
        window.removeEventListener('popstate', handlePopState);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        cleanupIOS();
        unsubscribe();
      };
    }
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      unsubscribe();
    };
  }, [saveScrollState, router, debug, restoreScrollState]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveScrollState(); // Final save
      }
      if (restoreTimeoutRef.current) {
        clearTimeout(restoreTimeoutRef.current);
      }
    };
  }, [saveScrollState]);

  // Manual operations
  const manualSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveScrollState();
  }, [saveScrollState]);

  const manualRestore = useCallback(() => {
    restoreScrollState();
  }, [restoreScrollState]);

  const clearSavedState = useCallback(() => {
    try {
      const key = getStorageKey();
      sessionStorage.removeItem(key);
      if (debug) {
        console.log('🗑️ Cleared saved scroll state');
      }
    } catch (error) {
      console.warn('Failed to clear scroll state:', error);
    }
  }, [getStorageKey, debug]);

  // Get current scroll info for debugging
  const getScrollInfo = useCallback(() => {
    if (!scrollElement || !virtualizer) return null;
    
    const scrollTop = scrollElement.scrollTop;
    const virtualItems = virtualizer.getVirtualItems();
    const focusedItem = virtualItems[0];
    
    return {
      scrollTop,
      focusedIndex: focusedItem?.index ?? -1,
      focusedOffset: focusedItem ? focusedItem.start - scrollTop : 0,
      totalSize: virtualizer.getTotalSize(),
      viewportHeight: scrollElement.clientHeight,
      isRestoring: isRestoringRef.current
    };
  }, [scrollElement, virtualizer]);

  return {
    // State
    isRestoring: isRestoringRef.current,
    
    // Manual operations
    saveScrollState: manualSave,
    restoreScrollState: manualRestore,
    clearSavedState,
    
    // Debug utilities
    getScrollInfo,
    
    // Storage key for external use
    storageKey: getStorageKey()
  };
}
