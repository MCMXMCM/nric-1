import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { type Event, type Filter } from 'nostr-tools'
import { useMemo, useRef, useCallback, useEffect, useState } from 'react'
import type { Note, Contact } from '../types/nostr/types'
import { extractImageUrls, extractVideoUrls } from '../utils/nostr/utils'
import { isNsfwNote } from '../utils/nsfwFilter'
import { CACHE_KEYS } from '../utils/cacheKeys'
import { useAdaptiveRelayPool } from './useAdaptiveRelayPool'
import { useOutboxRelayManager } from './useOutboxRelayManager'

// Persisting feed pages to IndexedDB is no longer needed; TanStack Persist handles it.

// Rate limiting constants to prevent excessive concurrent requests
const MIN_REQUEST_INTERVAL = 150; // Optimized from 200ms for better responsiveness
const MAX_CONCURRENT_REQUESTS = 3; // Increased from 2 for better throughput

export interface FeedFilters {
  showReplies: boolean
  showReposts: boolean
  nsfwBlock: boolean
  filterByFollow: boolean
  customHashtags: string[]
  contacts: Contact[]
}

export interface UseFeedQueryArgs {
  nostrClient: any
  relayUrls: string[]
  filterHash: string
  relayKey: string
  pageSize: number
  buildFilter: (until?: number) => Filter
  showReplies: boolean
  showReposts: boolean
  mutedPubkeys?: string[]
  enabled?: boolean
  shouldFetchNewData?: boolean
  // Real-time options for new notes counter
  realtimeEnabled?: boolean
  onNewNoteReceived?: (note: Note) => void
}

export function useFeedQuery({
  nostrClient,
  relayUrls,
  filterHash,
  relayKey,
  pageSize,
  buildFilter,
  showReplies,
  showReposts,
  mutedPubkeys = [],
  enabled = true,
  shouldFetchNewData = true,
  realtimeEnabled = false,
  onNewNoteReceived,
}: UseFeedQueryArgs) {
  
  // Initialize outbox relay manager for discovery
  const { discoverOutboxEvents } = useOutboxRelayManager({
    autoInitialize: true
  });
  
  // Use adaptive relay pool based on outbox mode setting
  const adaptivePool = useAdaptiveRelayPool(relayUrls);
  
  const queryClient = useQueryClient()

  // Rate limiting refs to prevent excessive concurrent requests
  const lastRequestTimeRef = useRef<number>(0);
  const activeRequestsRef = useRef<number>(0);

  // Real-time state for new notes counter
  const [bufferedNotes, setBufferedNotes] = useState<Note[]>([]);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const subscriptionRef = useRef<{ close: () => void } | null>(null);
  const seenNoteIds = useRef<Set<string>>(new Set());

  // Track previous query key to cancel old queries and prevent overlap
  const previousQueryKeyRef = useRef<readonly unknown[] | null>(null);

  // Stable query key for this filter + relay set using centralized cache key factory
  const queryKey = useMemo(
    () => CACHE_KEYS.FEED.NOTES(filterHash, relayKey, pageSize),
    [filterHash, relayKey, pageSize]
  )

  // ✅ Simplified enabled condition - no competing restoration systems
  const queryEnabled = useMemo(() => {
    const baseEnabled = Boolean(nostrClient && relayUrls && relayUrls.length > 0) && enabled;
    
    // Reset error state to allow retry if conditions are met
    if (baseEnabled) {
      const existingQuery = queryClient.getQueryState(queryKey);
      if (existingQuery && existingQuery.status === 'error') {
        console.log('🔄 Resetting error state to allow retry');
        queryClient.resetQueries({ queryKey, exact: true });
      }
    }
    
    return baseEnabled;
  }, [nostrClient, relayUrls, enabled, queryClient, queryKey]);

  // Rate limiting function to prevent excessive concurrent requests
  const withRateLimit = async <T,>(fn: () => Promise<T>): Promise<T> => {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTimeRef.current;
    
    // Wait if we need to throttle requests
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      const delay = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    // Check concurrent request limit
    if (activeRequestsRef.current >= MAX_CONCURRENT_REQUESTS) {
      throw new Error('Too many concurrent requests to relays');
    }
    
    activeRequestsRef.current++;
    lastRequestTimeRef.current = Date.now();
    
    try {
      return await fn();
    } finally {
      activeRequestsRef.current--;
    }
  };

  // Check if returning from navigation to prevent unnecessary refetches
  const isReturningFromNavigation = useMemo(() => {
    try {
      if (typeof window === 'undefined') return false;
      const routerState = window.history.state?.state as any;
      return routerState?.fromFeed || routerState?.restoreIndex !== undefined;
    } catch {
      return false;
    }
  }, []);

  // Inspect current query state to determine cached data quality and freshness
  const queryState = queryClient.getQueryState(queryKey);
  const hasMeaningfulCachedData = useMemo(() => {
    const data: any = (queryState as any)?.data;
    return Boolean(
      data && Array.isArray(data.pages) && data.pages.some((p: any) => (p?.notes?.length || 0) > 0)
    );
  }, [queryState]);

  const dataUpdatedAt = (queryState as any)?.dataUpdatedAt as number | undefined;

  const refetchOnMountValue = useMemo(() => {
    // If returning from navigation and we have meaningful cached data, do not refetch
    if (isReturningFromNavigation && hasMeaningfulCachedData) {
      return false as const;
    }

    // If no meaningful cached data, force refetch
    if (!hasMeaningfulCachedData) {
      return 'always' as const;
    }

    // If data is still fresh, skip refetch
    if (dataUpdatedAt && Date.now() - dataUpdatedAt < 2 * 60 * 1000) {
      return false as const;
    }

    // Fallback to shouldFetchNewData
    return shouldFetchNewData ? 'always' : false;
  }, [isReturningFromNavigation, hasMeaningfulCachedData, dataUpdatedAt, shouldFetchNewData]);

  const infiniteQuery = useInfiniteQuery({
    queryKey,
    enabled: queryEnabled,
    initialPageParam: undefined as number | undefined,
    
    // ✅ Smart refetch control based on navigation context
    refetchOnMount: refetchOnMountValue,
    
    refetchOnWindowFocus: false,
    refetchOnReconnect: shouldFetchNewData, // Only refetch on reconnect if shouldFetchNewData is true
    
    // ✅ Keep previous data during navigation to prevent flashing
    placeholderData: (previousData) => {
      // Keep previous data only if it contains meaningful content
      if (isReturningFromNavigation && previousData) {
        const data: any = previousData as any;
        const hasMeaningfulData = Boolean(
          data && Array.isArray(data.pages) && data.pages.some((p: any) => (p?.notes?.length || 0) > 0)
        );
        if (hasMeaningfulData) {
          console.log('📋 Using placeholder data from previous navigation (has data)');
          return previousData;
        }
        // Return undefined to avoid locking UI into an empty placeholder state
        return undefined as any;
      }
      
      return previousData;
    },
    
    // PERFORMANCE FIX: Optimized cache times for mobile performance
    gcTime: 15 * 60 * 1000, // 15 minutes (reduced from 30 to save memory)
    staleTime: 2 * 60 * 1000, // 2 minutes (reduced from 5 to prevent stale data)
    queryFn: async ({ pageParam }): Promise<{ notes: Note[]; loaded: number }> => {
      if (!nostrClient || !relayUrls || relayUrls.length === 0) {
        return { notes: [], loaded: 0 }
      }

      return await withRateLimit(async () => {
        const filter = buildFilter(pageParam)
        
        const events: Event[] = await adaptivePool.querySync(relayUrls, filter)
        
        if (!events || events.length === 0) {
          return { notes: [], loaded: 0 }
        }

        // Convert events to notes and cache them individually
        const filteredEvents = events.filter((event: Event) => {
          return event.content && event.content.trim().length > 0;
        });
        
        const notes: Note[] = filteredEvents
          .map((event: Event) => {
            const imageUrls = extractImageUrls(event.content)
            const videoUrls = extractVideoUrls(event.content)
            
            const note: Note = {
              id: event.id,
              pubkey: event.pubkey,
              content: event.content,
              created_at: event.created_at,
              kind: (event as any).kind,
              tags: event.tags || [],
              imageUrls,
              videoUrls,
              receivedAt: Date.now()
            }

            // Cache the note individually for reuse across contexts
            queryClient.setQueryData(CACHE_KEYS.NOTE(note.id), note)
            
            return note
          })
          .sort((a, b) => b.created_at - a.created_at)

        return { notes, loaded: notes.length }
      })
    },
    getNextPageParam: (lastPage, allPages) => {
      // Don't stop pagination just because we got fewer notes than requested
      // Stop only if we get zero notes (truly no more content available)
      if (!lastPage || (lastPage as any).notes?.length === 0) {
        console.log(`🛑 Feed pagination stopped: no more notes available`);
        return undefined;
      }
      
      const oldest = (lastPage as any).notes?.[(lastPage as any).notes.length - 1]?.created_at;
      if (!oldest) return undefined;
      
      // Calculate how many raw notes we've fetched vs how many are visible after filtering
      const totalRawNotes = allPages.reduce((sum, page) => sum + ((page as any).notes?.length || 0), 0);
      const pageCount = allPages.length;
      
      // For follow filters, be more lenient with pagination limits since contact activity might be sparse
      const filter = buildFilter();
      const isFollowFilter = filter.authors && filter.authors.length > 0;
      
      // More generous age limits to avoid stopping prematurely
      const MAXIMUM_AGE_DAYS = isFollowFilter ? 180 : 90; // Extended time limits
      const maximumAgeTimestamp = Date.now() / 1000 - (MAXIMUM_AGE_DAYS * 24 * 60 * 60);
      
      // Only stop for age if we're very old AND have fetched a reasonable amount
      if (oldest < maximumAgeTimestamp && (totalRawNotes as number) > 100) {
        console.log(`🛑 Feed pagination stopped: reached ${MAXIMUM_AGE_DAYS}-day limit with ${totalRawNotes} notes (follow filter: ${isFollowFilter})`);
        return undefined;
      }
      
      // For follow filters, also check if we've loaded a reasonable amount of notes
      // If we have very few notes after multiple pages, keep trying a bit longer
      if (isFollowFilter) {
        // If we have less than 20 notes after 10 pages, keep trying up to 30 pages
        if ((totalRawNotes as number) < 20 && pageCount < 30) {
          console.log(`🔄 Follow filter: continuing pagination (${totalRawNotes} notes after ${pageCount} pages)`);
          return Math.max(0, oldest - 1);
        }
        
        // If we have less than 100 notes after 20 pages, keep trying up to 50 pages
        if ((totalRawNotes as number) < 100 && pageCount < 50) {
          console.log(`🔄 Follow filter: continuing pagination (${totalRawNotes} notes after ${pageCount} pages)`);
          return Math.max(0, oldest - 1);
        }
      }
      
 else if ((totalRawNotes as number) > 500 && pageCount < 100) {
        // For other aggressive filtering scenarios (follow filter with sparse activity)
        // If we've fetched 500+ raw notes but still need more, keep trying up to 100 pages
        console.log(`🔄 Aggressive filtering detected: continuing pagination (${totalRawNotes} raw notes after ${pageCount} pages)`);
        return Math.max(0, oldest - 1);
      }
      
      // Much more generous page limits to avoid stopping too early
      // User reported stopping at 80 notes, so let's be much more generous
      const maxPages = isFollowFilter ? 200 : 150; // Increased significantly
      if (pageCount < maxPages) {
        // Reduced debug logging to prevent console spam
        if (import.meta.env.DEV && Math.random() < 0.1) {
          console.log(`🔄 Continuing pagination: ${pageCount}/${maxPages} pages, ${totalRawNotes} notes`);
        }
        return Math.max(0, oldest - 1);
      }
      
      console.log(`🛑 Feed pagination stopped: reached page limit (${pageCount}/${maxPages} pages, ${totalRawNotes} notes)`);
      return undefined;
    },
    retry: (failureCount, error) => {
      // Don't retry if relays are unavailable
      if (!relayUrls || relayUrls.length === 0) {
        return false;
      }
      
      // Retry up to 3 times with exponential backoff
      if (failureCount < 3) {

        return true;
      }
      
      console.warn(`❌ Feed query failed after ${failureCount} attempts for filter ${filterHash?.slice(0, 8)}:`, error);
      return false;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff, max 30s
  })

  // Prevent overlapping requests when filters/relays/page size change
  useEffect(() => {
    const prevKey = previousQueryKeyRef.current;
    if (prevKey && JSON.stringify(prevKey) !== JSON.stringify(queryKey)) {
      try {
        console.log('🛑 Cancelling previous feed queries on key change');
        queryClient.cancelQueries({ queryKey: prevKey as any, exact: true });
      } catch {}
    }

    // Reset rate limiter and transient buffers on key change
    console.log('♻️ Resetting feed query rate limiter and buffers');
    activeRequestsRef.current = 0;
    lastRequestTimeRef.current = 0;
    setBufferedNotes([]);
    seenNoteIds.current.clear();

    previousQueryKeyRef.current = queryKey;
    // Optional: gently nudge the new query if it's active but idle
    const state = queryClient.getQueryState(queryKey);
    if (state && state.status === 'pending') {
      setTimeout(() => {
        queryClient.refetchQueries({ queryKey, exact: true, type: 'active' });
      }, 50);
    }
  }, [queryKey, queryClient]);

  // Apply feed filters to the notes
  const filteredNotes = useMemo(() => {
    const pages = infiniteQuery.data?.pages ?? []
    const allNotes = pages.flatMap((p) => (p as any).notes || [])
    
    return allNotes.filter((note) => {
      if (!note.content || note.content.trim().length === 0) return false;
      
      // Check for replies (notes with 'e' tags)
      const hasETags = (note.tags || []).some((tag: any) => Array.isArray(tag) && tag[0] === 'e')
      if (hasETags && !showReplies) return false;
      
      // Check for reposts (kind 6, 16, or quote reposts with 'q' tags)
      const isRepost = note.kind === 6 || note.kind === 16
      const isQuoteRepost = note.kind === 1 && (note.tags || []).some((tag: any) => Array.isArray(tag) && tag[0] === 'q')
      if ((isRepost || isQuoteRepost) && !showReposts) return false;
      
      
      // Check for NSFW content (always filter NSFW content)
      if (isNsfwNote({ content: note.content, tags: note.tags || [], pubkey: note.pubkey })) return false;

      // Check for muted users
      if (mutedPubkeys.includes(note.pubkey)) return false;

      return true;
    });
  }, [infiniteQuery.data, showReplies, showReposts, mutedPubkeys])

  // Real-time WebSocket subscription for new notes counter
  useEffect(() => {
    if (!realtimeEnabled || !queryEnabled || !relayUrls.length) {
      // Clean up existing subscription if conditions not met
      if (subscriptionRef.current) {
        console.log('🔴 Feed query: Cleaning up real-time subscription - conditions not met');
        subscriptionRef.current.close();
        subscriptionRef.current = null;
        setIsRealtimeConnected(false);
      }
      return;
    }

    console.log('🔴 Feed query: Setting up real-time subscription', {
      relayUrls: relayUrls.length,
      filterHash,
      queryEnabled,
      realtimeEnabled
    });

    try {
      // Close existing subscription
      if (subscriptionRef.current) {
        subscriptionRef.current.close();
        subscriptionRef.current = null;
      }

      // Build real-time filter
      const filter = buildFilter();
      const realtimeFilter: Filter = {
        ...filter,
        since: Math.floor(Date.now() / 1000), // Only get notes from now forward
      };
      delete (realtimeFilter as any).limit; // Remove limit for real-time feed

      const subscription = adaptivePool.subscribeMany(relayUrls, [realtimeFilter], {
        onevent: (event: Event) => {
          console.log('🔴 Feed query: Real-time event received', {
            id: event.id.slice(0, 8),
            kind: event.kind,
            pubkey: event.pubkey.slice(0, 8),
            created_at: event.created_at,
            content: event.content?.slice(0, 50) + '...',
          });

          // Process the new event
          try {
            // Convert event to note format
            const note: Note = {
              id: event.id,
              pubkey: event.pubkey,
              content: event.content,
              created_at: event.created_at,
              kind: event.kind || 1,
              tags: event.tags || [],
              imageUrls: extractImageUrls(event.content),
              videoUrls: extractVideoUrls(event.content),
              receivedAt: Date.now()
            };

            // Check if we've already seen this note
            if (seenNoteIds.current.has(note.id)) {
              console.log('🔴 Feed query: Duplicate note ignored:', note.id.slice(0, 8));
              return;
            }

            seenNoteIds.current.add(note.id);

            // Apply filters to determine if note should be counted
            let shouldAddToBuffer = true;

            // Mute filter
            if (mutedPubkeys.includes(note.pubkey)) {
              shouldAddToBuffer = false;
            }

            // Reply filter
            if (shouldAddToBuffer && !showReplies && note.tags.some(tag => tag[0] === 'e')) {
              shouldAddToBuffer = false;
            }

            // Repost filter
            if (shouldAddToBuffer && !showReposts && note.kind === 6) {
              shouldAddToBuffer = false;
            }


            // NSFW filter
            if (shouldAddToBuffer && isNsfwNote({ content: note.content, tags: note.tags })) {
              shouldAddToBuffer = false;
            }

            if (shouldAddToBuffer) {
              console.log('🔴 Feed query: Adding note to buffer:', note.id.slice(0, 8));
              setBufferedNotes(prev => {
                const newNotes = [note, ...prev].slice(0, 50); // Keep max 50 notes
                return newNotes;
              });

              // Call callback if provided
              if (onNewNoteReceived) {
                onNewNoteReceived(note);
              }
              
              // Trigger outbox discovery for this user
              try {
                discoverOutboxEvents([note.pubkey]);
              } catch (error) {
                console.warn('Failed to discover outbox for new note:', error);
              }
            }
          } catch (error) {
            console.error('🔴 Feed query: Failed to process real-time event:', error);
          }
        },
        onclose: (reason: string) => {
          console.log('🔴 Feed query: Real-time subscription closed', { reason });
          setIsRealtimeConnected(false);
        },
        oneose: () => {
          console.log('🔴 Feed query: Real-time subscription established (EOSE received)');
          setIsRealtimeConnected(true);
        }
      });

      subscriptionRef.current = subscription;
    } catch (error) {
      console.error('🔴 Feed query: Failed to setup real-time subscription:', error);
      setIsRealtimeConnected(false);
    }
  }, [
    realtimeEnabled,
    queryEnabled,
    relayUrls,
    filterHash,
    buildFilter,
    showReplies,
    showReposts,
    mutedPubkeys,
    onNewNoteReceived
  ]);

  // Clear buffered notes function
  const clearBufferedNotes = useCallback(() => {
    console.log('🔴 Feed query: Clearing buffered notes:', bufferedNotes.length);
    setBufferedNotes([]);
    seenNoteIds.current.clear();
  }, [bufferedNotes.length]);

  // Get and clear buffered notes
  const getAndClearBufferedNotes = useCallback((): Note[] => {
    console.log('🔴 Feed query: Getting and clearing buffered notes:', bufferedNotes.length);
    const notes = bufferedNotes.slice();
    clearBufferedNotes();
    return notes;
  }, [bufferedNotes, clearBufferedNotes]);

  // Cleanup subscription on unmount
  useEffect(() => {
    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.close();
      }
    };
  }, []);

  // TanStack Query-compliant refresh function
  const refreshFeed = useCallback(async () => {
    console.log('🔄 TanStack-compliant feed refresh triggered');
    
    try {
      // Clear buffered notes so the new notes count resets immediately
      if (bufferedNotes.length > 0 || seenNoteIds.current.size > 0) {
        console.log('🧹 Clearing buffered notes and seen IDs before refresh');
        setBufferedNotes([]);
        seenNoteIds.current.clear();
      }

      // Following TanStack Query best practices for infinite queries
      // Perform a robust refresh: cancel, reset, and refetch the exact query
      console.log('🛑 Cancelling in-flight queries before refresh');
      await queryClient.cancelQueries({ queryKey, exact: true });

      console.log('🧹 Resetting query state');
      queryClient.resetQueries({ queryKey, exact: true });

      console.log('🔄 Refetching query');
      await queryClient.refetchQueries({ queryKey, exact: true, type: 'active' });
      
      console.log('✅ Feed refresh completed successfully');
    } catch (error) {
      console.error('❌ Feed refresh failed:', error);
      
      // Fallback: reset and refetch if invalidation fails
      try {
        console.log('🔄 Fallback: Resetting and refetching query');
        queryClient.resetQueries({ queryKey, exact: true });
        await queryClient.refetchQueries({ queryKey, exact: true, type: 'active' });
      } catch (fallbackError) {
        console.error('❌ Even fallback reset failed:', fallbackError);
      }
    }
  }, [queryClient, queryKey]);

  return {
    query: infiniteQuery,
    notes: filteredNotes,
    // Real-time functionality
    bufferedNotes,
    newNotesCount: bufferedNotes.length,
    isRealtimeConnected,
    clearBufferedNotes,
    getAndClearBufferedNotes,
    // Enhanced refresh for pull-to-refresh
    refreshFeed,
  }
}

