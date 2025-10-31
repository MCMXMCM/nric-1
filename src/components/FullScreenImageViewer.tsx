import React, { useCallback } from "react";
import { motion } from "framer-motion";

interface FullScreenImageViewerProps {
  imageUrl: string;
  onClose: () => void;
}

export const FullScreenImageViewer: React.FC<FullScreenImageViewerProps> = ({
  imageUrl,
  onClose,
}) => {
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.9)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
        padding: "2rem",
      }}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        style={{
          position: "absolute",
          top: "1rem",
          right: "1rem",
          background: "rgba(0, 0, 0, 0.7)",
          border: "1px solid rgba(255, 255, 255, 0.3)",
          color: "white",
          cursor: "pointer",
          padding: "0.5rem",
          fontSize: "1.5rem",

          borderRadius: "0",
          zIndex: 10001,
          width: "3rem",
          height: "3rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        title="Close (ESC)"
      >
        ×
      </button>

      {/* Image */}
      <motion.img
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3 }}
        src={imageUrl}
        alt="Full screen view"
        style={{
          maxWidth: "90vw",
          maxHeight: "90vh",
          objectFit: "contain",
          borderRadius: "0",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      />

      {/* Instructions */}
      <div
        style={{
          position: "absolute",
          bottom: "1rem",
          left: "50%",
          transform: "translateX(-50%)",
          color: "rgba(255, 255, 255, 0.7)",
          fontSize: "0.875rem",

          textAlign: "center",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
        }}
      >
        Click outside or press ESC to close
      </div>
    </motion.div>
  );
};
