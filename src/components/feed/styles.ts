// Shared styles and style utilities for the NostrFeed components
import { isIOSPWA } from '../../utils/pwaDetection';

export const feedStyles = {
  // Container styles
  mainContainer: (isMobile: boolean) => ({
    width: '100%',
    maxWidth: isMobile ? '100%' : '1000px',
    margin: isMobile ? '0' : '0 auto',
    display: 'flex',
    flexDirection: 'column' as const,
    flex: 1,
    overflow: 'hidden'
  }),

  // Header styles
  header: (isMobile: boolean) => ({
    height: isMobile ? 'calc(50px + var(--safe-area-inset-top))' : '60px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: isMobile ? 'var(--safe-area-inset-top) 1rem 0 1rem' : '0 1rem',
    borderBottom: '1px dotted var(--border-color)',
    backgroundColor: 'var(--app-bg-color )',
    zIndex: 1000,
    position: 'sticky' as const,
    top: 0
  }),

  // Button styles
  button: {
    backgroundColor: 'var(--app-bg-color)',
    color: 'var(--text-color)',
    border: '1px dotted var(--border-color)',
    
    fontSize: '0.75rem',
    textTransform: 'uppercase' as const,
    transition: 'all 0.3s ease',
    borderRadius: '0',
    whiteSpace: 'nowrap' as const,
    height: '1.5rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 'unset',
    padding: '0 0.75rem',
    cursor: 'pointer'
  },

  transparentButton: {
    backgroundColor: 'transparent',
    color: 'var(--app-text-secondary)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '0',
    border: 'none',
    outline: 'none',
    transition: 'color 0.3s ease',
    padding: '2px',
    margin: '0',
    minWidth: 'auto',
    width: 'auto',
    height: 'auto'
  },

  // Layout styles
  controlsContainer: (isMobile?: boolean) => ({
    width: '100%',
    backgroundColor: 'var(--app-bg-color )',
    position: isMobile ? 'relative' as const : 'relative' as const, // Always relative now - outside scrollable container
    top: 'auto',
    left: 'auto',
    right: 'auto',
    maxWidth: isMobile ? '100%' : '1000px', // Match MainLayout max width constraint
    margin: isMobile ? '0' : '0 auto', // Center on desktop
    zIndex: 'auto', // No special z-index needed
    // borderBottom: '1px dotted var(--border-color)',
    minHeight: isMobile ? 'auto' : '2.5rem', // Ensure minimum height on desktop
    padding: 0 // Remove any default padding
  }),

  // Bottom navigation styles for mobile
  bottomNavigation: (isMobile: boolean) => ({
    position: isMobile ? 'fixed' as const : 'relative' as const,
    bottom: isMobile ? (isIOSPWA() ? '20px' : 0) : 'auto', // Higher position on iOS PWA
    left: isMobile ? 0 : 'auto',
    right: isMobile ? 0 : 'auto',
    width: '100%',
    backgroundColor: 'var(--app-bg-color)',
    // borderTop: isMobile ? '1px dotted var(--border-color)' : 'none',
    // borderBottom: !isMobile ? '1px dotted var(--border-color)' : 'none',
    zIndex: isMobile ? 1 : 'auto',
    padding: isMobile ? 'var(--safe-area-inset-bottom, 0) 0 0 0' : '0',
    boxSizing: 'border-box' as const,
  }),

  bottomNavigationContent: (isMobile: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: isMobile ? '0.5rem 1rem' : '0 1rem', // Remove top padding on desktop to eliminate gap
    height: isMobile ? '60px' : 'auto',
    minHeight: isMobile ? '60px' : 'auto',
  }),

  filterText: {
    borderRadius: '0',
    fontSize: '0.75rem',
    color: 'var(--text-color)',
  },

  navigationText: {
    color: 'var(--app-text-secondary)',
    fontSize: '0.75rem',
    
    opacity: 0.7,
    width: 'max-content'
  },

  indexDisplay: {
    color: 'var(--app-text-secondary)',
    fontSize: '0.875rem',
    textAlign: 'left' as const,
    whiteSpace: 'nowrap' as const,
    minWidth: '80px'
  }
};

// Utility functions for dynamic styles
export const getHoverStyle = (element: HTMLElement, hoverBg: string, normalBg: string) => ({
  onMouseEnter: () => { element.style.backgroundColor = hoverBg; },
  onMouseLeave: () => { element.style.backgroundColor = normalBg; }
});

export const getButtonHoverHandlers = (disabled?: boolean) => ({
  onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!disabled) {
      e.currentTarget.style.backgroundColor = 'var(--hover-bg)';
    }
  },
  onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!disabled) {
      e.currentTarget.style.backgroundColor = 'var(--app-bg-color)';
    }
  }
});

export const getTransparentButtonHoverHandlers = () => ({
  onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.color = 'var(--app-text-secondary)';
  },
  onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.color = 'var(--app-text-secondary)';
  }
});
