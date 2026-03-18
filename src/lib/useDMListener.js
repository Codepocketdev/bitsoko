// useDMListener.js — src/lib/useDMListener.js
// ─────────────────────────────────────────────
// Global lightweight DM listener mounted in App.jsx
// Counts incoming DMs and updates bell badge WITHOUT decrypting.
// Full decryption only happens when Messages.jsx opens.
// ─────────────────────────────────────────────

import { useEffect, useRef } from 'react'
import { finalizeEvent } from 'nostr-tools/pure'
import { nip19 } from 'nostr-tools'
import { DEFAULT_RELAYS, getReadRelays } from './nostrSync'
import {
  saveUnreadCount,
  getUnreadCount,
  getLastSeenTs,
  saveLastSeenTs,
} from '../hooks/useNotifications'

function getMyKeys() {
  try {
    const npub = localStorage.getItem('bitsoko_npub')
    const nsec = localStorage.getItem('bitsoko_nsec')
    if (!npub || !nsec) return null
    const { data: pubkey } = nip19.decode(npub.trim())
    const { data: sk     } = nip19.decode(nsec.trim())
    return { pubkey, sk }
  } catch { return null }
}

// ── Single relay connection ───────────────────
// Subscribes to DMs addressed TO us since lastSeenTs.
// On new message: calls onNew(eventId, createdAt).
// Auto-reconnects every 4s on disconnect.
function connectRelay(relayUrl, pubkeyHex, sk, since, onNew) {
  let ws, closed = false
  const subId = 'bell-' + Math.random().toString(36).slice(2, 8)

  const sendReq = () => {
    if (ws?.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify(['REQ', subId,
      { kinds: [4], '#p': [pubkeyHex], since }
    ]))
    console.log('[bell] REQ sent to', relayUrl.replace('wss://',''))
  }

  const sendAuth = (challenge) => {
    try {
      const ev = finalizeEvent({
        kind: 22242,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['relay', relayUrl], ['challenge', challenge]],
        content: '',
      }, sk)
      ws.send(JSON.stringify(['AUTH', ev]))
    } catch {}
  }

  const connect = () => {
    if (closed) return
    try {
      ws = new WebSocket(relayUrl)

      ws.onopen    = () => { if (!closed) sendReq() }
      ws.onerror   = () => {}
      ws.onclose   = () => { if (!closed) setTimeout(connect, 4000) }

      ws.onmessage = ({ data }) => {
        if (closed) return
        let msg
        try { msg = JSON.parse(data) } catch { return }
        const [type, ...rest] = msg

        // NIP-42 auth challenge
        if (type === 'AUTH') {
          sendAuth(rest[0])
          return
        }

        // Auth accepted — resubscribe
        if (type === 'OK') {
          sendReq()
          return
        }

        // New DM event
        if (type === 'EVENT' && rest[1]?.kind === 4) {
          const event = rest[1]
          // Only count messages sent TO us, not FROM us
          if (event.pubkey !== pubkeyHex) {
            onNew(event.id, event.created_at)
          }
        }
      }
    } catch { if (!closed) setTimeout(connect, 4000) }
  }

  connect()
  return () => { closed = true; try { ws?.close() } catch {} }
}

// ── Hook ──────────────────────────────────────
export function useDMListener() {
  const closersRef  = useRef([])
  const seenIdsRef  = useRef(new Set())
  const countRef    = useRef(getUnreadCount())

  useEffect(() => {
    const keys = getMyKeys()
    if (!keys) {
      console.log('[bell] no keys — DM listener not started')
      return
    }

    const { pubkey, sk } = keys

    // Start from last time user read messages
    // Use 7 days ago as floor — prevents flooding on first install
    const lastSeen  = getLastSeenTs()
    const weekAgo   = Math.floor(Date.now() / 1000) - 7 * 86400
    const since     = lastSeen > weekAgo ? lastSeen : weekAgo

    console.log('[bell] starting DM listener, pubkey:', pubkey.slice(0,8), 'since:', new Date(since*1000).toLocaleString())

    const relays = [...new Set([...getReadRelays(), ...DEFAULT_RELAYS])]

    const onNew = (eventId, createdAt) => {
      // Skip if already seen this session
      if (seenIdsRef.current.has(eventId)) return
      seenIdsRef.current.add(eventId)

      // Skip if older than lastSeen (already read)
      if (createdAt <= getLastSeenTs()) return

      countRef.current += 1
      console.log('[bell] new DM! count now:', countRef.current)
      saveUnreadCount(countRef.current)
    }

    // Connect to first 3 relays only — enough for coverage, avoids flooding
    const activeRelays = relays.slice(0, 3)
    closersRef.current = activeRelays.map(url =>
      connectRelay(url, pubkey, sk, since, onNew)
    )

    // When Messages page marks all read — reset our counter
    const onRead = () => {
      console.log('[bell] messages marked read — resetting count')
      countRef.current = 0
      seenIdsRef.current = new Set()
    }
    window.addEventListener('bitsoko_msgs_read', onRead)

    return () => {
      closersRef.current.forEach(c => c?.())
      closersRef.current = []
      window.removeEventListener('bitsoko_msgs_read', onRead)
    }
  }, [])
}

