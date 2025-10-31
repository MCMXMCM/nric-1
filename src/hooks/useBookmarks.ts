import { useState, useEffect, useCallback } from 'react';
import type { Note } from '../types/nostr/types';
import { bookmarksService, type BookmarkEntry } from '../utils/bookmarks/bookmarksService';

interface UseBookmarksReturn {
  bookmarks: BookmarkEntry[];
  isLoading: boolean;
  error: string | null;
  addBookmark: (note: Note, authorDisplayName?: string) => void;
  removeBookmark: (noteId: string) => void;
  toggleBookmark: (noteId: string, note?: Note, authorDisplayName?: string) => void;
  isBookmarked: (noteId: string) => boolean;
  getBookmarks: () => BookmarkEntry[];
  clearAllBookmarks: () => void;
  bookmarksCount: number;
}

/**
 * Hook for managing bookmarks with React
 * Provides bookmark state and CRUD operations
 * Automatically syncs with localStorage
 */
export function useBookmarks(): UseBookmarksReturn {
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load bookmarks on mount
  useEffect(() => {
    try {
      setIsLoading(true);
      const loaded = bookmarksService.getBookmarks();
      setBookmarks(loaded);
      setError(null);
    } catch (err) {
      console.error('Failed to load bookmarks:', err);
      setError('Failed to load bookmarks');
      setBookmarks([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const addBookmark = useCallback(
    (note: Note, authorDisplayName?: string) => {
      try {
        const result = bookmarksService.addBookmark(note, authorDisplayName);
        if (result) {
          // Update state with fresh bookmarks from service
          const updated = bookmarksService.getBookmarks();
          setBookmarks(updated);
          setError(null);
        }
      } catch (err) {
        console.error('Failed to add bookmark:', err);
        setError('Failed to add bookmark');
      }
    },
    []
  );

  const removeBookmark = useCallback((noteId: string) => {
    try {
      const success = bookmarksService.removeBookmark(noteId);
      if (success) {
        // Update state with fresh bookmarks from service
        const updated = bookmarksService.getBookmarks();
        setBookmarks(updated);
        setError(null);
      }
    } catch (err) {
      console.error('Failed to remove bookmark:', err);
      setError('Failed to remove bookmark');
    }
  }, []);

  const toggleBookmark = useCallback(
    (noteId: string, note?: Note, authorDisplayName?: string) => {
      try {
        if (bookmarksService.isBookmarked(noteId)) {
          removeBookmark(noteId);
        } else if (note) {
          addBookmark(note, authorDisplayName);
        }
      } catch (err) {
        console.error('Failed to toggle bookmark:', err);
        setError('Failed to toggle bookmark');
      }
    },
    [addBookmark, removeBookmark]
  );

  const isBookmarked = useCallback((noteId: string): boolean => {
    try {
      return bookmarksService.isBookmarked(noteId);
    } catch (err) {
      console.error('Failed to check bookmark status:', err);
      return false;
    }
  }, []);

  const getBookmarks = useCallback((): BookmarkEntry[] => {
    return bookmarks;
  }, [bookmarks]);

  const clearAllBookmarks = useCallback(() => {
    try {
      const success = bookmarksService.clearAllBookmarks();
      if (success) {
        setBookmarks([]);
        setError(null);
      }
    } catch (err) {
      console.error('Failed to clear bookmarks:', err);
      setError('Failed to clear bookmarks');
    }
  }, []);

  return {
    bookmarks,
    isLoading,
    error,
    addBookmark,
    removeBookmark,
    toggleBookmark,
    isBookmarked,
    getBookmarks,
    clearAllBookmarks,
    bookmarksCount: bookmarks.length
  };
}
