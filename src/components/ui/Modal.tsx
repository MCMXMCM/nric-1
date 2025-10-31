import React, { useEffect, useRef, forwardRef } from "react";
import { Button } from "./Button";
import { CloseIcon } from "./Icons";

/**
 * Modal variants based on analysis of existing patterns
 */
export type ModalVariant = "overlay" | "fullscreen" | "inline";
export type ModalSize = "sm" | "md" | "lg" | "xl" | "auto";

export interface ModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Function to call when modal should close */
  onClose: () => void;
  /** Modal variant */
  variant?: ModalVariant;
  /** Modal size (for overlay and inline variants) */
  size?: ModalSize;
  /** Modal title */
  title?: string;
  /** Whether to show close button */
  showCloseButton?: boolean;
  /** Whether clicking backdrop closes modal */
  closeOnBackdropClick?: boolean;
  /** Whether pressing escape closes modal */
  closeOnEscape?: boolean;
  /** Custom z-index */
  zIndex?: number;
  /** Mobile optimized behavior */
  isMobile?: boolean;
  /** PWA mode (for fullscreen modals) */
  isPWA?: boolean;
  /** Mount within existing container instead of portal */
  mountWithinContainer?: boolean;
  /** Custom styles for modal container */
  containerStyle?: React.CSSProperties;
  /** Custom styles for modal content */
  contentStyle?: React.CSSProperties;
  /** Custom class names */
  className?: string;
  /** Children content */
  children?: React.ReactNode;
}

/**
 * Unified Modal component that consolidates all modal patterns used across the app
 * Handles overlay modals, fullscreen modals, and inline container modals
 */
export const Modal = forwardRef<HTMLDivElement, ModalProps>(
  (
    {
      isOpen,
      onClose,
      variant = "overlay",
      size = "md",
      title,
      showCloseButton = true,
      closeOnBackdropClick = true,
      closeOnEscape = true,
      zIndex = 9999,
      isMobile = false,
      mountWithinContainer = false,
      containerStyle = {},
      contentStyle = {},
      className,
      children,
    },
    ref
  ) => {
    const initialScrollYRef = useRef<number>(0);

    // Handle escape key
    useEffect(() => {
      if (!isOpen || !closeOnEscape) return;

      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          onClose();
        }
      };

      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }, [isOpen, closeOnEscape, onClose]);

    // Handle body scroll prevention for fullscreen modals
    useEffect(() => {
      if (!isOpen || variant !== "fullscreen" || mountWithinContainer) return;

      try {
        const body = document.body;
        initialScrollYRef.current = window.scrollY || window.pageYOffset || 0;

        const original = {
          position: body.style.position,
          top: body.style.top,
          left: body.style.left,
          right: body.style.right,
          width: body.style.width,
          overflow: body.style.overflow,
        };

        // Prevent background scroll
        body.style.position = "fixed";
        body.style.top = `-${initialScrollYRef.current}px`;
        body.style.left = "0";
        body.style.right = "0";
        body.style.width = "100%";
        body.style.overflow = "hidden";

        return () => {
          // Restore original styles
          Object.assign(body.style, original);
          // Restore scroll position
          window.scrollTo(0, initialScrollYRef.current);
        };
      } catch (error) {
        console.warn("Error managing body scroll:", error);
      }
    }, [isOpen, variant, mountWithinContainer]);

    if (!isOpen) return null;

    const getContainerStyles = (): React.CSSProperties => {
      const baseStyles: React.CSSProperties = {
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        zIndex,
        ...containerStyle,
      };

      switch (variant) {
        case "fullscreen":
          return {
            ...baseStyles,

            height: isMobile ? "100dvh" : "100vh",
            minHeight: isMobile ? "100dvh" : "100vh",
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            flexDirection: "column",
            alignItems: isMobile ? "stretch" : "flex-start",
            justifyContent: isMobile ? "stretch" : "center",
            paddingTop: isMobile ? 0 : "100px",
            width: "100vw",
            maxWidth: "100vw",
            overflow: "hidden",
            overscrollBehavior: "none",
            WebkitOverflowScrolling: "touch",
            touchAction: isMobile ? "none" : "auto",
          };

        case "overlay":
          return {
            ...baseStyles,
            backgroundColor: "var(--app-bg-color)",
            alignItems: isMobile ? "flex-start" : "center",
            justifyContent: "center",
            paddingTop: isMobile ? "20px" : "100px",
            // padding: "20px",
          };

        case "inline":
          return {
            ...baseStyles,
            position: "relative",
            backgroundColor: "transparent",
            alignItems: "stretch",
            justifyContent: "stretch",
          };

        default:
          return baseStyles;
      }
    };

    const getContentStyles = (): React.CSSProperties => {
      const baseStyles: React.CSSProperties = {
        backgroundColor: "var(--card-bg-color)",
        color: "var(--text-color)",
        display: "flex",
        flexDirection: "column",
        ...contentStyle,
      };

      if (variant === "fullscreen") {
        return {
          ...baseStyles,
          width: "100%",
          height: "100%",
          maxWidth: "none",
          maxHeight: "none",
          overflow: "auto",
        };
      }

      if (variant === "inline") {
        return {
          ...baseStyles,
          width: "100%",
          height: "100%",
          overflow: "auto",
        };
      }

      // Overlay variant sizing
      const sizeStyles = getSizeStyles();
      return {
        ...baseStyles,
        ...sizeStyles,
        overflow: "auto",
        borderRadius: variant === "overlay" ? "0" : "8px",
      };
    };

    const getSizeStyles = (): React.CSSProperties => {
      switch (size) {
        case "sm":
          return {
            maxWidth: "320px",
            width: "90%",
            maxHeight: "60vh",
          };
        case "md":
          return {
            maxWidth: "400px",
            width: "90%",
            maxHeight: "80vh",
          };
        case "lg":
          return {
            maxWidth: "600px",
            width: "90%",
            maxHeight: "85vh",
          };
        case "xl":
          return {
            maxWidth: "800px",
            width: "95%",
            maxHeight: "90vh",
          };
        case "auto":
          return {
            width: "auto",
            height: "auto",
            maxWidth: "95vw",
            maxHeight: "90vh",
          };
        default:
          return {};
      }
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
      if (closeOnBackdropClick && e.target === e.currentTarget) {
        onClose();
      }
    };

    const handleContentClick = (e: React.MouseEvent) => {
      e.stopPropagation();
    };

    return (
      <div
        ref={ref}
        style={getContainerStyles()}
        className={className}
        onClick={handleBackdropClick}
      >
        <div style={getContentStyles()} onClick={handleContentClick}>
          {/* Header */}
          {(title || showCloseButton) && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "60px 20px 0 20px",

                minHeight: "60px",
              }}
            >
              {title && (
                <h3
                  style={{
                    margin: 0,
                    color: "var(--text-color)",
                    fontSize: "1.25rem",
                    fontWeight: 600,
                  }}
                >
                  {title}
                </h3>
              )}
              {showCloseButton && (
                <Button
                  variant="icon"
                  size="md"
                  onClick={onClose}
                  icon={<CloseIcon />}
                  title="Close"
                  style={{
                    marginLeft: "auto",
                    color: "var(--text-muted)",
                  }}
                />
              )}
            </div>
          )}

          {/* Content */}
          <div
            style={{
              flex: 1,
              padding: title || showCloseButton ? "0 20px 20px 20px" : "20px",
              overflow: "auto",
            }}
          >
            {children}
          </div>
        </div>
      </div>
    );
  }
);

Modal.displayName = "Modal";

/**
 * Specialized modal components for common use cases
 */

// Confirmation dialog
export interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "danger";
  isMobile?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "default",
  isMobile = false,
}) => {
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      variant="overlay"
      size="sm"
      title={title}
      isMobile={isMobile}
    >
      <div style={{ marginBottom: "20px" }}>
        <p style={{ color: "var(--text-color)", lineHeight: "1.5", margin: 0 }}>
          {message}
        </p>
      </div>
      <div
        style={{
          display: "flex",
          gap: "12px",
          justifyContent: "flex-end",
        }}
      >
        <Button variant="ghost" onClick={onClose}>
          {cancelText}
        </Button>
        <Button
          variant={variant === "danger" ? "danger" : "primary"}
          onClick={handleConfirm}
        >
          {confirmText}
        </Button>
      </div>
    </Modal>
  );
};

// Form modal wrapper
export interface FormModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  size?: ModalSize;
  isMobile?: boolean;
  children: React.ReactNode;
}

export const FormModal: React.FC<FormModalProps> = ({
  isOpen,
  onClose,
  title,
  size = "md",
  isMobile = false,
  children,
}) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    variant="overlay"
    size={size}
    title={title}
    isMobile={isMobile}
  >
    {children}
  </Modal>
);

// Fullscreen modal wrapper
export interface FullscreenModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  isMobile?: boolean;
  isPWA?: boolean;
  mountWithinContainer?: boolean;
  children: React.ReactNode;
}

export const FullscreenModal: React.FC<FullscreenModalProps> = ({
  isOpen,
  onClose,
  title,
  isMobile = false,
  isPWA = false,
  mountWithinContainer = false,
  children,
}) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    variant="fullscreen"
    title={title}
    isMobile={isMobile}
    isPWA={isPWA}
    mountWithinContainer={mountWithinContainer}
  >
    {children}
  </Modal>
);

export default Modal;
