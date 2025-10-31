import React, { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CORSImage } from "./CORSImage";

export interface ImageCarouselProps {
  imageUrls: string[];
  initialIndex?: number;
  onClose: () => void;
  isMobile?: boolean;
}

export const ImageCarousel: React.FC<ImageCarouselProps> = ({
  imageUrls,
  initialIndex = 0,
  onClose,
  isMobile = false,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isLoading, setIsLoading] = useState(true);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          onClose();
          break;
        case "ArrowLeft":
        case "h":
          e.preventDefault();
          setCurrentIndex((prev) =>
            prev > 0 ? prev - 1 : imageUrls.length - 1
          );
          break;
        case "ArrowRight":
        case "l":
          e.preventDefault();
          setCurrentIndex((prev) =>
            prev < imageUrls.length - 1 ? prev + 1 : 0
          );
          break;
      }
    },
    [onClose, imageUrls.length]
  );

  // Handle touch gestures for mobile
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartX.current || !touchStartY.current) return;

      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const deltaX = touchStartX.current - touchEndX;
      const deltaY = touchStartY.current - touchEndY;

      // Only handle horizontal swipes (ignore vertical scrolling)
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
        if (deltaX > 0) {
          // Swipe left - next image
          setCurrentIndex((prev) =>
            prev < imageUrls.length - 1 ? prev + 1 : 0
          );
        } else {
          // Swipe right - previous image
          setCurrentIndex((prev) =>
            prev > 0 ? prev - 1 : imageUrls.length - 1
          );
        }
      }

      touchStartX.current = null;
      touchStartY.current = null;
    },
    [imageUrls.length]
  );

  // Handle mouse wheel for desktop
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      if (e.deltaY > 0) {
        // Scroll down - next image
        setCurrentIndex((prev) => (prev < imageUrls.length - 1 ? prev + 1 : 0));
      } else {
        // Scroll up - previous image
        setCurrentIndex((prev) => (prev > 0 ? prev - 1 : imageUrls.length - 1));
      }
    },
    [imageUrls.length]
  );

  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : imageUrls.length - 1));
  }, [imageUrls.length]);

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < imageUrls.length - 1 ? prev + 1 : 0));
  }, [imageUrls.length]);

  // Close on backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  // Auto-focus the container when carousel opens for keyboard navigation
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.focus();
    }
  }, []);

  // Preload adjacent images
  useEffect(() => {
    const preloadImage = (url: string) => {
      const img = new Image();
      img.src = url;
    };

    // Preload current, previous, and next images
    const prevIndex =
      currentIndex > 0 ? currentIndex - 1 : imageUrls.length - 1;
    const nextIndex =
      currentIndex < imageUrls.length - 1 ? currentIndex + 1 : 0;

    if (imageUrls[prevIndex]) preloadImage(imageUrls[prevIndex]);
    if (imageUrls[nextIndex]) preloadImage(imageUrls[nextIndex]);
  }, [currentIndex, imageUrls]);

  if (imageUrls.length === 0) {
    return null;
  }

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: isMobile ? "1rem" : "2rem",
      }}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
      tabIndex={0}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        style={{
          position: "absolute",
          top: isMobile ? "0.5rem" : "1rem",
          right: isMobile ? "0.5rem" : "1rem",
          background: "rgba(0, 0, 0, 0.7)",
          border: "1px solid rgba(255, 255, 255, 0.3)",
          color: "white",
          cursor: "pointer",
          padding: isMobile ? "0.5rem" : "0.75rem",
          fontSize: isMobile ? "1.25rem" : "1.5rem",
          borderRadius: "50%",
          zIndex: 1000000,
          width: isMobile ? "2.5rem" : "3rem",
          height: isMobile ? "2.5rem" : "3rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.2s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgba(0, 0, 0, 0.7)";
        }}
        title="Close (ESC)"
      >
        ×
      </button>

      {/* Navigation arrows */}
      {imageUrls.length > 1 && (
        <>
          <button
            onClick={goToPrevious}
            style={{
              position: "absolute",
              left: isMobile ? "0.5rem" : "1rem",
              top: "50%",
              transform: "translateY(-50%)",
              background: "rgba(0, 0, 0, 0.7)",
              border: "1px solid rgba(255, 255, 255, 0.3)",
              color: "white",
              cursor: "pointer",
              padding: isMobile ? "0.5rem" : "0.75rem",
              fontSize: isMobile ? "1.25rem" : "1.5rem",
              borderRadius: "50%",
              zIndex: 1000000,
              width: isMobile ? "2.5rem" : "3rem",
              height: isMobile ? "2.5rem" : "3rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(0, 0, 0, 0.7)";
            }}
            title="Previous (← or h)"
          >
            ‹
          </button>

          <button
            onClick={goToNext}
            style={{
              position: "absolute",
              right: isMobile ? "0.5rem" : "1rem",
              top: "50%",
              transform: "translateY(-50%)",
              background: "rgba(0, 0, 0, 0.7)",
              border: "1px solid rgba(255, 255, 255, 0.3)",
              color: "white",
              cursor: "pointer",
              padding: isMobile ? "0.5rem" : "0.75rem",
              fontSize: isMobile ? "1.25rem" : "1.5rem",
              borderRadius: "50%",
              zIndex: 1000000,
              width: isMobile ? "2.5rem" : "3rem",
              height: isMobile ? "2.5rem" : "3rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(0, 0, 0, 0.7)";
            }}
            title="Next (→ or l)"
          >
            ›
          </button>
        </>
      )}

      {/* Image counter */}
      {imageUrls.length > 1 && (
        <div
          style={{
            position: "absolute",
            top: isMobile ? "0.5rem" : "1rem",
            left: isMobile ? "0.5rem" : "1rem",
            color: "rgba(255, 255, 255, 0.8)",
            fontSize: isMobile ? "0.875rem" : "1rem",
            fontWeight: "500",
            zIndex: 1000000,
          }}
        >
          {currentIndex + 1} / {imageUrls.length}
        </div>
      )}

      {/* Main image */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.3 }}
          style={{
            maxWidth: "90vw",
            maxHeight: "90vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <CORSImage
            url={imageUrls[currentIndex]}
            isLoading={isLoading}
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
              borderRadius: "8px",
              boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)",
            }}
            loading="eager"
            decoding="async"
            fetchPriority="high"
            onClick={() => {}} // No-op since carousel handles navigation
            onLoad={() => setIsLoading(false)}
            onError={() => setIsLoading(false)}
            isMobile={isMobile}
            enableOptimization={false}
            showPlaceholder={false}
          />
        </motion.div>
      </AnimatePresence>

      {/* Instructions */}
      <div
        style={{
          position: "absolute",
          bottom: isMobile ? "0.5rem" : "1rem",
          left: "50%",
          transform: "translateX(-50%)",
          color: "rgba(255, 255, 255, 0.7)",
          fontSize: isMobile ? "0.75rem" : "0.875rem",
          textAlign: "center",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
        }}
      >
        {imageUrls.length > 1
          ? "Swipe or use arrow keys (←→) or vim keys (h/l) to navigate • Click outside or press ESC to close"
          : "Click outside or press ESC to close"}
      </div>
    </motion.div>
  );
};
