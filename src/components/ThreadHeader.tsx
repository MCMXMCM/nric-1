import React from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { navigateHome } from "../utils/modalUrlState";
import { useUIStore } from "./lib/useUIStore";

interface ThreadHeaderProps {
  isMobile: boolean;
  noteId: string;
}

const ThreadHeader: React.FC<ThreadHeaderProps> = ({ noteId }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const uiIsDarkMode = useUIStore((s) => s.isDarkMode);

  // Helper function to determine text color based on theme
  const getTextColor = () => {
    return uiIsDarkMode ? "var(--text-color)" : "var(--ibm-cream)";
  };

  // Helper function to determine background color based on theme
  const getBackgroundColor = () => {
    return uiIsDarkMode ? "var(--app-bg-color)" : "var(--ibm-mustard)";
  };

  // Navigate to note view
  const handleNavigateToNote = () => {
    navigate({ to: `/note/${noteId}` });
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
        width: "100%",
        position: "relative",
        backgroundColor: getBackgroundColor(),
      }}
    >
      <div
        style={{
          cursor: "pointer",
          color: getTextColor(),
          fontSize: "0.875rem",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          display: "inline-block",
          minWidth: "50px",
          minHeight: "10px",
          marginLeft: "0.5rem",
        }}
        onClick={() => navigateHome(navigate, location)}
      >
        <span>{"< Feed"}</span>
      </div>

      <div
        style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            fontSize: "0.875rem",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: getTextColor(),
          }}
        >
          Thread
        </span>
      </div>

      <div style={{ marginLeft: "auto", display: "flex", gap: "0.5rem" }}>
        <button
          onClick={handleNavigateToNote}
          style={{
            backgroundColor: "transparent",
            color: getTextColor(),
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "0",
            border: "none",
            outline: "none",
            transition: "color 0.3s ease",
            padding: "0.25rem",
          }}
          title="View note"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="var(--accent-color)"
            stroke="var(--accent-color)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              filter: "var(--accent-glow-filter)",
              transition: "stroke 0.2s, fill 0.2s, filter 0.2s",
            }}
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default ThreadHeader;
