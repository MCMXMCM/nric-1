import React from "react";
import LoadingText from "./LoadingText";

interface LoadingTextPlaceholderProps {
  type: "npub" | "hex" | "displayName" | "loadMore" | "custom";
  customLength?: number;
  className?: string;
  style?: React.CSSProperties;
  speed?: "slow" | "normal" | "fast";
}

const LoadingTextPlaceholder: React.FC<LoadingTextPlaceholderProps> = ({
  type,
  customLength,
  className = "",
  style = {},
  speed = "normal",
}) => {
  // Animations enabled on all platforms now that media loader issue is fixed

  // Calculate length based on type
  const getLength = () => {
    switch (type) {
      case "npub":
        // npub1 followed by 58 characters = 63 total
        return 63;
      case "hex":
        // 64 character hex string
        return 64;
      case "displayName":
        // Typical display name length (adjust as needed)
        return 15;
      case "loadMore":
        // "Load more" = 9 characters
        return 9;
      case "custom":
        return customLength || 10;
      default:
        return 10;
    }
  };

  const length = getLength();

  // Animated loading text
  return (
    <LoadingText
      length={length}
      className={className}
      style={style}
      speed={speed}
    />
  );
};

export default LoadingTextPlaceholder;
