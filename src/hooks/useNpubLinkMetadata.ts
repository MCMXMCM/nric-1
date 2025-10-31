import { useEffect, useCallback, useContext } from 'react';
import { nip19 } from 'nostr-tools';
import { useDisplayNames } from './useDisplayNames';
import { useRelayManager } from './useRelayManager';
import { NostrContext } from '../contexts/NostrContext';

/**
 * Hook to automatically fetch metadata for npub links found in text content
 * This ensures display names are available immediately when notes are rendered
 */
export const useNpubLinkMetadata = (text: string) => {
  const { nostrClient } = useContext(NostrContext);
  const { relayUrls } = useRelayManager({ nostrClient, initialRelays: [] });
  const { fetchDisplayNames } = useDisplayNames(relayUrls);

  // Extract all npub and nprofile links from text
  const extractNpubLinks = useCallback((content: string): string[] => {
    const npubRegex = /(?:nostr:)?(npub1[0-9a-z]+|nprofile1[0-9a-z]+)/gi;
    const matches = content.match(npubRegex);
    
    if (!matches) return [];
    
    const pubkeys: string[] = [];
    
    for (const match of matches) {
      try {
        const decoded = nip19.decode(match);
        if (decoded.type === 'npub') {
          pubkeys.push(decoded.data as string);
        } else if (decoded.type === 'nprofile') {
          const pubkey = (decoded.data as any)?.pubkey;
          if (pubkey) {
            pubkeys.push(pubkey);
          }
        }
      } catch (error) {
        // Skip invalid bech32 strings
        console.debug('Failed to decode npub link:', match, error);
      }
    }
    
    return pubkeys;
  }, []);

  // Fetch metadata for npub links when text changes
  useEffect(() => {
    if (!text.trim()) return;
    
    const pubkeys = extractNpubLinks(text);
    if (pubkeys.length > 0) {
      // Fetch metadata for all found pubkeys
      fetchDisplayNames(pubkeys);
    }
  }, [text, extractNpubLinks, fetchDisplayNames]);
};
