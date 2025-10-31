import { useState, useCallback, useContext, useMemo } from 'react';
import { useNavigate, useLocation } from '@tanstack/react-router';
import { nip19 } from 'nostr-tools';
import { NostrContext } from '../contexts/NostrContext';
import { useLoginState } from './useLoginState';
import { usePowState } from '../stores/powStore';
import { useHaptic } from 'use-haptic';
import { usePersistentInput } from './usePersistentInput';
import type { RelayPublishStatus, PublishState } from '../components/PostPublishView';

export interface UsePublishingWorkflowOptions {
  /** Unique key for persistent input storage */
  persistentInputKey?: string;
  /** Initial content value */
  initialContent?: string;
  /** Callback when publishing is successful */
  onPublishSuccess?: (publishedId: string) => void;
  /** Callback when publishing fails */
  onPublishError?: (error: string) => void;
  /** Callback when modal should close */
  onClose?: () => void;
}

export interface UsePublishingWorkflowResult {
  // Content management
  content: string;
  setContent: (content: string) => void;
  clearPersistedContent: () => void;
  wordCount: number;

  // Publishing state
  isPosting: boolean;
  setIsPosting: (posting: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;
  
  // Post-publish state
  publishState: PublishState;
  setPublishState: (state: PublishState) => void;
  publishMessage: string;
  setPublishMessage: (message: string) => void;
  isSigning: boolean;
  setIsSigning: (signing: boolean) => void;
  relayStatuses: RelayPublishStatus[];
  setRelayStatuses: (statuses: RelayPublishStatus[]) => void;
  broadcastingComplete: boolean;
  setBroadcastingComplete: (complete: boolean) => void;
  publishedNoteId: string | null;
  setPublishedNoteId: (id: string | null) => void;
  showPostPublishView: boolean;
  setShowPostPublishView: (show: boolean) => void;

  // Authentication state
  showUnlockModal: boolean;
  setShowUnlockModal: (show: boolean) => void;
  loginState: ReturnType<typeof useLoginState>;

  // Utilities
  canPost: boolean;
  triggerHaptic: () => void;
  navigate: ReturnType<typeof useNavigate>;
  location: ReturnType<typeof useLocation>;
  
  // Context values
  nostrClient: any;
  pubkey: string | null;
  nip07Available: boolean;
  
  // POW state
  activeSession: any;
  
  // Common handlers
  handlePublishSuccess: (publishedId: string) => void;
  handlePublishError: (error: string) => void;
  resetPublishingState: () => void;
  
  // Navigation helpers
  navigateToNote: (noteId: string) => void;
  navigateToThread: (noteId: string) => void;
}

export function usePublishingWorkflow({
  persistentInputKey,
  initialContent = '',
  onPublishSuccess,
  onPublishError,
  onClose
}: UsePublishingWorkflowOptions = {}): UsePublishingWorkflowResult {
  
  // Context and hooks
  const {
    nostrClient,
    pubkey: ctxPubkey,
    nip07Available,
  } = useContext(NostrContext);
  
  const loginState = useLoginState();
  const { activeSession } = usePowState();
  const { triggerHaptic } = useHaptic();
  const navigate = useNavigate();
  const location = useLocation();

  // Content state - use persistent input if key provided, otherwise regular state
  const [regularContent, setRegularContent] = useState<string>(initialContent);
  const [persistedContent, setPersistedContent, clearPersisted] = usePersistentInput(
    persistentInputKey || 'temp-key',
    initialContent
  );
  
  // Use persisted content if key is provided, otherwise regular state
  const effectiveContent = persistentInputKey ? persistedContent : regularContent;
  const effectiveSetContent = persistentInputKey ? setPersistedContent : setRegularContent;
  const clearPersistedContent = persistentInputKey ? clearPersisted : () => setRegularContent('');

  // Word count calculation
  const wordCount = useMemo(() => {
    const trimmed = effectiveContent.trim();
    if (trimmed.length === 0) return 0;
    return trimmed.split(/\s+/).filter(Boolean).length;
  }, [effectiveContent]);

  // Publishing state
  const [isPosting, setIsPosting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // Post-publish state
  const [publishState, setPublishState] = useState<PublishState>("idle");
  const [publishMessage, setPublishMessage] = useState<string>("");
  const [isSigning, setIsSigning] = useState<boolean>(false);
  const [relayStatuses, setRelayStatuses] = useState<RelayPublishStatus[]>([]);
  const [broadcastingComplete, setBroadcastingComplete] = useState(false);
  const [publishedNoteId, setPublishedNoteId] = useState<string | null>(null);
  const [showPostPublishView, setShowPostPublishView] = useState(false);

  // Authentication state
  const [showUnlockModal, setShowUnlockModal] = useState<boolean>(false);

  // Computed values
  const canPost = useMemo(() => {
    return !!nostrClient && !!ctxPubkey && effectiveContent.trim().length > 0;
  }, [nostrClient, ctxPubkey, effectiveContent]);

  // Common handlers
  const handlePublishSuccess = useCallback((publishedId: string) => {
    setPublishedNoteId(publishedId);
    setPublishState("success");
    setBroadcastingComplete(true);
    setShowPostPublishView(true);
    triggerHaptic();
    onPublishSuccess?.(publishedId);
  }, [triggerHaptic, onPublishSuccess]);

  const handlePublishError = useCallback((errorMessage: string) => {
    setError(errorMessage);
    setPublishState("error");
    setIsPosting(false);
    setIsSigning(false);
    onPublishError?.(errorMessage);
  }, [onPublishError]);

  const resetPublishingState = useCallback(() => {
    setIsPosting(false);
    setError(null);
    setPublishState("idle");
    setPublishMessage("");
    setIsSigning(false);
    setRelayStatuses([]);
    setBroadcastingComplete(false);
    setPublishedNoteId(null);
    setShowPostPublishView(false);
    setShowUnlockModal(false);
  }, []);

  // Navigation helpers
  const navigateToNote = useCallback((noteId: string) => {
    try {
      const bech32 = nip19.noteEncode(noteId);
      navigate({ to: "/note/$noteId", params: { noteId: bech32 } });
      onClose?.();
    } catch (error) {
      console.error('Failed to navigate to note:', error);
      navigate({ to: "/note/$noteId", params: { noteId } });
      onClose?.();
    }
  }, [navigate, onClose]);

  const navigateToThread = useCallback((noteId: string) => {
    try {
      navigate({ 
        to: `/thread/${noteId}`,
        state: true, // Preserve router state for scroll restoration
      });
      onClose?.();
    } catch (error) {
      console.error('Failed to navigate to thread:', error);
    }
  }, [navigate, onClose]);

  return {
    // Content management
    content: effectiveContent,
    setContent: effectiveSetContent,
    clearPersistedContent,
    wordCount,

    // Publishing state
    isPosting,
    setIsPosting,
    error,
    setError,
    
    // Post-publish state
    publishState,
    setPublishState,
    publishMessage,
    setPublishMessage,
    isSigning,
    setIsSigning,
    relayStatuses,
    setRelayStatuses,
    broadcastingComplete,
    setBroadcastingComplete,
    publishedNoteId,
    setPublishedNoteId,
    showPostPublishView,
    setShowPostPublishView,

    // Authentication state
    showUnlockModal,
    setShowUnlockModal,
    loginState,

    // Utilities
    canPost,
    triggerHaptic,
    navigate,
    location,
    
    // Context values
    nostrClient,
    pubkey: ctxPubkey,
    nip07Available,
    
    // POW state
    activeSession,
    
    // Common handlers
    handlePublishSuccess,
    handlePublishError,
    resetPublishingState,
    
    // Navigation helpers
    navigateToNote,
    navigateToThread,
  };
}
