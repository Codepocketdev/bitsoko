// ─────────────────────────────────────────────
// db.js — Bitsoko IndexedDB layer
//
// Stores:
//   products  → kind:30402 NIP-99 listings
//   profiles  → kind:0 user profiles
//   orders    → kind:4 encrypted DM orders
//   cart      → local only, never on Nostr
//
// Nostr is the source of truth.
// IndexedDB is the offline-first cache.
//
// KEY CHANGE from NIP-15:
//   Products are now keyed by `pubkey:d-tag` (stableId)
//   not by event.id hash. This means editing a product
//   (same 'd' tag, new event) overwrites the same IndexedDB
//   record — no duplicates, no ghost listings.
// ─────────────────────────────────────────────

const DB_NAME    = 'bitsoko_db'
const DB_VERSION = 2            // bumped — NIP-99 schema change

const STORES = {
  products: { keyPath: 'id', indexes: [
    { name: 'pubkey',     field: 'pubkey',     unique: false },
    { name: 'created_at', field: 'created_at', unique: false },
    { name: 'status',     field: 'status',     unique: false },
  ]},
  profiles: { keyPath: 'pubkey', indexes: [
    { name: 'name', field: 'name', unique: false },
  ]},
  orders: { keyPath: 'id', indexes: [
    { name: 'pubkey',     field: 'pubkey',     unique: false },
    { name: 'created_at', field: 'created_at', unique: false },
    { name: 'status',     field: 'status',     unique: false },
  ]},
  cart: { keyPath: 'product_id', indexes: [] },
}

// ── Open DB ──────────────────────────────────
let _db = null

export function openDB() {
  if (_db) return Promise.resolve(_db)

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = (e) => {
      const db      = e.target.result
      const oldVer  = e.oldVersion

      for (const [storeName, config] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(storeName)) {
          const store = db.createObjectStore(storeName, { keyPath: config.keyPath })
          for (const idx of config.indexes) {
            store.createIndex(idx.name, idx.field, { unique: idx.unique })
          }
        } else if (oldVer < 2 && storeName === 'products') {
          // v1→v2: drop old products store and recreate with new schema
          // Old kind:30018 events are stale — users re-publish under NIP-99
          db.deleteObjectStore(storeName)
          const store = db.createObjectStore(storeName, { keyPath: config.keyPath })
          for (const idx of config.indexes) {
            store.createIndex(idx.name, idx.field, { unique: idx.unique })
          }
        }
      }

      // Drop stalls store — NIP-99 has no stalls concept
      if (db.objectStoreNames.contains('stalls')) {
        db.deleteObjectStore('stalls')
      }
    }

    req.onsuccess = (e) => { _db = e.target.result; resolve(_db) }
    req.onerror   = (e) => reject(e.target.error)
  })
}

// ── Generic helpers ───────────────────────────
function tx(storeName, mode = 'readonly') {
  return _db.transaction(storeName, mode).objectStore(storeName)
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

// ─────────────────────────────────────────────
// PRODUCTS (kind:30402 NIP-99)
// ─────────────────────────────────────────────

// saveProduct accepts a raw Nostr event and parses it
// using the NIP-99 tag structure (imported lazily to
// avoid circular deps — nostrSync imports from db).
export async function saveProduct(event) {
  await openDB()

  const tags   = event.tags || []
  const tag    = (name) => tags.find(t  => t[0] === name)?.[1] || ''
  const tagAll = (name) => tags.filter(t => t[0] === name)

  // Stable ID = pubkey:d-tag (NIP-33 identity)
  const dTag     = tag('d')
  const stableId = dTag ? `${event.pubkey}:${dTag}` : event.id

  const images = tagAll('image').map(t => t[1]).filter(Boolean)

  const shipping = tagAll('shipping').map(t => ({
    name:    t[1] || '',
    cost:    parseInt(t[2]) || 0,
    currency:t[3] || 'SATS',
    regions: t[4] || '',
  }))

  const RESERVED = new Set(['bitsoko','bitcoin','deleted','active','sold'])
  const categories = tagAll('t')
    .map(t => t[1])
    .filter(v => v && !RESERVED.has(v))

  const priceTag = tags.find(t => t[0] === 'price')
  const price    = priceTag ? parseInt(priceTag[1]) || 0 : 0
  const currency = priceTag ? priceTag[2] || 'SATS' : 'SATS'

  const qtyRaw  = tag('quantity')
  const quantity = qtyRaw !== '' ? parseInt(qtyRaw) : -1

  const product = {
    id:           stableId,                  // stable across edits
    event_id:     event.id,                  // actual event hash
    pubkey:       event.pubkey,
    created_at:   event.created_at,
    published_at: parseInt(tag('published_at')) || event.created_at,
    tags:         event.tags,
    // NIP-99 fields from tags
    name:         tag('title'),
    summary:      tag('summary'),
    description:  event.content,             // Markdown
    location:     tag('location'),
    status:       tag('status') || 'active',
    price,
    currency,
    images,
    quantity,
    shipping,
    categories,
    raw:          event,
  }

  return wrap(tx('products', 'readwrite').put(product))
}

export async function getProducts(limit = 100) {
  await openDB()
  return new Promise((resolve, reject) => {
    const store   = tx('products')
    const index   = store.index('created_at')
    const results = []
    const req     = index.openCursor(null, 'prev') // newest first
    req.onsuccess = (e) => {
      const cursor = e.target.result
      if (cursor && results.length < limit) {
        // Only return active listings
        if (cursor.value.status !== 'deleted') results.push(cursor.value)
        cursor.continue()
      } else {
        resolve(results)
      }
    }
    req.onerror = () => reject(req.error)
  })
}

export async function getProductById(id) {
  await openDB()
  return wrap(tx('products').get(id))
}

export async function getProductsByPubkey(pubkey) {
  await openDB()
  const all = await wrap(tx('products').index('pubkey').getAll(pubkey))
  return all.filter(p => p.status !== 'deleted')
}

export async function deleteProduct(id) {
  await openDB()
  return wrap(tx('products', 'readwrite').delete(id))
}

// ─────────────────────────────────────────────
// PROFILES (kind:0)
// ─────────────────────────────────────────────

export async function saveProfile(pubkey, content) {
  await openDB()
  let parsed = {}
  try { parsed = typeof content === 'string' ? JSON.parse(content) : content } catch {}

  const profile = {
    pubkey,
    name:         parsed.name         || '',
    display_name: parsed.display_name || '',
    picture:      parsed.picture      || '',
    about:        parsed.about        || '',
    lud16:        parsed.lud16        || '',
    nip05:        parsed.nip05        || '',
    website:      parsed.website      || '',
    banner:       parsed.banner       || '',
    updated_at:   Math.floor(Date.now() / 1000),
  }
  return wrap(tx('profiles', 'readwrite').put(profile))
}

export async function getProfile(pubkey) {
  await openDB()
  return wrap(tx('profiles').get(pubkey))
}

export async function getProfiles(pubkeys) {
  await openDB()
  return Promise.all(pubkeys.map(pk => wrap(tx('profiles').get(pk))))
}

// ─────────────────────────────────────────────
// ORDERS (kind:4 NIP-04 DMs stored locally)
// ─────────────────────────────────────────────

export async function saveOrder(order) {
  await openDB()
  return wrap(tx('orders', 'readwrite').put(order))
}

export async function getOrders() {
  await openDB()
  return new Promise((resolve, reject) => {
    const store   = tx('orders')
    const index   = store.index('created_at')
    const results = []
    const req     = index.openCursor(null, 'prev')
    req.onsuccess = (e) => {
      const cursor = e.target.result
      if (cursor) { results.push(cursor.value); cursor.continue() }
      else resolve(results)
    }
    req.onerror = () => reject(req.error)
  })
}

export async function updateOrderStatus(id, status) {
  await openDB()
  const order = await wrap(tx('orders').get(id))
  if (!order) return
  order.status     = status
  order.updated_at = Math.floor(Date.now() / 1000)
  return wrap(tx('orders', 'readwrite').put(order))
}

// ─────────────────────────────────────────────
// CART (local only — never published)
// ─────────────────────────────────────────────

export async function addToCart(product, quantity = 1) {
  await openDB()
  const existing = await wrap(tx('cart').get(product.id))
  const item = {
    product_id: product.id,
    product,
    quantity:   existing ? existing.quantity + quantity : quantity,
    added_at:   Math.floor(Date.now() / 1000),
  }
  return wrap(tx('cart', 'readwrite').put(item))
}

export async function getCart() {
  await openDB()
  return wrap(tx('cart').getAll())
}

export async function updateCartQty(product_id, quantity) {
  await openDB()
  if (quantity <= 0) return wrap(tx('cart', 'readwrite').delete(product_id))
  const item = await wrap(tx('cart').get(product_id))
  if (!item) return
  item.quantity = quantity
  return wrap(tx('cart', 'readwrite').put(item))
}

export async function removeFromCart(product_id) {
  await openDB()
  return wrap(tx('cart', 'readwrite').delete(product_id))
}

export async function clearCart() {
  await openDB()
  return wrap(tx('cart', 'readwrite').clear())
}

export async function getCartCount() {
  await openDB()
  const items = await wrap(tx('cart').getAll())
  return items.reduce((sum, item) => sum + item.quantity, 0)
}

