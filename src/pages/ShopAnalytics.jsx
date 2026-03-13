// ShopAnalytics.jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Zap, Loader, Package,
  TrendingUp, Tag, Truck, AlertTriangle,
  CheckCircle, BarChart2, Clock, Star,
  RefreshCw, ShieldCheck,
} from 'lucide-react'
import { getPool, getReadRelays, DEFAULT_RELAYS, KINDS } from '../lib/nostrSync'
import { saveProduct } from '../lib/db'
import { nip19 } from 'nostr-tools'

const C = {
  bg:     '#f7f4f0',
  white:  '#ffffff',
  black:  '#1a1410',
  muted:  '#b0a496',
  border: '#e8e0d5',
  orange: '#f7931a',
  ochre:  '#c8860a',
  terra:  '#b5451b',
  red:    '#ef4444',
}

function satsToKsh(sats) {
  const ksh = (sats / 100_000_000) * 13_000_000
  if (ksh >= 1000) return `KSh ${(ksh/1000).toFixed(1)}k`
  return `KSh ${Math.round(ksh)}`
}

function getMyPubkeyHex() {
  try { return nip19.decode(localStorage.getItem('bitsoko_npub')).data } catch { return null }
}

function parseEvent(event) {
  const tags   = event.tags || []
  const tag    = (name) => tags.find(t => t[0] === name)?.[1] || ''
  const tagAll = (name) => tags.filter(t => t[0] === name)
  const dTag     = tag('d')
  const stableId = dTag ? `${event.pubkey}:${dTag}` : event.id
  const priceTag = tags.find(t => t[0] === 'price')
  const price    = priceTag ? parseInt(priceTag[1]) || 0 : 0
  const currency = priceTag ? priceTag[2] || 'SATS' : 'SATS'
  const qtyRaw   = tag('quantity')
  const quantity  = qtyRaw !== '' ? parseInt(qtyRaw) : -1
  const RESERVED  = new Set(['bitsoko','bitcoin','deleted','active','sold'])
  const categories = tagAll('t').map(t=>t[1]).filter(v => v && !RESERVED.has(v))
  const images     = tagAll('image').map(t=>t[1]).filter(Boolean)
  const shipping   = tagAll('shipping')
  const status     = tag('status') || 'active'
  return {
    id: stableId, name: tag('title'), price, currency, quantity,
    categories, images, shipping, status,
    created_at: event.created_at,
    published_at: parseInt(tag('published_at')) || event.created_at,
    raw: event,
  }
}

function BarChart({ data, color = C.ochre }) {
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <div style={{ display:'flex', alignItems:'flex-end', gap:6, height:72 }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
          <div style={{
            width:'100%',
            height:`${Math.max((d.value / max) * 60, d.value > 0 ? 6 : 2)}px`,
            background: d.value > 0 ? color : C.border,
            borderRadius:4, transition:'height 0.4s ease', minHeight:2,
          }}/>
          <span style={{ fontSize:'0.55rem', color:C.muted, fontFamily:"'Inter',sans-serif" }}>{d.label}</span>
        </div>
      ))}
    </div>
  )
}

function StatCard({ label, value, sub, icon: Icon, accent = C.black, wide = false, valueIcon }) {
  return (
    <div style={{
      background:C.white, borderRadius:14,
      border:`1px solid ${C.border}`, padding:'14px 16px',
      gridColumn: wide ? 'span 2' : undefined,
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
        {Icon && <Icon size={13} color={accent}/>}
        <span style={{ fontSize:'0.62rem', color:C.muted, textTransform:'uppercase', letterSpacing:'0.08em' }}>{label}</span>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
        {valueIcon && <Zap size={16} fill={C.orange} color={C.orange}/>}
        <div style={{ fontSize: wide?'1.5rem':'1.4rem', fontWeight:800, color:C.black, lineHeight:1 }}>{value}</div>
      </div>
      {sub && <div style={{ fontSize:'0.65rem', color:C.muted, marginTop:4 }}>{sub}</div>}
    </div>
  )
}

function SectionHeader({ title, icon: Icon }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
      {Icon && <Icon size={14} color={C.ochre}/>}
      <span style={{ fontSize:'0.8rem', fontWeight:700, color:C.black }}>{title}</span>
    </div>
  )
}

export default function ShopAnalytics() {
  const navigate  = useNavigate()
  const pubkeyHex = getMyPubkeyHex()

  const [products,   setProducts]   = useState([])
  const [loading,    setLoading]    = useState(true)
  const [lastFetch,  setLastFetch]  = useState(null)
  const [chartRange, setChartRange] = useState('month')

  const fetchFromRelay = async () => {
    if (!pubkeyHex) { setLoading(false); return }
    setLoading(true)
    try {
      const relays = [...new Set([...getReadRelays(), ...DEFAULT_RELAYS])]
      const pool   = getPool()
      const events = await pool.querySync(relays, { kinds:[KINDS.LISTING], authors:[pubkeyHex], limit:1000 })
      const map = new Map()
      for (const e of events) {
        const dTag = (e.tags||[]).find(t=>t[0]==='d')?.[1]
        const key  = dTag ? `${e.pubkey}:${dTag}` : e.id
        const ex   = map.get(key)
        if (!ex || e.created_at >= ex.created_at) map.set(key, e)
      }
      const parsed = Array.from(map.values()).map(parseEvent)
      for (const e of map.values()) { try { await saveProduct(e) } catch {} }
      setProducts(parsed)
      setLastFetch(new Date())
    } catch(e) { console.error('[bitsoko] analytics fetch error:', e) }
    setLoading(false)
  }

  useEffect(() => { fetchFromRelay() }, [pubkeyHex])

  const active   = products.filter(p => p.status !== 'deleted' && !p.raw?.tags?.some(t=>t[0]==='t'&&t[1]==='deleted'))
  const deleted  = products.filter(p => p.status === 'deleted' || p.raw?.tags?.some(t=>t[0]==='t'&&t[1]==='deleted'))

  const totalSats    = active.reduce((s,p) => s + p.price, 0)
  const avgPrice     = active.length ? Math.round(totalSats / active.length) : 0
  const maxPrice     = active.length ? Math.max(...active.map(p=>p.price)) : 0
  const minPrice     = active.length ? Math.min(...active.map(p=>p.price)) : 0
  const withImages   = active.filter(p => p.images.length > 0)
  const withShipping = active.filter(p => p.shipping.length > 0)
  const unlimited    = active.filter(p => p.quantity === -1)
  const outOfStock   = active.filter(p => p.quantity === 0)
  const lowStock     = active.filter(p => p.quantity > 0 && p.quantity <= 3)
  const hasNoPhotos  = active.filter(p => p.images.length === 0)
  const noShipping   = active.filter(p => p.shipping.length === 0)

  const catCount = {}
  for (const p of active) {
    for (const c of (p.categories.length ? p.categories : ['Uncategorized'])) {
      catCount[c] = (catCount[c] || 0) + 1
    }
  }
  const catSorted = Object.entries(catCount).sort((a,b) => b[1]-a[1])

  const tiers = [
    { label:'<1k',    min:0,     max:1000     },
    { label:'1k–5k',  min:1000,  max:5000     },
    { label:'5k–20k', min:5000,  max:20000    },
    { label:'20k+',   min:20000, max:Infinity },
  ]
  const tierData = tiers.map(t => ({
    label: t.label,
    value: active.filter(p => p.price >= t.min && p.price < t.max).length,
  }))

  const now = Math.floor(Date.now() / 1000)
  const DAY = 86400
  const chartData = (() => {
    if (chartRange === 'week') {
      return Array.from({ length:7 }, (_,i) => {
        const start = now - (6-i)*DAY; const end = start + DAY
        return { label: new Date(start*1000).toLocaleDateString('en',{weekday:'short'}), value: active.filter(p=>p.created_at>=start&&p.created_at<end).length }
      })
    }
    if (chartRange === 'month') {
      return Array.from({ length:4 }, (_,i) => {
        const start = now - (3-i)*7*DAY; const end = start + 7*DAY
        return { label:`W${i+1}`, value: active.filter(p=>p.created_at>=start&&p.created_at<end).length }
      })
    }
    return Array.from({ length:12 }, (_,i) => {
      const d = new Date(); d.setMonth(d.getMonth()-(11-i)); d.setDate(1)
      const start = Math.floor(d.getTime()/1000)
      const nextD = new Date(d); nextD.setMonth(nextD.getMonth()+1)
      const end   = Math.floor(nextD.getTime()/1000)
      return { label: d.toLocaleDateString('en',{month:'short'}), value: active.filter(p=>p.created_at>=start&&p.created_at<end).length }
    })
  })()

  const oldest    = active.length ? Math.min(...active.map(p=>p.created_at)) : null
  const daysSince = oldest ? Math.floor((now - oldest) / DAY) : 0
  const topByPrice = [...active].sort((a,b)=>b.price-a.price).slice(0,3)

  // Health score — ochre/terra instead of green
  const healthScore = active.length === 0 ? 0 : Math.round(
    ((withImages.length / active.length) * 40) +
    ((withShipping.length / active.length) * 30) +
    (outOfStock.length === 0 ? 20 : 0) +
    (localStorage.getItem('bitsoko_ln') ? 10 : 0)
  )
  const healthColor = healthScore >= 80 ? C.ochre : healthScore >= 50 ? C.orange : C.red
  const healthLabel = healthScore >= 80 ? 'Great' : healthScore >= 50 ? 'Needs work' : 'Poor'

  if (loading) {
    return (
      <div style={{ minHeight:'100vh', background:C.bg, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12 }}>
        <Loader size={28} color={C.ochre} style={{ animation:'spin 1s linear infinite' }}/>
        <div style={{ fontSize:'0.8rem', color:C.muted }}>Fetching from relay…</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ background:C.bg, minHeight:'100vh', fontFamily:"'Inter',sans-serif", paddingBottom:120 }}>

      {/* Header */}
      <div style={{ background:C.white, borderBottom:`1px solid ${C.border}`, padding:'16px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:50 }}>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <button onClick={()=>navigate(-1)} style={{ width:36, height:36, borderRadius:'50%', background:C.bg, border:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
            <ArrowLeft size={17} color={C.black}/>
          </button>
          <div>
            <div style={{ fontSize:16, fontWeight:700, color:C.black }}>Shop Analytics</div>
            <div style={{ fontSize:10, color:C.muted }}>
              {lastFetch ? `Updated ${lastFetch.toLocaleTimeString('en',{hour:'2-digit',minute:'2-digit'})}` : 'Live from relay'}
            </div>
          </div>
        </div>
        <button onClick={fetchFromRelay} style={{ width:36, height:36, borderRadius:'50%', background:C.bg, border:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
          <RefreshCw size={15} color={C.black}/>
        </button>
      </div>

      <div style={{ padding:'20px', display:'flex', flexDirection:'column', gap:24 }}>

        {active.length === 0 && (
          <div style={{ textAlign:'center', padding:'48px 20px', display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
            <Package size={44} color={C.border}/>
            <div style={{ fontSize:15, fontWeight:700, color:C.black }}>No listings found</div>
            <div style={{ fontSize:12, color:C.muted }}>Publish your first product and come back</div>
            <button onClick={()=>navigate('/create-listing')} style={{ marginTop:8, padding:'12px 28px', background:C.black, border:'none', borderRadius:12, cursor:'pointer', fontSize:14, fontWeight:700, color:C.white }}>
              + List a product
            </button>
          </div>
        )}

        {active.length > 0 && (<>

          {/* Overview */}
          <section>
            <SectionHeader title="Overview" icon={BarChart2}/>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <StatCard label="Active listings"  value={active.length}                         sub={deleted.length > 0 ? `${deleted.length} removed` : 'All live'}/>
              <StatCard label="Catalog value"    value={`${totalSats.toLocaleString()} sats`}  sub={satsToKsh(totalSats)} valueIcon/>
              <StatCard label="Avg price"        value={`${avgPrice.toLocaleString()} sats`}   sub={satsToKsh(avgPrice)}  valueIcon/>
              <StatCard label="Store age"        value={`${daysSince}d`}                       sub={oldest ? new Date(oldest*1000).toLocaleDateString('en',{month:'short',year:'numeric'}) : ''}/>
              <StatCard label="Price range" wide value={`${minPrice.toLocaleString()} – ${maxPrice.toLocaleString()} sats`} sub={`${satsToKsh(minPrice)} – ${satsToKsh(maxPrice)}`} icon={Zap} valueIcon/>
            </div>
          </section>

          {/* Shop Health */}
          <section>
            <SectionHeader title="Shop Health" icon={ShieldCheck}/>
            <div style={{ background:C.white, borderRadius:14, border:`1px solid ${C.border}`, padding:'16px' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                <div>
                  <div style={{ fontSize:32, fontWeight:800, color:healthColor, lineHeight:1 }}>{healthScore}</div>
                  <div style={{ fontSize:11, color:healthColor, fontWeight:600, marginTop:2 }}>{healthLabel}</div>
                </div>
                <div style={{ width:64, height:64, borderRadius:'50%', border:`4px solid ${healthColor}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span style={{ fontSize:18, fontWeight:800, color:healthColor }}>{healthScore}</span>
                </div>
              </div>
              <div style={{ height:6, background:C.bg, borderRadius:99, overflow:'hidden', marginBottom:16 }}>
                <div style={{ width:`${healthScore}%`, height:'100%', background:healthColor, borderRadius:99, transition:'width 0.6s ease' }}/>
              </div>
              {[
                { ok: withImages.length === active.length,   label:`Photos on all listings (${withImages.length}/${active.length})`,         pts:40 },
                { ok: withShipping.length === active.length, label:`Shipping set on all listings (${withShipping.length}/${active.length})`,  pts:30 },
                { ok: outOfStock.length === 0,               label:'No out-of-stock listings',                                                pts:20 },
                { ok: !!localStorage.getItem('bitsoko_ln'),  label:'Lightning address set on profile',                                       pts:10 },
              ].map(({ok, label, pts}) => (
                <div key={label} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                  <div style={{
                    width:20, height:20, borderRadius:'50%',
                    background: ok ? `rgba(200,134,10,0.1)` : 'rgba(181,69,27,0.08)',
                    border: `1.5px solid ${ok ? C.ochre : C.terra}`,
                    display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
                  }}>
                    {ok
                      ? <CheckCircle size={11} color={C.ochre}/>
                      : <AlertTriangle size={11} color={C.terra}/>
                    }
                  </div>
                  <div style={{ flex:1, fontSize:12, color: ok ? C.black : C.muted }}>{label}</div>
                  <div style={{ fontSize:10, fontWeight:700, color: ok ? C.ochre : C.muted }}>+{pts}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Listings over time */}
          <section>
            <SectionHeader title="Listings published" icon={TrendingUp}/>
            <div style={{ background:C.white, borderRadius:14, border:`1px solid ${C.border}`, padding:'16px' }}>
              <div style={{ display:'flex', gap:4, background:C.bg, borderRadius:10, padding:3, marginBottom:16 }}>
                {[['week','7d'],['month','4w'],['year','12mo']].map(([key,label]) => (
                  <button key={key} onClick={()=>setChartRange(key)} style={{
                    flex:1, padding:'6px 4px', borderRadius:8,
                    background:chartRange===key?C.white:'transparent',
                    border:'none', cursor:'pointer',
                    fontSize:11, fontWeight:chartRange===key?700:400,
                    color:chartRange===key?C.black:C.muted,
                    boxShadow:chartRange===key?'0 1px 4px rgba(26,20,16,0.08)':'none',
                  }}>{label}</button>
                ))}
              </div>
              <BarChart data={chartData} color={C.ochre}/>
            </div>
          </section>

          {/* Category breakdown */}
          {catSorted.length > 0 && (
            <section>
              <SectionHeader title="Category breakdown" icon={Tag}/>
              <div style={{ background:C.white, borderRadius:14, border:`1px solid ${C.border}`, padding:'16px', display:'flex', flexDirection:'column', gap:10 }}>
                {catSorted.map(([cat, count]) => (
                  <div key={cat}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                      <span style={{ fontSize:12, fontWeight:600, color:C.black }}>{cat}</span>
                      <span style={{ fontSize:11, color:C.muted }}>{count} listing{count!==1?'s':''}</span>
                    </div>
                    <div style={{ height:5, background:C.bg, borderRadius:99, overflow:'hidden' }}>
                      <div style={{ width:`${(count/active.length)*100}%`, height:'100%', background:C.ochre, borderRadius:99, transition:'width 0.5s ease' }}/>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Price tiers */}
          <section>
            <SectionHeader title="Price distribution (sats)" icon={Zap}/>
            <div style={{ background:C.white, borderRadius:14, border:`1px solid ${C.border}`, padding:'16px' }}>
              <BarChart data={tierData} color={C.orange}/>
            </div>
          </section>

          {/* Top by price */}
          {topByPrice.length > 0 && (
            <section>
              <SectionHeader title="Top listings by price" icon={Star}/>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {topByPrice.map((p, i) => (
                  <div key={p.id} onClick={()=>navigate(`/product/${p.id}`)} style={{
                    background:C.white, borderRadius:14, border:`1px solid ${C.border}`,
                    padding:'12px 14px', display:'flex', alignItems:'center', gap:12, cursor:'pointer',
                  }}>
                    <div style={{ width:28, height:28, borderRadius:8, background:i===0?C.black:C.bg, border:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <span style={{ fontSize:11, fontWeight:800, color:i===0?C.white:C.muted }}>#{i+1}</span>
                    </div>
                    {p.images[0] && (
                      <img src={p.images[0]} alt="" loading="eager" decoding="async"
                        style={{ width:44, height:44, borderRadius:8, objectFit:'cover', flexShrink:0 }}/>
                    )}
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:C.black, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name || 'Untitled'}</div>
                      <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:2 }}>
                        <Zap size={11} fill={C.orange} color={C.orange}/>
                        <span style={{ fontSize:11, fontWeight:700, color:C.black }}>{p.price.toLocaleString()} sats</span>
                        <span style={{ fontSize:10, color:C.muted }}>· {satsToKsh(p.price)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Inventory */}
          <section>
            <SectionHeader title="Inventory status" icon={Package}/>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div style={{ background:C.white, borderRadius:14, border:`1px solid ${C.border}`, padding:'14px' }}>
                <div style={{ fontSize:10, color:C.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Unlimited stock</div>
                <div style={{ fontSize:22, fontWeight:800, color:C.black }}>{unlimited.length}</div>
                <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>digital / services</div>
              </div>
              <div style={{ background:outOfStock.length>0?'rgba(239,68,68,0.04)':C.white, borderRadius:14, border:`1px solid ${outOfStock.length>0?'rgba(239,68,68,0.2)':C.border}`, padding:'14px' }}>
                <div style={{ fontSize:10, color:outOfStock.length>0?C.red:C.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Out of stock</div>
                <div style={{ fontSize:22, fontWeight:800, color:outOfStock.length>0?C.red:C.black }}>{outOfStock.length}</div>
                <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>{outOfStock.length>0?'needs restock':'all good'}</div>
              </div>
              <div style={{ background:lowStock.length>0?`rgba(200,134,10,0.04)`:C.white, borderRadius:14, border:`1px solid ${lowStock.length>0?'rgba(200,134,10,0.2)':C.border}`, padding:'14px' }}>
                <div style={{ fontSize:10, color:lowStock.length>0?C.ochre:C.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Low stock (≤3)</div>
                <div style={{ fontSize:22, fontWeight:800, color:lowStock.length>0?C.ochre:C.black }}>{lowStock.length}</div>
                <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>{lowStock.length>0?'restock soon':''}</div>
              </div>
              <div style={{ background:C.white, borderRadius:14, border:`1px solid ${C.border}`, padding:'14px' }}>
                <div style={{ fontSize:10, color:C.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Removed</div>
                <div style={{ fontSize:22, fontWeight:800, color:C.black }}>{deleted.length}</div>
                <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>total deleted</div>
              </div>
            </div>
          </section>

          {/* Listing quality tips */}
          {(hasNoPhotos.length > 0 || noShipping.length > 0) && (
            <section>
              <SectionHeader title="Improve your listings" icon={AlertTriangle}/>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {hasNoPhotos.length > 0 && (
                  <div style={{ background:'rgba(200,134,10,0.06)', border:`1px solid rgba(200,134,10,0.2)`, borderRadius:12, padding:'14px 16px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                      <AlertTriangle size={14} color={C.ochre}/>
                      <span style={{ fontSize:13, fontWeight:700, color:C.black }}>{hasNoPhotos.length} listing{hasNoPhotos.length!==1?'s':''} without photos</span>
                    </div>
                    <div style={{ fontSize:11, color:C.muted, marginBottom:10 }}>Listings with photos get significantly more views.</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                      {hasNoPhotos.slice(0,3).map(p => (
                        <div key={p.id} onClick={()=>navigate('/shop')} style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
                          <div style={{ width:28, height:28, borderRadius:6, background:C.border, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                            <Package size={12} color={C.muted}/>
                          </div>
                          <span style={{ fontSize:12, color:C.black, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name || 'Untitled'}</span>
                        </div>
                      ))}
                      {hasNoPhotos.length > 3 && <span style={{ fontSize:10, color:C.muted }}>…and {hasNoPhotos.length-3} more</span>}
                    </div>
                  </div>
                )}
                {noShipping.length > 0 && (
                  <div style={{ background:'rgba(200,134,10,0.06)', border:`1px solid rgba(200,134,10,0.2)`, borderRadius:12, padding:'14px 16px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                      <Truck size={14} color={C.ochre}/>
                      <span style={{ fontSize:13, fontWeight:700, color:C.black }}>{noShipping.length} listing{noShipping.length!==1?'s':''} without shipping info</span>
                    </div>
                    <div style={{ fontSize:11, color:C.muted }}>Buyers want to know how they'll receive their order.</div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Quick actions */}
          <section>
            <SectionHeader title="Quick actions" icon={Clock}/>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {[
                { label:'+ Add new listing', action:'/create-listing' },
                { label:'Manage listings',   action:'/shop'           },
                { label:'Edit profile',      action:'/profile'        },
              ].map(({label, action}) => (
                <button key={action} onClick={()=>navigate(action)} style={{
                  width:'100%', padding:'14px 16px',
                  background:C.white, border:`1px solid ${C.border}`,
                  borderRadius:12, cursor:'pointer',
                  fontSize:13, fontWeight:600, color:C.black,
                  textAlign:'left', fontFamily:"'Inter',sans-serif",
                }}>
                  {label}
                </button>
              ))}
            </div>
          </section>

          <div style={{ textAlign:'center', fontSize:10, color:C.muted, paddingTop:4 }}>
            Data fetched live from Nostr relays · always up to date
          </div>
        </>)}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

