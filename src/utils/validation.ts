import { nip19 } from 'nostr-tools';

export const validatePubkey = (input: string): boolean => {
  if (!input) return false;
  
  // Handle npub format
  if (input.startsWith('npub')) {
    try {
      const decoded = nip19.decode(input);
      return decoded.type === 'npub';
    } catch (e) {
      return false;
    }
  }
  
  // Handle hex format
  if (input.length === 64 && /^[0-9a-fA-F]+$/.test(input)) {
    return true;
  }
  
  return false;
}; 