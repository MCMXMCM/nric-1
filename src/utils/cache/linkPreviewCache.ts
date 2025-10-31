import type { LinkMetadata } from "../linkPreview";
import { buildLinkMetadata, extractNonMediaUrls } from "../linkPreview";

/**
 * Link Preview Cache
 * Manages caching of link preview metadata with TTL and persistence
 */

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

interface CachedLinkMetadata extends LinkMetadata {
  cachedAt: number;
}

/**
 * In-memory cache for quick access
 */
const memoryCache = new Map<string, CachedLinkMetadata>();

/**
 * Check if cached metadata is still valid
 */
function isCacheValid(cached: CachedLinkMetadata): boolean {
  const age = Date.now() - cached.cachedAt;
  return age < CACHE_TTL;
}

/**
 * Get cached metadata from IndexedDB
 */
async function getCachedFromIndexedDB(url: string): Promise<CachedLinkMetadata | null> {
  try {
    const db = await openLinkPreviewDB();
    const transaction = db.transaction("linkPreviews", "readonly");
    const store = transaction.objectStore("linkPreviews");
    
    return new Promise((resolve, reject) => {
      const request = store.get(url);
      request.onsuccess = () => {
        const result = request.result as CachedLinkMetadata | undefined;
        resolve(result || null);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn("Error reading link preview cache from IndexedDB:", error);
    return null;
  }
}

/**
 * Save metadata to IndexedDB
 */
async function saveCacheToIndexedDB(url: string, metadata: CachedLinkMetadata): Promise<void> {
  try {
    const db = await openLinkPreviewDB();
    const transaction = db.transaction("linkPreviews", "readwrite");
    const store = transaction.objectStore("linkPreviews");
    
    return new Promise((resolve, reject) => {
      const request = store.put(metadata, url);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn("Error saving link preview cache to IndexedDB:", error);
  }
}

/**
 * Open or create IndexedDB database for link previews
 */
let dbInstance: IDBDatabase | null = null;

async function openLinkPreviewDB(): Promise<IDBDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open("nostree-link-preview", 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      if (!db.objectStoreNames.contains("linkPreviews")) {
        db.createObjectStore("linkPreviews");
      }
    };
  });
}

/**
 * Get link metadata with caching
 * Checks memory cache -> IndexedDB -> network in that order
 */
export async function getCachedLinkMetadata(url: string): Promise<LinkMetadata | null> {
  try {
    // Check memory cache first
    const memoryCached = memoryCache.get(url);
    if (memoryCached && isCacheValid(memoryCached)) {
      return memoryCached;
    }

    // Check IndexedDB
    const dbCached = await getCachedFromIndexedDB(url);
    if (dbCached && isCacheValid(dbCached)) {
      // Restore to memory cache
      memoryCache.set(url, dbCached);
      return dbCached;
    }

    // Fetch from network
    const fresh = await buildLinkMetadata(url);
    if (fresh) {
      const cached: CachedLinkMetadata = {
        ...fresh,
        cachedAt: Date.now(),
      };

      // Store in both caches
      memoryCache.set(url, cached);
      await saveCacheToIndexedDB(url, cached);

      return fresh;
    }

    return null;
  } catch (error) {
    console.error("Error getting cached link metadata:", error);
    return null;
  }
}

/**
 * Clear link preview cache
 */
export async function clearLinkPreviewCache(): Promise<void> {
  try {
    // Clear memory cache
    memoryCache.clear();

    // Clear IndexedDB
    const db = await openLinkPreviewDB();
    const transaction = db.transaction("linkPreviews", "readwrite");
    const store = transaction.objectStore("linkPreviews");

    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("Error clearing link preview cache:", error);
  }
}

/**
 * Extract and cache link previews for all non-media URLs in text
 * Returns a map of URL -> LinkMetadata
 */
export async function extractAndCacheLinkPreviews(
  text: string
): Promise<Map<string, LinkMetadata | null>> {
  const urls = extractNonMediaUrls(text);
  const results = new Map<string, LinkMetadata | null>();

  // Fetch all in parallel
  const promises = urls.map(async (url) => {
    const metadata = await getCachedLinkMetadata(url);
    results.set(url, metadata);
  });

  await Promise.all(promises);

  return results;
}

/**
 * Get cache statistics for debugging
 */
export function getCacheStats(): {
  memorySize: number;
  urls: string[];
} {
  return {
    memorySize: memoryCache.size,
    urls: Array.from(memoryCache.keys()),
  };
}
