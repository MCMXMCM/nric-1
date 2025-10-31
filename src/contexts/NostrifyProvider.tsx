import React, { useRef, useState, useEffect } from "react";
import type { NostrEvent } from "@nostrify/nostrify";
import { NPool, NRelay1 } from "@nostrify/nostrify";
import { NostrContext } from "@nostrify/react";
import { DEFAULT_RELAY_URLS } from "../utils/nostr/constants";
import type { RelayPermission } from "../types/nostr/types";

interface NostrifyProviderProps {
  children: React.ReactNode;
  relayUrls?: string[];
  relayPermissions?: Map<string, RelayPermission>;
}

/**
 * NostrifyProvider - Replaces the current NostrContext with Nostrify's NPool
 * Maintains compatibility with existing components while providing better performance
 */
const NostrifyProvider: React.FC<NostrifyProviderProps> = ({
  children,
  relayUrls = DEFAULT_RELAY_URLS,
  relayPermissions = new Map(),
}) => {
  // Create NPool instance only once
  const pool = useRef<NPool | undefined>(undefined);

  // Track relay status for compatibility with existing components
  const [relayStatuses] = useState<
    Array<{
      url: string;
      connected: boolean;
      read: boolean;
      write: boolean;
    }>
  >([]);

  // Initialize NPool with relay selection logic
  if (!pool.current) {
    pool.current = new NPool({
      open(url: string) {
        return new NRelay1(url);
      },
      reqRouter: (filters) => {
        // Select relays for queries based on permissions and filters
        const selectedRelays = relayUrls.filter((url) => {
          const permission = relayPermissions.get(url) || "readwrite";
          const read =
            permission === "read" ||
            permission === "readwrite" ||
            permission === "indexer";
          return read;
        });
        return new Map(selectedRelays.map((url) => [url, filters]));
      },
      eventRouter: (event: NostrEvent) => {
        // Select relays for publishing based on permissions and event kind
        return relayUrls.filter((url) => {
          const permission = relayPermissions.get(url) || "readwrite";
          const write = permission === "write" || permission === "readwrite";

          // For indexer relays, only allow certain event kinds
          if (permission === "indexer") {
            return [0, 3, 10002].includes(event.kind); // Profile, contacts, relay list
          }

          return write;
        });
      },
    });
  }

  // Update relay statuses when relayUrls or permissions change
  useEffect(() => {
    // const statuses = relayUrls.map(url => {
    //   const permission = relayPermissions.get(url) || 'readwrite';
    //   const read = permission === 'read' || permission === 'readwrite' || permission === 'indexer';
    //   const write = permission === 'write' || permission === 'readwrite';
    //
    //   return {
    //     url,
    //     connected: true, // Nostrify handles connection management internally
    //     read,
    //     write
    //   };
    // });
    // setRelayStatuses(statuses);
  }, []);

  // Create context value that maintains compatibility with existing components
  const contextValue = {
    nostr: pool.current,
    relayStatuses,
    relayUrls,
    relayPermissions,
  };

  return (
    <NostrContext.Provider value={contextValue}>
      {children}
    </NostrContext.Provider>
  );
};

export default NostrifyProvider;
