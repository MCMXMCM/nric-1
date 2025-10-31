import React, { useContext, createContext } from "react";
import { NostrContext } from "../contexts/NostrContext";
import { useUserContactsContext } from "../contexts/UserContactsContext";
import { useOutboxDiscovery } from "../hooks/useOutboxDiscovery";
import { useRelayManager } from "../hooks/useRelayManager";
import { DEFAULT_RELAY_URLS } from "../utils/nostr/constants";
import { useUIStore } from "./lib/useUIStore";

interface OutboxDiscoveryContextType {
  isDiscovering: boolean;
  hasCompletedInitialDiscovery: boolean;
}

const OutboxDiscoveryContext = createContext<OutboxDiscoveryContextType>({
  isDiscovering: false,
  hasCompletedInitialDiscovery: false,
});

export const useOutboxDiscoveryStatus = () =>
  useContext(OutboxDiscoveryContext);

/**
 * Component that manages automatic NIP-65 outbox discovery
 * Must be placed inside UserContactsProvider to access contacts
 */
export function OutboxDiscoveryManager({
  children,
}: {
  children?: React.ReactNode;
}) {
  const { pubkey, nostrClient } = useContext(NostrContext);
  const { contacts = [] } = useUserContactsContext();

  // Get relay configuration
  const { readRelays } = useRelayManager({
    nostrClient,
    initialRelays: DEFAULT_RELAY_URLS,
    pubkeyHex: pubkey,
  });

  const relayUrls =
    readRelays && readRelays.length > 0 ? readRelays : DEFAULT_RELAY_URLS;

  // Respect user Outbox toggle; only auto-discover when enabled
  const outboxMode = useUIStore((s) => s.outboxMode);

  // Automatically discover NIP-65 relay lists for followed users
  const { isDiscovering, hasCompletedInitialDiscovery } = useOutboxDiscovery({
    pubkey,
    contacts,
    relayUrls,
    enabled: Boolean(outboxMode && pubkey && contacts.length > 0),
  });

  return (
    <OutboxDiscoveryContext.Provider
      value={{ isDiscovering, hasCompletedInitialDiscovery }}
    >
      {children}
    </OutboxDiscoveryContext.Provider>
  );
}
