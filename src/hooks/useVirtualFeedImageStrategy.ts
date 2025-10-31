import { useCallback, useRef, useEffect, useMemo } from 'react';
import { Virtualizer } from '@tanstack/react-virtual';
import { usePersistentImageCache } from './usePersistentImageCache';
import { extractImageUrls } from '../components/media/OptimizedImage';

interface Note {
  id: string;
  content: string;
  [key: string]: any;
}

interface VirtualFeedImageStrategyConfig {
  notes: Note[];
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  containerWidth: number;
  onImageDimensionsChange?: (noteId: string, newHeight: number) => void;
  preloadDistance?: number; // Number of items ahead/behind to preload
  priorityDistance?: number; // Number of items to load with priority
  debug?: boolean;
}

interface ImageLoadingState {
  loading: Set<string>;
  loaded: Set<string>;
  failed: Set<string>;
  preloading: Set<string>;
}

/**
 * Optimized image loading strategy for virtual feeds that:
 * 1. Preloads images based on scroll position
 * 2. Uses persistent caching to prevent re-loading
 * 3. Prioritizes visible and near-visible images
 * 4. Manages memory by unloading distant images
 * 5. Provides smooth loading states
 */
export function useVirtualFeedImageStrategy(config: VirtualFeedImageStrategyConfig) {
  const {
    notes,
    virtualizer,
    containerWidth,
    onImageDimensionsChange,
    preloadDistance = 10,
    priorityDistance = 3,
    debug = false
  } = config;

  const imageCache = usePersistentImageCache();
  const loadingState = useRef<ImageLoadingState>({
    loading: new Set(),
    loaded: new Set(),
    failed: new Set(),
    preloading: new Set()
  });

  // const preloadQueue = useRef<Set<string>>(new Set()); // Not used in current implementation
  const intersectionObserver = useRef<IntersectionObserver | null>(null);
  const imageElements = useRef<Map<string, HTMLImageElement>>(new Map());

  // Get note images with metadata
  const noteImages = useMemo(() => {
    return notes.map(note => ({
      noteId: note.id,
      imageUrls: extractImageUrls(note.content),
      index: notes.findIndex(n => n.id === note.id)
    })).filter(item => item.imageUrls.length > 0);
  }, [notes]);

  // Calculate which images should be loaded based on virtual items
  const getImageLoadingPriority = useCallback(() => {
    const virtualItems = virtualizer.getVirtualItems();
    if (virtualItems.length === 0) return { priority: [], preload: [], unload: [] };

    const visibleStart = virtualItems[0].index;
    const visibleEnd = virtualItems[virtualItems.length - 1].index;

    const priority: string[] = [];
    const preload: string[] = [];
    const unload: string[] = [];

    noteImages.forEach(({ noteId: _noteId, imageUrls, index }) => {
      const distanceFromVisible = Math.min(
        Math.abs(index - visibleStart),
        Math.abs(index - visibleEnd)
      );

      if (index >= visibleStart && index <= visibleEnd) {
        // Visible items get priority loading
        priority.push(...imageUrls);
      } else if (distanceFromVisible <= priorityDistance) {
        // Near-visible items get priority loading
        priority.push(...imageUrls);
      } else if (distanceFromVisible <= preloadDistance) {
        // Items within preload distance get background loading
        preload.push(...imageUrls);
      } else if (distanceFromVisible > preloadDistance * 2) {
        // Items far away should be unloaded to save memory
        unload.push(...imageUrls);
      }
    });

    return { priority, preload, unload };
  }, [virtualizer, noteImages, priorityDistance, preloadDistance]);

  // Load image with caching
  const loadImage = useCallback(async (
    url: string, 
    priority: boolean = false,
    noteId?: string
  ): Promise<void> => {
    // Skip if already loaded or loading
    if (loadingState.current.loaded.has(url) || loadingState.current.loading.has(url)) {
      return;
    }

    // Check cache first
    if (imageCache.hasCachedDimensions(url)) {
      loadingState.current.loaded.add(url);
      return;
    }

    loadingState.current.loading.add(url);
    
    try {
      const img = new Image();
      
      // Store reference for potential cleanup
      imageElements.current.set(url, img);
      
      await new Promise<void>((resolve, reject) => {
        img.onload = () => {
          // Cache dimensions
          imageCache.cacheImageDimensions(url, {
            width: img.width,
            height: img.height,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight
          }, noteId);

          loadingState.current.loaded.add(url);
          loadingState.current.loading.delete(url);

          // Notify of dimension change if this affects layout
          if (noteId && onImageDimensionsChange) {
            const containerDims = imageCache.calculateContainerDimensions(url, containerWidth);
            if (containerDims) {
              onImageDimensionsChange(noteId, containerDims.height);
            }
          }

          if (debug) {
            console.log(`🖼️ Loaded image: ${url.slice(-20)} (${img.naturalWidth}x${img.naturalHeight})`);
          }

          resolve();
        };

        img.onerror = () => {
          loadingState.current.failed.add(url);
          loadingState.current.loading.delete(url);
          
          if (debug) {
            console.warn(`❌ Failed to load image: ${url.slice(-20)}`);
          }
          
          reject(new Error(`Failed to load image: ${url}`));
        };

        // Set loading priority
        if (priority) {
          img.loading = 'eager';
          img.fetchPriority = 'high';
        } else {
          img.loading = 'lazy';
          img.fetchPriority = 'low';
        }

        img.src = url;
      });

    } catch (error) {
      loadingState.current.loading.delete(url);
      loadingState.current.failed.add(url);
    }
  }, [imageCache, containerWidth, onImageDimensionsChange, debug]);

  // Batch load images with priority
  const batchLoadImages = useCallback(async (urls: string[], priority: boolean = false) => {
    const loadPromises = urls.map(url => {
      const noteImage = noteImages.find(ni => ni.imageUrls.includes(url));
      return loadImage(url, priority, noteImage?.noteId);
    });

    // Load in batches to prevent overwhelming the browser
    const batchSize = priority ? 6 : 3;
    for (let i = 0; i < loadPromises.length; i += batchSize) {
      const batch = loadPromises.slice(i, i + batchSize);
      await Promise.allSettled(batch);
      
      // Small delay between batches for non-priority loading
      if (!priority && i + batchSize < loadPromises.length) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
  }, [loadImage, noteImages]);

  // Unload distant images to save memory
  const unloadImages = useCallback((urls: string[]) => {
    urls.forEach(url => {
      const img = imageElements.current.get(url);
      if (img) {
        // Clear the src to free memory
        img.src = '';
        imageElements.current.delete(url);
      }
      
      // Remove from loaded state but keep cache
      loadingState.current.loaded.delete(url);
    });

    if (debug && urls.length > 0) {
      console.log(`🗑️ Unloaded ${urls.length} distant images`);
    }
  }, [debug]);

  // Update loading strategy based on scroll position
  const updateImageLoading = useCallback(() => {
    const { priority, preload, unload } = getImageLoadingPriority();

    // Unload distant images first to free memory
    if (unload.length > 0) {
      unloadImages(unload);
    }

    // Load priority images immediately
    if (priority.length > 0) {
      const uncachedPriority = priority.filter(url => 
        !loadingState.current.loaded.has(url) && 
        !loadingState.current.loading.has(url)
      );
      
      if (uncachedPriority.length > 0) {
        batchLoadImages(uncachedPriority, true);
      }
    }

    // Preload images in background
    if (preload.length > 0) {
      const uncachedPreload = preload.filter(url => 
        !loadingState.current.loaded.has(url) && 
        !loadingState.current.loading.has(url) &&
        !loadingState.current.preloading.has(url)
      );

      if (uncachedPreload.length > 0) {
        // Use requestIdleCallback for background preloading
        if ('requestIdleCallback' in window) {
          requestIdleCallback(() => {
            uncachedPreload.forEach(url => loadingState.current.preloading.add(url));
            batchLoadImages(uncachedPreload, false).finally(() => {
              uncachedPreload.forEach(url => loadingState.current.preloading.delete(url));
            });
          });
        } else {
          setTimeout(() => {
            uncachedPreload.forEach(url => loadingState.current.preloading.add(url));
            batchLoadImages(uncachedPreload, false).finally(() => {
              uncachedPreload.forEach(url => loadingState.current.preloading.delete(url));
            });
          }, 100);
        }
      }
    }
  }, [getImageLoadingPriority, unloadImages, batchLoadImages]);

  // Set up intersection observer for more precise loading
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;

    intersectionObserver.current = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const noteId = entry.target.getAttribute('data-note-id');
            if (noteId) {
              const noteImage = noteImages.find(ni => ni.noteId === noteId);
              if (noteImage) {
                // Load images for visible notes immediately
                batchLoadImages(noteImage.imageUrls, true);
              }
            }
          }
        });
      },
      {
        rootMargin: '100px', // Start loading 100px before visible
        threshold: 0.1
      }
    );

    return () => {
      if (intersectionObserver.current) {
        intersectionObserver.current.disconnect();
      }
    };
  }, [noteImages, batchLoadImages]);

  // Update loading strategy when virtual items change
  useEffect(() => {
    const virtualItems = virtualizer.getVirtualItems();
    if (virtualItems.length > 0) {
      updateImageLoading();
    }
  }, [virtualizer.getVirtualItems(), updateImageLoading]);

  // Preload images for initial visible items
  useEffect(() => {
    if (notes.length > 0) {
      const initialItems = notes.slice(0, Math.min(5, notes.length));
      const initialImageUrls = initialItems.flatMap(note => extractImageUrls(note.content));
      
      if (initialImageUrls.length > 0) {
        batchLoadImages(initialImageUrls, true);
      }
    }
  }, [notes, batchLoadImages]);

  // Get loading state for a specific image
  const getImageLoadingState = useCallback((url: string) => {
    return {
      isLoading: loadingState.current.loading.has(url),
      isLoaded: loadingState.current.loaded.has(url),
      isFailed: loadingState.current.failed.has(url),
      isPreloading: loadingState.current.preloading.has(url),
      isCached: imageCache.hasCachedDimensions(url)
    };
  }, [imageCache]);

  // Get loading statistics
  const getLoadingStats = useCallback(() => {
    const totalImages = noteImages.reduce((sum, ni) => sum + ni.imageUrls.length, 0);
    
    return {
      totalImages,
      loadedImages: loadingState.current.loaded.size,
      loadingImages: loadingState.current.loading.size,
      failedImages: loadingState.current.failed.size,
      preloadingImages: loadingState.current.preloading.size,
      cachedImages: noteImages.reduce((sum, ni) => 
        sum + ni.imageUrls.filter(url => imageCache.hasCachedDimensions(url)).length, 0
      )
    };
  }, [noteImages, imageCache]);

  // Manual operations
  const preloadNote = useCallback((noteId: string) => {
    const noteImage = noteImages.find(ni => ni.noteId === noteId);
    if (noteImage) {
      batchLoadImages(noteImage.imageUrls, true);
    }
  }, [noteImages, batchLoadImages]);

  const clearLoadingState = useCallback(() => {
    loadingState.current = {
      loading: new Set(),
      loaded: new Set(),
      failed: new Set(),
      preloading: new Set()
    };
    
    // Clear image references
    imageElements.current.clear();
    
    if (debug) {
      console.log('🧹 Cleared image loading state');
    }
  }, [debug]);

  return {
    // State queries
    getImageLoadingState,
    getLoadingStats,
    
    // Manual operations
    preloadNote,
    updateImageLoading,
    clearLoadingState,
    
    // Intersection observer for external use
    intersectionObserver: intersectionObserver.current,
    
    // Current loading state (read-only)
    loadingState: {
      loading: Array.from(loadingState.current.loading),
      loaded: Array.from(loadingState.current.loaded),
      failed: Array.from(loadingState.current.failed),
      preloading: Array.from(loadingState.current.preloading)
    }
  };
}
