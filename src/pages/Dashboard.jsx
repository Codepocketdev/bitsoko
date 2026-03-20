// Dashboard.jsx — Seller Revenue Dashboard
// Shows sales, escrow, and earnings from Nostr order events (kind:30078)
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Zap, TrendingUp, Package,
  Clock, CheckCircle, RefreshCw, Loader,
  ShoppingBag, BarChart2, Store,
} from 'lucide-react'
import { getPool, getReadRelays, DEFAULT_RELAYS } from '../lib/nostrSync'
import { satsToKsh, useRate } from '../lib/rates'
import { nip19, nip04 } from 'nostr-tools'

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

const CACHE_KEY = 'bitsoko_dashboard_cache'

function getMyKeys() {
  try {
    const npub = localStorage.getItem('bitsoko_npub')
    const nsec = localStorage.getItem('bitsoko_nsec')
    const pubkeyHex = nip19.decode(npub).data
    const { data: sk } = nip19.decode(nsec)
    return { pubkeyHex, sk }
  } catch { return null }
}

function timeAgo(ts) {
  const s = Math.floor(Date.now() / 1000) - ts
  if (s < 3600)   return `${Math.floor(s/60)}m ago`
  if (s < 86400)  return `${Math.floor(s/3600)}h ago`
  if (s < 604800) return `${Math.floor(s/86400)}d ago`
  return new Date(ts*1000).toLocaleDateString('en',{month:'short',day:'numeric'})
}

function StatCard({ label, value, sub, icon: Icon, color }) {
  return (
    <div style={{ background:C.white,borderRadius:14,border:`1px solid ${C.border}`,padding:'14px 16px',flex:1,minWidth:0 }}>
      <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:8 }}>
        <div style={{ width:32,height:32,borderRadius:9,background:`${color}18`,display:'flex',alignItems:'center',justifyContent:'center' }}>
          <Icon size={15} color={color}/>
        </div>
        <span style={{ fontSize:11,color:C.muted }}>{label}</span>
      </div>
      <div style={{ fontSize:20,fontWeight:800,color:C.black,marginBottom:2 }}>{value}</div>
      {sub && <div style={{ fontSize:11,color:C.muted }}>{sub}</div>}
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const rate     = useRate()
  const keys     = getMyKeys()

  const [orders,    setOrders]    = useState(() => {
    try { const c = localStorage.getItem(CACHE_KEY); return c ? JSON.parse(c) : [] } catch { return [] }
  })
  const [loading,   setLoading]   = useState(true)
  const [lastFetch, setLastFetch] = useState(null)

  const fetchOrders = async () => {
    if (!keys) { setLoading(false); return }
    setLoading(true)
    try {
      const relays = [...new Set([...getReadRelays(), ...DEFAULT_RELAYS])]
      const pool   = getPool()

      // Fetch all kind:30078 order events addressed to this seller
      const events = await pool.querySync(relays, {
        kinds:  [30078],
        '#p':   [keys.pubkeyHex],
        limit:  500,
      })

      // Also fetch orders published BY this seller (their own order records)
      const ownEvents = await pool.querySync(relays, {
        kinds:   [30078],
        authors: [keys.pubkeyHex],
        limit:   500,
      })

      const allEvents = [...events, ...ownEvents]
      const seen = new Set()
      const unique = allEvents.filter(e => {
        if (seen.has(e.id)) return false
        seen.add(e.id)
        return true
      })

      // Parse order events
      const parsed = unique.map(e => {
        const tag  = (name) => (e.tags||[]).find(t=>t[0]===name)?.[1] || ''
        return {
          id:         e.id,
          created_at: e.created_at,
          status:     tag('status') || 'pending',
          amount:     parseInt(tag('amount')) || 0,
          product:    tag('product'),
          productName:tag('product_name') || 'Product',
          buyer:      tag('buyer'),
          seller:     tag('seller') || e.pubkey,
          paymentHash:tag('blink_payment_hash') || '',
        }
      }).filter(o => o.amount > 0)
        .sort((a, b) => b.created_at - a.created_at)

      setOrders(parsed)
      setLastFetch(new Date())
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(parsed)) } catch {}
    } catch(e) {
      console.error('[dashboard] fetch error:', e)
    }
    setLoading(false)
  }

  useEffect(() => { fetchOrders() }, [])

  // ── Derived stats ──────────────────────────
  const completed = orders.filter(o => o.status === 'completed')
  const pending   = orders.filter(o => o.status === 'pending' || o.status === 'escrow')
  const total     = orders.length

  const totalEarned  = completed.reduce((s, o) => s + o.amount, 0)
  const pendingValue = pending.reduce((s, o) => s + o.amount, 0)

  // This week
  const weekAgo    = Math.floor(Date.now()/1000) - 7*86400
  const thisWeek   = completed.filter(o => o.created_at > weekAgo)
  const weekEarned = thisWeek.reduce((s, o) => s + o.amount, 0)

  // Top products by revenue
  const productMap = {}
  for (const o of completed) {
    const key = o.productName || o.product || 'Unknown'
    if (!productMap[key]) productMap[key] = { name:key, count:0, sats:0 }
    productMap[key].count++
    productMap[key].sats += o.amount
  }
  const topProducts = Object.values(productMap).sort((a,b)=>b.sats-a.sats).slice(0,5)

  const STATUS_COLOR = {
    pending:   C.ochre,
    escrow:    C.ochre,
    completed: C.green,
    cancelled: C.red,
  }

  return (
    <div style={{ background:C.bg,minHeight:'100vh',fontFamily:"'Inter',sans-serif",paddingBottom:100 }}>

      {/* Header */}
      <div style={{ background:C.white,borderBottom:`1px solid ${C.border}`,padding:'16px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:50 }}>
        <div style={{ display:'flex',alignItems:'center',gap:14 }}>
          <button onClick={() => navigate('/', { state: { openMore:true } })} style={{ width:36,height:36,borderRadius:'50%',background:C.bg,border:`1px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer' }}>
            <ArrowLeft size={17} color={C.black}/>
          </button>
          <div>
            <div style={{ fontSize:'1rem',fontWeight:700,color:C.black }}>Revenue</div>
            <div style={{ fontSize:11,color:C.muted }}>
              {lastFetch ? `Updated ${lastFetch.toLocaleTimeString('en',{hour:'2-digit',minute:'2-digit'})}` : 'Loading…'}
            </div>
          </div>
        </div>
        <button onClick={fetchOrders} disabled={loading} style={{ width:36,height:36,borderRadius:'50%',background:C.bg,border:`1px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer' }}>
          {loading
            ? <Loader size={15} color={C.ochre} style={{ animation:'spin 1s linear infinite' }}/>
            : <RefreshCw size={15} color={C.black}/>
          }
        </button>
      </div>

      <div style={{ padding:'16px' }}>

        {/* Empty state */}
        {!loading && total === 0 && (
          <div style={{ textAlign:'center',padding:'64px 20px' }}>
            <Store size={48} color={C.border} style={{ margin:'0 auto 16px',display:'block' }}/>
            <div style={{ fontSize:'1rem',fontWeight:700,color:C.black,marginBottom:8 }}>No sales yet</div>
            <div style={{ fontSize:'0.82rem',color:C.muted,lineHeight:1.6,marginBottom:20 }}>
              When buyers purchase your products, your revenue appears here.
            </div>
            <button onClick={() => navigate('/create-listing')} style={{ padding:'12px 24px',background:C.black,border:'none',borderRadius:12,cursor:'pointer',fontSize:'0.85rem',fontWeight:700,color:C.white }}>
              List a product
            </button>
          </div>
        )}

        {total > 0 && (
          <>
            {/* Total earned — big hero number */}
            <div style={{ background:C.black,borderRadius:16,padding:'20px',marginBottom:14 }}>
              <div style={{ fontSize:11,color:'rgba(255,255,255,0.4)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:6 }}>Total earned</div>
              <div style={{ display:'flex',alignItems:'baseline',gap:6,marginBottom:4 }}>
                <span style={{ fontSize:36,fontWeight:800,color:C.white,lineHeight:1 }}>{totalEarned.toLocaleString()}</span>
                <span style={{ fontSize:14,color:'rgba(255,255,255,0.4)' }}>sats</span>
              </div>
              <div style={{ fontSize:13,color:'rgba(255,255,255,0.4)' }}>≈ {satsToKsh(totalEarned, rate)}</div>
            </div>

            {/* Stats row */}
            <div style={{ display:'flex',gap:10,marginBottom:10 }}>
              <StatCard label="This week" value={`${weekEarned.toLocaleString()}`} sub={`${thisWeek.length} sales`} icon={TrendingUp} color={C.orange}/>
              <StatCard label="In escrow" value={`${pendingValue.toLocaleString()}`} sub={`${pending.length} pending`} icon={Clock} color={C.ochre}/>
            </div>

            <div style={{ display:'flex',gap:10,marginBottom:14 }}>
              <StatCard label="Completed" value={completed.length} sub="orders paid out" icon={CheckCircle} color={C.green}/>
              <StatCard label="Total orders" value={total} sub="all time" icon={ShoppingBag} color={C.black}/>
            </div>

            {/* Top products */}
            {topProducts.length > 0 && (
              <div style={{ background:C.white,borderRadius:14,border:`1px solid ${C.border}`,padding:'16px',marginBottom:14 }}>
                <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:14 }}>
                  <BarChart2 size={14} color={C.ochre}/>
                  <span style={{ fontSize:14,fontWeight:700,color:C.black }}>Top products</span>
                </div>
                {topProducts.map((p, i) => (
                  <div key={i} style={{ display:'flex',alignItems:'center',gap:12,marginBottom:10,padding:'10px 12px',background:C.bg,borderRadius:10 }}>
                    <div style={{ width:28,height:28,borderRadius:8,background:C.black,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
                      <span style={{ fontSize:11,fontWeight:700,color:C.white }}>#{i+1}</span>
                    </div>
                    <div style={{ flex:1,minWidth:0 }}>
                      <div style={{ fontSize:13,fontWeight:600,color:C.black,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{p.name}</div>
                      <div style={{ fontSize:11,color:C.muted }}>{p.count} sale{p.count!==1?'s':''}</div>
                    </div>
                    <div style={{ textAlign:'right',flexShrink:0 }}>
                      <div style={{ fontSize:13,fontWeight:700,color:C.black,display:'flex',alignItems:'center',gap:3 }}>
                        <Zap size={11} fill={C.orange} color={C.orange}/> {p.sats.toLocaleString()}
                      </div>
                      <div style={{ fontSize:10,color:C.muted }}>{satsToKsh(p.sats, rate)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Recent orders */}
            <div style={{ background:C.white,borderRadius:14,border:`1px solid ${C.border}`,padding:'16px' }}>
              <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:14 }}>
                <Package size={14} color={C.ochre}/>
                <span style={{ fontSize:14,fontWeight:700,color:C.black }}>Recent orders</span>
              </div>
              {orders.slice(0,15).map((o, i) => (
                <div key={o.id} style={{ display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:i<Math.min(orders.length,15)-1?`1px solid ${C.bg}`:'none' }}>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ fontSize:13,fontWeight:600,color:C.black,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginBottom:3 }}>
                      {o.productName}
                    </div>
                    <div style={{ display:'flex',alignItems:'center',gap:6 }}>
                      <span style={{ fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:99,background:`${STATUS_COLOR[o.status]||C.ochre}15`,color:STATUS_COLOR[o.status]||C.ochre }}>
                        {o.status === 'escrow' ? 'In escrow' : o.status}
                      </span>
                      <span style={{ fontSize:10,color:C.muted }}>{timeAgo(o.created_at)}</span>
                    </div>
                  </div>
                  <div style={{ textAlign:'right',flexShrink:0 }}>
                    <div style={{ fontSize:13,fontWeight:700,color:C.black,display:'flex',alignItems:'center',gap:3 }}>
                      <Zap size={11} fill={C.orange} color={C.orange}/>{o.amount.toLocaleString()}
                    </div>
                    <div style={{ fontSize:10,color:C.muted }}>{satsToKsh(o.amount, rate)}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

