// ─────────────────────────────────────────────
// nostrSync.js — Bitsoko Nostr sync layer
//
// Architecture:
//   Nostr relays (WebSocket) ←→ IndexedDB ←→ React UI
//
// DELETION STRATEGY:
//   Relay-side kind:5 is unreliable — many relays ignore it.
//   So we use a two-layer approach:
//   1. Publish kind:5 (best effort)
//   2. Publish a replacement kind:30018 with ['t','deleted'] tag
//      (same 'd' tag overwrites the product on replaceable-event relays)
//   3. Mark deleted:true in IndexedDB
//   4. On every fetch/sync, filter out events with 't:deleted' tag
//      so even if the old event survives on some relay, it never shows in UI
// ─────────────────────────────────────────────

import { SimplePool }    from 'nostr-tools/pool'
import { finalizeEvent } from 'nostr-tools/pure'
import { nip04, nip19 } from 'nostr-tools'
import {
  saveProduct, saveStall, saveProfile,
  saveOrder, getProductById, deleteProduct,
} from './db'

// ── Relay list ────────────────────────────────
export const RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://relay.primal.net',
]

// ── Nostr event kinds ─────────────────────────
export const KINDS = {
  PROFILE:  0,
  NOTE:     1,
  STALL:    30017,
  PRODUCT:  30018,
  DM:       4,
  DELETE:   5,
  ZAP_REQ:  9734,
  ZAP:      9735,
  AUTH:     27235,
}

// ── Singleton pool ────────────────────────────
let _pool   = null
let _liveSub = null

export function getPool() {
  if (!_pool) _pool = new SimplePool()
  return _pool
}

// ── Key helpers ───────────────────────────────
export function getSecretKey() {
  const nsec = localStorage.getItem('bitsoko_nsec')
  if (!nsec) throw new Error('No secret key found — please log in')
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

// ── Deletion guard ────────────────────────────
// Central check used by BOTH fetchAndSeed and startSync.
// Returns true if the event should be silently dropped.
function isDeleted(event) {
  const tags = (event.tags || []).map(t => t[1] || '')
  return tags.includes('deleted')
}

// ─────────────────────────────────────────────
// FETCH & SEED
// Pull existing marketplace data from relays
// into IndexedDB on app open.
// Deleted products are filtered at source —
// they never touch IndexedDB or the UI.
// ─────────────────────────────────────────────
export function fetchAndSeed({ onProduct, onStall, onProfile, onDone } = {}) {
  return new Promise((resolve) => {
    const pool = getPool()
    const seenIds       = new Set()
    const profilePubkeys = new Set()

    const sub = pool.subscribe(
      RELAYS,
      [
        { kinds: [KINDS.PRODUCT], '#t': ['bitsoko'], limit: 200 },
        { kinds: [KINDS.STALL],   '#t': ['bitsoko'], limit: 100 },
      ],
      {
        async onevent(event) {
          if (seenIds.has(event.id)) return
          seenIds.add(event.id)

          // ── Deletion guard — drop silently ──────────────────────────────
          if (isDeleted(event)) return

          if (event.kind === KINDS.PRODUCT) {
            await saveProduct(event)
            profilePubkeys.add(event.pubkey)
            onProduct?.(event)
          }

          if (event.kind === KINDS.STALL) {
            await saveStall(event)
            profilePubkeys.add(event.pubkey)
            onStall?.(event)
          }
        },

        async oneose() {
          sub.close()

          if (profilePubkeys.size > 0) {
            const pubkeyArr = [...profilePubkeys]
            const profSub = pool.subscribe(
              RELAYS,
              [{ kinds: [KINDS.PROFILE], authors: pubkeyArr, limit: pubkeyArr.length }],
              {
                async onevent(event) {
                  await saveProfile(event.pubkey, event.content)
                  onProfile?.(event)
                },
                oneose() { profSub.close(); onDone?.(); resolve() },
              }
            )
            setTimeout(() => { try { profSub.close() } catch {} resolve() }, 8000)
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
// LIVE SYNC
// Persistent WebSocket — stays open and pipes
// new events into IndexedDB + calls back to UI.
// Same deletion guard applied here.
// ─────────────────────────────────────────────
export function startSync({ onProduct, onStall, onProfile } = {}) {
  stopSync()

  const pool  = getPool()
  const since = Math.floor(Date.now() / 1000)

  _liveSub = pool.subscribe(
    RELAYS,
    [
      { kinds: [KINDS.PRODUCT], '#t': ['bitsoko'], since },
      { kinds: [KINDS.STALL],   '#t': ['bitsoko'], since },
    ],
    {
      async onevent(event) {
        // ── Deletion guard ────────────────────────────────────────────────
        // If a replacement event arrives with ['t','deleted'], it means
        // the seller deleted this product. Remove from DB + notify UI.
        if (isDeleted(event)) {
          if (event.kind === KINDS.PRODUCT) {
            // Parse the 'd' tag to find which product this replaces
            const dTag = (event.tags || []).find(t => t[0] === 'd')?.[1]
            if (dTag) {
              await deleteProduct(dTag)          // remove from IndexedDB
              onProduct?.({ ...event, _deleted: true }) // UI can filter on _deleted
            }
          }
          return
        }

        if (event.kind === KINDS.PRODUCT) {
          await saveProduct(event)
          fetchProfileIfMissing(event.pubkey)
          onProduct?.(event)
        }

        if (event.kind === KINDS.STALL) {
          await saveStall(event)
          fetchProfileIfMissing(event.pubkey)
          onStall?.(event)
        }
      },
      oneose() {}, // intentionally keep alive
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

// ── Fetch a single profile if not already in DB ──
async function fetchProfileIfMissing(pubkey) {
  const pool = getPool()
  const sub = pool.subscribe(
    RELAYS,
    [{ kinds: [KINDS.PROFILE], authors: [pubkey], limit: 1 }],
    {
      async onevent(event) {
        await saveProfile(event.pubkey, event.content)
      },
      oneose() { sub.close() },
    }
  )
  setTimeout(() => { try { sub.close() } catch {} }, 5000)
}

// ─────────────────────────────────────────────
// PUBLISH STALL (kind:30017)
// ─────────────────────────────────────────────
export async function publishStall({ name, description, currency = 'SAT', shipping = [] }) {
  const sk = getSecretKey()
  const pk = getPublicKeyHex()

  const content = JSON.stringify({ name, description, currency, shipping })

  const event = finalizeEvent({
    kind:       KINDS.STALL,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['d', `stall-${pk.slice(0, 8)}`],
      ['t', 'bitsoko'],
    ],
    content,
  }, sk)

  await saveStall(event)
  await Promise.any(getPool().publish(RELAYS, event))
  return event
}

// ─────────────────────────────────────────────
// PUBLISH PRODUCT (kind:30018)
// ─────────────────────────────────────────────
export async function publishProduct({
  name, description, price, images = [],
  stall_id, quantity = -1, categories = [],
  shipping = [],
}) {
  const sk = getSecretKey()
  const pk = getPublicKeyHex()

  const productId = `product-${Date.now()}-${pk.slice(0, 6)}`

  const content = JSON.stringify({
    id: productId,
    stall_id,
    name,
    description,
    images,
    currency:  'SAT',
    price,
    quantity,
    specs:     [],
    shipping,
  })

  const event = finalizeEvent({
    kind:       KINDS.PRODUCT,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['d', productId],
      ['t', 'bitsoko'],
      ['t', 'bitcoin'],
      ...categories.map(c => ['t', c.toLowerCase()]),
    ],
    content,
  }, sk)

  // Optimistic: save to IndexedDB first, then broadcast
  await saveProduct(event)
  await Promise.any(getPool().publish(RELAYS, event))
  return event
}

// ─────────────────────────────────────────────
// DELETE PRODUCT
//
// Two-layer deletion:
//   Layer 1 — kind:5 (best effort, many relays ignore it)
//   Layer 2 — replacement kind:30018 with ['t','deleted'] tag
//             Same 'd' tag means it overwrites on relays that
//             support NIP-33 replaceable events.
//             On fetch, isDeleted() catches this and drops it.
//             Even on relays that don't support replacement,
//             our filter ensures it never shows in the UI.
// ─────────────────────────────────────────────
export async function deleteProductEvent(productId) {
  const sk = getSecretKey()

  // Get original event from IndexedDB
  const product = await getProductById(productId)
  if (!product) throw new Error('Product not found')

  // Layer 1: kind:5 — best effort
  const kind5 = finalizeEvent({
    kind:       KINDS.DELETE,
    created_at: Math.floor(Date.now() / 1000),
    tags:       [['e', product.id]],
    content:    'deleted',
  }, sk)
  try { await Promise.any(getPool().publish(RELAYS, kind5)) } catch {}

  // Layer 2: replacement kind:30018 with ['t','deleted']
  // Empty content + deleted tag = tombstone event
  // Uses same 'd' tag as original so it replaces it on NIP-33 relays
  const dTag = (product.tags || []).find(t => t[0] === 'd')?.[1] || productId
  const tombstone = finalizeEvent({
    kind:       KINDS.PRODUCT,
    created_at: Math.floor(Date.now() / 1000) + 1, // +1 ensures it wins over original
    tags: [
      ['d', dTag],
      ['t', 'bitsoko'],
      ['t', 'deleted'],   // ← the app-level deletion marker
    ],
    content: '',          // empty content — nothing to show
  }, sk)

  // Remove from IndexedDB immediately (optimistic)
  await deleteProduct(productId)

  // Broadcast tombstone
  await Promise.any(getPool().publish(RELAYS, tombstone))

  return tombstone
}

// ─────────────────────────────────────────────
// PUBLISH ORDER (kind:4 encrypted DM)
// Buyer → Seller
// ─────────────────────────────────────────────
export async function publishOrder({ sellerPubkey, product, quantity, message = '' }) {
  const sk = getSecretKey()
  const pk = getPublicKeyHex()

  const orderContent = {
    id:         `order-${Date.now()}`,
    type:       1,
    name:       localStorage.getItem('bitsoko_display_name') || 'Buyer',
    address:    '',
    message,
    items:      [{ product_id: product.id, quantity }],
    created_at: Math.floor(Date.now() / 1000),
  }

  // NIP-04 encrypt to seller's pubkey
  const encryptedContent = await nip04.encrypt(sk, sellerPubkey, JSON.stringify(orderContent))

  const event = finalizeEvent({
    kind:       KINDS.DM,
    created_at: Math.floor(Date.now() / 1000),
    tags:       [['p', sellerPubkey]],
    content:    encryptedContent,
  }, sk)

  await saveOrder({
    id:           event.id,
    pubkey:       pk,
    seller:       sellerPubkey,
    product_id:   product.id,
    product_name: product.name,
    quantity,
    price:        product.price * quantity,
    status:       'pending',
    created_at:   event.created_at,
    message,
  })

  await Promise.any(getPool().publish(RELAYS, event))
  return event
}

// ─────────────────────────────────────────────
// NIP-98 AUTH (for nostr.build image upload)
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
// IMAGE UPLOAD (nostr.build → nostrcheck.me → fallback)
// Ported from SatsCode Feed.jsx
// ─────────────────────────────────────────────
export async function uploadImage(file) {
  const PROVIDERS = [
    {
      name:      'nostr.build',
      url:       'https://nostr.build/api/v2/upload/files',
      field:     'fileToUpload',
      getUrl:    (j) => j?.data?.[0]?.url,
      needsAuth: true,
    },
    {
      name:      'nostrcheck.me',
      url:       'https://nostrcheck.me/api/v2/media',
      field:     'uploadedfile',
      getUrl:    (j) => j?.url || j?.data?.url,
      needsAuth: true,
    },
    {
      name:      'nostr.build legacy',
      url:       'https://nostr.build/api/upload/image',
      field:     'fileToUpload',
      getUrl:    (j) => j?.data?.display_url || j?.data?.url,
      needsAuth: false,
    },
  ]

  let lastError = 'All upload providers failed'

  for (const provider of PROVIDERS) {
    try {
      const formData = new FormData()
      formData.append(provider.field, file)

      const headers = {}
      if (provider.needsAuth) {
        try { headers['Authorization'] = await buildNip98Auth(provider.url, 'POST') } catch {}
      }

      const res = await fetch(provider.url, { method: 'POST', headers, body: formData })
      if (!res.ok) { lastError = `${provider.name}: HTTP ${res.status}`; continue }

      const json = await res.json()
      const url  = provider.getUrl(json)
      if (url) return url

      lastError = `${provider.name}: no URL in response`
    } catch (e) {
      lastError = `${provider.name}: ${e.message}`
    }
  }

  throw new Error(lastError)
}

