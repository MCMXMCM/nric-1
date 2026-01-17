import React from "react";
import { useNavigate } from "@tanstack/react-router";
import { nip19 } from "nostr-tools";
import type { Note } from "../../types/nostr/types";
import { formatRelativeTime } from "../../utils/nostr/utils";
import NoteContentRenderer from "../NoteContentRenderer";
import NostrLinkText from "../NostrLinkText";

export interface RepostContentProps {
  repostOriginal: Note | null;
  isMobile: boolean;
  useAscii?: boolean;
  useColor?: boolean;
  getDisplayNameForPubkey: (pubkey: string) => string;
  onHashtagClick?: (hashtag: string) => void;
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
}

export const RepostContent: React.FC<RepostContentProps> = ({
  repostOriginal,
  isMobile,
  useAscii = false,
  useColor = false,
  getDisplayNameForPubkey,
  onHashtagClick,
  imageMode = false,
  // MediaGallery props
  asciiCache = {},
  setFullScreenImage = () => {},
  onAsciiRendered = () => {},
  onMediaLoadError = () => {},
  onImageDimensionsLoaded = () => {},
}) => {
  const navigate = useNavigate();
  // const location = useLocation(); // TODO: Restore if needed for navigation state

  // Hooks must be declared unconditionally in consistent order across renders
  const [showFull, setShowFull] = React.useState(false);

  if (!repostOriginal) {
    return (
      <div
        style={{
          color: "var(--app-text-secondary)",
          fontSize: "var(--font-size-sm)",
        }}
      >
        Loading original…
      </div>
    );
  }

  const handleAuthorClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const npub = (() => {
      try {
        return nip19.npubEncode(repostOriginal.pubkey);
      } catch {
        return repostOriginal.pubkey;
      }
    })();
    // Navigation state for TanStack Router
    navigate({
      to: `/npub/${npub}`,
      state: true,
    });
  };

  const authorNpub = (() => {
    try {
      return nip19.npubEncode(repostOriginal.pubkey);
    } catch {
      return repostOriginal.pubkey;
    }
  })();

  // Calculate truncation based on character count (140 on mobile, 280 on desktop for nested content)
  const characterLimit = isMobile ? 140 : 280;
  const content = repostOriginal.content || "";

  // Smart truncation that doesn't cut URLs midway
  const calculateDisplayText = (): string => {
    if (showFull || content.length <= characterLimit) {
      return content;
    }

    let truncatedText = content.substring(0, characterLimit).trim();

    // Check if we're in the middle of a URL
    const lastHttpIndex = truncatedText.lastIndexOf("http");
    if (lastHttpIndex !== -1) {
      const spaceAfterHttp = truncatedText.indexOf(" ", lastHttpIndex);
      if (spaceAfterHttp === -1) {
        // We're cutting a URL, so truncate before it
        truncatedText = truncatedText.substring(0, lastHttpIndex).trim();
      }
    }

    return truncatedText + "...";
  };

  const shouldTruncate = !showFull && content.length > characterLimit;
  const displayText = calculateDisplayText();

  const handleViewMore = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowFull(true);
  };

  return (
    <div
      style={{
        padding: "0.5rem 0.75rem",
        marginLeft: isMobile ? "0.5rem" : "0.75rem",
      }}
    >
      <div
        style={{
          borderLeft: "1px solid var(--border-color)",
          border: "1px solid var(--border-color)",
          borderRadius: "0px",
          padding: "0.5rem 0.75rem",
          backgroundColor: "transparent",
          textAlign: "left",
        }}
      >
        {/* Author header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            marginBottom: "0.25rem",
          }}
        >
          <a
            href={`/npub/${authorNpub}`}
            onClick={handleAuthorClick}
            style={{
              color: "var(--text-color)",
              textDecoration: "underline",
              fontWeight: "bold",
              fontSize: "var(--font-size-sm)",
              cursor: "pointer",
              maxWidth: isMobile ? "100%" : "250px",
              wordBreak: "break-all",
              overflowWrap: "anywhere",
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

        {/* Content */}
        <div
          style={{
            color: "var(--text-color)",
            fontSize: "var(--font-size-sm)",
            lineHeight: "1.4",
            textAlign: "left",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            overflowWrap: "break-word",
          }}
        >
          {imageMode ? (
            <NostrLinkText
              text={displayText}
              getDisplayNameForPubkey={getDisplayNameForPubkey}
              onHashtagClick={onHashtagClick}
            />
          ) : (
            <NoteContentRenderer
              content={displayText}
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
            />
          )}

          {/* View More button for truncated content */}
          {shouldTruncate && (
            <button
              onClick={handleViewMore}
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
    </div>
  );
};
