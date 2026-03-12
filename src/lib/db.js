// ─────────────────────────────────────────────
// db.js — Bitsoko IndexedDB layer
// Stores: products, stalls, profiles, orders, cart
// Nostr is the source of truth — this is the cache
// ─────────────────────────────────────────────

const DB_NAME    = 'bitsoko_db'
const DB_VERSION = 1

// ── Schema ──────────────────────────────────
// products  → kind:30018 nostr events
// stalls    → kind:30017 nostr events
// profiles  → kind:0 nostr events (pubkey → profile)
// orders    → kind:4 encrypted DMs (local + nostr)
// cart      → local only, never published to nostr

const STORES = {
  products: { keyPath: 'id',     indexes: [
    { name: 'pubkey',     field: 'pubkey',     unique: false },
    { name: 'created_at', field: 'created_at', unique: false },
    { name: 'stall_id',   field: 'stall_id',   unique: false },
  ]},
  stalls: { keyPath: 'id', indexes: [
    { name: 'pubkey',     field: 'pubkey',     unique: false },
    { name: 'created_at', field: 'created_at', unique: false },
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
      const db = e.target.result
      for (const [storeName, config] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(storeName)) {
          const store = db.createObjectStore(storeName, { keyPath: config.keyPath })
          for (const idx of config.indexes) {
            store.createIndex(idx.name, idx.field, { unique: idx.unique })
          }
        }
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

// ── Products ──────────────────────────────────

export async function saveProduct(event) {
  await openDB()
  // Parse kind:30018 content
  let parsed = {}
  try { parsed = JSON.parse(event.content) } catch {}

  const product = {
    id:         event.id,
    pubkey:     event.pubkey,
    created_at: event.created_at,
    tags:       event.tags || [],
    // Parsed fields
    name:       parsed.name        || '',
    description:parsed.description || '',
    price:      parsed.price       || 0,
    currency:   parsed.currency    || 'SAT',
    images:     parsed.images      || [],
    stall_id:   parsed.stall_id    || '',
    quantity:   parsed.quantity    != null ? parsed.quantity : -1,
    shipping:   parsed.shipping    || [],
    // Raw event for re-publishing
    raw: event,
  }
  return wrap(tx('products', 'readwrite').put(product))
}

export async function getProducts(limit = 50) {
  await openDB()
  return new Promise((resolve, reject) => {
    const store = tx('products')
    const index = store.index('created_at')
    const results = []
    const req = index.openCursor(null, 'prev') // newest first
    req.onsuccess = (e) => {
      const cursor = e.target.result
      if (cursor && results.length < limit) {
        results.push(cursor.value)
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
  return wrap(tx('products').index('pubkey').getAll(pubkey))
}

export async function deleteProduct(id) {
  await openDB()
  return wrap(tx('products', 'readwrite').delete(id))
}

// ── Stalls ────────────────────────────────────

export async function saveStall(event) {
  await openDB()
  let parsed = {}
  try { parsed = JSON.parse(event.content) } catch {}

  const stall = {
    id:          event.id,
    pubkey:      event.pubkey,
    created_at:  event.created_at,
    name:        parsed.name        || '',
    description: parsed.description || '',
    currency:    parsed.currency    || 'SAT',
    shipping:    parsed.shipping    || [],
    raw:         event,
  }
  return wrap(tx('stalls', 'readwrite').put(stall))
}

export async function getStalls() {
  await openDB()
  return wrap(tx('stalls').getAll())
}

export async function getStallByPubkey(pubkey) {
  await openDB()
  const results = await wrap(tx('stalls').index('pubkey').getAll(pubkey))
  return results[0] || null
}

// ── Profiles ──────────────────────────────────

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

// ── Orders ────────────────────────────────────

export async function saveOrder(order) {
  await openDB()
  return wrap(tx('orders', 'readwrite').put(order))
}

export async function getOrders() {
  await openDB()
  return new Promise((resolve, reject) => {
    const store = tx('orders')
    const index = store.index('created_at')
    const results = []
    const req = index.openCursor(null, 'prev')
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
  order.status = status
  order.updated_at = Math.floor(Date.now() / 1000)
  return wrap(tx('orders', 'readwrite').put(order))
}

// ── Cart ──────────────────────────────────────
// Cart is local only — never published to Nostr

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

