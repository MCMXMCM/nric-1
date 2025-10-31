import React from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { navigateBackOrHome, navigateHome } from "../../utils/modalUrlState";
import { getSmallButtonStyle } from "./profileStyles";

interface ProfileHeaderProps {
  displayTitle: string;
  npubBech32: string | null;
  isMobile: boolean;
  showEdit?: boolean;
  onEditClick?: () => void;
  isEditModalOpen?: boolean;
  onBackClick?: () => void;
  onSaveClick?: () => void;
  isSaving?: boolean;
  isFollowing?: boolean;
  isFollowBusy?: boolean;
  onToggleFollow?: () => void;
}

const ProfileHeader: React.FC<ProfileHeaderProps> = ({
  displayTitle,
  npubBech32,
  isMobile,
  showEdit = false,
  onEditClick,
  isEditModalOpen = false,
  onBackClick,
  onSaveClick,
  isSaving = false,
  isFollowing = false,
  isFollowBusy = false,
  onToggleFollow,
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleBack = () => {
    // If a custom back handler is provided, use it
    if (onBackClick) {
      onBackClick();
      return;
    }

    // Default: pop history or go home if first entry/external
    navigateBackOrHome(navigate, location);
  };

  const handleShare = () => {
    if (!npubBech32) return;
    const shareUrl = `${window.location.origin}/npub/${encodeURIComponent(
      npubBech32
    )}`;
    if (navigator.share) {
      navigator
        .share({
          title: displayTitle
            ? `${displayTitle}'s Nostr Profile`
            : "Nostr Profile",
          url: shareUrl,
        })
        .catch(() => {});
    } else {
      navigator.clipboard.writeText(shareUrl).catch(() => {});
    }
  };

  const handleSave = () => {
    if (onSaveClick) {
      onSaveClick();
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
        // padding: isMobile ? "0.5rem 1rem" : "0.5rem 1rem",
        backgroundColor: "var(--profile-header-bg)",

        position: "relative",
      }}
    >
      <div
        style={{
          backgroundColor: "transparent",
          border: "none",
          cursor: "pointer",
          color: "var(--note-view-header-text-color)",

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
            color: "var(--note-view-header-text-color)",
            fontSize: "0.875rem",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            display: "inline-block",
            maxWidth: isMobile ? "45vw" : undefined,
            whiteSpace: isMobile ? "nowrap" : undefined,
            overflow: isMobile ? "hidden" : undefined,
            textOverflow: isMobile ? "ellipsis" : undefined,
          }}
        >
          {displayTitle}
        </span>
      </div>
      <div style={{ marginLeft: "auto", display: "flex", gap: "0.5rem" }}>
        {isEditModalOpen ? (
          <>
            <button
              onClick={handleBack}
              style={{
                ...getSmallButtonStyle(),
                color: isEditModalOpen
                  ? "var(--accent-color)"
                  : "var(--app-text-secondary)",
              }}
              title={isEditModalOpen ? "Close edit mode" : "Edit profile"}
              onMouseEnter={(e) => {
                if (!isEditModalOpen) {
                  e.currentTarget.style.color = "var(--app-text-secondary)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = isEditModalOpen
                  ? "#f97316"
                  : "#64748b";
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              style={{
                ...getSmallButtonStyle(),
                color: isSaving
                  ? "var(--app-text-secondary)"
                  : "var(--text-color)",
                opacity: isSaving ? 0.6 : 1,
              }}
              title={isSaving ? "Saving..." : "Save profile"}
              onMouseEnter={(e) => {
                if (!isSaving) {
                  e.currentTarget.style.color = "#34d399";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = isSaving
                  ? "var(--app-text-secondary)"
                  : "var(--accent-color)";
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17,21 17,13 7,13 7,21" />
                <polyline points="7,3 7,8 15,8" />
              </svg>
            </button>
          </>
        ) : (
          <>
            {showEdit ? (
              <button
                onClick={onEditClick}
                style={{
                  ...getSmallButtonStyle(),
                  color: "var(--note-view-header-text-color)",
                }}
                title={isEditModalOpen ? "Close edit mode" : "Edit profile"}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </button>
            ) : (
              <button
                onClick={onToggleFollow}
                disabled={isFollowBusy}
                style={{
                  ...getSmallButtonStyle(),
                  color: "var(--note-view-header-text-color)",
                  opacity: isFollowBusy ? 0.6 : 1,
                }}
                title={isFollowing ? "Unfollow" : "Follow"}
              >
                {isFollowing ? (
                  // Unfollow icon: person with X
                  <svg
                    width="25"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                    <path d="M-3 7l6 6m0-6l-6 6" />
                  </svg>
                ) : (
                  // Follow icon: person with plus sign
                  <svg
                    width="25"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                    <path d="M-5 9h10m-5-4v10" />
                  </svg>
                )}
              </button>
            )}
            <button
              onClick={handleShare}
              title="Share profile"
              style={{
                ...getSmallButtonStyle(),
                color: "var(--note-view-header-text-color)",
              }}
            >
              <svg
                width="16"
                height="16"
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
          </>
        )}
      </div>
    </div>
  );
};

export default ProfileHeader;
