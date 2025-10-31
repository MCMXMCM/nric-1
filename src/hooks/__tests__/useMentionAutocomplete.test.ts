import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMentionAutocomplete } from '../useMentionAutocomplete';
import * as userDisplayNames from '../../utils/nostr/userDisplayNames';
import { nip19 } from 'nostr-tools';

// Mock the display names utility
vi.mock('../../utils/nostr/userDisplayNames');

describe('useMentionAutocomplete', () => {
  const mockPubkey1 = 'a'.repeat(64);
  const mockPubkey2 = 'b'.repeat(64);
  const mockPubkey3 = 'c'.repeat(64);

  beforeEach(() => {
    const mockDisplayNames = {
      [mockPubkey1]: {
        pubkey: mockPubkey1,
        displayName: 'Alice',
        name: 'alice',
        timestamp: Date.now(),
      },
      [mockPubkey2]: {
        pubkey: mockPubkey2,
        displayName: 'Bob',
        name: 'bob',
        timestamp: Date.now(),
      },
      [mockPubkey3]: {
        pubkey: mockPubkey3,
        displayName: 'AliceSmith',
        name: 'alice_smith',
        timestamp: Date.now(),
      },
    };

    vi.mocked(userDisplayNames.getAllDisplayNames).mockReturnValue(mockDisplayNames);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with inactive mention state', () => {
    const { result } = renderHook(() => useMentionAutocomplete(''));

    expect(result.current.isActive).toBe(false);
    expect(result.current.query).toBe('');
    expect(result.current.matches).toEqual([]);
    expect(result.current.selectedIndex).toBe(0);
  });

  it('should detect @ mention and filter display names', () => {
    const { result } = renderHook(() => useMentionAutocomplete('Hello @ali'));

    act(() => {
      result.current.detectMention('Hello @ali', 10);
    });

    expect(result.current.isActive).toBe(true);
    expect(result.current.query).toBe('ali');
    expect(result.current.matches.length).toBe(2); // Alice and AliceSmith
    expect(result.current.matches[0].displayName).toBe('Alice');
  });

  it('should not activate mention if @ is not at word boundary', () => {
    const { result } = renderHook(() => useMentionAutocomplete(''));

    act(() => {
      result.current.detectMention('Hello@alice', 11);
    });

    expect(result.current.isActive).toBe(false);
  });

  it('should not activate mention if there is space after @', () => {
    const { result } = renderHook(() => useMentionAutocomplete(''));

    act(() => {
      result.current.detectMention('Hello @ alice', 8);
    });

    expect(result.current.isActive).toBe(false);
  });

  it('should sort matches with exact matches first', () => {
    const { result } = renderHook(() => useMentionAutocomplete(''));

    act(() => {
      result.current.detectMention('Hello @alice', 12);
    });

    expect(result.current.isActive).toBe(true);
    // "alice" matches exactly with "Alice" (case insensitive)
    expect(result.current.matches[0].displayName).toBe('Alice');
  });

  it('should select next match with arrow down', () => {
    const { result } = renderHook(() => useMentionAutocomplete(''));

    act(() => {
      result.current.detectMention('Hello @ali', 10);
    });

    expect(result.current.selectedIndex).toBe(0);

    act(() => {
      result.current.selectNext();
    });

    expect(result.current.selectedIndex).toBe(1);
  });

  it('should select previous match with arrow up', () => {
    const { result } = renderHook(() => useMentionAutocomplete(''));

    act(() => {
      result.current.detectMention('Hello @ali', 10);
    });

    // Start at index 1
    act(() => {
      result.current.selectNext();
    });

    expect(result.current.selectedIndex).toBe(1);

    act(() => {
      result.current.selectPrevious();
    });

    expect(result.current.selectedIndex).toBe(0);
  });

  it('should wrap around when selecting next from last item', () => {
    const { result } = renderHook(() => useMentionAutocomplete(''));

    act(() => {
      result.current.detectMention('Hello @ali', 10);
    });

    // Move to last item
    const matchCount = result.current.matches.length;
    for (let i = 0; i < matchCount; i++) {
      act(() => {
        result.current.selectNext();
      });
    }

    // Should wrap back to 0
    expect(result.current.selectedIndex).toBe(0);
  });

  it('should wrap around when selecting previous from first item', () => {
    const { result } = renderHook(() => useMentionAutocomplete(''));

    act(() => {
      result.current.detectMention('Hello @ali', 10);
    });

    expect(result.current.selectedIndex).toBe(0);

    act(() => {
      result.current.selectPrevious();
    });

    // Should wrap to last item
    expect(result.current.selectedIndex).toBe(result.current.matches.length - 1);
  });

  it('should return selected mention', () => {
    const { result } = renderHook(() => useMentionAutocomplete(''));

    act(() => {
      result.current.detectMention('Hello @ali', 10);
    });

    const selected = result.current.selectedMention;
    expect(selected).not.toBeNull();
    expect(selected!.displayName).toBe('Alice');
    expect(selected!.pubkey).toBe(mockPubkey1);
  });

  it('should close mention popup', () => {
    const { result } = renderHook(() => useMentionAutocomplete(''));

    act(() => {
      result.current.detectMention('Hello @ali', 10);
    });

    expect(result.current.isActive).toBe(true);

    act(() => {
      result.current.closeMention();
    });

    expect(result.current.isActive).toBe(false);
  });

  it('should limit matches to 10', () => {
    // Create many matches
    const manyDisplayNames: Record<string, any> = {};
    for (let i = 0; i < 20; i++) {
      const pubkey = String(i).padStart(64, '0');
      manyDisplayNames[pubkey] = {
        pubkey,
        displayName: `User${i}`,
        name: `user${i}`,
        timestamp: Date.now(),
      };
    }

    vi.mocked(userDisplayNames.getAllDisplayNames).mockReturnValue(manyDisplayNames);

    const { result } = renderHook(() => useMentionAutocomplete(''));

    act(() => {
      result.current.detectMention('Hello @user', 12);
    });

    expect(result.current.matches.length).toBeLessThanOrEqual(10);
  });

  it('should handle case insensitive matching', () => {
    const { result } = renderHook(() => useMentionAutocomplete(''));

    act(() => {
      result.current.detectMention('Hello @ALI', 10);
    });

    expect(result.current.isActive).toBe(true);
    expect(result.current.matches.length).toBeGreaterThan(0);
  });

  it('should include npub in match object', () => {
    const { result } = renderHook(() => useMentionAutocomplete(''));

    act(() => {
      result.current.detectMention('Hello @alice', 12);
    });

    const match = result.current.matches[0];
    expect(match.npub).toBeDefined();
    expect(match.npub.startsWith('npub')).toBe(true);
  });
});
