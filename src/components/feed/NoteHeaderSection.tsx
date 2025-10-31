import React from "react";
import NoteHeader from "../NoteHeader";

interface NoteHeaderSectionProps {
  isNoteDetailRoute: boolean;
  isMobile: boolean;
  uiIsDarkMode: boolean;
  onShare: () => void;
  replyCount: number;
  showThreadModal?: boolean;
  noteId?: string;
}

export const NoteHeaderSection: React.FC<NoteHeaderSectionProps> = ({
  isNoteDetailRoute,
  isMobile,
  uiIsDarkMode,
  onShare,
  replyCount,
  showThreadModal = false,
  noteId,
}) => {
  if (!isNoteDetailRoute) {
    return null;
  }

  return (
    <div
      style={{
        width: "100%",
        backgroundColor: "var(--app-bg-color )",
        zIndex: 2,
      }}
    >
      <div
        style={{
          maxWidth: isMobile ? "100%" : "1000px",
          backgroundColor:
            !uiIsDarkMode && showThreadModal
              ? "#fdb11a"
              : uiIsDarkMode
              ? "var(--app-bg-color)"
              : "var(--blue-bg-card)",
          minHeight: "2.5rem",
          display: "flex",
          alignItems: "center",
        }}
      >
        <NoteHeader
          title={showThreadModal ? "Thread" : "Note"}
          isMobile={isMobile}
          onShare={onShare}
          showThreadModal={showThreadModal}
          replyCount={replyCount}
          noteId={noteId}
        />
      </div>
    </div>
  );
};
