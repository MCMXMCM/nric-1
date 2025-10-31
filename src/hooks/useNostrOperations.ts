import React, { useCallback, useRef, useContext } from 'react';
import { type Event, type Filter } from 'nostr-tools';
import { NostrContext } from '../contexts/NostrContext';

import { getGlobalRelayPool } from '../utils/nostr/relayConnectionPool';
import { QueryClient } from '@tanstack/react-query';

// Note: Removed custom IndexedDB contacts operations - using TanStack Query instead
import { generateFilterHash } from '../utils/nostr/filterHash';
import { isNsfwNote } from '../utils/nsfwFilter';
import type { Note, Metadata, Contact, MetadataStatus } from '../types/nostr/types';

export interface NostrOperationsConfig {
  isPageVisible: boolean;
  isFetchingPage: boolean;
  isRateLimited: boolean;
  setIsRateLimited: React.Dispatch<React.SetStateAction<boolean>>;
  setIsInitialized: React.Dispatch<React.SetStateAction<boolean>>;
  notes: Note[];
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>;
  currentIndex: number;
  updateCurrentIndex: (newIndex: number) => void;
  setCurrentIndex: React.Dispatch<React.SetStateAction<number>>;
  displayIndex: number;
  setDisplayIndex: React.Dispatch<React.SetStateAction<number>>;
  setHasMorePages: React.Dispatch<React.SetStateAction<boolean>>;
  setIsFetchingPage: React.Dispatch<React.SetStateAction<boolean>>;
  metadata: Record<string, Metadata>;
  setMetadata: React.Dispatch<React.SetStateAction<Record<string, Metadata>>>;
  setContacts: React.Dispatch<React.SetStateAction<Contact[]>>;
  setIsLoadingContacts: React.Dispatch<React.SetStateAction<boolean>>;
  setContactLoadError: React.Dispatch<React.SetStateAction<string | null>>;
  setContactStatus: React.Dispatch<React.SetStateAction<string>>;
  setCacheStats: React.Dispatch<React.SetStateAction<{ 
    notesCount: number; 
    metadataCount: number; 
    contactsCount: number; 
    asciiCacheCount: number;
    zapTotalsCount: number;
  }>>;
  showReplies: boolean;
  showReposts: boolean;
  nsfwBlock: boolean;
  customHashtags: string[];
  // Long form feed mode (NIP-23)
  longFormMode?: boolean;
  contacts: Contact[];
  mutedPubkeys: string[];
  isMobile: boolean;
  isCheckingForNewNotes: boolean;
  setIsCheckingForNewNotes: React.Dispatch<React.SetStateAction<boolean>>;
  newNotesFound: number;
  setNewNotesFound: React.Dispatch<React.SetStateAction<number>>;
  showNoNewNotesMessage: boolean;
  setShowNoNewNotesMessage: React.Dispatch<React.SetStateAction<boolean>>;
  // Active relay URLs to use for queries/subscriptions
  relayUrls: string[];
  // Optional callback to surface a UI message when there are no relays configured
  onNoRelays?: () => void;
  // Display name functions
  fetchDisplayNames: (pubkeys: string[]) => Promise<void>;
  addDisplayNamesFromMetadata: (metadataMap: Record<string, Metadata>) => void;
  getPubkeysNeedingFetch: (pubkeys: string[]) => string[];
  // TanStack Query client for cache invalidation
  queryClient: QueryClient;
}

export interface NostrOperations {
  withRateLimit: <T>(fn: () => Promise<T>) => Promise<T>
  cleanupSubscription: (sub: { close: () => void } | null) => void;
  cleanupAllSubscriptions: () => void;
  handleError: (error: unknown, context: string) => void;
  getPageSize: () => number;
  getCurrentFilterHash: () => string;
  buildNotesFilter: (until?: number) => Filter;
  buildFollowFilterRelays: (baseRelays: string[]) => string[];
  resetPaginationState: () => void;
  fetchNotesPage: (until?: number) => Promise<void>;
  fetchMetadataChunk: (pubkeys: string[]) => Promise<void>;
  loadMoreNotes: () => Promise<void>;
  checkForNewNotes: () => Promise<void>;
  refreshFeed: () => Promise<void>;
  loadCachedContactMetadata: (contactList: Contact[]) => Promise<void>;
  fetchContactMetadata: (pubkeys: string[]) => Promise<void>;
  handleContactMetadataLoaded: (pubkey: string) => void;
  getContacts: () => Contact[];
  initDB: () => void;
}

const MIN_REQUEST_INTERVAL = 100;
const MAX_CONCURRENT_REQUESTS = 5;

export const useNostrOperations = (config: NostrOperationsConfig): NostrOperations => {
  const { nostrClient } = useContext(NostrContext);
  // Use the relay URLs supplied by the feed/relay manager
  const relayUrls = config.relayUrls;

  const assertRelaysAvailable = useCallback(() => {
    if (!relayUrls || relayUrls.length === 0) {
      // Inform UI and prevent attempting a network call without relays
      try { config.onNoRelays && config.onNoRelays(); } catch {}
      throw new Error('No relays configured');
    }
  }, [relayUrls, config.onNoRelays]);
  
  // Refs for managing subscriptions and rate limiting
  const mainSubRef = useRef<{ close: () => void } | null>(null);
  const metadataSubRef = useRef<{ close: () => void } | null>(null);
  const lastRequestTimeRef = useRef<number>(0);
  const activeRequestsRef = useRef<number>(0);

  const lastEventCreatedAtRef = useRef<number>(Math.floor(Date.now() / 1000) - 3600);
  const oldestCreatedAtRef = useRef<number | null>(null);
  const initializedFiltersRef = useRef<Set<string>>(new Set());
  const initialPageFetchedRef = useRef<Set<string>>(new Set());

  const metadataStatusRef = useRef<Record<string, MetadataStatus>>({});
  
  const withRateLimit = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTimeRef.current;
    
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      const delay = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    if (activeRequestsRef.current >= MAX_CONCURRENT_REQUESTS) {
      throw new Error('Too many concurrent requests');
    }
    
    activeRequestsRef.current++;
    lastRequestTimeRef.current = Date.now();
    
    try {
      return await fn();
    } finally {
      activeRequestsRef.current--;
    }
  }, []);

  const cleanupSubscription = useCallback((sub: { close: () => void } | null) => {
    if (sub) {
      try {
        sub.close();
      } catch (e) {
        console.warn('Error closing subscription:', e);
      }
    }
  }, []);

  const cleanupAllSubscriptions = useCallback(() => {
    cleanupSubscription(mainSubRef.current);
    cleanupSubscription(metadataSubRef.current);
    mainSubRef.current = null;
    metadataSubRef.current = null;
  }, [cleanupSubscription]);

  const handleError = useCallback((error: unknown, context: string): void => {
    if (error instanceof Error) {
      console.error(`Error in ${context}:`, error.message);
    } else {
      console.error(`Unknown error in ${context}:`, error);
    }
  }, []);

  const getPageSize = useCallback(() => {
    // Larger page sizes are more efficient with Nostr relays
    // Increased from 20/50 to 50/100 for better relay efficiency
    const size = config.isMobile ? 50 : 100;
    // console.log('getPageSize: isMobile =', config.isMobile, 'size =', size);
    return size;
  }, [config.isMobile]);

  const getCurrentFilterHash = useCallback((): string => {
    return generateFilterHash({
      showReplies: config.showReplies,
      showReposts: config.showReposts,
      nsfwBlock: config.nsfwBlock,
      customHashtags: config.customHashtags,
      contacts: config.contacts,
      mutedPubkeys: config.mutedPubkeys,
      longFormMode: config.longFormMode
    });
  }, [config.showReplies, config.showReposts, config.nsfwBlock, config.customHashtags, config.contacts, config.mutedPubkeys, config.longFormMode]);

  const buildNotesFilter = useCallback((until?: number): Filter => {
    // Safely handle custom hashtags array
    const safeCustomHashtags = Array.isArray(config.customHashtags) 
      ? config.customHashtags.filter(tag => typeof tag === 'string' && tag.trim().length > 0)
      : [];
      
    const hashtagFilters = [
      ...safeCustomHashtags
    ];

    const base: Filter = {
      kinds: [config.longFormMode ? 30023 : 1],
      limit: getPageSize(),
      ...(until ? { until } : {}),
      ...((hashtagFilters.length > 0) ? { '#t': hashtagFilters } : {})
    };
    
    // Reduced debug logging to prevent console spam
    if (import.meta.env.DEV && Math.random() < 0.1) {
      console.log('🔍 FINAL FILTER:', base);
    }
    
    return base;
  }, [getPageSize, config.customHashtags, config.longFormMode]);

  // Build relay list that includes contact-specific relays
  const buildFollowFilterRelays = useCallback((baseRelays: string[]): string[] => {
    if (!config.contacts || !Array.isArray(config.contacts)) {
      return baseRelays;
    }

    const contactRelays = new Set<string>();
    config.contacts.forEach(contact => {
      if (contact.relay && typeof contact.relay === 'string' && contact.relay.trim()) {
        contactRelays.add(contact.relay.trim());
      }
    });
    
    const allRelays = [...baseRelays, ...Array.from(contactRelays)];
    return [...new Set(allRelays)]; // Remove duplicates
  }, [config.contacts]);

  const resetPaginationState = useCallback(() => {

    // For fetching recent notes, set until to current time to get the most recent notes
    // This ensures we fetch notes up to the current moment
    lastEventCreatedAtRef.current = Math.floor(Date.now() / 1000);
    oldestCreatedAtRef.current = null;
    config.setHasMorePages(true);
    config.setIsFetchingPage(false);
    config.setNotes([]);
    
    // Clear filter tracking
    initializedFiltersRef.current.clear();
    initialPageFetchedRef.current.clear();
  }, [config.setHasMorePages, config.setIsFetchingPage, config.setNotes]);

  const fetchMetadataChunk = useCallback(async (pubkeys: string[]) => {
    if (!nostrClient || pubkeys.length === 0) return;

    try {
      await withRateLimit(async () => {
        assertRelaysAvailable();
        const pool = getGlobalRelayPool();
        const filter: Filter = {
          kinds: [0],
          authors: pubkeys,
          limit: pubkeys.length
        };

        const events = await pool.querySync(relayUrls, filter);

        // Keep only the newest event per pubkey
        const latestByPubkey = new Map<string, Event>();
        for (const ev of events) {
          const existing = latestByPubkey.get(ev.pubkey);
          if (!existing || (ev.created_at || 0) > (existing.created_at || 0)) {
            latestByPubkey.set(ev.pubkey, ev);
          }
        }

        const newMetadata: Record<string, Metadata> = {};
        latestByPubkey.forEach((event, pubkey) => {
          try {
            const content = JSON.parse(event.content || '{}');
            newMetadata[pubkey] = {
              name: content.name || '',
              display_name: content.display_name || content.displayName || '',
              about: content.about || '',
              picture: content.picture || '',
              banner: content.banner || '',
              website: content.website || '',
              lud16: content.lud16 || '',
              nip05: content.nip05 || '',
            };
          } catch (e) {
            console.warn('Failed to parse metadata for pubkey:', pubkey, e);
          }
        });

        // Update metadata status
        pubkeys.forEach(pubkey => {
          if (newMetadata[pubkey]) {
            metadataStatusRef.current[pubkey] = {
              status: 'success',
              attempts: 1,
              lastAttempt: Date.now()
            };
          } else {
            const currentStatus = metadataStatusRef.current[pubkey];
            metadataStatusRef.current[pubkey] = {
              status: 'failed',
              attempts: (currentStatus?.attempts || 0) + 1,
              lastAttempt: Date.now()
            };
          }
        });

        // Update state with new metadata
        if (Object.keys(newMetadata).length > 0) {
          config.setMetadata(prev => ({ ...prev, ...newMetadata }));
          config.addDisplayNamesFromMetadata(newMetadata);
        }
      });
    } catch (error) {
      handleError(error, 'fetchMetadataChunk');
    }
  }, [nostrClient, withRateLimit, assertRelaysAvailable, relayUrls, config.setMetadata, config.addDisplayNamesFromMetadata, handleError]);

  const fetchNotesPage = useCallback(async (until?: number) => {
    if (!nostrClient || config.isFetchingPage) return;

    try {
      config.setIsFetchingPage(true);
      
      await withRateLimit(async () => {
        assertRelaysAvailable();
        
        const filter = buildNotesFilter(until);

        const pool = getGlobalRelayPool();
        const events = await pool.querySync(relayUrls, filter);

        // Filter out notes we already have and apply image-only filtering
        const existingIds = new Set(config.notes.map(note => note.id));
        let newEvents = events.filter(event => !existingIds.has(event.id));
        
        // Apply NSFW filtering (always filter NSFW content)
        newEvents = newEvents.filter(event => {
          if (!event.content || event.content.trim().length === 0) return false;
          
          // Check for replies (notes with 'e' tags)
          const hasETag = event.tags?.some(tag => tag[0] === 'e');
          if (!config.showReplies && hasETag) return false;
          
          // Check for reposts (notes with 'a' tags or specific content patterns)
          const hasATag = event.tags?.some(tag => tag[0] === 'a');
          const isRepost = hasATag || event.content.includes('nostr:');
          if (!config.showReposts && isRepost) return false;
          
          // Apply NSFW filtering
          if (config.nsfwBlock && isNsfwNote({ content: event.content, tags: event.tags, pubkey: event.pubkey })) return false;

          // Apply mute filtering
          if (config.mutedPubkeys.includes(event.pubkey)) return false;

          return true;
        });

        // Convert events to notes and sort by creation time
        const newNotes: Note[] = newEvents.map(event => ({
          id: event.id,
          pubkey: event.pubkey,
          created_at: event.created_at || 0,
          content: event.content || '',
          tags: event.tags || [],
          sig: event.sig || '',
          kind: event.kind || 1,
          imageUrls: [],
          videoUrls: [],
          receivedAt: Date.now(),
        })).sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

        // Update notes state
        if (newNotes.length > 0) {
          config.setNotes(prev => {
            const combined = [...prev, ...newNotes];
            // Sort by creation time (newest first)
            return combined.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
          });

          // Update pagination state
          const oldestNote = newNotes[newNotes.length - 1];
          if (oldestNote && oldestNote.created_at) {
            oldestCreatedAtRef.current = oldestNote.created_at;
          }

          // Track the newest note we've seen
          const newestNote = newNotes[0];
          if (newestNote && newestNote.created_at) {
            lastEventCreatedAtRef.current = Math.max(lastEventCreatedAtRef.current, newestNote.created_at);
          }

          // Fetch metadata for new note authors
          const pubkeysToFetch = Array.from(new Set(newNotes.map(note => note.pubkey)));
          
          // Check which pubkeys need display names
          const pubkeysNeedingFetch = config.getPubkeysNeedingFetch(pubkeysToFetch);
          if (pubkeysNeedingFetch.length > 0) {

            config.fetchDisplayNames(pubkeysNeedingFetch);
          }
          
          // AGGRESSIVE METADATA CACHING: Fetch full metadata for all pubkeys encountered
          const pubkeysNeedingMetadata = pubkeysToFetch.filter(pubkey => {
            const status = metadataStatusRef.current[pubkey];
            return !config.metadata[pubkey] && 
                   (!status || 
                    status.status === 'failed' && 
                    status.attempts < 3 &&
                    (!status.lastAttempt || Date.now() - status.lastAttempt > 30000)); // 30 second retry
          });
          
          if (pubkeysNeedingMetadata.length > 0) {

            // Split into chunks to avoid overwhelming relays
            const chunkSize = 10;
            const chunks = [];
            for (let i = 0; i < pubkeysNeedingMetadata.length; i += chunkSize) {
              chunks.push(pubkeysNeedingMetadata.slice(i, i + chunkSize));
            }
            
            // Fetch metadata for each chunk with delay between chunks
            chunks.forEach((chunk, index) => {
              setTimeout(() => {
                fetchMetadataChunk(chunk);
              }, index * 1000); // 1 second delay between chunks
            });
          }
        }

        // Do not prematurely mark end-of-list when fewer than a full page arrives;
        // relays may be slow or have sparse results. We'll only set hasMorePages=false
        // when a page returns zero events.
      });
    } catch (error) {
      handleError(error, 'fetchNotesPage');
      config.setHasMorePages(false);
    } finally {
      config.setIsFetchingPage(false);
    }
  }, [nostrClient, config, withRateLimit, buildNotesFilter, relayUrls, getPageSize, handleError, assertRelaysAvailable, fetchMetadataChunk]);

  const loadMoreNotes = useCallback(async () => {
    if (!config.isPageVisible || config.isFetchingPage || !oldestCreatedAtRef.current) {
      return;
    }
    
    const untilExclusive = Math.max(0, oldestCreatedAtRef.current - 1);

    await fetchNotesPage(untilExclusive);
  }, [config.isPageVisible, config.isFetchingPage, fetchNotesPage]);

  const checkForNewNotes = useCallback(async () => {
    if (!nostrClient || config.isCheckingForNewNotes || !config.isPageVisible) {
      return;
    }

    try {
      config.setIsCheckingForNewNotes(true);

      // Reset the new notes found count at the start of each refresh
      config.setNewNotesFound(0);

      await withRateLimit(async () => {
        assertRelaysAvailable();

        // Check if we have cached feed data available in TanStack Query
        const currentFilterHash = getCurrentFilterHash();
        const queryKey = ['feed', 'notes', currentFilterHash, relayUrls.join('|'), getPageSize()];

        // Check if we have cached data for this filter
        const cachedData = config.queryClient.getQueryData(queryKey);

        // If we have no local notes but have cached data, this means we need to restore from cache
        if (config.notes.length === 0 && cachedData) {

          // Invalidate this specific query to trigger a refetch from cache
          config.queryClient.invalidateQueries({
            queryKey: queryKey
          });
          // Force a refetch to ensure we get fresh data
          await config.queryClient.refetchQueries({
            queryKey: queryKey
          });
          return;
        }

        // If we have no notes at all (no cache, no local), this is a true initial load
        if (config.notes.length === 0 && !cachedData) {

          // Invalidate all feed queries for this filter to trigger fresh fetch
          config.queryClient.invalidateQueries({
            queryKey: ['feed', 'notes', currentFilterHash]
          });
          // Force a refetch to ensure we get fresh data
          await config.queryClient.refetchQueries({
            queryKey: ['feed', 'notes', currentFilterHash]
          });
          return;
        }

        // For cases where we have some notes, we need to:
        // 1. Refresh the existing feed to ensure it's up-to-date
        // 2. Check for newer notes beyond what we have

        // First, invalidate and refetch the current feed to ensure it's fresh
        config.queryClient.invalidateQueries({
          queryKey: queryKey
        });
        await config.queryClient.refetchQueries({
          queryKey: queryKey
        });

        // Get the timestamp of our newest note after potential refresh
        const currentNotes = config.notes;
        const newestNoteTimestamp = currentNotes[0]?.created_at;
        if (!newestNoteTimestamp) {

          return;
        }

        // Create a filter to find notes newer than our newest note
        const newNotesFilter = {
          ...buildNotesFilter(),
          since: newestNoteTimestamp + 1, // Start from just after our newest note
          limit: 50 // Check for up to 50 newer notes
        };

        const pool = getGlobalRelayPool();
        const events = await pool.querySync(relayUrls, newNotesFilter);

        // Filter out notes we already have and apply image-only filtering
        const existingIds = new Set(currentNotes.map(note => note.id));
        let newEvents = events.filter(event => !existingIds.has(event.id));

        // Apply NSFW filtering (always filter NSFW content)
        newEvents = newEvents.filter(event => {
          if (!event.content || event.content.trim().length === 0) return false;

          // Check for replies (notes with 'e' tags)
          const hasETag = event.tags?.some(tag => tag[0] === 'e');
          if (!config.showReplies && hasETag) return false;

          // Check for reposts (notes with 'a' tags or specific content patterns)
          const hasATag = event.tags?.some(tag => tag[0] === 'a');
          const isRepost = hasATag || event.content.includes('nostr:');
          if (!config.showReposts && isRepost) return false;

          // Apply NSFW filtering
          if (config.nsfwBlock && isNsfwNote({ content: event.content, tags: event.tags, pubkey: event.pubkey })) return false;

          // Apply mute filtering
          if (config.mutedPubkeys.includes(event.pubkey)) return false;

          return true;
        });

        if (newEvents.length > 0) {
          // Convert events to notes and sort by creation time
          const newNotes: Note[] = newEvents.map(event => ({
            id: event.id,
            pubkey: event.pubkey,
            created_at: event.created_at || 0,
            content: event.content || '',
            tags: event.tags || [],
            sig: event.sig || '',
            kind: event.kind || 1,
            imageUrls: [],
            videoUrls: [],
            receivedAt: Date.now(),
          })).sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

          // Add new notes to the beginning of the list and adjust current index
          config.setNotes(prev => {
            const combined = [...newNotes, ...prev];
            // Sort by creation time (newest first)
            return combined.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
          });

          // Reset current index to 0 and display index to 1 so user can view the newly added notes
          config.updateCurrentIndex(0);
          config.setDisplayIndex(1);

          // Update the count of new notes found
          config.setNewNotesFound(newEvents.length);

          // Clear the count after 3 seconds
          setTimeout(() => config.setNewNotesFound(0), 3000);
        } else {

          config.setShowNoNewNotesMessage(true);
          setTimeout(() => config.setShowNoNewNotesMessage(false), 2000);
        }
      });
    } catch (error) {
      console.error('checkForNewNotes: error occurred:', error);
      handleError(error, 'checkForNewNotes');
      config.setShowNoNewNotesMessage(true);
      setTimeout(() => config.setShowNoNewNotesMessage(false), 2000);
    } finally {
      config.setIsCheckingForNewNotes(false);
    }
  }, [nostrClient, config, withRateLimit, buildNotesFilter, relayUrls, getCurrentFilterHash, getPageSize, handleError, assertRelaysAvailable]);

  const refreshFeed = useCallback(async () => {
    if (!nostrClient || config.isCheckingForNewNotes || !config.isPageVisible) {
      return;
    }

    try {
      config.setIsCheckingForNewNotes(true);

      // Reset local UI state first to avoid index/length mismatches
      config.setNotes([]);
      config.setCurrentIndex(0);
      config.setDisplayIndex(1);
      config.setHasMorePages(true);
      resetPaginationState();

      // Get current filter configuration
      const currentFilterHash = getCurrentFilterHash();
      const relayKey = config.relayUrls ? config.relayUrls.join('|') : '';
      const pageSize = getPageSize();
      const queryKey = ['feed', 'notes', currentFilterHash, relayKey, pageSize];

      // For follow filter, wait for contacts to be loaded if needed
      if (config.contacts && config.contacts.length > 0) {
        const contacts = config.contacts || [];
        if (contacts.length === 0) {
          console.log('🔄 Refresh: waiting for contacts to load for follow filter...');
          // Wait up to 3 seconds for contacts to load
          let waitTime = 0;
          const maxWait = 3000;
          const checkInterval = 200;
          
          while (waitTime < maxWait && (!config.contacts || config.contacts.length === 0)) {
            await new Promise(resolve => setTimeout(resolve, checkInterval));
            waitTime += checkInterval;
          }
          
          if (waitTime >= maxWait) {
            console.warn('🔄 Refresh: timeout waiting for contacts');
          } else {
            console.log(`🔄 Refresh: contacts loaded after ${waitTime}ms`);
          }
        }
      }

      // Cancel any ongoing queries
      await config.queryClient.cancelQueries({ queryKey: ['feed'] });
      
      // Remove all cached feed data to ensure fresh fetch
      config.queryClient.removeQueries({ queryKey: ['feed'] });
      
      // Reset the specific query to ensure it starts fresh
      config.queryClient.resetQueries({ queryKey, exact: true });
      
      // Force refetch the current query
      await config.queryClient.refetchQueries({
        queryKey,
        exact: true,
      });

      console.log('🔄 Feed refresh completed for filter:', currentFilterHash?.slice(0, 8));

    } catch (error) {
      console.error('refreshFeed: error occurred:', error);
      handleError(error, 'refreshFeed');
    } finally {
      config.setIsCheckingForNewNotes(false);
    }
  }, [nostrClient, config, getCurrentFilterHash, resetPaginationState, handleError, getPageSize]);

  const loadCachedContactMetadata = useCallback(async (contactList: Contact[]) => {
    if (!contactList || contactList.length === 0) return;
    
    const pubkeys = contactList.map(contact => contact.pubkey);
    const pubkeysNeedingFetch = config.getPubkeysNeedingFetch(pubkeys);
    
    if (pubkeysNeedingFetch.length > 0) {

      config.fetchDisplayNames(pubkeysNeedingFetch);
    }
  }, [config.getPubkeysNeedingFetch, config.fetchDisplayNames]);

  const fetchContactMetadata = useCallback(async (pubkeys: string[]) => {
    if (!pubkeys || pubkeys.length === 0) return;
    
    const pubkeysNeedingFetch = config.getPubkeysNeedingFetch(pubkeys);
    if (pubkeysNeedingFetch.length > 0) {

      config.fetchDisplayNames(pubkeysNeedingFetch);
    }
  }, [config.getPubkeysNeedingFetch, config.fetchDisplayNames]);

  const handleContactMetadataLoaded = useCallback((_pubkey: string) => {
    // This function is called when contact metadata is loaded
    // We can use this to trigger additional actions if needed

  }, []);

  const initDB = useCallback(() => {
    // Note: Database initialization is now handled by TanStack Query persistence

  }, []);

  const getContacts = useCallback(() => {
    return config.contacts || [];
  }, [config.contacts]);

  return {
    withRateLimit,
    cleanupSubscription,
    cleanupAllSubscriptions,
    handleError,
    getPageSize,
    getCurrentFilterHash,
    buildNotesFilter,
    buildFollowFilterRelays,
    resetPaginationState,
    fetchNotesPage,
    fetchMetadataChunk,
    loadMoreNotes,
    checkForNewNotes,
    refreshFeed,
    loadCachedContactMetadata,
    fetchContactMetadata,
    handleContactMetadataLoaded,
    getContacts,
    initDB,
  };
};
