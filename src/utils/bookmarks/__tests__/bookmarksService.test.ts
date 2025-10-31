import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { bookmarksService, type BookmarkEntry } from '../bookmarksService';
import type { Note } from '../../../types/nostr/types';

// Mock note for testing
const mockNote: Note = {
  id: 'test-note-1',
  content: 'Test note content',
  pubkey: 'test-pubkey-1',
  created_at: 1234567890,
  tags: [],
  imageUrls: [],
  videoUrls: [],
  receivedAt: Date.now()
};

const mockNote2: Note = {
  id: 'test-note-2',
  content: 'Another test note',
  pubkey: 'test-pubkey-2',
  created_at: 1234567891,
  tags: [],
  imageUrls: [],
  videoUrls: [],
  receivedAt: Date.now()
};

describe('bookmarksService', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('addBookmark', () => {
    it('should add a bookmark successfully', () => {
      const result = bookmarksService.addBookmark(mockNote, 'Test Author');

      expect(result).not.toBeNull();
      expect(result?.note.id).toBe(mockNote.id);
      expect(result?.bookmarkedAt).toBeDefined();
      expect(result?.authorDisplayName).toBe('Test Author');
    });

    it('should persist bookmark to localStorage', () => {
      bookmarksService.addBookmark(mockNote);

      const stored = localStorage.getItem('nostree_bookmarks');
      expect(stored).toBeDefined();

      const parsed = JSON.parse(stored!);
      expect(parsed.bookmarks).toHaveLength(1);
      expect(parsed.bookmarks[0].note.id).toBe(mockNote.id);
    });

    it('should not allow duplicate bookmarks', () => {
      bookmarksService.addBookmark(mockNote);
      const result = bookmarksService.addBookmark(mockNote);

      expect(result).toBeNull();
      
      const stored = localStorage.getItem('nostree_bookmarks');
      const parsed = JSON.parse(stored!);
      expect(parsed.bookmarks).toHaveLength(1);
    });

    it('should return null for invalid note', () => {
      const result = bookmarksService.addBookmark({ ...mockNote, id: '' });
      expect(result).toBeNull();
    });
  });

  describe('removeBookmark', () => {
    it('should remove an existing bookmark', () => {
      bookmarksService.addBookmark(mockNote);
      const result = bookmarksService.removeBookmark(mockNote.id);

      expect(result).toBe(true);

      const stored = localStorage.getItem('nostree_bookmarks');
      const parsed = JSON.parse(stored!);
      expect(parsed.bookmarks).toHaveLength(0);
    });

    it('should return false when removing non-existent bookmark', () => {
      const result = bookmarksService.removeBookmark('non-existent-id');
      expect(result).toBe(false);
    });

    it('should handle empty noteId', () => {
      const result = bookmarksService.removeBookmark('');
      expect(result).toBe(false);
    });
  });

  describe('getBookmarks', () => {
    it('should return empty array initially', () => {
      const bookmarks = bookmarksService.getBookmarks();
      expect(bookmarks).toEqual([]);
    });

    it('should return all bookmarks', () => {
      bookmarksService.addBookmark(mockNote);
      bookmarksService.addBookmark(mockNote2);

      const bookmarks = bookmarksService.getBookmarks();
      expect(bookmarks).toHaveLength(2);
    });

    it('should return bookmarks sorted by date (newest first)', () => {
      bookmarksService.addBookmark(mockNote);
      // Wait a bit to ensure different timestamps
      const delay = new Promise(resolve => setTimeout(resolve, 10));
      
      return delay.then(() => {
        bookmarksService.addBookmark(mockNote2);
        const bookmarks = bookmarksService.getBookmarks();
        
        expect(bookmarks[0].note.id).toBe(mockNote2.id);
        expect(bookmarks[1].note.id).toBe(mockNote.id);
      });
    });
  });

  describe('getBookmark', () => {
    it('should return a specific bookmark by id', () => {
      bookmarksService.addBookmark(mockNote, 'Author');
      const bookmark = bookmarksService.getBookmark(mockNote.id);

      expect(bookmark).not.toBeNull();
      expect(bookmark?.note.id).toBe(mockNote.id);
      expect(bookmark?.authorDisplayName).toBe('Author');
    });

    it('should return null for non-existent bookmark', () => {
      const bookmark = bookmarksService.getBookmark('non-existent');
      expect(bookmark).toBeNull();
    });

    it('should handle empty noteId', () => {
      const bookmark = bookmarksService.getBookmark('');
      expect(bookmark).toBeNull();
    });
  });

  describe('isBookmarked', () => {
    it('should return true for bookmarked note', () => {
      bookmarksService.addBookmark(mockNote);
      expect(bookmarksService.isBookmarked(mockNote.id)).toBe(true);
    });

    it('should return false for non-bookmarked note', () => {
      expect(bookmarksService.isBookmarked(mockNote.id)).toBe(false);
    });

    it('should handle empty noteId', () => {
      expect(bookmarksService.isBookmarked('')).toBe(false);
    });
  });

  describe('clearAllBookmarks', () => {
    it('should clear all bookmarks', () => {
      bookmarksService.addBookmark(mockNote);
      bookmarksService.addBookmark(mockNote2);

      const result = bookmarksService.clearAllBookmarks();
      expect(result).toBe(true);

      const bookmarks = bookmarksService.getBookmarks();
      expect(bookmarks).toHaveLength(0);
    });

    it('should persist cleared state to localStorage', () => {
      bookmarksService.addBookmark(mockNote);
      bookmarksService.clearAllBookmarks();

      const stored = localStorage.getItem('nostree_bookmarks');
      const parsed = JSON.parse(stored!);
      expect(parsed.bookmarks).toHaveLength(0);
    });
  });

  describe('localStorage persistence', () => {
    it('should load bookmarks from localStorage on service call', () => {
      // Manually add to localStorage
      const data = {
        version: 1,
        bookmarks: [
          {
            note: mockNote,
            bookmarkedAt: Date.now(),
            authorDisplayName: 'Test'
          }
        ],
        lastUpdated: Date.now()
      };
      localStorage.setItem('nostree_bookmarks', JSON.stringify(data));

      const bookmarks = bookmarksService.getBookmarks();
      expect(bookmarks).toHaveLength(1);
      expect(bookmarks[0].note.id).toBe(mockNote.id);
    });

    it('should handle corrupted localStorage data', () => {
      localStorage.setItem('nostree_bookmarks', 'invalid json');

      const bookmarks = bookmarksService.getBookmarks();
      expect(bookmarks).toEqual([]);
    });

    it('should update lastUpdated timestamp on changes', () => {
      const before = Date.now();
      bookmarksService.addBookmark(mockNote);
      const after = Date.now();

      const stored = localStorage.getItem('nostree_bookmarks');
      const parsed = JSON.parse(stored!);
      
      expect(parsed.lastUpdated).toBeGreaterThanOrEqual(before);
      expect(parsed.lastUpdated).toBeLessThanOrEqual(after + 1);
    });
  });

  describe('error handling', () => {
    it('should handle missing note gracefully', () => {
      const result = bookmarksService.addBookmark(null as any);
      expect(result).toBeNull();
    });

    it('should recover from corrupted stored data', () => {
      localStorage.setItem('nostree_bookmarks', JSON.stringify({ invalid: 'data' }));

      // Should not throw and return empty array
      const bookmarks = bookmarksService.getBookmarks();
      expect(bookmarks).toEqual([]);

      // Should be able to add new bookmarks after recovery
      const added = bookmarksService.addBookmark(mockNote);
      expect(added).not.toBeNull();
    });
  });
});
