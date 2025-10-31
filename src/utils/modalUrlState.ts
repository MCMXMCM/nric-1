/**
 * Utility functions for managing modal states in URL parameters
 * Enables deep linking and state persistence for PWA usage
 */

export interface ModalState {
  settings?: boolean;
  contacts?: 'followers' | 'following';
  thread?: string; // note ID for thread modal
  reply?: string; // note ID for reply modal
  repost?: string; // note ID for repost modal
  zap?: string; // note ID for zap modal
  edit?: boolean; // edit profile modal

  // Settings confirmation dialogs
  clearCache?: boolean;
  clearMetadataCache?: boolean;
  clearContactsCache?: boolean;
  clearKeys?: boolean;
  clearAllCaches?: boolean;
  clearSavedKeys?: boolean;
  clearStoredWallet?: boolean;
  resetPreferences?: boolean;
  signOut?: boolean;
  removeRelay?: string; // relay URL to remove

  // Settings modals
  nsecLogin?: boolean;
  savedAccounts?: boolean;
  unlockKey?: boolean;

  // NWC (Nostr Wallet Connect) modals
  walletConnect?: boolean;
  savedWallets?: boolean;
  passphrasePrompt?: boolean;
}

/**
 * Parse modal state from URL search parameters
 */
export function parseModalState(searchParams: URLSearchParams): ModalState {
  const state: ModalState = {};
  
  if (searchParams.get('settings') === 'true') {
    state.settings = true;
  }
  
  const contacts = searchParams.get('contacts');
  if (contacts === 'followers' || contacts === 'following') {
    state.contacts = contacts;
  }
  
  const thread = searchParams.get('thread');
  if (thread) {
    state.thread = thread;
  }
  const reply = searchParams.get('reply');
  if (reply) {
    state.reply = reply;
  }
  const repost = searchParams.get('repost');
  if (repost) {
    state.repost = repost;
  }
  const zap = searchParams.get('zap');
  if (zap) {
    state.zap = zap;
  }
  if (searchParams.get('edit') === 'true') {
    state.edit = true;
  }
  
  // Settings confirmation dialogs
  if (searchParams.get('clearCache') === 'true') {
    state.clearCache = true;
  }
  if (searchParams.get('clearContactsCache') === 'true') {
    state.clearContactsCache = true;
  }
  if (searchParams.get('clearAllCaches') === 'true') {
    state.clearAllCaches = true;
  }
  if (searchParams.get('clearSavedKeys') === 'true') {
    state.clearSavedKeys = true;
  }
  if (searchParams.get('clearStoredWallet') === 'true') {
    state.clearStoredWallet = true;
  }
  if (searchParams.get('resetPreferences') === 'true') {
    state.resetPreferences = true;
  }
  if (searchParams.get('signOut') === 'true') {
    state.signOut = true;
  }
  
  const removeRelay = searchParams.get('removeRelay');
  if (removeRelay) {
    state.removeRelay = removeRelay;
  }
  
  // Settings modals
  if (searchParams.get('nsecLogin') === 'true') {
    state.nsecLogin = true;
  }
  if (searchParams.get('savedAccounts') === 'true') {
    state.savedAccounts = true;
  }
  if (searchParams.get('unlockKey') === 'true') {
    state.unlockKey = true;
  }

  // NWC modals
  if (searchParams.get('walletConnect') === 'true') {
    state.walletConnect = true;
  }
  if (searchParams.get('savedWallets') === 'true') {
    state.savedWallets = true;
  }
  if (searchParams.get('passphrasePrompt') === 'true') {
    state.passphrasePrompt = true;
  }
  
  return state;
}

/**
 * Convert modal state to URL search parameters
 */
export function modalStateToSearchParams(state: ModalState, currentParams?: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams(currentParams || '');
  
  // Clear existing modal parameters
  params.delete('settings');
  params.delete('contacts');
  params.delete('thread');
  params.delete('reply');
  params.delete('repost');
  params.delete('zap');
  params.delete('edit');
  params.delete('clearCache');
  params.delete('clearContactsCache');
  params.delete('clearAllCaches');
  params.delete('clearSavedKeys');
  params.delete('clearStoredWallet');
  params.delete('resetPreferences');
  params.delete('signOut');
  params.delete('removeRelay');
  params.delete('nsecLogin');
  params.delete('savedAccounts');
  params.delete('unlockKey');
  params.delete('walletConnect');
  params.delete('savedWallets');
  params.delete('passphrasePrompt');
  
  // Add new modal parameters
  if (state.settings) {
    params.set('settings', 'true');
  }
  
  if (state.contacts) {
    params.set('contacts', state.contacts);
  }
  
  if (state.thread) {
    params.set('thread', state.thread);
  }
  if (state.reply) {
    params.set('reply', state.reply);
  }
  if (state.repost) {
    params.set('repost', state.repost);
  }
  if (state.zap) {
    params.set('zap', state.zap);
  }
  
  if (state.edit) {
    params.set('edit', 'true');
  }
  
  // Settings confirmation dialogs
  if (state.clearCache) {
    params.set('clearCache', 'true');
  }
  if (state.clearContactsCache) {
    params.set('clearContactsCache', 'true');
  }
  if (state.clearAllCaches) {
    params.set('clearAllCaches', 'true');
  }
  if (state.clearSavedKeys) {
    params.set('clearSavedKeys', 'true');
  }
  if (state.clearStoredWallet) {
    params.set('clearStoredWallet', 'true');
  }
  if (state.resetPreferences) {
    params.set('resetPreferences', 'true');
  }
  if (state.signOut) {
    params.set('signOut', 'true');
  }
  if (state.removeRelay) {
    params.set('removeRelay', state.removeRelay);
  }
  
  // Settings modals
  if (state.nsecLogin) {
    params.set('nsecLogin', 'true');
  }
  if (state.savedAccounts) {
    params.set('savedAccounts', 'true');
  }
  if (state.unlockKey) {
    params.set('unlockKey', 'true');
  }

  // NWC modals
  if (state.walletConnect) {
    params.set('walletConnect', 'true');
  }
  if (state.savedWallets) {
    params.set('savedWallets', 'true');
  }
  if (state.passphrasePrompt) {
    params.set('passphrasePrompt', 'true');
  }
  
  return params;
}

/**
 * Update URL with modal state without causing navigation
 */
export function updateUrlWithModalState(
  state: ModalState,
  navigate: (options: { to?: string; search?: any; replace?: boolean }) => void,
  location: { pathname: string; search: any },
  replace: boolean = true
): void {
  const currentParams = typeof location.search === 'string' 
    ? new URLSearchParams(location.search)
    : new URLSearchParams();
  const newParams = modalStateToSearchParams(state, currentParams);
  
  // Convert URLSearchParams to object for TanStack Router
  const searchObject: any = {};
  newParams.forEach((value, key) => {
    searchObject[key] = value === 'true' ? true : value === 'false' ? false : value;
  });
  
  // By default we replace to avoid history noise, but callers can opt-in to push
  navigate({ to: location.pathname, search: searchObject, replace });
}

/**
 * Remove all modal states from URL
 */
export function clearModalStateFromUrl(
  navigate: (options: { to?: string; search?: any; replace?: boolean }) => void,
  location: { pathname: string; search: any }
): void {
  updateUrlWithModalState({}, navigate, location);
}

/**
 * Check if any modal is open based on URL state
 */
export function hasOpenModals(modalState: ModalState): boolean {
  return !!(
    modalState.settings ||
    modalState.contacts ||
    modalState.thread ||
    modalState.reply ||
    modalState.repost ||
    modalState.zap ||
    modalState.edit ||
    modalState.clearCache ||
    modalState.clearContactsCache ||
    modalState.clearAllCaches ||
    modalState.clearSavedKeys ||
    modalState.clearStoredWallet ||
    modalState.resetPreferences ||
    modalState.signOut ||
    modalState.removeRelay ||
    modalState.nsecLogin ||
    modalState.savedAccounts ||
    modalState.unlockKey ||
    modalState.walletConnect ||
    modalState.savedWallets ||
    modalState.passphrasePrompt
  );
}

/**
 * Get a clean URL without modal parameters (useful for sharing)
 */
export function getCleanUrl(location: { pathname: string; search: string }): string {
  const params = new URLSearchParams(location.search);
  params.delete('settings');
  params.delete('contacts');
  params.delete('thread');
  params.delete('reply');
  params.delete('repost');
  params.delete('zap');
  params.delete('edit');
  params.delete('clearCache');
  params.delete('clearContactsCache');
  params.delete('clearAllCaches');
  params.delete('clearSavedKeys');
  params.delete('clearStoredWallet');
  params.delete('resetPreferences');
  params.delete('signOut');
  params.delete('removeRelay');
  params.delete('nsecLogin');
  params.delete('savedAccounts');
  params.delete('unlockKey');
  params.delete('walletConnect');
  params.delete('savedWallets');
  params.delete('passphrasePrompt');
  const search = params.toString();
  return `${location.pathname}${search ? '?' + search : ''}`;
}

/**
 * Navigate back in history if there is an in-app history entry; otherwise go home.
 * Use same-origin referrer and history length as heuristics.
 */
export function navigateBackOrHome(
  navigate: (options: { to?: string; search?: any; replace?: boolean; state?: any }) => void,
  location?: { state?: any }
): void {
  try {
    // iOS Safari (including PWA) has unreliable history/referrer behavior.
    // Prefer in-app navigation instead of window.history on iOS to ensure reliable back behavior.
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
    const isIOS = /iP(ad|hone|od)/.test(ua) || (/Mac/.test(ua) && 'ontouchend' in document);

    const ref = document.referrer || '';
    const sameOrigin = ref.startsWith(window.location.origin);
    if (!isIOS && window.history.length > 1 && sameOrigin) {
      // Prefer router back in-app to keep consistent state
      try {
        (navigate as any)({ to: undefined as any, replace: false, state: (location?.state as any) });
        return;
      } catch {}
      window.history.back();
    } else {
      // Extract feedIndex from current location state if available for fallback home navigation
      const currentState = location?.state as any;
      const feedIndex = typeof currentState?.feedIndex === 'number' ? currentState.feedIndex : null;
      
      if (feedIndex !== null) {
        navigate({ 
          to: '/', 
          search: { hashtag: '', note: '', action: '', thread: '', reply: '', zap: '', repost: '', passphrasePrompt: false },
          replace: false, // Create new history entry instead of replacing
          state: { 
            restoreIndex: feedIndex,
            fromFeed: true 
          } 
        });
      } else {
        navigate({ 
          to: '/', 
          search: { hashtag: '', note: '', action: '', thread: '', reply: '', zap: '', repost: '', passphrasePrompt: false },
          replace: false // Create new history entry instead of replacing
        });
      }
    }
  } catch {
    navigate({ 
      to: '/', 
      search: { hashtag: '', note: '', action: '', thread: '', reply: '', zap: '', repost: '', passphrasePrompt: false },
      replace: false // Create new history entry instead of replacing
    });
  }
}

export function navigateHome(
  navigate: (options: { to?: string; search?: any; replace?: boolean; state?: any }) => void,
  location?: { state?: any }
): void {
  // Extract feedIndex from current location state if available
  const currentState = location?.state as any;
  const feedIndex = typeof currentState?.feedIndex === 'number' ? currentState.feedIndex : null;
  
  // Navigate home and restore feed index if available
  if (feedIndex !== null) {
    navigate({ 
      to: '/', 
      search: { hashtag: '', note: '', action: '', thread: '', reply: '', zap: '', repost: '', passphrasePrompt: false },
      replace: false, // Create new history entry instead of replacing
      state: { 
        restoreIndex: feedIndex,
        fromFeed: true 
      } 
    });
  } else {
    navigate({ 
      to: '/', 
      search: { hashtag: '', note: '', action: '', thread: '', reply: '', zap: '', repost: '', passphrasePrompt: false },
      replace: false // Create new history entry instead of replacing
    });
  }
}