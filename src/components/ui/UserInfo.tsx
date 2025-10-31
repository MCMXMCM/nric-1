import React from "react";
import {
  UserAvatar,
  type UserAvatarProps,
  type AvatarSize,
} from "./UserAvatar";
import {
  UserDisplayName,
  type UserDisplayNameProps,
  type DisplayNameVariant,
} from "./UserDisplayName";

/**
 * Layout variants for user info display
 */
export type UserInfoLayout =
  | "horizontal"
  | "vertical"
  | "avatar-only"
  | "name-only";

export interface UserInfoProps {
  /** User's public key in hex format */
  pubkeyHex?: string | null;
  /** User's npub (bech32 format) */
  npub?: string | null;
  /** User's profile picture URL */
  picture?: string | null;
  /** Display name from metadata */
  displayName?: string | null;
  /** Function to get display name for pubkey */
  getDisplayNameForPubkey?: (pubkey: string) => string;

  /** Layout variant */
  layout?: UserInfoLayout;
  /** Avatar size */
  avatarSize?: AvatarSize;
  /** Display name variant */
  nameVariant?: DisplayNameVariant;
  /** Gap between avatar and name */
  gap?: string;

  /** Avatar-specific props */
  useAscii?: boolean;
  useColor?: boolean;
  showAvatarBorder?: boolean;

  /** Display name specific props */
  maxNameLength?: number;
  showNpubFallback?: boolean;

  /** Interaction props */
  clickable?: boolean;
  onClick?: () => void;

  /** Styling props */
  style?: React.CSSProperties;
  className?: string;

  /** Additional content */
  subtitle?: string;
  badge?: React.ReactNode;

  /** Loading state */
  loading?: boolean;
}

/**
 * Comprehensive UserInfo component that combines avatar and display name
 * Provides flexible layouts and styling options for user information display
 */
export const UserInfo: React.FC<UserInfoProps> = ({
  pubkeyHex,
  npub,
  picture,
  displayName,
  getDisplayNameForPubkey,
  layout = "horizontal",
  avatarSize = "md",
  nameVariant = "full",
  gap = "0.75rem",
  useAscii = false,
  useColor = false,
  showAvatarBorder = true,
  maxNameLength = 20,
  showNpubFallback = true,
  clickable = false,
  onClick,
  style = {},
  className,
  subtitle,
  badge,
  loading = false,
}) => {
  const getContainerStyles = (): React.CSSProperties => {
    const baseStyles: React.CSSProperties = {
      display: "flex",
      alignItems: "center",
      gap: gap,
      cursor: clickable ? "pointer" : "default",
      ...style,
    };

    switch (layout) {
      case "vertical":
        return {
          ...baseStyles,
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
        };

      case "avatar-only":
        return {
          ...baseStyles,
          gap: "0",
        };

      case "name-only":
        return {
          ...baseStyles,
          gap: "0",
        };

      case "horizontal":
      default:
        return baseStyles;
    }
  };

  const handleClick = () => {
    if (clickable && onClick) {
      onClick();
    }
  };

  const avatarProps: UserAvatarProps = {
    picture,
    displayName,
    npub,
    size: avatarSize,
    useAscii,
    useColor,
    showBorder: showAvatarBorder,
    clickable,
    onClick: handleClick,
  };

  const nameProps: UserDisplayNameProps = {
    pubkeyHex,
    npub,
    displayName,
    getDisplayNameForPubkey,
    variant: nameVariant,
    maxLength: maxNameLength,
    showNpubFallback,
    clickable,
    onClick: handleClick,
    loading,
  };

  const containerStyles = getContainerStyles();

  return (
    <div
      className={className}
      style={containerStyles}
      onClick={clickable ? handleClick : undefined}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleClick();
              }
            }
          : undefined
      }
    >
      {/* Avatar */}
      {layout !== "name-only" && <UserAvatar {...avatarProps} />}

      {/* Name and additional info */}
      {layout !== "avatar-only" && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: layout === "vertical" ? "center" : "flex-start",
            minWidth: 0, // Allow text truncation
            flex: 1,
          }}
        >
          {/* Main display name */}
          <UserDisplayName {...nameProps} />

          {/* Subtitle */}
          {subtitle && (
            <div
              style={{
                fontSize: "0.75rem",
                color: "var(--text-muted)",
                marginTop: "0.125rem",
                opacity: 0.8,
              }}
            >
              {subtitle}
            </div>
          )}
        </div>
      )}

      {/* Badge */}
      {badge && <div style={{ marginLeft: "auto" }}>{badge}</div>}
    </div>
  );
};

/**
 * Preset UserInfo components for common use cases
 */

// Compact user info for lists and feeds
export const CompactUserInfo: React.FC<
  Omit<UserInfoProps, "avatarSize" | "nameVariant">
> = (props) => <UserInfo {...props} avatarSize="sm" nameVariant="truncated" />;

// Card user info for profile cards and modals
export const CardUserInfo: React.FC<
  Omit<UserInfoProps, "avatarSize" | "layout">
> = (props) => <UserInfo {...props} avatarSize="lg" layout="horizontal" />;

// Vertical user info for profile headers
export const VerticalUserInfo: React.FC<Omit<UserInfoProps, "layout">> = (
  props
) => <UserInfo {...props} layout="vertical" />;

// Clickable user info for navigation
export const ClickableUserInfo: React.FC<UserInfoProps> = (props) => (
  <UserInfo {...props} clickable={true} />
);

// Minimal user info with just avatar and short name
export const MinimalUserInfo: React.FC<
  Omit<UserInfoProps, "avatarSize" | "nameVariant" | "gap">
> = (props) => (
  <UserInfo {...props} avatarSize="sm" nameVariant="short" gap="0.5rem" />
);

export default UserInfo;
