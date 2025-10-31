import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useUserContacts } from "../hooks/useUserContacts";
import { NostrContext } from "./NostrContext";
import { useRelayManager } from "../hooks/useRelayManager";
import { DEFAULT_RELAY_URLS } from "../utils/nostr/constants";

interface UserContactsContextValue {
  contacts: any[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  followUser: (
    targetPubkey: string
  ) => Promise<{ success: boolean; error?: string }>;
  unfollowUser: (
    targetPubkey: string
  ) => Promise<{ success: boolean; error?: string }>;
  isFollowing: (targetPubkey: string) => boolean;
  isFollowBusy: boolean;
  isUnfollowBusy: boolean;
}

const UserContactsContext = createContext<UserContactsContextValue | null>(
  null
);

interface UserContactsProviderProps {
  children: ReactNode;
}

export function UserContactsProvider({ children }: UserContactsProviderProps) {
  const { pubkey: ctxPubkey } = useContext(NostrContext);
  const { nostrClient } = useContext(NostrContext);

  // Use the user's configured relay URLs (read relays) for loading contacts,
  // falling back to defaults until relay manager initializes
  const { readRelays, writeRelays, relayPermissions } = useRelayManager({
    nostrClient,
    initialRelays: DEFAULT_RELAY_URLS,
    pubkeyHex: ctxPubkey,
  });

  // Derive publish relays: only include relays with write or readwrite permissions (exclude indexers)
  const publishRelays = (writeRelays || []).filter((url) => {
    const perm = relayPermissions.get(url);
    return perm === "write" || perm === "readwrite"; // explicitly exclude 'indexer'
  });

  // Use the user's configured relay URLs instead of defaults
  const userContactsResult = useUserContacts({
    relayUrls:
      readRelays && readRelays.length > 0 ? readRelays : DEFAULT_RELAY_URLS,
    publishRelayUrls: publishRelays,
    enabled: Boolean(
      ctxPubkey &&
        ((readRelays && readRelays.length > 0) || DEFAULT_RELAY_URLS.length > 0)
    ),
  });

  // Force refetch contacts immediately after login if we have a pubkey but no contacts yet
  useEffect(() => {
    if (
      ctxPubkey &&
      userContactsResult.contacts.length === 0 &&
      !userContactsResult.isLoading
    ) {
      console.log("🔄 User logged in, forcing contacts fetch...");
      userContactsResult.refetch();
    }
  }, [
    ctxPubkey,
    userContactsResult.contacts.length,
    userContactsResult.isLoading,
    userContactsResult.refetch,
  ]);

  // Also trigger refetch when pubkey changes (login/logout)
  useEffect(() => {
    if (ctxPubkey) {
      console.log("🔄 Pubkey changed, triggering contacts refetch...");
      userContactsResult.refetch();
    }
  }, [ctxPubkey, userContactsResult.refetch]);

  // Note: Auto-enabling outbox mode has been removed
  // Users must manually enable outbox mode in settings if desired

  return (
    <UserContactsContext.Provider value={userContactsResult}>
      {children}
    </UserContactsContext.Provider>
  );
}

export function useUserContactsContext() {
  const context = useContext(UserContactsContext);
  if (!context) {
    throw new Error(
      "useUserContactsContext must be used within a UserContactsProvider"
    );
  }
  return context;
}
