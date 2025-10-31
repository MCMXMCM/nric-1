import React from "react";
import ThreadHeader from "../ThreadHeader";
import StandardLoader from "../ui/StandardLoader";

type ThreadLoadingProps = {
  isMobile: boolean;
  noteId: string;
};

export const ThreadLoading: React.FC<ThreadLoadingProps> = ({
  isMobile,
  noteId,
}) => {
  return (
    <div
      className="nostr-feed"
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
      <div
        style={{
          width: "100%",
          maxWidth: isMobile ? "100%" : "1000px",
          margin: isMobile ? "0" : "0 auto",
          display: "flex",
          flexDirection: "column",
          flex: "0 0 auto",
          backgroundColor: "var(--app-bg-color)",
        }}
      >
        <div
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "center",
            backgroundColor: "var(--app-bg-color)",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "1000px",
            }}
          >
            <ThreadHeader isMobile={isMobile} noteId={noteId} />
          </div>
        </div>
      </div>
      <div
        style={{
          width: "100%",
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          display: "flex",
          justifyContent: "center",
          padding: isMobile ? "1rem 0.5rem" : "1rem",
        }}
      >
        <StandardLoader message="Loading thread..." alignWithSplash={true} />
      </div>
    </div>
  );
};

export default ThreadLoading;
