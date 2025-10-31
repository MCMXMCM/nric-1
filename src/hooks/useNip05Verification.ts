import { useQuery } from '@tanstack/react-query';
import { verifyNip05, type Nip05VerificationResult } from '../utils/nostr/nip05';
import { CACHE_KEYS } from '../utils/cacheKeys';

/**
 * Hook to verify NIP-05 identifiers for user profiles
 * @param nip05Identifier - The NIP-05 identifier to verify
 * @param pubkeyHex - The hex-encoded public key to verify against
 * @returns Verification state and result
 */
export const useNip05Verification = (
  nip05Identifier: string | undefined,
  pubkeyHex: string | undefined
) => {
  const {
    data: verificationResult,
    isLoading: isVerifying,
    error: verificationError,
    refetch: refetchVerification,
  } = useQuery<Nip05VerificationResult>({
    queryKey: CACHE_KEYS.NIP05_VERIFICATION(nip05Identifier || '', pubkeyHex || ''),
    enabled: Boolean(nip05Identifier && pubkeyHex && nip05Identifier.trim() !== ''),
    queryFn: async () => {
      if (!nip05Identifier || !pubkeyHex) {
        return { isVerified: false, error: 'Missing identifier or pubkey' };
      }
      return await verifyNip05(nip05Identifier, pubkeyHex);
    },
    // Cache verification results for 30 minutes (NIP-05 shouldn't change frequently)
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000, // Keep in cache for 1 hour
    // Don't retry on failure - NIP-05 verification failures are usually permanent
    retry: false,
    // Refetch on window focus in case the user updated their NIP-05
    refetchOnWindowFocus: true,
  });

  return {
    isVerified: verificationResult?.isVerified ?? false,
    isVerifying,
    verificationError: verificationError?.message || verificationResult?.error,
    relays: verificationResult?.relays,
    refetchVerification,
  };
};
