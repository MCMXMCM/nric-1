import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
  storeWalletConnection, 
  getStoredWalletConnection, 
  removeStoredWalletConnection,
  getStoredWalletConnections 
} from '../walletStorage';
import type { StoredWalletConnection } from '../walletStorage';

describe('NWC Wallet Storage - Passphrase Support', () => {
  const testPubkey = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
  const testPassphrase = 'mySecurePassphrase123!';
  const testNwcString = 'nostr+walletconnect://1234567890abcdef?relay=wss://relay.example.com&secret=abc123';
  const testWalletId = 'wallet_test_123';

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('storeWalletConnection with passphrase', () => {
    it('should store NWC wallet metadata with encrypted marker', async () => {
      const wallet: StoredWalletConnection = {
        id: testWalletId,
        name: 'Test NWC Wallet',
        connectionString: testNwcString,
        walletType: 'nwc',
        connectedAt: Date.now(),
        lastUsed: Date.now(),
        persist: true,
        pubkey: testPubkey,
      };

      await storeWalletConnection(wallet, {
        pubkey: testPubkey,
        passphrase: testPassphrase,
      });

      const stored = localStorage.getItem('nostr-wallet-connection');
      expect(stored).toBeTruthy();
      const wallets = JSON.parse(stored!);
      expect(wallets).toHaveLength(1);
      expect(wallets[0].name).toBe('Test NWC Wallet');
      expect(wallets[0].connectionString).toBe('encrypted');
      expect(wallets[0].walletType).toBe('nwc');
    });

    it('should store multiple wallets', async () => {
      const wallet1: StoredWalletConnection = {
        id: 'wallet_1',
        name: 'Wallet 1',
        connectionString: testNwcString,
        walletType: 'nwc',
        connectedAt: Date.now(),
        lastUsed: Date.now(),
        persist: true,
        pubkey: testPubkey,
      };

      const wallet2: StoredWalletConnection = {
        id: 'wallet_2',
        name: 'Wallet 2',
        connectionString: 'nostr+walletconnect://different?relay=wss://relay2.example.com&secret=xyz789',
        walletType: 'nwc',
        connectedAt: Date.now(),
        lastUsed: Date.now(),
        persist: true,
        pubkey: testPubkey,
      };

      await storeWalletConnection(wallet1, {
        pubkey: testPubkey,
        passphrase: testPassphrase,
      });

      await storeWalletConnection(wallet2, {
        pubkey: testPubkey,
        passphrase: testPassphrase,
      });

      const stored = localStorage.getItem('nostr-wallet-connection');
      const wallets = JSON.parse(stored!);
      expect(wallets).toHaveLength(2);
      expect(wallets.map((w: any) => w.id)).toEqual(['wallet_1', 'wallet_2']);
    });
  });

  describe('getStoredWalletConnection', () => {
    it('should return encrypted marker when wallet not decrypted', async () => {
      const wallet: StoredWalletConnection = {
        id: testWalletId,
        name: 'Test NWC Wallet',
        connectionString: 'encrypted',
        walletType: 'nwc',
        connectedAt: Date.now(),
        lastUsed: Date.now(),
        persist: true,
        pubkey: testPubkey,
      };

      localStorage.setItem('nostr-wallet-connection', JSON.stringify([wallet]));

      const retrieved = await getStoredWalletConnection(testWalletId, {
        pubkey: testPubkey,
        decrypt: true,
      });

      expect(retrieved).toBeTruthy();
      expect(retrieved?.connectionString).toBe('encrypted');
    });

    it('should return wallet metadata when encrypted', async () => {
      const wallet: StoredWalletConnection = {
        id: testWalletId,
        name: 'My NWC',
        connectionString: 'encrypted',
        walletType: 'nwc',
        connectedAt: Date.now(),
        lastUsed: Date.now(),
        persist: true,
        pubkey: testPubkey,
      };

      localStorage.setItem('nostr-wallet-connection', JSON.stringify([wallet]));

      const retrieved = await getStoredWalletConnection(testWalletId, {
        pubkey: testPubkey,
        decrypt: false,
      });

      expect(retrieved).toBeTruthy();
      expect(retrieved?.name).toBe('My NWC');
      expect(retrieved?.walletType).toBe('nwc');
      expect(retrieved?.connectionString).toBe('encrypted');
    });

    it('should select most recently used wallet', async () => {
      const now = Date.now();
      const wallet1: StoredWalletConnection = {
        id: 'wallet_1',
        name: 'Old Wallet',
        connectionString: 'encrypted',
        walletType: 'nwc',
        connectedAt: now - 100000,
        lastUsed: now - 100000,
        persist: true,
        pubkey: testPubkey,
      };

      const wallet2: StoredWalletConnection = {
        id: 'wallet_2',
        name: 'Recent Wallet',
        connectionString: 'encrypted',
        walletType: 'nwc',
        connectedAt: now,
        lastUsed: now,
        persist: true,
        pubkey: testPubkey,
      };

      localStorage.setItem('nostr-wallet-connection', JSON.stringify([wallet1, wallet2]));

      const retrieved = await getStoredWalletConnection(undefined, {
        pubkey: testPubkey,
      });

      expect(retrieved?.id).toBe('wallet_2');
    });

    it('should filter wallets by pubkey', async () => {
      const otherPubkey = 'other1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

      const wallet1: StoredWalletConnection = {
        id: 'wallet_1',
        name: 'User 1 Wallet',
        connectionString: 'encrypted',
        walletType: 'nwc',
        connectedAt: Date.now(),
        lastUsed: Date.now(),
        persist: true,
        pubkey: testPubkey,
      };

      const wallet2: StoredWalletConnection = {
        id: 'wallet_2',
        name: 'User 2 Wallet',
        connectionString: 'encrypted',
        walletType: 'nwc',
        connectedAt: Date.now(),
        lastUsed: Date.now(),
        persist: true,
        pubkey: otherPubkey,
      };

      localStorage.setItem('nostr-wallet-connection', JSON.stringify([wallet1, wallet2]));

      const retrieved = await getStoredWalletConnection(undefined, {
        pubkey: testPubkey,
      });

      expect(retrieved?.id).toBe('wallet_1');
      expect(retrieved?.pubkey).toBe(testPubkey);
    });
  });

  describe('removeStoredWalletConnection', () => {
    it('should remove wallet from storage', async () => {
      const wallet: StoredWalletConnection = {
        id: testWalletId,
        name: 'Test Wallet',
        connectionString: 'encrypted',
        walletType: 'nwc',
        connectedAt: Date.now(),
        lastUsed: Date.now(),
        persist: true,
        pubkey: testPubkey,
      };

      localStorage.setItem('nostr-wallet-connection', JSON.stringify([wallet]));
      expect(localStorage.getItem('nostr-wallet-connection')).toBeTruthy();

      await removeStoredWalletConnection(testWalletId, { pubkey: testPubkey });

      const stored = localStorage.getItem('nostr-wallet-connection');
      if (stored) {
        const wallets = JSON.parse(stored);
        expect(wallets).toHaveLength(0);
      }
    });
  });

  describe('getStoredWalletConnections', () => {
    it('should return wallets for specific pubkey', async () => {
      const otherPubkey = 'other1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

      const wallets: StoredWalletConnection[] = [
        {
          id: 'wallet_1',
          name: 'User 1 Wallet',
          connectionString: 'encrypted',
          walletType: 'nwc',
          connectedAt: Date.now(),
          lastUsed: Date.now(),
          persist: true,
          pubkey: testPubkey,
        },
        {
          id: 'wallet_2',
          name: 'User 2 Wallet',
          connectionString: 'encrypted',
          walletType: 'nwc',
          connectedAt: Date.now(),
          lastUsed: Date.now(),
          persist: true,
          pubkey: otherPubkey,
        },
      ];

      localStorage.setItem('nostr-wallet-connection', JSON.stringify(wallets));

      const retrieved = await getStoredWalletConnections(testPubkey);
      expect(retrieved).toHaveLength(1);
      expect(retrieved[0].pubkey).toBe(testPubkey);
    });

    it('should return empty array when no wallets found', async () => {
      const retrieved = await getStoredWalletConnections(testPubkey);
      expect(retrieved).toHaveLength(0);
    });
  });

  describe('Non-NWC wallet types', () => {
    it('should handle webln wallets without encryption', async () => {
      const wallet: StoredWalletConnection = {
        id: testWalletId,
        name: 'WebLN Wallet',
        connectionString: 'webln://example',
        walletType: 'webln',
        connectedAt: Date.now(),
        lastUsed: Date.now(),
        persist: true,
        pubkey: testPubkey,
      };

      await storeWalletConnection(wallet, { pubkey: testPubkey });

      const stored = localStorage.getItem('nostr-wallet-connection');
      const wallets = JSON.parse(stored!);

      expect(wallets[0].connectionString).toBe('webln://example');
    });
  });
});
