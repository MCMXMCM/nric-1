import React from "react";
import { Button } from "./Button";

/**
 * User action types
 */
export type UserAction =
  | "follow"
  | "unfollow"
  | "mute"
  | "unmute"
  | "share"
  | "edit"
  | "message";

export interface UserActionButtonsProps {
  /** Whether the current user is following this user */
  isFollowing?: boolean;
  /** Whether the current user has muted this user */
  isMuted?: boolean;
  /** Whether follow/unfollow operations are in progress */
  isFollowBusy?: boolean;
  /** Whether mute/unmute operations are in progress */
  isMuteBusy?: boolean;
  /** Whether the user can perform follow actions (authenticated) */
  canFollow?: boolean;
  /** Whether the user can perform mute actions (authenticated) */
  canMute?: boolean;
  /** Whether this is the current user's own profile */
  isOwnProfile?: boolean;

  /** Action handlers */
  onFollow?: () => void;
  onUnfollow?: () => void;
  onMute?: () => void;
  onUnmute?: () => void;
  onShare?: () => void;
  onEdit?: () => void;
  onMessage?: () => void;

  /** Which actions to show */
  showFollow?: boolean;
  showMute?: boolean;
  showShare?: boolean;
  showEdit?: boolean;
  showMessage?: boolean;

  /** Layout options */
  layout?: "horizontal" | "vertical" | "compact";
  size?: "sm" | "md" | "lg";
  gap?: string;

  /** Styling */
  style?: React.CSSProperties;
  className?: string;

  /** Custom button text */
  followText?: string;
  unfollowText?: string;
  muteText?: string;
  unmuteText?: string;
  shareText?: string;
  editText?: string;
  messageText?: string;

  /** Mobile optimizations */
  isMobile?: boolean;
}

/**
 * Unified UserActionButtons component that consolidates all user action patterns
 * Handles follow/unfollow, mute/unmute, share, edit, and messaging actions
 */
export const UserActionButtons: React.FC<UserActionButtonsProps> = ({
  isFollowing = false,
  isMuted = false,
  isFollowBusy = false,
  isMuteBusy = false,
  canFollow = true,
  canMute = true,
  isOwnProfile = false,
  onFollow,
  onUnfollow,
  onMute,
  onUnmute,
  onShare,
  onEdit,
  onMessage,
  showFollow = true,
  showMute = false,
  showShare = true,
  showEdit = false,
  showMessage = false,
  layout = "horizontal",
  size = "md",
  gap = "0.5rem",
  style = {},
  className,
  followText = "Follow",
  unfollowText = "Unfollow",
  muteText = "Mute",
  unmuteText = "Unmute",
  shareText = "Share",
  editText = "Edit",
  messageText = "Message",
  isMobile = false,
}) => {
  const getContainerStyles = (): React.CSSProperties => {
    const baseStyles: React.CSSProperties = {
      display: "flex",
      gap: gap,
      alignItems: "center",
      ...style,
    };

    switch (layout) {
      case "vertical":
        return {
          ...baseStyles,
          flexDirection: "column",
          alignItems: "stretch",
        };

      case "compact":
        return {
          ...baseStyles,
          gap: "0.25rem",
        };

      case "horizontal":
      default:
        return baseStyles;
    }
  };

  const containerStyles = getContainerStyles();

  // Follow/Unfollow button
  const renderFollowButton = () => {
    if (!showFollow || isOwnProfile) return null;

    const handleFollowClick = () => {
      if (isFollowing) {
        onUnfollow?.();
      } else {
        onFollow?.();
      }
    };

    return (
      <Button
        variant={isFollowing ? "ghost" : "primary"}
        size={size}
        onClick={handleFollowClick}
        disabled={!canFollow || isFollowBusy}
        loading={isFollowBusy}
        title={isFollowing ? "Unfollow this user" : "Follow this user"}
        isMobile={isMobile}
      >
        {isFollowBusy
          ? isFollowing
            ? "Unfollowing..."
            : "Following..."
          : isFollowing
          ? unfollowText
          : followText}
      </Button>
    );
  };

  // Mute/Unmute button
  const renderMuteButton = () => {
    if (!showMute || isOwnProfile) return null;

    const handleMuteClick = () => {
      if (isMuted) {
        onUnmute?.();
      } else {
        onMute?.();
      }
    };

    return (
      <Button
        variant={isMuted ? "ghost" : "danger"}
        size={size}
        onClick={handleMuteClick}
        disabled={!canMute || isMuteBusy}
        loading={isMuteBusy}
        title={isMuted ? "Unmute this user" : "Mute this user"}
        isMobile={isMobile}
      >
        {isMuteBusy
          ? isMuted
            ? "Unmuting..."
            : "Muting..."
          : isMuted
          ? unmuteText
          : muteText}
      </Button>
    );
  };

  // Share button
  const renderShareButton = () => {
    if (!showShare) return null;

    return (
      <Button
        variant="ghost"
        size={size}
        onClick={onShare}
        title="Share this profile"
        isMobile={isMobile}
        icon={
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
        }
      >
        {shareText}
      </Button>
    );
  };

  // Edit button (for own profile)
  const renderEditButton = () => {
    if (!showEdit || !isOwnProfile) return null;

    return (
      <Button
        variant="primary"
        size={size}
        onClick={onEdit}
        title="Edit your profile"
        isMobile={isMobile}
        icon={
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        }
      >
        {editText}
      </Button>
    );
  };

  // Message button
  const renderMessageButton = () => {
    if (!showMessage || isOwnProfile) return null;

    return (
      <Button
        variant="ghost"
        size={size}
        onClick={onMessage}
        title="Send a message"
        isMobile={isMobile}
        icon={
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        }
      >
        {messageText}
      </Button>
    );
  };

  return (
    <div className={className} style={containerStyles}>
      {renderFollowButton()}
      {renderMuteButton()}
      {renderShareButton()}
      {renderEditButton()}
      {renderMessageButton()}
    </div>
  );
};

/**
 * Preset UserActionButtons components for common use cases
 */

// Profile header actions (follow, share, edit)
export const ProfileHeaderActions: React.FC<
  Omit<UserActionButtonsProps, "showMute" | "showMessage">
> = (props) => (
  <UserActionButtons
    {...props}
    showMute={false}
    showMessage={false}
    showEdit={props.isOwnProfile}
    showShare={true}
    showFollow={!props.isOwnProfile}
  />
);

// Compact actions for cards and lists
export const CompactUserActions: React.FC<UserActionButtonsProps> = (props) => (
  <UserActionButtons {...props} layout="compact" size="sm" />
);

// Full actions with all options
export const FullUserActions: React.FC<UserActionButtonsProps> = (props) => (
  <UserActionButtons
    {...props}
    showFollow={true}
    showMute={true}
    showShare={true}
    showMessage={true}
    showEdit={props.isOwnProfile}
  />
);

// Vertical actions for mobile/narrow layouts
export const VerticalUserActions: React.FC<UserActionButtonsProps> = (
  props
) => <UserActionButtons {...props} layout="vertical" />;

export default UserActionButtons;
