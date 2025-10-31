import React from "react";
import { useNavigate } from "@tanstack/react-router";
import { nip19 } from "nostr-tools";
import type { Note } from "../../types/nostr/types";
import { formatRelativeTime } from "../../utils/nostr/utils";
import NoteContentRenderer from "../NoteContentRenderer";
import { LikeButton } from "./LikeButton";

export interface ParentNoteProps {
  currentParentNote: Note;
  isMobile: boolean;
  parentDisplayNameorNpub: string;
  useAscii?: boolean;
  useColor?: boolean;
  getDisplayNameForPubkey: (pubkey: string) => string;
  onHashtagClick?: (hashtag: string) => void;
  updateReplyModalState?: (
    noteId: string | null,
    noteData?: Note | null
  ) => void;
  refetchComments: () => void;
  collapsedParentNotes: Record<string, boolean>;
  toggleParentNoteCollapsed: (noteId: string) => void;
  getRootIdFromNote: (note: Note) => string | null;
  getDirectParentIdFromNote: (note: Note) => string | null;
  shouldUseNavigation: (note: Note) => boolean;
  handleNavigateToRoot: () => void;
  handleNavigateToParent: () => void;
  relayUrls: string[];
}

export const ParentNote: React.FC<ParentNoteProps> = ({
  currentParentNote,
  isMobile,
  parentDisplayNameorNpub,
  useAscii = false,
  useColor = false,
  getDisplayNameForPubkey,
  onHashtagClick,
  updateReplyModalState,
  refetchComments,
  collapsedParentNotes,
  toggleParentNoteCollapsed,
  getRootIdFromNote,
  getDirectParentIdFromNote,
  shouldUseNavigation,
  handleNavigateToRoot,
  handleNavigateToParent,
  relayUrls,
}) => {
  const navigate = useNavigate();
  // location removed - unused variable

  return (
    <div
      id={`note-${currentParentNote.id}`}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: "0.5rem",
        marginBottom: "1rem",
      }}
    >
      {/* Like button with up triangle icon */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <LikeButton note={currentParentNote} relayUrls={relayUrls} size="sm" />

        <a
          href={`/npub/${nip19.npubEncode(currentParentNote.pubkey)}`}
          onClick={(e) => {
            e.preventDefault();
            // backToPath removed - unused variable
            navigate({
              to: `/npub/${nip19.npubEncode(currentParentNote.pubkey)}`,
              state: true,
            });
          }}
          style={{
            color: "var(--theme-aware-accent)",
            fontWeight: "bold",
            fontSize: "0.875rem",
            cursor: "pointer",
            maxWidth: isMobile ? "20vw" : "250px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          onMouseEnter={(e) => {
            if (!isMobile) {
              (e.currentTarget as HTMLAnchorElement).style.textDecoration =
                "underline";
            }
          }}
          onMouseLeave={(e) => {
            if (!isMobile) {
              (e.currentTarget as HTMLAnchorElement).style.textDecoration =
                "none";
            }
          }}
        >
          {parentDisplayNameorNpub}
        </a>

        <span
          style={{
            color: "var(--ibm-pewter)",
            fontSize: "0.75rem",
            marginLeft: "0.5rem",
          }}
        >
          {formatRelativeTime(currentParentNote.created_at)}
        </span>
        <button
          onClick={() => {
            if (import.meta.env.DEV) {
            }
            refetchComments();
          }}
          style={{
            minHeight: "14px",
            minWidth: "14px",
            backgroundColor: "transparent",
            padding: "0.25rem 0.5rem",
            cursor: "pointer",
            fontSize: "0.75rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--link-color)",
          }}
          title={`Refresh Comments`}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ verticalAlign: "middle", display: "inline-block" }}
          >
            <path d="M21 2v6h-6" />
            <path d="M3 12a9 9 0 0 1 15.54-6.36L21 8" />
            <path d="M3 12a9 9 0 0 0 15.54 6.36L21 16" />
          </svg>
        </button>
        <button
          onClick={() =>
            updateReplyModalState?.(currentParentNote.id, currentParentNote)
          }
          title="Reply"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--link-color)",
            cursor: "pointer",
            minHeight: "14px",
            minWidth: "14px",
            height: "14px",
            width: "14px",
            padding: 0,
            display: "flex",
            alignItems: "center",
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 14 4 9 9 4" />
            <path d="M20 20v-6a4 4 0 0 0-4-4H4" />
          </svg>
        </button>

        {(() => {
          const rootId = getRootIdFromNote(currentParentNote);
          const parentId = getDirectParentIdFromNote(currentParentNote);
          const shouldNavigate = shouldUseNavigation(currentParentNote);

          return (
            <>
              {rootId && rootId !== currentParentNote.id && shouldNavigate && (
                <button
                  onClick={handleNavigateToRoot}
                  style={{
                    backgroundColor: "transparent",
                    border: "none",
                    color: "var(--ibm-pewter)",
                    cursor: "pointer",
                    fontSize: "0.75rem",
                  }}
                  title="Go to root"
                >
                  root
                </button>
              )}
              {parentId &&
                parentId !== currentParentNote.id &&
                shouldNavigate && (
                  <button
                    onClick={handleNavigateToParent}
                    style={{
                      backgroundColor: "transparent",
                      border: "none",
                      color: "var(--ibm-pewter)",
                      cursor: "pointer",
                      fontSize: "0.75rem",
                    }}
                    title="Go to parent"
                  >
                    parent
                  </button>
                )}
            </>
          );
        })()}

        <button
          onClick={() => toggleParentNoteCollapsed(currentParentNote.id)}
          style={{
            backgroundColor: "transparent",
            border: "none",
            color: "var(--ibm-pewter)",
            cursor: "pointer",
            fontSize: "0.75rem",
          }}
          title={
            collapsedParentNotes[currentParentNote.id] ? "Expand" : "Collapse"
          }
        >
          {collapsedParentNotes[currentParentNote.id] ? "[+]" : "[-]"}
        </button>
      </div>
      {!collapsedParentNotes[currentParentNote.id] && (
        <div
          style={{
            color: "var(--text-color)",
            fontSize: "0.875rem",
            textAlign: "left",
            whiteSpace: "pre-wrap",
            lineHeight: "1.4",
            wordBreak: "break-word",
            overflowWrap: "break-word",
            width: "100%",
          }}
        >
          <NoteContentRenderer
            content={currentParentNote.content}
            useAscii={useAscii}
            useColor={useColor}
            imageMode={true}
            getDisplayNameForPubkey={getDisplayNameForPubkey}
            onHashtagClick={onHashtagClick}
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
      )}
    </div>
  );
};
