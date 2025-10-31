// Event handlers and utility functions for NostrFeed
import React from 'react';

export const createHashtagClickHandler = (
  getCustomHashtags: () => string[],
  setCustomHashtags: (hashtags: string[]) => void
) => (hashtag: string) => {
  // Remove # prefix if present and normalize
  const cleanHashtag = hashtag.replace(/^#+/, '').trim();
  const normalizedHashtag = cleanHashtag.toLowerCase();
  const currentHashtags = getCustomHashtags();
  
  // Check if hashtag already exists (case-insensitive)
  if (currentHashtags.some(tag => tag.toLowerCase() === normalizedHashtag)) {
    return; // Already exists, do nothing
  }
  
  // Add the cleaned hashtag to custom hashtags
  const updatedHashtags = [...currentHashtags, cleanHashtag];
  setCustomHashtags(updatedHashtags);
  
  // Save to localStorage
  try {
    localStorage.setItem('customHashtags', JSON.stringify(updatedHashtags));
  } catch (error) {
    console.error('Failed to save custom hashtags to localStorage:', error);
  }
};

export const createHashtagRemoveHandler = (
  customHashtags: string[],
  setCustomHashtags: (hashtags: string[]) => void
) => (hashtag: string) => {
  const currentHashtags = Array.isArray(customHashtags) ? customHashtags : [];
  const updatedHashtags = currentHashtags.filter(tag => tag.toLowerCase() !== hashtag.toLowerCase());
  
  setCustomHashtags(updatedHashtags);
  
  // Save to localStorage
  try {
    localStorage.setItem('customHashtags', JSON.stringify(updatedHashtags));
  } catch (error) {
    console.error('Failed to save custom hashtags to localStorage:', error);
  }
};

export const createNavigationHandler = (
  currentIndex: number,
  notes: any[],
  setLastNavigationSource: (source: "button" | "swipe" | "keyboard" | null) => void,
  updateCurrentIndex: (index: number, prefetchCallback?: (newIndex: number, totalNotes: number) => void) => void,
  handlePrefetch: (newIndex: number, totalNotes: number) => void,
  bumpDisplayIndex?: (delta: number) => void
) => (direction: 'up' | 'down') => {
  // Set navigation source for button clicks
  setLastNavigationSource('button');

  requestAnimationFrame(() => {
    if (direction === 'up') {
      const newIndex = Math.max(currentIndex - 1, 0);

      updateCurrentIndex(newIndex, handlePrefetch);
    } else {
      // Allow moving down; when near end, prefetch happens in updateCurrentIndex
      const next = Math.min(currentIndex + 1, notes.length - 1);

      // Bump cumulative display index only when moving down
      try { bumpDisplayIndex?.(1); } catch {}
      updateCurrentIndex(next, handlePrefetch);
    }
  });
};

export const createBufferAwareNavigationHandler = (
  currentIndex: number,
  notes: any[],
  setLastNavigationSource: (source: "button" | "swipe" | "keyboard" | null) => void,
  bufferNavigate: (index: number, options?: { prefetch?: boolean }) => Promise<any>,
  // handleBufferPrefetch: (position: number, direction: 'forward' | 'backward') => Promise<void>,
  bumpDisplayIndex?: (delta: number) => void,
  bufferEnabled: boolean = false
) => (direction: 'up' | 'down') => {
  // Set navigation source for button clicks
  setLastNavigationSource('button');

  requestAnimationFrame(async () => {
    if (direction === 'up') {
      const newIndex = Math.max(currentIndex - 1, 0);

      if (bufferEnabled) {
        // Use buffer-aware navigation with prefetch
        await bufferNavigate(newIndex, { prefetch: true });
      } else {
        // Fallback to legacy navigation
        // Note: updateCurrentIndex and handlePrefetch would need to be passed in

      }
    } else {
      // Allow moving down; when near end, prefetch happens in buffer navigation
      const next = Math.min(currentIndex + 1, notes.length - 1);

      if (bufferEnabled) {
        // Use buffer-aware navigation with prefetch
        await bufferNavigate(next, { prefetch: true });
        // Bump cumulative display index only when moving down
        try { bumpDisplayIndex?.(1); } catch {}
      } else {
        // Fallback to legacy navigation

      }
    }
  });
};

export const createPrefetchHandler = (
  getPageSize: () => number,
  hasMorePages: boolean,
  isFetchingPage: boolean,
  loadMoreNotes: () => void
) => (newIndex: number, totalNotes: number) => {
  // Calculate prefetch threshold (trigger when user is near the end)
  const prefetchThreshold = Math.max(0, totalNotes - Math.ceil(getPageSize() * 0.25));
  
  if (totalNotes > 0 && newIndex >= prefetchThreshold && hasMorePages && !isFetchingPage) {
    loadMoreNotes();
  }
};

export const createMediaLoadErrorHandler = (
  setNotes: React.Dispatch<React.SetStateAction<any[]>>
) => (noteId: string) => {
  setNotes((prevNotes: any[]) => 
    prevNotes.map((note: any) => 
      note.id === noteId ? { ...note, mediaLoadError: true } : note
    )
  );
};

export const createAsciiRenderedHandler = (
  setAsciiCache: (cache: any) => void
) => (url: string, ascii: string) => {
  // Filter out "[bitmap-ready]" signals - these are completion signals, not actual ASCII content
  if (ascii === "[bitmap-ready]") {

    return;
  }
  
  // Only cache actual ASCII content
  setAsciiCache((prev: any) => ({
    ...prev,
    [url]: { ascii, timestamp: Date.now() }
  }));
};

export const createRemoveStoredPubkeyHandler = (
  setStoredPubkey: (pubkey: string) => void,
  setContacts: (contacts: any[]) => void,
  setPubkeyError: (error: string) => void
) => () => {
  localStorage.removeItem('nostrPubkey');
  setStoredPubkey('');
  setContacts([]);
  setPubkeyError('');
};
