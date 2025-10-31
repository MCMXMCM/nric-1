import { nip19, getPublicKey as nostrGetPublicKey, finalizeEvent } from 'nostr-tools';
import { minePowForEventBase, type EventBaseForPow } from './pow';
import { storeEncryptedSecret, getEncryptedSecret, removeEncryptedSecret, listEncryptedSecrets } from './db';
import { pbkdf2 as noblePbkdf2 } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha2';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';

export const hasNip07 = (): boolean => {
  return typeof window !== 'undefined' &&
    !!window.nostr &&
    typeof window.nostr.getPublicKey === 'function' &&
    typeof window.nostr.signEvent === 'function';
};

export class Nip07Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Nip07Error';
  }
}

// In-memory secret key storage for PWA mode (session-scoped only)
let inMemorySecretKeyHex: string | null = null;

export function setInMemorySecretKeyHex(hex: string | null) {
  const previousValue = inMemorySecretKeyHex;
  inMemorySecretKeyHex = hex && /^[0-9a-fA-F]{64}$/.test(hex) ? hex.toLowerCase() : null;
  
  // Debug logging for secret key changes
  if (previousValue !== inMemorySecretKeyHex) {
    if (inMemorySecretKeyHex === null && previousValue !== null) {
      console.warn('🔑 Secret key cleared!', new Error().stack);
    } else if (inMemorySecretKeyHex !== null && previousValue === null) {
      console.log('🔑 Secret key set');
    }
  }
}

export function getInMemorySecretKeyHex(): string | null {
  return inMemorySecretKeyHex;
}

export function hasInMemorySecretKey(): boolean {
  return Boolean(inMemorySecretKeyHex);
}

// WebCrypto helpers for secure persistence
function getWebCrypto(): Crypto | null {
  if (typeof window === 'undefined') return null;
  const c: any = window.crypto || null;
  if (!c) return null;
  if (!c.subtle && c.webkitSubtle) c.subtle = c.webkitSubtle;
  return c as Crypto;
}

// Check if we're in an iOS PWA environment where WebCrypto might be unreliable
function isIOSPWA(): boolean {
  if (typeof window === 'undefined') return false;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone = (window.navigator as any).standalone === true;
  return isIOS && isStandalone;
}

async function importPassphraseToKey(passphrase: string): Promise<CryptoKey> {
  const cryptoApi = getWebCrypto();
  if (!cryptoApi || !cryptoApi.subtle) throw new Error('Secure persistence requires WebCrypto which is not supported in this environment');
  const enc = new TextEncoder();
  const raw = enc.encode(passphrase);
  return (cryptoApi.subtle as SubtleCrypto).importKey('raw', raw, 'PBKDF2', false, ['deriveKey']);
}

async function deriveAesGcmKey(passphraseKey: CryptoKey, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const cryptoApi = getWebCrypto();
  if (!cryptoApi || !cryptoApi.subtle) throw new Error('Secure persistence requires WebCrypto which is not supported in this environment');
  return (cryptoApi.subtle as SubtleCrypto).deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    passphraseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function toBase64(bytes: Uint8Array): string {
  if (typeof window === 'undefined') return '';
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  if (typeof window === 'undefined') return new Uint8Array();
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error('Invalid hex');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}

export async function persistSecretEncrypted(secretHex: string, passphrase: string, pubkeyHex?: string, keyType: 'nsec' | 'nwc' = 'nsec'): Promise<void> {
  const pk = (pubkeyHex ?? derivePubkeyHexFromSecretHex(secretHex)).toLowerCase();
  // Use prefixed storage key to prevent collision between NSEC and NWC
  const storageKey = `${keyType}_${pk}`;
  const cryptoApi = getWebCrypto();
  const iterations = 250_000;
  const plaintext = new TextEncoder().encode(secretHex);
  
  // In iOS PWA, WebCrypto can be unreliable, so prefer the fallback method
  // Otherwise, prefer WebCrypto AES-GCM; fallback to noble xchacha20poly1305
  if (cryptoApi && cryptoApi.subtle && !isIOSPWA()) {
    const salt = cryptoApi.getRandomValues(new Uint8Array(16));
    const iv = cryptoApi.getRandomValues(new Uint8Array(12));
    const passKey = await importPassphraseToKey(passphrase);
    const aesKey = await deriveAesGcmKey(passKey, salt, iterations);
    const ciphertext = new Uint8Array(await (cryptoApi.subtle as SubtleCrypto).encrypt({ name: 'AES-GCM', iv }, aesKey, plaintext));
    await storeEncryptedSecret({
      pubkey: storageKey,
      kdf: 'PBKDF2',
      iterations,
      saltB64: toBase64(salt),
      algo: 'AES-GCM',
      ivB64: toBase64(iv),
      ciphertextB64: toBase64(ciphertext),
      version: 1,
      timestamp: Date.now(),
    });
    return;
  }
  // Fallback path - use secure random generation that works without WebCrypto
  const salt = new Uint8Array(16);
  const nonce = new Uint8Array(24);
  
  // Use crypto.getRandomValues if available, otherwise use Math.random as fallback
  if (cryptoApi && cryptoApi.getRandomValues) {
    cryptoApi.getRandomValues(salt);
    cryptoApi.getRandomValues(nonce);
  } else {
    // Fallback for environments without crypto.getRandomValues
    // This is not cryptographically secure but better than failing completely
    for (let i = 0; i < salt.length; i++) {
      salt[i] = Math.floor(Math.random() * 256);
    }
    for (let i = 0; i < nonce.length; i++) {
      nonce[i] = Math.floor(Math.random() * 256);
    }
  }
  const keyBytes = noblePbkdf2(sha256, new TextEncoder().encode(passphrase), salt, { c: iterations, dkLen: 32 });
  const cipher = xchacha20poly1305(keyBytes, nonce);
  const ciphertext = cipher.encrypt(plaintext);
  await storeEncryptedSecret({
    pubkey: storageKey,
    kdf: 'PBKDF2',
    iterations,
    saltB64: toBase64(salt),
    algo: 'XCHACHA20-POLY1305',
    ivB64: toBase64(nonce),
    ciphertextB64: toBase64(ciphertext),
    version: 1,
    timestamp: Date.now(),
  });
}

export async function tryLoadPersistedSecret(pubkeyHex: string, passphrase: string, keyType: 'nsec' | 'nwc' = 'nsec'): Promise<string | null> {
  const pk = pubkeyHex.toLowerCase();
  // Use prefixed storage key to prevent collision between NSEC and NWC
  const storageKey = `${keyType}_${pk}`;
  
  // First try the new prefixed format
  let record = await getEncryptedSecret(storageKey);
  
  // If not found and this is an NSEC request, try migration from old format
  if (!record && keyType === 'nsec') {
    record = await getEncryptedSecret(pk);
    if (record) {

      // Try to decrypt with old format to verify it's valid
      const migratedSecret = await tryDecryptRecord(record, passphrase);
      if (migratedSecret && /^[0-9a-f]{64}$/.test(migratedSecret)) {
        // It's a valid NSEC, migrate it to new format
        await persistSecretEncrypted(migratedSecret, passphrase, pk, 'nsec');
        // Remove old format
        await removeEncryptedSecret(pk);

        return migratedSecret;
      }
    }
  }
  
  if (!record) return null;

  return await tryDecryptRecord(record, passphrase);
}

// Helper function to decrypt a record - used for both normal decryption and migration
async function tryDecryptRecord(record: any, passphrase: string): Promise<string | null> {
  const salt = fromBase64(record.saltB64);
  const iv = fromBase64(record.ivB64);
  const ciphertext = fromBase64(record.ciphertextB64);
  
  if (record.algo === 'AES-GCM') {
    const cryptoApi = getWebCrypto();
    if (!cryptoApi || !cryptoApi.subtle) {
      console.warn('WebCrypto not available for AES-GCM decryption. Key was encrypted with AES-GCM but cannot be decrypted in this environment. This commonly happens in iOS PWA mode.');
      return null;
    }
    try {
      const passKey = await importPassphraseToKey(passphrase);
      const aesKey = await deriveAesGcmKey(passKey, salt, record.iterations);
      const plaintext = new Uint8Array(await (cryptoApi.subtle as SubtleCrypto).decrypt({ name: 'AES-GCM', iv }, aesKey, ciphertext));
      const secretHex = new TextDecoder().decode(plaintext);

      // Validate the decrypted secret - either 64-char hex (private key) or NWC string
      if (/^[0-9a-f]{64}$/.test(secretHex)) {
        return secretHex;
      } else if (secretHex.startsWith('nostr+walletconnect://') || secretHex.includes('nostr+walletconnect')) {
        return secretHex;
      } else {
        console.warn('AES-GCM: Decrypted content is not a valid secret key format. Length:', secretHex.length, 'First 20 chars:', secretHex.substring(0, 20));
        return null;
      }
    } catch (error) {
      console.warn('Failed to decrypt AES-GCM encrypted secret:', error);
      return null;
    }
  }
  
  if (record.algo === 'XCHACHA20-POLY1305') {
    try {
      const keyBytes = noblePbkdf2(sha256, new TextEncoder().encode(passphrase), salt, { c: record.iterations, dkLen: 32 });
      const cipher = xchacha20poly1305(keyBytes, iv);
      const plaintext = cipher.decrypt(ciphertext);
      const secretHex = new TextDecoder().decode(plaintext);

      // Validate the decrypted secret - either 64-char hex (private key) or NWC string
      if (/^[0-9a-f]{64}$/.test(secretHex)) {
        return secretHex;
      } else if (secretHex.startsWith('nostr+walletconnect://') || secretHex.includes('nostr+walletconnect')) {
        return secretHex;
      } else {
        console.warn('XCHACHA20: Decrypted content is not a valid secret key format. Length:', secretHex.length, 'First 20 chars:', secretHex.substring(0, 20));
        return null;
      }
    } catch {
      return null;
    }
  }
  
  return null;
}

export async function removePersistedSecret(pubkeyHex: string, keyType: 'nsec' | 'nwc' = 'nsec'): Promise<void> {
  const pk = pubkeyHex.toLowerCase();
  const storageKey = `${keyType}_${pk}`;
  await removeEncryptedSecret(storageKey);
}

/**
 * Check if a user has an AES-GCM encrypted key that cannot be decrypted in the current environment
 */
export async function hasInaccessibleAESGCMKey(pubkeyHex: string): Promise<boolean> {
  const pk = pubkeyHex.toLowerCase();
  const storageKey = `nsec_${pk}`;
  
  // Check both new and old formats
  let record = await getEncryptedSecret(storageKey);
  if (!record) {
    record = await getEncryptedSecret(pk); // Check old format
  }
  
  if (!record || record.algo !== 'AES-GCM') return false;
  
  const cryptoApi = getWebCrypto();
  return !cryptoApi || !cryptoApi.subtle;
}

/**
 * Re-encrypt a key from AES-GCM to XCHACHA20-POLY1305 for better compatibility
 * This is useful when a user's key becomes inaccessible due to WebCrypto unavailability
 */
export async function migrateKeyEncryption(pubkeyHex: string, passphrase: string, originalSecretHex: string): Promise<boolean> {
  try {
    // Remove the old AES-GCM encrypted key
    await removePersistedSecret(pubkeyHex);
    
    // Re-encrypt with the fallback method
    const pk = pubkeyHex.toLowerCase();
    const iterations = 250_000;
    const plaintext = new TextEncoder().encode(originalSecretHex);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const nonce = crypto.getRandomValues(new Uint8Array(24));
    const keyBytes = noblePbkdf2(sha256, new TextEncoder().encode(passphrase), salt, { c: iterations, dkLen: 32 });
    const cipher = xchacha20poly1305(keyBytes, nonce);
    const ciphertext = cipher.encrypt(plaintext);
    
    await storeEncryptedSecret({
      pubkey: pk,
      kdf: 'PBKDF2',
      iterations,
      saltB64: toBase64(salt),
      algo: 'XCHACHA20-POLY1305',
      ivB64: toBase64(nonce),
      ciphertextB64: toBase64(ciphertext),
      version: 1,
      timestamp: Date.now(),
    });
    
    return true;
  } catch (error) {
    console.error('Failed to migrate key encryption:', error);
    return false;
  }
}

export async function listPersistedAccounts(): Promise<Array<{ pubkey: string; timestamp: number }>> {
  const records = await listEncryptedSecrets();
  return records
    .filter(r => r.pubkey.startsWith('nsec_')) // Only include NSEC accounts
    .map(r => ({ 
      pubkey: r.pubkey.substring(5), // Remove 'nsec_' prefix
      timestamp: r.timestamp || 0 
    }))
    .concat(
      // Also include old format accounts (for backward compatibility during migration)
      records
        .filter(r => !r.pubkey.startsWith('nsec_') && !r.pubkey.startsWith('nwc_'))
        .map(r => ({ pubkey: r.pubkey, timestamp: r.timestamp || 0 }))
    );
}

export function deriveSecretHexFromInput(nsecOrHex: string): string {
  if (!nsecOrHex) throw new Error('No secret provided');
  const trimmed = nsecOrHex.trim();
  if (trimmed.startsWith('nsec')) {
    try {
      const decoded = nip19.decode(trimmed);
      if (decoded.type !== 'nsec') {
        throw new Error('Invalid nsec format');
      }
      // decoded.data is a Uint8Array; convert to hex string without Buffer (browser-safe)
      const bytes = decoded.data as Uint8Array;
      const secret = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      if (!/^[0-9a-fA-F]{64}$/.test(secret)) {
        throw new Error('Invalid secret key length');
      }
      return secret.toLowerCase();
    } catch (error) {
      if (error instanceof Error && error.message.includes('Invalid nsec format')) {
        throw error;
      }
      throw new Error('Invalid nsec encoding');
    }
  }
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  throw new Error('Invalid secret key format');
}

export function derivePubkeyHexFromSecretHex(secretHex: string): string {
  const skBytes = hexToBytes(secretHex);
  return nostrGetPublicKey(skBytes as any);
}

export async function nip07GetPublicKey(options?: { timeoutMs?: number }): Promise<string> {
  if (!hasNip07()) throw new Nip07Error('Nostr extension not found');
  const timeoutMs = options?.timeoutMs ?? 30000;
  return withTimeout(window.nostr!.getPublicKey(), timeoutMs, 'Extension did not respond in time');
}

export async function nip07SignEvent(
  base: { kind: number; created_at?: number; tags?: string[][]; content: string },
  options?: { timeoutMs?: number; powTargetBits?: number; signal?: AbortSignal }
): Promise<any> {
  // Serialize concurrent NIP-07 sign requests to avoid extension deadlocks/timeouts
  // Many extensions only handle one prompt at a time; concurrent calls can cause timeouts
  // We keep a simple global promise chain to ensure sequential execution
  if (!(globalThis as any).__nip07SignQueue) {
    (globalThis as any).__nip07SignQueue = Promise.resolve();
  }
  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const q: Promise<any> = (globalThis as any).__nip07SignQueue;
    const next = q.then(task, task);
    // Ensure the queue continues even if this task rejects
    (globalThis as any).__nip07SignQueue = next.catch(() => undefined);
    return next;
  };
  // If PoW is requested, mine first using the pubkey that will sign
  if (options?.powTargetBits && options.powTargetBits > 0) {
    const createdAt = base.created_at ?? Math.floor(Date.now() / 1000);
    const tags = base.tags ?? [];

    // Prioritize in-memory secret key over NIP-07 extension for PoW mining
    // This ensures that when users unlock their saved accounts, they use the unlocked key
    if (inMemorySecretKeyHex) {
      // Double-check that the key is still valid before using it
      if (!inMemorySecretKeyHex || !/^[0-9a-fA-F]{64}$/.test(inMemorySecretKeyHex)) {
        console.error('🔑 In-memory secret key became invalid during PoW signing process');
        throw new Nip07Error('Secret key became invalid during PoW signing');
      }

      const pubkey = derivePubkeyHexFromSecretHex(inMemorySecretKeyHex);
      const toMine: EventBaseForPow = {
        pubkey,
        kind: base.kind,
        created_at: createdAt,
        tags,
        content: base.content,
      };
      const sessionId = `nsec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const mined = await minePowForEventBase(toMine, options.powTargetBits, {
        signal: options.signal,
        sessionId
      });

      const eventWithPubkey = { ...mined } as any;
      const skBytes = hexToBytes(inMemorySecretKeyHex);
      const signed = finalizeEvent(eventWithPubkey, skBytes as any);

      return signed;
    }

    if (hasNip07()) {

      const pubkey = await nip07GetPublicKey({ timeoutMs: options?.timeoutMs ?? 15000 });

      const toMine: EventBaseForPow = {
        pubkey,
        kind: base.kind,
        created_at: createdAt,
        tags,
        content: base.content,
      };

      const sessionId = `nip07-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const mined = await minePowForEventBase(toMine, options.powTargetBits, {
        signal: options.signal,
        sessionId
      });

      const minedEvent = {
        kind: mined.kind,
        created_at: mined.created_at,
        tags: mined.tags,
        content: mined.content,
        pubkey: mined.pubkey,
      } as any;
      const timeoutMs = options?.timeoutMs ?? 30000; // Increased timeout for signing

      const signed = await enqueue(() =>
        withTimeout(
          window.nostr!.signEvent(minedEvent),
          timeoutMs,
          'Extension did not respond to sign request within 30 seconds. Please check if your Nostr extension is properly installed and configured.'
        )
      );

      return signed;
    }

    throw new Nip07Error('No signing method available');
  }

  // No PoW: original signing paths
  const event = {
    kind: base.kind,
    created_at: base.created_at ?? Math.floor(Date.now() / 1000),
    tags: base.tags ?? [],
    content: base.content,
  };

  // Prioritize in-memory secret key over NIP-07 extension
  // This ensures that when users unlock their saved accounts, they use the unlocked key
  if (inMemorySecretKeyHex) {
    // Double-check that the key is still valid before using it
    if (!inMemorySecretKeyHex || !/^[0-9a-fA-F]{64}$/.test(inMemorySecretKeyHex)) {
      console.error('🔑 In-memory secret key became invalid during signing process');
      throw new Nip07Error('Secret key became invalid during signing');
    }

    const eventWithPubkey = { ...event, pubkey: derivePubkeyHexFromSecretHex(inMemorySecretKeyHex) } as any;
    const skBytes = hexToBytes(inMemorySecretKeyHex);
    const signed = finalizeEvent(eventWithPubkey, skBytes as any);

    return signed;
  }

  if (hasNip07()) {
    const timeoutMs = options?.timeoutMs ?? 30000;

    // Get pubkey from extension and add it to the event
    const pubkey = await nip07GetPublicKey({ timeoutMs });
    const eventWithPubkey = { ...event, pubkey };
    
    const signed = await enqueue(() =>
      withTimeout(
        window.nostr!.signEvent(eventWithPubkey),
        timeoutMs,
        'Extension did not respond to sign request within 30 seconds. Please check if your Nostr extension is open and unlocked, then try again.'
      )
    );

    return signed;
  }

  throw new Nip07Error('No signing method available');
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timeoutHandle: number | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = window.setTimeout(() => reject(new Nip07Error(message)), ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) window.clearTimeout(timeoutHandle);
  }
}

