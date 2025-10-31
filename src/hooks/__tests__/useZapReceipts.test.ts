import { describe, it, expect } from 'vitest';
import { parseZapCommentFromReceipt } from '../useZapReceipts';

describe('useZapReceipts parser', () => {
  it('extracts comment content from description embedded 9734', () => {
    const signed9734 = { kind: 9734, content: 'nice post!', tags: [] };
    const ev: any = {
      id: 'x',
      pubkey: 'zapper',
      created_at: 1,
      kind: 9735,
      tags: [ ['description', JSON.stringify(signed9734)] ],
    };
    expect(parseZapCommentFromReceipt(ev as any)).toBe('nice post!');
  });

  it('returns undefined when description is missing or invalid', () => {
    const ev: any = { id: 'x', pubkey: 'z', created_at: 1, kind: 9735, tags: [] };
    expect(parseZapCommentFromReceipt(ev as any)).toBeUndefined();
    const ev2: any = { id: 'x', pubkey: 'z', created_at: 1, kind: 9735, tags: [['description','{invalid}']] };
    expect(parseZapCommentFromReceipt(ev2 as any)).toBeUndefined();
  });
});


