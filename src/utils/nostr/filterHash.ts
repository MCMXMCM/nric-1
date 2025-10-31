/**
 * Generates a consistent hash key for filter combinations to be used for caching notes.
 * This ensures that notes cached under different filter combinations don't interfere with each other.
 */

export interface FilterOptions {
  showReplies: boolean;
  showReposts: boolean;
  nsfwBlock: boolean;
  customHashtags: string[];
  contacts?: Array<{ pubkey: string }>;
  mutedPubkeys: string[];
  // Long form (NIP-23) feed mode flag
  longFormMode?: boolean;
}

export const generateFilterHash = (filters: FilterOptions): string => {
  // Handle custom hashtags - normalize and sort for consistency
  const normalizedCustomHashtags = Array.isArray(filters.customHashtags) 
    ? filters.customHashtags
        .filter(tag => typeof tag === 'string' && tag.trim().length > 0)
        .map(tag => tag.toLowerCase().trim())
        .sort() // Sort for consistent ordering
    : [];

  // Handle muted pubkeys - include in hash for cache consistency
  let muteHash = 'muted:none';
  if (Array.isArray(filters.mutedPubkeys) && filters.mutedPubkeys.length > 0) {
    const sortedMutedPubkeys = filters.mutedPubkeys
      .filter(pubkey => typeof pubkey === 'string' && pubkey.length > 0)
      .sort(); // Sort for consistent ordering

    if (sortedMutedPubkeys.length > 0) {
      // Create a hash of the muted pubkeys to keep the filter hash manageable
      const muteString = sortedMutedPubkeys.join(',');
      const muteHashValue = muteString.split('').reduce((a, b) => {
        a = ((a << 5) - a) + b.charCodeAt(0);
        return a & a;
      }, 0);
      muteHash = `muted:${sortedMutedPubkeys.length}:${Math.abs(muteHashValue)}`;
    }
  }

  // Build hash components
  const components = [
    filters.showReplies ? '1' : '0',
    filters.showReposts ? '1' : '0',
    filters.nsfwBlock ? '1' : '0',
    // Include long form mode state for cache separation
    `lf:${filters.longFormMode ? '1' : '0'}`,
    // Include custom hashtags in the hash
    normalizedCustomHashtags.length > 0 ? `tags:${normalizedCustomHashtags.join(',')}` : 'tags:none',
    // Include mute hash for mute filtering
    muteHash
  ];

  return components.join('-');
};

/**
 * Determines if cached notes for the given filter exist and should be loaded
 */
export const shouldLoadCachedNotes = (): boolean => {
  return true;
};
