import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Package, Zap, Clock,
  CheckCircle, Truck, XCircle, Loader,
  MessageCircle, ChevronRight, ShoppingBag,
  Shield,
} from 'lucide-react'
import { getLocalOrders, releaseEscrow, calcFee } from '../lib/blinkEscrow'
import { satsToKsh, useRate } from '../lib/rates'
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

function timeAgo(ts) {
  const s = Math.floor(Date.now() / 1000) - ts
  if (s < 3600)  return `${Math.floor(s/60)}m ago`
  if (s < 86400) return `${Math.floor(s/3600)}h ago`
  if (s < 86400 * 7) return `${Math.floor(s/86400)}d ago`
  return new Date(ts * 1000).toLocaleDateString('en', { day: 'numeric', month: 'short' })
}

const STATUS_CONFIG = {
  escrow:    { label: 'In Escrow',  color: C.ochre,    bg: 'rgba(200,134,10,0.08)',  border: 'rgba(200,134,10,0.2)',  icon: Shield      },
  pending:   { label: 'Pending',    color: C.ochre,    bg: 'rgba(200,134,10,0.08)',  border: 'rgba(200,134,10,0.2)',  icon: Clock       },
  confirmed: { label: 'Confirmed',  color: C.green,    bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.2)',   icon: CheckCircle },
  shipped:   { label: 'Shipped',    color: '#3b82f6',  bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.2)',  icon: Truck       },
  completed: { label: 'Completed',  color: C.green,    bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.2)',   icon: CheckCircle },
  cancelled: { label: 'Cancelled',  color: C.red,      bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.2)',   icon: XCircle     },
}

function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending
  const Icon   = config.icon
  return (
    <div style={{ display:'inline-flex',alignItems:'center',gap:4,padding:'4px 10px',borderRadius:99,background:config.bg,border:`1px solid ${config.border}`,fontSize:11,fontWeight:600,color:config.color }}>
      <Icon size={10}/> {config.label}
    </div>
  )
}

function OrderCard({ order, onMessage, onConfirm, rate }) {
  const [expanded,    setExpanded]    = useState(false)
  const [confirming,  setConfirming]  = useState(false)
  const [confirmErr,  setConfirmErr]  = useState('')
  const [confirmed,   setConfirmed]   = useState(false)

  const isEscrow = order.status === 'escrow' || order.status === 'pending'

  const handleConfirm = async () => {
    setConfirming(true); setConfirmErr('')
    try {
      const { sellerSats } = calcFee(order.totalSats)
      await releaseEscrow({
        orderId:     order.orderId,
        sellerLud16: order.sellerLud16,
        sellerSats,
        totalSats:   order.totalSats,
      })
      setConfirmed(true)
      onConfirm?.(order.orderId)
    } catch(e) {
      setConfirmErr(e.message || 'Release failed — try again')
    }
    setConfirming(false)
  }

  const productName = order.productName || 'Product'
  const total       = order.totalSats || 0

  return (
    <div style={{ background:C.white,borderRadius:14,border:`1px solid ${C.border}`,overflow:'hidden' }}>
      <button onClick={() => setExpanded(s => !s)} style={{ width:'100%',padding:'14px 16px',background:'none',border:'none',cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:12,borderBottom:expanded?`1px solid ${C.border}`:'none' }}>
        <div style={{ width:44,height:44,borderRadius:10,background:C.bg,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center' }}>
          <Package size={18} color={C.muted}/>
        </div>

        <div style={{ flex:1,minWidth:0 }}>
          <div style={{ fontSize:13,fontWeight:700,color:C.black,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginBottom:4 }}>
            {productName}
          </div>
          <div style={{ display:'flex',alignItems:'center',gap:8 }}>
            <StatusBadge status={confirmed ? 'completed' : order.status}/>
            <span style={{ fontSize:10,color:C.muted }}>{timeAgo(order.createdAt)}</span>
          </div>
        </div>

        <div style={{ textAlign:'right',flexShrink:0 }}>
          <div style={{ display:'flex',alignItems:'center',gap:3 }}>
            <Zap size={11} fill={C.orange} color={C.orange}/>
            <span style={{ fontSize:13,fontWeight:700,color:C.black }}>{total.toLocaleString()}</span>
          </div>
          <div style={{ fontSize:10,color:C.muted }}>{satsToKsh(total, rate)}</div>
        </div>

        <ChevronRight size={14} color={C.muted} style={{ transform:expanded?'rotate(90deg)':'none',transition:'transform .2s',flexShrink:0 }}/>
      </button>

      {expanded && (
        <div style={{ padding:'14px 16px' }}>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14 }}>
            {[
              { label:'Quantity',   value:`×${order.quantity || 1}` },
              { label:'Amount',     value:`${total.toLocaleString()} sats` },
              { label:'Order ID',   value:(order.orderId||'').slice(0,10)+'…' },
              { label:'Payment',    value:order.paymentHash ? `${order.paymentHash.slice(0,8)}…` : '—' },
            ].map(({ label, value }) => (
              <div key={label} style={{ background:C.bg,borderRadius:10,padding:'10px 12px' }}>
                <div style={{ fontSize:10,color:C.muted,marginBottom:3 }}>{label}</div>
                <div style={{ fontSize:12,fontWeight:600,color:C.black,fontFamily:'monospace' }}>{value}</div>
              </div>
            ))}
          </div>

          {order.message && (
            <div style={{ background:C.bg,borderRadius:10,padding:'10px 12px',marginBottom:12 }}>
              <div style={{ fontSize:10,color:C.muted,marginBottom:4 }}>Order note</div>
              <div style={{ fontSize:12,color:C.black,lineHeight:1.5,whiteSpace:'pre-wrap' }}>{order.message}</div>
            </div>
          )}

          {/* Confirm received — only for escrow orders */}
          {isEscrow && !confirmed && (
            <div style={{ marginBottom:10 }}>
              {confirmErr && (
                <div style={{ fontSize:11,color:C.red,marginBottom:8,padding:'8px 12px',background:'rgba(239,68,68,0.06)',borderRadius:8 }}>
                  {confirmErr}
                </div>
              )}
              <button onClick={handleConfirm} disabled={confirming} style={{ width:'100%',padding:'13px',background:C.green,border:'none',borderRadius:12,cursor:confirming?'not-allowed':'pointer',fontSize:13,fontWeight:700,color:C.white,display:'flex',alignItems:'center',justifyContent:'center',gap:8,marginBottom:8 }}>
                {confirming
                  ? <><Loader size={15} style={{ animation:'spin 1s linear infinite' }}/> Releasing payment…</>
                  : <><CheckCircle size={15}/> Confirm received</>
                }
              </button>
            </div>
          )}

          {confirmed && (
            <div style={{ padding:'10px 14px',background:'rgba(34,197,94,0.08)',border:`1px solid rgba(34,197,94,0.2)`,borderRadius:10,fontSize:12,color:C.green,textAlign:'center',marginBottom:10 }}>
              <CheckCircle size={14} style={{ display:'inline',verticalAlign:'middle',marginRight:6 }}/>
              Payment released to seller!
            </div>
          )}

          <button onClick={() => onMessage(order.sellerPubkey)} style={{ width:'100%',padding:'11px',background:C.bg,border:`1.5px solid ${C.border}`,borderRadius:10,cursor:'pointer',fontSize:12,fontWeight:600,color:C.black,display:'flex',alignItems:'center',justifyContent:'center',gap:6 }}>
            <MessageCircle size={13}/> Message seller
          </button>
        </div>
      )}
    </div>
  )
}

export default function Orders() {
  const navigate = useNavigate()
  const rate     = useRate()

  const [orders,  setOrders]  = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Load from local escrow orders (written by blinkEscrow.js on purchase)
    const local = getLocalOrders()
    setOrders(local)
    setLoading(false)
  }, [])

  const handleMessage = (pubkey) => {
    if (pubkey) {
      navigate('/messages', { state: { pubkey } })
    } else {
      navigate('/messages')
    }
  }

  const handleConfirm = (orderId) => {
    // Update local list to reflect completed status
    setOrders(prev => prev.map(o =>
      o.orderId === orderId ? { ...o, status: 'completed' } : o
    ))
  }

  return (
    <div style={{ background:C.bg,minHeight:'100vh',fontFamily:"'Inter',sans-serif",paddingBottom:100 }}>

      <div style={{ background:C.white,borderBottom:`1px solid ${C.border}`,padding:'16px 20px',display:'flex',alignItems:'center',gap:14,position:'sticky',top:0,zIndex:50 }}>
        <button onClick={() => navigate('/', { state: { openMore: true } })} style={{ width:36,height:36,borderRadius:'50%',background:C.bg,border:`1px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer' }}>
          <ArrowLeft size={17} color={C.black}/>
        </button>
        <div>
          <div style={{ fontSize:'1rem',fontWeight:700,color:C.black }}>Orders</div>
          <div style={{ fontSize:'0.68rem',color:C.muted }}>{orders.length} order{orders.length!==1?'s':''}</div>
        </div>
      </div>

      <div style={{ padding:'16px' }}>
        {loading && (
          <div style={{ display:'flex',justifyContent:'center',padding:'48px 0' }}>
            <Loader size={24} color={C.ochre} style={{ animation:'spin 1s linear infinite' }}/>
          </div>
        )}

        {!loading && orders.length === 0 && (
          <div style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'64px 20px',gap:14,textAlign:'center' }}>
            <ShoppingBag size={48} color={C.border}/>
            <div style={{ fontSize:'1rem',fontWeight:700,color:C.black }}>No orders yet</div>
            <div style={{ fontSize:'0.82rem',color:C.muted,lineHeight:1.6 }}>
              When you buy something, your orders appear here.
            </div>
            <button onClick={() => navigate('/explore')} style={{ marginTop:8,padding:'12px 28px',background:C.black,border:'none',borderRadius:12,cursor:'pointer',fontSize:'0.88rem',fontWeight:700,color:C.white }}>
              Browse marketplace
            </button>
          </div>
        )}

        {!loading && orders.length > 0 && (
          <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
            {orders.map(order => (
              <OrderCard
                key={order.orderId}
                order={order}
                onMessage={handleMessage}
                onConfirm={handleConfirm}
                rate={rate}
              />
            ))}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

