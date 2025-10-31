import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CACHE_KEYS } from "../../utils/cacheKeys";
import type { Note } from "../../types/nostr/types";
import { nip19 } from "nostr-tools";
import { formatRelativeTime } from "../../utils/nostr/utils";
import { CommentDisplayName } from "./CommentDisplayName";
import { LikeButton } from "./LikeButton";
import NoteContentRenderer from "../NoteContentRenderer";

type NestedRepliesProps = {
  commentId: string;
  depth?: number;
  expandedNestedReplies: Set<string>;
  onToggleNestedReplies: (commentId: string) => void;
  threadStructure: Map<string, Note[]> | undefined;
  childrenIdMap?: Record<string, string[]>;
  collapsedNotes: Set<string>;
  onToggleNoteCollapse: (noteId: string) => void;
  getDisplayNameForPubkey: (pubkey: string) => string;
  navigate: (opts: any) => void;
  location: any;
  useAscii: boolean;
  useColor: boolean;
  imageMode: any;
  relayUrls: string[];
  isMobileLayout: boolean;
  handleFocusThreadOnNote: (noteId: string) => void;
  handleHashtagClick: (tag: string) => void;
  allNotes?: Note[];
  idToIndex?: Map<string, number>;
  // MediaGallery props
  asciiCache?: Record<string, { ascii: string; timestamp: number }>;
  setFullScreenImage?: (url: string) => void;
  onAsciiRendered?: (url: string, ascii: string) => void;
  onMediaLoadError?: (url: string) => void;
  onImageDimensionsLoaded?: (
    noteId: string,
    imageUrl: string,
    dimensions: { width: number; height: number }
  ) => void;
};

const NestedReplies: React.FC<NestedRepliesProps> = ({
  commentId,
  depth = 1,
  expandedNestedReplies,
  onToggleNestedReplies,
  threadStructure,
  childrenIdMap,
  collapsedNotes,
  onToggleNoteCollapse,
  getDisplayNameForPubkey,
  navigate,
  location,
  useAscii,
  useColor,
  imageMode,
  relayUrls,
  isMobileLayout,
  handleFocusThreadOnNote,
  handleHashtagClick,
  allNotes = [],
  idToIndex,
  // MediaGallery props
  asciiCache = {},
  setFullScreenImage = () => {},
  onAsciiRendered = () => {},
  onMediaLoadError = () => {},
  onImageDimensionsLoaded = () => {},
}) => {
  const queryClient = useQueryClient();
  // Prefer id-based child mapping if present; fall back to provided structure
  let nestedReplies = threadStructure?.get(commentId) || [];
  if (
    (!nestedReplies || nestedReplies.length === 0) &&
    childrenIdMap &&
    childrenIdMap[commentId]
  ) {
    const ids = childrenIdMap[commentId] || [];
    nestedReplies = ids
      .map((id) => queryClient.getQueryData<Note>(CACHE_KEYS.NOTE(id)))
      .filter((n): n is Note => Boolean(n))
      .sort((a, b) => a.created_at - b.created_at);
  }

  // Strategy 3: Scan allNotes and MERGE immediate-parent replies (NIP-10) as safety net
  // This ensures consistent visibility regardless of navigation path
  if (allNotes && allNotes.length > 0) {
    const scanned = allNotes
      .filter((note) => {
        if (!Array.isArray(note.tags)) return false;
        const eTags = note.tags.filter(
          (t: any) => Array.isArray(t) && t[0] === "e"
        );
        const replyTag = eTags.find((t: any) => t[3] === "reply");
        const immediateParentId = replyTag
          ? replyTag[1]
          : eTags.length === 1
            ? eTags[0][1]
            : null;
        return immediateParentId === commentId;
      })
      .sort((a, b) => a.created_at - b.created_at);

    if (scanned.length > 0) {
      const byId = new Map<string, Note>();
      [...(nestedReplies || []), ...scanned].forEach((n) => byId.set(n.id, n));
      nestedReplies = Array.from(byId.values()).sort(
        (a, b) => a.created_at - b.created_at
      );
    }
  }

  const replyCount = nestedReplies.length;

  // Show replies by default if they exist, but respect user's toggle state
  // This ensures navigation always shows nested content while allowing user control
  const isExpanded = replyCount > 0 || expandedNestedReplies.has(commentId);

  const maxDepth = 4; // Changed from 3 to allow 4 levels: main (0), reply (1), nested (2), deep (3)
  const currentDepth = Math.min(depth, maxDepth);
  const marginLeft = isMobileLayout
    ? `${currentDepth * 0.2}rem`
    : `${currentDepth}rem`;

  if (replyCount === 0) {
    return (
      <div
        style={{
          marginLeft,
          width: `calc(100% - ${marginLeft})`,
          maxWidth: `calc(100% - ${marginLeft})`,
          boxSizing: "border-box",
        }}
      >
        <button
          onClick={() => {
            const currentParams = new URLSearchParams(location.search);
            currentParams.set("reply", commentId);
            navigate({
              to: location.pathname,
              search: Object.fromEntries(currentParams),
              replace: true,
            });
          }}
          style={{
            backgroundColor: "transparent",
            color: "var(--accent-color)",
            border: "none",
            padding: 0,
            cursor: "pointer",
            fontSize: "0.875rem",
            textDecoration: "none",
          }}
        >
          reply
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        marginLeft,
        width: `calc(100% - ${marginLeft})`,
        maxWidth: `calc(100% - ${marginLeft})`,
        boxSizing: "border-box",
      }}
    >
      {!isExpanded ? null : (
        <div
          style={{
            width: "100%",
            maxWidth: "100%",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              alignItems: "center",
              marginBottom: "0.5rem",
              marginTop: "0.25rem",
            }}
          >
            <button
              onClick={() => {
                const currentParams = new URLSearchParams(location.search);
                currentParams.set("reply", commentId);
                navigate({
                  to: location.pathname,
                  search: Object.fromEntries(currentParams),
                  replace: true,
                });
              }}
              style={{
                backgroundColor: "transparent",
                color: "var(--accent-color)",
                border: "none",
                padding: 0,
                minHeight: "20px",
                height: "20px",
                cursor: "pointer",
                fontSize: "0.875rem",
                textDecoration: "none",
              }}
            >
              reply
            </button>
          </div>

          <ul
            style={{
              position: "relative",
              margin: 0,
              padding: 0,
              listStyleType: "none",
              width: "100%",
              maxWidth: "100%",
              boxSizing: "border-box",
            }}
          >
            {nestedReplies.map((nestedReply, nestedIdx) => {
              const isLastNested = nestedIdx === nestedReplies.length - 1;
              return (
                <li
                  key={nestedReply.id}
                  id={`note-${nestedReply.id}`}
                  data-note-id={nestedReply.id}
                  data-index={undefined as any}
                  style={{
                    position: "relative",
                    paddingLeft: "1.5rem",
                    width: "100%",
                    maxWidth: "100%",
                    boxSizing: "border-box",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: "0",
                      top: "0",
                      bottom: isLastNested ? "calc(100% - 1.3rem)" : "0",
                      width: "1px",
                      backgroundColor: "var(--border-color)",
                    }}
                  />

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.25rem",
                      position: "relative",
                      width: "100%",
                      maxWidth: "100%",
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: "-1.5rem",
                        top: "1.25rem",
                        width: "1rem",
                        height: "1px",
                        backgroundColor: "var(--border-color)",
                      }}
                    />
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: isMobileLayout ? "0.35rem" : "0.5rem",
                        marginTop: "0.5rem",
                        height: "1rem",
                        minWidth: 0,
                      }}
                    >
                      <LikeButton
                        note={nestedReply}
                        relayUrls={relayUrls}
                        size="sm"
                      />
                      <div
                        style={{
                          flex: "0 1 auto",
                          minWidth: 0,
                          maxWidth: isMobileLayout
                            ? `${Math.max(30, 50 - currentDepth * 5)}vw`
                            : `${Math.max(150, 300 - currentDepth * 30)}px`,
                          overflow: "hidden",
                        }}
                      >
                        <CommentDisplayName
                          pubkey={nestedReply.pubkey}
                          relayUrls={relayUrls}
                          isMobile={isMobileLayout}
                          getDisplayNameForPubkey={getDisplayNameForPubkey}
                          onNavigate={(pubkey) => {
                            navigate({
                              to: `/npub/${nip19.npubEncode(pubkey)}`,
                              state: true,
                            });
                          }}
                        />
                      </div>
                      <span
                        style={{
                          color: "var(--ibm-pewter)",
                          fontSize: "0.75rem",
                          flexShrink: 0,
                        }}
                      >
                        {formatRelativeTime(nestedReply.created_at)}
                      </span>
                      <button
                        onClick={() => handleFocusThreadOnNote(nestedReply.id)}
                        title="Focus thread on this note"
                        style={{
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                          color: "var(--ibm-slate-blue)",
                          fontSize: "0.75rem",
                          flexShrink: 0,
                        }}
                      >
                        [select]
                      </button>
                      <button
                        onClick={() => onToggleNoteCollapse(nestedReply.id)}
                        title={
                          collapsedNotes.has(nestedReply.id)
                            ? "Expand note"
                            : "Collapse note"
                        }
                        style={{
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                          color: "var(--ibm-slate-blue)",
                          fontSize: "0.75rem",
                          flexShrink: 0,
                          textAlign: "left",
                        }}
                      >
                        {collapsedNotes.has(nestedReply.id) ? "[+]" : "[-]"}
                      </button>
                    </div>
                    {!collapsedNotes.has(nestedReply.id) && (
                      <>
                        <div
                          style={{
                            color: "var(--text-color)",
                            fontSize: "0.875rem",
                            textAlign: "left",
                            lineHeight: "1.4",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            overflowWrap: "break-word",
                            width: "100%",
                            maxWidth: "100%",
                            overflow: "hidden",
                          }}
                        >
                          <NoteContentRenderer
                            content={nestedReply.content}
                            useAscii={useAscii}
                            useColor={useColor}
                            imageMode={imageMode}
                            getDisplayNameForPubkey={getDisplayNameForPubkey}
                            onHashtagClick={handleHashtagClick}
                            noteId={nestedReply.id}
                            index={nestedIdx}
                            asciiCache={asciiCache}
                            setFullScreenImage={setFullScreenImage}
                            onAsciiRendered={onAsciiRendered}
                            onMediaLoadError={onMediaLoadError}
                            onImageDimensionsLoaded={onImageDimensionsLoaded}
                            style={{
                              color: "var(--text-color)",
                              fontSize: "0.875rem",
                              textAlign: "left",
                              lineHeight: "1.4",
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                              overflowWrap: "break-word",
                            }}
                          />
                        </div>

                        {currentDepth < maxDepth && (
                          <NestedReplies
                            commentId={nestedReply.id}
                            depth={currentDepth + 1}
                            expandedNestedReplies={expandedNestedReplies}
                            onToggleNestedReplies={onToggleNestedReplies}
                            threadStructure={threadStructure}
                            childrenIdMap={childrenIdMap}
                            collapsedNotes={collapsedNotes}
                            onToggleNoteCollapse={onToggleNoteCollapse}
                            getDisplayNameForPubkey={getDisplayNameForPubkey}
                            navigate={navigate}
                            location={location}
                            useAscii={useAscii}
                            useColor={useColor}
                            imageMode={imageMode}
                            relayUrls={relayUrls}
                            isMobileLayout={isMobileLayout}
                            handleFocusThreadOnNote={handleFocusThreadOnNote}
                            handleHashtagClick={handleHashtagClick}
                            allNotes={allNotes}
                            idToIndex={idToIndex}
                            asciiCache={asciiCache}
                            setFullScreenImage={setFullScreenImage}
                            onAsciiRendered={onAsciiRendered}
                            onMediaLoadError={onMediaLoadError}
                            onImageDimensionsLoaded={onImageDimensionsLoaded}
                          />
                        )}

                        {/* Show "Continue thread" link when at max depth AND there are deeper replies */}
                        {(() => {
                          // Only show "Continue thread" when we've reached the depth limit (depth 3)
                          // This allows recursion up to depth 3, then shows the link
                          if (currentDepth < maxDepth - 1) return null;

                          // Get replies to THIS nested note using multiple strategies
                          let nestedReplyChildren: Note[] = [];

                          // Strategy 1: Check threadStructure
                          if (threadStructure) {
                            nestedReplyChildren =
                              threadStructure.get(nestedReply.id) || [];
                          }

                          // Strategy 2: Check childrenIdMap and look up notes in cache
                          if (
                            nestedReplyChildren.length === 0 &&
                            childrenIdMap &&
                            childrenIdMap[nestedReply.id]
                          ) {
                            const ids = childrenIdMap[nestedReply.id] || [];
                            nestedReplyChildren = ids
                              .map((id) =>
                                queryClient.getQueryData<Note>(
                                  CACHE_KEYS.NOTE(id)
                                )
                              )
                              .filter((n): n is Note => Boolean(n));
                          }

                          // Strategy 3: Scan allNotes for replies (fallback)
                          if (
                            nestedReplyChildren.length === 0 &&
                            allNotes &&
                            allNotes.length > 0
                          ) {
                            nestedReplyChildren = allNotes.filter(
                              (note) =>
                                Array.isArray(note.tags) &&
                                note.tags.some(
                                  (t) =>
                                    Array.isArray(t) &&
                                    t[0] === "e" &&
                                    t[1] === nestedReply.id
                                )
                            );
                          }

                          const nestedReplyCount = nestedReplyChildren.length;

                          // Show button if there are deeper replies
                          if (nestedReplyCount > 0) {
                            return (
                              <div
                                style={{
                                  marginTop: "0.5rem",
                                  marginLeft: "1rem",
                                }}
                              >
                                <button
                                  onClick={() =>
                                    handleFocusThreadOnNote(nestedReply.id)
                                  }
                                  style={{
                                    backgroundColor: "transparent",
                                    border: "none",
                                    color: "var(--ibm-slate-blue)",
                                    cursor: "pointer",
                                    fontSize: "0.75rem",
                                    textDecoration: "underline",
                                    padding: "4px 0",
                                  }}
                                >
                                  Continue thread ({nestedReplyCount}{" "}
                                  {nestedReplyCount === 1 ? "reply" : "replies"}
                                  )
                                </button>
                              </div>
                            );
                          }

                          return null;
                        })()}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};

export default NestedReplies;
