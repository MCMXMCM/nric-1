import { type Event } from "nostr-tools";
import { getGlobalRelayPool } from "./nostr/relayConnectionPool";
// Note: Removed custom IndexedDB contacts operations - using TanStack Query instead
import { nip07SignEvent } from "./nostr/nip07";
import { normalizeToHex } from "./profileUtils";
import type { Contact } from "../types/nostr/types";

export interface FollowUserParams {
  pubkeyHex: string;
  userPubkey: string | undefined;
  nip07Available: boolean;
  signInWithNip07: () => Promise<string>;
  nostrClient: any;
  relayUrls: string[];
  // Relays to publish to (must be write or readwrite). Indexers excluded.
  publishRelayUrls?: string[];
  /** Optional cached contacts from client state to prevent wiping on network miss */
  existingContacts?: Contact[];
}

export interface FollowUserResult {
  success: boolean;
  error?: string;
  wasAlreadyFollowing?: boolean;
}

export interface UnfollowUserParams {
  pubkeyHex: string;
  userPubkey: string | undefined;
  nip07Available: boolean;
  signInWithNip07: () => Promise<string>;
  nostrClient: any;
  relayUrls: string[];
  publishRelayUrls?: string[];
  /** Optional cached contacts from client state to prevent wiping on network miss */
  existingContacts?: Contact[];
}

export interface UnfollowUserResult {
  success: boolean;
  error?: string;
  wasNotFollowing?: boolean;
}

/**
 * Handles the complete follow user workflow
 */
export const followUser = async (params: FollowUserParams): Promise<FollowUserResult> => {
  const { 
    pubkeyHex, 
    userPubkey, 
    nip07Available, 
    signInWithNip07, 
    nostrClient, 
    relayUrls,
    publishRelayUrls = [],
    existingContacts,
  } = params;

  try {
    let current = userPubkey;
    
    // Ensure user is signed in
    if (!current) {
      if (nip07Available) {
        try {
          current = await signInWithNip07();
        } catch (e) {
          return { success: false, error: "Failed to sign in" };
        }
      } else {
        return { success: false, error: "Sign in required to follow users" };
      }
    }

    if (!nostrClient || relayUrls.length === 0) {
      return { success: false, error: "No relays configured" };
    }

    // Normalize to hex
    const currentHex = normalizeToHex(current);
    if (!currentHex) {
      return { success: false, error: "Invalid user pubkey" };
    }

    if (currentHex === pubkeyHex) {
      return { success: false, error: "Can't follow yourself" };
    }

    // Load existing contacts from network (TanStack Query will handle caching)
    let contacts: Contact[] = [];
    try {
      const pool = getGlobalRelayPool();
      const evs: Event[] = await pool.querySync(relayUrls, {
        kinds: [3],
        authors: [currentHex],
        limit: 1,
      });
      
      const latest = evs.sort((a, b) => b.created_at - a.created_at)[0];
      if (latest) {
        contacts = (latest.tags || [])
          .filter((t) => t[0] === "p" && t[1])
          .map((t) => ({
            pubkey: t[1],
            relay: t[2] || "",
            petname: t[3] || "",
          }));
      }
    } catch {
      // Ignore network errors, use empty contacts
    }

    // Fallback to cached contacts only when network returns empty
    const baseContacts: Contact[] =
      contacts.length === 0 && (existingContacts?.length || 0) > 0
        ? (existingContacts as Contact[])
        : contacts;

    // Check if already following
    if (baseContacts.some((c) => c.pubkey === pubkeyHex)) {
      return { success: true, wasAlreadyFollowing: true };
    }

    // Add new contact
    const updated = [
      ...baseContacts,
      { pubkey: pubkeyHex, relay: "", petname: "" },
    ];

    const tags = updated.map((c) => [
      "p",
      c.pubkey,
      c.relay || "",
      c.petname || "",
    ]);

    const signed = await nip07SignEvent({ kind: 3, content: "", tags });
    // Prefer explicit publishRelayUrls (write/readwrite only). Fallback to relayUrls if empty.
    const targets = (publishRelayUrls && publishRelayUrls.length > 0) ? publishRelayUrls : relayUrls;
    await nostrClient.publish(targets, signed as any);

    // Note: TanStack Query will handle caching automatically

    return { success: true };
  } catch (e) {
    console.error("Follow failed", e);
    return { success: false, error: "Follow failed" };
  }
};

/**
 * Handles the complete unfollow user workflow
 */
export const unfollowUser = async (params: UnfollowUserParams): Promise<UnfollowUserResult> => {
  const { 
    pubkeyHex, 
    userPubkey, 
    nip07Available, 
    signInWithNip07, 
    nostrClient, 
    relayUrls,
    publishRelayUrls = [],
    existingContacts,
  } = params;

  try {
    let current = userPubkey;
    
    // Ensure user is signed in
    if (!current) {
      if (nip07Available) {
        try {
          current = await signInWithNip07();
        } catch (e) {
          return { success: false, error: "Failed to sign in" };
        }
      } else {
        return { success: false, error: "Sign in required to unfollow users" };
      }
    }

    if (!nostrClient || relayUrls.length === 0) {
      return { success: false, error: "No relays configured" };
    }

    // Normalize to hex
    const currentHex = normalizeToHex(current);
    if (!currentHex) {
      return { success: false, error: "Invalid user pubkey" };
    }

    if (currentHex === pubkeyHex) {
      return { success: false, error: "Can't unfollow yourself" };
    }

    // Load existing contacts from network (TanStack Query will handle caching)
    let contacts: Contact[] = [];
    try {
      const pool = getGlobalRelayPool();
      const evs: Event[] = await pool.querySync(relayUrls, {
        kinds: [3],
        authors: [currentHex],
        limit: 1,
      });
      
      const latest = evs.sort((a, b) => b.created_at - a.created_at)[0];
      if (latest) {
        contacts = (latest.tags || [])
          .filter((t) => t[0] === "p" && t[1])
          .map((t) => ({
            pubkey: t[1],
            relay: t[2] || "",
            petname: t[3] || "",
          }));
      }
    } catch {
      // Ignore network errors, use empty contacts
    }

    // Fallback to cached contacts only when network returns empty
    const baseContacts: Contact[] =
      contacts.length === 0 && (existingContacts?.length || 0) > 0
        ? (existingContacts as Contact[])
        : contacts;

    // Check if not following
    if (!baseContacts.some((c) => c.pubkey === pubkeyHex)) {
      return { success: true, wasNotFollowing: true };
    }

    // Remove contact
    const updated = baseContacts.filter((c) => c.pubkey !== pubkeyHex);

    const tags = updated.map((c) => [
      "p",
      c.pubkey,
      c.relay || "",
      c.petname || "",
    ]);

    const signed = await nip07SignEvent({ kind: 3, content: "", tags });
    // Prefer explicit publishRelayUrls (write/readwrite only). Fallback to relayUrls if empty.
    const targets = (publishRelayUrls && publishRelayUrls.length > 0) ? publishRelayUrls : relayUrls;
    await nostrClient.publish(targets, signed as any);

    // Note: TanStack Query will handle caching automatically

    return { success: true };
  } catch (e) {
    console.error("Unfollow failed", e);
    return { success: false, error: "Unfollow failed" };
  }
};

/**
 * Checks if the current user follows a specific pubkey
 */
export const checkIsFollowing = async (
  pubkeyHex: string,
  userPubkey: string | undefined,
  relayUrls: string[] = []
): Promise<boolean> => {
  try {
    if (!pubkeyHex || !userPubkey) return false;
    
    const currentHex = normalizeToHex(userPubkey);
    if (!currentHex) return false;

    // Load contacts from network (TanStack Query will handle caching)
    let contacts: Contact[] = [];
    try {
      const pool = getGlobalRelayPool();
      const evs: Event[] = await pool.querySync(relayUrls, {
        kinds: [3],
        authors: [currentHex],
        limit: 1,
      });
      
      const latest = evs.sort((a, b) => b.created_at - a.created_at)[0];
      if (latest) {
        contacts = (latest.tags || [])
          .filter((t) => t[0] === "p" && t[1])
          .map((t) => ({
            pubkey: t[1],
            relay: t[2] || "",
            petname: t[3] || "",
          }));
      }
    } catch {
      // Ignore network errors, return false
    }

    return contacts.some((c) => c.pubkey === pubkeyHex);
  } catch {
    return false;
  }
};
