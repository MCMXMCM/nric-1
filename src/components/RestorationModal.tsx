import React from "react";

interface RestorationModalProps {
  isVisible: boolean;
  onCancel: () => void;
}

const RestorationModal: React.FC<RestorationModalProps> = ({
  isVisible,
  onCancel,
}) => {
  if (!isVisible) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "var(--app-bg-color)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => {
        // Only close if clicking the backdrop, not the modal content
        if (e.target === e.currentTarget) {
          onCancel();
        }
      }}
    >
      <div
        style={{
          backgroundColor: "var(--app-bg-color)",
          padding: "2rem",
          maxWidth: "400px",
          width: "90%",
          border: "1px solid var(--border-color)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "1.5rem",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Spinner */}
        <div
          style={{
            width: "48px",
            height: "48px",
            border: "4px solid var(--border-color)",
            borderTop: "4px solid var(--accent-color)",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
          }}
        />

        {/* Title */}
        <div
          style={{
            fontSize: "1.25rem",
            fontWeight: "600",
            textAlign: "center",
            color: "var(--text-color)",
          }}
        >
          Restoring Feed Position
        </div>

        {/* Description */}
        <div
          style={{
            fontSize: "0.95rem",
            color: "var(--text-secondary-color)",
            textAlign: "center",
            lineHeight: "1.5",
          }}
        >
          Loading notes and finding your last viewed position...
        </div>

        {/* Cancel Button */}
        <button
          onClick={onCancel}
          style={{
            backgroundColor: "transparent",
            border: "2px solid var(--border-color)",
            padding: "0.75rem 1.5rem",
            color: "var(--text-color)",
            fontSize: "0.9rem",
            fontWeight: "500",
            cursor: "pointer",
            transition: "all 0.2s ease",
            marginTop: "0.5rem",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = "var(--hover-color)";
            e.currentTarget.style.borderColor = "var(--accent-color)";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.borderColor = "var(--border-color)";
          }}
        >
          Start Fresh Instead
        </button>

        {/* Help Text */}
        <div
          style={{
            fontSize: "0.8rem",
            color: "var(--text-tertiary-color)",
            textAlign: "center",
            opacity: 0.7,
          }}
        >
          Click outside or press "Start Fresh" to begin from the latest notes
        </div>
      </div>
    </div>
  );
};

export default RestorationModal;
