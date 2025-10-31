import { nip11 } from 'nostr-tools';

export interface RelayInfo {
  name?: string;
  description?: string;
  banner?: string;
  icon?: string;
  pubkey?: string;
  contact?: string;
  supported_nips?: number[];
  software?: string;
  version?: string;
  privacy_policy?: string;
  terms_of_service?: string;
  limitation?: RelayLimitation;
  retention?: RelayRetention[];
  relay_countries?: string[];
  language_tags?: string[];
  tags?: string[];
  posting_policy?: string;
  payments_url?: string;
  fees?: RelayFees;
}

export interface RelayLimitation {
  max_message_length?: number;
  max_subscriptions?: number;
  max_limit?: number;
  max_subid_length?: number;
  max_event_tags?: number;
  max_content_length?: number;
  min_pow_difficulty?: number;
  auth_required?: boolean;
  payment_required?: boolean;
  restricted_writes?: boolean;
  created_at_lower_limit?: number;
  created_at_upper_limit?: number;
  default_limit?: number;
}

export interface RelayRetention {
  kinds?: number[] | number[][];
  time?: number;
  count?: number;
}

export interface RelayFees {
  admission?: RelayFee[];
  subscription?: RelayFee[];
  publication?: RelayFee[];
}

export interface RelayFee {
  amount: number;
  unit: string;
  period?: number;
  kinds?: number[];
}

export interface RelayInfoResult {
  info: RelayInfo | null;
  error?: string;
  cached?: boolean;
}

// Cache for relay information to avoid repeated HTTP requests
const relayInfoCache = new Map<string, { info: RelayInfo; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Fetches relay information document using NIP-11
 * @param relayUrl - The relay WebSocket URL
 * @param useCache - Whether to use cached data (default: true)
 * @returns Promise with relay information or error
 */
export async function fetchRelayInfo(
  relayUrl: string, 
  useCache: boolean = true
): Promise<RelayInfoResult> {
  try {
    // Convert WebSocket URL to HTTP URL
    const httpUrl = relayUrl.replace('ws://', 'http://').replace('wss://', 'https://');
    
    // Check cache first
    if (useCache) {
      const cached = relayInfoCache.get(relayUrl);
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return { info: cached.info, cached: true };
      }
    }

    // Fetch with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    try {
      const info = await nip11.fetchRelayInformation(httpUrl);

      clearTimeout(timeoutId);

      // Cache the result
      if (useCache) {
        relayInfoCache.set(relayUrl, {
          info: info as RelayInfo,
          timestamp: Date.now()
        });
      }

      return { info: info as RelayInfo };
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  } catch (error) {
    console.warn(`Failed to fetch relay info for ${relayUrl}:`, error);
    return { 
      info: null, 
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Fetches relay information for multiple relays in parallel
 * @param relayUrls - Array of relay URLs
 * @param useCache - Whether to use cached data
 * @returns Map of relay URL to RelayInfoResult
 */
export async function fetchMultipleRelayInfo(
  relayUrls: string[],
  useCache: boolean = true
): Promise<Map<string, RelayInfoResult>> {
  const results = new Map<string, RelayInfoResult>();
  
  // Fetch all relay info in parallel with concurrency limit
  const BATCH_SIZE = 5;
  for (let i = 0; i < relayUrls.length; i += BATCH_SIZE) {
    const batch = relayUrls.slice(i, i + BATCH_SIZE);
    const batchPromises = batch.map(async (url) => {
      const result = await fetchRelayInfo(url, useCache);
      return { url, result };
    });
    
    const batchResults = await Promise.allSettled(batchPromises);
    
    batchResults.forEach((settled) => {
      if (settled.status === 'fulfilled') {
        results.set(settled.value.url, settled.value.result);
      } else {
        // Handle failed requests
        const url = batch[results.size % BATCH_SIZE];
        results.set(url, { info: null, error: 'Request failed' });
      }
    });
  }
  
  return results;
}

/**
 * Gets a user-friendly display name for a relay
 * @param relayUrl - The relay URL
 * @param relayInfo - Optional relay information
 * @returns Display name (relay name, domain, or URL)
 */
export function getRelayDisplayName(relayUrl: string, relayInfo?: RelayInfo): string {
  if (relayInfo?.name) {
    return relayInfo.name;
  }
  
  try {
    const url = new URL(relayUrl.replace('ws://', 'http://').replace('wss://', 'https://'));
    return url.hostname;
  } catch {
    return relayUrl;
  }
}

/**
 * Determines if a relay requires authentication
 * @param relayInfo - Relay information
 * @returns True if authentication is required
 */
export function requiresAuth(relayInfo?: RelayInfo): boolean {
  return relayInfo?.limitation?.auth_required === true;
}

/**
 * Determines if a relay requires payment
 * @param relayInfo - Relay information
 * @returns True if payment is required
 */
export function requiresPayment(relayInfo?: RelayInfo): boolean {
  return relayInfo?.limitation?.payment_required === true;
}

/**
 * Gets the minimum PoW difficulty required by a relay
 * @param relayInfo - Relay information
 * @returns Minimum PoW difficulty or undefined
 */
export function getMinPowDifficulty(relayInfo?: RelayInfo): number | undefined {
  return relayInfo?.limitation?.min_pow_difficulty;
}

/**
 * Gets relay limitations as a human-readable summary
 * @param relayInfo - Relay information
 * @returns Array of limitation descriptions
 */
export function getRelayLimitations(relayInfo?: RelayInfo): string[] {
  const limitations: string[] = [];
  const limit = relayInfo?.limitation;
  
  if (!limit) return limitations;
  
  if (limit.auth_required) limitations.push('Requires authentication');
  if (limit.payment_required) limitations.push('Requires payment');
  if (limit.restricted_writes) limitations.push('Restricted writes');
  if (limit.min_pow_difficulty && limit.min_pow_difficulty > 0) {
    limitations.push(`Requires ${limit.min_pow_difficulty} bits of PoW`);
  }
  
  return limitations;
}

/**
 * Clears the relay info cache
 */
export function clearRelayInfoCache(): void {
  relayInfoCache.clear();
}

/**
 * Clears cached info for a specific relay
 * @param relayUrl - The relay URL to clear from cache
 */
export function clearRelayInfoCacheForRelay(relayUrl: string): void {
  relayInfoCache.delete(relayUrl);
}
