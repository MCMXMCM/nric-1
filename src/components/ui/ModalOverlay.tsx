import React from "react";

/**
 * Simple modal overlay component for basic backdrop functionality
 * Used when you need just the overlay behavior without the full Modal component
 */

export interface ModalOverlayProps {
  /** Whether the overlay is visible */
  isOpen: boolean;
  /** Function to call when overlay is clicked */
  onClose?: () => void;
  /** Whether clicking the overlay closes it */
  closeOnClick?: boolean;
  /** Custom z-index */
  zIndex?: number;
  /** Background color override */
  backgroundColor?: string;
  /** Custom styles */
  style?: React.CSSProperties;
  /** Custom class name */
  className?: string;
  /** Children content */
  children?: React.ReactNode;
}

export const ModalOverlay: React.FC<ModalOverlayProps> = ({
  isOpen,
  onClose,
  closeOnClick = true,
  zIndex = 9998,
  backgroundColor = "rgba(0, 0, 0, 0.5)",
  style = {},
  className,
  children,
}) => {
  if (!isOpen) return null;

  const handleClick = (e: React.MouseEvent) => {
    if (closeOnClick && onClose && e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className={className}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor,
        zIndex,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...style,
      }}
      onClick={handleClick}
    >
      {children}
    </div>
  );
};

/**
 * Modal backdrop component - just the backdrop without positioning
 * Useful for custom modal implementations
 */
export interface ModalBackdropProps {
  /** Function to call when backdrop is clicked */
  onClose?: () => void;
  /** Whether clicking the backdrop closes the modal */
  closeOnClick?: boolean;
  /** Background color */
  backgroundColor?: string;
  /** Custom styles */
  style?: React.CSSProperties;
  /** Custom class name */
  className?: string;
}

export const ModalBackdrop: React.FC<ModalBackdropProps> = ({
  onClose,
  closeOnClick = true,
  backgroundColor = "rgba(0, 0, 0, 0.5)",
  style = {},
  className,
}) => {
  const handleClick = (e: React.MouseEvent) => {
    if (closeOnClick && onClose && e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className={className}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor,
        ...style,
      }}
      onClick={handleClick}
    />
  );
};

export default ModalOverlay;
