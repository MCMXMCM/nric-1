import { describe, it, expect, vi } from 'vitest'
import { createHashtagClickHandler } from '../eventHandlers'

describe('createHashtagClickHandler', () => {
  it('should append new hashtag to existing hashtags', () => {
    const mockSetCustomHashtags = vi.fn()
    const mockGetCustomHashtags = vi.fn()
    
    // Mock initial hashtags
    mockGetCustomHashtags.mockReturnValue(['bitcoin', 'nostr'])
    
    const handler = createHashtagClickHandler(mockGetCustomHashtags, mockSetCustomHashtags)
    
    // Click on a new hashtag
    handler('news')
    
    // Should call setCustomHashtags with appended hashtags
    expect(mockSetCustomHashtags).toHaveBeenCalledWith(['bitcoin', 'nostr', 'news'])
  })
  
  it('should not add duplicate hashtags (case-insensitive)', () => {
    const mockSetCustomHashtags = vi.fn()
    const mockGetCustomHashtags = vi.fn()
    
    // Mock initial hashtags
    mockGetCustomHashtags.mockReturnValue(['bitcoin', 'nostr'])
    
    const handler = createHashtagClickHandler(mockGetCustomHashtags, mockSetCustomHashtags)
    
    // Click on existing hashtag with different case
    handler('Bitcoin')
    
    // Should not call setCustomHashtags since it's a duplicate
    expect(mockSetCustomHashtags).not.toHaveBeenCalled()
  })
  
  it('should handle empty hashtags array', () => {
    const mockSetCustomHashtags = vi.fn()
    const mockGetCustomHashtags = vi.fn()
    
    // Mock empty hashtags
    mockGetCustomHashtags.mockReturnValue([])
    
    const handler = createHashtagClickHandler(mockGetCustomHashtags, mockSetCustomHashtags)
    
    // Click on a hashtag
    handler('bitcoin')
    
    // Should call setCustomHashtags with just the new hashtag
    expect(mockSetCustomHashtags).toHaveBeenCalledWith(['bitcoin'])
  })
  
  it('should preserve existing hashtags when adding new ones', () => {
    const mockSetCustomHashtags = vi.fn()
    const mockGetCustomHashtags = vi.fn()
    
    // Mock multiple existing hashtags
    mockGetCustomHashtags.mockReturnValue(['bitcoin', 'nostr', 'news', 'tech'])
    
    const handler = createHashtagClickHandler(mockGetCustomHashtags, mockSetCustomHashtags)
    
    // Click on a new hashtag
    handler('crypto')
    
    // Should preserve all existing hashtags and add the new one
    expect(mockSetCustomHashtags).toHaveBeenCalledWith(['bitcoin', 'nostr', 'news', 'tech', 'crypto'])
  })
})
