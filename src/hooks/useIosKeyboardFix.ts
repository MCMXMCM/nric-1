import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook to handle iOS Safari virtual keyboard issues with textareas
 * Uses VirtualKeyboard API and CSS Grid to prevent textarea from being hidden
 */
export const useIosKeyboardFix = (isMobile: boolean = false) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Enable VirtualKeyboard API if available
  useEffect(() => {
    if (isMobile && 'virtualKeyboard' in navigator) {
      (navigator as any).virtualKeyboard.overlaysContent = true;
    }
  }, [isMobile]);

  // visualViewport fallback to populate a keyboard inset CSS var
  useEffect(() => {
    if (!isMobile) return;
    const vv: any = (window as any).visualViewport;
    if (!vv) return;

    const updateInset = () => {
      const inset = Math.max(0, window.innerHeight - vv.height);
      document.documentElement.style.setProperty('--keyboard-inset-height', `${inset}px`);
    };

    vv.addEventListener?.('resize', updateInset);
    vv.addEventListener?.('scroll', updateInset);
    updateInset();
    return () => {
      vv.removeEventListener?.('resize', updateInset);
      vv.removeEventListener?.('scroll', updateInset);
    };
  }, [isMobile]);

  // Auto-resize textarea based on content
  const autoResizeTextarea = useCallback(() => {
    if (!isMobile || !textareaRef.current) return;
    
    const textarea = textareaRef.current;
    
    // Get the computed maxHeight from the textarea
    const computedStyle = window.getComputedStyle(textarea);
    const maxHeightValue = computedStyle.maxHeight;
    
    // Parse maxHeight value (e.g., "25vh" -> convert to pixels)
    let maxHeightPx = Infinity;
    if (maxHeightValue && maxHeightValue !== 'none') {
      if (maxHeightValue.includes('vh')) {
        const vhValue = parseFloat(maxHeightValue);
        maxHeightPx = (vhValue * window.innerHeight) / 100;
      } else if (maxHeightValue.includes('px')) {
        maxHeightPx = parseFloat(maxHeightValue);
      }
    }
    
    // Store the current height before checking scrollHeight
    const currentHeight = parseFloat(textarea.style.height) || textarea.offsetHeight;
    
    // Temporarily set to auto to measure actual content height
    textarea.style.height = 'auto';
    const scrollHeight = textarea.scrollHeight;
    
    // Calculate the new height, capped at maxHeight
    const newHeight = Math.min(scrollHeight, maxHeightPx);
    
    // Only update if height needs to change (prevents thrashing)
    // Threshold of 1px to avoid micro-adjustments
    if (Math.abs(newHeight - currentHeight) > 1) {
      textarea.style.height = `${newHeight}px`;
    } else {
      // If height didn't need to change, restore the previous height
      textarea.style.height = `${currentHeight}px`;
    }
  }, [isMobile]);

  // Handle input events for auto-resize
  const handleTextareaInput = useCallback((_e: React.FormEvent<HTMLTextAreaElement>) => {
    autoResizeTextarea();
  }, [autoResizeTextarea]);

  // Get container styles for iOS keyboard handling
  const getContainerStyles = useCallback((): React.CSSProperties => {
    if (!isMobile) {
      return {};
    }

    return {
      display: 'grid',
      height: '100dvh',
      gridTemplateRows: '1fr auto var(--keyboard-inset-height, 0px)',
      gridTemplateAreas: '"content" "input" "keyboard"',
      overflow: 'hidden',
    };
  }, [isMobile]);

  // Get content area styles
  const getContentAreaStyles = useCallback((): React.CSSProperties => {
    if (!isMobile) {
      return {};
    }

    return {
      gridArea: 'content',
      overflowY: 'auto',
      padding: '10px',
    };
  }, [isMobile]);

  // Get input area styles
  const getInputAreaStyles = useCallback((): React.CSSProperties => {
    if (!isMobile) {
      return {};
    }

    return {
      gridArea: 'input',
      // padding: '10px',
      backgroundColor: 'var(--app-bg-color)',
      // borderTop: '1px solid var(--border-color)',
    };
  }, [isMobile]);

  // Get textarea styles with iOS keyboard handling
  const getTextareaStyles = useCallback((): React.CSSProperties => {
    const baseStyles: React.CSSProperties = {
      width: '100%',
      padding: '8px',
      border: '1px solid var(--border-color)',
      // borderRadius: '4px',
      boxSizing: 'border-box',
      resize: 'vertical',
      minHeight: '40px',
      backgroundColor: 'transparent',
      color: 'var(--text-color)',
      fontSize: 'var(--font-size-sm)',
      lineHeight: '1.4',
      whiteSpace: 'pre-wrap',
      fontFamily: '"IBM Plex Mono", monospace',
    };

    if (isMobile) {
      return {
        ...baseStyles,
        resize: 'none',
        height: 'auto',
        minHeight: '80px',
        overflow: 'hidden',
        paddingBottom: '200px',
      };
    }

    return baseStyles;
  }, [isMobile]);

  return {
    containerRef,
    textareaRef,
    autoResizeTextarea,
    handleTextareaInput,
    getContainerStyles,
    getContentAreaStyles,
    getInputAreaStyles,
    getTextareaStyles,
  };
};
