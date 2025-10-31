/**
 * NIP-05 verification utilities
 * https://github.com/nostr-protocol/nips/blob/master/05.md
 */

export interface Nip05VerificationResult {
  isVerified: boolean;
  error?: string;
  relays?: string[];
}

export interface Nip05WellKnownResponse {
  names: Record<string, string>; // name -> hex pubkey
  relays?: Record<string, string[]>; // hex pubkey -> relay URLs
}

/**
 * Verifies a NIP-05 identifier against a given pubkey
 * @param nip05Identifier - The NIP-05 identifier (e.g., "bob@example.com")
 * @param pubkeyHex - The hex-encoded public key to verify against
 * @returns Promise resolving to verification result
 */
export async function verifyNip05(
  nip05Identifier: string,
  pubkeyHex: string
): Promise<Nip05VerificationResult> {
  try {
    // Parse the NIP-05 identifier
    const parsed = parseNip05Identifier(nip05Identifier);
    if (!parsed) {
      return { isVerified: false, error: 'Invalid NIP-05 identifier format' };
    }

    const { localPart, domain } = parsed;

    // Fetch the .well-known/nostr.json file
    const response = await fetchNostrWellKnown(domain, localPart);

    if (!response) {
      return { isVerified: false, error: 'Failed to fetch .well-known/nostr.json' };
    }

    // Check if the name exists and matches the pubkey
    // Try case-sensitive first, then case-insensitive lookup
    let expectedPubkey = response.names[localPart];
    if (!expectedPubkey) {
      // Try case-insensitive lookup for the local part
      const lowerLocalPart = localPart.toLowerCase();
      const foundKey = Object.keys(response.names).find(key => key.toLowerCase() === lowerLocalPart);
      if (foundKey) {
        expectedPubkey = response.names[foundKey];
      }
    }
    
    if (!expectedPubkey) {
      return { isVerified: false, error: 'Name not found in .well-known/nostr.json' };
    }

    // Normalize both pubkeys to lowercase hex (remove any 0x prefix if present)
    const normalizeHexPubkey = (pubkey: string): string => {
      return pubkey.toLowerCase().replace(/^0x/, '');
    };
    
    const normalizedExpected = normalizeHexPubkey(expectedPubkey);
    const normalizedActual = normalizeHexPubkey(pubkeyHex);
    const isVerified = normalizedExpected === normalizedActual;

    // Extract relays if available and verification succeeded
    const relays = isVerified ? (response.relays?.[normalizedActual] || response.relays?.[normalizedExpected] || []) : undefined;

    return {
      isVerified,
      relays,
      error: isVerified ? undefined : 'Pubkey does not match'
    };
  } catch (error) {
    console.error('NIP-05 verification error:', error);
    return {
      isVerified: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Parses a NIP-05 identifier into local part and domain
 * @param identifier - The NIP-05 identifier
 * @returns Parsed identifier or null if invalid
 */
export function parseNip05Identifier(identifier: string): { localPart: string; domain: string } | null {
  if (!identifier || typeof identifier !== 'string') {
    return null;
  }

  const trimmed = identifier.trim();

  // Handle the special case of _@domain (root identifier)
  if (trimmed.startsWith('_@')) {
    const domain = trimmed.slice(2);
    if (isValidDomain(domain)) {
      return { localPart: '_', domain };
    }
    return null;
  }

  // Split at the last @ to handle multiple @ symbols
  const lastAtIndex = trimmed.lastIndexOf('@');
  if (lastAtIndex === -1 || lastAtIndex === 0 || lastAtIndex === trimmed.length - 1) {
    return null;
  }

  const localPart = trimmed.slice(0, lastAtIndex);
  const domain = trimmed.slice(lastAtIndex + 1);

  // Validate local part (should be a-z0-9-_. case-insensitive, and can contain @)
  if (!/^[a-zA-Z0-9-_.@]+$/.test(localPart)) {
    return null;
  }

  if (!isValidDomain(domain)) {
    return null;
  }

  return { localPart, domain };
}

/**
 * Fetches the .well-known/nostr.json file for a domain
 * @param domain - The domain to fetch from
 * @param name - The name to query (for query parameter)
 * @returns The well-known response or null if failed
 */
async function fetchNostrWellKnown(domain: string, name: string): Promise<Nip05WellKnownResponse | null> {
  // Generate list of domains to try
  const domainsToTry = [
    domain, // Original domain first
  ];
  
  // Add www variant if not already present
  if (!domain.startsWith('www.')) {
    domainsToTry.push(`www.${domain}`);
  } else {
    // If domain starts with www, also try without it
    domainsToTry.push(domain.replace(/^www\./, ''));
  }

  let lastError: Error | null = null;

  // Try each domain variation
  for (const tryDomain of domainsToTry) {
    try {
      const url = `https://${tryDomain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`;

      let response: Response;
      
      try {
        // Try direct fetch first
        response = await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
          // Don't follow redirects as per NIP-05 spec
          redirect: 'error',
          // Add timeout to prevent hanging requests
          signal: AbortSignal.timeout(10000), // 10 second timeout
        });
      } catch (corsError) {
        // If direct fetch fails (likely due to CORS), try with a CORS proxy

        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
        
        response = await fetch(proxyUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
          signal: AbortSignal.timeout(15000), // Longer timeout for proxy
        });
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Check content type if headers are available
      if (response.headers && typeof response.headers.get === 'function') {
        const contentType = response.headers.get('content-type');
        if (contentType && !contentType.includes('application/json')) {
          console.warn('NIP-05: Unexpected content type', { contentType });
        }
      }

      const data = await response.json();

      // Validate the response structure
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid JSON response');
      }

      if (!data.names || typeof data.names !== 'object') {
        throw new Error('Missing or invalid "names" field');
      }

      // Optional relays validation
      if (data.relays && typeof data.relays !== 'object') {
        throw new Error('Invalid "relays" field');
      }

      return data as Nip05WellKnownResponse;

    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      console.warn(`NIP-05: Failed to fetch from ${tryDomain}:`, error);
      // Continue to next domain variant
    }
  }

  // If we get here, all domains failed
  console.error(`Failed to fetch .well-known/nostr.json for ${domain} (tried: ${domainsToTry.join(', ')}):`, lastError);
  
  // Re-throw the last error
  if (lastError) {
    throw lastError;
  }
  throw new Error('Failed to fetch .well-known/nostr.json');
}

/**
 * Validates if a string is a valid domain name
 * @param domain - The domain to validate
 * @returns True if valid domain
 */
function isValidDomain(domain: string): boolean {
  if (!domain || typeof domain !== 'string') {
    return false;
  }

  const trimmed = domain.trim().toLowerCase();

  // Basic domain validation regex
  // Allows subdomains, but requires at least one dot
  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  return domainRegex.test(trimmed) && trimmed.includes('.');
}
