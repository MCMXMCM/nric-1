import { describe, it, expect } from 'vitest';
import { insertMention, getCursorPositionAfterMention } from '../mentions';

describe('Mention Utilities', () => {
  const testNpub = 'npub1abc123def456';

  describe('insertMention', () => {
    it('should replace @query with nostr:npub', () => {
      const text = 'Hello @ali how are you?';
      const result = insertMention(text, 6, 'ali', testNpub);

      expect(result).toBe(`Hello nostr:${testNpub}  how are you?`);
    });

    it('should handle mention at start of text', () => {
      const text = '@ali hello';
      const result = insertMention(text, 0, 'ali', testNpub);

      expect(result).toBe(`nostr:${testNpub}  hello`);
    });

    it('should handle mention at end of text', () => {
      const text = 'Hello @ali';
      const result = insertMention(text, 6, 'ali', testNpub);

      expect(result).toBe(`Hello nostr:${testNpub} `);
    });

    it('should handle partial query', () => {
      const text = 'Hello @a';
      const result = insertMention(text, 6, 'a', testNpub);

      expect(result).toBe(`Hello nostr:${testNpub} `);
    });

    it('should preserve text after mention', () => {
      const text = 'Hello @alice nice to meet you';
      const result = insertMention(text, 6, 'alice', testNpub);

      expect(result).toBe(`Hello nostr:${testNpub}  nice to meet you`);
    });

    it('should handle multiple spaces after mention', () => {
      const text = 'Hey  @alice  what\'s up?';
      // Mention starts at position 5 (after "Hey  ")
      // Query is "alice" (5 chars)
      // So mentionEnd should be 5 + 1 + 5 = 11
      const result = insertMention(text, 5, 'alice', testNpub);

      expect(result).toBe(`Hey  nostr:${testNpub}   what's up?`);
    });
  });

  describe('getCursorPositionAfterMention', () => {
    it('should return correct cursor position', () => {
      const mentionStart = 6;
      const position = getCursorPositionAfterMention(mentionStart, testNpub);

      // mentionStart (6) + '@' (1) + npub length + space (1)
      const expected = mentionStart + 1 + testNpub.length + 1;
      expect(position).toBe(expected);
    });

    it('should calculate position for mention at start', () => {
      const mentionStart = 0;
      const position = getCursorPositionAfterMention(mentionStart, testNpub);

      // 0 + '@' (1) + npub length + space (1)
      const expected = 0 + 1 + testNpub.length + 1;
      expect(position).toBe(expected);
    });

    it('should handle different npub lengths', () => {
      const longNpub = 'npub1' + 'x'.repeat(100);
      const position = getCursorPositionAfterMention(10, longNpub);

      expect(position).toBe(10 + 1 + longNpub.length + 1);
    });
  });

  describe('Integration', () => {
    it('should work together: insert mention and calculate cursor position', () => {
      const originalText = 'Hello @ali how are you?';
      const mentionStart = 6;
      const query = 'ali';

      // Insert mention
      const newText = insertMention(originalText, mentionStart, query, testNpub);

      // Get cursor position
      const cursorPos = getCursorPositionAfterMention(mentionStart, testNpub);

      // Verify text contains the mention in the right place
      expect(newText).toContain(`nostr:${testNpub}`);
      expect(newText.substring(mentionStart).startsWith(`nostr:${testNpub}`)).toBe(true);

      // Verify cursor position is reasonable (after the mention)
      expect(cursorPos).toBeGreaterThan(mentionStart);
      expect(cursorPos).toBe(mentionStart + 1 + testNpub.length + 1);
    });
  });
});
