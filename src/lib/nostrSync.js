// ─────────────────────────────────────────────
// nostrSync.js — Bitsoko Nostr sync layer
//
// Pattern based on Shopstr (shopstr-eng/shopstr) open source:
//   1. Load IndexedDB instantly → show UI
//   2. Fetch kind:30402 from relays → merge (newer created_at wins)
//   3. Cache back to IndexedDB
//   4. Use user's NIP-65 relay list (kind:10002) for writes
//
// EVENT KINDS:
//   kind:0     — Profile (NIP-01)
//   kind:4     — Encrypted DM / order (NIP-04)
//   kind:5     — Deletion (NIP-09)
//   kind:10002 — User relay list (NIP-65)
//   kind:30402 — Classified listing (NIP-99) ← PRIMARY
//   kind:30403 — Draft/deleted listing (NIP-99)
//
// PRODUCT TAGS (kind:30402):
//   ['d',            id]           — NIP-33 stable key
//   ['title',        name]
//   ['summary',      tagline]
//   ['published_at', unixTs]
//   ['location',     location]
//   ['price',        sats, 'SATS']
//   ['image',        url]          — one per image
//   ['t',            category]     — one per category
//   ['status',       'active'|'sold']
//   ['quantity',     qty]
//   ['shipping',     name, sats, 'SATS', regions]
// ─────────────────────────────────────────────

import { SimplePool }    from 'nostr-tools/pool'
import { finalizeEvent } from 'nostr-tools/pure'
import { nip04, nip19 } from 'nostr-tools'
import {
  saveProduct, saveProfile,
  saveOrder, getProductById, deleteProduct,
} from './db'

// ── Default fallback relays ───────────────────
// Used only if user has no NIP-65 relay list.
// These are free public relays confirmed to index kind:30402.
// Shopstr uses: nos.lol, relay.damus.io, sendit.nosflare.com
export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://relay.nostr.bg',
  'wss://nostr-pub.wellorder.net',
  'wss://relay.current.fyi',
]

// Runtime relay list — populated from user's kind:10002 on login
// Falls back to DEFAULT_RELAYS if not set
let _userRelays      = []
let _userWriteRelays = []

export function setUserRelays(relays, writeRelays) {
  _userRelays      = relays.length      ? relays      : DEFAULT_RELAYS
  _userWriteRelays = writeRelays.length ? writeRelays : relays.length ? relays : DEFAULT_RELAYS
  console.log('[bitsoko] relay list updated —', _userRelays.length, 'read,', _userWriteRelays.length, 'write')
}

export function getReadRelays()  { return _userRelays.length      ? _userRelays      : DEFAULT_RELAYS }
export function getWriteRelays() { return _userWriteRelays.length ? _userWriteRelays : DEFAULT_RELAYS }

// Keep RELAYS export for backwards compat
export const RELAYS = DEFAULT_RELAYS

// ── Nostr event kinds ─────────────────────────
export const KINDS = {
  PROFILE:       0,
  NOTE:          1,
  DM:            4,
  DELETE:        5,
  RELAY_LIST:    10002,
  LISTING:       30402,
  LISTING_DRAFT: 30403,
  AUTH:          27235,
}

// ── Singleton pool ────────────────────────────
let _pool    = null
let _liveSub = null

export function getPool() {
  if (!_pool) _pool = new SimplePool()
  return _pool
}

// ── Key helpers ───────────────────────────────
export function getSecretKey() {
  const nsec = localStorage.getItem('bitsoko_nsec')
  if (!nsec) throw new Error('No secret key — please log in')
  const { type, data } = nip19.decode(nsec.trim())
  if (type !== 'nsec') throw new Error('Invalid key format')
  return data
}

export function getPublicKeyHex() {
  const npub = localStorage.getItem('bitsoko_npub')
  if (!npub) throw new Error('No public key found')
  const { data } = nip19.decode(npub.trim())
  return data
}

// ── Stable dedup key (same as Shopstr's getEventKey) ──
// For kind:30402: pubkey + d-tag = identity
// Two events same pubkey+d = same product, newer wins
function stableKey(event) {
  const dTag = (event.tags || []).find(t => t[0] === 'd')?.[1]
  return dTag ? `${event.pubkey}:${dTag}` : event.id
}

// ── Deletion guard ────────────────────────────
function isDeleted(event) {
  const tags   = event.tags || []
  const status = tags.find(t => t[0] === 'status')?.[1]
  if (status === 'deleted') return true
  if (tags.some(t => t[0] === 't' && t[1] === 'deleted')) return true
  if (event.kind === KINDS.LISTING_DRAFT) return true
  return false
}

// ─────────────────────────────────────────────
// FETCH USER'S NIP-65 RELAY LIST (kind:10002)
// Call this right after login so publish goes to
// the user's own relays — same pattern Shopstr uses.
// ─────────────────────────────────────────────
export async function fetchAndSetUserRelays(pubkeyHex) {
  try {
    const pool = getPool()
    const sub  = pool.subscribe(
      DEFAULT_RELAYS,
      [{ kinds: [KINDS.RELAY_LIST], authors: [pubkeyHex], limit: 1 }],
      {
        onevent(event) {
          const tags       = event.tags || []
          const readRelays  = tags.filter(t => t[0] === 'r' && (!t[2] || t[2] === 'read')).map(t => t[1]).filter(Boolean)
          const writeRelays = tags.filter(t => t[0] === 'r' && (!t[2] || t[2] === 'write')).map(t => t[1]).filter(Boolean)
          const allRelays   = tags.filter(t => t[0] === 'r' && !t[2]).map(t => t[1]).filter(Boolean)

          const finalRead  = readRelays.length  ? readRelays  : allRelays
          const finalWrite = writeRelays.length ? writeRelays : allRelays
          setUserRelays(finalRead, finalWrite)
          sub.close()
        },
        oneose() { sub.close() },
      }
    )
    setTimeout(() => { try { sub.close() } catch {} }, 5000)
  } catch(e) {
    console.warn('[bitsoko] could not fetch relay list:', e)
  }
}

// ─────────────────────────────────────────────
// FETCH & SEED
// Shopstr pattern:
//   1. Load IndexedDB (instant UI) — done in Home.jsx already
//   2. Fetch { kinds: [30402] } from relays — no hashtag filter
//   3. Merge: newer created_at wins for same pubkey:d-tag key
//   4. Save merged result to IndexedDB
//
// FIX 2 — "broader relay list":
//   Read relays = user's NIP-65 relays UNION DEFAULT_RELAYS
//   so we always hit the big public relays AND the user's own
//   relays where their listings were published.
//
// FIX 3 — real merge logic:
//   seenMap = Map<stableKey, created_at>
//   On duplicate key: only process if event is NEWER than what we saw
//   This means the most recent version of each listing wins,
//   regardless of relay delivery order.
// ─────────────────────────────────────────────
export function fetchAndSeed({ onProduct, onProfile, onDone } = {}) {
  return new Promise((resolve) => {
    const pool = getPool()

    // FIX 2: union of user relays + defaults so we never miss own listings
    const readRelays = getReadRelays()
    const relays     = [...new Set([...readRelays, ...DEFAULT_RELAYS])]

    // FIX 3: Map<stableKey, created_at> — newer event always wins
    const seenMap        = new Map()   // key → created_at of best version seen
    const profilePubkeys = new Set()

    console.log('[bitsoko] fetchAndSeed —', relays.length, 'relays, filter: { kinds: [30402] }')

    const sub = pool.subscribe(
      relays,
      [
        { kinds: [KINDS.LISTING],       limit: 500 },
        { kinds: [KINDS.LISTING_DRAFT], limit: 200 },
      ],
      {
        async onevent(event) {
          const key      = stableKey(event)
          const existing = seenMap.get(key)

          // FIX 3: skip if we already have a newer version of this listing
          if (existing !== undefined && event.created_at <= existing) return
          seenMap.set(key, event.created_at)

          if (isDeleted(event)) {
            await deleteProduct(key)
            return
          }

          if (event.kind === KINDS.LISTING) {
            await saveProduct(event)          // IndexedDB upsert — newer wins
            profilePubkeys.add(event.pubkey)
            onProduct?.(event)
          }
        },

        async oneose() {
          console.log(`[bitsoko] EOSE — ${seenMap.size} unique listings from ${relays.length} relays`)
          sub.close()

          // FIX 2 FALLBACK: if still 0 results, fetch by own pubkey explicitly
          // Handles case: user just published, relays haven't propagated globally yet
          if (seenMap.size === 0) {
            console.log('[bitsoko] 0 events globally — running own-pubkey fallback')
            const npub = localStorage.getItem('bitsoko_npub')
            if (npub) {
              try {
                const { data: myPubkey } = nip19.decode(npub)
                // Use write relays (where we published) for the fallback
                const writeRelays = [...new Set([...getWriteRelays(), ...DEFAULT_RELAYS])]
                const fallbackSub = pool.subscribe(
                  writeRelays,
                  [{ kinds: [KINDS.LISTING], authors: [myPubkey], limit: 100 }],
                  {
                    async onevent(e) {
                      const key      = stableKey(e)
                      const existing = seenMap.get(key)
                      if (existing !== undefined && e.created_at <= existing) return
                      seenMap.set(key, e.created_at)
                      if (isDeleted(e)) { await deleteProduct(key); return }
                      await saveProduct(e)
                      profilePubkeys.add(e.pubkey)
                      onProduct?.(e)
                      console.log('[bitsoko] fallback ✓', key)
                    },
                    oneose() { fallbackSub.close() },
                  }
                )
                setTimeout(() => { try { fallbackSub.close() } catch {} }, 6000)
              } catch(e) { console.warn('[bitsoko] fallback error:', e) }
            }
          }

          // Fetch kind:0 profiles for all sellers we found
          if (profilePubkeys.size > 0) {
            const pubkeyArr = [...profilePubkeys]
            const profSub   = pool.subscribe(
              relays,
              [{ kinds: [KINDS.PROFILE], authors: pubkeyArr, limit: pubkeyArr.length * 2 }],
              {
                async onevent(e) {
                  await saveProfile(e.pubkey, e.content)
                  onProfile?.(e)
                },
                oneose() {
                  try { profSub.close() } catch {}
                  onDone?.()
                  resolve()
                },
              }
            )
            setTimeout(() => { try { profSub.close() } catch {} onDone?.(); resolve() }, 8000)
          } else {
            onDone?.()
            resolve()
          }
        },
      }
    )

    setTimeout(() => { try { sub.close() } catch {} resolve() }, 15000)
  })
}

// ─────────────────────────────────────────────
// LIVE SYNC — persistent WebSocket for new listings
// ─────────────────────────────────────────────
export function startSync({ onProduct, onProfile } = {}) {
  stopSync()

  const pool  = getPool()
  const since = Math.floor(Date.now() / 1000)
  const relays = getReadRelays()

  _liveSub = pool.subscribe(
    relays,
    [
      { kinds: [KINDS.LISTING],       since },
      { kinds: [KINDS.LISTING_DRAFT], since },
    ],
    {
      async onevent(event) {
        const key = stableKey(event)
        if (isDeleted(event)) {
          await deleteProduct(key)
          onProduct?.({ ...event, _deleted: true, _stableId: key })
          return
        }
        if (event.kind === KINDS.LISTING) {
          await saveProduct(event)
          fetchProfileIfMissing(event.pubkey)
          onProduct?.(event)
        }
      },
      oneose() {},
    }
  )

  return _liveSub
}

export function stopSync() {
  if (_liveSub) {
    try { _liveSub.close() } catch {}
    _liveSub = null
  }
}

async function fetchProfileIfMissing(pubkey) {
  const pool  = getPool()
  const relays = getReadRelays()
  const sub   = pool.subscribe(
    relays,
    [{ kinds: [KINDS.PROFILE], authors: [pubkey], limit: 1 }],
    {
      async onevent(e) { await saveProfile(e.pubkey, e.content) },
      oneose() { sub.close() },
    }
  )
  setTimeout(() => { try { sub.close() } catch {} }, 5000)
}

// ─────────────────────────────────────────────
// PUBLISH LISTING (kind:30402 — NIP-99)
// Publishes to user's OWN write relays (kind:10002)
// so the listing lands where THEY can receive it.
// Falls back to DEFAULT_RELAYS.
// ─────────────────────────────────────────────
export async function publishProduct({
  name,
  description = '',
  summary     = '',
  price       = 0,
  images      = [],
  quantity    = -1,
  categories  = [],
  shipping    = [],
  location    = 'Nairobi, Kenya',
  status      = 'active',
  productId   = null,
}) {
  const sk      = getSecretKey()
  const pk      = getPublicKeyHex()
  const now     = Math.floor(Date.now() / 1000)
  const id      = productId || `bitsoko-${now}-${pk.slice(0, 8)}`
  const relays  = getWriteRelays()

  const tags = [
    ['d',            id],
    ['title',        name],
    ['summary',      summary || name],
    ['published_at', now.toString()],
    ['location',     location],
    ['price',        price.toString(), 'SATS'],
    ['status',       status],
    ['quantity',     quantity.toString()],
    ['t',            'bitsoko'],
    ['t',            'bitcoin'],
    ...images.map(url => ['image',    url]),
    ...categories.map(c => ['t',      c.toLowerCase()]),
    ...shipping.map(s  => ['shipping', s.name || '', (s.cost || 0).toString(), 'SATS', s.regions || '']),
  ]

  const event = finalizeEvent({
    kind:       KINDS.LISTING,
    created_at: now,
    tags,
    content:    description,
  }, sk)

  // Save to IndexedDB immediately (optimistic UI)
  await saveProduct(event)

  // Publish to ALL write relays — same as Shopstr's approach
  console.log('[bitsoko] publishing to', relays.length, 'relays...')
  const results = await Promise.allSettled(
    relays.map(relay =>
      Promise.race([
        getPool().publish([relay], event)
          .then(() => console.log('[bitsoko] ✓', relay))
          .catch(e  => { throw new Error(`${relay}: ${e?.message || e}`) }),
        new Promise((_, rej) => setTimeout(() => rej(new Error(`${relay}: timeout`)), 8000)),
      ])
    )
  )

  const ok   = results.filter(r => r.status === 'fulfilled').length
  const fail = results.filter(r => r.status === 'rejected').map(r => r.reason?.message)
  console.log(`[bitsoko] published to ${ok}/${relays.length} relays`)
  if (fail.length) console.warn('[bitsoko] failed relays:', fail)

  return event
}

// ─────────────────────────────────────────────
// DELETE LISTING (two-layer)
// ─────────────────────────────────────────────
export async function deleteProductEvent(productId) {
  const sk      = getSecretKey()
  const product = await getProductById(productId)
  if (!product) throw new Error('Product not found in local DB')

  const dTag   = (product.tags || []).find(t => t[0] === 'd')?.[1] || productId
  const relays = getWriteRelays()

  // Layer 1: NIP-09 kind:5
  const kind5 = finalizeEvent({
    kind:       KINDS.DELETE,
    created_at: Math.floor(Date.now() / 1000),
    tags:       [['e', product.event_id || product.id]],
    content:    'deleted',
  }, sk)
  try { await Promise.any(getPool().publish(relays, kind5)) } catch {}

  // Layer 2: kind:30403 tombstone
  const tombstone = finalizeEvent({
    kind:       KINDS.LISTING_DRAFT,
    created_at: Math.floor(Date.now() / 1000) + 1,
    tags: [
      ['d',      dTag],
      ['title',  product.name || ''],
      ['status', 'deleted'],
      ['t',      'bitsoko'],
    ],
    content: '',
  }, sk)

  await deleteProduct(productId)
  await Promise.any(getPool().publish(relays, tombstone))
  return tombstone
}

// ─────────────────────────────────────────────
// PUBLISH ORDER (kind:4 NIP-04 DM)
// ─────────────────────────────────────────────
export async function publishOrder({ sellerPubkey, product, quantity, message = '' }) {
  const sk     = getSecretKey()
  const pk     = getPublicKeyHex()
  const relays = getWriteRelays()

  const orderContent = {
    id:         `order-${Date.now()}`,
    type:       1,
    name:       localStorage.getItem('bitsoko_display_name') || 'Buyer',
    address:    '',
    message,
    items:      [{ product_id: product.id, quantity }],
    created_at: Math.floor(Date.now() / 1000),
  }

  const encrypted = await nip04.encrypt(sk, sellerPubkey, JSON.stringify(orderContent))

  const event = finalizeEvent({
    kind:       KINDS.DM,
    created_at: Math.floor(Date.now() / 1000),
    tags:       [['p', sellerPubkey]],
    content:    encrypted,
  }, sk)

  await saveOrder({
    id: event.id, pubkey: pk, seller: sellerPubkey,
    product_id: product.id, product_name: product.name,
    quantity, price: product.price * quantity,
    status: 'pending', created_at: event.created_at, message,
  })

  await Promise.any(getPool().publish(relays, event))
  return event
}

// ─────────────────────────────────────────────
// NIP-98 AUTH (nostr.build uploads)
// ─────────────────────────────────────────────
export async function buildNip98Auth(uploadUrl, method = 'POST') {
  const sk = getSecretKey()
  const authEvent = finalizeEvent({
    kind:       KINDS.AUTH,
    created_at: Math.floor(Date.now() / 1000),
    tags:       [['u', uploadUrl], ['method', method]],
    content:    '',
  }, sk)
  return 'Nostr ' + btoa(JSON.stringify(authEvent))
}

// ─────────────────────────────────────────────
// IMAGE UPLOAD — nostr.build → nostrcheck.me → legacy
// ─────────────────────────────────────────────
export async function uploadImage(file) {
  const PROVIDERS = [
    { name: 'nostr.build',       url: 'https://nostr.build/api/v2/upload/files',  field: 'fileToUpload', getUrl: j => j?.data?.[0]?.url,             needsAuth: true  },
    { name: 'nostrcheck.me',     url: 'https://nostrcheck.me/api/v2/media',        field: 'uploadedfile', getUrl: j => j?.url || j?.data?.url,         needsAuth: true  },
    { name: 'nostr.build legacy',url: 'https://nostr.build/api/upload/image',      field: 'fileToUpload', getUrl: j => j?.data?.display_url||j?.data?.url, needsAuth: false },
  ]

  let lastError = 'All upload providers failed'
  for (const p of PROVIDERS) {
    try {
      const formData = new FormData()
      formData.append(p.field, file)
      const headers = {}
      if (p.needsAuth) { try { headers['Authorization'] = await buildNip98Auth(p.url) } catch {} }
      const res = await fetch(p.url, { method: 'POST', headers, body: formData })
      if (!res.ok) { lastError = `${p.name}: HTTP ${res.status}`; continue }
      const json = await res.json()
      const url  = p.getUrl(json)
      if (url) return url
      lastError = `${p.name}: no URL in response`
    } catch(e) { lastError = `${p.name}: ${e.message}` }
  }
  throw new Error(lastError)
}

