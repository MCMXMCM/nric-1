import React from "react";

interface VideoPlaceholderProps {
  videoUrls: string[];
  isMobile: boolean;
  noteId: string;
  onVideoClick?: (url: string) => void;
}

export const VideoPlaceholder: React.FC<VideoPlaceholderProps> = ({
  videoUrls,
  isMobile,
  noteId,
  onVideoClick,
}) => {
  if (!videoUrls.length) return null;

  const handleVideoClick = (url: string) => {
    if (onVideoClick) {
      onVideoClick(url);
    }
  };

  return (
    <div
      style={{
        marginTop: "0.5rem",
        marginBottom: "0.5rem",
        width: "100%",
        minHeight: isMobile ? "200px" : "250px",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
      }}
    >
      {videoUrls.map((url, index) => (
        <div
          key={`${noteId}-video-placeholder-${index}`}
          onClick={() => handleVideoClick(url)}
          style={{
            width: "100%",
            height: isMobile ? "200px" : "250px",
            backgroundColor: "var(--surface-color)",
            border: "2px dashed var(--border-color)",
            borderRadius: "8px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "all 0.2s ease",
            padding: "1rem",
            boxSizing: "border-box",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--accent-color)";
            e.currentTarget.style.backgroundColor = "var(--surface-hover)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border-color)";
            e.currentTarget.style.backgroundColor = "var(--surface-color)";
          }}
        >
          {/* Play icon */}
          <div
            style={{
              width: "64px",
              height: "64px",
              backgroundColor: "var(--accent-color)",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "1rem",
              opacity: 0.8,
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ color: "var(--app-bg-color)", marginLeft: "2px" }}
            >
              <polygon points="5,3 19,12 5,21" />
            </svg>
          </div>

          {/* Video info */}
          <div
            style={{
              textAlign: "center",
              color: "var(--text-color)",
              fontSize: "0.875rem",
              lineHeight: "1.4",
            }}
          >
            <div style={{ fontWeight: "500", marginBottom: "0.25rem" }}>
              Video Content
            </div>
            <div
              style={{
                color: "var(--text-muted)",
                fontSize: "0.75rem",
                wordBreak: "break-all",
                maxWidth: "100%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {url}
            </div>
            <div
              style={{
                color: "var(--accent-color)",
                fontSize: "0.75rem",
                marginTop: "0.5rem",
                fontWeight: "500",
              }}
            >
              Click to view video
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
