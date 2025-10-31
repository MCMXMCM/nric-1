/**
 * Insert a mention at the specified position in text
 * @param text Current text content
 * @param mentionStart Position of the @ symbol
 * @param query The query text after @
 * @param npub The npub to insert (in format nostr:npub...)
 * @returns Updated text with mention inserted
 */
export function insertMention(
  text: string,
  mentionStart: number,
  query: string,
  npub: string
): string {
  // Find the end of the mention (where the cursor was)
  const mentionEnd = mentionStart + 1 + query.length;
  
  // Replace @query with nostr:npub
  const beforeMention = text.substring(0, mentionStart);
  const afterMention = text.substring(mentionEnd);
  
  return `${beforeMention}nostr:${npub} ${afterMention}`;
}

/**
 * Get the cursor position after inserting a mention
 * @param mentionStart Position of the @ symbol
 * @param npub The npub that was inserted
 * @returns The cursor position after the mention
 */
export function getCursorPositionAfterMention(
  mentionStart: number,
  npub: string
): number {
  // Cursor should be after the mention and the space: @ + npub + space
  return mentionStart + 1 + npub.length + 1;
}
