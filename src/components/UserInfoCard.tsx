import React, { useMemo, useRef, useEffect } from "react";
import { nip19 } from "nostr-tools";
import type { Metadata } from "../types/nostr/types";
import LoadingTextPlaceholder from "./ui/LoadingTextPlaceholder";
import useVisibilityMetadata from "../hooks/useVisibilityMetadata";
import { useRelayManager } from "../hooks/useRelayManager";
import { NostrContext } from "../contexts/NostrContext";

interface UserInfoCardProps {
  pubkeyHex: string;
  metadata?: Record<string, Metadata>;
  getDisplayNameForPubkey?: (pubkey: string) => string;
  isLoading?: boolean;
  size?: number; // avatar size in px (default 36) - currently unused but kept for API compatibility
  /**
   * Extra relays to try for metadata fetching (e.g., from search context)
   */
  extraRelays?: string[];
  /**
   * Whether to fetch metadata immediately (bypass visibility check)
   * @default false
   */
  fetchImmediately?: boolean;
}

const UserInfoCard: React.FC<UserInfoCardProps> = ({
  pubkeyHex,
  metadata,
  getDisplayNameForPubkey,
  isLoading = false,
  size: _size = 36, // Keep for API compatibility but don't use
  extraRelays = [],
  fetchImmediately = false,
}) => {
  // Get relay manager for fallback metadata fetching
  const { nostrClient, pubkey } = React.useContext(NostrContext);
  const { readRelays } = useRelayManager({
    nostrClient,
    pubkeyHex: pubkey || "",
  });

  // Use visibility-based metadata fetching as fallback when no metadata is provided
  const visibilityResult = useVisibilityMetadata({
    pubkeyHex,
    relayUrls: readRelays,
    extraRelays,
    enabled: fetchImmediately || !metadata?.[pubkeyHex], // Fetch if no metadata provided
  });

  const {
    metadata: visibilityMetadata,
    isLoading: isVisibilityLoading,
    visibilityRef,
  } = visibilityResult;
  // Generate npub for fallback display
  const npub = useMemo(() => {
    if (!pubkeyHex) return null;
    try {
      return nip19.npubEncode(pubkeyHex);
    } catch {
      return pubkeyHex?.slice(0, 16) + "..." || null;
    }
  }, [pubkeyHex]);

  // Get effective metadata and display name - prioritize provided metadata, fallback to visibility metadata
  const effectiveMetadata = metadata?.[pubkeyHex] || visibilityMetadata;
  const isActuallyLoading = isLoading || isVisibilityLoading;

  const displayName = useMemo(() => {
    // Try display name from metadata first
    if (effectiveMetadata?.display_name)
      return String(effectiveMetadata.display_name);
    if (effectiveMetadata?.name) return String(effectiveMetadata.name);

    // Try display name function if provided
    if (getDisplayNameForPubkey) {
      const fromDisplayNames = getDisplayNameForPubkey(pubkeyHex);
      if (
        fromDisplayNames &&
        fromDisplayNames !== npub &&
        typeof fromDisplayNames === "string"
      )
        return fromDisplayNames;
    }

    // Fallback to npub or truncated pubkey
    return npub || pubkeyHex?.slice(0, 16) + "..." || "Unknown";
  }, [effectiveMetadata, getDisplayNameForPubkey, pubkeyHex, npub]);

  // Cache the picture URL to prevent flickering during virtualization
  // When pubkey changes, keep showing the old picture until new metadata loads
  const pictureCache = useRef<Record<string, string>>({});

  const currentPicture = effectiveMetadata?.picture || "";

  // Update cache when we have a valid picture
  useEffect(() => {
    if (currentPicture && pubkeyHex) {
      pictureCache.current[pubkeyHex] = currentPicture;
    }
  }, [currentPicture, pubkeyHex]);

  // Use cached picture if available, prevents flickering during scroll
  const picture = currentPicture || pictureCache.current[pubkeyHex] || "";

  return (
    <div
      ref={visibilityRef}
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        minWidth: 0,
      }}
    >
      {/* Top row: Display name full width */}
      <div
        style={{
          width: "100%",
          minWidth: 0,
          marginBottom: "0.15rem",
        }}
      >
        <span
          style={{
            color: "var(--text-color)",
            fontSize: "0.95rem",
            fontWeight: 500,
            textAlign: "start",
            wordBreak: "break-word",
            overflowWrap: "anywhere",
            whiteSpace: "normal",
            maxWidth: "100%",
            display: "block",
          }}
        >
          {isActuallyLoading ? (
            <LoadingTextPlaceholder type="displayName" />
          ) : (
            String(displayName || "Unknown")
          )}
        </span>
      </div>
      {/* Bottom row: avatar left, nip-05 and npub right (npub wraps under avatar) */}
      <div
        style={{
          display: "block",
          position: "relative",
          width: "100%",
          minWidth: 0,
        }}
      >
        {/* Avatar floated left, fixed 50px */}
        <div
          style={{
            float: "left",
            width: "50px",
            height: "50px",
            border: "1px dotted var(--border-color)",
            backgroundColor: "var(--app-bg-color)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            flexShrink: 0,
            marginRight: "0.75rem",
            marginBottom: "0.25rem",
            shapeOutside: "circle(50%)",
          }}
        >
          {picture ? (
            <img
              key={`avatar-${pubkeyHex}`}
              src={picture}
              alt="avatar"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
              decoding="async"
            />
          ) : (
            <span
              style={{
                color: "var(--text-color)",
                fontSize: "1.1rem",
                textAlign: "center",
              }}
            >
              {String(displayName || "?").slice(0, 1)}
            </span>
          )}
        </div>
        {/* Right: nip-05 and npub, npub wraps under avatar */}
        <div
          style={{
            minWidth: 0,
            textAlign: "start",
            overflow: "hidden",
            justifyContent: "flex-start",
          }}
        >
          {/* nip-05 address */}
          <span
            style={{
              color: "var(--text-color)",
              opacity: 0.85,
              fontSize: "0.82rem",
              wordBreak: "break-all",
              overflowWrap: "anywhere",
              whiteSpace: "normal",
              textAlign: "start",
              maxWidth: "100%",
              overflow: "hidden",
              marginBottom: "0.1rem",
              display: "block",
            }}
          >
            {isActuallyLoading ? (
              <LoadingTextPlaceholder type="displayName" />
            ) : effectiveMetadata?.nip05 ? (
              String(effectiveMetadata.nip05)
            ) : (
              <span style={{ opacity: 0.5 }}>No NIP-05</span>
            )}
          </span>
          {/* npub, wraps under avatar */}
          <span
            style={{
              color: "var(--text-color)",
              opacity: 0.7,
              fontSize: "0.75rem",
              wordBreak: "break-all",
              overflowWrap: "anywhere",
              whiteSpace: "normal",
              textAlign: "start",
              maxWidth: "100%",
              overflow: "hidden",
              display: "block",
              minHeight: "1.5em",
              marginTop: "0.1rem",
              clear: "none",
            }}
          >
            {String(npub || pubkeyHex?.slice(0, 16) + "..." || "Unknown")}
          </span>
          {/* Hidden input for username autocomplete */}
          <input
            type="text"
            name="username"
            autoComplete="username"
            value={String(displayName || npub || "")}
            readOnly
            style={{
              position: "absolute",
              opacity: 0,
              pointerEvents: "none",
              height: 0,
              width: 0,
              padding: 0,
              margin: 0,
              border: "none",
            }}
          />
        </div>
        <div style={{ clear: "both" }} />
      </div>
    </div>
  );
};

export default UserInfoCard;
