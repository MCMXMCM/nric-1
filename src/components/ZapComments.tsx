import React from "react";
import { useZapReceipts } from "../hooks/useZapReceipts";
import { formatRelativeTime } from "../utils/nostr/utils";

interface ZapCommentsProps {
  noteId: string;
  relayUrls: string[];
  noteAuthorPubkey?: string;
  getDisplayNameForPubkey: (pubkey: string) => string;
  isDarkMode?: boolean;
}

const ZapComments: React.FC<ZapCommentsProps> = ({
  noteId,
  relayUrls,
  noteAuthorPubkey,
  getDisplayNameForPubkey,
  isDarkMode = false,
}) => {
  const { data: zapReceipts, isLoading } = useZapReceipts({
    noteId,
    relayUrls,
    noteAuthorPubkey,
  });

  // Filter receipts that have comments
  const receiptsWithComments =
    zapReceipts?.filter((receipt) => receipt.comment?.trim()) || [];

  if (isLoading || receiptsWithComments.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        marginTop: "12px",
        padding: "8px",
        backgroundColor: isDarkMode
          ? "rgba(255, 255, 255, 0.03)"
          : "rgba(0, 0, 0, 0.02)",
        border: `1px solid ${
          isDarkMode ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)"
        }`,
      }}
    >
      <div
        style={{
          fontSize: "0.75rem",
          color: "var(--text-muted)",
          marginBottom: "8px",
          fontWeight: "bold",
          display: "flex",
          alignItems: "center",
          gap: "4px",
        }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: "#D4A574" }}
        >
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
        Zap Comments ({receiptsWithComments.length})
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {receiptsWithComments.slice(0, 3).map((receipt) => (
          <div
            key={receipt.id}
            style={{
              fontSize: "0.8rem",
              lineHeight: "1.4",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                marginBottom: "2px",
              }}
            >
              <span
                style={{
                  fontWeight: "bold",
                  color: "var(--accent-color)",
                  fontSize: "0.75rem",
                }}
              >
                {getDisplayNameForPubkey(receipt.zapperPubkey)}
              </span>
              <span
                style={{
                  color: "#D4A574",
                  fontSize: "0.7rem",
                  fontWeight: "bold",
                }}
              >
                +{receipt.amountSats} sats
              </span>
              <span
                style={{
                  color: "var(--text-muted)",
                  fontSize: "0.7rem",
                }}
              >
                {formatRelativeTime(receipt.createdAt)}
              </span>
            </div>
            <div
              style={{
                color: "var(--text-color)",
                marginLeft: "0px",
                fontStyle: "italic",
              }}
            >
              "{receipt.comment}"
            </div>
          </div>
        ))}

        {receiptsWithComments.length > 3 && (
          <div
            style={{
              fontSize: "0.7rem",
              color: "var(--text-muted)",
              textAlign: "center",
              marginTop: "4px",
            }}
          >
            +{receiptsWithComments.length - 3} more zap comments
          </div>
        )}
      </div>
    </div>
  );
};

export default ZapComments;
