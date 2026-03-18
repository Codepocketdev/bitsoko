// useNotifications.js
import { useState, useEffect } from 'react'

const UNREAD_KEY    = 'bitsoko_unread_count'
const LAST_SEEN_KEY = 'bitsoko_msgs_last_seen'

// ── Storage helpers ───────────────────────────
export function saveUnreadCount(count) {
  try { localStorage.setItem(UNREAD_KEY, String(Math.max(0, count))) } catch {}
  window.dispatchEvent(new CustomEvent('bitsoko_unread', { detail: Math.max(0, count) }))
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
  // Tell useDMListener to reset its internal counter
  window.dispatchEvent(new CustomEvent('bitsoko_msgs_read'))
}

// ── useNotifications hook — used in Home.jsx ──
export function useNotifications() {
  const [unreadCount, setUnreadCount] = useState(getUnreadCount)

  useEffect(() => {
    const onUnread = (e) => setUnreadCount(typeof e.detail === 'number' ? e.detail : 0)
    window.addEventListener('bitsoko_unread', onUnread)

    // Poll every 3s as safety net for cross-tab / missed events
    const interval = setInterval(() => setUnreadCount(getUnreadCount()), 3000)

    return () => {
      window.removeEventListener('bitsoko_unread', onUnread)
      clearInterval(interval)
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
    const reg = await navigator.serviceWorker.register('/sw.js')
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

