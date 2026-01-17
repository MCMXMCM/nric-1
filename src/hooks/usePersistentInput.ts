import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Custom hook for persisting input text to localStorage
 * Useful for preventing text loss when user switches apps on mobile
 * 
 * Uses debouncing to prevent performance issues from excessive localStorage writes
 */
export function usePersistentInput(storageKey: string, initialValue: string = '') {
  // Initialize state from localStorage or use initial value
  const [value, setValue] = useState<string>(() => {
    if (typeof window === 'undefined') return initialValue;

    try {
      const stored = localStorage.getItem(storageKey);
      return stored || initialValue;
    } catch (error) {
      console.warn('Failed to read from localStorage:', error);
      return initialValue;
    }
  });

  // Track the latest value for saving on unmount
  const latestValueRef = useRef(value);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Update the ref whenever value changes
  useEffect(() => {
    latestValueRef.current = value;
  }, [value]);

  // Debounced save to localStorage (only after user stops typing)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce the save by 500ms to avoid blocking the UI on every keystroke
    saveTimeoutRef.current = setTimeout(() => {
      try {
        if (value && value.trim().length > 0) {
          localStorage.setItem(storageKey, value);
        } else {
          // Clear empty values from storage
          localStorage.removeItem(storageKey);
        }
      } catch (error) {
        console.warn('Failed to save to localStorage:', error);
      }
    }, 500);

    // Cleanup function
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [value, storageKey]);

  // Save immediately on unmount to prevent data loss
  useEffect(() => {
    return () => {
      if (typeof window === 'undefined') return;

      try {
        const finalValue = latestValueRef.current;
        if (finalValue && finalValue.trim().length > 0) {
          localStorage.setItem(storageKey, finalValue);
        } else {
          localStorage.removeItem(storageKey);
        }
      } catch (error) {
        console.warn('Failed to save to localStorage on unmount:', error);
      }
    };
  }, [storageKey]);

  // Function to clear the persisted value
  const clearPersistedValue = useCallback(() => {
    if (typeof window === 'undefined') return;

    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    try {
      localStorage.removeItem(storageKey);
      latestValueRef.current = '';
    } catch (error) {
      console.warn('Failed to clear localStorage:', error);
    }
  }, [storageKey]);

  return [value, setValue, clearPersistedValue] as const;
}
