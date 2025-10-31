import React, { forwardRef } from "react";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Button visual variant */
  variant?: "primary" | "ghost" | "icon" | "danger" | "toggle";
  /** Button size */
  size?: "sm" | "md" | "lg";
  /** Icon element to display */
  icon?: React.ReactNode;
  /** Loading state */
  loading?: boolean;
  /** Full width button */
  fullWidth?: boolean;
  /** Toggle state (for toggle variant) */
  active?: boolean;
  /** Mobile optimized sizing */
  isMobile?: boolean;
  /** Custom width */
  width?: string | number;
  /** Custom height */
  height?: string | number;
  /** Children content */
  children?: React.ReactNode;
}

/**
 * Unified Button component that consolidates all button patterns used across the app
 * Replaces 100+ inline button style declarations
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      icon,
      loading = false,
      fullWidth = false,
      active = false,
      isMobile = false,
      width,
      height,
      disabled,
      children,
      className,
      style = {},
      ...props
    },
    ref
  ) => {
    const getBaseStyles = (): React.CSSProperties => ({
      border: "none",
      borderRadius: "0",
      cursor: disabled || loading ? "not-allowed" : "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: icon && children ? "0.5rem" : "0",
      transition: "all 0.3s ease",
      outline: "none",
      fontFamily: '"IBM Plex Mono", monospace',
      textTransform: "none",
      whiteSpace: "nowrap",
      opacity: disabled ? 0.5 : 1,
      width: fullWidth ? "100%" : width,
      height: height,
      ...style,
    });

    const getVariantStyles = (): React.CSSProperties => {
      switch (variant) {
        case "primary":
          return {
            backgroundColor: "var(--app-bg-color)",
            color: "var(--text-color)",
            border: "1px dotted var(--border-color)",
            padding: getSizePadding(),
            fontSize: getSizeFontSize(),
            textTransform: "uppercase",
            height: getSizeHeight(),
          };

        case "ghost":
          return {
            backgroundColor: "transparent",
            color: "var(--text-color)",
            border: "none",
            padding: getSizePadding(),
            fontSize: getSizeFontSize(),
          };

        case "icon":
          return {
            backgroundColor: "transparent",
            color: "var(--link-color)",
            border: "none",
            padding: "0",
            width: getSizeIconDimension(),
            height: getSizeIconDimension(),
            minWidth: getSizeIconDimension(),
            minHeight: getSizeIconDimension(),
          };

        case "danger":
          return {
            backgroundColor: "transparent",
            color: "var(--btn-accent)",
            border: "1px dotted var(--btn-accent)",
            padding: getSizePadding(),
            fontSize: getSizeFontSize(),
          };

        case "toggle":
          return {
            backgroundColor: active ? "var(--accent-color)" : "transparent",
            color: active ? "var(--app-bg-color)" : "var(--text-color)",
            border: "1px dotted var(--border-color)",
            padding: getSizePadding(),
            fontSize: getSizeFontSize(),
            textTransform: "uppercase",
          };

        default:
          return {};
      }
    };

    const getSizePadding = (): string => {
      switch (size) {
        case "sm":
          return "0.25rem 0.5rem";
        case "md":
          return "0.5rem 0.75rem";
        case "lg":
          return "0.75rem 1rem";
        default:
          return "0.5rem 0.75rem";
      }
    };

    const getSizeFontSize = (): string => {
      switch (size) {
        case "sm":
          return "0.75rem";
        case "md":
          return "0.875rem";
        case "lg":
          return "1rem";
        default:
          return "0.875rem";
      }
    };

    const getSizeHeight = (): string => {
      if (isMobile) {
        switch (size) {
          case "sm":
            return "1.5rem";
          case "md":
            return "2rem";
          case "lg":
            return "2.5rem";
          default:
            return "2rem";
        }
      }
      switch (size) {
        case "sm":
          return "1.5rem";
        case "md":
          return "2rem";
        case "lg":
          return "2.5rem";
        default:
          return "2rem";
      }
    };

    const getSizeIconDimension = (): string => {
      switch (size) {
        case "sm":
          return "14px";
        case "md":
          return "24px";
        case "lg":
          return "32px";
        default:
          return "24px";
      }
    };

    const buttonStyles: React.CSSProperties = {
      ...getBaseStyles(),
      ...getVariantStyles(),
    };

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled || loading) {
        e.preventDefault();
        return;
      }
      props.onClick?.(e);
    };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        style={buttonStyles}
        className={className}
        {...props}
        onClick={handleClick}
      >
        {loading ? (
          <LoadingSpinner size={size} />
        ) : (
          <>
            {icon}
            {children}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";

/**
 * Simple loading spinner for button loading states
 */
const LoadingSpinner: React.FC<{ size: ButtonProps["size"] }> = ({ size }) => {
  const dimension = size === "sm" ? "12px" : size === "lg" ? "18px" : "14px";

  return (
    <div
      style={{
        width: dimension,
        height: dimension,
        border: "2px solid transparent",
        borderTop: "2px solid currentColor",
        borderRadius: "50%",
        animation: "spin 1s linear infinite",
      }}
    />
  );
};

export default Button;
