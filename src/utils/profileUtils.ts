import { nip19 } from "nostr-tools";

/**
 * Formats a string by truncating it to show first and last characters
 */
export const formatTruncated = (s: string): string => {
  return s.length > 16 ? `${s.slice(0, 8)}...${s.slice(-6)}` : s;
};

/**
 * Decodes route parameter to hex pubkey and normalized npub
 */
export const decodeRouteParam = (routeParam: string): {
  hex: string | null;
  npub: string | null;
  error?: string;
} => {
  try {
    let hex: string | null = null;
    let npub: string | null = null;

    if (routeParam.startsWith("npub")) {
      const decoded = nip19.decode(routeParam);
      if (decoded.type === "npub" && typeof decoded.data === "string") {
        hex = decoded.data;
        npub = routeParam;
      }
    } else if (routeParam.startsWith("nprofile")) {
      const decoded = nip19.decode(routeParam) as any;
      if (decoded.type === "nprofile" && decoded.data?.pubkey) {
        hex = decoded.data.pubkey as string;
        npub = nip19.npubEncode(hex);
      }
    } else if (/^[0-9a-fA-F]{64}$/.test(routeParam)) {
      hex = routeParam.toLowerCase();
      npub = nip19.npubEncode(hex);
    }

    if (hex && npub) {
      return { hex, npub };
    } else {
      return { hex: null, npub: null, error: "Invalid npub" };
    }
  } catch {
    return { hex: null, npub: null, error: "Invalid npub" };
  }
};

/**
 * Checks if the current user is viewing their own profile
 */
export const isSelfProfile = (pubkeyHex: string | null, userPubkey: string | undefined): boolean => {
  try {
    if (!pubkeyHex || !userPubkey) return false;
    
    let current = userPubkey;
    if (current.startsWith("npub")) {
      const decoded = nip19.decode(current);
      if (decoded.type === "npub" && typeof decoded.data === "string")
        current = decoded.data;
    }
    
    if (!/^[0-9a-fA-F]{64}$/.test(current)) return false;
    return current.toLowerCase() === pubkeyHex.toLowerCase();
  } catch {
    return false;
  }
};

/**
 * Normalizes pubkey to hex format
 */
export const normalizeToHex = (pubkey: string): string | null => {
  try {
    if (pubkey.startsWith("npub")) {
      const decoded = nip19.decode(pubkey);
      if (decoded.type === "npub" && typeof decoded.data === "string") {
        return decoded.data;
      }
    } else if (/^[0-9a-fA-F]{64}$/.test(pubkey)) {
      return pubkey.toLowerCase();
    }
    return null;
  } catch {
    return null;
  }
};

/**
 * Gets initial character for display
 */
export const getInitialChar = (displayName: string, fallback: string): string => {
  const source = displayName && displayName.trim().length > 0 ? displayName : fallback || "";
  return (source || "?").charAt(0).toUpperCase();
};
