/**
 * Image optimization utilities for memory management and performance
 */

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface OptimizationOptions {
  maxDimension?: number;
  quality?: 'low' | 'medium' | 'high';
  isMobile?: boolean;
}

/**
 * Calculate optimal dimensions for image processing
 * Reduces memory usage while maintaining aspect ratio
 */
export function calculateOptimalDimensions(
  original: ImageDimensions,
  options: OptimizationOptions = {}
): { 
  target: ImageDimensions; 
  scale: number; 
  memoryReduction: number;
  shouldResize: boolean;
} {
  const {
    maxDimension = options.isMobile ? 1200 : 1920
  } = options;

  const { width: originalWidth, height: originalHeight } = original;
  
  // Check if resizing is needed
  const shouldResize = originalWidth > maxDimension || originalHeight > maxDimension;
  
  if (!shouldResize) {
    return {
      target: { width: originalWidth, height: originalHeight },
      scale: 1,
      memoryReduction: 0,
      shouldResize: false
    };
  }

  // Calculate scale factor to fit within max dimension
  const scale = Math.min(
    maxDimension / originalWidth,
    maxDimension / originalHeight
  );

  const target = {
    width: Math.round(originalWidth * scale),
    height: Math.round(originalHeight * scale)
  };

  // Memory reduction is proportional to area reduction
  const memoryReduction = (1 - scale * scale) * 100;

  return {
    target,
    scale,
    memoryReduction,
    shouldResize: true
  };
}

/**
 * Create an optimized ImageBitmap from a blob
 * Automatically resizes large images to reduce memory usage
 */
export async function createOptimizedImageBitmap(
  blob: Blob,
  options: OptimizationOptions & {
    imageOrientation?: 'none' | 'from-image';
    premultiplyAlpha?: 'none' | 'premultiply' | 'default';
  } = {}
): Promise<{
  bitmap: ImageBitmap;
  dimensions: ImageDimensions;
  wasResized: boolean;
  memoryReduction: number;
}> {
  const {
    imageOrientation = 'none',
    premultiplyAlpha = 'premultiply',
    quality = 'high',
    ...optimizationOptions
  } = options;

  // First, get original dimensions with a temporary bitmap
  const tempBitmap = await createImageBitmap(blob);
  const originalDimensions = {
    width: tempBitmap.width,
    height: tempBitmap.height
  };
  tempBitmap.close(); // Clean up immediately

  // Calculate optimal dimensions
  const optimization = calculateOptimalDimensions(originalDimensions, optimizationOptions);

  // Create the final bitmap with optimal dimensions
  const bitmapOptions: ImageBitmapOptions = {
    imageOrientation,
    premultiplyAlpha,
    ...(optimization.shouldResize && {
      resizeWidth: optimization.target.width,
      resizeHeight: optimization.target.height,
      resizeQuality: quality
    })
  };

  const bitmap = await createImageBitmap(blob, bitmapOptions);

  return {
    bitmap,
    dimensions: optimization.target,
    wasResized: optimization.shouldResize,
    memoryReduction: optimization.memoryReduction
  };
}

/**
 * Estimate memory usage of an ImageBitmap in MB
 */
export function estimateImageMemoryUsage(dimensions: ImageDimensions): number {
  // 4 bytes per pixel (RGBA)
  return (dimensions.width * dimensions.height * 4) / (1024 * 1024);
}

/**
 * Get recommended max dimensions based on device capabilities
 */
export function getRecommendedMaxDimensions(isMobile: boolean = false): number {
  if (isMobile) {
    // Mobile devices have less memory and slower GPUs
    return 1200;
  }
  
  // Desktop can handle larger images but still cap for ASCII processing
  return 1920;
}

/**
 * Log image optimization results for debugging
 */
export function logOptimizationResults(
  original: ImageDimensions,
  optimized: ImageDimensions,
  memoryReduction: number,
  context: string = 'Image'
): void {
  if (memoryReduction > 0) {
    console.log(`${context} optimization:`, {
      original: `${original.width}×${original.height}`,
      optimized: `${optimized.width}×${optimized.height}`,
      memoryReduction: `${memoryReduction.toFixed(1)}%`,
      originalMemory: `${estimateImageMemoryUsage(original).toFixed(1)}MB`,
      optimizedMemory: `${estimateImageMemoryUsage(optimized).toFixed(1)}MB`
    });
  }
}
