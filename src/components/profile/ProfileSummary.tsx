import React, { useState, useContext, useEffect, useCallback } from "react";
import type { Metadata, RelayPermission } from "../../types/nostr/types";
import AsciiRendererV2 from "../AsciiRendererV2";
import { formatTruncated, getInitialChar } from "../../utils/profileUtils";
import LoadingTextPlaceholder from "../ui/LoadingTextPlaceholder";
import MuteConfirmationModal from "../MuteConfirmationModal";
import { NostrContext } from "../../contexts/NostrContext";
import { hasNip07, hasInMemorySecretKey } from "../../utils/nostr/nip07";
import { useMuteList } from "../../hooks/useMuteList";

interface ProfileSummaryProps {
  pubkeyHex: string | null;
  npubBech32: string | null;
  metadata: Metadata | null;
  displayTitle: string;
  useAscii: boolean;
  useColor: boolean;
  getDisplayNameForPubkey: (pubkey: string) => string;
  relayUrls?: string[];
  relayPermissions?: Map<string, RelayPermission>;
  onShowUnlockKey?: (actionLabel?: string, action?: "follow" | "mute") => void;
  isSelf?: boolean;
  onShowMuteList?: () => void;
  currentRoute?: "notes" | "followers" | "following" | "relays" | "mute-list";
  triggerMuteModalAfterUnlock?: boolean;
  onClearTriggerMuteModal?: () => void;
}

const ProfileSummary: React.FC<ProfileSummaryProps> = ({
  pubkeyHex,
  npubBech32,
  metadata,
  displayTitle,
  useAscii,
  useColor,
  getDisplayNameForPubkey,
  relayUrls = [],
  relayPermissions,
  onShowUnlockKey,
  isSelf,
  onShowMuteList,
  currentRoute,
  triggerMuteModalAfterUnlock,
  onClearTriggerMuteModal,
}) => {
  const { pubkey: currentUserPubkey } = useContext(NostrContext);
  const [avatarError, setAvatarError] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [showMuteModal, setShowMuteModal] = useState<boolean>(false);
  const [immediateMutedState, setImmediateMutedState] = useState<
    boolean | null
  >(null);

  // Get the current user's mute list
  const { isUserMuted } = useMuteList(relayUrls);

  // Handle trigger to show mute modal after unlock
  useEffect(() => {
    if (triggerMuteModalAfterUnlock && onClearTriggerMuteModal) {
      setShowMuteModal(true);
      onClearTriggerMuteModal();
    }
  }, [triggerMuteModalAfterUnlock, onClearTriggerMuteModal]);

  // Handle immediate mute state change
  const handleMuteActionConfirmed = useCallback((newMutedState: boolean) => {
    setImmediateMutedState(newMutedState);
  }, []);

  const truncatedNpub = npubBech32 ? formatTruncated(npubBech32) : "";
  const computedDisplay =
    (metadata && ((metadata as any).display_name || metadata.name)) ||
    (pubkeyHex ? getDisplayNameForPubkey(pubkeyHex) : "");

  const initialChar = getInitialChar(computedDisplay, npubBech32 || "");

  // Check if current user can mute (signed in and not trying to mute themselves)
  const canMute =
    currentUserPubkey &&
    pubkeyHex &&
    currentUserPubkey !== pubkeyHex &&
    (hasNip07() || hasInMemorySecretKey() !== null); // Show button for nsec users even if locked

  // Check if the current profile is already muted
  const serverMutedState = pubkeyHex ? isUserMuted(pubkeyHex) : false;
  const isMuted =
    immediateMutedState !== null ? immediateMutedState : serverMutedState;

  // Reset immediate state when server state changes (e.g., after refetch)
  useEffect(() => {
    if (
      immediateMutedState !== null &&
      immediateMutedState === serverMutedState
    ) {
      setImmediateMutedState(null);
    }
  }, [serverMutedState, immediateMutedState]);

  const handleCopyNpub = () => {
    if (npubBech32) {
      navigator.clipboard.writeText(npubBech32);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  };

  const handleMuteClick = () => {
    if (!currentUserPubkey) {
      // User not signed in
      return;
    }

    // Check if user has nsec key but it's locked
    if (!hasNip07() && hasInMemorySecretKey() === false) {
      if (onShowUnlockKey) {
        onShowUnlockKey(isMuted ? "Unmute" : "Mute", "mute");
      }
      return;
    }

    // Check if user can actually mute (has unlocked key or NIP-07)
    if (!hasNip07() && hasInMemorySecretKey() !== true) {
      // User has no signing capability
      return;
    }

    setShowMuteModal(true);
  };

  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "48px 1fr",
          gridTemplateRows: "auto auto auto",
          columnGap: "0.75rem",
          paddingBottom: "0.5rem",
          alignItems: "center",
          marginLeft: "calc(2rem - 24px)",
          marginBottom: "0.5rem",

          textAlign: "left",
        }}
      >
        {/* Avatar */}
        <div
          style={{
            gridColumn: "1 / 2",
            gridRow: "1 / span 2",
            width: "48px",
            height: "48px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              border: "1px dotted var(--border-color)",
              background: "var(--app-bg-color)",

              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            {metadata?.picture && !avatarError ? (
              useAscii ? (
                <AsciiRendererV2
                  key={`avatar-${pubkeyHex}`}
                  src={metadata.picture}
                  type="image"
                  useColor={useColor}
                  onAsciiRendered={() => {}}
                  onError={() => {
                    setAvatarError(true);
                  }}
                  cachedAscii={undefined as any}
                />
              ) : (
                <img
                  src={metadata.picture}
                  alt="avatar"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                  }}
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                  onError={() => {
                    setAvatarError(true);
                  }}
                />
              )
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  color: "var(--text-color)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",

                  fontSize: "1rem",
                }}
              >
                {initialChar}
              </div>
            )}
          </div>
        </div>

        {/* Display Name */}
        <div
          style={{
            gridColumn: "2 / 3",
            gridRow: "1 / 2",
            color: "var(--text-color)",

            overflowWrap: "break-word",
            wordBreak: "break-word",
            whiteSpace: "normal",
            textAlign: "start",
            fontSize: "0.875rem",
            fontWeight: 700,
          }}
        >
          {computedDisplay || displayTitle || (
            <LoadingTextPlaceholder type="displayName" />
          )}
        </div>

        {/* NPub with copy and mute buttons */}
        {npubBech32 && (
          <div
            style={{
              gridColumn: "2 / 3",
              gridRow: "2 / 3",
              display: "flex",
              alignItems: "center",
              gap: "0.25rem",
              minWidth: 0, // Allow flex items to shrink below their content size
            }}
          >
            <span
              style={{
                color: "var(--app-text-secondary)",
                fontSize: "0.75rem",
                flexShrink: 1, // Allow npub text to shrink
                minWidth: 0, // Allow text to shrink below content size
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {truncatedNpub || <LoadingTextPlaceholder type="npub" />}
            </span>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "1rem",
                flexShrink: 0, // Prevent buttons from shrinking
              }}
            >
              <button
                onClick={handleCopyNpub}
                style={{
                  minHeight: "1rem",
                  backgroundColor: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  display: "flex",
                  minWidth: "16px",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                title={copied ? "Copied!" : "Copy npub"}
              >
                {copied ? (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--text-color)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--text-color)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
              </button>

              {/* Mute button or Mute List button for self */}
              {isSelf ? (
                <button
                  onClick={onShowMuteList || (() => {})}
                  style={{
                    minHeight: "1rem",
                    height: "14px",
                    backgroundColor: "transparent",
                    border:
                      currentRoute === "mute-list"
                        ? "1px solid #f97316"
                        : "1px dotted var(--border-color)",
                    padding: "0.25rem 0.5rem",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.75rem",
                    color:
                      currentRoute === "mute-list"
                        ? "#f97316"
                        : "var(--text-color)",
                    textTransform: "uppercase",
                    whiteSpace: "nowrap",
                    fontWeight:
                      currentRoute === "mute-list" ? "bold" : "normal",
                    filter:
                      currentRoute === "mute-list"
                        ? "drop-shadow(0 0 4px rgba(249, 115, 22, 0.5))"
                        : "none",
                    transition: "all 0.2s ease",
                  }}
                  title="View your mute list"
                >
                  Mute List
                </button>
              ) : (
                canMute && (
                  <button
                    onClick={handleMuteClick}
                    style={{
                      minHeight: "1rem",
                      backgroundColor: "transparent",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      display: "flex",
                      minWidth: "16px",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    title={isMuted ? "User is muted" : "Mute user"}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={isMuted ? "#f97316" : "var(--text-color)"}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  </button>
                )
              )}
            </div>
          </div>
        )}
      </div>

      {/* Mute Confirmation Modal */}
      {showMuteModal && pubkeyHex && npubBech32 && (
        <MuteConfirmationModal
          isOpen={showMuteModal}
          onClose={() => setShowMuteModal(false)}
          pubkeyToMute={pubkeyHex}
          npubToMute={npubBech32}
          displayName={computedDisplay || displayTitle}
          metadata={metadata ? { [pubkeyHex]: metadata } : {}}
          relayUrls={relayUrls}
          relayPermissions={relayPermissions}
          onShowUnlockKey={onShowUnlockKey || (() => {})}
          isCurrentlyMuted={isMuted}
          onActionConfirmed={handleMuteActionConfirmed}
        />
      )}
    </>
  );
};

export default ProfileSummary;
