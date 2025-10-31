import React from "react";
import ProfileContactsModal from "../ProfileContactsModal";
import UnlockKeyModal from "../UnlockKeyModal";
import {
  prepareMetadataForModal,
  getCurrentPubkeyHex,
} from "../../utils/nostr/pubkeyUtils";
import type { Metadata, RelayPermission } from "../../types/nostr/types";
import ProfileEditModal from "./ProfileEditModal";

interface ProfileModalsProps {
  // Contact Modal
  showContactsModal: null | "followers" | "following";
  pubkeyHex: string | null;
  relayUrls: string[];
  relayPermissions?: Map<string, RelayPermission>;
  onCloseContactsModal: () => void;

  // Unlock Modal
  showUnlockModal: boolean;
  userPubkey: string | undefined;
  metadata: Metadata | null;
  onCloseUnlockModal: () => void;
  onUnlocked: (selectedPubkeyHex: string) => Promise<void>;
  getDisplayNameForPubkey: (pubkey: string) => string;
  unlockActionLabel?: string; // New prop for unlock modal action label

  // Edit Modal
  showEditModal: boolean;
  onCloseEditModal: () => void;
  onSaveRequest?: (saveFunction: () => Promise<void>) => void;
  onSavingStateChange?: (isSaving: boolean) => void;
  onProfileUpdateSuccess?: (publishedContent?: any) => Promise<void>;
  isLoadingMeta?: boolean;
}

/**
 * Component to render all profile-related modals
 */
const ProfileModals: React.FC<ProfileModalsProps> = ({
  showContactsModal,
  pubkeyHex,
  relayUrls,
  relayPermissions,
  showUnlockModal,
  userPubkey,
  metadata,
  onCloseUnlockModal,
  onUnlocked,
  getDisplayNameForPubkey,
  unlockActionLabel = "Follow", // Default to "Follow" for backward compatibility
  showEditModal,
  onCloseEditModal,
  onSaveRequest,
  onSavingStateChange,
  onProfileUpdateSuccess,
  isLoadingMeta,
}) => {
  return (
    <>
      {showContactsModal && pubkeyHex && (
        <ProfileContactsModal
          pubkeyHex={pubkeyHex}
          relayUrls={relayUrls}
          mode={showContactsModal}
        />
      )}

      {showUnlockModal && (
        <UnlockKeyModal
          isOpen={showUnlockModal}
          onClose={onCloseUnlockModal}
          actionLabel={unlockActionLabel}
          currentPubkeyHex={getCurrentPubkeyHex(userPubkey)}
          onUnlocked={onUnlocked}
          getDisplayNameForPubkey={getDisplayNameForPubkey}
          metadata={prepareMetadataForModal(userPubkey, metadata)}
        />
      )}

      {showEditModal && pubkeyHex && (
        <ProfileEditModal
          isOpen={showEditModal}
          onClose={onCloseEditModal}
          relayUrls={relayUrls}
          currentMetadata={metadata || {}}
          mountWithinContainer={true}
          onSaveRequest={onSaveRequest}
          onSavingStateChange={onSavingStateChange}
          onProfileUpdateSuccess={onProfileUpdateSuccess}
          userPubkey={userPubkey}
          getDisplayNameForPubkey={getDisplayNameForPubkey}
          isLoadingMeta={isLoadingMeta}
          relayPermissions={relayPermissions}
        />
      )}
    </>
  );
};

export default ProfileModals;
