import React from "react";
import type { Note } from "../../types/nostr/types";
import { nip19 } from "nostr-tools";
import { formatRelativeTime } from "../../utils/nostr/utils";
import { CommentDisplayName } from "./CommentDisplayName";
import { LikeButton } from "./LikeButton";
import NoteContentRenderer from "../NoteContentRenderer";
import LoadingTextMultiLine from "../ui/LoadingTextMultiLine";
import NestedReplies from "./NestedReplies";

type CommentsListProps = {
  isLoadingComments: boolean;
  comments: Note[];
  visibleComments: Note[];
  isMobileLayout: boolean;
  relayUrls: string[];
  getDisplayNameForPubkey: (pubkey: string) => string;
  navigate: (opts: any) => void;
  location: any;
  currentParentNote: Note | null;
  collapsedNotes: Set<string>;
  toggleNoteCollapse: (noteId: string) => void;
  handleFocusThreadOnNote: (noteId: string) => void;
  useAscii: boolean;
  useColor: boolean;
  imageMode: any;
  handleHashtagClick: (tag: string) => void;
  expandedNestedReplies: Set<string>;
  toggleNestedReplies: (commentId: string) => void;
  threadStructure: Map<string, Note[]> | undefined;
  childrenIdMap?: Record<string, string[]>;
  hasNextPage: boolean | undefined;
  THREAD_PAGE_SIZE: number;
  isLoadingMore: boolean;
  handleLoadMore: () => Promise<void>;
  setVisibleCount: React.Dispatch<React.SetStateAction<number>>;
  allNotes?: Note[];
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

const CommentsList: React.FC<CommentsListProps> = ({
  isLoadingComments,
  comments,
  visibleComments,
  isMobileLayout,
  relayUrls,
  getDisplayNameForPubkey,
  navigate,
  location,
  currentParentNote,
  collapsedNotes,
  toggleNoteCollapse,
  handleFocusThreadOnNote,
  useAscii,
  useColor,
  imageMode,
  handleHashtagClick,
  expandedNestedReplies,
  toggleNestedReplies,
  threadStructure,
  childrenIdMap,
  hasNextPage,
  THREAD_PAGE_SIZE,
  isLoadingMore,
  handleLoadMore,
  setVisibleCount,
  allNotes = [],
  // MediaGallery props
  asciiCache = {},
  setFullScreenImage = () => {},
  onAsciiRendered = () => {},
  onMediaLoadError = () => {},
  onImageDimensionsLoaded = () => {},
}) => {
  // Only show loading when actively fetching AND no comments loaded yet
  if (isLoadingComments && comments.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          width: "100%",
          padding: "2rem",
          color: "var(--text-muted)",
        }}
      >
        <span style={{ marginBottom: "1rem" }}>Loading thread...</span>
        <LoadingTextMultiLine
          style={{ width: "100%", height: "6rem" }}
          lineCount={3}
          lineLength={isMobileLayout ? 25 : 50}
        />
      </div>
    );
  }

  // When there are no comments yet, prefer a brief neutral state instead of a definitive "No replies yet"
  if (comments.length === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          width: "100%",
          padding: "2rem",
          color: "var(--text-muted)",
          fontSize: "0.875rem",
        }}
      >
        No replies yet
      </div>
    );
  }

  return (
    <>
      <ul
        style={{
          position: "relative",
          margin: 0,
          padding: 0,
          listStyleType: "none",
        }}
      >
        {(() => {
          // Always show all visible comments - don't filter by context
          // This ensures all replies always show up regardless of navigation context
          return visibleComments;
        })().map((comment, idx) => {
          const commentsToShow = visibleComments;
          const isLast = idx === commentsToShow.length - 1;

          return (
            <li
              key={comment.id}
              id={`note-${comment.id}`}
              data-note-id={comment.id}
              data-index={idx + 1}
              style={{ position: "relative", paddingLeft: "1.5rem" }}
            >
              <div
                style={{
                  position: "absolute",
                  left: "0",
                  top: "0",
                  bottom: isLast ? "calc(100% - 1.3rem)" : "0",
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
                  <LikeButton note={comment} relayUrls={relayUrls} size="sm" />
                  <div
                    style={{
                      flex: "0 1 auto",
                      minWidth: 0,
                      maxWidth: isMobileLayout ? "50vw" : "300px",
                      overflow: "hidden",
                    }}
                  >
                    <CommentDisplayName
                      pubkey={comment.pubkey}
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
                    {formatRelativeTime(comment.created_at)}
                  </span>
                  <button
                    onClick={() => handleFocusThreadOnNote(comment.id)}
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
                  <a
                    href={`#note-${currentParentNote?.id || ""}`}
                    onClick={(e) => {
                      e.preventDefault();
                      document
                        .getElementById(`note-${currentParentNote?.id || ""}`)
                        ?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                    }}
                    title="Scroll to parent note"
                    style={{
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                      color: "var(--ibm-slate-blue)",
                      fontSize: "0.75rem",
                      flexShrink: 0,
                      textDecoration: "none",
                    }}
                  >
                    [parent]
                  </a>
                  {idx < commentsToShow.length - 1 && (
                    <a
                      href={`#note-${commentsToShow[idx + 1]?.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        document
                          .getElementById(`note-${commentsToShow[idx + 1]?.id}`)
                          ?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          });
                      }}
                      title="Scroll to next reply"
                      style={{
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                        color: "var(--ibm-slate-blue)",
                        fontSize: "0.75rem",
                        flexShrink: 0,
                        textDecoration: "none",
                      }}
                    >
                      [next]
                    </a>
                  )}
                  <button
                    onClick={() => toggleNoteCollapse(comment.id)}
                    title={
                      collapsedNotes.has(comment.id)
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
                    {collapsedNotes.has(comment.id) ? "[+]" : "[-]"}
                  </button>
                </div>
                {!collapsedNotes.has(comment.id) && (
                  <div
                    style={{
                      width: "100%",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "flex-start",
                      alignItems: "flex-start",
                      textAlign: "left",
                    }}
                  >
                    <div
                      style={{
                        color: "var(--text-color)",
                        fontSize: "0.875rem",
                        textAlign: "left",
                        whiteSpace: "pre-wrap",
                        lineHeight: "1.4",
                        wordBreak: "break-word",
                        overflowWrap: "break-word",
                      }}
                    >
                      <NoteContentRenderer
                        content={comment.content}
                        useAscii={useAscii}
                        useColor={useColor}
                        imageMode={imageMode}
                        getDisplayNameForPubkey={getDisplayNameForPubkey}
                        onHashtagClick={handleHashtagClick}
                        noteId={comment.id}
                        index={idx}
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
                    <NestedReplies
                      commentId={comment.id}
                      depth={1}
                      expandedNestedReplies={expandedNestedReplies}
                      onToggleNestedReplies={toggleNestedReplies}
                      threadStructure={threadStructure as any}
                      childrenIdMap={childrenIdMap}
                      collapsedNotes={collapsedNotes}
                      onToggleNoteCollapse={toggleNoteCollapse}
                      getDisplayNameForPubkey={getDisplayNameForPubkey as any}
                      navigate={navigate as any}
                      location={location as any}
                      useAscii={useAscii}
                      useColor={useColor}
                      imageMode={imageMode}
                      relayUrls={relayUrls}
                      isMobileLayout={isMobileLayout}
                      handleFocusThreadOnNote={handleFocusThreadOnNote}
                      handleHashtagClick={handleHashtagClick}
                      allNotes={allNotes}
                      asciiCache={asciiCache}
                      setFullScreenImage={setFullScreenImage}
                      onAsciiRendered={onAsciiRendered}
                      onMediaLoadError={onMediaLoadError}
                      onImageDimensionsLoaded={onImageDimensionsLoaded}
                    />
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {comments.length > 0 &&
        (visibleComments.length < comments.length ||
          (hasNextPage &&
            comments.length >= THREAD_PAGE_SIZE &&
            visibleComments.length === comments.length)) && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginTop: "0.75rem",
            }}
          >
            <button
              onClick={async () => {
                if (visibleComments.length < comments.length) {
                  setVisibleCount((c) => c + THREAD_PAGE_SIZE);
                  return;
                }
                await handleLoadMore();
                setVisibleCount((c) => c + THREAD_PAGE_SIZE);
              }}
              disabled={isLoadingMore}
              style={{
                backgroundColor: "transparent",
                color: "var(--ibm-slate-blue)",
                border: "1px solid var(--border-color)",
                borderRadius: "4px",
                padding: "0.4rem 0.75rem",
                fontSize: "0.875rem",
                cursor: isLoadingMore ? "default" : "pointer",
              }}
            >
              {isLoadingMore ? "Loading…" : "Load more replies"}
            </button>
          </div>
        )}
    </>
  );
};

export default CommentsList;
