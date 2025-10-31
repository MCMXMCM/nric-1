import React from "react";
import type { BufferState } from "../../types/buffer";

interface BufferEdgeIndicatorProps {
  bufferState: BufferState | null;
  feedQuery: any;
  currentIndex: number;
  onRetryFetch?: () => void;
  isBufferEnabled: boolean;
}

/**
 * Component that shows feedback when user reaches buffer/feed edges
 */
export const BufferEdgeIndicator: React.FC<BufferEdgeIndicatorProps> = ({
  bufferState,
  feedQuery,
  currentIndex,
  onRetryFetch,
  isBufferEnabled,
}) => {
  // Don't show anything if buffer is disabled or no state
  if (!isBufferEnabled || !bufferState) {
    return null;
  }

  const notes = bufferState.notes;
  const atBeginning = bufferState.atBeginning;
  const atEnd = bufferState.atEnd;
  const hasNextPage = feedQuery?.query?.hasNextPage ?? false;
  const isFetching = feedQuery?.query?.isFetching ?? false;

  // Check if we're at the edge of available data
  const isAtDataStart = currentIndex === 0;
  const isAtDataEnd = notes.size > 0 && currentIndex >= notes.size - 1;

  // Don't show indicator if we're not at an edge
  if (!isAtDataStart && !isAtDataEnd) {
    return null;
  }

  const getEdgeMessage = () => {
    if (isAtDataStart && atBeginning) {
      return {
        icon: "⬆️",
        title: "Beginning of Feed",
        message: "You've reached the oldest notes in your feed.",
        actionText: null,
      };
    }

    if (isAtDataEnd && atEnd && !hasNextPage) {
      return {
        icon: "⬇️",
        title: "End of Feed",
        message: "You've reached the latest notes. No newer content available.",
        actionText: null,
      };
    }

    if (isAtDataEnd && !atEnd && hasNextPage) {
      return {
        icon: "⏳",
        title: "Loading More Notes",
        message: "Fetching additional notes from the network...",
        actionText: isFetching ? null : "Retry",
      };
    }

    if (isAtDataEnd && !hasNextPage) {
      return {
        icon: "📄",
        title: "End of Feed",
        message:
          "You've reached the end of available notes. No more content to load.",
        actionText: null,
      };
    }

    return null;
  };

  const edgeInfo = getEdgeMessage();
  if (!edgeInfo) return null;

  return (
    <div
      style={{
        padding: "1rem",
        margin: "1rem 0",
        backgroundColor: "var(--app-bg-color)",
        border: "1px solid var(--border-color)",
        borderRadius: "8px",
        textAlign: "center",
        maxWidth: "400px",
        marginLeft: "auto",
        marginRight: "auto",
      }}
    >
      <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>
        {edgeInfo.icon}
      </div>

      <div
        style={{
          fontSize: "1rem",
          fontWeight: "600",
          color: "var(--text-color)",
          marginBottom: "0.25rem",
        }}
      >
        {edgeInfo.title}
      </div>

      <div
        style={{
          fontSize: "0.9rem",
          color: "var(--text-secondary-color)",
          marginBottom: edgeInfo.actionText ? "1rem" : "0",
        }}
      >
        {edgeInfo.message}
      </div>

      {edgeInfo.actionText && onRetryFetch && (
        <button
          onClick={onRetryFetch}
          disabled={isFetching}
          style={{
            backgroundColor: "var(--accent-color)",
            color: "white",
            border: "none",
            padding: "0.5rem 1rem",
            borderRadius: "4px",
            fontSize: "0.9rem",
            cursor: isFetching ? "not-allowed" : "pointer",
            opacity: isFetching ? 0.6 : 1,
          }}
        >
          {isFetching ? "Loading..." : edgeInfo.actionText}
        </button>
      )}

      {isBufferEnabled && (
        <div
          style={{
            fontSize: "0.8rem",
            color: "var(--text-tertiary-color)",
            marginTop: "0.5rem",
            fontStyle: "italic",
          }}
        >
          Buffer: {notes.size} notes cached • Position: {currentIndex + 1}
        </div>
      )}
    </div>
  );
};

/**
 * Hook for managing edge case feedback
 */
export function useBufferEdgeFeedback(
  bufferState: BufferState | null,
  feedQuery: any,
  isBufferEnabled: boolean
) {
  const [showFeedback, setShowFeedback] = React.useState(false);
  const [feedbackType, setFeedbackType] = React.useState<
    "start" | "end" | "loading" | null
  >(null);

  React.useEffect(() => {
    if (!isBufferEnabled || !bufferState) {
      setShowFeedback(false);
      return;
    }

    const currentIndex = bufferState.currentIndex;
    const notes = bufferState.notes;
    const hasNextPage = feedQuery?.query?.hasNextPage ?? false;

    // Check edge conditions
    if (currentIndex === 0 && bufferState.atBeginning) {
      setFeedbackType("start");
      setShowFeedback(true);
    } else if (notes.size > 0 && currentIndex >= notes.size - 1) {
      if (bufferState.atEnd && !hasNextPage) {
        setFeedbackType("end");
        setShowFeedback(true);
      } else if (hasNextPage) {
        setFeedbackType("loading");
        setShowFeedback(true);
      } else {
        setShowFeedback(false);
      }
    } else {
      setShowFeedback(false);
    }
  }, [bufferState, feedQuery, isBufferEnabled]);

  const dismissFeedback = React.useCallback(() => {
    setShowFeedback(false);
  }, []);

  return {
    showFeedback,
    feedbackType,
    dismissFeedback,
  };
}
