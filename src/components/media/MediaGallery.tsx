import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EnhancedImageGallery } from "./EnhancedImageGallery";
import { ImageCarousel } from "./ImageCarousel";
import { VideoPlayer } from "./VideoPlayer";
import { mediaLoader } from "../../services/mediaLoader";

export interface MediaGalleryProps {
  noteId: string;
  index: number;
  imageUrls: string[];
  videoUrls: string[];
  isMobile: boolean;
  useAscii?: boolean;
  useColor?: boolean;
  asciiCache: Record<string, { ascii: string; timestamp: number }>;
  setFullScreenImage: (url: string) => void;
  onAsciiRendered: (url: string, ascii: string) => void;
  onMediaLoadError: (noteId: string) => void;
  onImageDimensionsLoaded?: (
    noteId: string,
    imageUrl: string,
    dimensions: { width: number; height: number }
  ) => void;
  isInFeed?: boolean; // New prop to determine if we're in feed view
  fixedHeight?: number; // Custom fixed height for the image container
  imageMode?: boolean; // Whether we're in media mode (affects video rendering)
}

export const MediaGallery: React.FC<MediaGalleryProps> = ({
  noteId,
  index,
  imageUrls,
  videoUrls,
  isMobile,
  useAscii = false,
  useColor = false,
  asciiCache,
  setFullScreenImage,
  onAsciiRendered,
  onMediaLoadError,
  onImageDimensionsLoaded,
  isInFeed = false,
  fixedHeight,
  imageMode = false,
}) => {
  const imagesLoadingRef = useRef<Set<string>>(new Set());
  const imagesErrorRef = useRef<Set<string>>(new Set());
  const imagesRetryCountRef = useRef<Map<string, number>>(new Map());
  const [forceUpdate, setForceUpdate] = useState(0);
  const [showCarousel, setShowCarousel] = useState(false);
  const [carouselImages, setCarouselImages] = useState<string[]>([]);
  const [carouselIndex, setCarouselIndex] = useState(0);

  // Debounce force updates to prevent excessive re-renders during image loading/error bursts
  const updateTimeoutRef = useRef<number | null>(null);
  const triggerUpdate = useCallback(() => {
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }
    updateTimeoutRef.current = setTimeout(() => {
      setForceUpdate((prev) => prev + 1);
      updateTimeoutRef.current = null;
    }, 16); // ~60fps update rate
  }, []);

  const handleOpenCarousel = useCallback(
    (imageUrls: string[], initialIndex: number) => {
      setCarouselImages(imageUrls);
      setCarouselIndex(initialIndex);
      setShowCarousel(true);
    },
    []
  );

  const handleCloseCarousel = useCallback(() => {
    setShowCarousel(false);
  }, []);

  const handleImageLoad = useCallback(
    (url: string) => {
      if (imagesLoadingRef.current.has(url)) {
        imagesLoadingRef.current.delete(url);
      }
      // Clear error state and retry count when image loads successfully
      if (imagesErrorRef.current.has(url)) {
        imagesErrorRef.current.delete(url);
      }
      if (imagesRetryCountRef.current.has(url)) {
        imagesRetryCountRef.current.delete(url);
      }
      triggerUpdate(); // Use debounced update
    },
    [triggerUpdate]
  );

  const handleImageError = useCallback(
    (url: string) => {
      if (imagesLoadingRef.current.has(url)) {
        imagesLoadingRef.current.delete(url);
        imagesErrorRef.current.add(url);
        // Increment retry count
        const currentRetries = imagesRetryCountRef.current.get(url) || 0;
        const maxRetries = 2; // Reduced from 3 to 2 retries

        // Only increment if we haven't exceeded max retries
        if (currentRetries < maxRetries) {
          imagesRetryCountRef.current.set(url, currentRetries + 1);
        } else {
          // After max retries, stop attempting this image permanently for this session
          console.log(`🚫 Max retries reached for image: ${url.slice(-30)}`);
        }
        triggerUpdate(); // Use debounced update
      }
      // Only mark the entire note as having media errors if all images have failed
      const allImagesFailed = imageUrls.every(
        (url) =>
          imagesErrorRef.current.has(url) || !imagesLoadingRef.current.has(url)
      );
      if (allImagesFailed) {
        onMediaLoadError(noteId);
      }
    },
    [noteId, onMediaLoadError, imageUrls, triggerUpdate]
  );

  // Initialize loading state for images when they change, using persistent cache
  useEffect(() => {
    if (imageUrls.length === 0) {
      imagesLoadingRef.current.clear();
      imagesErrorRef.current.clear();
      imagesRetryCountRef.current.clear();
      setForceUpdate((prev) => prev + 1);
      return;
    }

    // Check which images are already loaded in the persistent cache
    const loadingSet = new Set<string>();
    let cachedCount = 0;

    for (const url of imageUrls) {
      // Clear error states and retry counts for new images
      imagesErrorRef.current.delete(url);
      imagesRetryCountRef.current.delete(url);

      // Only mark as loading if not already loaded in the persistent cache
      if (!mediaLoader.isImageLoaded(url)) {
        loadingSet.add(url);
      } else {
        cachedCount++;
      }
    }

    // Only update if loading state actually changed
    const currentLoadingUrls = Array.from(imagesLoadingRef.current).sort();
    const newLoadingUrls = Array.from(loadingSet).sort();
    const hasChanged =
      currentLoadingUrls.length !== newLoadingUrls.length ||
      currentLoadingUrls.some((url, i) => url !== newLoadingUrls[i]);

    if (hasChanged) {
      imagesLoadingRef.current = loadingSet;
      setForceUpdate((prev) => prev + 1);
    }

    // For images already loaded, no need to do anything - they'll render immediately
    // For images not yet loaded, the CORSImage component will handle loading

    if (cachedCount > 0) {
      console.log(
        `🖼️ [MediaGallery] ${noteId}: ${cachedCount}/${imageUrls.length} images loaded from cache (${loadingSet.size} still loading)`
      );
    }
  }, [imageUrls, noteId]);

  const renderMediaContainer = useCallback(() => {
    const uniqueKey = `${noteId}-${index}`;

    return (
      <div
        className="media-container"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          width: "100%",
          maxWidth: "100%",
          alignItems: "center",
          padding:
            isMobile && imageUrls.length > 0 ? "0" : isMobile ? "0" : "0.25rem",
          boxSizing: "border-box",
          height: "auto",
          justifyContent: isMobile ? "center" : "flex-start",
          position: "relative",
          zIndex: isMobile ? 1 : "auto",
          overflowX: "hidden",
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        {/* Show loading spinner if any images are loading */}
        {/* {!allReady && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              width: "100%",
              maxWidth: "100%",
              alignSelf: "stretch",
              height: "auto", // Let loading spinner size naturally
              minHeight: isMobile ? "100px" : "120px", // Minimal height for loading spinner
              overflowX: "hidden",
            }}
          >
            <LoadingSpinner size="small" />
          </div>
        )} */}

        {/* Use EnhancedImageGallery for consistent height constraints and better multi-image handling */}
        {imageUrls.length > 0 && (
          <EnhancedImageGallery
            noteId={noteId}
            index={index}
            imageUrls={imageUrls}
            isMobile={isMobile}
            useAscii={useAscii}
            useColor={useColor}
            asciiCache={asciiCache}
            setFullScreenImage={setFullScreenImage}
            onAsciiRendered={onAsciiRendered}
            onImageLoad={handleImageLoad}
            onImageError={handleImageError}
            imagesLoadingRef={imagesLoadingRef}
            imagesErrorRef={imagesErrorRef}
            imagesRetryCountRef={imagesRetryCountRef}
            isInFeed={isInFeed}
            fixedHeight={fixedHeight}
            onImageDimensionsLoaded={onImageDimensionsLoaded}
            onOpenCarousel={handleOpenCarousel}
          />
        )}

        {/* Videos: use new VideoPlayer component */}
        {videoUrls.length > 0 && (
          <div
            style={{
              width: "100%",
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
            }}
          >
            {videoUrls.map((url, vidIndex) => (
              <VideoPlayer
                key={`${uniqueKey}-vid-${vidIndex}`}
                url={url}
                useAscii={useAscii}
                imageMode={imageMode}
                onExpandContainer={() => {
                  // Optional: handle container expansion if needed
                }}
              />
            ))}
          </div>
        )}
      </div>
    );
  }, [
    noteId,
    index,
    imageUrls,
    videoUrls,
    useAscii,
    useColor,
    asciiCache,
    isMobile,
    imageMode,
    setFullScreenImage,
    onAsciiRendered,
    onMediaLoadError,
    handleImageLoad,
    handleImageError,
    forceUpdate,
  ]);

  if (imageUrls.length === 0 && videoUrls.length === 0) {
    return null;
  }

  return (
    <>
      {renderMediaContainer()}

      {/* Image Carousel - rendered via portal to document body for true full-screen */}
      {showCarousel &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 999999, // Maximum z-index to ensure it's above everything
              pointerEvents: "all",
              backgroundColor: "rgba(0, 0, 0, 0.95)", // Ensure full coverage
            }}
          >
            <ImageCarousel
              imageUrls={carouselImages}
              initialIndex={carouselIndex}
              onClose={handleCloseCarousel}
              isMobile={isMobile}
            />
          </div>,
          document.body
        )}
    </>
  );
};
