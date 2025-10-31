import { useState, useEffect, useCallback } from 'react';

interface PWAUpdateState {
  isUpdateAvailable: boolean;
  isUpdateInProgress: boolean;
  isStandalone: boolean;
}

export const usePWAUpdate = () => {
  const [state, setState] = useState<PWAUpdateState>({
    isUpdateAvailable: false,
    isUpdateInProgress: false,
    isStandalone: false,
  });

  const checkForUpdates = useCallback(async () => {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          const hasUpdate = !!registration.waiting;
          setState(prev => ({ ...prev, isUpdateAvailable: hasUpdate }));
        }
      } catch (error) {
        console.log('Error checking for updates:', error);
      }
    }
  }, []);

  const performUpdate = useCallback(async () => {
    if ('serviceWorker' in navigator) {
      try {
        setState(prev => ({ ...prev, isUpdateInProgress: true }));
        
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration && registration.waiting) {
          // iOS Safari specific handling
          const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
          
          if (isIOS) {
            // For iOS, we need to be more careful with the update process
            // Don't clear all caches immediately - let the service worker handle it
            try {
              // Send skip waiting message first
              registration.waiting.postMessage({ type: 'SKIP_WAITING' });
              
              // Wait a bit for the service worker to process the message
              await new Promise(resolve => setTimeout(resolve, 300));
              
              // For iOS, use a more gentle reload approach with proper error handling
              try {
                // Don't unregister the service worker - let it handle the update
                // Just reload the page after the service worker has been updated
                window.location.reload();
              } catch (reloadError) {
                console.log('Reload failed, trying alternative approach:', reloadError);
                // Fallback: force a hard reload
                window.location.href = window.location.href;
              }
              
            } catch (updateError) {
              console.log('Update process failed:', updateError);
              // Fallback: try a simple reload
              window.location.reload();
            }
          } else {
            // Non-iOS browsers can use the standard approach
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
            window.location.reload();
          }
        } else {
          // No waiting service worker, just reload to check for updates
          window.location.reload();
        }
      } catch (error) {
        console.log('Error updating PWA:', error);
        setState(prev => ({ ...prev, isUpdateInProgress: false }));
        
        // Fallback: try a simple reload if the update process fails
        try {
          window.location.reload();
        } catch (fallbackError) {
          console.log('Fallback reload also failed:', fallbackError);
        }
      }
    } else {
      // No service worker support, just reload
      window.location.reload();
    }
  }, []);

  useEffect(() => {
    // Check if app is running as PWA
    const checkStandalone = () => {
      return window.matchMedia('(display-mode: standalone)').matches || 
             (window.navigator as any).standalone === true;
    };
    
    setState(prev => ({ ...prev, isStandalone: checkStandalone() }));

    // Listen for PWA update events
    const handleUpdateState = (event: CustomEvent) => {
      const { inProgress } = event.detail;
      setState(prev => ({ ...prev, isUpdateInProgress: inProgress }));
    };

    const handleUpdateAvailable = () => {
      setState(prev => ({ ...prev, isUpdateAvailable: true }));
    };

    // Enhanced service worker update detection
    const setupServiceWorkerListeners = async () => {
      if ('serviceWorker' in navigator) {
        try {
          const registration = await navigator.serviceWorker.getRegistration();
          if (registration) {
            // Listen for new service worker installations
            registration.addEventListener('updatefound', () => {
              const newWorker = registration.installing;
              if (newWorker) {
                newWorker.addEventListener('statechange', () => {
                  if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    // New service worker is waiting - show update prompt
                    setState(prev => ({ ...prev, isUpdateAvailable: true }));
                  }
                });
              }
            });

            // Check for existing waiting service worker
            if (registration.waiting) {
              setState(prev => ({ ...prev, isUpdateAvailable: true }));
            }
          }
        } catch (error) {
          console.log('Error setting up service worker listeners:', error);
        }
      }
    };

    // Check for updates on page load
    checkForUpdates();
    setupServiceWorkerListeners();

    // Listen for update state changes
    window.addEventListener('pwa-update-state', handleUpdateState as EventListener);
    window.addEventListener('pwa-update-available', handleUpdateAvailable);

    // Check for updates periodically (every 30 minutes)
    const updateInterval = setInterval(checkForUpdates, 30 * 60 * 1000);

    return () => {
      window.removeEventListener('pwa-update-state', handleUpdateState as EventListener);
      window.removeEventListener('pwa-update-available', handleUpdateAvailable);
      clearInterval(updateInterval);
    };
  }, [checkForUpdates]);

  return {
    ...state,
    checkForUpdates,
    performUpdate,
  };
};
