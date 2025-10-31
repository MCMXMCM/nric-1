import React, {
  createContext,
  useState,
  useEffect,
  useCallback,
  useContext,
} from "react";
import { nip19 } from "nostr-tools";
// import NDK from "@nostr-dev-kit/ndk"; // Removed to prevent conflicts with Nostrify
import {
  DEFAULT_RELAY_URLS,
  PROFILE_RELAY_URLS,
} from "../utils/nostr/constants";
import {
  getGlobalUnifiedConnectionManager,
  UnifiedConnectionManager,
} from "../utils/nostr/unifiedConnectionManager";
import type { RelayConnectionPool } from "../utils/nostr/relayConnectionPool";
import {
  hasNip07,
  nip07GetPublicKey,
  deriveSecretHexFromInput,
  derivePubkeyHexFromSecretHex,
  setInMemorySecretKeyHex,
  getInMemorySecretKeyHex,
  hasInMemorySecretKey,
  persistSecretEncrypted,
  listPersistedAccounts,
  tryLoadPersistedSecret,
  removePersistedSecret,
  hasInaccessibleAESGCMKey,
} from "../utils/nostr/nip07";
import { fetchUserMetadata } from "../utils/profileMetadataUtils";
import type { Metadata } from "../types/nostr/types";
import {
  fetchUserRelays,
  deduplicateRelays,
} from "../utils/relayDiscoveryUtils";

interface NostrContextType {
  unifiedManager: UnifiedConnectionManager | null;
  // ndk: NDK | null; // Removed to prevent conflicts with Nostrify
  nostrClient: RelayConnectionPool | null; // Keep for backward compatibility
  pubkey: string; // Always hex format for consistent internal usage
  pubkeyNpub: string; // Always npub format for display
  nip07Available: boolean;
  refreshNip07Availability: () => void;
  setPubkey: (value: string) => void;
  signInWithNip07: () => Promise<string>;
  signInWithNsec: (
    nsecOrHex: string,
    options?: { persist?: boolean; passphrase?: string }
  ) => Promise<string>;
  signOut: (options?: {
    destroyInMemory?: boolean;
    removePersisted?: boolean;
  }) => void;
  listSavedAccounts: () => Promise<
    Array<{ pubkey: string; timestamp: number }>
  >;
  signInWithSavedAccount: (
    pubkeyHex: string,
    passphrase: string
  ) => Promise<string>;
  loginMethod: "" | "nip07" | "nsec";
  nsecPersistedThisSession: boolean;
  fetchUserMetadataForPubkey: (pubkeyHex: string) => Promise<Metadata | null>;
  getCachedMetadataForPubkey: (pubkeyHex: string) => Metadata | null;
}

const NostrContext = createContext<NostrContextType>({
  unifiedManager: null,
  // ndk: null, // Removed to prevent conflicts with Nostrify
  nostrClient: null,
  pubkey: "",
  pubkeyNpub: "",
  nip07Available: false,
  refreshNip07Availability: () => {},
  setPubkey: () => {},
  signInWithNip07: async () => "",
  signInWithNsec: async () => "",
  signOut: () => {},
  listSavedAccounts: async () => [],
  signInWithSavedAccount: async () => "",
  loginMethod: "",
  nsecPersistedThisSession: false,
  fetchUserMetadataForPubkey: async () => null,
  getCachedMetadataForPubkey: () => null,
});

// Helper function to normalize pubkey to hex format
const normalizeToHex = (pubkey: string): string => {
  if (!pubkey) return "";
  try {
    if (pubkey.startsWith("npub")) {
      const decoded = nip19.decode(pubkey);
      if (decoded.type === "npub" && typeof decoded.data === "string") {
        return decoded.data;
      }
    } else if (/^[0-9a-fA-F]{64}$/.test(pubkey)) {
      return pubkey.toLowerCase();
    }
    return pubkey; // Return as-is if can't normalize
  } catch {
    return pubkey; // Return as-is if decode fails
  }
};

// Helper function to convert hex to npub
const hexToNpub = (hex: string): string => {
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) return "";
  try {
    return nip19.npubEncode(hex);
  } catch {
    return "";
  }
};

export const NostrProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [unifiedManager, setUnifiedManager] =
    useState<UnifiedConnectionManager | null>(null);
  // const [ndk, setNdk] = useState<NDK | null>(null); // Removed to prevent conflicts with Nostrify

  // Initialize pubkey from localStorage, normalizing to hex format
  const [pubkey, setPubkeyState] = useState<string>(() => {
    const stored = localStorage.getItem("nostrPubkey") || "";
    return normalizeToHex(stored);
  });

  // Derive npub format from hex pubkey
  const [pubkeyNpub, setPubkeyNpub] = useState<string>(() => {
    const stored = localStorage.getItem("nostrPubkey") || "";
    const hex = normalizeToHex(stored);
    return hexToNpub(hex);
  });

  const [nip07Available, setNip07Available] = useState<boolean>(() =>
    hasNip07()
  );
  const [loginMethod, setLoginMethod] = useState<"" | "nip07" | "nsec">(
    () => (sessionStorage.getItem("nostrLoginMethod") as any) || ""
  );
  const [nsecPersistedThisSession, setNsecPersistedThisSession] =
    useState<boolean>(
      () => sessionStorage.getItem("nostrNsecPersisted") === "true"
    );

  // Auto-detect login method and handle persisted accounts on mount
  useEffect(() => {
    const detectLoginMethod = async () => {
      const storedPubkey = localStorage.getItem("nostrPubkey");
      const storedLoginMethod = sessionStorage.getItem("nostrLoginMethod");

      // If we have a pubkey but no login method, try to detect it
      if (storedPubkey && !storedLoginMethod) {
        // Check if we have an in-memory secret key (indicates nsec login)
        if (getInMemorySecretKeyHex()) {
          setLoginMethod("nsec");
          try {
            sessionStorage.setItem("nostrLoginMethod", "nsec");
          } catch {}
          return;
        }

        // Check if this pubkey has a persisted account (indicates nsec login)
        try {
          const accounts = await listPersistedAccounts();
          const hexPubkey = normalizeToHex(storedPubkey);
          const hasPersistedAccount = accounts.some(
            (acc) => acc.pubkey.toLowerCase() === hexPubkey.toLowerCase()
          );
          if (hasPersistedAccount) {
            setLoginMethod("nsec");
            try {
              sessionStorage.setItem("nostrLoginMethod", "nsec");
            } catch {}
            setNsecPersistedThisSession(true);
            try {
              sessionStorage.setItem("nostrNsecPersisted", "true");
            } catch {}
            return;
          }
        } catch {}

        // Do not assume nip07 just because extension exists; explicit sign-in required.
      }

      // If we have a pubkey and login method is "nsec", check if we have a persisted account
      // This handles the case where user has logged in before but key is not in memory
      if (storedPubkey && storedLoginMethod === "nsec") {
        try {
          const accounts = await listPersistedAccounts();
          const hexPubkey = normalizeToHex(storedPubkey);
          const hasPersistedAccount = accounts.some(
            (acc) => acc.pubkey.toLowerCase() === hexPubkey.toLowerCase()
          );
          if (hasPersistedAccount) {
            setNsecPersistedThisSession(true);
            try {
              sessionStorage.setItem("nostrNsecPersisted", "true");
            } catch {}
          }
        } catch (error) {
          console.warn("Failed to check for persisted accounts:", error);
        }
      }
    };

    detectLoginMethod();
  }, []);

  useEffect(() => {
    const initializeUnifiedManager = async () => {
      try {
        const manager = getGlobalUnifiedConnectionManager();
        await manager.initialize(DEFAULT_RELAY_URLS);
        setUnifiedManager(manager);

        // Note: NDK initialization removed to prevent conflicts with Nostrify
        // NostrifyMigrationProvider now handles all relay connections
        console.log(
          "✅ UnifiedConnectionManager initialized (NDK removed to prevent conflicts)"
        );
      } catch (error) {
        console.error("Failed to initialize connection systems:", error);
        // Fallback: try to initialize just the unified manager
        try {
          const manager = getGlobalUnifiedConnectionManager();
          await manager.initialize(DEFAULT_RELAY_URLS);
          setUnifiedManager(manager);
        } catch (fallbackError) {
          console.error("Fallback initialization also failed:", fallbackError);
        }
      }
    };

    initializeUnifiedManager();

    return () => {
      // Note: We don't destroy the global manager here as it's shared across the app
      // The manager will be destroyed when the app unmounts
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNip07Available(hasNip07()), 5000);
    return () => window.clearInterval(id);
  }, []);

  const refreshNip07Availability = useCallback(
    () => setNip07Available(hasNip07()),
    []
  );

  const fetchUserMetadataForPubkey = useCallback(
    async (pubkeyHex: string): Promise<Metadata | null> => {
      try {
        const result = await fetchUserMetadata({
          pubkeyHex,
          relayUrls: DEFAULT_RELAY_URLS,
        });
        return result.metadata;
      } catch (error) {
        console.warn("Failed to fetch metadata for pubkey:", pubkeyHex, error);
        return null;
      }
    },
    []
  );

  const getCachedMetadataForPubkey = useCallback(
    (pubkeyHex: string): Metadata | null => {
      try {
        const metadataKey = `userMetadata_${pubkeyHex}`;
        const cached = localStorage.getItem(metadataKey);
        if (cached) {
          return JSON.parse(cached) as Metadata;
        }
      } catch (error) {
        console.warn(
          "Failed to get cached metadata for pubkey:",
          pubkeyHex,
          error
        );
      }
      return null;
    },
    []
  );

  const setPubkey = useCallback((value: string) => {
    const hexValue = normalizeToHex(value);
    const npubValue = hexToNpub(hexValue);

    setPubkeyState(hexValue);
    setPubkeyNpub(npubValue);

    if (!hexValue) {
      localStorage.removeItem("nostrPubkey");
    } else {
      // Always store hex format in localStorage for consistency
      localStorage.setItem("nostrPubkey", hexValue);

      // If this is a public-key-only session (no login method yet), apply npub relay defaults (session-scoped)
      // Skip this for NIP-07 and NSEC logins since they can sign events and should get full relay permissions
      try {
        const currentLoginMethod = sessionStorage.getItem("nostrLoginMethod");
        const sessionFlag = sessionStorage.getItem(
          `relayDefaultsApplied_${hexValue}`
        );
        // Only apply npub-only defaults if no login method is set (pure npub/pubkey input)
        if (!sessionFlag && !currentLoginMethod) {
          // Fire-and-forget: fetch user relays and set session-scoped defaults (no broadcast)
          (async () => {
            try {
              const discoveryRelays = Array.from(
                new Set([
                  ...DEFAULT_RELAY_URLS,
                  ...PROFILE_RELAY_URLS,
                  "wss://relay.nostr.band",
                ])
              );
              const result = await fetchUserRelays({
                pubkeyHex: hexValue,
                relayUrls: discoveryRelays,
              });
              // If profile relays page has more relays (from other sources), prefer those too if available in localStorage cache
              const relays = deduplicateRelays(result.relays || []);
              if (relays.length > 0) {
                const urls = relays.map((r) => r.url);
                // For npub-only session, force read or indexer permissions only (no write)
                const permissions: Record<string, any> = {};
                relays.forEach((r) => {
                  // For npub users, use the classified permission but restrict to read/indexer only
                  if (r.permission === "indexer") {
                    permissions[r.url] = "indexer";
                  } else {
                    // All other relays become read-only for npub users (no signing capability)
                    permissions[r.url] = "read";
                  }
                });
                try {
                  sessionStorage.setItem(
                    "nostr_session_relay_defaults",
                    JSON.stringify({ relays: urls, permissions })
                  );
                  sessionStorage.setItem(
                    `relayDefaultsApplied_${hexValue}`,
                    "true"
                  );
                  // Notify listeners that session relay defaults are ready
                  try {
                    window.dispatchEvent(
                      new CustomEvent("sessionRelayDefaultsUpdated")
                    );
                  } catch {}
                } catch {}
              }
            } catch (e) {
              console.warn("Failed to apply npub relay defaults:", e);
            }
          })();
        }
      } catch {}
    }
  }, []);

  const signInWithNip07 = useCallback(async (): Promise<string> => {
    console.log("🔄 signInWithNip07: Starting...");
    const pk = await nip07GetPublicKey();
    console.log("🔄 signInWithNip07: Got public key:", pk.slice(0, 8));

    // Set login method BEFORE setting pubkey to prevent npub-only relay defaults
    setLoginMethod("nip07");
    try {
      sessionStorage.setItem("nostrLoginMethod", "nip07");
    } catch {}
    setNsecPersistedThisSession(false);
    try {
      sessionStorage.setItem("nostrNsecPersisted", "false");
    } catch {}

    // Clear any npub-only session relay overrides
    try {
      sessionStorage.removeItem("nostr_session_relay_defaults");
      window.dispatchEvent(new CustomEvent("sessionRelayDefaultsUpdated"));
    } catch {}

    // Now set pubkey - this won't trigger npub-only defaults since loginMethod is set
    setPubkey(pk);
    console.log(
      "🔄 signInWithNip07: Set pubkey, waiting for pool to be ready..."
    );

    // Wait for Nostrify pool to reinitialize after pubkey change
    // The pool is recreated when pubkey changes, which closes/reopens relay connections
    // Safari mobile needs much longer due to slow WebSocket connection establishment
    const isMobile = /Mobi|Android/i.test(navigator.userAgent);
    const isSafari =
      /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
    // Safari mobile needs 2-3 seconds for relay WebSocket connections to establish
    const poolReinitDelay = isMobile && isSafari ? 2500 : isMobile ? 1500 : 500;
    await new Promise((resolve) => setTimeout(resolve, poolReinitDelay));

    console.log(
      "🔄 signInWithNip07: Pool should be ready, now fetching metadata..."
    );

    // Fetch metadata for the logged-in user and update TanStack Query cache
    try {
      console.log("🔄 signInWithNip07: Calling fetchUserMetadataForPubkey...");
      const metadata = await fetchUserMetadataForPubkey(pk);
      console.log("🔄 signInWithNip07: fetchUserMetadataForPubkey completed");
      if (metadata) {
        // Store metadata in localStorage for persistence across sessions
        const metadataKey = `userMetadata_${pk}`;
        localStorage.setItem(metadataKey, JSON.stringify(metadata));

        // Update TanStack Query cache immediately for instant UI update
        try {
          const { CACHE_KEYS } = await import("../utils/cacheKeys");

          // Get the query client from the global context (exposed in App.tsx)
          const queryClient = (window as any).__queryClient;
          if (queryClient) {
            const queryKey = CACHE_KEYS.METADATA(pk);
            queryClient.setQueryData(queryKey, { metadata, error: undefined });
            console.log(
              `🔄 Updated TanStack Query cache for ${pk.slice(
                0,
                8
              )} after login`
            );
          }
        } catch (queryError) {
          console.warn(
            "Failed to update TanStack Query cache after login:",
            queryError
          );
        }
      }
    } catch (error) {
      console.warn("Failed to fetch metadata after NIP-07 login:", error);
    }

    // Apply user relay defaults from NIP-65 if available and no local prefs exist
    try {
      const userRelaysKey = `nostr_stored_relays_${pk}`;
      const storedRelays = localStorage.getItem(userRelaysKey);
      const sessionFlag = sessionStorage.getItem(`relayDefaultsApplied_${pk}`);
      if (!storedRelays && !sessionFlag) {
        const result = await fetchUserRelays({
          pubkeyHex: pk,
          relayUrls: DEFAULT_RELAY_URLS,
        });
        const relays = deduplicateRelays(result.relays || []);
        if (relays.length > 0) {
          const urls = relays.map((r) => r.url);
          const permissions: Record<string, any> = {};
          relays.forEach((r) => {
            const read = !!r.read;
            const write = !!r.write;
            permissions[r.url] =
              read && write
                ? "readwrite"
                : read
                  ? "read"
                  : write
                    ? "write"
                    : "readwrite";
          });
          try {
            window.dispatchEvent(
              new CustomEvent("relayListChanged", {
                detail: { action: "set_defaults", relays: urls, permissions },
              })
            );
            sessionStorage.setItem(`relayDefaultsApplied_${pk}`, "true");
          } catch {}
        }
      }
    } catch (error) {
      console.warn("Failed to apply user relay defaults:", error);
    }

    // Trigger relay reload for the new user
    try {
      window.dispatchEvent(
        new CustomEvent("relayReload", {
          detail: { pubkeyHex: pk },
        })
      );
    } catch {}

    // Note: Removed hard page reload here. The state updates and events are sufficient.
    // The reload was unnecessary and caused issues with preserving state.

    console.log("🔄 signInWithNip07: Function completed, returning pubkey");
    return pk;
  }, [setPubkey, fetchUserMetadataForPubkey]);

  const signInWithNsec = useCallback(
    async (
      nsecOrHex: string,
      options?: { persist?: boolean; passphrase?: string }
    ): Promise<string> => {
      const secretHex = deriveSecretHexFromInput(nsecOrHex);
      const pk = derivePubkeyHexFromSecretHex(secretHex);
      // Store only in memory by default
      setInMemorySecretKeyHex(secretHex);
      if (options?.persist) {
        const passphrase = options?.passphrase || "";
        if (!passphrase || passphrase.length < 8) {
          throw new Error("Passphrase must be at least 8 characters");
        }
        await persistSecretEncrypted(secretHex, passphrase, pk, "nsec");
      }
      setPubkey(pk);
      setLoginMethod("nsec");
      try {
        sessionStorage.setItem("nostrLoginMethod", "nsec");
      } catch {}
      const persisted = Boolean(options?.persist);
      setNsecPersistedThisSession(persisted);
      try {
        sessionStorage.setItem("nostrNsecPersisted", String(persisted));
      } catch {}

      // Clear any npub-only session relay overrides
      try {
        sessionStorage.removeItem("nostr_session_relay_defaults");
        window.dispatchEvent(new CustomEvent("sessionRelayDefaultsUpdated"));
      } catch {}

      // Wait for Nostrify pool to reinitialize after pubkey change
      // Safari mobile needs much longer due to slow WebSocket connection establishment
      const isMobile = /Mobi|Android/i.test(navigator.userAgent);
      const isSafari =
        /Safari/.test(navigator.userAgent) &&
        !/Chrome/.test(navigator.userAgent);
      // Safari mobile needs 2-3 seconds for relay WebSocket connections to establish
      const poolReinitDelay =
        isMobile && isSafari ? 2500 : isMobile ? 1500 : 500;
      await new Promise((resolve) => setTimeout(resolve, poolReinitDelay));

      // Fetch metadata for the logged-in user
      try {
        const metadata = await fetchUserMetadataForPubkey(pk);
        if (metadata) {
          // Store metadata in localStorage for persistence across sessions
          const metadataKey = `userMetadata_${pk}`;
          localStorage.setItem(metadataKey, JSON.stringify(metadata));
        }
      } catch (error) {
        console.warn("Failed to fetch metadata after NSEC login:", error);
      }

      // Apply user relay defaults from NIP-65 if available and no local prefs exist
      try {
        const userRelaysKey = `nostr_stored_relays_${pk}`;
        const storedRelays = localStorage.getItem(userRelaysKey);
        const sessionFlag = sessionStorage.getItem(
          `relayDefaultsApplied_${pk}`
        );
        if (!storedRelays && !sessionFlag) {
          const result = await fetchUserRelays({
            pubkeyHex: pk,
            relayUrls: DEFAULT_RELAY_URLS,
          });
          const relays = deduplicateRelays(result.relays || []);
          if (relays.length > 0) {
            const urls = relays.map((r) => r.url);
            const permissions: Record<string, any> = {};
            relays.forEach((r) => {
              // Use the classified permission if available, otherwise fall back to read/write logic
              if (r.permission) {
                permissions[r.url] = r.permission;
              } else {
                const read = !!r.read;
                const write = !!r.write;
                permissions[r.url] =
                  read && write
                    ? "readwrite"
                    : read
                      ? "read"
                      : write
                        ? "write"
                        : "readwrite";
              }
            });
            try {
              window.dispatchEvent(
                new CustomEvent("relayListChanged", {
                  detail: { action: "set_defaults", relays: urls, permissions },
                })
              );
              sessionStorage.setItem(`relayDefaultsApplied_${pk}`, "true");
            } catch {}
          }
        }
      } catch (error) {
        console.warn("Failed to apply user relay defaults:", error);
      }

      // Trigger relay reload for the new user
      try {
        window.dispatchEvent(
          new CustomEvent("relayReload", {
            detail: { pubkeyHex: pk },
          })
        );
      } catch {}

      // Note: Removed hard page reload here. The state updates (setPubkey, setLoginMethod)
      // and events (relayReload, sessionRelayDefaultsUpdated) are sufficient to notify the app
      // of the login state change. When a user signs in and persists their key with a passphrase,
      // the reload would clear the in-memory key, forcing them to unlock it immediately.
      // The app properly handles state transitions through React's event system and Nostrify
      // automatically reinitializes the pool when pubkey changes.

      return pk;
    },
    [setPubkey, fetchUserMetadataForPubkey]
  );

  const signOut = useCallback(
    async (options?: {
      destroyInMemory?: boolean;
      removePersisted?: boolean;
    }) => {
      const currentPubkey = pubkey;

      setPubkey("");
      setPubkeyNpub("");

      // Optionally clear in-memory secret; default is true for safety
      const shouldDestroy = options?.destroyInMemory !== false;
      if (shouldDestroy && getInMemorySecretKeyHex())
        setInMemorySecretKeyHex(null);

      // Optionally remove persisted encrypted secret from device storage
      if (options?.removePersisted && currentPubkey) {
        try {
          await removePersistedSecret(currentPubkey);
          // Broadcast that saved accounts have changed
          try {
            window.dispatchEvent(new CustomEvent("nostrSavedAccountsChanged"));
          } catch {}
        } catch (error) {
          console.error("Failed to remove persisted secret:", error);
        }
      }

      // Broadcast sign-out for header/avatar updates
      try {
        window.dispatchEvent(new CustomEvent("nostrSignOut"));
      } catch {}
      setLoginMethod("");
      setNsecPersistedThisSession(false);
      try {
        sessionStorage.removeItem("nostrLoginMethod");
      } catch {}
      try {
        sessionStorage.removeItem("nostrNsecPersisted");
      } catch {}

      // Restore default relays on logout for the new session (clear session overrides only)
      try {
        sessionStorage.removeItem("nostr_session_relay_defaults");
      } catch {}
    },
    [setPubkey, pubkey]
  );

  const listSavedAccounts = useCallback(async () => {
    return listPersistedAccounts();
  }, []);

  const signInWithSavedAccount = useCallback(
    async (pubkeyHex: string, passphrase: string): Promise<string> => {
      const secretHex = await tryLoadPersistedSecret(
        pubkeyHex,
        passphrase,
        "nsec"
      );
      if (!secretHex) {
        // Check if this is the WebCrypto issue on iOS PWA
        const hasInaccessibleKey = await hasInaccessibleAESGCMKey(pubkeyHex);
        if (hasInaccessibleKey) {
          throw new Error(
            "Your saved key cannot be unlocked in this environment (iOS PWA WebCrypto limitation). Please try logging in with your NSEC directly to re-save your key with better compatibility."
          );
        }
        throw new Error("Invalid passphrase or no saved account");
      }

      // Validate the decrypted secret before setting it
      if (!secretHex || typeof secretHex !== "string") {
        console.error("Decrypted secret is null, undefined, or not a string");
        throw new Error(
          "Failed to decrypt key. The key data appears to be corrupted or the passphrase is incorrect."
        );
      }

      // Trim whitespace that might have been accidentally included
      const trimmedSecret = secretHex.trim();

      // Check if it's a valid NSEC key (64-character hex)
      if (!/^[0-9a-fA-F]{64}$/i.test(trimmedSecret)) {
        // Check if it's an NWC connection string
        if (
          trimmedSecret.startsWith("nostr+walletconnect://") ||
          trimmedSecret.includes("nostr+walletconnect")
        ) {
          // This is a wallet connection string, not a private key
          throw new Error(
            "This saved account appears to be a wallet connection, not a private key. Please log in with your NSEC directly."
          );
        }

        console.error(
          "Decrypted content is not a valid 64-character hex private key. Length:",
          trimmedSecret.length,
          "First 20 chars:",
          trimmedSecret.substring(0, 20)
        );
        throw new Error(
          "The decrypted key is not in the expected format. This could be due to an incorrect passphrase or corrupted data. Try logging in with your NSEC directly to re-save your key."
        );
      }

      setInMemorySecretKeyHex(trimmedSecret);

      // Verify that the key was actually set
      if (!hasInMemorySecretKey()) {
        throw new Error(
          "Failed to unlock key. Please try again or log in with your NSEC directly."
        );
      }

      setPubkey(pubkeyHex);
      setLoginMethod("nsec");

      // Notify that NSEC has been unlocked - wallet connections can now be decrypted
      window.dispatchEvent(new CustomEvent("nsecUnlocked"));
      try {
        sessionStorage.setItem("nostrLoginMethod", "nsec");
      } catch {}
      setNsecPersistedThisSession(true);
      try {
        sessionStorage.setItem("nostrNsecPersisted", "true");
      } catch {}

      // Clear any npub-only session relay overrides
      try {
        sessionStorage.removeItem("nostr_session_relay_defaults");
        window.dispatchEvent(new CustomEvent("sessionRelayDefaultsUpdated"));
      } catch {}

      // Wait for Nostrify pool to reinitialize after pubkey change
      // Safari mobile needs much longer due to slow WebSocket connection establishment
      const isMobile = /Mobi|Android/i.test(navigator.userAgent);
      const isSafari =
        /Safari/.test(navigator.userAgent) &&
        !/Chrome/.test(navigator.userAgent);
      // Safari mobile needs 2-3 seconds for relay WebSocket connections to establish
      const poolReinitDelay =
        isMobile && isSafari ? 2500 : isMobile ? 1500 : 500;
      await new Promise((resolve) => setTimeout(resolve, poolReinitDelay));

      // Fetch metadata for the logged-in user
      try {
        const metadata = await fetchUserMetadataForPubkey(pubkeyHex);
        if (metadata) {
          // Store metadata in localStorage for persistence across sessions
          const metadataKey = `userMetadata_${pubkeyHex}`;
          localStorage.setItem(metadataKey, JSON.stringify(metadata));
        }
      } catch (error) {
        console.warn(
          "Failed to fetch metadata after saved account login:",
          error
        );
      }

      // Apply user relay defaults from NIP-65 if available and no local prefs exist
      try {
        const userRelaysKey = `nostr_stored_relays_${pubkeyHex}`;
        const storedRelays = localStorage.getItem(userRelaysKey);
        const sessionFlag = sessionStorage.getItem(
          `relayDefaultsApplied_${pubkeyHex}`
        );
        if (!storedRelays && !sessionFlag) {
          const result = await fetchUserRelays({
            pubkeyHex,
            relayUrls: DEFAULT_RELAY_URLS,
          });
          const relays = deduplicateRelays(result.relays || []);
          if (relays.length > 0) {
            const urls = relays.map((r) => r.url);
            const permissions: Record<string, any> = {};
            relays.forEach((r) => {
              const read = !!r.read;
              const write = !!r.write;
              permissions[r.url] =
                read && write
                  ? "readwrite"
                  : read
                    ? "read"
                    : write
                      ? "write"
                      : "readwrite";
            });
            try {
              window.dispatchEvent(
                new CustomEvent("relayListChanged", {
                  detail: { action: "set_defaults", relays: urls, permissions },
                })
              );
              sessionStorage.setItem(
                `relayDefaultsApplied_${pubkeyHex}`,
                "true"
              );
            } catch {}
          }
        }
      } catch (error) {
        console.warn("Failed to apply user relay defaults:", error);
      }

      // Trigger relay reload for the new user
      try {
        window.dispatchEvent(
          new CustomEvent("relayReload", {
            detail: { pubkeyHex: pubkeyHex },
          })
        );
      } catch {}

      // Note: Removed hard page reload here. The state updates (setPubkey, setLoginMethod)
      // and events (nsecUnlocked, relayReload) are sufficient to notify the app of the
      // login state change. The reload was causing the unlock modal callbacks to be
      // interrupted when called from UnlockKeyModal, creating an infinite loop where
      // the modal would re-appear after the page reloaded.
      // The app now properly handles state transitions through React's event system
      // and the Nostrify pool reinitializes through the relay manager's pubkey dependency.

      return pubkeyHex;
    },
    [setPubkey, fetchUserMetadataForPubkey]
  );

  return (
    <NostrContext.Provider
      value={{
        unifiedManager,
        // ndk, // Removed to prevent conflicts with Nostrify
        nostrClient: unifiedManager?.relayPool || null,
        pubkey,
        pubkeyNpub,
        nip07Available,
        refreshNip07Availability,
        setPubkey,
        signInWithNip07,
        signInWithNsec,
        signOut,
        listSavedAccounts,
        signInWithSavedAccount,
        loginMethod,
        nsecPersistedThisSession,
        fetchUserMetadataForPubkey,
        getCachedMetadataForPubkey,
      }}
    >
      {children}
    </NostrContext.Provider>
  );
};

// Custom hook to use the Nostr context
export const useNostr = () => {
  const context = useContext(NostrContext);
  if (context === undefined) {
    throw new Error("useNostr must be used within a NostrProvider");
  }
  return context;
};

export { NostrContext };
