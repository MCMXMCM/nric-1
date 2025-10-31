import { useState, useCallback, useMemo } from 'react';
import { getAllDisplayNames } from '../utils/nostr/userDisplayNames';
import { nip19 } from 'nostr-tools';

export interface MentionMatch {
  pubkey: string;
  displayName: string;
  npub: string;
}

export interface MentionState {
  isActive: boolean;
  query: string;
  matches: MentionMatch[];
  selectedIndex: number;
  mentionStart: number;
}

export function useMentionAutocomplete() {
  const [mentionState, setMentionState] = useState<MentionState>({
    isActive: false,
    query: '',
    matches: [],
    selectedIndex: 0,
    mentionStart: 0,
  });

  // Get cursor position and detect @ mention
  const detectMention = useCallback((text: string, cursorPos: number) => {
    // Handle fallback for mobile when selectionStart might be unreliable
    if (cursorPos === undefined || cursorPos === null || cursorPos < 0) {
      // Fallback: assume cursor is at end of text
      cursorPos = text.length;
    }

    // Find the last @ symbol before cursor
    const lastAtIndex = text.lastIndexOf('@', cursorPos - 1);
    
    if (lastAtIndex === -1) {
      setMentionState(prev => ({ ...prev, isActive: false }));
      return;
    }

    // Check if @ is at start of word or after space
    const isAtWordStart = lastAtIndex === 0 || /\s/.test(text[lastAtIndex - 1]);
    if (!isAtWordStart) {
      setMentionState(prev => ({ ...prev, isActive: false }));
      return;
    }

    // Get text after @
    const textAfterAt = text.substring(lastAtIndex + 1, cursorPos);
    
    // Check if there's a space after @, which would end the mention
    if (/\s/.test(textAfterAt)) {
      setMentionState(prev => ({ ...prev, isActive: false }));
      return;
    }

    // We have an active mention
    const query = textAfterAt.toLowerCase();
    
    // Get all display names and filter
    const allNames = getAllDisplayNames();
    const matches: MentionMatch[] = [];
    
    Object.entries(allNames).forEach(([pubkey, entry]) => {
      const displayName = entry.displayName || '';
      if (displayName.toLowerCase().includes(query)) {
        try {
          const npub = nip19.npubEncode(pubkey);
          matches.push({ pubkey, displayName, npub });
        } catch (error) {
          console.warn('Failed to encode npub for pubkey:', pubkey, error);
        }
      }
    });

    // Sort matches: exact matches first, then by length, then alphabetically
    matches.sort((a, b) => {
      const aExact = a.displayName.toLowerCase() === query;
      const bExact = b.displayName.toLowerCase() === query;
      if (aExact !== bExact) return aExact ? -1 : 1;
      if (a.displayName.length !== b.displayName.length) {
        return a.displayName.length - b.displayName.length;
      }
      return a.displayName.localeCompare(b.displayName);
    });

    // Limit to 10 matches
    const limitedMatches = matches.slice(0, 10);

    setMentionState({
      isActive: limitedMatches.length > 0,
      query,
      matches: limitedMatches,
      selectedIndex: 0,
      mentionStart: lastAtIndex,
    });
  }, []);

  // Move selection up
  const selectPrevious = useCallback(() => {
    setMentionState(prev => ({
      ...prev,
      selectedIndex: prev.selectedIndex === 0 ? prev.matches.length - 1 : prev.selectedIndex - 1,
    }));
  }, []);

  // Move selection down
  const selectNext = useCallback(() => {
    setMentionState(prev => ({
      ...prev,
      selectedIndex: (prev.selectedIndex + 1) % prev.matches.length,
    }));
  }, []);

  // Get selected mention
  const selectedMention = useMemo(() => {
    if (!mentionState.isActive || mentionState.matches.length === 0) {
      return null;
    }
    return mentionState.matches[mentionState.selectedIndex] || null;
  }, [mentionState]);

  // Close mention popup
  const closeMention = useCallback(() => {
    setMentionState(prev => ({ ...prev, isActive: false }));
  }, []);

  return {
    ...mentionState,
    detectMention,
    selectPrevious,
    selectNext,
    selectedMention,
    closeMention,
  };
}
