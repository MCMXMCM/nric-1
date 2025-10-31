import React, { useMemo } from "react";
import LinkPreviewCard from "./LinkPreviewCard";
import type { LinkMetadata } from "../../utils/linkPreview";

export interface LinkPreviewGalleryProps {
  linkUrls: string[];
  linkMetadata: Map<string, LinkMetadata | null>;
  isLoading?: boolean;
  onLinkClick?: (url: string) => void;
  compact?: boolean;
  maxPreviewsToShow?: number;
}

const LinkPreviewGallery: React.FC<LinkPreviewGalleryProps> = ({
  linkUrls,
  linkMetadata: _linkMetadata,
  isLoading: _isLoading = false,
  onLinkClick,
  compact = false,
  maxPreviewsToShow = 3,
}) => {
  // Filter to only URLs with metadata available
  const previewsToShow = useMemo(() => {
    return linkUrls.slice(0, maxPreviewsToShow);
  }, [linkUrls, maxPreviewsToShow]);

  if (previewsToShow.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        marginTop: "0.75rem",
        paddingTop: "0.75rem",
      }}
    >
      {previewsToShow.map((url) => (
        <LinkPreviewCard
          key={url}
          url={url}
          onLinkClick={onLinkClick}
          compact={compact}
          showFavicon={!compact}
        />
      ))}
      {linkUrls.length > maxPreviewsToShow && (
        <div
          style={{
            fontSize: "0.75rem",
            color: "var(--text-secondary)",
            padding: "0.5rem 0",
          }}
        >
          +{linkUrls.length - maxPreviewsToShow} more link
          {linkUrls.length - maxPreviewsToShow > 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
};

export default LinkPreviewGallery;
