import React, { useContext, useCallback } from "react";
import { NostrContext } from "../../contexts/NostrContext";
import { useRelayManager } from "../../hooks/useRelayManager";
import { useReactionCountsQuery } from "../../hooks/useReactionCountsQuery";
import { useReactionMutation } from "../../hooks/useReactionMutation";
import { getGlobalRelayPool } from "../../utils/nostr/relayConnectionPool";
import { DEFAULT_RELAY_URLS } from "../../utils/nostr/constants";
import type { Note } from "../../types/nostr/types";
import { useModalContext } from "../../contexts/ModalContext";
import { useAuthenticationCheck } from "../../hooks/useAuthenticationCheck";

export interface LikeButtonProps {
  note: Note;
  relayUrls: string[];
  size?: "sm" | "md";
}

export const LikeButton: React.FC<LikeButtonProps> = ({
  note,
  relayUrls,
  size = "md",
}) => {
  // Get NostrContext for user pubkey and nostr client
  const { nostrClient, pubkey: myPubkey } = useContext(NostrContext);

  // Get relay manager for write relays and permissions
  const { writeRelays, relayPermissions } = useRelayManager({
    nostrClient,
    initialRelays: DEFAULT_RELAY_URLS,
    pubkeyHex: myPubkey,
  });

  const isDarkMode =
    document.documentElement.getAttribute("data-theme") === "dark";

  // Get reaction counts for this note
  const pool = getGlobalRelayPool().getPool();
  const { data } = useReactionCountsQuery(note.id, relayUrls, pool, myPubkey);

  // Get reaction mutation for publishing likes
  const { publishReaction, isPending: isSendingReaction } =
    useReactionMutation(myPubkey);

  // Extract values from data with defaults
  const hasLikedByMe = data?.hasLikedByMe ?? false;

  // Authentication check
  const { isAuthenticatedForSigning, needsUnlock } = useAuthenticationCheck();
  const modalContext = useModalContext();

  // Perform like action
  const performLike = useCallback(async () => {
    if (!nostrClient || !note.id) return;

    const publishRelays = writeRelays.length > 0 ? writeRelays : relayUrls;

    try {
      await publishReaction({
        pool: nostrClient,
        relayUrls: publishRelays,
        target: {
          id: note.id,
          pubkey: note.pubkey,
          kind: 1,
          tags: note.tags as any,
        },
        content: "+",
        relayHint: publishRelays[0],
        relayPermissions,
      });
    } catch (error) {
      console.error("Failed to publish reaction:", error);
    }
  }, [
    nostrClient,
    note.id,
    note.pubkey,
    note.tags,
    writeRelays,
    relayUrls,
    publishReaction,
    relayPermissions,
  ]);

  // Handle like button click with authentication check
  const handleLike = useCallback(async () => {
    // Check if user is authenticated
    if (!isAuthenticatedForSigning) {
      modalContext.requireLogin(async () => {
        await performLike();
      }, "like");
      return;
    }

    // Check if user needs to unlock their key
    if (needsUnlock) {
      modalContext.showUnlockModal("Like", performLike);
      return;
    }

    // User is authenticated, perform the like
    await performLike();
  }, [isAuthenticatedForSigning, needsUnlock, performLike, modalContext]);

  const iconSize = size === "sm" ? 12 : 14;
  const fontSize = size === "sm" ? "0.75rem" : "0.875rem";

  return (
    <>
      <button
        onClick={handleLike}
        disabled={isSendingReaction}
        title={
          isSendingReaction ? "Sending…" : hasLikedByMe ? "Unlike" : "Like"
        }
        style={{
          minWidth: "25px",
          background: "transparent",
          border: "none",
          cursor: isSendingReaction ? "not-allowed" : "pointer",
          padding: "0.25rem",
          display: "flex",
          alignItems: "center",
          gap: "0.25rem",
          opacity: isSendingReaction ? 0.6 : 1,
          color: "var(--text-color)",
          fontSize,
          fontWeight: hasLikedByMe ? "bold" : "normal",
        }}
      >
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill={
            hasLikedByMe
              ? isDarkMode
                ? "var(--accent-color)"
                : "var(--ibm-mustard)"
              : isDarkMode
                ? "var(--text-color)"
                : "var(--ibm-pewter)"
          }
          stroke="none"
        >
          <polygon points="12,2 22,20 2,20" />
        </svg>
      </button>

      {/* All modals are now rendered globally in MainLayout */}
    </>
  );
};
