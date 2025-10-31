import { QueryClient } from '@tanstack/react-query'
import { invalidateThreadQueries } from './queryInvalidation'

/**
 * Global thread event manager for handling thread refresh events
 * This ensures consistent cache invalidation across the app
 */

let queryClientInstance: QueryClient | null = null
let isInitialized = false

/**
 * Initialize the thread event manager with a QueryClient instance
 */
export function initializeThreadEventManager(queryClient: QueryClient) {
  if (isInitialized) {
    console.warn('Thread event manager already initialized')
    return
  }
  
  queryClientInstance = queryClient
  isInitialized = true
  
  // Set up global event listener for thread refresh events
  const handleThreadRefresh = (event: CustomEvent) => {
    const { parentId } = event.detail || {}
    if (parentId && queryClientInstance) {
      console.log('Global thread refresh event received for parent:', parentId)
      invalidateThreadQueries({ parentNoteId: parentId, queryClient: queryClientInstance })
    }
  }
  
  window.addEventListener('nostree:thread-refresh', handleThreadRefresh as EventListener)
  
  console.log('Thread event manager initialized')
}

/**
 * Dispatch a thread refresh event for a specific parent note
 */
export function dispatchThreadRefresh(parentId: string) {
  console.log('Dispatching thread refresh event for parent:', parentId)
  window.dispatchEvent(new CustomEvent('nostree:thread-refresh', { 
    detail: { parentId } 
  }))
}

/**
 * Manually invalidate thread queries for a specific parent note
 */
export function invalidateThreadForParent(parentId: string) {
  if (!queryClientInstance) {
    console.warn('QueryClient not available for thread invalidation')
    return
  }
  
  invalidateThreadQueries({ parentNoteId: parentId, queryClient: queryClientInstance })
}

/**
 * Clean up the thread event manager
 */
export function cleanupThreadEventManager() {
  if (!isInitialized) return
  
  // Remove event listeners
  window.removeEventListener('nostree:thread-refresh', () => {})
  
  queryClientInstance = null
  isInitialized = false
  
  console.log('Thread event manager cleaned up')
}
