// useNotifications.js
// Two responsibilities:
//   1. In-app unread badge count (Bell icon in Home)
//   2. Push notification registration via Service Worker

import { useState, useEffect } from 'react'

const UNREAD_KEY   = 'bitsoko_unread_count'
const LAST_SEEN_KEY = 'bitsoko_msgs_last_seen'

// ── Unread count ──────────────────────────────
export function saveUnreadCount(count) {
  try { localStorage.setItem(UNREAD_KEY, String(count)) } catch {}
  // Dispatch event so Home Bell badge updates without page reload
  window.dispatchEvent(new CustomEvent('bitsoko_unread', { detail: count }))
}

export function getUnreadCount() {
  try { return parseInt(localStorage.getItem(UNREAD_KEY) || '0') } catch { return 0 }
}

export function markAllMessagesRead() {
  saveUnreadCount(0)
  saveLastSeenTs(Math.floor(Date.now() / 1000))
}

export function getLastSeenTs() {
  try { return parseInt(localStorage.getItem(LAST_SEEN_KEY) || '0') } catch { return 0 }
}

export function saveLastSeenTs(ts) {
  try { localStorage.setItem(LAST_SEEN_KEY, String(ts)) } catch {}
}

// ── useNotifications hook — used in Home.jsx ──
// Returns { unreadCount } — updates when Messages page
// calls saveUnreadCount
export function useNotifications() {
  const [unreadCount, setUnreadCount] = useState(getUnreadCount)

  useEffect(() => {
    // Listen for updates from Messages page
    const handler = (e) => setUnreadCount(e.detail || 0)
    window.addEventListener('bitsoko_unread', handler)

    // Also poll localStorage every 5s in case of cross-tab updates
    const interval = setInterval(() => {
      setUnreadCount(getUnreadCount())
    }, 5000)

    return () => {
      window.removeEventListener('bitsoko_unread', handler)
      clearInterval(interval)
    }
  }, [])

  return { unreadCount }
}

// ── Push notification registration ───────────
export async function registerNotifications(pubkeyHex) {
  if (!('serviceWorker' in navigator) || !('Notification' in window)) return false
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false
  try {
    const reg = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready
    syncPubkeyToSW(pubkeyHex)
    if ('periodicSync' in reg) {
      try {
        await reg.periodicSync.register('bitsoko-dm-check', { minInterval: 5 * 60 * 1000 })
      } catch {}
    }
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
  navigator.serviceWorker.ready.then(reg => {
    reg.showNotification(title, {
      body, icon: '/icon-192.png', badge: '/favicon-32.png',
      tag, renotify: true, vibrate: [200, 100, 200],
    })
  }).catch(() => {})
}

