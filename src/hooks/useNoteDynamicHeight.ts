import { useCallback, useRef } from "react";
import type { Note } from "../types/nostr/types";
import { extractImageUrls, extractVideoUrls, removeMediaUrls } from "../utils/nostr/utils";

interface NoteDynamicHeightOptions {
  isMobile: boolean;
  imageMode: boolean;
  showFullContent?: boolean;
  onHeightChange?: (noteId: string, newHeight: number) => void;
}

interface ImageDimensions {
  width: number;
  height: number;
  aspectRatio: number;
}

interface NoteDimensions {
  estimatedHeight: number;
  textLines: number;
  hasImages: boolean;
  hasVideos: boolean;
  hasText: boolean;
  isTextTruncated: boolean;
  imageCount: number;
  actualImageDimensions?: ImageDimensions[];
}

export const useNoteDynamicHeight = (options: NoteDynamicHeightOptions) => {
  const { isMobile, imageMode, showFullContent = false, onHeightChange } = options;

  // Store actual image dimensions for dynamic sizing
  const imageDimensionsCache = useRef<Map<string, ImageDimensions>>(new Map());
  const noteDimensionsCache = useRef<Map<string, NoteDimensions>>(new Map());

  // Constants for height calculations - more precise values
  const HEADER_HEIGHT = 0; // Remove header height as it's not needed for profile notes
  // Use more accurate action bar height - mobile action bars can be taller due to touch targets
  const ACTION_BAR_HEIGHT = isMobile ? 50 : 60; // Reduced from 60/70 to match actual rendered height
  const LINE_HEIGHT = 21; // 1.5 * 14px (0.875rem)
  const MIN_NOTE_HEIGHT = isMobile ? 120 : 100;
  // Remove artificial height constraints to allow notes to grow to their natural height
  // This prevents ActionButtonsBar and images from being cut off
  const MAX_NOTE_HEIGHT = isMobile ? 2000 : 3000; // Much higher limits to accommodate large content
  const VIDEO_PLACEHOLDER_HEIGHT = isMobile ? 200 : 250; // Height for video placeholders
  // Reduced mobile buffer to prevent excessive spacing
  const MOBILE_BUFFER = isMobile ? 8 : 0; // Minimal buffer for mobile layout spacing
  // Additional spacing between media and text on mobile
  const MOBILE_MEDIA_TEXT_SPACING = isMobile ? 16 : 0; // Account for gap between media and text
  // Repost/quote baseline sizing to reduce early reflow on initial load
  const REPOST_BASE_MIN = isMobile ? 620 : 520;
  const REPOST_WITH_MEDIA_EXTRA = isMobile ? 260 : 220;
  const REPOST_WITH_TEXT_EXTRA = isMobile ? 180 : 150;

  const isRepostLike = (note: Note): boolean => {
    try {
      if (!note) return false;
      if ((note as any).kind === 6 || (note as any).kind === 16) return true;
      const tags = (note as any).tags || [];
      return Array.isArray(tags) && tags.some((t: any) => Array.isArray(t) && (t[0] === 'q' || t[0] === 'e'));
    } catch {
      return false;
    }
  };

  // Calculate optimal layout dimensions for images based on count and aspect ratios
  const calculateOptimalImageHeight = useCallback(
    (imageUrls: string[], hasText: boolean, containerWidth?: number): number => {
      if (!imageUrls.length) return 0;

      // Get actual dimensions from cache if available
      const actualDimensions = imageUrls
        .map(url => imageDimensionsCache.current.get(url))
        .filter(Boolean) as ImageDimensions[];

      // Use actual dimensions if we have them for all images
      if (actualDimensions.length === imageUrls.length && containerWidth) {
        return calculateDynamicImageHeight(actualDimensions, imageUrls.length, hasText, containerWidth);
      }

      // Fallback to estimated heights - be more generous for natural sizing
      if (isMobile) {
        // Mobile: Much more generous estimates for natural aspect ratios
        if (hasText && imageMode) {
          // When text is present, images might be tall (like screenshots)
          return containerWidth ? Math.min(containerWidth * 1.2, 600) : 400;
        } else {
          // Image-only notes can be very tall (like full screenshots)
          return containerWidth ? Math.min(containerWidth * 1.5, 800) : 500;
        }
      } else {
        // Desktop: More generous estimates for natural sizing
        if (hasText && imageMode) {
          return 400; // Increased for natural aspect ratios
        } else {
          return 600; // Much more generous for image-only notes
        }
      }
    },
    [isMobile, imageMode]
  );

  // Calculate dynamic height based on actual image dimensions and layout
  const calculateDynamicImageHeight = useCallback(
    (dimensions: ImageDimensions[], imageCount: number, hasText: boolean, containerWidth: number): number => {
      if (!dimensions.length) return 0;

      const availableWidth = containerWidth * (hasText && !isMobile ? 0.5 : 1); // 50% width when text is present on desktop
      const gap = 2; // Gap between images in grid

      switch (imageCount) {
        case 1: {
          const { aspectRatio } = dimensions[0];
          // Much more flexible max height for single images to accommodate natural sizing
          const maxHeight = isMobile ? (hasText ? 600 : 800) : 700;
          const naturalHeight = availableWidth / aspectRatio;
          return Math.min(naturalHeight, maxHeight);
        }
        
        case 2: {
          // Two images side by side
          const imageWidth = (availableWidth - gap) / 2;
          const heights = dimensions.map(d => imageWidth / d.aspectRatio);
          return Math.max(...heights);
        }
        
        case 3: {
          // First image spans full height on left, two smaller on right
          const leftWidth = (availableWidth - gap) / 2;
          const rightWidth = leftWidth;
          const rightHeight = (rightWidth - gap) / 2;
          
          const leftHeight = leftWidth / dimensions[0].aspectRatio;
          const maxRightHeight = Math.max(
            rightHeight / dimensions[1].aspectRatio,
            rightHeight / dimensions[2].aspectRatio
          ) * 2 + gap;
          
          return Math.max(leftHeight, maxRightHeight);
        }
        
        case 4:
        default: {
          // 2x2 grid
          const imageWidth = (availableWidth - gap) / 2;
          const imageHeight = imageWidth / 1.5; // Reasonable aspect ratio for grid
          return imageHeight * 2 + gap;
        }
      }
    },
    [isMobile]
  );

  // Calculate video placeholder height
  const calculateVideoPlaceholderHeight = useCallback(
    (videoUrls: string[]): number => {
      if (!videoUrls.length) return 0;
      
      // In image mode, videos show as placeholders
      if (imageMode) {
        return VIDEO_PLACEHOLDER_HEIGHT * videoUrls.length + (videoUrls.length - 1) * 8; // 8px gap between placeholders
      }
      
      return 0; // Videos don't contribute to height calculations when not in image mode (they're full size)
    },
    [imageMode, VIDEO_PLACEHOLDER_HEIGHT]
  );

  // Estimate text height based on content and constraints - more accurate calculation
  const calculateTextHeight = useCallback(
    (textContent: string, maxLines?: number): { height: number; lines: number; isTruncated: boolean } => {
      if (!textContent.trim()) return { height: 0, lines: 0, isTruncated: false };

      const lines = textContent.split("\n");
      let estimatedLines = 0;
      let charCount = 0;
      let truncateAtIndex = textContent.length;

      // More accurate character width estimation based on font size
      const avgCharsPerLine = isMobile ? 45 : 85; // Slightly more accurate
      const effectiveMaxLines = maxLines || (showFullContent ? 999 : (isMobile ? 8 : 12)); // Allow a bit more content

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineLength = line.length;

        // Each actual line break counts as 1 line minimum
        const estimatedLinesForThisLine = Math.max(
          1,
          Math.ceil(lineLength / avgCharsPerLine)
        );

        if (estimatedLines + estimatedLinesForThisLine > effectiveMaxLines) {
          // Find where to truncate within this line
          const remainingLines = effectiveMaxLines - estimatedLines;
          const maxCharsInRemainingLines = remainingLines * avgCharsPerLine;
          const truncateInLine = Math.max(
            0,
            Math.min(lineLength, maxCharsInRemainingLines - 3)
          );

          truncateAtIndex = charCount + truncateInLine;
          estimatedLines = effectiveMaxLines;
          break;
        }

        estimatedLines += estimatedLinesForThisLine;
        charCount += lineLength + (i < lines.length - 1 ? 1 : 0);
      }

      const isTruncated = truncateAtIndex < textContent.length;
      const actualLines = Math.min(estimatedLines, effectiveMaxLines);
      
      // More precise height calculation with reduced padding
      const basePadding = isMobile ? 12 : 24; // Reduced from 16/32
      const height = actualLines * LINE_HEIGHT + basePadding;

      return { height, lines: actualLines, isTruncated };
    },
    [isMobile, showFullContent, LINE_HEIGHT]
  );

  // Calculate dimensions for a single note
  const calculateNoteDimensions = useCallback(
    (note: Note): NoteDimensions => {
      const safeContent = typeof note.content === "string" ? note.content : String(note.content ?? "");
      const imageUrls = extractImageUrls(safeContent);
      const videoUrls = extractVideoUrls(safeContent);
      const textContent = imageMode ? removeMediaUrls(safeContent) : safeContent;
      
      const hasImages = imageUrls.length > 0 && !note.mediaLoadError;
      const hasVideos = videoUrls.length > 0;
      const hasText = textContent.trim().length > 0;
      const repostLike = isRepostLike(note);

      // Calculate text dimensions
      // Only limit text lines if we have media AND imageMode is enabled
      const effectiveMaxLines = (hasImages || hasVideos) && imageMode ? (isMobile ? 3 : 4) : undefined;
      const textDimensions = calculateTextHeight(textContent, effectiveMaxLines);
      
      // Calculate media heights - only if imageMode is enabled
      // Use container width if available for more accurate calculations
      const containerWidth = isMobile ? window.innerWidth - 32 : Math.min(window.innerWidth * 0.6, 600); // Account for padding
      const imageHeight = hasImages && imageMode ? calculateOptimalImageHeight(imageUrls, hasText, containerWidth) : 0;
      const videoPlaceholderHeight = hasVideos && imageMode ? calculateVideoPlaceholderHeight(videoUrls) : 0;

      // Calculate total height
      let totalHeight = HEADER_HEIGHT + ACTION_BAR_HEIGHT;
      
      if ((hasImages || hasVideos) && hasText && imageMode) {
        if (isMobile) {
          // Mobile: stack vertically
          totalHeight += imageHeight + videoPlaceholderHeight + textDimensions.height;
        } else {
          // Desktop: side by side, use the taller of the two
          totalHeight += Math.max(imageHeight + videoPlaceholderHeight, textDimensions.height);
        }
      } else if ((hasImages || hasVideos) && imageMode) {
        totalHeight += imageHeight + videoPlaceholderHeight;
      } else if (hasText) {
        totalHeight += textDimensions.height;
      }

      // Add mobile buffer for better visibility
      totalHeight += MOBILE_BUFFER;

      // Ensure a stronger baseline for repost/quote notes to avoid later jumps
      if (imageMode && repostLike) {
        let repostBaseline = REPOST_BASE_MIN;
        if (hasImages || hasVideos) repostBaseline += REPOST_WITH_MEDIA_EXTRA;
        if (hasText) repostBaseline += REPOST_WITH_TEXT_EXTRA;
        totalHeight = Math.max(totalHeight, repostBaseline);
      }

      // Apply min/max constraints
      totalHeight = Math.max(MIN_NOTE_HEIGHT, Math.min(MAX_NOTE_HEIGHT, totalHeight));

      return {
        estimatedHeight: totalHeight,
        textLines: textDimensions.lines,
        hasImages: hasImages && imageMode, // Only true if images exist AND imageMode is enabled
        hasVideos: hasVideos && imageMode, // Only true if videos exist AND imageMode is enabled
        hasText,
        isTextTruncated: textDimensions.isTruncated,
        imageCount: imageUrls.length,
        actualImageDimensions: imageUrls.map(url => imageDimensionsCache.current.get(url)).filter(Boolean) as ImageDimensions[],
      };
    },
    [
      imageMode,
      isMobile,
      calculateTextHeight,
      calculateOptimalImageHeight,
      calculateVideoPlaceholderHeight,
      HEADER_HEIGHT,
      ACTION_BAR_HEIGHT,
      MIN_NOTE_HEIGHT,
      MAX_NOTE_HEIGHT,
      MOBILE_BUFFER,
    ]
  );

  // Calculate dimensions for multiple notes
  const calculateNotesDimensions = useCallback(
    (notes: Note[]): NoteDimensions[] => {
      return notes.map(calculateNoteDimensions);
    },
    [calculateNoteDimensions]
  );

  // Get saved heights from localStorage
  const getSavedHeights = useCallback((profileKey: string) => {
    try {
      const saved = localStorage.getItem(`note-heights-${profileKey}`);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  }, []);

  // Save heights to localStorage
  const saveHeights = useCallback((profileKey: string, heights: Record<string, number>) => {
    try {
      localStorage.setItem(`note-heights-${profileKey}`, JSON.stringify(heights));
    } catch (error) {
      console.warn('Failed to save note heights:', error);
    }
  }, []);

  // Dynamic height estimator function for react-virtual
  const createHeightEstimator = useCallback(
    (notes: Note[], profileKey?: string) => {
      const savedHeights = profileKey ? getSavedHeights(profileKey) : {};
      
      return (index: number) => {
        if (index >= notes.length) {
          return isMobile ? 200 : 250;
        }
        
        const note = notes[index];
        if (!note) {
          return isMobile ? 200 : 250;
        }
        
        // First check saved heights
        if (savedHeights[note.id]) {
          return savedHeights[note.id];
        }
        
        // Then check runtime cache
        const cachedDimensions = noteDimensionsCache.current.get(note.id);
        if (cachedDimensions) {
          return cachedDimensions.estimatedHeight;
        }
        
        // Use a more generous estimate to prevent smooshing
        const baseHeight = isMobile ? 180 : 150; // Increased from 120/100
        const contentLength = note.content?.length || 0;
        const estimatedLines = Math.ceil(contentLength / 60); // Reduced from 80 to account for shorter lines
        const estimatedHeight = Math.max(baseHeight, estimatedLines * 24 + 80); // Increased line height and padding
        
        return Math.min(estimatedHeight, isMobile ? 1000 : 1200); // Increased max height
      };
    },
    [isMobile, getSavedHeights]
  );

  // Record actual measured height for a note
  const recordActualHeight = useCallback(
    (noteId: string, actualHeight: number, profileKey?: string) => {
      // Update runtime cache
      const existing = noteDimensionsCache.current.get(noteId);
      if (existing) {
        existing.estimatedHeight = actualHeight;
        noteDimensionsCache.current.set(noteId, existing);
      }
      
      // Save to localStorage if we have a profile key
      if (profileKey) {
        const savedHeights = getSavedHeights(profileKey);
        savedHeights[noteId] = actualHeight;
        saveHeights(profileKey, savedHeights);
      }
    },
    [getSavedHeights, saveHeights]
  );

  // Store image dimensions when they load
  const recordImageDimensions = useCallback(
    (noteId: string, imageUrl: string, dimensions: { width: number; height: number }) => {
      const imageDimensions: ImageDimensions = {
        width: dimensions.width,
        height: dimensions.height,
        aspectRatio: dimensions.width / dimensions.height,
      };
      
      const wasAlreadyCached = imageDimensionsCache.current.has(imageUrl);
      imageDimensionsCache.current.set(imageUrl, imageDimensions);
      
      // Clear the note's cached dimensions so it gets recalculated
      noteDimensionsCache.current.delete(noteId);
      
      // Only trigger re-measurement if this is new dimension data
      if (!wasAlreadyCached && onHeightChange) {
        // Small delay to ensure the DOM has updated
        setTimeout(() => {
          onHeightChange(noteId, 0);
        }, 50);
      }
    },
    [onHeightChange]
  );

  // Get container width for dynamic calculations
  const calculateWithContainerWidth = useCallback(
    (note: Note, containerWidth: number): NoteDimensions => {
      const safeContent = typeof note.content === "string" ? note.content : String(note.content ?? "");
      const imageUrls = extractImageUrls(safeContent);
      const videoUrls = extractVideoUrls(safeContent);
      const textContent = imageMode ? removeMediaUrls(safeContent) : safeContent;
      
      const hasImages = imageUrls.length > 0 && !note.mediaLoadError;
      const hasVideos = videoUrls.length > 0;
      const hasText = textContent.trim().length > 0;
      const repostLike = isRepostLike(note);

      // Calculate text dimensions
      const effectiveMaxLines = (hasImages || hasVideos) && imageMode ? (isMobile ? 3 : 4) : undefined;
      const textDimensions = calculateTextHeight(textContent, effectiveMaxLines);
      
      // Calculate media heights with container width
      const imageHeight = hasImages && imageMode ? calculateOptimalImageHeight(imageUrls, hasText, containerWidth) : 0;
      const videoPlaceholderHeight = hasVideos && imageMode ? calculateVideoPlaceholderHeight(videoUrls) : 0;

      // Calculate total height
      let totalHeight = HEADER_HEIGHT + ACTION_BAR_HEIGHT;
      
      if ((hasImages || hasVideos) && hasText && imageMode) {
        if (isMobile) {
          // Mobile: vertical stacking with proper spacing
          totalHeight += imageHeight + videoPlaceholderHeight + textDimensions.height + MOBILE_MEDIA_TEXT_SPACING;
        } else {
          // Desktop: side-by-side layout
          totalHeight += Math.max(imageHeight + videoPlaceholderHeight, textDimensions.height);
        }
      } else if ((hasImages || hasVideos) && imageMode) {
        totalHeight += imageHeight + videoPlaceholderHeight;
      } else if (hasText) {
        totalHeight += textDimensions.height;
      }

      totalHeight += MOBILE_BUFFER;

      // Apply repost/quote baseline
      if (imageMode && repostLike) {
        let repostBaseline = REPOST_BASE_MIN;
        if (hasImages || hasVideos) repostBaseline += REPOST_WITH_MEDIA_EXTRA;
        if (hasText) repostBaseline += REPOST_WITH_TEXT_EXTRA;
        totalHeight = Math.max(totalHeight, repostBaseline);
      }
      totalHeight = Math.max(MIN_NOTE_HEIGHT, Math.min(MAX_NOTE_HEIGHT, totalHeight));

      return {
        estimatedHeight: totalHeight,
        textLines: textDimensions.lines,
        hasImages: hasImages && imageMode,
        hasVideos: hasVideos && imageMode,
        hasText,
        isTextTruncated: textDimensions.isTruncated,
        imageCount: imageUrls.length,
        actualImageDimensions: imageUrls.map(url => imageDimensionsCache.current.get(url)).filter(Boolean) as ImageDimensions[],
      };
    },
    [
      imageMode,
      isMobile,
      calculateTextHeight,
      calculateOptimalImageHeight,
      calculateVideoPlaceholderHeight,
      HEADER_HEIGHT,
      ACTION_BAR_HEIGHT,
      MIN_NOTE_HEIGHT,
      MAX_NOTE_HEIGHT,
      MOBILE_BUFFER,
    ]
  );

  // Clear cache for performance
  const clearDimensionsCache = useCallback(() => {
    imageDimensionsCache.current.clear();
    noteDimensionsCache.current.clear();
  }, []);

  // Get cached image dimensions for persistence
  const getImageDimensionsCache = useCallback(() => {
    const cache: Record<string, { width: number; height: number }> = {};
    imageDimensionsCache.current.forEach((dimensions, url) => {
      cache[url] = { width: dimensions.width, height: dimensions.height };
    });
    return cache;
  }, []);

  // Restore cached image dimensions from scroll restoration
  const restoreImageDimensionsCache = useCallback((cache: Record<string, { width: number; height: number }>) => {
    Object.entries(cache).forEach(([url, dimensions]) => {
      imageDimensionsCache.current.set(url, {
        width: dimensions.width,
        height: dimensions.height,
        aspectRatio: dimensions.width / dimensions.height,
      });
    });
    console.log(`🔄 Restored ${Object.keys(cache).length} cached image dimensions`);
  }, []);

  return {
    calculateNoteDimensions,
    calculateNotesDimensions,
    createHeightEstimator,
    recordImageDimensions,
    recordActualHeight,
    calculateWithContainerWidth,
    clearDimensionsCache,
    getImageDimensionsCache,
    restoreImageDimensionsCache,
  };
};
