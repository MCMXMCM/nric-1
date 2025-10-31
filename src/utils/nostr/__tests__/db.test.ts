/**
 * Regression tests for database operations
 * 
 * These tests ensure critical database functionality continues
 * to work correctly across future changes.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  initDB,
  storeEncryptedSecret,
  getEncryptedSecret,
  removeEncryptedSecret,
  listEncryptedSecrets
} from '../db'
// Note: Contact type import removed - using TanStack Query for contact caching instead
import { TEST_KEYS } from '../../../test/mocks/nostr'

describe('Database Initialization', () => {
  it('should initialize database successfully', async () => {
    const db = await initDB()
    expect(db).toBeDefined()
    expect(db.name).toBe('nostr-feed')
  })

  it('should handle multiple initialization calls', async () => {
    const db1 = await initDB()
    const db2 = await initDB()
    expect(db1).toBe(db2) // Should return same instance
  })
})

// Note: Note Operations tests removed - using TanStack Query for note caching instead

// Note: Contact Operations tests removed - using TanStack Query for contact caching instead

// Metadata Operations removed - now handled by TanStack Query persistence

// Note: Cache Management tests removed - using TanStack Query for caching instead

// Note: Zap Totals Operations tests removed - using TanStack Query for zap totals caching instead

describe('Encrypted Secret Storage', () => {
  beforeEach(async () => {
    const db = await initDB()
    const transaction = db.transaction(['keystore'], 'readwrite')
    transaction.objectStore('keystore').clear()
  })

  const createTestSecretRecord = () => ({
    pubkey: TEST_KEYS.publicKey,
    kdf: 'PBKDF2' as const,
    iterations: 250000,
    saltB64: 'dGVzdC1zYWx0',
    algo: 'AES-GCM' as const,
    ivB64: 'dGVzdC1pdg==',
    ciphertextB64: 'dGVzdC1jaXBoZXJ0ZXh0',
    version: 1,
    timestamp: Date.now()
  })

  it('should store and retrieve encrypted secret', async () => {
    const record = createTestSecretRecord()

    await storeEncryptedSecret(record)
    const retrieved = await getEncryptedSecret(record.pubkey)

    expect(retrieved).toEqual(record)
  })

  it('should return null for non-existent pubkey', async () => {
    const retrieved = await getEncryptedSecret('non-existent-pubkey')
    expect(retrieved).toBeNull()
  })

  it('should remove encrypted secret', async () => {
    const record = createTestSecretRecord()

    await storeEncryptedSecret(record)
    await removeEncryptedSecret(record.pubkey)

    const retrieved = await getEncryptedSecret(record.pubkey)
    expect(retrieved).toBeNull()
  })

  it('should list all encrypted secrets', async () => {
    const record1 = createTestSecretRecord()
    const record2 = { ...createTestSecretRecord(), pubkey: 'another-pubkey' }

    await storeEncryptedSecret(record1)
    await storeEncryptedSecret(record2)

    const list = await listEncryptedSecrets()

    expect(list).toHaveLength(2)
    expect(list.some(item => item.pubkey === record1.pubkey)).toBe(true)
    expect(list.some(item => item.pubkey === record2.pubkey)).toBe(true)
  })

  it('should sort encrypted secrets by timestamp descending', async () => {
    const record1 = { ...createTestSecretRecord(), pubkey: 'pubkey1', timestamp: 1000 }
    const record2 = { ...createTestSecretRecord(), pubkey: 'pubkey2', timestamp: 2000 }

    await storeEncryptedSecret(record1)
    await storeEncryptedSecret(record2)

    const list = await listEncryptedSecrets()

    expect(list[0].pubkey).toBe('pubkey2') // More recent first
    expect(list[1].pubkey).toBe('pubkey1')
  })

  it('should handle empty keystore', async () => {
    const list = await listEncryptedSecrets()
    expect(list).toEqual([])
  })

  it('should update existing encrypted secret', async () => {
    const originalRecord = createTestSecretRecord()
    const updatedRecord = { ...originalRecord, ciphertextB64: 'dXBkYXRlZC1jaXBoZXJ0ZXh0' }

    await storeEncryptedSecret(originalRecord)
    await storeEncryptedSecret(updatedRecord)

    const retrieved = await getEncryptedSecret(originalRecord.pubkey)
    expect(retrieved!.ciphertextB64).toBe(updatedRecord.ciphertextB64)

    const list = await listEncryptedSecrets()
    expect(list).toHaveLength(1) // Should not duplicate
  })
})
