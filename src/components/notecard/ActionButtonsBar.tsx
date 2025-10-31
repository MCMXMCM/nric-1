import React from "react";
import { motion } from "framer-motion";
import { nip19 } from "nostr-tools";
import ZapButton from "../ZapButton";
import LoadingTextPlaceholder from "../ui/LoadingTextPlaceholder";
import { Button } from "../ui/Button";
import { RepostIcon, ReplyIcon, ThreadIcon, BookmarkIcon } from "../ui/Icons";
import { RadialMenu } from "../ui/RadialMenu";
import { useNavigate, useLocation } from "@tanstack/react-router";

export interface ActionButtonsBarProps {
  // Note data
  noteId: string;
  noteAuthorPubkey: string;
  fullNote?: any; // Optional: full note object for bookmarking

  // Layout state
  isMobile: boolean;
  index?: number; // For navigation context

  // Interaction states
  likes: number;
  hasLikedByMe: boolean;
  isReactionsLoading: boolean;
  isSendingReaction: boolean;
  hasZappedByMe: boolean;
  isBookmarked?: boolean;

  // Handlers
  openRepost: () => void;
  openReply: () => void;
  handleLike: () => void;
  prefetchNote: (noteId: string) => Promise<void>;
  toggleBookmark?: () => void;

  // Zap related
  readRelayUrls: string[];
  getDisplayNameForPubkey: (pubkey: string) => string;
  setShowZapModal?: (show: boolean) => void;

  // RadialMenu related
  onShare?: () => void;
  replyCount?: number;
  hasParent?: boolean;
  hasRepostTarget?: boolean;
  hasRoot?: boolean;
  parentNoteId?: string;
  repostTargetId?: string;
  rootNoteId?: string;
  prefetchRoute: (path: string) => void;
  goToNote: () => void;
}

export const ActionButtonsBar: React.FC<ActionButtonsBarProps> = ({
  noteId,
  noteAuthorPubkey,
  isMobile: _isMobile,
  index,
  likes,
  hasLikedByMe,
  isReactionsLoading,
  isSendingReaction,
  hasZappedByMe,
  isBookmarked = false,
  openRepost,
  openReply,
  handleLike,
  getDisplayNameForPubkey,
  setShowZapModal,
  prefetchNote,
  goToNote,
  toggleBookmark,
  onShare,
  replyCount = 0,
  hasParent = false,
  hasRepostTarget = false,
  hasRoot = false,
  parentNoteId,
  repostTargetId,
  rootNoteId,
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  // Preserve the feed entry state and ensure a single checkpoint exists before navigating away
  const preserveFeedStateBeforeNavigation = (currentIndex: number) => {
    try {
      const buildSearchObject = () => {
        const ls: any = location.search as any;
        if (typeof ls === "string") {
          const p = new URLSearchParams(ls);
          const obj: any = {};
          p.forEach((v, k) => {
            obj[k] = v === "true" ? true : v === "false" ? false : v;
          });
          return obj;
        }
        return ls || undefined;
      };

      // Step 1: Ensure a one-time checkpoint so back from thread always lands on feed
      const FLAG_KEY = "feedCheckpointSet";
      const hasCheckpoint = sessionStorage.getItem(FLAG_KEY) === "1";
      if (!hasCheckpoint && location.pathname === "/") {
        navigate({
          to: location.pathname,
          search: buildSearchObject(),
          replace: false,
          state: {
            fromFeed: true,
            feedIndex: currentIndex,
            timestamp: Date.now(),
          } as any,
        });
        try {
          sessionStorage.setItem(FLAG_KEY, "1");
        } catch {}
      }

      // Step 2: Update current entry with latest index/state (replace)
      navigate({
        to: location.pathname,
        search: buildSearchObject(),
        replace: true,
        state: {
          fromFeed: true,
          feedIndex: currentIndex,
          timestamp: Date.now(),
        } as any,
      });
    } catch {}
  };

  // Create navigation handlers that will be called from the portal
  const handleThreadNavigation = () => {
    // Rely on router-managed history and scroll restoration; avoid manual pushState
    if (!noteId) return;

    let bech32: string;
    try {
      bech32 = nip19.noteEncode(noteId);
    } catch {
      bech32 = noteId;
    }

    const currentIndex = typeof index === "number" ? index : 0;
    preserveFeedStateBeforeNavigation(currentIndex);
    let backToPath = `${location.pathname}${location.search || ""}`;
    try {
      const stored = sessionStorage.getItem("lastFeedPath");
      if (stored) backToPath = stored;
    } catch {}

    navigate({
      to: `/thread/${bech32}`,
      replace: false,
      state: {
        restoreIndex: currentIndex,
        feedIndex: currentIndex,
        backToPath,
        timestamp: Date.now(),
        fromFeed: true, // Key flag for scroll restoration
        virtualScrollIndex: currentIndex,
        // Pass a minimal cached note stub to avoid transient not-found flashes
        cachedNote: { id: noteId } as any,
        // Add profile-specific state for profile notes
        profileKey: location.pathname.includes("/npub/")
          ? location.pathname.split("/npub/")[1]?.split("/")[0]
          : undefined,
      } as any,
    });
  };

  const handleRootNavigation = () => {
    // Avoid manual history checkpoints; let the router manage back behavior
    if (!rootNoteId) return;

    let bech32: string;
    try {
      bech32 = nip19.noteEncode(rootNoteId);
    } catch {
      bech32 = rootNoteId;
    }

    const currentIndex = typeof index === "number" ? index : 0;
    preserveFeedStateBeforeNavigation(currentIndex);
    let backToPath = `${location.pathname}${location.search || ""}`;
    try {
      const stored = sessionStorage.getItem("lastFeedPath");
      if (stored) backToPath = stored;
    } catch {}

    navigate({
      to: `/thread/${bech32}`,
      replace: false,
      state: {
        restoreIndex: currentIndex,
        feedIndex: currentIndex,
        backToPath,
        timestamp: Date.now(),
        fromFeed: true, // Key flag for scroll restoration
        virtualScrollIndex: currentIndex,
        // Ensure thread view jumps to main note on entry
        forceScrollTop: true,
        // Add profile-specific state for profile notes
        profileKey: location.pathname.includes("/npub/")
          ? location.pathname.split("/npub/")[1]?.split("/")[0]
          : undefined,
      } as any,
    });
  };

  const handleParentNavigation = () => {
    // Avoid manual history checkpoints; let the router manage back behavior
    if (!parentNoteId) return;

    let bech32: string;
    try {
      bech32 = nip19.noteEncode(parentNoteId);
    } catch {
      bech32 = parentNoteId;
    }

    const currentIndex = typeof index === "number" ? index : 0;
    preserveFeedStateBeforeNavigation(currentIndex);
    let backToPath = `${location.pathname}${location.search || ""}`;
    try {
      const stored = sessionStorage.getItem("lastFeedPath");
      if (stored) backToPath = stored;
    } catch {}

    navigate({
      to: `/thread/${bech32}`,
      replace: false,
      state: {
        restoreIndex: currentIndex,
        feedIndex: currentIndex,
        backToPath,
        timestamp: Date.now(),
        fromFeed: true, // Key flag for scroll restoration
        virtualScrollIndex: currentIndex,
        // Ensure thread view jumps to main note on parent navigation
        forceScrollTop: true,
        // Pass the reply we came from so thread view can focus it
        focusedReplyId: noteId,
        // Add profile-specific state for profile notes
        profileKey: location.pathname.includes("/npub/")
          ? location.pathname.split("/npub/")[1]?.split("/")[0]
          : undefined,
      } as any,
    });
  };

  const handleRepostTargetNavigation = () => {
    // Avoid manual history checkpoints; let the router manage back behavior
    if (!repostTargetId) return;
    let bech32: string;
    try {
      bech32 = nip19.noteEncode(repostTargetId);
    } catch {
      bech32 = repostTargetId;
    }

    const currentIndex = typeof index === "number" ? index : 0;
    preserveFeedStateBeforeNavigation(currentIndex);
    let backToPath = `${location.pathname}${location.search || ""}`;
    try {
      const stored = sessionStorage.getItem("lastFeedPath");
      if (stored) backToPath = stored;
    } catch {}

    navigate({
      to: "/note/$noteId",
      params: { noteId: bech32 },
      replace: false,
      state: {
        restoreIndex: currentIndex,
        feedIndex: currentIndex,
        backToPath,
        timestamp: Date.now(),
        fromFeed: true, // Key flag for scroll restoration
        virtualScrollIndex: currentIndex,
        // Add profile-specific state for profile notes
        profileKey: location.pathname.includes("/npub/")
          ? location.pathname.split("/npub/")[1]?.split("/")[0]
          : undefined,
      } as any,
    });
  };

  return (
    <div
      style={{
        width: "100%",
        // borderBottom: "1px dotted var(--border-color)",
        zIndex: 100,
        overflow: "visible", // Allow RadialMenu to extend beyond container
        display: "flex",
        alignItems: "center",
        padding: "0.25rem 0.5rem", // Reduced vertical padding
      }}
    >
      <div
        style={{
          marginBottom: "0",
          borderRadius: "0.5rem",
          height: "28px", // Fixed smaller height
          fontSize: "var(--font-size-xs)",
          color: "var(--text-color)",
          display: "flex",
          alignItems: "center",
          width: "100%",
          justifyContent: "space-between", // Distribute all buttons evenly around center
          backgroundColor: "var(--theme-aware-surface)", // Background for visibility
          padding: "0 0.5rem", // Minimal horizontal padding
        }}
      >
        {/* Link button - hidden on mobile since it's available in the header */}

        {/* Repost button */}
        <Button
          variant="icon"
          size="sm"
          onClick={openRepost}
          title="Repost"
          icon={<RepostIcon />}
          height="18px"
        />

        {/* Zap button */}
        <ZapButton
          noteId={noteId}
          recipientName={getDisplayNameForPubkey(noteAuthorPubkey)}
          onShowModal={() => setShowZapModal?.(true)}
          hasZappedByMe={hasZappedByMe}
          index={index}
        />

        {/* RadialMenu in the center - allow it to extend beyond row height */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%", // Take full height of the row
            position: "relative",
            zIndex: 10, // Ensure it's above other elements
            margin: "0", // Ensure no margin
            // padding: "0 4% 0 0", // Ensure no padding
          }}
        >
          <RadialMenu
            options={[
              {
                id: "link",
                label: "Note View",
                icon: (
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
                    <path d="M10 13a5 5 0 0 0 7.07 0l1.83-1.83a5 5 0 1 0-7.07-7.07L9 5" />
                    <path d="M14 11a5 5 0 0 0-7.07 0L5.1 12.83a5 5 0 1 0 7.07 7.07L15 19" />
                  </svg>
                ),
                onClick: () => {
                  prefetchNote(noteId).catch((error) => {
                    console.error("Failed to prefetch note:", error);
                  });
                  goToNote();
                },
                color: "var(--link-color)",
              },
              // Add Bookmark option
              ...(toggleBookmark
                ? [
                    {
                      id: "bookmark",
                      label: isBookmarked ? "Unbookmark" : "Bookmark",
                      icon: (
                        <BookmarkIcon
                          filled={isBookmarked}
                          width={16}
                          height={16}
                        />
                      ),
                      onClick: toggleBookmark,
                      color: isBookmarked
                        ? "var(--accent-color)"
                        : "var(--link-color)",
                    },
                  ]
                : []),
              ...(onShare
                ? [
                    {
                      id: "share",
                      label: "Share",
                      icon: (
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
                      ),
                      onClick: onShare,
                      color: "var(--link-color)",
                    },
                  ]
                : []),
              {
                id: "thread",
                label: "Thread",
                icon: (
                  <ThreadIcon
                    hasReplies={replyCount > 0}
                    width={16}
                    height={16}
                    color="var(--accent-color)"
                  />
                ),
                onClick: handleThreadNavigation,
                color: "var(--accent-color)",
              },
              // Add View Root option for threads
              ...(hasRoot && rootNoteId
                ? [
                    {
                      id: "view-root",
                      label: "Root",
                      icon: (
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
                          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                          <polyline points="9,22 9,12 15,12 15,22" />
                        </svg>
                      ),
                      onClick: handleRootNavigation,
                      color: "var(--accent-color)",
                    },
                  ]
                : []),
              // Add View Parent option for replies
              ...(hasParent && parentNoteId
                ? [
                    {
                      id: "view-parent",
                      label: "Parent",
                      icon: (
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
                          <path d="M9 18l6-6-6-6" />
                        </svg>
                      ),
                      onClick: handleParentNavigation,
                      color: "var(--accent-color)",
                    },
                  ]
                : []),
              // Add View Original option for reposts
              ...(hasRepostTarget && repostTargetId
                ? [
                    {
                      id: "view-original",
                      label: "Original",
                      icon: (
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
                          <path d="M9 18l6-6-6-6" />
                        </svg>
                      ),
                      onClick: handleRepostTargetNavigation,
                      color: "var(--accent-color)",
                    },
                  ]
                : []),
            ]}
            size={40}
          />
        </div>

        {/* Reply button */}
        <Button
          variant="icon"
          size="sm"
          onClick={openReply}
          title="Reply"
          icon={<ReplyIcon />}
          height="18px"
        />

        {/* Like count button ('+N') with roll-up animation */}
        <button
          onClick={handleLike}
          disabled={isSendingReaction}
          title={isSendingReaction ? "Sending…" : "Like"}
          style={{
            padding: "2px 4px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            height: "100%", // Fill parent height
            minWidth: "28px", // Compact minimum width
            backgroundColor: "transparent",
            border: "none",
            cursor: isSendingReaction ? "not-allowed" : "pointer",
            opacity: isSendingReaction ? 0.6 : 1,
            fontSize: "var(--font-size-xs)", // Smaller font size to fit compact height
            color: hasLikedByMe
              ? document.documentElement.getAttribute("data-theme") === "light"
                ? "#7c3aed"
                : "#f97316"
              : "var(--text-color)",
            fontWeight: hasLikedByMe ? (700 as any) : (400 as any),
            textShadow:
              hasLikedByMe &&
              document.documentElement.getAttribute("data-theme") !== "light"
                ? "0 0 8px rgba(249,115,22,0.6)"
                : "none",
          }}
        >
          <span>+</span>
          <span
            style={{
              minWidth: likes > 0 ? "1rem" : "0", // Reduced width for compact design
              position: "relative",
              height: "0.75rem", // Reduced height to fit compact container
              display: "inline-block",
              lineHeight: "0.75rem", // Match height for proper vertical centering
            }}
          >
            {isReactionsLoading ? (
              <LoadingTextPlaceholder
                type="custom"
                customLength={1}
                speed="fast"
              />
            ) : (
              likes > 0 && (
                <motion.span
                  key={likes}
                  initial={{ y: 12, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -12, opacity: 0 }}
                  transition={{ type: "tween", duration: 0.2 }}
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    textAlign: "left",
                    display: "block",
                  }}
                >
                  {likes}
                </motion.span>
              )
            )}
          </span>
        </button>
      </div>
    </div>
  );
};
