import { useState, useCallback, useContext } from "react";
import { nip19 } from "nostr-tools";
import { NostrContext } from "../contexts/NostrContext";

import { useUserContactsContext } from "../contexts/UserContactsContext";

/**
 * Hook to manage user following logic and state
 * Now uses centralized useUserContacts hook for TanStack Query management
 */
export const useProfileFollow = (
  pubkeyHex: string | null,
  _relayUrls: string[]
) => {
  const {
    pubkey: userPubkey,
    listSavedAccounts,
  } = useContext(NostrContext);

  // Use centralized user contacts management
  const {
    isFollowing,
    followUser,
    unfollowUser,
    isFollowBusy,
    isUnfollowBusy,
  } = useUserContactsContext();

  const [followError, setFollowError] = useState<string | null>(null);

  // Check if the signed-in user already follows this profile
  const isFollowingThisProfile = pubkeyHex ? isFollowing(pubkeyHex) : false;

  // Core follow logic - extracted for reuse in unlock modal
  const executeFollow = useCallback(async () => {
    if (!pubkeyHex) return;

    setFollowError(null);

    const result = await followUser(pubkeyHex);

    if (!result.success) {
      setFollowError(result.error || "Follow failed");
    }
  }, [pubkeyHex, followUser]);

  // Core unfollow logic
  const executeUnfollow = useCallback(async () => {
    if (!pubkeyHex) return;

    setFollowError(null);

    const result = await unfollowUser(pubkeyHex);

    if (!result.success) {
      setFollowError(result.error || "Unfollow failed");
    }
  }, [pubkeyHex, unfollowUser]);

  // Check if user needs to unlock their key before following/unfollowing
  const checkNeedsUnlock = useCallback(async (): Promise<boolean> => {
    if (!userPubkey) return false;
    
    try {
      const accounts = await listSavedAccounts();
      let currentHex = userPubkey;
      if (currentHex.startsWith("npub")) {
        try {
          const decoded = nip19.decode(currentHex);
          if (
            decoded.type === "npub" &&
            typeof decoded.data === "string"
          ) {
            currentHex = decoded.data;
          }
        } catch {
          // Ignore decode errors
        }
      }
      const hasSaved = accounts.some(
        (a) => a.pubkey.toLowerCase() === currentHex.toLowerCase()
      );
      return hasSaved;
    } catch {
      // Ignore errors
      return false;
    }
  }, [userPubkey, listSavedAccounts]);

  return {
    isFollowing: isFollowingThisProfile,
    isFollowBusy,
    isUnfollowBusy,
    followError,
    executeFollow,
    executeUnfollow,
    checkNeedsUnlock,
    setFollowError,
  };
};
