import React from "react";

interface ClearCacheModalProps {
  isClearingCache: boolean;
  onClearCache: () => void | Promise<void>;
  onClose: () => Promise<void> | void;
  title?: string;
  message?: string;
  confirmLabel?: string;
}

export const ClearCacheModal: React.FC<ClearCacheModalProps> = ({
  isClearingCache,
  onClearCache,
  onClose,
  title = "Clear Cache",
  message = "Are you sure you want to clear the cache? This will remove all stored notes and metadata.",
  confirmLabel = "Clear Cache",
}) => (
  <div
    style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      zIndex: 10000,
    }}
    onClick={() => !isClearingCache && onClose()}
  >
    <div
      style={{
        backgroundColor: "var(--app-bg-color)",
        padding: "2rem",
        maxWidth: "400px",
        width: "100%",
        position: "relative",
        border: "1px dotted #64748b",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <h3
        style={{
          color: "var(--text-color)",

          fontSize: "1.25rem",
          margin: "0 0 1rem 0",
        }}
      >
        {title}
      </h3>
      <p
        style={{
          color: "var(--text-color)",

          fontSize: "0.875rem",
          margin: "0 0 1.5rem 0",
        }}
      >
        {message}
      </p>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: "1rem",
        }}
      >
        <button
          onClick={() => !isClearingCache && onClose()}
          disabled={isClearingCache}
          style={{
            backgroundColor: "transparent",
            border: "1px solid var(--border-color)",
            color: "var(--text-color)",
            padding: "0.5rem 1rem",

            fontSize: "0.875rem",
            cursor: isClearingCache ? "not-allowed" : "pointer",
            opacity: isClearingCache ? 0.5 : 1,
          }}
        >
          Cancel
        </button>
        <button
          onClick={async () => {
            await onClearCache();
            // Use setTimeout to ensure modal closes after any logout-related operations
            setTimeout(() => {
              onClose();
            }, 100);
          }}
          disabled={isClearingCache}
          style={{
            backgroundColor: isClearingCache ? "#64748b" : "#ef4444",
            border: "none",
            color: "white",
            padding: "0.5rem 1rem",

            fontSize: "0.875rem",
            cursor: isClearingCache ? "not-allowed" : "pointer",
            opacity: isClearingCache ? 0.5 : 1,
            transition: "background-color 0.2s ease",
          }}
        >
          {isClearingCache ? "Clearing..." : confirmLabel}
        </button>
      </div>
    </div>
  </div>
);
