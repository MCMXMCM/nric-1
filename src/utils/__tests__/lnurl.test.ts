import { describe, it, expect, vi } from 'vitest';
import { bech32 } from 'bech32';
import {
  decodeLnurlBech32,
  parseLightningAddress,
  getLnurlpEndpoint
} from '../../utils/lnurl';

// Mock fetch for testing LNURL resolution
global.fetch = vi.fn();

function encodeLnurl(url: string): string {
  const bytes = new TextEncoder().encode(url);
  const words = bech32.toWords(bytes);
  return bech32.encode('lnurl', words, 2048);
}

describe('LNURL utils', () => {
  it('decodes a valid bech32 LNURL to https URL', () => {
    const url = 'https://example.com/.well-known/lnurlp/alice';
    const lnurl = encodeLnurl(url);
    const decoded = decodeLnurlBech32(lnurl);
    expect(decoded).toBe(url);
  });

  it('rejects non-https URLs', () => {
    const url = 'http://example.com/.well-known/lnurlp/alice';
    const bytes = new TextEncoder().encode(url);
    const words = bech32.toWords(bytes);
    const lnurl = bech32.encode('lnurl', words, 2048);
    expect(() => decodeLnurlBech32(lnurl)).toThrowError('LNURL must be https');
  });

  it('throws on invalid input', () => {
    expect(() => decodeLnurlBech32('lnurl1invalid')).toThrow();
  });
});

describe('Lightning address parsing', () => {
  it('parses valid Lightning address into username and domain', () => {
    const result = parseLightningAddress('alice@getalby.com');
    expect(result).toEqual({
      username: 'alice',
      domain: 'getalby.com'
    });
  });

  it('parses Lightning address with subdomain', () => {
    const result = parseLightningAddress('user@wallet.mysite.com');
    expect(result).toEqual({
      username: 'user',
      domain: 'wallet.mysite.com'
    });
  });

  it('throws on invalid Lightning address format', () => {
    expect(() => parseLightningAddress('alice')).toThrow('Invalid LUD16 format');
    expect(() => parseLightningAddress('alice@')).toThrow('Invalid LUD16 format');
    expect(() => parseLightningAddress('@domain.com')).toThrow('Invalid LUD16 format');
    expect(() => parseLightningAddress('')).toThrow('Invalid Lightning address input');
  });

  it('generates LNURLp endpoint URL from Lightning address', () => {
    const result = getLnurlpEndpoint('alice@getalby.com');
    expect(result).toBe('https://getalby.com/.well-known/lnurlp/alice');
  });

  it('handles subdomains in endpoint generation', () => {
    const result = getLnurlpEndpoint('user@wallet.mysite.com');
    expect(result).toBe('https://wallet.mysite.com/.well-known/lnurlp/user');
  });
});


