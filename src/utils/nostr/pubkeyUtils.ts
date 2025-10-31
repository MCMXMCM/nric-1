import { nip19 } from "nostr-tools";

/**
 * Utility functions for handling pubkey operations and conversions
 */

/**
 * Safely converts a pubkey to hex format, handling both npub and hex inputs
 */
export const convertPubkeyToHex = (pubkey: string | undefined): string | null => {
  if (!pubkey) return null;

  // If it's already hex (64 chars), return as is
  if (pubkey.length === 64 && /^[0-9a-fA-F]+$/.test(pubkey)) {
    return pubkey.toLowerCase();
  }

  // If it starts with npub, decode it
  if (pubkey.startsWith("npub")) {
    try {
      const decoded = nip19.decode(pubkey);
      if (decoded.type === "npub" && typeof decoded.data === "string") {
        return decoded.data;
      }
    } catch {
      // Ignore decode errors
    }
  }

  return pubkey; // Return original if conversion fails
};

/**
 * Prepares metadata object for UnlockKeyModal by ensuring proper pubkey format
 */
export const prepareMetadataForModal = (
  userPubkey: string | undefined,
  metadata: any
): Record<string, any> => {
  if (!userPubkey || !metadata) return {};
  
  const hexPubkey = convertPubkeyToHex(userPubkey);
  if (!hexPubkey) return {};
  
  return { [hexPubkey]: metadata };
};

/**
 * Gets the current user's pubkey in hex format for UnlockKeyModal
 */
export const getCurrentPubkeyHex = (userPubkey: string | undefined): string | undefined => {
  if (!userPubkey) return undefined;
  
  const hexPubkey = convertPubkeyToHex(userPubkey);
  return hexPubkey || userPubkey;
};
