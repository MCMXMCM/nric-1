import React from "react";
import { nip19 } from "nostr-tools";

/**
 * Display name formatting variants
 */
export type DisplayNameVariant = "full" | "truncated" | "short" | "npub-only";

export interface UserDisplayNameProps {
  /** User's public key in hex format */
  pubkeyHex?: string | null;
  /** User's npub (bech32 format) */
  npub?: string | null;
  /** Display name from metadata */
  displayName?: string | null;
  /** Function to get display name for pubkey */
  getDisplayNameForPubkey?: (pubkey: string) => string;
  /** Display variant */
  variant?: DisplayNameVariant;
  /** Maximum length for truncated variant */
  maxLength?: number;
  /** Whether to show the npub as fallback */
  showNpubFallback?: boolean;
  /** Whether to make the name clickable */
  clickable?: boolean;
  /** Click handler */
  onClick?: () => void;
  /** Custom styles */
  style?: React.CSSProperties;
  /** Custom class name */
  className?: string;
  /** Title attribute for accessibility */
  title?: string;
  /** Loading state */
  loading?: boolean;
  /** Loading placeholder text */
  loadingText?: string;
}

/**
 * Unified UserDisplayName component that consolidates all display name rendering patterns
 * Handles display name resolution, truncation, fallbacks, and various formatting options
 */
export const UserDisplayName: React.FC<UserDisplayNameProps> = ({
  pubkeyHex,
  npub,
  displayName,
  getDisplayNameForPubkey,
  variant = "full",
  maxLength = 20,
  showNpubFallback = true,
  clickable = false,
  onClick,
  style = {},
  className,
  title,
  loading = false,
  loadingText = "Loading...",
}) => {
  // Resolve display name
  const resolveDisplayName = (): string => {
    // Use provided display name first
    if (displayName) return displayName;

    // Use getDisplayNameForPubkey function if available
    if (getDisplayNameForPubkey && pubkeyHex) {
      const resolved = getDisplayNameForPubkey(pubkeyHex);
      if (resolved) return resolved;
    }

    // Fallback to npub if available and enabled
    if (showNpubFallback) {
      if (npub) return npub;
      if (pubkeyHex) {
        try {
          return nip19.npubEncode(pubkeyHex);
        } catch (error) {
          console.warn("Failed to encode pubkey to npub:", error);
        }
      }
    }

    return "Unknown";
  };

  // Format display name based on variant
  const formatDisplayName = (name: string): string => {
    switch (variant) {
      case "truncated":
        return name.length > maxLength
          ? `${name.substring(0, maxLength)}...`
          : name;

      case "short":
        // Show first 8 chars for npub, or truncate regular names to 12 chars
        if (name.startsWith("npub1")) {
          return `${name.substring(0, 12)}...`;
        }
        return name.length > 12 ? `${name.substring(0, 12)}...` : name;

      case "npub-only":
        // Force npub format
        if (pubkeyHex && !name.startsWith("npub1")) {
          try {
            const encoded = nip19.npubEncode(pubkeyHex);
            return `${encoded.substring(0, 12)}...`;
          } catch (error) {
            console.warn("Failed to encode pubkey to npub:", error);
          }
        }
        return name;

      case "full":
      default:
        return name;
    }
  };

  const resolvedName = resolveDisplayName();
  const formattedName = formatDisplayName(resolvedName);

  const containerStyles: React.CSSProperties = {
    color: "var(--text-color)",
    cursor: clickable ? "pointer" : "default",
    textDecoration: clickable ? "none" : undefined,
    ...style,
  };

  const handleClick = () => {
    if (clickable && onClick) {
      onClick();
    }
  };

  const displayText = loading ? loadingText : formattedName;
  const displayTitle =
    title || (formattedName !== resolvedName ? resolvedName : undefined);

  if (clickable) {
    return (
      <button
        className={className}
        style={{
          ...containerStyles,
          background: "none",
          border: "none",
          padding: 0,
          font: "inherit",
        }}
        onClick={handleClick}
        title={displayTitle}
      >
        {displayText}
      </button>
    );
  }

  return (
    <span
      className={className}
      style={containerStyles}
      title={displayTitle}
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
      {displayText}
    </span>
  );
};

/**
 * Preset display name components for common use cases
 */

// Truncated display name for cards and lists
export const TruncatedDisplayName: React.FC<
  Omit<UserDisplayNameProps, "variant">
> = (props) => <UserDisplayName {...props} variant="truncated" />;

// Short display name for compact displays
export const ShortDisplayName: React.FC<
  Omit<UserDisplayNameProps, "variant">
> = (props) => <UserDisplayName {...props} variant="short" />;

// Clickable display name for navigation
export const ClickableDisplayName: React.FC<UserDisplayNameProps> = (props) => (
  <UserDisplayName {...props} clickable={true} />
);

// NPUB-only display (useful for technical displays)
export const NpubDisplayName: React.FC<
  Omit<UserDisplayNameProps, "variant">
> = (props) => <UserDisplayName {...props} variant="npub-only" />;

export default UserDisplayName;
