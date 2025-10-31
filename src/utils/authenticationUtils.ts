import { useContext } from "react";
import { NostrContext } from "../contexts/NostrContext";

/**
 * Hook to check if user is properly authenticated for signature-required operations
 */
export const useAuthenticationCheck = () => {
  const { 
    pubkey: userPubkey, 
    loginMethod, 
    listSavedAccounts 
  } = useContext(NostrContext);

  // Check if user is properly authenticated for signing
  const isAuthenticatedForSigning = () => {
    // User must have a pubkey and be logged in with a method that can sign
    if (!userPubkey) return false;
    
    // If logged in with NIP-07, they can sign
    if (loginMethod === "nip07") return true;
    
    // If logged in with nsec, they can sign
    if (loginMethod === "nsec") return true;
    
    // If they have a pubkey but no login method, they can't sign
    return false;
  };

  // Check if user needs to unlock their key
  const needsUnlock = async () => {
    if (!userPubkey || loginMethod !== "nsec") return false;

    try {
      // Import the function to check if key is in memory
      const { getInMemorySecretKeyHex } = await import("./nostr/nip07");
      const hasKeyInMemory = Boolean(getInMemorySecretKeyHex());

      // If key is already in memory, no need to unlock
      if (hasKeyInMemory) return false;

      // Check if user has a saved account
      const accounts = await listSavedAccounts();
      const hasSaved = accounts.some(
        (a) => a.pubkey.toLowerCase() === userPubkey.toLowerCase()
      );

      // User needs to unlock if they have a saved account but key is not in memory
      return hasSaved;
    } catch (error) {
      console.error('Error in needsUnlock:', error);
      // If there's an error checking saved accounts, assume no unlock needed
      // This prevents the unlock modal from showing when it shouldn't
      return false;
    }
  };

  return {
    userPubkey,
    loginMethod,
    isAuthenticatedForSigning,
    needsUnlock,
  };
};
