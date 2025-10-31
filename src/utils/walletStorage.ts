const WALLET_STORAGE_KEY = "nostr-wallet-connection";

// Import encryption utilities
import { nip07SignEvent } from "./nostr/nip07";
import { storeEncryptedSecret, getEncryptedSecret, removeEncryptedSecret } from "./nostr/db";
import { sha256 } from '@noble/hashes/sha2';
import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { persistSecretEncrypted, tryLoadPersistedSecret } from "./nostr/nip07";

// Signature-based NWC storage using cryptographic authentication
async function storeEncryptedNWCString(nwcString: string, pubkey: string): Promise<void> {
  // Create a challenge message for signature-based authentication
  const timestamp = Date.now();
  const challenge = `nostree-nwc-auth:${pubkey}:${timestamp}`;

  // Request signature of the challenge for authentication (proves user has access to private key)
  await nip07SignEvent({
    kind: 27235, // Custom kind for NWC authentication (not broadcasted)
    content: challenge,
    tags: [['purpose', 'nwc-auth']],
    created_at: Math.floor(timestamp / 1000)
  });

  // Derive encryption key deterministically from challenge (not signature)
  const encryptionKey = await deriveKeyFromChallenge(challenge, pubkey);

  // Encrypt the NWC string
  const encrypted = await encryptWithDerivedKey(nwcString, encryptionKey);

  // Store in IndexedDB with NWC prefix
  const storageKey = `nwc_${pubkey.toLowerCase()}`;
  const recordToStore = {
    pubkey: storageKey,
    kdf: 'PBKDF2' as const,
    iterations: 1, // Not used for signature-based
    saltB64: encrypted.nonceB64,
    algo: 'XCHACHA20-POLY1305' as const,
    ivB64: encrypted.nonceB64, // Same as salt for XChaCha20
    ciphertextB64: encrypted.ciphertextB64,
    version: 2, // Version 2 for signature-based
    timestamp: timestamp,
  };

  await storeEncryptedSecret(recordToStore);

}

async function loadEncryptedNWCString(pubkey: string): Promise<string | null> {
  const storageKey = `nwc_${pubkey.toLowerCase()}`;
  const record = await getEncryptedSecret(storageKey);

  if (!record) {

    return null;
  }

  // Check if this is a signature-based encrypted wallet
  if (record.version !== 2) {
    console.warn('❌ NWC wallet uses old passphrase-based encryption. Please delete and reconnect your wallet to use the new signature-based system.');
    return null;
  }
  
  try {
    // Create the same challenge message
    const challenge = `nostree-nwc-auth:${pubkey}:${record.timestamp}`;

    // Request signature of the challenge for authentication (proves user has access to private key)
    await nip07SignEvent({
      kind: 27235, // Custom kind for NWC authentication (not broadcasted)
      content: challenge,
      tags: [['purpose', 'nwc-auth']],
      created_at: Math.floor(record.timestamp / 1000)
    });

    // Derive decryption key deterministically from challenge (not signature)
    const decryptionKey = await deriveKeyFromChallenge(challenge, pubkey);

    // Decrypt the NWC string
    const decrypted = await decryptWithDerivedKey({
      ciphertextB64: record.ciphertextB64,
      nonceB64: record.saltB64
    }, decryptionKey);

    return decrypted;
  } catch (error) {
    console.error('❌ [LOAD] Failed to decrypt NWC wallet with signature:', error);
    console.error('❌ [LOAD] Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack?.substring(0, 200) : undefined
    });
    return null;
  }
}

async function removeEncryptedNWCString(pubkey: string): Promise<void> {
  const storageKey = `nwc_${pubkey.toLowerCase()}`;
  await removeEncryptedSecret(storageKey);
}

// Helper function to derive encryption key deterministically from pubkey and timestamp
async function deriveKeyFromChallenge(challenge: string, pubkey: string): Promise<Uint8Array> {
  // Use deterministic key derivation: PBKDF2 with challenge as password and pubkey as salt
  // This ensures the same key is derived every time for the same challenge + pubkey combination
  const challengeBytes = new TextEncoder().encode(challenge);
  const pubkeyBytes = new TextEncoder().encode(pubkey);
  
  return pbkdf2(sha256, challengeBytes, pubkeyBytes, { c: 1000, dkLen: 32 });
}

// Helper function to encrypt with derived key
async function encryptWithDerivedKey(plaintext: string, key: Uint8Array): Promise<{ ciphertextB64: string; nonceB64: string }> {
  const plaintextBytes = new TextEncoder().encode(plaintext);
  const nonce = crypto.getRandomValues(new Uint8Array(24)); // XChaCha20 nonce
  
  const cipher = xchacha20poly1305(key, nonce);
  const ciphertext = cipher.encrypt(plaintextBytes);
  
  return {
    ciphertextB64: btoa(String.fromCharCode(...ciphertext)),
    nonceB64: btoa(String.fromCharCode(...nonce))
  };
}

// Helper function to decrypt with derived key
async function decryptWithDerivedKey(encrypted: { ciphertextB64: string; nonceB64: string }, key: Uint8Array): Promise<string> {
  const ciphertext = new Uint8Array(atob(encrypted.ciphertextB64).split('').map(c => c.charCodeAt(0)));
  const nonce = new Uint8Array(atob(encrypted.nonceB64).split('').map(c => c.charCodeAt(0)));
  
  const cipher = xchacha20poly1305(key, nonce);
  const plaintext = cipher.decrypt(ciphertext);
  
  return new TextDecoder().decode(plaintext);
}

// Simple interface for wallet connection data
export interface StoredWalletConnection {
  id: string; // Unique identifier for the wallet
  name: string; // User-defined name for the wallet
  connectionString: string;
  walletType: "nwc" | "webln" | "cashu";
  connectedAt: number;
  lastUsed: number;
  persist: boolean; // Whether this wallet should be persisted
  pubkey: string; // The pubkey of the user who owns this wallet
}

/**
 * Store wallet connection string securely
 */
export const storeWalletConnection = async (
  connection: StoredWalletConnection,
  options?: { pubkey?: string; passphrase?: string }
): Promise<void> => {
  try {

    // Get existing wallets
    const existingWallets = await getStoredWalletConnections();
    const walletIndex = existingWallets.findIndex(w => w.id === connection.id);

    let dataToStore = { ...connection };

    // Encrypt NWC connection strings for security
    if (connection.walletType === "nwc" && connection.connectionString) {
      // For NWC wallets, encryption is mandatory - we never store them in plaintext
      if (!options?.pubkey) {
        throw new Error("NWC connection strings must be encrypted. Please provide the user's pubkey for encryption.");
      }

      // If passphrase is provided, use passphrase-based encryption (v1)
      // This is used for NIP-07 users who don't have direct access to their private key
      if (options.passphrase) {
        await persistSecretEncrypted(connection.connectionString, options.passphrase, options.pubkey, 'nwc');
      } else {
        // Otherwise use signature-based encryption (v2)
        await storeEncryptedNWCString(connection.connectionString, options.pubkey);
      }
      dataToStore.connectionString = "encrypted"; // Store marker instead of actual string

    }

    if (walletIndex >= 0) {
      // Update existing wallet
      existingWallets[walletIndex] = dataToStore;
    } else {
      // Add new wallet
      existingWallets.push(dataToStore);
    }

    localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(existingWallets));

  } catch (error) {
    console.error("❌ Failed to store wallet connection:", error);
  }
};

/**
 * Retrieve all stored wallet connections, optionally filtered by pubkey
 */
export const getStoredWalletConnections = async (pubkey?: string): Promise<StoredWalletConnection[]> => {
  try {

    const stored = localStorage.getItem(WALLET_STORAGE_KEY);
    if (!stored) {

      return [];
    }

    const connections = JSON.parse(stored) as StoredWalletConnection[];

    // Validate and filter connections
    let validConnections = connections.filter(connection => {
      if (!connection.walletType || !connection.id) {
        console.warn("❌ Invalid stored wallet connection, skipping:", connection);
        return false;
      }
      return true;
    });

    // Filter by pubkey if provided
    if (pubkey) {
      validConnections = validConnections.filter(connection => connection.pubkey === pubkey);

    }

    return validConnections;
  } catch (error) {
    console.error("❌ Failed to retrieve wallet connections:", error);
    return [];
  }
};

/**
 * Retrieve stored wallet connection by ID
 */
export const getStoredWalletConnection = async (
  walletId?: string,
  options?: { pubkey?: string; decrypt?: boolean; passphrase?: string }
): Promise<StoredWalletConnection | null> => {
  try {
    const connections = await getStoredWalletConnections(options?.pubkey);

    // If no ID specified, return the most recently used wallet
    if (!walletId) {
      const sorted = connections.sort((a, b) => b.lastUsed - a.lastUsed);
      const connection = sorted[0];
      if (!connection) return null;
      walletId = connection.id;
    }

    const connection = connections.find(c => c.id === walletId);
    if (!connection) {

      return null;
    }

    // Decrypt NWC connection strings
    if (connection.walletType === "nwc" && connection.connectionString === "encrypted") {
      if (options?.pubkey && options?.decrypt === true) {

        try {
          let decryptedString: string | null = null;
          
          // Try passphrase-based decryption first (v1) if passphrase provided
          if (options.passphrase) {
            decryptedString = await tryLoadPersistedSecret(options.pubkey, options.passphrase, 'nwc');
          }
          
          // If passphrase decryption didn't work, try signature-based (v2)
          if (!decryptedString) {
            decryptedString = await loadEncryptedNWCString(options.pubkey);
          }
          
          if (decryptedString) {
            connection.connectionString = decryptedString;

          } else {
            // Decryption failed but wallet exists - user may need to provide passphrase or unlock their key first

            connection.connectionString = "encrypted"; // Keep marker for UI
          }
        } catch (error) {
          // Decryption authentication failed

          connection.connectionString = "encrypted"; // Keep marker for UI
        }
      } else {
        // Return connection metadata without decrypting
        connection.connectionString = "encrypted"; // Keep marker for UI
      }
    } else if (!connection.connectionString) {
      console.warn("❌ Invalid stored wallet connection, removing");
      await removeStoredWalletConnection(walletId);
      return null;
    }

    return connection;
  } catch (error) {
    console.error("❌ Failed to retrieve wallet connection:", error);
    return null;
  }
};

/**
 * Remove stored wallet connection by ID
 */
export const removeStoredWalletConnection = async (
  walletId?: string,
  options?: { pubkey?: string }
): Promise<void> => {
  try {
    if (!walletId) {
      // Remove all wallet connections
      localStorage.removeItem(WALLET_STORAGE_KEY);
      // Remove all encrypted NWC strings if pubkey provided
      if (options?.pubkey) {
        await removeEncryptedNWCString(options.pubkey);
      }

      return;
    }

    const connections = await getStoredWalletConnections();
    const filteredConnections = connections.filter(c => c.id !== walletId);

    if (filteredConnections.length === 0) {
      localStorage.removeItem(WALLET_STORAGE_KEY);
      // Remove encrypted NWC string if pubkey provided
      if (options?.pubkey) {
        await removeEncryptedNWCString(options.pubkey);
      }

    } else {
      localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(filteredConnections));
      // Remove encrypted NWC string if pubkey provided
      if (options?.pubkey) {
        await removeEncryptedNWCString(options.pubkey);
      }

    }
  } catch (error) {
    console.error("Failed to remove wallet connection:", error);
  }
};

/**
 * Update last used timestamp for stored connection
 */
export const updateWalletLastUsed = async (walletId?: string, options?: { pubkey?: string }): Promise<void> => {
  const connection = await getStoredWalletConnection(walletId, options);
  if (connection) {
    await storeWalletConnection({
      ...connection,
      lastUsed: Date.now(),
    }, options);
  }
};

/**
 * Generate a unique wallet ID
 */
export const generateWalletId = (): string => {
  return `wallet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Check if we have a stored connection that should be auto-connected
 */
export const shouldAutoConnectWallet = async (walletId?: string, options?: { pubkey?: string }): Promise<boolean> => {

  const connection = await getStoredWalletConnection(walletId, options);
  if (!connection) {

    return false;
  }

  // Don't auto-connect encrypted NWC wallets (require user passphrase)
  if (connection.walletType === "nwc" && connection.connectionString === "encrypted") {

    return false;
  }

  // Only auto-connect if it was used recently (within last 30 days)
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  const shouldAutoConnect = connection.lastUsed > thirtyDaysAgo;

  return shouldAutoConnect;
};
