import React from "react";
import UnifiedLoadingAnimation from "./UnifiedLoadingAnimation";
import type {
  UnifiedLoadingAnimationProps,
  LoadingSize,
  LoadingSpeed,
} from "./UnifiedLoadingAnimation";

// Backward compatibility wrappers for existing components

export interface LoadingAnimationProps {
  size?: LoadingSize;
  className?: string;
  style?: React.CSSProperties;
}

export const LoadingAnimation: React.FC<LoadingAnimationProps> = (props) => (
  <UnifiedLoadingAnimation type="grid" {...props} />
);

export interface LoadingAnimationXLProps {
  width: number;
  height: number;
  className?: string;
  style?: React.CSSProperties;
}

export const LoadingAnimationXL: React.FC<LoadingAnimationXLProps> = (
  props
) => <UnifiedLoadingAnimation type="xl" {...props} />;

export interface LoadingTextProps {
  length: number;
  className?: string;
  style?: React.CSSProperties;
  speed?: LoadingSpeed;
}

export const LoadingText: React.FC<LoadingTextProps> = (props) => (
  <UnifiedLoadingAnimation type="text" {...props} />
);

export interface LoadingTextMultiLineProps {
  lineCount: number;
  lineLength: number;
  className?: string;
  style?: React.CSSProperties;
  speed?: LoadingSpeed;
}

export const LoadingTextMultiLine: React.FC<LoadingTextMultiLineProps> = (
  props
) => <UnifiedLoadingAnimation type="multiline" {...props} />;

// Export the unified component and types
export { UnifiedLoadingAnimation };
export type { UnifiedLoadingAnimationProps, LoadingSize, LoadingSpeed };
