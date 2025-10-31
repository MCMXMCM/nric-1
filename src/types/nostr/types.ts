export interface Note {
  id: string;
  content: string;
  pubkey: string;
  created_at: number;
  kind?: number;
  tags: string[][];
  imageUrls: string[];
  videoUrls: string[];
  receivedAt: number;
  mediaLoadError?: boolean;
  filterHash?: string;
}

export interface Contact {
  pubkey: string;
  relay?: string;
  petname?: string;
  tags?: string[][];
}

export interface Metadata {
  name?: string;
  display_name?: string;
  picture?: string;
  about?: string;
  nip05?: string;
  website?: string;
  banner?: string;
  lud16?: string;
  lud06?: string;
}

export interface MetadataStatus {
  status: 'pending' | 'success' | 'failed';
  lastAttempt?: number;
  attempts: number;
}

export interface RelayStatus {
  url: string;
  connected: boolean;
  read: boolean;
  write: boolean;
}

export type RelayPermission = 'read' | 'write' | 'readwrite' | 'indexer';

export interface AsciiCache {
  [key: string]: {
    ascii: string;
    timestamp: number;
  };
}

export interface CacheStats {
  totalNotes: number;
  totalSize: number;
  filterStats: {
    [key: string]: {
      count: number;
      size: number;
    };
  };
} 