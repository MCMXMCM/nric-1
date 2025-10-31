import React from "react";
import LoadingAnimation from "./LoadingAnimation";
import LoadingAnimationCanvas from "./LoadingAnimationCanvas";
import LoadingAnimationXL from "./LoadingAnimationXL";

interface LoadingSpinnerProps {
  size?: "small" | "large" | "xlarge";
  useCanvas?: boolean;
  className?: string;
  style?: React.CSSProperties;
  width?: number;
  height?: number;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = "small",
  useCanvas,
  className = "",
  style = {},
  width,
  height,
}) => {
  const isMobile = typeof window !== "undefined" && window.innerWidth <= 768;

  if (size === "xlarge") {
    const w = width || (isMobile ? 430 : 492);
    const h = height || 490;
    return (
      <LoadingAnimationXL
        width={w}
        height={h}
        className={className}
        style={style}
      />
    );
  }

  // Use canvas for large animations or when explicitly requested
  // Prefer small animations for better UX
  const shouldUseCanvas = useCanvas !== undefined ? useCanvas : false;

  if (shouldUseCanvas) {
    return (
      <LoadingAnimationCanvas
        size={size as "small" | "large"}
        className={className}
        style={style}
        width={width}
        height={height}
      />
    );
  }

  return (
    <LoadingAnimation
      size={size as "small" | "large"}
      className={className}
      style={style}
    />
  );
};

export default LoadingSpinner;
