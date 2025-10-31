import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePersistentImageCache } from '../usePersistentImageCache';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock Image constructor
global.Image = class MockImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = '';
  width = 0;
  height = 0;
  naturalWidth = 0;
  naturalHeight = 0;

  constructor() {
    setTimeout(() => {
      // Simulate successful image load
      this.width = 400;
      this.height = 300;
      this.naturalWidth = 800;
      this.naturalHeight = 600;
      if (this.onload) {
        this.onload();
      }
    }, 10);
  }
} as any;

describe('usePersistentImageCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('should initialize empty cache', () => {
    const { result } = renderHook(() => usePersistentImageCache());
    
    expect(result.current.getCacheStats().totalEntries).toBe(0);
  });

  it('should cache image dimensions', async () => {
    const { result } = renderHook(() => usePersistentImageCache());
    
    act(() => {
      result.current.cacheImageDimensions('https://example.com/image.jpg', {
        width: 400,
        height: 300,
        naturalWidth: 800,
        naturalHeight: 600
      }, 'note-123');
    });

    const cached = result.current.getCachedDimensions('https://example.com/image.jpg');
    expect(cached).toMatchObject({
      width: 400,
      height: 300,
      naturalWidth: 800,
      naturalHeight: 600,
      aspectRatio: 800 / 600
    });
  });

  it('should check if dimensions are cached', () => {
    const { result } = renderHook(() => usePersistentImageCache());
    
    expect(result.current.hasCachedDimensions('https://example.com/image.jpg')).toBe(false);
    
    act(() => {
      result.current.cacheImageDimensions('https://example.com/image.jpg', {
        width: 400,
        height: 300,
        naturalWidth: 800,
        naturalHeight: 600
      });
    });

    expect(result.current.hasCachedDimensions('https://example.com/image.jpg')).toBe(true);
  });

  it('should calculate container dimensions', () => {
    const { result } = renderHook(() => usePersistentImageCache());
    
    act(() => {
      result.current.cacheImageDimensions('https://example.com/image.jpg', {
        width: 400,
        height: 300,
        naturalWidth: 800,
        naturalHeight: 600
      });
    });

    const containerDims = result.current.calculateContainerDimensions(
      'https://example.com/image.jpg',
      400 // maxWidth
    );

    expect(containerDims).toEqual({
      width: 400,
      height: 300 // 400 / (800/600) = 300
    });
  });

  it('should calculate container dimensions with height constraint', () => {
    const { result } = renderHook(() => usePersistentImageCache());
    
    act(() => {
      result.current.cacheImageDimensions('https://example.com/image.jpg', {
        width: 400,
        height: 300,
        naturalWidth: 800,
        naturalHeight: 600
      });
    });

    const containerDims = result.current.calculateContainerDimensions(
      'https://example.com/image.jpg',
      600, // maxWidth
      200  // maxHeight
    );

    // Should be constrained by height: 200 * (800/600) = 266.67, but width constraint wins
    expect(containerDims?.width).toBeCloseTo(266.67, 1);
    expect(containerDims?.height).toBe(200);
  });

  it('should preload images', async () => {
    const { result } = renderHook(() => usePersistentImageCache());
    
    await act(async () => {
      await result.current.preloadImages([
        'https://example.com/image1.jpg',
        'https://example.com/image2.jpg'
      ], 'note-123');
    });

    expect(result.current.hasCachedDimensions('https://example.com/image1.jpg')).toBe(true);
    expect(result.current.hasCachedDimensions('https://example.com/image2.jpg')).toBe(true);
  });

  it('should clear cache', () => {
    const { result } = renderHook(() => usePersistentImageCache());
    
    act(() => {
      result.current.cacheImageDimensions('https://example.com/image.jpg', {
        width: 400,
        height: 300,
        naturalWidth: 800,
        naturalHeight: 600
      });
    });

    expect(result.current.hasCachedDimensions('https://example.com/image.jpg')).toBe(true);
    
    act(() => {
      result.current.clearCache();
    });

    expect(result.current.hasCachedDimensions('https://example.com/image.jpg')).toBe(false);
  });

  it('should clear cache for specific URL', () => {
    const { result } = renderHook(() => usePersistentImageCache());
    
    act(() => {
      result.current.cacheImageDimensions('https://example.com/image1.jpg', {
        width: 400,
        height: 300,
        naturalWidth: 800,
        naturalHeight: 600
      });
      result.current.cacheImageDimensions('https://example.com/image2.jpg', {
        width: 400,
        height: 300,
        naturalWidth: 800,
        naturalHeight: 600
      });
    });

    expect(result.current.hasCachedDimensions('https://example.com/image1.jpg')).toBe(true);
    expect(result.current.hasCachedDimensions('https://example.com/image2.jpg')).toBe(true);
    
    act(() => {
      result.current.clearCache({ url: 'https://example.com/image1.jpg' });
    });

    expect(result.current.hasCachedDimensions('https://example.com/image1.jpg')).toBe(false);
    expect(result.current.hasCachedDimensions('https://example.com/image2.jpg')).toBe(true);
  });

  it('should provide cache statistics', () => {
    const { result } = renderHook(() => usePersistentImageCache());
    
    act(() => {
      result.current.cacheImageDimensions('https://example.com/image1.jpg', {
        width: 400,
        height: 300,
        naturalWidth: 800,
        naturalHeight: 600
      });
      result.current.cacheImageDimensions('https://example.com/image2.jpg', {
        width: 200,
        height: 200,
        naturalWidth: 400,
        naturalHeight: 400
      });
    });

    const stats = result.current.getCacheStats();
    expect(stats.totalEntries).toBe(2);
    expect(stats.averageAspectRatio).toBeCloseTo((800/600 + 400/400) / 2);
  });

  it('should persist cache to localStorage', () => {
    const { result } = renderHook(() => usePersistentImageCache());
    
    act(() => {
      result.current.cacheImageDimensions('https://example.com/image.jpg', {
        width: 400,
        height: 300,
        naturalWidth: 800,
        naturalHeight: 600
      });
    });

    act(() => {
      result.current.persistCache();
    });

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'nostree-image-dimensions-cache',
      expect.stringContaining('https://example.com/image.jpg')
    );
  });

  it('should load cache from localStorage', () => {
    const mockCacheData = JSON.stringify([
      ['https://example.com/image.jpg', {
        url: 'https://example.com/image.jpg',
        width: 400,
        height: 300,
        naturalWidth: 800,
        naturalHeight: 600,
        aspectRatio: 800 / 600,
        timestamp: Date.now(),
        loadTime: Date.now()
      }]
    ]);

    localStorageMock.getItem.mockReturnValue(mockCacheData);

    const { result } = renderHook(() => usePersistentImageCache());
    
    // Cache should be initialized from localStorage
    expect(result.current.hasCachedDimensions('https://example.com/image.jpg')).toBe(true);
  });

  it('should handle localStorage errors gracefully', () => {
    localStorageMock.getItem.mockImplementation(() => {
      throw new Error('localStorage error');
    });

    // Should not throw
    expect(() => {
      renderHook(() => usePersistentImageCache());
    }).not.toThrow();
  });

  it('should expire old cache entries', () => {
    const oldTimestamp = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
    const mockCacheData = JSON.stringify([
      ['https://example.com/old-image.jpg', {
        url: 'https://example.com/old-image.jpg',
        width: 400,
        height: 300,
        naturalWidth: 800,
        naturalHeight: 600,
        aspectRatio: 800 / 600,
        timestamp: oldTimestamp,
        loadTime: oldTimestamp
      }]
    ]);

    localStorageMock.getItem.mockReturnValue(mockCacheData);

    const { result } = renderHook(() => usePersistentImageCache());
    
    // Old entry should be filtered out during initialization
    expect(result.current.hasCachedDimensions('https://example.com/old-image.jpg')).toBe(false);
  });
});
