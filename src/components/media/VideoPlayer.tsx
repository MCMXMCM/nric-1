import React, { useState, useRef, useCallback } from "react";

interface VideoPlayerProps {
  url: string;
  useAscii: boolean;
  imageMode: boolean;
  onExpandContainer?: () => void;
}

const VideoAsciiPlaceholder: React.FC<{ url: string; onPlay: () => void }> = ({
  url,
  onPlay,
}) => {
  return (
    <div
      onClick={onPlay}
      style={{
        width: "100%",
        height: "200px",
        backgroundColor: "var(--surface-color)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        transition: "all 0.2s ease",
        padding: "1rem",
        boxSizing: "border-box",
        margin: "0.5rem 0",
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
      {/* Video icon */}
      <div
        style={{
          width: "64px",
          height: "64px",
          backgroundColor: "var(--accent-color)",
          borderRadius: "8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "1rem",
          opacity: 0.8,
        }}
      >
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: "var(--app-bg-color)" }}
        >
          <polygon points="23 7 16 12 23 17 23 7" />
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
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
          Video Link
        </div>
        <div
          style={{
            color: "var(--text-muted)",
            fontSize: "0.75rem",
            wordBreak: "break-all",
            maxWidth: "100%",
            overflow: "hidden",
            overflowWrap: "anywhere",
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
  );
};

const FullVideoPlayer: React.FC<{ url: string; onClose?: () => void }> = ({
  url,
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const toggleFullscreen = useCallback(() => {
    if (!videoRef.current) return;

    if (!isFullscreen) {
      // Check if fullscreen is supported and not on mobile
      if (
        videoRef.current.requestFullscreen &&
        !/Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent
        )
      ) {
        videoRef.current.requestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }, [isFullscreen]);

  React.useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === videoRef.current);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Always use fragment identifier for better thumbnail generation
  const videoSrc = `${url}#t=0.001`;

  return (
    <div
      style={{
        width: "100%",
        position: "relative",
        // borderRadius: "8px",
        overflow: "hidden",
        backgroundColor: "#000",
      }}
    >
      <video
        ref={videoRef}
        controls
        playsInline
        style={{
          width: "100%",
          height: "auto",
          maxHeight: "70vh",
          display: "block",
        }}
        onError={() => {
          console.error("Failed to load video:", url);
        }}
      >
        <source src={videoSrc} type="video/mp4" />
        <source src={videoSrc} type="video/webm" />
        <source src={videoSrc} type="video/quicktime" />
        Your browser does not support the video tag.
      </video>

      {/* Custom fullscreen button - hidden on mobile */}
      {!/Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      ) && (
        <button
          onClick={toggleFullscreen}
          style={{
            position: "absolute",
            top: "8px",
            right: "8px",
            background: "rgba(0, 0, 0, 0.7)",
            border: "none",
            borderRadius: "4px",
            color: "white",
            padding: "8px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
          }}
          title="Toggle fullscreen"
        >
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
            {isFullscreen ? (
              <>
                <path d="M8 3v3a2 2 0 0 1-2 2H3" />
                <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
                <path d="M3 16h3a2 2 0 0 1 2 2v3" />
                <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
              </>
            ) : (
              <>
                <path d="M15 3h6v6" />
                <path d="M9 21H3v-6" />
                <path d="M21 3l-7 7" />
                <path d="M3 21l7-7" />
              </>
            )}
          </svg>
        </button>
      )}
    </div>
  );
};

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  url,
  useAscii,
  imageMode,
  onExpandContainer,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);

  const handlePlay = useCallback(() => {
    if (onExpandContainer) {
      onExpandContainer();
    }
    setIsPlaying(true);
  }, [onExpandContainer]);

  // In ASCII mode, always show placeholder regardless of imageMode
  if (useAscii) {
    return isPlaying ? (
      <FullVideoPlayer url={url} />
    ) : (
      <VideoAsciiPlaceholder url={url} onPlay={handlePlay} />
    );
  }

  // In non-ASCII mode, only show video if imageMode is enabled
  if (!imageMode) {
    return null;
  }

  // Regular image mode with video player - directly show the video with controls
  return (
    <div style={{ marginTop: "0.5rem", marginBottom: "0.5rem" }}>
      <FullVideoPlayer url={url} />
    </div>
  );
};
