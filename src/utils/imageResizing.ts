/**
 * Image resizing utilities for regular display mode
 * Uses Canvas API for cross-browser compatibility including iOS Safari
 */

export interface ImageResizeOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
  isMobile?: boolean;
}

export interface ResizeResult {
  blob: Blob;
  dimensions: {
    width: number;
    height: number;
  };
  wasResized: boolean;
  originalSize: number;
  optimizedSize: number;
  compressionRatio: number;
}

/**
 * Get optimal dimensions for display based on device type
 */
export function getOptimalDisplayDimensions(isMobile: boolean = false): { maxWidth: number; maxHeight: number } {
  if (isMobile) {
    // Mobile devices - limit to reasonable sizes for display
    return { maxWidth: 800, maxHeight: 800 };
  }
  
  // Desktop - larger but still reasonable for display (not processing like ASCII)
  return { maxWidth: 1200, maxHeight: 1200 };
}

/**
 * Check if an image needs resizing based on its dimensions
 */
export function shouldResizeImage(
  width: number, 
  height: number, 
  maxWidth: number, 
  maxHeight: number
): boolean {
  return width > maxWidth || height > maxHeight;
}

/**
 * Calculate new dimensions maintaining aspect ratio
 */
export function calculateResizedDimensions(
  originalWidth: number,
  originalHeight: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  const aspectRatio = originalWidth / originalHeight;
  
  let newWidth = originalWidth;
  let newHeight = originalHeight;
  
  // Scale down if width exceeds maximum
  if (newWidth > maxWidth) {
    newWidth = maxWidth;
    newHeight = newWidth / aspectRatio;
  }
  
  // Scale down if height still exceeds maximum
  if (newHeight > maxHeight) {
    newHeight = maxHeight;
    newWidth = newHeight * aspectRatio;
  }
  
  return {
    width: Math.round(newWidth),
    height: Math.round(newHeight)
  };
}

/**
 * Create a resized image blob using Canvas API
 * Compatible with iOS Safari, Chrome, and other major browsers
 */
export async function resizeImageBlob(
  originalBlob: Blob,
  options: ImageResizeOptions = {}
): Promise<ResizeResult> {
  const {
    quality = 0.85,
    format = 'jpeg',
    isMobile = false
  } = options;
  
  const { maxWidth, maxHeight } = getOptimalDisplayDimensions(isMobile);
  const optimalMaxWidth = options.maxWidth || maxWidth;
  const optimalMaxHeight = options.maxHeight || maxHeight;
  
  // Create image element to get dimensions
  const img = new Image();
  const originalSize = originalBlob.size;
  
  return new Promise((resolve, reject) => {
    img.onload = () => {
      const { width: originalWidth, height: originalHeight } = img;
      
      // Check if resizing is needed
      const needsResize = shouldResizeImage(originalWidth, originalHeight, optimalMaxWidth, optimalMaxHeight);
      
      if (!needsResize) {
        resolve({
          blob: originalBlob,
          dimensions: { width: originalWidth, height: originalHeight },
          wasResized: false,
          originalSize,
          optimizedSize: originalSize,
          compressionRatio: 1
        });
        return;
      }
      
      // Calculate new dimensions
      const newDimensions = calculateResizedDimensions(
        originalWidth, 
        originalHeight, 
        optimalMaxWidth, 
        optimalMaxHeight
      );
      
      // Create canvas for resizing
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      
      canvas.width = newDimensions.width;
      canvas.height = newDimensions.height;
      
      // Use high-quality image rendering
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      
      // Draw resized image
      ctx.drawImage(img, 0, 0, newDimensions.width, newDimensions.height);
      
      // Convert to blob
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to create resized blob'));
            return;
          }
          
          const optimizedSize = blob.size;
          const compressionRatio = originalSize / optimizedSize;
          
          resolve({
            blob,
            dimensions: newDimensions,
            wasResized: true,
            originalSize,
            optimizedSize,
            compressionRatio
          });
        },
        `image/${format}`,
        quality
      );
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load image for resizing'));
    };
    
    // Create object URL for the image
    const objectUrl = URL.createObjectURL(originalBlob);
    img.src = objectUrl;
    
    // Set up cleanup for object URL
    const originalOnLoad = img.onload;
    img.onload = (event) => {
      URL.revokeObjectURL(objectUrl);
      if (originalOnLoad) {
        originalOnLoad.call(img, event);
      }
    };
  });
}

/**
 * Resize image from URL and return optimized blob URL
 */
export async function resizeImageFromUrl(
  imageUrl: string,
  options: ImageResizeOptions = {}
): Promise<{
  optimizedUrl: string;
  cleanup: () => void;
  wasResized: boolean;
  dimensions: { width: number; height: number };
  compressionRatio: number;
}> {
  try {
    // Fetch the image
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }
    
    const originalBlob = await response.blob();
    const resizeResult = await resizeImageBlob(originalBlob, options);
    
    // Create object URL for the optimized image
    const optimizedUrl = URL.createObjectURL(resizeResult.blob);
    
    return {
      optimizedUrl,
      cleanup: () => URL.revokeObjectURL(optimizedUrl),
      wasResized: resizeResult.wasResized,
      dimensions: resizeResult.dimensions,
      compressionRatio: resizeResult.compressionRatio
    };
  } catch (error) {
    throw new Error(`Image resizing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Log optimization results for debugging
 */
export function logImageOptimization(
  originalDimensions: { width: number; height: number },
  optimizedDimensions: { width: number; height: number },
  compressionRatio: number,
  wasResized: boolean,
  context: string = 'Image'
): void {
  if (wasResized) {
    console.log(`${context} optimization:`, {
      original: `${originalDimensions.width}×${originalDimensions.height}`,
      optimized: `${optimizedDimensions.width}×${optimizedDimensions.height}`,
      compressionRatio: `${compressionRatio.toFixed(2)}x`,
      sizeSaving: `${((1 - 1/compressionRatio) * 100).toFixed(1)}%`
    });
  }
}
