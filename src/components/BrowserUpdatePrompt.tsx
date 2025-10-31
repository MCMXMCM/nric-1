import React from "react";
import { useBrowserUpdate } from "../hooks/useBrowserUpdate";

interface BrowserUpdatePromptProps {
  onUpdate?: () => void;
  onDismiss?: () => void;
}

const BrowserUpdatePrompt: React.FC<BrowserUpdatePromptProps> = ({
  onUpdate,
  onDismiss,
}) => {
  const {
    isUpdateAvailable,
    isUpdateInProgress,
    isBrowser,
    performBrowserUpdate,
    dismissUpdate,
  } = useBrowserUpdate();

  const handleUpdate = async () => {
    try {
      await performBrowserUpdate();
      onUpdate?.();
    } catch (error) {
      console.error("Browser update failed:", error);
    }
  };

  const handleDismiss = () => {
    dismissUpdate();
    onDismiss?.();
  };

  // Only show for browser users (not PWA) when update is available
  if (!isBrowser || !isUpdateAvailable) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        top: "20px",
        left: "50%",
        transform: "translateX(-50%)",
        backgroundColor: "var(--app-bg-color)",
        color: "var(--text-color)",
        padding: "16px",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
        zIndex: 1000,
        maxWidth: "90vw",
        width: "400px",
        border: "1px solid #333",
        borderRadius: "0px",
      }}
    >
      <div
        style={{
          marginBottom: "12px",
          fontWeight: "bold",
          display: "flex",
          alignItems: "center",
          color: "var(--text-color)",
          gap: "8px",
        }}
      >
        <span style={{ color: "var(--text-color)" }}>
          {isUpdateInProgress ? "⏳" : "🔄"}
        </span>
        <span style={{ color: "var(--text-color)" }}>
          {isUpdateInProgress ? "Refreshing..." : "New Version Available"}
        </span>
      </div>
      <div
        style={{
          marginBottom: "16px",
          fontSize: "14px",
          opacity: 0.8,
          color: "var(--text-color)",
        }}
      >
        <span style={{ color: "var(--text-color)" }}>
          {isUpdateInProgress
            ? "Refreshing the page to load the latest version. This will only take a moment..."
            : "A new version of NRIC-1 is available. Refresh to get the latest features and improvements."}
        </span>
      </div>
      {!isUpdateInProgress && (
        <div
          style={{
            display: "flex",
            gap: "8px",
            justifyContent: "flex-end",
            color: "var(--text-color)",
          }}
        >
          <button
            onClick={handleDismiss}
            style={{
              padding: "8px 16px",
              backgroundColor: "transparent",
              color: "var(--text-color)",
              border: "1px solid #666",
              cursor: "pointer",
              borderRadius: "0px",
            }}
          >
            Later
          </button>
          <button
            onClick={handleUpdate}
            style={{
              padding: "8px 16px",
              backgroundColor: "var(--accent-color)",
              color: "var(--app-bg-color)",
              border: "none",
              cursor: "pointer",
              fontWeight: "bold",
              borderRadius: "0px",
            }}
          >
            Refresh Now
          </button>
        </div>
      )}
    </div>
  );
};

export default BrowserUpdatePrompt;
