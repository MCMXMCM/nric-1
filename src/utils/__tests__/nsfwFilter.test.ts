import { hasNsfwHashtags, hasNsfwContent, isNsfwNote, isBlockedPubkey } from '../nsfwFilter';

describe('NSFW Filter', () => {
  describe('hasNsfwHashtags', () => {
    it('should detect NSFW hashtags', () => {
      expect(hasNsfwHashtags([['t', 'nsfw']])).toBe(true);
      expect(hasNsfwHashtags([['t', 'adult']])).toBe(true);
      expect(hasNsfwHashtags([['t', 'explicit']])).toBe(true);
      expect(hasNsfwHashtags([['t', '18+']])).toBe(true);
    });

    it('should not detect normal hashtags', () => {
      expect(hasNsfwHashtags([['t', 'bitcoin']])).toBe(false);
      expect(hasNsfwHashtags([['t', 'nostr']])).toBe(false);
      expect(hasNsfwHashtags([['t', 'news']])).toBe(false);
    });

    it('should handle case insensitive hashtags', () => {
      expect(hasNsfwHashtags([['t', 'NSFW']])).toBe(true);
      expect(hasNsfwHashtags([['t', 'Adult']])).toBe(true);
      expect(hasNsfwHashtags([['t', 'EXPLICIT']])).toBe(true);
    });

    it('should handle multiple hashtags', () => {
      expect(hasNsfwHashtags([['t', 'bitcoin'], ['t', 'nsfw']])).toBe(true);
      expect(hasNsfwHashtags([['t', 'bitcoin'], ['t', 'nostr']])).toBe(false);
    });

    it('should handle invalid tag arrays', () => {
      expect(hasNsfwHashtags([])).toBe(false);
      expect(hasNsfwHashtags(null as any)).toBe(false);
      expect(hasNsfwHashtags(undefined as any)).toBe(false);
    });
  });

  describe('hasNsfwContent', () => {
    it('should detect NSFW words in content', () => {
      expect(hasNsfwContent('This post contains nsfw content')).toBe(true);
      expect(hasNsfwContent('This is an adult post')).toBe(true);
      expect(hasNsfwContent('This is explicit content')).toBe(true);
      expect(hasNsfwContent('This is 18+ content')).toBe(true);
    });

    it('should not detect normal content', () => {
      expect(hasNsfwContent('This is a normal post about bitcoin')).toBe(false);
      expect(hasNsfwContent('This is a nostr post')).toBe(false);
      expect(hasNsfwContent('This is news content')).toBe(false);
    });

    it('should handle case insensitive content', () => {
      expect(hasNsfwContent('This post contains NSFW content')).toBe(true);
      expect(hasNsfwContent('This is an ADULT post')).toBe(true);
      expect(hasNsfwContent('This is EXPLICIT content')).toBe(true);
    });

    it('should handle word boundaries correctly', () => {
      expect(hasNsfwContent('nsfw')).toBe(true);
      expect(hasNsfwContent('nsfwcontent')).toBe(false); // Should not match
      expect(hasNsfwContent('contentnsfw')).toBe(false); // Should not match
    });

    it('should handle invalid content', () => {
      expect(hasNsfwContent('')).toBe(false);
      expect(hasNsfwContent(null as any)).toBe(false);
      expect(hasNsfwContent(undefined as any)).toBe(false);
    });
  });

  describe('isBlockedPubkey', () => {
    const blockedPubkey = '2b14efa5b01b30dbcbecb2b8353904c45fcfafda4fee4177abcba93ac55dd76f';

    it('should detect blocked pubkeys', () => {
      expect(isBlockedPubkey(blockedPubkey)).toBe(true);
    });

    it('should handle case insensitive pubkeys', () => {
      expect(isBlockedPubkey(blockedPubkey.toUpperCase())).toBe(true);
    });

    it('should not detect normal pubkeys', () => {
      expect(isBlockedPubkey('1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef')).toBe(false);
    });

    it('should handle invalid input', () => {
      expect(isBlockedPubkey('')).toBe(false);
      expect(isBlockedPubkey(undefined)).toBe(false);
    });
  });

  describe('isNsfwNote', () => {
    const blockedPubkey = '2b14efa5b01b30dbcbecb2b8353904c45fcfafda4fee4177abcba93ac55dd76f';
    const normalPubkey = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    it('should detect NSFW notes by hashtags', () => {
      expect(isNsfwNote({
        content: 'This is a normal post',
        tags: [['t', 'nsfw']]
      })).toBe(true);
    });

    it('should detect NSFW notes by content', () => {
      expect(isNsfwNote({
        content: 'This post contains nsfw content',
        tags: []
      })).toBe(true);
    });

    it('should detect NSFW notes by both hashtags and content', () => {
      expect(isNsfwNote({
        content: 'This post contains nsfw content',
        tags: [['t', 'bitcoin']]
      })).toBe(true);
    });

    it('should detect NSFW notes by blocked pubkey', () => {
      expect(isNsfwNote({
        content: 'This is a normal post',
        tags: [['t', 'bitcoin']],
        pubkey: blockedPubkey
      })).toBe(true);
    });

    it('should not detect normal notes from normal pubkeys', () => {
      expect(isNsfwNote({
        content: 'This is a normal post about bitcoin',
        tags: [['t', 'bitcoin']],
        pubkey: normalPubkey
      })).toBe(false);
    });

    it('should not detect normal notes', () => {
      expect(isNsfwNote({
        content: 'This is a normal post about bitcoin',
        tags: [['t', 'bitcoin']]
      })).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(isNsfwNote({
        content: '',
        tags: []
      })).toBe(false);
      
      expect(isNsfwNote({
        content: 'This is a normal post',
        tags: [['t', 'nsfw'], ['t', 'bitcoin']]
      })).toBe(true);
    });
  });
});
