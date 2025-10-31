export interface HotkeyConfig {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
  description: string;
  action: () => void;
  enabled?: boolean;
  preventDefault?: boolean;
  stopPropagation?: boolean;
}

export interface HotkeyContext {
  id: string;
  name: string;
  shortcuts: HotkeyConfig[];
  enabled: boolean;
}

export interface FocusState {
  focusedIndex: number;
  focusedNoteId: string | null;
  isFocused: boolean;
  focusVisible: boolean;
  isKeyboardNavigationActive: boolean;
  lastKeyboardNavigationTime: number;
}

export interface HotkeySystemState {
  contexts: Map<string, HotkeyContext>;
  activeContext: string | null;
  globalShortcuts: HotkeyConfig[];
  focusState: FocusState;
  isEnabled: boolean;
}

export type HotkeyAction = 
  | 'navigate-up'
  | 'navigate-down'
  | 'navigate-first'
  | 'navigate-last'
  | 'navigate-page-up'
  | 'navigate-page-down'
  | 'focus-next'
  | 'focus-previous'
  | 'action-link'
  | 'action-thread'
  | 'action-repost'
  | 'action-zap'
  | 'action-reply'
  | 'action-like'
  | 'action-profile'
  | 'action-open-note'
  | 'help-toggle'
  | 'escape';

export interface HotkeyRegistry {
  [key: string]: {
    action: HotkeyAction;
    description: string;
    context?: string;
  };
}
