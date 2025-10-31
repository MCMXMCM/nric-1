// Version checking utilities for browser cache busting

export interface VersionInfo {
  buildTime: string;
  version: string;
  gitHash?: string;
}

// Generate version info at build time
export const getCurrentVersion = (): VersionInfo => {
  return {
    buildTime: __BUILD_TIME__,
    version: '1.0.0', // This could be read from package.json
    gitHash: __GIT_HASH__
  };
};

// Check if current version differs from stored version
export const hasVersionChanged = (currentVersion: VersionInfo): boolean => {
  try {
    const storedVersion = localStorage.getItem('app-version-info');
    if (!storedVersion) {
      // First time, store current version
      localStorage.setItem('app-version-info', JSON.stringify(currentVersion));
      return false;
    }

    const stored: VersionInfo = JSON.parse(storedVersion);
    
    // Compare build time and git hash
    const hasChanged = stored.buildTime !== currentVersion.buildTime ||
                      stored.gitHash !== currentVersion.gitHash ||
                      stored.version !== currentVersion.version;

    if (hasChanged) {
      localStorage.setItem('app-version-info', JSON.stringify(currentVersion));
    }

    return hasChanged;
  } catch (error) {
    console.log('Error checking version:', error);
    return false;
  }
};

// Force clear version info (useful for testing)
export const clearVersionInfo = (): void => {
  localStorage.removeItem('app-version-info');
  localStorage.removeItem('app-etag');
  localStorage.removeItem('app-last-modified');
  localStorage.removeItem('app-main-js');
  localStorage.removeItem('app-last-update-attempt');
};

// Get the last update attempt timestamp
export const getLastUpdateAttempt = (): number => {
  try {
    const stored = localStorage.getItem('app-last-update-attempt');
    return stored ? parseInt(stored, 10) : 0;
  } catch (error) {
    console.log('Error getting last update attempt:', error);
    return 0;
  }
};

// Set the last update attempt timestamp
export const setLastUpdateAttempt = (timestamp: number): void => {
  try {
    localStorage.setItem('app-last-update-attempt', timestamp.toString());
  } catch (error) {
    console.log('Error setting last update attempt:', error);
  }
};

// Get a cache-busting URL parameter
export const getCacheBustParam = (): string => {
  return `v=${Date.now()}`;
};

// Check if we're in a browser environment (not PWA)
export const isBrowserEnvironment = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                       (window.navigator as any).standalone === true;
  return !isStandalone;
};

// Enhanced cache clearing for browser users
export const clearBrowserCaches = async (): Promise<void> => {
  try {
    // Clear service worker caches
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map(cacheName => caches.delete(cacheName))
      );
    }

    // Clear version tracking
    clearVersionInfo();

    // Clear sessionStorage (but preserve important user data)
    const preserveKeys = ['nostr-private-key', 'user-preferences'];
    const sessionData: Record<string, string> = {};
    
    preserveKeys.forEach(key => {
      const value = sessionStorage.getItem(key);
      if (value) sessionData[key] = value;
    });

    sessionStorage.clear();

    // Restore preserved data
    Object.entries(sessionData).forEach(([key, value]) => {
      sessionStorage.setItem(key, value);
    });

  } catch (error) {
    console.log('Error clearing browser caches:', error);
  }
};

// Perform a hard refresh with cache busting
export const performHardRefresh = (): void => {
  const cacheBustParam = getCacheBustParam();
  const currentUrl = new URL(window.location.href);
  currentUrl.searchParams.set('cb', cacheBustParam);
  
  // Use location.replace to avoid adding to history
  window.location.replace(currentUrl.toString());
};
