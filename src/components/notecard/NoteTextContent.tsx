import React from "react";
import NoteContentRenderer from "../NoteContentRenderer";
import { BasicMarkdown } from "../ArticlePage";
import { useUIStore } from "../lib/useUIStore";

export interface NoteTextContentProps {
  // Content data
  textContent: string;
  hasNoteText: boolean;
  hasRepostTarget: boolean;

  // Media state
  imageUrls: string[];
  hasMediaError: boolean;
  imageMode: boolean;

  // Display options
  isMobile: boolean;
  isIOSPWA: boolean;
  useAscii?: boolean;
  useColor?: boolean;
  showFullContent?: boolean;

  // Article-specific props
  isArticle?: boolean;
  articleSummary?: string | null;

  // Handlers
  getDisplayNameForPubkey: (pubkey: string) => string;
  onHashtagClick?: (hashtag: string) => void;
  goToNote?: () => void;
}

export const NoteTextContent: React.FC<NoteTextContentProps> = ({
  textContent,
  hasNoteText,
  hasRepostTarget,
  imageUrls,
  hasMediaError,
  imageMode,
  isMobile,
  isIOSPWA,
  useAscii = false,
  useColor = false,
  showFullContent = false,
  isArticle = false,
  articleSummary = null,
  getDisplayNameForPubkey,
  onHashtagClick,
  goToNote,
}) => {
  if (!hasNoteText || hasRepostTarget) {
    return null;
  }

  const isDarkMode = useUIStore((state) => state.isDarkMode);

  const isTextOnly = imageUrls.length === 0 || hasMediaError;
  const shouldCenter = false; // Always left-align notes on desktop

  // Removed link preview fetching since we're not showing previews in long form feed content
  // const { linkPreviews, isLoading: isLoadingPreviews } = useLinkPreviews(
  //   textContent,
  //   true
  // );

  // const linkUrls = extractNonMediaUrls(textContent);

  // Extract preview content from article (used when article has no summary)
  // Always respects the maxCharacters limit for feed display
  const extractArticlePreview = (
    text: string,
    maxCharacters: number
  ): string => {
    // If text is shorter than limit, return as-is
    if (text.length <= maxCharacters) {
      return text;
    }

    // Truncate to limit first
    const previewText = text.substring(0, maxCharacters);

    // Try to find a paragraph break (double newline) within the limit
    const firstParagraphBreak = previewText.indexOf("\n\n");
    if (firstParagraphBreak !== -1 && firstParagraphBreak > 50) {
      // Found a paragraph break at a reasonable position (at least 50 chars)
      return text.substring(0, firstParagraphBreak).trim();
    }

    // Otherwise, try to end at a sentence boundary within the limit
    const lastPeriod = previewText.lastIndexOf(".");
    const lastExclamation = previewText.lastIndexOf("!");
    const lastQuestion = previewText.lastIndexOf("?");
    const lastSentenceEnd = Math.max(lastPeriod, lastExclamation, lastQuestion);

    if (lastSentenceEnd > 50) {
      // Found a sentence end at a reasonable position (at least 50 chars)
      return text.substring(0, lastSentenceEnd + 1).trim();
    }

    // Fall back to truncated text at the limit (no ellipsis - Read Full Article link follows)
    return previewText.trim();
  };

  // Calculate text truncation based on character count (140 on mobile, 420 on desktop)
  // For articles in feed mode, use summary or first paragraph instead of full content
  const calculateTruncationPoint = (
    text: string,
    maxCharacters: number
  ): { shouldTruncate: boolean; displayText: string } => {
    // For articles in feed mode (not showFullContent), use summary or first paragraph
    if (isArticle && !showFullContent) {
      if (articleSummary) {
        // Use the provided summary, but enforce max character preview just like content
        const summaryPreview = extractArticlePreview(
          articleSummary,
          maxCharacters
        );
        return { shouldTruncate: false, displayText: summaryPreview };
      } else {
        // Extract preview content with fixed limit (respects mobile/desktop limits)
        const preview = extractArticlePreview(text, maxCharacters);
        return { shouldTruncate: false, displayText: preview };
      }
    }

    if (showFullContent) {
      return { shouldTruncate: false, displayText: text };
    }

    const shouldTruncate = text.length > maxCharacters;
    if (!shouldTruncate) {
      return { shouldTruncate: false, displayText: text };
    }

    // Start with the character limit
    let truncatedText = text.substring(0, maxCharacters).trim();

    // Check if we're in the middle of a URL (starts with http)
    const lastHttpIndex = truncatedText.lastIndexOf("http");

    if (lastHttpIndex !== -1) {
      // Check if there's a space after this position (URL end) or if URL continues beyond truncation
      const potentialUrlStart = lastHttpIndex;
      const spaceAfterHttp = truncatedText.indexOf(" ", potentialUrlStart);

      if (spaceAfterHttp === -1) {
        // No space found - we're cutting a URL, so truncate before it started
        truncatedText = truncatedText.substring(0, potentialUrlStart).trim();
      }
    }

    return {
      shouldTruncate: true,
      displayText: truncatedText + "...",
    };
  };

  // Use different character limits based on screen size (140 mobile, 420 desktop for more space)
  const characterLimit = isMobile ? 140 : 420;
  const { shouldTruncate, displayText } = calculateTruncationPoint(
    textContent,
    characterLimit
  );

  return (
    <div
      className={`note-text ${isMobile ? "note-text-mobile" : ""} ${
        isIOSPWA ? "note-text-ios-pwa" : ""
      }`}
      style={{
        textAlign: "left",
        color: "var(--text-color)",
        fontSize: "var(--font-size-sm)",
        minHeight: isMobile ? "auto" : 0,
        maxWidth: "100%",
        lineHeight: "var(--line-height-normal)",
        wordBreak: "break-word",
        overflowWrap: "break-word",
        width: isMobile ? "100%" : isTextOnly || !imageMode ? "100%" : "50%",
        whiteSpace: "pre-wrap",
        hyphens: "auto",
        padding: isMobile
          ? imageUrls.length === 0
            ? "0.5rem 1rem 0.5rem 1rem" // Further reduced bottom padding
            : "0.5rem 1rem 0.25rem 1rem" // Minimal bottom padding when images present
          : "0 1rem 0.25rem 1rem",
        display: "flex",
        // Let content determine height naturally - no height constraints
        height: "auto",
        overflowX: "hidden",
        // In note view, content flows naturally; in feed view, prevent individual scrollbars
        overflowY: "visible",
        scrollMarginTop: isMobile ? "0" : !imageMode ? "4rem" : "0",
        scrollPaddingTop: isMobile ? "0" : !imageMode ? "4rem" : "0",
        // Dynamic padding based on text length and centering needs - reduced excessive padding
        paddingTop: isMobile
          ? "0"
          : shouldCenter && imageMode
            ? "0"
            : isTextOnly
              ? "0.5rem" // Reduced from 1rem
              : "1rem", // Reduced from 4rem
        flexDirection: !isMobile && !imageMode ? "column" : "row",
        justifyContent: isMobile
          ? "flex-start"
          : shouldCenter && imageMode
            ? "center"
            : "flex-start",
        backgroundColor: isMobile
          ? "var(--app-bg-color)"
          : isDarkMode
            ? "var(--ibm-dark-gray)"
            : "#ffffff",
        zIndex: isMobile ? 1 : "auto",
        touchAction: "pan-y",
        pointerEvents: "auto",
        margin: "0",
        alignItems: isMobile
          ? "flex-start"
          : shouldCenter
            ? "center"
            : "flex-start",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          flex: !isMobile && !imageMode ? 1 : shouldCenter ? "none" : 1,
          overflowX: "hidden",
          // Always allow text to be visible - main container handles scrolling
          overflowY: "visible",
          width:
            !isMobile && !imageMode ? "100%" : shouldCenter ? "auto" : "100%",
          textAlign: isTextOnly ? (isMobile ? "start" : "start") : "inherit",
          alignSelf:
            !isMobile && !imageMode
              ? "stretch"
              : shouldCenter
                ? "center"
                : "auto",
          maxWidth:
            !isMobile && !imageMode ? "100%" : shouldCenter ? "80%" : "none",
          paddingTop: "inherit",
        }}
      >
        {isArticle ? (
          <BasicMarkdown content={displayText} />
        ) : (
          <NoteContentRenderer
            content={displayText}
            useAscii={useAscii}
            useColor={useColor}
            imageMode={imageMode}
            getDisplayNameForPubkey={getDisplayNameForPubkey}
            onHashtagClick={onHashtagClick}
            showLinkPreviews={true}
            maxLinkPreviewsToShow={3}
          />
        )}

        {/* View More button for long text - show when truncated */}
        {shouldTruncate && goToNote && (
          <button
            onClick={goToNote}
            style={{
              color: "var(--text-color)",
              fontSize: "var(--font-size-sm)",
              cursor: "pointer",
              textDecoration: "underline",
              backgroundColor: "transparent",
              border: "none",
              padding: "0.25rem 0",
              marginTop: "0.5rem",
              display: "block",
            }}
          >
            View More
          </button>
        )}

        {/* Link previews removed from long form feed content */}
      </div>
    </div>
  );
};
