import '@testing-library/jest-dom'
import { vi, beforeEach } from 'vitest'

// Mock IndexedDB for testing
import 'fake-indexeddb/auto'

// Type declarations for global objects
declare global {
  var crypto: Crypto
}

// Mock crypto.getRandomValues for WebCrypto tests
Object.defineProperty(globalThis, 'crypto', {
  value: {
    getRandomValues: (arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256)
      }
      return arr
    },
    randomUUID: () => {
      // Simple UUID v4 implementation for testing
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0
        const v = c === 'x' ? r : (r & 0x3 | 0x8)
        return v.toString(16)
      })
    },
    subtle: {
      importKey: vi.fn(),
      deriveKey: vi.fn(), 
      encrypt: vi.fn(),
      decrypt: vi.fn()
    }
  }
})

// Mock btoa/atob for base64 operations (jsdom usually provides these)
// Use simple fallbacks if not available
if (typeof globalThis.btoa === 'undefined') {
  globalThis.btoa = (str: string) => str
}
if (typeof globalThis.atob === 'undefined') {
  globalThis.atob = (str: string) => str
}

// Mock localStorage and sessionStorage
const createStorageMock = () => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
    get length() {
      return Object.keys(store).length
    },
    key: (index: number) => Object.keys(store)[index] || null
  }
}

Object.defineProperty(window, 'localStorage', { value: createStorageMock() })
Object.defineProperty(window, 'sessionStorage', { value: createStorageMock() })

// Mock window.nostr for NIP-07 testing
Object.defineProperty(window, 'nostr', {
  value: undefined,
  writable: true
})

// Mock custom events
window.dispatchEvent = vi.fn()
window.addEventListener = vi.fn()
window.removeEventListener = vi.fn()

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock ResizeObserver
if (!globalThis.ResizeObserver) {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    value: vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    })),
    writable: true,
    configurable: true
  })
}

// Mock window.scrollTo
Object.defineProperty(window, 'scrollTo', {
  value: vi.fn(),
  writable: true
})

// Clean up between tests
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  ;(window as any).nostr = undefined
  vi.clearAllMocks()
})
