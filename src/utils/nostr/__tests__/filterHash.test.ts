import { describe, it, expect } from 'vitest';
import { generateFilterHash, shouldLoadCachedNotes } from '../filterHash';
import type { FilterOptions } from '../filterHash';

describe('generateFilterHash', () => {
  const baseFilters: FilterOptions = {
    showReplies: true,
    showReposts: true,
    nsfwBlock: true,
    customHashtags: [],
    contacts: [],
    mutedPubkeys: []
  };

  it('should generate consistent hash for same filter combinations', () => {
    const hash1 = generateFilterHash(baseFilters);
    const hash2 = generateFilterHash(baseFilters);
    expect(hash1).toBe(hash2);
  });

  it('should generate different hashes for different filter combinations', () => {
    const filters1 = { ...baseFilters, showReplies: false };
    const filters2 = { ...baseFilters, showReplies: true };
    
    const hash1 = generateFilterHash(filters1);
    const hash2 = generateFilterHash(filters2);
    
    expect(hash1).not.toBe(hash2);
  });

  it('should include custom hashtags in hash generation', () => {
    const withoutHashtags = { ...baseFilters, customHashtags: [] };
    const withHashtags = { ...baseFilters, customHashtags: ['memes'] };
    
    const hash1 = generateFilterHash(withoutHashtags);
    const hash2 = generateFilterHash(withHashtags);
    
    expect(hash1).not.toBe(hash2);
    expect(hash2).toContain('memes');
  });

  it('should normalize custom hashtags for consistent hashing', () => {
    const filters1 = { ...baseFilters, customHashtags: ['Memes', 'Bitcoin'] };
    const filters2 = { ...baseFilters, customHashtags: ['bitcoin', 'memes'] }; // different order and case
    
    const hash1 = generateFilterHash(filters1);
    const hash2 = generateFilterHash(filters2);
    
    expect(hash1).toBe(hash2);
  });

  it('should handle empty and invalid custom hashtags', () => {
    const filters1 = { ...baseFilters, customHashtags: ['', '   ', 'valid'] };
    const filters2 = { ...baseFilters, customHashtags: ['valid'] };
    
    const hash1 = generateFilterHash(filters1);
    const hash2 = generateFilterHash(filters2);
    
    expect(hash1).toBe(hash2);
  });

  it('should handle all boolean filters correctly', () => {
    const allFalse = {
      showReplies: false,
      showReposts: false,
      nsfwBlock: false,
      customHashtags: [],
      contacts: [],
      mutedPubkeys: []
    };

    const allTrue = {
      showReplies: true,
      showReposts: true,
      nsfwBlock: true,
      customHashtags: [],
      contacts: [],
      mutedPubkeys: []
    };
    
    const hash1 = generateFilterHash(allFalse);
    const hash2 = generateFilterHash(allTrue);
    
    expect(hash1).toBe('0-0-0-lf:0-tags:none-muted:none');
    expect(hash2).toBe('1-1-1-lf:0-tags:none-muted:none');
  });

  it('should create real-world filter hashes that would distinguish custom hashtag scenarios', () => {
    // Scenario: User has #memes filter on relaunch
    const memesFilter = {
      ...baseFilters,
      customHashtags: ['memes'],
      showReplies: true,
      showReposts: false,
      nsfwBlock: false
    };
    
    // Scenario: User has no custom filters on relaunch 
    const noCustomFilter = {
      ...baseFilters,
      customHashtags: [],
      showReplies: true,
      showReposts: false,
      nsfwBlock: false
    };
    
    const memesHash = generateFilterHash(memesFilter);
    const noCustomHash = generateFilterHash(noCustomFilter);
    
    expect(memesHash).not.toBe(noCustomHash);
    expect(memesHash).toContain('tags:memes');
    expect(noCustomHash).toContain('tags:none');
  });

  describe('edge cases', () => {
    it('should handle undefined/null custom hashtags', () => {
      const filters = { ...baseFilters, customHashtags: undefined as any };
      const hash = generateFilterHash(filters);
      expect(hash).toContain('tags:none');
    });

    it('should handle undefined/null contacts', () => {
      const filters = { ...baseFilters, contacts: undefined as any };
      const hash = generateFilterHash(filters);
      // Should still generate a valid hash
      expect(hash).toBeDefined();
    });

    it('should handle contacts with invalid pubkeys', () => {
      const filters = { 
        ...baseFilters, 
        contacts: [
          { pubkey: 'valid' },
          { pubkey: '' },
          { pubkey: null as any },
          undefined as any
        ]
      };
      const hash = generateFilterHash(filters);
      // Should still generate a valid hash
      expect(hash).toBeDefined();
    });
  });
});

describe('shouldLoadCachedNotes', () => {
  const baseFilters: FilterOptions = {
    showReplies: true,
    showReposts: true,
    nsfwBlock: true,
    customHashtags: [],
    contacts: [],
    mutedPubkeys: []
  };

  it('should return true for normal filter combinations', () => {
    expect(shouldLoadCachedNotes(baseFilters)).toBe(true);
  });

  it('should return true for all filter combinations', () => {
    const filters = { 
      ...baseFilters, 
      customHashtags: ['test'],
      mutedPubkeys: ['pubkey1']
    };
    expect(shouldLoadCachedNotes(filters)).toBe(true);
  });
});
