// ─────────────────────────────────────────────
// nostrSync.js — Bitsoko Nostr sync layer
//
// Pattern based on Shopstr (shopstr-eng/shopstr) open source:
//   1. Load IndexedDB instantly → show UI
//   2. Fetch kind:30402 from relays — NO authors filter (global feed)
//   3. Merge: newer created_at wins for same pubkey:d-tag key
//   4. Cache back to IndexedDB
//   5. Use user's NIP-65 relay list (kind:10002) for writes
//
// KEY FIX: fetchAndSeed now uses pool.querySync() not pool.subscribe()
//   subscribe() fires EOSE before all relays respond → missed events
//   querySync() awaits ALL relays properly → guaranteed results
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
export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://relay.nostr.bg',
  'wss://nostr-pub.wellorder.net',
  'wss://relay.current.fyi',
]

// Runtime relay list — populated from user's kind:10002 on login
let _userRelays      = []
let _userWriteRelays = []

export function setUserRelays(relays, writeRelays) {
  _userRelays      = relays.length      ? relays      : DEFAULT_RELAYS
  _userWriteRelays = writeRelays.length ? writeRelays : relays.length ? relays : DEFAULT_RELAYS
  console.log('[bitsoko] relay list updated —', _userRelays.length, 'read,', _userWriteRelays.length, 'write')
}

export function getReadRelays()  { return _userRelays.length      ? _userRelays      : DEFAULT_RELAYS }
export function getWriteRelays() { return _userWriteRelays.length ? _userWriteRelays : DEFAULT_RELAYS }

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
// For kind:30402: pubkey + d-tag = product identity
// Same pubkey+d = same product, newer created_at wins
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
// ─────────────────────────────────────────────
export async function fetchAndSetUserRelays(pubkeyHex) {
  try {
    const pool = getPool()
    const sub  = pool.subscribe(
      DEFAULT_RELAYS,
      [{ kinds: [KINDS.RELAY_LIST], authors: [pubkeyHex], limit: 1 }],
      {
        onevent(event) {
          const tags        = event.tags || []
          const readRelays  = tags.filter(t => t[0] === 'r' && (!t[2] || t[2] === 'read')).map(t => t[1]).filter(Boolean)
          const writeRelays = tags.filter(t => t[0] === 'r' && (!t[2] || t[2] === 'write')).map(t => t[1]).filter(Boolean)
          const allRelays   = tags.filter(t => t[0] === 'r' && !t[2]).map(t => t[1]).filter(Boolean)
          const finalRead   = readRelays.length  ? readRelays  : allRelays
          const finalWrite  = writeRelays.length ? writeRelays : allRelays
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
//
// THE FIX: use pool.querySync() not pool.subscribe()
//
// pool.subscribe() fires oneose callback before all relays have
// responded — especially slow or freshly-connected relays. This
// caused cross-user products to be invisible and cleared-data
// to never repopulate, because those events arrived after EOSE.
//
// pool.querySync() properly awaits ALL relays and returns a
// complete array — same fix that solved the Profile page issue.
//
// Shopstr strategy:
//   filter = { kinds: [30402] }  ← NO authors filter (global feed)
//   merge  = newer created_at wins for same pubkey:d-tag key
//   cache  = save everything to IndexedDB for next load
// ─────────────────────────────────────────────
export async function fetchAndSeed({ onProduct, onProfile, onDone } = {}) {
  const pool = getPool()

  // Always use union of user relays + DEFAULT_RELAYS
  // This ensures we hit public relays AND the user's own relays
  const relays = [...new Set([...getReadRelays(), ...DEFAULT_RELAYS])]

  console.log('[bitsoko] fetchAndSeed —', relays.length, 'relays, filter: { kinds: [30402] }')

  try {
    // ── Step 1: Fetch ALL listings from ALL relays
    // querySync awaits every relay properly — no missed events
    const [listingEvents, draftEvents] = await Promise.all([
      pool.querySync(relays, { kinds: [KINDS.LISTING],       limit: 500 }).catch(() => []),
      pool.querySync(relays, { kinds: [KINDS.LISTING_DRAFT], limit: 200 }).catch(() => []),
    ])

    const allEvents = [...listingEvents, ...draftEvents]
    console.log(`[bitsoko] querySync returned ${allEvents.length} raw events from ${relays.length} relays`)

    // ── Step 2: Merge — newer created_at wins for same pubkey:d-tag
    // Matches Shopstr's mergedProductsMap logic exactly
    const mergedMap = new Map()
    for (const event of allEvents) {
      const key      = stableKey(event)
      const existing = mergedMap.get(key)
      if (!existing || event.created_at >= existing.created_at) {
        mergedMap.set(key, event)
      }
    }

    console.log(`[bitsoko] ${mergedMap.size} unique listings after merge`)

    // ── Step 3: Save to IndexedDB + collect seller pubkeys
    const profilePubkeys = new Set()
    for (const [key, event] of mergedMap) {
      if (isDeleted(event)) {
        await deleteProduct(key).catch(() => {})
      } else if (event.kind === KINDS.LISTING) {
        await saveProduct(event)
        profilePubkeys.add(event.pubkey)
        onProduct?.(event)
      }
    }

    // ── Step 4: If still 0 results, fallback to own pubkey on write relays
    // Handles the edge case where the user just published and global
    // relays haven't indexed it yet — fetch directly from write relays
    if (mergedMap.size === 0) {
      console.log('[bitsoko] 0 global results — running own-pubkey fallback on write relays')
      try {
        const npub = localStorage.getItem('bitsoko_npub')
        if (npub) {
          const { data: myPubkey } = nip19.decode(npub)
          const writeRelays = [...new Set([...getWriteRelays(), ...DEFAULT_RELAYS])]
          const fallback = await pool.querySync(
            writeRelays,
            { kinds: [KINDS.LISTING], authors: [myPubkey], limit: 100 }
          ).catch(() => [])

          for (const event of fallback) {
            if (!isDeleted(event)) {
              await saveProduct(event)
              profilePubkeys.add(event.pubkey)
              onProduct?.(event)
              console.log('[bitsoko] fallback ✓', stableKey(event))
            }
          }
        }
      } catch(e) { console.warn('[bitsoko] fallback error:', e) }
    }

    // ── Step 5: Fetch kind:0 profiles for all sellers we found
    if (profilePubkeys.size > 0) {
      const pubkeyArr = [...profilePubkeys]
      const profiles  = await pool.querySync(
        relays,
        { kinds: [KINDS.PROFILE], authors: pubkeyArr, limit: pubkeyArr.length * 2 }
      ).catch(() => [])

      for (const e of profiles) {
        await saveProfile(e.pubkey, e.content)
        onProfile?.(e)
      }
    }

  } catch(e) {
    console.error('[bitsoko] fetchAndSeed error:', e)
  }

  onDone?.()
}

// ─────────────────────────────────────────────
// LIVE SYNC — persistent WebSocket for new listings
// Uses union of user relays + DEFAULT_RELAYS so live
// updates work regardless of relay config state
// ─────────────────────────────────────────────
export function startSync({ onProduct, onProfile } = {}) {
  stopSync()

  const pool  = getPool()
  const since = Math.floor(Date.now() / 1000)

  // FIX: union relays same as fetchAndSeed — live sync was missing
  // public relays when user had their own relay list set
  const relays = [...new Set([...getReadRelays(), ...DEFAULT_RELAYS])]

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
  const pool   = getPool()
  const relays = [...new Set([...getReadRelays(), ...DEFAULT_RELAYS])]
  const sub    = pool.subscribe(
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
  const sk     = getSecretKey()
  const pk     = getPublicKeyHex()
  const now    = Math.floor(Date.now() / 1000)
  const id     = productId || `bitsoko-${now}-${pk.slice(0, 8)}`
  const relays = getWriteRelays()

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

  // Publish to write relays + DEFAULT_RELAYS so the listing
  // lands on public relays immediately for global visibility
  const publishRelays = [...new Set([...relays, ...DEFAULT_RELAYS])]
  console.log('[bitsoko] publishing to', publishRelays.length, 'relays...')

  const results = await Promise.allSettled(
    publishRelays.map(relay =>
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
  console.log(`[bitsoko] published to ${ok}/${publishRelays.length} relays`)
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
  const relays = [...new Set([...getWriteRelays(), ...DEFAULT_RELAYS])]

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
    { name: 'nostr.build',        url: 'https://nostr.build/api/v2/upload/files',   field: 'fileToUpload', getUrl: j => j?.data?.[0]?.url,                  needsAuth: true  },
    { name: 'nostrcheck.me',      url: 'https://nostrcheck.me/api/v2/media',         field: 'uploadedfile', getUrl: j => j?.url || j?.data?.url,              needsAuth: true  },
    { name: 'nostr.build legacy', url: 'https://nostr.build/api/upload/image',       field: 'fileToUpload', getUrl: j => j?.data?.display_url || j?.data?.url, needsAuth: false },
  ]

  let lastError = 'All upload providers failed'
  for (const p of PROVIDERS) {
    try {
      const formData = new FormData()
      formData.append(p.field, file)
      const headers = {}
      if (p.needsAuth) { try { headers['Authorization'] = await buildNip98Auth(p.url) } catch {} }
      const res  = await fetch(p.url, { method: 'POST', headers, body: formData })
      if (!res.ok) { lastError = `${p.name}: HTTP ${res.status}`; continue }
      const json = await res.json()
      const url  = p.getUrl(json)
      if (url) return url
      lastError = `${p.name}: no URL in response`
    } catch(e) { lastError = `${p.name}: ${e.message}` }
  }
  throw new Error(lastError)
}

