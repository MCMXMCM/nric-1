import { useCallback, useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRouter } from '@tanstack/react-router';
import { usePersistentImageCache } from './usePersistentImageCache';
import { extractImageUrls } from '../components/media/OptimizedImage';

interface Note {
  id: string;
  content: string;
  created_at: number;
  pubkey: string;
  tags: string[][];
  kind: number;
  [key: string]: any;
}

interface StableVirtualFeedConfig {
  notes: Note[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  parentRef: React.RefObject<HTMLDivElement>;
  overscan?: number;
  estimateSize?: (index: number) => number;
  scrollRestorationKey?: string;
  preserveScrollOnNavigation?: boolean;
  onItemMeasured?: (index: number, height: number) => void;
  debug?: boolean;
}

interface ItemMeasurement {
  height: number;
  timestamp: number;
  contentHash: string;
  hasImages: boolean;
  imageCount: number;
}

const MEASUREMENT_CACHE_KEY = 'nostree-virtual-measurements';
const MEASUREMENT_MAX_AGE = 30 * 60 * 1000; // 30 minutes
const MIN_ITEM_HEIGHT = 120;
const MAX_ITEM_HEIGHT = 1200;
const DEFAULT_ITEM_HEIGHT = 200;

/**
 * Stable virtual feed hook that prevents measurement issues during navigation.
 * Features:
 * - Persistent item height measurements
 * - Image-aware size estimation
 * - Navigation-safe scroll restoration
 * - Debounced re-measurements
 * - Content-based cache invalidation
 */
export function useStableVirtualFeed(config: StableVirtualFeedConfig) {
  const {
    notes,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    parentRef,
    overscan = 5,
    estimateSize,
    // scrollRestorationKey = 'main-feed', // Not used in this implementation
    preserveScrollOnNavigation = true,
    onItemMeasured,
    debug = false
  } = config;

  const router = useRouter();
  const imageCache = usePersistentImageCache();
  
  // Measurement cache
  const measurementCache = useRef<Map<string, ItemMeasurement>>(new Map());
  const isRestoringScroll = useRef(false);
  const measurementTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMeasurementTime = useRef<Map<string, number>>(new Map());

  // Initialize measurement cache from storage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(MEASUREMENT_CACHE_KEY);
      if (stored) {
        const entries: [string, ItemMeasurement][] = JSON.parse(stored);
        const now = Date.now();
        
        // Filter out expired measurements
        const validEntries = entries.filter(([, measurement]) => 
          (now - measurement.timestamp) < MEASUREMENT_MAX_AGE
        );
        
        measurementCache.current = new Map(validEntries);
        
        if (debug) {
          console.log(`📏 Loaded ${validEntries.length} cached measurements`);
        }
      }
    } catch (error) {
      console.warn('Failed to load measurement cache:', error);
    }
  }, [debug]);

  // Persist measurement cache
  const persistMeasurements = useCallback(() => {
    try {
      const entries = Array.from(measurementCache.current.entries());
      localStorage.setItem(MEASUREMENT_CACHE_KEY, JSON.stringify(entries));
    } catch (error) {
      console.warn('Failed to persist measurements:', error);
    }
  }, []);

  // Create content hash for cache invalidation
  const createContentHash = useCallback((note: Note): string => {
    // Hash based on content and key metadata that affects height
    const hashData = {
      content: note.content,
      kind: note.kind,
      hasReply: note.tags.some(tag => tag[0] === 'e'),
      imageCount: extractImageUrls(note.content).length
    };
    
    // Use a simple hash instead of btoa to avoid Unicode issues
    const jsonString = JSON.stringify(hashData);
    let hash = 0;
    for (let i = 0; i < jsonString.length; i++) {
      const char = jsonString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36).slice(0, 16);
  }, []);

  // Enhanced size estimation with image cache integration
  const enhancedEstimateSize = useCallback((index: number): number => {
    if (index >= notes.length) return DEFAULT_ITEM_HEIGHT;
    
    const note = notes[index];
    if (!note) return DEFAULT_ITEM_HEIGHT;
    
    // Check for cached measurement first
    const contentHash = createContentHash(note);
    const cached = measurementCache.current.get(note.id);
    
    if (cached && cached.contentHash === contentHash) {
      return Math.max(MIN_ITEM_HEIGHT, Math.min(cached.height, MAX_ITEM_HEIGHT));
    }
    
    // Use custom estimator if provided
    if (estimateSize) {
      const estimate = estimateSize(index);
      return Math.max(MIN_ITEM_HEIGHT, Math.min(estimate, MAX_ITEM_HEIGHT));
    }
    
    // Enhanced default estimation
    let estimatedHeight = MIN_ITEM_HEIGHT; // Base height
    
    // Content-based estimation
    const contentLines = Math.ceil(note.content.length / 80); // ~80 chars per line
    estimatedHeight += contentLines * 20; // ~20px per line
    
    // Image-based estimation with cache awareness
    const imageUrls = extractImageUrls(note.content);
    if (imageUrls.length > 0) {
      let imageHeight = 0;
      
      // Try to get actual dimensions from cache
      const cachedDimensions = imageUrls
        .map(url => imageCache.getCachedDimensions(url))
        .filter(Boolean);
      
      if (cachedDimensions.length > 0) {
        // Use actual cached dimensions
        const containerWidth = (parentRef.current?.clientWidth || 600) - 64; // Account for padding
        imageHeight = cachedDimensions.reduce((total, dims) => {
          if (!dims) return total;
          const displayHeight = containerWidth / dims.aspectRatio;
          return total + Math.min(displayHeight, 400); // Max 400px per image
        }, 0);
      } else {
        // Fallback estimation
        imageHeight = imageUrls.length * 250; // ~250px per image
      }
      
      estimatedHeight += imageHeight;
    }
    
    // Reply/repost adjustments
    if (note.tags.some(tag => tag[0] === 'e')) estimatedHeight += 40; // Reply indicator
    if (note.kind === 6) estimatedHeight += 80; // Repost content
    
    return Math.max(MIN_ITEM_HEIGHT, Math.min(estimatedHeight, MAX_ITEM_HEIGHT));
  }, [notes, createContentHash, estimateSize, imageCache, parentRef]);

  // Create virtualizer with stable measurements
  const virtualizer = useVirtualizer({
    count: notes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: enhancedEstimateSize,
    overscan,
    
    // Custom measurement function that respects navigation state
    measureElement: (element) => {
      // Skip measurements during scroll restoration to prevent jitter
      if (isRestoringScroll.current) {
        return 0; // Return 0 instead of undefined to satisfy type requirements
      }
      
      const height = element.getBoundingClientRect().height;
      
      // Validate measurement
      if (height < MIN_ITEM_HEIGHT || height > MAX_ITEM_HEIGHT) {
        if (debug) {
          console.warn(`📏 Invalid measurement: ${height}px, using estimate`);
        }
        return estimateSize ? estimateSize(0) : MIN_ITEM_HEIGHT; // Return estimate or fallback
      }
      
      return height;
    },
  });

  // Debounced measurement caching
  const cacheMeasurement = useCallback((noteId: string, height: number, contentHash: string, hasImages: boolean, imageCount: number) => {
    // Debounce measurements to prevent excessive updates
    const lastMeasurement = lastMeasurementTime.current.get(noteId) || 0;
    const now = Date.now();
    
    if (now - lastMeasurement < 100) { // Debounce 100ms
      return;
    }
    
    lastMeasurementTime.current.set(noteId, now);
    
    const measurement: ItemMeasurement = {
      height,
      timestamp: now,
      contentHash,
      hasImages,
      imageCount
    };
    
    measurementCache.current.set(noteId, measurement);
    
    // Persist measurements periodically
    if (measurementTimeout.current) {
      clearTimeout(measurementTimeout.current);
    }
    
    measurementTimeout.current = setTimeout(() => {
      persistMeasurements();
      measurementTimeout.current = null;
    }, 1000);
    
    if (debug) {
      console.log(`📏 Cached measurement for ${noteId}: ${height}px`);
    }
    
    // Notify parent
    if (onItemMeasured) {
      onItemMeasured(notes.findIndex(n => n.id === noteId), height);
    }
  }, [notes, persistMeasurements, onItemMeasured, debug]);

  // Handle item measurement updates
  const handleItemMeasured = useCallback((index: number, height: number) => {
    if (index >= notes.length) return;
    
    const note = notes[index];
    if (!note) return;
    
    const contentHash = createContentHash(note);
    const imageUrls = extractImageUrls(note.content);
    
    cacheMeasurement(
      note.id, 
      height, 
      contentHash, 
      imageUrls.length > 0, 
      imageUrls.length
    );
  }, [notes, createContentHash, cacheMeasurement]);

  // Scroll restoration handling
  useEffect(() => {
    if (!preserveScrollOnNavigation) return;
    
    const routerState = router.state.location.state as any;
    const isReturningFromNavigation = routerState?.fromFeed || routerState?.restoreIndex !== undefined;
    
    if (isReturningFromNavigation && notes.length > 0) {
      isRestoringScroll.current = true;
      
      if (debug) {
        console.log('🔄 Starting scroll restoration, blocking measurements');
      }
      
      // Allow measurements after scroll restoration completes
      const restoreTimeout = setTimeout(() => {
        isRestoringScroll.current = false;
        if (debug) {
          console.log('✅ Scroll restoration complete, enabling measurements');
        }
      }, 1000); // Give enough time for scroll restoration
      
      return () => clearTimeout(restoreTimeout);
    }
  }, [router.state.location.state, preserveScrollOnNavigation, notes.length, debug]);

  // Infinite scroll handling
  useEffect(() => {
    // Skip during scroll restoration
    if (isRestoringScroll.current) return;
    
    const virtualItems = virtualizer.getVirtualItems();
    if (virtualItems.length === 0) return;
    
    const lastItem = virtualItems[virtualItems.length - 1];
    
    // Calculate dynamic buffer based on viewport
    const viewportHeight = parentRef.current?.clientHeight ?? 800;
    const averageItemHeight = virtualizer.getTotalSize() / notes.length || DEFAULT_ITEM_HEIGHT;
    const itemsPerViewport = Math.ceil(viewportHeight / averageItemHeight);
    
    // Use 2-3 viewports as buffer, minimum 10 items
    const bufferSize = Math.max(itemsPerViewport * 2, 10);
    const triggerIndex = notes.length - bufferSize;
    
    if (
      lastItem.index >= triggerIndex &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      if (debug) {
        console.log(`🔄 Infinite scroll triggered at index ${lastItem.index}/${notes.length}`);
      }
      fetchNextPage();
    }
  }, [
    virtualizer,
    notes.length,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    parentRef,
    debug
  ]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (measurementTimeout.current) {
        clearTimeout(measurementTimeout.current);
        persistMeasurements(); // Final persist on unmount
      }
    };
  }, [persistMeasurements]);

  // Get cache statistics for debugging
  const getCacheStats = useCallback(() => {
    const measurements = Array.from(measurementCache.current.values());
    const now = Date.now();
    
    return {
      totalMeasurements: measurements.length,
      validMeasurements: measurements.filter(m => (now - m.timestamp) < MEASUREMENT_MAX_AGE).length,
      averageHeight: measurements.length > 0 
        ? measurements.reduce((sum, m) => sum + m.height, 0) / measurements.length 
        : 0,
      imagesWithMeasurements: measurements.filter(m => m.hasImages).length,
      oldestMeasurement: Math.min(...measurements.map(m => m.timestamp)),
      newestMeasurement: Math.max(...measurements.map(m => m.timestamp))
    };
  }, []);

  return {
    virtualizer,
    virtualItems: virtualizer.getVirtualItems(),
    totalSize: virtualizer.getTotalSize(),
    
    // Measurement handling
    handleItemMeasured,
    
    // State
    isRestoringScroll: isRestoringScroll.current,
    
    // Debug utilities
    getCacheStats,
    
    // Manual operations
    clearMeasurementCache: () => {
      measurementCache.current.clear();
      localStorage.removeItem(MEASUREMENT_CACHE_KEY);
      if (debug) {
        console.log('📏 Measurement cache cleared');
      }
    }
  };
}
