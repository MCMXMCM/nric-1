import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifyNip05, parseNip05Identifier } from '../nip05';

// Mock fetch globally
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('NIP-05 Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('parseNip05Identifier', () => {
    it('should parse valid email-like identifier', () => {
      const result = parseNip05Identifier('bob@example.com');
      expect(result).toEqual({
        localPart: 'bob',
        domain: 'example.com'
      });
    });

    it('should parse root identifier (_@domain)', () => {
      const result = parseNip05Identifier('_@example.com');
      expect(result).toEqual({
        localPart: '_',
        domain: 'example.com'
      });
    });

    it('should handle multiple @ symbols', () => {
      const result = parseNip05Identifier('user@sub@example.com');
      expect(result).toEqual({
        localPart: 'user@sub',
        domain: 'example.com'
      });
    });

    it('should reject invalid identifiers', () => {
      expect(parseNip05Identifier('')).toBeNull();
      expect(parseNip05Identifier('@example.com')).toBeNull();
      expect(parseNip05Identifier('bob@')).toBeNull();
      expect(parseNip05Identifier('bob')).toBeNull();
      expect(parseNip05Identifier('@')).toBeNull();
    });

    it('should reject invalid domain names', () => {
      expect(parseNip05Identifier('bob@.com')).toBeNull();
      expect(parseNip05Identifier('bob@example')).toBeNull();
      expect(parseNip05Identifier('bob@example.')).toBeNull();
    });

    it('should reject invalid local parts', () => {
      expect(parseNip05Identifier('user with spaces@example.com')).toBeNull();
      expect(parseNip05Identifier('user!invalid@example.com')).toBeNull();
    });
  });

  describe('verifyNip05', () => {
    const mockPubkey = 'b0635d6a9851d3aed0cd6c495b282167acf761729078d975fc341b22650b07b9';

    it('should verify valid NIP-05 identifier', async () => {
      const mockResponse = {
        names: {
          bob: mockPubkey
        },
        relays: {
          [mockPubkey]: ['wss://relay.example.com']
        }
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await verifyNip05('bob@example.com', mockPubkey);

      expect(result.isVerified).toBe(true);
      expect(result.relays).toEqual(['wss://relay.example.com']);
      expect(result.error).toBeUndefined();
      expect(fetchMock).toHaveBeenCalledWith(
        'https://example.com/.well-known/nostr.json?name=bob',
        expect.objectContaining({
          method: 'GET',
          redirect: 'error'
        })
      );
    });

    it('should handle verification failure when pubkey does not match', async () => {
      const mockResponse = {
        names: {
          bob: 'different-pubkey-hex'
        }
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await verifyNip05('bob@example.com', mockPubkey);

      expect(result.isVerified).toBe(false);
      expect(result.error).toBe('Pubkey does not match');
      expect(result.relays).toBeUndefined();
    });

    it('should handle verification failure when name not found', async () => {
      const mockResponse = {
        names: {
          alice: mockPubkey
        }
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await verifyNip05('bob@example.com', mockPubkey);

      expect(result.isVerified).toBe(false);
      expect(result.error).toBe('Name not found in .well-known/nostr.json');
    });

    it('should handle network errors', async () => {
      // Mock both domain attempts and CORS proxy attempts to fail
      fetchMock.mockRejectedValueOnce(new Error('Network error')); // Direct fetch fails
      fetchMock.mockRejectedValueOnce(new Error('Network error')); // CORS proxy fails
      fetchMock.mockRejectedValueOnce(new Error('Network error')); // www direct fails  
      fetchMock.mockRejectedValueOnce(new Error('Network error')); // www CORS proxy fails

      const result = await verifyNip05('bob@example.com', mockPubkey);

      expect(result.isVerified).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should handle HTTP errors', async () => {
      // Mock both domain attempts to return HTTP errors
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      const result = await verifyNip05('bob@example.com', mockPubkey);

      expect(result.isVerified).toBe(false);
      expect(result.error).toBe('HTTP 404: Not Found');
    });

    it('should handle invalid JSON response', async () => {
      // Mock both domain attempts to return invalid JSON
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.reject(new Error('Invalid JSON'))
      });
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.reject(new Error('Invalid JSON'))
      });

      const result = await verifyNip05('bob@example.com', mockPubkey);

      expect(result.isVerified).toBe(false);
      expect(result.error).toBe('Invalid JSON');
    });

    it('should handle missing names field in response', async () => {
      const mockResponse = {
        relays: {
          [mockPubkey]: ['wss://relay.example.com']
        }
      };

      // Mock both domain attempts to return invalid response
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await verifyNip05('bob@example.com', mockPubkey);

      expect(result.isVerified).toBe(false);
      expect(result.error).toBe('Missing or invalid "names" field');
    });

    it('should handle invalid NIP-05 identifier', async () => {
      const result = await verifyNip05('invalid-identifier', mockPubkey);

      expect(result.isVerified).toBe(false);
      expect(result.error).toBe('Invalid NIP-05 identifier format');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should handle root identifier (_@domain)', async () => {
      const mockResponse = {
        names: {
          '_': mockPubkey
        }
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await verifyNip05('_@example.com', mockPubkey);

      expect(result.isVerified).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://example.com/.well-known/nostr.json?name=_',
        expect.any(Object)
      );
    });

    it('should handle case-insensitive pubkey comparison', async () => {
      const mockResponse = {
        names: {
          bob: mockPubkey.toUpperCase()
        }
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await verifyNip05('bob@example.com', mockPubkey.toLowerCase());

      expect(result.isVerified).toBe(true);
    });

    it('should fallback to www subdomain when main domain fails', async () => {
      const mockResponse = {
        names: {
          matt: mockPubkey
        }
      };

      // Direct fetch fails, CORS proxy fails, www direct succeeds
      fetchMock.mockRejectedValueOnce(new Error('Failed to fetch')); // example.com direct
      fetchMock.mockRejectedValueOnce(new Error('Failed to fetch')); // example.com CORS proxy
      fetchMock.mockResolvedValueOnce({ // www.example.com direct succeeds
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await verifyNip05('matt@example.com', mockPubkey);

      expect(result.isVerified).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://example.com/.well-known/nostr.json?name=matt',
        expect.any(Object)
      );
      // Should try CORS proxy for example.com
      expect(fetchMock).toHaveBeenCalledWith(
        'https://corsproxy.io/?https%3A%2F%2Fexample.com%2F.well-known%2Fnostr.json%3Fname%3Dmatt',
        expect.any(Object)
      );
      // Should try direct www.example.com
      expect(fetchMock).toHaveBeenCalledWith(
        'https://www.example.com/.well-known/nostr.json?name=matt',
        expect.any(Object)
      );
    });

    it('should try without www when domain starts with www', async () => {
      const mockResponse = {
        names: {
          test: mockPubkey
        }
      };

      // Direct fetch fails, CORS proxy fails, non-www direct succeeds
      fetchMock.mockRejectedValueOnce(new Error('Failed to fetch')); // www.example.com direct
      fetchMock.mockRejectedValueOnce(new Error('Failed to fetch')); // www.example.com CORS proxy
      fetchMock.mockResolvedValueOnce({ // example.com direct succeeds
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await verifyNip05('test@www.example.com', mockPubkey);

      expect(result.isVerified).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://www.example.com/.well-known/nostr.json?name=test',
        expect.any(Object)
      );
      // Should try CORS proxy for www.example.com
      expect(fetchMock).toHaveBeenCalledWith(
        'https://corsproxy.io/?https%3A%2F%2Fwww.example.com%2F.well-known%2Fnostr.json%3Fname%3Dtest',
        expect.any(Object)
      );
      // Should try direct example.com
      expect(fetchMock).toHaveBeenCalledWith(
        'https://example.com/.well-known/nostr.json?name=test',
        expect.any(Object)
      );
    });
  });
});
