import { useCallback, useRef, useEffect } from 'react';
import type { Virtualizer } from '@tanstack/react-virtual';
import type { Note } from '../types/nostr/types';

interface DynamicSizingConfig {
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  notes: Note[];
  isMobile: boolean;
  // Sizing parameters
  baseFontSize?: number;
  lineHeight?: number;
  padding?: number;
  mediaHeight?: number;
  // Performance parameters
  measurementThreshold?: number;
  debounceMs?: number;
  batchSize?: number;
}

interface SizeCache {
  [noteId: string]: {
    height: number;
    timestamp: number;
    contentHash: string; // Hash of content to detect changes
  };
}

/**
 * Improved dynamic sizing hook that fixes spacing issues and content clipping
 * during scroll restoration by providing more accurate size estimates and
 * better measurement timing
 */
export function useImprovedDynamicSizing(config: DynamicSizingConfig) {
  const {
    virtualizer,
    notes,
    isMobile,
    baseFontSize = 16,
    lineHeight = 1.5,
    padding = 16,
    mediaHeight = 300,
    measurementThreshold = 5,
    debounceMs = 16,
    batchSize = 10,
  } = config;

  const sizeCache = useRef<SizeCache>({});
  const measurementQueue = useRef<Set<number>>(new Set());
  const measurementTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastMeasurementBatch = useRef<number>(0);

  /**
   * Create a simple hash of note content to detect changes
   */
  const createContentHash = useCallback((note: Note): string => {
    const content = note.content || '';
    const imageCount = note.imageUrls?.length || 0;
    const videoCount = note.videoUrls?.length || 0;
    const tagCount = note.tags?.length || 0;
    
    return `${content.length}-${imageCount}-${videoCount}-${tagCount}`;
  }, []);

  /**
   * Enhanced size estimation that accounts for all content types
   */
  const estimateNoteSize = useCallback((index: number): number => {
    const note = notes[index];
    if (!note) return 200; // Fallback

    // Check cache first
    const contentHash = createContentHash(note);
    const cached = sizeCache.current[note.id];
    if (cached && cached.contentHash === contentHash) {
      // Use cached size if content hasn't changed
      return cached.height;
    }

    // Calculate estimated size
    let estimatedHeight = padding * 2; // Top and bottom padding

    // Header (author, timestamp, etc.)
    estimatedHeight += 40;

    // Content estimation
    const content = note.content || '';
    if (content) {
      // More accurate text measurement
      const charsPerLine = isMobile ? 40 : 80;
      const lines = Math.max(1, Math.ceil(content.length / charsPerLine));
      
      // Account for line breaks in content
      const actualLines = content.split('\n').length;
      const estimatedLines = Math.max(lines, actualLines);
      
      estimatedHeight += estimatedLines * (baseFontSize * lineHeight);
    }

    // Media content
    const imageCount = note.imageUrls?.length || 0;
    const videoCount = note.videoUrls?.length || 0;
    
    if (imageCount > 0) {
      // Account for image aspect ratios and grid layout
      const imagesPerRow = isMobile ? 1 : Math.min(imageCount, 2);
      const rows = Math.ceil(imageCount / imagesPerRow);
      estimatedHeight += rows * mediaHeight;
      estimatedHeight += (rows - 1) * 8; // Gap between rows
    }
    
    if (videoCount > 0) {
      estimatedHeight += videoCount * mediaHeight;
      estimatedHeight += (videoCount - 1) * 8; // Gap between videos
    }

    // Reply/quote content
    const hasReply = note.tags?.some(tag => tag[0] === 'e') || false;
    const isRepost = note.kind === 6;
    
    if (hasReply) {
      estimatedHeight += 60; // Reply indicator and quoted content
    }
    
    if (isRepost) {
      estimatedHeight += 80; // Repost content
    }

    // Footer (reactions, buttons, etc.)
    estimatedHeight += 50;

    // Clamp to reasonable bounds
    const minHeight = 120;
    const maxHeight = isMobile ? 1200 : 1000;
    const finalHeight = Math.min(Math.max(estimatedHeight, minHeight), maxHeight);

    // Cache the estimation
    sizeCache.current[note.id] = {
      height: finalHeight,
      timestamp: Date.now(),
      contentHash,
    };

    return finalHeight;
  }, [notes, isMobile, baseFontSize, lineHeight, padding, mediaHeight, createContentHash]);

  /**
   * Batch measurement processing to avoid overwhelming the browser
   */
  const processMeasurementQueue = useCallback(() => {
    const now = Date.now();
    
    // Rate limit batch processing
    if (now - lastMeasurementBatch.current < debounceMs) {
      return;
    }

    const queue = Array.from(measurementQueue.current);
    if (queue.length === 0) return;

    console.log(`📏 Processing measurement batch: ${queue.length} items`);

    // Process in smaller batches to avoid blocking
    const batch = queue.splice(0, batchSize);
    batch.forEach(index => {
      measurementQueue.current.delete(index);
      
      const element = document.querySelector(`[data-index="${index}"]`) as HTMLElement;
      if (element) {
        const actualHeight = element.getBoundingClientRect().height;
        const note = notes[index];
        
        if (note && actualHeight > 0) {
          const contentHash = createContentHash(note);
          const estimatedHeight = estimateNoteSize(index);
          
          // Only update cache if measurement differs significantly from estimation
          if (Math.abs(actualHeight - estimatedHeight) > measurementThreshold) {
            sizeCache.current[note.id] = {
              height: actualHeight,
              timestamp: now,
              contentHash,
            };
            
            // Trigger virtualizer measurement
            virtualizer.measureElement(element);
          }
        }
      }
    });

    lastMeasurementBatch.current = now;

    // Schedule next batch if more items in queue
    if (measurementQueue.current.size > 0) {
      measurementTimer.current = setTimeout(processMeasurementQueue, debounceMs);
    }
  }, [notes, virtualizer, measurementThreshold, debounceMs, batchSize, estimateNoteSize, createContentHash]);

  /**
   * Queue an element for measurement
   */
  const queueMeasurement = useCallback((index: number) => {
    measurementQueue.current.add(index);
    
    // Clear existing timer
    if (measurementTimer.current) {
      clearTimeout(measurementTimer.current);
    }
    
    // Schedule batch processing
    measurementTimer.current = setTimeout(processMeasurementQueue, debounceMs);
  }, [processMeasurementQueue, debounceMs]);

  /**
   * Immediate measurement for critical items (visible items during restoration)
   */
  const measureImmediately = useCallback((index: number) => {
    const element = document.querySelector(`[data-index="${index}"]`) as HTMLElement;
    if (element) {
      const actualHeight = element.getBoundingClientRect().height;
      const note = notes[index];
      
      if (note && actualHeight > 0) {
        const contentHash = createContentHash(note);
        sizeCache.current[note.id] = {
          height: actualHeight,
          timestamp: Date.now(),
          contentHash,
        };
        
        // Immediate virtualizer update
        virtualizer.measureElement(element);
      }
    }
  }, [notes, virtualizer, createContentHash]);

  /**
   * Batch measure all visible items - useful for restoration
   */
  const measureVisibleItems = useCallback(() => {
    const virtualItems = virtualizer.getVirtualItems();
    
    console.log(`📏 Batch measuring ${virtualItems.length} visible items for restoration`);
    
    virtualItems.forEach((item, idx) => {
      // Stagger measurements slightly to avoid blocking
      setTimeout(() => {
        measureImmediately(item.index);
      }, idx * 2); // 2ms delay between each measurement
    });
  }, [virtualizer, measureImmediately]);

  /**
   * Clean up stale cache entries
   */
  const cleanupCache = useCallback(() => {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000; // 30 minutes
    
    Object.keys(sizeCache.current).forEach(noteId => {
      const cached = sizeCache.current[noteId];
      if (now - cached.timestamp > maxAge) {
        delete sizeCache.current[noteId];
      }
    });
  }, []);

  /**
   * Get cached size or estimation for a note
   */
  const getSize = useCallback((index: number): number => {
    const note = notes[index];
    if (!note) return 200;

    const contentHash = createContentHash(note);
    const cached = sizeCache.current[note.id];
    
    if (cached && cached.contentHash === contentHash) {
      return cached.height;
    }
    
    return estimateNoteSize(index);
  }, [notes, createContentHash, estimateNoteSize]);

  // Cleanup cache periodically
  useEffect(() => {
    const interval = setInterval(cleanupCache, 5 * 60 * 1000); // Every 5 minutes
    return () => clearInterval(interval);
  }, [cleanupCache]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (measurementTimer.current) {
        clearTimeout(measurementTimer.current);
      }
    };
  }, []);

  return {
    // Main sizing function for virtualizer
    estimateSize: getSize,
    
    // Measurement functions
    queueMeasurement,
    measureImmediately,
    measureVisibleItems,
    
    // Cache management
    getCacheSize: () => Object.keys(sizeCache.current).length,
    clearCache: () => {
      sizeCache.current = {};
    },
    
    // Debug utilities
    getCacheStats: () => {
      const entries = Object.values(sizeCache.current);
      return {
        totalEntries: entries.length,
        averageHeight: entries.length > 0 
          ? entries.reduce((sum, entry) => sum + entry.height, 0) / entries.length 
          : 0,
        oldestEntry: Math.min(...entries.map(e => e.timestamp)),
        newestEntry: Math.max(...entries.map(e => e.timestamp)),
      };
    },
  };
}
