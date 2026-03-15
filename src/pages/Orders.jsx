import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Package, Zap, Clock,
  CheckCircle, Truck, XCircle, Loader,
  MessageCircle, ChevronRight, ShoppingBag,
} from 'lucide-react'
import { getOrders } from '../lib/db'
import { nip19 } from 'nostr-tools'

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

function timeAgo(ts) {
  const s = Math.floor(Date.now() / 1000) - ts
  if (s < 3600)  return `${Math.floor(s/60)}m ago`
  if (s < 86400) return `${Math.floor(s/3600)}h ago`
  if (s < 86400 * 7) return `${Math.floor(s/86400)}d ago`
  return new Date(ts * 1000).toLocaleDateString('en', { day: 'numeric', month: 'short' })
}

const STATUS_CONFIG = {
  pending:   { label: 'Pending',   color: C.ochre,  bg: 'rgba(200,134,10,0.08)',  border: 'rgba(200,134,10,0.2)',  icon: Clock       },
  confirmed: { label: 'Confirmed', color: C.green,  bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.2)',   icon: CheckCircle },
  shipped:   { label: 'Shipped',   color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.2)',  icon: Truck       },
  completed: { label: 'Completed', color: C.green,  bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.2)',   icon: CheckCircle },
  cancelled: { label: 'Cancelled', color: C.red,    bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.2)',   icon: XCircle     },
}

function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending
  const Icon   = config.icon
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '4px 10px', borderRadius: 99,
      background: config.bg, border: `1px solid ${config.border}`,
      fontSize: 11, fontWeight: 600, color: config.color,
    }}>
      <Icon size={10}/> {config.label}
    </div>
  )
}

function OrderCard({ order, onMessage }) {
  const [expanded, setExpanded] = useState(false)

  let sellerShort = ''
  try {
    const npub = nip19.npubEncode(order.seller_pubkey || order.pubkey || '')
    sellerShort = `${npub.slice(0,10)}…${npub.slice(-4)}`
  } catch {}

  const productName = order.product?.name || order.product_name || 'Product'
  const price       = order.product?.price || order.price || 0
  const qty         = order.quantity || 1
  const total       = price * qty

  return (
    <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
      {/* Header row */}
      <button onClick={() => setExpanded(s => !s)} style={{
        width: '100%', padding: '14px 16px', background: 'none', border: 'none',
        cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12,
        borderBottom: expanded ? `1px solid ${C.border}` : 'none',
      }}>
        {/* Product image or icon */}
        <div style={{ width: 44, height: 44, borderRadius: 10, overflow: 'hidden', background: C.border, flexShrink: 0 }}>
          {order.product?.images?.[0]
            ? <img src={order.product.images[0]} alt="" loading="eager" decoding="async"
                style={{ width: '100%', height: '100%', objectFit: 'cover', willChange: 'transform' }}
                onError={e => e.target.style.display = 'none'}/>
            : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Package size={18} color="rgba(26,20,16,0.2)"/>
              </div>
          }
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.black, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>
            {productName}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StatusBadge status={order.status || 'pending'}/>
            <span style={{ fontSize: 10, color: C.muted }}>{timeAgo(order.created_at)}</span>
          </div>
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <Zap size={11} fill={C.orange} color={C.orange}/>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.black }}>{total.toLocaleString()}</span>
          </div>
          <div style={{ fontSize: 10, color: C.muted }}>{satsToKsh(total)}</div>
        </div>

        <ChevronRight size={14} color={C.muted} style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform .2s', flexShrink: 0 }}/>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div style={{ padding: '14px 16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            {[
              { label: 'Quantity',  value: `×${qty}` },
              { label: 'Unit price', value: `${price.toLocaleString()} sats` },
              { label: 'Seller',    value: sellerShort },
              { label: 'Order ID',  value: order.id?.slice(0, 8) + '…' },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: C.bg, borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.black, fontFamily: label === 'Seller' || label === 'Order ID' ? 'monospace' : 'inherit' }}>{value}</div>
              </div>
            ))}
          </div>

          {order.message && (
            <div style={{ background: C.bg, borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>Order note</div>
              <div style={{ fontSize: 12, color: C.black, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{order.message}</div>
            </div>
          )}

          <button onClick={() => onMessage(order.seller_pubkey || order.pubkey)} style={{
            width: '100%', padding: '11px', background: C.bg, border: `1.5px solid ${C.border}`,
            borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: C.black,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <MessageCircle size={13}/> Message seller
          </button>
        </div>
      )}
    </div>
  )
}

export default function Orders() {
  const navigate = useNavigate()
  const [orders,  setOrders]  = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getOrders().then(o => {
      setOrders(o)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const handleMessage = (pubkey) => {
    if (pubkey) navigate('/messages')
  }

  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: "'Inter',sans-serif", paddingBottom: 100 }}>

      <div style={{ background: C.white, borderBottom: `1px solid ${C.border}`, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, position: 'sticky', top: 0, zIndex: 50 }}>
        <button onClick={() => navigate('/', { state: { openMore: true } })} style={{ width: 36, height: 36, borderRadius: '50%', background: C.bg, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <ArrowLeft size={17} color={C.black}/>
        </button>
        <div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: C.black }}>Orders</div>
          <div style={{ fontSize: '0.68rem', color: C.muted }}>{orders.length} order{orders.length !== 1 ? 's' : ''}</div>
        </div>
      </div>

      <div style={{ padding: '16px' }}>
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
            <Loader size={24} color={C.ochre} style={{ animation: 'spin 1s linear infinite' }}/>
          </div>
        )}

        {!loading && orders.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 20px', gap: 14, textAlign: 'center' }}>
            <ShoppingBag size={48} color={C.border}/>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: C.black }}>No orders yet</div>
            <div style={{ fontSize: '0.82rem', color: C.muted, lineHeight: 1.6 }}>
              When you buy something, your orders appear here. Orders are stored only on this device.
            </div>
            <button onClick={() => navigate('/explore')} style={{ marginTop: 8, padding: '12px 28px', background: C.black, border: 'none', borderRadius: 12, cursor: 'pointer', fontSize: '0.88rem', fontWeight: 700, color: C.white }}>
              Browse marketplace
            </button>
          </div>
        )}

        {!loading && orders.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {orders.map(order => (
              <OrderCard key={order.id} order={order} onMessage={handleMessage}/>
            ))}
          </div>
        )}

        {!loading && orders.length > 0 && (
          <div style={{ textAlign: 'center', marginTop: 16, fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
            Orders are stored locally on your device only.<br/>
            Payment is arranged directly with each seller via encrypted messages.
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

