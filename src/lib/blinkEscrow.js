// blinkEscrow.js — Bitsoko escrow via Blink API
// NOTE: Move API key to backend before mainnet launch.

import { finalizeEvent } from 'nostr-tools/pure'
import { SimplePool }    from 'nostr-tools/pool'
import { nip04, nip19 } from 'nostr-tools'

const BLINK_API     = 'https://api.blink.sv/graphql'
const BLINK_API_KEY = 'blink_WeWC70LCFmbtZwogNOrwpFYqNUK1kCkozahOQSqDPhh8WgPaBRqWBfnWu9Id87XE'
const ESCROW_WALLET = '74e2f87f-dd5c-4743-b571-bf3d7b8d93a1'
const FEE_PCT       = 0.02

const RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://nostr-pub.wellorder.net',
]

// ── GraphQL ────────────────────────────────────
async function gql(query, variables = {}) {
  const res = await fetch(BLINK_API, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-KEY': BLINK_API_KEY },
    body:    JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new Error(`Blink API ${res.status}`)
  const json = await res.json()
  if (json.errors?.length) throw new Error(json.errors[0].message)
  return json.data
}

// ── 1. Create invoice ──────────────────────────
export async function createEscrowInvoice(amountSats, memo = 'Bitsoko purchase') {
  const data = await gql(`
    mutation CreateInvoice($input: LnInvoiceCreateInput!) {
      lnInvoiceCreate(input: $input) {
        invoice { paymentRequest paymentHash satoshis }
        errors  { message }
      }
    }
  `, { input: { walletId: ESCROW_WALLET, amount: amountSats, memo } })

  const { invoice, errors } = data.lnInvoiceCreate
  if (errors?.length) throw new Error(errors[0].message)
  return { paymentRequest: invoice.paymentRequest, paymentHash: invoice.paymentHash }
}

// ── 2. Check status ────────────────────────────
export async function checkInvoiceStatus(paymentHash) {
  const data = await gql(`
    query Check($walletId: WalletId!, $paymentHash: PaymentHash!) {
      me { defaultAccount { walletById(walletId: $walletId) {
        invoiceByPaymentHash(paymentHash: $paymentHash) { paymentStatus }
      }}}
    }
  `, { walletId: ESCROW_WALLET, paymentHash })
  return data?.me?.defaultAccount?.walletById?.invoiceByPaymentHash?.paymentStatus || 'PENDING'
}

// ── 3. Poll ────────────────────────────────────
// Returns cancel function. onPaid fires EXACTLY ONCE — stopped=true before callback.
export function pollEscrowPayment(paymentHash, onPaid, onError) {
  let stopped  = false
  let timer    = null
  let attempts = 0

  const poll = async () => {
    if (stopped) return
    try {
      const status = await checkInvoiceStatus(paymentHash)
      if (status === 'PAID') {
        stopped = true          // stop ALL future polls before firing callback
        onPaid?.()
        return
      }
      if (status === 'EXPIRED') {
        stopped = true
        onError?.('Invoice expired')
        return
      }
    } catch(e) {
      console.warn('[poll]', e.message)
    }
    attempts++
    if (attempts < 90 && !stopped) {
      timer = setTimeout(poll, 3000)
    } else if (!stopped) {
      stopped = true
      onError?.('Invoice expired — please try again')
    }
  }

  poll()
  return () => {
    stopped = true
    if (timer) { clearTimeout(timer); timer = null }
  }
}

// ── 4. Publish order ───────────────────────────
// Sends encrypted kind:30078 to Nostr + kind:4 DM to seller
export async function publishEscrowOrder({
  product, quantity, totalSats, paymentHash,
  sellerPubkey, buyerMessage = '',
}) {
  const nsec = localStorage.getItem('bitsoko_nsec')
  const npub = localStorage.getItem('bitsoko_npub')
  if (!nsec || !npub) throw new Error('Not logged in')

  const { data: sk }          = nip19.decode(nsec)
  const { data: buyerPubkey } = nip19.decode(npub)

  const feeSats    = Math.floor(totalSats * FEE_PCT)
  const sellerSats = totalSats - feeSats
  const orderId    = `${buyerPubkey.slice(0, 8)}-${Date.now()}`
  const createdAt  = Math.floor(Date.now() / 1000)

  const orderData = {
    orderId, productId: product.id, productName: product.name,
    quantity, totalSats, sellerSats, feeSats,
    sellerLud16: product.sellerLud16, sellerPubkey,
    paymentHash, status: 'escrow', createdAt,
    message: buyerMessage,
  }

  // Publish kind:30078 (encrypted order record)
  const encrypted = await nip04.encrypt(sk, sellerPubkey, JSON.stringify(orderData))
  const event = finalizeEvent({
    kind: 30078, created_at: createdAt,
    tags: [
      ['d', orderId], ['p', sellerPubkey],
      ['buyer', buyerPubkey], ['seller', sellerPubkey],
      ['status', 'escrow'], ['amount', String(totalSats)],
      ['product', product.id], ['product_name', product.name],
      ['blink_payment_hash', paymentHash],
    ],
    content: encrypted,
  }, sk)

  const pool = new SimplePool()
  try {
    await Promise.any(pool.publish(RELAYS, event).map(p => p.catch(e => { throw e })))
  } finally {
    pool.close(RELAYS)
  }

  // Publish kind:4 DM to seller — order notification
  try {
    const buyerName = nip19.npubEncode(buyerPubkey).slice(0, 12) + '…'
    const lines = [
      '🛒 New Order from Bitsoko',
      '',
      `Buyer: ${buyerName}`,
      '',
      `Product: ${product.name}`,
      `Quantity: ${quantity}`,
      `Total: ${totalSats.toLocaleString()} sats (held in escrow)`,
      `Order ID: ${orderId}`,
    ]
    if (buyerMessage.trim()) {
      lines.push('')
      lines.push('Note from buyer:')
      lines.push(buyerMessage.trim())
    }
    lines.push('')
    lines.push('Sent via Bitsoko ⚡ — reply to confirm')

    const dmEvent = finalizeEvent({
      kind: 4, created_at: Math.floor(Date.now() / 1000),
      tags: [['p', sellerPubkey]],
      content: await nip04.encrypt(sk, sellerPubkey, lines.join('\n')),
    }, sk)

    const dmPool = new SimplePool()
    dmPool.publish(RELAYS, dmEvent).forEach(p => p.catch(() => {}))
    setTimeout(() => dmPool.close(RELAYS), 5000)
  } catch(e) {
    console.warn('[escrow] DM failed:', e.message)
  }

  // Save locally for Orders page
  const orders = getLocalOrders()
  orders.unshift({ ...orderData, nostrEventId: event.id })
  saveLocalOrders(orders)

  // Notify bell badge if seller is on same device
  window.dispatchEvent(new CustomEvent('bitsoko_new_order'))

  return { orderId, nostrEventId: event.id }
}

// ── 5. Release to seller ───────────────────────
export async function releaseEscrow({ orderId, sellerLud16, sellerSats }) {
  if (!sellerLud16) throw new Error('No seller Lightning address')
  if (sellerSats < 1) throw new Error('Amount too low')

  const data = await gql(`
    mutation Pay($input: LnAddressPaymentSendInput!) {
      lnAddressPaymentSend(input: $input) {
        status
        errors { message }
      }
    }
  `, { input: {
    walletId:  ESCROW_WALLET,
    lnAddress: sellerLud16,
    amount:    sellerSats,
    memo:      `Bitsoko order ${orderId} — seller payout`,
  }})

  const { status, errors } = data.lnAddressPaymentSend
  if (errors?.length) throw new Error(errors[0].message)
  if (status === 'FAILED') throw new Error('Payment to seller failed')

  await updateOrderStatus(orderId, 'completed')

  const orders = getLocalOrders()
  const idx    = orders.findIndex(o => o.orderId === orderId)
  if (idx >= 0) { orders[idx].status = 'completed'; saveLocalOrders(orders) }

  return { success: true }
}

// ── 6. Update Nostr order status ───────────────
export async function updateOrderStatus(orderId, status) {
  const nsec = localStorage.getItem('bitsoko_nsec')
  if (!nsec) return
  const { data: sk } = nip19.decode(nsec)
  const event = finalizeEvent({
    kind: 30078, created_at: Math.floor(Date.now() / 1000),
    tags: [['d', orderId], ['status', status]],
    content: '',
  }, sk)
  const pool = new SimplePool()
  pool.publish(RELAYS, event).forEach(p => p.catch(() => {}))
  setTimeout(() => pool.close(RELAYS), 5000)
}

// ── 7. Blink wallet balance ────────────────────
export async function getEscrowBalance() {
  try {
    const data = await gql(`query {
      me { defaultAccount { walletById(walletId: "${ESCROW_WALLET}") { balance } } }
    }`)
    return data?.me?.defaultAccount?.walletById?.balance || 0
  } catch { return 0 }
}

// ── Local order storage ────────────────────────
const ORDERS_KEY = 'bitsoko_escrow_orders'
export function getLocalOrders() {
  try { return JSON.parse(localStorage.getItem(ORDERS_KEY) || '[]') } catch { return [] }
}
function saveLocalOrders(orders) {
  try { localStorage.setItem(ORDERS_KEY, JSON.stringify(orders)) } catch {}
}

export function calcFee(totalSats) {
  const feeSats    = Math.floor(totalSats * FEE_PCT)
  const sellerSats = totalSats - feeSats
  return { feeSats, sellerSats }
}

