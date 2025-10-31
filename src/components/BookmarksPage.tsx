import React, { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { nip19 } from "nostr-tools";
import { useBookmarks } from "../hooks/useBookmarks";
import { useScrollRestoration } from "../hooks/useScrollRestoration";
import { EnhancedImageGallery } from "./media/EnhancedImageGallery";

const BookmarksPage: React.FC = () => {
  const navigate = useNavigate();
  const { bookmarks, removeBookmark } = useBookmarks();
  const containerRef = useRef<HTMLDivElement>(null);

  // Use scroll restoration hook for the bookmarks page
  useScrollRestoration(containerRef, "bookmarks");

  const isMobileLayout = window.innerWidth <= 768;

  // Image gallery refs
  const imagesLoadingRef = useRef(new Set<string>());
  const imagesErrorRef = useRef(new Set<string>());
  const imagesRetryCountRef = useRef(new Map<string, number>());
  const [asciiCache] = useState<
    Record<string, { ascii: string; timestamp: number }>
  >({});

  // Format date for display
  const formatDate = useCallback((timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year:
        date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
    });
  }, []);

  // Get display name for pubkey
  const getDisplayName = useCallback((pubkey: string) => {
    try {
      return nip19.npubEncode(pubkey).substring(0, 16) + "...";
    } catch {
      return pubkey.substring(0, 16) + "...";
    }
  }, []);

  // Memoized sorted bookmarks
  const sortedBookmarks = useMemo(() => {
    return [...bookmarks].sort((a, b) => b.bookmarkedAt - a.bookmarkedAt);
  }, [bookmarks]);

  const handleSelectBookmark = useCallback(
    (noteId: string) => {
      try {
        const encoded = nip19.noteEncode(noteId);
        navigate({ to: `/note/${encoded}` });
      } catch (error) {
        console.error("Failed to navigate to note:", error);
      }
    },
    [navigate]
  );

  const handleDeleteBookmark = useCallback(
    (e: React.MouseEvent, noteId: string) => {
      e.stopPropagation();
      removeBookmark(noteId);
    },
    [removeBookmark]
  );

  // Image gallery handlers
  const handleImageLoad = useCallback((url: string) => {
    imagesLoadingRef.current.delete(url);
    imagesErrorRef.current.delete(url);
  }, []);

  const handleImageError = useCallback((url: string) => {
    imagesLoadingRef.current.delete(url);
    imagesErrorRef.current.add(url);
    const retryCount = imagesRetryCountRef.current.get(url) || 0;
    if (retryCount < 3) {
      imagesRetryCountRef.current.set(url, retryCount + 1);
    }
  }, []);

  const handleAsciiRendered = useCallback((_url: string, _ascii: string) => {
    // No-op for bookmarks page
  }, []);

  // Navigate back to feed
  const navigateHome = () => {
    navigate({ to: "/" });
  };

  return (
    <div
      className="bookmarks-page"
      style={{
        width: "100%",
        height: "100%",
        flex: 1,
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--app-bg-color)",
        overflow: "hidden",
      }}
    >
      {/* Main Content Wrapper */}
      <div
        style={{
          width: "100%",
          maxWidth: isMobileLayout ? "100%" : "1000px",
          margin: isMobileLayout ? "0" : "0 auto",
          display: "flex",
          flexDirection: "column",
          flex: 1,
          overflow: "hidden",
        }}
      >
        {/* Header section */}
        <div
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "1000px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-start",
                width: "100%",
                position: "relative",
                backgroundColor: "var(--app-bg-color)",
                padding: "0.5rem",
                minHeight: "2.5rem",
                borderBottom: "1px solid var(--border-color)",
              }}
            >
              <div
                style={{
                  cursor: "pointer",
                  color: "var(--text-color)",
                  fontSize: "0.875rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  display: "inline-block",
                  minWidth: "50px",
                  minHeight: "10px",
                  marginLeft: "0.5rem",
                }}
                onClick={navigateHome}
              >
                <span>{"< Feed"}</span>
              </div>

              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  transform: "translateX(-50%)",
                  color: "var(--text-color)",
                  fontSize: "1rem",
                  fontWeight: 600,
                }}
              >
                📖 My Bookmarks ({sortedBookmarks.length})
              </div>
            </div>
          </div>
        </div>

        {/* Content area */}
        <div
          ref={containerRef}
          style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {/* Main feed container */}
          <div
            style={{
              width: "100%",
              maxWidth: "1000px",
              margin: "0 auto",
              padding: isMobileLayout ? "0" : "0",
              display: "flex",
              flexDirection: "column",
              flex: 1,
            }}
          >
            {/* Empty state */}
            {sortedBookmarks.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "3rem 1rem",
                  color: "var(--text-muted)",
                  fontSize: "var(--font-size-sm)",
                }}
              >
                <p style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>
                  No bookmarks yet
                </p>
                <p style={{ marginBottom: "0.5rem" }}>
                  Bookmark notes to save them for later reading
                </p>
                <p style={{ fontSize: "0.85em", opacity: 0.7 }}>
                  You can bookmark any note by clicking the bookmark icon
                </p>
              </div>
            ) : (
              /* Bookmarks list */
              sortedBookmarks.map((bookmark) => (
                <div
                  key={bookmark.note.id}
                  onClick={() => handleSelectBookmark(bookmark.note.id)}
                  style={{
                    padding: "1rem",
                    borderBottom: "1px solid var(--border-color)",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                    backgroundColor: "var(--app-bg-color)",
                  }}
                  onMouseEnter={(e) => {
                    if (!isMobileLayout) {
                      (
                        e.currentTarget as HTMLDivElement
                      ).style.backgroundColor = "var(--app-secondary-bg-color)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isMobileLayout) {
                      (
                        e.currentTarget as HTMLDivElement
                      ).style.backgroundColor = "var(--app-bg-color)";
                    }
                  }}
                >
                  {/* Header: Author and Date */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: "var(--font-size-xs)",
                      color: "var(--text-muted)",
                    }}
                  >
                    <span>
                      {bookmark.authorDisplayName ||
                        getDisplayName(bookmark.note.pubkey)}
                    </span>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <span>{formatDate(bookmark.bookmarkedAt)}</span>
                      <button
                        onClick={(e) =>
                          handleDeleteBookmark(e, bookmark.note.id)
                        }
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--text-muted)",
                          cursor: "pointer",
                          fontSize: "1.25rem",
                          padding: "0",
                          opacity: 0.7,
                          transition: "opacity 0.2s ease",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.opacity =
                            "1";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.opacity =
                            "0.7";
                        }}
                        title="Delete bookmark"
                      >
                        ×
                      </button>
                    </div>
                  </div>

                  {/* Note Preview with Images */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.75rem",
                    }}
                  >
                    {/* Images Gallery */}
                    {bookmark.note.imageUrls &&
                      bookmark.note.imageUrls.length > 0 && (
                        <div
                          style={{
                            maxHeight: "250px",
                            overflow: "hidden",
                            borderRadius: "4px",
                          }}
                        >
                          <EnhancedImageGallery
                            noteId={bookmark.note.id}
                            index={0}
                            imageUrls={bookmark.note.imageUrls}
                            isMobile={isMobileLayout}
                            useAscii={false}
                            useColor={false}
                            asciiCache={asciiCache}
                            setFullScreenImage={() => {
                              // Open full screen view - can be implemented later
                            }}
                            onAsciiRendered={handleAsciiRendered}
                            onImageLoad={handleImageLoad}
                            onImageError={handleImageError}
                            imagesLoadingRef={imagesLoadingRef}
                            imagesErrorRef={imagesErrorRef}
                            imagesRetryCountRef={imagesRetryCountRef}
                            isInFeed={true}
                            fixedHeight={250}
                          />
                        </div>
                      )}

                    {/* Text Preview */}
                    <div
                      style={{
                        textAlign: "start",
                        fontSize: "var(--font-size-sm)",
                        color: "var(--text-color)",
                        lineHeight: "1.5",
                        display: "-webkit-box",
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {bookmark.note.content.length > 200
                        ? bookmark.note.content.substring(0, 200) + "..."
                        : bookmark.note.content}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookmarksPage;
