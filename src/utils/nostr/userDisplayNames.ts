import type { Metadata } from '../../types/nostr/types';

const DISPLAY_NAMES_STORAGE_KEY = 'nostr_user_display_names';
const DISPLAY_NAMES_CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

interface StoredDisplayName {
  pubkey: string;
  displayName: string;
  name?: string;
  timestamp: number;
  createdAt?: number;
}

interface DisplayNameCache {
  [pubkey: string]: StoredDisplayName;
}

// Load display names from localStorage
export const loadDisplayNamesFromStorage = (): DisplayNameCache => {
  try {
    // Check if localStorage is available
    if (typeof window === 'undefined' || !window.localStorage) {
      console.warn('localStorage not available');
      return {};
    }
    
    const stored = localStorage.getItem(DISPLAY_NAMES_STORAGE_KEY);
    if (!stored) return {};
    
    const cache: DisplayNameCache = JSON.parse(stored);
    const now = Date.now();
    
    // Clean up expired entries
    const validCache: DisplayNameCache = {};
    Object.entries(cache).forEach(([pubkey, entry]) => {
      if (now - entry.timestamp < DISPLAY_NAMES_CACHE_DURATION) {
        validCache[pubkey] = entry;
      }
    });
    
    // Save cleaned cache back to storage
    if (Object.keys(validCache).length !== Object.keys(cache).length) {
      localStorage.setItem(DISPLAY_NAMES_STORAGE_KEY, JSON.stringify(validCache));
    }
    
    return validCache;
  } catch (error) {
    console.error('Error loading display names from storage:', error);
    return {};
  }
};

// Save display names to localStorage
export const saveDisplayNamesToStorage = (cache: DisplayNameCache): void => {
  try {
    // Check if localStorage is available
    if (typeof window === 'undefined' || !window.localStorage) {
      console.warn('localStorage not available');
      return;
    }
    
    localStorage.setItem(DISPLAY_NAMES_STORAGE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error('Error saving display names to storage:', error);
  }
};

// Add or update a display name in the cache
export const addDisplayNameToCache = (pubkey: string, metadata: Metadata, eventCreatedAt?: number): void => {
  const cache = loadDisplayNamesFromStorage();
  const displayName = metadata.display_name || metadata.name || '';
  
  if (displayName) {
    const existing = cache[pubkey];
    const incomingCreatedAt = typeof eventCreatedAt === 'number' ? eventCreatedAt : undefined;

    // Only overwrite if:
    // - no existing entry, or
    // - existing has no createdAt and we have one, or
    // - both have createdAt and incoming is newer
    const shouldOverwrite = !existing ||
      (incomingCreatedAt !== undefined && (existing.createdAt === undefined || incomingCreatedAt > existing.createdAt));

    if (shouldOverwrite) {
      cache[pubkey] = {
        pubkey,
        displayName,
        name: metadata.name,
        timestamp: Date.now(),
        createdAt: incomingCreatedAt
      };
      saveDisplayNamesToStorage(cache);
    } else {
      // Refresh timestamp to extend cache life without overwriting newer name
      cache[pubkey] = {
        ...existing,
        timestamp: Date.now()
      };
      saveDisplayNamesToStorage(cache);
    }
  }
};

// Get display name for a pubkey
export const getDisplayName = (pubkey: string): string | null => {
  const cache = loadDisplayNamesFromStorage();
  const entry = cache[pubkey];
  return entry ? entry.displayName : null;
};

// Get display name for a pubkey with fallback to formatted pubkey
export const getDisplayNameWithFallback = (pubkey: string, formatPubkey: (pubkey: string) => string): string => {
  const displayName = getDisplayName(pubkey);
  if (displayName) {
    return displayName;
  }
  const formattedPubkey = formatPubkey(pubkey);
  return formattedPubkey;
};

// Batch add multiple display names
export const addDisplayNamesBatch = (metadataMap: Record<string, Metadata>): void => {
  const cache = loadDisplayNamesFromStorage();
  let hasChanges = false;
  
  Object.entries(metadataMap).forEach(([pubkey, metadata]) => {
    const displayName = metadata.display_name || metadata.name || '';
    if (displayName) {
      const existing = cache[pubkey];
      // Do not overwrite a newer createdAt entry with unknown createdAt
      if (!existing || existing.createdAt === undefined) {
        cache[pubkey] = {
          pubkey,
          displayName,
          name: metadata.name,
          timestamp: Date.now(),
          createdAt: existing?.createdAt
        };
        hasChanges = true;
      } else {
        // Preserve existing newer entry; just refresh timestamp
        cache[pubkey] = { ...existing, timestamp: Date.now() };
        hasChanges = true;
      }
    }
  });
  
  if (hasChanges) {
    saveDisplayNamesToStorage(cache);
  }
};

// Get all cached display names
export const getAllDisplayNames = (): DisplayNameCache => {
  return loadDisplayNamesFromStorage();
};

// Clear expired display names
export const clearExpiredDisplayNames = (): void => {
  const cache = loadDisplayNamesFromStorage();
  const now = Date.now();
  const validCache: DisplayNameCache = {};
  
  Object.entries(cache).forEach(([pubkey, entry]) => {
    if (now - entry.timestamp < DISPLAY_NAMES_CACHE_DURATION) {
      validCache[pubkey] = entry;
    }
  });
  
  saveDisplayNamesToStorage(validCache);
};

// Get pubkeys that need display names (not in cache or expired)
export const getPubkeysNeedingDisplayNames = (pubkeys: string[]): string[] => {
  const cache = loadDisplayNamesFromStorage();
  const now = Date.now();
  
  return pubkeys.filter(pubkey => {
    const entry = cache[pubkey];
    return !entry || (now - entry.timestamp >= DISPLAY_NAMES_CACHE_DURATION);
  });
};

// Clear all display names from storage
export const clearDisplayNamesCache = (): void => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      console.warn('localStorage not available for clearing display names');
      return;
    }
    
    localStorage.removeItem(DISPLAY_NAMES_STORAGE_KEY);
    console.log('Display names cache cleared successfully');
  } catch (error) {
    console.error('Error clearing display names cache:', error);
  }
};
