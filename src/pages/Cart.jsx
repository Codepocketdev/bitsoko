import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ShoppingCart, Trash2, Plus, Minus, Zap,
  Package, ArrowLeft, Loader, CheckCircle,
  MessageCircle, Store, AlertCircle,
} from 'lucide-react'
import { getCart, updateCartQty, removeFromCart, clearCart } from '../lib/db'
import { publishOrder } from '../lib/nostrSync'

const C = {
  bg:     '#f7f4f0',
  white:  '#ffffff',
  black:  '#1a1410',
  muted:  '#b0a496',
  border: '#e8e0d5',
  orange: '#f7931a',
  ochre:  '#c8860a',
  red:    '#ef4444',
  green:  '#22c55e',
}

function satsToKsh(sats) {
  const ksh = (sats / 100_000_000) * 13_000_000
  if (ksh >= 1000) return `KSh ${(ksh/1000).toFixed(1)}k`
  return `KSh ${Math.round(ksh)}`
}

function CartItem({ item, onQtyChange, onRemove }) {
  const { product, quantity } = item
  const image = product.images?.[0]
  const [imgErr, setImgErr] = useState(false)

  return (
    <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, padding: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
      {/* Image */}
      <div style={{ width: 64, height: 64, borderRadius: 10, overflow: 'hidden', background: C.border, flexShrink: 0 }}>
        {image && !imgErr
          ? <img src={image} alt={product.name} onError={() => setImgErr(true)} loading="eager" decoding="async"
              style={{ width: '100%', height: '100%', objectFit: 'cover', willChange: 'transform' }}/>
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Package size={22} color="rgba(26,20,16,0.2)"/>
            </div>
        }
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.black, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>
          {product.name || 'Untitled'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
          <Zap size={11} fill={C.orange} color={C.orange}/>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.black }}>{(product.price * quantity).toLocaleString()} sats</span>
          {quantity > 1 && <span style={{ fontSize: 10, color: C.muted }}>({product.price?.toLocaleString()} × {quantity})</span>}
        </div>
        {/* Qty stepper */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
            <button onClick={() => onQtyChange(quantity - 1)} style={{ width: 28, height: 28, background: C.bg, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: C.black }}>−</button>
            <div style={{ width: 28, textAlign: 'center', fontSize: 12, fontWeight: 700, color: C.black }}>{quantity}</div>
            <button onClick={() => onQtyChange(quantity + 1)} style={{ width: 28, height: 28, background: C.bg, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: C.black }}>+</button>
          </div>
        </div>
      </div>

      {/* Remove */}
      <button onClick={onRemove} style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(239,68,68,0.06)', border: `1px solid rgba(239,68,68,0.15)`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
        <Trash2 size={14} color={C.red}/>
      </button>
    </div>
  )
}

export default function Cart() {
  const navigate = useNavigate()

  const [items,       setItems]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [placing,     setPlacing]     = useState(false)
  const [orderStatus, setOrderStatus] = useState('idle') // idle | placing | done | error
  const [orderErr,    setOrderErr]    = useState('')
  const [message,     setMessage]     = useState('')
  const [showNote,    setShowNote]    = useState(false)

  const loadCart = async () => {
    const cart = await getCart()
    setItems(cart)
    setLoading(false)
  }

  useEffect(() => { loadCart() }, [])

  const handleQtyChange = async (productId, qty) => {
    if (qty <= 0) {
      await removeFromCart(productId)
    } else {
      await updateCartQty(productId, qty)
    }
    await loadCart()
  }

  const handleRemove = async (productId) => {
    await removeFromCart(productId)
    await loadCart()
  }

  const handleClearCart = async () => {
    await clearCart()
    await loadCart()
  }

  const handlePlaceOrders = async () => {
    if (!items.length || orderStatus !== 'idle') return
    setOrderStatus('placing'); setOrderErr('')

    try {
      // Group items by seller (one DM per seller with all their items)
      const bySeller = {}
      for (const item of items) {
        const pk = item.product.pubkey
        if (!bySeller[pk]) bySeller[pk] = []
        bySeller[pk].push(item)
      }

      // Send one order DM per unique seller
      for (const [sellerPubkey, sellerItems] of Object.entries(bySeller)) {
        // Use the first product as the "main" product for the order DM
        // Include all items in the message
        const itemsList = sellerItems.map(i =>
          `• ${i.product.name} × ${i.quantity} = ${(i.product.price * i.quantity).toLocaleString()} sats`
        ).join('\n')

        const fullMessage = [
          itemsList,
          message.trim() ? `\nNote: ${message.trim()}` : '',
        ].join('')

        await publishOrder({
          sellerPubkey,
          product:  sellerItems[0].product,
          quantity: sellerItems[0].quantity,
          message:  fullMessage,
        })
      }

      setOrderStatus('done')
      setTimeout(async () => {
        await clearCart()
        await loadCart()
        setOrderStatus('idle')
        setMessage('')
        navigate('/orders')
      }, 1800)
    } catch(e) {
      setOrderErr(e.message || 'Failed to send orders')
      setOrderStatus('error')
    }
  }

  const totalSats  = items.reduce((s, i) => s + (i.product.price * i.quantity), 0)
  const totalItems = items.reduce((s, i) => s + i.quantity, 0)
  const sellerCount = new Set(items.map(i => i.product.pubkey)).size

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader size={24} color={C.ochre} style={{ animation: 'spin 1s linear infinite' }}/>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: "'Inter',sans-serif", paddingBottom: 160 }}>

      {/* Header */}
      <div style={{ background: C.white, borderBottom: `1px solid ${C.border}`, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={() => navigate('/', { state: { openMore: true } })} style={{ width: 36, height: 36, borderRadius: '50%', background: C.bg, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <ArrowLeft size={17} color={C.black}/>
          </button>
          <div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: C.black }}>Cart</div>
            <div style={{ fontSize: '0.68rem', color: C.muted }}>{totalItems} item{totalItems !== 1 ? 's' : ''}</div>
          </div>
        </div>
        {items.length > 0 && (
          <button onClick={handleClearCart} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: C.muted, fontFamily: "'Inter',sans-serif" }}>
            Clear all
          </button>
        )}
      </div>

      {/* Empty state */}
      {items.length === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', gap: 14, textAlign: 'center' }}>
          <ShoppingCart size={48} color={C.border}/>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: C.black }}>Your cart is empty</div>
          <div style={{ fontSize: '0.82rem', color: C.muted }}>Browse the marketplace and add items to your cart</div>
          <button onClick={() => navigate('/explore')} style={{ marginTop: 8, padding: '12px 28px', background: C.black, border: 'none', borderRadius: 12, cursor: 'pointer', fontSize: '0.88rem', fontWeight: 700, color: C.white }}>
            Browse marketplace
          </button>
        </div>
      )}

      {/* Cart items */}
      {items.length > 0 && (
        <div style={{ padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map(item => (
            <CartItem
              key={item.product_id}
              item={item}
              onQtyChange={(qty) => handleQtyChange(item.product_id, qty)}
              onRemove={() => handleRemove(item.product_id)}
            />
          ))}

          {/* Seller info */}
          <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Store size={14} color={C.ochre}/>
            <span style={{ fontSize: 12, color: C.muted }}>
              Items from {sellerCount} seller{sellerCount !== 1 ? 's' : ''} — each will receive a separate order message
            </span>
          </div>

          {/* Optional note */}
          <button onClick={() => setShowNote(s => !s)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: C.ochre, textAlign: 'left', fontFamily: "'Inter',sans-serif", padding: '4px 0', display: 'flex', alignItems: 'center', gap: 4 }}>
            <MessageCircle size={13}/> {showNote ? 'Hide note' : 'Add note to sellers'}
          </button>
          {showNote && (
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Address, delivery preference, questions…"
              rows={3}
              style={{ width: '100%', padding: '12px 14px', background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 12, outline: 'none', resize: 'none', fontSize: '0.85rem', color: C.black, lineHeight: 1.6, fontFamily: "'Inter',sans-serif", boxSizing: 'border-box' }}
            />
          )}
        </div>
      )}

      {/* Bottom checkout bar */}
      {items.length > 0 && (
        <div style={{ position: 'fixed', bottom: 64, left: 0, right: 0, background: C.white, borderTop: `1px solid ${C.border}`, padding: '16px 20px', boxShadow: '0 -4px 16px rgba(26,20,16,0.06)' }}>

          {/* Total */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: C.muted }}>Total</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Zap size={15} fill={C.orange} color={C.orange}/>
              <span style={{ fontSize: 18, fontWeight: 800, color: C.black }}>{totalSats.toLocaleString()}</span>
              <span style={{ fontSize: 12, color: C.muted }}>sats · {satsToKsh(totalSats)}</span>
            </div>
          </div>

          {orderStatus === 'error' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.06)', border: `1px solid rgba(239,68,68,0.2)`, fontSize: 12, color: C.red, marginBottom: 10 }}>
              <AlertCircle size={14}/> {orderErr}
            </div>
          )}

          <button
            onClick={handlePlaceOrders}
            disabled={orderStatus === 'placing' || orderStatus === 'done'}
            style={{
              width: '100%', padding: '15px',
              background: orderStatus === 'done' ? C.green : C.black,
              border: 'none', borderRadius: 14, cursor: orderStatus !== 'idle' ? 'not-allowed' : 'pointer',
              fontSize: '0.9rem', fontWeight: 700, color: C.white,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'background 0.2s',
            }}
          >
            {orderStatus === 'placing'
              ? <><Loader size={16} style={{ animation: 'spin 1s linear infinite' }}/> Sending orders…</>
              : orderStatus === 'done'
              ? <><CheckCircle size={16}/> Orders sent!</>
              : <><MessageCircle size={16}/> Send orders to sellers</>
            }
          </button>
          <div style={{ textAlign: 'center', marginTop: 8, fontSize: 10, color: C.muted }}>
            Orders sent as encrypted Nostr DMs · Payment arranged directly with sellers
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

