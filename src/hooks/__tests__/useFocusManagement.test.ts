import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFocusManagement } from '../useFocusManagement';

describe('useFocusManagement', () => {
  let mockOnFocusChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnFocusChange = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with correct default state', () => {
    const { result } = renderHook(() =>
      useFocusManagement({
        totalItems: 5,
        initialIndex: 0,
        onFocusChange: mockOnFocusChange,
        enabled: true,
      })
    );

    expect(result.current.focusState).toEqual({
      focusedIndex: -1,
      focusedNoteId: null,
      isFocused: false,
      focusVisible: false,
      isKeyboardNavigationActive: false,
      lastKeyboardNavigationTime: 0,
    });
  });

  it('should navigate focus up and down correctly', () => {
    const { result } = renderHook(() =>
      useFocusManagement({
        totalItems: 5,
        initialIndex: 2,
        onFocusChange: mockOnFocusChange,
        enabled: true,
      })
    );

    // First activate keyboard navigation and set initial focus
    act(() => {
      result.current.activateKeyboardNavigation();
      result.current.setFocusedIndex(2);
    });

    // Navigate down
    act(() => {
      result.current.navigateFocus('down');
    });

    expect(result.current.focusState.focusedIndex).toBe(3);
    expect(mockOnFocusChange).toHaveBeenCalledWith(3, null);

    // Navigate up
    act(() => {
      result.current.navigateFocus('up');
    });

    expect(result.current.focusState.focusedIndex).toBe(2);
    expect(mockOnFocusChange).toHaveBeenCalledWith(2, null);
  });

  it('should clamp focus to valid bounds', () => {
    const { result } = renderHook(() =>
      useFocusManagement({
        totalItems: 3,
        initialIndex: 0,
        onFocusChange: mockOnFocusChange,
        enabled: true,
      })
    );

    // Try to navigate beyond bounds
    act(() => {
      result.current.navigateFocus('up');
    });

    expect(result.current.focusState.focusedIndex).toBe(0);

    act(() => {
      result.current.navigateFocus('down', 10);
    });

    expect(result.current.focusState.focusedIndex).toBe(2);
  });

  it('should handle first and last navigation', () => {
    const { result } = renderHook(() =>
      useFocusManagement({
        totalItems: 5,
        initialIndex: 2,
        onFocusChange: mockOnFocusChange,
        enabled: true,
      })
    );

    // Go to first
    act(() => {
      result.current.navigateFocus('first');
    });

    expect(result.current.focusState.focusedIndex).toBe(0);

    // Go to last
    act(() => {
      result.current.navigateFocus('last');
    });

    expect(result.current.focusState.focusedIndex).toBe(4);
  });

  it('should show focus indicator on keyboard interaction', () => {
    const { result } = renderHook(() =>
      useFocusManagement({
        totalItems: 5,
        initialIndex: 0,
        onFocusChange: mockOnFocusChange,
        enabled: true,
      })
    );

    expect(result.current.focusState.focusVisible).toBe(false);

    act(() => {
      result.current.handleKeyboardInteraction();
    });

    expect(result.current.focusState.focusVisible).toBe(true);
  });

  it('should hide focus indicator on mouse interaction', () => {
    const { result } = renderHook(() =>
      useFocusManagement({
        totalItems: 5,
        initialIndex: 0,
        onFocusChange: mockOnFocusChange,
        enabled: true,
      })
    );

    // First show focus
    act(() => {
      result.current.handleKeyboardInteraction();
    });

    expect(result.current.focusState.focusVisible).toBe(true);

    // Then hide on mouse interaction
    act(() => {
      result.current.handleMouseInteraction();
    });

    expect(result.current.focusState.focusVisible).toBe(false);
  });

  it('should check if item is focused correctly', () => {
    const { result } = renderHook(() =>
      useFocusManagement({
        totalItems: 5,
        initialIndex: 2,
        onFocusChange: mockOnFocusChange,
        enabled: true,
      })
    );

    // Initially no items are focused
    expect(result.current.isItemFocused(0)).toBe(false);
    expect(result.current.isItemFocused(2)).toBe(false);
    expect(result.current.isItemFocused(4)).toBe(false);

    // Activate keyboard navigation and set focus
    act(() => {
      result.current.activateKeyboardNavigation();
      result.current.setFocusedIndex(2);
    });

    expect(result.current.isItemFocused(0)).toBe(false);
    expect(result.current.isItemFocused(2)).toBe(true);
    expect(result.current.isItemFocused(4)).toBe(false);
  });

  it('should return empty styles when not focused', () => {
    const { result } = renderHook(() =>
      useFocusManagement({
        totalItems: 5,
        initialIndex: 2,
        onFocusChange: mockOnFocusChange,
        enabled: true,
      })
    );

    const styles = result.current.getFocusStyles(2);
    expect(styles).toEqual({});
  });

  it('should return focus styles when focused and visible', () => {
    const { result } = renderHook(() =>
      useFocusManagement({
        totalItems: 5,
        initialIndex: 2,
        onFocusChange: mockOnFocusChange,
        enabled: true,
      })
    );

    // Activate keyboard navigation and set focus
    act(() => {
      result.current.activateKeyboardNavigation();
      result.current.setFocusedIndex(2);
      result.current.handleKeyboardInteraction();
    });

    const styles = result.current.getFocusStyles(2);
    expect(styles).toEqual({
      outline: '2px solid var(--accent-color)',
      outlineOffset: '2px',
      borderRadius: '4px',
      boxShadow: '0 0 0 1px var(--accent-color)',
    });
  });

  it('should be disabled when enabled is false', () => {
    const { result } = renderHook(() =>
      useFocusManagement({
        totalItems: 5,
        initialIndex: 0,
        onFocusChange: mockOnFocusChange,
        enabled: false,
      })
    );

    expect(result.current.focusState).toEqual({
      focusedIndex: -1,
      focusedNoteId: null,
      isFocused: false,
      focusVisible: false,
      isKeyboardNavigationActive: false,
      lastKeyboardNavigationTime: 0,
    });

    // Navigation should not work when disabled
    act(() => {
      result.current.navigateFocus('down');
    });

    expect(result.current.focusState.focusedIndex).toBe(-1);
    expect(mockOnFocusChange).not.toHaveBeenCalled();
  });
});
