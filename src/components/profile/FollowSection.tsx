import React from "react";
import { getContactButtonStyle } from "./profileStyles";

interface FollowSectionProps {
  // Follow controls (optional for new header-based follow UI)
  followError?: string | null;

  // Navigation controls
  onShowFollowers: () => void;
  onShowFollowing: () => void;
  onShowRelays: () => void;
  onShowNotes?: () => void;
  // Meta toggle
  showMeta: boolean;
  onToggleMeta: () => void;

  // Current route highlighting
  currentRoute?: "notes" | "followers" | "following" | "relays" | "mute-list";
}

const FollowSection: React.FC<FollowSectionProps> = ({
  followError = null,
  onShowFollowers,
  onShowFollowing,
  onShowRelays,
  onShowNotes,
  showMeta,
  onToggleMeta,
  currentRoute = "notes",
}) => {
  // Helper function to get button style with active state
  const getButtonStyle = (routeName: string) => {
    const baseStyle = getContactButtonStyle();
    const isActive = currentRoute === routeName;
    const isMuteListActive = currentRoute === "mute-list";

    // If mute list is active, don't show any button as active
    if (isMuteListActive) {
      return baseStyle;
    }

    if (isActive) {
      return {
        ...baseStyle,
        border: "1px solid var(--accent-color)", // Accent border
        color: "var(--accent-color)", // Accent text color
        fontWeight: "bold" as const,
        filter: "var(--accent-glow-filter)", // Glow effect like SVG icons
        transition: "all 0.2s ease",
      };
    }

    return baseStyle;
  };
  return (
    <>
      <div
        style={{
          gridColumn: "2 / 3",
          gridRow: "3 / 4",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
        }}
      >
        {/* Meta toggle button */}
        <button
          onClick={onToggleMeta}
          style={{
            ...getContactButtonStyle(),
            ...(showMeta && {
              border: "1px solid var(--accent-color)", // Accent border
              color: "var(--accent-color)", // Accent text color
              fontWeight: "bold" as const,
              filter: "var(--accent-glow-filter)", // Glow effect like SVG icons
              transition: "all 0.2s ease",
            }),
            opacity: 1,
          }}
          title={showMeta ? "Hide profile fields" : "Show profile fields"}
        >
          Meta{" "}
          {showMeta ? (
            // Down caret SVG
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              style={{
                display: "inline",
                verticalAlign: "middle",
                marginLeft: 2,
              }}
              aria-label="Hide meta"
            >
              <polyline
                points="3,5 7,9 11,5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            // Right caret SVG
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              style={{
                display: "inline",
                verticalAlign: "middle",
                marginLeft: 2,
              }}
              aria-label="Show meta"
            >
              <polyline
                points="5,3 9,7 5,11"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>

        {/* Notes button (navigates to notes route) */}
        {onShowNotes && (
          <button
            onClick={onShowNotes}
            style={getButtonStyle("notes")}
            title="View notes"
          >
            Notes
          </button>
        )}

        {/* Followers button */}
        <button
          onClick={onShowFollowers}
          style={getButtonStyle("followers")}
          title="View followers"
        >
          Followers
        </button>

        {/* Following button */}
        <button
          onClick={onShowFollowing}
          style={getButtonStyle("following")}
          title="View following"
        >
          Following
        </button>

        {/* Relays button */}
        <button
          onClick={onShowRelays}
          style={getButtonStyle("relays")}
          title="View relays used by this user"
        >
          Relays
        </button>
      </div>

      {/* Follow error */}
      {followError && (
        <div
          style={{
            color: "var(--btn-accent)",

            fontSize: "0.75rem",
            marginTop: "0.25rem",
            textAlign: "left",
          }}
        >
          {followError}
        </div>
      )}
    </>
  );
};

export default FollowSection;
