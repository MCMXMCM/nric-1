import React, { useContext } from "react";
import ProfileMuteList from "./ProfileMuteList";
import { useProfileMetadata } from "../../hooks/useProfileMetadata";
import { NostrContext } from "../../contexts/NostrContext";
import { useNostrFeedState } from "../../hooks/useNostrFeedState";
import { useRelayManager } from "../../hooks/useRelayManager";
import { DEFAULT_RELAY_URLS } from "../../utils/nostr/constants";

const ProfileMuteListRoute: React.FC = () => {
  const { nostrClient, pubkey: userPubkey } = useContext(NostrContext);
  const state = useNostrFeedState();

  // Get relay URLs - same pattern as ProfileView
  const { relayUrls } = useRelayManager({
    nostrClient,
    initialRelays: DEFAULT_RELAY_URLS,
    pubkeyHex: userPubkey,
  });

  // Load profile metadata (shared with ProfileView via TanStack Query)
  const profileMetadata = useProfileMetadata(
    nostrClient,
    relayUrls,
    userPubkey,
    state.metadata
  );

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <ProfileMuteList
        pubkeyHex={profileMetadata.pubkeyHex || ""}
        relayUrls={relayUrls}
      />
    </div>
  );
};

export default ProfileMuteListRoute;
