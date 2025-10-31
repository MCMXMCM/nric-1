import React from "react";
import type { Note } from "../../types/nostr/types";
import { nip19 } from "nostr-tools";
import { formatRelativeTime } from "../../utils/nostr/utils";
import NoteContentRenderer from "../NoteContentRenderer";
import { CommentDisplayName } from "./CommentDisplayName";
import { LikeButton } from "./LikeButton";
import LoadingText from "../ui/LoadingText";
import { RepostContent } from "../notecard/RepostContent";

type MainNoteProps = {
  currentParentNote: Note | null;
  hexNoteId: string | null;
  noteId: string;
  isMobileLayout: boolean;
  relayUrls: string[];
  getDisplayNameForPubkey: (pubkey: string) => string;
  navigate: (opts: any) => void;
  handleHashtagClick: (tag: string) => void;
  handleFocusThreadOnNote: (
    noteId: string,
    options?: { skipRootId?: boolean }
  ) => void;
  collapsedNotes: Set<string>;
  toggleNoteCollapse: (noteId: string) => void;
  showFullMainNoteContent: boolean;
  isQuoteRepostMain: boolean;
  mainRepostOriginal: Note | null;
  useAscii: boolean;
  useColor: boolean;
  imageMode: any;
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

const MainNote: React.FC<MainNoteProps> = ({
  currentParentNote,
  hexNoteId,
  noteId,
  isMobileLayout,
  relayUrls,
  getDisplayNameForPubkey,
  navigate,
  handleHashtagClick,
  handleFocusThreadOnNote,
  collapsedNotes,
  toggleNoteCollapse,
  showFullMainNoteContent,
  isQuoteRepostMain,
  mainRepostOriginal,
  useAscii,
  useColor,
  imageMode,
  // MediaGallery props
  asciiCache = {},
  setFullScreenImage = () => {},
  onAsciiRendered = () => {},
  onMediaLoadError = () => {},
  onImageDimensionsLoaded = () => {},
}) => {
  if (!currentParentNote && !noteId && !hexNoteId) return null;

  return (
    <div
      id={`note-${currentParentNote?.id || hexNoteId || noteId}`}
      data-index={0}
      data-note-id={currentParentNote?.id || hexNoteId || noteId}
      style={{
        width: "100%",
        padding: isMobileLayout ? "1rem 0 0 0" : "0rem",
      }}
    >
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
            display: "flex",
            alignItems: "center",
            height: isMobileLayout ? "20px" : "auto",
            gap: isMobileLayout ? "0.75rem" : "0.75rem",
            minWidth: 0,
          }}
        >
          {currentParentNote ? (
            <LikeButton
              note={currentParentNote}
              relayUrls={relayUrls}
              size="sm"
            />
          ) : (
            <div style={{ width: 16, height: 16 }} />
          )}
          <div
            style={{
              flex: "0 1 auto",
              minWidth: 0,
              maxWidth: isMobileLayout ? "50vw" : "300px",
              overflow: "hidden",
            }}
          >
            {currentParentNote ? (
              <CommentDisplayName
                pubkey={currentParentNote.pubkey}
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
            ) : (
              <LoadingText
                length={isMobileLayout ? 8 : 12}
                speed="slow"
                style={{ fontSize: "0.875rem" }}
              />
            )}
          </div>
          <span
            style={{
              color: "var(--ibm-pewter)",
              fontSize: "0.75rem",
              flexShrink: 0,
            }}
          >
            {currentParentNote
              ? formatRelativeTime(currentParentNote.created_at)
              : ""}
          </span>
          {(() => {
            const eTags =
              currentParentNote?.tags?.filter(
                (t: any) => Array.isArray(t) && t[0] === "e"
              ) || [];
            const replyTag = eTags.find((t: any) => t[3] === "reply");
            const parentId =
              replyTag?.[1] ||
              (eTags.length >= 2
                ? (eTags as any)[1]?.[1]
                : (eTags as any)[0]?.[1]);

            if (parentId && parentId !== currentParentNote?.id) {
              return (
                <button
                  onClick={() => handleFocusThreadOnNote(parentId)}
                  title="Show parent note"
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--ibm-slate-blue)",
                    fontSize: "0.75rem",
                    flexShrink: 0,
                  }}
                >
                  [parent]
                </button>
              );
            }
            return null;
          })()}
          {(() => {
            const eTags =
              currentParentNote?.tags?.filter(
                (t: any) => Array.isArray(t) && t[0] === "e"
              ) || [];
            const rootTag = eTags.find((t: any) => t[3] === "root");
            const rootId = rootTag?.[1];

            if (rootId && rootId !== currentParentNote?.id) {
              return (
                <button
                  onClick={() => handleFocusThreadOnNote(rootId)}
                  title="Show root note of thread"
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--ibm-slate-blue)",
                    fontSize: "0.75rem",
                    flexShrink: 0,
                  }}
                >
                  [root]
                </button>
              );
            }
            return null;
          })()}
          {currentParentNote && (
            <button
              onClick={() => toggleNoteCollapse(currentParentNote.id)}
              title={
                collapsedNotes.has(currentParentNote.id)
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
              {collapsedNotes.has(currentParentNote.id) ? "[+]" : "[-]"}
            </button>
          )}
        </div>
        {!currentParentNote ? (
          <div style={{ width: "100%" }}>
            <LoadingText
              length={isMobileLayout ? 10 : 25}
              speed="slow"
              style={{ fontSize: "0.875rem" }}
            />
          </div>
        ) : (
          !collapsedNotes.has(currentParentNote.id) && (
            <div style={{ width: "100%" }}>
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
                  content={
                    showFullMainNoteContent
                      ? currentParentNote.content
                      : currentParentNote.content.length > 280
                        ? currentParentNote.content.substring(0, 280).trim() +
                          "..."
                        : currentParentNote.content
                  }
                  useAscii={useAscii}
                  useColor={useColor}
                  imageMode={imageMode}
                  getDisplayNameForPubkey={getDisplayNameForPubkey}
                  onHashtagClick={handleHashtagClick}
                  renderNoteLinkAsThread={true}
                  noteLinkLabel={"View original thread"}
                  noteId={currentParentNote.id}
                  index={0}
                  asciiCache={asciiCache}
                  setFullScreenImage={setFullScreenImage}
                  onAsciiRendered={onAsciiRendered}
                  onMediaLoadError={onMediaLoadError}
                  onImageDimensionsLoaded={onImageDimensionsLoaded}
                  showLinkPreviews={true}
                  maxLinkPreviewsToShow={3}
                  style={{
                    color: "var(--text-color)",
                    fontSize: "0.875rem",
                    lineHeight: "1.4",
                  }}
                />
              </div>
              {isQuoteRepostMain && (
                <RepostContent
                  repostOriginal={mainRepostOriginal}
                  isMobile={isMobileLayout}
                  useAscii={useAscii}
                  useColor={useColor}
                  getDisplayNameForPubkey={getDisplayNameForPubkey}
                  onHashtagClick={handleHashtagClick}
                  imageMode={imageMode}
                  asciiCache={asciiCache}
                  setFullScreenImage={setFullScreenImage}
                  onAsciiRendered={onAsciiRendered}
                  onMediaLoadError={onMediaLoadError}
                  onImageDimensionsLoaded={onImageDimensionsLoaded}
                />
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default MainNote;
