import { prefetchRoute } from './prefetch'

let registered = false

export function registerHoverPrefetch(): void {
  if (registered) return
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  const shouldPrefetch = (): boolean => {
    try {
      const nav: any = (navigator as any)
      if (nav?.connection?.saveData) return false
      const type = nav?.connection?.effectiveType
      if (type && (type === '2g' || type === 'slow-2g')) return false
    } catch {}
    return true
  }

  const timers = new WeakMap<EventTarget, number>()

  const schedule = (target: EventTarget | null, href: string) => {
    if (!shouldPrefetch()) return
    if (!href) return
    if (!target) return
    // Avoid duplicate timers
    if (timers.has(target)) return
    const id = window.setTimeout(() => {
      timers.delete(target)
      prefetchRoute(href)
    }, 80)
    timers.set(target, id)
  }

  const cancel = (target: EventTarget | null) => {
    if (!target) return
    const id = timers.get(target)
    if (id) {
      clearTimeout(id)
      timers.delete(target)
    }
  }

  const findHref = (node: Element | null): string | null => {
    if (!node) return null
    const link = node.closest('a[href]') as HTMLAnchorElement | null
    if (link && link.href) {
      // Same-origin and SPA path checks
      try {
        const url = new URL(link.href)
        if (url.origin !== window.location.origin) return null
        const p = url.pathname
        if (p === '/' || p.startsWith('/note/') || p.startsWith('/npub/') || p.startsWith('/create')) {
          return url.pathname + url.search + url.hash
        }
      } catch { return null }
    }
    // Support data-prefetch-to for non-anchor elements
    const dataTo = node.closest('[data-prefetch-to]') as HTMLElement | null
    if (dataTo) return dataTo.getAttribute('data-prefetch-to')
    return null
  }

  const onOver = (e: Event) => {
    const href = findHref(e.target as Element)
    if (!href) return
    schedule(e.target as EventTarget, href)
  }

  const onOut = (e: Event) => {
    cancel(e.target as EventTarget)
  }

  const onTouch = (e: Event) => {
    const href = findHref(e.target as Element)
    if (!href) return
    // Prefetch immediately on touch
    prefetchRoute(href)
  }

  document.addEventListener('mouseover', onOver, { passive: true, capture: true })
  document.addEventListener('mouseout', onOut, { passive: true, capture: true })
  document.addEventListener('touchstart', onTouch, { passive: true, capture: true })

  registered = true
}


