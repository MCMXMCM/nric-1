import React from "react";
import type { Note } from "../../types/nostr/types";
import { NoteHeader } from "./NoteHeader";
import { ActionButtonsBar } from "./ActionButtonsBar";
import { MediaGallery } from "../media/MediaGallery";
import { CORSImage } from "../media/CORSImage";
import { NoteTextContent } from "./NoteTextContent";
import { QuoteRepostContent } from "./QuoteRepostContent";
import { useUIStore } from "../lib/useUIStore";
import { Link } from "@tanstack/react-router";
import { nip19 } from "nostr-tools";

export interface NoteContentContainerProps {
  // Note data
  note: Note;
  actionTargetNote: Note; // The note that actions (like, reply, repost, zap) should target
  index: number;
  textContent: string;
  repostOriginal: Note | null;

  // Layout state
  isMobile: boolean;
  isNotePage: boolean;
  imageMode: boolean;
  hasNoteText: boolean;
  hasRepostTarget: boolean;
  isQuoteRepost: boolean;

  // Media data
  imageUrls: string[];
  videoUrls: string[];
  hasMediaError: boolean;
  asciiCache: Record<string, { ascii: string; timestamp: number }>;

  // User display
  displayUserNameOrNpub: string | null;
  isDisplayNameLoading: boolean;
  npubForLinks: string;

  // Parent/root data
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
  repostTargetId?: string;
  repostTargetDisplayName?: string | null;
  isRepostTargetDisplayNameLoading?: boolean;
  repostTargetNpubForLinks?: string;

  // Interaction state
  likes: number;
  hasLikedByMe: boolean;
  isReactionsLoading: boolean;
  isSendingReaction: boolean;
  hasZappedByMe: boolean;

  // Display options
  useAscii?: boolean;
  useColor?: boolean;
  isIOSPWA: boolean;

  // Zap functionality
  totalSats?: number;
  recipientName?: string;

  // Handlers
  getDisplayNameForPubkey: (pubkey: string) => string;
  onHashtagClick?: (hashtag: string) => void;
  setFullScreenImage: (url: string) => void;
  onAsciiRendered: (url: string, ascii: string) => void;
  onMediaLoadError: (noteId: string) => void;
  onImageDimensionsLoaded?: (
    noteId: string,
    imageUrl: string,
    dimensions: { width: number; height: number }
  ) => void;
  prefetchRoute: (path: string) => void;
  prefetchNote: (noteId: string) => Promise<void>;
  goToNote: () => void;
  openRepost: () => void;
  openReply: () => void;
  handleLike: () => void;

  // Relay data
  readRelayUrls: string[];
  setShowZapModal?: (show: boolean) => void;

  // Share functionality
  onShare?: () => void;
  replyCount?: number;
  showFullContent?: boolean;

  // Bookmark functionality
  isBookmarked?: boolean;
  toggleBookmark?: () => void;
}

export const NoteContentContainer: React.FC<NoteContentContainerProps> = ({
  note,
  actionTargetNote,
  index,
  textContent,
  repostOriginal,
  isMobile,
  isNotePage,
  imageMode,
  hasNoteText,
  hasRepostTarget,
  isQuoteRepost,
  imageUrls,
  videoUrls,
  hasMediaError,
  asciiCache,
  displayUserNameOrNpub,
  isDisplayNameLoading,
  npubForLinks,
  hasParent,
  hasRoot,
  parentNoteId,
  rootNoteId,
  parentDisplayName,
  isParentDisplayNameLoading = false,
  parentNpubForLinks,
  parentNoteNotFound = false,
  repostTargetId,
  repostTargetDisplayName,
  isRepostTargetDisplayNameLoading = false,
  repostTargetNpubForLinks,
  likes,
  hasLikedByMe,
  isReactionsLoading,
  isSendingReaction,
  hasZappedByMe,
  useAscii = false,
  useColor = false,
  isIOSPWA,
  getDisplayNameForPubkey,
  onHashtagClick,
  setFullScreenImage,
  onAsciiRendered,
  onMediaLoadError,
  onImageDimensionsLoaded,
  prefetchRoute,
  prefetchNote,
  goToNote,
  openRepost,
  openReply,
  handleLike,
  readRelayUrls,
  setShowZapModal,
  onShare,
  replyCount = 0,
  showFullContent = false,
  totalSats = 0,
  recipientName,
  isBookmarked = false,
  toggleBookmark,
}) => {
  const isDarkMode = useUIStore((state) => state.isDarkMode);

  // Note: Images now display at natural heights without feed/detail view constraints

  // Allow images to display at natural heights - no artificial constraints
  // Images should be unconstrained to show at their proper aspect ratios

  // Derive NIP-23 (kind 30023) article metadata
  const articleTitle: string | null = React.useMemo(() => {
    try {
      if ((note as any)?.kind !== 30023) return null;
      const titleTag = (note.tags || []).find(
        (t) => Array.isArray(t) && t[0] === "title"
      );
      return (titleTag?.[1] as string) || null;
    } catch {
      return null;
    }
  }, [note]);

  const articleSummary: string | null = React.useMemo(() => {
    try {
      if ((note as any)?.kind !== 30023) return null;
      const summaryTag = (note.tags || []).find(
        (t) => Array.isArray(t) && t[0] === "summary"
      );
      return (summaryTag?.[1] as string) || null;
    } catch {
      return null;
    }
  }, [note]);

  const articleImageUrl: string | null = React.useMemo(() => {
    try {
      if ((note as any)?.kind !== 30023) return null;
      const imageTag = (note.tags || []).find(
        (t) => Array.isArray(t) && t[0] === "image"
      );
      const url = (imageTag?.[1] as string) || null;
      return url && typeof url === "string" && url.length > 0 ? url : null;
    } catch {
      return null;
    }
  }, [note]);

  const articleNaddr: string | null = React.useMemo(() => {
    try {
      if ((note as any)?.kind !== 30023) return null;
      const dTag = (note.tags || []).find(
        (t) => Array.isArray(t) && t[0] === "d"
      );
      const identifier = (dTag?.[1] as string) || "";
      if (!identifier) return null;
      return nip19.naddrEncode({
        kind: 30023,
        pubkey: note.pubkey,
        identifier,
      });
    } catch {
      return null;
    }
  }, [note]);

  const isArticle = (note as any)?.kind === 30023;

  return (
    <div
      className="note-content"
      style={{
        width: "100%",
        maxWidth: !isMobile ? "1000px" : "100%",
        marginBottom: isMobile ? "0" : "0.25rem", // Further reduced for better density
        position: "relative",
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        flex: "none", // Always use flex: none to let content determine size
        minHeight: "auto",
        // Don't apply height constraints to the entire container - it includes ActionButtonsBar
        alignItems: isMobile
          ? imageUrls.length === 0
            ? "flex-start"
            : "center"
          : "flex-start", // Always left-align on desktop
        justifyContent: isMobile
          ? imageUrls.length === 0
            ? "flex-start"
            : "flex-start"
          : "flex-start",
        paddingLeft: !isMobile ? "0.825rem" : "0",
        boxSizing: "border-box",
        overflowX: "hidden",

        // backgroundColor:
        //   isDarkMode || isMobile ? "var(--app-secondary-bg-color)" : "#ffffff",
      }}
    >
      {/* User metadata and time - Above content on mobile */}
      {isMobile && (
        <>
          <NoteHeader
            noteId={note.id}
            noteCreatedAt={note.created_at || 0}
            displayUserNameOrNpub={displayUserNameOrNpub}
            isDisplayNameLoading={isDisplayNameLoading}
            npubForLinks={npubForLinks}
            hasParent={hasParent}
            hasRoot={hasRoot}
            parentNoteId={parentNoteId}
            rootNoteId={rootNoteId}
            parentDisplayName={parentDisplayName}
            isParentDisplayNameLoading={isParentDisplayNameLoading}
            parentNpubForLinks={parentNpubForLinks}
            parentNoteNotFound={parentNoteNotFound}
            hasRepostTarget={hasRepostTarget}
            repostTargetId={repostTargetId}
            repostTargetDisplayName={repostTargetDisplayName}
            isRepostTargetDisplayNameLoading={isRepostTargetDisplayNameLoading}
            repostTargetNpubForLinks={repostTargetNpubForLinks}
            prefetchRoute={prefetchRoute}
            prefetchNote={prefetchNote}
            goToNote={goToNote}
            isNotePage={isNotePage}
            isMobile={isMobile}
            onShare={onShare}
            replyCount={replyCount}
            totalSats={totalSats}
            recipientName={recipientName}
          />
        </>
      )}

      {/* Note Container */}
      <div
        style={{
          display: "flex",
          flexDirection: isMobile ? "column" : !imageMode ? "column" : "row",
          width: !isMobile ? "calc(100% - 2rem)" : "100%",
          maxWidth: isMobile ? "100%" : "95%",
          flex: "none", // Let content determine size naturally
          minHeight: "auto",
          // Remove fixed height constraints - let content flow naturally
          height: "auto",
          maxHeight: "none",
          borderRadius: isDarkMode ? "4px" : "0",
          // border: "1px solid var(--border-color)",
          border:
            isDarkMode || isMobile ? "none" : "1px solid var(--border-color)",
          marginBottom: !isMobile ? "1rem" : "0",
          backgroundColor: isMobile
            ? "transparent"
            : isDarkMode
              ? "var(--ibm-dark-gray)"
              : "#ffffff",
          // margin: "0 auto",
          position: "relative",
          overflow: "visible", // Allow content to be visible
          overflowX: "visible", // Allow horizontal overflow for the connection line
          overflowY: "visible", // Allow vertical overflow
          boxSizing: "border-box",
          // Add solid border around note content for desktop tree view
          // border: !isMobile ? "1px solid var(--border-color)" : "none",

          // Position the note content to the right of the vertical line (which starts at left: 0)
          margin: !isMobile ? "0 2rem" : "0",
        }}
      >
        {/* Article title for NIP-23 - below author header, above media/text (mobile feed only) */}
        {isMobile &&
          !isNotePage &&
          (note as any)?.kind === 30023 &&
          articleTitle && (
            <div
              style={{
                width: "100%",
                padding: isMobile
                  ? "0 1rem 0.25rem 0.5rem"
                  : "0 1rem 0.5rem 1rem",
                color: "var(--text-color)",
                fontWeight: 600,
                fontSize: isMobile ? "1rem" : "1.05rem",
                textAlign: "left",
              }}
            >
              {articleTitle}
            </div>
          )}
        {/* Vertical connection line from desktop header to note content */}
        {!isMobile && (
          <div
            style={{
              position: "absolute",
              // Position at the left edge of the display name column
              left: "-2rem", // Position at the vertical line location
              top: "-2rem", // Start from above the note content (where header ends)
              width: "2px",
              // Height extends from above the note content to the center of this note content
              height: "calc(2rem + 50%)", // 2rem gap + 50% of note content height
              backgroundColor: "var(--border-color)",
              zIndex: 10, // Very high z-index to ensure it's visible
              pointerEvents: "none", // Prevent interference with interactions
            }}
          />
        )}

        {/* Horizontal connection line for desktop tree view */}
        {!isMobile && (
          <div
            style={{
              position: "absolute",
              // Position to connect with the vertical line from the desktop header
              // The vertical line starts at left: 0, and the container has marginLeft: 2rem
              // So the horizontal line needs to extend back to the vertical line position
              left: "-2rem", // Extend left to connect with vertical line
              top: "50%", // Center vertically within the note content
              width: "2rem", // Width to reach the vertical line
              height: "2px",
              backgroundColor: "var(--border-color)",
              zIndex: 10, // Very high z-index to ensure it's visible
              transform: "translateY(-50%)", // Center the line vertically
              pointerEvents: "none", // Prevent interference with interactions
            }}
          />
        )}
        {/* Media Container - Left side on desktop, top on mobile (hidden for repost/quote) */}
        {!hasRepostTarget &&
          !isArticle &&
          (imageUrls.length > 0 || videoUrls.length > 0) &&
          imageMode && (
            <div
              style={{
                display: "flex",
                width: isMobile ? "100%" : hasNoteText ? "50%" : "100%",
                maxWidth: "100%",
                gap: "1rem",
                boxSizing: "border-box",
                position: "relative",
                borderRadius: "4px",
                zIndex: isMobile ? 1 : "auto",
                // Allow images to display at natural heights without constraints
                height: "auto",
                maxHeight: "none", // Remove height constraints to allow natural image sizing
                minHeight: "auto",
                overflowY: "visible", // Allow content to be visible at natural heights
                overflowX: "hidden",
              }}
            >
              {imageMode && (
                <MediaGallery
                  noteId={note.id}
                  index={index}
                  imageUrls={imageUrls}
                  videoUrls={videoUrls}
                  isMobile={isMobile}
                  useAscii={useAscii}
                  useColor={useColor}
                  asciiCache={asciiCache}
                  setFullScreenImage={setFullScreenImage}
                  onAsciiRendered={onAsciiRendered}
                  onMediaLoadError={onMediaLoadError}
                  onImageDimensionsLoaded={onImageDimensionsLoaded}
                  isInFeed={!isNotePage}
                  // Let EnhancedImageGallery compute a dynamic grid height based on actual dimensions.
                  // When provided by virtualization, this prop can override.
                  fixedHeight={undefined}
                  imageMode={imageMode}
                />
              )}
            </div>
          )}

        {/* Article preview image (from NIP-23 image tag) - shown in feed previews when available */}
        {!hasRepostTarget &&
          isArticle &&
          !!articleImageUrl &&
          imageMode && (
            <div
              style={{
                display: "flex",
                width: isMobile ? "100%" : hasNoteText ? "50%" : "100%",
                maxWidth: "100%",
                gap: "1rem",
                boxSizing: "border-box",
                position: "relative",
                borderRadius: "4px",
                zIndex: isMobile ? 1 : "auto",
                height: "auto",
                maxHeight: "none",
                minHeight: "auto",
                overflowY: "visible",
                overflowX: "hidden",
                padding: isMobile ? "0 1rem" : "0 1rem 0 0",
              }}
            >
              <CORSImage
                url={articleImageUrl}
                isLoading={false}
                onClick={() => {}}
                onLoad={() => {}}
                onError={() => {}}
                isMobile={isMobile}
                style={{
                  width: "100%",
                  height: "auto",
                  objectFit: "cover",
                  borderRadius: "4px",
                }}
                showPlaceholder={true}
              />
            </div>
          )}

        {/* Note Text - Right side on desktop, below user metadata on mobile when no images */}
        <NoteTextContent
          textContent={textContent}
          hasNoteText={hasNoteText}
          hasRepostTarget={hasRepostTarget}
          imageUrls={imageUrls}
          hasMediaError={hasMediaError || false}
          imageMode={imageMode}
          isMobile={isMobile}
          isIOSPWA={isIOSPWA}
          useAscii={useAscii}
          useColor={useColor}
          getDisplayNameForPubkey={getDisplayNameForPubkey}
          onHashtagClick={onHashtagClick}
          // Suppress default View More for NIP-23 articles; we'll show a dedicated Read Full Article link instead
          goToNote={isArticle ? undefined : goToNote}
          showFullContent={showFullContent}
          isArticle={isArticle}
          articleSummary={articleSummary}
        />

        {/* Read Full Article link for NIP-23 previews - above action bar, below preview text (feed only, both mobile and desktop) */}
        {!isNotePage &&
          isArticle &&
          articleNaddr && (
            <div
              style={{
                width: "100%",
                marginTop: "0.5rem",
                padding: isMobile ? "0 1rem" : "0 1rem",
                textAlign: "left",
              }}
            >
              <Link
                to="/article/$addr"
                params={{ addr: articleNaddr }}
                style={{
                  display: "inline-block",
                  color: "var(--link-color)",
                  textDecoration: "underline",
                  fontSize: "0.95rem",
                  cursor: "pointer",
                }}
              >
                Read Full Article
              </Link>
            </div>
          )}

        {/* Repost/Quote nested UI */}
        <QuoteRepostContent
          note={note}
          textContent={textContent}
          repostOriginal={repostOriginal}
          isQuoteRepost={isQuoteRepost}
          hasRepostTarget={hasRepostTarget}
          isMobile={isMobile}
          displayUserNameOrNpub={displayUserNameOrNpub}
          isDisplayNameLoading={isDisplayNameLoading}
          npubForLinks={npubForLinks}
          useAscii={useAscii}
          useColor={useColor}
          imageMode={imageMode}
          asciiCache={asciiCache}
          setFullScreenImage={setFullScreenImage}
          onAsciiRendered={onAsciiRendered}
          onMediaLoadError={onMediaLoadError}
          onImageDimensionsLoaded={onImageDimensionsLoaded}
          getDisplayNameForPubkey={getDisplayNameForPubkey}
          onHashtagClick={onHashtagClick}
          prefetchRoute={prefetchRoute}
          prefetchNote={prefetchNote}
          goToNote={goToNote}
        />
      </div>
      {/* Action buttons bar - only show on mobile or in note detail page */}
      {(isMobile || isNotePage) && (
        <ActionButtonsBar
          noteId={actionTargetNote.id}
          noteAuthorPubkey={actionTargetNote.pubkey}
          isMobile={isMobile}
          index={index}
          likes={likes}
          hasLikedByMe={hasLikedByMe}
          isReactionsLoading={isReactionsLoading}
          isSendingReaction={isSendingReaction}
          hasZappedByMe={hasZappedByMe}
          openRepost={openRepost}
          openReply={openReply}
          handleLike={handleLike}
          goToNote={goToNote}
          prefetchNote={prefetchNote}
          readRelayUrls={readRelayUrls}
          getDisplayNameForPubkey={getDisplayNameForPubkey}
          setShowZapModal={setShowZapModal}
          onShare={onShare}
          replyCount={replyCount}
          hasParent={hasParent}
          hasRoot={hasRoot}
          parentNoteId={parentNoteId}
          rootNoteId={rootNoteId}
          hasRepostTarget={hasRepostTarget}
          repostTargetId={repostTargetId}
          prefetchRoute={prefetchRoute}
          isBookmarked={isBookmarked}
          toggleBookmark={toggleBookmark}
        />
      )}
      {/* Removed bottom Read Full Article link per mobile article UX update */}
      <div
        style={{
          // borderTop: "1px dotted var(--border-color)",
          width: "100%",
          margin: "3rem 0 0rem 0",
        }}
      />
    </div>
  );
};
