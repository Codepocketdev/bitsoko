// src/hooks/useNpubcash.js
// Adapted from SatoshiPay (github.com/Codepocketdev/satoshi-pay-wallet)
//
// Polls npub.cash every 30s for incoming Lightning payments.
// When balance > 0, claims the token automatically.
// Uses NIP-98 HTTP auth with the user's nsec key.

import { useState, useEffect, useCallback } from 'react'
import { finalizeEvent } from 'nostr-tools/pure'
import { nip19 }         from 'nostr-tools'

const NPUBCASH_BASE = 'https://npub.cash'
const POLL_INTERVAL = 30000 // 30 seconds

// ── NIP-98 auth token ─────────────────────────
async function buildNip98Auth(nsec, url, method = 'GET') {
  const { data: sk } = nip19.decode(nsec.trim())
  const event = finalizeEvent({
    kind:       27235,
    created_at: Math.floor(Date.now() / 1000),
    tags:       [['u', url], ['method', method]],
    content:    '',
  }, sk)
  return btoa(JSON.stringify(event))
}

async function npubcashGet(nsec, path) {
  const url   = `${NPUBCASH_BASE}${path}`
  const token = await buildNip98Auth(nsec, url, 'GET')
  const res   = await fetch(url, {
    headers: { 'Authorization': `Nostr ${token}`, 'Content-Type': 'application/json' }
  })
  return res.json()
}

// ── Public API ────────────────────────────────
export async function getNpubcashBalance(nsec) {
  try {
    const data = await npubcashGet(nsec, '/api/v1/balance')
    return data?.data || 0
  } catch { return 0 }
}

export async function claimNpubcashToken(nsec) {
  try {
    const data = await npubcashGet(nsec, '/api/v1/claim')
    if (data?.error) return { error: data.error }
    if (data?.data?.token) return { token: data.data.token }
    return { error: 'No token received' }
  } catch(e) { return { error: e.message } }
}

export async function getLightningAddress(nsec) {
  try {
    const { data: sk } = nip19.decode(nsec.trim())
    // Get public key from secret key
    const { getPublicKey } = await import('nostr-tools/pure')
    const pk   = getPublicKey(sk)
    const npub = nip19.npubEncode(pk)

    // Try to get custom username from npub.cash
    try {
      const url   = `${NPUBCASH_BASE}/api/v1/info`
      const token = await buildNip98Auth(nsec, url, 'GET')
      const res   = await fetch(url, { headers: { 'Authorization': `Nostr ${token}` } })
      const info  = await res.json()
      if (info?.username) return `${info.username}@npub.cash`
      if (info?.npub)     return `${info.npub}@npub.cash`
    } catch {}

    return `${npub}@npub.cash`
  } catch(e) {
    // Fallback: use stored npub
    const npub = localStorage.getItem('bitsoko_npub')
    return npub ? `${npub}@npub.cash` : null
  }
}

// ── Hook ──────────────────────────────────────
export function useNpubcash({ nsec, enabled = false, onTokenClaimed }) {
  const [lightningAddress, setLightningAddress] = useState(
    () => {
      const npub = localStorage.getItem('bitsoko_npub')
      return npub ? `${npub}@npub.cash` : ''
    }
  )
  const [balance,  setBalance]  = useState(0)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)

  // Load proper LN address on mount
  useEffect(() => {
    if (!nsec || !enabled) return
    getLightningAddress(nsec).then(addr => { if (addr) setLightningAddress(addr) }).catch(() => {})
  }, [nsec, enabled])

  const checkAndClaim = useCallback(async () => {
    if (!nsec || !enabled || loading) return
    try {
      setLoading(true); setError(null)
      const bal = await getNpubcashBalance(nsec)
      setBalance(bal)
      if (bal > 0) {
        console.log(`[bitsoko] npub.cash balance: ${bal} sats — claiming…`)
        const result = await claimNpubcashToken(nsec)
        if (result.error) { setError(result.error); return }
        if (result.token) {
          setBalance(0)
          onTokenClaimed?.(result.token, bal)
        }
      }
    } catch(e) { setError(e.message) }
    finally    { setLoading(false) }
  }, [nsec, enabled, loading, onTokenClaimed])

  const manualClaim = useCallback(async () => {
    if (!nsec || !enabled) return { success: false, error: 'Not enabled' }
    try {
      setLoading(true); setError(null)
      const result = await claimNpubcashToken(nsec)
      if (result.error) return { success: false, error: result.error }
      if (result.token) { setBalance(0); return { success: true, token: result.token } }
      return { success: false, error: 'No token received' }
    } catch(e) { return { success: false, error: e.message } }
    finally    { setLoading(false) }
  }, [nsec, enabled])

  useEffect(() => {
    if (!enabled || !nsec) return
    checkAndClaim()
    const interval = setInterval(checkAndClaim, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [enabled, nsec])

  return { lightningAddress, balance, loading, error, manualClaim, refresh: checkAndClaim }
}

