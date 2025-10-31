export const formatPubkey = (pubkey: string, isMobile: boolean = false): string => {
  if (!pubkey) return '';
  if (isMobile) {
    return `${pubkey.slice(0, 9)}...${pubkey.slice(-9)}`;
  }
  if (pubkey.startsWith('npub')) {
    return `${pubkey.slice(0, 13)}...${pubkey.slice(-13)}`;
  }
  return `${pubkey.slice(0, 13)}...${pubkey.slice(-13)}`;
};
