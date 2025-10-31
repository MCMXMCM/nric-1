import { nip19 } from 'nostr-tools';
import { nip07SignEvent } from './nip07';
import type { Filter, Event } from 'nostr-tools';
import { RelayConnectionPool } from './relayConnectionPool';
import type { RelayPermission } from '../../types/nostr/types';
// Haptic feedback is now handled directly in components using useHaptic hook

import { INDEXER_EVENT_KINDS } from './relayClassification';
import type { RelayInfo } from './relayInfo';

/**
 * Enhanced relay filtering that respects both permissions and NIP-11 capabilities
 * This function checks relay capabilities from NIP-11 information to ensure
 * we only publish events that the relay can actually handle
 */
export function filterRelaysByEventKindAndCapabilities(
  relayUrls: string[], 
  relayPermissions: Map<string, RelayPermission>, 
  relayInfoMap: Map<string, RelayInfo>,
  eventKind: number
): string[] {
  console.log(`🔍 filterRelaysByEventKindAndCapabilities: eventKind=${eventKind}, relayUrls=`, relayUrls);
  console.log(`🔍 filterRelaysByEventKindAndCapabilities: relayPermissions=`, Array.from(relayPermissions.entries()));
  
  const filtered = relayUrls.filter(url => {
    const permission = relayPermissions.get(url) || 'readwrite';
    const relayInfo = relayInfoMap.get(url);
    
    console.log(`🔍 filterRelaysByEventKindAndCapabilities: ${url} has permission=${permission}`);
    
    // First check basic permissions
    if (permission === 'read') {
      console.log(`🔍 filterRelaysByEventKindAndCapabilities: ${url} is read-only, skipping for event kind ${eventKind}`);
      return false;
    }
    
    // Indexer relays only receive specific event kinds
    if (permission === 'indexer') {
      const allowed = INDEXER_EVENT_KINDS.includes(eventKind);
      console.log(`🔍 filterRelaysByEventKindAndCapabilities: indexer relay ${url}, eventKind ${eventKind} allowed=${allowed}`);
      return allowed;
    }
    
    // Check if relay has write permissions
    const hasWritePermission = permission === 'write' || permission === 'readwrite';
    if (!hasWritePermission) {
      console.log(`🔍 filterRelaysByEventKindAndCapabilities: ${url} has no write permission, skipping`);
      return false;
    }
    
    // Now check NIP-11 relay capabilities if available
    if (relayInfo) {
      // Check if relay has restricted writes
      if (relayInfo.limitation?.restricted_writes) {
        console.log(`🔍 filterRelaysByEventKindAndCapabilities: ${url} has restricted writes, checking supported NIPs`);
        
        // If relay has restricted writes, check if it supports the required NIP for this event kind
        const requiredNip = getRequiredNipForEventKind(eventKind);
        if (requiredNip && relayInfo.supported_nips) {
          const supportsRequiredNip = relayInfo.supported_nips.includes(requiredNip);
          console.log(`🔍 filterRelaysByEventKindAndCapabilities: ${url} supports NIP ${requiredNip} for event kind ${eventKind}: ${supportsRequiredNip}`);
          if (!supportsRequiredNip) {
            return false;
          }
        }
      }
      
      // Check authentication requirements
      if (relayInfo.limitation?.auth_required) {
        console.log(`🔍 filterRelaysByEventKindAndCapabilities: ${url} requires authentication - assuming user is authenticated`);
        // Note: We assume the user is authenticated if they're trying to publish
        // In a more sophisticated implementation, we'd check the actual auth status
      }
      
      // Check payment requirements
      if (relayInfo.limitation?.payment_required) {
        console.log(`🔍 filterRelaysByEventKindAndCapabilities: ${url} requires payment - assuming user has access`);
        // Note: We assume the user has paid access if they're trying to publish
        // In a more sophisticated implementation, we'd check payment status
      }
    }
    
    console.log(`🔍 filterRelaysByEventKindAndCapabilities: ${url} passed all checks for event kind ${eventKind}`);
    return true;
  });

  console.log(`🔍 filterRelaysByEventKindAndCapabilities: filtered result=`, filtered);

  // Fallback: if no relays remain after filtering, use write/readwrite relays directly
  if (filtered.length === 0) {
    console.warn(`All relays were filtered out for event kind ${eventKind}. Using write/readwrite relays as fallback.`);
    const fallback = relayUrls.filter(url => {
      const permission = relayPermissions.get(url) || 'readwrite';
      return permission === 'write' || permission === 'readwrite';
    });
    console.log(`🔍 filterRelaysByEventKindAndCapabilities: fallback result=`, fallback);
    return fallback;
  }

  return filtered;
}

/**
 * Legacy function for backward compatibility - uses basic permission filtering only
 * @deprecated Use filterRelaysByEventKindAndCapabilities for better relay capability checking
 */
export function filterRelaysByEventKind(
  relayUrls: string[], 
  relayPermissions: Map<string, RelayPermission>, 
  eventKind: number
): string[] {
  console.log(`🔍 filterRelaysByEventKind (legacy): eventKind=${eventKind}, relayUrls=`, relayUrls);
  console.log(`🔍 filterRelaysByEventKind (legacy): relayPermissions=`, Array.from(relayPermissions.entries()));
  
  const filtered = relayUrls.filter(url => {
    const permission = relayPermissions.get(url) || 'readwrite';
    console.log(`🔍 filterRelaysByEventKind (legacy): ${url} has permission=${permission}`);
    
    // Indexer relays only receive specific event kinds
    if (permission === 'indexer') {
      const allowed = INDEXER_EVENT_KINDS.includes(eventKind);
      console.log(`🔍 filterRelaysByEventKind (legacy): indexer relay ${url}, eventKind ${eventKind} allowed=${allowed}`);
      return allowed;
    }
    
    // Other permissions receive all events
    const allowed = permission === 'write' || permission === 'readwrite';
    console.log(`🔍 filterRelaysByEventKind (legacy): non-indexer relay ${url}, allowed=${allowed}`);
    return allowed;
  });

  console.log(`🔍 filterRelaysByEventKind (legacy): filtered result=`, filtered);

  // Fallback: if no relays remain after filtering (all were indexer relays),
  // use write/readwrite relays directly to prevent publishing failure
  if (filtered.length === 0) {
    console.warn(`All relays were filtered out as indexer relays for event kind ${eventKind}. Using write/readwrite relays as fallback.`);
    const fallback = relayUrls.filter(url => {
      const permission = relayPermissions.get(url) || 'readwrite';
      return permission === 'write' || permission === 'readwrite';
    });
    console.log(`🔍 filterRelaysByEventKind (legacy): fallback result=`, fallback);
    return fallback;
  }

  return filtered;
}

/**
 * Maps event kinds to their required NIP numbers
 * This helps determine if a relay supports the necessary NIP for a specific event kind
 */
function getRequiredNipForEventKind(eventKind: number): number | null {
  switch (eventKind) {
    case 0:   // Metadata - NIP-01 (basic events)
      return 1;
    case 1:   // Text notes - NIP-01 (basic events)
      return 1;
    case 2:   // Recommend relay - NIP-01 (basic events)
      return 1;
    case 3:   // Contacts - NIP-02 (follow lists)
      return 2;
    case 4:   // Encrypted direct messages - NIP-04 (encrypted DMs)
      return 4;
    case 5:   // Event deletion - NIP-09 (event deletion)
      return 9;
    case 6:   // Reposts - NIP-18 (reposts)
      return 18;
    case 7:   // Reactions - NIP-25 (reactions)
      return 25;
    case 40:  // Channel creation - NIP-28 (channels)
      return 28;
    case 41:  // Channel metadata - NIP-28 (channels)
      return 28;
    case 42:  // Channel messages - NIP-28 (channels)
      return 28;
    case 43:  // Hide message - NIP-28 (channels)
      return 28;
    case 44:  // Mute user - NIP-28 (channels)
      return 28;
    case 1984: // Reporting - NIP-56 (reporting)
      return 56;
    case 9735: // Zap receipts - NIP-57 (zaps)
      return 57;
    case 10000: // Mute list - NIP-51 (lists)
      return 51;
    case 10001: // Pin list - NIP-51 (lists)
      return 51;
    case 10002: // Relay list metadata - NIP-65 (relay list metadata)
      return 65;
    case 30000: // Categorized people list - NIP-51 (lists)
      return 51;
    case 30001: // Categorized bookmark list - NIP-51 (lists)
      return 51;
    case 30008: // Badge award - NIP-58 (badges)
      return 58;
    case 30009: // Badge definition - NIP-58 (badges)
      return 58;
    case 30078: // Application-specific data - NIP-78 (application-specific data)
      return 78;
    default:
      // For unknown event kinds, assume NIP-01 (basic events) is required
      return 1;
  }
}

export async function publishNote(
  pool: RelayConnectionPool, 
  relayUrls: string[], 
  content: string,
  relayPermissions?: Map<string, RelayPermission>,
  relayInfoMap?: Map<string, RelayInfo>,
  options?: { powTargetBits?: number; signal?: AbortSignal }
): Promise<{ id: string; event: Event }> {
  if (!pool) throw new Error('Nostr client not ready');
  if (!Array.isArray(relayUrls) || relayUrls.length === 0) throw new Error('No relays configured');
  const signed = await nip07SignEvent({ 
    kind: 1, 
    content,
  }, { powTargetBits: options?.powTargetBits, signal: options?.signal });
  
  // Filter relays based on event kind, permissions, and capabilities
  let filteredRelayUrls: string[];
  if (relayPermissions && relayInfoMap) {
    // Use enhanced filtering with NIP-11 capabilities
    filteredRelayUrls = filterRelaysByEventKindAndCapabilities(relayUrls, relayPermissions, relayInfoMap, 1);
  } else if (relayPermissions) {
    // Fallback to basic permission filtering
    filteredRelayUrls = filterRelaysByEventKind(relayUrls, relayPermissions, 1);
  } else {
    // No filtering if no permissions provided
    filteredRelayUrls = relayUrls;
  }
  
  // SimplePool.publish expects an array of relay urls
  await pool.publish(filteredRelayUrls, signed);

  // Trigger haptic feedback for successful note publish
  // Haptic feedback now handled in components

  return { id: signed.id, event: signed as unknown as Event };
}

/**
 * Publish a reaction (kind 7) to a target event.
 * Content '+' or '' is interpreted as like/upvote; '-' as dislike/downvote; emojis allowed.
 * Adds required e and p tags with optional relay/pubkey hints and a k tag for the target kind.
 */
export async function publishReaction(params: {
  pool: RelayConnectionPool;
  relayUrls: string[];
  target: { id: string; pubkey: string; kind?: number; tags?: string[][] };
  content?: string; // default '+'
  relayHint?: string; // optional relay hint to include in tags
  relayPermissions?: Map<string, RelayPermission>;
  relayInfoMap?: Map<string, RelayInfo>;
}): Promise<{ id: string; event: Event }> {
  const { pool, relayUrls, target } = params;
  const content = params.content ?? '+';
  const relayHint = params.relayHint ?? (relayUrls && relayUrls[0] ? relayUrls[0] : '');
  if (!pool) throw new Error('Nostr client not ready');
  if (!Array.isArray(relayUrls) || relayUrls.length === 0) throw new Error('No relays configured');
  if (!target || !target.id || !target.pubkey) throw new Error('Invalid target event');

  const tags: string[][] = [];
  // Required e tag with optional relay and pubkey hints
  tags.push(['e', target.id, relayHint, target.pubkey]);
  // Recommended p tag for target author, with relay hint
  tags.push(['p', target.pubkey, relayHint]);
  // Optional k tag with kind of the reacted event
  const targetKind = typeof target.kind === 'number' ? String(target.kind) : '1';
  tags.push(['k', targetKind]);
  // If target is addressable and exposes an 'a' coordinate tag in its tags, forward it
  const aTag = (target.tags || []).find(t => Array.isArray(t) && t[0] === 'a' && t[1]);
  if (aTag) {
    // Include relay and pubkey hints if not present
    const a = [ 'a', aTag[1] ];
    if (!aTag[2]) a.push(relayHint);
    if (!aTag[3]) a.push(target.pubkey);
    tags.push(a as string[]);
  }
  // Add client field
  tags.push(['client', 'NRIC-1']);

  const signed = await nip07SignEvent({ kind: 7, content, tags });
  
  // Filter relays based on event kind, permissions, and capabilities
  let filteredRelayUrls: string[];
  if (params.relayPermissions && params.relayInfoMap) {
    // Use enhanced filtering with NIP-11 capabilities
    filteredRelayUrls = filterRelaysByEventKindAndCapabilities(relayUrls, params.relayPermissions, params.relayInfoMap, 7);
  } else if (params.relayPermissions) {
    // Fallback to basic permission filtering
    filteredRelayUrls = filterRelaysByEventKind(relayUrls, params.relayPermissions, 7);
  } else {
    // No filtering if no permissions provided
    filteredRelayUrls = relayUrls;
  }
  
  await pool.publish(filteredRelayUrls, signed);

  // Trigger haptic feedback for successful reaction publish
  // Haptic feedback now handled in components

  return { id: signed.id, event: signed as unknown as Event };
}

/**
 * Publish a reply (kind 1) to a parent event, using marked e tags per preferred scheme.
 * - Includes 'root' marker for thread root and 'reply' marker for direct parent (if replying to a comment)
 * - Includes p tags of the parent plus the parent's author
 */
export async function publishReply(params: {
  pool: RelayConnectionPool;
  relayUrls: string[];
  parent: { id: string; pubkey: string; kind?: number; tags?: string[][] };
  content: string;
  relayHint?: string; // optional relay hint
  relayPermissions?: Map<string, RelayPermission>;
  relayInfoMap?: Map<string, RelayInfo>;
  powTargetBits?: number;
  signal?: AbortSignal;
}): Promise<{ id: string; event: Event }> {
  const { pool, relayUrls, parent, content } = params;
  const relayHint = params.relayHint ?? (relayUrls && relayUrls[0] ? relayUrls[0] : '');
  if (!pool) throw new Error('Nostr client not ready');
  if (!Array.isArray(relayUrls) || relayUrls.length === 0) throw new Error('No relays configured');
  if (!parent || !parent.id || !parent.pubkey) throw new Error('Invalid parent event');
  if (!content || content.trim().length === 0) throw new Error('Reply content required');

  const parentTags = Array.isArray(parent.tags) ? parent.tags : [];
  const eTags = parentTags.filter(t => Array.isArray(t) && t[0] === 'e');
  const replyTag = eTags.find(t => t[3] === 'reply');
  const rootTag = eTags.find(t => t[3] === 'root');
  const inferredRootId = rootTag?.[1] || replyTag?.[1] || eTags[0]?.[1] || parent.id;

  const tags: string[][] = [];
  // For a direct reply to the thread root, include only root
  const replyingToRoot = inferredRootId === parent.id;
  if (replyingToRoot) {
    tags.push(['e', parent.id, relayHint, 'root', parent.pubkey]);
  } else {
    // root marker first, then reply marker
    tags.push(['e', inferredRootId, relayHint, 'root', parent.pubkey]);
    tags.push(['e', parent.id, relayHint, 'reply', parent.pubkey]);
  }
  // p tags: include all parent's p tags plus parent author
  const pSet = new Set<string>();
  parentTags.forEach(t => { if (t[0] === 'p' && t[1]) pSet.add(t[1]); });
  pSet.add(parent.pubkey);
  pSet.forEach(pk => tags.push(['p', pk, relayHint]));

  const signed = await nip07SignEvent({ kind: 1, content, tags }, { powTargetBits: params.powTargetBits, signal: params.signal });
  
  // Filter relays based on event kind, permissions, and capabilities
  let filteredRelayUrls: string[];
  if (params.relayPermissions && params.relayInfoMap) {
    // Use enhanced filtering with NIP-11 capabilities
    filteredRelayUrls = filterRelaysByEventKindAndCapabilities(relayUrls, params.relayPermissions, params.relayInfoMap, 1);
  } else if (params.relayPermissions) {
    // Fallback to basic permission filtering
    filteredRelayUrls = filterRelaysByEventKind(relayUrls, params.relayPermissions, 1);
  } else {
    // No filtering if no permissions provided
    filteredRelayUrls = relayUrls;
  }
  
  await pool.publish(filteredRelayUrls, signed);

  // Trigger haptic feedback for successful reaction publish
  // Haptic feedback now handled in components

  return { id: signed.id, event: signed as unknown as Event };
}

/**
 * Publish a repost (kind 6) of a target event.
 * Content should be the stringified JSON of the reposted note.
 * Adds required e and p tags with relay hints.
 */
export async function publishRepost(params: {
  pool: RelayConnectionPool;
  relayUrls: string[];
  target: { id: string; pubkey: string; kind?: number; tags?: string[][]; content?: string; created_at?: number };
  relayHint?: string; // optional relay hint
  relayPermissions?: Map<string, RelayPermission>;
  relayInfoMap?: Map<string, RelayInfo>;
}): Promise<{ id: string; event: Event }> {
  const { pool, relayUrls, target } = params;
  const relayHint = params.relayHint ?? (relayUrls && relayUrls[0] ? relayUrls[0] : '');
  if (!pool) throw new Error('Nostr client not ready');
  if (!Array.isArray(relayUrls) || relayUrls.length === 0) throw new Error('No relays configured');
  if (!target || !target.id || !target.pubkey) throw new Error('Invalid target event');

  // Create a repost event (kind 6) that contains the original event
  const content = JSON.stringify({
    id: target.id,
    pubkey: target.pubkey,
    kind: target.kind || 1,
    tags: target.tags || [],
    content: target.content || '',
    created_at: target.created_at || Math.floor(Date.now() / 1000),
  });

  const tags: string[][] = [];
  // Required e tag with relay hint
  tags.push(['e', target.id, relayHint]);
  // Required p tag for target author
  tags.push(['p', target.pubkey, relayHint]);
  // Add client field
  tags.push(['client', 'NRIC-1']);

  const signed = await nip07SignEvent({ kind: 6, content, tags });
  
  // Filter relays based on event kind, permissions, and capabilities
  let filteredRelayUrls: string[];
  if (params.relayPermissions && params.relayInfoMap) {
    // Use enhanced filtering with NIP-11 capabilities
    filteredRelayUrls = filterRelaysByEventKindAndCapabilities(relayUrls, params.relayPermissions, params.relayInfoMap, 6);
  } else if (params.relayPermissions) {
    // Fallback to basic permission filtering
    filteredRelayUrls = filterRelaysByEventKind(relayUrls, params.relayPermissions, 6);
  } else {
    // No filtering if no permissions provided
    filteredRelayUrls = relayUrls;
  }
  
  await pool.publish(filteredRelayUrls, signed);

  // Trigger haptic feedback for successful reaction publish
  // Haptic feedback now handled in components

  return { id: signed.id, event: signed as unknown as Event };
}

/**
 * Publish a quote repost (kind 1 with q tag) of a target event.
 * Content should include the NIP-21 nevent/note of the quoted event.
 * Adds required q and p tags with relay hints.
 */
export async function publishQuoteRepost(params: {
  pool: RelayConnectionPool;
  relayUrls: string[];
  target: { id: string; pubkey: string; kind?: number; tags?: string[][] };
  content: string;
  relayHint?: string; // optional relay hint
  relayPermissions?: Map<string, RelayPermission>;
  relayInfoMap?: Map<string, RelayInfo>;
}): Promise<{ id: string; event: Event }> {
  const { pool, relayUrls, target, content } = params;
  const relayHint = params.relayHint ?? (relayUrls && relayUrls[0] ? relayUrls[0] : '');
  if (!pool) throw new Error('Nostr client not ready');
  if (!Array.isArray(relayUrls) || relayUrls.length === 0) throw new Error('No relays configured');
  if (!target || !target.id || !target.pubkey) throw new Error('Invalid target event');
  if (!content || content.trim().length === 0) throw new Error('Quote repost content required');

  // Add NIP-21 nevent to content if not already present
  let finalContent = content.trim();
  const noteId = target.id;
  let nevent: string;
  try {
    nevent = nip19.neventEncode({ id: noteId, relays: [relayHint] });
  } catch {
    // Fallback to note encoding
    try {
      nevent = nip19.noteEncode(noteId);
    } catch {
      nevent = noteId;
    }
  }
  
  // Add nevent to content if not already present
  if (!finalContent.includes(nevent) && !finalContent.includes(noteId)) {
    finalContent = `${finalContent}\n\nnostr:${nevent}`;
  }

  const tags: string[][] = [];
  // Required q tag (quote tag) with relay hint and pubkey
  tags.push(['q', target.id, relayHint, target.pubkey]);
  // Required p tag for target author
  tags.push(['p', target.pubkey, relayHint]);
  // Add client field
  tags.push(['client', 'NRIC-1']);

  const signed = await nip07SignEvent({ kind: 1, content: finalContent, tags });
  
  // Filter relays based on event kind, permissions, and capabilities
  let filteredRelayUrls: string[];
  if (params.relayPermissions && params.relayInfoMap) {
    // Use enhanced filtering with NIP-11 capabilities
    filteredRelayUrls = filterRelaysByEventKindAndCapabilities(relayUrls, params.relayPermissions, params.relayInfoMap, 1);
  } else if (params.relayPermissions) {
    // Fallback to basic permission filtering
    filteredRelayUrls = filterRelaysByEventKind(relayUrls, params.relayPermissions, 1);
  } else {
    // No filtering if no permissions provided
    filteredRelayUrls = relayUrls;
  }
  
  await pool.publish(filteredRelayUrls, signed);

  // Trigger haptic feedback for successful reaction publish
  // Haptic feedback now handled in components

  return { id: signed.id, event: signed as unknown as Event };
}

/**
 * Publish a mute list (kind 10000) event.
 * Adds the specified pubkey to the user's mute list.
 * Mute lists are replaceable events, so only one mute list per user.
 */
export async function publishMuteList(params: {
  pool: RelayConnectionPool;
  relayUrls: string[];
  pubkeyToMute: string;
  existingMutedPubkeys?: string[];
  relayPermissions?: Map<string, RelayPermission>;
  relayInfoMap?: Map<string, RelayInfo>;
}): Promise<{ id: string; event: Event }> {
  const { pool, relayUrls, pubkeyToMute, existingMutedPubkeys = [] } = params;
  
  if (!pool) throw new Error('Nostr client not ready');
  if (!Array.isArray(relayUrls) || relayUrls.length === 0) throw new Error('No relays configured');
  if (!pubkeyToMute || !/^[0-9a-fA-F]{64}$/.test(pubkeyToMute)) throw new Error('Invalid pubkey to mute');

  // Create tags array with existing muted pubkeys plus the new one
  const allMutedPubkeys = Array.from(new Set([...existingMutedPubkeys, pubkeyToMute]));
  const tags = allMutedPubkeys.map(pubkey => ['p', pubkey]);
  // Add client field
  tags.push(['client', 'NRIC-1']);

  const signed = await nip07SignEvent({ 
    kind: 10000, 
    content: '', 
    tags 
  });
  
  // Filter relays based on event kind, permissions, and capabilities
  let filteredRelayUrls: string[];
  if (params.relayPermissions && params.relayInfoMap) {
    // Use enhanced filtering with NIP-11 capabilities
    filteredRelayUrls = filterRelaysByEventKindAndCapabilities(relayUrls, params.relayPermissions, params.relayInfoMap, 10000);
  } else if (params.relayPermissions) {
    // Fallback to basic permission filtering
    filteredRelayUrls = filterRelaysByEventKind(relayUrls, params.relayPermissions, 10000);
  } else {
    // No filtering if no permissions provided
    filteredRelayUrls = relayUrls;
  }
  
  await pool.publish(filteredRelayUrls, signed);

  // Trigger haptic feedback for successful reaction publish
  // Haptic feedback now handled in components

  return { id: signed.id, event: signed as unknown as Event };
}

/**
 * Publish an unmute list (kind 10000) event.
 * Removes the specified pubkey from the user's mute list.
 */
export async function publishUnmuteList(params: {
  pool: RelayConnectionPool;
  relayUrls: string[];
  pubkeyToUnmute: string;
  existingMutedPubkeys: string[];
  relayPermissions?: Map<string, RelayPermission>;
  relayInfoMap?: Map<string, RelayInfo>;
}): Promise<{ id: string; event: Event }> {
  const { pool, relayUrls, pubkeyToUnmute, existingMutedPubkeys } = params;
  
  if (!pool) throw new Error('Nostr client not ready');
  if (!Array.isArray(relayUrls) || relayUrls.length === 0) throw new Error('No relays configured');
  if (!pubkeyToUnmute || !/^[0-9a-fA-F]{64}$/.test(pubkeyToUnmute)) throw new Error('Invalid pubkey to unmute');

  // Remove the pubkey from the list
  const remainingMutedPubkeys = existingMutedPubkeys.filter(pubkey => pubkey !== pubkeyToUnmute);
  const tags = remainingMutedPubkeys.map(pubkey => ['p', pubkey]);
  // Add client field
  tags.push(['client', 'NRIC-1']);

  const signed = await nip07SignEvent({ 
    kind: 10000, 
    content: '', 
    tags 
  });
  
  // Filter relays based on event kind, permissions, and capabilities
  let filteredRelayUrls: string[];
  if (params.relayPermissions && params.relayInfoMap) {
    // Use enhanced filtering with NIP-11 capabilities
    filteredRelayUrls = filterRelaysByEventKindAndCapabilities(relayUrls, params.relayPermissions, params.relayInfoMap, 10000);
  } else if (params.relayPermissions) {
    // Fallback to basic permission filtering
    filteredRelayUrls = filterRelaysByEventKind(relayUrls, params.relayPermissions, 10000);
  } else {
    // No filtering if no permissions provided
    filteredRelayUrls = relayUrls;
  }
  
  await pool.publish(filteredRelayUrls, signed);

  // Trigger haptic feedback for successful reaction publish
  // Haptic feedback now handled in components

  return { id: signed.id, event: signed as unknown as Event };
}

/**
 * Fetch the current user's mute list (kind 10000).
 * Returns an array of pubkeys that the user has muted.
 */
export async function fetchUserMuteList(params: {
  pool: RelayConnectionPool;
  relayUrls: string[];
  userPubkey: string;
}): Promise<string[]> {
  const { pool, relayUrls, userPubkey } = params;
  
  if (!pool) throw new Error('Nostr client not ready');
  if (!Array.isArray(relayUrls) || relayUrls.length === 0) throw new Error('No relays configured');
  if (!userPubkey || !/^[0-9a-fA-F]{64}$/.test(userPubkey)) throw new Error('Invalid user pubkey');

  try {
    const filter: Filter = {
      kinds: [10000],
      authors: [userPubkey],
      limit: 1
    };

    const events: Event[] = await pool.querySync(relayUrls, filter);
    
    if (events.length === 0) {
      return [];
    }

    // Get the most recent mute list event
    const latestEvent = events
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))[0];

    // Extract pubkeys from p tags
    const mutedPubkeys = latestEvent.tags
      .filter(tag => tag[0] === 'p' && tag[1])
      .map(tag => tag[1]);

    return mutedPubkeys;
  } catch (error) {
    console.error('Failed to fetch mute list:', error);
    return [];
  }
}


