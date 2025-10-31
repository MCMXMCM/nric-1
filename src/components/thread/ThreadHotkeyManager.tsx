import React from "react";
import { useThreadHotkeys } from "../../hooks/useThreadHotkeys";

interface ThreadHotkeyManagerProps {
  onNavigateUp?: () => void;
  onNavigateDown?: () => void;
  onNavigateFirst?: () => void;
  onNavigateLast?: () => void;
  hasNotes?: boolean;
  enabled?: boolean;
  // Actions
  onLink?: () => void;
  onReply?: () => void;
  onLike?: () => void;
  onBookmark?: () => void;
  onCollapse?: () => void;
  onFocusThread?: () => void;
  onScrollToParent?: () => void;
  onBackToFeed?: () => void;
  onHelpToggle?: () => void;
  onEscape?: () => void;
}

export const ThreadHotkeyManager: React.FC<ThreadHotkeyManagerProps> = ({
  onNavigateUp,
  onNavigateDown,
  onNavigateFirst,
  onNavigateLast,
  hasNotes = false,
  enabled = true,
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
}) => {
  useThreadHotkeys({
    onNavigateUp,
    onNavigateDown,
    onNavigateFirst,
    onNavigateLast,
    hasNotes,
    enabled,
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
  });

  return null;
};
