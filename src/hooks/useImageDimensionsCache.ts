import { useRef, useCallback } from 'react';

interface ImageDimensions {
  width: number;
  height: number;
  aspectRatio: number;
  timestamp: number;
}

/**
 * Hook to cache image dimensions across component re-renders and navigation
 * This helps prevent layout shifts when images are re-rendered from cache
 */
export function useImageDimensionsCache() {
  const dimensionsCache = useRef<Map<string, ImageDimensions>>(new Map());

  // Store image dimensions when they load
  const cacheDimensions = useCallback((url: string, width: number, height: number) => {
    if (width > 0 && height > 0) {
      dimensionsCache.current.set(url, {
        width,
        height,
        aspectRatio: width / height,
        timestamp: Date.now(),
      });
    }
  }, []);

  // Get cached dimensions for an image
  const getCachedDimensions = useCallback((url: string): ImageDimensions | null => {
    const cached = dimensionsCache.current.get(url);
    
    // Cache expires after 30 minutes
    if (cached && (Date.now() - cached.timestamp) < 30 * 60 * 1000) {
      return cached;
    }
    
    // Remove expired entries
    if (cached) {
      dimensionsCache.current.delete(url);
    }
    
    return null;
  }, []);

  // Check if dimensions are cached for an image
  const hasCachedDimensions = useCallback((url: string): boolean => {
    return getCachedDimensions(url) !== null;
  }, [getCachedDimensions]);

  // Clear cache for a specific URL or all URLs
  const clearCache = useCallback((url?: string) => {
    if (url) {
      dimensionsCache.current.delete(url);
    } else {
      dimensionsCache.current.clear();
    }
  }, []);

  // Get cache stats for debugging
  const getCacheStats = useCallback(() => {
    return {
      size: dimensionsCache.current.size,
      urls: Array.from(dimensionsCache.current.keys()),
    };
  }, []);

  return {
    cacheDimensions,
    getCachedDimensions,
    hasCachedDimensions,
    clearCache,
    getCacheStats,
  };
}

// Global instance for sharing across components
let globalDimensionsCache: ReturnType<typeof useImageDimensionsCache> | null = null;

export function getGlobalImageDimensionsCache() {
  if (!globalDimensionsCache) {
    // Create a mock implementation that works outside of React components
    const dimensionsMap = new Map<string, ImageDimensions>();
    
    globalDimensionsCache = {
      cacheDimensions: (url: string, width: number, height: number) => {
        if (width > 0 && height > 0) {
          dimensionsMap.set(url, {
            width,
            height,
            aspectRatio: width / height,
            timestamp: Date.now(),
          });
        }
      },
      getCachedDimensions: (url: string) => {
        const cached = dimensionsMap.get(url);
        if (cached && (Date.now() - cached.timestamp) < 30 * 60 * 1000) {
          return cached;
        }
        if (cached) {
          dimensionsMap.delete(url);
        }
        return null;
      },
      hasCachedDimensions: (url: string) => {
        const cached = dimensionsMap.get(url);
        return cached !== undefined && (Date.now() - cached.timestamp) < 30 * 60 * 1000;
      },
      clearCache: (url?: string) => {
        if (url) {
          dimensionsMap.delete(url);
        } else {
          dimensionsMap.clear();
        }
      },
      getCacheStats: () => ({
        size: dimensionsMap.size,
        urls: Array.from(dimensionsMap.keys()),
      }),
    };
  }
  
  return globalDimensionsCache;
}
