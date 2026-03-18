// src/hooks/useNotifications.js
// ─────────────────────────────────────────────
// Notification count for the bell icon.
//
// Strategy:
// - Messages.jsx calculates unread count after fetching DMs
//   and calls saveUnreadCount() to store in localStorage
// - useNotifications hook reads that value + listens for updates
// - Bell updates instantly via custom event within same tab
// ─────────────────────────────────────────────

import { useState, useEffect } from 'react'

const UNREAD_KEY    = 'bitsoko_unread_count'
const LAST_SEEN_KEY = 'bitsoko_last_seen_ts'

// ── Called by Messages.jsx to save unread count ──
export function saveUnreadCount(count) {
  try {
    localStorage.setItem(UNREAD_KEY, String(count))
    window.dispatchEvent(new CustomEvent('bitsoko_unread', { detail: count }))
  } catch {}
}

// ── Called by Messages.jsx when page opens ───────
export function markAllMessagesRead() {
  try {
    const now = Math.floor(Date.now() / 1000)
    localStorage.setItem(LAST_SEEN_KEY, String(now))
  } catch {}
}

// ── Get last seen timestamp ───────────────────────
export function getLastSeenTs() {
  try {
    return parseInt(localStorage.getItem(LAST_SEEN_KEY) || '0')
  } catch { return 0 }
}

// ── Hook used by Home.jsx bell ────────────────────
export function useNotifications() {
  const [unreadCount, setUnreadCount] = useState(() => {
    try { return parseInt(localStorage.getItem(UNREAD_KEY) || '0') } catch { return 0 }
  })

  useEffect(() => {
    const onUnread  = (e) => setUnreadCount(e.detail ?? 0)
    const onStorage = (e) => {
      if (e.key === UNREAD_KEY) setUnreadCount(parseInt(e.newValue || '0'))
    }
    window.addEventListener('bitsoko_unread', onUnread)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('bitsoko_unread', onUnread)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  return { unreadCount }
}

