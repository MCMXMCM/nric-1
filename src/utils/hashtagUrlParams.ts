/**
 * Utility functions for handling hashtag URL parameters
 */

/**
 * Parse hashtag parameters from URL search params
 * Supports multiple hashtags: ?hashtags=bitcoin,nostr or ?hashtag=bitcoin&hashtag=nostr
 */
export function parseHashtagParams(searchParams: URLSearchParams): string[] {
  const hashtags: string[] = [];
  
  // First try the new format: ?hashtags=bitcoin,nostr
  const hashtagsParam = searchParams.get('hashtags');
  if (hashtagsParam) {
    const splitHashtags = hashtagsParam.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
    for (const hashtag of splitHashtags) {
      // Remove # prefix if present
      const cleanHashtag = hashtag.replace(/^#+/, '');
      if (cleanHashtag.length > 0) {
        hashtags.push(cleanHashtag);
      }
    }
  } else {
    // Fallback to old format: ?hashtag=bitcoin&hashtag=nostr
    const hashtagParams = searchParams.getAll('hashtag');
    
    for (const hashtag of hashtagParams) {
      if (hashtag && typeof hashtag === 'string' && hashtag.trim().length > 0) {
        // Remove # prefix if present
        const cleanHashtag = hashtag.trim().replace(/^#+/, '');
        if (cleanHashtag.length > 0) {
          hashtags.push(cleanHashtag);
        }
      }
    }
  }
  
  return hashtags;
}

/**
 * Create URL search params with hashtag parameters
 */
export function createHashtagParams(hashtags: string[]): URLSearchParams {
  const params = new URLSearchParams();
  
  if (hashtags.length > 0) {
    // Use new format: ?hashtags=bitcoin,nostr
    const hashtagsString = hashtags
      .filter(hashtag => hashtag && typeof hashtag === 'string' && hashtag.trim().length > 0)
      .map(hashtag => hashtag.trim())
      .join(',');
    params.set('hashtags', hashtagsString);
  }
  
  return params;
}

/**
 * Update URL with hashtag parameters
 */
export function updateUrlWithHashtags(hashtags: string[], currentUrl: string): string {
  const url = new URL(currentUrl);
  
  // Remove existing hashtag parameters (both old and new formats)
  url.searchParams.delete('hashtag');
  url.searchParams.delete('hashtags');
  
  // Add new hashtag parameters using new format
  if (hashtags.length > 0) {
    const hashtagsString = hashtags
      .filter(hashtag => hashtag && typeof hashtag === 'string' && hashtag.trim().length > 0)
      .map(hashtag => hashtag.trim())
      .join(',');
    url.searchParams.set('hashtags', hashtagsString);
  }
  
  return url.toString();
}

/**
 * Get hashtag parameters from current URL
 */
export function getHashtagParamsFromUrl(): string[] {
  if (typeof window === 'undefined') return [];
  
  const searchParams = new URLSearchParams(window.location.search);
  return parseHashtagParams(searchParams);
}

/**
 * Navigate to URL with hashtag parameters
 */
export function navigateWithHashtags(hashtags: string[], navigate: (to: string, options?: { replace?: boolean }) => void, currentPath: string = '/') {
  const params = createHashtagParams(hashtags);
  const search = params.toString();
  const newPath = search ? `${currentPath}?${search}` : currentPath;
  
  navigate(newPath);
}
