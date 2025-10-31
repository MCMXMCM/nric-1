import { nip19 } from 'nostr-tools';

export const formatTruncated = (s: string): string => {
  return s && s.length > 16 ? `${s.slice(0, 8)}...${s.slice(-6)}` : s;
};

export const convertPubkeyToHex = (pubkey: string): { hex: string; npub: string } => {
  try {
    if (/^[0-9a-fA-F]{64}$/.test(pubkey)) {
      const hex = pubkey.toLowerCase();
      const npub = nip19.npubEncode(hex);
      return { hex, npub };
    }
    
    if (pubkey.startsWith('npub')) {
      const decoded = nip19.decode(pubkey);
      if (decoded.type === 'npub' && typeof decoded.data === 'string') {
        return { hex: decoded.data, npub: pubkey };
      }
    }
    
    return { hex: '', npub: '' };
  } catch {
    return { hex: '', npub: '' };
  }
};

export const createButtonStyle = (variant: 'default' | 'danger' = 'default') => {
  const isDanger = variant === 'danger';
  return {
    backgroundColor: 'transparent',
    color: isDanger ? 'var(--btn-accent)' : 'var(--text-color)',
    border: isDanger ? '1px dotted var(--btn-accent)' : '1px dotted var(--border-color)',
    padding: '0.25rem 0.5rem',
    cursor: 'pointer',
    
    fontSize: '0.875rem',
    transition: 'all 0.3s ease'
  };
};

export const createInputStyle = (isMobile: boolean) => ({
  backgroundColor: 'transparent',
  color: 'var(--text-color)',
  border: '1px dotted var(--border-color)',
  padding: '0.25rem 0.5rem',
  
  fontSize: '0.875rem',
  width: '100%',
  borderRadius: '0',
  boxSizing: 'border-box' as const,
  ...(isMobile && {
    onFocus: (e: React.FocusEvent<HTMLInputElement>) => {
      e.currentTarget.style.fontSize = '16px';
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
      e.currentTarget.style.fontSize = '0.875rem';
    }
  })
});

export const createRelayInputStyle = () => ({
  flex: 1,
  padding: '0.5rem',
  border: '1px solid var(--border-color)',
  borderRadius: 0,
  backgroundColor: 'var(--app-bg-color )',
  color: 'var(--text-color)',
  
  fontSize: '0.875rem'
});

export const getDisplayInfo = (
  pubkey: string, 
  metadata: Record<string, any>
) => {
  const { hex, npub } = convertPubkeyToHex(pubkey);
  const md = (hex && metadata[hex]) ? metadata[hex] : (metadata[pubkey] || null);
  const display = (md?.display_name || (md as any)?.name || '') || '';
  const displayTitle = display && display.trim().length > 0 ? display : (npub || pubkey);
  const truncated = npub ? formatTruncated(npub) : formatTruncated(pubkey);
  const initialChar = (displayTitle || '?').charAt(0).toUpperCase();
  const picture = md?.picture || '';
  
  return {
    hex,
    npub,
    display,
    displayTitle,
    truncated,
    initialChar,
    picture,
    metadata: md
  };
};
