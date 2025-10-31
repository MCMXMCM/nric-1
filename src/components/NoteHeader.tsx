import React from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { nip19 } from "nostr-tools";
import { navigateHome } from "../utils/modalUrlState";
import { useUIStore } from "./lib/useUIStore";

interface NoteHeaderProps {
  title: string;
  isMobile: boolean;
  onShare?: () => void;
  showThreadModal?: boolean;
  replyCount?: number;
  noteId?: string;
}

const NoteHeader: React.FC<NoteHeaderProps> = ({
  title,
  isMobile,
  onShare,
  showThreadModal = false,
  replyCount = 0,
  noteId,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const uiIsDarkMode = useUIStore((s) => s.isDarkMode);

  // Helper function to determine text color based on title and theme
  const getTextColor = () => {
    if (!uiIsDarkMode && title === "Thread") {
      return "var(--text-color)";
    } else if (title === "Note") {
      return "var(--ibm-cream)";
    } else {
      return "var(--text-color)";
    }
  };

  // Navigate to thread page
  const handleNavigateToThread = () => {
    if (noteId) {
      try {
        // Prefer bech32 for URLs
        const bech32 = nip19.noteEncode(noteId);
        navigate({
          to: `/thread/${bech32}`,
          state: true,
        });
      } catch {
        navigate({
          to: `/thread/${noteId}`,
          state: true,
        });
      }
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
        width: "100%",
        position: "relative",
      }}
    >
      <div
        style={{
          cursor: "pointer",
          color: getTextColor(),
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
          pointerEvents: "none",
          maxWidth: isMobile ? "70vw" : undefined,
          whiteSpace: isMobile ? "nowrap" : undefined,
          overflow: isMobile ? "hidden" : undefined,
          textOverflow: isMobile ? "ellipsis" : undefined,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            display: "inline-block",
            maxWidth: isMobile ? "70vw" : undefined,
            whiteSpace: isMobile ? "nowrap" : undefined,
            overflow: isMobile ? "hidden" : undefined,
            textOverflow: isMobile ? "ellipsis" : undefined,
            color: getTextColor(),
          }}
        >
          {title}
        </span>
      </div>

      <div style={{ marginLeft: "auto", display: "flex", gap: "0.5rem" }}>
        {onShare && (
          <button
            onClick={onShare}
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
            title="Share this note"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16,6 12,2 8,6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
          </button>
        )}

        {noteId && (
          <button
            onClick={handleNavigateToThread}
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
            title="View thread"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill={showThreadModal ? "var(--accent-color)" : "none"}
              stroke={
                replyCount > 0
                  ? uiIsDarkMode
                    ? "var(--accent-color)"
                    : "var(--ibm-mustard)"
                  : "currentColor"
              }
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                filter:
                  replyCount > 0 ? "var(--accent-glow-filter)" : undefined,
                transition: "stroke 0.2s, fill 0.2s, filter 0.2s",
              }}
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};

export default NoteHeader;
