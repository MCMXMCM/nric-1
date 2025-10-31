import { useCallback, useRef, useEffect } from 'react';

interface ImageDimensions {
  width: number;
  height: number;
  aspectRatio: number;
  timestamp: number;
  naturalWidth: number;
  naturalHeight: number;
}

interface ImageCacheEntry extends ImageDimensions {
  url: string;
  noteId?: string;
  loadTime: number;
}

interface PersistentImageCacheOptions {
  maxAge?: number; // milliseconds, default 24 hours
  maxEntries?: number; // default 1000
  persistToStorage?: boolean; // default true
  storageKey?: string;
}

const DEFAULT_OPTIONS: Required<PersistentImageCacheOptions> = {
  maxAge: 12 * 60 * 60 * 1000, // Reduced from 24 to 12 hours
  maxEntries: 300, // Reduced from 1000 to 300 entries
  persistToStorage: true,
  storageKey: 'nostree-image-dimensions-cache'
};

/**
 * Persistent image dimensions cache that survives navigation and page reloads.
 * Optimized for TanStack Virtual to prevent layout shifts and re-measurements.
 */
export function usePersistentImageCache(options: PersistentImageCacheOptions = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const cache = useRef<Map<string, ImageCacheEntry>>(new Map());
  const initialized = useRef(false);

  // Initialize cache from localStorage on first use
  const initializeCache = useCallback(() => {
    if (initialized.current || !config.persistToStorage) return;
    
    try {
      const stored = localStorage.getItem(config.storageKey);
      if (stored) {
        const entries: [string, ImageCacheEntry][] = JSON.parse(stored);
        const now = Date.now();
        
        // Filter out expired entries during initialization
        const validEntries = entries.filter(([, entry]) => 
          (now - entry.timestamp) < config.maxAge
        );
        
        cache.current = new Map(validEntries);
        console.log(`📸 Image cache initialized with ${validEntries.length} entries`);
      } else {
        // No stored data, but still mark as initialized
        console.log(`📸 Image cache initialized with 0 entries (no stored data)`);
      }
    } catch (error) {
      console.warn('Failed to initialize image cache from storage:', error);
      cache.current = new Map();
    }
    
    initialized.current = true;
  }, [config.maxAge, config.persistToStorage, config.storageKey]);

  // Persist cache to localStorage
  const persistCache = useCallback(() => {
    if (!config.persistToStorage) return;
    
    try {
      const entries = Array.from(cache.current.entries());
      localStorage.setItem(config.storageKey, JSON.stringify(entries));
    } catch (error) {
      console.warn('Failed to persist image cache:', error);
    }
  }, [config.persistToStorage, config.storageKey]);

  // Clean up expired entries
  const cleanupCache = useCallback(() => {
    const now = Date.now();
    const entries = Array.from(cache.current.entries());
    const validEntries = entries.filter(([, entry]) => 
      (now - entry.timestamp) < config.maxAge
    );
    
    // If we removed entries or exceeded max size, rebuild cache
    if (validEntries.length !== entries.length || validEntries.length > config.maxEntries) {
      // Sort by timestamp (newest first) and take only maxEntries
      const sortedEntries = validEntries
        .sort(([, a], [, b]) => b.timestamp - a.timestamp)
        .slice(0, config.maxEntries);
      
      cache.current = new Map(sortedEntries);
      persistCache();
      
      console.log(`🧹 Image cache cleaned: ${entries.length} → ${sortedEntries.length} entries`);
    }
  }, [config.maxAge, config.maxEntries, persistCache]);

  // Initialize cache on first use (only once per mount)
  useEffect(() => {
    // Only initialize if not already initialized to prevent resets
    if (!initialized.current) {
      initializeCache();
    }
  }, [initializeCache]);

  // Periodic cleanup
  useEffect(() => {
    const interval = setInterval(cleanupCache, 5 * 60 * 1000); // Every 5 minutes
    return () => clearInterval(interval);
  }, [cleanupCache]);

  // Persist cache on unmount
  useEffect(() => {
    return () => {
      persistCache();
    };
  }, [persistCache]);

  /**
   * Cache image dimensions with metadata
   */
  const cacheImageDimensions = useCallback((
    url: string, 
    dimensions: {
      width: number;
      height: number;
      naturalWidth: number;
      naturalHeight: number;
    },
    noteId?: string
  ) => {
    if (!url || dimensions.width <= 0 || dimensions.height <= 0) return;
    
    initializeCache();
    
    const entry: ImageCacheEntry = {
      url,
      noteId,
      width: dimensions.width,
      height: dimensions.height,
      naturalWidth: dimensions.naturalWidth,
      naturalHeight: dimensions.naturalHeight,
      aspectRatio: dimensions.naturalWidth / dimensions.naturalHeight,
      timestamp: Date.now(),
      loadTime: Date.now()
    };
    
    cache.current.set(url, entry);
    
    // Persist immediately for important dimension data
    if (config.persistToStorage) {
      persistCache();
    }
    
    console.log(`📸 Cached dimensions for ${url.slice(-20)}: ${dimensions.width}x${dimensions.height}`);
  }, [initializeCache, persistCache, config.persistToStorage]);

  /**
   * Get cached image dimensions
   */
  const getCachedDimensions = useCallback((url: string): ImageDimensions | null => {
    if (!url) return null;
    
    initializeCache();
    
    const entry = cache.current.get(url);
    if (!entry) return null;
    
    // Check if entry is still valid
    if ((Date.now() - entry.timestamp) > config.maxAge) {
      cache.current.delete(url);
      return null;
    }
    
    return {
      width: entry.width,
      height: entry.height,
      aspectRatio: entry.aspectRatio,
      timestamp: entry.timestamp,
      naturalWidth: entry.naturalWidth,
      naturalHeight: entry.naturalHeight
    };
  }, [initializeCache, config.maxAge]);

  /**
   * Check if dimensions are cached for an image
   */
  const hasCachedDimensions = useCallback((url: string): boolean => {
    return getCachedDimensions(url) !== null;
  }, [getCachedDimensions]);

  /**
   * Preload and cache dimensions for multiple images
   */
  const preloadImages = useCallback(async (urls: string[], noteId?: string): Promise<void> => {
    const uncachedUrls = urls.filter(url => !hasCachedDimensions(url));
    if (uncachedUrls.length === 0) return;
    
    console.log(`📸 Preloading ${uncachedUrls.length} uncached images`);
    
    const loadPromises = uncachedUrls.map(url => 
      new Promise<void>((resolve) => {
        const img = new Image();
        
        img.onload = () => {
          cacheImageDimensions(url, {
            width: img.width,
            height: img.height,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight
          }, noteId);
          resolve();
        };
        
        img.onerror = () => {
          console.warn(`Failed to preload image: ${url}`);
          resolve(); // Don't fail the whole batch
        };
        
        img.src = url;
      })
    );
    
    await Promise.all(loadPromises);
  }, [hasCachedDimensions, cacheImageDimensions]);

  /**
   * Calculate container dimensions for an image given constraints
   */
  const calculateContainerDimensions = useCallback((
    url: string,
    maxWidth: number,
    maxHeight?: number
  ): { width: number; height: number } | null => {
    const cached = getCachedDimensions(url);
    if (!cached) return null;
    
    const { aspectRatio } = cached;
    
    if (maxHeight) {
      // Fit within both width and height constraints
      const widthBasedHeight = maxWidth / aspectRatio;
      const heightBasedWidth = maxHeight * aspectRatio;
      
      if (widthBasedHeight <= maxHeight) {
        return { width: maxWidth, height: widthBasedHeight };
      } else {
        return { width: heightBasedWidth, height: maxHeight };
      }
    } else {
      // Only width constraint
      return { width: maxWidth, height: maxWidth / aspectRatio };
    }
  }, [getCachedDimensions]);

  /**
   * Get cache statistics for debugging
   */
  const getCacheStats = useCallback(() => {
    initializeCache();
    
    const entries = Array.from(cache.current.values());
    const now = Date.now();
    
    return {
      totalEntries: entries.length,
      validEntries: entries.filter(entry => (now - entry.timestamp) < config.maxAge).length,
      oldestEntry: Math.min(...entries.map(e => e.timestamp)),
      newestEntry: Math.max(...entries.map(e => e.timestamp)),
      totalSize: JSON.stringify(Array.from(cache.current.entries())).length,
      averageAspectRatio: entries.length > 0 
        ? entries.reduce((sum, e) => sum + e.aspectRatio, 0) / entries.length 
        : 0
    };
  }, [initializeCache, config.maxAge]);

  /**
   * Clear cache (optionally for specific URLs or notes)
   */
  const clearCache = useCallback((filter?: { url?: string; noteId?: string }) => {
    if (!filter) {
      cache.current.clear();
      if (config.persistToStorage) {
        localStorage.removeItem(config.storageKey);
      }
      console.log('📸 Image cache cleared completely');
      return;
    }
    
    const entries = Array.from(cache.current.entries());
    let removedCount = 0;
    
    entries.forEach(([url, entry]) => {
      if (
        (filter.url && url === filter.url) ||
        (filter.noteId && entry.noteId === filter.noteId)
      ) {
        cache.current.delete(url);
        removedCount++;
      }
    });
    
    if (removedCount > 0) {
      persistCache();
      console.log(`📸 Removed ${removedCount} entries from image cache`);
    }
  }, [config.persistToStorage, config.storageKey, persistCache]);

  return {
    // Core caching functions
    cacheImageDimensions,
    getCachedDimensions,
    hasCachedDimensions,
    
    // Batch operations
    preloadImages,
    
    // Utility functions
    calculateContainerDimensions,
    
    // Cache management
    getCacheStats,
    clearCache,
    
    // Manual operations
    persistCache,
    cleanupCache
  };
}

// Global singleton instance for sharing across components
let globalImageCache: ReturnType<typeof usePersistentImageCache> | null = null;

/**
 * Get global image cache instance (singleton pattern)
 */
export function getGlobalImageCache(): ReturnType<typeof usePersistentImageCache> {
  if (!globalImageCache) {
    // This is a bit of a hack since we can't use hooks outside components,
    // but we'll initialize it when first accessed
    throw new Error('Global image cache must be initialized from a React component first');
  }
  return globalImageCache;
}

/**
 * Hook to initialize and get global image cache
 */
export function useGlobalImageCache(options?: PersistentImageCacheOptions) {
  const cache = usePersistentImageCache(options);
  
  // Set global reference on first use
  useEffect(() => {
    if (!globalImageCache) {
      globalImageCache = cache;
    }
  }, [cache]);
  
  return cache;
}
