import React, { useRef, useEffect, useState, useCallback } from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { type Event, type Filter, nip19 } from "nostr-tools";
import type { Note } from "../../types/nostr/types";
import { CACHE_KEYS } from "../../utils/cacheKeys";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGlobalRelayPool,
  type RelayConnectionPool,
} from "../../utils/nostr/relayConnectionPool";
import { formatRelativeTime } from "../../utils/nostr/utils";
import NoteContentRenderer from "../NoteContentRenderer";
import LoadingTextPlaceholder from "../ui/LoadingTextPlaceholder";

interface NoteItemProps {
  note: Note;
  isExpanded: boolean;
  showMoreForNote: boolean;
  onExpand: () => void;
  onSetShowMore: (noteId: string, shouldShow: boolean) => void;
  useAscii?: boolean;
  useColor?: boolean;
  isMobile?: boolean;
  getDisplayNameForPubkey: (pubkey: string) => string;
  onHashtagClick?: (hashtag: string) => void;
  readRelays: string[];
}

const NoteItemComponent: React.FC<NoteItemProps> = ({
  note,
  isExpanded,
  showMoreForNote,
  onExpand,
  onSetShowMore,
  useAscii = false,
  useColor = true,
  getDisplayNameForPubkey,
  onHashtagClick,
  readRelays,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const noteTextRef = useRef<HTMLDivElement | null>(null);

  // Pool ref for note fetching
  const poolRef = useRef<RelayConnectionPool | null>(null);

  // Initialize pool
  React.useEffect(() => {
    if (!poolRef.current) {
      poolRef.current = getGlobalRelayPool();
    }
  }, []);

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

  // Prefetch note data on hover/focus for better UX
  const prefetchNote = useCallback(
    async (noteId: string) => {
      if (!noteId || !readRelays || readRelays.length === 0) return;

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

        const augmentedRelays = buildAugmentedRelays(readRelays, note.tags);
        const pool = poolRef.current;

        let events: Event[] = await pool.querySync(augmentedRelays, filter);

        // If no events found with augmented relays, try with original relays only
        if (
          events.length === 0 &&
          augmentedRelays.length !== readRelays.length
        ) {
          events = await pool.querySync(readRelays, filter);
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
    [queryClient, readRelays, buildAugmentedRelays, note.tags]
  );

  // Extract root and parent IDs from note tags
  const { rootId, parentId } = React.useMemo(() => {
    const eTags = (note.tags || []).filter(
      (t) => Array.isArray(t) && t[0] === "e"
    );

    const replyTag = eTags.find((t) => t[3] === "reply");
    const rootTag = eTags.find((t) => t[3] === "root");

    // Get root ID (prefer marked root tag, fallback to reply tag)
    const rootId = rootTag?.[1] || replyTag?.[1] || null;

    // Get parent ID (prefer marked reply tag, fallback to root tag for top-level replies)
    const parentId =
      replyTag?.[1] ||
      (rootTag?.[1] && rootTag[1] !== note.id ? rootTag[1] : null);

    return { rootId, parentId };
  }, [note.tags, note.id]);

  const goToNote = React.useCallback(() => {
    if (!note?.id) return;
    const backToPath = `${location.pathname}${location.search || ""}`;
    const prevState = location.state as any;
    const backToFromFeed = Boolean(
      prevState?.backToFromFeed || prevState?.fromFeed
    );
    const feedIndex =
      typeof prevState?.feedIndex === "number"
        ? prevState.feedIndex
        : undefined;
    const navigationState = {
      fromNoteView: true,
      backToPath,
      backToFromFeed,
      feedIndex,
    };
    try {
      sessionStorage.setItem(
        "noteViewNavigationState",
        JSON.stringify(navigationState)
      );
    } catch {}
    let bech32 = note.id;
    try {
      bech32 = nip19.noteEncode(note.id);
    } catch {}
    navigate({
      to: `/thread/${bech32}`,
      state: {
        cachedNote: note || ({ id: "" } as any),
        backToPath,
        fromProfile: true,
      } as any,
    });
  }, [note?.id, navigate, location.pathname, location.search, location.state]);

  // Navigate to root note with thread modal open
  const goToRoot = React.useCallback(() => {
    if (!rootId) return;
    const backToPath = `${location.pathname}${location.search || ""}`;
    const navigationState = {
      fromNoteView: true,
      backToPath,
    };
    try {
      sessionStorage.setItem(
        "noteViewNavigationState",
        JSON.stringify(navigationState)
      );
    } catch {}
    let bech32 = rootId;
    try {
      bech32 = nip19.noteEncode(rootId);
    } catch {}
    navigate({
      to: `/thread/${bech32}`,
      state: {
        backToPath,
        fromProfile: true,
      } as any,
    });
  }, [rootId, navigate, location.pathname, location.search]);

  // Navigate to parent note with thread modal open
  const goToParent = React.useCallback(() => {
    if (!parentId) return;
    const backToPath = `${location.pathname}${location.search || ""}`;
    const navigationState = {
      fromNoteView: true,
      backToPath,
    };
    try {
      sessionStorage.setItem(
        "noteViewNavigationState",
        JSON.stringify(navigationState)
      );
    } catch {}
    let bech32 = parentId;
    try {
      bech32 = nip19.noteEncode(parentId);
    } catch {}
    navigate({
      to: `/thread/${bech32}`,
      state: {
        backToPath,
        fromProfile: true,
      } as any,
    });
  }, [parentId, navigate, location.pathname, location.search]);

  const [isExpanding, setIsExpanding] = useState(false);

  // Check if note needs "Show more" button
  useEffect(() => {
    const el = noteTextRef.current;
    if (el) {
      onSetShowMore(note.id, el.scrollHeight > 100);
    }
  }, [note.id, onSetShowMore, isExpanded]);

  return (
    <div
      style={{
        position: "relative",
        textAlign: "left",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          width: "100%",
          textAlign: "left",
        }}
      >
        {/* Note header with author display name, navigation links, and timestamp */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.5rem",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "1rem",
              width: "80%",
            }}
          >
            {/* Thread button */}
            <button
              onClick={goToNote}
              onMouseEnter={() =>
                prefetchNote(note.id).catch((error) => {
                  console.error("Failed to prefetch note on hover:", error);
                })
              }
              onFocus={() =>
                prefetchNote(note.id).catch((error) => {
                  console.error("Failed to prefetch note on focus:", error);
                })
              }
              title="Open in thread modal"
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "0 0.75rem",
                color: "var(--link-color)",
                fontSize: "0.8rem",
                textTransform: "uppercase",
                width: "fit-content",
                minHeight: "1.5rem",
                height: "1.5rem",
                outline: "1px solid var(--border-color)",
                // textDecoration: "underline",
              }}
            >
              thread
            </button>

            {/* Root and parent links for reply notes */}
            {(rootId || parentId) && (
              <>
                {rootId && rootId !== note.id && (
                  <>
                    <button
                      onClick={goToRoot}
                      onMouseEnter={() =>
                        rootId &&
                        prefetchNote(rootId).catch((error) => {
                          console.error(
                            "Failed to prefetch root note on hover:",
                            error
                          );
                        })
                      }
                      onFocus={() =>
                        rootId &&
                        prefetchNote(rootId).catch((error) => {
                          console.error(
                            "Failed to prefetch root note on focus:",
                            error
                          );
                        })
                      }
                      title="Go to root thread"
                      style={{
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        padding: "0 0.5rem",
                        color: "var(--link-color)",
                        fontSize: "0.8rem",
                        width: "fit-content",
                        minHeight: "1.5rem",
                        textTransform: "uppercase",
                        height: "1.5rem",
                        outline: "1px solid var(--border-color)",
                        // textDecoration: "underline",
                      }}
                    >
                      root
                    </button>
                  </>
                )}
                {parentId && parentId !== note.id && parentId !== rootId && (
                  <>
                    <button
                      onClick={goToParent}
                      onMouseEnter={() =>
                        parentId &&
                        prefetchNote(parentId).catch((error) => {
                          console.error(
                            "Failed to prefetch parent note on hover:",
                            error
                          );
                        })
                      }
                      onFocus={() =>
                        parentId &&
                        prefetchNote(parentId).catch((error) => {
                          console.error(
                            "Failed to prefetch parent note on focus:",
                            error
                          );
                        })
                      }
                      title="Go to parent thread"
                      style={{
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        padding: "0 0.5rem",
                        width: "fit-content",
                        minHeight: "1.5rem",
                        textTransform: "uppercase",
                        height: "1.5rem",
                        outline: "1px solid var(--border-color)",
                        color: "var(--link-color)",
                        fontSize: "0.8rem",
                        // textDecoration: "underline",
                      }}
                    >
                      parent
                    </button>
                  </>
                )}
              </>
            )}
          </div>

          {/* Relative time - right aligned */}
          <span
            style={{
              fontSize: "1rem",
              opacity: 0.8,
              color: "var(--text-color)",
              marginLeft: "0.5rem",
            }}
          >
            {formatRelativeTime(note.created_at)}
          </span>
        </div>

        {/* Note content */}
        {note.content && (
          <div style={{ width: "100%" }}>
            <div
              ref={noteTextRef}
              style={{
                color: "var(--text-color)",

                fontSize: "var(--font-size-base)",
                textAlign: "left",
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
                lineHeight: "1.4",
                overflow: "hidden",
                maxHeight: isExpanded ? "none" : "100px",
              }}
            >
              <NoteContentRenderer
                content={note.content}
                useAscii={useAscii}
                useColor={useColor}
                imageMode={true}
                onExpandContainer={onExpand}
                getDisplayNameForPubkey={getDisplayNameForPubkey}
                onHashtagClick={onHashtagClick}
                style={{
                  color: "var(--text-color)",

                  fontSize: "var(--font-size-base)",
                  textAlign: "left",
                  lineHeight: "1.4",
                  whiteSpace: "pre-wrap",
                }}
              />
            </div>
            {showMoreForNote && !isExpanded && (
              <span
                onClick={() => {
                  setIsExpanding(true);
                  setTimeout(() => {
                    onExpand();
                    setIsExpanding(false);
                  }, 100);
                }}
                style={{
                  color: "var(--text-color)",
                  cursor: isExpanding ? "not-allowed" : "pointer",

                  fontSize: "var(--font-size-base)",
                  textDecoration: "underline",
                  marginTop: "0.25rem",
                  display: "inline-block",
                  opacity: isExpanding ? 0.7 : 1,
                }}
                role="button"
              >
                {isExpanding ? (
                  <LoadingTextPlaceholder type="custom" customLength={9} />
                ) : (
                  "Show more"
                )}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(NoteItemComponent);
