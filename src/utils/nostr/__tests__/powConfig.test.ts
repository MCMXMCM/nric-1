import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parsePowFromRelayInfo, readUserPowOverride, writeUserPowOverride, determinePowTargetBits, writePowEnabled } from '../../nostr/powConfig'

describe('powConfig', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      localStorage: {
        _map: new Map<string, string>(),
        getItem(k: string) { return (this._map.get(k) ?? null) as any },
        setItem(k: string, v: string) { this._map.set(k, v) },
        removeItem(k: string) { this._map.delete(k) },
      },
      matchMedia: () => ({ matches: false }),
      navigator: {},
    } as any)
  })

  it('parses pow fields from relay info', () => {
    expect(parsePowFromRelayInfo({})).toBeUndefined()
    expect(parsePowFromRelayInfo({ nip13: 20 })).toBe(20)
    expect(parsePowFromRelayInfo({ limitation: { difficulty: '23' } })).toBe(23)
    expect(parsePowFromRelayInfo({ pow: 5, target_pow: 15 })).toBe(15)
  })

  it('reads/writes user override in localStorage', () => {
    expect(readUserPowOverride()).toBeUndefined()
    writeUserPowOverride(24)
    expect(readUserPowOverride()).toBe(24)
    writeUserPowOverride(null)
    expect(readUserPowOverride()).toBeUndefined()
  })

  it('falls back to default when enabled and no relays (16 by default)', async () => {
    writePowEnabled(true)
    const bits = await determinePowTargetBits([], {})
    expect(bits).toBe(16)
  })
})


