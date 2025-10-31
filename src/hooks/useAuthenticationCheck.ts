import { useContext, useMemo } from 'react';
import { NostrContext } from '../contexts/NostrContext';

export interface AuthenticationCheckResult {
  /** Whether the user is authenticated and can sign events */
  isAuthenticated: boolean;
  
  /** Whether the user has NIP-07 extension available */
  hasNip07: boolean;
  
  /** Whether the user has an in-memory secret key */
  hasInMemoryKey: boolean;
  
  /** Whether the user needs to unlock their key */
  needsUnlock: boolean;
  
  /** Whether the user is authenticated for signing operations */
  isAuthenticatedForSigning: boolean;
  
  /** The current pubkey (if available) */
  pubkey: string | null;
}

/**
 * Hook to check authentication status and capabilities
 * Provides a standardized way to check if user can perform authenticated actions
 */
export function useAuthenticationCheck(): AuthenticationCheckResult {
  const { pubkey, nip07Available } = useContext(NostrContext);

  const result = useMemo((): AuthenticationCheckResult => {
    const hasNip07 = Boolean(nip07Available);
    const hasPubkey = Boolean(pubkey);
    
    // Check for in-memory key (this would need to be imported dynamically to avoid circular deps)
    let hasInMemoryKey = false;
    try {
      // We'll check this synchronously for now, but could be improved
      hasInMemoryKey = Boolean(
        typeof window !== 'undefined' && 
        localStorage.getItem('nostrSecretKey') // Simplified check
      );
    } catch {
      hasInMemoryKey = false;
    }

    const isAuthenticated = hasPubkey && (hasNip07 || hasInMemoryKey);
    const needsUnlock = hasPubkey && !hasNip07 && !hasInMemoryKey;
    const isAuthenticatedForSigning = isAuthenticated;

    return {
      isAuthenticated,
      hasNip07,
      hasInMemoryKey,
      needsUnlock,
      isAuthenticatedForSigning,
      pubkey,
    };
  }, [pubkey, nip07Available]);

  return result;
}

/**
 * Simple hook to check if user is authenticated
 * Returns just a boolean for simpler use cases
 */
export function useIsAuthenticated(): boolean {
  const { isAuthenticated } = useAuthenticationCheck();
  return isAuthenticated;
}

/**
 * Hook to check if user can sign events
 * Returns boolean indicating signing capability
 */
export function useCanSign(): boolean {
  const { isAuthenticatedForSigning } = useAuthenticationCheck();
  return isAuthenticatedForSigning;
}
