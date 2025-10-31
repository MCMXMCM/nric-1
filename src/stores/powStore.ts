import { Store } from '@tanstack/store'
import { useState, useEffect } from 'react'

export interface PowState {
  // Current mining status
  isMining: boolean
  targetBits: number
  currentBits: number
  nonce: number
  progress: number // 0-100

  // Mining session info
  sessionId: string | null
  startTime: number | null
  estimatedTimeRemaining: number | null

  // Results
  isComplete: boolean
  isAborted: boolean
  error: string | null
  minedEvent: any | null

  // Performance metrics
  hashesPerSecond: number
}

export interface PowStoreState {
  sessions: Record<string, PowState>
  activeSessionId: string | null
  version: number // Version counter to force React updates
}

const initialState: PowStoreState = {
  sessions: {},
  activeSessionId: null,
  version: 0,
}

export const powStore = new Store<PowStoreState>(initialState)

// Helper functions for managing POW sessions
export const powActions = {
  // Start a new POW mining session
  startMining: (sessionId: string, targetBits: number) => {
    const now = Date.now()
    const newSession: PowState = {
      isMining: true,
      targetBits,
      currentBits: 0,
      nonce: 0,
      progress: 0.1, // Start with tiny progress to show activity immediately
      sessionId,
      startTime: now,
      estimatedTimeRemaining: null,
      isComplete: false,
      isAborted: false,
      error: null,
      minedEvent: null,
      hashesPerSecond: 0,
    }

    powStore.setState((prev) => {
      return {
        sessions: {
          ...prev.sessions,
          [sessionId]: newSession,
        },
        activeSessionId: sessionId,
        version: prev.version + 1, // Increment version to force React updates
      }
    })
    
    // Immediately trigger a progress update to get UI responsive
    setTimeout(() => {
      const avgAttempts = Math.pow(2, targetBits)
      powActions.updateProgress(sessionId, {
        currentBits: 0,
        nonce: 1,
        progress: 0.1,
        hashesPerSecond: 0,
        estimatedTimeRemaining: avgAttempts / 1000, // rough initial estimate
      })
    }, 0)
  },

  // Update mining progress
  updateProgress: (
    sessionId: string,
    updates: Partial<Pick<PowState, 'currentBits' | 'nonce' | 'progress' | 'hashesPerSecond' | 'estimatedTimeRemaining'>>
  ) => {
    console.log('📈 POW STORE: Updating progress for session:', sessionId, 'updates:', updates)
    powStore.setState((prev) => {
      const session = prev.sessions[sessionId]
      if (!session) {
        console.log('❌ POW STORE: Session not found:', sessionId)
        return prev
      }

      const updatedSession = {
        ...session,
        ...updates,
      }
      console.log('✅ POW STORE: Updated session:', sessionId, 'new state:', {
        nonce: updatedSession.nonce,
        progress: updatedSession.progress,
        currentBits: updatedSession.currentBits,
        hashesPerSecond: updatedSession.hashesPerSecond
      })

      return {
        ...prev,
        version: prev.version + 1, // Increment version to force React updates
        sessions: {
          ...prev.sessions,
          [sessionId]: updatedSession,
        },
      }
    })
  },

  // Complete mining successfully
  completeMining: (sessionId: string, minedEvent: any) => {
    console.log('🏁 STORE: Completing mining session:', sessionId, 'with final stats:', {
      nonce: powStore.state.sessions[sessionId]?.nonce,
      bits: powStore.state.sessions[sessionId]?.currentBits,
      progress: 100,
      hashesPerSecond: powStore.state.sessions[sessionId]?.hashesPerSecond
    })

    powStore.setState((prev) => {
      const session = prev.sessions[sessionId]
      if (!session) return prev

      const updatedSession = {
        ...session,
        isMining: false,
        isComplete: true,
        progress: 100,
        minedEvent,
        estimatedTimeRemaining: 0,
      }

      // Keep completed session available during signing/broadcasting so UI can show final stats
      // Auto-cleanup after 120 seconds; callers can also explicitly clean up earlier
      setTimeout(() => {
        powStore.setState((prevState) => {
          const newSessions = { ...prevState.sessions }
          delete newSessions[sessionId]
          return {
            ...prevState,
            version: prevState.version + 1,
            sessions: newSessions,
            activeSessionId: prevState.activeSessionId === sessionId ? null : prevState.activeSessionId
          }
        })
      }, 120000)

      return {
        ...prev,
        version: prev.version + 1, // Increment version to force React updates
        sessions: {
          ...prev.sessions,
          [sessionId]: updatedSession,
        },
      }
    })
  },

  // Abort mining
  abortMining: (sessionId: string) => {
    powStore.setState((prev) => {
      const session = prev.sessions[sessionId]
      if (!session) return prev

      return {
        ...prev,
        version: prev.version + 1, // Increment version to force React updates
        sessions: {
          ...prev.sessions,
          [sessionId]: {
            ...session,
            isMining: false,
            isAborted: true,
            progress: 0,
            estimatedTimeRemaining: null,
          },
        },
      }
    })
  },

  // Set mining error
  setMiningError: (sessionId: string, error: string) => {
    powStore.setState((prev) => {
      const session = prev.sessions[sessionId]
      if (!session) return prev

      return {
        ...prev,
        version: prev.version + 1, // Increment version to force React updates
        sessions: {
          ...prev.sessions,
          [sessionId]: {
            ...session,
            isMining: false,
            error,
            estimatedTimeRemaining: null,
          },
        },
      }
    })
  },

  // Clean up a session
  cleanupSession: (sessionId: string) => {
    powStore.setState((prev) => {
      const { [sessionId]: _, ...remainingSessions } = prev.sessions
      return {
        version: prev.version + 1, // Increment version to force React updates
        sessions: remainingSessions,
        activeSessionId: prev.activeSessionId === sessionId ? null : prev.activeSessionId,
      }
    })
  },

  // Get current active session
  getActiveSession: (): PowState | null => {
    const state = powStore.state
    if (!state.activeSessionId) return null
    return state.sessions[state.activeSessionId] || null
  },

  // Check if any session is currently mining
  isAnyMining: (): boolean => {
    const state = powStore.state
    return Object.values(state.sessions).some(session => session.isMining)
  },

  // Clean up old sessions to prevent memory leaks
  cleanupOldSessions: (maxAge: number = 5 * 60 * 1000) => { // 5 minutes default
    const now = Date.now()
    powStore.setState((prev) => {
      const cleanedSessions = Object.fromEntries(
        Object.entries(prev.sessions).filter(([_sessionId, session]) => {
          const age = now - (session.startTime || 0)
          return age < maxAge || session.isMining
        })
      )
      
      return {
        ...prev,
        version: prev.version + 1, // Increment version to force React updates
        sessions: cleanedSessions,
        activeSessionId: prev.activeSessionId && cleanedSessions[prev.activeSessionId] 
          ? prev.activeSessionId 
          : null,
      }
    })
  },
}

// Utility function to generate unique session IDs
export const generateSessionId = (): string => {
  return `pow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

// Hook for React components to use POW state
export const usePowState = () => {
  const [state, setState] = useState(() => powStore.state)
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const unsub = powStore.subscribe(() => {
      const newState = powStore.state
      console.log('🔄 POW STORE: State updated, version:', newState.version)
      // Force a new object reference to ensure React detects the change
      // Include version number to force updates
      setState({
        sessions: { ...newState.sessions },
        activeSessionId: newState.activeSessionId,
        version: newState.version,
      })
      // Also force a re-render to ensure UI updates
      forceUpdate(prev => prev + 1)
    })
    
    // Set up periodic cleanup to prevent memory leaks
    const cleanupInterval = setInterval(() => {
      powActions.cleanupOldSessions()
    }, 60000) // Clean up every minute
    
    return () => {
      unsub()
      clearInterval(cleanupInterval)
    }
  }, [])

  // Memoize computed values to ensure reactivity
  const activeSession = state.activeSessionId ? state.sessions[state.activeSessionId] : null
  const isAnyMining = Object.values(state.sessions).some(session => session.isMining)

  console.log('🎯 usePowState: activeSession:', activeSession ? {
    sessionId: activeSession.sessionId,
    nonce: activeSession.nonce,
    progress: activeSession.progress,
    isMining: activeSession.isMining
  } : 'null')

  return {
    activeSession,
    isAnyMining,
    sessions: state.sessions,
    actions: powActions,
  }
}
