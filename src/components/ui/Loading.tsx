import React from "react";
import UnifiedLoadingAnimation, {
  type LoadingAnimationType,
  type LoadingSpeed,
  type LoadingSize,
} from "./UnifiedLoadingAnimation";
import LoadingSpinner from "./LoadingSpinner";

/**
 * Consolidated Loading component that provides simple interfaces
 * for all loading states used throughout the app
 */

export interface LoadingProps {
  /** Loading variant */
  variant?: "spinner" | "text" | "multiline" | "grid" | "xl";
  /** Size preset */
  size?: "sm" | "md" | "lg" | "xl";
  /** Animation speed */
  speed?: LoadingSpeed;
  /** Custom dimensions for XL variant */
  width?: number;
  height?: number;
  /** For text variant: number of characters */
  length?: number;
  /** For multiline variant: number of lines */
  lineCount?: number;
  /** For multiline variant: characters per line */
  lineLength?: number;
  /** Additional styling */
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Main Loading component - consolidates all loading patterns
 */
export const Loading: React.FC<LoadingProps> = ({
  variant = "spinner",
  size = "md",
  speed = "normal",
  width,
  height,
  length = 20,
  lineCount = 3,
  lineLength = 15,
  className,
  style,
}) => {
  // Map our simplified sizes to the underlying component sizes
  const mapSize = (size: LoadingProps["size"]): LoadingSize => {
    switch (size) {
      case "sm":
        return "small";
      case "md":
      case "lg":
      case "xl":
      default:
        return "large";
    }
  };

  // Handle spinner variant (uses existing LoadingSpinner)
  if (variant === "spinner") {
    const spinnerSize =
      size === "sm" ? "small" : size === "xl" ? "xlarge" : "large";
    return (
      <LoadingSpinner
        size={spinnerSize}
        className={className}
        style={style}
        width={width}
        height={height}
      />
    );
  }

  // Map variants to UnifiedLoadingAnimation types
  const mapVariant = (
    variant: LoadingProps["variant"]
  ): LoadingAnimationType => {
    switch (variant) {
      case "text":
        return "text";
      case "multiline":
        return "multiline";
      case "grid":
        return "grid";
      case "xl":
        return "xl";
      default:
        return "grid";
    }
  };

  return (
    <UnifiedLoadingAnimation
      type={mapVariant(variant)}
      size={mapSize(size)}
      speed={speed}
      length={length}
      lineCount={lineCount}
      lineLength={lineLength}
      width={width}
      height={height}
      className={className}
      style={style}
    />
  );
};

/**
 * Specialized loading components for common use cases
 */

// Text placeholder loading (replaces LoadingTextPlaceholder)
export interface LoadingTextProps {
  /** Preset text types or custom length */
  type?: "npub" | "hex" | "displayName" | "loadMore" | "custom";
  /** Custom length for 'custom' type */
  customLength?: number;
  /** Animation speed */
  speed?: LoadingSpeed;
  className?: string;
  style?: React.CSSProperties;
}

export const LoadingText: React.FC<LoadingTextProps> = ({
  type = "custom",
  customLength = 10,
  speed = "normal",
  className,
  style,
}) => {
  const getLength = () => {
    switch (type) {
      case "npub":
        return 63; // npub1 + 58 chars
      case "hex":
        return 64; // 64 hex chars
      case "displayName":
        return 20;
      case "loadMore":
        return 9; // "Load more"
      case "custom":
        return customLength;
      default:
        return customLength;
    }
  };

  return (
    <Loading
      variant="text"
      speed={speed}
      length={getLength()}
      className={className}
      style={style}
    />
  );
};

// Button loading state
export interface LoadingButtonProps {
  /** Button size to match */
  size?: "sm" | "md" | "lg";
  className?: string;
  style?: React.CSSProperties;
}

export const LoadingButton: React.FC<LoadingButtonProps> = ({
  size = "md",
  className,
  style,
}) => {
  const dimension = size === "sm" ? "12px" : size === "lg" ? "18px" : "14px";

  return (
    <div
      className={className}
      style={{
        width: dimension,
        height: dimension,
        border: "2px solid transparent",
        borderTop: "2px solid currentColor",
        borderRadius: "50%",
        animation: "spin 1s linear infinite",
        ...style,
      }}
    />
  );
};

// Feed/content loading
export const LoadingContent: React.FC<{
  lines?: number;
  lineLength?: number;
  speed?: LoadingSpeed;
  className?: string;
  style?: React.CSSProperties;
}> = ({ lines = 3, lineLength = 50, speed = "normal", className, style }) => (
  <Loading
    variant="multiline"
    speed={speed}
    lineCount={lines}
    lineLength={lineLength}
    className={className}
    style={style}
  />
);

// Full page/modal loading
export const LoadingPage: React.FC<{
  width?: number;
  height?: number;
  speed?: LoadingSpeed;
  className?: string;
  style?: React.CSSProperties;
}> = ({ width = 400, height = 300, speed = "normal", className, style }) => (
  <Loading
    variant="xl"
    speed={speed}
    width={width}
    height={height}
    className={className}
    style={style}
  />
);

// Small inline loading indicator
export const LoadingInline: React.FC<{
  length?: number;
  speed?: LoadingSpeed;
  className?: string;
  style?: React.CSSProperties;
}> = ({ length = 3, speed = "fast", className, style }) => (
  <Loading
    variant="text"
    size="sm"
    speed={speed}
    length={length}
    className={className}
    style={{
      display: "inline-block",
      verticalAlign: "middle",
      ...style,
    }}
  />
);

export default Loading;
