import { useRef, useEffect } from "react";
import { useNostrOperations } from "./useNostrOperations";
import { useFeedQuery } from "./useFeedQuery";
// Removed buffer integration - using TanStack Query native patterns

interface UseNostrFeedOperationsProps {
  state: any;
  readRelays: string[];
  userContacts: any[];
  mutedPubkeys: string[];
  uiShowReplies: boolean;
  uiShowReposts: boolean;
  uiNsfwBlock: boolean;
  uiFilterByFollow: boolean;
  uiLongFormMode?: boolean;
  uiFilterByImageNotesOnly: boolean;
  uiCustomHashtags: string[];
  nostrClient: any;
  readRelaysKey: string;
  isRelayConfigStable: boolean;
  isBufferRestorationActive: boolean;
  queryClient: any;
  fetchDisplayNames: (pubkeys: string[]) => Promise<void>;
  addDisplayNamesFromMetadata: (metadata: any) => void;
  getPubkeysNeedingFetch: (pubkeys: string[]) => string[];
}

export const useNostrFeedOperations = ({
  state,
  readRelays,
  userContacts,
  mutedPubkeys,
  uiShowReplies,
  uiShowReposts,
  uiNsfwBlock,
  uiFilterByFollow,
  uiLongFormMode,
  uiCustomHashtags,
  nostrClient,
  readRelaysKey,
  isRelayConfigStable,
  isBufferRestorationActive,
  queryClient,
  fetchDisplayNames,
  addDisplayNamesFromMetadata,
  getPubkeysNeedingFetch,
}: UseNostrFeedOperationsProps) => {
  const operationsConfig = {
    isPageVisible: state.isPageVisible,
    isFetchingPage: state.isFetchingPage,
    isRateLimited: state.isRateLimited,
    setIsRateLimited: state.setIsRateLimited,
    setIsInitialized: state.setIsInitialized,
    notes: state.notes,
    setNotes: state.setNotes,
    currentIndex: state.currentIndex,
    updateCurrentIndex: (i: number) => state.updateCurrentIndex(i),
    setCurrentIndex: state.setCurrentIndex,
    displayIndex: state.displayIndex,
    setDisplayIndex: state.setDisplayIndex,
    setHasMorePages: state.setHasMorePages,
    setIsFetchingPage: state.setIsFetchingPage,
    metadata: state.metadata,
    setMetadata: state.setMetadata,
    setContacts: state.setContacts,
    setIsLoadingContacts: state.setIsLoadingContacts,
    setContactLoadError: state.setContactLoadError,
    setContactStatus: state.setContactStatus,
    setCacheStats: state.setCacheStats,
    showReplies: uiShowReplies,
    showReposts: uiShowReposts,
    nsfwBlock: uiNsfwBlock,
    filterByFollow: uiFilterByFollow,
    longFormMode: (typeof (state as any)?.uiLongFormMode === 'boolean' ? (state as any).uiLongFormMode : undefined) || uiLongFormMode,
    customHashtags: uiCustomHashtags,
    contacts: userContacts, // Use user contacts from TanStack Query
    mutedPubkeys, // Include muted pubkeys for filtering
    isMobile: state.isMobile,
    isCheckingForNewNotes: state.isCheckingForNewNotes,
    setIsCheckingForNewNotes: state.setIsCheckingForNewNotes,
    newNotesFound: state.newNotesFound,
    setNewNotesFound: state.setNewNotesFound,
    showNoNewNotesMessage: state.showNoNewNotesMessage,
    setShowNoNewNotesMessage: state.setShowNoNewNotesMessage,
    // Relay integration
    relayUrls: readRelays,
    onNoRelays: () => {
      // Surface a brief UI toast to guide the user
      state.setShowNoNewNotesMessage(true);
      setTimeout(() => state.setShowNoNewNotesMessage(false), 2000);
    },
    // Display name functions
    fetchDisplayNames,
    addDisplayNamesFromMetadata,
    getPubkeysNeedingFetch,
    // TanStack Query client for cache invalidation
    queryClient,
  };

  const operations = useNostrOperations(operationsConfig);
  const operationsRef = useRef(operations);
  useEffect(() => {
    operationsRef.current = operations;
  }, [operations]);

  // Create feed query powered by TanStack Query, keyed by filter and relays
  const currentFilterHash = operations.getCurrentFilterHash();
  const pageSize = operations.getPageSize();

  // Use enhanced relay list for follow filter
  const enhancedRelayUrls = operations.buildFollowFilterRelays(readRelays);
  
  const feedQuery = useFeedQuery({
    nostrClient,
    relayUrls: enhancedRelayUrls,
    filterHash: currentFilterHash,
    relayKey: readRelaysKey,
    pageSize,
    buildFilter: operations.buildNotesFilter,
    showReplies: uiShowReplies,
    showReposts: uiShowReposts,
    mutedPubkeys,
    enabled: isRelayConfigStable && !isBufferRestorationActive, // Disable during buffer restoration
    shouldFetchNewData: !isBufferRestorationActive, // Don't fetch new data if buffer is being restored
  });

  // ✅ No buffer integration needed - TanStack Query handles everything efficiently

  // Note: Real-time functionality removed - not being used by UI

  return {
    operations,
    operationsRef,
    currentFilterHash,
    pageSize,
    feedQuery,
    // bufferIntegration removed - using TanStack Query native patterns
    enhancedRelayUrls,
  };
};
