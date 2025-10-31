/**
 * Universal hashtag navigation utilities
 * Provides consistent hashtag clicking behavior across all views
 */

import { useNavigate } from '@tanstack/react-router';
import { useNostrFeedState } from '../hooks/useNostrFeedState';

/**
 * Creates a universal hashtag click handler that:
 * 1. Adds the hashtag to the current filter state
 * 2. Saves to localStorage
 * 3. Navigates to the main feed with the hashtag filter applied
 * 
 * This works consistently across all views (note view, profile view, etc.)
 */
export function useUniversalHashtagHandler() {
  const navigate = useNavigate();
  const state = useNostrFeedState();

  return (hashtag: string) => {
    // Remove # prefix if present and normalize
    const cleanHashtag = hashtag.replace(/^#+/, '').trim();
    const normalizedHashtag = cleanHashtag.toLowerCase();
    const currentHashtags = Array.isArray(state.customHashtags)
      ? state.customHashtags
      : [];

    // Check if hashtag already exists (case-insensitive)
    if (currentHashtags.some(tag => tag.toLowerCase() === normalizedHashtag)) {
      return; // Already exists, do nothing
    }

    // Add the cleaned hashtag to custom hashtags
    const updatedHashtags = [...currentHashtags, cleanHashtag];
    state.setCustomHashtags(updatedHashtags);

    // Save to localStorage
    try {
      localStorage.setItem('customHashtags', JSON.stringify(updatedHashtags));
    } catch (error) {
      console.error('Failed to save custom hashtags to localStorage:', error);
    }

    // Navigate to main feed with hashtag parameters
    const params = new URLSearchParams();
    if (updatedHashtags.length > 0) {
      params.set('hashtags', updatedHashtags.join(','));
    }
    const search = params.toString();
    const newPath = search ? `/?${search}` : '/';
    navigate({ to: newPath });
  };
}

/**
 * Creates a hashtag click handler that only adds to state without navigation
 * Useful for components that are already in the main feed
 */
export function useHashtagStateHandler() {
  const state = useNostrFeedState();

  return (hashtag: string) => {
    // Remove # prefix if present and normalize
    const cleanHashtag = hashtag.replace(/^#+/, '').trim();
    const normalizedHashtag = cleanHashtag.toLowerCase();
    const currentHashtags = Array.isArray(state.customHashtags)
      ? state.customHashtags
      : [];

    // Check if hashtag already exists (case-insensitive)
    if (currentHashtags.some(tag => tag.toLowerCase() === normalizedHashtag)) {
      return; // Already exists, do nothing
    }

    // Add the cleaned hashtag to custom hashtags
    const updatedHashtags = [...currentHashtags, cleanHashtag];
    state.setCustomHashtags(updatedHashtags);

    // Save to localStorage
    try {
      localStorage.setItem('customHashtags', JSON.stringify(updatedHashtags));
    } catch (error) {
      console.error('Failed to save custom hashtags to localStorage:', error);
    }
  };
}
