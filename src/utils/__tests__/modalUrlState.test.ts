import { describe, it, expect } from 'vitest';
import {
  parseModalState,
  modalStateToSearchParams,
  updateUrlWithModalState,
  hasOpenModals,
  getCleanUrl,
  type ModalState,
} from '../modalUrlState';

describe('modalUrlState utilities', () => {
  describe('parseModalState', () => {
    it('should parse empty state from empty search params', () => {
      const params = new URLSearchParams('');
      const state = parseModalState(params);
      expect(state).toEqual({});
    });

    it('should parse settings modal state', () => {
      const params = new URLSearchParams('?settings=true');
      const state = parseModalState(params);
      expect(state).toEqual({ settings: true });
    });

    it('should parse contacts modal state for followers', () => {
      const params = new URLSearchParams('?contacts=followers');
      const state = parseModalState(params);
      expect(state).toEqual({ contacts: 'followers' });
    });

    it('should parse contacts modal state for following', () => {
      const params = new URLSearchParams('?contacts=following');
      const state = parseModalState(params);
      expect(state).toEqual({ contacts: 'following' });
    });

    it('should parse thread modal state', () => {
      const params = new URLSearchParams('?thread=note123');
      const state = parseModalState(params);
      expect(state).toEqual({ thread: 'note123' });
    });

    it('should parse multiple modal states', () => {
      const params = new URLSearchParams('?settings=true&contacts=followers&thread=note456');
      const state = parseModalState(params);
      expect(state).toEqual({
        settings: true,
        contacts: 'followers',
        thread: 'note456',
      });
    });

    it('should ignore invalid contacts values', () => {
      const params = new URLSearchParams('?contacts=invalid');
      const state = parseModalState(params);
      expect(state).toEqual({});
    });

    it('should ignore settings false value', () => {
      const params = new URLSearchParams('?settings=false');
      const state = parseModalState(params);
      expect(state).toEqual({});
    });

    it('should parse settings confirmation dialog states', () => {
      const params = new URLSearchParams('?clearCache=true&clearContactsCache=true&clearAllCaches=true&clearSavedKeys=true&resetPreferences=true&signOut=true&removeRelay=wss://relay.example.com&nsecLogin=true&savedAccounts=true&unlockKey=true');
      const state = parseModalState(params);
      expect(state).toEqual({
        clearCache: true,
        clearContactsCache: true,
        clearAllCaches: true,
        clearSavedKeys: true,
        resetPreferences: true,
        signOut: true,
        removeRelay: 'wss://relay.example.com',
        nsecLogin: true,
        savedAccounts: true,
        unlockKey: true,
      });
    });

    it('should ignore false values for confirmation dialogs', () => {
      const params = new URLSearchParams('?clearCache=false&nsecLogin=false');
      const state = parseModalState(params);
      expect(state).toEqual({});
    });
  });

  describe('modalStateToSearchParams', () => {
    it('should create empty params from empty state', () => {
      const state: ModalState = {};
      const params = modalStateToSearchParams(state);
      expect(params.toString()).toBe('');
    });

    it('should create params for settings modal', () => {
      const state: ModalState = { settings: true };
      const params = modalStateToSearchParams(state);
      expect(params.toString()).toBe('settings=true');
    });

    it('should create params for contacts modal', () => {
      const state: ModalState = { contacts: 'followers' };
      const params = modalStateToSearchParams(state);
      expect(params.toString()).toBe('contacts=followers');
    });

    it('should create params for thread modal', () => {
      const state: ModalState = { thread: 'note123' };
      const params = modalStateToSearchParams(state);
      expect(params.toString()).toBe('thread=note123');
    });

    it('should create params for settings confirmation dialogs', () => {
      const state: ModalState = {
        clearCache: true,
        clearContactsCache: true,
        clearAllCaches: true,
        clearSavedKeys: true,
        resetPreferences: true,
        signOut: true,
        removeRelay: 'wss://relay.example.com',
        nsecLogin: true,
        savedAccounts: true,
        unlockKey: true,
      };
      const params = modalStateToSearchParams(state);
      expect(params.toString()).toBe('clearCache=true&clearContactsCache=true&clearAllCaches=true&clearSavedKeys=true&resetPreferences=true&signOut=true&removeRelay=wss%3A%2F%2Frelay.example.com&nsecLogin=true&savedAccounts=true&unlockKey=true');
    });

    it('should preserve existing non-modal params', () => {
      const existing = new URLSearchParams('?other=value');
      const state: ModalState = { settings: true };
      const params = modalStateToSearchParams(state, existing);
      expect(params.get('other')).toBe('value');
      expect(params.get('settings')).toBe('true');
    });

    it('should clear existing modal params when creating new state', () => {
      const existing = new URLSearchParams('?contacts=followers&other=value');
      const state: ModalState = { settings: true };
      const params = modalStateToSearchParams(state, existing);
      expect(params.get('contacts')).toBeNull();
      expect(params.get('settings')).toBe('true');
      expect(params.get('other')).toBe('value');
    });
  });

  describe('hasOpenModals', () => {
    it('should return false for empty state', () => {
      expect(hasOpenModals({})).toBe(false);
    });

    it('should return true for settings modal', () => {
      expect(hasOpenModals({ settings: true })).toBe(true);
    });

    it('should return true for contacts modal', () => {
      expect(hasOpenModals({ contacts: 'followers' })).toBe(true);
    });

    it('should return true for thread modal', () => {
      expect(hasOpenModals({ thread: 'note123' })).toBe(true);
    });

    it('should return true for multiple modals', () => {
      expect(hasOpenModals({ settings: true, contacts: 'following' })).toBe(true);
    });

    it('should return true for settings confirmation dialogs', () => {
      expect(hasOpenModals({ clearCache: true })).toBe(true);
      expect(hasOpenModals({ nsecLogin: true })).toBe(true);
      expect(hasOpenModals({ removeRelay: 'wss://relay.example.com' })).toBe(true);
    });

    it('should return true for any settings modal or dialog', () => {
      expect(hasOpenModals({ 
        settings: true, 
        clearCache: true, 
        nsecLogin: true 
      })).toBe(true);
    });
  });

  describe('getCleanUrl', () => {
    it('should return clean URL without modal params', () => {
      const location = {
        pathname: '/profile/npub123',
        search: '?settings=true&contacts=followers&other=value',
      };
      const cleanUrl = getCleanUrl(location);
      expect(cleanUrl).toBe('/profile/npub123?other=value');
    });

    it('should return clean URL without settings confirmation dialog params', () => {
      const location = {
        pathname: '/settings',
        search: '?settings=true&clearCache=true&nsecLogin=true&removeRelay=wss://relay.example.com&other=value',
      };
      const cleanUrl = getCleanUrl(location);
      expect(cleanUrl).toBe('/settings?other=value');
    });

    it('should return path only when no non-modal params', () => {
      const location = {
        pathname: '/profile/npub123',
        search: '?settings=true&thread=note456',
      };
      const cleanUrl = getCleanUrl(location);
      expect(cleanUrl).toBe('/profile/npub123');
    });

    it('should handle empty search params', () => {
      const location = {
        pathname: '/profile/npub123',
        search: '',
      };
      const cleanUrl = getCleanUrl(location);
      expect(cleanUrl).toBe('/profile/npub123');
    });
  });

  describe('URL state integration examples', () => {
    it('should handle profile followers URL', () => {
      const url = '/profile/npub123?contacts=followers';
      const [path, search] = url.split('?');
      const params = new URLSearchParams(search);
      const state = parseModalState(params);
      
      expect(state.contacts).toBe('followers');
      expect(hasOpenModals(state)).toBe(true);
    });

    it('should handle settings modal URL', () => {
      const url = '/?settings=true';
      const [path, search] = url.split('?');
      const params = new URLSearchParams(search);
      const state = parseModalState(params);
      
      expect(state.settings).toBe(true);
      expect(hasOpenModals(state)).toBe(true);
    });

    it('should handle thread modal URL', () => {
      const url = '/note/note123?thread=note123';
      const [path, search] = url.split('?');
      const params = new URLSearchParams(search);
      const state = parseModalState(params);
      
      expect(state.thread).toBe('note123');
      expect(hasOpenModals(state)).toBe(true);
    });

    it('should handle multiple modals in URL', () => {
      const url = '/profile/npub123?settings=true&contacts=following';
      const [path, search] = url.split('?');
      const params = new URLSearchParams(search);
      const state = parseModalState(params);
      
      expect(state.settings).toBe(true);
      expect(state.contacts).toBe('following');
      expect(hasOpenModals(state)).toBe(true);
    });

    it('should handle settings with confirmation dialogs in URL', () => {
      const url = '/?settings=true&nsecLogin=true&clearCache=true';
      const [path, search] = url.split('?');
      const params = new URLSearchParams(search);
      const state = parseModalState(params);
      
      expect(state.settings).toBe(true);
      expect(state.nsecLogin).toBe(true);
      expect(state.clearCache).toBe(true);
      expect(hasOpenModals(state)).toBe(true);
    });

    it('should handle relay removal confirmation in URL', () => {
      const url = '/?settings=true&removeRelay=wss%3A%2F%2Frelay.example.com';
      const [path, search] = url.split('?');
      const params = new URLSearchParams(search);
      const state = parseModalState(params);
      
      expect(state.settings).toBe(true);
      expect(state.removeRelay).toBe('wss://relay.example.com');
      expect(hasOpenModals(state)).toBe(true);
    });
  });
});
