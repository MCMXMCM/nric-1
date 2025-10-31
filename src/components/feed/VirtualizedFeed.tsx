import React, {
  useRef,
  useEffect,
  useMemo,
  useCallback,
  useState,
} from "react";
import { useLocation } from "@tanstack/react-router";
import {
  useVirtualizer,
  type VirtualItem,
  type Virtualizer,
} from "@tanstack/react-virtual";
import { NoteCard } from "../NoteCard";
import { NoteCardErrorBoundary } from "../ErrorBoundary";
import {
  getInitialVirtualScrollState,
  useVirtualScrollRestoration,
} from "../../hooks/useVirtualScrollRestoration";
import { getGlobalScrollStabilizer } from "../../hooks/useScrollRestorationStabilizer";
import { useNoteDynamicHeight } from "../../hooks/useNoteDynamicHeight";
import { usePullToRefresh } from "../../hooks/usePullToRefresh";
import { PullToRefreshIndicator } from "../ui/PullToRefreshIndicator";
import type { Note, Metadata } from "../../types/nostr/types";
import { useRouterAwareScrollRestoration } from "../../hooks/useRouterAwareScrollRestoration";
import { usePersistentImageCache } from "../../hooks/usePersistentImageCache";

// ResizeObserver-enabled virtual item component
interface VirtualizedNoteItemProps {
  virtualItem: VirtualItem;
  isMobile: boolean;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  children: React.ReactNode;
  noteId?: string;
  storageKey?: string;
  recordActualHeight?: (
    noteId: string,
    actualHeight: number,
    profileKey?: string
  ) => void;
}

const VirtualizedNoteItem: React.FC<VirtualizedNoteItemProps> = ({
  virtualItem,
  virtualizer,
  children,
  noteId,
  storageKey,
  recordActualHeight,
}) => {
  const itemRef = useRef<HTMLDivElement>(null);
  const lastMeasuredHeight = useRef<number>(0);

  useEffect(() => {
    if (!itemRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      // ✅ Enhanced resize handling with image loading awareness
      const stabilizer = getGlobalScrollStabilizer();
      if (stabilizer.isStabilizing()) {
        return;
      }

      for (const entry of entries) {
        const newHeight = entry.contentRect.height;

        // Record the actual height immediately for better initial estimates
        if (noteId && recordActualHeight && storageKey && newHeight > 0) {
          recordActualHeight(noteId, newHeight, storageKey);
        }

        // More conservative threshold for image-related height changes
        const delta = Math.abs(newHeight - lastMeasuredHeight.current);
        const isSignificantChange = delta > 5; // Reduced threshold for better responsiveness

        if (isSignificantChange) {
          lastMeasuredHeight.current = newHeight;

          // Check if this is likely an image loading event before the timeout
          const el = itemRef.current;
          const hasImages = el?.querySelector("img");
          const hasLoadingImages =
            hasImages &&
            el &&
            Array.from(el.querySelectorAll("img")).some((img) => !img.complete);

          // ✅ Enhanced debounced remeasurement with scroll position preservation
          setTimeout(
            () => {
              const stabilizer = getGlobalScrollStabilizer();
              if (!stabilizer.isStabilizing() && itemRef.current) {
                requestAnimationFrame(() => {
                  const el = itemRef.current;
                  if (el) {
                    // For image loading events, use more conservative scroll adjustment
                    const firstVisible = virtualizer.getVirtualItems()[0];
                    const isAboveViewport =
                      firstVisible && virtualItem.index < firstVisible.index;
                    const scrollEl =
                      (virtualizer.options as any).getScrollElement?.() || null;

                    if (isAboveViewport && scrollEl) {
                      const before = el.getBoundingClientRect().height;
                      virtualizer.measureElement(el);
                      const after = el.getBoundingClientRect().height;
                      const heightChange = Math.round(after - before);

                      // Only adjust scroll if the change is significant and not just image loading
                      if (
                        heightChange !== 0 &&
                        (!hasLoadingImages || Math.abs(heightChange) > 20)
                      ) {
                        (scrollEl as HTMLElement).scrollTop += heightChange;
                      }
                    } else {
                      // For items in viewport, just trigger remeasurement without scroll adjustment
                      virtualizer.measureElement(el);
                    }
                  }
                });
              }
            },
            hasLoadingImages ? 100 : 50
          ); // Longer delay for image loading events
        }
      }
    });

    resizeObserver.observe(itemRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [virtualizer, noteId, recordActualHeight, storageKey]);

  return (
    <div
      ref={itemRef}
      data-index={virtualItem.index}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        minHeight: "100px", // Prevent collapse during measurement
        height: "auto", // Let content determine height
        transform: `translateY(${virtualItem.start}px)`,
        overflow: "visible",
        overflowX: "visible", // Allow radial menu to extend outside
        boxSizing: "border-box",
        zIndex: 1,
        contain: "layout", // Remove style containment to allow radial menu overflow
      }}
    >
      {children}
    </div>
  );
};

interface VirtualizedFeedProps {
  notes: Note[];
  metadata: Record<string, Metadata>;
  asciiCache: Record<string, { ascii: string; timestamp: number }>;
  isDarkMode: boolean;
  useAscii: boolean;
  useColor: boolean;
  isMobile: boolean;
  copiedPubkeys: Set<string>;
  setCopiedPubkeys: React.Dispatch<React.SetStateAction<Set<string>>>;
  setFullScreenImage: (url: string | null) => void;
  onAsciiRendered: (url: string, ascii: string) => void;
  setAsciiCache?: React.Dispatch<
    React.SetStateAction<Record<string, { ascii: string; timestamp: number }>>
  >;
  onMediaLoadError: (noteId: string) => void;
  getDisplayNameForPubkey: (pubkey: string) => string;
  imageMode: boolean;
  readRelayUrls: string[];
  writeRelayUrls: string[];
  showZapModal: boolean;
  setShowZapModal: (show: boolean) => void;
  updateZapModalState: (noteId: string | null) => void;
  showRepostModal: boolean;
  setShowRepostModal: (show: boolean) => void;
  updateRepostModalState: (noteId: string | null) => void;
  onHashtagClick: (hashtag: string) => void;
  isAnyModalOpen?: boolean;
  // Infinite scroll props
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  // Pull to refresh props
  // Scroll control props
  onScrollToTopRef?: React.MutableRefObject<(() => void) | null>;
  onRefresh?: () => Promise<void> | void;
  // Scroll restoration storage key (defaults to "main-feed")
  storageKey?: string;
  // Use simple virtual scroll restoration instead of router-aware (for profile notes on mobile)
  useSimpleScrollRestoration?: boolean;
  // Debug scroll restoration
  debug?: boolean;
  // Notify parent with the virtualizer instance so hotkeys can scroll the correct container
  onVirtualizerReady?: (v: Virtualizer<HTMLDivElement, Element>) => void;
}

export const VirtualizedFeed: React.FC<VirtualizedFeedProps> = ({
  notes,
  metadata,
  asciiCache,
  isDarkMode,
  useAscii,
  useColor,
  isMobile,
  copiedPubkeys,
  setCopiedPubkeys,
  setFullScreenImage,
  onAsciiRendered,
  setAsciiCache,
  onMediaLoadError,
  getDisplayNameForPubkey,
  imageMode,
  readRelayUrls,
  writeRelayUrls,
  showZapModal,
  setShowZapModal,
  updateZapModalState,
  showRepostModal,
  setShowRepostModal,
  updateRepostModalState,
  onHashtagClick,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  onScrollToTopRef,
  onRefresh,
  storageKey = "main-feed",
  useSimpleScrollRestoration,
  debug,
  onVirtualizerReady,
}) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const isRestoringRef = useRef(false);
  const [restoreGeneration, setRestoreGeneration] = useState(0);

  // Note: Keyboard navigation spacing is now handled in FeedWithHotkeys via scroll adjustment
  // Track the last index that triggered a fetch to avoid duplicate triggers
  const lastFetchIndexRef = useRef<number>(-1);
  // Limit prefetch attempts when content is not scrollable
  const noScrollPrefetchCountRef = useRef<number>(0);
  // Track if we've done initial setup to allow first automatic fetch
  const hasInitializedRef = useRef(false);

  // Track media query changes for responsive height estimation
  const [windowWidth, setWindowWidth] = React.useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 768
  );

  // Optional: only use non-position caches (image/ascii). Avoid initial offset/measurements to reduce conflicts with router-aware restoration
  const initialScrollState = useMemo(() => {
    return getInitialVirtualScrollState(storageKey, location.pathname, {
      maxAge: 30 * 60 * 1000,
      minItemCount: 5,
      currentNotes: notes,
    });
  }, [location.pathname, notes, storageKey]);

  // Track whether we're in scroll restoration mode to optimize rendering
  const isScrollRestoring = useMemo(() => {
    try {
      return sessionStorage.getItem("virtualScrollRestorationLock") === "true";
    } catch {
      return false;
    }
  }, []);

  // Detect iOS Safari navigation gestures (swipe-back)
  const isNavigatingRef = useRef(false);
  const resizeTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Detect navigation start/end for iOS Safari
    const handlePageShow = () => {
      isNavigatingRef.current = false;
    };

    const handlePageHide = () => {
      isNavigatingRef.current = true;
    };

    // Handle resize with intelligent debouncing
    const handleResize = () => {
      // Skip resize handling during navigation gestures
      if (isNavigatingRef.current || isScrollRestoring) {
        console.log("🚫 Skipping resize during navigation/restoration");
        return;
      }

      // Clear existing timeout
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }

      // Debounce resize updates - longer delay for iOS to avoid swipe gesture interference
      const debounceMs = /iPad|iPhone|iPod/.test(navigator.userAgent)
        ? 500
        : 200;

      resizeTimeoutRef.current = window.setTimeout(() => {
        // Double-check we're not navigating
        if (!isNavigatingRef.current && !isScrollRestoring) {
          setWindowWidth(window.innerWidth);
        }
      }, debounceMs);
    };

    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("resize", handleResize);

    // Reset navigation state after a short delay on mount
    const initTimeout = setTimeout(() => {
      isNavigatingRef.current = false;
    }, 300);

    return () => {
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("resize", handleResize);
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      clearTimeout(initTimeout);
    };
  }, [isScrollRestoring]);

  // Mark as initialized after a short delay to allow initial content to settle
  useEffect(() => {
    const timer = setTimeout(() => {
      hasInitializedRef.current = true;
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  // No longer need user scroll detection - removed to fix infinite scroll

  // Pull to refresh hook - only enable on mobile and when onRefresh is provided
  const pullToRefresh = usePullToRefresh({
    onRefresh: onRefresh || (() => {}),
    threshold: 80,
    enabled: isMobile && !!onRefresh,
    pullDistance: 120,
  });

  // Persist the last feed path for reliable backToPath in thread navigations
  useEffect(() => {
    try {
      if (location.pathname === "/") {
        const path = `${location.pathname}${location.search || ""}`;
        sessionStorage.setItem("lastFeedPath", path);
        // Also update a back target path used by radial menu fallback
        sessionStorage.setItem("backTargetPath", path);
      }
    } catch {}
  }, [location.pathname, location.search]);

  // Bind pull-to-refresh to the parent container
  useEffect(() => {
    if (parentRef.current && isMobile && onRefresh) {
      pullToRefresh.bindToContainer(parentRef.current);
    }
  }, [pullToRefresh, isMobile, onRefresh]);

  // Dynamic height calculation hook with measurement callbacks
  const {
    createHeightEstimator,
    recordImageDimensions,
    recordActualHeight,
    clearDimensionsCache,
    restoreImageDimensionsCache,
  } = useNoteDynamicHeight({
    isMobile,
    imageMode,
    showFullContent: false, // In feed, we don't show full content
    onHeightChange: (noteId: string) => {
      // Find the note index and trigger re-measurement
      const noteIndex = notes.findIndex((note) => note.id === noteId);
      if (noteIndex >= 0 && virtualizer) {
        // Use a more reliable method to trigger re-measurement
        const element = parentRef.current?.querySelector(
          `[data-index="${noteIndex}"]`
        );
        if (element) {
          // Force immediate re-measurement of this specific element
          virtualizer.measureElement(element);
        }
      }
    },
  });

  // Image cache for height estimation
  const imageCache = usePersistentImageCache();

  // Function to get cached image dimensions for height estimation
  const getCachedImageDimensions = useCallback(
    (imageUrl: string) => {
      return imageCache.getCachedDimensions(imageUrl);
    },
    [imageCache]
  );

  // Restore cached image dimensions when initial scroll state is available
  useEffect(() => {
    if (initialScrollState?.cachedImageDimensions) {
      restoreImageDimensionsCache(initialScrollState.cachedImageDimensions);
    }
  }, [initialScrollState?.cachedImageDimensions, restoreImageDimensionsCache]);

  // Restore cached ASCII content when initial scroll state is available
  useEffect(() => {
    if (initialScrollState?.cachedAsciiCache && setAsciiCache) {
      // Merge the cached ASCII content with existing cache
      // This ensures we don't lose any ASCII content that was rendered after the scroll state was saved
      const mergedAsciiCache = {
        ...asciiCache,
        ...initialScrollState.cachedAsciiCache,
      };
      // Only update if there are new entries to avoid unnecessary re-renders
      const hasNewEntries = Object.keys(
        initialScrollState.cachedAsciiCache
      ).some(
        (url) =>
          !asciiCache[url] ||
          asciiCache[url].timestamp <
            initialScrollState.cachedAsciiCache![url].timestamp
      );
      if (hasNewEntries) {
        setAsciiCache(mergedAsciiCache);
        console.log(
          `🔄 Restored ${
            Object.keys(initialScrollState.cachedAsciiCache).length
          } cached ASCII entries`
        );
      }
    }
  }, [initialScrollState?.cachedAsciiCache, asciiCache, setAsciiCache]);

  // Create height estimator function based on current notes and window size
  const estimateSize = useMemo(() => {
    // Clear dimensions cache when notes or window size changes
    clearDimensionsCache();

    // Create estimator with current window dimensions and profile key
    const estimator = createHeightEstimator(notes, storageKey);

    // Enhance estimator with media-aware calculations using cached image dimensions
    return (index: number) => {
      const baseEstimate = estimator(index);

      // Adjust estimate based on current window width and cached image dimensions
      if (index < notes.length) {
        const note = notes[index];
        const safeContent =
          typeof note.content === "string"
            ? note.content
            : String(note.content ?? "");
        const imageUrls =
          safeContent.match(/https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp)/gi) ||
          [];

        if (imageUrls.length > 0 && imageMode) {
          // Try to use cached image dimensions for more accurate estimates
          let totalImageHeight = 0;
          let hasCachedDimensions = false;

          for (const imageUrl of imageUrls) {
            const cached = getCachedImageDimensions(imageUrl);
            if (cached) {
              hasCachedDimensions = true;
              // Calculate display height based on container width
              const containerWidth = windowWidth - (isMobile ? 32 : 64);
              const displayHeight = Math.min(
                (cached.height / cached.width) * containerWidth,
                containerWidth * 0.8 // Max height constraint
              );
              totalImageHeight += displayHeight;
            }
          }

          if (hasCachedDimensions) {
            // Use cached dimensions for accurate height estimation
            const imageGridHeight =
              Math.ceil(imageUrls.length / 2) *
              (totalImageHeight / imageUrls.length);
            return Math.max(baseEstimate, baseEstimate + imageGridHeight);
          } else {
            // Fallback to generous estimates when no cached dimensions
            const containerWidth = windowWidth - (isMobile ? 32 : 64);
            const aspectRatioMultiplier = imageUrls.length === 1 ? 1.3 : 1.1;
            return Math.max(
              baseEstimate,
              containerWidth * aspectRatioMultiplier * 0.8
            );
          }
        }
      }

      return baseEstimate;
    };
  }, [
    createHeightEstimator,
    notes,
    clearDimensionsCache,
    windowWidth,
    isMobile,
    imageMode,
    getCachedImageDimensions,
  ]);

  const virtualizer = useVirtualizer({
    count: notes.length,
    getScrollElement: () => parentRef.current,
    estimateSize,
    overscan: isMobile ? 1 : 3, // Reduce offscreen rendering on mobile/iOS to save memory
    // Do not set initialOffset; router-aware restoration will position precisely by id+offset
    // Note: TanStack Virtual doesn't support initialMeasurementsCache directly
    // We'll apply cached measurements in the measureElement function
    // Enhanced measureElement that considers scroll restoration state
    measureElement: (element, _entry, instance) => {
      const direction = instance.scrollDirection;
      const height = element.getBoundingClientRect().height;
      const minHeight = Math.max(height, 50); // Minimum height to prevent zero-height issues
      const indexKey = Number(element.getAttribute("data-index"));

      // Check if this is repost content that needs special handling during restoration
      const note = notes[indexKey];
      const isRepostContent =
        note && (note.kind === 6 || note.tags?.some((tag) => tag[0] === "e"));

      // During scroll restoration, use cached measurements to prevent jitter
      // BUT allow fresh measurement for repost content to prevent clipping
      if (isScrollRestoring && !isRepostContent) {
        const cachedMeasurement = instance.measurementsCache[indexKey]?.size;
        if (cachedMeasurement && cachedMeasurement > 0) {
          return cachedMeasurement;
        }
      }

      // Check if we have a cached measurement from initial state
      if (initialScrollState?.initialMeasurementsCache?.[indexKey]) {
        const cachedMeasurement =
          initialScrollState.initialMeasurementsCache[indexKey];
        const cachedSize = cachedMeasurement?.size;
        if (cachedSize && cachedSize > 0) {
          // Apply the cached measurement to the virtualizer's cache
          if (instance.measurementsCache[indexKey]?.size !== cachedSize) {
            // Type assertion needed for TanStack Virtual internal cache
            (instance.measurementsCache as any)[indexKey] = {
              size: cachedSize,
              start: cachedMeasurement.start || 0,
              end: cachedMeasurement.end || cachedSize,
            };
          }
          return cachedSize;
        }
      }

      // Check for images that are still loading and use cached dimensions
      const images = element.querySelectorAll("img");
      let additionalImageHeight = 0;
      let hasLoadingImages = false;

      for (const img of images) {
        if (!img.complete) {
          hasLoadingImages = true;
          // Try to get cached dimensions for loading images
          const src = img.src;
          if (src) {
            const cached = imageCache.getCachedDimensions(src);
            if (cached) {
              // Calculate display height based on container width
              const containerWidth = windowWidth - (isMobile ? 32 : 64);
              const displayHeight = Math.min(
                (cached.height / cached.width) * containerWidth,
                containerWidth * 0.8
              );
              additionalImageHeight += displayHeight;
            }
          }
        }
      }

      if (direction === "forward" || direction === null) {
        // Allow remeasuring when scrolling down or direction is null
        return Math.max(minHeight + additionalImageHeight, 50);
      } else {
        // When scrolling up, use cached measurement to prevent stuttering
        const cachedMeasurement = instance.measurementsCache[indexKey]?.size;

        // Use cached measurement if available, otherwise measure fresh
        const baseHeight = cachedMeasurement || minHeight;

        // If we have loading images with cached dimensions, adjust the height
        if (hasLoadingImages && additionalImageHeight > 0) {
          return Math.max(baseHeight + additionalImageHeight, 50);
        }

        return baseHeight;
      }
    },
    // Enable range extraction for better performance
    rangeExtractor: (range) => {
      const start = Math.max(range.startIndex - range.overscan, 0);
      const end = Math.min(range.endIndex + range.overscan, notes.length - 1);

      const items = [];
      for (let i = start; i <= end; i++) {
        items.push(i);
      }
      return items;
    },
    // Enable smooth scrolling key generation
    getItemKey: (index) => notes[index]?.id || `note-${index}`,
  });

  // Expose virtualizer instance to parent for hotkey navigation
  useEffect(() => {
    if (onVirtualizerReady) onVirtualizerReady(virtualizer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [virtualizer]);

  // Batched re-measurement to handle multiple images loading
  const pendingMeasurements = useRef<Set<string>>(new Set());
  const measurementTimeout = useRef<number | null>(null);

  // Enhanced image dimension callback with batched re-measurement and restoration awareness
  const handleImageDimensionsLoaded = useCallback(
    (
      noteId: string,
      imageUrl: string,
      dimensions: { width: number; height: number }
    ) => {
      // Record the dimensions
      recordImageDimensions(noteId, imageUrl, dimensions);

      // Check if this is repost content that needs special handling during restoration
      const noteIndex = notes.findIndex((note) => note.id === noteId);
      const note = notes[noteIndex];
      const isRepostContent =
        note && (note.kind === 6 || note.tags?.some((tag) => tag[0] === "e"));

      // Only skip re-measurement during active scroll stabilization (not during general restoration)
      // BUT allow remeasurement for repost content to prevent clipping
      const stabilizer = getGlobalScrollStabilizer();
      if (stabilizer.isStabilizing() && !isRepostContent) {
        console.log(
          `🔒 Skipping re-measurement for Note ${noteId} during scroll stabilization`
        );
        return;
      }

      // ✅ CRITICAL: Allow remeasurement when images load, even during restoration
      // This prevents content clipping when images load after navigation return
      // Especially important for repost content which has dynamic heights

      // Add to pending measurements
      pendingMeasurements.current.add(noteId);

      // Clear existing timeout
      if (measurementTimeout.current) {
        clearTimeout(measurementTimeout.current);
      }

      // Batch measurements to avoid excessive re-measurements, but be more responsive for images
      measurementTimeout.current = window.setTimeout(() => {
        // Only skip during active scroll stabilization (not general restoration)
        // BUT allow remeasurement for repost content to prevent clipping
        const stabilizer = getGlobalScrollStabilizer();
        const hasRepostContent = Array.from(pendingMeasurements.current).some(
          (noteId) => {
            const noteIndex = notes.findIndex((note) => note.id === noteId);
            const note = notes[noteIndex];
            return (
              note &&
              (note.kind === 6 || note.tags?.some((tag) => tag[0] === "e"))
            );
          }
        );

        if (stabilizer.isStabilizing() && !hasRepostContent) {
          console.log(
            `🔒 Cancelling batched re-measurement during scroll stabilization`
          );
          pendingMeasurements.current.clear();
          return;
        }

        const notesToMeasure = Array.from(pendingMeasurements.current);
        pendingMeasurements.current.clear();

        if (virtualizer && parentRef.current) {
          notesToMeasure.forEach((noteId) => {
            const noteIndex = notes.findIndex((note) => note.id === noteId);
            if (noteIndex >= 0) {
              const element = parentRef.current?.querySelector(
                `[data-index="${noteIndex}"]`
              );
              if (element) {
                // Anchor-preserving remeasurement: always remeasure, but compensate scroll if item is above viewport
                const scrollEl = parentRef.current;
                const oldHeight = (
                  element as HTMLElement
                ).getBoundingClientRect().height;
                const firstVisible = virtualizer.getVirtualItems()[0];
                const isAboveViewport =
                  firstVisible && noteIndex < firstVisible.index;

                virtualizer.measureElement(element);

                const newHeight = (
                  element as HTMLElement
                ).getBoundingClientRect().height;
                const delta = Math.round(newHeight - oldHeight);
                if (delta !== 0) {
                  if (isAboveViewport && scrollEl) {
                    scrollEl.scrollTop += delta; // compensate to keep visible content anchored
                  }
                  console.log(
                    `📏 Note ${noteIndex} height updated: ${oldHeight}px → ${newHeight}px (Δ${delta}px)`
                  );
                }
              }
            }
          });
        }
      }, 100); // Reduced to 100ms for more responsive image remeasurement
    },
    [recordImageDimensions, notes, virtualizer]
  );

  // Handle window resize - trigger re-measurement for visible items
  useEffect(() => {
    if (!virtualizer) return;

    // Skip re-measurement during navigation or restoration
    if (
      isNavigatingRef.current ||
      isScrollRestoring ||
      isRestoringRef.current
    ) {
      console.log("🚫 Skipping re-measurement during navigation/restoration");
      return;
    }

    // When window width changes significantly, re-measure visible items
    const visibleItems = virtualizer.getVirtualItems();
    if (visibleItems.length > 0) {
      // Longer debounce for iOS to avoid swipe gesture interference
      const debounceMs = /iPad|iPhone|iPod/.test(navigator.userAgent)
        ? 400
        : 200;

      const timeout = setTimeout(() => {
        // Double-check we're not navigating
        if (
          isNavigatingRef.current ||
          isScrollRestoring ||
          isRestoringRef.current
        ) {
          return;
        }

        // Always remeasure on resize regardless of scroll direction
        // since layout changes affect all items
        visibleItems.forEach((item) => {
          const element = parentRef.current?.querySelector(
            `[data-index="${item.index}"]`
          );
          if (element) {
            virtualizer.measureElement(element);
          }
        });
        console.log(
          `🔄 Re-measured ${visibleItems.length} items after window resize`
        );
      }, debounceMs);

      return () => clearTimeout(timeout);
    }
  }, [windowWidth, virtualizer, isScrollRestoring]);

  // Track previous notes length to detect when new notes are added
  const prevNotesLengthRef = useRef(notes.length);

  // Handle new notes being loaded - trigger re-measurement for visible items
  useEffect(() => {
    if (!virtualizer || !parentRef.current) return;

    const currentLength = notes.length;
    const previousLength = prevNotesLengthRef.current;

    // Only remeasure if new notes were added (length increased)
    if (currentLength > previousLength) {
      // Debounced re-measurement after new notes load
      const timeout = setTimeout(() => {
        const visibleItems = virtualizer.getVirtualItems();

        if (visibleItems.length > 0) {
          // Re-measure all visible items to account for layout shifts
          visibleItems.forEach((item) => {
            const element = parentRef.current?.querySelector(
              `[data-index="${item.index}"]`
            );
            if (element) {
              // Force fresh measurement
              virtualizer.measureElement(element);
            }
          });

          console.log(
            `📐 Re-measured ${
              visibleItems.length
            } visible items after loading ${
              currentLength - previousLength
            } new notes`
          );
        }

        // Update the ref for next comparison
        prevNotesLengthRef.current = currentLength;
      }, 150); // Short delay to let new items render

      return () => clearTimeout(timeout);
    } else {
      // Update ref even if length didn't increase (or decreased)
      prevNotesLengthRef.current = currentLength;
    }
  }, [notes.length, virtualizer]);

  // Do not apply cached measurements here to avoid conflict with router-aware restoration timing

  // Get virtual items outside effect so we can track them in dependencies
  const virtualItems = virtualizer.getVirtualItems();
  const lastVisibleIndex =
    virtualItems.length > 0 ? virtualItems[virtualItems.length - 1]?.index : -1;

  // ✅ Enhanced infinite scroll - paused briefly during restoration
  useEffect(() => {
    const [lastVirtualItem] = [...virtualItems].reverse();

    if (!lastVirtualItem) return;

    // Pause infinite loading during and shortly after restoration
    if (isRestoringRef.current) return;

    // Wait for initial setup to complete before allowing fetches
    if (!hasInitializedRef.current) return;

    // Avoid re-triggering for the same visible last index
    if (lastFetchIndexRef.current === lastVirtualItem.index) return;

    // Calculate buffer zone based on device type and current notes
    // More aggressive buffering on mobile for smoother scrolling
    const isMobileDevice = window.innerWidth <= 768;
    const baseBuffer = isMobileDevice ? 15 : 20; // Increased base buffer items
    const dynamicBuffer = Math.min(Math.floor(notes.length * 0.15), 30); // 15% of notes, max 30
    const bufferZone = Math.max(baseBuffer, dynamicBuffer);

    // Start loading when we're within the buffer zone of the end
    const triggerIndex = Math.max(0, notes.length - bufferZone);

    // More aggressive triggering - start loading earlier
    if (
      lastVirtualItem.index >= triggerIndex &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      console.log(
        `🔄 Infinite scroll triggered: item ${lastVirtualItem.index}/${notes.length}, trigger at ${triggerIndex}, buffer ${bufferZone}`
      );
      fetchNextPage();
      lastFetchIndexRef.current = lastVirtualItem.index;
    }
  }, [
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    notes.length,
    virtualizer,
    restoreGeneration,
    lastVisibleIndex, // Track when the last visible item changes (user scrolled)
  ]);

  // Prefetch when content isn't scrollable yet (fill the viewport)
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    if (isRestoringRef.current) return;

    // Wait for initialization before prefetching
    if (!hasInitializedRef.current) return;

    const totalSize = virtualizer.getTotalSize();
    const viewport = el.clientHeight;

    // If we cannot scroll and we have more pages, prefetch up to 5 times to fill
    // Increased from 3 to 5 to better handle viewport filling
    if (
      totalSize > 0 &&
      totalSize <= viewport &&
      hasNextPage &&
      !isFetchingNextPage &&
      noScrollPrefetchCountRef.current < 5
    ) {
      console.log(
        `🔄 Prefetch triggered (attempt ${
          noScrollPrefetchCountRef.current + 1
        }/5): totalSize=${totalSize}px, viewport=${viewport}px`
      );
      noScrollPrefetchCountRef.current += 1;
      fetchNextPage();
    }
  }, [
    virtualizer,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    notes.length,
  ]);

  // Scroll restoration - use simple virtual restoration for profile notes on mobile
  // or router-aware restoration for main feed
  const simpleRestoration = useVirtualScrollRestoration(
    useSimpleScrollRestoration ? virtualizer : null,
    useSimpleScrollRestoration ? parentRef.current : null,
    storageKey,
    {
      enabled: useSimpleScrollRestoration === true,
      saveDebounceMs: 100,
      maxAge: 30 * 60 * 1000, // 30 minutes
      minItemCount: 5,
      waitForStableData: true,
      getCurrentNoteIds: () => notes.map((note) => note.id),
    }
  );

  const routerRestoration = useRouterAwareScrollRestoration({
    virtualizer: useSimpleScrollRestoration ? null : virtualizer,
    scrollElement: useSimpleScrollRestoration ? null : parentRef.current,
    notes,
    storageKey,
    debug,
    onRestoreStart: () => {
      isRestoringRef.current = true;
      setRestoreGeneration((g) => g + 1);
    },
    onRestoreComplete: () => {
      // Allow a short settling window
      setTimeout(() => {
        isRestoringRef.current = false;
        setRestoreGeneration((g) => g + 1);
      }, 300);
    },
  });

  // Clear saved position when notes change significantly (new filter, etc.)
  useEffect(() => {
    // Only clear if we have a substantial change in notes
    // This prevents clearing on minor updates like new notes being added
    if (notes.length === 0) {
      try {
        if (useSimpleScrollRestoration) {
          simpleRestoration.clearSavedPosition();
        } else {
          routerRestoration.clearSavedState();
        }
      } catch {}
    }
  }, [
    notes.length,
    useSimpleScrollRestoration,
    simpleRestoration,
    routerRestoration,
  ]);

  // Expose scroll to top function via ref
  useEffect(() => {
    if (onScrollToTopRef) {
      onScrollToTopRef.current = () => {
        if (parentRef.current && virtualizer) {
          // Clear saved scroll position to prevent restoration conflicts
          try {
            if (useSimpleScrollRestoration) {
              simpleRestoration.clearSavedPosition();
            } else {
              routerRestoration.clearSavedState();
            }
          } catch {}

          // Scroll to the top of the feed
          parentRef.current.scrollTop = 0;
          console.log(
            "📍 Scrolled virtual feed to top and cleared saved position"
          );
        }
      };
    }

    // Cleanup function to clear the ref when component unmounts
    return () => {
      if (onScrollToTopRef) {
        onScrollToTopRef.current = null;
      }
    };
  }, [
    onScrollToTopRef,
    virtualizer,
    useSimpleScrollRestoration,
    simpleRestoration,
    routerRestoration,
  ]);

  return (
    <div
      ref={parentRef}
      style={{
        height: "100%",
        overflow: "auto",
        overflowX: "hidden", // Keep horizontal scroll hidden for container
        WebkitOverflowScrolling: "touch" as any,
        width: "100%",
        position: "relative",
        // Prevent browser overflow anchoring from fighting virtualizer during media load/restoration
        overflowAnchor: "none" as any,
        // No margin/padding changes needed - spacing handled by scrollToIndex offset
        marginTop: "0",
        paddingTop: "0",
      }}
    >
      {/* Center wrapper for desktop - allows scrolling from anywhere while keeping content centered */}
      <div
        style={{
          width: "100%",
          maxWidth: isMobile ? "100%" : "1000px",
          margin: "0 auto",
          position: "relative",
          // Move the entire content down when pulling to refresh
          transform: isMobile && onRefresh && (pullToRefresh.isPulling || pullToRefresh.isRefreshing)
            ? `translateY(${pullToRefresh.pullDistance}px)`
            : undefined,
          transition: (pullToRefresh.isRefreshing && !pullToRefresh.isPulling) 
            ? "transform 0.2s ease" 
            : "none",
        }}
      >
        {/* Pull to refresh indicator - inside the translated wrapper so it moves with content */}
        {isMobile && onRefresh && (
          <PullToRefreshIndicator
            isPulling={pullToRefresh.isPulling}
            isRefreshing={pullToRefresh.isRefreshing}
            pullDistance={pullToRefresh.pullDistance}
            canRefresh={pullToRefresh.canRefresh}
            threshold={80}
            isDarkMode={isDarkMode}
          />
        )}
        <div
          style={{
            height: virtualizer.getTotalSize(),
            width: "100%",
            position: "relative",
            overflowX: "hidden", // Keep horizontal scroll hidden for virtual list
          }}
        >
          {virtualItems.map((virtualItem) => {
            const note = notes[virtualItem.index];
            if (!note) return null;

            return (
              <VirtualizedNoteItem
                key={note.id}
                virtualItem={virtualItem}
                isMobile={isMobile}
                virtualizer={virtualizer}
                noteId={note.id}
                storageKey={storageKey}
                recordActualHeight={recordActualHeight}
              >
                <NoteCardErrorBoundary>
                  <NoteCard
                    note={note}
                    index={virtualItem.index}
                    metadata={metadata}
                    asciiCache={asciiCache}
                    isDarkMode={isDarkMode}
                    useAscii={useAscii}
                    useColor={useColor}
                    isMobile={isMobile}
                    copiedPubkeys={copiedPubkeys}
                    setCopiedPubkeys={setCopiedPubkeys}
                    setFullScreenImage={setFullScreenImage}
                    onAsciiRendered={onAsciiRendered}
                    onMediaLoadError={onMediaLoadError}
                    onImageDimensionsLoaded={handleImageDimensionsLoaded}
                    getDisplayNameForPubkey={getDisplayNameForPubkey}
                    imageMode={imageMode}
                    readRelayUrls={readRelayUrls}
                    writeRelayUrls={writeRelayUrls}
                    showZapModal={showZapModal}
                    setShowZapModal={setShowZapModal}
                    updateZapModalState={updateZapModalState}
                    showRepostModal={showRepostModal}
                    setShowRepostModal={setShowRepostModal}
                    updateRepostModalState={updateRepostModalState}
                    onHashtagClick={onHashtagClick}
                  />
                </NoteCardErrorBoundary>
              </VirtualizedNoteItem>
            );
          })}
        </div>

        {/* Loading indicator and end-of-feed message at the bottom */}
        {isFetchingNextPage && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "1rem",
              color: "var(--text-color)",
              fontSize: "var(--font-size-sm)",
              opacity: 0.8,
              background: "var(--background-color)",
              borderTop: "1px solid var(--border-color)",
              margin: "0.5rem 0",
            }}
          >
            Loading more notes...
          </div>
        )}

        {/* End of feed indicator when no more pages available */}
        {!isFetchingNextPage && !hasNextPage && notes.length > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "2rem 1rem",
              color: "var(--text-color)",
              fontSize: "var(--font-size-sm)",
              opacity: 0.6,
              background: "var(--background-color)",
              borderTop: "1px solid var(--border-color)",
              margin: "0.5rem 0",
              textAlign: "center",
            }}
          >
            <div
              style={{
                marginBottom: "0.5rem",
                fontSize: "var(--font-size-lg)",
              }}
            >
              📄
            </div>
            <div style={{ fontWeight: "500", marginBottom: "0.25rem" }}>
              End of Feed
            </div>
            <div style={{ fontSize: "var(--font-size-base)", opacity: 0.8 }}>
              You've reached the end of available notes
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
