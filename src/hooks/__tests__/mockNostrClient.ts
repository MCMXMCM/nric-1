import { vi } from 'vitest';

export const mockNotes = Array.from({ length: 20 }, (_, i) => ({
  id: `note-${i}`,
  pubkey: 'test-pubkey',
  content: `test content ${i}`,
  created_at: Math.floor(Date.now() / 1000) - (i * 24 * 60 * 60), // Each note is 1 day older
  kind: 1,
  tags: [],
  imageUrls: [],
  videoUrls: [],
  receivedAt: Date.now(),
}));

export const mockNostrClient = {
  fetchNotesPage: vi.fn().mockImplementation(async () => ({
    notes: mockNotes,
    loaded: mockNotes.length,
  })),
};
