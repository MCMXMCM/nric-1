import { useState, useEffect, useCallback } from 'react';
import { useRelayManager } from './useRelayManager';
import { NostrContext } from '../contexts/NostrContext';
import { useContext } from 'react';

export interface RelayConnectionStatus {
  isConnected: boolean;
  connectedRelays: string[];
  isConnecting: boolean;
  hasMinimumConnections: boolean;
}

/**
 * Hook to monitor relay connection status and ensure minimum connections before allowing operations
 */
export function useRelayConnectionStatus(): RelayConnectionStatus {
  const { nostrClient } = useContext(NostrContext);
  const { relayStatuses, relayUrls } = useRelayManager({
    nostrClient,
    initialRelays: [],
    pubkeyHex: undefined, // We don't need pubkey for connection monitoring
  });

  const [isConnecting, setIsConnecting] = useState(true);
  const [hasMinimumConnections, setHasMinimumConnections] = useState(false);

  // Check if we have minimum required connections
  const checkConnectionStatus = useCallback(() => {
    if (!relayStatuses || relayStatuses.length === 0) {
      setIsConnecting(true);
      setHasMinimumConnections(false);
      return;
    }

    const connectedReadRelays = relayStatuses.filter(
      (status) => status.connected && status.read
    );

    const isConnected = connectedReadRelays.length > 0;
    const hasMinimum = connectedReadRelays.length >= 1; // At least 1 read relay

    setIsConnecting(!isConnected && relayUrls.length > 0);
    setHasMinimumConnections(hasMinimum);
  }, [relayStatuses, relayUrls.length]);

  // Update connection status when relay statuses change
  useEffect(() => {
    checkConnectionStatus();
  }, [checkConnectionStatus]);

  // Monitor connection attempts
  useEffect(() => {
    if (!nostrClient || relayUrls.length === 0) {
      setIsConnecting(false);
      setHasMinimumConnections(false);
      return;
    }

    // If we have relays configured but no connections yet, we're still connecting
    if (relayUrls.length > 0 && relayStatuses.length === 0) {
      setIsConnecting(true);
      setHasMinimumConnections(false);
    }
  }, [nostrClient, relayUrls.length, relayStatuses.length]);

  const connectedRelays = relayStatuses
    ?.filter((status) => status.connected && status.read)
    ?.map((status) => status.url) || [];

  const isConnected = connectedRelays.length > 0;

  return {
    isConnected,
    connectedRelays,
    isConnecting,
    hasMinimumConnections,
  };
}
