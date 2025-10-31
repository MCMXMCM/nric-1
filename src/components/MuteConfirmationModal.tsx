import React, { useState, useCallback, useContext } from "react";
import { NostrContext } from "../contexts/NostrContext";
import { hasNip07, hasInMemorySecretKey } from "../utils/nostr/nip07";
import {
  publishMuteList,
  publishUnmuteList,
  fetchUserMuteList,
} from "../utils/nostr/publish";
import type { Metadata, RelayPermission } from "../types/nostr/types";

interface MuteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  pubkeyToMute: string;
  npubToMute: string;
  displayName: string;
  metadata: Record<string, Metadata>;
  relayUrls: string[];
  relayPermissions?: Map<string, RelayPermission>;
  onShowUnlockKey: (actionLabel?: string) => void;
  isCurrentlyMuted: boolean;
  onActionConfirmed?: (newMutedState: boolean) => void;
}

const MuteConfirmationModal: React.FC<MuteConfirmationModalProps> = ({
  isOpen,
  onClose,
  pubkeyToMute,
  npubToMute,
  displayName,
  metadata,
  relayUrls,
  relayPermissions,
  onShowUnlockKey,
  isCurrentlyMuted,
  onActionConfirmed,
}) => {
  const { nostrClient, pubkey, loginMethod } = useContext(NostrContext);
  const [isMuting, setIsMuting] = useState(false);
  const [error, setError] = useState<string>("");

  const canSign = hasNip07() || hasInMemorySecretKey();
  const isNsecSession = loginMethod === "nsec";
  const isUnlocked = hasInMemorySecretKey();

  const handleMuteAction = useCallback(async () => {
    if (!nostrClient || !pubkey) {
      setError("You must be signed in to mute users");
      return;
    }

    if (!canSign) {
      setError("You must be signed in to mute users");
      return;
    }

    if (isNsecSession && !isUnlocked) {
      onShowUnlockKey(isCurrentlyMuted ? "Unmute" : "Mute");
      return;
    }

    try {
      setIsMuting(true);
      setError("");

      // Immediately notify parent of the state change for instant visual feedback
      if (onActionConfirmed) {
        onActionConfirmed(!isCurrentlyMuted);
      }

      if (isCurrentlyMuted) {
        // Unmute the user
        const currentMuteList = await fetchUserMuteList({
          pool: nostrClient,
          relayUrls,
          userPubkey: pubkey,
        });

        await publishUnmuteList({
          pool: nostrClient,
          relayUrls,
          relayPermissions,
          pubkeyToUnmute: pubkeyToMute,
          existingMutedPubkeys: currentMuteList,
        });
      } else {
        // Mute the user
        await publishMuteList({
          pool: nostrClient,
          relayUrls,
          relayPermissions,
          pubkeyToMute,
        });
      }

      onClose();
    } catch (err: any) {
      const action = isCurrentlyMuted ? "unmute" : "mute";
      const msg = err?.message || `Failed to ${action} user`;
      setError(msg);

      // Check if this is a signing error and we have saved accounts
      if (
        msg.includes("No signing method available") &&
        !hasNip07() &&
        !hasInMemorySecretKey() &&
        pubkey
      ) {
        onShowUnlockKey(isCurrentlyMuted ? "Unmute" : "Mute");
      }
    } finally {
      setIsMuting(false);
    }
  }, [
    nostrClient,
    pubkey,
    canSign,
    isNsecSession,
    isUnlocked,
    relayUrls,
    relayPermissions,
    pubkeyToMute,
    onClose,
    onShowUnlockKey,
    isCurrentlyMuted,
    onActionConfirmed,
  ]);

  if (!isOpen) return null;

  const targetMetadata = metadata[pubkeyToMute];
  const targetPicture = targetMetadata?.picture;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 10000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "var(--app-bg-color)",
          padding: "1.5rem",
          width: "100%",
          maxWidth: "480px",
          border: "1px dotted var(--border-color)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          style={{
            margin: 0,
            color: "var(--text-color)",
            fontSize: "1.125rem",
            fontWeight: 600,
          }}
        >
          {isCurrentlyMuted ? "Unmute User" : "Mute User"}
        </h3>

        <p
          style={{
            marginTop: "0.75rem",
            color: "var(--text-color)",
            opacity: 0.8,
            fontSize: "0.875rem",
            lineHeight: 1.5,
          }}
        >
          {isCurrentlyMuted
            ? "Are you sure you want to unmute this user? You will start seeing their posts in your feed again."
            : "Are you sure you want to mute this user? You won't see their posts in your feed anymore."}
        </p>

        {/* User info */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            marginTop: "1rem",
            padding: "0.75rem",
            border: "1px dotted var(--border-color)",
            borderRadius: "0",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              border: "1px dotted var(--border-color)",
              backgroundColor: "var(--app-bg-color )",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            {targetPicture ? (
              <img
                src={targetPicture}
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
              />
            ) : (
              <span
                style={{
                  color: "var(--text-color)",
                  fontSize: "1rem",
                }}
              >
                {displayName?.slice(0, 1) || "👤"}
              </span>
            )}
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              minWidth: 0,
            }}
          >
            <span
              style={{
                color: "var(--text-color)",
                fontSize: "0.875rem",
                fontWeight: 600,
                textAlign: "start",
              }}
            >
              {displayName}
            </span>
            <span
              style={{
                color: "var(--text-color)",
                opacity: 0.8,
                fontSize: "0.75rem",
                wordBreak: "break-all",
                overflowWrap: "anywhere",
                whiteSpace: "normal",
                textAlign: "start",
              }}
            >
              {npubToMute}
            </span>
          </div>
        </div>

        {error && (
          <div
            style={{
              color: "#ef4444",
              fontSize: "0.75rem",
              marginTop: "0.75rem",
              padding: "0.5rem",
              border: "1px solid #ef4444",
              borderRadius: "0",
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "0.5rem",
            marginTop: "1.5rem",
          }}
        >
          <button
            onClick={onClose}
            disabled={isMuting}
            style={{
              backgroundColor: "transparent",
              color: "var(--text-color)",
              border: "1px dotted var(--border-color)",
              fontSize: "0.75rem",
              textTransform: "uppercase",
              padding: "0 0.75rem",
              height: "2rem",
              cursor: isMuting ? "not-allowed" : "pointer",
              opacity: isMuting ? 0.5 : 1,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleMuteAction}
            disabled={isMuting || !canSign}
            style={{
              backgroundColor: "#ef4444",
              color: "white",
              border: "none",
              fontSize: "0.75rem",
              textTransform: "uppercase",
              padding: "0 0.75rem",
              height: "2rem",
              cursor: isMuting || !canSign ? "not-allowed" : "pointer",
              opacity: isMuting || !canSign ? 0.5 : 1,
            }}
          >
            {isMuting
              ? isCurrentlyMuted
                ? "Unmuting..."
                : "Muting..."
              : isCurrentlyMuted
              ? "Unmute User"
              : "Mute User"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MuteConfirmationModal;
