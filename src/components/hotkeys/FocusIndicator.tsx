import React from "react";
import { motion, AnimatePresence } from "framer-motion";

interface FocusIndicatorProps {
  isVisible: boolean;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const FocusIndicator: React.FC<FocusIndicatorProps> = ({
  isVisible,
  children,
  className,
  style,
}) => {
  return (
    <div className={className} style={style}>
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            style={{
              position: "absolute",
              top: "-2px",
              left: "-2px",
              right: "-2px",
              bottom: "-2px",
              border: "2px solid var(--accent-color)",
              borderRadius: "6px",
              pointerEvents: "none",
              zIndex: 10,
              boxShadow:
                "0 0 0 1px var(--accent-color), 0 0 8px rgba(var(--accent-color-rgb, 255, 165, 0), 0.3)",
            }}
          />
        )}
      </AnimatePresence>
      {children}
    </div>
  );
};

interface FocusableItemProps {
  index: number;
  isFocused: boolean;
  isFocusVisible: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  onFocus?: () => void;
  className?: string;
  style?: React.CSSProperties;
  "data-note-id"?: string;
}

export const FocusableItem: React.FC<FocusableItemProps> = ({
  index,
  isFocused,
  isFocusVisible,
  children,
  onClick,
  onFocus,
  className,
  style,
  "data-note-id": noteId,
  ...props
}) => {
  const handleClick = () => {
    onClick?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick?.();
    }
  };

  return (
    <FocusIndicator isVisible={isFocused && isFocusVisible}>
      <div
        role="button"
        tabIndex={isFocused ? 0 : -1}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        className={className}
        style={{
          position: "relative",
          cursor: "pointer",
          ...style,
        }}
        data-note-id={noteId}
        data-focus-index={index}
        aria-label={`Note ${index + 1}`}
        {...props}
      >
        {children}
      </div>
    </FocusIndicator>
  );
};
