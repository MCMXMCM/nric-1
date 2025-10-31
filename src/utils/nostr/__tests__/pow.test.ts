import { describe, it, expect } from 'vitest'

import {
  countLeadingZeroBits,
  computeEventIdHex,
  minePowForEventBase,
  type EventBaseForPow,
} from '../../nostr/pow'

function makeBase(overrides?: Partial<EventBaseForPow>): EventBaseForPow {
  return {
    pubkey: 'f'.repeat(64),
    kind: 1,
    created_at: 1_700_000_000,
    tags: [],
    content: 'hello world',
    ...overrides,
  }
}

describe('pow utility', () => {
  it('counts leading zero bits correctly (32-bit block granularity)', () => {
    // Leading 32 zero bits
    expect(countLeadingZeroBits('00000000' + 'f'.repeat(56))).toBe(32)
    // Leading 31 zero bits (0x00000001)
    expect(countLeadingZeroBits('00000001' + 'f'.repeat(56))).toBe(31)
    // Leading 4 zero bits (0x0fffffff)
    expect(countLeadingZeroBits('0fffffff' + 'f'.repeat(56))).toBe(4)
    // Leading 3 zero bits (0x1fffffff)
    expect(countLeadingZeroBits('1fffffff' + 'f'.repeat(56))).toBe(3)
  })

  it('computes event id deterministically from base fields', () => {
    const base = makeBase()
    const id1 = computeEventIdHex(base)
    const id2 = computeEventIdHex({ ...base })
    expect(id1).toEqual(id2)
    expect(id1).toMatch(/^[0-9a-f]{64}$/)
  })

  it('mines a nonce to reach a low difficulty target quickly', async () => {
    const targetBits = 10 // keep low for test speed
    const base = makeBase()
    const mined = await minePowForEventBase(base, targetBits)
    // ensure nonce tag present and correctly formatted
    const nonceTag = mined.tags.find(t => t[0] === 'nonce')
    expect(nonceTag).toBeTruthy()
    expect(nonceTag && nonceTag[1]).toMatch(/^[0-9]+$/)
    expect(nonceTag && Number(nonceTag[2])).toBe(targetBits)

    const id = computeEventIdHex(mined)
    expect(countLeadingZeroBits(id)).toBeGreaterThanOrEqual(targetBits)
  })

  it('preserves existing tags and only adds/updates nonce', async () => {
    const base = makeBase({
      tags: [
        ['p', 'abcdef'.padEnd(64, '0')],
        ['client', 'NRIC-1'],
      ],
    })
    const mined = await minePowForEventBase(base, 8)
    expect(mined.tags.some(t => t[0] === 'p')).toBe(true)
    expect(mined.tags.some(t => t[0] === 'client')).toBe(true)
    expect(mined.tags.some(t => t[0] === 'nonce')).toBe(true)
    // Other tags remain in order; nonce can be anywhere (usually appended)
    const withoutNonce = mined.tags.filter(t => t[0] !== 'nonce')
    expect(withoutNonce).toEqual(base.tags)
  })

  it('aborts immediately if signal is already aborted', async () => {
    const ac = new AbortController()
    ac.abort()
    await expect(minePowForEventBase(makeBase(), 12, { signal: ac.signal })).rejects.toThrow('aborted')
  })
})


