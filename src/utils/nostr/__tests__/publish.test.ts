import { describe, it, expect, vi, beforeEach } from 'vitest';
import { publishReaction, publishReply, publishMuteList, publishUnmuteList, filterRelaysByEventKind, publishNote } from '../../nostr/publish';

// Mock nostr-tools SimplePool and nip07SignEvent indirectly via dynamic import not needed
vi.mock('nostr-tools', () => ({
  SimplePool: vi.fn(),
}));

vi.mock('../../nostr/nip07', () => ({
  nip07SignEvent: vi.fn(async (e: any) => ({ ...e, id: 'signed-id', pubkey: 'me' }))
}));

describe('publish utilities', () => {
  const pool = { publish: vi.fn(async () => {} ) } as any;
  const relays = ['wss://relay.example'];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('publishReaction builds correct tags', async () => {
    const target = { id: 'event1', pubkey: 'author1', kind: 1, tags: [] as string[][] };
    const { id } = await publishReaction({ pool, relayUrls: relays, target, content: '+', relayHint: relays[0] });
    expect(id).toBe('signed-id');
    expect(pool.publish).toHaveBeenCalledTimes(1);
    const signed = (vi.mocked(await import('../../nostr/nip07')) as any).nip07SignEvent.mock.calls[0][0];
    expect(signed.kind).toBe(7);
    expect(signed.content).toBe('+');
    const e = signed.tags.find((t: string[]) => t[0] === 'e');
    const p = signed.tags.find((t: string[]) => t[0] === 'p');
    const k = signed.tags.find((t: string[]) => t[0] === 'k');
    expect(e).toEqual(['e', 'event1', relays[0], 'author1']);
    expect(p).toEqual(['p', 'author1', relays[0]]);
    expect(k).toEqual(['k', '1']);
  });

  it('publishReply adds marked e and p tags', async () => {
    const parent = { id: 'parent1', pubkey: 'author1', kind: 1, tags: [['p','x']] as string[][] };
    await publishReply({ pool, relayUrls: relays, parent, content: 'hi', relayHint: relays[0] });
    expect(pool.publish).toHaveBeenCalledTimes(1);
    const signed = (vi.mocked(await import('../../nostr/nip07')) as any).nip07SignEvent.mock.calls[0][0];
    expect(signed.kind).toBe(1);
    const eTags = signed.tags.filter((t: string[]) => t[0] === 'e');
    expect(eTags.length).toBe(1);
    expect(eTags[0]).toEqual(['e', 'parent1', relays[0], 'root', 'author1']);
    const pTags = signed.tags.filter((t: string[]) => t[0] === 'p');
    // should include parent's p + parent author
    const set = new Set(pTags.map((t: string[]) => t[1]));
    expect(set.has('x')).toBe(true);
    expect(set.has('author1')).toBe(true);
  });

  it('publishNote forwards powTargetBits and signal to signer', async () => {
    const abort = new AbortController();
    await publishNote(
      pool as any,
      relays,
      'hello',
      undefined,
      undefined, // relayInfoMap
      { powTargetBits: 22, signal: abort.signal }
    );
    const mod = (vi.mocked(await import('../../nostr/nip07')) as any);
    expect(mod.nip07SignEvent).toHaveBeenCalled();
    const args = mod.nip07SignEvent.mock.calls[0];
    expect(args[0].kind).toBe(1);
    expect(args[1]).toBeDefined();
    expect(args[1].powTargetBits).toBe(22);
    expect(args[1].signal).toBe(abort.signal);
  });

  it('publishReply forwards powTargetBits and signal to signer', async () => {
    const abort = new AbortController();
    const parent = { id: 'parent1', pubkey: 'author1', kind: 1, tags: [] as string[][] };
    await publishReply({
      pool,
      relayUrls: relays,
      parent,
      content: 'hi',
      relayHint: relays[0],
      powTargetBits: 20,
      signal: abort.signal,
    });
    const mod = (vi.mocked(await import('../../nostr/nip07')) as any);
    const args = mod.nip07SignEvent.mock.calls[0];
    expect(args[0].kind).toBe(1);
    expect(args[1]).toBeDefined();
    expect(args[1].powTargetBits).toBe(20);
    expect(args[1].signal).toBe(abort.signal);
  });

  it('publishMuteList builds correct tags', async () => {
    const { id } = await publishMuteList({ 
      pool, 
      relayUrls: relays, 
      pubkeyToMute: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      existingMutedPubkeys: ['abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890', 'fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321']
    });
    expect(id).toBe('signed-id');
    expect(pool.publish).toHaveBeenCalledTimes(1);
    const signed = (vi.mocked(await import('../../nostr/nip07')) as any).nip07SignEvent.mock.calls[0][0];
    expect(signed.kind).toBe(10000);
    expect(signed.content).toBe('');
    const pTags = signed.tags.filter((t: string[]) => t[0] === 'p');
    expect(pTags).toHaveLength(3);
    expect(pTags).toContainEqual(['p', '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef']);
    expect(pTags).toContainEqual(['p', 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890']);
    expect(pTags).toContainEqual(['p', 'fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321']);
  });

  it('publishUnmuteList removes pubkey from list', async () => {
    const { id } = await publishUnmuteList({ 
      pool, 
      relayUrls: relays, 
      pubkeyToUnmute: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      existingMutedPubkeys: ['1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef', 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890', 'fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321']
    });
    expect(id).toBe('signed-id');
    expect(pool.publish).toHaveBeenCalledTimes(1);
    const signed = (vi.mocked(await import('../../nostr/nip07')) as any).nip07SignEvent.mock.calls[0][0];
    expect(signed.kind).toBe(10000);
    expect(signed.content).toBe('');
    const pTags = signed.tags.filter((t: string[]) => t[0] === 'p');
    expect(pTags).toHaveLength(2);
    expect(pTags).not.toContainEqual(['p', '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef']);
    expect(pTags).toContainEqual(['p', 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890']);
    expect(pTags).toContainEqual(['p', 'fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321']);
  });

  it('publishMuteList filters out indexer relays', async () => {
    const relayUrls = ['wss://relay1.com', 'wss://relay2.com', 'wss://indexer.com'];
    const relayPermissions = new Map([
      ['wss://relay1.com', 'readwrite'],
      ['wss://relay2.com', 'write'],
      ['wss://indexer.com', 'indexer']
    ]);

    await publishMuteList({ 
      pool, 
      relayUrls, 
      relayPermissions,
      pubkeyToMute: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      existingMutedPubkeys: []
    });

    expect(pool.publish).toHaveBeenCalledTimes(1);
    const [filteredRelays] = pool.publish.mock.calls[0];
    
    // Should include readwrite and write relays
    expect(filteredRelays).toContain('wss://relay1.com');
    expect(filteredRelays).toContain('wss://relay2.com');
    
    // Should exclude indexer relays
    expect(filteredRelays).not.toContain('wss://indexer.com');
  });

  it('publishUnmuteList filters out indexer relays', async () => {
    const relayUrls = ['wss://relay1.com', 'wss://relay2.com', 'wss://indexer.com'];
    const relayPermissions = new Map([
      ['wss://relay1.com', 'readwrite'],
      ['wss://relay2.com', 'write'],
      ['wss://indexer.com', 'indexer']
    ]);

    await publishUnmuteList({ 
      pool, 
      relayUrls, 
      relayPermissions,
      pubkeyToUnmute: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      existingMutedPubkeys: ['1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef']
    });

    expect(pool.publish).toHaveBeenCalledTimes(1);
    const [filteredRelays] = pool.publish.mock.calls[0];
    
    // Should include readwrite and write relays
    expect(filteredRelays).toContain('wss://relay1.com');
    expect(filteredRelays).toContain('wss://relay2.com');
    
    // Should exclude indexer relays
    expect(filteredRelays).not.toContain('wss://indexer.com');
  });

  it('filterRelaysByEventKind excludes indexer relays for mute list events', () => {
    const relayUrls = ['wss://relay1.com', 'wss://relay2.com', 'wss://indexer.com'];
    const relayPermissions = new Map([
      ['wss://relay1.com', 'readwrite'],
      ['wss://relay2.com', 'write'],
      ['wss://indexer.com', 'indexer']
    ]);

    const filtered = filterRelaysByEventKind(relayUrls, relayPermissions, 10000); // mute list kind
    
    // Should include readwrite and write relays
    expect(filtered).toContain('wss://relay1.com');
    expect(filtered).toContain('wss://relay2.com');
    
    // Should exclude indexer relays
    expect(filtered).not.toContain('wss://indexer.com');
  });

  it('filterRelaysByEventKind uses fallback when all relays are filtered out as indexer relays', () => {
    const relayUrls = ['wss://indexer1.com', 'wss://indexer2.com', 'wss://indexer3.com'];
    const relayPermissions = new Map([
      ['wss://indexer1.com', 'indexer'],
      ['wss://indexer2.com', 'indexer'], 
      ['wss://indexer3.com', 'indexer']
    ]);

    // Mock console.warn to verify fallback warning
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const filtered = filterRelaysByEventKind(relayUrls, relayPermissions, 1); // reply event kind
    
    // Should use fallback and return write/readwrite relays (which is none in this case)
    expect(filtered).toEqual([]);
    
    // Should have logged warning about fallback
    expect(consoleSpy).toHaveBeenCalledWith(
      'All relays were filtered out as indexer relays for event kind 1. Using write/readwrite relays as fallback.'
    );

    consoleSpy.mockRestore();
  });

  it('filterRelaysByEventKind does not use fallback when write relays are available', () => {
    const relayUrls = ['wss://indexer1.com', 'wss://write-relay.com', 'wss://indexer2.com'];
    const relayPermissions = new Map([
      ['wss://indexer1.com', 'indexer'],
      ['wss://write-relay.com', 'write'],
      ['wss://indexer2.com', 'indexer']
    ]);

    // Mock console.warn
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const filtered = filterRelaysByEventKind(relayUrls, relayPermissions, 1); // reply event kind
    
    // Should return the write relay directly (no fallback needed)
    expect(filtered).toEqual(['wss://write-relay.com']);
    
    // Should NOT have logged fallback warning since write relay was found
    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});


