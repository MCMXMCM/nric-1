import React, { useContext } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { RelayDiscoveryModal } from "./RelayDiscoveryModal";
import { useEnhancedProfileMetadata } from "../../hooks/useEnhancedProfileMetadata";
import { NostrContext } from "../../contexts/NostrContext";
import { useNostrFeedState } from "../../hooks/useNostrFeedState";
import { useRelayManager } from "../../hooks/useRelayManager";
import { DEFAULT_RELAY_URLS } from "../../utils/nostr/constants";
import { decodeRouteParam } from "../../utils/profileUtils";

const ProfileRelaysRoute: React.FC = () => {
  const { nostrClient, pubkey: userPubkey } = useContext(NostrContext);
  const state = useNostrFeedState();
  const navigate = useNavigate();
  const { npub: routeParam } = useParams({ strict: false }) as { npub: string };

  // Decode route parameter to get pubkeyHex
  const { hex: pubkeyHex, npub: npubBech32 } = decodeRouteParam(routeParam);

  // Get relay URLs and management functions - same pattern as ProfileView
  const { relayUrls, readRelays, addRelay } = useRelayManager({
    nostrClient,
    initialRelays: DEFAULT_RELAY_URLS,
    pubkeyHex: userPubkey,
  });

  // Load profile metadata (shared with ProfileView via TanStack Query) with real-time updates
  const profileMetadata = useEnhancedProfileMetadata({
    pubkeyHex: pubkeyHex || "",
    relayUrls: readRelays,
    enabled: Boolean(pubkeyHex),
    realtimeEnabled: false,
  });

  const handleAddRelayFromDiscovery = async (relayUrl: string) => {
    // Add as read-only relay, same logic as ProfileView
    if (relayUrls.includes(relayUrl)) {
      return;
    }

    try {
      // Add as read-only relay
      await addRelay(relayUrl, "read");
    } catch (error) {
      console.error("Failed to add relay:", error);
    }
  };

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <RelayDiscoveryModal
        isOpen={true}
        onClose={() =>
          navigate({
            to: "/npub/$npub/notes",
            params: { npub: npubBech32 || routeParam },
          })
        }
        userPubkey={pubkeyHex || ""}
        displayName={profileMetadata.displayTitle}
        userCurrentRelays={readRelays}
        relayUrls={relayUrls}
        isMobile={state.isMobile}
        onAddRelay={handleAddRelayFromDiscovery}
        mountWithinContainer={true}
      />
    </div>
  );
};

export default ProfileRelaysRoute;
