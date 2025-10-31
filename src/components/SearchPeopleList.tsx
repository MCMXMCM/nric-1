import React from "react";
import { useNavigate } from "@tanstack/react-router";
import UserInfoCard from "./UserInfoCard";
import { nip19 } from "nostr-tools";

interface SearchPeopleListProps {
  pubkeys: string[];
  metadataByPubkey?: Record<string, any>;
  getDisplayNameForPubkey?: (pubkey: string) => string;
  isLoading?: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
  /**
   * Extra relays to try for metadata fetching (e.g., search relays that found these results)
   */
  extraRelays?: string[];
}

const SearchPeopleList: React.FC<SearchPeopleListProps> = ({
  pubkeys,
  metadataByPubkey = {},
  getDisplayNameForPubkey,
  isLoading = false,
  onLoadMore,
  hasMore = false,
  extraRelays = [],
}) => {
  const navigate = useNavigate();
  // location removed - unused variable

  const navigateToProfile = (hex: string) => {
    try {
      const npub = nip19.npubEncode(hex);
      console.log("🔍 SearchPeopleList navigating to profile:", {
        hex: hex.slice(0, 8),
        npub,
      });

      navigate({
        to: `/npub/${npub}`,
        state: true,
      });
    } catch (error) {
      console.error("Failed to navigate to profile:", error);
    }
  };

  if (!pubkeys || pubkeys.length === 0) {
    return (
      <div
        style={{
          color: "var(--text-color)",
          fontSize: "0.875rem",
          textAlign: "center",
          padding: "2rem",
        }}
      >
        No results
      </div>
    );
  }

  return (
    <>
      <ul
        style={{
          position: "relative",
          marginLeft: "1.5rem",
          paddingBottom: "1rem",
          listStyleType: "none",
        }}
      >
        {pubkeys.map((pk, idx) => {
          const isLast = idx === pubkeys.length - 1;
          return (
            <li
              key={pk}
              style={{
                position: "relative",
                paddingLeft: "1.5rem",
                paddingTop: "0.5rem",
                paddingBottom: "0.5rem",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: isLast ? "calc(100% - 1.3rem)" : 0,
                  width: 1,
                  backgroundColor: "var(--border-color)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: "1.25rem",
                  width: "1rem",
                  height: 1,
                  backgroundColor: "var(--border-color)",
                }}
              />
              <div
                onClick={() => navigateToProfile(pk)}
                style={{ cursor: "pointer", width: "100%" }}
                title="Click to view profile"
              >
                <UserInfoCard
                  pubkeyHex={pk}
                  metadata={metadataByPubkey}
                  getDisplayNameForPubkey={getDisplayNameForPubkey}
                  isLoading={isLoading}
                  size={50}
                  extraRelays={extraRelays}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {hasMore && onLoadMore && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginTop: "1rem",
            paddingBottom: "2rem",
          }}
        >
          <button
            onClick={onLoadMore}
            style={{
              backgroundColor: "transparent",
              color: "var(--text-color)",
              border: "1px dotted var(--border-color)",
              padding: "0.5rem 1rem",
              cursor: "pointer",
              fontSize: "0.875rem",
            }}
          >
            View more
          </button>
        </div>
      )}
    </>
  );
};

export default SearchPeopleList;
