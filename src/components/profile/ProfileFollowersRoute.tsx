import React from "react";
import { useParams } from "@tanstack/react-router";
import ProfileRouteContactsList from "./ProfileRouteContactsList";
import { useNostrifyMigration } from "../../contexts/NostrifyMigrationProvider";
import { decodeRouteParam } from "../../utils/profileUtils";

const ProfileFollowersRoute: React.FC = () => {
  const { npub: routeParam } = useParams({ strict: false }) as { npub: string };

  // Decode route parameter to get pubkeyHex
  const { hex: pubkeyHex } = decodeRouteParam(routeParam);

  // Get relay URLs from Nostrify migration context (consistent with other profile routes)
  const { relayUrls } = useNostrifyMigration();

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {pubkeyHex ? (
        <ProfileRouteContactsList
          mode="followers"
          pubkeyHex={pubkeyHex}
          relayUrls={relayUrls}
        />
      ) : (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "200px",
            color: "var(--error-color)",
          }}
        >
          Invalid profile id
        </div>
      )}
    </div>
  );
};

export default ProfileFollowersRoute;
