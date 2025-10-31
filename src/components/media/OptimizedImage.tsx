import React, { useState, useCallback, useRef, useEffect } from "react";
import { usePersistentImageCache } from "../../hooks/usePersistentImageCache";

interface OptimizedImageProps {
  src: string;
  alt: string;
  noteId?: string;
  className?: string;
  style?: React.CSSProperties;
  maxWidth?: number;
  maxHeight?: number;
  onLoad?: (dimensions: {
    width: number;
    height: number;
    naturalWidth: number;
    naturalHeight: number;
  }) => void;
  onError?: (error: Event) => void;
  onDimensionsChange?: (dimensions: { width: number; height: number }) => void;
  placeholder?: React.ReactNode;
  loading?: "lazy" | "eager";
  priority?: boolean; // For above-the-fold images
}

/**
 * Optimized image component that:
 * 1. Uses persistent dimension caching to prevent layout shifts
 * 2. Pre-calculates container dimensions before image loads
 * 3. Provides smooth loading states
 * 4. Integrates with virtual list measurements
 */
export const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  noteId,
  className,
  style,
  maxWidth = 600,
  maxHeight,
  onLoad,
  onError,
  onDimensionsChange,
  placeholder,
  loading = "lazy",
  priority = false,
}) => {
  const imageCache = usePersistentImageCache();
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "error">(
    "loading"
  );
  const [displayDimensions, setDisplayDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate initial dimensions from cache
  useEffect(() => {
    if (!src) return;

    const cached = imageCache.getCachedDimensions(src);
    if (cached) {
      const containerDims = imageCache.calculateContainerDimensions(
        src,
        maxWidth,
        maxHeight
      );
      if (containerDims) {
        setDisplayDimensions(containerDims);
        setLoadState("loaded"); // We can show it immediately

        // Notify parent of dimensions
        if (onDimensionsChange) {
          onDimensionsChange(containerDims);
        }
      }
    }
  }, [src, maxWidth, maxHeight, imageCache, onDimensionsChange]);

  // Handle image load
  const handleImageLoad = useCallback(
    (event: React.SyntheticEvent<HTMLImageElement>) => {
      const img = event.currentTarget;
      const dimensions = {
        width: img.width,
        height: img.height,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
      };

      // Cache the dimensions
      imageCache.cacheImageDimensions(src, dimensions, noteId);

      // Calculate display dimensions
      const containerDims = imageCache.calculateContainerDimensions(
        src,
        maxWidth,
        maxHeight
      );
      if (containerDims) {
        setDisplayDimensions(containerDims);

        // Notify parent of dimensions change
        if (onDimensionsChange) {
          onDimensionsChange(containerDims);
        }
      }

      setLoadState("loaded");

      // Call parent onLoad handler
      if (onLoad) {
        onLoad(dimensions);
      }
    },
    [src, noteId, maxWidth, maxHeight, imageCache, onLoad, onDimensionsChange]
  );

  // Handle image error
  const handleImageError = useCallback(
    (event: React.SyntheticEvent<HTMLImageElement>) => {
      setLoadState("error");

      if (onError) {
        onError(event.nativeEvent);
      }
    },
    [onError]
  );

  // Preload image if priority
  useEffect(() => {
    if (priority && src && !imageCache.hasCachedDimensions(src)) {
      imageCache.preloadImages([src], noteId);
    }
  }, [priority, src, noteId, imageCache]);

  // Determine container style
  const containerStyle: React.CSSProperties = {
    position: "relative",
    overflow: "hidden",
    backgroundColor: loadState === "loading" ? "#f0f0f0" : "transparent",
    transition: "background-color 0.2s ease",
    ...style,
    // Use cached dimensions to prevent layout shift
    ...(displayDimensions && {
      width: displayDimensions.width,
      height: displayDimensions.height,
      minHeight: displayDimensions.height, // Prevent collapse during loading
    }),
  };

  // Image style
  const imageStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    opacity: loadState === "loaded" ? 1 : 0,
    transition: "opacity 0.3s ease",
  };

  // Loading placeholder
  const renderPlaceholder = () => {
    if (placeholder) return placeholder;

    return (
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f5f5f5",
          color: "#999",
          fontSize: "14px",
        }}
      >
        {loadState === "loading" && "⏳"}
        {loadState === "error" && "❌"}
      </div>
    );
  };

  if (!src) {
    return null;
  }

  return (
    <div ref={containerRef} className={className} style={containerStyle}>
      {/* Always render image for proper loading */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        style={imageStyle}
        loading={loading}
        onLoad={handleImageLoad}
        onError={handleImageError}
        decoding="async"
      />

      {/* Show placeholder while loading or on error */}
      {loadState !== "loaded" && renderPlaceholder()}
    </div>
  );
};

/**
 * Hook for batch image preloading
 */
export function useImagePreloader() {
  const imageCache = usePersistentImageCache();

  const preloadImages = useCallback(
    async (urls: string[], noteId?: string, priority: boolean = false) => {
      // Filter out already cached images
      const uncachedUrls = urls.filter(
        (url) => !imageCache.hasCachedDimensions(url)
      );

      if (uncachedUrls.length === 0) {
        return; // All images already cached
      }

      console.log(
        `🚀 Preloading ${uncachedUrls.length} images${
          priority ? " (priority)" : ""
        }`
      );

      if (priority) {
        // Load immediately for priority images
        await imageCache.preloadImages(uncachedUrls, noteId);
      } else {
        // Use requestIdleCallback for non-priority images
        if ("requestIdleCallback" in window) {
          requestIdleCallback(() => {
            imageCache.preloadImages(uncachedUrls, noteId);
          });
        } else {
          // Fallback for browsers without requestIdleCallback
          setTimeout(() => {
            imageCache.preloadImages(uncachedUrls, noteId);
          }, 100);
        }
      }
    },
    [imageCache]
  );

  return { preloadImages };
}

/**
 * Extract image URLs from note content
 */
export function extractImageUrls(content: string): string[] {
  const imageRegex = /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp)(\?[^\s]*)?/gi;
  return content.match(imageRegex) || [];
}

/**
 * Hook for note image preloading
 */
export function useNoteImagePreloader() {
  const { preloadImages } = useImagePreloader();

  const preloadNoteImages = useCallback(
    (
      notes: Array<{ id: string; content: string }>,
      priority: boolean = false
    ) => {
      const allImageUrls: string[] = [];

      notes.forEach((note) => {
        const imageUrls = extractImageUrls(note.content);
        imageUrls.forEach((url) => {
          preloadImages([url], note.id, priority);
        });
        allImageUrls.push(...imageUrls);
      });

      return allImageUrls;
    },
    [preloadImages]
  );

  return { preloadNoteImages };
}
