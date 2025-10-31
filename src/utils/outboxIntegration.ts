import { getOutboxMigration } from './nostr/outboxMigration';

/**
 * Utility functions for integrating outbox discovery into user interactions
 */

/**
 * Track user interaction for outbox discovery
 * @param pubkey - The public key of the user being tracked
 * @param interactionType - The type of interaction
 * @param enabled - Whether outbox mode is enabled (should be passed from caller)
 */
export function trackUserInteraction(pubkey: string, interactionType: 'profile_view' | 'note_view' | 'reply' | 'reaction', enabled: boolean = false) {
  try {
    // Only track if outbox mode is explicitly enabled
    if (!enabled) {
      if (import.meta.env.DEV) {
        console.log(`📦 Skipping outbox discovery - outbox mode disabled for ${interactionType}`);
      }
      return;
    }

    // Store in session storage for recent activity tracking
    const sessionKey = 'nostr-session-users';
    const existing = sessionStorage.getItem(sessionKey);
    let users: string[] = [];
    
    if (existing) {
      try {
        users = JSON.parse(existing);
      } catch (e) {
        console.warn('Failed to parse session users:', e);
      }
    }
    
    // Add user if not already present
    if (!users.includes(pubkey)) {
      users.unshift(pubkey);
      // Keep only the last 50 users
      users = users.slice(0, 50);
      
      sessionStorage.setItem(sessionKey, JSON.stringify(users));
    }
    
    // Store interaction details
    const activityKey = 'nostr-recent-activity';
    const existingActivity = localStorage.getItem(activityKey);
    let activity: Array<{ pubkey: string; type: string; timestamp: number }> = [];
    
    if (existingActivity) {
      try {
        activity = JSON.parse(existingActivity);
      } catch (e) {
        console.warn('Failed to parse recent activity:', e);
      }
    }
    
    // Add new activity
    activity.unshift({
      pubkey,
      type: interactionType,
      timestamp: Date.now()
    });
    
    // Keep only the last 100 activities
    activity = activity.slice(0, 100);
    
    localStorage.setItem(activityKey, JSON.stringify(activity));
    
    // Trigger immediate outbox discovery for this user
    const migration = getOutboxMigration({ enableOutboxModel: enabled });
    migration.discoverUserOutbox([pubkey]);
    
    console.log(`📦 Tracked ${interactionType} interaction for user ${pubkey.slice(0, 8)}`);
    
  } catch (error) {
    console.warn('Failed to track user interaction:', error);
  }
}

/**
 * Track profile view interaction
 */
export function trackProfileView(pubkey: string, enabled: boolean = false) {
  trackUserInteraction(pubkey, 'profile_view', enabled);
}

/**
 * Track note view interaction
 */
export function trackNoteView(pubkey: string, enabled: boolean = false) {
  trackUserInteraction(pubkey, 'note_view', enabled);
}

/**
 * Track reply interaction
 */
export function trackReply(pubkey: string, enabled: boolean = false) {
  trackUserInteraction(pubkey, 'reply', enabled);
}

/**
 * Track reaction interaction
 */
export function trackReaction(pubkey: string, enabled: boolean = false) {
  trackUserInteraction(pubkey, 'reaction', enabled);
}

/**
 * Get recent users from tracked interactions
 */
export function getRecentUsers(): string[] {
  try {
    const sessionKey = 'nostr-session-users';
    const existing = sessionStorage.getItem(sessionKey);
    
    if (existing) {
      const users = JSON.parse(existing);
      return Array.isArray(users) ? users : [];
    }
    
    return [];
  } catch (error) {
    console.warn('Failed to get recent users:', error);
    return [];
  }
}

/**
 * Get cached outbox relays for a profile (fast synchronous access)
 * Checks localStorage cache first, then IndexedDB storage
 */
export async function getCachedOutboxRelaysForProfile(pubkey: string): Promise<string[]> {
  try {
    const { getOutboxStorage } = await import('./nostr/outboxStorage');
    const outboxStorage = getOutboxStorage();
    
    // Get cached or stored relay info
    const relayInfo = await outboxStorage.getCachedOrStoredRelays(pubkey);
    
    // Extract just the relay URLs, prioritizing read/write relays
    const relays = relayInfo
      .filter(info => 
        info.permission === 'read' || 
        info.permission === 'readwrite' ||
        info.permission === 'indexer'
      )
      .map(info => info.relay);
    
    if (relays.length > 0) {
      console.log(`📦 Found ${relays.length} cached outbox relays for ${pubkey.slice(0, 8)}`);
    }
    
    return relays;
  } catch (error) {
    console.warn('Failed to get cached outbox relays:', error);
    return [];
  }
}

/**
 * Clear tracked interactions (useful for testing or cleanup)
 */
export function clearTrackedInteractions() {
  try {
    sessionStorage.removeItem('nostr-session-users');
    localStorage.removeItem('nostr-recent-activity');
    console.log('📦 Cleared tracked interactions');
  } catch (error) {
    console.warn('Failed to clear tracked interactions:', error);
  }
}
