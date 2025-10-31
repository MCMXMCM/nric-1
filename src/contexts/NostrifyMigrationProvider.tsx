import React, {
  createContext,
  useContext,
  useRef,
  useEffect,
  useState,
} from "react";
import { NPool, NRelay1 } from "@nostrify/nostrify";
import { NostrContext } from "@nostrify/react";
import { NostrContext as LegacyNostrContext } from "./NostrContext";
import { DEFAULT_RELAY_URLS } from "../utils/nostr/constants";
import { useRelayConfiguration } from "../hooks/useRelayConfiguration";
import { getOutboxStorage } from "../utils/nostr/outboxStorage";
import { relayHealthMonitor } from "../utils/relayHealthMonitor";
import { useUIStore } from "../components/lib/useUIStore";
import type { RelayPermission } from "../types/nostr/types";
import type { NostrEvent, NostrFilter } from "@nostrify/nostrify";

interface NostrifyMigrationProviderProps {
  children: React.ReactNode;
}

interface NostrifyMigrationContextType {
  // Nostrify pool for new components
  nostrifyPool: NPool | undefined;
  // Legacy context for existing components
  legacyContext: any;
  // Migration state
  isMigrating: boolean;
  // Pool ready flag
  isPoolReady: boolean;
  // Forcefully recreate pool with current configuration
  resetPool: () => void;
  // Relay configuration (read-only)
  relayUrls: string[];
  relayPermissions: Map<string, RelayPermission>;
}

const NostrifyMigrationContext = createContext<NostrifyMigrationContextType>({
  nostrifyPool: undefined,
  legacyContext: null,
  isMigrating: false,
  isPoolReady: false,
  resetPool: () => {},
  relayUrls: DEFAULT_RELAY_URLS,
  relayPermissions: new Map(),
});

export const NostrifyMigrationProvider: React.FC<
  NostrifyMigrationProviderProps
> = ({ children }) => {
  const pool = useRef<NPool | undefined>(undefined);
  const [isMigrating] = useState(false);
  const [poolReady, setPoolReady] = useState(false);
  const [resetCounter, setResetCounter] = useState(0);

  // Get legacy context to access pubkey
  const legacyContext = useContext(LegacyNostrContext);

  // Get outbox mode setting (can be manually disabled by user)
  const outboxModeEnabled = useUIStore((s) => s.outboxMode);

  // Load relay configuration from the same storage as useRelayManager
  const { relayUrls, relayPermissions } = useRelayConfiguration(
    legacyContext?.pubkey
  );

  // Create stable references to avoid infinite re-renders
  const stableRelayUrls = JSON.stringify(relayUrls);
  const stableRelayPermissions = JSON.stringify(
    Object.fromEntries(relayPermissions)
  );
  const stablePubkey = legacyContext?.pubkey || "";
  const stableOutboxMode = String(outboxModeEnabled);

  // Track previous values to avoid unnecessary pool recreation
  const prevRelayUrlsRef = useRef<string>(stableRelayUrls);
  const prevRelayPermissionsRef = useRef<string>(stableRelayPermissions);
  const prevPubkeyRef = useRef<string>(stablePubkey);
  const prevOutboxModeRef = useRef<string>(stableOutboxMode);

  // Initialize/update Nostrify pool when relay configuration changes or reset requested
  useEffect(() => {
    // Only recreate pool if configuration actually changed
    const relayUrlsChanged = prevRelayUrlsRef.current !== stableRelayUrls;
    const permissionsChanged =
      prevRelayPermissionsRef.current !== stableRelayPermissions;
    const pubkeyChanged = prevPubkeyRef.current !== stablePubkey;
    const outboxModeChanged = prevOutboxModeRef.current !== stableOutboxMode;

    if (
      !relayUrlsChanged &&
      !permissionsChanged &&
      !pubkeyChanged &&
      !outboxModeChanged &&
      resetCounter === 0
    ) {
      return; // No changes, skip pool recreation
    }

    // Update refs for next comparison
    prevRelayUrlsRef.current = stableRelayUrls;
    prevRelayPermissionsRef.current = stableRelayPermissions;
    prevPubkeyRef.current = stablePubkey;
    prevOutboxModeRef.current = stableOutboxMode;
    const isMobile = /Mobi|Android/i.test(navigator.userAgent);
    const isSafari =
      /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);

    if (import.meta.env.DEV) {
      console.log("🏊 Initializing Nostrify pool:", {
        relayUrls,
        relayPermissions: Object.fromEntries(relayPermissions),
        pubkey: stablePubkey,
        isMobile,
        isSafari,
      });
    }

    // Clean up old pool if it exists
    if (pool.current) {
      if (import.meta.env.DEV) {
        console.log("🧹 Cleaning up old Nostrify pool");
      }
      try {
        pool.current.close();
      } catch (error) {
        console.warn("⚠️ Error closing old pool:", error);
      }
    }

    // Add a small delay for mobile Safari to ensure proper initialization
    const initializePool = () => {
      try {
        // Simple rotating index for relay selection across requests
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const g: any = globalThis as any;
        if (!g.__nostrifyReqCounter) g.__nostrifyReqCounter = 0;

        // Global concurrency limiter (semaphore)
        if (!g.__nostrifyQuerySemaphore) {
          g.__nostrifyQuerySemaphore = {
            max: 6,
            inFlight: 0,
            queue: [] as Array<() => void>,
            acquire(cb: () => Promise<any>) {
              return new Promise((resolve, reject) => {
                const run = async () => {
                  this.inFlight++;
                  try {
                    const res = await cb();
                    resolve(res);
                  } catch (e) {
                    reject(e);
                  } finally {
                    this.inFlight--;
                    const next = this.queue.shift();
                    if (next) next();
                  }
                };
                if (this.inFlight < this.max) {
                  run();
                } else {
                  this.queue.push(run);
                }
              });
            },
          };
        }

        // Recreate pool when relay configuration changes
        pool.current = new NPool({
          open(url: string) {
            console.log("🔌 Opening relay connection:", url);
            return new NRelay1(url);
          },
          reqRouter: async (filters: NostrFilter[]) => {
            // Route queries to relays with read permissions
            const readableRelays = relayUrls.filter((url) => {
              const permission = relayPermissions.get(url) || "readwrite";
              const read =
                permission === "read" ||
                permission === "readwrite" ||
                permission === "indexer";
              return read;
            });

            // Check if this is an author-specific query
            const authors = new Set<string>();
            for (const filter of filters) {
              if (filter.authors) {
                for (const author of filter.authors) {
                  authors.add(author);
                }
              }
            }

            const isAuthorQuery = authors.size > 0;
            const ua = navigator.userAgent;
            const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua);
            const isMobile = /Mobi|Android/i.test(ua);

            // Check if this is a metadata query (kind 0)
            const isMetadataQuery = filters.some(
              (f) => f.kinds && f.kinds.includes(0)
            );

            if (isMetadataQuery && import.meta.env.DEV) {
              console.log(
                "👤 Metadata query - using all configured relays (not outbox)"
              );
            }

            // Try outbox model for author queries (including metadata queries)
            // Metadata queries benefit from outbox routing as users publish to their write relays
            // Also respect manual outbox mode setting (user can disable it)
            if (isAuthorQuery && outboxModeEnabled) {
              try {
                const outboxStorage = getOutboxStorage();
                const routes = new Map<string, NostrFilter[]>();

                // Query outbox storage for NIP-65 relay lists
                const relayEvents = await outboxStorage.getRelayListEvents([
                  ...authors,
                ]);

                if (relayEvents.length > 0) {
                  const outboxRelays = new Set<string>();

                  // Gather relays from NIP-65 events
                  for (const event of relayEvents) {
                    for (const tag of event.tags) {
                      if (tag[0] === "r") {
                        try {
                          // Normalize URL: remove trailing slash and lowercase
                          const url = new URL(tag[1])
                            .toString()
                            .replace(/\/$/, "")
                            .toLowerCase();
                          // Only include read relays (no marker or 'read' marker)
                          if (!tag[2] || tag[2] === "read") {
                            outboxRelays.add(url);
                          }
                        } catch (_e) {
                          // Invalid URL, skip
                        }
                      }
                    }
                  }

                  if (outboxRelays.size > 0) {
                    // Filter out unhealthy relays before selecting
                    const healthyOutboxRelays =
                      relayHealthMonitor.getHealthyRelays([...outboxRelays]);

                    if (healthyOutboxRelays.length > 0) {
                      // Limit relay fan-out based on device and query type
                      const isSingleAuthor = authors.size === 1;
                      const targetRelayCount = isSingleAuthor
                        ? isMobile || isSafari
                          ? 2
                          : 3 // Profile pages: cap at 2-3 relays
                        : isMobile || isSafari
                          ? 2
                          : 3; // Feeds: cap at 2-3 relays

                      // If outbox relays are insufficient (< 3 for profiles), blend with fallback relays
                      // This prevents failures when users have few or offline outbox relays
                      const minRelaysForProfile = 2;
                      const needsFallbackBlend =
                        isSingleAuthor &&
                        healthyOutboxRelays.length < minRelaysForProfile;

                      if (needsFallbackBlend) {
                        // Blend outbox relays with general fallback relays
                        const healthyGeneralRelays =
                          relayHealthMonitor.getHealthyRelays(readableRelays);
                        const blendedRelays = [
                          ...healthyOutboxRelays,
                          // Add only a single fallback relay
                          ...healthyGeneralRelays
                            .filter((r) => !healthyOutboxRelays.includes(r))
                            .slice(0, 1),
                        ].slice(0, targetRelayCount);

                        for (const url of blendedRelays) {
                          routes.set(url, filters);
                        }

                        if (import.meta.env.DEV) {
                          console.log(
                            "📦 Outbox routing (blended with fallback):",
                            {
                              authors: authors.size,
                              outboxRelays: healthyOutboxRelays.length,
                              fallbackRelays:
                                blendedRelays.length -
                                healthyOutboxRelays.length,
                              totalUsed: blendedRelays.length,
                              relays: blendedRelays,
                            }
                          );
                        }

                        return routes;
                      } else {
                        // Use pure outbox routing
                        const selectedRelays = healthyOutboxRelays.slice(
                          0,
                          targetRelayCount
                        );

                        for (const url of selectedRelays) {
                          routes.set(url, filters);
                        }

                        if (import.meta.env.DEV) {
                          console.log("📦 Outbox routing (pure):", {
                            authors: authors.size,
                            relaysFound: outboxRelays.size,
                            healthyRelays: healthyOutboxRelays.length,
                            relaysUsed: selectedRelays.length,
                            selectedRelays,
                          });
                        }

                        return routes;
                      }
                    } else if (import.meta.env.DEV) {
                      console.warn(
                        "📦 All outbox relays are unhealthy, using fallback"
                      );
                    }
                  }
                }

                // No outbox data found
                if (import.meta.env.DEV) {
                  console.log(
                    "📦 No outbox data for authors, using fallback relays"
                  );
                }
              } catch (error) {
                console.warn("⚠️ Outbox routing failed:", error);
              }
            }

            // Fallback: use configured relays with round-robin selection
            // Prefer any relay hints queued by upstream logic (e.g., outbox router hints)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const recentFailures =
              (globalThis as any).__nostrifyRecentFailures || 0;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const gHints: any = globalThis as any;
            const hinted: string[] | undefined =
              Array.isArray(gHints.__nostrifyRelayHintQueue) &&
              gHints.__nostrifyRelayHintQueue.length > 0
                ? gHints.__nostrifyRelayHintQueue.shift()
                : undefined;
            if (Array.isArray(hinted) && hinted.length > 0) {
              const preferred = hinted.filter((u) =>
                readableRelays.includes(u)
              );
              if (preferred.length > 0) {
                if (import.meta.env.DEV) {
                  console.log("🎯 Using relay hints in reqRouter fallback:", {
                    preferred,
                  });
                }
                return new Map(preferred.map((url) => [url, filters]));
              }
            }

            // Reduce fan-out to avoid rate limits
            const isSingleAuthor = authors.size === 1;
            const isMultiAuthor = authors.size > 1;

            const baseFanOut = isMetadataQuery
              ? 3 // metadata
              : isSingleAuthor
                ? 3 // single author
                : isMultiAuthor
                  ? 3 // multi-author feeds
                  : 2; // global feed

            const perRequest =
              recentFailures > 3
                ? Math.max(2, Math.floor(baseFanOut / 2))
                : baseFanOut;
            const count = Math.max(
              1,
              Math.min(perRequest, readableRelays.length)
            );

            const selectedRelays: string[] = [];
            const start =
              g.__nostrifyReqCounter % Math.max(1, readableRelays.length);
            g.__nostrifyReqCounter++;

            for (let i = 0; i < count; i++) {
              const url = readableRelays[(start + i) % readableRelays.length];
              if (!selectedRelays.includes(url)) selectedRelays.push(url);
              if (selectedRelays.length >= count) break;
            }

            if (import.meta.env.DEV && (isAuthorQuery || Math.random() < 0.1)) {
              console.log("📡 Fallback routing:", {
                filters,
                selectedRelays,
                isAuthorQuery,
                isSingleAuthor,
                isMultiAuthor,
                authors: authors.size,
                fanOut: count,
                baseFanOut,
                recentFailures,
              });
            }

            return new Map(selectedRelays.map((url) => [url, filters]));
          },
          eventRouter: async (event: NostrEvent) => {
            // Try outbox model: use author's own relay list
            // Only if outbox mode is enabled
            if (outboxModeEnabled) {
              try {
                const outboxStorage = getOutboxStorage();
                const relayEvents = await outboxStorage.getRelayListEvents([
                  event.pubkey,
                ]);

                if (relayEvents.length > 0) {
                  const writeRelays = new Set<string>();

                  // Gather write relays from NIP-65 event
                  for (const tag of relayEvents[0].tags) {
                    if (tag[0] === "r") {
                      try {
                        // Normalize URL: remove trailing slash and lowercase
                        const url = new URL(tag[1])
                          .toString()
                          .replace(/\/$/, "")
                          .toLowerCase();
                        // Include relays with no marker (read+write) or 'write' marker
                        if (!tag[2] || tag[2] === "write") {
                          writeRelays.add(url);
                        }
                      } catch (_e) {
                        // Invalid URL, skip
                      }
                    }
                  }

                  if (writeRelays.size > 0) {
                    if (import.meta.env.DEV) {
                      console.log("📦 Publishing via outbox:", {
                        pubkey: event.pubkey.slice(0, 8),
                        kind: event.kind,
                        relays: [...writeRelays],
                      });
                    }
                    return [...writeRelays];
                  }
                }

                if (import.meta.env.DEV) {
                  console.log(
                    "📦 No outbox data for publisher, using configured relays"
                  );
                }
              } catch (error) {
                console.warn("⚠️ Outbox event routing failed:", error);
              }
            } else if (import.meta.env.DEV && !outboxModeEnabled) {
              console.log("📦 Outbox mode disabled, using configured relays");
            }

            // Fallback: use configured relays with write permissions
            return relayUrls.filter((url) => {
              const permission = relayPermissions.get(url) || "readwrite";
              const write =
                permission === "write" || permission === "readwrite";

              if (permission === "indexer") {
                return [0, 3, 10002].includes(event.kind);
              }

              return write;
            });
          },
        });

        if (import.meta.env.DEV) {
          console.log("✅ Nostrify pool initialized successfully");
        }

        // Mark pool as ready to trigger re-render
        setPoolReady(true);

        // Expose a global accessor so non-hook utilities (e.g., profileMetadataUtils) can use Nostrify
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).__nostrifyPool = {
          // Wrap .query with concurrency limiter and proper error handling
          query: async (filters: NostrFilter[]) => {
            if (!pool.current) {
              throw new Error("Nostrify pool not initialized");
            }

            try {
              return await g.__nostrifyQuerySemaphore.acquire(() =>
                pool.current!.query(filters)
              );
            } catch (error) {
              console.error("❌ Nostrify pool query failed:", error);
              throw error;
            }
          },
          close: () => pool.current?.close(),
          isReady: () => !!pool.current,
        };
      } catch (error) {
        console.error("❌ Failed to initialize Nostrify pool:", error);
      }
    };

    // Unified behavior across devices
    initializePool();

    // Cleanup function
    return () => {
      if (pool.current) {
        if (import.meta.env.DEV) {
          console.log("🧹 Cleaning up Nostrify pool on unmount");
        }
        try {
          pool.current.close();
        } catch (error) {
          console.warn("⚠️ Error closing pool on unmount:", error);
        }
      }
      setPoolReady(false);
    };
  }, [
    stableRelayUrls,
    stableRelayPermissions,
    stablePubkey,
    stableOutboxMode,
    outboxModeEnabled,
    resetCounter,
  ]);

  const contextValue: NostrifyMigrationContextType = {
    nostrifyPool: pool.current,
    legacyContext,
    isMigrating,
    isPoolReady: poolReady,
    resetPool: () => {
      try {
        if (import.meta.env.DEV) console.warn("🔄 resetPool requested");
        // Mark not ready and trigger re-init
        setPoolReady(false);
        setResetCounter((c) => c + 1);
      } catch (e) {
        console.warn("⚠️ resetPool failed:", e);
      }
    },
    relayUrls,
    relayPermissions,
  };

  return (
    <NostrifyMigrationContext.Provider value={contextValue}>
      <NostrContext.Provider
        value={{
          nostr:
            poolReady && pool.current
              ? {
                  ...(pool.current as any),
                  query: (filters: any) => {
                    if (import.meta.env.DEV) {
                      console.log("🔍 NostrContext query called:", {
                        hasPool: !!pool.current,
                        hasSemaphore: !!(globalThis as any)
                          .__nostrifyQuerySemaphore,
                        filters: filters?.length || 0,
                      });
                    }

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    return (globalThis as any).__nostrifyQuerySemaphore
                      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (globalThis as any).__nostrifyQuerySemaphore.acquire(
                          () => (pool.current as any).query(filters)
                        )
                      : (pool.current as any).query(filters);
                  },
                }
              : undefined,
        }}
      >
        {children}
      </NostrContext.Provider>
    </NostrifyMigrationContext.Provider>
  );
};

// Hook to access the migration context
export const useNostrifyMigration = () => {
  const context = useContext(NostrifyMigrationContext);
  if (!context) {
    throw new Error(
      "useNostrifyMigration must be used within a NostrifyMigrationProvider"
    );
  }
  return context;
};

// Hook to access Nostrify pool (for new components)
export const useNostrifyPool = () => {
  const { nostrifyPool } = useNostrifyMigration();
  return nostrifyPool;
};

// Hook to access legacy context (for existing components)
export const useLegacyNostr = () => {
  const { legacyContext } = useNostrifyMigration();
  return legacyContext;
};

export default NostrifyMigrationProvider;
