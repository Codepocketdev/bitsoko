// ShopAnalytics.jsx — fetches from relay, caches locally for instant reload
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Zap, Loader, Package,
  TrendingUp, Tag, Truck, AlertTriangle,
  CheckCircle, BarChart2, Clock, Star,
  RefreshCw, ShieldCheck, Store,
} from 'lucide-react'
import { getPool, getReadRelays, DEFAULT_RELAYS, KINDS } from '../lib/nostrSync'
import { saveProduct } from '../lib/db'
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
  terra:  '#b5451b',
  red:    '#ef4444',
  green:  '#f7931a',
}

function getMyPubkeyHex() {
  try { return nip19.decode(localStorage.getItem('bitsoko_npub')).data } catch { return null }
}

function parseEvent(event) {
  const tags    = event.tags || []
  const tag     = (name) => tags.find(t => t[0] === name)?.[1] || ''
  const tagAll  = (name) => tags.filter(t => t[0] === name)
  const dTag    = tag('d')
  const stableId = dTag ? `${event.pubkey}:${dTag}` : event.id
  const priceTag = tags.find(t => t[0] === 'price')
  const price    = priceTag ? parseInt(priceTag[1]) || 0 : 0
  const qtyRaw   = tag('quantity')
  const quantity = qtyRaw !== '' ? parseInt(qtyRaw) : -1
  const RESERVED = new Set(['bitsoko','bitcoin','deleted','active','sold','sale','deal'])
  const categories = tagAll('t').map(t=>t[1]).filter(v => v && !RESERVED.has(v))
  const images     = tagAll('image').map(t=>t[1]).filter(Boolean)
  const shipping   = tagAll('shipping').map(t => ({
    name: t[1] || '', cost: parseInt(t[2]) || 0, regions: t[4] || '',
  }))
  return {
    id: stableId, event_id: event.id, pubkey: event.pubkey,
    created_at: event.created_at,
    name:        tag('title'),
    description: event.content,
    price, quantity, categories, images, shipping,
    status:      tag('status') || 'active',
    raw:         event,
  }
}

function ScoreBar({ score, color }) {
  return (
    <div style={{ width:'100%', height:8, background:C.bg, borderRadius:4, overflow:'hidden' }}>
      <div style={{ width:`${score}%`, height:'100%', background:color, borderRadius:4, transition:'width .6s ease' }}/>
    </div>
  )
}

function StatCard({ label, value, sub, icon: Icon, color }) {
  return (
    <div style={{ background:C.white, borderRadius:14, border:`1px solid ${C.border}`, padding:'14px 16px', flex:1, minWidth:0 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
        <div style={{ width:32, height:32, borderRadius:9, background:`${color}15`, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <Icon size={15} color={color}/>
        </div>
        <span style={{ fontSize:11, color:C.muted, fontWeight:500 }}>{label}</span>
      </div>
      <div style={{ fontSize:22, fontWeight:800, color:C.black, marginBottom:2 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:C.muted }}>{sub}</div>}
    </div>
  )
}

export default function ShopAnalytics() {
  const navigate    = useNavigate()
  const pubkeyHex   = getMyPubkeyHex()
  const rate        = useRate() // ← live BTC/KES rate
  const CACHE_KEY   = `bitsoko_analytics_${pubkeyHex}`

  const [products,   setProducts]   = useState(() => {
    try { const c = localStorage.getItem(`bitsoko_analytics_${pubkeyHex}`); return c ? JSON.parse(c) : [] } catch { return [] }
  })
  const [loading,    setLoading]    = useState(true)
  const [lastFetch,  setLastFetch]  = useState(null)

  const fetchFromRelay = async () => {
    if (!pubkeyHex) { setLoading(false); return }
    setLoading(true)
    try {
      const relays = [...new Set([...getReadRelays(), ...DEFAULT_RELAYS])]
      const pool   = getPool()
      const events = await pool.querySync(relays, { kinds:[KINDS.LISTING], authors:[pubkeyHex], limit:1000 })
      const map    = new Map()
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
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(parsed)) } catch {}
    } catch(e) { console.error('[bitsoko] analytics fetch error:', e) }
    setLoading(false)
  }

  useEffect(() => {
    const c = localStorage.getItem(CACHE_KEY)
    if (c) { try { setProducts(JSON.parse(c)); setLoading(false) } catch {} }
    fetchFromRelay()
  }, [pubkeyHex])

  // ── Derived analytics ──────────────────────
  const active   = products.filter(p => p.status !== 'deleted' && !p.raw?.tags?.some(t=>t[0]==='t'&&t[1]==='deleted'))
  const deleted  = products.filter(p => p.status === 'deleted' || p.raw?.tags?.some(t=>t[0]==='t'&&t[1]==='deleted'))
  const withImg  = active.filter(p => p.images?.length > 0)
  const withDesc = active.filter(p => (p.description||'').length > 20)
  const withShip = active.filter(p => p.shipping?.length > 0)
  const withQty  = active.filter(p => p.quantity !== -1)
  const limited  = active.filter(p => p.quantity !== -1 && p.quantity < 5)
  const outOfStock = active.filter(p => p.quantity === 0)

  const totalValue = active.reduce((s, p) => s + (p.price||0), 0)
  const avgPrice   = active.length ? Math.round(totalValue / active.length) : 0
  const minPrice   = active.length ? Math.min(...active.map(p=>p.price||0)) : 0
  const maxPrice   = active.length ? Math.max(...active.map(p=>p.price||0)) : 0

  const catMap = {}
  for (const p of active) {
    for (const c of (p.categories||[])) {
      catMap[c] = (catMap[c]||0) + 1
    }
  }
  const topCats = Object.entries(catMap).sort((a,b)=>b[1]-a[1]).slice(0,5)

  const n = active.length
  const score = n === 0 ? 0 : Math.round(
    (withImg.length/n * 30) +
    (withDesc.length/n * 25) +
    (withShip.length/n * 20) +
    (withQty.length/n * 15) +
    (Math.min(n, 10)/10 * 10)
  )
  const scoreColor = score >= 70 ? C.orange : score >= 40 ? C.ochre : C.red

  const tips = []
  if (active.length - withImg.length > 0)
    tips.push({ icon: Package, msg: `${active.length - withImg.length} listing${active.length - withImg.length!==1?'s':''} missing photos — buyers skip listings without images` })
  if (active.length - withDesc.length > 0)
    tips.push({ icon: BarChart2, msg: `${active.length - withDesc.length} listing${active.length - withDesc.length!==1?'s':''} have short descriptions — more detail = more trust` })
  if (active.length - withShip.length > 0)
    tips.push({ icon: Truck, msg: `${active.length - withShip.length} listing${active.length - withShip.length!==1?'s':''} missing shipping info — buyers need to know delivery options` })
  if (limited.length > 0)
    tips.push({ icon: AlertTriangle, msg: `${limited.length} listing${limited.length!==1?'s':''} running low (< 5 left) — restock soon` })
  if (outOfStock.length > 0)
    tips.push({ icon: AlertTriangle, msg: `${outOfStock.length} listing${outOfStock.length!==1?'s':''} out of stock — mark as sold or update quantity` })
  if (tips.length === 0 && active.length > 0)
    tips.push({ icon: CheckCircle, msg: 'Great work! Your shop is well optimised.' })

  const buckets = [
    { label: '< 1k',     min: 0,      max: 1000      },
    { label: '1k–10k',   min: 1000,   max: 10000     },
    { label: '10k–50k',  min: 10000,  max: 50000     },
    { label: '50k–100k', min: 50000,  max: 100000    },
    { label: '> 100k',   min: 100000, max: Infinity   },
  ]
  const priceDist = buckets.map(b => ({
    ...b, count: active.filter(p => p.price >= b.min && p.price < b.max).length
  }))
  const maxBucketCount = Math.max(...priceDist.map(b=>b.count), 1)

  return (
    <div style={{ background:C.bg, minHeight:'100vh', fontFamily:"'Inter',sans-serif", paddingBottom:80 }}>

      {/* Header */}
      <div style={{ background:C.white, borderBottom:`1px solid ${C.border}`, padding:'16px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:50 }}>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <button onClick={() => navigate('/shop')} style={{ width:36, height:36, borderRadius:'50%', background:C.bg, border:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
            <ArrowLeft size={17} color={C.black}/>
          </button>
          <div>
            <div style={{ fontSize:'1rem', fontWeight:700, color:C.black }}>Shop Analytics</div>
            {lastFetch && <div style={{ fontSize:11, color:C.muted }}>Updated {lastFetch.toLocaleTimeString('en',{hour:'2-digit',minute:'2-digit'})}</div>}
          </div>
        </div>
        <button onClick={fetchFromRelay} disabled={loading} style={{ width:36, height:36, borderRadius:'50%', background:C.bg, border:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
          {loading
            ? <Loader size={15} color={C.ochre} style={{ animation:'spin 1s linear infinite' }}/>
            : <RefreshCw size={15} color={C.black}/>
          }
        </button>
      </div>

      <div style={{ padding:'16px' }}>

        {!loading && active.length === 0 && (
          <div style={{ textAlign:'center', padding:'48px 20px' }}>
            <Store size={44} color={C.border} style={{ margin:'0 auto 12px', display:'block' }}/>
            <div style={{ fontSize:'1rem', fontWeight:700, color:C.black, marginBottom:8 }}>No listings yet</div>
            <div style={{ fontSize:'0.82rem', color:C.muted, marginBottom:20 }}>Create your first listing to see analytics</div>
            <button onClick={() => navigate('/create-listing')} style={{ padding:'12px 24px', background:C.black, border:'none', borderRadius:12, cursor:'pointer', fontSize:'0.85rem', fontWeight:700, color:C.white }}>
              Create listing
            </button>
          </div>
        )}

        {active.length > 0 && (
          <>
            {/* Health score */}
            <div style={{ background:C.white, borderRadius:14, border:`1px solid ${C.border}`, padding:'16px', marginBottom:14 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <ShieldCheck size={16} color={scoreColor}/>
                  <span style={{ fontSize:14, fontWeight:700, color:C.black }}>Shop health</span>
                </div>
                <span style={{ fontSize:22, fontWeight:800, color:scoreColor }}>{score}<span style={{ fontSize:14, color:C.muted }}>/100</span></span>
              </div>
              <ScoreBar score={score} color={scoreColor}/>
              <div style={{ fontSize:11, color:C.muted, marginTop:8 }}>
                {score >= 70 ? 'Your shop is well optimised' : score >= 40 ? 'Room for improvement — see tips below' : 'Needs attention — see tips below'}
              </div>
            </div>

            {/* Stat row 1 */}
            <div style={{ display:'flex', gap:10, marginBottom:10 }}>
              <StatCard label="Active listings" value={active.length} sub={`${deleted.length} archived`} icon={Package} color={C.ochre}/>
              <StatCard label="Catalog value" value={`${(totalValue/1000).toFixed(0)}k`} sub={satsToKsh(totalValue, rate)} icon={Zap} color={C.orange}/>
            </div>

            {/* Stat row 2 */}
            <div style={{ display:'flex', gap:10, marginBottom:14 }}>
              <StatCard label="Avg price" value={`${(avgPrice/1000).toFixed(1)}k`} sub={`sats · ${satsToKsh(avgPrice, rate)}`} icon={TrendingUp} color={C.green}/>
              <StatCard label="With photos" value={`${withImg.length}/${active.length}`} sub={`${Math.round(withImg.length/active.length*100)}% coverage`} icon={Star} color={C.green}/>
            </div>

            {/* Category breakdown */}
            {topCats.length > 0 && (
              <div style={{ background:C.white, borderRadius:14, border:`1px solid ${C.border}`, padding:'16px', marginBottom:14 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
                  <Tag size={14} color={C.ochre}/>
                  <span style={{ fontSize:14, fontWeight:700, color:C.black }}>Categories</span>
                </div>
                {topCats.map(([cat, count]) => (
                  <div key={cat} style={{ marginBottom:10 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                      <span style={{ fontSize:12, color:C.black }}>{cat}</span>
                      <span style={{ fontSize:12, fontWeight:600, color:C.black }}>{count}</span>
                    </div>
                    <ScoreBar score={Math.round(count/active.length*100)} color={C.ochre}/>
                  </div>
                ))}
              </div>
            )}

            {/* Price distribution */}
            <div style={{ background:C.white, borderRadius:14, border:`1px solid ${C.border}`, padding:'16px', marginBottom:14 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
                <BarChart2 size={14} color={C.ochre}/>
                <span style={{ fontSize:14, fontWeight:700, color:C.black }}>Price distribution</span>
              </div>
              <div style={{ display:'flex', alignItems:'flex-end', gap:6, height:80 }}>
                {priceDist.map(b => (
                  <div key={b.label} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                    <div style={{ fontSize:10, fontWeight:700, color:C.black }}>{b.count||''}</div>
                    <div style={{ width:'100%', background:b.count>0?C.orange:C.border, borderRadius:'4px 4px 0 0', height:`${Math.round(b.count/maxBucketCount*64)+4}px`, transition:'height .4s ease' }}/>
                    <div style={{ fontSize:9, color:C.muted, textAlign:'center', lineHeight:1.2 }}>{b.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Inventory */}
            <div style={{ background:C.white, borderRadius:14, border:`1px solid ${C.border}`, padding:'16px', marginBottom:14 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
                <Package size={14} color={C.ochre}/>
                <span style={{ fontSize:14, fontWeight:700, color:C.black }}>Inventory</span>
              </div>
              {[
                { label:'Unlimited stock (digital/services)', count: active.filter(p=>p.quantity===-1).length, color:C.green   },
                { label:'In stock',                           count: active.filter(p=>p.quantity>5).length,    color:C.ochre   },
                { label:'Running low (< 5)',                  count: limited.length,                           color:C.orange  },
                { label:'Out of stock',                       count: outOfStock.length,                        color:C.red     },
              ].map(({ label, count, color }) => (
                <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:color }}/>
                    <span style={{ fontSize:12, color:C.black }}>{label}</span>
                  </div>
                  <span style={{ fontSize:12, fontWeight:700, color:count>0?color:C.muted }}>{count}</span>
                </div>
              ))}
            </div>

            {/* Tips */}
            <div style={{ background:C.white, borderRadius:14, border:`1px solid ${C.border}`, padding:'16px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
                <Star size={14} color={C.ochre}/>
                <span style={{ fontSize:14, fontWeight:700, color:C.black }}>Listing quality tips</span>
              </div>
              {tips.map(({ icon: Icon, msg }, i) => (
                <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:10, marginBottom:10, padding:'10px 12px', background:C.bg, borderRadius:10 }}>
                  <Icon size={14} color={C.ochre} style={{ flexShrink:0, marginTop:1 }}/>
                  <span style={{ fontSize:12, color:C.black, lineHeight:1.5 }}>{msg}</span>
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

