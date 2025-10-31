import type { RelayInfo } from './relayInfo';
import type { RelayPermission } from '../../types/nostr/types';

/**
 * Utility functions for working with relay capabilities and filtering
 */

/**
 * Checks if a relay supports a specific event kind based on its capabilities
 */
export function relaySupportsEventKind(
  _relayUrl: string,
  relayInfo: RelayInfo | undefined,
  eventKind: number
): boolean {
  if (!relayInfo) {
    // If we don't have relay info, assume it supports basic events
    return true;
  }

  // Check if relay has restricted writes
  if (relayInfo.limitation?.restricted_writes) {
    // If relay has restricted writes, check supported NIPs
    const requiredNip = getRequiredNipForEventKind(eventKind);
    if (requiredNip && relayInfo.supported_nips) {
      return relayInfo.supported_nips.includes(requiredNip);
    }
  }

  // If no restrictions or we can't determine, assume it's supported
  return true;
}

/**
 * Gets a summary of relay capabilities for display purposes
 */
export function getRelayCapabilitySummary(
  _relayUrl: string,
  relayInfo: RelayInfo | undefined,
  permission: RelayPermission
): {
  canPublish: boolean;
  restrictions: string[];
  supportedNips: number[];
} {
  const restrictions: string[] = [];
  const supportedNips = relayInfo?.supported_nips || [];

  // Check basic permissions
  if (permission === 'read') {
    return {
      canPublish: false,
      restrictions: ['Read-only relay'],
      supportedNips
    };
  }

  // Check relay limitations
  if (relayInfo?.limitation) {
    if (relayInfo.limitation.auth_required) {
      restrictions.push('Requires authentication');
    }
    if (relayInfo.limitation.payment_required) {
      restrictions.push('Requires payment');
    }
    if (relayInfo.limitation.restricted_writes) {
      restrictions.push('Restricted writes');
    }
    if (relayInfo.limitation.min_pow_difficulty && relayInfo.limitation.min_pow_difficulty > 0) {
      restrictions.push(`Requires ${relayInfo.limitation.min_pow_difficulty} bits PoW`);
    }
  }

  return {
    canPublish: permission === 'write' || permission === 'readwrite' || permission === 'indexer',
    restrictions,
    supportedNips
  };
}

/**
 * Maps event kinds to their required NIP numbers
 * This helps determine if a relay supports the necessary NIP for a specific event kind
 */
function getRequiredNipForEventKind(eventKind: number): number | null {
  switch (eventKind) {
    case 0:   // Metadata - NIP-01 (basic events)
      return 1;
    case 1:   // Text notes - NIP-01 (basic events)
      return 1;
    case 2:   // Recommend relay - NIP-01 (basic events)
      return 1;
    case 3:   // Contacts - NIP-02 (follow lists)
      return 2;
    case 4:   // Encrypted direct messages - NIP-04 (encrypted DMs)
      return 4;
    case 5:   // Event deletion - NIP-09 (event deletion)
      return 9;
    case 6:   // Reposts - NIP-18 (reposts)
      return 18;
    case 7:   // Reactions - NIP-25 (reactions)
      return 25;
    case 40:  // Channel creation - NIP-28 (channels)
      return 28;
    case 41:  // Channel metadata - NIP-28 (channels)
      return 28;
    case 42:  // Channel messages - NIP-28 (channels)
      return 28;
    case 43:  // Hide message - NIP-28 (channels)
      return 28;
    case 44:  // Mute user - NIP-28 (channels)
      return 28;
    case 1984: // Reporting - NIP-56 (reporting)
      return 56;
    case 9735: // Zap receipts - NIP-57 (zaps)
      return 57;
    case 10000: // Mute list - NIP-51 (lists)
      return 51;
    case 10001: // Pin list - NIP-51 (lists)
      return 51;
    case 10002: // Relay list metadata - NIP-65 (relay list metadata)
      return 65;
    case 30000: // Categorized people list - NIP-51 (lists)
      return 51;
    case 30001: // Categorized bookmark list - NIP-51 (lists)
      return 51;
    case 30008: // Badge award - NIP-58 (badges)
      return 58;
    case 30009: // Badge definition - NIP-58 (badges)
      return 58;
    case 30078: // Application-specific data - NIP-78 (application-specific data)
      return 78;
    default:
      // For unknown event kinds, assume NIP-01 (basic events) is required
      return 1;
  }
}

/**
 * Validates if a relay can handle a specific event kind
 * Returns detailed validation results
 */
export function validateRelayForEventKind(
  _relayUrl: string,
  relayInfo: RelayInfo | undefined,
  permission: RelayPermission,
  eventKind: number
): {
  canHandle: boolean;
  reasons: string[];
  warnings: string[];
} {
  const reasons: string[] = [];
  const warnings: string[] = [];

  // Check basic permissions
  if (permission === 'read') {
    reasons.push('Relay is read-only');
    return { canHandle: false, reasons, warnings };
  }

  if (permission !== 'write' && permission !== 'readwrite' && permission !== 'indexer') {
    reasons.push('Relay has no write permissions');
    return { canHandle: false, reasons, warnings };
  }

  // Check relay capabilities if available
  if (relayInfo) {
    if (relayInfo.limitation?.restricted_writes) {
      const requiredNip = getRequiredNipForEventKind(eventKind);
      if (requiredNip && relayInfo.supported_nips) {
        if (!relayInfo.supported_nips.includes(requiredNip)) {
          reasons.push(`Relay does not support NIP-${requiredNip} required for event kind ${eventKind}`);
          return { canHandle: false, reasons, warnings };
        }
      }
    }

    if (relayInfo.limitation?.auth_required) {
      warnings.push('Relay requires authentication');
    }

    if (relayInfo.limitation?.payment_required) {
      warnings.push('Relay requires payment');
    }

    if (relayInfo.limitation?.min_pow_difficulty && relayInfo.limitation.min_pow_difficulty > 0) {
      warnings.push(`Relay requires ${relayInfo.limitation.min_pow_difficulty} bits of PoW`);
    }
  }

  return { canHandle: true, reasons, warnings };
}
