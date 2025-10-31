import { DB_NAME, DB_VERSION, KEYSTORE_STORE, OUTBOX_EVENTS_STORE, ROUTING_TABLE_STORE } from './constants';

let dbPromise: Promise<IDBDatabase> | null = null;
const getGlobalDbPromise = (): Promise<IDBDatabase> | null => {
  try { return (window as any).__nostreeDbPromise || null; } catch { return null; }
};
const setGlobalDbPromise = (p: Promise<IDBDatabase> | null) => {
  try { (window as any).__nostreeDbPromise = p || undefined; } catch {}
};
const setGlobalOpenedFlag = (v: boolean) => { try { (window as any).__nostreeDbOpened = v; } catch {} };
const getGlobalOpenedFlag = (): boolean => { try { return !!(window as any).__nostreeDbOpened; } catch { return false; } };

export const initDB = (): Promise<IDBDatabase> => {
  // Reuse across HMR/module reloads
  const globalP = getGlobalDbPromise();
  if (globalP) return globalP;
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('Failed to open database:', request.error);
      dbPromise = null;
      setGlobalDbPromise(null);
      reject(request.error);
    };

    request.onsuccess = () => {
      const db = request.result;
      if (!getGlobalOpenedFlag()) {
        console.log(`📦 Database opened successfully: version ${db.version}`);
        setGlobalOpenedFlag(true);
      }

      // If the database is closed or upgraded elsewhere, reset the promise so we can reopen next time
      db.onclose = () => { 
        console.log('📦 Database closed');
        dbPromise = null; 
        setGlobalDbPromise(null); 
        setGlobalOpenedFlag(false);
      };
      db.onversionchange = () => { 
        console.log('📦 Database version change detected');
        try { db.close(); } catch {} 
        dbPromise = null; 
        setGlobalDbPromise(null); 
        setGlobalOpenedFlag(false);
      };
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const oldVersion = event.oldVersion;
      
      console.log(`📦 Database upgrade triggered: ${oldVersion} -> ${DB_VERSION}`);
      console.log(`📦 Existing stores:`, Array.from(db.objectStoreNames));
      
      // Only delete stores that need to be recreated
      if (db.objectStoreNames.contains(KEYSTORE_STORE)) {
        console.log('📦 Deleting keystore to recreate');
        db.deleteObjectStore(KEYSTORE_STORE);
      }
      
      // Don't delete outbox stores if they already exist
      // This prevents data loss during upgrades
      const hasOutboxEvents = db.objectStoreNames.contains(OUTBOX_EVENTS_STORE);
      const hasRoutingTable = db.objectStoreNames.contains(ROUTING_TABLE_STORE);
      
      console.log(`📦 Outbox stores status:`, {
        outboxEvents: hasOutboxEvents,
        routingTable: hasRoutingTable
      });
      
      if (hasOutboxEvents) {
        console.log('📦 Outbox events store already exists, preserving data');
        // Don't delete - just skip creation
      }
      
      if (hasRoutingTable) {
        console.log('📦 Routing table store already exists, preserving data');
        // Don't delete - just skip creation
      }

      // Note: Notes, contacts, zap totals, and ASCII cache stores removed - using TanStack Query for caching instead

      // Keystore for encrypted secrets
      const keystore = db.createObjectStore(KEYSTORE_STORE, { keyPath: 'pubkey' });
      keystore.createIndex('timestamp', 'timestamp', { unique: false });

      // Outbox events store for NIP-65 relay list events
      if (!db.objectStoreNames.contains(OUTBOX_EVENTS_STORE)) {
        const outboxEvents = db.createObjectStore(OUTBOX_EVENTS_STORE, { keyPath: 'id' });
        outboxEvents.createIndex('author', 'pubkey', { unique: false });
        outboxEvents.createIndex('created_at', 'created_at', { unique: false });
        outboxEvents.createIndex('author_created', ['pubkey', 'created_at'], { unique: false });
        console.log('📦 Created outbox events store');
      } else {
        console.log('📦 Outbox events store already exists, skipping creation');
      }

      // Routing table store for user -> relay mappings
      if (!db.objectStoreNames.contains(ROUTING_TABLE_STORE)) {
        const routingTable = db.createObjectStore(ROUTING_TABLE_STORE, { keyPath: 'id' });
        routingTable.createIndex('user', 'user', { unique: false });
        routingTable.createIndex('relay', 'relay', { unique: false });
        routingTable.createIndex('user_relay', ['user', 'relay'], { unique: true });
        console.log('📦 Created routing table store');
      } else {
        console.log('📦 Routing table store already exists, skipping creation');
      }
    };
  });
  setGlobalDbPromise(dbPromise);
  return dbPromise;
};

// Note: Note management functions removed - using TanStack Query for note caching instead

// Note: Contact management functions removed - using TanStack Query for contact caching instead

// Note: cleanupOldNotes removed - using TanStack Query for note caching instead

// Note: clearCache removed - using TanStack Query for caching instead

// Note: clearNotesCache removed - using TanStack Query for note caching instead

// Note: clearContactsCache removed - using TanStack Query for contact caching instead

// Note: getCacheStats removed - using TanStack Query for note caching instead

// Note: getContactsCount and getAsciiCacheCount removed - using TanStack Query for caching instead 

// Note: Zap totals cache functions removed - using TanStack Query for zap totals caching instead

// Keystore management (encrypted secrets)
export const storeEncryptedSecret = async (record: {
  pubkey: string;
  kdf: 'PBKDF2';
  iterations: number;
  saltB64: string;
  algo: 'AES-GCM' | 'XCHACHA20-POLY1305';
  ivB64: string;
  ciphertextB64: string;
  version: number;
  timestamp: number;
}): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([KEYSTORE_STORE], 'readwrite');
    const store = transaction.objectStore(KEYSTORE_STORE);
    const request = store.put(record);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
};

export const getEncryptedSecret = async (pubkey: string): Promise<{
  pubkey: string;
  kdf: 'PBKDF2';
  iterations: number;
  saltB64: string;
  algo: 'AES-GCM' | 'XCHACHA20-POLY1305';
  ivB64: string;
  ciphertextB64: string;
  version: number;
  timestamp: number;
} | null> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([KEYSTORE_STORE], 'readonly');
    const store = transaction.objectStore(KEYSTORE_STORE);
    const request = store.get(pubkey);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });
};

export const removeEncryptedSecret = async (pubkey: string): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([KEYSTORE_STORE], 'readwrite');
    const store = transaction.objectStore(KEYSTORE_STORE);
    const request = store.delete(pubkey);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
};

// List all encrypted secrets stored in the keystore
export const listEncryptedSecrets = async (): Promise<Array<{ pubkey: string; timestamp: number }>> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([KEYSTORE_STORE], 'readonly');
    const store = transaction.objectStore(KEYSTORE_STORE);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const results = (request.result || []) as Array<{ pubkey: string; timestamp: number }>;
      const simplified = results.map(r => ({ pubkey: (r as any).pubkey, timestamp: (r as any).timestamp || 0 }));
      resolve(simplified.sort((a, b) => b.timestamp - a.timestamp));
    };
  });
};

// Note: ASCII Cache management functions removed - ASCII renderer now renders dynamically