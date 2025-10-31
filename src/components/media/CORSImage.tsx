import React, { useState, useRef } from "react";
import { mediaLoader } from "../../services/mediaLoader";
// removed unused image optimization imports
import { ImagePlaceholder } from "./ImagePlaceholder";
import { getGlobalImageDimensionsCache } from "../../hooks/useImageDimensionsCache";

export interface CORSImageProps {
  url: string;
  isLoading: boolean;
  onClick: () => void;
  onLoad: (dimensions?: { width: number; height: number }) => void;
  onError: () => void;
  style: React.CSSProperties;
  loading?: "lazy" | "eager";
  decoding?: "async" | "sync" | "auto";
  fetchPriority?: "high" | "low" | "auto";
  isMobile?: boolean;
  enableOptimization?: boolean; // Allow disabling optimization if needed
  // Enhanced placeholder props for scroll restoration
  expectedWidth?: number;
  expectedHeight?: number;
  expectedAspectRatio?: number;
  isDarkMode?: boolean;
  showPlaceholder?: boolean;
  sizesHint?: string; // responsive sizes hint for srcset
}

export const CORSImage: React.FC<CORSImageProps> = ({
  url,
  isLoading: _isLoading, // Unused - we manage loading state internally now
  onClick,
  onLoad,
  onError,
  style,
  loading = "lazy",
  decoding = "async",
  fetchPriority = "auto",
  isMobile = false,
  enableOptimization = false,
  expectedWidth,
  expectedHeight,
  expectedAspectRatio,
  isDarkMode = false,
  showPlaceholder = true,
  sizesHint,
}) => {
  // Start with viewport true for immediate loading of visible images
  // The intersection observer will handle truly off-screen images
  const [isInViewport, setIsInViewport] = useState(true);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [resolvedUrl, setResolvedUrl] = useState<string>(() => {
    // Initialize with cached URL if available
    return mediaLoader.getResolvedUrl(url) || url;
  });
  const [imageError, setImageError] = useState<boolean>(false);
  const [internalLoading, setInternalLoading] = useState<boolean>(() => {
    // If image is already cached, don't show loading state
    return !mediaLoader.isImageLoaded(url);
  });
  const [optimizedUrl, setOptimizedUrl] = useState<string | null>(null);
  const [, setOptimizationInfo] = useState<{
    wasResized: boolean;
    dimensions: { width: number; height: number };
    compressionRatio: number;
  } | null>(null);
  const [corsMode, setCorsMode] = useState<"anonymous" | "none">("anonymous");
  const [retryAttempt, setRetryAttempt] = useState<number>(0);

  // Store cleanup function for optimized URL
  const cleanupRef = useRef<(() => void) | null>(null);

  React.useEffect(() => {
    let isMounted = true;

    // Cleanup previous optimized URL if it exists
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    // Check if image is already loaded FIRST to avoid flicker
    const isAlreadyLoaded = mediaLoader.isImageLoaded(url);
    const cachedUrl = isAlreadyLoaded ? mediaLoader.getResolvedUrl(url) : null;

    // Reset error state and retry state when URL changes
    setImageError(false);
    // Only set loading to true if image is NOT already cached
    setInternalLoading(!isAlreadyLoaded);
    setCorsMode("anonymous");
    setRetryAttempt(0);

    // If image is already loaded, use cached result immediately without showing loading state
    if (isAlreadyLoaded && cachedUrl && isMounted) {
      setResolvedUrl(cachedUrl);
      setOptimizedUrl(null);
      setOptimizationInfo(null);
      setInternalLoading(false); // Ensure loading state is false for cached images
      console.log(`🖼️ Using cached image: ${url.slice(0, 50)}...`);
      return;
    }

    // By default use the original URL. If optimization is enabled, prepare a candidate optimized URL.
    if (isMounted) {
      setResolvedUrl(url);
      if (enableOptimization) {
        setOptimizedUrl(null); // computed at render time via srcset
      }
    }

    return () => {
      isMounted = false;
      // Cleanup optimized URL when component unmounts or URL changes
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [url, enableOptimization, isMobile, isInViewport]);

  // Simplified retry logic - only retry on actual error, not timeout
  // This prevents artificial delays while still handling CORS issues

  // PERFORMANCE FIX: Intersection observer for lazy loading off-screen images
  // Start with isInViewport=true so visible images load immediately
  // Observer will manage truly off-screen images when they scroll into view
  React.useEffect(() => {
    const target = containerRef.current;
    if (!target) return;

    // Use IntersectionObserver to detect when image scrolls out of view
    // This helps with memory management for large feeds
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          // Only update if intersecting - this keeps already-loaded images loaded
          if (entry.isIntersecting && !isInViewport) {
            setIsInViewport(true);
          }
        });
      },
      {
        rootMargin: "400px", // Generous margin to start loading before visible
        threshold: 0,
      }
    );

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [url, isInViewport]);

  // Build optimized URL for a given width using images.weserv.nl (safe proxy)
  function buildOptimizedUrl(original: string, width: number): string {
    const base = "https://images.weserv.nl/?url=";
    const encoded = encodeURIComponent(original);
    const params = `&w=${Math.max(1, Math.floor(width))}&fit=cover&q=75&output=webp`;
    return `${base}${encoded}${params}`;
  }

  // Generate srcset when optimization is on
  const dpr =
    typeof window !== "undefined"
      ? Math.max(1, window.devicePixelRatio || 1)
      : 1;
  const targetWidths = [320, 480, 640, 768, 960, 1280];
  const srcSet = enableOptimization
    ? targetWidths
        .map((w) => `${buildOptimizedUrl(url, Math.round(w * dpr))} ${w}w`)
        .join(", ")
    : undefined;
  const numericExpectedWidth =
    typeof expectedWidth === "number"
      ? expectedWidth
      : typeof expectedWidth === "string"
        ? Number.parseFloat(expectedWidth)
        : undefined;
  const sizesAttr = enableOptimization
    ? sizesHint ||
      (Number.isFinite(numericExpectedWidth)
        ? `${Math.round(numericExpectedWidth as number)}px`
        : "100vw")
    : undefined;

  if (imageError) {
    return (
      <div
        style={{
          ...style,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--background-color)",
          border: "1px solid var(--border-color)",
          borderRadius: "4px",

          color: "var(--text-color)",
        }}
      >
        Failed to load image
      </div>
    );
  }

  // Get cached dimensions if available for better placeholder sizing
  const dimensionsCache = getGlobalImageDimensionsCache();
  const cachedDimensions = dimensionsCache.getCachedDimensions(url);

  // Calculate placeholder dimensions using cached dimensions if available
  const numericExpectedHeight =
    typeof expectedHeight === "number"
      ? expectedHeight
      : typeof expectedHeight === "string"
        ? Number.parseFloat(expectedHeight)
        : undefined;

  let placeholderWidth =
    (Number.isFinite(numericExpectedWidth)
      ? (numericExpectedWidth as number)
      : undefined) ||
    (typeof style.width === "number" ? (style.width as number) : undefined) ||
    300;
  let placeholderHeight =
    (Number.isFinite(numericExpectedHeight)
      ? (numericExpectedHeight as number)
      : undefined) ||
    (expectedAspectRatio
      ? placeholderWidth / expectedAspectRatio
      : undefined) ||
    (typeof style.height === "number" ? (style.height as number) : undefined) ||
    200;

  // Use cached dimensions if available and no expected dimensions provided
  if (
    cachedDimensions &&
    !expectedWidth &&
    !expectedHeight &&
    !expectedAspectRatio
  ) {
    // Scale cached dimensions to fit container width
    const containerWidth = (style.width as number) || 300;
    const scale = containerWidth / cachedDimensions.width;
    placeholderWidth = containerWidth;
    placeholderHeight = cachedDimensions.height * scale;
  }

  // Check if image is cached to avoid showing placeholder unnecessarily
  const isImageCached = mediaLoader.isImageLoaded(url);

  // Build a container style that reserves space using aspect-ratio or explicit height
  const aspectRatio = expectedAspectRatio
    ? expectedAspectRatio
    : cachedDimensions
      ? cachedDimensions.width / Math.max(1, cachedDimensions.height)
      : undefined;

  const reservedContainerStyle: React.CSSProperties = {
    position: "relative",
    // Reserve space to prevent layout shifts during image load
    ...(aspectRatio
      ? { aspectRatio: `${Math.max(0.1, aspectRatio)}` }
      : placeholderHeight
        ? { minHeight: placeholderHeight }
        : {}),
    ...style,
  };

  return (
    <div ref={containerRef} style={reservedContainerStyle}>
      {/* Show placeholder when loading and showPlaceholder is true, but not for cached images */}
      {internalLoading && showPlaceholder && !isImageCached && (
        <ImagePlaceholder
          width={placeholderWidth}
          height={placeholderHeight}
          aspectRatio={expectedAspectRatio}
          isDarkMode={isDarkMode}
          // style={{
          //   position: "absolute",
          //   top: 0,
          //   left: 0,
          //   zIndex: 1,
          // }}
        />
      )}

      {/* Legacy loading indicator for backward compatibility */}
      {internalLoading && !showPlaceholder && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2,
          }}
        >
          <div>Loading...</div>
        </div>
      )}

      <img
        ref={imageRef}
        src={
          isInViewport || !internalLoading
            ? optimizedUrl || resolvedUrl
            : undefined
        }
        alt=""
        crossOrigin={corsMode === "anonymous" ? "anonymous" : undefined}
        referrerPolicy="no-referrer"
        style={{
          // Respect parent-requested sizing first; fall back to sensible defaults
          width: (style.width as number) || "100%",
          height: style.height ?? "auto",
          objectFit: (style as any).objectFit || "contain", // Default to contain to preserve aspect ratio
          borderRadius: (style as any).borderRadius || undefined,
          visibility: internalLoading ? "hidden" : "visible",
          position: "relative",
          zIndex: 2,
          display: "block",
        }}
        srcSet={srcSet}
        sizes={sizesAttr}
        loading={loading}
        decoding={decoding}
        fetchPriority={fetchPriority}
        onClick={onClick}
        onLoad={(e) => {
          setInternalLoading(false);
          setImageError(false);
          setRetryAttempt(0); // Reset retry count on successful load

          // Capture image dimensions
          const img = e.target as HTMLImageElement;
          const dimensions = {
            width: img.naturalWidth,
            height: img.naturalHeight,
          };

          // Cache dimensions for future use
          dimensionsCache.cacheDimensions(
            url,
            dimensions.width,
            dimensions.height
          );

          onLoad(dimensions);
        }}
        onError={() => {
          setInternalLoading(false);

          // Try fallback approaches before giving up
          if (corsMode === "anonymous" && retryAttempt === 0) {
            // First retry: try without CORS
            setRetryAttempt(1);
            setCorsMode("none");
            setImageError(false);
            setInternalLoading(true);
            return;
          }

          // All fallback attempts failed
          setImageError(true);
          onError();
        }}
      />
    </div>
  );
};
