/**
 * Mock utilities for Nostr testing
 */
import { vi } from 'vitest'

// Mock key pairs for testing
export const TEST_KEYS = {
  // Valid test keys - these are throwaway keys for testing only
  privateKey: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  publicKey: '02d5eba4c3e6b1a8e7a53aa8a1c9f9b4e2c7d4e1f8a9c6b3d0e7f4a1b8c5e2f9',
  nsec: 'nsec1zg69v7ys40x77y352eufp27daufrg4ncjz4ummcjx3t83y9tehhsv02a36',
  npub: 'npub1qt0whf8rw6e33n8x222c5w7nkn3v0480rzw5vweaxhu6rxuvuuch7prxwc'
}

export const createMockNip07Extension = () => ({
  getPublicKey: vi.fn().mockResolvedValue(TEST_KEYS.publicKey),
  signEvent: vi.fn().mockImplementation(async (event: any) => ({
    ...event,
    id: 'mock-event-id-' + Date.now(),
    pubkey: TEST_KEYS.publicKey,
    sig: 'mock-signature-' + Math.random().toString(36).substring(2)
  }))
})

export const mockNip07Available = () => {
  (window as any).nostr = createMockNip07Extension()
}

export const mockNip07Unavailable = () => {
  (window as any).nostr = undefined
}

// Mock SimplePool for testing
export class MockSimplePool {
  querySync = vi.fn().mockResolvedValue([])
  publish = vi.fn().mockResolvedValue(undefined)
  subscribeMany = vi.fn().mockReturnValue({ close: vi.fn() })
  ensureRelay = vi.fn().mockResolvedValue(undefined)
  destroy = vi.fn()
  close = vi.fn()
}

// Mock crypto operations
export const mockWebCrypto = {
  getRandomValues: vi.fn((arr: Uint8Array) => {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = Math.floor(Math.random() * 256)
    }
    return arr
  }),
  subtle: {
    importKey: vi.fn().mockResolvedValue({} as CryptoKey),
    deriveKey: vi.fn().mockResolvedValue({} as CryptoKey),
    encrypt: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
    decrypt: vi.fn().mockResolvedValue(new ArrayBuffer(64))
  }
}

export const setupMockWebCrypto = () => {
  Object.defineProperty(window, 'crypto', {
    value: mockWebCrypto,
    writable: true
  })
}
