import React from "react";
import { useCreatedByDisplayName } from "../../hooks/useCreatedByDisplayName";
import LoadingTextPlaceholder from "../ui/LoadingTextPlaceholder";

export interface CommentDisplayNameProps {
  pubkey: string;
  relayUrls: string[];
  isMobile: boolean;
  getDisplayNameForPubkey: (pubkey: string) => string;
  onNavigate: (pubkey: string) => void;
  maxWidth?: string;
}

export const CommentDisplayName: React.FC<CommentDisplayNameProps> = ({
  pubkey,
  relayUrls,
  isMobile,
  getDisplayNameForPubkey,
  onNavigate,
  maxWidth,
}) => {
  const {
    displayText: displayUserNameOrNpub,
    isLoading,
    npub,
  } = useCreatedByDisplayName({
    pubkey,
    relayUrls,
    isMobile,
    getDisplayNameForPubkey,
  });

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    onNavigate(pubkey);
  };

  // Show loading placeholder if we're loading metadata
  if (isLoading) {
    return (
      <LoadingTextPlaceholder
        type="npub"
        speed="slow"
        style={{
          color: "var(--theme-aware-accent)",
          fontWeight: "bold",
          fontSize: "0.875rem",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: maxWidth,
          width: maxWidth ? undefined : "100%",
        }}
      />
    );
  }

  return (
    <a
      href={`/npub/${npub}`}
      onClick={handleClick}
      style={{
        color: "var(--theme-aware-accent)",
        fontWeight: "bold",
        fontSize: "0.875rem",
        cursor: "pointer",
        maxWidth: maxWidth,
        width: maxWidth ? undefined : "100%",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        display: "block",
      }}
      onMouseEnter={(e) => {
        if (!isMobile) {
          (e.currentTarget as HTMLAnchorElement).style.textDecoration =
            "underline";
        }
      }}
      onMouseLeave={(e) => {
        if (!isMobile) {
          (e.currentTarget as HTMLAnchorElement).style.textDecoration = "none";
        }
      }}
    >
      {displayUserNameOrNpub}
    </a>
  );
};
