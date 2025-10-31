/**
 * Calculate brightness values for the amber notification button based on unread count
 */
export interface AmberBrightness {
  baseColor: string
  glowColor: string
  glowIntensity: string
  hoverGlowIntensity: string
  opacity: number
}

/**
 * Maps notification count to amber button brightness
 * 0 notifications = very dim
 * 1-5 notifications = moderate glow
 * 6+ notifications = bright glow
 */
export function calculateAmberBrightness(unreadCount: number): AmberBrightness {
  if (unreadCount === 0) {
    // Very dim - almost off
    return {
      baseColor: '#92400e', // darker amber
      glowColor: '#d97706',
      glowIntensity: '0 0 2px rgba(217, 119, 6, 0.2), 0 0 4px rgba(217, 119, 6, 0.1)',
      hoverGlowIntensity: '0 0 3px rgba(217, 119, 6, 0.3), 0 0 6px rgba(217, 119, 6, 0.15)',
      opacity: 0.4,
    }
  } else if (unreadCount <= 2) {
    // Low brightness
    return {
      baseColor: '#b45309', // medium-dark amber
      glowColor: '#d97706',
      glowIntensity: '0 0 3px #d97706, 0 0 6px rgba(217, 119, 6, 0.25)',
      hoverGlowIntensity: '0 0 4px #d97706, 0 0 8px rgba(217, 119, 6, 0.3)',
      opacity: 0.6,
    }
  } else if (unreadCount <= 5) {
    // Medium brightness (original)
    return {
      baseColor: '#d97706',
      glowColor: '#f59e0b',
      glowIntensity: '0 0 4px #f59e0b, 0 0 8px rgba(245, 158, 11, 0.3)',
      hoverGlowIntensity: '0 0 6px #f59e0b, 0 0 12px rgba(245, 158, 11, 0.4)',
      opacity: 0.8,
    }
  } else if (unreadCount <= 10) {
    // High brightness
    return {
      baseColor: '#f59e0b', // brighter amber
      glowColor: '#fbbf24',
      glowIntensity: '0 0 6px #fbbf24, 0 0 12px rgba(251, 191, 36, 0.4), 0 0 18px rgba(251, 191, 36, 0.2)',
      hoverGlowIntensity: '0 0 8px #fbbf24, 0 0 16px rgba(251, 191, 36, 0.5), 0 0 24px rgba(251, 191, 36, 0.3)',
      opacity: 0.9,
    }
  } else {
    // Maximum brightness - urgent attention needed
    return {
      baseColor: '#fbbf24', // brightest amber
      glowColor: '#fde047', // yellow glow for urgency
      glowIntensity: '0 0 8px #fde047, 0 0 16px rgba(253, 224, 71, 0.5), 0 0 24px rgba(253, 224, 71, 0.3)',
      hoverGlowIntensity: '0 0 12px #fde047, 0 0 20px rgba(253, 224, 71, 0.6), 0 0 32px rgba(253, 224, 71, 0.4)',
      opacity: 1.0,
    }
  }
}

/**
 * Get complete box-shadow string including inset shadows for depth
 */
export function getCompleteBoxShadow(brightness: AmberBrightness, isHover: boolean = false): string {
  const glowShadow = isHover ? brightness.hoverGlowIntensity : brightness.glowIntensity
  const insetShadows = `
    inset 0 1px 0 rgba(255, 255, 255, ${brightness.opacity * 0.2}),
    inset 0 -1px 0 rgba(0, 0, 0, 0.3)
  `
  return `${glowShadow}, ${insetShadows}`
}
