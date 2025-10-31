import { nip11 } from 'nostr-tools'
import { relayFailureLearning } from './relayFailureLearning'

export function readUserPowOverride(): number | undefined {
  try {
    if (typeof window === 'undefined') return undefined
    const raw = window.localStorage.getItem('nostree.powTargetBits')
    if (!raw) return undefined
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined
  } catch {
    return undefined
  }
}

export function readPowEnabled(): boolean {
  try {
    if (typeof window === 'undefined') return false
    const raw = window.localStorage.getItem('nostree.powEnabled')
    return raw === '1' || raw === 'true'
  } catch {
    return false
  }
}

export function writePowEnabled(enabled: boolean): void {
  try {
    if (typeof window === 'undefined') return
    if (enabled) window.localStorage.setItem('nostree.powEnabled', '1')
    else window.localStorage.removeItem('nostree.powEnabled')
  } catch {
    // ignore
  }
}

export function writeUserPowOverride(bits: number | null): void {
  try {
    if (typeof window === 'undefined') return
    if (bits && bits > 0) window.localStorage.setItem('nostree.powTargetBits', String(Math.floor(bits)))
    else window.localStorage.removeItem('nostree.powTargetBits')
  } catch {
    // ignore
  }
}

export function parsePowFromRelayInfo(info: any): number | undefined {
  console.log("🎯 POW CONFIG: parsePowFromRelayInfo called with:", info);
  if (!info || typeof info !== 'object') {
    console.log("🎯 POW CONFIG: Invalid info object");
    return undefined;
  }
  // Common places/keys relays may use
  const candidates: Array<unknown> = []
  candidates.push(info.nip13)
  candidates.push(info.pow)
  candidates.push(info.difficulty)
  candidates.push(info.target_pow)
  if (info.limitation && typeof info.limitation === 'object') {
    candidates.push(info.limitation.nip13)
    candidates.push(info.limitation.pow)
    candidates.push(info.limitation.difficulty)
    candidates.push(info.limitation.target_pow)
  }
  console.log("🎯 POW CONFIG: Candidates:", candidates);
  const nums = candidates
    .map((v) => (typeof v === 'string' ? Number(v) : v))
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0)
    .map((v) => Math.floor(v))
  console.log("🎯 POW CONFIG: Filtered nums:", nums);
  if (nums.length === 0) {
    console.log("🎯 POW CONFIG: No valid numbers found");
    return undefined;
  }
  // Return the maximum requirement
  const result = nums.reduce((a, b) => (a > b ? a : b), 0);
  console.log("🎯 POW CONFIG: Final result:", result);
  return result;
}

export async function determinePowTargetBits(
  relayUrls: string[], 
  options?: { defaultBits?: number; relayInfoMap?: Map<string, any> }
): Promise<number | undefined> {
  console.log("🎯 POW CONFIG: determinePowTargetBits called with relays:", relayUrls);
  console.log("🎯 POW CONFIG: relayInfoMap provided:", options?.relayInfoMap ? "yes" : "no");
  const enabled = readPowEnabled()
  const override = readUserPowOverride()
  console.log("🎯 POW CONFIG: enabled=", enabled, "override=", override);
  if (enabled && override && override > 0) {
    const cappedOverride = Math.min(override, 24) // Cap user override at 24 bits
    if (override > 24) {
      console.log(`🎯 POW CONFIG: Capped user override from ${override} to ${cappedOverride} bits for performance`)
    }
    console.log("🎯 POW CONFIG: Using user override:", cappedOverride);
    return cappedOverride
  }
  
  // First, check learned requirements from previous failures
  const learnedPowBits = relayFailureLearning.getMaxPowRequirement(relayUrls);
  if (learnedPowBits > 0) {
    console.log("🎯 POW CONFIG: Using learned requirements:", learnedPowBits, "bits");
    return Math.min(learnedPowBits, 24);
  }

  // If we have relay info map, use it to determine PoW requirements
  if (options?.relayInfoMap && options.relayInfoMap.size > 0) {
    console.log("🎯 POW CONFIG: Using relay info map to determine PoW requirements");
    const bits: number[] = [];
    
    for (const url of relayUrls) {
      const relayInfo = options.relayInfoMap.get(url);
      if (relayInfo) {
        const powBits = parsePowFromRelayInfo(relayInfo);
        console.log(`🎯 POW CONFIG: Relay ${url} requires ${powBits} bits`);
        if (powBits && powBits > 0) {
          bits.push(powBits);
        }
      }
    }
    
    if (bits.length > 0) {
      const maxBits = Math.max(...bits);
      const cappedBits = Math.min(maxBits, 24);
      console.log("🎯 POW CONFIG: Using relay info - maxBits=", maxBits, "cappedBits=", cappedBits);
      return cappedBits;
    }
  }
  
  
  // Use 16 bits as default instead of 24 (24 bits = 16.7M attempts, too slow)
  // 16 bits = ~65K attempts, should complete in ~1-2 seconds at reasonable hash rates
  // IMPORTANT: Default fallback should apply even when the custom toggle is OFF
  // (OFF disables the override, not auto-detection/mining entirely)
  const defaultBits = (options?.defaultBits ?? 16)
  console.log("🎯 POW CONFIG: defaultBits=", defaultBits);
  if (!Array.isArray(relayUrls) || relayUrls.length === 0) {
    console.log("🎯 POW CONFIG: No relays provided, returning defaultBits:", defaultBits);
    return defaultBits;
  }
  try {
    const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> => {
      return new Promise<T>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('nip11-timeout')), ms)
        p.then((v) => { clearTimeout(t); resolve(v) }, (e) => { clearTimeout(t); reject(e) })
      })
    }
    console.log("🎯 POW CONFIG: Fetching relay info for:", relayUrls);
    const results = await Promise.allSettled(
      relayUrls.map((url) => withTimeout(
        nip11.fetchRelayInformation(url.replace('ws://', 'http://').replace('wss://', 'https://')),
        3000
      ))
    )
    console.log("🎯 POW CONFIG: Relay info results:", results.map((r, i) => ({
      url: relayUrls[i],
      status: r.status,
      value: r.status === 'fulfilled' ? r.value : null,
      error: r.status === 'rejected' ? r.reason : null
    })));
    
    const bits: number[] = []
    for (const r of results) {
      if (r.status === 'fulfilled') {
        const b = parsePowFromRelayInfo(r.value)
        console.log("🎯 POW CONFIG: Parsed PoW bits from relay info:", b);
        if (b && b > 0) bits.push(b)
      }
    }
    console.log("🎯 POW CONFIG: Collected bits:", bits);
    if (bits.length === 0) {
      console.log("🎯 POW CONFIG: No bits found, returning defaultBits:", defaultBits);
      return defaultBits;
    }
    // Use the maximum across candidate relays, but cap at 24 bits for compatibility
    const maxBits = bits.reduce((a, b) => (a > b ? a : b), 0)
    const cappedBits = Math.min(maxBits, 24) // Cap relay requirements at 24 bits
    console.log("🎯 POW CONFIG: maxBits=", maxBits, "cappedBits=", cappedBits);
    if (maxBits > 24) {
      console.log(`🎯 POW CONFIG: Capped relay requirement from ${maxBits} to ${cappedBits} bits for performance`)
    }
    return cappedBits
  } catch {
    return defaultBits
  }
}

