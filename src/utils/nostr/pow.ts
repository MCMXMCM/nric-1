import { nip13 } from 'nostr-tools'
import { sha256 } from '@noble/hashes/sha2'
import { powActions, generateSessionId } from '../../stores/powStore'

export type EventBaseForPow = {
  pubkey: string
  kind: number
  created_at: number
  tags: string[][]
  content: string
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]
    hex += (b >>> 4).toString(16)
    hex += (b & 0x0f).toString(16)
  }
  return hex
}

function serializeEventForHash(base: EventBaseForPow): string {
  const tags: string[][] = (base.tags || []).map(t => t.slice())
  return JSON.stringify([0, base.pubkey, base.created_at, base.kind, tags, base.content])
}

export function computeEventIdHex(base: EventBaseForPow): string {
  const payload = serializeEventForHash(base)
  const hash = sha256(new TextEncoder().encode(payload))
  return bytesToHex(hash)
}

export function countLeadingZeroBits(hex: string): number {
  return nip13.getPow(hex)
}

function removeExistingNonceTags(tags: string[][]): string[][] {
  return tags.filter(t => !(Array.isArray(t) && t[0] === 'nonce'))
}

export type MineOptions = {
  signal?: AbortSignal
  maxIterations?: number
  sessionId?: string // Optional session ID for tracking
}

/**
 * Mine PoW using nip13 fastEventHash/getPow, with optional abort/iteration cap.
 */
export async function minePowForEventBase(
  base: EventBaseForPow,
  targetBits: number,
  options?: MineOptions
): Promise<EventBaseForPow> {

  if (!base || !base.pubkey) {
    console.error('❌ POW: Missing required pubkey')
    throw new Error('pubkey required for PoW')
  }
  if (typeof targetBits !== 'number' || targetBits < 1) {
    console.error('❌ POW: Invalid targetBits:', targetBits)
    throw new Error('invalid targetBits')
  }

  const signal = options?.signal
  const sessionId = options?.sessionId || generateSessionId()
  console.log('🔑 POW: Using session ID:', sessionId)

  if (signal?.aborted) {
    console.log('🛑 POW: Mining aborted before starting')
    powActions.abortMining(sessionId)
    throw new Error('aborted')
  }

  const originalTags = Array.isArray(base.tags) ? base.tags.slice() : []
  const coreTags = removeExistingNonceTags(originalTags)
  console.log('🏷️ POW: Prepared tags:', coreTags.length, 'core tags')

  // Start mining session
  console.log('🚀 POW: Starting mining session...')
  powActions.startMining(sessionId, targetBits)

  // Try web worker for responsiveness
  if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
    console.log('✅ POW: Web worker supported, creating module worker...')
    try {
      const worker = new Worker(new URL('../../workers/powWorker.ts', import.meta.url), { type: 'module' } as any)
      console.log('✅ POW: Module worker created successfully')

      const mined = await new Promise<EventBaseForPow>((resolve, reject) => {
        const onAbort = () => {
          try { worker.terminate() } catch {}
          powActions.abortMining(sessionId)
          reject(new Error('aborted'))
        }
        if (signal) signal.addEventListener('abort', onAbort, { once: true })

        worker.onmessage = (ev: MessageEvent) => {
          const data = ev.data || {}
          if (data.error) {
            clearTimeout(timeoutId)
            try { if (signal) signal.removeEventListener('abort', onAbort) } catch {}
            try { worker.terminate() } catch {}
            powActions.setMiningError(sessionId, String(data.error))
            reject(new Error(String(data.error)))
            return
          }
          if (data.progress) {
            powActions.updateProgress(sessionId, {
              currentBits: data.progress.currentBits || 0,
              nonce: data.progress.nonce || 0,
              progress: data.progress.progress || 0,
              hashesPerSecond: data.progress.hashesPerSecond || 0,
              estimatedTimeRemaining: data.progress.estimatedTimeRemaining || null,
            })
            return
          }
          if (data.mined) {
            clearTimeout(timeoutId)
            try { if (signal) signal.removeEventListener('abort', onAbort) } catch {}
            try { worker.terminate() } catch {}
            powActions.completeMining(sessionId, data.mined)
            resolve(data.mined as EventBaseForPow)
            return
          }
        }

        worker.onerror = (err) => {
          console.error('❌ POW: Worker error event:', err)
          try { if (signal) signal.removeEventListener('abort', onAbort) } catch {}
          try { worker.terminate() } catch {}
          powActions.setMiningError(sessionId, String(err))
          reject(err as any)
        }

        // Add timeout to detect if worker hangs
        const timeoutId = setTimeout(() => {
          console.error('❌ POW: Worker timeout after 120 seconds')
          try { worker.terminate() } catch {}
          powActions.setMiningError(sessionId, 'Worker timeout')
          reject(new Error('Worker timeout'))
        }, 120000)

        // Send session info to worker
        console.log('📤 POW: Sending data to worker:', { targetBits, sessionId })
        worker.postMessage({
          base: { ...base, tags: coreTags },
          targetBits,
          sessionId
        })
        console.log('✅ POW: Worker message sent, waiting for response...')
      })
      return mined
    } catch (error) {
      console.log('⚠️ POW: Module worker failed or timed out, falling back to main-thread mining:', error)
      // Fallback to main-thread mining
    }
  }
  console.log('🔄 POW: Starting main-thread mining with', targetBits, 'bits...')
  let nonce = 0
  let startTime = Date.now()
  let lastProgressUpdate = startTime

  // Fallback main-thread loop
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (signal?.aborted) {
      powActions.abortMining(sessionId)
      throw new Error('aborted')
    }

    const nonceTag: string[] = ['nonce', String(nonce), String(targetBits)]
    const candidate: EventBaseForPow = {
      pubkey: base.pubkey,
      kind: base.kind,
      created_at: base.created_at,
      content: base.content,
      tags: [...coreTags, nonceTag],
    }
    const id = computeEventIdHex(candidate)
    const currentBits = nip13.getPow(id)

    if (currentBits >= targetBits) {
      powActions.completeMining(sessionId, candidate)
      return candidate
    }

    nonce++

    // Update progress every 2048 iterations or every 75ms for more responsive UI
    if ((nonce & 0x7ff) === 0 || Date.now() - lastProgressUpdate > 75) {
      const elapsed = Date.now() - startTime
      const hashesPerSecond = nonce / (elapsed / 1000)

      // Expected attempts to find target: 2^targetBits
      const avgAttempts = Math.pow(2, targetBits)
      // Time-based/probabilistic progress based on attempts completed
      const progress = Math.min((nonce / avgAttempts) * 100, 99.9)
      // ETA based on remaining attempts and current hash rate
      const remainingAttempts = Math.max(avgAttempts - nonce, 0)
      const estimatedTimeRemaining = hashesPerSecond > 0
        ? (remainingAttempts / hashesPerSecond)
        : null

      powActions.updateProgress(sessionId, {
        currentBits,
        nonce,
        progress,
        hashesPerSecond,
        estimatedTimeRemaining,
      })

      lastProgressUpdate = Date.now()

      // Yield a frame to allow UI to update
      await new Promise<void>((r) => requestAnimationFrame(() => r()))
    }
  }
}

