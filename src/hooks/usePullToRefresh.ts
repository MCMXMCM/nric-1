import { useState, useEffect, useCallback, useRef } from 'react';

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void> | void;
  threshold?: number;
  enabled?: boolean;
  pullDistance?: number;
}

interface PullToRefreshState {
  isPulling: boolean;
  isRefreshing: boolean;
  pullDistance: number;
  canRefresh: boolean;
}

export const usePullToRefresh = ({
  onRefresh,
  threshold = 120, // increased threshold for stronger pull
  enabled = true,
  pullDistance: maxPullDistance = 180, // allow deeper pull to reveal card
}: UsePullToRefreshOptions) => {
  const [state, setState] = useState<PullToRefreshState>({
    isPulling: false,
    isRefreshing: false,
    pullDistance: 0,
    canRefresh: false,
  });

  const touchStartY = useRef<number>(0);
  const lastTouchY = useRef<number>(0);
  const containerRef = useRef<HTMLElement | null>(null);
  const isRefreshingRef = useRef(false);

  const handleTouchStart = useCallback((e: Event) => {
    const touchEvent = e as TouchEvent;
    if (!enabled || isRefreshingRef.current) return;
    
    // Don't start pull-to-refresh if radial menu is active
    if (document.body.hasAttribute('data-radial-menu-active')) return;
    
    // Only start pull-to-refresh if we're at the top of the scroll container
    const container = containerRef.current;
    if (!container) return;

    const scrollTop = container.scrollTop;
    if (scrollTop > 5) return; // Allow small tolerance for scroll position

    touchStartY.current = touchEvent.touches[0].clientY;
    lastTouchY.current = touchEvent.touches[0].clientY;
  }, [enabled]);

  const handleTouchMove = useCallback((e: Event) => {
    const touchEvent = e as TouchEvent;
    if (!enabled || isRefreshingRef.current) return;
    
    // Don't process pull-to-refresh if radial menu is active
    if (document.body.hasAttribute('data-radial-menu-active')) return;
    
    const container = containerRef.current;
    if (!container) return;

    const scrollTop = container.scrollTop;
    if (scrollTop > 5) return;

    const currentY = touchEvent.touches[0].clientY;
    const deltaY = currentY - touchStartY.current;

    // Only allow pulling down
    if (deltaY <= 0) {
      setState(prev => ({
        ...prev,
        isPulling: false,
        pullDistance: 0,
        canRefresh: false,
      }));
      return;
    }

    // Prevent default scrolling when pulling down
    e.preventDefault();

    // Calculate pull distance with resistance
    const resistance = 0.6;
    const adjustedDelta = Math.min(deltaY * resistance, maxPullDistance);
    
    setState(prev => ({
      ...prev,
      isPulling: true,
      pullDistance: adjustedDelta,
      canRefresh: adjustedDelta >= threshold,
    }));

    lastTouchY.current = currentY;
  }, [enabled, threshold, maxPullDistance]);

  const handleTouchEnd = useCallback(async () => {
    if (!enabled || isRefreshingRef.current) return;

    if (state.canRefresh && state.isPulling) {
      setState(prev => ({
        ...prev,
        isRefreshing: true,
        isPulling: false,
      }));

      isRefreshingRef.current = true;

      try {
        await onRefresh();
      } catch (error) {
        console.error('Pull to refresh failed:', error);
      } finally {
        setTimeout(() => {
          setState(prev => ({
            ...prev,
            isRefreshing: false,
            pullDistance: 0,
            canRefresh: false,
          }));
          isRefreshingRef.current = false;
        }, 500); // Show success state briefly
      }
    } else {
      setState(prev => ({
        ...prev,
        isPulling: false,
        pullDistance: 0,
        canRefresh: false,
      }));
    }
  }, [enabled, state.canRefresh, state.isPulling, onRefresh]);

  const bindToContainer = useCallback((element: HTMLElement | null) => {
    if (containerRef.current) {
      containerRef.current.removeEventListener('touchstart', handleTouchStart);
      containerRef.current.removeEventListener('touchmove', handleTouchMove);
      containerRef.current.removeEventListener('touchend', handleTouchEnd);
    }

    containerRef.current = element;

    if (element && enabled) {
      element.addEventListener('touchstart', handleTouchStart);
      element.addEventListener('touchmove', handleTouchMove);
      element.addEventListener('touchend', handleTouchEnd);
    }
  }, [enabled, handleTouchStart, handleTouchMove, handleTouchEnd]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (containerRef.current) {
        containerRef.current.removeEventListener('touchstart', handleTouchStart);
        containerRef.current.removeEventListener('touchmove', handleTouchMove);
        containerRef.current.removeEventListener('touchend', handleTouchEnd);
      }
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return {
    ...state,
    bindToContainer,
  };
};
