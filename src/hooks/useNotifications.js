// useNotifications.js
// Bell badge logic — independent WebSocket subscription to kind:4 DMs
// Same fetch pattern as Messages.jsx — no dependency on Messages being open
import { useState, useEffect, useRef } from 'react'
import { nip19 } from 'nostr-tools'
import { getReadRelays, DEFAULT_RELAYS, getSecretKey } from '../lib/nostrSync'
import { nip04 } from 'nostr-tools'
import { finalizeEvent } from 'nostr-tools/pure'

const UNREAD_KEY    = 'bitsoko_unread_count'
const LAST_SEEN_KEY = 'bitsoko_msgs_last_seen'

// ── Storage helpers ────────────────────────────
export function saveUnreadCount(count) {
  try {
    localStorage.setItem(UNREAD_KEY, String(Math.max(0, count)))
    window.dispatchEvent(new CustomEvent('bitsoko_unread', { detail: Math.max(0, count) }))
  } catch {}
}

export function getUnreadCount() {
  try { return parseInt(localStorage.getItem(UNREAD_KEY) || '0') || 0 } catch { return 0 }
}

export function getLastSeenTs() {
  try { return parseInt(localStorage.getItem(LAST_SEEN_KEY) || '0') || 0 } catch { return 0 }
}

export function saveLastSeenTs(ts) {
  try { localStorage.setItem(LAST_SEEN_KEY, String(ts)) } catch {}
}

export function markAllMessagesRead() {
  saveUnreadCount(0)
  saveLastSeenTs(Math.floor(Date.now() / 1000))
  // Clear all sender tracking keys so fresh counts start clean
  const keys = Object.keys(localStorage).filter(k => k.startsWith('bitsoko_unread_sender_'))
  keys.forEach(k => localStorage.removeItem(k))
  window.dispatchEvent(new CustomEvent('bitsoko_msgs_read'))
}

// ── skToHex helper ─────────────────────────────
const skToHex = (sk) => Array.from(sk).map(b => b.toString(16).padStart(2, '0')).join('')

// ── useNotifications ───────────────────────────
// Runs independently — subscribes to DMs on its own WebSocket
// Does NOT depend on Messages.jsx being mounted
export function useNotifications() {
  const [unreadCount, setUnreadCount] = useState(getUnreadCount)
  const seenRef = useRef(new Set())

  useEffect(() => {
    // Listen for real-time count updates (from this hook itself or Messages.jsx)
    const onUnread = (e) => setUnreadCount(typeof e.detail === 'number' ? e.detail : 0)
    const onRead   = () => setUnreadCount(0)
    window.addEventListener('bitsoko_unread', onUnread)
    window.addEventListener('bitsoko_msgs_read', onRead)

    // Get keys
    let myPubkeyHex, sk, skHex
    try {
      const npub  = localStorage.getItem('bitsoko_npub')
      const nsec  = localStorage.getItem('bitsoko_nsec')
      if (!npub || !nsec) return
      myPubkeyHex = nip19.decode(npub).data
      sk          = getSecretKey()
      skHex       = skToHex(sk)
    } catch { return }

    const lastSeenTs = getLastSeenTs()
    const relays     = [...new Set([...getReadRelays(), ...DEFAULT_RELAYS])]
    const closers    = []

    // Subscribe to each relay independently — same pattern as Messages.jsx
    for (const relayUrl of relays) {
      let ws, closed = false, authed = false
      const subId = 'notif-' + Math.random().toString(36).slice(2, 8)

      const sendReq = () => {
        ws.send(JSON.stringify(['REQ', subId, {
          kinds:   [4],
          '#p':    [myPubkeyHex],
          since:   lastSeenTs || Math.floor(Date.now() / 1000) - 86400, // last 24h max
          limit:   50,
        }]))
      }

      const sendAuth = (challenge) => {
        try {
          const ev = finalizeEvent({
            kind:       22242,
            created_at: Math.floor(Date.now() / 1000),
            tags:       [['relay', relayUrl], ['challenge', challenge]],
            content:    '',
          }, sk)
          ws.send(JSON.stringify(['AUTH', ev]))
        } catch {}
      }

      const connect = () => {
        if (closed) return
        try {
          ws = new WebSocket(relayUrl)
          ws.onopen    = () => { if (!closed) sendReq() }
          ws.onmessage = async ({ data }) => {
            if (closed) return
            let msg
            try { msg = JSON.parse(data) } catch { return }
            const [type, ...rest] = msg

            if (type === 'AUTH') { sendAuth(rest[0]); return }
            if (type === 'OK' && !authed) { authed = true; sendReq(); return }

            if (type === 'EVENT' && rest[1]?.kind === 4) {
              const event = rest[1]
              if (seenRef.current.has(event.id)) return
              seenRef.current.add(event.id)

              // Only count messages TO me, not FROM me
              const isToMe = (event.tags || []).some(t => t[0] === 'p' && t[1] === myPubkeyHex)
              if (!isToMe || event.pubkey === myPubkeyHex) return

              // Only count if newer than last seen
              if (event.created_at <= getLastSeenTs()) return

              // Try to decrypt — if it fails it's not for us
              try {
                await nip04.decrypt(skHex, event.pubkey, event.content)
                // Count by unique sender — not by message count
                // If this sender is already counted, don't increment
                const senderKey = `bitsoko_unread_sender_${event.pubkey}`
                const lastSeen  = getLastSeenTs()
                if (!localStorage.getItem(senderKey) || parseInt(localStorage.getItem(senderKey) || '0') < lastSeen) {
                  localStorage.setItem(senderKey, String(event.created_at))
                  setUnreadCount(prev => {
                    const next = prev + 1
                    saveUnreadCount(next)
                    return next
                  })
                }
              } catch {}
            }
          }
          ws.onerror = () => {}
          ws.onclose = () => { if (!closed) setTimeout(connect, 5000) }
        } catch {}
      }

      connect()
      closers.push(() => { closed = true; try { ws?.close() } catch {} })
    }

    return () => {
      window.removeEventListener('bitsoko_unread', onUnread)
      window.removeEventListener('bitsoko_msgs_read', onRead)
      closers.forEach(c => c())
    }
  }, [])

  return { unreadCount }
}

// ── Push notification helpers ─────────────────
export async function registerNotifications(pubkeyHex) {
  if (!('serviceWorker' in navigator) || !('Notification' in window)) return false
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false
  try {
    await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready
    syncPubkeyToSW(pubkeyHex)
    return true
  } catch { return false }
}

export function syncPubkeyToSW(pubkeyHex) {
  if (!navigator.serviceWorker?.controller) return
  const req = indexedDB.open('bitsoko-sw', 1)
  req.onupgradeneeded = e => e.target.result.createObjectStore('kv')
  req.onsuccess = e => {
    const tx = e.target.result.transaction('kv', 'readwrite')
    tx.objectStore('kv').put(pubkeyHex, 'bitsoko_pubkey')
  }
}

export function showLocalNotification(title, body, tag = 'bitsoko') {
  if (Notification.permission !== 'granted') return
  navigator.serviceWorker?.ready.then(reg => {
    reg.showNotification(title, {
      body, icon: '/icon-192.png', badge: '/favicon-32.png',
      tag, renotify: true, vibrate: [200, 100, 200],
    })
  }).catch(() => {})
}

