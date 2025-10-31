import { useCallback, useEffect, useRef, useState } from 'react';
import type { FocusState } from '../types/hotkeys';

interface UseFocusManagementProps {
  totalItems: number;
  initialIndex?: number;
  onFocusChange?: (index: number, noteId: string | null) => void;
  enabled?: boolean;
}

export const useFocusManagement = ({
  totalItems,
  onFocusChange,
  enabled = true,
}: UseFocusManagementProps) => {
  const [focusState, setFocusState] = useState<FocusState>({
    focusedIndex: -1, // Don't auto-focus until user uses keyboard navigation
    focusedNoteId: null,
    isFocused: false, // Don't auto-focus until user uses keyboard navigation
    focusVisible: false,
    isKeyboardNavigationActive: false,
    lastKeyboardNavigationTime: 0,
  });

  const focusTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastInteractionRef = useRef<'keyboard' | 'mouse' | null>(null);
  const focusedIndexRef = useRef<number>(-1);
  const totalItemsRef = useRef<number>(totalItems);
  
  // Keep ref in sync with state
  useEffect(() => {
    focusedIndexRef.current = focusState.focusedIndex;
  }, [focusState.focusedIndex]);

  // Keep totalItems ref in sync to avoid stale closures inside callbacks
  useEffect(() => {
    totalItemsRef.current = totalItems;
  }, [totalItems]);

  // Update focus state
  const updateFocus = useCallback((updates: Partial<FocusState>) => {
    setFocusState(prev => {
      const newState = { ...prev, ...updates };
      
      // Notify parent of focus changes
      if (onFocusChange && updates.focusedIndex !== undefined) {
        onFocusChange(updates.focusedIndex, newState.focusedNoteId);
      }
      
      return newState;
    });
  }, [onFocusChange]);

  // Activate keyboard navigation mode
  const activateKeyboardNavigation = useCallback(() => {
    const now = Date.now();
    const currentFocusedIndex = focusedIndexRef.current;
    const itemsCount = totalItemsRef.current;
    
    // Auto-select first note when activating if no note is currently focused
    if (currentFocusedIndex === -1 && itemsCount > 0) {
      updateFocus({
        isKeyboardNavigationActive: true,
        lastKeyboardNavigationTime: now,
        focusVisible: true,
        focusedIndex: 0,
        focusedNoteId: null,
        isFocused: true,
      });
    } else {
      updateFocus({
        isKeyboardNavigationActive: true,
        lastKeyboardNavigationTime: now,
        focusVisible: true,
      });
    }
  }, [updateFocus]);

  // Deactivate keyboard navigation mode
  const deactivateKeyboardNavigation = useCallback(() => {
    updateFocus({
      isKeyboardNavigationActive: false,
      focusVisible: false,
      focusedIndex: -1,
      focusedNoteId: null,
      isFocused: false,
    });
  }, [updateFocus]);

  // Set focused index
  const setFocusedIndex = useCallback((index: number, noteId?: string | null) => {
    if (!enabled) return;
    
    const itemsCount = totalItemsRef.current;
    const clampedIndex = Math.max(0, Math.min(index, itemsCount - 1));
    updateFocus({
      focusedIndex: clampedIndex,
      focusedNoteId: noteId || null,
      isFocused: true,
      focusVisible: lastInteractionRef.current === 'keyboard',
    });
  }, [enabled, updateFocus]);

  // Navigate focus
  const navigateFocus = useCallback((direction: 'up' | 'down' | 'first' | 'last', steps: number = 1) => {
    console.log('[FocusManagement] navigateFocus called:', {
      direction,
      steps,
      enabled,
      totalItems: totalItemsRef.current,
      currentFocusedIndex: focusedIndexRef.current
    });
    
    if (!enabled) {
      console.log('[FocusManagement] navigateFocus: disabled, returning');
      return;
    }
    
    // Activate keyboard navigation mode when navigating
    activateKeyboardNavigation();
    
    // Use ref to get current focused index to avoid stale closure
    const currentFocusedIndex = focusedIndexRef.current;
    const itemsCount = totalItemsRef.current;
    
    // If starting from -1 (no focus), first keypress always selects index 0
    if (currentFocusedIndex === -1) {
      if (itemsCount > 0) {
        console.log('[FocusManagement] navigateFocus: setting initial focus to 0');
        setFocusedIndex(0);
      } else {
        console.log('[FocusManagement] navigateFocus: no items to focus on');
      }
      return;
    }
    
    let newIndex = currentFocusedIndex;
    
    switch (direction) {
      case 'up':
        newIndex = Math.max(0, currentFocusedIndex - steps);
        break;
      case 'down':
        newIndex = Math.min(itemsCount - 1, currentFocusedIndex + steps);
        break;
      case 'first':
        newIndex = 0;
        break;
      case 'last':
        newIndex = itemsCount - 1;
        break;
    }
    
    console.log('[FocusManagement] navigateFocus: calculated newIndex:', newIndex);
    
    if (newIndex !== currentFocusedIndex && itemsCount > 0) {
      console.log('[FocusManagement] navigateFocus: updating focus to', newIndex);
      setFocusedIndex(newIndex);
    } else {
      console.log('[FocusManagement] navigateFocus: no change needed');
    }
  }, [enabled, setFocusedIndex, activateKeyboardNavigation]);

  // Show focus indicator
  const showFocus = useCallback(() => {
    updateFocus({ focusVisible: true });
    
    // Auto-hide focus indicator after mouse interaction
    if (focusTimeoutRef.current) {
      clearTimeout(focusTimeoutRef.current);
    }
    
    focusTimeoutRef.current = setTimeout(() => {
      if (lastInteractionRef.current === 'mouse') {
        updateFocus({ focusVisible: false });
      }
    }, 3000);
  }, [updateFocus]);

  // Hide focus indicator
  const hideFocus = useCallback(() => {
    updateFocus({ focusVisible: false });
  }, [updateFocus]);

  // Handle keyboard interaction
  const handleKeyboardInteraction = useCallback(() => {
    lastInteractionRef.current = 'keyboard';
    showFocus();
  }, [showFocus]);

  // Handle mouse interaction
  const handleMouseInteraction = useCallback(() => {
    lastInteractionRef.current = 'mouse';
    hideFocus();
  }, [hideFocus]);

  // Check if item is focused
  const isItemFocused = useCallback((index: number) => {
    return enabled && focusState.isFocused && focusState.focusedIndex === index;
  }, [enabled, focusState.isFocused, focusState.focusedIndex]);

  // Get focus styles for an item
  const getFocusStyles = useCallback((index: number) => {
    if (!isItemFocused(index) || !focusState.focusVisible) {
      return {};
    }
    
    return {
      outline: '2px solid var(--accent-color)',
      outlineOffset: '2px',
      borderRadius: '4px',
      boxShadow: '0 0 0 1px var(--accent-color)',
    };
  }, [isItemFocused, focusState.focusVisible]);

  // Reset focus
  const resetFocus = useCallback(() => {
    setFocusState({
      focusedIndex: -1,
      focusedNoteId: null,
      isFocused: false,
      focusVisible: false,
      isKeyboardNavigationActive: false,
      lastKeyboardNavigationTime: 0,
    });
  }, []);

  // Enable/disable focus management
  const setEnabled = useCallback((newEnabled: boolean) => {
    if (!newEnabled) {
      resetFocus();
    }
    // Don't auto-focus when enabling - wait for user keyboard interaction
  }, [resetFocus]);

  // Update total items
  useEffect(() => {
    if (totalItems === 0) {
      resetFocus();
    } else if (focusState.focusedIndex >= totalItems) {
      setFocusedIndex(totalItems - 1);
    }
  }, [totalItems, focusState.focusedIndex, setFocusedIndex, resetFocus]);

  // Set up global event listeners for interaction detection
  useEffect(() => {
    if (!enabled) return;
    
    const handleKeyDown = () => handleKeyboardInteraction();
    const handleMouseDown = () => handleMouseInteraction();
    const handleTouchStart = () => handleMouseInteraction();
    
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('touchstart', handleTouchStart);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('touchstart', handleTouchStart);
      
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current);
      }
    };
  }, [enabled, handleKeyboardInteraction, handleMouseInteraction]);

  return {
    focusState,
    setFocusedIndex,
    navigateFocus,
    showFocus,
    hideFocus,
    isItemFocused,
    getFocusStyles,
    resetFocus,
    setEnabled,
    handleKeyboardInteraction,
    handleMouseInteraction,
    activateKeyboardNavigation,
    deactivateKeyboardNavigation,
  };
};
