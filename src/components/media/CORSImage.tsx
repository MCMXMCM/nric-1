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
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(() => {
    // Initialize with cached URL if available, otherwise null (wait for mediaLoader)
    return mediaLoader.getResolvedUrl(url) || null;
  });
  const [imageError, setImageError] = useState<boolean>(false);
  const [internalLoading, setInternalLoading] = useState<boolean>(() => {
    // If image is already cached, don't show loading state
    return !mediaLoader.isImageLoaded(url);
  });
  const [urlResolutionPending, setUrlResolutionPending] = useState<boolean>(() => {
    // Track if we're still waiting for mediaLoader to resolve
    return !mediaLoader.getResolvedUrl(url);
  });
  const [optimizedUrl, setOptimizedUrl] = useState<string | null>(null);
  const [, setOptimizationInfo] = useState<{
    wasResized: boolean;
    dimensions: { width: number; height: number };
    compressionRatio: number;
  } | null>(null);
  const [corsMode, setCorsMode] = useState<"anonymous" | "none">("anonymous");
  const [proxyFailed, setProxyFailed] = useState<boolean>(false);

  // Store cleanup function for optimized URL
  const cleanupRef = useRef<(() => void) | null>(null);
  // Store timeout for loading detection
  const loadingTimeoutRef = useRef<number | null>(null);

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

    // Reset error state when URL changes
    setImageError(false);
    // Only set loading to true if image is NOT already cached
    setInternalLoading(!isAlreadyLoaded);
    setCorsMode("anonymous");
    setProxyFailed(false);
    setUrlResolutionPending(!isAlreadyLoaded);

    // If image is already loaded, use cached result immediately without showing loading state
    if (isAlreadyLoaded && cachedUrl && isMounted) {
      setResolvedUrl(cachedUrl);
      setOptimizedUrl(null);
      setOptimizationInfo(null);
      setInternalLoading(false); // Ensure loading state is false for cached images
      setUrlResolutionPending(false);
      console.log(`🖼️ Using cached image: ${url.slice(0, 50)}...`);
      return;
    }

    // Trust mediaLoader's resolution - it handles all proxy fallback logic
    // CRITICAL: Wait for mediaLoader to resolve BEFORE setting the img src
    // This ensures we use the proxy URL if the original has CORS issues
    if (isMounted) {
      // Use mediaLoader to get the best URL (it handles caching and proxy resolution)
      const cachedResolved = mediaLoader.getResolvedUrl(url);
      if (cachedResolved) {
        setResolvedUrl(cachedResolved);
        setUrlResolutionPending(false);
      } else {
        // DON'T set resolvedUrl to original URL yet - wait for mediaLoader
        // The img element will wait until we have a resolved URL
        setResolvedUrl(null);
        setUrlResolutionPending(true);
        
        // Load via mediaLoader to get resolved URL (proxy if needed)
        mediaLoader.loadMedia(url).then((result) => {
          if (isMounted) {
            if (result.success) {
              setResolvedUrl(result.url);
            } else {
              // If mediaLoader fails, fall back to original URL as last resort
              console.warn(`[CORSImage] mediaLoader failed for ${url.slice(0, 50)}..., trying original`);
              setResolvedUrl(url);
            }
            setUrlResolutionPending(false);
          }
        }).catch(() => {
          // If mediaLoader throws, fall back to original URL
          if (isMounted) {
            setResolvedUrl(url);
            setUrlResolutionPending(false);
          }
        });
      }
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
    // Don't force webp conversion - let the proxy decide or use original format
    // Some sources may not support webp conversion properly, and forcing webp can cause failures
    const params = `&w=${Math.max(1, Math.floor(width))}&fit=cover&q=75`;
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

  // NOTE: Early return moved AFTER all hooks to avoid "Rendered fewer hooks than expected" error
  // The early return was previously here, but it caused hook count mismatch when imageError changed

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

  // Add loading timeout to detect stuck loads
  React.useEffect(() => {
    // Clear any existing timeout
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }

    // If we're loading, have a resolved URL, and image is not cached, start a timeout
    // Don't start timeout while URL resolution is pending (mediaLoader still working)
    if (internalLoading && !isImageCached && !imageError && resolvedUrl && !urlResolutionPending) {
      loadingTimeoutRef.current = window.setTimeout(() => {
        console.warn(`⏱️ Image load timed out after 10s: ${url.slice(0, 50)}...`);
        setInternalLoading(false);
        setImageError(true);
        onError();
      }, 10000); // 10 second timeout
    }

    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
    };
  }, [url, internalLoading, isImageCached, imageError, onError, resolvedUrl, urlResolutionPending]);

  // Early return for error state - placed AFTER all hooks to avoid hook count mismatch
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
          // Only set src when we have a resolved URL
          // This ensures we wait for mediaLoader to resolve (potentially to a proxy URL)
          // before the browser starts loading the image
          // The browser's native loading="lazy" and IntersectionObserver handle viewport detection
          resolvedUrl
            ? optimizedUrl || resolvedUrl
            : undefined
        }
        alt=""
        crossOrigin={corsMode === "anonymous" ? "anonymous" : undefined}
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
        // TEMPORARILY DISABLED: srcSet uses weserv.nl proxy which may be slow/failing
        // srcSet={proxyFailed ? undefined : srcSet}
        // sizes={proxyFailed ? undefined : sizesAttr}
        loading={loading}
        decoding={decoding}
        fetchPriority={fetchPriority}
        onClick={onClick}
        onLoad={(e) => {
          // Clear loading timeout on successful load
          if (loadingTimeoutRef.current) {
            clearTimeout(loadingTimeoutRef.current);
            loadingTimeoutRef.current = null;
          }

          setInternalLoading(false);
          setImageError(false);

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
          // Clear loading timeout on error
          if (loadingTimeoutRef.current) {
            clearTimeout(loadingTimeoutRef.current);
            loadingTimeoutRef.current = null;
          }

          setInternalLoading(false);

          // Simplified: Trust mediaLoader's resolution. If it fails, try original URL once.
          // Check if current URL is a proxy URL
          const isProxyUrl = resolvedUrl && (
                            resolvedUrl.includes('images.weserv.nl') || 
                            resolvedUrl.includes('imgproxy.nostr.build') ||
                            resolvedUrl.includes('corsproxy.io') ||
                            resolvedUrl.includes('imagedelivery.net'));
          
          // If proxy URL failed and we haven't tried original yet, fall back to original
          if (!proxyFailed && isProxyUrl) {
            setProxyFailed(true);
            setImageError(false);
            setInternalLoading(true);
            setOptimizedUrl(null);
            setResolvedUrl(url);
            setCorsMode("anonymous");
            return;
          }

          // If optimized srcSet failed, try without optimization
          if (!proxyFailed && enableOptimization && srcSet) {
            setProxyFailed(true);
            setImageError(false);
            setInternalLoading(true);
            setOptimizedUrl(null);
            setResolvedUrl(url);
            return;
          }

          // All fallback attempts failed - mediaLoader already tried all proxies
          setImageError(true);
          onError();
        }}
      />
    </div>
  );
};
