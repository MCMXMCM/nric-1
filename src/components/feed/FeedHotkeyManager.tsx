import React from "react";
import { useFeedHotkeys } from "../../hooks/useFeedHotkeys";

interface FeedHotkeyManagerProps {
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

export const FeedHotkeyManager: React.FC<FeedHotkeyManagerProps> = ({
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
  hasNotes = true,
  enabled = true,
}) => {
  // Register feed-specific hotkeys
  useFeedHotkeys({
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
    isModalOpen,
    hasNotes,
    enabled,
  });

  return null; // This component doesn't render anything
};
