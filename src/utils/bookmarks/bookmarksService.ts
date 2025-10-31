import type { Note } from '../../types/nostr/types';

/**
 * Represents a single bookmarked note with metadata
 */
export interface BookmarkEntry {
  note: Note;
  bookmarkedAt: number;
  authorDisplayName?: string;
}

/**
 * Storage structure for bookmarks in localStorage
 */
export interface BookmarksStorage {
  version: number;
  bookmarks: BookmarkEntry[];
  lastUpdated: number;
}

const STORAGE_KEY = 'nostree_bookmarks';
const STORAGE_VERSION = 1;

/**
 * Service for managing bookmarks in localStorage
 * Provides CRUD operations for bookmarking notes
 */
export const bookmarksService = {
  /**
   * Get all bookmarks, sorted by date (newest first)
   */
  getBookmarks(): BookmarkEntry[] {
    try {
      const stored = loadFromStorage();
      return stored.bookmarks.sort((a, b) => b.bookmarkedAt - a.bookmarkedAt);
    } catch (error) {
      console.error('Failed to get bookmarks:', error);
      return [];
    }
  },

  /**
   * Add a note to bookmarks
   * Returns the created bookmark entry or null if it fails
   */
  addBookmark(note: Note, authorDisplayName?: string): BookmarkEntry | null {
    try {
      if (!note || !note.id) {
        throw new Error('Invalid note object');
      }

      const stored = loadFromStorage();
      
      // Check for duplicates
      const exists = stored.bookmarks.some(b => b.note.id === note.id);
      if (exists) {
        console.warn(`Note ${note.id} is already bookmarked`);
        return null;
      }

      const bookmark: BookmarkEntry = {
        note,
        bookmarkedAt: Date.now(),
        authorDisplayName
      };

      stored.bookmarks.push(bookmark);
      stored.lastUpdated = Date.now();
      
      saveToStorage(stored);
      return bookmark;
    } catch (error) {
      console.error('Failed to add bookmark:', error);
      return null;
    }
  },

  /**
   * Remove a bookmark by note ID
   */
  removeBookmark(noteId: string): boolean {
    try {
      if (!noteId) {
        throw new Error('Note ID is required');
      }

      const stored = loadFromStorage();
      const initialLength = stored.bookmarks.length;
      
      stored.bookmarks = stored.bookmarks.filter(b => b.note.id !== noteId);
      
      if (stored.bookmarks.length === initialLength) {
        console.warn(`Bookmark ${noteId} not found`);
        return false;
      }

      stored.lastUpdated = Date.now();
      saveToStorage(stored);
      return true;
    } catch (error) {
      console.error('Failed to remove bookmark:', error);
      return false;
    }
  },

  /**
   * Get a specific bookmark by note ID
   */
  getBookmark(noteId: string): BookmarkEntry | null {
    try {
      if (!noteId) {
        return null;
      }

      const stored = loadFromStorage();
      return stored.bookmarks.find(b => b.note.id === noteId) || null;
    } catch (error) {
      console.error('Failed to get bookmark:', error);
      return null;
    }
  },

  /**
   * Check if a note is bookmarked
   */
  isBookmarked(noteId: string): boolean {
    try {
      if (!noteId) {
        return false;
      }

      const stored = loadFromStorage();
      return stored.bookmarks.some(b => b.note.id === noteId);
    } catch (error) {
      console.error('Failed to check bookmark status:', error);
      return false;
    }
  },

  /**
   * Clear all bookmarks
   */
  clearAllBookmarks(): boolean {
    try {
      const storage: BookmarksStorage = {
        version: STORAGE_VERSION,
        bookmarks: [],
        lastUpdated: Date.now()
      };
      saveToStorage(storage);
      return true;
    } catch (error) {
      console.error('Failed to clear bookmarks:', error);
      return false;
    }
  }
};

/**
 * Load bookmarks from localStorage
 * Returns default storage if not found or corrupted
 */
function loadFromStorage(): BookmarksStorage {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return getDefaultStorage();
    }

    const stored = localStorage.getItem(STORAGE_KEY);
    
    if (!stored) {
      return getDefaultStorage();
    }

    const parsed = JSON.parse(stored) as unknown;
    
    if (!validateStorage(parsed)) {
      console.warn('Corrupted bookmarks data, resetting');
      return getDefaultStorage();
    }

    return parsed as BookmarksStorage;
  } catch (error) {
    console.error('Error loading bookmarks from storage:', error);
    return getDefaultStorage();
  }
}

/**
 * Save bookmarks to localStorage
 */
function saveToStorage(data: BookmarksStorage): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      throw new Error('localStorage not available');
    }

    const serialized = JSON.stringify(data);
    localStorage.setItem(STORAGE_KEY, serialized);
  } catch (error) {
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      console.error('localStorage quota exceeded');
      // Could implement cleanup strategy here (future enhancement)
    } else {
      console.error('Error saving bookmarks to storage:', error);
    }
    throw error;
  }
}

/**
 * Validate storage structure
 */
function validateStorage(data: unknown): data is BookmarksStorage {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const obj = data as Record<string, unknown>;
  
  if (typeof obj.version !== 'number' || obj.version !== STORAGE_VERSION) {
    return false;
  }

  if (!Array.isArray(obj.bookmarks)) {
    return false;
  }

  return true;
}

/**
 * Get default empty storage
 */
function getDefaultStorage(): BookmarksStorage {
  return {
    version: STORAGE_VERSION,
    bookmarks: [],
    lastUpdated: Date.now()
  };
}
