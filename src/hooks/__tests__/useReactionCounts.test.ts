import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useReactionCounts } from '../useReactionCounts'

// Minimal mock for SimplePool
class PoolMock {
  constructor(public events: any[] = []) {}
  async querySync(_relays: string[], _filter: any) {
    return this.events
  }
}

describe('useReactionCounts', () => {
  it('counts only + or empty as likes; - as dislikes; emojis ignored', async () => {
    const pool = new PoolMock([
      { id: '1', pubkey: 'a', content: '+', created_at: 1, tags: [] },
      { id: '2', pubkey: 'b', content: ' ', created_at: 2, tags: [] },
      { id: '3', pubkey: 'c', content: '-', created_at: 3, tags: [] },
      { id: '4', pubkey: 'd', content: '🔥', created_at: 4, tags: [] },
      { id: '5', pubkey: 'a', content: '-', created_at: 5, tags: [] }, // latest by a should be '-'
      { id: '6', pubkey: 'b', content: '+', created_at: 1, tags: [] }, // earlier by b, ignored
    ]) as any

    const { result } = renderHook(() => useReactionCounts('note-x', ['wss://r'], pool))

    // wait microtask
    await act(async () => {})

    // Latest by pubkey a is '-', counts as dislike; b latest is ' ' counts as like; c is '-' dislike; d emoji ignored
    expect(result.current.likes).toBe(1)
    expect(result.current.total).toBe(1)
  })

  it('refetch updates counts when pool data changes', async () => {
    const pool = new PoolMock([
      { id: '1', pubkey: 'a', content: '+', created_at: 1, tags: [] },
    ]) as any
    const { result } = renderHook(() => useReactionCounts('note-y', ['wss://r'], pool))
    await act(async () => {})
    expect(result.current.likes).toBe(1)

    // mutate events to add a new disliker and one liker changing to '-'
    ;(pool as any).events = [
      { id: '1', pubkey: 'a', content: '-', created_at: 10, tags: [] },
      { id: '2', pubkey: 'b', content: '+', created_at: 11, tags: [] },
    ]

    await act(async () => {
      await result.current.refetch()
    })
    expect(result.current.likes).toBe(1)
    expect(result.current.total).toBe(1)
  })
})


