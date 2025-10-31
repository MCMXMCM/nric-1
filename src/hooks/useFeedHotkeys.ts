import { useEffect } from 'react';
import { useHotkeyContext } from '../contexts/HotkeyContext';
import type { HotkeyConfig } from '../types/hotkeys';

interface UseFeedHotkeysProps {
  // Navigation
  onNavigateUp?: () => void;
  onNavigateDown?: () => void;
  onNavigateFirst?: () => void;
  onNavigateLast?: () => void;
  onNavigatePageUp?: () => void;
  onNavigatePageDown?: () => void;
  
  // Actions (when note is focused)
  onLink?: () => void;
  onThread?: () => void;
  onRepost?: () => void;
  onZap?: () => void;
  onReply?: () => void;
  onLike?: () => void;
  onBookmark?: () => void;
  onProfile?: () => void;
  onOpenNote?: () => void;
  onParentThread?: () => void;
  onRootThread?: () => void;
  onToggleMedia?: () => void;
  
  // Global actions
  onHelpToggle?: () => void;
  onEscape?: () => void;
  
  // State
  isModalOpen?: boolean;
  hasNotes?: boolean;
  enabled?: boolean;
}

export const useFeedHotkeys = ({
  onNavigateUp,
  onNavigateDown,
  onNavigateFirst,
  onNavigateLast,
  onNavigatePageUp,
  onNavigatePageDown,
  onLink,
  onThread,
  onRepost,
  onZap,
  onReply,
  onLike,
  onBookmark,
  onProfile,
  onOpenNote,
  onParentThread,
  onRootThread,
  onToggleMedia,
  onHelpToggle,
  onEscape,
  isModalOpen = false,
  hasNotes = false,
  enabled = true,
}: UseFeedHotkeysProps) => {
  
  const {
    registerContext,
    unregisterContext,
    setActiveContext,
    registerGlobalShortcuts,
    focusState,
    navigateFocus,
  } = useHotkeyContext();

  // Create navigation shortcuts
  const navigationShortcuts: HotkeyConfig[] = [
    {
      key: 'k',
      description: 'Navigate up',
      action: () => {
        navigateFocus('up');
        if (onNavigateUp) onNavigateUp();
      },
      enabled: enabled && hasNotes && !isModalOpen,
      preventDefault: true,
    },
    {
      key: 'j',
      description: 'Navigate down',
      action: () => {
        navigateFocus('down');
        if (onNavigateDown) onNavigateDown();
      },
      enabled: enabled && hasNotes && !isModalOpen,
      preventDefault: true,
    },
    {
      key: 'arrowup',
      description: 'Navigate up',
      action: () => {
        navigateFocus('up');
        if (onNavigateUp) onNavigateUp();
      },
      enabled: enabled && hasNotes && !isModalOpen,
      preventDefault: true,
    },
    {
      key: 'arrowdown',
      description: 'Navigate down',
      action: () => {
        navigateFocus('down');
        if (onNavigateDown) onNavigateDown();
      },
      enabled: enabled && hasNotes && !isModalOpen,
      preventDefault: true,
    },
    {
      key: 'home',
      description: 'Go to first note',
      action: () => {
        if (onNavigateFirst) onNavigateFirst();
        else navigateFocus('first');
      },
      enabled: enabled && hasNotes && !isModalOpen,
      preventDefault: true,
    },
    {
      key: 'end',
      description: 'Go to last note',
      action: () => {
        if (onNavigateLast) onNavigateLast();
        else navigateFocus('last');
      },
      enabled: enabled && hasNotes && !isModalOpen,
      preventDefault: true,
    },
    {
      key: 'pageup',
      description: 'Navigate up (page)',
      action: () => {
        if (onNavigatePageUp) onNavigatePageUp();
        else navigateFocus('up', 5);
      },
      enabled: enabled && hasNotes && !isModalOpen,
      preventDefault: true,
    },
    {
      key: 'pagedown',
      description: 'Navigate down (page)',
      action: () => {
        if (onNavigatePageDown) onNavigatePageDown();
        else navigateFocus('down', 5);
      },
      enabled: enabled && hasNotes && !isModalOpen,
      preventDefault: true,
    },
    {
      key: 'g g',
      description: 'Go to top',
      action: () => {
        if (onNavigateFirst) onNavigateFirst();
        else navigateFocus('first');
      },
      enabled: enabled && hasNotes && !isModalOpen,
      preventDefault: true,
    },
  ];

  // Create action shortcuts (only when note is focused and no modal is open)
  const actionShortcuts: HotkeyConfig[] = [
    {
      key: 'l',
      description: 'Link to note',
      action: () => onLink?.(),
      enabled: enabled && focusState.isFocused && !isModalOpen,
      preventDefault: true,
    },
    {
      key: 't',
      description: 'View thread',
      action: () => onThread?.(),
      enabled: enabled && focusState.isFocused && !isModalOpen,
      preventDefault: true,
    },
    {
      key: 'r',
      description: 'Repost',
      action: () => onRepost?.(),
      enabled: enabled && focusState.isFocused && !isModalOpen,
      preventDefault: true,
    },
    {
      key: 'z',
      description: 'Zap',
      action: () => onZap?.(),
      enabled: enabled && focusState.isFocused && !isModalOpen,
      preventDefault: true,
    },
    {
      key: 'shift+r',
      description: 'Reply',
      action: () => onReply?.(),
      enabled: enabled && focusState.isFocused && !isModalOpen,
      preventDefault: true,
    },
    {
      key: 'shift+l',
      description: 'Like',
      action: () => onLike?.(),
      enabled: enabled && focusState.isFocused && !isModalOpen,
      preventDefault: true,
    },
    {
      key: 'shift+b',
      description: 'Bookmark',
      action: () => onBookmark?.(),
      enabled: enabled && focusState.isFocused && !isModalOpen,
      preventDefault: true,
    },
    {
      key: 'p',
      description: 'Parent thread',
      action: () => onParentThread?.(),
      enabled: enabled && focusState.isFocused && !isModalOpen,
      preventDefault: true,
    },
    {
      key: 'space',
      description: 'Toggle media',
      action: () => onToggleMedia?.(),
      enabled: enabled && focusState.isFocused && !isModalOpen,
      preventDefault: true,
    },
    {
      key: 'enter',
      description: 'Open note',
      action: () => onOpenNote?.(),
      enabled: enabled && focusState.isFocused && !isModalOpen,
      preventDefault: true,
    },
    {
      key: 'shift+p',
      description: 'Parent thread',
      action: () => onParentThread?.(),
      enabled: enabled && focusState.isFocused && !isModalOpen,
      preventDefault: true,
    },
    {
      key: 'shift+t',
      description: 'Root thread',
      action: () => onRootThread?.(),
      enabled: enabled && focusState.isFocused && !isModalOpen,
      preventDefault: true,
    },
  ];

  // Create global shortcuts
  const globalShortcuts: HotkeyConfig[] = [
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
  ];

  // Register feed context and set as active in one effect to avoid race conditions
  useEffect(() => {
    const feedContext = {
      id: 'feed',
      name: 'Feed Navigation',
      shortcuts: [...navigationShortcuts, ...actionShortcuts],
      enabled: enabled && hasNotes,
    };

    registerContext(feedContext);
    
    // Set active context immediately after registration
    if (enabled && hasNotes && !isModalOpen) {
      setActiveContext('feed');
    } else {
      setActiveContext(null);
    }
    
    return () => {
      unregisterContext('feed');
    };
  }, [
    registerContext,
    unregisterContext,
    setActiveContext,
    enabled,
    hasNotes,
    isModalOpen,
    focusState.isFocused,
    onNavigateUp,
    onNavigateDown,
    onNavigateFirst,
    onNavigateLast,
    onNavigatePageUp,
    onNavigatePageDown,
    onLink,
    onThread,
    onRepost,
    onZap,
    onReply,
    onLike,
    onBookmark,
    onProfile,
    onOpenNote,
    onParentThread,
    onRootThread,
    onToggleMedia,
  ]);

  // Register global shortcuts
  useEffect(() => {
    registerGlobalShortcuts(globalShortcuts);
  }, [registerGlobalShortcuts, enabled, onHelpToggle, onEscape]);

  // Debug: Log when effect dependencies change
  useEffect(() => {
  }, [enabled, hasNotes, isModalOpen]);

  return {
    focusState,
    shortcuts: {
      navigation: navigationShortcuts,
      actions: actionShortcuts,
      global: globalShortcuts,
    },
  };
};
