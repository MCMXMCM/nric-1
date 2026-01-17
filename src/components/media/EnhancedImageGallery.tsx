import React, { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { CORSImage } from "./CORSImage";
import { ImageCarousel } from "./ImageCarousel";
import AsciiRendererV2 from "../AsciiRendererV2";

export interface EnhancedImageGalleryProps {
  noteId: string;
  index: number;
  imageUrls: string[];
  isMobile: boolean;
  useAscii?: boolean;
  useColor?: boolean;
  asciiCache: Record<string, { ascii: string; timestamp: number }>;
  setFullScreenImage: (url: string) => void;
  onAsciiRendered: (url: string, ascii: string) => void;
  onImageLoad: (url: string) => void;
  onImageError: (url: string) => void;
  onImageDimensionsLoaded?: (
    noteId: string,
    imageUrl: string,
    dimensions: { width: number; height: number }
  ) => void;
  imagesLoadingRef: React.MutableRefObject<Set<string>>;
  imagesErrorRef: React.MutableRefObject<Set<string>>;
  imagesRetryCountRef: React.MutableRefObject<Map<string, number>>;
  isInFeed?: boolean;
  fixedHeight?: number;
  onOpenCarousel?: (imageUrls: string[], initialIndex: number) => void;
}

interface ImageDimensions {
  url: string;
  width: number;
  height: number;
  aspectRatio: number;
}

const MAX_DISPLAY_IMAGES = 5; // Show up to 5 images in the grid
const GALLERY_MAX_HEIGHT = 300; // Fixed max height for feed estimation
const DESKTOP_MAX_HEIGHT = 600; // Max height for desktop display - matches ASCII renderer maxHeight

export const EnhancedImageGallery: React.FC<EnhancedImageGalleryProps> = ({
  noteId,
  index,
  imageUrls,
  isMobile,
  useAscii = false,
  useColor = false,
  asciiCache,
  setFullScreenImage: _setFullScreenImage,
  onAsciiRendered,
  onImageLoad,
  onImageError,
  onImageDimensionsLoaded,
  imagesLoadingRef,
  imagesErrorRef,
  imagesRetryCountRef,
  isInFeed = false,
  fixedHeight,
  onOpenCarousel,
}) => {
  const [, setForceUpdate] = useState(0);
  const uniqueKey = `${noteId}-${index}`;
  const [showCarousel, setShowCarousel] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [imageDimensions, setImageDimensions] = useState<
    Map<string, ImageDimensions>
  >(new Map());
  const gridContainerRef = useRef<HTMLDivElement | null>(null);
  const [gridWidth, setGridWidth] = useState<number>(0);

  // Track per-image ASCII override state
  const [imageAsciiOverrides, setImageAsciiOverrides] = useState<
    Record<string, boolean>
  >({});

  // Debounce force updates
  const updateTimeoutRef = useRef<number | null>(null);
  const triggerUpdate = useCallback(() => {
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }
    updateTimeoutRef.current = setTimeout(() => {
      setForceUpdate((prev) => prev + 1);
      updateTimeoutRef.current = null;
    }, 16);
  }, []);

  const handleImageLoadWrapper = useCallback(
    (url: string, dimensions?: { width: number; height: number }) => {
      onImageLoad(url);

      // Store image dimensions for layout calculations
      if (dimensions) {
        const aspectRatio = dimensions.width / dimensions.height;
        setImageDimensions((prev) => {
          const newMap = new Map(prev);
          newMap.set(url, {
            url,
            width: dimensions.width,
            height: dimensions.height,
            aspectRatio,
          });
          return newMap;
        });

        if (onImageDimensionsLoaded) {
          onImageDimensionsLoaded(noteId, url, dimensions);
        }
      }

      triggerUpdate();
    },
    [onImageLoad, onImageDimensionsLoaded, noteId, triggerUpdate]
  );

  const handleImageErrorWrapper = useCallback(
    (url: string) => {
      onImageError(url);
      triggerUpdate();
    },
    [onImageError, triggerUpdate]
  );

  const handleImageClick = useCallback(
    (url: string, imageIndex: number) => {
      if (useAscii) {
        // ASCII mode: toggle individual image between ASCII and regular
        setImageAsciiOverrides((prev) => ({
          ...prev,
          [url]: !prev[url],
        }));
      } else {
        // Normal mode: open carousel
        if (onOpenCarousel) {
          onOpenCarousel(imageUrls, imageIndex);
        } else {
          // Fallback to local carousel if no callback provided
          setCarouselIndex(imageIndex);
          setShowCarousel(true);
        }
      }
    },
    [useAscii, onOpenCarousel, imageUrls]
  );

  const handleViewMoreClick = useCallback(() => {
    if (onOpenCarousel) {
      onOpenCarousel(imageUrls, MAX_DISPLAY_IMAGES);
    } else {
      // Fallback to local carousel if no callback provided
      setCarouselIndex(MAX_DISPLAY_IMAGES);
      setShowCarousel(true);
    }
  }, [onOpenCarousel, imageUrls]);

  const handleCarouselClose = useCallback(() => {
    setShowCarousel(false);
  }, []);

  // Organize images by aspect ratio for optimal layout
  const organizeImagesForLayout = (images: string[]) => {
    if (images.length === 0) return { primary: [], secondary: [] };

    const imagesWithDimensions = images
      .map((url) => imageDimensions.get(url))
      .filter(Boolean) as ImageDimensions[];

    // If we don't have dimensions for all images, fall back to simple arrangement
    if (imagesWithDimensions.length !== images.length) {
      return {
        primary: images.slice(0, Math.min(MAX_DISPLAY_IMAGES, images.length)),
        secondary: images.slice(MAX_DISPLAY_IMAGES),
      };
    }

    // Special handling for exactly 3 images: choose the most suitable left-span image
    // We prefer a portrait (taller than wide) to occupy the left column that spans two rows.
    if (imagesWithDimensions.length === 3) {
      // Prefer the tallest portrait for the left slot
      const portraits = imagesWithDimensions.filter(
        (img) => img.aspectRatio <= 1
      );
      let ordered: ImageDimensions[];

      if (portraits.length > 0) {
        const left = portraits
          .slice()
          .sort((a, b) => a.aspectRatio - b.aspectRatio)[0]; // smaller aspectRatio => taller image
        const rest = imagesWithDimensions
          .filter((img) => img.url !== left.url)
          .sort((a, b) => b.width * b.height - a.width * a.height);
        ordered = [left, ...rest];
      } else {
        // If no portraits, pick the image whose aspect ratio is farthest from 1 (most extreme)
        const left = imagesWithDimensions
          .slice()
          .sort(
            (a, b) => Math.abs(b.aspectRatio - 1) - Math.abs(a.aspectRatio - 1)
          )[0];
        const rest = imagesWithDimensions
          .filter((img) => img.url !== left.url)
          .sort((a, b) => b.width * b.height - a.width * a.height);
        ordered = [left, ...rest];
      }

      return {
        primary: ordered.map((img) => img.url),
        secondary: [],
      };
    }

    // Sort by aspect ratio: landscape (wider) first, then portrait (taller)
    const sorted = imagesWithDimensions.sort((a, b) => {
      // Landscape images (aspect ratio > 1) come first
      if (a.aspectRatio > 1 && b.aspectRatio <= 1) return -1;
      if (a.aspectRatio <= 1 && b.aspectRatio > 1) return 1;
      // Within same orientation, sort by area (larger first)
      return b.width * b.height - a.width * a.height;
    });

    // For small collections (1-5 images), put all in primary area
    if (sorted.length <= MAX_DISPLAY_IMAGES) {
      return {
        primary: sorted.map((img) => img.url),
        secondary: [],
      };
    }

    // For larger collections, use smart distribution
    const primary = sorted.slice(0, MAX_DISPLAY_IMAGES);
    const secondary = sorted.slice(MAX_DISPLAY_IMAGES);

    return {
      primary: primary.map((img) => img.url),
      secondary: secondary.map((img) => img.url),
    };
  };

  // Track container width for accurate height calculations
  useEffect(() => {
    const el = gridContainerRef.current;
    if (!el) return;
    // Initial measure
    setGridWidth(el.clientWidth || 0);
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cw = Math.floor(entry.contentRect.width);
        if (cw && cw !== gridWidth) setGridWidth(cw);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [gridWidth]);

  // Compute optimal container height for multi-image grids when we know dimensions
  const computeGridHeight = useCallback(
    (primaryUrls: string[], availableWidth: number): number | null => {
      if (!availableWidth || primaryUrls.length <= 1) return null;
      const dims = primaryUrls
        .map((u) => imageDimensions.get(u))
        .filter(Boolean) as ImageDimensions[];
      if (dims.length !== primaryUrls.length) return null;

      const GAP = 2; // px

      if (primaryUrls.length === 2) {
        const cellWidth = (availableWidth - GAP) / 2;
        const h0 = cellWidth / Math.max(0.1, dims[0].aspectRatio);
        const h1 = cellWidth / Math.max(0.1, dims[1].aspectRatio);
        return Math.min(900, Math.max(h0, h1));
      }

      if (primaryUrls.length === 3) {
        // Left spans 2 rows; right has 2 stacked
        const leftWidth = (availableWidth - GAP) / 2;
        const leftHeight = leftWidth / Math.max(0.1, dims[0].aspectRatio);
        const rightH1 = leftWidth / Math.max(0.1, dims[1].aspectRatio);
        const rightH2 = leftWidth / Math.max(0.1, dims[2].aspectRatio);
        const stackedRightHeight = Math.max(rightH1, rightH2) * 2 + GAP;
        return Math.min(1200, Math.max(leftHeight, stackedRightHeight));
      }

      // For other counts, fall back to fixed height for now
      return null;
    },
    [imageDimensions]
  );

  const renderImage = (
    url: string,
    imageIndex: number,
    containerStyle?: React.CSSProperties,
    fitMode: "cover" | "contain" = "contain"
  ) => {
    const hasImageError = imagesErrorRef.current.has(url);
    const retryCount = imagesRetryCountRef.current.get(url) || 0;
    const maxRetries = 3;
    const isPermanentlyFailed = hasImageError && retryCount >= maxRetries;
    const isLoading = imagesLoadingRef.current.has(url);

    const imageStyle: React.CSSProperties = {
      width: "100%",
      height: "100%",
      maxWidth: "100%",
      maxHeight: "100%",
      borderRadius: "8px",
      cursor: "pointer",
      objectFit: fitMode, // Contain for single images, cover for grid tiles
      display: "block",
      padding: "2px",
      boxSizing: "border-box",
      ...containerStyle,
    };

    // Only hide permanently failed images - let temporary errors continue to CORSImage
    // which has its own retry logic (proxy fallbacks, etc.)
    if (isPermanentlyFailed) {
      return null;
    }

    const shouldShowAscii = useAscii && !imageAsciiOverrides[url];

    if (shouldShowAscii) {
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <AsciiRendererV2
            key={`${uniqueKey}-ascii-${imageIndex}`}
            src={url}
            type="image"
            useColor={useColor}
            onAsciiRendered={(ascii: string) => {
              setTimeout(() => handleImageLoadWrapper(url), 100);
              onAsciiRendered(url, ascii);
            }}
            onError={() => handleImageErrorWrapper(url)}
            cachedAscii={asciiCache[url]?.ascii}
          />
        </div>
      );
    }

    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          padding: "4px",

          position: "relative",
          overflow: "hidden",
          ...containerStyle,
        }}
      >
        <CORSImage
          url={url}
          isLoading={isLoading}
          style={imageStyle}
          loading="lazy"
          decoding="async"
          fetchPriority={imageIndex === 0 ? "high" : "auto"}
          onClick={() => handleImageClick(url, imageIndex)}
          onLoad={(dimensions) => handleImageLoadWrapper(url, dimensions)}
          onError={() => handleImageErrorWrapper(url)}
          isMobile={isMobile}
          enableOptimization={!/\.gif(\?|$)/i.test(url)}
          expectedWidth={imageStyle.width as number}
          expectedHeight={imageStyle.height as number}
          isDarkMode={false}
          showPlaceholder={true}
          sizesHint={isInFeed ? "(max-width: 768px) 48vw, 33vw" : "100vw"}
        />
      </div>
    );
  };

  if (imageUrls.length === 0) {
    return null;
  }

  const { primary } = organizeImagesForLayout(imageUrls);

  const totalImages = imageUrls.length;
  const showViewMoreButton = totalImages > MAX_DISPLAY_IMAGES;
  const remainingCount = Math.max(0, totalImages - MAX_DISPLAY_IMAGES);

  // Determine container height - single images get natural height, multiple images are constrained
  const containerHeight =
    primary.length === 1
      ? "auto" // Single images use natural height
      : isInFeed
        ? fixedHeight || GALLERY_MAX_HEIGHT
        : GALLERY_MAX_HEIGHT; // Multiple images always constrained

  // Get grid layout based on number of primary images
  const getGridLayout = (imageCount: number) => {
    switch (imageCount) {
      case 1:
        return {
          gridTemplateColumns: "1fr",
          gridTemplateRows: "1fr",
        };
      case 2:
        return {
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "1fr",
        };
      case 3:
        return {
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "1fr 1fr",
        };
      case 4:
        return {
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "1fr 1fr",
        };
      case 5:
        return {
          gridTemplateColumns: "1fr 1fr 1fr",
          gridTemplateRows: "1fr 1fr",
        };
      default:
        return {
          gridTemplateColumns: "1fr",
          gridTemplateRows: "1fr",
        };
    }
  };

  const gridLayout = getGridLayout(primary.length);

  // For single images, use natural aspect ratio layout (both in feed and non-feed mode)
  if (primary.length === 1) {
    return (
      <>
        <div
          style={{
            width: "100%",
            // Apply max-height constraint on desktop to keep notes proportional
            // On mobile, allow natural height; on desktop, limit to DESKTOP_MAX_HEIGHT
            maxHeight: isMobile ? "none" : `${DESKTOP_MAX_HEIGHT}px`,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          {renderImage(
            primary[0],
            0,
            {
              // Constrain both width and height to ensure entire image fits and scales proportionally
              maxWidth: "100%",
              maxHeight: isMobile ? "none" : `${DESKTOP_MAX_HEIGHT}px`,
              objectFit: "contain", // Scale image to fit while preserving aspect ratio and showing entire image
            },
            "contain"
          )}
        </div>

        {/* Image Carousel - only rendered if no parent callback provided */}
        {!onOpenCarousel &&
          showCarousel &&
          createPortal(
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 999999,
                pointerEvents: "all",
                backgroundColor: "rgba(0, 0, 0, 0.95)",
              }}
            >
              <ImageCarousel
                imageUrls={imageUrls}
                initialIndex={carouselIndex}
                onClose={handleCarouselClose}
                isMobile={isMobile}
              />
            </div>,
            document.body
          )}
      </>
    );
  }

  return (
    <>
      <div
        ref={gridContainerRef}
        style={{
          width: "100%",
          height: (() => {
            // Try dynamic grid height when possible
            const dyn = computeGridHeight(primary, gridWidth);
            if (typeof containerHeight === "string" && dyn == null)
              return containerHeight;
            return `${dyn ?? (containerHeight as number)}px`;
          })(),
          maxHeight:
            typeof containerHeight === "string"
              ? containerHeight
              : `${containerHeight}px`,
          display: "grid",
          gap: "2px",
          backgroundColor: "var(--background-color)",
          borderRadius: "8px",
          overflow: "hidden", // Always prevent scroll bars
          position: "relative",
          ...gridLayout,
        }}
      >
        {primary.map((url, imageIndex) => (
          <div
            key={`${uniqueKey}-primary-${imageIndex}`}
            style={{
              position: "relative",
              overflow: "hidden",
              backgroundColor: "var(--background-color)",
              // Special positioning for 3 images - first image spans two rows
              ...(primary.length === 3 && imageIndex === 0
                ? { gridRowStart: 1, gridRowEnd: 3 }
                : {}),
              // Special positioning for 5 images - first image spans two rows
              ...(primary.length === 5 && imageIndex === 0
                ? { gridRowStart: 1, gridRowEnd: 3 }
                : {}),
            }}
          >
            {renderImage(url, imageIndex, undefined, "cover")}

            {/* Inline "+N more" overlay on the LAST visible tile to avoid creating a new row */}
            {showViewMoreButton && imageIndex === primary.length - 1 && (
              <button
                onClick={handleViewMoreClick}
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background:
                    "linear-gradient(0deg, rgba(0,0,0,0.55), rgba(0,0,0,0.25))",
                  border: "none",
                  color: "white",
                  fontSize: "0.95rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  borderRadius: "8px",
                }}
                aria-label={`View ${remainingCount} more images`}
              >
                +{remainingCount} more · view all
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Image Carousel */}
      {/* Image Carousel - only rendered if no parent callback provided */}
      {!onOpenCarousel &&
        showCarousel &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 999999,
              pointerEvents: "all",
              backgroundColor: "rgba(0, 0, 0, 0.95)",
            }}
          >
            <ImageCarousel
              imageUrls={imageUrls}
              initialIndex={carouselIndex}
              onClose={handleCarouselClose}
              isMobile={isMobile}
            />
          </div>,
          document.body
        )}
    </>
  );
};
