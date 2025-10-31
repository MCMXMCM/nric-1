import { useMemo } from 'react'
import { getGlobalRelayPool } from '../utils/nostr/relayConnectionPool'
import { useUIStore } from '../components/lib/useUIStore'
import type { RelayPermission } from '../types/nostr/types'

/**
 * Hook that provides the appropriate relay pool based on outbox mode setting
 * Returns OutboxNPool when outbox mode is enabled, otherwise returns standard NPool
 */
export function useAdaptiveRelayPool(relayUrls: string[], relayPermissions?: Map<string, RelayPermission>) {
  const outboxMode = useUIStore((s) => s.outboxMode)
  
  return useMemo(() => {
    // Unify on global pool to avoid duplicate connection strategies
    console.log(outboxMode ? '📦 Outbox mode ON - using unified global pool' : '🔌 Outbox mode OFF - using unified global pool')
    return getGlobalRelayPool()
  }, [outboxMode, relayUrls, relayPermissions])
}
