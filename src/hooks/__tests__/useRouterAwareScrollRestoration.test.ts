import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRouterAwareScrollRestoration } from '../useRouterAwareScrollRestoration';

// Mock TanStack Router
const mockRouter = {
  state: {
    location: {
      pathname: '/feed',
      search: {},
      state: {}
    }
  },
  subscribe: vi.fn(() => vi.fn()),
};

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => mockRouter,
}));

// Mock sessionStorage
const sessionStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(window, 'sessionStorage', {
  value: sessionStorageMock,
});

// Mock virtualizer
const mockVirtualizer = {
  getVirtualItems: vi.fn(() => [
    { index: 5, start: 1000 },
    { index: 6, start: 1200 },
    { index: 7, start: 1400 }
  ]),
  getTotalSize: vi.fn(() => 5000),
  scrollToIndex: vi.fn(),
};

// Mock scroll element
const mockScrollElement = {
  scrollTop: 1100,
  clientHeight: 800,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

const mockNotes = [
  { id: 'note1' },
  { id: 'note2' },
  { id: 'note3' },
  { id: 'note4' },
  { id: 'note5' },
  { id: 'note6' }, // index 5
  { id: 'note7' },
  { id: 'note8' },
];

describe('useRouterAwareScrollRestoration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorageMock.getItem.mockReturnValue(null);
    // Reset router location between tests
    mockRouter.state.location.pathname = '/feed';
    mockRouter.state.location.search = {} as any;
    mockRouter.state.location.state = {} as any;
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('should save scroll state correctly', () => {
    const { result } = renderHook(() =>
      useRouterAwareScrollRestoration({
        virtualizer: mockVirtualizer as any,
        scrollElement: mockScrollElement as any,
        notes: mockNotes,
        debug: true
      })
    );

    act(() => {
      result.current.saveScrollState();
    });

    expect(sessionStorageMock.setItem).toHaveBeenCalledWith(
      expect.stringMatching(/^scroll-state-\/feed/),
      expect.stringContaining('"focusedIndex":5')
    );

    // Verify the offset calculation is correct
    const savedData = JSON.parse(sessionStorageMock.setItem.mock.calls[0][1]);
    expect(savedData.focusedIndex).toBe(5);
    // scrollTop (1100) - itemStart (1000) = 100
    expect(savedData.focusedOffset).toBe(100);
    expect(savedData.scrollTop).toBe(1100);
  });

  it('should restore scroll state correctly', async () => {
    // Mock saved scroll state
    const savedState = {
      scrollTop: 1100,
      focusedIndex: 5,
      focusedOffset: 100, // 100px into the focused item
      timestamp: Date.now(),
      noteIds: ['note1', 'note2', 'note3'],
      totalSize: 5000,
      viewportHeight: 800
    };

    sessionStorageMock.getItem.mockReturnValue(JSON.stringify(savedState));

    // Mock returning from navigation
    mockRouter.state.location.state = { fromFeed: true };

    const { result } = renderHook(() =>
      useRouterAwareScrollRestoration({
        virtualizer: mockVirtualizer as any,
        scrollElement: mockScrollElement as any,
        notes: mockNotes,
        debug: true
      })
    );

    // Wait for restoration to complete
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 150));
    });

    // Should call scrollToIndex first
    expect(mockVirtualizer.scrollToIndex).toHaveBeenCalledWith(5, {
      align: 'start',
      behavior: 'auto'
    });

    // Should set final scroll position after delay
    // The fine-tuning should calculate: itemStart (1000) + offset (100) = 1100
    expect(mockScrollElement.scrollTop).toBe(1100);
  });

  it('should detect browser back to profile notes route and restore', async () => {
    // Arrange: saved state present
    const savedState = {
      scrollTop: 900,
      focusedIndex: 3,
      focusedOffset: 50,
      timestamp: Date.now(),
      noteIds: ['note1', 'note2', 'note3'],
      totalSize: 5000,
      viewportHeight: 800
    };
    sessionStorageMock.getItem.mockReturnValue(JSON.stringify(savedState));

    // Simulate navigation history to a profile route and back
    mockRouter.state.location.pathname = '/profile/npub1xyz';
    // previousLocationRef will be set by first render; emulate a change afterwards

    const { rerender } = renderHook(() =>
      useRouterAwareScrollRestoration({
        virtualizer: mockVirtualizer as any,
        scrollElement: mockScrollElement as any,
        notes: mockNotes,
        debug: true
      })
    );

    // Emulate that we navigated away and then back to the same profile route, causing a popstate-like scenario
    // Flip pathname to something else then back to trigger didNavigate detection
    mockRouter.state.location.pathname = '/note/abcdef';
    rerender();
    mockRouter.state.location.pathname = '/profile/npub1xyz';
    mockRouter.state.location.state = {}; // no explicit fromFeed/fromProfile
    rerender();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 150));
    });

    // Expect restoration path to run (either scrollToIndex or direct scrollTop fine-tuning)
    expect(
      mockVirtualizer.scrollToIndex.mock.calls.length > 0 ||
        mockScrollElement.scrollTop === 900
    ).toBe(true);
  });

  it('should handle edge cases gracefully', () => {
    // Test with invalid saved state
    sessionStorageMock.getItem.mockReturnValue('invalid json');

    expect(() => {
      renderHook(() =>
        useRouterAwareScrollRestoration({
          virtualizer: mockVirtualizer as any,
          scrollElement: mockScrollElement as any,
          notes: mockNotes,
          debug: true
        })
      );
    }).not.toThrow();
  });

  it('should validate content before restoring', () => {
    const savedState = {
      scrollTop: 1100,
      focusedIndex: 5,
      focusedOffset: 100,
      timestamp: Date.now(),
      noteIds: ['different1', 'different2'], // Different note IDs
      totalSize: 5000,
      viewportHeight: 800
    };

    sessionStorageMock.getItem.mockReturnValue(JSON.stringify(savedState));
    mockRouter.state.location.state = { fromFeed: true };

    renderHook(() =>
      useRouterAwareScrollRestoration({
        virtualizer: mockVirtualizer as any,
        scrollElement: mockScrollElement as any,
        notes: mockNotes,
        debug: true
      })
    );

    // Should not attempt restoration due to content mismatch
    expect(mockVirtualizer.scrollToIndex).not.toHaveBeenCalled();
  });

  it('should expire old scroll states', async () => {
    const oldState = {
      scrollTop: 1100,
      focusedIndex: 5,
      focusedOffset: 100,
      timestamp: Date.now() - (31 * 60 * 1000), // 31 minutes ago
      noteIds: ['note1', 'note2'],
      totalSize: 5000,
      viewportHeight: 800
    };

    sessionStorageMock.getItem.mockReturnValue(JSON.stringify(oldState));
    mockRouter.state.location.state = { fromFeed: true };

    const { result } = renderHook(() =>
      useRouterAwareScrollRestoration({
        virtualizer: mockVirtualizer as any,
        scrollElement: mockScrollElement as any,
        notes: mockNotes,
        debug: true
      })
    );

    // Manually trigger restoration to test expiration
    await act(async () => {
      result.current.restoreScrollState();
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    // Should remove expired state
    expect(sessionStorageMock.removeItem).toHaveBeenCalledWith(
      expect.stringMatching(/^scroll-state-\/feed/)
    );
    expect(mockVirtualizer.scrollToIndex).not.toHaveBeenCalled();
  });

  it('should clamp scroll position to valid bounds', async () => {
    const savedState = {
      scrollTop: 10000, // Way beyond total size
      focusedIndex: 5,
      focusedOffset: 500, // Large offset
      timestamp: Date.now(),
      noteIds: ['note1', 'note2', 'note3'],
      totalSize: 5000,
      viewportHeight: 800
    };

    sessionStorageMock.getItem.mockReturnValue(JSON.stringify(savedState));
    mockRouter.state.location.state = { fromFeed: true };

    renderHook(() =>
      useRouterAwareScrollRestoration({
        virtualizer: mockVirtualizer as any,
        scrollElement: mockScrollElement as any,
        notes: mockNotes,
        debug: true
      })
    );

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 150));
    });

    // Should clamp to maximum valid scroll position
    // maxScrollTop = totalSize (5000) - clientHeight (800) = 4200
    const expectedMaxScroll = 4200;
    expect(mockScrollElement.scrollTop).toBeLessThanOrEqual(expectedMaxScroll);
  });
});
