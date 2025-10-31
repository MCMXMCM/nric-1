import React, { forwardRef, useCallback } from "react";

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  /** Input variant */
  variant?: "default" | "search" | "password" | "relay";
  /** Input size */
  size?: "sm" | "md" | "lg";
  /** Show error state */
  error?: boolean;
  /** Error message to display */
  errorMessage?: string;
  /** Helper text */
  helperText?: string;
  /** Label text */
  label?: string;
  /** Full width input */
  fullWidth?: boolean;
  /** Mobile optimized behavior */
  isMobile?: boolean;
  /** Loading state */
  loading?: boolean;
  /** Icon element */
  icon?: React.ReactNode;
  /** Icon position */
  iconPosition?: "left" | "right";
}

/**
 * Unified Input component that consolidates all input patterns used across the app
 * Handles mobile zoom prevention, consistent styling, and common behaviors
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      variant = "default",
      size = "md",
      error = false,
      errorMessage,
      helperText,
      label,
      fullWidth = true,
      isMobile = false,
      loading = false,
      icon,
      iconPosition = "left",
      className,
      style = {},
      onFocus,
      onBlur,
      disabled,
      ...props
    },
    ref
  ) => {
    const getBaseStyles = (): React.CSSProperties => ({
      backgroundColor: "transparent",
      color: "var(--text-color)",
      border: error
        ? "1px solid var(--btn-accent)"
        : "1px dotted var(--border-color)",
      borderRadius: "0",
      fontFamily: '"IBM Plex Mono", monospace',
      fontSize: getSizeFontSize(),
      padding: getSizePadding(),
      width: fullWidth ? "100%" : "auto",
      height: getSizeHeight(),
      boxSizing: "border-box",
      outline: "none",
      transition: "all 0.3s ease",
      opacity: disabled ? 0.5 : 1,
      cursor: disabled ? "not-allowed" : "text",
      ...style,
    });

    const getVariantStyles = (): React.CSSProperties => {
      switch (variant) {
        case "search":
          return {
            backgroundColor: "var(--app-bg-color)",
            border: "1px solid var(--border-color)",
            borderRadius: "4px",
          };

        case "password":
          return {
            backgroundColor: "var(--input-bg-color)",
            border: "1px solid var(--border-color)",
            borderRadius: "4px",
            fontSize: "1rem",
            padding: "10px",
          };

        case "relay":
          return {
            backgroundColor: "var(--app-bg-color)",
            border: "1px solid var(--border-color)",
            flex: 1,
          };

        case "default":
        default:
          return {};
      }
    };

    const getSizePadding = (): string => {
      switch (size) {
        case "sm":
          return "0.25rem 0.5rem";
        case "md":
          return "0.5rem";
        case "lg":
          return "0.75rem 1rem";
        default:
          return "0.5rem";
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

    // Mobile zoom prevention on focus
    const handleFocus = useCallback(
      (e: React.FocusEvent<HTMLInputElement>) => {
        if (isMobile) {
          e.currentTarget.style.fontSize = "16px";
        }
        onFocus?.(e);
      },
      [isMobile, onFocus]
    );

    const handleBlur = useCallback(
      (e: React.FocusEvent<HTMLInputElement>) => {
        if (isMobile) {
          e.currentTarget.style.fontSize = getSizeFontSize();
        }
        onBlur?.(e);
      },
      [isMobile, onBlur]
    );

    const inputStyles: React.CSSProperties = {
      ...getBaseStyles(),
      ...getVariantStyles(),
      ...(icon && iconPosition === "left" && { paddingLeft: "2.5rem" }),
      ...(icon && iconPosition === "right" && { paddingRight: "2.5rem" }),
    };

    const containerStyles: React.CSSProperties = {
      position: "relative",
      width: fullWidth ? "100%" : "auto",
      display: "flex",
      flexDirection: "column",
      gap: "0.25rem",
    };

    const iconStyles: React.CSSProperties = {
      position: "absolute",
      top: "50%",
      transform: "translateY(-50%)",
      [iconPosition]: "0.75rem",
      color: "var(--text-muted)",
      pointerEvents: "none",
      zIndex: 1,
    };

    return (
      <div style={containerStyles}>
        {label && (
          <label
            style={{
              display: "block",
              color: "var(--text-color)",
              fontSize: "0.875rem",
              marginBottom: "0.25rem",
              fontWeight: 500,
            }}
          >
            {label}
          </label>
        )}

        <div style={{ position: "relative" }}>
          {icon && <div style={iconStyles}>{icon}</div>}

          <input
            ref={ref}
            disabled={disabled || loading}
            style={inputStyles}
            className={className}
            onFocus={handleFocus}
            onBlur={handleBlur}
            {...props}
          />

          {loading && (
            <div
              style={{
                position: "absolute",
                right: "0.75rem",
                top: "50%",
                transform: "translateY(-50%)",
              }}
            >
              <LoadingSpinner />
            </div>
          )}
        </div>

        {(errorMessage || helperText) && (
          <div
            style={{
              color: error ? "var(--btn-accent)" : "var(--text-muted)",
              fontSize: "0.75rem",
              marginTop: "0.25rem",
              opacity: 0.8,
            }}
          >
            {errorMessage || helperText}
          </div>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

/**
 * Textarea component with similar styling
 */
export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Textarea variant */
  variant?: "default" | "reply";
  /** Show error state */
  error?: boolean;
  /** Error message to display */
  errorMessage?: string;
  /** Helper text */
  helperText?: string;
  /** Label text */
  label?: string;
  /** Full width textarea */
  fullWidth?: boolean;
  /** Mobile optimized behavior */
  isMobile?: boolean;
  /** Auto-resize behavior */
  autoResize?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      variant = "default",
      error = false,
      errorMessage,
      helperText,
      label,
      fullWidth = true,
      isMobile = false,
      autoResize = false,
      className,
      style = {},
      onInput,
      disabled,
      ...props
    },
    ref
  ) => {
    const getBaseStyles = (): React.CSSProperties => ({
      backgroundColor: "transparent",
      color: "var(--text-color)",
      border: error
        ? "1px solid var(--btn-accent)"
        : "1px dotted var(--border-color)",
      borderRadius: "0",
      fontFamily: '"IBM Plex Mono", monospace',
      fontSize: "0.875rem",
      padding: "0.75rem",
      width: fullWidth ? "100%" : "auto",
      boxSizing: "border-box",
      outline: "none",
      transition: "all 0.3s ease",
      opacity: disabled ? 0.5 : 1,
      cursor: disabled ? "not-allowed" : "text",
      lineHeight: "1.4",
      whiteSpace: "pre-wrap",
      textAlign: "left",
      resize: isMobile ? "none" : "vertical",
      ...style,
    });

    const getVariantStyles = (): React.CSSProperties => {
      switch (variant) {
        case "reply":
          return {
            height: isMobile ? "auto" : "100px",
            minHeight: isMobile ? "80px" : undefined,
            overflow: isMobile ? "hidden" : undefined,
          };

        case "default":
        default:
          return {
            minHeight: "100px",
          };
      }
    };

    const handleInput = useCallback(
      (e: React.FormEvent<HTMLTextAreaElement>) => {
        if (autoResize) {
          const target = e.currentTarget;
          target.style.height = "auto";
          target.style.height = `${target.scrollHeight}px`;
        }
        onInput?.(e);
      },
      [autoResize, onInput]
    );

    const textareaStyles: React.CSSProperties = {
      ...getBaseStyles(),
      ...getVariantStyles(),
    };

    const containerStyles: React.CSSProperties = {
      position: "relative",
      width: fullWidth ? "100%" : "auto",
      display: "flex",
      flexDirection: "column",
      gap: "0.25rem",
    };

    return (
      <div style={containerStyles}>
        {label && (
          <label
            style={{
              display: "block",
              color: "var(--text-color)",
              fontSize: "0.875rem",
              marginBottom: "0.25rem",
              fontWeight: 500,
            }}
          >
            {label}
          </label>
        )}

        <textarea
          ref={ref}
          disabled={disabled}
          style={textareaStyles}
          className={className}
          onInput={handleInput}
          {...props}
        />

        {(errorMessage || helperText) && (
          <div
            style={{
              color: error ? "var(--btn-accent)" : "var(--text-muted)",
              fontSize: "0.75rem",
              marginTop: "0.25rem",
              opacity: 0.8,
            }}
          >
            {errorMessage || helperText}
          </div>
        )}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";

/**
 * Simple loading spinner for input loading states
 */
const LoadingSpinner: React.FC = () => (
  <div
    style={{
      width: "14px",
      height: "14px",
      border: "2px solid transparent",
      borderTop: "2px solid currentColor",
      borderRadius: "50%",
      animation: "spin 1s linear infinite",
    }}
  />
);

export default Input;
