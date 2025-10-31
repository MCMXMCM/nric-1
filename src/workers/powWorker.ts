/// <reference lib="webworker" />

// Enhanced PoW worker with progress updates and session tracking
// Receives { base, targetBits, sessionId } and sends progress updates + final result

import { sha256 } from '@noble/hashes/sha2'

type EventBaseForPow = {
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

function computeEventIdHex(base: EventBaseForPow): string {
  const payload = serializeEventForHash(base)
  const hash = sha256(new TextEncoder().encode(payload))
  return bytesToHex(hash)
}

function countLeadingZeroBitsHex(hex: string): number {
  let bits = 0
  for (let i = 0; i < hex.length; i++) {
    const ch = hex[i]!
    const nibble = parseInt(ch, 16)
    if (Number.isNaN(nibble)) return bits
    if (nibble === 0) {
      bits += 4
      continue
    }
    // count leading zero bits in non-zero nibble
    const table = [4,3,2,2,1,1,1,1,0,0,0,0,0,0,0,0]
    bits += table[nibble]
    break
  }
  return bits
}

function onMessage(e: MessageEvent) {
  console.log('👷 WORKER: Received message:', e.data)

  const { base, targetBits, sessionId } = e.data || {}

  console.log('👷 WORKER: Parsed data:', { base: !!base, targetBits, sessionId })

  if (!base || !targetBits) {
    console.error('❌ WORKER: Invalid arguments received')
    ;(self as any).postMessage({ error: 'invalid-args', sessionId })
    return
  }

  console.log('✅ WORKER: Starting mining with', targetBits, 'bits for session', sessionId)

  const originalTags = Array.isArray(base.tags) ? base.tags.slice() : []
  const coreTags = originalTags.filter((t: string[]) => !(Array.isArray(t) && t[0] === 'nonce'))

  let nonce = 0
  const startTime = Date.now()
  let lastProgressUpdate = startTime
  let hashesPerSecond = 0

  while (true) {
    const candidate: EventBaseForPow = {
      pubkey: base.pubkey,
      kind: base.kind,
      created_at: base.created_at,
      tags: [...coreTags, ['nonce', String(nonce), String(targetBits)]],
      content: base.content,
    }

    const id = computeEventIdHex(candidate)
    const currentBits = countLeadingZeroBitsHex(id)

    if (currentBits >= targetBits) {
      ;(self as any).postMessage({
        mined: candidate,
        sessionId
      })
      break
    }

    nonce++

    // Send progress updates every 4096 iterations or every 200ms
    if ((nonce & 0xfff) === 0 || Date.now() - lastProgressUpdate > 200) {
      const elapsed = Date.now() - startTime
      hashesPerSecond = nonce / (elapsed / 1000)

      // Expected attempts to find target: 2^targetBits
      const avgAttempts = Math.pow(2, targetBits)
      // Time-based/probabilistic progress: fraction of attempts completed
      const progress = Math.min((nonce / avgAttempts) * 100, 99.9)
      // ETA based on remaining expected attempts and current hash rate
      const remainingAttempts = Math.max(avgAttempts - nonce, 0)
      const estimatedTimeRemaining = hashesPerSecond > 0
        ? (remainingAttempts / hashesPerSecond)
        : null

      ;(self as any).postMessage({
        progress: {
          currentBits,
          nonce,
          progress,
          hashesPerSecond,
          estimatedTimeRemaining,
          sessionId
        }
      })

      lastProgressUpdate = Date.now()
    }
  }
}

;(self as any).onmessage = onMessage

