import { useState, useCallback } from 'react'

interface UseThreadUIOptions {
  pageSize?: number
}

interface UseThreadUIResult {
  // Expansion state
  isExpanded: boolean
  expandedComments: Record<string, boolean>
  collapsedComments: Record<string, boolean>
  collapsedParentNotes: Record<string, boolean>
  
  // Show more state
  showMoreComments: Record<string, boolean>
  showMoreParent: boolean
  visibleCount: number
  
  // Navigation state
  isSwitchingParent: boolean
  
  // Nested comments state
  nestedExpanded: Record<string, boolean>
  nestedLoading: Record<string, boolean>
  
  // Actions
  toggleExpanded: () => void
  toggleCommentExpanded: (commentId: string) => void
  toggleCommentCollapsed: (commentId: string) => void
  toggleParentNoteCollapsed: (noteId: string) => void
  toggleShowMoreComments: (commentId: string) => void
  toggleShowMoreParent: () => void
  setVisibleCount: (count: number) => void
  setIsSwitchingParent: (switching: boolean) => void
  toggleNestedExpanded: (commentId: string) => void
  setNestedLoading: (commentId: string, loading: boolean) => void
  resetUIState: () => void
}

export function useThreadUI({ pageSize = 10 }: UseThreadUIOptions = {}): UseThreadUIResult {
  const [isExpanded, setIsExpanded] = useState(false)
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({})
  const [collapsedComments, setCollapsedComments] = useState<Record<string, boolean>>({})
  const [collapsedParentNotes, setCollapsedParentNotes] = useState<Record<string, boolean>>({})
  const [showMoreComments, setShowMoreComments] = useState<Record<string, boolean>>({})
  const [showMoreParent, setShowMoreParent] = useState(false)
  const [visibleCount, setVisibleCount] = useState(pageSize)
  const [isSwitchingParent, setIsSwitchingParent] = useState(false)
  const [nestedExpanded, setNestedExpanded] = useState<Record<string, boolean>>({})
  const [nestedLoading, setNestedLoading] = useState<Record<string, boolean>>({})

  const toggleExpanded = useCallback(() => {
    setIsExpanded(prev => !prev)
  }, [])

  const toggleCommentExpanded = useCallback((commentId: string) => {
    setExpandedComments(prev => ({
      ...prev,
      [commentId]: !prev[commentId]
    }))
  }, [])

  const toggleCommentCollapsed = useCallback((commentId: string) => {
    setCollapsedComments(prev => ({
      ...prev,
      [commentId]: !prev[commentId]
    }))
  }, [])

  const toggleParentNoteCollapsed = useCallback((noteId: string) => {
    setCollapsedParentNotes(prev => ({
      ...prev,
      [noteId]: !prev[noteId]
    }))
  }, [])

  const toggleShowMoreComments = useCallback((commentId: string) => {
    setShowMoreComments(prev => ({
      ...prev,
      [commentId]: !prev[commentId]
    }))
  }, [])

  const toggleShowMoreParent = useCallback(() => {
    setShowMoreParent(prev => !prev)
  }, [])

  const toggleNestedExpanded = useCallback((commentId: string) => {
    setNestedExpanded(prev => ({
      ...prev,
      [commentId]: !prev[commentId]
    }))
  }, [])

  const setNestedLoadingState = useCallback((commentId: string, loading: boolean) => {
    setNestedLoading(prev => ({
      ...prev,
      [commentId]: loading
    }))
  }, [])

  const resetUIState = useCallback(() => {
    setIsExpanded(false)
    setExpandedComments({})
    setCollapsedComments({})
    setCollapsedParentNotes({})
    setShowMoreComments({})
    setShowMoreParent(false)
    setVisibleCount(pageSize)
    setIsSwitchingParent(false)
    setNestedExpanded({})
    setNestedLoading({})
  }, [pageSize])

  return {
    isExpanded,
    expandedComments,
    collapsedComments,
    collapsedParentNotes,
    showMoreComments,
    showMoreParent,
    visibleCount,
    isSwitchingParent,
    nestedExpanded,
    nestedLoading,
    toggleExpanded,
    toggleCommentExpanded,
    toggleCommentCollapsed,
    toggleParentNoteCollapsed,
    toggleShowMoreComments,
    toggleShowMoreParent,
    setVisibleCount,
    setIsSwitchingParent,
    toggleNestedExpanded,
    setNestedLoading: setNestedLoadingState,
    resetUIState,
  }
}
