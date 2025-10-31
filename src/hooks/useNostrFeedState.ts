import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Note, Metadata, Contact, AsciiCache } from '../types/nostr/types';
import type { BufferState, BufferConfig, BufferStats } from '../types/buffer';
import { DEFAULT_BUFFER_CONFIG } from '../types/buffer';

export interface NostrFeedState {
  // Core data
  notes: Note[];
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>;
  currentIndex: number;
  setCurrentIndex: React.Dispatch<React.SetStateAction<number>>;
  // Current viewed note ID for reliable restoration
  currentNoteId: string | null;
  setCurrentNoteId: React.Dispatch<React.SetStateAction<string | null>>;
  // Cumulative display index shown to user (1-based)
  displayIndex: number;
  setDisplayIndex: React.Dispatch<React.SetStateAction<number>>;
  metadata: Record<string, Metadata>;
  setMetadata: React.Dispatch<React.SetStateAction<Record<string, Metadata>>>;
  contacts: Contact[];
  setContacts: React.Dispatch<React.SetStateAction<Contact[]>>;
  asciiCache: AsciiCache;
  setAsciiCache: React.Dispatch<React.SetStateAction<AsciiCache>>;
  
  // UI state
  isDarkMode: boolean;
  setIsDarkMode: React.Dispatch<React.SetStateAction<boolean>>;
  useAscii: boolean;
  setUseAscii: React.Dispatch<React.SetStateAction<boolean>>;
  useColor: boolean;
  setUseColor: React.Dispatch<React.SetStateAction<boolean>>;
  isMobile: boolean;
  setIsMobile: React.Dispatch<React.SetStateAction<boolean>>;
  showOptions: boolean;
  setShowOptions: React.Dispatch<React.SetStateAction<boolean>>;
  fullScreenImage: string | null;
  setFullScreenImage: React.Dispatch<React.SetStateAction<string | null>>;
  isDragging: boolean;
  setIsDragging: React.Dispatch<React.SetStateAction<boolean>>;
  lastNavigationSource: 'swipe' | 'keyboard' | 'button' | null;
  setLastNavigationSource: React.Dispatch<React.SetStateAction<'swipe' | 'keyboard' | 'button' | null>>;
  
  // Filter state
  showReplies: boolean;
  setShowReplies: React.Dispatch<React.SetStateAction<boolean>>;
  showReposts: boolean;
  setShowReposts: React.Dispatch<React.SetStateAction<boolean>>;
  nsfwBlock: boolean;
  setNsfwBlock: React.Dispatch<React.SetStateAction<boolean>>;
  imageMode: boolean;
  setImageMode: React.Dispatch<React.SetStateAction<boolean>>;
  customHashtags: string[];
  setCustomHashtags: React.Dispatch<React.SetStateAction<string[]>>;
  
  // Pubkey management
  storedPubkey: string;
  setStoredPubkey: React.Dispatch<React.SetStateAction<string>>;
  pastedPubkey: string;
  setPastedPubkey: React.Dispatch<React.SetStateAction<string>>;
  pubkeyError: string;
  setPubkeyError: React.Dispatch<React.SetStateAction<string>>;
  
  // Loading and status states
  isLoadingContacts: boolean;
  setIsLoadingContacts: React.Dispatch<React.SetStateAction<boolean>>;
  contactLoadError: string | null;
  setContactLoadError: React.Dispatch<React.SetStateAction<string | null>>;
  isInitialized: boolean;
  setIsInitialized: React.Dispatch<React.SetStateAction<boolean>>;
  isPageVisible: boolean;
  setIsPageVisible: React.Dispatch<React.SetStateAction<boolean>>;
  isFetchingPage: boolean;
  setIsFetchingPage: React.Dispatch<React.SetStateAction<boolean>>;
  hasMorePages: boolean;
  setHasMorePages: React.Dispatch<React.SetStateAction<boolean>>;
  isCheckingForNewNotes: boolean;
  setIsCheckingForNewNotes: React.Dispatch<React.SetStateAction<boolean>>;
  isClearingCache: boolean;
  setIsClearingCache: React.Dispatch<React.SetStateAction<boolean>>;
  newNotesFound: number;
  setNewNotesFound: React.Dispatch<React.SetStateAction<number>>;
  showNoNewNotesMessage: boolean;
  setShowNoNewNotesMessage: React.Dispatch<React.SetStateAction<boolean>>;
  isRateLimited: boolean;
  setIsRateLimited: React.Dispatch<React.SetStateAction<boolean>>;
  
  // Profile meta visibility state  
  showProfileMeta: boolean;
  setShowProfileMeta: React.Dispatch<React.SetStateAction<boolean>>;
  
  // Cache and modal states
  showClearCacheConfirm: boolean;
  setShowClearCacheConfirm: React.Dispatch<React.SetStateAction<boolean>>;
  cacheStats: { 
    notesCount: number; 
    metadataCount: number; 
    contactsCount: number; 
    asciiCacheCount: number;
    zapTotalsCount: number;
  };
  setCacheStats: React.Dispatch<React.SetStateAction<{ 
    notesCount: number; 
    metadataCount: number; 
    contactsCount: number; 
    asciiCacheCount: number;
    zapTotalsCount: number;
  }>>;

  contactSearchQuery: string;
  setContactSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  contactStatus: string;
  setContactStatus: React.Dispatch<React.SetStateAction<string>>;
  copiedPubkeys: Set<string>;
  setCopiedPubkeys: React.Dispatch<React.SetStateAction<Set<string>>>;

  // Feed Buffer state (Phase 1 implementation)
  bufferState: BufferState | null;
  bufferStats: BufferStats | null;
  bufferEnabled: boolean;
  setBufferEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  bufferConfig: BufferConfig;
  
  // Sliding Window feature flag
  useSlidingWindow: boolean;
  setUseSlidingWindow: React.Dispatch<React.SetStateAction<boolean>>;

  // Feed data loading state
  hasInitialFeedData: boolean;
  isRestoringPosition: boolean;
  setIsRestoringPosition: React.Dispatch<React.SetStateAction<boolean>>;
  cancelRestoration: () => void;
  
  // Helper functions
  updateCurrentIndex: (newIndex: number, triggerPrefetch?: (index: number, totalNotes: number) => void) => void;
  updateCurrentIndexByNoteId: (noteId: string) => boolean;
  findNoteIndexById: (noteId: string) => number;
  bumpDisplayIndex: (delta: number) => void;
  cleanupNotes: (bufferSize?: number) => void;
  updateLastUnfilteredLength: (length: number) => void;
  
  // Strategic restoration helpers
  getRestorationInfo: () => any | null;
  clearRestorationInfo: () => void;
  
  // Sliding window restoration
  restoreFromSlidingWindow: (notes: any[], currentIndex: number, currentNoteId: string) => void;
}

export const useNostrFeedState = (): NostrFeedState => {
  // Query client for cache management (optional for tests)
  let queryClient;
  try {
    queryClient = useQueryClient();
  } catch {
    // Tests might not have QueryClient provider, so make it optional
    queryClient = null;
  }
  
  // Initialize restoration state and perform immediate restoration if needed
  const [initialRestorationState] = useState(() => {
    try {
      // Only restore on main feed route, not on direct links to notes/profiles
      const currentPath = typeof window !== 'undefined' ? window.location.pathname : '/';
      const currentSearch = typeof window !== 'undefined' ? window.location.search : '';
      const isMainFeedRoute = currentPath === '/' || currentPath === '';
      
      if (!isMainFeedRoute) {

        return { shouldRestore: false, restoredState: null };
      }
      
      // Also skip restoration if user came with specific URL parameters (hashtag, note, etc.)
      // This indicates they have a specific intent rather than wanting to restore position
      if (currentSearch && (
        currentSearch.includes('hashtag=') || 
        currentSearch.includes('note=') ||
        currentSearch.includes('npub=') ||
        currentSearch.includes('nprofile=') ||
        currentSearch.includes('nevent=')
      )) {

        return { shouldRestore: false, restoredState: null };
      }
      
      const savedFeedState = localStorage.getItem('feedState');
      const savedNoteId = localStorage.getItem('currentNoteId');
      const savedIndex = localStorage.getItem('currentIndex');

      // Only restore if we have meaningful saved data
      if (savedFeedState && savedNoteId) {
        const feedState = JSON.parse(savedFeedState);
        const age = Date.now() - feedState.timestamp;
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        const shouldRestore = age < maxAge && feedState.notes && feedState.notes.length > 0 && feedState.currentIndex >= 0;
        
        if (shouldRestore) {

          // Perform immediate synchronous restoration
          let restoredState;
          if (feedState.version === '2.0' && feedState.bufferMetadata) {
            // Strategic restoration with buffer metadata
            const bufferMetadata = feedState.bufferMetadata;
            restoredState = {
              notes: feedState.notes,
              currentIndex: bufferMetadata.currentIndexInBuffer,
              currentNoteId: feedState.currentNoteId,
              displayIndex: bufferMetadata.currentIndexInBuffer + 1,
              asciiCache: feedState.asciiCache || {},
              hasInitialFeedData: true,
              bufferMetadata,
              needsSmartLoading: bufferMetadata.needsAdditionalLoading || false
            };
          } else {
            // Legacy restoration
            restoredState = {
              notes: feedState.notes,
              currentIndex: feedState.currentIndex,
              currentNoteId: feedState.currentNoteId,
              displayIndex: feedState.displayIndex,
              asciiCache: feedState.asciiCache || {},
              hasInitialFeedData: true,
              needsSmartLoading: false
            };
          }
          
        // Set buffer restoration flag immediately
        try {
          sessionStorage.setItem('bufferRestorationActive', 'true');

        } catch {}
        
        // Preload images from restored notes to ensure they display immediately
        // This prevents the "retry" links from appearing on restored images
        try {
          const imageUrls = new Set<string>();
          feedState.notes.forEach((note: any) => {
            if (note.imageUrls && Array.isArray(note.imageUrls)) {
              note.imageUrls.forEach((url: string) => {
                if (url && typeof url === 'string') {
                  imageUrls.add(url);
                }
              });
            }
          });
          
          if (imageUrls.size > 0) {

            // Import mediaLoader dynamically to avoid circular dependencies
            import('../services/mediaLoader').then(({ mediaLoader }) => {
              // Use the new batch preload method for better performance
              mediaLoader.preloadImages(Array.from(imageUrls)).catch((error) => {
                console.warn('[useNostrFeedState] Batch preload failed, but individual images may still load:', error);
              });
            }).catch(() => {
              console.warn('[useNostrFeedState] Failed to import mediaLoader, preloading disabled');
            });
          }
        } catch (error) {
          console.warn('[useNostrFeedState] Failed to preload images, continuing without preloading:', error);
        }
        
        return { shouldRestore: true, restoredState };
        }
      }
      
      // Fallback: restore if we have a saved note ID and valid index (>= 1, meaning user was viewing a specific note)
      if (savedNoteId && savedIndex) {
        const indexNum = parseInt(savedIndex, 10);
        const shouldRestore = !isNaN(indexNum) && indexNum >= 1;

        if (shouldRestore) {
          // Set buffer restoration flag for fallback restoration too
          try {
            sessionStorage.setItem('bufferRestorationActive', 'true');
          } catch {}
          
          return { 
            shouldRestore: true, 
            restoredState: {
              notes: [],
              currentIndex: 0,
              currentNoteId: savedNoteId,
              displayIndex: 1,
              asciiCache: {},
              hasInitialFeedData: false,
              needsSmartLoading: true
            }
          };
        }
      }
    } catch (error) {
      console.warn('[useNostrFeedState] Failed to check saved feed state:', error);
    }

    return { shouldRestore: false, restoredState: null };
  });

  // Core data state - initialize with restored state if available
  const [notes, setNotes] = useState<Note[]>(() => 
    initialRestorationState.restoredState?.notes || []
  );
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(() => {
    if (initialRestorationState.restoredState?.currentNoteId) {
      return initialRestorationState.restoredState.currentNoteId;
    }
    const savedNoteId = localStorage.getItem('currentNoteId');

    return savedNoteId;
  });
  const [currentIndex, setCurrentIndex] = useState(() => 
    initialRestorationState.restoredState?.currentIndex ?? 0
  );
  const [displayIndex, setDisplayIndex] = useState(() => 
    initialRestorationState.restoredState?.displayIndex ?? 1
  );
  const [metadata, setMetadata] = useState<Record<string, Metadata>>({});
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [asciiCache, setAsciiCache] = useState<AsciiCache>(() => 
    initialRestorationState.restoredState?.asciiCache || {}
  );
  
  // Track if feed data has been initially loaded to prevent premature validation
  const [hasInitialFeedData, setHasInitialFeedData] = useState(() => 
    initialRestorationState.restoredState?.hasInitialFeedData || false
  );
  const indexValidationTimerRef = useRef<number | null>(null);

  // Track restoration loading state - start as true if we have immediate restoration
  const [isRestoringPosition, setIsRestoringPosition] = useState(() => 
    initialRestorationState.shouldRestore
  );

  // Function to cancel restoration and start fresh
  const cancelRestoration = useCallback(() => {

    setIsRestoringPosition(false);
    if (currentIndex === -1) {
      setCurrentIndex(0);
      setDisplayIndex(1);
    }
    // Clear the stored feed state so it doesn't interfere with fresh start
    try {
      localStorage.removeItem('feedState');
    } catch {}
  }, [currentIndex]);



  // Track the last known unfiltered notes length to detect filtering vs data loss
  const lastUnfilteredLengthRef = useRef<number>(0);

  // Handle TanStack Query cache setup for immediate restoration
  useEffect(() => {
    if (initialRestorationState.shouldRestore && initialRestorationState.restoredState && queryClient) {
      try {
        // Set up TanStack Query cache with restored notes
        const bufferCacheKey = ['feed-buffer', 'restored', Date.now()];
        queryClient.setQueryData(bufferCacheKey, {
          pages: [{ notes: initialRestorationState.restoredState.notes, loaded: initialRestorationState.restoredState.notes.length }],
          pageParams: [undefined]
        });
        
        sessionStorage.setItem('bufferCacheKey', JSON.stringify(bufferCacheKey));

        // Set up restoration info for smart loading if needed
        if (initialRestorationState.restoredState.needsSmartLoading) {
          const restorationInfo = {
            targetIndex: initialRestorationState.restoredState.currentIndex,
            targetNoteId: initialRestorationState.restoredState.currentNoteId,
            needsAdditionalLoading: true,
            estimatedPagesNeeded: Math.ceil((initialRestorationState.restoredState.currentIndex + 1) / 50),
            startTime: Date.now(),
            isBufferRestoration: true,
            bufferMetadata: initialRestorationState.restoredState.bufferMetadata
          };
          
          sessionStorage.setItem('feedRestorationInfo', JSON.stringify(restorationInfo));
        }
      } catch (error) {
        console.warn('[useNostrFeedState] Failed to set up TanStack Query cache for immediate restoration:', error);
      }
    }
  }, []); // Run only once on mount

  // Complete immediate restoration if no smart loading is needed
  useEffect(() => {
    if (initialRestorationState.shouldRestore && isRestoringPosition && !initialRestorationState.restoredState?.needsSmartLoading) {
      // For immediate restorations that don't need additional loading, complete quickly
      const timer = setTimeout(() => {

        setIsRestoringPosition(false);
        
        // Clean up buffer restoration flag
        try {
          sessionStorage.removeItem('bufferRestorationActive');
          sessionStorage.removeItem('bufferCacheKey');
        } catch {}
      }, 100); // Very short delay to ensure UI has rendered
      
      return () => clearTimeout(timer);
    }
  }, []); // Run only once on mount

  // Synchronize displayIndex and currentIndex
  useEffect(() => {
    // If currently restoring, don't sync yet
    if (isRestoringPosition) {
      return;
    }
    
    // Ensure displayIndex and currentIndex are synchronized
    const expectedDisplayIndex = currentIndex + 1;
    if (displayIndex !== expectedDisplayIndex) {

      setDisplayIndex(expectedDisplayIndex);
    }
  }, [currentIndex, displayIndex, isRestoringPosition]);

  // UI state
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const storedPreference = localStorage.getItem('darkMode');
    if (storedPreference !== null) {
      return storedPreference === 'true';
    }
    return true;
  });
  const [useAscii, setUseAscii] = useState(() => {
    const storedPreference = localStorage.getItem('useAscii');
    if (storedPreference !== null) {
      return storedPreference === 'true';
    }
    return true;
  });
  const [useColor, setUseColor] = useState(() => {
    const storedPreference = localStorage.getItem('useColor');
    if (storedPreference !== null) {
      return storedPreference === 'true';
    }
    return true;
  });
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);
  const [showOptions, setShowOptions] = useState(false);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [lastNavigationSource, setLastNavigationSource] = useState<'swipe' | 'keyboard' | 'button' | null>(null);
  
  // Filter state
  const [showReplies, setShowReplies] = useState(() => {
    const storedPreference = localStorage.getItem('showReplies');
    if (storedPreference !== null) {
      return storedPreference === 'true';
    }
    return true;
  });
  const [showReposts, setShowReposts] = useState(() => {
    const storedPreference = localStorage.getItem('showReposts');
    if (storedPreference !== null) {
      return storedPreference === 'true';
    }
    return true;
  });
  const [nsfwBlock, setNsfwBlock] = useState(() => {
    const storedPreference = localStorage.getItem('nsfwBlock');
    if (storedPreference !== null) {
      return storedPreference === 'true';
    }
    return true;
  });
  const [imageMode, setImageMode] = useState(() => {
    const storedPreference = localStorage.getItem('imageMode');
    if (storedPreference !== null) {
      return storedPreference === 'true';
    }
    return true;
  });
  const [customHashtags, setCustomHashtags] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('customHashtags');
      if (stored) {
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed.filter((v: unknown) => typeof v === 'string') : [];
      }
    } catch {
      // ignore
    }
    return [];
  });
  
  // Pubkey management
  const [storedPubkey, setStoredPubkey] = useState<string>(() => {
    const savedPubkey = localStorage.getItem('nostrPubkey');
    return savedPubkey || '';
  });
  const [pastedPubkey, setPastedPubkey] = useState<string>('');
  const [pubkeyError, setPubkeyError] = useState<string>('');
  
  // Loading and status states
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [contactLoadError, setContactLoadError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isPageVisible, setIsPageVisible] = useState<boolean>(
    typeof document !== 'undefined' ? !document.hidden : true
  );
  const [isFetchingPage, setIsFetchingPage] = useState(false);
  const [hasMorePages, setHasMorePages] = useState(true);
  const [isCheckingForNewNotes, setIsCheckingForNewNotes] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [newNotesFound, setNewNotesFound] = useState<number>(0);
  const [showNoNewNotesMessage, setShowNoNewNotesMessage] = useState(false);
  const [isRateLimited, setIsRateLimited] = useState(false);
  
  // Profile meta visibility state
  const [showProfileMeta, setShowProfileMeta] = useState(() => {
    const storedPreference = localStorage.getItem('showProfileMeta');
    if (storedPreference !== null) {
      return storedPreference === 'true';
    }
    return false; // Default to closed
  });
  
  // Cache and modal states
  const [showClearCacheConfirm, setShowClearCacheConfirm] = useState(false);
  const [cacheStats, setCacheStats] = useState({
    notesCount: 0,
    metadataCount: 0,
    contactsCount: 0,
    asciiCacheCount: 0,
    zapTotalsCount: 0
  });

  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [contactStatus, setContactStatus] = useState<string>('');
  const [copiedPubkeys, setCopiedPubkeys] = useState<Set<string>>(new Set());

  // Feed Buffer state (Phase 1 implementation)
  const [bufferState] = useState<BufferState | null>(null);
  const [bufferStats] = useState<BufferStats | null>(null);
  const [bufferEnabled, setBufferEnabled] = useState(() => {
    const storedPreference = localStorage.getItem('bufferEnabled');
    return storedPreference !== null ? storedPreference === 'true' : false; // Disabled by default initially
  });
  
  // Sliding Window feature flag (removed due to memory leaks)
  const [useSlidingWindow] = useState(false);
  const setUseSlidingWindow = () => {}; // No-op function

  // Persist showProfileMeta state changes to localStorage
  useEffect(() => {
    localStorage.setItem('showProfileMeta', showProfileMeta.toString());
  }, [showProfileMeta]);

  // Persist bufferEnabled state changes to localStorage
  useEffect(() => {
    localStorage.setItem('bufferEnabled', bufferEnabled.toString());
  }, [bufferEnabled]);

  // Sliding window localStorage persistence removed

  // Helper functions
  const updateCurrentIndex = useCallback((newIndex: number, triggerPrefetch?: (index: number, totalNotes: number) => void) => {

    // Validate the new index
    if (isNaN(newIndex) || newIndex < 0) {

      newIndex = 0;
    }

    // Clamp to notes length if available
    if (notes.length > 0) {
      const maxIndex = notes.length - 1;
      if (newIndex > maxIndex) {

        newIndex = maxIndex;
      }
    }

    // Set the requested index; a separate effect clamps if it's out of range.
    setCurrentIndex(newIndex);
    // Keep displayIndex in sync with currentIndex
    setDisplayIndex(newIndex + 1);

    // Store the current note ID for reliable restoration
    if (notes.length > 0 && newIndex >= 0 && newIndex < notes.length) {
      const currentNote = notes[newIndex];
      if (currentNote && currentNote.id) {
        setCurrentNoteId(currentNote.id);

      }
    }

    localStorage.setItem('currentIndex', (newIndex + 1).toString()); // Store displayed value
    localStorage.setItem('displayIndex', (newIndex + 1).toString()); // Keep displayIndex in sync

    // Trigger prefetch callback if provided (for infinite scroll)
    if (triggerPrefetch) {
      triggerPrefetch(newIndex, notes.length);
    }
  }, [notes.length]);

  // Helper function to find note index by ID
  const findNoteIndexById = useCallback((noteId: string): number => {
    const index = notes.findIndex(note => note.id === noteId);

    return index;
  }, [notes]);

  // Helper function to update current index by note ID
  const updateCurrentIndexByNoteId = useCallback((noteId: string): boolean => {
    const index = findNoteIndexById(noteId);
    if (index !== -1) {

      updateCurrentIndex(index);
      return true;
    } else {

      return false;
    }
  }, [findNoteIndexById, updateCurrentIndex]);

  // Persist currentIndex and currentNoteId regardless of how they are updated elsewhere
  useEffect(() => {
    try {
      const displayedValue = currentIndex + 1;
      localStorage.setItem('currentIndex', displayedValue.toString()); // Store displayed value
    } catch {}
  }, [currentIndex]);

  // Persist currentNoteId when it changes
  useEffect(() => {
    try {
      if (currentNoteId) {
        localStorage.setItem('currentNoteId', currentNoteId);

      } else {
        localStorage.removeItem('currentNoteId');
      }
    } catch {}
  }, [currentNoteId]);

  // Enhanced feed state persistence - store strategic window around current position
  useEffect(() => {
    
    if (notes.length > 0 && currentIndex >= 0) {
      try {
        // Configuration for strategic storage
        const BUFFER_SIZE_BEFORE = 25; // Notes to store before current position
        const BUFFER_SIZE_AFTER = 25;  // Notes to store after current position
        const MIN_TOTAL_STORAGE = 50;  // Minimum notes to always store
        
        // Calculate strategic window boundaries
        const startIndex = Math.max(0, currentIndex - BUFFER_SIZE_BEFORE);
        const endIndex = Math.min(notes.length - 1, currentIndex + BUFFER_SIZE_AFTER);
        
        // Ensure we store at least MIN_TOTAL_STORAGE notes when possible
        let adjustedStartIndex = startIndex;
        let adjustedEndIndex = endIndex;
        const currentWindowSize = endIndex - startIndex + 1;
        
        if (currentWindowSize < MIN_TOTAL_STORAGE && notes.length >= MIN_TOTAL_STORAGE) {
          const deficit = MIN_TOTAL_STORAGE - currentWindowSize;
          const halfDeficit = Math.floor(deficit / 2);
          
          // Try to expand both directions equally
          const canExpandBefore = startIndex - halfDeficit >= 0;
          const canExpandAfter = endIndex + halfDeficit < notes.length;
          
          if (canExpandBefore && canExpandAfter) {
            adjustedStartIndex = startIndex - halfDeficit;
            adjustedEndIndex = endIndex + halfDeficit;
          } else if (canExpandBefore) {
            adjustedStartIndex = Math.max(0, startIndex - deficit);
          } else if (canExpandAfter) {
            adjustedEndIndex = Math.min(notes.length - 1, endIndex + deficit);
          }
        }
        
        // Extract the strategic window of notes
        const strategicNotes = notes.slice(adjustedStartIndex, adjustedEndIndex + 1);
        
        // Extract ASCII cache entries relevant to the strategic notes (optional enhancement)
        let relevantAsciiCache: AsciiCache = {};
        try {
          if (asciiCache && typeof asciiCache === 'object') {
            strategicNotes.forEach(note => {
              if (note && note.imageUrls && Array.isArray(note.imageUrls)) {
                note.imageUrls.forEach((url: string) => {
                  if (url && typeof url === 'string' && asciiCache[url]) {
                    relevantAsciiCache[url] = asciiCache[url];
                  }
                });
              }
            });

          }
        } catch (error) {
          console.warn('[useNostrFeedState] Failed to extract ASCII cache entries, continuing without ASCII cache:', error);
          relevantAsciiCache = {}; // Reset to empty object on error
        }
        
        // Calculate metadata for restoration
        const bufferMetadata = {
          originalTotalLength: notes.length,
          bufferStartIndex: adjustedStartIndex,
          bufferEndIndex: adjustedEndIndex,
          currentIndexInBuffer: currentIndex - adjustedStartIndex,
          hasNotesBefore: adjustedStartIndex > 0,
          hasNotesAfter: adjustedEndIndex < notes.length - 1,
          
          // Information needed for smart loading during restoration
          estimatedPagesNeeded: Math.ceil((currentIndex + 1) / 50), // Assume 50 notes per page
          oldestNoteTimestamp: notes[adjustedEndIndex]?.created_at,
          newestNoteTimestamp: notes[adjustedStartIndex]?.created_at,
        };
        
        const feedState = {
          notes: strategicNotes, // Store strategic window instead of all notes
          bufferMetadata,
          currentIndex,
          currentNoteId,
          displayIndex,
          asciiCache: relevantAsciiCache, // Include ASCII cache for restored notes
          timestamp: Date.now(),
          version: '2.0' // Version for migration compatibility
        };
        
        localStorage.setItem('feedState', JSON.stringify(feedState));

      } catch (error) {
        console.warn('[useNostrFeedState] Failed to store feed state:', error);
        // Fallback to simple storage if strategic storage fails
        try {
          const fallbackNotes = notes.slice(Math.max(0, currentIndex - 25), currentIndex + 26);
          
          // Extract ASCII cache for fallback notes too (optional enhancement)
          let fallbackAsciiCache: AsciiCache = {};
          try {
            if (asciiCache && typeof asciiCache === 'object') {
              fallbackNotes.forEach(note => {
                if (note && note.imageUrls && Array.isArray(note.imageUrls)) {
                  note.imageUrls.forEach((url: string) => {
                    if (url && typeof url === 'string' && asciiCache[url]) {
                      fallbackAsciiCache[url] = asciiCache[url];
                    }
                  });
                }
              });
            }
          } catch (error) {
            console.warn('[useNostrFeedState] Failed to extract fallback ASCII cache entries:', error);
            fallbackAsciiCache = {}; // Reset to empty object on error
          }
          
          const simpleFeedState = {
            notes: fallbackNotes,
            currentIndex,
            currentNoteId,
            displayIndex,
            asciiCache: fallbackAsciiCache, // Include ASCII cache in fallback too
            timestamp: Date.now(),
            version: '1.0' // Fallback version
          };
          localStorage.setItem('feedState', JSON.stringify(simpleFeedState));
        } catch (fallbackError) {
          console.error('[useNostrFeedState] Failed to store even simple feed state:', fallbackError);
        }
      }
    }
  }, [notes, currentIndex, currentNoteId, displayIndex]); // Store strategic state changes

  // Debug restoration state changes
  useEffect(() => {

  }, [isRestoringPosition]);

  // Persist displayIndex
  useEffect(() => {
    try {
      localStorage.setItem('displayIndex', String(displayIndex));
    } catch {}
  }, [displayIndex]);

  // Clamp index automatically when notes length changes (debounced to allow page restoration)
  useEffect(() => {
    if (!hasInitialFeedData) return;
    if (indexValidationTimerRef.current != null) {
      try { clearTimeout(indexValidationTimerRef.current as unknown as number); } catch {}
      indexValidationTimerRef.current = null;
    }
    indexValidationTimerRef.current = window.setTimeout(() => {
      const maxIndex = Math.max(0, notes.length - 1);
      const desired = Math.min(currentIndex, maxIndex);

      if (notes.length === 0) {
        if (hasInitialFeedData && currentIndex !== 0) {
          setCurrentIndex(0);
          setDisplayIndex(1);
          try { localStorage.setItem('currentIndex', '1'); } catch {}
          try { localStorage.setItem('displayIndex', '1'); } catch {}
        }
        return;
      }

      if (desired !== currentIndex) {
        setCurrentIndex(desired);
        setDisplayIndex(desired + 1);
        try { localStorage.setItem('currentIndex', (desired + 1).toString()); } catch {}
        try { localStorage.setItem('displayIndex', (desired + 1).toString()); } catch {}
      }
    }, 120);
    return () => {
      if (indexValidationTimerRef.current != null) {
        try { clearTimeout(indexValidationTimerRef.current as unknown as number); } catch {}
        indexValidationTimerRef.current = null;
      }
    };
  }, [notes.length, currentIndex, hasInitialFeedData]);

  // Special effect to handle cached feed data restoration
  useEffect(() => {
    // If we're in restoration mode, check if TanStack data now contains our target note
    if (isRestoringPosition && currentNoteId) {
      const noteIndex = notes.findIndex(note => note.id === currentNoteId);
      if (noteIndex !== -1) {

        setCurrentIndex(noteIndex);
        setDisplayIndex(noteIndex + 1);
        setIsRestoringPosition(false);
        return;
      } else {

        return;
      }
    }
    
    // Skip regular cached data restoration if we're still in restoration mode
    if (isRestoringPosition) {

      return;
    }

    // Only run this effect when notes are loaded and we have a saved note ID or non-zero currentIndex
    if (notes.length > 0 && (currentNoteId || currentIndex > 0)) {

      // Try to restore by note ID first (most reliable)
      if (currentNoteId) {
        const noteIndex = notes.findIndex(note => note.id === currentNoteId);
        if (noteIndex !== -1) {

          setCurrentIndex(noteIndex);
          setDisplayIndex(noteIndex + 1);
          return; // Successfully restored by ID
        } else {

        }
      }

      // Fall back to index-based restoration if note ID approach failed
      const maxIndex = notes.length - 1;
      if (currentIndex > maxIndex) {
        // Only clamp if this appears to be actual data loss, not just filtering
        // If the notes length hasn't decreased significantly from the last known unfiltered length,
        // it might be filtering that's causing the length change
        const significantDataLoss = lastUnfilteredLengthRef.current > 0 &&
          notes.length < lastUnfilteredLengthRef.current * 0.8; // 20% threshold

        if (significantDataLoss) {

          setCurrentIndex(maxIndex);
          setDisplayIndex(maxIndex + 1);
          try { localStorage.setItem('currentIndex', (maxIndex + 1).toString()); } catch {} // Store displayed value
          try { localStorage.setItem('displayIndex', (maxIndex + 1).toString()); } catch {} // Keep displayIndex in sync
        } else {

        }
      }
    }
  }, [notes.length, currentIndex, currentNoteId, isRestoringPosition]);

  // Handle new data from TanStack Query (for fresh data loading only)
  useEffect(() => {
    // If we're in restoration mode, don't interfere with restoration
    if (isRestoringPosition) {
      return;
    }

    // This effect runs when notes transition from empty to having data from TanStack Query
    if (notes.length > 0 && !hasInitialFeedData) {
      setHasInitialFeedData(true);
      lastUnfilteredLengthRef.current = notes.length;

    }
  }, [notes.length, hasInitialFeedData, isRestoringPosition]);

  // Clamp displayIndex when notes length changes
  useEffect(() => {
    if (notes.length > 0 && displayIndex > notes.length) {

      const clamped = Math.min(displayIndex, notes.length);
      setDisplayIndex(clamped);
      // Keep currentIndex in sync
      const newCurrentIndex = clamped - 1;
      setCurrentIndex(newCurrentIndex);
      try { localStorage.setItem('displayIndex', String(clamped)); } catch {}
      try { localStorage.setItem('currentIndex', String(newCurrentIndex)); } catch {}
    }
  }, [notes.length, displayIndex]);

  // Memory management: Clean up old notes while preserving buffer around current index
  const cleanupNotes = useCallback((bufferSize: number = 100) => {
    if (notes.length <= bufferSize * 2) return; // Only cleanup when we have significantly more notes

    // Keep a simple buffer around current position
    const keepStart = Math.max(0, currentIndex - bufferSize);
    const keepEnd = Math.min(notes.length - 1, currentIndex + bufferSize);

    const newNotes = notes.slice(keepStart, keepEnd + 1);

    // Adjust currentIndex if we removed notes before it
    let newCurrentIndex = currentIndex;
    if (keepStart > 0) {
      newCurrentIndex = Math.max(0, currentIndex - keepStart);
    }

    // Only update if we actually removed notes
    if (newNotes.length < notes.length) {
      // Update notes and index
      setNotes(newNotes);
      if (newCurrentIndex !== currentIndex) {
        setCurrentIndex(newCurrentIndex);
        setDisplayIndex(newCurrentIndex + 1);
        try {
          localStorage.setItem('currentIndex', (newCurrentIndex + 1).toString());
        } catch {}
        try {
          localStorage.setItem('displayIndex', (newCurrentIndex + 1).toString());
        } catch {}
      }

    }
  }, [notes, currentIndex]);

  // Helper function to update last unfiltered length
  const updateLastUnfilteredLength = useCallback((length: number) => {
    lastUnfilteredLengthRef.current = length;

  }, []);

  // Sliding window restoration removed (functionality disabled due to memory leaks)
  const restoreFromSlidingWindow = useCallback(() => {
    // No-op function
  }, []);

  // Strategic restoration helper functions
  const getRestorationInfo = useCallback(() => {
    try {
      const restorationInfoStr = sessionStorage.getItem('feedRestorationInfo');
      return restorationInfoStr ? JSON.parse(restorationInfoStr) : null;
    } catch {
      return null;
    }
  }, []);

  const clearRestorationInfo = useCallback(() => {
    try {
      sessionStorage.removeItem('feedRestorationInfo');
    } catch {}
  }, []);

  const bumpDisplayIndex = useCallback((delta: number) => {
    if (typeof delta !== 'number' || !isFinite(delta)) return;
    setDisplayIndex((prev: number) => {
      const next = Math.max(1, Math.floor(prev + delta));
      // Ensure display index never exceeds total notes count
      const maxDisplayIndex = Math.max(1, notes.length);
      const clamped = Math.min(next, maxDisplayIndex);
      try { localStorage.setItem('displayIndex', String(clamped)); } catch {}
      // Keep currentIndex in sync with displayIndex
      const newCurrentIndex = clamped - 1;
      setCurrentIndex(newCurrentIndex);
      try { localStorage.setItem('currentIndex', String(clamped)); } catch {}
      return clamped;
    });
  }, [notes.length]);

  // Trigger cleanup when notes grow significantly - use a higher threshold
  useEffect(() => {
    if (notes.length > 200) { // Only cleanup when we have more than 200 notes

      cleanupNotes(100); // Keep 100 notes in buffer
    }
  }, [notes.length, cleanupNotes]);

  // Note: ASCII cache loading and persistence removed - ASCII renderer now renders dynamically
  
  return useMemo(() => ({
    // Core data
    notes,
    setNotes,
    currentIndex,
    setCurrentIndex,
    currentNoteId,
    setCurrentNoteId,
    displayIndex,
    setDisplayIndex,
    metadata,
    setMetadata,
    contacts,
    setContacts,
    asciiCache,
    setAsciiCache,
    
    // UI state
    isDarkMode,
    setIsDarkMode,
    useAscii,
    setUseAscii,
    useColor,
    setUseColor,
    isMobile,
    setIsMobile,
    showOptions,
    setShowOptions,
    fullScreenImage,
    setFullScreenImage,
    isDragging,
    setIsDragging,
    lastNavigationSource,
    setLastNavigationSource,
    
    // Filter state
    showReplies,
    setShowReplies,
    showReposts,
    setShowReposts,
    nsfwBlock,
    setNsfwBlock,
    imageMode,
    setImageMode,
    customHashtags,
    setCustomHashtags,
    isRestoringPosition,
    setIsRestoringPosition,
    cancelRestoration,
    
    // Pubkey management
    storedPubkey,
    setStoredPubkey,
    pastedPubkey,
    setPastedPubkey,
    pubkeyError,
    setPubkeyError,
    
    // Loading and status states
    isLoadingContacts,
    setIsLoadingContacts,
    contactLoadError,
    setContactLoadError,
    isInitialized,
    setIsInitialized,
    isPageVisible,
    setIsPageVisible,
    isFetchingPage,
    setIsFetchingPage,
    hasMorePages,
    setHasMorePages,
    isCheckingForNewNotes,
    setIsCheckingForNewNotes,
    isClearingCache,
    setIsClearingCache,
    newNotesFound,
    setNewNotesFound,
    showNoNewNotesMessage,
    setShowNoNewNotesMessage,
    isRateLimited,
    setIsRateLimited,
    hasInitialFeedData,
    
    // Profile meta visibility state
    showProfileMeta,
    setShowProfileMeta,
    
    // Cache and modal states
    showClearCacheConfirm,
    setShowClearCacheConfirm,
    cacheStats,
    setCacheStats,

    contactSearchQuery,
    setContactSearchQuery,
    contactStatus,
    setContactStatus,
    copiedPubkeys,
    setCopiedPubkeys,

    // Feed Buffer state (Phase 1 implementation)
    bufferState,
    bufferStats,
    bufferEnabled,
    setBufferEnabled,
    bufferConfig: DEFAULT_BUFFER_CONFIG,
    
    // Sliding Window feature flag
    useSlidingWindow,
    setUseSlidingWindow,

    // Helper functions
    updateCurrentIndex,
    updateCurrentIndexByNoteId,
    findNoteIndexById,
    bumpDisplayIndex,
    cleanupNotes,
    updateLastUnfilteredLength,
    
    // Strategic restoration helpers
    getRestorationInfo,
    clearRestorationInfo,
    
    // Sliding window restoration
    restoreFromSlidingWindow,
  }), [
    // Core data
    notes, setNotes, currentIndex, setCurrentIndex, currentNoteId, setCurrentNoteId,
    displayIndex, setDisplayIndex, metadata, setMetadata, contacts, setContacts,
    asciiCache, setAsciiCache,
    
    // UI state
    isDarkMode, setIsDarkMode, useAscii, setUseAscii, useColor, setUseColor,
    isMobile, setIsMobile, showOptions, setShowOptions, fullScreenImage, setFullScreenImage,
    isDragging, setIsDragging, lastNavigationSource, setLastNavigationSource,
    
    // Filter state
    showReplies, setShowReplies, showReposts, setShowReposts, nsfwBlock, setNsfwBlock,
    imageMode, setImageMode, customHashtags, setCustomHashtags, isRestoringPosition,
    setIsRestoringPosition, cancelRestoration,
    
    // Pubkey management
    storedPubkey, setStoredPubkey, pastedPubkey, setPastedPubkey, pubkeyError, setPubkeyError,
    
    // Loading and status states
    isLoadingContacts, setIsLoadingContacts, contactLoadError, setContactLoadError,
    isInitialized, setIsInitialized, isPageVisible, setIsPageVisible, isFetchingPage,
    setIsFetchingPage, hasMorePages, setHasMorePages, isCheckingForNewNotes,
    setIsCheckingForNewNotes, isClearingCache, setIsClearingCache, newNotesFound,
    setNewNotesFound, showNoNewNotesMessage, setShowNoNewNotesMessage, isRateLimited,
    setIsRateLimited, hasInitialFeedData,
    
    // Profile meta visibility state
    showProfileMeta, setShowProfileMeta,
    
    // Cache and modal states
    showClearCacheConfirm, setShowClearCacheConfirm, cacheStats, setCacheStats,
    contactSearchQuery, setContactSearchQuery, contactStatus, setContactStatus,
    copiedPubkeys, setCopiedPubkeys,
    
    // Feed Buffer state
    bufferState, bufferStats, bufferEnabled, setBufferEnabled,
    
    // Sliding Window feature flag
    useSlidingWindow, setUseSlidingWindow,
    
    // Helper functions
    updateCurrentIndex, updateCurrentIndexByNoteId, findNoteIndexById, bumpDisplayIndex,
    cleanupNotes, updateLastUnfilteredLength, getRestorationInfo, clearRestorationInfo,
    restoreFromSlidingWindow
  ]);
};
