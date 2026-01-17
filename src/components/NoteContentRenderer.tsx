import React, { useState, useCallback } from "react";
import { extractImageUrls, extractVideoUrls } from "../utils/nostr/utils";
import AsciiRendererV2 from "./AsciiRendererV2";
import LoadingSpinner from "./ui/LoadingSpinner";
import NostrLinkText from "./NostrLinkText";
import { CORSImage } from "./media/CORSImage";
import { MediaGallery } from "./media/MediaGallery";
import { formatMediaUrl } from "../utils/formatMediaUrl";

interface NoteContentRendererProps {
  content: string;
  useAscii: boolean;
  useColor: boolean;
  imageMode?: boolean;
  onImageClick?: (url: string) => void;
  onExpandContainer?: () => void;
  style?: React.CSSProperties;
  className?: string;
  getDisplayNameForPubkey?: (pubkey: string) => string;
  onHashtagClick?: (hashtag: string) => void;
  renderNoteLinkAsThread?: boolean;
  noteLinkLabel?: string;
  // MediaGallery props
  noteId?: string;
  index?: number;
  asciiCache?: Record<string, { ascii: string; timestamp: number }>;
  setFullScreenImage?: (url: string) => void;
  onAsciiRendered?: (url: string, ascii: string) => void;
  onMediaLoadError?: (url: string) => void;
  onImageDimensionsLoaded?: (
    noteId: string,
    imageUrl: string,
    dimensions: { width: number; height: number }
  ) => void;
}

const NoteContentRenderer: React.FC<NoteContentRendererProps> = ({
  content,
  useAscii,
  useColor,
  imageMode = true,
  onImageClick,
  onExpandContainer,
  style,
  className,
  getDisplayNameForPubkey = () => "",
  onHashtagClick,
  renderNoteLinkAsThread = false,
  noteLinkLabel,
  // MediaGallery props
  noteId = "unknown",
  index = 0,
  asciiCache = {},
  setFullScreenImage = () => {},
  onAsciiRendered = () => {},
  onMediaLoadError = () => {},
  onImageDimensionsLoaded = () => {},
}) => {
  // Detect mobile device
  const isMobile = typeof window !== "undefined" && window.innerWidth <= 768;
  const [expandedImages, setExpandedImages] = useState<Record<string, boolean>>(
    {}
  );
  const [loadingUrls, setLoadingUrls] = useState<Record<string, boolean>>({});

  const imageUrls = extractImageUrls(content);
  const videoUrls = extractVideoUrls(content);

  const handleImageClick = useCallback(
    (url: string) => {
      // Always request parent to expand so the container can grow to fit the image
      if (onExpandContainer) {
        onExpandContainer();
      }
      if (onImageClick) {
        onImageClick(url);
        return;
      }
      // Toggle expansion if no external handler
      setExpandedImages((prev) => {
        const nextExpanded = !prev[url];
        const next = { ...prev, [url]: nextExpanded };
        return next;
      });
      // When expanding, mark as loading so we can show a spinner until ready
      setLoadingUrls((prev) => ({ ...prev, [url]: true }));
    },
    [onImageClick, onExpandContainer]
  );

  const renderTextWithMediaLinks = (text: string) => {
    if (!text.trim()) return null;

    // Split text by both image and video URLs and render each part
    const parts = text.split(
      /(https?:\/\/[^\s]+\.(?:jpg|jpeg|gif|png|webp|mp4|webm|mov))/gi
    );

    return parts.map((part, index) => {
      if (imageUrls.includes(part)) {
        // When media mode is off, show image inline when expanded, otherwise show link text
        if (!imageMode && expandedImages[part]) {
          // Show the image inline instead of the link text
          return renderInlineImage(part, index);
        } else if (!imageMode) {
          // Show clickable link text when media mode is off and not expanded
          return (
            <span
              key={index}
              onClick={() => handleImageClick(part)}
              style={{
                color: "var(--link-image)",
                cursor: "pointer",
                textDecoration: "underline",
                overflowWrap: "anywhere",
                fontSize: "0.875rem",
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleImageClick(part);
                }
              }}
              title={part} // Show full URL on hover
            >
              {formatMediaUrl(part)}
            </span>
          );
        } else {
          // In media mode, hide image URLs from text since they'll be rendered as gallery below
          return null;
        }
      }
      if (videoUrls.includes(part)) {
        // In ASCII mode, always show video links as clickable text
        // In image mode, hide video URLs from text since they'll be rendered as players below
        if (useAscii || !imageMode) {
          return (
            <span
              key={index}
              onClick={() => onExpandContainer && onExpandContainer()}
              style={{
                color: "var(--link-image)",
                cursor: "pointer",
                textDecoration: "underline",
                overflowWrap: "anywhere",
                fontSize: "0.875rem",
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onExpandContainer && onExpandContainer();
                }
              }}
              title={part} // Show full URL on hover
            >
              {formatMediaUrl(part)}
            </span>
          );
        } else {
          // In image mode, hide the URL text since video will be rendered as player
          return null;
        }
      }
      // Use NostrLinkText for proper linkification of nostr links and other content
      return (
        <NostrLinkText
          key={index}
          text={part}
          getDisplayNameForPubkey={getDisplayNameForPubkey}
          onHashtagClick={onHashtagClick}
          renderNoteLinkAsThread={renderNoteLinkAsThread}
          noteLinkLabel={noteLinkLabel}
        />
      );
    });
  };

  const renderInlineImage = (url: string, key: number) => {
    const isLoading = !!loadingUrls[url];

    return (
      <div
        key={key}
        style={{
          marginTop: "0.25rem",
          marginBottom: "0.25rem",
          width: "100%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          position: "relative",
          minHeight: isLoading ? "200px" : undefined,
          maxHeight: isMobile ? "85vh" : "40vh",
        }}
      >
        {useAscii ? (
          <>
            {isLoading && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 2,
                  width: "100%",
                  height: "100%",
                }}
              >
                <LoadingSpinner size="small" width={400} height={300} />
              </div>
            )}
            <AsciiRendererV2
              src={url}
              type="image"
              useColor={useColor}
              onAsciiRendered={() =>
                setLoadingUrls((prev) => ({ ...prev, [url]: false }))
              }
              onError={() => {
                setLoadingUrls((prev) => ({ ...prev, [url]: false }));
                console.error("Failed to load image for ASCII rendering:", url);
              }}
            />
          </>
        ) : (
          <>
            {isLoading && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 2,
                }}
              >
                <LoadingSpinner size="small" />
              </div>
            )}
            <CORSImage
              url={url}
              isLoading={isLoading}
              style={{
                maxWidth: "100%",
                maxHeight: isMobile ? "85vh" : "40vh",
                borderRadius: "0",
                cursor: "pointer",
                objectFit: "contain",
              }}
              onClick={() => handleImageClick(url)}
              onLoad={() =>
                setLoadingUrls((prev) => ({ ...prev, [url]: false }))
              }
              onError={() => {
                setLoadingUrls((prev) => ({ ...prev, [url]: false }));
                console.error("Failed to load image:", url);
              }}
              isMobile={isMobile}
              enableOptimization={false}
              showPlaceholder={false}
            />
          </>
        )}
      </div>
    );
  };

  return (
    <div style={style} className={className}>
      {renderTextWithMediaLinks(content)}
      {/* Use MediaGallery for multiple images/videos when media mode is on */}
      {imageMode && (imageUrls.length > 0 || videoUrls.length > 0) && (
        <MediaGallery
          noteId={noteId}
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
          isInFeed={false} // We're in thread view, not feed
          fixedHeight={undefined}
          imageMode={imageMode}
        />
      )}
    </div>
  );
};

export default NoteContentRenderer;
