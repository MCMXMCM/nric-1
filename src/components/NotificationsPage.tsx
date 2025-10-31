import React, { useContext, useRef } from "react";
import { NostrContext } from "../contexts/NostrContext";
import { useRelayManager } from "../hooks/useRelayManager";
import { useNotificationsNostrify } from "../hooks/useNotificationsNostrify";
import { useNotificationsPaginationNostrify } from "../hooks/useNotificationsNostrify";
import { useDisplayNames } from "../hooks/useDisplayNames";
import { useScrollRestoration } from "../hooks/useScrollRestoration";
import {
  setMuteLikes,
  setMuteMentions,
  setMuteReplies,
  setMuteReposts,
  setMuteZaps,
} from "./lib/uiStore";
import { useUIStore } from "./lib/useUIStore";
import NotificationItem from "./NotificationItem";
import LoadingSpinner from "./ui/LoadingSpinner";
import LoadingTextPlaceholder from "./ui/LoadingTextPlaceholder";
import NotificationsHeader from "./NotificationsHeader";

const NotificationsPage: React.FC = () => {
  const { pubkey, nostrClient } = useContext(NostrContext) as any;
  const { relayUrls } = useRelayManager({
    nostrClient,
    initialRelays: [],
    pubkeyHex: pubkey,
  });
  const { getDisplayNameForPubkey } = useDisplayNames(relayUrls);
  const {
    items,
    unreadCount,
    markAllAsRead,
    isLoading,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useNotificationsNostrify({ relayUrls });

  // Use pagination hook with session persistence
  const { visibleCount, handleLoadMore } = useNotificationsPaginationNostrify(
    items,
    hasNextPage,
    fetchNextPage,
    pubkey
  );

  const containerRef = useRef<HTMLDivElement>(null);
  useScrollRestoration(containerRef, `notifications:${pubkey || "anonymous"}`);

  const {
    muteLikes = false,
    muteReplies = false,
    muteMentions = false,
    muteReposts = false,
    muteZaps = false,
  } = useUIStore((s) => ({
    muteLikes: s.muteLikes,
    muteReplies: s.muteReplies,
    muteMentions: s.muteMentions,
    muteReposts: s.muteReposts,
    muteZaps: s.muteZaps,
  }));

  if (!pubkey) {
    const isMobileLayout = window.innerWidth <= 768;
    return (
      <div
        style={{
          padding: isMobileLayout ? "2rem 0.5rem" : "2rem",
          maxWidth: "1000px",
          margin: "0 auto",
          textAlign: "left",
          color: "var(--text-color)",
          backgroundColor: "var(--bg-color)",
          minHeight: "100vh",
        }}
      >
        <h2 style={{ marginBottom: "1rem" }}>Login Required</h2>
        <p style={{ color: "var(--app-text-secondary)" }}>
          Please log in with your nsec, NIP-07 extension, or npub to view your
          notifications.
        </p>
      </div>
    );
  }

  const isMobileLayout = window.innerWidth <= 768;

  return (
    <div
      className="nostr-feed"
      style={{
        width: "100%",
        height: "100%",
        flex: 1,
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--app-bg-color )",
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
            <NotificationsHeader
              isMobile={isMobileLayout}
              unreadCount={unreadCount}
            />
          </div>
        </div>

        <div
          style={{
            padding: isMobileLayout ? "1rem 0.5rem" : "1rem",
            margin: "0 auto",
            borderBottom: "1px solid var(--border-color)",
            textAlign: "left",
            width: "100%",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              width: "100%",
              gap: "1rem",
              marginBottom: "1rem",
            }}
          >
            <details
              style={{
                maxWidth: "70%",
                flex: 1,
              }}
            >
              <summary
                style={{
                  cursor: "pointer",
                  fontSize: "0.9rem",
                  color: "var(--app-text-secondary)",
                }}
              >
                Configure Notifications
              </summary>
              <div
                style={{
                  marginTop: "0.5rem",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: isMobileLayout ? "0.5rem" : "1rem",
                  fontSize: "0.85rem",
                  width: "100%",
                  maxWidth: "100%",
                }}
              >
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.25rem",
                    flexShrink: 0,
                    fontSize: isMobileLayout ? "0.8rem" : "0.85rem",
                    whiteSpace: "nowrap",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={muteLikes}
                    onChange={(e) => setMuteLikes(e.target.checked)}
                    aria-label="Mute Likes"
                  />
                  Mute Likes
                </label>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.25rem",
                    flexShrink: 0,
                    fontSize: isMobileLayout ? "0.8rem" : "0.85rem",
                    whiteSpace: "nowrap",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={muteReplies}
                    onChange={(e) => setMuteReplies(e.target.checked)}
                    aria-label="Mute Replies"
                  />
                  Mute Replies
                </label>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.25rem",
                    flexShrink: 0,
                    fontSize: isMobileLayout ? "0.8rem" : "0.85rem",
                    whiteSpace: "nowrap",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={muteMentions}
                    onChange={(e) => setMuteMentions(e.target.checked)}
                    aria-label="Mute Mentions"
                  />
                  Mute Mentions
                </label>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.25rem",
                    flexShrink: 0,
                    fontSize: isMobileLayout ? "0.8rem" : "0.85rem",
                    whiteSpace: "nowrap",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={muteReposts}
                    onChange={(e) => setMuteReposts(e.target.checked)}
                    aria-label="Mute Reposts"
                  />
                  Mute Reposts
                </label>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.25rem",
                    flexShrink: 0,
                    fontSize: isMobileLayout ? "0.8rem" : "0.85rem",
                    whiteSpace: "nowrap",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={muteZaps}
                    onChange={(e) => setMuteZaps(e.target.checked)}
                    aria-label="Mute Zaps"
                  />
                  Mute Zaps
                </label>
              </div>
            </details>
            <button
              onClick={markAllAsRead}
              style={{
                padding: "0.5rem 1rem",
                backgroundColor: "var(--accent-color)",
                color: "white",
                border: "none",
                cursor: "pointer",
                fontSize: "0.875rem",
                minHeight: "2rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              Mark as Read
            </button>
          </div>

          {/* Mute Controls */}
        </div>

        {/* Scrollable content area */}
        <div
          style={{
            width: "100%",
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            flex: 1,
            minHeight: 0,
            overflowY: isMobileLayout ? "auto" : "hidden",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <div
            ref={containerRef}
            style={{
              maxHeight: "calc(100vh - 200px)",
              overflowY: "auto",
              padding: isMobileLayout ? "0 0.5rem" : "0 1rem",
              paddingBottom: isMobileLayout
                ? "calc(15dvh + var(--safe-area-inset-bottom))"
                : "2rem",
              width: "100%",
              margin: "0 auto",
            }}
          >
            <div
              style={{
                width: "100%",
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                boxSizing: "border-box",
                backgroundColor: "var(--app-bg-color )",
              }}
            >
              <div
                style={{
                  width: "100%",
                  position: "relative",
                  height: isMobileLayout ? "auto" : "100%",
                  touchAction: isMobileLayout ? "pan-y pinch-zoom" : "auto",
                  cursor: isMobileLayout ? "auto" : "auto",
                  willChange: "transform",
                  overflow: "visible",
                }}
              >
                {isLoading && items.length === 0 && (
                  <div style={{ padding: "2rem", textAlign: "center" }}>
                    <LoadingSpinner />
                    <p
                      style={{
                        marginTop: "1rem",
                        color: "var(--app-text-secondary)",
                      }}
                    >
                      Loading notifications...
                    </p>
                  </div>
                )}

                {error && (
                  <div
                    style={{
                      padding: "1rem",
                      textAlign: "center",
                      color: "var(--error-color)",
                      backgroundColor: "var(--card-bg)",
                      margin: "1rem",
                    }}
                  >
                    Error: {error}
                  </div>
                )}

                <div style={{ width: "100%" }}>
                  {items.slice(0, visibleCount).map((item) => (
                    <NotificationItem
                      key={`${item.event?.id || `${item.actor}:${item.type}:${item.targetNoteId ?? ""}:${item.created_at}`}`}
                      notification={item}
                      getDisplayNameForPubkey={getDisplayNameForPubkey}
                      relayUrls={relayUrls}
                      isMobile={window.innerWidth <= 768}
                      userPubkey={pubkey}
                    />
                  ))}

                  {items.length === 0 && !isLoading && (
                    <div
                      style={{
                        padding: "2rem",
                        textAlign: "center",
                        color: "var(--app-text-secondary)",
                      }}
                    >
                      No notifications found.
                    </div>
                  )}
                </div>

                {/* Load more button */}
                {(hasNextPage || visibleCount < items.length) && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      marginTop: "1rem",
                      marginBottom: "2rem",
                      flexShrink: 0,
                    }}
                  >
                    <button
                      onClick={handleLoadMore}
                      disabled={isFetchingNextPage}
                      style={{
                        backgroundColor: "transparent",
                        color: "var(--text-color)",
                        border: "1px dotted var(--border-color)",
                        padding: "0.5rem 1rem",
                        marginBottom: "2rem",
                        cursor: isFetchingNextPage ? "not-allowed" : "pointer",
                        fontSize: "0.875rem",
                        opacity: isFetchingNextPage ? 0.7 : 1,
                      }}
                    >
                      {isFetchingNextPage ? (
                        <LoadingTextPlaceholder type="loadMore" />
                      ) : (
                        "View more"
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationsPage;
