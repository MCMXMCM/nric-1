import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBookmarks } from '../useBookmarks';
import type { Note } from '../../types/nostr/types';

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

describe('useBookmarks', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should initialize with empty bookmarks', () => {
    const { result } = renderHook(() => useBookmarks());

    expect(result.current.bookmarks).toEqual([]);
    expect(result.current.bookmarksCount).toBe(0);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should add a bookmark', () => {
    const { result } = renderHook(() => useBookmarks());

    act(() => {
      result.current.addBookmark(mockNote, 'Author');
    });

    expect(result.current.bookmarks).toHaveLength(1);
    expect(result.current.bookmarks[0].note.id).toBe(mockNote.id);
    expect(result.current.bookmarksCount).toBe(1);
  });

  it('should remove a bookmark', () => {
    const { result } = renderHook(() => useBookmarks());

    act(() => {
      result.current.addBookmark(mockNote);
    });

    expect(result.current.bookmarks).toHaveLength(1);

    act(() => {
      result.current.removeBookmark(mockNote.id);
    });

    expect(result.current.bookmarks).toHaveLength(0);
    expect(result.current.bookmarksCount).toBe(0);
  });

  it('should toggle bookmark on/off', () => {
    const { result } = renderHook(() => useBookmarks());

    act(() => {
      result.current.toggleBookmark(mockNote.id, mockNote);
    });

    expect(result.current.isBookmarked(mockNote.id)).toBe(true);

    act(() => {
      result.current.toggleBookmark(mockNote.id);
    });

    expect(result.current.isBookmarked(mockNote.id)).toBe(false);
  });

  it('should check if note is bookmarked', () => {
    const { result } = renderHook(() => useBookmarks());

    expect(result.current.isBookmarked(mockNote.id)).toBe(false);

    act(() => {
      result.current.addBookmark(mockNote);
    });

    expect(result.current.isBookmarked(mockNote.id)).toBe(true);
  });

  it('should get bookmarks', () => {
    const { result } = renderHook(() => useBookmarks());

    act(() => {
      result.current.addBookmark(mockNote);
      result.current.addBookmark(mockNote2);
    });

    const bookmarks = result.current.getBookmarks();
    expect(bookmarks).toHaveLength(2);
  });

  it('should clear all bookmarks', () => {
    const { result } = renderHook(() => useBookmarks());

    act(() => {
      result.current.addBookmark(mockNote);
      result.current.addBookmark(mockNote2);
    });

    expect(result.current.bookmarks).toHaveLength(2);

    act(() => {
      result.current.clearAllBookmarks();
    });

    expect(result.current.bookmarks).toHaveLength(0);
    expect(result.current.bookmarksCount).toBe(0);
  });

  it('should sync with localStorage', () => {
    const { result } = renderHook(() => useBookmarks());

    act(() => {
      result.current.addBookmark(mockNote);
    });

    const stored = localStorage.getItem('nostree_bookmarks');
    expect(stored).toBeDefined();

    const parsed = JSON.parse(stored!);
    expect(parsed.bookmarks).toHaveLength(1);
    expect(parsed.bookmarks[0].note.id).toBe(mockNote.id);
  });

  it('should load bookmarks from localStorage on mount', () => {
    // Pre-populate localStorage
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

    const { result } = renderHook(() => useBookmarks());

    expect(result.current.bookmarks).toHaveLength(1);
    expect(result.current.bookmarks[0].note.id).toBe(mockNote.id);
  });

  it('should handle errors gracefully', () => {
    localStorage.setItem('nostree_bookmarks', 'invalid json');

    const { result } = renderHook(() => useBookmarks());

    expect(result.current.bookmarks).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('should maintain bookmarksCount property', () => {
    const { result } = renderHook(() => useBookmarks());

    expect(result.current.bookmarksCount).toBe(0);

    act(() => {
      result.current.addBookmark(mockNote);
    });

    expect(result.current.bookmarksCount).toBe(1);

    act(() => {
      result.current.addBookmark(mockNote2);
    });

    expect(result.current.bookmarksCount).toBe(2);

    act(() => {
      result.current.removeBookmark(mockNote.id);
    });

    expect(result.current.bookmarksCount).toBe(1);
  });
});
