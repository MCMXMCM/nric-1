import React from 'react'
import type { BufferConfig } from '../../types/buffer'
import { DEFAULT_BUFFER_CONFIG } from '../../types/buffer'

/**
 * User preferences for buffer behavior
 */
export interface BufferUserPreferences {
  /** Whether buffer system is enabled */
  enabled: boolean

  /** Buffer size preferences */
  bufferSize: {
    before: number
    after: number
  }

  /** Prefetching preferences */
  prefetching: {
    enabled: boolean
    threshold: number
    adaptive: boolean
    maxBatch: number
  }

  /** Persistence preferences */
  persistence: {
    enabled: boolean
    maxAge: number // in hours
    maxNotes: number
  }

  /** Performance preferences */
  performance: {
    monitoring: boolean
    analytics: boolean
    memoryLimit: number // in MB
  }

  /** UI preferences */
  ui: {
    showStats: boolean
    showEdgeIndicators: boolean
    notifications: boolean
  }
}

/**
 * Default user preferences
 */
export const DEFAULT_BUFFER_PREFERENCES: BufferUserPreferences = {
  enabled: true,
  bufferSize: {
    before: 10,
    after: 10
  },
  prefetching: {
    enabled: true,
    threshold: 3,
    adaptive: true,
    maxBatch: 5
  },
  persistence: {
    enabled: true,
    maxAge: 24, // 24 hours
    maxNotes: 50
  },
  performance: {
    monitoring: false,
    analytics: false,
    memoryLimit: 50 // 50MB
  },
  ui: {
    showStats: false,
    showEdgeIndicators: true,
    notifications: true
  }
}

/**
 * Buffer preferences manager
 */
export class BufferPreferencesManager {
  private static readonly STORAGE_KEY = 'buffer-user-preferences'
  private preferences: BufferUserPreferences = { ...DEFAULT_BUFFER_PREFERENCES }

  constructor() {
    this.loadPreferences()
  }

  /**
   * Get current preferences
   */
  getPreferences(): BufferUserPreferences {
    return { ...this.preferences }
  }

  /**
   * Update preferences
   */
  updatePreferences(updates: Partial<BufferUserPreferences>): void {
    this.preferences = { ...this.preferences, ...updates }
    this.savePreferences()
    this.notifyPreferenceChange()
  }

  /**
   * Reset preferences to defaults
   */
  resetToDefaults(): void {
    this.preferences = { ...DEFAULT_BUFFER_PREFERENCES }
    this.savePreferences()
    this.notifyPreferenceChange()
  }

  /**
   * Convert preferences to buffer config
   */
  toBufferConfig(): BufferConfig {
    const prefs = this.preferences

    return {
      ...DEFAULT_BUFFER_CONFIG,
      bufferSizeBefore: prefs.bufferSize.before,
      bufferSizeAfter: prefs.bufferSize.after,
      prefetchThreshold: prefs.prefetching.threshold,
      maxPrefetchBatch: prefs.prefetching.maxBatch,
      staleThreshold: prefs.persistence.maxAge * 60 * 60 * 1000, // Convert hours to ms
      prefetchDebounce: prefs.prefetching.adaptive ? 100 : 200 // Faster debounce for adaptive mode
    }
  }

  /**
   * Get preference presets
   */
  static getPresets(): Record<string, Partial<BufferUserPreferences>> {
    return {
      conservative: {
        enabled: true,
        bufferSize: { before: 5, after: 5 },
        prefetching: { enabled: true, threshold: 2, adaptive: false, maxBatch: 3 },
        persistence: { enabled: true, maxAge: 12, maxNotes: 30 },
        performance: { monitoring: false, analytics: false, memoryLimit: 25 }
      },
      balanced: {
        enabled: true,
        bufferSize: { before: 10, after: 10 },
        prefetching: { enabled: true, threshold: 3, adaptive: true, maxBatch: 5 },
        persistence: { enabled: true, maxAge: 24, maxNotes: 50 },
        performance: { monitoring: false, analytics: false, memoryLimit: 50 }
      },
      aggressive: {
        enabled: true,
        bufferSize: { before: 20, after: 20 },
        prefetching: { enabled: true, threshold: 5, adaptive: true, maxBatch: 8 },
        persistence: { enabled: true, maxAge: 48, maxNotes: 100 },
        performance: { monitoring: true, analytics: true, memoryLimit: 100 }
      },
      performance: {
        enabled: true,
        bufferSize: { before: 15, after: 15 },
        prefetching: { enabled: true, threshold: 4, adaptive: true, maxBatch: 6 },
        persistence: { enabled: false, maxAge: 1, maxNotes: 20 },
        performance: { monitoring: true, analytics: true, memoryLimit: 75 }
      },
      minimal: {
        enabled: true,
        bufferSize: { before: 3, after: 3 },
        prefetching: { enabled: false, threshold: 1, adaptive: false, maxBatch: 2 },
        persistence: { enabled: false, maxAge: 1, maxNotes: 10 },
        performance: { monitoring: false, analytics: false, memoryLimit: 10 }
      }
    }
  }

  /**
   * Apply a preset
   */
  applyPreset(presetName: string): boolean {
    const presets = BufferPreferencesManager.getPresets()
    const preset = presets[presetName]

    if (!preset) {
      console.warn(`Buffer preset '${presetName}' not found`)
      return false
    }

    this.updatePreferences(preset)
    console.log(`Applied buffer preset: ${presetName}`)
    return true
  }

  /**
   * Export preferences for backup
   */
  exportPreferences(): string {
    return JSON.stringify(this.preferences, null, 2)
  }

  /**
   * Import preferences from backup
   */
  importPreferences(jsonString: string): boolean {
    try {
      const imported = JSON.parse(jsonString)

      // Validate structure
      if (!this.validatePreferences(imported)) {
        console.error('Invalid preferences structure')
        return false
      }

      this.preferences = imported
      this.savePreferences()
      this.notifyPreferenceChange()
      console.log('Buffer preferences imported successfully')
      return true
    } catch (error) {
      console.error('Failed to import preferences:', error)
      return false
    }
  }

  /**
   * Get performance impact assessment
   */
  getPerformanceImpact(): {
    memoryUsage: 'low' | 'medium' | 'high'
    networkUsage: 'low' | 'medium' | 'high'
    storageUsage: 'low' | 'medium' | 'high'
    batteryImpact: 'low' | 'medium' | 'high'
    score: number // 0-100, higher is better performance
  } {
    const prefs = this.preferences

    // Calculate memory impact
    const bufferSize = prefs.bufferSize.before + prefs.bufferSize.after
    const memoryUsage = bufferSize > 25 ? 'high' : bufferSize > 10 ? 'medium' : 'low'

    // Calculate network impact
    const networkUsage = prefs.prefetching.enabled && prefs.prefetching.adaptive
      ? 'high' : prefs.prefetching.enabled ? 'medium' : 'low'

    // Calculate storage impact
    const storageUsage = prefs.persistence.enabled && prefs.persistence.maxNotes > 50
      ? 'high' : prefs.persistence.enabled ? 'medium' : 'low'

    // Calculate battery impact
    const batteryImpact = prefs.performance.monitoring && prefs.prefetching.adaptive
      ? 'high' : prefs.prefetching.adaptive ? 'medium' : 'low'

    // Calculate overall performance score (0-100)
    let score = 100

    // Deduct points for resource usage
    if (memoryUsage === 'high') score -= 20
    else if (memoryUsage === 'medium') score -= 10

    if (networkUsage === 'high') score -= 15
    else if (networkUsage === 'medium') score -= 7

    if (storageUsage === 'high') score -= 10
    else if (storageUsage === 'medium') score -= 5

    if (batteryImpact === 'high') score -= 15
    else if (batteryImpact === 'medium') score -= 7

    // Bonus for optimization features
    if (prefs.prefetching.adaptive) score += 5
    if (prefs.performance.monitoring) score += 3

    return {
      memoryUsage,
      networkUsage,
      storageUsage,
      batteryImpact,
      score: Math.max(0, Math.min(100, score))
    }
  }

  /**
   * Load preferences from storage
   */
  private loadPreferences(): void {
    try {
      const stored = localStorage.getItem(BufferPreferencesManager.STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (this.validatePreferences(parsed)) {
          this.preferences = { ...DEFAULT_BUFFER_PREFERENCES, ...parsed }
        } else {
          console.warn('Stored preferences are invalid, using defaults')
        }
      }
    } catch (error) {
      console.error('Failed to load buffer preferences:', error)
    }
  }

  /**
   * Save preferences to storage
   */
  private savePreferences(): void {
    try {
      localStorage.setItem(
        BufferPreferencesManager.STORAGE_KEY,
        JSON.stringify(this.preferences)
      )
    } catch (error) {
      console.error('Failed to save buffer preferences:', error)
    }
  }

  /**
   * Validate preferences structure
   */
  private validatePreferences(prefs: any): prefs is BufferUserPreferences {
    return (
      typeof prefs === 'object' &&
      prefs !== null &&
      typeof prefs.enabled === 'boolean' &&
      typeof prefs.bufferSize === 'object' &&
      typeof prefs.bufferSize.before === 'number' &&
      typeof prefs.bufferSize.after === 'number' &&
      typeof prefs.prefetching === 'object' &&
      typeof prefs.prefetching.enabled === 'boolean' &&
      typeof prefs.prefetching.threshold === 'number' &&
      typeof prefs.prefetching.adaptive === 'boolean' &&
      typeof prefs.prefetching.maxBatch === 'number'
    )
  }

  /**
   * Notify listeners of preference changes
   */
  private notifyPreferenceChange(): void {
    // Emit a custom event for preference changes
    const event = new CustomEvent('bufferPreferencesChanged', {
      detail: { preferences: this.preferences }
    })
    window.dispatchEvent(event)
  }
}

/**
 * Singleton instance for easy access
 */
export const bufferPreferencesManager = new BufferPreferencesManager()

/**
 * Hook for buffer preferences
 */
export function useBufferPreferences() {
  return {
    getPreferences: () => bufferPreferencesManager.getPreferences(),
    updatePreferences: (updates: Partial<BufferUserPreferences>) =>
      bufferPreferencesManager.updatePreferences(updates),
    resetToDefaults: () => bufferPreferencesManager.resetToDefaults(),
    toBufferConfig: () => bufferPreferencesManager.toBufferConfig(),
    applyPreset: (presetName: string) => bufferPreferencesManager.applyPreset(presetName),
    getPresets: () => BufferPreferencesManager.getPresets(),
    exportPreferences: () => bufferPreferencesManager.exportPreferences(),
    importPreferences: (json: string) => bufferPreferencesManager.importPreferences(json),
    getPerformanceImpact: () => bufferPreferencesManager.getPerformanceImpact()
  }
}

/**
 * React hook for subscribing to preference changes
 */
export function useBufferPreferencesSubscription() {
  const [, forceUpdate] = React.useState(0)

  React.useEffect(() => {
    const handlePreferenceChange = () => {
      forceUpdate(prev => prev + 1)
    }

    window.addEventListener('bufferPreferencesChanged', handlePreferenceChange)

    return () => {
      window.removeEventListener('bufferPreferencesChanged', handlePreferenceChange)
    }
  }, [])

  return bufferPreferencesManager.getPreferences()
}
