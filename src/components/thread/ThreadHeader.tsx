import React from "react";
import LoadingTextPlaceholder from "../ui/LoadingTextPlaceholder";

export interface ThreadHeaderProps {
  isQueryingNestedReplies: boolean;
}

export const ThreadHeader: React.FC<ThreadHeaderProps> = ({
  isQueryingNestedReplies,
}) => {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: 0,
        pointerEvents: "none", // allow clicks to pass through when not visible
      }}
    >
      {isQueryingNestedReplies && (
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            display: "flex",
            alignItems: "center",
            padding: "0rem 0.5rem",
            textAlign: "right",
            justifyContent: "flex-end",
            backgroundColor: "var(--app-bg-color)",
            color: "var(--text-muted)",
            fontSize: "0.75rem",
            zIndex: 2,
            pointerEvents: "auto", // allow interaction with the floating header
            minHeight: "2rem",
            height: "2rem",
          }}
        >
          <LoadingTextPlaceholder
            type="custom"
            customLength={2}
            speed="slow"
            style={{
              color: "var(--text-muted)",
              margin: "0 0.5rem",
              fontSize: "0.75rem",
            }}
          />
          <span style={{ marginRight: "0.5rem" }}>loading</span>
          <LoadingTextPlaceholder
            type="custom"
            customLength={2}
            speed="slow"
            style={{
              color: "var(--text-muted)",
              fontSize: "0.75rem",
            }}
          />
        </div>
      )}
    </div>
  );
};
