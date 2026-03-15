// src/hooks/useNostrProfile.js
// ─────────────────────────────────────────────
// Bitsoko-pattern hook for fetching Nostr profiles.
// 1. Returns cached IndexedDB data immediately (zero flash)
// 2. Fetches fresh data from relays in background
// 3. Saves fresh data to IndexedDB for next login
// ─────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { SimplePool } from 'nostr-tools/pool'
import { getProfile, saveProfile } from '../lib/db'

const FETCH_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://relay.nostr.band',
  'wss://nostr-pub.wellorder.net',
]

export function useNostrProfile(pubkeyHex) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!pubkeyHex) { setLoading(false); return }

    let cancelled = false

    const run = async () => {
      // ── Step 1: IndexedDB — instant, no network
      // If user has logged in before, this fills the UI in microseconds
      try {
        const cached = await getProfile(pubkeyHex)
        if (!cancelled && cached && (cached.name || cached.display_name || cached.picture || cached.about)) {
          setProfile(cached)
          setLoading(false)
        }
      } catch {}

      // ── Step 2: Relay fetch — always runs, gets freshest data
      try {
        const pool   = new SimplePool()
        const events = await pool.querySync(
          FETCH_RELAYS,
          { kinds: [0], authors: [pubkeyHex], limit: 1 }
        )
        if (cancelled) return

        if (!events.length) {
          setLoading(false)
          return
        }

        const p = JSON.parse(events[0].content)

        // Save to IndexedDB so next login gets this instantly (Step 1 above)
        await saveProfile(pubkeyHex, p)

        if (!cancelled) {
          setProfile(p)
          setLoading(false)
        }
      } catch {
        if (!cancelled) setLoading(false)
      }
    }

    run()
    return () => { cancelled = true }
  }, [pubkeyHex])

  return { profile, loading }
}

