import { useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { useLocation } from "@tanstack/react-router";
import type { Virtualizer } from "@tanstack/react-virtual";
import { getGlobalScrollStabilizer } from "./useScrollRestorationStabilizer";

/**
 * Build a stable storage key for virtual scroll position.
 * We scope by pathname so each route gets its own persisted position.
 */
const buildStorageKey = (id: string, pathname: string) =>
  `virtual-scroll-pos:${pathname}:${id}`;

export interface VirtualScrollState {
  scrollOffset: number;
  visibleStartIndex: number;
  visibleEndIndex: number;
  itemCount: number;
  timestamp: number;
  // Enhanced state for better restoration
  measurementsCache?: Record<number, { size: number; start: number; end: number }>;
  totalSize?: number;
  scrollElementHeight?: number;
  // Additional state for preventing jitter during restoration
  noteIds?: string[]; // Track note IDs to validate cache validity
  windowWidth?: number; // Track window width when measurements were taken
  imageDimensionsCache?: Record<string, { width: number; height: number }>; // Cache image dimensions
  asciiCache?: Record<string, { ascii: string; timestamp: number }>; // Cache ASCII rendered content
}

export interface UseVirtualScrollRestorationOptions {
  /**
   * Debounce interval in ms for saving scroll position. Defaults to 100ms.
   */
  saveDebounceMs?: number;
  /**
   * When false, the hook is disabled (no save/restore).
   */
  enabled?: boolean;
  /**
   * Maximum age in milliseconds for cached position. Defaults to 30 minutes.
   */
  maxAge?: number;
  /**
   * Minimum item count required before attempting restoration.
   * Prevents premature restoration when data is still loading.
   */
  minItemCount?: number;
  /**
   * Wait for data stability before restoration.
   * When true, waits for virtualizer item count to stabilize.
   */
  waitForStableData?: boolean;
  /**
   * Callback to get initial scroll offset for virtualizer initialization.
   * Called before virtualizer is created to enable initialOffset.
   */
  getInitialOffset?: () => number | undefined;
  /**
   * Callback to get initial measurements cache for virtualizer initialization.
   */
  getInitialMeasurementsCache?: () => Record<number, any> | undefined;
  /**
   * Callback to get current note IDs for cache validation.
   */
  getCurrentNoteIds?: () => string[] | undefined;
  /**
   * Callback to get image dimensions cache for persistence.
   */
  getImageDimensionsCache?: () => Record<string, { width: number; height: number }> | undefined;
  /**
   * Callback to get ASCII cache for persistence.
   */
  getAsciiCache?: () => Record<string, { ascii: string; timestamp: number }> | undefined;
}

/**
 * ✅ Simplified restoration check - no locks needed
 * TanStack Query + router state handles restoration coordination
 */
export function isVirtualScrollRestoring(): boolean {
  // Always return false - let TanStack Query and router handle restoration
  return false;
}

/**
 * Get initial scroll state for virtualizer initialization.
 * Call this before creating the virtualizer to enable initialOffset and initialMeasurementsCache.
 */
export function getInitialVirtualScrollState(
  id: string,
  pathname: string,
  options?: { maxAge?: number; minItemCount?: number; currentNotes?: any[] }
): { 
  initialOffset?: number; 
  initialMeasurementsCache?: Record<number, any>;
  cachedImageDimensions?: Record<string, { width: number; height: number }>;
  cachedAsciiCache?: Record<string, { ascii: string; timestamp: number }>;
  cachedNoteIds?: string[];
} | null {
  try {
    const key = buildStorageKey(id, pathname);
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    
    const parsed = JSON.parse(raw) as VirtualScrollState;
    const maxAge = options?.maxAge ?? 30 * 60 * 1000; // 30 minutes
    const minItemCount = options?.minItemCount ?? 1;
    
    // Check if cached data is too old
    if (Date.now() - parsed.timestamp > maxAge) {
      sessionStorage.removeItem(key);
      return null;
    }
    
    // Check if we have sufficient items for restoration
    if (parsed.itemCount < minItemCount) {
      return null;
    }
    
    // Validate cache validity against current notes if provided
    if (options?.currentNotes && parsed.noteIds) {
      const currentNoteIds = options.currentNotes.slice(0, parsed.itemCount).map(note => note.id);
      const cachedNoteIds = parsed.noteIds.slice(0, parsed.itemCount);
      
      // Ultra-lenient validation: check if any notes match (allows for major reordering)
      const matchingNotes = currentNoteIds.filter(id => cachedNoteIds.includes(id));
      const matchRatio = matchingNotes.length / Math.max(currentNoteIds.length, cachedNoteIds.length);
      
      // Allow restoration if at least 1% of notes match (ultra-lenient for profile navigation)
      // This allows restoration even when there's been significant content changes
      if (matchRatio < 0.01) {
        console.log(`🔄 Cache invalidated due to note ID mismatch (${Math.round(matchRatio * 100)}% match)`);
        return null;
      }
      
      console.log(`✅ Cache validated with ${Math.round(matchRatio * 100)}% note match`);
    }
    
    // Check if window width changed significantly (affects measurements)
    if (parsed.windowWidth && typeof window !== 'undefined') {
      const widthDiff = Math.abs(window.innerWidth - parsed.windowWidth);
      if (widthDiff > 100) { // Significant width change
        console.log(`🔄 Cache invalidated due to window width change: ${parsed.windowWidth} → ${window.innerWidth}`);
        return null;
      }
    }
    
    // Also store in history.state as backup for browser navigation
    try {
      if (window.history.state?.virtualScroll?.[id] !== parsed.scrollOffset) {
        const newState = { 
          ...window.history.state, 
          virtualScroll: { 
            ...window.history.state?.virtualScroll, 
            [id]: parsed.scrollOffset 
          } 
        };
        window.history.replaceState(newState, '');
      }
    } catch {}
    
    console.log(`🔄 Retrieved initial virtual scroll state (offset: ${parsed.scrollOffset}, items: ${parsed.itemCount}, measurements: ${Object.keys(parsed.measurementsCache || {}).length}, ascii: ${Object.keys(parsed.asciiCache || {}).length})`);
    
    return {
      initialOffset: parsed.scrollOffset,
      initialMeasurementsCache: parsed.measurementsCache,
      cachedImageDimensions: parsed.imageDimensionsCache,
      cachedAsciiCache: parsed.asciiCache,
      cachedNoteIds: parsed.noteIds
    };
  } catch (error) {
    console.warn('Failed to get initial virtual scroll state:', error);
    return null;
  }
}

/**
 * Track and restore virtual scroll position for TanStack Virtual.
 * This hook saves both scroll offset and visible item indices to enable
 * precise restoration when returning to the feed from other pages.
 */
export function useVirtualScrollRestoration<T extends HTMLElement>(
  virtualizer: Virtualizer<T, Element> | null,
  scrollElement: HTMLElement | null,
  id: string,
  options?: UseVirtualScrollRestorationOptions
) {
  const { pathname } = useLocation();
  const debounceMs = options?.saveDebounceMs ?? 100;
  const enabled = options?.enabled ?? true;
  const maxAge = options?.maxAge ?? 30 * 60 * 1000; // 30 minutes
  const minItemCount = options?.minItemCount ?? 1;
  const waitForStableData = options?.waitForStableData ?? true;
  
  const debounceTimerRef = useRef<number | null>(null);
  const saveDisabledUntilRef = useRef<number>(0);
  const restoredRef = useRef(false);
  const initialRestoreAttemptedRef = useRef(false);
  const dataStabilityTimerRef = useRef<number | null>(null);
  const lastItemCountRef = useRef<number>(0);
  // Track whether the user has interacted (scrolled) since mount to avoid unexpected jumps
  const userInteractedRef = useRef(false);
  // Track user interaction timing for mobile monitoring
  const lastUserInteractionRef = useRef<number>(Date.now());

  // Data-aware scroll restoration that waits for stable data
  const attemptRestoration = useCallback(() => {
    if (!enabled || !virtualizer || !scrollElement || restoredRef.current) {
      return;
    }

    // Never auto-restore once the user has interacted in this session
    if (userInteractedRef.current) {
      return;
    }

    const currentItemCount = virtualizer.options.count;
    
    // Check if we have sufficient data for restoration
    if (currentItemCount < minItemCount) {
      return;
    }

    const key = buildStorageKey(id, pathname);
    
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return;
      
      const parsed = JSON.parse(raw) as VirtualScrollState;
      
      // Check if cached data is too old
      if (Date.now() - parsed.timestamp > maxAge) {
        sessionStorage.removeItem(key);
        return;
      }

      // Validate that we have enough items to restore to the saved position
      if (currentItemCount < parsed.itemCount * 0.5) {
        // If we have significantly fewer items, skip restoration
        return;
      }

      // Check for data stability if enabled
      if (waitForStableData) {
        const hasDataChanged = lastItemCountRef.current !== currentItemCount;
        lastItemCountRef.current = currentItemCount;
        
        if (hasDataChanged) {
          // Data is still changing, wait for stability
          if (dataStabilityTimerRef.current) {
            clearTimeout(dataStabilityTimerRef.current);
          }
          dataStabilityTimerRef.current = window.setTimeout(() => {
            attemptRestoration();
          }, 200); // Increased to 200ms for better stability
          return;
        }
        
        // Additional check: ensure DOM is stable by waiting for any pending measurements
        const hasPendingMeasurements = virtualizer.getVirtualItems().some(item => {
          const element = scrollElement?.querySelector(`[data-index="${item.index}"]`);
          return element && element.getBoundingClientRect().height === 0;
        });
        
        if (hasPendingMeasurements) {
          // DOM not yet stable, wait a bit more
          if (dataStabilityTimerRef.current) {
            clearTimeout(dataStabilityTimerRef.current);
          }
          dataStabilityTimerRef.current = window.setTimeout(() => {
            attemptRestoration();
          }, 100);
          return;
        }
      }

      // Proceed with restoration - data is stable
      console.log(`🔄 Starting data-aware scroll restoration (items: ${currentItemCount}, target offset: ${parsed.scrollOffset})`);
      
      // Start global stabilization to prevent layout changes during restoration
      const stabilizer = getGlobalScrollStabilizer();
      stabilizer.startStabilization(2000, 500); // Layout: 2s, User interaction: 0.5s
      
      // ✅ Simplified restoration - no locks needed
      // Temporarily disable saving during restoration
      saveDisabledUntilRef.current = Date.now() + 500; // 500ms - much shorter
      
      // Disable smooth scrolling during restoration
      const prevScrollBehavior = scrollElement.style.scrollBehavior;
      scrollElement.style.scrollBehavior = 'auto';
      
      try {
        // Apply measurements cache if available to prevent layout shifts
        if (parsed.measurementsCache && virtualizer.measurementsCache) {
          let appliedCount = 0;
          for (const [index, measurement] of Object.entries(parsed.measurementsCache)) {
            if (measurement && typeof measurement.size === 'number' && measurement.size > 0) {
              const indexNum = Number(index);
              // Only apply measurements for valid indices within current item count
              if (indexNum < currentItemCount) {
                // Apply measurement in TanStack Virtual's expected format
                const measurementEntry = {
                  size: measurement.size,
                  start: measurement.start || 0,
                  end: measurement.end || measurement.size
                };
                
                // Set the measurement directly on the cache
                (virtualizer.measurementsCache as any)[indexNum] = measurementEntry;
                appliedCount++;
              }
            }
          }
          
          if (appliedCount > 0) {
            console.log(`🔄 Applied ${appliedCount} cached measurements for restoration`);
            // Don't force recalculation during restoration to prevent jitter
            // The virtualizer will naturally recalculate when needed
          }
        }
        
        const totalSize = virtualizer.getTotalSize();
        const maxOffset = Math.max(0, totalSize - scrollElement.clientHeight);
        const clampedOffset = Math.max(0, Math.min(parsed.scrollOffset, maxOffset));
        
        // Perform restoration with fallback to browser history state
        let finalOffset = clampedOffset;
        
        // Check browser history state as backup
        try {
          const historyScrollOffset = window.history.state?.virtualScroll?.[id];
          if (typeof historyScrollOffset === 'number' && Math.abs(historyScrollOffset - clampedOffset) < 100) {
            finalOffset = Math.max(0, Math.min(historyScrollOffset, maxOffset));
            console.log(`🔄 Using browser history state offset: ${finalOffset}px`);
          }
        } catch {}
        
        // Perform single, accurate restoration
        scrollElement.scrollTop = finalOffset;
        restoredRef.current = true;
        
        console.log(`🔄 Restored scroll position to ${finalOffset}px (total size: ${totalSize}px, cached measurements: ${parsed.measurementsCache ? Object.keys(parsed.measurementsCache).length : 0})`);
        
        // Set up a monitoring system to detect and correct position shifts
        let monitoringAttempts = 0;
        // Detect mobile and adjust monitoring behavior to be less aggressive
        const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
        const maxMonitoringAttempts = isMobile ? 0 : 1; // No monitoring on mobile to prevent jumping
        const monitoringInterval = isMobile ? 1000 : 600; // Much slower monitoring to reduce conflicts
        
        // On mobile, skip monitoring entirely to prevent jumping but still allow restoration
        if (isMobile) {
          console.log('📱 Mobile device detected, skipping scroll monitoring to prevent jumping');
          // Clear restoration lock immediately on mobile
          try {
            sessionStorage.removeItem('virtualScrollRestorationLock');
            sessionStorage.removeItem('virtualScrollRestorationLockTime');
          } catch {}
          return;
        }
        
        let lastScrollTop = finalOffset;
        let userScrollDetected = false;

        const monitorScrollPosition = () => {
          if (monitoringAttempts >= maxMonitoringAttempts || userScrollDetected) {
            // Clear restoration lock after monitoring period or user interaction
            try {
              sessionStorage.removeItem('virtualScrollRestorationLock');
              sessionStorage.removeItem('virtualScrollRestorationLockTime');
            } catch {}
            
            // Execute any pending operations after stabilization
            const stabilizer = getGlobalScrollStabilizer();
            stabilizer.executePendingOperations();
            
            const reason = userScrollDetected ? 'user interaction detected' : `${monitoringAttempts * monitoringInterval}ms elapsed`;
            console.log(`🔄 Scroll restoration monitoring complete (${reason})`);
            return;
          }
          
          // Mobile check is handled earlier in the function
          
          // Skip monitoring if user has been scrolling recently (within last 2 seconds)
          const timeSinceLastScroll = Date.now() - lastUserInteractionRef.current;
          if (timeSinceLastScroll < 2000) {
            console.log('👆 User recently scrolled, skipping monitoring to prevent jumping');
            userScrollDetected = true;
            return;
          }
          
          monitoringAttempts++;
          const currentScrollTop = scrollElement.scrollTop;
          const drift = Math.abs(currentScrollTop - finalOffset);
          
          // Check if user has been inactive - don't correct if user stopped interacting
          const userInactiveTime = Date.now() - lastUserInteractionRef.current;
          
          // Don't correct if user has been inactive for more than 1 second
          // This prevents jumping when user stops scrolling
          if (userInactiveTime > 1000) {
            console.log('👆 User inactive for 1+ seconds, ending monitoring to prevent jumping');
            userScrollDetected = true;
            return;
          }
          
          // Detect user scrolling (large sudden changes that aren't drift corrections)
          if (monitoringAttempts > 2 && Math.abs(currentScrollTop - lastScrollTop) > 100) {
            userScrollDetected = true;
            lastUserInteractionRef.current = Date.now(); // Update interaction time
            console.log(`👆 User scroll detected, ending restoration monitoring early`);
            // Clear locks immediately to allow normal scrolling
            try {
              sessionStorage.removeItem('virtualScrollRestorationLock');
              sessionStorage.removeItem('virtualScrollRestorationLockTime');
            } catch {}
            return;
          }
          
          // Detect when user has stopped scrolling (no movement for several cycles)
          // This prevents jumping when user stops scrolling
          if (monitoringAttempts > 1 && Math.abs(currentScrollTop - lastScrollTop) < 10) {
            console.log('👆 User appears to have stopped scrolling, ending monitoring to prevent jumping');
            userScrollDetected = true;
            return;
          }
          
          lastScrollTop = currentScrollTop;
          
          // Mobile-specific: much higher thresholds and shorter monitoring cycles
          const driftThreshold = isMobile ? 500 : 400; // Very lenient to prevent jumping
          const smallDriftThreshold = isMobile ? 250 : 200; // Much higher small drift threshold to reduce interference
          
          // Only apply corrections if user hasn't been inactive too long on mobile
          const shouldCorrect = !isMobile || userInactiveTime < 5000; // 5 seconds max on mobile
          
          // Don't correct if focus system is active (keyboard navigation)
          const isFocusSystemActive = document.querySelector('[data-note-id].focused') !== null;
          if (isFocusSystemActive) {
            console.log('🎯 Focus system active, skipping scroll correction');
            return;
          }
          
          // MOBILE FIX: Don't correct if user has scrolled significantly away from restored position
          // This prevents the jump-to-top behavior when users intentionally scroll down
          const hasUserScrolledAway = isMobile && currentScrollTop > finalOffset + 200; // 200px threshold
          const isUserActivelyScrolling = isMobile && userInactiveTime < 1000; // User active in last 1 second
          
          // If user has scrolled significantly away from restored position on mobile, stop monitoring
          if (hasUserScrolledAway && !isUserActivelyScrolling) {
            console.log(`👆 User has scrolled away from restored position on mobile, ending monitoring`);
            userScrollDetected = true;
            return;
          }
          
          // If scroll position has drifted more than threshold, restore it
          if (drift > driftThreshold && !userScrollDetected && shouldCorrect && !hasUserScrolledAway) {
            console.log(`🔄 Detected scroll drift: ${drift}px, correcting to ${finalOffset}px`);
            // Always use instant correction to avoid smooth scroll conflicts
            scrollElement.scrollTop = finalOffset;
            lastScrollTop = finalOffset;
          } else if (drift > smallDriftThreshold && monitoringAttempts > 5 && !userScrollDetected && shouldCorrect && !hasUserScrolledAway) {
            // Only correct smaller drifts after the initial settling period
            console.log(`🔄 Late correction of small drift: ${drift}px`);
            scrollElement.scrollTop = finalOffset;
            lastScrollTop = finalOffset;
          }
          
          // Continue monitoring for a few more cycles
          if (monitoringAttempts < maxMonitoringAttempts && !userScrollDetected) {
            setTimeout(monitorScrollPosition, monitoringInterval);
          }
        };
        
        // Start monitoring after a brief delay to allow initial settling
        setTimeout(monitorScrollPosition, monitoringInterval);
        
      } catch (error) {
        console.warn('Failed to restore scroll position:', error);
        // Clear restoration lock on error
        // ✅ No locks to clear - simplified restoration
      }
      
      // Restore scroll behavior immediately to allow user interaction
      requestAnimationFrame(() => {
        scrollElement.style.scrollBehavior = prevScrollBehavior;
      });
      
    } catch (error) {
      console.warn('Failed to restore virtual scroll position:', error);
      try {
        sessionStorage.removeItem(key);
      } catch {}
    }
  }, [virtualizer, scrollElement, id, pathname, enabled, maxAge, minItemCount, waitForStableData]);

  // Restore virtual scroll position when data becomes available
  useLayoutEffect(() => {
    if (!enabled || !virtualizer || !scrollElement || initialRestoreAttemptedRef.current) {
      return;
    }

    initialRestoreAttemptedRef.current = true;
    
    // Apply measurements cache immediately if available from initial state
    const key = buildStorageKey(id, pathname);
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as VirtualScrollState;
        if (parsed.measurementsCache && virtualizer.measurementsCache) {
          let appliedCount = 0;
          const currentItemCount = virtualizer.options.count;
          
          for (const [index, measurement] of Object.entries(parsed.measurementsCache)) {
            if (measurement && typeof measurement.size === 'number' && measurement.size > 0) {
              const indexNum = Number(index);
              // Only apply measurements for valid indices within current item count
              if (indexNum < currentItemCount) {
                const measurementEntry = {
                  size: measurement.size,
                  start: measurement.start || 0,
                  end: measurement.end || measurement.size
                };
                
                (virtualizer.measurementsCache as any)[indexNum] = measurementEntry;
                appliedCount++;
              }
            }
          }
          
          if (appliedCount > 0) {
            console.log(`🔄 Applied ${appliedCount} cached measurements on init`);
            // Don't force recalculation during initialization to prevent jitter
            // The virtualizer will naturally recalculate when needed
          }
        }
      }
    } catch {}
    
    attemptRestoration();
  }, [virtualizer, scrollElement, enabled, attemptRestoration, id, pathname]);

  // Monitor item count changes and attempt restoration when data stabilizes
  useEffect(() => {
    if (!enabled || !virtualizer || restoredRef.current) {
      return;
    }

    attemptRestoration();
  }, [virtualizer?.options.count, enabled, attemptRestoration]);

  // Save virtual scroll position on scroll
  useEffect(() => {
    if (!enabled || !virtualizer || !scrollElement) {
      return;
    }

    const key = buildStorageKey(id, pathname);

    const saveNow = () => {
      if (Date.now() < saveDisabledUntilRef.current) {
        return;
      }

      try {
        const virtualItems = virtualizer.getVirtualItems();
        const scrollOffset = scrollElement.scrollTop;
        
        // Capture measurements cache for better restoration of dynamic heights
        const measurementsCache: Record<number, { size: number; start: number; end: number }> = {};
        if (virtualizer.measurementsCache) {
          // Only save a reasonable subset to avoid excessive storage
          const maxCacheEntries = 100;
          let savedEntries = 0;
          for (const [index, measurement] of Object.entries(virtualizer.measurementsCache)) {
            if (savedEntries >= maxCacheEntries) break;
            if (measurement && typeof measurement.size === 'number') {
              measurementsCache[Number(index)] = {
                size: measurement.size,
                start: measurement.start || 0,
                end: measurement.end || measurement.size
              };
              savedEntries++;
            }
          }
        }
        
        const state: VirtualScrollState = {
          scrollOffset,
          visibleStartIndex: virtualItems.length > 0 ? virtualItems[0].index : 0,
          visibleEndIndex: virtualItems.length > 0 ? virtualItems[virtualItems.length - 1].index : 0,
          itemCount: virtualizer.options.count,
          timestamp: Date.now(),
          measurementsCache: Object.keys(measurementsCache).length > 0 ? measurementsCache : undefined,
          totalSize: virtualizer.getTotalSize(),
          scrollElementHeight: scrollElement.clientHeight,
          // Additional state for preventing jitter
          noteIds: options?.getCurrentNoteIds?.(),
          windowWidth: typeof window !== 'undefined' ? window.innerWidth : undefined,
          imageDimensionsCache: options?.getImageDimensionsCache?.(),
          asciiCache: options?.getAsciiCache?.(),
        };

        sessionStorage.setItem(key, JSON.stringify(state));
        
        // Also save to history.state as backup for browser navigation
        try {
          const newState = { 
            ...window.history.state, 
            virtualScroll: { 
              ...window.history.state?.virtualScroll, 
              [id]: scrollOffset 
            } 
          };
          window.history.replaceState(newState, '');
        } catch {}
      } catch (error) {
        // Ignore storage errors
        console.warn('Failed to save virtual scroll position:', error);
      }
    };

    const onScroll = () => {
      // Mark that the user has interacted, to suppress further auto-restoration
      userInteractedRef.current = true;
      lastUserInteractionRef.current = Date.now(); // Update interaction timing for monitoring
      
      // MOBILE FIX: More aggressive user interaction detection on mobile
      const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
      if (isMobile) {
        // On mobile, any scroll event should be considered user interaction
        // This prevents the monitoring system from correcting position after user scrolls
        console.log(`👆 Mobile scroll detected, updating interaction time`);
      }
      
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
      saveDisabledUntilRef.current = Date.now() + 1500;
    };

    scrollElement.addEventListener("scroll", onScroll, { passive: true });
    scrollElement.addEventListener("click", onClickCapture, true);

    // Save once on unmount in case the last movement didn't trigger due to debounce
    return () => {
      scrollElement.removeEventListener("scroll", onScroll);
      scrollElement.removeEventListener("click", onClickCapture, true);
      
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
        
        // If a save is pending and not suppressed, flush it before unmount
        if (Date.now() >= saveDisabledUntilRef.current) {
          saveNow();
        }
      }
    };
  }, [virtualizer, scrollElement, id, pathname, debounceMs, enabled]);

  // Provide a function to manually clear the saved position
  const clearSavedPosition = () => {
    const key = buildStorageKey(id, pathname);
    try {
      sessionStorage.removeItem(key);
    } catch {}
  };

  // Cleanup effect for timers
  useEffect(() => {
    return () => {
      if (dataStabilityTimerRef.current) {
        clearTimeout(dataStabilityTimerRef.current);
        dataStabilityTimerRef.current = null;
      }
    };
  }, []);

  return {
    isRestored: restoredRef.current,
    clearSavedPosition,
  };
}

export default useVirtualScrollRestoration;
