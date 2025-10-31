import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Note } from '../types/nostr/types'
import { CACHE_KEYS } from '../utils/cacheKeys'

interface UseNoteListOptions {
  noteIds: string[]
}

interface UseNoteListResult {
  notes: Note[]
  isLoading: boolean
  error: Error | null
  missingNoteIds: string[]
}

/**
 * Hook that manages a list of notes by fetching individual notes and computing
 * the list from cached individual notes. This enables note reuse across different contexts.
 */
export function useNoteList({
  noteIds,
}: UseNoteListOptions): UseNoteListResult {
  const queryClient = useQueryClient()

  // Get cached notes from the query client
  const cachedNotes = useMemo(() => {
    const notes: Note[] = []
    const missingIds: string[] = []

    for (const noteId of noteIds) {
      const cachedNote = queryClient.getQueryData<Note>(CACHE_KEYS.NOTE(noteId))
      if (cachedNote) {
        notes.push(cachedNote)
      } else {
        missingIds.push(noteId)
      }
    }

    return { notes, missingIds }
  }, [noteIds, queryClient])

  // Sort notes by created_at (newest first) to maintain consistent ordering
  const sortedNotes = useMemo(() => {
    return [...cachedNotes.notes].sort((a, b) => b.created_at - a.created_at)
  }, [cachedNotes.notes])

  return {
    notes: sortedNotes,
    isLoading: false, // Individual notes handle their own loading states
    error: null, // Individual notes handle their own errors
    missingNoteIds: cachedNotes.missingIds,
  }
}

/**
 * Hook for fetching note IDs (lightweight) that can be used with useNoteList
 */
export function useNoteIds(options: {
  queryKey: string[]
  queryFn: () => Promise<string[]>
  enabled?: boolean
}) {
  const { queryKey, queryFn, enabled = true } = options

  return useQuery({
    queryKey,
    queryFn,
    enabled,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
  })
}
