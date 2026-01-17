import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { useCallback, useMemo, useEffect } from 'react';
// import { getOutboxRouter } from '../utils/nostr/outboxRouter';
import type { Filter, Event } from 'nostr-tools';
import type { Note } from '../types/nostr/types';
import { extractImageUrls, extractVideoUrls } from '../utils/nostr/utils';
import { isNsfwNote } from '../utils/nsfwFilter';
import { acquireQuerySlot, releaseQuerySlot } from '../utils/nostr/queryThrottle';
import { useUIStore } from '../components/lib/useUIStore';
import { useNostrifyMigration } from '../contexts/NostrifyMigrationProvider';

interface UseNostrifyFeedConfig {
  relayUrls: string[];
  filter: Filter;
  enabled?: boolean;
  pageSize?: number;
  showReplies?: boolean;
  showReposts?: boolean;
  nsfwBlock?: boolean;
  mutedPubkeys?: string[];
  customHashtags?: string[];
  // Optional pagination guard: if provided, stop paging when reaching this age
  maximumAgeDays?: number | null;
  // Optional memory guard: limit number of pages kept in memory for this feed
  maxPagesInMemory?: number;
  // Optional clamp for initial page: only fetch events within the last N days
  // This prevents some relays from returning very old events on first load
  firstPageSinceDays?: number;
}

interface UseNostrifyFeedResult {
  data: Note[] | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  refresh: () => Promise<void>;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  isFetchingNextPage: boolean;
}

/**
 * Hook for fetching feed data using Nostrify
 * Maintains compatibility with existing feed components
 */
export function useNostrifyFeed(config: UseNostrifyFeedConfig): UseNostrifyFeedResult {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();
  const outboxModeEnabled = useUIStore((s) => s.outboxMode);
  const { resetPool, isPoolReady } = useNostrifyMigration();
  const {
    relayUrls,
    filter,
    enabled = true,
    pageSize = 20,
    showReplies = true,
    showReposts = true,
    nsfwBlock = true,
    mutedPubkeys = [],
    customHashtags = [],
    maximumAgeDays = null,
    maxPagesInMemory: _maxPagesInMemory, // No longer used - Virtual handles memory efficiently
    firstPageSinceDays = 30
  } = config;

  // Initial window for first page only - prevents loading very old notes on initial load
  // but allows pagination to go back further for infinite scroll
  const initialSinceTsRef = useMemo(() => {
    const nowTs = Math.floor(Date.now() / 1000);
    const windowSec = Math.max(1, Math.floor(firstPageSinceDays * 24 * 60 * 60));
    return Math.max(0, nowTs - windowSec);
  }, [firstPageSinceDays]);

  // Build stable query key parts (avoid object/array identity churn)
  const authorKey = useMemo(() => {
    const first = Array.isArray(filter?.authors) && filter.authors.length > 0 ? filter.authors[0] : 'global';
    return first || 'global';
  }, [filter?.authors?.[0]]);

  const kindsKey = useMemo(() => {
    return Array.isArray(filter?.kinds) ? (filter!.kinds as number[]).join(',') : '';
  }, [Array.isArray(filter?.kinds) ? (filter!.kinds as number[]).join(',') : '']);

  const relayKey = useMemo(() => {
    try {
      return JSON.stringify([...(relayUrls || [])].sort());
    } catch {
      return String(relayUrls?.length || 0);
    }
  }, [relayUrls]);

  const hashtagsKey = useMemo(() => {
    return (customHashtags || []).length
      ? [...customHashtags].sort().join(',')
      : '';
  }, [customHashtags?.length, Array.isArray(customHashtags) ? [...customHashtags].sort().join(',') : '']);

  const flagsKey = `${showReplies ? 'R1' : 'R0'}:${showReposts ? 'RP1' : 'RP0'}:${nsfwBlock ? 'N1' : 'N0'}`;
  const mutedLen = mutedPubkeys?.length || 0;
  const queryKey = ['nostrify-feed', authorKey, kindsKey, relayKey, flagsKey, hashtagsKey, mutedLen, pageSize] as const;
  
  // TTL cache to avoid repeated outbox discovery per author (in-memory)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gAny: any = globalThis as any;
  if (!gAny.__outboxDiscoveryCache) gAny.__outboxDiscoveryCache = new Map<string, number>();
  // const OUTBOX_DISCOVERY_TTL_MS = 10 * 60 * 1000; // 10 minutes

  // Debug logging for hook state
  const queryEnabled = enabled && !!nostr && relayUrls.length > 0;
  
  if (import.meta.env.DEV) {
    console.log('🔍 useNostrifyFeed state:', {
      hasNostr: !!nostr,
      enabled,
      relayUrlsLength: relayUrls?.length || 0,
      authorKey: authorKey?.slice(0, 8),
      kindsKey,
      shouldRun: queryEnabled,
      queryKey: ['nostrify-feed', authorKey, kindsKey, relayKey, flagsKey, hashtagsKey, mutedLen, pageSize],
      isProfileQuery: filter?.authors && filter.authors.length > 0,
      profileAuthor: filter?.authors?.[0]?.slice(0, 8),
      willExecute: queryEnabled && !!nostr && relayUrls.length > 0,
      // Additional debugging
      filterAuthors: filter?.authors,
      filterKinds: filter?.kinds,
      nostrAvailable: nostr !== null && nostr !== undefined
    });
  }

  // Proactive outbox discovery for feed authors
  useEffect(() => {
    if (filter?.authors && filter.authors.length > 0 && enabled && outboxModeEnabled) {
      // Extract unique authors from the filter
      const authors = [...new Set(filter.authors)];
      
      // Trigger background outbox discovery for these authors
      // This pre-populates the cache for future profile views
      if (authors.length > 0) {
        const triggerDiscovery = async () => {
          try {
            const { trackUserInteraction } = await import('../utils/outboxIntegration');
            authors.forEach(author => {
              trackUserInteraction(author, 'note_view', outboxModeEnabled);
            });
            
            if (import.meta.env.DEV) {
              console.log(`📦 Triggered proactive outbox discovery for ${authors.length} authors`, {
                outboxModeEnabled
              });
            }
          } catch (error) {
            console.warn('Failed to trigger proactive outbox discovery:', error);
          }
        };
        
        triggerDiscovery();
      }
    }
  }, [filter?.authors, enabled, outboxModeEnabled]);


  // Convert events to notes with filtering
  const processEvents = useCallback((events: Event[]): Note[] => {
    return events
      .filter(event => {
        // Basic content filter
        if (!event.content || event.content.trim().length === 0) return false;
        
        // Mute filter
        if (mutedPubkeys.includes(event.pubkey)) return false;
        
        // Reply filter
        if (!showReplies && event.tags?.some(tag => tag[0] === 'e')) return false;
        
        // Repost filter
        if (!showReposts && event.kind === 6) return false;
        
        
        // Hashtag filter - if customHashtags are specified, event must contain at least one
        if (customHashtags.length > 0) {
          const eventHashtags = event.tags
            ?.filter(tag => tag[0] === 't')
            ?.map(tag => tag[1]?.toLowerCase()) || [];
          
          const hasMatchingHashtag = customHashtags.some(hashtag => 
            eventHashtags.includes(hashtag.toLowerCase())
          );
          
          if (!hasMatchingHashtag) return false;
        }
        
        // NSFW filter - always filter NSFW content when nsfwBlock is enabled
        if (nsfwBlock && isNsfwNote({ content: event.content, tags: event.tags || [], pubkey: event.pubkey })) return false;
        
        return true;
      })
      .map(event => {
        const imageUrls = extractImageUrls(event.content);
        const videoUrls = extractVideoUrls(event.content);
        
        return {
          id: event.id,
          pubkey: event.pubkey,
          content: event.content,
          created_at: event.created_at,
          kind: event.kind || 1,
          tags: event.tags || [],
          imageUrls,
          videoUrls,
          receivedAt: Date.now()
        };
      })
      .sort((a, b) => b.created_at - a.created_at);
  }, [showReplies, showReposts, nsfwBlock, mutedPubkeys, customHashtags]);

  // Infinite query for paginated feed
  const infiniteQuery = useInfiniteQuery({
    queryKey,
    enabled: enabled && !!nostr && relayUrls.length > 0 && isPoolReady, // Gate on pool readiness, too
    staleTime: 30 * 1000, // 30 seconds - shorter to allow fresher data after publishing
    gcTime: 10 * 60 * 1000, // 10 minutes - keep data in cache for scroll restoration
    // Smart refetchOnMount: fetch if no data exists (hard refresh or first visit)
    // but preserve existing data on navigation (back button)
    refetchOnMount: (query) => {
      const pages = query.state.data?.pages;
      const hasPages = Array.isArray(pages) && pages.length > 0;
      // Check if any page actually has notes
      const hasNotes = hasPages && pages.some((p: any) => Array.isArray(p?.notes) && p.notes.length > 0);
      const shouldRefetch = !hasNotes; // Only refetch if we have no actual notes
      
      if (import.meta.env.DEV) {
        console.log('🔄 useNostrifyFeed refetchOnMount decision:', {
          hasPages,
          pagesCount: pages?.length ?? 0,
          hasNotes,
          shouldRefetch,
          queryStatus: query.state.status,
          dataUpdatedAt: query.state.dataUpdatedAt
        });
      }
      return shouldRefetch;
    },
    refetchOnWindowFocus: false, // Don't refetch on window focus - preserve scroll position
    networkMode: 'online', // Only run when online
    queryFn: async ({ pageParam }) => {
      if (import.meta.env.DEV) {
        console.log('🚀 useNostrifyFeed queryFn CALLED:', {
          pageParam,
          hasNostr: !!nostr,
          relayUrlsLength: relayUrls?.length || 0,
          filterAuthors: filter?.authors,
          filterKinds: filter?.kinds
        });
      }
      
      if (!nostr) {
        console.error('❌ Nostrify pool not available after waiting');
        throw new Error('Nostrify pool not available after timeout');
      }

      // Push per-query relay hints so the pool routes exactly where the UI selected
      try {
        const g: any = globalThis as any;
        if (Array.isArray(relayUrls) && relayUrls.length > 0) {
          if (!Array.isArray(g.__nostrifyRelayHintQueue)) g.__nostrifyRelayHintQueue = [];
          g.__nostrifyRelayHintQueue.push(relayUrls);
        }
      } catch {}
      
      if (!relayUrls || relayUrls.length === 0) {
        console.warn('⚠️ No relay URLs configured');
        return { notes: [], nextCursor: undefined };
      }
      
      const nowTs = Math.floor(Date.now() / 1000);
      const isFirstPage = typeof pageParam !== 'number';
      
      // Apply sliding window to ALL pages to prevent time jumps
      // Without this, subsequent pages can jump months back when there are gaps
      const SLIDING_WINDOW_DAYS = 90; // 3 months - generous but prevents huge time jumps
      const slidingWindowSeconds = SLIDING_WINDOW_DAYS * 24 * 60 * 60;
      
      // For following feeds, use a more generous time window to catch more posts
      const isFollowingFeedQuery = filter.authors && filter.authors.length > 10;
      // First page: narrower window for following feed for fast response
      // Following: 7 days; otherwise: 30 days
      const timeWindowDays = isFollowingFeedQuery ? 7 : 30;
      const timeWindowSeconds = timeWindowDays * 24 * 60 * 60;
      
      let effectiveFilter = {
        ...filter,
        // For first page: use initial window (last 30 days by default, 180 days for following feeds)
        // For subsequent pages: maintain sliding window before 'until' cursor
        // This prevents relays from jumping too far back when there are gaps in data
        since: isFirstPage 
          ? (isFollowingFeedQuery ? Math.max(0, nowTs - timeWindowSeconds) : initialSinceTsRef)
          : Math.max(0, (pageParam as number) - slidingWindowSeconds),
        until: isFirstPage ? nowTs : (pageParam as number | undefined),
        limit: pageSize
      } as Filter;
      
      // Send the complete filter to the relay - relay servers handle multi-author filters efficiently.
      // We have persistent WebSocket connections via NPool, so send ONE query with ALL authors
      // instead of artificial batching
      let queryFilter = effectiveFilter;
      
      if (import.meta.env.DEV) {
        const isFollowingFeed = effectiveFilter.authors && Array.isArray(effectiveFilter.authors) && effectiveFilter.authors.length > 10;
        if (isFollowingFeed) {
          console.log(`📡 Following feed: Sending query with ALL ${effectiveFilter.authors?.length} authors via persistent WebSocket connections`);
        }
      }

      try {
        if (import.meta.env.DEV) {
          const sinceDate = queryFilter.since ? new Date(queryFilter.since * 1000).toISOString() : 'none';
          const untilDate = queryFilter.until ? new Date(queryFilter.until * 1000).toISOString() : 'none';
          const windowDays = queryFilter.since && queryFilter.until 
            ? Math.round((queryFilter.until - queryFilter.since) / (24 * 60 * 60))
            : 0;
          
          console.log('📡 Querying Nostrify:', { 
            queryFilter, 
            relayUrls,
            timeWindow: {
              since: sinceDate,
              until: untilDate,
              windowDays,
              isFirstPage,
              isFollowingFeedQuery
            }
          });
          console.log('🔍 Filter details:', { 
            originalFilter: filter, 
            queryFilter, 
            hasAuthors: !!queryFilter.authors,
            authorsLength: queryFilter.authors?.length || 0,
            timeWindowDays
          });
        }
        
        // More conservative timeout handling with circuit breaker (device-agnostic)

        // Determine if this is a profile notes query (single author)
        const isProfileQuery = queryFilter.authors && queryFilter.authors.length > 0;
        // Check if this is a multi-author query (follow feed)
        const isMultiAuthorQuery = queryFilter.authors && queryFilter.authors.length > 1;

        // Circuit breaker: if we've had recent failures, use shorter timeout
        const recentFailures = (globalThis as any).__nostrifyRecentFailures || 0;

        // Increased timeouts for profile queries to prevent premature failures
        // Profile queries need more time as they may need to discover user's relays
        // Following feeds with many contacts need even longer timeouts
        const isFollowingFeed = isMultiAuthorQuery && queryFilter.authors && queryFilter.authors.length > 10;
        
        const baseTimeout = isFollowingFeed
          ? 35000            // Following: 35s
          : isMultiAuthorQuery
            ? 25000          // Multi-author: 25s
            : isProfileQuery
              ? 20000        // Profile: 20s
              : 15000;       // Global: 15s
        
        const timeoutMs = recentFailures > 3 ? Math.min(baseTimeout, 8000) : baseTimeout;
        const finalTimeoutMs = timeoutMs;
        
        if (import.meta.env.DEV) {
          console.log(`⏰ Query timeout: ${finalTimeoutMs}ms (failures: ${recentFailures}, following: ${isFollowingFeed})`);
        }
        
        // Debug: Check if this is a profile notes query
        if (isProfileQuery && import.meta.env.DEV) {
          console.log('👤 Profile notes query detected:', {
            authors: queryFilter.authors,
            kinds: queryFilter.kinds,
            limit: queryFilter.limit
          });
        }
        
        // Debug: Check if this is a following feed query
        if (isFollowingFeed && import.meta.env.DEV) {
          console.log('👥 Following feed query detected:', {
            authors: queryFilter.authors?.length || 0,
            kinds: queryFilter.kinds,
            limit: queryFilter.limit,
            timeout: finalTimeoutMs
          });
        }
        
        // Debug: Check if this is a multi-author query (following feed)
        if (isMultiAuthorQuery && import.meta.env.DEV) {
          console.log('👥 Multi-author query detected:', {
            authors: queryFilter.authors?.length || 0,
            kinds: queryFilter.kinds,
            limit: queryFilter.limit,
            timeout: finalTimeoutMs,
            isFollowingFeed
          });
        }
        
        // Use the relays provided by the caller (no discovery-mode switching)
        const effectiveRelayUrls = relayUrls;
        const effectiveTimeout = finalTimeoutMs;

        // Acquire throttle slot before querying
        const slotId = await acquireQuerySlot('feed');
        
        try {
          // Track overall duration across attempts
          const overallStartTime = Date.now();

          // Helper to perform a single attempt with timeout
          const singleAttempt = async (): Promise<any[]> => {
            const queryStartTime = Date.now();
            if (import.meta.env.DEV) {
              console.log(`🚀 Starting query (timeout: ${effectiveTimeout}ms)`, {
                authors: queryFilter.authors?.length || 0,
                kinds: queryFilter.kinds,
                relays: effectiveRelayUrls.length,
                relayUrls: effectiveRelayUrls.slice(0, 3) // Show first 3 for brevity
              });
            }
            const queryPromise = nostr.query([queryFilter]) as Promise<any[]>;
            const timeoutPromise = new Promise<any[]>((_, reject) => {
              setTimeout(() => {
                const elapsed = Date.now() - queryStartTime;
                reject(new Error(`Query timeout after ${elapsed}ms`));
              }, effectiveTimeout);
            });
            return Promise.race([queryPromise, timeoutPromise]);
          };

          // Enhanced retry strategy: more attempts for profile queries with better error handling
          // Following feeds need fewer retries to avoid cascading timeouts
          let events: any[] = [];
          const attempts = isFollowingFeed ? 1 : (isProfileQuery ? 3 : 2); // Fewer attempts for following feeds
          let lastError: Error | null = null;
          
          for (let i = 0; i < attempts; i++) {
            try {
              events = await singleAttempt();
              if (Array.isArray(events) && events.length > 0) {
                // Got results, stop retrying
                break;
              } else if (Array.isArray(events) && events.length === 0 && i < attempts - 1) {
                // Empty results but not last attempt - retry with exponential backoff
                if (import.meta.env.DEV) {
                  console.log(`🔄 No results, retrying (${i + 1}/${attempts})...`);
                }
                const delay = Math.min(1000 * Math.pow(1.5, i), 3000); // Exponential backoff, max 3s
                await new Promise((r) => setTimeout(r, delay));
                continue;
              }
            } catch (err) {
              lastError = err as Error;
              if (i === attempts - 1) {
                // On last attempt, handle based on error type
                if (isProfileQuery && !isFollowingFeed) {
                  // For single-author profile queries (not following feeds), check if it's a timeout or connection error
                  const errorMessage = lastError.message;
                  if (/timeout|connection|network|websocket/i.test(errorMessage)) {
                    console.warn(`⚠️ Profile query failed after ${attempts} attempts due to network issues`);
                    // Return empty results instead of throwing to avoid infinite loading
                    events = [];
                    break;
                  } else {
                    // For other errors, still throw
                    throw lastError;
                  }
                } else if (isFollowingFeed) {
                  // For following feeds, always throw the error to show proper error state
                  console.warn(`⚠️ Following feed query failed after ${attempts} attempts: ${lastError.message}`);
                  // On timeout, reset relay pool so next retry uses fresh connections
                  if (lastError.message.includes('timeout')) {
                    try {
                      console.warn('🔄 Resetting relay pool after timeout...');
                      resetPool();
                    } catch (e) {
                      console.warn('⚠️ Failed to reset relay pool:', e);
                    }
                  }
                  throw lastError;
                } else {
                  throw lastError;
                }
              }
              if (import.meta.env.DEV) {
                console.log(`🔄 Retry ${i + 1}/${attempts} after error: ${lastError.message}`);
              }
              const delay = Math.min(1000 * Math.pow(1.5, i), 3000); // Exponential backoff
              await new Promise((r) => setTimeout(r, delay));
            }
          }
          
          const queryEndTime = Date.now();
          const queryDuration = queryEndTime - overallStartTime;
          
          // Reset failure counter on success
          (globalThis as any).__nostrifyRecentFailures = 0;
          // Mark feed as ready when we have real events (helps discovery gating)
          try {
            if (isFirstPage === true && Array.isArray(events) && events.length > 0) {
              (globalThis as any).__feedFirstPageReady = true;
            }
          } catch {}
          
          if (import.meta.env.DEV) {
            console.log(`✅ Query completed: ${events.length} events in ${queryDuration}ms`);
          }
          
          const notes = processEvents(events);

          const nowTs = Math.floor(Date.now() / 1000);
          const requestedUntil: number | undefined = pageParam as number | undefined;

          // Use the oldest visible note if available; otherwise, use the minimum created_at
          // from the raw events (which may include filtered-out items). This avoids relying
          // on array order from relays and prevents large time jumps.
          const minEventCreatedAt = Array.isArray(events) && events.length > 0
            ? events.reduce((min, ev) => {
                const t = typeof ev?.created_at === 'number' ? ev.created_at : Number.MAX_SAFE_INTEGER;
                return t < min ? t : min;
              }, Number.MAX_SAFE_INTEGER)
            : undefined;

          const oldestVisibleCreatedAt = notes.length > 0
            ? notes[notes.length - 1].created_at
            : undefined;

          const baseCursorSource = typeof oldestVisibleCreatedAt === 'number'
            ? oldestVisibleCreatedAt
            : (typeof minEventCreatedAt === 'number' && isFinite(minEventCreatedAt) && minEventCreatedAt !== Number.MAX_SAFE_INTEGER
                ? minEventCreatedAt
                : (typeof requestedUntil === 'number' ? requestedUntil : nowTs));

          const computedNextCursor = Math.max(0, baseCursorSource - 1);
          const oldestSeen = baseCursorSource;

          // Mark first page as ready to allow background discovery on iOS Safari
          if (typeof window !== 'undefined') {
            const isFirstPageSuccess = isFirstPage === true;
            if (isFirstPageSuccess) {
              (globalThis as any).__feedFirstPageReady = true;
            }
          }

          return {
            notes,
            nextCursor: computedNextCursor,
            requestedUntil,
            oldestSeen,
          } as any;
        } catch (error) {
          // Increment failure counter for circuit breaker
          (globalThis as any).__nostrifyRecentFailures = ((globalThis as any).__nostrifyRecentFailures || 0) + 1;
          
          const errorMessage = (error as Error).message;
          console.error('❌ Nostrify query failed:', {
            error: errorMessage,
            browser: /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent) ? 'Safari' : 'Other',
            userAgent: navigator.userAgent.slice(0, 100),
            recentFailures: (globalThis as any).__nostrifyRecentFailures,
            isProfileQuery: queryFilter.authors && queryFilter.authors.length === 1
          });
          
          // For profile queries (single author), we should NOT silently return empty results
          // Users need to know if their notes couldn't be loaded vs having no notes
          // Only treat as soft-empty for multi-author queries (feeds) to avoid blocking UI
          // But NOT for following feeds - they should show proper error state
          const isSingleAuthorProfileQuery = queryFilter.authors && queryFilter.authors.length === 1;
          const isFollowingFeedQuery = queryFilter.authors && queryFilter.authors.length > 10;
          
          if ((/timeout|connection|network|websocket|bad response/i.test(errorMessage)) && !isSingleAuthorProfileQuery && !isFollowingFeedQuery && (queryFilter.authors && queryFilter.authors.length > 0)) {
            // Multi-author query soft failure (but not following feeds) - return empty to avoid blocking feed
            const nowTs = Math.floor(Date.now() / 1000);
            const requestedUntil: number | undefined = pageParam as number | undefined;
            const fallbackNext = Math.max(0, (typeof requestedUntil === 'number' ? requestedUntil - 1 : nowTs - 1));
            if (import.meta.env.DEV) {
              console.log('⚠️ Multi-author query soft failure, returning empty results');
            }
            return { notes: [], nextCursor: fallbackNext, requestedUntil, oldestSeen: requestedUntil ?? nowTs } as any;
          }
          
          // Unified behavior: no platform-specific soft-empty fallback

          // For profile queries or other errors, throw the error so the UI can show a proper error state
          throw error;
        } finally {
          // Always release the throttle slot
          try {
            releaseQuerySlot(slotId);
          } catch {}
        }
      } catch (error) {
        // Increment failure counter for circuit breaker
        (globalThis as any).__nostrifyRecentFailures = ((globalThis as any).__nostrifyRecentFailures || 0) + 1;
        
        const errorMessage = (error as Error).message;
        console.error('❌ Nostrify query failed:', {
          error: errorMessage,
          browser: /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent) ? 'Safari' : 'Other',
          userAgent: navigator.userAgent.slice(0, 100),
          recentFailures: (globalThis as any).__nostrifyRecentFailures,
          isProfileQuery: queryFilter.authors && queryFilter.authors.length === 1
        });
        
        // For profile queries (single author), we should NOT silently return empty results
        // Users need to know if their notes couldn't be loaded vs having no notes
        // Only treat as soft-empty for multi-author queries (feeds) to avoid blocking UI
        // But NOT for following feeds - they should show proper error state
        const isSingleAuthorProfileQuery = queryFilter.authors && queryFilter.authors.length === 1;
        const isFollowingFeedQuery = queryFilter.authors && queryFilter.authors.length > 10;
        
        if ((/timeout|connection|network|websocket|bad response/i.test(errorMessage)) && !isSingleAuthorProfileQuery && !isFollowingFeedQuery && (queryFilter.authors && queryFilter.authors.length > 0)) {
          // Multi-author query soft failure (but not following feeds) - return empty to avoid blocking feed
          const nowTs = Math.floor(Date.now() / 1000);
          const requestedUntil: number | undefined = pageParam as number | undefined;
          const fallbackNext = Math.max(0, (typeof requestedUntil === 'number' ? requestedUntil - 1 : nowTs - 1));
          if (import.meta.env.DEV) {
            console.log('⚠️ Multi-author query soft failure, returning empty results');
          }
          return { notes: [], nextCursor: fallbackNext, requestedUntil, oldestSeen: requestedUntil ?? nowTs } as any;
        }
        
        // For profile queries or other errors, throw the error so the UI can show a proper error state
        throw error;
      }
    },
    getNextPageParam: (lastPage: any, allPages: any[]) => {
      if (!lastPage) return undefined;

      // Optional age stop if explicitly configured by caller
      if (typeof maximumAgeDays === 'number' && maximumAgeDays > 0) {
        const maximumAgeTimestamp = Math.floor(Date.now() / 1000) - maximumAgeDays * 24 * 60 * 60;
        const oldestAcross = allPages
          .map((p: any) => (Array.isArray(p.notes) && p.notes.length > 0 ? p.notes[p.notes.length - 1].created_at : (p.oldestSeen ?? Number.MAX_SAFE_INTEGER)))
          .reduce((min: number, v: number) => Math.min(min, v), Number.MAX_SAFE_INTEGER);
        if (oldestAcross !== Number.MAX_SAFE_INTEGER && oldestAcross < maximumAgeTimestamp && allPages.length > 3) {
          return undefined;
        }
      }

      // If the last few pages were empty, give up - relays have no more data
      const lastFive = allPages.slice(-5);
      if (lastFive.length >= 5 && lastFive.every((p: any) => !p.notes || p.notes.length === 0)) {
        console.log('🛑 Feed pagination stopped: last 5 pages were empty, no more data available');
        return undefined;
      }

      // Generous page cap to allow scrolling back years
      // Note: maxPagesInMemory is for memory management (pruning), NOT pagination limits
      // Allow up to 500 pages of pagination (with pruning keeping only maxPagesInMemory in RAM)
      const MAX_PAGINATION_PAGES = 500;
      if (allPages.length >= MAX_PAGINATION_PAGES) {
        console.log(`🛑 Feed pagination stopped: reached maximum pages limit (${MAX_PAGINATION_PAGES})`);
        return undefined;
      }

      // Continue using the provided nextCursor or derive a fallback
      const fallback = Math.max(0, (typeof lastPage.requestedUntil === 'number' ? lastPage.requestedUntil - 1 : Math.floor(Date.now() / 1000) - 1));
      return (typeof lastPage.nextCursor === 'number' ? Math.max(0, lastPage.nextCursor) : fallback);
    },
    initialPageParam: undefined as number | undefined,
    refetchOnReconnect: true,
    retry: (failureCount: number, error: Error) => {
      const errorMessage = error.message;
      if (import.meta.env.DEV) {
        console.log('🔄 Nostrify query retry:', { failureCount, error: errorMessage });
      }
      
      // Don't retry on timeout errors to prevent cascading timeouts
      if (errorMessage.includes('timeout') || errorMessage.includes('Query timeout')) {
        console.log('⏰ Skipping retry for timeout error');
        return false;
      }
      
      // Don't retry on network errors or connection issues
      if (errorMessage.includes('network') || errorMessage.includes('connection') || errorMessage.includes('fetch')) {
        console.log('🌐 Skipping retry for network error');
        return false;
      }
      
      // More generous retry logic for profile queries, but less for following feeds
      const isProfileQuery = config.filter?.authors && config.filter.authors.length === 1;
      const isFollowingFeed = config.filter?.authors && config.filter.authors.length > 10;
      const maxRetries = isFollowingFeed ? 0 : (isProfileQuery ? 2 : 1); // No retries for following feeds
      return failureCount < maxRetries;
    },
    retryDelay: (attemptIndex: number) => {
      // Shorter delays for faster recovery
      const delay = Math.min(2000 * Math.pow(1.5, attemptIndex), 8000); // Shorter base delay, max 8s
      if (import.meta.env.DEV) {
        console.log(`⏱️ Retry delay: ${delay}ms`);
      }
      return delay;
    },
  });

  // Debug infiniteQuery state to understand why it's not fetching
  if (import.meta.env.DEV) {
    console.log('🔍 useNostrifyFeed infiniteQuery status:', {
      status: infiniteQuery.status,
      fetchStatus: infiniteQuery.fetchStatus,
      isLoading: infiniteQuery.isLoading,
      isPending: infiniteQuery.isPending,
      isFetching: infiniteQuery.isFetching,
      hasData: !!infiniteQuery.data,
      pagesCount: infiniteQuery.data?.pages?.length ?? 0,
      error: infiniteQuery.error?.message,
      enabled: queryEnabled,
      queryKey: queryKey.slice(0, 4) // First 4 elements for brevity
    });
  }

  // NOTE: Manual page pruning removed - TanStack Virtual handles memory efficiently
  // by only rendering visible items (~10 on mobile). Pruning causes jittering because
  // it changes the data array length, forcing Virtual to recalculate all positions.
  // Modern mobile devices have plenty of RAM for note data (~500KB for 1000 notes).
  // Images are managed by the browser and unmount when components are off-screen.

  // Robust refresh: cancel, hard-remove, and invalidate to force clean re-fetch
  const refresh = async () => {
    try {
      await queryClient.cancelQueries({ queryKey, exact: true });
    } catch {}
    try {
      queryClient.removeQueries({ queryKey, exact: true });
    } catch {}
    await queryClient.invalidateQueries({ queryKey, exact: true });
  };

  // Invalidate and refetch query when filter settings change
  // This ensures the feed immediately updates when showReplies/showReposts toggles change
  // Note: When filter settings change, the queryKey changes (via flagsKey), which creates a new query.
  // This effect ensures the query is invalidated to force immediate refetch with new filter settings.
  useEffect(() => {
    // When filter settings change, invalidate the current query to force refetch
    // The queryKey will have changed (due to flagsKey), creating a new query automatically
    // This invalidation ensures any cached data is cleared and fresh data is fetched
    queryClient.invalidateQueries({ queryKey, exact: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showReplies, showReposts]);

  // Flatten all pages into a single array
  // IMPORTANT: This memo applies filtering to cached data based on current filter settings.
  // When showReplies/showReposts change, this memo recalculates and filters the cached notes
  // to ensure the UI immediately reflects the new filter settings, even before new data is fetched.
  const allNotes = useMemo(() => {
    const pages = infiniteQuery.data?.pages as Array<{ notes: Note[] }> | undefined;
    if (!pages) return [] as Note[];
    const unique = new Map<string, Note>();
    for (const page of pages) {
      for (const n of page.notes) {
        if (n && n.id && !unique.has(n.id)) {
          unique.set(n.id, n);
        }
      }
    }
    
    // Apply active filter options to cached notes
    // This ensures filters work correctly when toggled on/off, even with cached data
    const filteredNotes = Array.from(unique.values()).filter(note => {
      // Reply filter: filter out notes that have 'e' tags (event references indicating replies)
      if (!showReplies && note.tags?.some(tag => tag[0] === 'e')) return false;
      
      // Repost filter: filter out kind 6 events (reposts)
      if (!showReposts && note.kind === 6) return false;
      
      // Hashtag filter
      if (customHashtags.length > 0) {
        const eventHashtags = note.tags
          ?.filter(tag => tag[0] === 't')
          ?.map(tag => tag[1]?.toLowerCase()) || [];
        
        const hasMatchingHashtag = customHashtags.some(hashtag => 
          eventHashtags.includes(hashtag.toLowerCase())
        );
        
        if (!hasMatchingHashtag) return false;
      }
      
      // NSFW filter
      if (nsfwBlock && isNsfwNote({ content: note.content, tags: note.tags || [], pubkey: note.pubkey })) return false;
      
      // Muted users filter
      if (mutedPubkeys.includes(note.pubkey)) return false;
      
      return true;
    });
    
    return filteredNotes.sort((a, b) => b.created_at - a.created_at);
  }, [infiniteQuery.data, showReplies, showReposts, nsfwBlock, mutedPubkeys, customHashtags]);

  // Enhanced loading state with timeout protection
  const isLoading = useMemo(() => {
    // If query is explicitly loading, use that
    if (infiniteQuery.isLoading) return true;
    
    // If query is pending and we have no data, it's loading
    if (infiniteQuery.isPending && !infiniteQuery.data) return true;
    
    // If query is fetching and we have no data, it's loading
    if (infiniteQuery.isFetching && !infiniteQuery.data) return true;
    
    // If we have an error but no data, don't show loading
    if (infiniteQuery.error && !infiniteQuery.data) return false;
    
    return false;
  }, [infiniteQuery.isLoading, infiniteQuery.isPending, infiniteQuery.isFetching, infiniteQuery.data, infiniteQuery.error]);

  return {
    data: allNotes,
    isLoading,
    error: infiniteQuery.error,
    refetch: infiniteQuery.refetch,
    refresh,
    hasNextPage: infiniteQuery.hasNextPage,
    fetchNextPage: infiniteQuery.fetchNextPage,
    isFetchingNextPage: infiniteQuery.isFetchingNextPage
  };
}

/**
 * Hook for simple feed query (non-paginated)
 */
export function useNostrifySimpleFeed(config: UseNostrifyFeedConfig): UseNostrifyFeedResult {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();
  const {
    relayUrls,
    filter,
    enabled = true,
    showReplies = true,
    showReposts = true,
    nsfwBlock = true,
    mutedPubkeys = [],
    customHashtags = []
  } = config;

  // Convert events to notes with filtering
  const processEvents = useCallback((events: Event[]): Note[] => {
    return events
      .filter(event => {
        if (!event.content || event.content.trim().length === 0) return false;
        if (mutedPubkeys.includes(event.pubkey)) return false;
        if (!showReplies && event.tags?.some(tag => tag[0] === 'e')) return false;
        if (!showReposts && event.kind === 6) return false;
        
        // Hashtag filter - if customHashtags are specified, event must contain at least one
        if (customHashtags.length > 0) {
          const eventHashtags = event.tags
            ?.filter(tag => tag[0] === 't')
            ?.map(tag => tag[1]?.toLowerCase()) || [];
          
          const hasMatchingHashtag = customHashtags.some(hashtag => 
            eventHashtags.includes(hashtag.toLowerCase())
          );
          
          if (!hasMatchingHashtag) return false;
        }
        
        // NSFW filter - always filter NSFW content when nsfwBlock is enabled
        if (nsfwBlock && isNsfwNote({ content: event.content, tags: event.tags || [], pubkey: event.pubkey })) return false;
        
        return true;
      })
      .map(event => {
        const imageUrls = extractImageUrls(event.content);
        const videoUrls = extractVideoUrls(event.content);
        
        return {
          id: event.id,
          pubkey: event.pubkey,
          content: event.content,
          created_at: event.created_at,
          kind: event.kind || 1,
          tags: event.tags || [],
          imageUrls,
          videoUrls,
          receivedAt: Date.now()
        };
      })
      .sort((a, b) => b.created_at - a.created_at);
  }, [showReplies, showReposts, nsfwBlock, mutedPubkeys, customHashtags]);

  const simpleQueryKey = ['nostrify-simple-feed', filter, relayUrls, showReplies, showReposts, nsfwBlock, mutedPubkeys, customHashtags] as const;

  const query = useQuery({
    queryKey: simpleQueryKey,
    enabled,
    queryFn: async () => {
      if (!nostr) throw new Error('Nostrify not available');
      
      const events = await nostr.query([filter]);
      return processEvents(events);
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const refresh = async () => {
    try {
      await queryClient.cancelQueries({ queryKey: simpleQueryKey, exact: true });
    } catch {}
    try {
      queryClient.resetQueries({ queryKey: simpleQueryKey, exact: true });
    } catch {}
    await queryClient.refetchQueries({ queryKey: simpleQueryKey, exact: true, type: 'active' });
  };

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    refresh,
    hasNextPage: false,
    fetchNextPage: () => {},
    isFetchingNextPage: false
  };
}
