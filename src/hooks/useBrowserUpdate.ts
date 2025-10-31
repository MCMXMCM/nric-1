import { useState, useEffect, useCallback } from 'react';
import { getCurrentVersion, hasVersionChanged, clearBrowserCaches, performHardRefresh, getLastUpdateAttempt, setLastUpdateAttempt } from '../utils/versionCheck';

interface BrowserUpdateState {
  isUpdateAvailable: boolean;
  isUpdateInProgress: boolean;
  isBrowser: boolean;
  lastCheckTime: number;
  lastUpdateAttempt: number;
}

// Version checking mechanism for browser users
export const useBrowserUpdate = () => {
  const [state, setState] = useState<BrowserUpdateState>({
    isUpdateAvailable: false,
    isUpdateInProgress: false,
    isBrowser: false,
    lastCheckTime: 0,
    lastUpdateAttempt: getLastUpdateAttempt(),
  });

  const isBrowserMode = useCallback(() => {
    // Check if NOT running as PWA
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                         (window.navigator as any).standalone === true;
    return !isStandalone;
  }, []);

  const checkForBrowserUpdates = useCallback(async () => {
    if (!isBrowserMode()) return;

    // Check if we recently attempted an update (within last 30 seconds)
    const now = Date.now();
    const lastUpdateAttempt = getLastUpdateAttempt();
    const timeSinceLastUpdateAttempt = now - lastUpdateAttempt;
    if (timeSinceLastUpdateAttempt < 30000) {
      // Don't show update banner if we recently attempted an update
      setState(prev => ({ ...prev, lastCheckTime: now }));
      return;
    }

    try {
      // First, check build-time version info
      const currentVersion = getCurrentVersion();
      const versionChanged = hasVersionChanged(currentVersion);
      
      if (versionChanged) {
        setState(prev => ({ ...prev, isUpdateAvailable: true, lastCheckTime: Date.now() }));
        return;
      }

      // Secondary check: HTTP headers
      const timestamp = Date.now();
      const response = await fetch(`/index.html?v=${timestamp}`, {
        method: 'HEAD',
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });

      if (response.ok) {
        // Check if the response has different ETag or Last-Modified than cached version
        const etag = response.headers.get('ETag');
        const lastModified = response.headers.get('Last-Modified');
        
        // Store the current version info
        const currentETag = localStorage.getItem('app-etag');
        const currentLastModified = localStorage.getItem('app-last-modified');
        
        // If this is the first check, store the version info
        if (!currentETag && !currentLastModified) {
          if (etag) localStorage.setItem('app-etag', etag);
          if (lastModified) localStorage.setItem('app-last-modified', lastModified);
          setState(prev => ({ ...prev, lastCheckTime: timestamp }));
          return;
        }
        
        // Check if version has changed
        const hasUpdate = (etag && etag !== currentETag) || 
                         (lastModified && lastModified !== currentLastModified);
        
        if (hasUpdate) {
          setState(prev => ({ ...prev, isUpdateAvailable: true, lastCheckTime: timestamp }));
          
          // Update stored version info
          if (etag) localStorage.setItem('app-etag', etag);
          if (lastModified) localStorage.setItem('app-last-modified', lastModified);
        } else {
          setState(prev => ({ ...prev, lastCheckTime: timestamp }));
        }
      }
    } catch (error) {
      console.log('Error checking for browser updates:', error);
      
      // Fallback: Check if JavaScript files have changed by trying to fetch main JS
      try {
        // Get the main JS file from the current page's script tags
        const scripts = document.querySelectorAll('script[src*="/assets/index-"]');
        if (scripts.length > 0) {
          const currentJsFile = (scripts[0] as HTMLScriptElement).src;
          const storedJsFile = localStorage.getItem('app-main-js');
          
          if (storedJsFile && currentJsFile !== storedJsFile) {
            setState(prev => ({ ...prev, isUpdateAvailable: true, lastCheckTime: Date.now() }));
          } else if (!storedJsFile) {
            localStorage.setItem('app-main-js', currentJsFile);
          }
        }
      } catch (fallbackError) {
        console.log('Fallback version check also failed:', fallbackError);
      }
    }
  }, [isBrowserMode]);

  const performBrowserUpdate = useCallback(async () => {
    if (!isBrowserMode()) return;

    // Record the update attempt timestamp before starting
    const updateAttemptTime = Date.now();
    setLastUpdateAttempt(updateAttemptTime);
    setState(prev => ({ 
      ...prev, 
      isUpdateInProgress: true,
      lastUpdateAttempt: updateAttemptTime
    }));

    try {
      // Clear browser caches using utility function
      await clearBrowserCaches();
      
      // Perform hard refresh with cache busting
      performHardRefresh();
      
    } catch (error) {
      console.log('Error performing browser update:', error);
      setState(prev => ({ ...prev, isUpdateInProgress: false }));
      
      // Fallback: simple reload
      try {
        window.location.reload();
      } catch (fallbackError) {
        console.log('Fallback reload also failed:', fallbackError);
      }
    }
  }, [isBrowserMode]);

  const dismissUpdate = useCallback(() => {
    setState(prev => ({ ...prev, isUpdateAvailable: false }));
  }, []);

  useEffect(() => {
    const isBrowser = isBrowserMode();
    setState(prev => ({ ...prev, isBrowser }));

    if (!isBrowser) return;

    // Initial check
    checkForBrowserUpdates();

    // Set up periodic checks (every 10 minutes for browser users)
    const interval = setInterval(checkForBrowserUpdates, 10 * 60 * 1000);

    // Also check when the page becomes visible again (user switches back to tab)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Only check if it's been more than 5 minutes since last check
        const now = Date.now();
        const timeSinceLastCheck = now - state.lastCheckTime;
        if (timeSinceLastCheck > 5 * 60 * 1000) {
          checkForBrowserUpdates();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Check when user focuses the window
    const handleFocus = () => {
      const now = Date.now();
      const timeSinceLastCheck = now - state.lastCheckTime;
      if (timeSinceLastCheck > 5 * 60 * 1000) {
        checkForBrowserUpdates();
      }
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [checkForBrowserUpdates, isBrowserMode]); // Removed state.lastCheckTime to prevent infinite loop

  return {
    ...state,
    checkForBrowserUpdates,
    performBrowserUpdate,
    dismissUpdate,
  };
};
