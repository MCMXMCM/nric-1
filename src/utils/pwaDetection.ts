/**
 * Utility functions for detecting PWA mode and iOS-specific behavior
 */

/**
 * Check if the app is running as a PWA (Progressive Web App)
 * This includes standalone, fullscreen, and minimal-ui display modes
 */
export const isPWA = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    (window.navigator as any).standalone === true
  );
};

/**
 * Check if the app is running on iOS
 */
export const isIOS = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

/**
 * Check if the app is running as a PWA on iOS
 * This is useful for iOS-specific PWA adjustments
 */
export const isIOSPWA = (): boolean => {
  return isPWA() && isIOS();
};
