import { useEffect, useMemo } from 'react';
import { useHotkeyContext } from '../contexts/HotkeyContext';
import type { HotkeyConfig } from '../types/hotkeys';

interface UseThreadHotkeysProps {
  // Navigation
  onNavigateUp?: () => void;
  onNavigateDown?: () => void;
  onNavigateFirst?: () => void;
  onNavigateLast?: () => void;
  
  // Actions (when note is focused)
  onLink?: () => void;
  onReply?: () => void;
  onLike?: () => void;
  onBookmark?: () => void;
  onCollapse?: () => void;
  onFocusThread?: () => void;
  onScrollToParent?: () => void;
  
  // Global actions
  onBackToFeed?: () => void;
  onHelpToggle?: () => void;
  onEscape?: () => void;
  
  // State
  hasNotes?: boolean;
  enabled?: boolean;
}

export const useThreadHotkeys = ({
  onNavigateUp,
  onNavigateDown,
  onNavigateFirst,
  onNavigateLast,
  onLink,
  onReply,
  onLike,
  onBookmark,
  onCollapse,
  onFocusThread,
  onScrollToParent,
  onBackToFeed,
  onHelpToggle,
  onEscape,
  hasNotes = false,
  enabled = true,
}: UseThreadHotkeysProps) => {
  
  const {
    registerContext,
    unregisterContext,
    setActiveContext,
    registerGlobalShortcuts,
    focusState,
    navigateFocus,
  } = useHotkeyContext();

  // Create navigation shortcuts - memoized to prevent recreating on every render
  const navigationShortcuts: HotkeyConfig[] = useMemo(() => [
    {
      key: 'k',
      description: 'Navigate up',
      action: () => {
        navigateFocus('up');
        if (onNavigateUp) onNavigateUp();
      },
      enabled: enabled && hasNotes,
      preventDefault: true,
    },
    {
      key: 'j',
      description: 'Navigate down',
      action: () => {
        console.log('[ThreadHotkeys] J key pressed, calling navigateFocus down');
        navigateFocus('down');
        if (onNavigateDown) onNavigateDown();
      },
      enabled: enabled && hasNotes,
      preventDefault: true,
    },
    {
      key: 'arrowup',
      description: 'Navigate up',
      action: () => {
        navigateFocus('up');
        if (onNavigateUp) onNavigateUp();
      },
      enabled: enabled && hasNotes,
      preventDefault: true,
    },
    {
      key: 'arrowdown',
      description: 'Navigate down',
      action: () => {
        navigateFocus('down');
        if (onNavigateDown) onNavigateDown();
      },
      enabled: enabled && hasNotes,
      preventDefault: true,
    },
    {
      key: 'home',
      description: 'Go to first note',
      action: () => {
        if (onNavigateFirst) onNavigateFirst();
        else navigateFocus('first');
      },
      enabled: enabled && hasNotes,
      preventDefault: true,
    },
    {
      key: 'end',
      description: 'Go to last note',
      action: () => {
        if (onNavigateLast) onNavigateLast();
        else navigateFocus('last');
      },
      enabled: enabled && hasNotes,
      preventDefault: true,
    },
    {
      key: 'g g',
      description: 'Go to top',
      action: () => {
        if (onNavigateFirst) onNavigateFirst();
        else navigateFocus('first');
      },
      enabled: enabled && hasNotes,
      preventDefault: true,
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [enabled, hasNotes]);

  // Create action shortcuts (only when note is focused) - memoized to prevent recreating on every render
  const actionShortcuts: HotkeyConfig[] = useMemo(() => [
    {
      key: 'l',
      description: 'Link to note',
      action: () => onLink?.(),
      enabled: enabled && focusState.isFocused,
      preventDefault: true,
    },
    {
      key: 'shift+r',
      description: 'Reply',
      action: () => onReply?.(),
      enabled: enabled && focusState.isFocused,
      preventDefault: true,
    },
    {
      key: 'shift+l',
      description: 'Like',
      action: () => onLike?.(),
      enabled: enabled && focusState.isFocused,
      preventDefault: true,
    },
    {
      key: 'shift+b',
      description: 'Bookmark',
      action: () => onBookmark?.(),
      enabled: enabled && focusState.isFocused,
      preventDefault: true,
    },
    {
      key: 'c',
      description: 'Collapse/expand note',
      action: () => onCollapse?.(),
      enabled: enabled && focusState.isFocused,
      preventDefault: true,
    },
    {
      key: 't',
      description: 'Focus thread on note',
      action: () => onFocusThread?.(),
      enabled: enabled && focusState.isFocused,
      preventDefault: true,
    },
    {
      key: 'f',
      description: 'Focus thread on note',
      action: () => onFocusThread?.(),
      enabled: enabled && focusState.isKeyboardNavigationActive,
      preventDefault: true,
    },
    {
      key: 'p',
      description: 'Scroll to parent',
      action: () => onScrollToParent?.(),
      enabled: enabled && hasNotes,
      preventDefault: true,
    },
    {
      key: 'b',
      description: 'Back to feed',
      action: () => onBackToFeed?.(),
      enabled: enabled,
      preventDefault: true,
    },
  ], [enabled, hasNotes, focusState.isFocused, onLink, onReply, onLike, onBookmark, onCollapse, onFocusThread, onScrollToParent, onBackToFeed]);

  // Create global shortcuts - include navigation as global on thread page to avoid race with context activation
  const globalShortcuts: HotkeyConfig[] = useMemo(() => [
    // Navigation keys as global while on thread page
    ...navigationShortcuts,
    // Global actions
    {
      key: 'shift+?',
      description: 'Show help',
      action: () => onHelpToggle?.(),
      enabled: enabled,
      preventDefault: true,
    },
    {
      key: 'escape',
      description: 'Close modal or clear focus',
      action: () => onEscape?.(),
      enabled: enabled,
      preventDefault: true,
    },
  ], [enabled, onHelpToggle, onEscape, navigationShortcuts]);

  // Register thread context and set as active
  useEffect(() => {
    const threadContext = {
      id: 'thread',
      name: 'Thread Navigation',
      shortcuts: [...navigationShortcuts, ...actionShortcuts],
      enabled: enabled && hasNotes,
    };

    console.log('[ThreadHotkeys] Registering context:', {
      enabled,
      hasNotes,
      totalShortcuts: threadContext.shortcuts.length,
      contextEnabled: threadContext.enabled
    });

    registerContext(threadContext);
    
    // Set active context immediately without delay
    if (enabled && hasNotes) {
      console.log('[ThreadHotkeys] Setting active context to thread');
      setActiveContext('thread');
    } else {
      console.log('[ThreadHotkeys] Setting active context to null');
      setActiveContext(null);
    }
    
    return () => {
      unregisterContext('thread');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    // Only depend on data that changes, not functions (they're stable with useCallback)
    enabled,
    hasNotes,
    navigationShortcuts,
    actionShortcuts,
  ]);

  // Register global shortcuts
  useEffect(() => {
    registerGlobalShortcuts(globalShortcuts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    // Only depend on data that changes, not the function (it's stable with useCallback)
    globalShortcuts,
  ]);

  return {
    focusState,
    shortcuts: {
      navigation: navigationShortcuts,
      actions: actionShortcuts,
      global: globalShortcuts,
    },
  };
};

