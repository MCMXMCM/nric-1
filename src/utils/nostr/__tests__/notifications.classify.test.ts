import { describe, it, expect } from 'vitest'
import { classifyNotification } from '../notifications'

const MY_PK = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

describe('notifications classify', () => {
  it('classifies a like (kind 7) with p tag to me', () => {
    const ev: any = {
      id: 'e1', kind: 7, pubkey: 'liker', created_at: 1,
      tags: [ ['p', MY_PK] ], content: '+'
    }
    const r = classifyNotification(ev, MY_PK)
    expect(r?.type).toBe('like')
    expect(r?.actor).toBe('liker')
  })

  it('classifies a reply (kind 1) with e tag and p tag to me', () => {
    const ev: any = {
      id: 'e2', kind: 1, pubkey: 'replier', created_at: 2,
      tags: [ ['p', MY_PK], ['e', 'parentId'] ], content: 'reply text'
    }
    const r = classifyNotification(ev, MY_PK)
    expect(r?.type).toBe('reply')
    expect(r?.actor).toBe('replier')
  })

  it('classifies a mention (kind 1) with p tag to me and no e tag', () => {
    const ev: any = {
      id: 'e3', kind: 1, pubkey: 'author', created_at: 3,
      tags: [ ['p', MY_PK] ], content: 'hey @you'
    }
    const r = classifyNotification(ev, MY_PK)
    expect(r?.type).toBe('mention')
    expect(r?.actor).toBe('author')
  })

  it('ignores unrelated notes', () => {
    const ev: any = {
      id: 'e4', kind: 1, pubkey: 'author', created_at: 4,
      tags: [], content: 'normal'
    }
    const r = classifyNotification(ev, MY_PK)
    expect(r).toBeNull()
  })

  it('should NOT notify user for like on parent note of their reply', () => {
    // Scenario: User replied to a parent note, someone likes the parent note
    // The like has #p tags including the user (because they're in the thread)
    // but #e tag points to the parent note (not user's note)
    const ev: any = {
      id: 'like1', kind: 7, pubkey: 'liker', created_at: 5,
      tags: [
        ['e', 'parent_note_id', '', 'parent_author'], // Like is on parent note
        ['p', 'parent_author'], // Parent note author
        ['p', MY_PK] // User is in p tags because they replied to parent
      ],
      content: '+'
    }
    const r = classifyNotification(ev, MY_PK, 'parent_author') // Parent note author is not the user
    // Should NOT create notification because #e tag points to parent note, not user's note
    expect(r).toBeNull()
  })

  it('should notify user for like on their own note', () => {
    // Scenario: Someone likes the user's note directly
    const ev: any = {
      id: 'like2', kind: 7, pubkey: 'liker', created_at: 6,
      tags: [
        ['e', 'my_note_id', '', MY_PK], // Like is on user's note
        ['p', MY_PK] // User is the author of the liked note
      ],
      content: '+'
    }
    const r = classifyNotification(ev, MY_PK, MY_PK) // User is the author of the liked note
    expect(r?.type).toBe('like')
    expect(r?.actor).toBe('liker')
  })
})


