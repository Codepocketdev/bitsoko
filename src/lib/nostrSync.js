// ─────────────────────────────────────────────
// nostrSync.js — Bitsoko Nostr sync layer
// ─────────────────────────────────────────────

import { SimplePool }    from 'nostr-tools/pool'
import { finalizeEvent } from 'nostr-tools/pure'
import { nip04, nip19 } from 'nostr-tools'
import {
  saveProduct, saveProfile,
  saveOrder, getProductById, deleteProduct,
} from './db'

export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://relay.nostr.bg',
  'wss://nostr-pub.wellorder.net',
  'wss://relay.current.fyi',
]

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

// ── Bitsoko-only toggle ───────────────────────
// true  = only show products tagged ['t','bitsoko'] — African circular economy merchants
// false = global Nostr marketplace (all kind:30402 events like Shopstr)
export function getBitsokoOnly() {
  return localStorage.getItem('bitsoko_filter_mode') !== 'global'
}
export function setBitsokoOnly(val) {
  localStorage.setItem('bitsoko_filter_mode', val ? 'bitsoko' : 'global')
}

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

let _pool    = null
let _liveSub = null

export function getPool() {
  if (!_pool) _pool = new SimplePool()
  return _pool
}

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

function stableKey(event) {
  const dTag = (event.tags || []).find(t => t[0] === 'd')?.[1]
  return dTag ? `${event.pubkey}:${dTag}` : event.id
}

function isDeleted(event) {
  const tags   = event.tags || []
  const status = tags.find(t => t[0] === 'status')?.[1]
  if (status === 'deleted') return true
  if (tags.some(t => t[0] === 't' && t[1] === 'deleted')) return true
  if (event.kind === KINDS.LISTING_DRAFT) return true
  return false
}

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
          setUserRelays(
            readRelays.length  ? readRelays  : allRelays,
            writeRelays.length ? writeRelays : allRelays
          )
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

export async function fetchAndSeed({ onProduct, onProfile, onDone } = {}) {
  const pool   = getPool()
  const relays = [...new Set([...getReadRelays(), ...DEFAULT_RELAYS])]

  try {
    // Filter based on user preference — Bitsoko merchants only or global
    const bitsokoOnly = getBitsokoOnly()
    const listingFilter = bitsokoOnly
      ? { kinds: [KINDS.LISTING],       '#t': ['bitsoko'], limit: 500 }
      : { kinds: [KINDS.LISTING],                          limit: 500 }
    const draftFilter = bitsokoOnly
      ? { kinds: [KINDS.LISTING_DRAFT], '#t': ['bitsoko'], limit: 200 }
      : { kinds: [KINDS.LISTING_DRAFT],                    limit: 200 }

    const [listingEvents, draftEvents] = await Promise.all([
      pool.querySync(relays, listingFilter).catch(() => []),
      pool.querySync(relays, draftFilter).catch(() => []),
    ])

    const mergedMap = new Map()
    for (const event of [...listingEvents, ...draftEvents]) {
      const key      = stableKey(event)
      const existing = mergedMap.get(key)
      if (!existing || event.created_at >= existing.created_at) {
        mergedMap.set(key, event)
      }
    }

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

    if (mergedMap.size === 0) {
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
            }
          }
        }
      } catch(e) { console.warn('[bitsoko] fallback error:', e) }
    }

    if (profilePubkeys.size > 0) {
      const pubkeyArr = [...profilePubkeys]
      const profiles  = await pool.querySync(
        relays,
        { kinds: [KINDS.PROFILE], authors: pubkeyArr, limit: pubkeyArr.length * 2 }
      ).catch(() => [])
      for (const e of profiles) {
        await saveProfile(e.pubkey, JSON.parse(e.content), e.created_at)
        onProfile?.(e)
      }
    }
  } catch(e) {
    console.error('[bitsoko] fetchAndSeed error:', e)
  }

  onDone?.()
}

export function startSync({ onProduct, onProfile } = {}) {
  stopSync()
  const pool   = getPool()
  const since  = Math.floor(Date.now() / 1000)
  const relays = [...new Set([...getReadRelays(), ...DEFAULT_RELAYS])]

  _liveSub = pool.subscribe(
    relays,
    getBitsokoOnly()
      ? [
          { kinds: [KINDS.LISTING],       '#t': ['bitsoko'], since },
          { kinds: [KINDS.LISTING_DRAFT], '#t': ['bitsoko'], since },
        ]
      : [
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
      async onevent(e) { await saveProfile(e.pubkey, JSON.parse(e.content), e.created_at) },
      oneose() { sub.close() },
    }
  )
  setTimeout(() => { try { sub.close() } catch {} }, 5000)
}

// ─────────────────────────────────────────────
// PUBLISH LISTING (kind:30402 — NIP-99)
//
// FIX 1 — Duplicate listing on edit:
//   productId passed from MyShop is the stableId (pubkey:d-tag).
//   Using that whole string as the d tag creates a NEW product.
//   Fix: if productId looks like a stableId (contains ':'), extract
//   just the d-tag portion after the first pubkey segment.
//
// FIX 2 — Category filter never matches:
//   Was doing c.toLowerCase() on categories before tagging.
//   db.js saveProduct reads t-tags back as-is into p.categories.
//   Home/Explore filter against full-name strings like 'Electronics'.
//   Fix: store categories exactly as provided — no lowercasing.
// ─────────────────────────────────────────────
export async function publishProduct({
  name,
  description  = '',
  summary      = '',
  price        = 0,
  images       = [],
  quantity     = -1,
  categories   = [],
  shipping     = [],
  location     = 'Nairobi, Kenya',
  status       = 'active',
  productId    = null,   // stableId from db (pubkey:d-tag) or null for new
  isDeal       = false,
  originalPrice = 0,
}) {
  const sk  = getSecretKey()
  const pk  = getPublicKeyHex()
  const now = Math.floor(Date.now() / 1000)

  // FIX 1: extract raw d-tag from stableId
  // stableId format = "pubkeyHex:d-tag-value"
  // pubkeyHex is always 64 hex chars, so split at char 65 (the colon)
  let dTag
  if (productId) {
    if (productId.length > 65 && productId[64] === ':') {
      // It's a stableId — extract the d-tag portion after pubkey:
      dTag = productId.slice(65)
    } else {
      // It's already a raw d-tag (legacy or manually set)
      dTag = productId
    }
  } else {
    dTag = `bitsoko-${now}-${pk.slice(0, 8)}`
  }

  const relays = getWriteRelays()

  const tags = [
    ['d',            dTag],
    ['title',        name],
    ['summary',      summary || name],
    ['published_at', now.toString()],
    ['location',     location],
    ['price',        price.toString(), 'SATS'],
    ['status',       status],
    ['quantity',     quantity.toString()],
    ['t',            'bitsoko'],
    ['t',            'bitcoin'],
    // Deduplicate categories (case-insensitive) before tagging
    // Prevents duplicate tags when editing a product multiple times
    ...([...new Set(categories.map(c => c.trim()).filter(Boolean))]).map(c => ['t', c]),
    ...images.map(url      => ['image',    url]),
    ...shipping.map(s      => ['shipping', s.name || '', (s.cost || 0).toString(), 'SATS', s.regions || '']),
  ]

  // Deal tags — adds to Deals page relay filter
  if (isDeal) {
    tags.push(['t', 'deal'])
    tags.push(['t', 'sale'])
    if (originalPrice > 0) {
      tags.push(['original_price', originalPrice.toString(), 'SATS'])
    }
  }

  const event = finalizeEvent({
    kind:       KINDS.LISTING,
    created_at: now,
    tags,
    content:    description,
  }, sk)

  await saveProduct(event)

  const publishRelays = [...new Set([...relays, ...DEFAULT_RELAYS])]
  console.log('[bitsoko] publishing to', publishRelays.length, 'relays, d-tag:', dTag)

  const results = await Promise.allSettled(
    publishRelays.map(relay =>
      Promise.race([
        Promise.all(getPool().publish([relay], event))
          .then(() => console.log('[bitsoko] ✓', relay))
          .catch(e  => { throw new Error(`${relay}: ${e?.message || e}`) }),
        new Promise((_, rej) => setTimeout(() => rej(new Error(`${relay}: timeout`)), 8000)),
      ])
    )
  )

  const ok = results.filter(r => r.status === 'fulfilled').length
  console.log(`[bitsoko] published to ${ok}/${publishRelays.length} relays`)

  return event
}

// ─────────────────────────────────────────────
// DELETE LISTING
// ─────────────────────────────────────────────
export async function deleteProductEvent(productId) {
  const sk      = getSecretKey()
  const product = await getProductById(productId)
  if (!product) throw new Error('Product not found in local DB')

  const dTag   = (product.tags || []).find(t => t[0] === 'd')?.[1] || productId
  const relays = [...new Set([...getWriteRelays(), ...DEFAULT_RELAYS])]

  // NIP-09 kind:5 deletion
  const kind5 = finalizeEvent({
    kind:       KINDS.DELETE,
    created_at: Math.floor(Date.now() / 1000),
    tags:       [['e', product.event_id || product.id]],
    content:    'deleted',
  }, sk)
  try { await Promise.any(getPool().publish(relays, kind5).map(p => p.catch(e => { throw e }))) } catch {}

  // kind:30403 tombstone
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
  await Promise.any(getPool().publish(relays, tombstone).map(p => p.catch(e => { throw e })))
  return tombstone
}

// ─────────────────────────────────────────────
// PUBLISH ORDER (kind:4 NIP-04 DM)
//
// FIX 3 — Human-readable order message
// Was sending raw JSON that sellers couldn't read.
// Now sends a clean text format buyers and sellers both understand.
// ─────────────────────────────────────────────
export async function publishOrder({ sellerPubkey, product, quantity, message = '' }) {
  const sk      = getSecretKey()
  const pk      = getPublicKeyHex()
  const relays  = getWriteRelays()
  const buyer   = localStorage.getItem('bitsoko_display_name') || 'A buyer'

  const satsToKsh = (sats) => {
    const ksh = (sats / 100_000_000) * 13_000_000
    return ksh >= 1000 ? `KSh ${(ksh/1000).toFixed(1)}k` : `KSh ${Math.round(ksh)}`
  }

  const total     = product.price * quantity
  const totalFiat = satsToKsh(total)

  // Human-readable order message — no JSON
  const orderText = [
    `🛒 New Order from Bitsoko`,
    ``,
    `Buyer: ${buyer}`,
    ``,
    `Product: ${product.name}`,
    `Quantity: ${quantity}`,
    `Price: ${product.price.toLocaleString()} sats${quantity > 1 ? ` × ${quantity}` : ''}`,
    `Total: ${total.toLocaleString()} sats (≈ ${totalFiat})`,
    message.trim() ? `\nNote from buyer:\n${message.trim()}` : '',
    ``,
    `Sent via Bitsoko ⚡ — reply to confirm`,
  ].filter(line => line !== undefined).join('\n')

  const encrypted = await nip04.encrypt(sk, sellerPubkey, orderText)

  const event = finalizeEvent({
    kind:       KINDS.DM,
    created_at: Math.floor(Date.now() / 1000),
    tags:       [['p', sellerPubkey]],
    content:    encrypted,
  }, sk)

  await saveOrder({
    id:           event.id,
    pubkey:       pk,
    seller_pubkey: sellerPubkey,
    product_id:   product.id,
    product_name: product.name,
    product:      product,
    quantity,
    price:        total,
    status:       'pending',
    created_at:   event.created_at,
    message,
  })

  const publishRelays = [...new Set([...relays, ...DEFAULT_RELAYS])]
  await Promise.any(getPool().publish(publishRelays, event).map(p => p.catch(e => { throw e })))
  return event
}

// ─────────────────────────────────────────────
// NIP-98 AUTH
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
// IMAGE UPLOAD
// ─────────────────────────────────────────────
export async function uploadImage(file) {
  const PROVIDERS = [
    { name: 'nostr.build',        url: 'https://nostr.build/api/v2/upload/files',   field: 'fileToUpload', getUrl: j => j?.data?.[0]?.url,                   needsAuth: true  },
    { name: 'nostrcheck.me',      url: 'https://nostrcheck.me/api/v2/media',         field: 'uploadedfile', getUrl: j => j?.url || j?.data?.url,               needsAuth: true  },
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

