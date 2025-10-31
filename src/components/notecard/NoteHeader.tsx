import React from "react";
import { nip19 } from "nostr-tools";
import { useNavigate, useLocation, Link } from "@tanstack/react-router";
import LoadingTextPlaceholder from "../ui/LoadingTextPlaceholder";
import { ThreadIcon } from "../ui/Icons";
import { formatRelativeTime } from "../../utils/nostr/utils";

export interface NoteHeaderProps {
  // Note data
  noteId: string;
  noteCreatedAt: number;
  note?: any; // Add note prop to pass cached note data

  // Display data
  displayUserNameOrNpub: string | null;
  isDisplayNameLoading: boolean;
  npubForLinks: string;

  // Parent/repost/root indicators
  hasParent: boolean;
  hasRoot: boolean;
  parentNoteId?: string;
  rootNoteId?: string;

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

  // State
  isNotePage: boolean;
  isMobile?: boolean;

  // Share functionality
  onShare?: () => void;
  replyCount?: number;

  // Zap functionality
  totalSats?: number;
  recipientName?: string;
}

export const NoteHeader: React.FC<NoteHeaderProps> = ({
  noteId,
  noteCreatedAt,
  note,
  displayUserNameOrNpub,
  isDisplayNameLoading,
  npubForLinks,
  hasParent,
  parentNoteId,
  parentDisplayName,
  isParentDisplayNameLoading = false,
  parentNpubForLinks,
  parentNoteNotFound = false,
  hasRepostTarget = false,
  repostTargetId,
  repostTargetDisplayName,
  isRepostTargetDisplayNameLoading = false,
  repostTargetNpubForLinks,
  prefetchRoute,
  prefetchNote,
  goToNote,
  isNotePage,
  isMobile = false,
  onShare,
  replyCount = 0,
  totalSats = 0,
  recipientName,
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  // Format sats for display
  const formatSats = (msatsOrSats: number) => {
    if (!Number.isFinite(msatsOrSats) || msatsOrSats < 0) {
      return "0 SATS";
    }
    if (msatsOrSats >= 1000) {
      return `${(msatsOrSats / 1000).toFixed(1)}K SATS`;
    }
    return `${Math.round(msatsOrSats)} SATS`;
  };
  // Navigate to parent note with thread view
  const goToParentNoteWithThread = () => {
    if (!parentNoteId) return;

    const backToPath = `${location.pathname}${location.search || ""}`;
    const navigationState = {
      fromNoteView: true,
      backToPath,
    };

    // Store navigation state in sessionStorage as backup
    try {
      sessionStorage.setItem(
        "noteViewNavigationState",
        JSON.stringify(navigationState)
      );
    } catch (error) {
      // Ignore errors
    }

    let bech32 = parentNoteId;
    try {
      bech32 = nip19.noteEncode(parentNoteId);
    } catch {}

    navigate({
      to: `/thread/${bech32}`,
      state: {
        backToPath,
        fromFeed: true,
        focusedReplyId: noteId,
        cachedNote: undefined,
      } as any,
      replace: false,
    });
  };

  // Calculate sticky positioning based on context
  const getStickyStyles = () => {
    if (isNotePage) {
      // In note view, stick right under the main navigation header
      const headerHeight = isMobile ? "var(--safe-area-inset-top)" : "60px";
      return {
        position: "sticky" as const,
        top: headerHeight, // Right under main header
        backgroundColor: "var(--app-bg-color)",
        zIndex: 99,
        // borderBottom: "1px dotted var(--border-color)",
      };
    } else {
      // In feed view, don't use sticky positioning due to virtualized feed conflicts
      // Each note is absolutely positioned, so sticky headers interfere with each other
      return {
        position: "relative" as const,
        backgroundColor: "var(--app-bg-color)",
        zIndex: 1,
        // borderBottom: "1px dotted var(--border-color)",
      };
    }
  };

  return (
    <div
      className="note-creator-and-time"
      style={{
        display: "flex",
        flexDirection: "column",
        // paddingTop: "1rem",
        width: "100%",
        height: "100%",
        padding: isNotePage ? "0 0.5rem 0 0.5rem" : "0 0.5rem ",
        ...getStickyStyles(),
      }}
    >
      {/* Main header row with author and time/buttons */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          width: "100%",
        }}
      >
        {/* Repost/quote and note author */}
        <div
          style={{
            display: "flex",
            // paddingTop: "1rem",

            color: "var(--text-color)",
            alignItems: "center",
            gap: "0.5rem",

            fontSize: "var(--font-size-base)",
            // On mobile, allow container to shrink when needed for zaps/replies
            flex: isMobile ? "1 1 auto" : "initial",
            minWidth: 0, // Allow flex child to shrink below content size
          }}
        >
          <Link
            to="/npub/$npubId"
            params={{ npubId: npubForLinks }}
            onMouseEnter={() => prefetchRoute(`/npub/${npubForLinks}`)}
            style={{
              // color: "var(--text-color)",
              textDecoration: "none",
              color: "var(--accent-color)",
              fontSize: "var(--font-size-base)",
              overflow: "hidden",
              textTransform: "uppercase",
              // Reduce max width on mobile to make room for zaps/replies/time
              maxWidth: "55dvw",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: "0 1 auto", // Allow to shrink if needed
              minWidth: 0, // Allow flex child to shrink below content size
            }}
          >
            {isDisplayNameLoading ? (
              <LoadingTextPlaceholder type="displayName" speed="fast" />
            ) : (
              displayUserNameOrNpub || "Unknown"
            )}{" "}
          </Link>
        </div>

        {/* Time and link to note */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: isMobile ? "0.25rem" : "0.5rem",
            // Allow right side to shrink but maintain items on mobile
            flex: isMobile ? "0 0 auto" : "initial",
            flexWrap: "nowrap", // Keep items in one line
            minWidth: 0, // Allow flex child to shrink
          }}
        >
          {!isNotePage && !isMobile && (
            <button
              onClick={goToNote}
              onMouseEnter={() =>
                prefetchNote(noteId).catch((error) => {
                  console.error("Failed to prefetch note on hover:", error);
                })
              }
              onFocus={() =>
                prefetchNote(noteId).catch((error) => {
                  console.error("Failed to prefetch note on focus:", error);
                })
              }
              title="Link to this note"
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: 0,
                color: "var(--link-color)",
                display: "flex",
                minWidth: "20px",
                alignItems: "center",
                flexShrink: 0,
              }}
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
                <path d="M10 13a5 5 0 0 0 7.07 0l1.83-1.83a5 5 0 1 0-7.07-7.07L9 5" />
                <path d="M14 11a5 5 0 0 0-7.07 0L5.1 12.83a5 5 0 1 0 7.07 7.07L15 19" />
              </svg>
            </button>
          )}

          {/* Share button */}
          {onShare && !isNotePage && !isMobile && (
            <button
              onClick={onShare}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: 0,
                color: "var(--link-color)",
                display: "flex",
                minWidth: "20px",
                alignItems: "center",
                flexShrink: 0,
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

          {/* Zap sats display on the right side */}
          {totalSats > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                flexShrink: 0, // Don't shrink the zap display
              }}
            >
              <span
                style={{
                  fontSize: isMobile ? "0.75rem" : "0.875rem",
                  opacity: 0.8,
                  fontWeight: "bold",

                  // Remove minWidth on mobile, use natural width
                  minWidth: isMobile ? "auto" : "200px",
                  color: "var(--accent-color)", // Lightning orange
                  textAlign: "right",
                  whiteSpace: "nowrap", // Prevent wrapping
                }}
                title={`Zap ${recipientName || "user"} • ${
                  totalSats > 0
                    ? `${totalSats.toLocaleString()} SATS received`
                    : "No zaps yet"
                }`}
              >
                [{formatSats(totalSats)}]
              </span>
            </div>
          )}
          {/* Thread button */}
          {!isNotePage && replyCount > 0 && (
            <button
              onClick={() => {
                // Navigate to the thread page
                // Avoid manual history checkpoints; let the router manage back behavior
                let backToPath = `${location.pathname}${location.search || ""}`;
                try {
                  const stored = sessionStorage.getItem("lastFeedPath");
                  if (stored) backToPath = stored;
                } catch {}
                // Normalize to bech32 for thread route
                let bech32 = noteId;
                try {
                  bech32 = nip19.noteEncode(noteId);
                } catch {}
                navigate({
                  to: `/thread/${bech32}`,
                  replace: false,
                  state: {
                    // Ensure thread has immediate note context to avoid not-found flashes
                    cachedNote: note || ({ id: noteId } as any),
                    fromFeed: true,
                    backToPath,
                  } as any,
                });
              }}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: 0,
                display: "flex",
                minWidth: "16px",
                minHeight: isMobile ? "20px" : "auto",
                height: isMobile ? "20px" : "auto",
                alignItems: "center",
                color:
                  replyCount > 0 ? "var(--accent-color)" : "var(--link-color)",
                justifyContent: "center",
                flexShrink: 0,
              }}
              title="View thread"
            >
              <ThreadIcon
                hasReplies={replyCount > 0}
                width={16}
                height={16}
                color={
                  replyCount > 0 ? "var(--accent-color)" : "var(--link-color)"
                }
                style={{
                  filter: replyCount > 0 ? "var(--accent-glow-filter)" : "none",
                  transition: "stroke 0.2s, fill 0.2s, filter 0.2s",
                }}
              />
            </button>
          )}
          <span
            style={{
              color: "var(--app-text-secondary)",
              fontSize: isMobile ? "0.75rem" : "var(--font-size-base)",
              whiteSpace: "nowrap", // Prevent time from wrapping
              flexShrink: 0, // Don't shrink the timestamp
            }}
          >
            {formatRelativeTime(noteCreatedAt || 0)}
          </span>
        </div>
      </div>

      {/* Replying to section - show for all replies */}
      {hasParent && parentNoteId && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.25rem",
            minHeight: isMobile ? "20px" : "auto",
            height: isMobile ? "20px" : "auto",
            marginTop: "0.25rem",
            fontSize: "0.875rem",
            color: "var(--app-text-secondary)",
          }}
        >
          <span>Replying to</span>
          {parentNoteNotFound ? (
            // Show fallback when parent note couldn't be loaded
            <span
              style={{
                color: "var(--app-text-secondary)",
                fontStyle: "italic",
                maxWidth: "50vw",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                overflow: "hidden",
              }}
            >
              [note not found]
            </span>
          ) : parentDisplayName ? (
            // Show normal display when we have the parent note data
            <>
              <Link
                to="/npub/$npubId"
                params={{ npubId: parentNpubForLinks || "" }}
                onMouseEnter={() => {
                  if (parentNpubForLinks) {
                    prefetchRoute(`/npub/${parentNpubForLinks}`);
                  }
                }}
                style={{
                  color: "var(--accent-color)",
                  textDecoration: "none",
                  maxWidth: "50vw",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  fontWeight: "500",
                }}
              >
                {isParentDisplayNameLoading ? (
                  <LoadingTextPlaceholder type="displayName" speed="fast" />
                ) : (
                  parentDisplayName
                )}
              </Link>
              <span>'s</span>
              <button
                onClick={goToParentNoteWithThread}
                onMouseEnter={() => {
                  if (parentNoteId) {
                    prefetchNote(parentNoteId).catch((error) => {
                      console.error(
                        "Failed to prefetch parent note on hover:",
                        error
                      );
                    });
                  }
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--accent-color)",
                  textDecoration: "underline",
                  fontSize: "0.875rem",
                  padding: 0,
                }}
              >
                note
              </button>
            </>
          ) : (
            // Show loading state while fetching
            <>
              <LoadingTextPlaceholder type="displayName" speed="fast" />
              <span>'s note</span>
            </>
          )}
        </div>
      )}

      {/* Reposting to section - only show for reposts with target data */}
      {hasRepostTarget && repostTargetId && repostTargetDisplayName && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.25rem",
            minHeight: isMobile ? "20px" : "auto",
            height: isMobile ? "20px" : "auto",
            fontSize: "0.875rem",
            color: "var(--app-text-secondary)",
          }}
        >
          <span>Reposting</span>
          <Link
            to="/npub/$npubId"
            params={{ npubId: repostTargetNpubForLinks || "" }}
            onMouseEnter={() => {
              if (repostTargetNpubForLinks) {
                prefetchRoute(`/npub/${repostTargetNpubForLinks}`);
              }
            }}
            style={{
              color: "var(--accent-color)",
              textDecoration: "none",
              maxWidth: "55dvw",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              overflow: "hidden",
              fontWeight: "500",
            }}
          >
            {isRepostTargetDisplayNameLoading ? (
              <LoadingTextPlaceholder type="displayName" speed="fast" />
            ) : (
              repostTargetDisplayName
            )}
          </Link>
          <span>'s</span>
          <button
            onClick={() => {
              if (repostTargetId) {
                navigate({
                  to: "/note/$noteId",
                  params: { noteId: repostTargetId },
                  state: true,
                });
              }
            }}
            onMouseEnter={() => {
              if (repostTargetId) {
                prefetchNote(repostTargetId).catch((error) => {
                  console.error(
                    "Failed to prefetch repost target note on hover:",
                    error
                  );
                });
              }
            }}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--accent-color)",
              textDecoration: "underline",
              fontSize: "0.875rem",
              padding: 0,
            }}
          >
            note
          </button>
        </div>
      )}
    </div>
  );
};
