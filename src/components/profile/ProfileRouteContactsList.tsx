import React from "react";
import ProfileContactsModal from "../ProfileContactsModal";

interface Props {
  mode: "followers" | "following";
  pubkeyHex: string;
  relayUrls: string[];
}

// Render the same list UI as the modal but without overlay and header, fitting the notes section area
const ProfileRouteContactsList: React.FC<Props> = ({
  mode,
  pubkeyHex,
  relayUrls,
}) => {
  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <ProfileContactsModal
        pubkeyHex={pubkeyHex}
        relayUrls={relayUrls}
        mode={mode}
        mountWithinContainer={true}
      />
    </div>
  );
};

export default ProfileRouteContactsList;
