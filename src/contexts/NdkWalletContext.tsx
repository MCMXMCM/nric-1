import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import {
  NDKNWCWallet,
  NDKWebLNWallet,
  NDKCashuWallet,
} from "@nostr-dev-kit/ndk-wallet";
import { NostrContext } from "./NostrContext";
import NDK from "@nostr-dev-kit/ndk";
import { decodeLnurlBech32, encodeLnurlBech32 } from "../utils/lnurl";
import { getGlobalRelayPool } from "../utils/nostr/relayConnectionPool";
import {
  storeWalletConnection,
  getStoredWalletConnection,
  removeStoredWalletConnection,
  updateWalletLastUsed,
  shouldAutoConnectWallet,
  generateWalletId,
} from "../utils/walletStorage";

interface ZapRequest {
  amount: number; // in sats
  comment?: string;
  recipientPubkey: string;
  eventId?: string; // for zapping specific notes
}

interface ZapResponse {
  success: boolean;
  paymentRequest?: string;
  error?: string;
  preimage?: string;
}

interface WalletInfo {
  connected: boolean;
  balance?: number;
  walletPubkey?: string;
  lud16?: string;
  lud06?: string;
  walletType?: "nwc" | "webln" | "cashu";
}

interface NdkWalletContextType {
  wallet: NDKNWCWallet | NDKWebLNWallet | NDKCashuWallet | null;
  walletInfo: WalletInfo;
  connectNWCWallet: (
    connectionString: string,
    walletName?: string,
    persist?: boolean,
    options?: { passphrase?: string; pubkey?: string }
  ) => Promise<boolean>;
  connectWebLNWallet: () => Promise<boolean>;
  disconnectWallet: () => void;
  sendZap: (request: ZapRequest) => Promise<ZapResponse>;
  getLightningAddress: (pubkey: string) => Promise<string | null>;
  resolveLud06: (lud06: string) => Promise<any>;
  resolveLud16: (lud16: string) => Promise<any>;
  isLoading: boolean;
  error: string | null;
}

const NdkWalletContext = createContext<NdkWalletContextType | undefined>(
  undefined
);

export const useNdkWallet = () => {
  const context = useContext(NdkWalletContext);
  if (context === undefined) {
    throw new Error("useNdkWallet must be used within an NdkWalletProvider");
  }
  return context;
};

interface NdkWalletProviderProps {
  children: React.ReactNode;
}

export const NdkWalletProvider: React.FC<NdkWalletProviderProps> = ({
  children,
}) => {
  const [wallet, setWallet] = useState<
    NDKNWCWallet | NDKWebLNWallet | NDKCashuWallet | null
  >(null);
  const [walletInfo, setWalletInfo] = useState<WalletInfo>({
    connected: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preventAutoReconnect, setPreventAutoReconnect] = useState(false);

  // Create separate NDK instance for wallet operations (not shared with main relay connections)
  const { pubkey } = useContext(NostrContext);
  const [ndk, setNdk] = useState<NDK | null>(null);

  // Initialize NDK instance for wallet operations
  useEffect(() => {
    const initializeWalletNDK = async () => {
      try {
        const walletNDK = new NDK({
          explicitRelayUrls: ["wss://relay.snort.social", "wss://nos.lol"], // Minimal relays for wallet operations
        });
        await walletNDK.connect();
        setNdk(walletNDK);
        console.log("✅ Wallet NDK initialized");
      } catch (error) {
        console.error("❌ Failed to initialize wallet NDK:", error);
      }
    };

    initializeWalletNDK();
  }, []);

  // Check for stored wallet connection on mount (like nsec persistence)
  useEffect(() => {
    const checkStoredWallet = async () => {
      try {
        const storedConnection = await getStoredWalletConnection(undefined, {
          pubkey,
        });

        if (storedConnection && !wallet && !preventAutoReconnect) {
          const shouldAutoConnect = await shouldAutoConnectWallet();

          if (shouldAutoConnect && ndk) {
            await attemptWalletConnection(storedConnection);
          } else if (shouldAutoConnect && !ndk) {
          } else if (!shouldAutoConnect) {
          }
        } else if (preventAutoReconnect) {
        }
      } catch (error) {
        console.error("🔌 Error checking stored wallet:", error);
      }
    };

    checkStoredWallet();
  }, []); // Run once on mount

  // Listen for NSEC unlock events to retry wallet connection
  useEffect(() => {
    const handleNsecUnlocked = async () => {
      try {
        // Get all wallet connections for this pubkey
        const { getStoredWalletConnections } = await import(
          "../utils/walletStorage"
        );
        const allConnections = await getStoredWalletConnections(pubkey);

        // Only auto-connect if there's exactly one wallet and no wallet currently connected
        if (allConnections.length === 1 && !wallet) {
          const connection = allConnections[0];

          // Get the decrypted wallet connection
          const decryptedConnection = await getStoredWalletConnection(
            connection.id,
            {
              pubkey,
              decrypt: true,
            }
          );

          if (
            decryptedConnection &&
            decryptedConnection.connectionString !== "encrypted"
          ) {
            const shouldAutoConnect = await shouldAutoConnectWallet(undefined, {
              pubkey,
            });

            if (shouldAutoConnect && ndk) {
              try {
                await attemptWalletConnection(decryptedConnection);
              } catch (connectionError) {
                console.error("❌ Wallet connection failed:", connectionError);
              }
            } else {
              if (!shouldAutoConnect) {
              }
              if (!ndk) {
              }
            }
          } else {
            if (!decryptedConnection) {
            } else if (decryptedConnection.connectionString === "encrypted") {
            }
          }
        } else if (allConnections.length > 1) {
        } else if (allConnections.length === 0) {
        } else {
        }
      } catch (error) {
        console.error("🔌 Error checking wallet after NSEC unlock:", error);
      }
    };

    window.addEventListener("nsecUnlocked", handleNsecUnlocked);
    return () => {
      window.removeEventListener("nsecUnlocked", handleNsecUnlocked);
    };
  }, [pubkey, wallet, ndk]);

  // Also auto-connect when NDK becomes available
  useEffect(() => {
    if (!ndk) return;

    const autoConnect = async () => {
      // Only auto-connect if we don't already have a wallet
      if (wallet) {
        return;
      }

      try {
        // Get all wallet connections for this pubkey
        const { getStoredWalletConnections } = await import(
          "../utils/walletStorage"
        );
        const allConnections = await getStoredWalletConnections(pubkey);

        // Only auto-connect if there's exactly one wallet
        if (allConnections.length === 1 && !preventAutoReconnect) {
          const connection = allConnections[0];

          // Get the decrypted wallet connection
          const decryptedConnection = await getStoredWalletConnection(
            connection.id,
            {
              pubkey,
              decrypt: true,
            }
          );

          if (decryptedConnection) {
            const shouldAutoConnect = await shouldAutoConnectWallet(
              connection.id,
              { pubkey }
            );

            if (shouldAutoConnect) {
              await attemptWalletConnection(decryptedConnection);
            } else {
            }
          }
        } else if (allConnections.length > 1) {
        } else if (preventAutoReconnect) {
        } else {
        }
      } catch (autoConnectError) {
        console.error("🔌 Auto-connection failed:", autoConnectError);
      }
    };

    autoConnect();
  }, [ndk, wallet]); // Include wallet in dependencies to prevent unnecessary re-runs

  // Check wallet connection when component becomes visible again
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (
        document.visibilityState === "visible" &&
        !wallet &&
        !preventAutoReconnect
      ) {
        try {
          const storedConnection = await getStoredWalletConnection(undefined, {
            pubkey,
          });
          if (storedConnection && ndk) {
            const shouldAutoConnect = await shouldAutoConnectWallet();
            if (shouldAutoConnect) {
              await attemptWalletConnection(storedConnection);
            }
          }
        } catch (error) {
          console.error(
            "🔌 Error checking wallet on visibility change:",
            error
          );
        }
      } else if (preventAutoReconnect) {
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [wallet, ndk]);

  // Auto-disconnect wallet when user logs out
  useEffect(() => {
    const handleSignOut = () => {
      if (walletInfo.connected) {
        setWallet(null);
        setWalletInfo({ connected: false });
        setError(null);
        // Clear stored connection on logout for security
        removeStoredWalletConnection();
      }
    };

    window.addEventListener("nostrSignOut", handleSignOut);
    return () => window.removeEventListener("nostrSignOut", handleSignOut);
  }, [walletInfo.connected]);

  // Extracted wallet connection logic for reuse
  const attemptWalletConnection = async (
    storedConnection: any,
    retryCount = 0
  ) => {
    const maxRetries = 2;

    if (!ndk) {
      return;
    }

    try {
      if (storedConnection.walletType === "nwc") {
        try {
          const nwcWallet = new NDKNWCWallet(ndk, {
            pairingCode: storedConnection.connectionString,
          });

          setWallet(nwcWallet);

          // Try to get wallet info with a timeout
          try {
            const infoPromise = nwcWallet.getInfo();
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Wallet info timeout")), 10000)
            );

            const info = await Promise.race([infoPromise, timeoutPromise]);

            setWalletInfo({
              connected: true,
              balance: info ? undefined : undefined,
              walletPubkey: (info as any)?.pubkey || undefined,
              lud16: undefined,
              lud06: undefined,
              walletType: "nwc",
            });

            // Update balance
            await nwcWallet.updateBalance();
            const balance = nwcWallet.balance?.amount;
            setWalletInfo((prev) => ({ ...prev, balance }));

            // Update last used timestamp
            await updateWalletLastUsed(undefined, { pubkey });
          } catch (infoError) {
            console.warn(
              "🔌 Wallet connected but couldn't get info:",
              infoError
            );
            // Wallet connected but couldn't get info - still consider it connected
            setWalletInfo({
              connected: true,
              walletType: "nwc",
            });
            // Still update last used timestamp even if info failed
            await updateWalletLastUsed(undefined, { pubkey });
          }
        } catch (walletError) {
          console.error(
            `🔌 Failed to create NWC wallet (attempt ${retryCount + 1}):`,
            walletError
          );

          // Retry logic for network-related errors
          if (
            retryCount < maxRetries &&
            walletError instanceof Error &&
            (walletError.message?.includes("network") ||
              walletError.message?.includes("timeout") ||
              walletError.message?.includes("fetch"))
          ) {
            setTimeout(
              () => attemptWalletConnection(storedConnection, retryCount + 1),
              2000
            );
            return;
          }

          // Remove invalid connection string
          removeStoredWalletConnection();
          setWallet(null);
          setWalletInfo({ connected: false });
        }
      }
    } catch (error) {
      console.error("🔌 Wallet connection attempt failed:", error);
      // Don't remove stored connection for general errors
    }
  };

  const connectNWCWallet = useCallback(
    async (
      connectionString: string,
      walletName?: string,
      persist: boolean = true,
      options?: { pubkey?: string; passphrase?: string }
    ): Promise<boolean> => {
      if (!ndk) {
        setError("NDK not initialized");
        return false;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Parse NWC connection string
        const nwcWallet = new NDKNWCWallet(ndk, {
          pairingCode: connectionString,
        });

        setWallet(nwcWallet);

        // Try to get wallet info
        try {
          const info = await nwcWallet.getInfo();
          setWalletInfo({
            connected: true,
            balance: info ? undefined : undefined, // Will be updated via updateBalance
            walletPubkey: info?.pubkey,
            lud16: undefined,
            lud06: undefined,
            walletType: "nwc",
          });

          // Update balance
          await nwcWallet.updateBalance();
          const balance = nwcWallet.balance?.amount;
          setWalletInfo((prev) => ({ ...prev, balance }));
        } catch (infoError) {
          // Wallet connected but couldn't get info - still consider it connected
          setWalletInfo({
            connected: true,
            walletType: "nwc",
          });
        }

        // Store the connection for future auto-connection if persist is true
        if (persist) {
          await storeWalletConnection(
            {
              id: generateWalletId(),
              name:
                walletName || `NWC Wallet ${new Date().toLocaleDateString()}`,
              connectionString,
              walletType: "nwc",
              connectedAt: Date.now(),
              lastUsed: Date.now(),
              persist: true,
              pubkey: options?.pubkey || pubkey || "",
            },
            options
          );
        }

        // Reset the prevent auto-reconnect flag since user manually connected
        setPreventAutoReconnect(false);

        setIsLoading(false);
        return true;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to connect NWC wallet";
        setError(errorMessage);
        setIsLoading(false);
        return false;
      }
    },
    [ndk, pubkey]
  );

  const connectWebLNWallet = useCallback(async (): Promise<boolean> => {
    if (!ndk) {
      setError("NDK not initialized");
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      const weblnWallet = new NDKWebLNWallet(ndk);
      setWallet(weblnWallet);

      setWalletInfo({
        connected: true,
        walletType: "webln",
      });

      // Store WebLN connection info (though WebLN doesn't need a connection string)
      await storeWalletConnection({
        id: generateWalletId(),
        name: "WebLN Wallet",
        connectionString: "", // WebLN doesn't need a stored string
        walletType: "webln",
        connectedAt: Date.now(),
        lastUsed: Date.now(),
        persist: true,
        pubkey: pubkey || "",
      });

      // Reset the prevent auto-reconnect flag since user manually connected
      setPreventAutoReconnect(false);

      setIsLoading(false);
      return true;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to connect WebLN wallet";
      setError(errorMessage);
      setIsLoading(false);
      return false;
    }
  }, [ndk]);

  const disconnectWallet = useCallback(() => {
    setWallet(null);
    setWalletInfo({ connected: false });
    setError(null);
    setPreventAutoReconnect(true);
    // Note: We don't remove the stored connection on disconnect
    // The saved wallet should remain available for future connections
    // But we prevent auto-reconnection after manual disconnect
  }, []);

  const sendZap = useCallback(
    async (request: ZapRequest): Promise<ZapResponse> => {
      if (!wallet || !walletInfo.connected) {
        return {
          success: false,
          error: "Wallet not connected",
        };
      }

      if (!ndk) {
        return {
          success: false,
          error: "NDK not initialized",
        };
      }

      setIsLoading(true);
      setError(null);

      try {
        // Enhanced Lightning address resolution with multiple fallback strategies
        const { fetchUserMetadata } = await import(
          "../utils/profileMetadataUtils"
        );
        // Note: Relay discovery removed from pre-sign path to avoid network delays

        let lud16: string | undefined;
        let lud06: string | undefined;
        let metadataResult: any = null;

        // Strategy 1: Try our unified metadata system with retry logic
        try {
          console.log(
            `🔍 Strategy 1: Fetching metadata for ${request.recipientPubkey.slice(0, 8)}...`
          );

          // First check if we have cached metadata
          try {
            const queryClient = (window as any).__queryClient;
            if (queryClient) {
              const cachedMetadata = queryClient.getQueryData([
                "metadata",
                request.recipientPubkey,
              ]);
              if (cachedMetadata && (cachedMetadata as any)?.metadata) {
                const cached = (cachedMetadata as any).metadata;
                lud16 = cached.lud16;
                lud06 = cached.lud06;
                if (lud16 || lud06) {
                  console.log(
                    `✅ Strategy 1: Found Lightning address from cache: ${lud16 || lud06}`
                  );
                }
              }
            }
          } catch (cacheError) {
            console.warn("Cache check failed:", cacheError);
          }

          // If not in cache, try with retry logic for better reliability
          if (!lud16 && !lud06) {
            let attempts = 0;
            const maxAttempts = 2;

            while (attempts < maxAttempts && !lud16 && !lud06) {
              attempts++;
              console.log(
                `🔍 Strategy 1 attempt ${attempts}/${maxAttempts}...`
              );

              try {
                const connectedRelays = getGlobalRelayPool().getConnectedRelays();
                // Ensure we always have some relays to work with, even if none are connected
                const relayUrls = connectedRelays.length > 0
                  ? connectedRelays
                  : (await import("../utils/nostr/constants")).DEFAULT_RELAY_URLS;

                metadataResult = await fetchUserMetadata({
                  pubkeyHex: request.recipientPubkey,
                  relayUrls,
                  useOutboxRelays: true, // Explicitly enable outbox relays for best results
                });

                lud16 = metadataResult.metadata?.lud16;
                lud06 = metadataResult.metadata?.lud06;

                // Enhanced logging for debugging
                console.log(
                  `🔍 Strategy 1 attempt ${attempts}:`,
                  {
                    relayUrls: relayUrls.length,
                    connectedRelays: connectedRelays.length,
                    usingFallbackRelays: connectedRelays.length === 0,
                    hasMetadata: !!metadataResult.metadata,
                    lud16,
                    lud06,
                    error: metadataResult.error,
                    metadata: metadataResult.metadata
                      ? {
                          name: metadataResult.metadata.name,
                          display_name: metadataResult.metadata.display_name,
                          hasLud16: !!metadataResult.metadata.lud16,
                          hasLud06: !!metadataResult.metadata.lud06,
                        }
                      : null,
                  }
                );

                if (lud16 || lud06) {
                  console.log(
                    `✅ Strategy 1: Found Lightning address via metadata system: ${lud16 || lud06}`
                  );
                  break;
                }
              } catch (attemptError) {
                console.warn(
                  `Strategy 1 attempt ${attempts} failed:`,
                  attemptError
                );
                if (attempts < maxAttempts) {
                  // Wait before retry
                  await new Promise((resolve) => setTimeout(resolve, 1000));
                }
              }
            }
          }
        } catch (metadataError) {
          console.warn(
            "Strategy 1 (metadata system) failed after all attempts:",
            metadataError
          );
        }

        // Strategy 2: Try NDK's fetchProfile method with timeout
        if (!lud16 && !lud06) {
          try {
            console.log(
              `🔍 Strategy 2: Trying NDK fetchProfile for ${request.recipientPubkey.slice(0, 8)}...`
            );

            const user = ndk.getUser({ pubkey: request.recipientPubkey });

            // Add timeout to prevent hanging
            const profilePromise = user.fetchProfile();
            const timeoutPromise = new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error("NDK fetchProfile timeout")),
                10000
              )
            );

            const profile = await Promise.race([
              profilePromise,
              timeoutPromise,
            ]);

            if (profile?.lud16) {
              lud16 = profile.lud16;
              console.log(
                `✅ Strategy 2: Found LUD16 via NDK fallback: ${lud16}`
              );
            }
            if (profile?.lud06) {
              lud06 = profile.lud06;
              console.log(
                `✅ Strategy 2: Found LUD06 via NDK fallback: ${lud06}`
              );
            }
          } catch (ndkError) {
            console.warn("Strategy 2 (NDK fallback) failed:", ndkError);
          }
        }

        // Strategy 3: Try direct relay query as final fallback
        if (!lud16 && !lud06) {
          try {
            console.log(
              `🔍 Strategy 3: Trying direct relay query for ${request.recipientPubkey.slice(0, 8)}...`
            );

            const relayPool = getGlobalRelayPool();
            const connectedRelays = relayPool.getConnectedRelays();

            if (connectedRelays.length > 0) {
              // Try a direct query to connected relays with a short timeout
              const directQueryPromise = relayPool.querySync(
                connectedRelays.slice(0, 3), // Try first 3 relays
                { kinds: [0], authors: [request.recipientPubkey], limit: 1 }
              );
              const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(
                  () => reject(new Error("Direct relay query timeout")),
                  5000
                )
              );

              const events = await Promise.race([
                directQueryPromise,
                timeoutPromise,
              ]);

              if (events.length > 0) {
                const event = events[0];
                try {
                  const content = JSON.parse(event.content || "{}");
                  if (content.lud16) {
                    lud16 = content.lud16;
                    console.log(
                      `✅ Strategy 3: Found LUD16 via direct relay query: ${lud16}`
                    );
                  }
                  if (content.lud06) {
                    lud06 = content.lud06;
                    console.log(
                      `✅ Strategy 3: Found LUD06 via direct relay query: ${lud06}`
                    );
                  }
                } catch (parseError) {
                  console.warn(
                    "Failed to parse direct query result:",
                    parseError
                  );
                }
              }
            }
          } catch (directError) {
            console.warn(
              "Strategy 3 (direct relay query) failed:",
              directError
            );
          }
        }

        let lightningAddress = lud16 || lud06;
        if (!lightningAddress) {
          // Enhanced error logging for debugging
          const hasMetadata = !!metadataResult?.metadata;
          const metadataName = metadataResult?.metadata?.display_name || metadataResult?.metadata?.name;
          
          console.error(
            `❌ No lightning address found for ${request.recipientPubkey.slice(0, 8)} after all strategies:`,
            {
              strategies: {
                metadataSystem: {
                  success: hasMetadata,
                  error: metadataResult?.error,
                },
                ndkFallback: { attempted: true },
                directQuery: { attempted: true },
              },
              metadataResult: metadataResult?.metadata,
              hasMetadata,
              lud16,
              lud06,
              connectedRelays: getGlobalRelayPool().getConnectedRelays().length,
            }
          );

          // Provide more helpful error message based on what we found
          let errorMessage = `Unable to find Lightning address for this user`;
          
          if (hasMetadata) {
            // We found the profile but no Lightning address
            errorMessage = `Unable to find Lightning address for ${metadataName || 'this user'}. ` +
              `The user has not set up a Lightning address (lud16) in their profile. ` +
              `Please ask the user to add a Lightning address to their profile to receive zaps.`;
          } else if (metadataResult?.error) {
            // Profile fetch failed with specific error
            errorMessage = `Unable to retrieve user profile: ${metadataResult.error}. ` +
              `This could be due to network connectivity issues or relay availability problems. ` +
              `Please try again in a moment.`;
          } else {
            // Generic failure
            errorMessage = `Unable to find Lightning address for this user. This could be due to:\n` +
              `• The user hasn't set up a Lightning address in their profile\n` +
              `• Network connectivity issues preventing profile retrieval\n` +
              `• Relay availability problems\n\n` +
              `Please try again in a moment, or ask the user to add a Lightning address to their profile.`;
          }
          
          throw new Error(errorMessage);
        }

        console.log(
          `✅ Found lightning address for ${request.recipientPubkey.slice(0, 8)}: ${lightningAddress}`
        );

        // Prepare lnurl bech32 tag without waiting for LNURL metadata (per NIP-57 it's optional but recommended)
        let lnurlBech32: string | undefined;
        if (lud16) {
          const [username, domain] = lud16.split("@");
          if (!username || !domain) {
            throw new Error("Invalid LUD16 format");
          }
          lnurlBech32 = encodeLnurlBech32(
            `https://${domain}/.well-known/lnurlp/${username}`
          );
        } else if (lud06) {
          lnurlBech32 = lud06;
        }

        // Build and sign zap request early to ensure NIP-07 extension prompt happens from user gesture
        const { encodedNostrParamLength, minimizeZapEventTags, capRelaysForZap } = await import(
          "../utils/nostr/zap"
        );
        const { nip07SignEvent } = await import("../utils/nostr/nip07");

        // Keep pre-sign work minimal: cap to connected relays only (no network discovery before user approves)
        const cappedRelays = capRelaysForZap(
          [],
          getGlobalRelayPool().getConnectedRelays(),
          3
        );
        const baseZapRequestEvent: any = {
          kind: 9734,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ...(cappedRelays.length > 0 ? ([ ["relays", ...cappedRelays] ] as any) : []),
            ["amount", (request.amount * 1000).toString()],
            ["lnurl", lnurlBech32!],
            ["p", request.recipientPubkey],
            ["client", "nostree"],
          ],
          content: request.comment || "",
        };
        if (request.eventId) {
          baseZapRequestEvent.tags.push(["e", request.eventId]);
        }

        console.log("📝 Preparing NIP-07 zap sign (pre-network)");
        let workingUnsignedEvent: any = baseZapRequestEvent;
        if (encodedNostrParamLength({ ...workingUnsignedEvent, pubkey: "~" }) > 1800) {
          workingUnsignedEvent = minimizeZapEventTags(workingUnsignedEvent, {
            budget: 1800,
            relayCap: 3,
          });
        }

        let signedEvent;
        try {
          // Warm up the extension by requesting pubkey first (helps some wallets surface the prompt)
          const { nip07GetPublicKey } = await import("../utils/nostr/nip07");
          try {
            console.log("🖊️ Requesting NIP-07 pubkey");
            await nip07GetPublicKey({ timeoutMs: 8000 });
          } catch {}
          console.log("✍️ Requesting NIP-07 sign for zap request");
          signedEvent = await nip07SignEvent(workingUnsignedEvent, { timeoutMs: 30000 });
          console.log("✅ NIP-07 sign completed");
        } catch (signErr) {
          if (
            signErr instanceof Error &&
            (signErr.message.includes("Extension did not respond") ||
              signErr.name === "Nip07Error")
          ) {
            throw new Error(
              "Your Nostr extension did not respond. Please open your extension (e.g., Alby) to approve the signing request, then try again."
            );
          }
          throw signErr;
        }
        if (!signedEvent) {
          throw new Error("Failed to sign zap request");
        }

        // Create timeout wrapper for fetches
        const fetchWithTimeout = (
          url: string,
          timeoutMs: number = 10000
        ): Promise<Response> => {
          return Promise.race([
            fetch(url),
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error(`Request to ${url} timed out`)),
                timeoutMs
              )
            ),
          ]);
        };

        let lnurlData: any;
        let callbackUrl: string | undefined;

        if (lud16) {
          // Handle LUD16 (username@domain format)
          const [username, domain] = lud16.split("@");
          if (!username || !domain) {
            throw new Error("Invalid LUD16 format");
          }

          const lnurlMetaUrl = `https://${domain}/.well-known/lnurlp/${username}`;

          console.log(
            `🔗 Resolving LNURL metadata for ${lud16} → ${lnurlMetaUrl}`
          );

          // Try direct, then CORS proxy if needed
          let lnurlResponse;
          try {
            lnurlResponse = await fetchWithTimeout(lnurlMetaUrl, 8000);
          } catch (directError) {
            console.warn(
              "Direct LNURL fetch failed, trying CORS proxy:",
              directError
            );
            try {
              const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(
                lnurlMetaUrl
              )}`;
              lnurlResponse = await fetchWithTimeout(proxyUrl, 8000);
            } catch (proxyError) {
              console.warn("CORS proxy also failed:", proxyError);
              throw new Error(
                "Failed to resolve Lightning address - network timeout"
              );
            }
          }
          if (!lnurlResponse.ok) {
            throw new Error("Failed to resolve Lightning address");
          }

          lnurlData = await lnurlResponse.json();
          callbackUrl = lnurlData.callback;
          lnurlBech32 = encodeLnurlBech32(
            `https://${domain}/.well-known/lnurlp/${username}`
          );
          console.log(
            `✅ LNURL metadata resolved: min=${lnurlData.minSendable} max=${lnurlData.maxSendable} callback=${callbackUrl}`
          );
        } else if (lud06) {
          // Handle LUD06 (bech32 LNURL)
          try {
            const decodedLnurl = decodeLnurlBech32(lud06);
            const url = new URL(decodedLnurl);
            callbackUrl = url.toString();
            lnurlData = { callback: callbackUrl };
            lnurlBech32 = lud06;
          } catch (error) {
            throw new Error("Invalid LUD06 format");
          }
        }

        // Validate LNURLp fields
        if (!lnurlData || !callbackUrl) {
          throw new Error("Failed to resolve Lightning address");
        }
        const minMsat = Number(lnurlData.minSendable ?? 0);
        const maxMsat = Number(lnurlData.maxSendable ?? 0);
        if (
          !Number.isFinite(minMsat) ||
          !Number.isFinite(maxMsat) ||
          minMsat <= 0 ||
          maxMsat <= 0 ||
          minMsat > maxMsat
        ) {
          throw new Error("Invalid LNURL pay parameters");
        }
        const sendMsat = request.amount * 1000;
        if (sendMsat < minMsat) {
          throw new Error(
            `Amount below minimum: ${Math.ceil(minMsat / 1000)} sats`
          );
        }
        if (sendMsat > maxMsat) {
          throw new Error(
            `Amount above maximum: ${Math.floor(maxMsat / 1000)} sats`
          );
        }
        const commentAllowed = Number(lnurlData.commentAllowed ?? 0);
        if (request.comment && request.comment.length > commentAllowed) {
          throw new Error(`Comment too long: max ${commentAllowed} characters`);
        }
        if (
          typeof lnurlData.allowsNostr === "boolean" &&
          lnurlData.allowsNostr === false
        ) {
          throw new Error("This LNURL endpoint does not allow Nostr zaps");
        }

        // Create zap request event (NIP-57) invoice URL
        const { capRelaysForZap: _cap2, encodedNostrParamLength: _len2, minimizeZapEventTags: _min2, buildInvoiceUrl } = await import(
          "../utils/nostr/zap"
        );
        // Note: we already signed the event with a capped relays tag.

        // Publish the zap request BEFORE payment to ensure receipt linkage on relays
        try {
          const pool = getGlobalRelayPool();
          const connectedRelays = pool.getConnectedRelays();
          if (connectedRelays.length > 0) {
            await pool.publish(connectedRelays, signedEvent);
          }
        } catch (publishError) {
          console.warn(
            "Could not publish zap request before payment",
            publishError
          );
        }

        // Per NIP-57, send the serialized zap request JSON as the 'nostr' param (URL-encoded)
        // Request payment request from LNURL endpoint
        let invoiceUrlStr = buildInvoiceUrl(
          callbackUrl,
          request.amount * 1000,
          signedEvent,
          lnurlBech32,
          request.comment,
          commentAllowed
        );
        console.log(`🧾 Requesting invoice from: ${invoiceUrlStr}`);
        // Request payment request from LNURL endpoint with CORS proxy fallback
        let invoiceResponse: Response;
        try {
          invoiceResponse = await fetchWithTimeout(
            invoiceUrlStr,
            10000
          );
        } catch (directError) {
          console.warn(
            "Direct invoice request failed, trying CORS proxy:",
            directError
          );
          // Network/CORS failure – try proxy
          try {
            const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(
              invoiceUrlStr
            )}`;
            invoiceResponse = await fetchWithTimeout(proxyUrl, 10000);
          } catch (proxyError) {
            console.warn("CORS proxy invoice request also failed:", proxyError);
            throw new Error(
              "Failed to request payment invoice - network timeout"
            );
          }
        }
        if (!invoiceResponse.ok) {
          // Try one retry with a more compact event (drop relays/lnurl if needed)
          console.warn(
            `Invoice fetch not OK (status=${invoiceResponse.status}). Retrying with minimized zap event...`
          );
          const minimizedUnsigned = minimizeZapEventTags(baseZapRequestEvent, {
            budget: 1800,
            relayCap: 3,
          });
          let minimizedSigned;
          try {
            minimizedSigned = await nip07SignEvent(minimizedUnsigned, { timeoutMs: 30000 });
          } catch (e) {
            throw new Error("Failed to sign minimized zap request");
          }

          invoiceUrlStr = buildInvoiceUrl(
            callbackUrl,
            request.amount * 1000,
            minimizedSigned,
            undefined, // drop lnurl in retry to save space
            request.comment,
            commentAllowed
          );

          try {
            invoiceResponse = await fetchWithTimeout(invoiceUrlStr, 10000);
          } catch (retryDirectError) {
            const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(
              invoiceUrlStr
            )}`;
            invoiceResponse = await fetchWithTimeout(proxyUrl, 10000);
          }

          if (!invoiceResponse.ok) {
            throw new Error("Failed to get payment request");
          }
        }

        const invoiceData = await invoiceResponse.json();
        if (!invoiceData.pr) {
          throw new Error("No payment request received");
        }
        console.log(
          `✅ Invoice received (pr length=${String(invoiceData.pr).length})`
        );

        // Wallet responsiveness preflight (best-effort)
        try {
          const preflight = wallet && (wallet as any).getInfo
            ? (wallet as any).getInfo()
            : Promise.resolve(undefined);
          await Promise.race([
            preflight,
            new Promise<void>((_, reject) =>
              setTimeout(
                () => reject(new Error("Wallet preflight timeout")),
                3000
              )
            ),
          ]);
        } catch (pfErr) {
          console.warn("⚠️ Wallet preflight warning:", pfErr);
        }

        // Pay the invoice with timeout protection
        console.log("⚡ Sending payment via wallet API...");
        const paymentPromise = ((): Promise<any> => {
          const w: any = wallet as any;
          if (typeof w.pay === "function") {
            // NDKWalletNWC best practice
            return w.pay({ invoice: invoiceData.pr });
          }
          if (typeof w.lnPay === "function") {
            // Legacy API
            return w.lnPay({
              amount: request.amount * 1000, // Convert to msats
              pr: invoiceData.pr,
              comment: request.comment,
            });
          }
          return Promise.reject(new Error("Wallet does not support pay/lnPay APIs"));
        })();

        const paymentTimeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(
              new Error(
                "Payment request timed out. Please check your NWC wallet connection and try again."
              )
            );
          }, 45000); // 45s to allow wallet approval; still less than modal's 60s timeout
        });

        const paymentResult = await Promise.race([
          paymentPromise,
          paymentTimeoutPromise,
        ]);
        console.log("🧾 Payment result received from wallet");

        if (paymentResult && !("error" in (paymentResult as any))) {
          // Payment successful - now publish the zap request event to Nostr relays
          // This is required by NIP-57 for proper zap functionality
          try {
            const pool = getGlobalRelayPool();
            const connectedRelays = pool.getConnectedRelays();

            if (connectedRelays.length > 0) {
              await pool.publish(connectedRelays, signedEvent);
            } else {
              console.warn(
                "⚠️ No connected relays available for publishing zap request"
              );
            }
          } catch (publishError) {
            // Don't fail the entire zap if publishing fails - payment was successful
            console.error("Failed to publish zap request event:", publishError);
          }

          // Update last used timestamp
          await updateWalletLastUsed(undefined, { pubkey });

          setIsLoading(false);
          return {
            success: true,
            preimage: (paymentResult as any).preimage,
          };
        } else {
          const errMsg = (paymentResult as any)?.error || "Payment failed";
          throw new Error(
            typeof errMsg === "string" ? errMsg : JSON.stringify(errMsg)
          );
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to send zap";
        setError(errorMessage);
        setIsLoading(false);
        return {
          success: false,
          error: errorMessage,
        };
      }
    },
    [wallet, walletInfo.connected, ndk]
  );

  const getLightningAddress = useCallback(
    async (pubkey: string): Promise<string | null> => {
      if (!ndk) return null;

      try {
        // Get Lightning address from user's profile metadata
        const user = ndk.getUser({ pubkey });
        const profile = await user.fetchProfile();

        return profile?.lud16 || null;
      } catch (err) {
        console.error("Failed to get Lightning address:", err);
        return null;
      }
    },
    [ndk]
  );

  const resolveLud06 = useCallback(async (lud06: string): Promise<any> => {
    try {
      // LUD06 resolution - typically involves DNS lookups
      const response = await fetch(`https://lnurlpay.com/lnurlp/${lud06}`);
      if (!response.ok) {
        throw new Error("Failed to resolve LUD06");
      }
      return await response.json();
    } catch (err) {
      console.error("Failed to resolve LUD06:", err);
      throw err;
    }
  }, []);

  const resolveLud16 = useCallback(async (lud16: string): Promise<any> => {
    try {
      // LUD16 resolution - username@domain format
      const [username, domain] = lud16.split("@");
      if (!username || !domain) {
        throw new Error("Invalid LUD16 format");
      }

      const response = await fetch(
        `https://${domain}/.well-known/lnurlp/${username}`
      );
      if (!response.ok) {
        throw new Error("Failed to resolve LUD16");
      }
      return await response.json();
    } catch (err) {
      console.error("Failed to resolve LUD16:", err);
      throw err;
    }
  }, []);

  const contextValue: NdkWalletContextType = {
    wallet,
    walletInfo,
    connectNWCWallet,
    connectWebLNWallet,
    disconnectWallet,
    sendZap,
    getLightningAddress,
    resolveLud06,
    resolveLud16,
    isLoading,
    error,
  };

  return (
    <NdkWalletContext.Provider value={contextValue}>
      {children}
    </NdkWalletContext.Provider>
  );
};
