import React, { useState, useCallback, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { nip19, type Event, type Filter } from "nostr-tools";
import {
  formatRelativeTime,
  extractImageUrls,
  extractVideoUrls,
} from "../utils/nostr/utils";
import { useCreatedByDisplayName } from "../hooks/useCreatedByDisplayName";
import { useQueryClient } from "@tanstack/react-query";
import { CACHE_KEYS } from "../utils/cacheKeys";
import { prefetchRoute } from "../utils/prefetch";
import {
  getGlobalRelayPool,
  type RelayConnectionPool,
} from "../utils/nostr/relayConnectionPool";
import type { Note } from "../types/nostr/types";
import LoadingTextPlaceholder from "./ui/LoadingTextPlaceholder";
import type { ClassifiedNotification } from "../utils/nostr/notifications";
import { getTargetNoteIdFromEvent } from "../utils/nostr/notifications";
import {
  addMutedNotificationTargetId,
  removeMutedNotificationTargetId,
} from "./lib/uiStore";
import { useUIStore } from "./lib/useUIStore";
import NostrLinkText from "./NostrLinkText";

interface NotificationItemProps {
  notification: ClassifiedNotification;
  getDisplayNameForPubkey: (pubkey: string) => string;
  relayUrls: string[];
  isMobile?: boolean;
  userPubkey?: string;
}

const NotificationItem: React.FC<NotificationItemProps> = ({
  notification,
  getDisplayNameForPubkey,
  relayUrls,
  isMobile = false,
  userPubkey,
}) => {
  const [showFullContent, setShowFullContent] = useState(false);
  const [userNoteId, setUserNoteId] = useState<string | null>(null);
  const navigate = useNavigate();
  // location removed - unused variable
  const queryClient = useQueryClient();
  // Per-note mute state
  const isMuted = useUIStore((s) => {
    const ids = s.mutedNotificationTargetIds || [];
    const target =
      notification.targetNoteId ?? getTargetNoteIdFromEvent(notification.event);
    return target ? ids.includes(target) : false;
  });

  const toggleMute = useCallback(() => {
    const target =
      notification.targetNoteId ?? getTargetNoteIdFromEvent(notification.event);
    if (!target) return;
    if (isMuted) removeMutedNotificationTargetId(target);
    else addMutedNotificationTargetId(target);
  }, [notification.targetNoteId, notification.event, isMuted]);

  // Pool ref for note fetching
  const poolRef = useRef<RelayConnectionPool | null>(null);

  // Initialize pool
  React.useEffect(() => {
    if (!poolRef.current) {
      poolRef.current = getGlobalRelayPool();
    }
  }, []);

  // Find the user's note in the thread
  React.useEffect(() => {
    if (!userPubkey || !notification.event || !relayUrls.length) {
      // Fallback to targetNoteId if we can't determine the user's note
      setUserNoteId(
        notification.targetNoteId ??
          getTargetNoteIdFromEvent(notification.event)
      );
      return;
    }

    const findUserNote = async () => {
      try {
        // Get all p-tags to see who is mentioned
        const pTags =
          notification.event?.tags?.filter((tag: any) => tag[0] === "p") || [];

        // Get all e-tag note IDs from the notification event
        const eTags =
          notification.event?.tags?.filter((tag: any) => tag[0] === "e") || [];

        console.log("🔍 Finding user note for notification:", {
          notificationEventId: notification.event?.id,
          notificationType: notification.type,
          userPubkey,
          pTags,
          eTags,
          targetNoteId: notification.targetNoteId,
        });

        if (eTags.length === 0) {
          // No e-tags, fallback to targetNoteId
          console.log("❌ No e-tags found, using targetNoteId");
          setUserNoteId(
            notification.targetNoteId ??
              getTargetNoteIdFromEvent(notification.event)
          );
          return;
        }

        // Strategy 1: Check if root tag exists and belongs to user
        const rootTag = eTags.find((tag: any) => tag[3] === "root");
        console.log("📌 Root tag:", rootTag);

        if (rootTag && rootTag[1]) {
          // Check if the root note is by the user without fetching
          // We'll fetch it to verify
          const pool = poolRef.current;
          if (pool) {
            const filter: Filter = {
              kinds: [1],
              ids: [rootTag[1]],
            };
            const events = await pool.querySync(relayUrls, filter);
            console.log("🔎 Root note fetched:", events[0]);

            if (events.length > 0 && events[0].pubkey === userPubkey) {
              console.log("✅ Root note belongs to user!");
              setUserNoteId(events[0].id);
              return;
            } else if (events.length > 0) {
              console.log(
                "❌ Root note does NOT belong to user. Root pubkey:",
                events[0].pubkey
              );
            }
          }
        }

        // Strategy 2: Fetch all referenced notes and find the user's note
        const noteIds = eTags
          .map((tag: any) => tag[1])
          .filter((id: string) => id);

        console.log("📝 All note IDs from e-tags:", noteIds);

        if (noteIds.length === 0) {
          console.log("❌ No note IDs extracted from e-tags");
          setUserNoteId(
            notification.targetNoteId ??
              getTargetNoteIdFromEvent(notification.event)
          );
          return;
        }

        const pool = poolRef.current;
        if (!pool) {
          console.log("❌ No relay pool available");
          setUserNoteId(
            notification.targetNoteId ??
              getTargetNoteIdFromEvent(notification.event)
          );
          return;
        }

        const filter: Filter = {
          kinds: [1],
          ids: noteIds,
        };

        const events = await pool.querySync(relayUrls, filter);
        console.log(
          "📦 Fetched notes:",
          events.map((e) => ({ id: e.id, pubkey: e.pubkey }))
        );

        // Find the note that belongs to the user
        const usersNote = events.find((event) => event.pubkey === userPubkey);

        if (usersNote) {
          console.log("✅ Found user's note:", usersNote.id);
          setUserNoteId(usersNote.id);
        } else {
          console.log(
            "❌ User's note not found in fetched notes, using targetNoteId"
          );
          // Fallback to targetNoteId if user's note not found
          setUserNoteId(
            notification.targetNoteId ??
              getTargetNoteIdFromEvent(notification.event)
          );
        }
      } catch (error) {
        console.error("Failed to find user's note in thread:", error);
        // Fallback to targetNoteId on error
        setUserNoteId(
          notification.targetNoteId ??
            getTargetNoteIdFromEvent(notification.event)
        );
      }
    };

    findUserNote();
  }, [userPubkey, notification.event, notification.targetNoteId, relayUrls]);

  // Build augmented relays function (same as NoteView)
  const buildAugmentedRelays = useCallback(
    (relayUrls: string[], hintTags?: any[]) => {
      // Extract relay hints from NIP-19 nevent if available
      const hintedRelays: string[] = [];
      if (hintTags && Array.isArray(hintTags)) {
        hintTags.forEach((tag) => {
          if (tag && tag[0] === "relay" && tag[1]) {
            hintedRelays.push(tag[1]);
          }
        });
      }

      // Add hinted relays to the list
      return Array.from(new Set([...relayUrls, ...hintedRelays]));
    },
    []
  );

  const { displayText: actorDisplayName, isLoading: isLoadingActor } =
    useCreatedByDisplayName({
      pubkey: notification.actor,
      relayUrls,
      isMobile,
      getDisplayNameForPubkey,
    });

  // Create npub ID for navigation
  const actorNpub = nip19.npubEncode(notification.actor);

  // Render type text with "your note" as a clickable link
  const renderTypeText = (type: string) => {
    const handleYourNoteClick = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (userNoteId) {
        try {
          const noteId = nip19.noteEncode(userNoteId);
          navigate({ to: "/thread/$noteId", params: { noteId } });
        } catch (error) {
          console.error("Failed to encode note ID:", error);
          navigate({ to: "/thread/$noteId", params: { noteId: userNoteId } });
        }
      }
    };

    const handleMouseEnter = () => {
      if (userNoteId) {
        prefetchNote(userNoteId).catch((error) => {
          console.error("Failed to prefetch note on hover:", error);
        });
      }
    };

    const yourNoteLink = userNoteId ? (
      <a
        href="#"
        onClick={handleYourNoteClick}
        onMouseEnter={handleMouseEnter}
        onFocus={handleMouseEnter}
        style={{
          color: "var(--link-color)",
          textDecoration: "underline",
          cursor: "pointer",
        }}
      >
        your note
      </a>
    ) : (
      "your note"
    );

    switch (type) {
      case "like":
        return <>liked {yourNoteLink}</>;
      case "reply":
        return <>replied to {yourNoteLink}</>;
      case "mention":
        return "mentioned you";
      case "repost":
        return <>reposted {yourNoteLink}</>;
      case "zap":
        return <>zapped {yourNoteLink}</>;
      default:
        return <>interacted with {yourNoteLink}</>;
    }
  };

  const content = notification.event?.content || "";
  const contentLimit = isMobile ? 150 : 200; // Shorter limit on mobile for better readability
  const isLongContent = content.length > contentLimit;
  const displayContent = showFullContent
    ? content
    : content.slice(0, contentLimit);

  // Parse notification content with support for images, videos, links, and hashtags
  const renderParsedNotificationText = (text: string) => {
    if (!text.trim()) return null;

    // Extract image and video URLs
    const imageUrls = extractImageUrls(text);
    const videoUrls = extractVideoUrls(text);

    // Split text by both image and video URLs and render each part
    const parts = text.split(
      /(https?:\/\/[^\s]+\.(?:jpg|jpeg|gif|png|webp|mp4|webm|mov))/gi
    );

    return parts.map((part, index) => {
      if (imageUrls.includes(part)) {
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "var(--link-image)",
              textDecoration: "underline",
              overflowWrap: "anywhere",
              fontSize: "0.9rem",
            }}
          >
            {part}
          </a>
        );
      }
      if (videoUrls.includes(part)) {
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "var(--link-image)",
              textDecoration: "underline",
              overflowWrap: "anywhere",
              fontSize: "0.9rem",
            }}
          >
            {part}
          </a>
        );
      }
      // Use NostrLinkText for proper linkification of nostr links, hashtags, and other URLs
      return (
        <NostrLinkText
          key={index}
          text={part}
          getDisplayNameForPubkey={getDisplayNameForPubkey}
        />
      );
    });
  };

  // Prefetch note data on hover/focus for better UX
  const prefetchNote = useCallback(
    async (noteId: string) => {
      if (!noteId || !relayUrls || relayUrls.length === 0) return;

      // Check if already cached
      const cached = queryClient.getQueryData<Note>(CACHE_KEYS.NOTE(noteId));
      if (cached) {
        return;
      }

      // Only prefetch if pool is initialized
      if (!poolRef.current) {
        return;
      }

      try {
        const filter: Filter = {
          kinds: [1],
          ids: [noteId],
          limit: 1,
        };

        const augmentedRelays = buildAugmentedRelays(
          relayUrls,
          notification.event?.tags
        );
        const pool = poolRef.current;

        let events: Event[] = await pool.querySync(augmentedRelays, filter);

        // If no events found with augmented relays, try with original relays only
        if (
          events.length === 0 &&
          augmentedRelays.length !== relayUrls.length
        ) {
          events = await pool.querySync(relayUrls, filter);
        }

        // If still no events, try with popular relays as fallback
        if (events.length === 0) {
          const popularRelays = [
            "wss://nos.lol",
            "wss://relay.snort.social",
            "wss://nostr.mom",
            "wss://purplepag.es",
            "wss://relay.nostr.band",
          ];
          events = await pool.querySync(popularRelays, filter);
        }

        if (events.length === 0) {
          console.warn(
            `❌ Note ${noteId.slice(0, 8)} not found during prefetch`
          );
          return;
        }

        const event = events[0];
        const mappedNote: Note = {
          id: event.id,
          content: event.content || "",
          pubkey: event.pubkey,
          created_at: event.created_at,
          tags: event.tags || [],
          imageUrls: [],
          videoUrls: [],
          receivedAt: Date.now(),
        };

        // Cache the prefetched note
        queryClient.setQueryData(CACHE_KEYS.NOTE(noteId), mappedNote);
      } catch (error) {
        console.error(
          `❌ Failed to prefetch note ${noteId.slice(0, 8)}:`,
          error
        );
      }
    },
    [queryClient, relayUrls, buildAugmentedRelays, notification.event?.tags]
  );

  const goToNote = () => {
    // For reply notifications, navigate to the reply itself (the event)
    // For other notifications, navigate to the target note
    let noteIdToNavigate: string | null = null;

    if (notification.type === "reply" && notification.event?.id) {
      // For replies, show the reply itself
      noteIdToNavigate = notification.event.id;
    } else {
      // For other notifications (like, repost, zap, mention), show the target note
      noteIdToNavigate =
        notification.targetNoteId ??
        getTargetNoteIdFromEvent(notification.event);
    }

    if (noteIdToNavigate) {
      try {
        const noteId = nip19.noteEncode(noteIdToNavigate);
        // Navigate to thread view instead of note view
        navigate({ to: "/thread/$noteId", params: { noteId } });
      } catch (error) {
        console.error("Failed to encode note ID:", error);
        // Fallback: try navigating with the raw hex ID
        navigate({
          to: "/thread/$noteId",
          params: { noteId: noteIdToNavigate },
        });
      }
    } else {
      console.warn("No note ID available for navigation");
    }
  };

  const goToParent = () => {
    // For replies, navigate to the parent note (the user's note that was replied to)
    const targetNoteId =
      notification.targetNoteId ?? getTargetNoteIdFromEvent(notification.event);

    if (targetNoteId) {
      try {
        const noteId = nip19.noteEncode(targetNoteId);
        // Navigate to thread view to show parent note in context
        navigate({ to: "/thread/$noteId", params: { noteId } });
      } catch (error) {
        console.error("Failed to encode parent note ID:", error);
        // Fallback: try navigating with the raw hex ID
        navigate({ to: "/thread/$noteId", params: { noteId: targetNoteId } });
      }
    } else {
      console.warn("No parent note ID found for navigation");
    }
  };

  return (
    <div
      style={{
        padding: "1rem",
        borderBottom: "1px solid var(--border-color)",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
      }}
    >
      {/* Header with icon, actor, action, and timestamp */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "0.5rem",
          width: "100%",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            flex: 1,
            minWidth: 0,
          }}
        >
          {/* <span style={{ fontSize: "0.875rem", flexShrink: 0 }}>
            {getTypeIcon(notification.type)}
          </span> */}

          {isLoadingActor ? (
            <LoadingTextPlaceholder type="npub" speed="normal" />
          ) : (
            <a
              href={`/npub/${actorNpub}`}
              onClick={(e) => {
                e.preventDefault();
                // backToPath removed - unused variable
                navigate({
                  to: `/npub/${actorNpub}`,
                  state: true,
                });
              }}
              onMouseEnter={() => prefetchRoute(`/npub/${actorNpub}`)}
              style={{
                color: "var(--link-color)",
                textDecoration: "none",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: isMobile ? "100px" : "200px",
                flexShrink: 1,
                fontSize: "0.875rem",
                minWidth: 0, // Allow shrinking below min content width
                cursor: "pointer",
              }}
            >
              {actorDisplayName}
            </a>
          )}

          <span
            style={{
              color: "var(--app-text-secondary)",
              fontSize: "0.9rem",
              flexShrink: 0,
            }}
          >
            {renderTypeText(notification.type)}
          </span>
        </div>

        <span
          style={{
            color: "var(--app-text-secondary)",
            fontSize: "0.875rem",
            textAlign: "right",
          }}
        >
          {formatRelativeTime(notification.created_at)}
        </span>
      </div>

      {/* Content for replies and mentions */}
      {(notification.type === "reply" || notification.type === "mention") &&
        content && (
          <div
            style={{
              backgroundColor: "var(--app-bg-color)",
              padding: isMobile ? "0.5rem" : "0.75rem",
              marginLeft: isMobile ? "1.2rem" : "1.7rem", // Align with content after icon, smaller on mobile
              textAlign: "left",
              marginRight: isMobile ? "0.5rem" : 0, // Add right margin on mobile to prevent overflow
            }}
          >
            <div
              style={{
                color: "var(--text-color)",
                fontSize: "0.9rem",
                lineHeight: 1.4,
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
              }}
            >
              {renderParsedNotificationText(displayContent)}
              {isLongContent && !showFullContent && (
                <>
                  ...
                  <button
                    onClick={() => setShowFullContent(true)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--link-color)",
                      cursor: "pointer",
                      fontSize: isMobile ? "0.9rem" : "0.85rem",
                      marginLeft: "0.25rem",
                      textDecoration: "underline",
                      padding: isMobile ? "0.2rem" : 0, // Add padding on mobile for better tap targets
                      minHeight: isMobile ? "1.2rem" : "auto", // Ensure minimum touch target
                    }}
                  >
                    view more
                  </button>
                </>
              )}
            </div>
          </div>
        )}

      {/* Action buttons */}
      <div
        style={{
          display: "flex",
          gap: isMobile ? "0.75rem" : "1rem",
          marginLeft: isMobile ? "1.2rem" : "1.7rem", // Align with content after icon
          marginRight: isMobile ? "0.5rem" : 0, // Add right margin on mobile
          flexWrap: "wrap", // Allow wrapping on very small screens
        }}
      >
        <button
          onClick={goToNote}
          onMouseEnter={() => {
            // Prefetch the correct note based on notification type
            const noteIdToPrefetch =
              notification.targetNoteId ??
              getTargetNoteIdFromEvent(notification.event);
            if (noteIdToPrefetch) {
              prefetchNote(noteIdToPrefetch).catch((error) => {
                console.error("Failed to prefetch note on hover:", error);
              });
            }
          }}
          onFocus={() => {
            // Same prefetch logic for focus
            const noteIdToPrefetch =
              notification.targetNoteId ??
              getTargetNoteIdFromEvent(notification.event);
            if (noteIdToPrefetch) {
              prefetchNote(noteIdToPrefetch).catch((error) => {
                console.error("Failed to prefetch note on focus:", error);
              });
            }
          }}
          style={{
            background: "none",
            border: "none",
            color: "var(--link-color)",
            cursor: "pointer",
            fontSize: "0.8rem",
            textDecoration: "underline",
            padding: 0,
          }}
        >
          View {notification.type === "reply" ? "reply" : "note"}
        </button>

        {notification.type === "reply" && (
          <button
            onClick={goToParent}
            onMouseEnter={() => {
              // Prefetch parent note on hover
              const eTags =
                notification.event?.tags?.filter(
                  (tag: any) => tag[0] === "e"
                ) || [];
              if (eTags.length > 0) {
                // Use the same logic as goToParent to find parent ID
                const lastTag = eTags[eTags.length - 1];
                const rootTag = eTags.find((tag: any) => tag[3] === "root");
                const parentId =
                  (lastTag && lastTag[1]) ||
                  (rootTag && rootTag[1]) ||
                  (eTags[0] && eTags[0][1]);
                if (parentId) {
                  prefetchNote(parentId).catch((error) => {
                    console.error(
                      "Failed to prefetch parent note on hover:",
                      error
                    );
                  });
                }
              }
            }}
            onFocus={() => {
              // Same prefetch logic for focus
              const eTags =
                notification.event?.tags?.filter(
                  (tag: any) => tag[0] === "e"
                ) || [];
              if (eTags.length > 0) {
                const lastTag = eTags[eTags.length - 1];
                const rootTag = eTags.find((tag: any) => tag[3] === "root");
                const parentId =
                  (lastTag && lastTag[1]) ||
                  (rootTag && rootTag[1]) ||
                  (eTags[0] && eTags[0][1]);
                if (parentId) {
                  prefetchNote(parentId).catch((error) => {
                    console.error(
                      "Failed to prefetch parent note on focus:",
                      error
                    );
                  });
                }
              }
            }}
            style={{
              background: "none",
              border: "none",
              color: "var(--app-text-secondary)",
              cursor: "pointer",
              fontSize: "0.8rem",
              textDecoration: "underline",
              padding: 0,
            }}
          >
            View parent note
          </button>
        )}

        {/* Mute/unmute this note */}
        <button
          onClick={toggleMute}
          style={{
            background: "none",
            border: "none",
            color: isMuted ? "var(--error-color)" : "var(--app-text-secondary)",
            cursor: "pointer",
            fontSize: "0.8rem",
            textDecoration: "underline",
            padding: 0,
          }}
        >
          {isMuted ? "Unmute this note" : "Mute this note"}
        </button>
      </div>
    </div>
  );
};

export default NotificationItem;
