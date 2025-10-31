import React, { useState, useEffect, useMemo } from "react";
import { buildLinkMetadata } from "../../utils/linkPreview";
import type { LinkMetadata } from "../../utils/linkPreview";

export interface LinkPreviewCardProps {
  url: string;
  onLinkClick?: (url: string) => void;
  compact?: boolean;
  showFavicon?: boolean;
}

interface LoadingState {
  isLoading: boolean;
  metadata: LinkMetadata | null;
  error: boolean;
}

/**
 * Check if URL is from X.com/Twitter
 */
function isTwitterUrl(url: string): boolean {
  try {
    const domain = new URL(url).hostname.toLowerCase();
    return domain.includes("twitter.com") || domain.includes("x.com");
  } catch {
    return false;
  }
}

const LinkPreviewCard: React.FC<LinkPreviewCardProps> = ({
  url,
  onLinkClick,
  compact = false,
  showFavicon = true,
}) => {
  const [state, setState] = useState<LoadingState>({
    isLoading: true,
    metadata: null,
    error: false,
  });

  useEffect(() => {
    let mounted = true;

    const fetchMetadata = async () => {
      try {
        setState({ isLoading: true, metadata: null, error: false });
        const metadata = await buildLinkMetadata(url);

        if (mounted) {
          if (metadata) {
            setState({ isLoading: false, metadata, error: false });
          } else {
            setState({ isLoading: false, metadata: null, error: true });
          }
        }
      } catch (error) {
        console.error("Error fetching link metadata:", error);
        if (mounted) {
          setState({ isLoading: false, metadata: null, error: true });
        }
      }
    };

    fetchMetadata();

    return () => {
      mounted = false;
    };
  }, [url]);

  const { metadata } = state;

  // Truncate text to specified length
  const truncateText = (
    text: string | undefined,
    maxLength: number
  ): string => {
    if (!text) return "";
    return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
  };

  // Extract domain display name
  const displayDomain = useMemo(() => {
    if (!metadata?.domain) return "Link";
    // Remove www. prefix for cleaner display
    return metadata.domain.replace(/^www\./, "");
  }, [metadata?.domain]);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onLinkClick) {
      e.preventDefault();
      onLinkClick(url);
    }
    // If no onLinkClick, let the <a> tag handle the navigation naturally
  };

  // Determine if this is a Twitter/X.com link
  const isTwitter = useMemo(() => isTwitterUrl(url), [url]);

  // Don't show loading state - only render when preview is loaded
  if (state.isLoading) {
    return null;
  }

  if (state.error || !metadata) {
    // Fallback minimal preview when metadata fetch fails
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          padding: "0.75rem",
          backgroundColor: "var(--background-secondary)",
          borderRadius: "0.5rem",
          border: "1px solid var(--border-color)",
          cursor: "pointer",
          transition: "background-color 0.2s",
          textDecoration: "none",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.backgroundColor =
            "var(--background-tertiary)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.backgroundColor =
            "var(--background-secondary)";
        }}
      >
        {showFavicon && metadata?.faviconUrl && (
          <img
            src={metadata.faviconUrl}
            alt="favicon"
            style={{
              width: "24px",
              height: "24px",
              borderRadius: "0.25rem",
              flexShrink: 0,
            }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: "0.875rem",
              fontWeight: 500,
              color: "var(--link-external)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {displayDomain}
          </div>
        </div>
      </a>
    );
  }

  const maxTitleLength = compact ? 60 : 100;
  const maxDescriptionLength = compact ? 80 : 160;

  // Special rendering for Twitter/X.com links - prioritize text content
  if (isTwitter) {
    // Double the text limits for Twitter previews to show more content
    const twitterMaxTitleLength = (maxTitleLength + 50) * 2;
    const twitterMaxDescriptionLength = (maxDescriptionLength + 50) * 2;
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          padding: "0.75rem",
          backgroundColor: "var(--background-secondary)",
          borderRadius: "0.5rem",
          border: "1px solid var(--border-color)",
          cursor: "pointer",
          transition: "all 0.2s",
          overflow: "hidden",
          textDecoration: "none",
          color: "inherit",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.backgroundColor =
            "var(--background-tertiary)";
          (e.currentTarget as HTMLAnchorElement).style.borderColor =
            "var(--link-external)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.backgroundColor =
            "var(--background-secondary)";
          (e.currentTarget as HTMLAnchorElement).style.borderColor =
            "var(--border-color)";
        }}
      >
        {/* Header with avatar, favicon and domain */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              fontSize: "0.75rem",
              color: "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              flex: 1,
              minWidth: 0,
            }}
          >
            {showFavicon && metadata?.faviconUrl && (
              <img
                src={metadata.faviconUrl}
                alt="favicon"
                style={{
                  width: "16px",
                  height: "16px",
                  borderRadius: "50%",
                  flexShrink: 0,
                }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            )}
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {displayDomain}
            </span>
          </div>

          {/* Avatar image (from tweet author) */}
          {metadata?.image && (
            <img
              src={metadata.image}
              alt="Author avatar"
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                flexShrink: 0,
                objectFit: "cover",
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          )}
        </div>

        {/* Title */}
        {metadata?.title && (
          <div
            style={{
              fontSize: "0.9375rem",
              fontWeight: 700,
              color: "var(--text-color)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: compact ? 3 : 4,
              WebkitBoxOrient: "vertical",
              wordBreak: "break-word",
              lineHeight: "1.3",
            }}
            title={metadata.title}
          >
            {truncateText(metadata.title, twitterMaxTitleLength)}
          </div>
        )}

        {/* Description - show on Twitter links even in compact mode */}
        {metadata?.description && (
          <div
            style={{
              fontSize: "0.8125rem",
              color: "var(--text-secondary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: compact ? 3 : 4,
              WebkitBoxOrient: "vertical",
              wordBreak: "break-word",
              lineHeight: "1.35",
            }}
            title={metadata.description}
          >
            {truncateText(metadata.description, twitterMaxDescriptionLength)}
          </div>
        )}
      </a>
    );
  }

  // Standard layout for non-Twitter links
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      style={{
        display: "flex",
        flexDirection: "row",
        gap: "0.75rem",
        padding: "0.75rem",
        backgroundColor: "var(--background-secondary)",
        borderRadius: "0.5rem",
        border: "1px solid var(--border-color)",
        cursor: "pointer",
        transition: "all 0.2s",
        overflow: "hidden",
        textDecoration: "none",
        color: "inherit",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.backgroundColor =
          "var(--background-tertiary)";
        (e.currentTarget as HTMLAnchorElement).style.borderColor =
          "var(--link-external)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.backgroundColor =
          "var(--background-secondary)";
        (e.currentTarget as HTMLAnchorElement).style.borderColor =
          "var(--border-color)";
      }}
    >
      {/* Preview image on the right */}
      {metadata?.image && !compact && (
        <div
          style={{
            flexShrink: 0,
            width: "100px",
            height: "100px",
            borderRadius: "0.375rem",
            overflow: "hidden",
            backgroundColor: "var(--background-primary)",
          }}
        >
          <img
            src={metadata.image}
            alt={metadata.title || "Preview"}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      )}

      {/* Content section */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
        }}
      >
        {/* Title */}
        {metadata?.title && (
          <div
            style={{
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "var(--text-color)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: compact ? 1 : 2,
              WebkitBoxOrient: "vertical",
              wordBreak: "break-word",
            }}
            title={metadata.title}
          >
            {truncateText(metadata.title, maxTitleLength)}
          </div>
        )}

        {/* Description */}
        {metadata?.description && !compact && (
          <div
            style={{
              fontSize: "0.75rem",
              color: "var(--text-secondary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              wordBreak: "break-word",
            }}
            title={metadata.description}
          >
            {truncateText(metadata.description, maxDescriptionLength)}
          </div>
        )}

        {/* Domain */}
        <div
          style={{
            fontSize: "0.75rem",
            color: "var(--text-secondary)",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          {showFavicon && metadata?.faviconUrl && (
            <img
              src={metadata.faviconUrl}
              alt="favicon"
              style={{
                width: "16px",
                height: "16px",
                borderRadius: "0.125rem",
                flexShrink: 0,
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          )}
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {displayDomain}
          </span>
        </div>
      </div>
    </a>
  );
};

export default LinkPreviewCard;
