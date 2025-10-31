import { useState, useEffect, useCallback } from 'react';

/**
 * Generic storage hook that can work with localStorage or sessionStorage
 */
function useStorageBase<T>(
  storage: Storage,
  key: string,
  initialValue: T,
  serialize: (value: T) => string = JSON.stringify,
  deserialize: (value: string) => T = JSON.parse
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  // Initialize state from storage or use initial value
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue;

    try {
      const item = storage.getItem(key);
      return item ? deserialize(item) : initialValue;
    } catch (error) {
      console.warn(`Failed to read from ${storage === localStorage ? 'localStorage' : 'sessionStorage'}:`, error);
      return initialValue;
    }
  });

  // Update storage when value changes
  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      
      if (typeof window !== 'undefined') {
        if (valueToStore === null || valueToStore === undefined) {
          storage.removeItem(key);
        } else {
          storage.setItem(key, serialize(valueToStore));
        }
      }
    } catch (error) {
      console.warn(`Failed to save to ${storage === localStorage ? 'localStorage' : 'sessionStorage'}:`, error);
    }
  }, [key, storage, serialize, storedValue]);

  // Clear value from storage
  const clearValue = useCallback(() => {
    try {
      if (typeof window !== 'undefined') {
        storage.removeItem(key);
      }
      setStoredValue(initialValue);
    } catch (error) {
      console.warn(`Failed to clear from ${storage === localStorage ? 'localStorage' : 'sessionStorage'}:`, error);
    }
  }, [key, storage, initialValue]);

  // Listen for storage changes from other tabs/windows
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === key && e.storageArea === storage) {
        try {
          const newValue = e.newValue ? deserialize(e.newValue) : initialValue;
          setStoredValue(newValue);
        } catch (error) {
          console.warn('Failed to parse storage change:', error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [key, storage, deserialize, initialValue]);

  return [storedValue, setValue, clearValue];
}

/**
 * Hook for localStorage with automatic JSON serialization
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  return useStorageBase(
    typeof window !== 'undefined' ? localStorage : {} as Storage,
    key,
    initialValue
  );
}

/**
 * Hook for sessionStorage with automatic JSON serialization
 */
export function useSessionStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  return useStorageBase(
    typeof window !== 'undefined' ? sessionStorage : {} as Storage,
    key,
    initialValue
  );
}

/**
 * Hook for localStorage with string values (no JSON serialization)
 */
export function useLocalStorageString(
  key: string,
  initialValue: string = ''
): [string, (value: string | ((prev: string) => string)) => void, () => void] {
  return useStorageBase(
    typeof window !== 'undefined' ? localStorage : {} as Storage,
    key,
    initialValue,
    (value) => value, // No serialization for strings
    (value) => value  // No deserialization for strings
  );
}

/**
 * Hook for sessionStorage with string values (no JSON serialization)
 */
export function useSessionStorageString(
  key: string,
  initialValue: string = ''
): [string, (value: string | ((prev: string) => string)) => void, () => void] {
  return useStorageBase(
    typeof window !== 'undefined' ? sessionStorage : {} as Storage,
    key,
    initialValue,
    (value) => value, // No serialization for strings
    (value) => value  // No deserialization for strings
  );
}
