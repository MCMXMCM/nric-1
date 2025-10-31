import React from "react";
import LoadingSpinner from "../ui/LoadingSpinner";

interface ImagePlaceholderProps {
  width: number;
  height: number;
  aspectRatio?: number;
  isDarkMode: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Image placeholder component that maintains consistent dimensions
 * to prevent layout shifts during image loading and scroll restoration
 */
export const ImagePlaceholder: React.FC<ImagePlaceholderProps> = ({
  width,
  height,
  aspectRatio,
  className,
  style = {},
}) => {
  // Calculate dimensions based on aspect ratio if provided
  const finalHeight = aspectRatio ? width / aspectRatio : height;

  return (
    <div
      className={className}
      style={{
        width: "100%",
        height: "100%",
        minWidth: `${width}px`,
        minHeight: `${finalHeight}px`,
        backgroundColor: "var(--app-bg-color)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "8px",
        border: "1px solid var(--border-color)",
        position: "absolute",
        top: 0,
        left: 0,
        overflow: "hidden",
        ...style,
      }}
    >
      {/* Subtle loading animation */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",

          backgroundColor: "var(--app-bg-color)",
          animation: "shimmer 2s infinite ease-in-out",
        }}
      />
      <LoadingSpinner
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "transparent",
          width: "100%",
          height: "100%",
          color: "var(--text-color)",
        }}
        size="small"
        width={width}
        height={finalHeight}
      />

      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  );
};

/**
 * Hook to calculate optimal placeholder dimensions based on container width
 */
export const useImagePlaceholderDimensions = (
  containerWidth: number,
  imageCount: number
) => {
  // Calculate grid layout dimensions
  const getPlaceholderDimensions = (index: number) => {
    const gap = 2;

    switch (imageCount) {
      case 1:
        // Single image - use reasonable aspect ratio
        return {
          width: containerWidth,
          height: containerWidth * 0.75, // 4:3 aspect ratio
          aspectRatio: 4 / 3,
        };

      case 2:
        // Two images side by side
        return {
          width: (containerWidth - gap) / 2,
          height: ((containerWidth - gap) / 2) * 0.75,
          aspectRatio: 4 / 3,
        };

      case 3:
        if (index === 0) {
          // First image spans left half (prefer portrait)
          return {
            width: (containerWidth - gap) / 2,
            height: ((containerWidth - gap) / 2) * 1.25, // slightly taller to fit common phone screenshots
            aspectRatio: 2 / 3, // portrait-leaning placeholder
          };
        } else {
          // Other images stack on right (often landscape/square)
          const rightWidth = (containerWidth - gap) / 2;
          return {
            width: rightWidth,
            height: (rightWidth * 0.9 - gap) / 2,
            aspectRatio: 1.2, // slight landscape bias
          };
        }

      case 4:
      default:
        // 2x2 grid
        return {
          width: (containerWidth - gap) / 2,
          height: ((containerWidth - gap) / 2) * 0.75,
          aspectRatio: 4 / 3,
        };
    }
  };

  return { getPlaceholderDimensions };
};
