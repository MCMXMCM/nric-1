import React from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { nip19 } from "nostr-tools";
import type { Note } from "../../types/nostr/types";
import { formatRelativeTime } from "../../utils/nostr/utils";
import NoteContentRenderer from "../NoteContentRenderer";
import LoadingTextPlaceholder from "../ui/LoadingTextPlaceholder";
import { RepostContent } from "./RepostContent";
import NostrLinkText from "../NostrLinkText";

export interface QuoteRepostContentProps {
  // Note data
  note: Note;
  textContent: string;
  repostOriginal: Note | null;

  // Display state
  isQuoteRepost: boolean;
  hasRepostTarget: boolean;
  isMobile: boolean;

  // User display
  displayUserNameOrNpub: string | null;
  isDisplayNameLoading: boolean;
  npubForLinks: string;

  // Display options
  useAscii?: boolean;
  useColor?: boolean;
  imageMode?: boolean;

  // MediaGallery props
  asciiCache?: Record<string, { ascii: string; timestamp: number }>;
  setFullScreenImage?: (url: string) => void;
  onAsciiRendered?: (url: string, ascii: string) => void;
  onMediaLoadError?: (noteId: string) => void;
  onImageDimensionsLoaded?: (
    noteId: string,
    imageUrl: string,
    dimensions: { width: number; height: number }
  ) => void;

  // Handlers
  getDisplayNameForPubkey: (pubkey: string) => string;
  onHashtagClick?: (hashtag: string) => void;
  prefetchRoute: (path: string) => void;
  prefetchNote: (noteId: string) => Promise<void>;
  goToNote: () => void;
}

export const QuoteRepostContent: React.FC<QuoteRepostContentProps> = ({
  note,
  textContent,
  repostOriginal,
  isQuoteRepost,
  hasRepostTarget,
  isMobile,
  displayUserNameOrNpub,
  isDisplayNameLoading,
  npubForLinks,
  useAscii = false,
  useColor = false,
  imageMode = false,
  // MediaGallery props
  asciiCache = {},
  setFullScreenImage = () => {},
  onAsciiRendered = () => {},
  onMediaLoadError = () => {},
  onImageDimensionsLoaded = () => {},
  getDisplayNameForPubkey,
  onHashtagClick,
  prefetchRoute,
  prefetchNote,
  goToNote,
}) => {
  const navigate = useNavigate();
  // location removed - unused variable

  if (!hasRepostTarget) {
    return null;
  }

  if (isQuoteRepost) {
    // Quote Repost Mode
    return (
      <div
        style={{
          width: "100%",
          padding: isMobile ? "0.5rem 1rem" : "0 1rem",
          height: isMobile ? "auto" : "100%",
          overflow: "visible", // Always allow content to be visible without scrollbars
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header row with right-extending top border */}
        {isMobile ? (
          <></>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <Link
              to="/npub/$npubId"
              params={{ npubId: npubForLinks }}
              onMouseEnter={() => prefetchRoute(`/npub/${npubForLinks}`)}
              style={{
                color: "var(--text-color)",
                textDecoration: "underline",
                fontWeight: "bold",
                fontSize: "0.875rem",
                cursor: "pointer",
                maxWidth: isMobile ? "25vw" : "250px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {isDisplayNameLoading ? (
                <LoadingTextPlaceholder type="displayName" speed="fast" />
              ) : (
                displayUserNameOrNpub || "Unknown"
              )}{" "}
            </Link>
            <span
              style={{
                color: "var(--app-text-secondary)",
                fontSize: "1rem",
              }}
            >
              {formatRelativeTime(note.created_at || 0)}
            </span>
            <button
              onClick={goToNote}
              onMouseEnter={() =>
                prefetchNote(note.id).catch((error) => {
                  console.error("Failed to prefetch note on hover:", error);
                })
              }
              onFocus={() =>
                prefetchNote(note.id).catch((error) => {
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
                minWidth: "14px",
                alignItems: "center",
              }}
            >
              <svg
                width="14"
                height="14"
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
          </div>
        )}

        {/* Content area with left + bottom borders */}

        {/* Reposter content directly below header */}
        {textContent.trim().length > 0 && (
          <div
            style={{
              color: "var(--text-color)",
              fontSize: "var(--font-size-sm)",
              lineHeight: "1.4",
              textAlign: "left",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              overflowWrap: "anywhere",
            }}
          >
            {imageMode ? (
              <NostrLinkText
                text={textContent || ""}
                getDisplayNameForPubkey={getDisplayNameForPubkey}
                onHashtagClick={onHashtagClick}
              />
            ) : (
              <NoteContentRenderer
                content={textContent}
                useAscii={useAscii}
                useColor={useColor}
                imageMode={imageMode}
                getDisplayNameForPubkey={getDisplayNameForPubkey}
                onHashtagClick={onHashtagClick}
                noteId={note.id}
                index={0}
                asciiCache={asciiCache}
                setFullScreenImage={setFullScreenImage}
                onAsciiRendered={onAsciiRendered}
                onMediaLoadError={onMediaLoadError}
                onImageDimensionsLoaded={onImageDimensionsLoaded}
                showLinkPreviews={true}
                maxLinkPreviewsToShow={2}
              />
            )}
          </div>
        )}

        {/* Original note slightly indented */}
        <RepostContent
          repostOriginal={repostOriginal}
          isMobile={isMobile}
          useAscii={useAscii}
          useColor={useColor}
          getDisplayNameForPubkey={getDisplayNameForPubkey}
          onHashtagClick={onHashtagClick}
          imageMode={imageMode}
          asciiCache={asciiCache}
          setFullScreenImage={setFullScreenImage}
          onAsciiRendered={onAsciiRendered}
          onMediaLoadError={onMediaLoadError}
          onImageDimensionsLoaded={onImageDimensionsLoaded}
        />
      </div>
    );
  }

  // Regular Repost Mode - just show the original note with a border
  return (
    <div
      style={{
        width: "100%",
        padding: isMobile ? "0.5rem 1rem" : "0 1rem",
        height: isMobile ? "auto" : "100%",
        overflow: "visible",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {repostOriginal ? (
        <div
          style={{
            border: "1px solid var(--border-color)",
            borderRadius: "0px",
            padding: "0.75rem",
            backgroundColor: "transparent",
          }}
        >
          {/* Original note author header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginBottom: "0.5rem",
            }}
          >
            <a
              href={`/npub/${(() => {
                try {
                  return nip19.npubEncode(repostOriginal.pubkey);
                } catch {
                  return repostOriginal.pubkey;
                }
              })()}`}
              onClick={(e) => {
                e.preventDefault();
                const np = (() => {
                  try {
                    return nip19.npubEncode(repostOriginal.pubkey);
                  } catch {
                    return repostOriginal.pubkey;
                  }
                })();
                navigate({
                  to: `/npub/${np}`,
                  state: true,
                });
              }}
              style={{
                color: "var(--text-color)",
                textDecoration: "underline",
                fontWeight: "bold",
                fontSize: "var(--font-size-sm)",
                cursor: "pointer",
              }}
            >
              {getDisplayNameForPubkey(repostOriginal.pubkey)}
            </a>
            <span
              style={{
                color: "var(--app-text-secondary)",
                fontSize: "var(--font-size-base)",
              }}
            >
              {formatRelativeTime(repostOriginal.created_at || 0)}
            </span>
          </div>

          {/* Original note content */}
          <div
            style={{
              color: "var(--text-color)",
              fontSize: "var(--font-size-sm)",
              whiteSpace: "pre-wrap",
              lineHeight: "1.4",
              wordBreak: "break-word",
              overflowWrap: "break-word",
              textAlign: "left",
            }}
          >
            <NoteContentRenderer
              content={(() => {
                // Truncate long content in repost view - smart truncation to not cut URLs
                const characterLimit = isMobile ? 140 : 320;
                const content = repostOriginal.content || "";

                if (content.length <= characterLimit) {
                  return content;
                }

                // Start with the character limit
                let truncatedText = content.substring(0, characterLimit).trim();

                // Check if we're in the middle of a URL
                const lastHttpIndex = truncatedText.lastIndexOf("http");
                if (lastHttpIndex !== -1) {
                  const spaceAfterHttp = truncatedText.indexOf(
                    " ",
                    lastHttpIndex
                  );
                  if (spaceAfterHttp === -1) {
                    // We're cutting a URL, so truncate before it
                    truncatedText = truncatedText
                      .substring(0, lastHttpIndex)
                      .trim();
                  }
                }

                return truncatedText + "...";
              })()}
              useAscii={useAscii}
              useColor={useColor}
              imageMode={imageMode}
              getDisplayNameForPubkey={getDisplayNameForPubkey}
              onHashtagClick={onHashtagClick}
              noteId={repostOriginal.id}
              index={0}
              asciiCache={asciiCache}
              setFullScreenImage={setFullScreenImage}
              onAsciiRendered={onAsciiRendered}
              onMediaLoadError={onMediaLoadError}
              onImageDimensionsLoaded={onImageDimensionsLoaded}
              showLinkPreviews={true}
              maxLinkPreviewsToShow={2}
            />
            {/* View More button for truncated content - links to original */}
            {(repostOriginal.content || "").length > (isMobile ? 140 : 320) && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  // Navigate to the original note
                  const noteId = (() => {
                    try {
                      return nip19.noteEncode(repostOriginal.id);
                    } catch {
                      return repostOriginal.id;
                    }
                  })();
                  navigate({
                    to: "/note/$noteId",
                    params: { noteId },
                  });
                }}
                style={{
                  marginTop: "0.5rem",
                  padding: "0.25rem 0.5rem",
                  fontSize: "var(--font-size-sm)",
                  color: "var(--link-color)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                View More
              </button>
            )}
          </div>
        </div>
      ) : (
        <div
          style={{ color: "var(--app-text-secondary)", fontSize: "0.875rem" }}
        >
          Loading original…
        </div>
      )}
    </div>
  );
};
