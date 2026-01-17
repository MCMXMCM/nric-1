import { Store } from '@tanstack/store'

export interface UIState {
  showSettings: boolean
  isDarkMode: boolean
  useAscii: boolean
  useColor: boolean
  showReplies: boolean
  showReposts: boolean
  nsfwBlock: boolean
  imageMode: boolean
  customHashtags: string[]
  // Long Form feed mode (NIP-23)
  longFormMode?: boolean
  // Notification preferences
  muteLikes?: boolean
  muteReplies?: boolean
  muteMentions?: boolean
  muteReposts?: boolean
  muteZaps?: boolean
  notificationsLastSeen?: Record<string, number>
  // Per-note/thread notification mutes by target note id (hex)
  mutedNotificationTargetIds?: string[]
  // Blossom server configuration
  blossomServerUrls?: string[]
  primaryBlossomServerUrl?: string
  // Outbox relay mode
  outboxMode: boolean
  // Vim mode for keyboard navigation
  vimMode?: boolean
}

function readBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    if (v === null) return fallback
    return v === 'true'
  } catch {
    return fallback
  }
}

// Detect if device is mobile
function isMobileDevice(): boolean {
  try {
    const ua = navigator.userAgent || "";
    const hasTouch = (navigator as any).maxTouchPoints
      ? (navigator as any).maxTouchPoints > 1
      : false;
    // iPadOS 13+ reports as Macintosh but has touch points
    const isIPadOS = /Macintosh/i.test(ua) && hasTouch;
    const isMobileUA = /Mobi|Android|iPhone|iPad|iPod|Tablet/i.test(ua);
    return isMobileUA || isIPadOS;
  } catch {
    return false
  }
}

// Read dark mode preference with system preference fallback
function readDarkModePreference(): boolean {
  try {
    const stored = localStorage.getItem('darkMode')
    if (stored === 'true') return true
    if (stored === 'false') return false
    // No preference stored, check system preference and persist it
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    // Persist the system preference so everything stays consistent
    localStorage.setItem('darkMode', String(systemPrefersDark))
    return systemPrefersDark
  } catch {
    // Fallback to system preference if localStorage fails
    try {
      const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      return systemPrefersDark
    } catch {
      return true // Default to dark mode if everything fails
    }
  }
}

// Read ASCII mode preference with device-specific defaults
function readAsciiModePreference(): boolean {
  try {
    const stored = localStorage.getItem('useAscii')
    if (stored === 'true') return true
    if (stored === 'false') return false
    // No preference stored, use device-specific default
    // Mobile: false (ASCII mode off), Desktop: true (ASCII mode on)
    return !isMobileDevice()
  } catch {
    // Fallback to device-specific default if localStorage fails
    return !isMobileDevice()
  }
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    if (!v) return fallback
    return JSON.parse(v) as T
  } catch {
    return fallback
  }
}


// Get default hashtags for fresh installs
function getDefaultHashtags(): string[] {
  return [] // Start with empty hashtags - let users add their own
}

export const uiStore = new Store<UIState>({
  showSettings: false,
  isDarkMode: readDarkModePreference(),
  useAscii: readAsciiModePreference(),
  useColor: readBool('useColor', true),
  showReplies: readBool('showReplies', true),
  showReposts: readBool('showReposts', true),
  nsfwBlock: readBool('nsfwBlock', true),
  imageMode: readBool('imageMode', true),
  customHashtags: readJson('customHashtags', getDefaultHashtags()),
  longFormMode: readBool('longFormMode', false),
  muteLikes: readBool('muteLikes', false),
  muteReplies: readBool('muteReplies', false),
  muteMentions: readBool('muteMentions', false),
  muteReposts: readBool('muteReposts', false),
  muteZaps: readBool('muteZaps', false),
  notificationsLastSeen: readJson('notificationsLastSeen', {} as Record<string, number>),
  mutedNotificationTargetIds: readJson('mutedNotificationTargetIds', [] as string[]),
  blossomServerUrls: readJson('blossomServerUrls', [
    'https://blossom.primal.net/',
    'https://blossom.nostr.build/'
  ]),
  primaryBlossomServerUrl: readJson('primaryBlossomServerUrl', 'https://blossom.primal.net/'),
  outboxMode: readBool('outboxMode', false),
  vimMode: readBool('vimMode', false),
})

export const setShowSettings = (open: boolean) => {
  uiStore.setState((s) => ({ ...s, showSettings: open }))
}

export const setIsDarkMode = (value: boolean) => {
  try { localStorage.setItem('darkMode', String(value)) } catch {}
  uiStore.setState((s) => ({ ...s, isDarkMode: value }))
  try { window.dispatchEvent(new Event('darkModeChanged')) } catch {}
}

export const setUseAscii = (value: boolean) => {
  try { localStorage.setItem('useAscii', String(value)) } catch {}
  uiStore.setState((s) => ({ ...s, useAscii: value }))
}

export const setUseColor = (value: boolean) => {
  try { localStorage.setItem('useColor', String(value)) } catch {}
  uiStore.setState((s) => ({ ...s, useColor: value }))
}

export const setLongFormMode = (value: boolean) => {
  try { localStorage.setItem('longFormMode', String(value)) } catch {}
  uiStore.setState((s) => ({ ...s, longFormMode: value }))
}

export const setShowReplies = (value: boolean) => {
  try { localStorage.setItem('showReplies', String(value)) } catch {}
  uiStore.setState((s) => ({ ...s, showReplies: value }))
}

export const setShowReposts = (value: boolean) => {
  try { localStorage.setItem('showReposts', String(value)) } catch {}
  uiStore.setState((s) => ({ ...s, showReposts: value }))
}

export const setNsfwBlock = (value: boolean) => {
  try { localStorage.setItem('nsfwBlock', String(value)) } catch {}
  uiStore.setState((s) => ({ ...s, nsfwBlock: value }))
}


export const setImageMode = (value: boolean) => {
  try { localStorage.setItem('imageMode', String(value)) } catch {}
  uiStore.setState((s) => ({ ...s, imageMode: value }))
}

export const setCustomHashtags = (value: string[]) => {
  try { 
    localStorage.setItem('customHashtags', JSON.stringify(value));
  } catch (error) {
    console.error('Failed to save custom hashtags to localStorage:', error);
  }
  
  uiStore.setState((s) => ({ ...s, customHashtags: value }));
}

export const setOutboxMode = (value: boolean) => {
  try { localStorage.setItem('outboxMode', String(value)) } catch {}
  uiStore.setState((s) => ({ ...s, outboxMode: value }))
}

export const setMuteLikes = (value: boolean) => {
  try { localStorage.setItem('muteLikes', String(value)) } catch {}
  uiStore.setState((s) => ({ ...s, muteLikes: value }))
}

export const setMuteReplies = (value: boolean) => {
  try { localStorage.setItem('muteReplies', String(value)) } catch {}
  uiStore.setState((s) => ({ ...s, muteReplies: value }))
}

export const setMuteMentions = (value: boolean) => {
  try { localStorage.setItem('muteMentions', String(value)) } catch {}
  uiStore.setState((s) => ({ ...s, muteMentions: value }))
}

export const setMuteReposts = (value: boolean) => {
  try { localStorage.setItem('muteReposts', String(value)) } catch {}
  uiStore.setState((s) => ({ ...s, muteReposts: value }))
}

export const setMuteZaps = (value: boolean) => {
  try { localStorage.setItem('muteZaps', String(value)) } catch {}
  uiStore.setState((s) => ({ ...s, muteZaps: value }))
}

export const setNotificationsLastSeen = (map: Record<string, number>) => {
  try { localStorage.setItem('notificationsLastSeen', JSON.stringify(map)) } catch {}
  uiStore.setState((s) => ({ ...s, notificationsLastSeen: map }))
}

// Per-note mute controls
export const setMutedNotificationTargetIds = (ids: string[]) => {
  try { localStorage.setItem('mutedNotificationTargetIds', JSON.stringify(ids)) } catch {}
  uiStore.setState((s) => ({ ...s, mutedNotificationTargetIds: ids }))
}

export const addMutedNotificationTargetId = (id: string) => {
  if (!id) return
  const current = (uiStore.state.mutedNotificationTargetIds || []).slice()
  if (current.includes(id)) return
  const next = [...current, id]
  try { localStorage.setItem('mutedNotificationTargetIds', JSON.stringify(next)) } catch {}
  uiStore.setState((s) => ({ ...s, mutedNotificationTargetIds: next }))
}

export const removeMutedNotificationTargetId = (id: string) => {
  if (!id) return
  const current = (uiStore.state.mutedNotificationTargetIds || []).slice()
  const next = current.filter((x) => x !== id)
  try { localStorage.setItem('mutedNotificationTargetIds', JSON.stringify(next)) } catch {}
  uiStore.setState((s) => ({ ...s, mutedNotificationTargetIds: next }))
}

export const setBlossomServerUrls = (urls: string[]) => {
  try { localStorage.setItem('blossomServerUrls', JSON.stringify(urls)) } catch {}
  uiStore.setState((s) => ({ ...s, blossomServerUrls: urls }))
}

export const addBlossomServerUrl = (url: string) => {
  try {
    const currentUrls = readJson('blossomServerUrls', ['https://blossom.primal.net/']);
    const newUrls = [...currentUrls, url];
    localStorage.setItem('blossomServerUrls', JSON.stringify(newUrls));
    uiStore.setState((s) => ({ ...s, blossomServerUrls: newUrls }));
  } catch {}
}

export const removeBlossomServerUrl = (index: number) => {
  try {
    const currentUrls = readJson('blossomServerUrls', ['https://blossom.primal.net/']);
    const newUrls = currentUrls.filter((_, i) => i !== index);
    localStorage.setItem('blossomServerUrls', JSON.stringify(newUrls));
    uiStore.setState((s) => ({ ...s, blossomServerUrls: newUrls }));
  } catch {}
}

export const updateBlossomServerUrl = (index: number, url: string) => {
  try {
    const currentUrls = readJson('blossomServerUrls', ['https://blossom.primal.net/']);
    const newUrls = [...currentUrls];
    newUrls[index] = url;
    localStorage.setItem('blossomServerUrls', JSON.stringify(newUrls));
    uiStore.setState((s) => ({ ...s, blossomServerUrls: newUrls }));
  } catch {}
}

export const setPrimaryBlossomServerUrl = (url: string) => {
  try { localStorage.setItem('primaryBlossomServerUrl', JSON.stringify(url)) } catch {}
  uiStore.setState((s) => ({ ...s, primaryBlossomServerUrl: url }))
}

export const setVimMode = (value: boolean) => {
  try { localStorage.setItem('vimMode', String(value)) } catch {}
  uiStore.setState((s) => ({ ...s, vimMode: value }))
}

export type UIStore = typeof uiStore

// Simple subscription hook without react-specific deps
export function subscribeUI(selector: (s: UIState) => void) {
  const unsub = uiStore.subscribe(() => selector(uiStore.state))
  return unsub
}



