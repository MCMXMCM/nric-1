import React from "react";
import { nip19 } from "nostr-tools";
import { useNavigate, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import LoadingTextPlaceholder from "../ui/LoadingTextPlaceholder";
import { formatRelativeTime } from "../../utils/nostr/utils";
import { useUIStore } from "../lib/useUIStore";

export interface DesktopNoteHeaderProps {
  // Note data
  noteId: string;
  noteCreatedAt: number;
  note?: any; // Add note prop to pass cached note data

  // Display data
  displayUserNameOrNpub: string | null;
  isDisplayNameLoading: boolean;
  npubForLinks: string;
  index?: number; // For navigation context

  // Parent indicators
  hasParent: boolean;
  parentNoteId?: string;

  // Parent note data for reply context
  parentDisplayName?: string | null;
  isParentDisplayNameLoading?: boolean;
  parentNpubForLinks?: string;
  parentNoteNotFound?: boolean;

  // Repost target data for repost context
  hasRepostTarget?: boolean;
  repostTargetId?: string;
  repostTargetDisplayName?: string | null;
  isRepostTargetDisplayNameLoading?: boolean;
  repostTargetNpubForLinks?: string;

  // Navigation helpers
  prefetchRoute: (path: string) => void;
  prefetchNote: (noteId: string) => Promise<void>;
  goToNote: () => void;

  // Feed state (removed unused parameters)

  // Actions
  openRepost: () => void;
  openReply: () => void;
  handleLike: () => void;

  // Interaction states
  likes: number;
  hasLikedByMe: boolean;
  isReactionsLoading: boolean;
  isSendingReaction: boolean;
  hasZappedByMe: boolean;
  actionError: string | null;

  // Zap related
  noteAuthorPubkey: string;
  readRelayUrls: string[];
  getDisplayNameForPubkey: (pubkey: string) => string;
  setShowZapModal?: (show: boolean) => void;

  // Reply count for thread button
  replyCount?: number;

  // Zap count in sats
  zapCount?: number;

  // Note kind information
  noteKind?: string;
  targetNoteId?: string;

  // Article address for NIP-23 articles
  articleNaddr?: string | null;

  // Bookmark related
  isBookmarked?: boolean;
  toggleBookmark?: () => void;
}

export const DesktopNoteHeader: React.FC<DesktopNoteHeaderProps> = ({
  noteId,
  noteCreatedAt,
  note,
  displayUserNameOrNpub,
  isDisplayNameLoading,
  npubForLinks,
  index,
  prefetchRoute,
  goToNote,
  openRepost,
  openReply,
  handleLike,
  likes,
  hasLikedByMe,
  isSendingReaction,
  hasZappedByMe,
  actionError,
  setShowZapModal,
  replyCount = 0,
  zapCount = 0,
  noteKind = "note",
  targetNoteId,
  parentNoteId,
  articleNaddr,
  isBookmarked = false,
  toggleBookmark,
}) => {
  const navigate = useNavigate();
  const isDarkMode = useUIStore((state) => state.isDarkMode);

  // Zap button handler - uses same logic as ZapButton but with desktop styling
  const handleZapClick = () => {
    // If we have navigation context (index is provided), navigate to note page with zap modal
    if (typeof index === "number") {
      try {
        const encodedId = nip19.noteEncode(noteId);
        navigate({
          to: `/note/${encodedId}`,
          search: { zap: noteId, reply: "", repost: "", thread: "" },
          state: true,
        });
      } catch (error) {
        // Fallback to direct modal opening if encoding fails
        setShowZapModal?.(true);
      }
    } else {
      // Fallback to old behavior for backward compatibility
      setShowZapModal?.(true);
    }
  };

  // Elevated rubber button component for industrial control panel
  const ElevatedButton: React.FC<{
    onClick: () => void;
    title: string;
    disabled?: boolean;
    isActive?: boolean;
  }> = ({ onClick, title, disabled = false, isActive = false }) => (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      title={title}
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{
        scale: disabled ? 1 : 0.95,
        y: disabled ? 0 : 1,
      }}
      transition={{
        type: "spring",
        stiffness: 400,
        damping: 25,
      }}
      style={{
        width: "14px",
        height: "14px",
        borderRadius: "50%",
        border: isDarkMode ? "1px solid #333" : "1px solid #555",
        backgroundColor: isDarkMode ? "var(--ibm-cream)" : "#666", // Darker color for light mode
        cursor: disabled ? "not-allowed" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: isActive
          ? isDarkMode
            ? "inset 0 1px 2px rgba(0,0,0,0.5), inset 0 0.5px 1px rgba(0,0,0,0.3)"
            : "inset 0 2px 4px rgba(0,0,0,0.3), inset 0 1px 2px rgba(0,0,0,0.2)"
          : isDarkMode
            ? "0 1px 2px rgba(0,0,0,0.6), 0 0.5px 1px rgba(0,0,0,0.4), inset 0 0.5px 0 rgba(255,255,255,0.1)"
            : "0 2px 4px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.1)",
        transition: "all 0.1s ease",
        padding: 0,
        opacity: disabled ? 0.6 : 1,
        minWidth: "14px",
        minHeight: "14px",
        maxWidth: "14px",
        maxHeight: "14px",
      }}
    />
  );

  return (
    <div
      className="note-header"
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        padding: "0",
        // borderTop: "1px solid var(--border-color)",

        color: "#333",
        fontSize: "0.9rem",
        position: "relative",
        // backgroundColor: "#f5f5dc", // Cream background
        // backgroundColor: isDarkMode
        //   ? "var(--app-secondary-bg-color)"
        //   : "#ffffff",
        // border: "1px solid #333",
        borderRadius: "2px",
        // margin: "0.25rem 0",
        fontFamily: "monospace",
      }}
    >
      {/* Row 1: Labels */}
      <div
        style={{
          display: "grid",
          borderTop: "1px solid var(--border-color)",
          borderLeft: "1px solid var(--border-color)",
          borderRight: "1px solid var(--border-color)",
          gridTemplateColumns:
            "28% 12% 8.57% 8.57% 8.57% 8.57% 8.57% 8.57% 8.57% 8.57%",
          width: "100%",
          height: "24px",
          fontSize: "0.75rem",
          // fontWeight: "600",
          color: isDarkMode ? "var(--ibm-cream)" : "var(--text-color)",
          backgroundColor: isDarkMode
            ? "var(--app-bg-color)"
            : "rgba(217, 206, 174, 0.8)",

          textTransform: "uppercase",
          letterSpacing: "0.5px",
          borderBottom: "1px solid var(--border-color)",
          alignItems: "center",
        }}
      >
        <div
          style={{
            textAlign: "center",
            borderRight: "1px solid var(--border-color)",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            paddingLeft: "8px",
          }}
        >
          DISPLAY NAME
        </div>
        <div
          style={{
            textAlign: "center",
            borderRight: "1px solid var(--border-color)",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          KIND
        </div>
        <div
          style={{
            textAlign: "center",
            borderRight: "1px solid var(--border-color)",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          CREATED
        </div>
        <div
          style={{
            textAlign: "center",
            borderRight: "1px solid var(--border-color)",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          LINK
        </div>
        <div
          style={{
            textAlign: "center",
            borderRight: "1px solid var(--border-color)",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          BOOKMARK
        </div>
        <div
          style={{
            textAlign: "center",
            borderRight: "1px solid var(--border-color)",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          THREAD
        </div>
        <div
          style={{
            textAlign: "center",
            borderRight: "1px solid var(--border-color)",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          REPOST
        </div>
        <div
          style={{
            textAlign: "center",
            borderRight: "1px solid var(--border-color)",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ZAP
        </div>
        <div
          style={{
            textAlign: "center",
            borderRight: "1px solid var(--border-color)",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          REPLY
        </div>
        <div
          style={{
            textAlign: "center",
            // borderRight: "1px solid #333",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          LIKE
        </div>
      </div>

      {/* Row 2: Numbers */}
      <div
        style={{
          display: "grid",
          borderLeft: "1px solid var(--border-color)",
          borderRight: "1px solid var(--border-color)",
          gridTemplateColumns:
            "28% 12% 8.57% 8.57% 8.57% 8.57% 8.57% 8.57% 8.57% 8.57%",
          width: "100%",
          height: "24px",
          alignItems: "center",
          // backgroundColor: isDarkMode
          //   ? "var(--app-secondary-bg-color)"
          //   : "#ffffff",
          borderBottom: "1px solid var(--border-color)",
          fontSize: "0.75rem",
          backgroundColor: isDarkMode ? "var(--ibm-dark-gray)" : "#ffffff",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}
      >
        {/* Display name - center aligned */}
        <div
          style={{
            // borderLeft: "1px solid var(--border-color)",
            borderRight: "1px solid var(--border-color)",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            paddingLeft: "8px",

            color: isDarkMode ? "var(--ibm-cream)" : "var(--text-color)",
          }}
        >
          <Link
            to="/npub/$npubId"
            params={{ npubId: npubForLinks }}
            onMouseEnter={() => prefetchRoute(`/npub/${npubForLinks}`)}
            style={{
              color: isDarkMode ? "var(--ibm-cream)" : "var(--text-color)",
              textDecoration: "none",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: "0.9rem",
              fontWeight: "500",
            }}
          >
            {isDisplayNameLoading ? (
              <LoadingTextPlaceholder type="displayName" speed="fast" />
            ) : (
              displayUserNameOrNpub || "Unknown"
            )}
          </Link>
        </div>
        {/* Kind column */}
        <div
          style={{
            borderRight: "1px solid var(--border-color)",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: isDarkMode ? "var(--ibm-cream)" : "var(--text-color)",
            fontSize: "0.8rem",
            fontWeight: "500",
            textTransform: "uppercase",
            textAlign: "center",
          }}
        >
          {noteKind}
        </div>
        {/* Created column - relative time */}
        <div
          style={{
            textAlign: "center",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRight: "1px solid var(--border-color)",

            color: isDarkMode ? "var(--ibm-cream)" : "var(--text-color)",
            fontSize: "0.75rem",
          }}
        >
          {formatRelativeTime(noteCreatedAt || 0)}
        </div>

        {/* Link column - empty */}
        <div
          style={{
            textAlign: "center",
            borderRight: "1px solid var(--border-color)",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",

            color: isDarkMode ? "var(--ibm-cream)" : "var(--text-color)",
          }}
        ></div>

        {/* Bookmark column - bookmark state */}
        <div
          style={{
            textAlign: "center",
            borderRight: "1px solid var(--border-color)",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",

            color: isDarkMode ? "var(--ibm-cream)" : "var(--text-color)",
            fontSize: "0.75rem",
            fontWeight: "500",
          }}
        >
          {isBookmarked ? "true" : "false"}
        </div>

        {/* Thread column - reply count */}
        <div
          style={{
            textAlign: "center",
            borderRight: "1px solid var(--border-color)",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",

            color: isDarkMode ? "var(--ibm-cream)" : "var(--text-color)",
            fontSize: "0.75rem",
          }}
        >
          {replyCount || 0} {replyCount === 1 ? "reply" : "replies"}
        </div>

        {/* Repost column - empty */}
        <div
          style={{
            textAlign: "center",
            borderRight: "1px solid var(--border-color)",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",

            color: isDarkMode ? "var(--ibm-cream)" : "var(--text-color)",
          }}
        ></div>

        {/* Zap column - zap count */}
        <div
          style={{
            textAlign: "center",
            borderRight: "1px solid var(--border-color)",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",

            color: isDarkMode ? "var(--ibm-cream)" : "var(--text-color)",
            fontSize: "0.75rem",
          }}
        >
          {zapCount || 0} sats
        </div>

        {/* Reply column - empty */}
        <div
          style={{
            textAlign: "center",
            borderRight: "1px solid var(--border-color)",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",

            color: isDarkMode ? "var(--ibm-cream)" : "var(--text-color)",
          }}
        ></div>

        {/* Like column - like count */}
        <div
          style={{
            textAlign: "center",
            // borderRight: "1px solid var(--border-color)",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",

            color: isDarkMode ? "var(--ibm-cream)" : "var(--text-color)",
            fontSize: "0.75rem",
          }}
        >
          {likes || 0} {likes === 1 ? "like" : "likes"}
        </div>
      </div>

      {/* Row 3: Elevated buttons */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "28% 12% 8.57% 8.57% 8.57% 8.57% 8.57% 8.57% 8.57% 8.57%",
          width: "100%",
          height: "32px",
          alignItems: "center",
          padding: "6px 0px",
        }}
      >
        {/* Column 1: Display name - profile button */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            paddingLeft: "8px",
          }}
        >
          <ElevatedButton
            onClick={() => {
              navigate({
                to: `/npub/${npubForLinks}`,
                state: true,
              });
            }}
            title="View profile"
          />
        </div>

        {/* Column 2: Kind - target note button */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {targetNoteId && (
            <ElevatedButton
              onClick={() => {
                // If this is a reply, navigate to parent's thread view
                if (noteKind === "reply" && parentNoteId) {
                  let bech32 = parentNoteId;
                  try {
                    bech32 = nip19.noteEncode(parentNoteId);
                  } catch {}
                  navigate({
                    to: `/thread/${bech32}`,
                    state: {
                      cachedNote: undefined,
                      focusedReplyId: noteId,
                    } as any,
                  });
                } else {
                  // For other note kinds (repost, etc), navigate to target note
                  navigate({
                    to: "/note/$noteId",
                    params: { noteId: targetNoteId },
                    state: true,
                  });
                }
              }}
              title={
                noteKind === "reply" ? "View parent thread" : `View ${noteKind}`
              }
            />
          )}
        </div>

        {/* Column 3: Created - empty */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        ></div>

        {/* Column 4: Link - link button */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ElevatedButton
            onClick={() => {
              // For articles, navigate to article route with naddr
              if (noteKind === "article" && articleNaddr) {
                navigate({
                  to: "/article/$addr",
                  params: { addr: articleNaddr },
                  state: true,
                });
              } else {
                // For regular notes, use the default goToNote handler
                goToNote();
              }
            }}
            title={
              noteKind === "article" ? "Read article" : "Link to this note"
            }
          />
        </div>

        {/* Column 5: Bookmark - bookmark button */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {toggleBookmark && (
            <ElevatedButton
              onClick={toggleBookmark}
              title={isBookmarked ? "Remove bookmark" : "Add bookmark"}
              isActive={isBookmarked}
            />
          )}
        </div>

        {/* Column 6: Thread - thread button */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ElevatedButton
            onClick={() => {
              let bech32 = noteId;
              try {
                bech32 = nip19.noteEncode(noteId);
              } catch {}
              navigate({
                to: `/thread/${bech32}`,
                state: {
                  cachedNote: note,
                  focusedReplyId: undefined,
                } as any,
              });
            }}
            title="View thread"
            isActive={replyCount > 0}
          />
        </div>

        {/* Column 7: Repost - repost button */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ElevatedButton onClick={openRepost} title="Repost" />
        </div>

        {/* Column 8: Zap - zap button */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ElevatedButton
            onClick={handleZapClick}
            title="Send zap"
            isActive={hasZappedByMe}
          />
        </div>

        {/* Column 9: Reply - reply button */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ElevatedButton onClick={openReply} title="Reply" />
        </div>

        {/* Column 10: Like - like button */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ElevatedButton
            onClick={handleLike}
            title={isSendingReaction ? "Sending…" : "Like"}
            disabled={isSendingReaction}
            isActive={hasLikedByMe}
          />
        </div>
      </div>

      {!!actionError && (
        <div
          style={{
            color: "var(--btn-accent)",
            fontSize: "0.8rem",
            padding: "0.25rem 0.5rem",
            backgroundColor: isDarkMode
              ? "var(--app-secondary-bg-color)"
              : "rgba(217, 206, 174, 0.8)",
            borderTop: "1px solid var(--border-color)",
          }}
        >
          {actionError}
        </div>
      )}
    </div>
  );
};
