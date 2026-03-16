// Deals.jsx
// ─────────────────────────────────────────────
// Deals = products sellers have intentionally marked
// with t:sale or t:deal tags on their kind:30402 events.
//
// This is NOT a price algorithm — it's seller intent.
// A seller marks something as a deal when they want to
// move it fast: excess stock, promo launch, limited time.
//
// Data: always fetched from relay with
//   { kinds:[30402], '#t':['sale','deal'] }
// No IndexedDB dependency — works after clearing data.
// Also saves to IndexedDB as a side effect.
// ─────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Zap, Package, Loader, Tag,
  Smartphone, Shirt, Coffee, Palette,
  Home as HomeIcon, BookOpen, Music, Leaf,
  RefreshCw, Store, ArrowUpDown, ChevronDown,
  AlertCircle,
} from 'lucide-react'
import { getPool, getReadRelays, DEFAULT_RELAYS, KINDS } from '../lib/nostrSync'
import { getProfile, saveProfile, saveProduct } from '../lib/db'

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
  green:  '#22c55e',
  deal:   '#e8614a', // deal badge color
}

const CATEGORIES = [
  { icon: Smartphone, label: 'Electronics',  tag: 'Electronics'   },
  { icon: Shirt,      label: 'Fashion',      tag: 'Fashion'       },
  { icon: Coffee,     label: 'Food',         tag: 'Food & Drinks' },
  { icon: Palette,    label: 'Art',          tag: 'Art & Crafts'  },
  { icon: HomeIcon,   label: 'Home',         tag: 'Home & Living' },
  { icon: BookOpen,   label: 'Books',        tag: 'Books'         },
  { icon: Music,      label: 'Music',        tag: 'Music'         },
  { icon: Leaf,       label: 'Wellness',     tag: 'Wellness'      },
]

const SORT_OPTIONS = [
  { key: 'newest',    label: 'Newest first'      },
  { key: 'price_asc', label: 'Price: low → high' },
  { key: 'price_desc',label: 'Price: high → low' },
]

const PAGE_SIZE = 20

function satsToKsh(sats) {
  const ksh = (sats / 100_000_000) * 13_000_000
  if (ksh >= 1000) return `KSh ${(ksh/1000).toFixed(1)}k`
  return `KSh ${Math.round(ksh)}`
}

// Parse raw kind:30402 event into product object
function parseEvent(event) {
  const tags   = event.tags || []
  const tag    = (name) => tags.find(t => t[0] === name)?.[1] || ''
  const tagAll = (name) => tags.filter(t => t[0] === name)

  const dTag     = tag('d')
  const stableId = dTag ? `${event.pubkey}:${dTag}` : event.id

  const priceTag = tags.find(t => t[0] === 'price')
  const price    = priceTag ? parseInt(priceTag[1]) || 0 : 0

  const RESERVED = new Set(['bitsoko','bitcoin','deleted','active','sold','sale','deal'])
  const categories    = tagAll('t').map(t=>t[1]).filter(v => v && !RESERVED.has(v))
  const images        = tagAll('image').map(t=>t[1]).filter(Boolean)

  // Original price tag — sellers set this to show discount
  // e.g. ['original_price', '100000', 'SATS']
  const origTag       = tags.find(t => t[0] === 'original_price')
  const originalPrice = origTag ? parseInt(origTag[1]) || 0 : 0
  const discount      = originalPrice > price && originalPrice > 0
    ? Math.round(((originalPrice - price) / originalPrice) * 100)
    : 0

  return {
    id:            stableId,
    event_id:      event.id,
    pubkey:        event.pubkey,
    created_at:    event.created_at,
    name:          tag('title'),
    price,
    originalPrice,
    discount,
    categories,
    images,
    status:        tag('status') || 'active',
    raw:           event,
  }
}

function Avatar({ profile, pubkey, size = 28 }) {
  const [err, setErr] = useState(false)
  const name   = profile?.display_name || profile?.name || pubkey?.slice(0,2) || '?'
  const letter = name[0].toUpperCase()
  if (profile?.picture && !err) {
    return <img src={profile.picture} alt={letter} onError={() => setErr(true)}
      style={{ width:size, height:size, borderRadius:'50%', objectFit:'cover', flexShrink:0, border:`1.5px solid ${C.border}` }}/>
  }
  return (
    <div style={{ width:size, height:size, borderRadius:'50%', background:C.black, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:size*0.38, color:C.white }}>
      {letter}
    </div>
  )
}

function DealCard({ product, profile, onClick }) {
  const image      = product.images?.[0]
  const [imgErr, setImgErr] = useState(false)
  const sellerName = profile?.display_name || profile?.name || product.pubkey?.slice(0,8) + '…'

  return (
    <div onClick={onClick} style={{
      background: C.white, borderRadius: 16,
      border: `1px solid ${C.border}`, overflow: 'hidden',
      cursor: 'pointer', position: 'relative',
    }}>
      {/* Deal badge — shows discount % if available, else just DEAL */}
      <div style={{
        position: 'absolute', top: 8, right: 8, zIndex: 2,
        background: C.deal, borderRadius: 99,
        padding: '3px 8px', fontSize: 9, fontWeight: 800,
        color: C.white, letterSpacing: '0.08em',
        fontFamily: "'Inter',sans-serif",
      }}>
        {product.discount > 0 ? `-${product.discount}%` : 'DEAL'}
      </div>

      {/* Image */}
      <div style={{ aspectRatio: '1', background: C.bg, overflow: 'hidden', position: 'relative' }}>
        {image && !imgErr
          ? <img src={image} alt={product.name}
              onError={() => setImgErr(true)}
              loading="eager" decoding="async"
              style={{ width:'100%', height:'100%', objectFit:'cover', willChange:'transform' }}/>
          : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Package size={28} color="rgba(26,20,16,0.12)"/>
            </div>
        }
        {/* Price badge */}
        <div style={{
          position: 'absolute', bottom: 8, left: 8,
          background: 'rgba(26,20,16,0.85)', backdropFilter: 'blur(4px)',
          borderRadius: 99, padding: '3px 8px',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <Zap size={10} fill={C.orange} color={C.orange}/>
          <span style={{ fontSize:10, fontWeight:700, color:C.white, fontFamily:"'Inter',sans-serif" }}>
            {product.price?.toLocaleString()} sats
          </span>
        </div>
      </div>

      {/* Info */}
      <div style={{ padding: '10px 12px 12px' }}>
        <div style={{ fontSize:13, fontWeight:600, color:C.black, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:2 }}>
          {product.name || 'Untitled'}
        </div>
        <div style={{ marginBottom:6 }}>
          {product.originalPrice > 0 && product.originalPrice > product.price && (
            <div style={{ fontSize:10,color:C.muted,textDecoration:'line-through',marginBottom:1 }}>
              {product.originalPrice.toLocaleString()} sats
            </div>
          )}
          <div style={{ display:'flex',alignItems:'center',gap:4 }}>
            <Zap size={10} fill={C.orange} color={C.orange}/>
            <span style={{ fontSize:12,fontWeight:700,color:C.black }}>{product.price?.toLocaleString()} sats</span>
          </div>
          <div style={{ fontSize:10,color:C.muted }}>{satsToKsh(product.price)}</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <Avatar profile={profile} pubkey={product.pubkey} size={16}/>
          <span style={{ fontSize:10, color:C.muted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {sellerName}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Sort sheet ────────────────────────────────
function SortSheet({ current, onSelect, onClose }) {
  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(26,20,16,0.45)', backdropFilter:'blur(2px)' }}/>
      <div style={{
        position:'fixed', bottom:0, left:0, right:0, zIndex:210,
        background:C.white, borderRadius:'20px 20px 0 0',
        padding:'16px 20px 48px',
        animation:'sheetUp .22s cubic-bezier(0.32,0.72,0,1)',
      }}>
        <div style={{ width:36, height:4, borderRadius:2, background:C.border, margin:'0 auto 16px' }}/>
        <div style={{ fontSize:14, fontWeight:700, color:C.black, marginBottom:14 }}>Sort by</div>
        {SORT_OPTIONS.map(({ key, label }) => (
          <button key={key} onClick={() => { onSelect(key); onClose() }} style={{
            width:'100%', padding:'14px 16px', borderRadius:12,
            background: current === key ? 'rgba(200,134,10,0.08)' : C.bg,
            border: `1.5px solid ${current === key ? C.ochre : C.border}`,
            cursor:'pointer', textAlign:'left',
            fontSize:14, fontWeight: current === key ? 700 : 400,
            color: current === key ? C.ochre : C.black,
            marginBottom:8, fontFamily:"'Inter',sans-serif",
          }}>
            {label}
          </button>
        ))}
      </div>
    </>
  )
}

export default function Deals() {
  const navigate = useNavigate()

  const [products,     setProducts]     = useState([])
  const [profiles,     setProfiles]     = useState({})
  const [loading,      setLoading]      = useState(true)
  const [lastFetch,    setLastFetch]    = useState(null)
  const [selectedCat,  setSelectedCat]  = useState(null)
  const [sortKey,      setSortKey]      = useState('newest')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [showSort,     setShowSort]     = useState(false)

  useEffect(() => { setVisibleCount(PAGE_SIZE) }, [selectedCat, sortKey])

  // ── Fetch deals from relay ────────────────
  // Relay-first — no IndexedDB dependency.
  // Queries both t:sale and t:deal tags in parallel.
  const fetchDeals = async () => {
    setLoading(true)
    try {
      const relays = [...new Set([...getReadRelays(), ...DEFAULT_RELAYS])]
      const pool   = getPool()

      // Fetch both sale and deal tagged products in parallel
      const [saleEvents, dealEvents] = await Promise.all([
        pool.querySync(relays, { kinds: [KINDS.LISTING], '#t': ['sale'],  limit: 500 }),
        pool.querySync(relays, { kinds: [KINDS.LISTING], '#t': ['deal'],  limit: 500 }),
      ])

      // Merge and deduplicate by stableId
      const all = [...saleEvents, ...dealEvents]
      const map  = new Map()
      for (const e of all) {
        const dTag = (e.tags || []).find(t => t[0] === 'd')?.[1]
        const key  = dTag ? `${e.pubkey}:${dTag}` : e.id
        const ex   = map.get(key)
        if (!ex || e.created_at >= ex.created_at) map.set(key, e)
      }

      // Parse and filter out deleted
      const parsed = Array.from(map.values())
        .map(parseEvent)
        .filter(p => p.status !== 'deleted')

      // Save to IndexedDB as side effect
      for (const e of map.values()) {
        try { await saveProduct(e) } catch {}
      }

      setProducts(parsed)
      setLastFetch(new Date())

      // Load profiles
      const pubkeys = [...new Set(parsed.map(p => p.pubkey))]
      const profMap = { ...profiles }

      for (const pk of pubkeys) {
        const cached = await getProfile(pk)
        if (cached) { profMap[pk] = cached; continue }
        // Fetch missing profiles in background
        pool.querySync(relays, { kinds: [0], authors: [pk], limit: 1 })
          .then(events => {
            if (events.length) {
              const p = JSON.parse(events[0].content)
              saveProfile(pk, p)
              setProfiles(prev => ({ ...prev, [pk]: p }))
            }
          }).catch(() => {})
      }
      setProfiles(profMap)

    } catch(e) {
      console.error('[bitsoko] deals fetch error:', e)
    }
    setLoading(false)
  }

  useEffect(() => { fetchDeals() }, [])

  // ── Filter + sort ─────────────────────────
  const filtered = products.filter(p => {
    if (!selectedCat) return true
    return (p.categories || []).includes(selectedCat)
  })

  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === 'newest')     return b.created_at - a.created_at
    if (sortKey === 'price_asc')  return a.price - b.price
    if (sortKey === 'price_desc') return b.price - a.price
    return 0
  })

  const visible = sorted.slice(0, visibleCount)

  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: "'Inter',sans-serif", paddingBottom: 100 }}>

      {/* Header */}
      <div style={{
        background: C.white, borderBottom: `1px solid ${C.border}`,
        padding: '16px 20px',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2 }}>
              <Tag size={16} color={C.deal}/>
              <span style={{ fontSize: '1rem', fontWeight: 700, color: C.black }}>Deals</span>
            </div>
            <div style={{ fontSize: 11, color: C.muted }}>
              {loading ? 'Loading…' : `${sorted.length} deal${sorted.length !== 1 ? 's' : ''} available`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {lastFetch && (
              <span style={{ fontSize: 10, color: C.muted }}>
                {lastFetch.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button onClick={fetchDeals} disabled={loading} style={{
              width: 36, height: 36, borderRadius: '50%',
              background: C.bg, border: `1px solid ${C.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}>
              <RefreshCw size={15} color={loading ? C.muted : C.black}
                style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}/>
            </button>
          </div>
        </div>

        {/* Sort + category row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setShowSort(true)} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '8px 14px', borderRadius: 99,
            background: C.bg, border: `1.5px solid ${C.border}`,
            cursor: 'pointer', fontSize: 12, fontWeight: 600, color: C.black, flexShrink: 0,
          }}>
            <ArrowUpDown size={13} color={C.ochre}/>
            {SORT_OPTIONS.find(s => s.key === sortKey)?.label}
            <ChevronDown size={12} color={C.muted}/>
          </button>
        </div>
      </div>

      {/* Category pills */}
      <div style={{ overflowX: 'auto', padding: '12px 16px 0', display: 'flex', gap: 8, scrollbarWidth: 'none' }}>
        <button onClick={() => setSelectedCat(null)} style={{
          flexShrink: 0, padding: '7px 16px', borderRadius: 99,
          background: !selectedCat ? C.black : C.white,
          border: `1.5px solid ${!selectedCat ? C.black : C.border}`,
          cursor: 'pointer', fontSize: 12, fontWeight: !selectedCat ? 700 : 400,
          color: !selectedCat ? C.white : C.black, whiteSpace: 'nowrap',
        }}>All</button>
        {CATEGORIES.map(({ icon: Icon, label, tag }) => (
          <button key={tag} onClick={() => setSelectedCat(selectedCat === tag ? null : tag)} style={{
            flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5,
            padding: '7px 14px', borderRadius: 99,
            background: selectedCat === tag ? C.black : C.white,
            border: `1.5px solid ${selectedCat === tag ? C.black : C.border}`,
            cursor: 'pointer', fontSize: 12, fontWeight: selectedCat === tag ? 700 : 400,
            color: selectedCat === tag ? C.white : C.black, whiteSpace: 'nowrap',
          }}>
            <Icon size={12} color={selectedCat === tag ? C.white : C.ochre}/>
            {label}
          </button>
        ))}
      </div>

      <div style={{ padding: '16px' }}>

        {/* Loading */}
        {loading && (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'64px 0', gap:12 }}>
            <Loader size={26} color={C.ochre} style={{ animation:'spin 1s linear infinite' }}/>
            <div style={{ fontSize:13, color:C.muted }}>Fetching deals from relays…</div>
          </div>
        )}

        {/* No deals */}
        {!loading && sorted.length === 0 && (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'48px 20px', gap:14, textAlign:'center' }}>
            <Tag size={44} color={C.border}/>
            <div style={{ fontSize:'1rem', fontWeight:700, color:C.black }}>No deals yet</div>
            <div style={{ fontSize:'0.82rem', color:C.muted, lineHeight:1.6, maxWidth:280 }}>
              Sellers can mark their listings as deals when creating or editing a product. Check back soon.
            </div>

            <div style={{ fontSize:12, color:C.muted, lineHeight:1.6, maxWidth:280, textAlign:'center' }}>
              Mark a listing as a deal when creating or editing a product to feature it here.
            </div>
          </div>
        )}

        {/* Deals grid */}
        {!loading && visible.length > 0 && (
          <>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              {visible.map(p => (
                <DealCard
                  key={p.id}
                  product={p}
                  profile={profiles[p.pubkey]}
                  onClick={() => navigate(`/product/${p.id}`)}
                />
              ))}
            </div>

            {visibleCount < sorted.length && (
              <button onClick={() => setVisibleCount(c => c + PAGE_SIZE)} style={{
                width:'100%', marginTop:16, padding:14,
                background:C.white, border:`1.5px solid ${C.border}`,
                borderRadius:14, cursor:'pointer',
                fontSize:13, fontWeight:600, color:C.black,
                fontFamily:"'Inter',sans-serif",
              }}>
                Load more · {sorted.length - visibleCount} remaining
              </button>
            )}
          </>
        )}


      </div>

      {showSort && (
        <SortSheet current={sortKey} onSelect={setSortKey} onClose={() => setShowSort(false)}/>
      )}

      <style>{`
        @keyframes spin    { to { transform: rotate(360deg) } }
        @keyframes sheetUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
        ::-webkit-scrollbar { display: none }
      `}</style>
    </div>
  )
}

