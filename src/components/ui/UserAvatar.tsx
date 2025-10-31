import React, { useState, useCallback } from "react";
import AsciiRendererV2 from "../AsciiRendererV2";

/**
 * Standard avatar sizes used across the application
 */
export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl" | "custom";

export interface UserAvatarProps {
  /** User's profile picture URL */
  picture?: string | null;
  /** Display name for fallback character */
  displayName?: string | null;
  /** User's npub for additional fallback */
  npub?: string | null;
  /** Avatar size preset */
  size?: AvatarSize;
  /** Custom size in pixels (when size="custom") */
  customSize?: number;
  /** Whether to use ASCII rendering for images */
  useAscii?: boolean;
  /** Whether to use color in ASCII rendering */
  useColor?: boolean;
  /** Custom styles for the avatar container */
  style?: React.CSSProperties;
  /** Custom class name */
  className?: string;
  /** Alt text for the image */
  alt?: string;
  /** Loading priority for the image */
  fetchPriority?: "auto" | "high" | "low";
  /** Callback when image fails to load */
  onError?: () => void;
  /** Callback when ASCII is rendered */
  onAsciiRendered?: (url: string, ascii: string) => void;
  /** Whether to show a border */
  showBorder?: boolean;
  /** Whether the avatar is clickable */
  clickable?: boolean;
  /** Click handler */
  onClick?: () => void;
  /** Title attribute for accessibility */
  title?: string;
}

/**
 * Unified UserAvatar component that consolidates all avatar rendering patterns
 * Handles profile pictures, fallback characters, ASCII rendering, and various sizes
 */
export const UserAvatar: React.FC<UserAvatarProps> = ({
  picture,
  displayName,
  npub,
  size = "md",
  customSize,
  useAscii = false,
  useColor = false,
  style = {},
  className,
  alt = "avatar",
  fetchPriority = "low",
  onError,
  onAsciiRendered,
  showBorder = true,
  clickable = false,
  onClick,
  title,
}) => {
  const [imageError, setImageError] = useState(false);

  // Get size in pixels
  const getSize = (): number => {
    if (size === "custom" && customSize) return customSize;

    switch (size) {
      case "xs":
        return 24;
      case "sm":
        return 32;
      case "md":
        return 40;
      case "lg":
        return 50;
      case "xl":
        return 64;
      default:
        return 40;
    }
  };

  // Get font size for fallback character
  const getFontSize = (): string => {
    const avatarSize = getSize();
    return `${Math.max(avatarSize * 0.4, 10)}px`;
  };

  // Get fallback character
  const getFallbackChar = (): string => {
    if (displayName && displayName.length > 0) {
      return displayName.charAt(0).toUpperCase();
    }
    if (npub && npub.length > 0) {
      return npub.charAt(0).toUpperCase();
    }
    return "👤";
  };

  const handleImageError = useCallback(() => {
    setImageError(true);
    onError?.();
  }, [onError]);

  const handleAsciiRendered = useCallback(
    (ascii: string) => {
      onAsciiRendered?.(picture || "", ascii);
    },
    [onAsciiRendered, picture]
  );

  const avatarSize = getSize();
  const fontSize = getFontSize();
  const fallbackChar = getFallbackChar();
  const hasPicture = picture && !imageError;

  const containerStyles: React.CSSProperties = {
    width: `${avatarSize}px`,
    height: `${avatarSize}px`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
    backgroundColor: "var(--app-bg-color)",
    color: "var(--text-color)",
    fontSize: fontSize,
    cursor: clickable ? "pointer" : "default",
    ...(showBorder && {
      border: "1px dotted var(--border-color)",
    }),
    ...style,
  };

  const imageStyles: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  };

  const fallbackStyles: React.CSSProperties = {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    fontWeight: 500,
  };

  const renderContent = () => {
    if (!hasPicture) {
      return <div style={fallbackStyles}>{fallbackChar}</div>;
    }

    if (useAscii) {
      return (
        <AsciiRendererV2
          src={picture}
          type="image"
          useColor={useColor}
          onAsciiRendered={handleAsciiRendered}
          onError={handleImageError}
          cachedAscii={undefined as any}
        />
      );
    }

    return (
      <img
        src={picture}
        alt={alt}
        style={imageStyles}
        loading="lazy"
        decoding="async"
        fetchPriority={fetchPriority}
        onError={handleImageError}
      />
    );
  };

  const handleClick = () => {
    if (clickable && onClick) {
      onClick();
    }
  };

  return (
    <div
      className={className}
      style={containerStyles}
      onClick={handleClick}
      title={title}
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
      {renderContent()}
    </div>
  );
};

/**
 * Preset avatar components for common use cases
 */

// Small avatar for lists and compact displays
export const SmallAvatar: React.FC<Omit<UserAvatarProps, "size">> = (props) => (
  <UserAvatar {...props} size="sm" />
);

// Medium avatar for cards and standard displays
export const MediumAvatar: React.FC<Omit<UserAvatarProps, "size">> = (
  props
) => <UserAvatar {...props} size="md" />;

// Large avatar for profile headers and prominent displays
export const LargeAvatar: React.FC<Omit<UserAvatarProps, "size">> = (props) => (
  <UserAvatar {...props} size="lg" />
);

// Clickable avatar for navigation
export const ClickableAvatar: React.FC<UserAvatarProps> = (props) => (
  <UserAvatar {...props} clickable={true} />
);

export default UserAvatar;
