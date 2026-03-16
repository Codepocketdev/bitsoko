// Explore.jsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, X, Package, Zap, Loader,
  SlidersHorizontal, ChevronDown, ArrowUpDown,
} from 'lucide-react'
import { openDB, getProducts, getProfile, getProfiles, saveProduct } from '../lib/db'
import { fetchAndSeed, startSync, stopSync } from '../lib/nostrSync'
import { satsToKsh, useRate } from '../lib/rates'

const C = {
  bg:     '#f7f4f0',
  white:  '#ffffff',
  black:  '#1a1410',
  muted:  '#b0a496',
  border: '#e8e0d5',
  orange: '#f7931a',
  ochre:  '#c8860a',
  terra:  '#b5451b',
}

const CATEGORIES = [
  'Electronics','Fashion','Food & Drinks','Art & Crafts',
  'Home & Living','Books','Music','Wellness',
  'Services','Collectibles','Sports','Other',
]

const SORT_OPTIONS = [
  { key: 'newest',     label: 'Newest first'      },
  { key: 'oldest',     label: 'Oldest first'      },
  { key: 'price_asc',  label: 'Price: low → high' },
  { key: 'price_desc', label: 'Price: high → low' },
]

const PAGE_SIZE   = 20
const DEBOUNCE_MS = 300

// ── Product card ──────────────────────────────
function ProductCard({ product, profile, onClick, rate }) {
  const image      = product.images?.[0]
  const [imgErr, setImgErr] = useState(false)
  const sellerName = profile?.display_name || profile?.name || product.pubkey?.slice(0,8) + '…'

  return (
    <div onClick={onClick} style={{
      background: C.white, borderRadius: 14,
      border: `1px solid ${C.border}`, overflow: 'hidden',
      cursor: 'pointer', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ aspectRatio: '1', background: C.border, overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
        {image && !imgErr
          ? <img
              src={image} alt={product.name}
              onError={() => setImgErr(true)}
              loading="eager" decoding="async"
              style={{ width: '100%', height: '100%', objectFit: 'cover', willChange: 'transform' }}
            />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Package size={28} color="rgba(26,20,16,0.15)"/>
            </div>
        }
        <div style={{
          position: 'absolute', bottom: 8, left: 8,
          background: 'rgba(26,20,16,0.75)', borderRadius: 99,
          padding: '3px 8px', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <Zap size={10} fill={C.orange} color={C.orange}/>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.white, fontFamily: "'Inter',sans-serif" }}>
            {product.price?.toLocaleString()}
          </span>
        </div>
      </div>
      <div style={{ padding: '10px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.black, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {product.name || 'Untitled'}
        </div>
        <div style={{ fontSize: 11, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {sellerName}
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
          {satsToKsh(product.price, rate)}
        </div>
      </div>
    </div>
  )
}

// ── Sort sheet ────────────────────────────────
function SortSheet({ current, onSelect, onClose }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(26,20,16,0.45)', backdropFilter: 'blur(2px)' }}/>
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 210,
        background: C.white, borderRadius: '20px 20px 0 0',
        padding: '16px 20px 48px',
        animation: 'sheetUp .22s cubic-bezier(0.32,0.72,0,1)',
      }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: C.border, margin: '0 auto 16px' }}/>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.black, marginBottom: 14 }}>Sort by</div>
        {SORT_OPTIONS.map(({ key, label }) => (
          <button key={key} onClick={() => { onSelect(key); onClose() }} style={{
            width: '100%', padding: '14px 16px', borderRadius: 12,
            background: current === key ? 'rgba(200,134,10,0.08)' : C.bg,
            border: `1.5px solid ${current === key ? C.ochre : C.border}`,
            cursor: 'pointer', textAlign: 'left',
            fontSize: 14, fontWeight: current === key ? 700 : 400,
            color: current === key ? C.ochre : C.black,
            marginBottom: 8, fontFamily: "'Inter',sans-serif",
          }}>
            {label}
          </button>
        ))}
      </div>
    </>
  )
}

// ── Filter sheet ──────────────────────────────
function FilterSheet({ selectedCat, priceMax, onApply, onClose, rate }) {
  const [cat,   setCat]   = useState(selectedCat)
  const [price, setPrice] = useState(priceMax || '')

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(26,20,16,0.45)', backdropFilter: 'blur(2px)' }}/>
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 210,
        background: C.white, borderRadius: '20px 20px 0 0',
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        animation: 'sheetUp .22s cubic-bezier(0.32,0.72,0,1)',
      }}>
        <div style={{ padding: '16px 20px 0', flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: C.border, margin: '0 auto 16px' }}/>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.black }}>Filters</span>
            <button onClick={() => { setCat(''); setPrice('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: C.muted }}>
              Clear all
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 16px' }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.black, marginBottom: 10 }}>Category</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {CATEGORIES.map(c => (
                <button key={c} onClick={() => setCat(cat === c ? '' : c)} style={{
                  padding: '7px 14px', borderRadius: 99,
                  background: cat === c ? C.black : C.white,
                  border: `1.5px solid ${cat === c ? C.black : C.border}`,
                  cursor: 'pointer', fontSize: 12,
                  fontWeight: cat === c ? 700 : 400,
                  color: cat === c ? C.white : C.black,
                }}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.black, marginBottom: 8 }}>Max price (sats)</div>
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}>
                <Zap size={14} fill={C.orange} color={C.orange}/>
              </div>
              <input
                type="number" min="0" value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="No limit"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '11px 14px 11px 34px',
                  background: C.bg, border: `1.5px solid ${price ? C.black : C.border}`,
                  borderRadius: 12, outline: 'none',
                  fontSize: 14, color: C.black, fontFamily: "'Inter',sans-serif",
                }}
              />
            </div>
            {price && <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>≈ {satsToKsh(parseInt(price), rate)}</div>}
          </div>
        </div>

        <div style={{ padding: '12px 20px 48px', borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
          <button onClick={() => { onApply({ cat, priceMax: price ? parseInt(price) : null }); onClose() }} style={{
            width: '100%', padding: 14, borderRadius: 14,
            background: C.black, border: 'none', cursor: 'pointer',
            fontSize: 14, fontWeight: 700, color: C.white,
          }}>
            Apply filters
          </button>
        </div>
      </div>
    </>
  )
}

// ── Main ──────────────────────────────────────
export default function Explore() {
  const navigate = useNavigate()
  const rate     = useRate() // ← live BTC/KES rate

  const [products,     setProducts]     = useState([])
  const [profiles,     setProfiles]     = useState({})
  const [loading,      setLoading]      = useState(true)
  const [syncing,      setSyncing]      = useState(false)
  const [search,       setSearch]       = useState('')
  const [selectedCat,  setSelectedCat]  = useState('')
  const [priceMax,     setPriceMax]     = useState(null)
  const [sortKey,      setSortKey]      = useState('newest')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [showSort,     setShowSort]     = useState(false)
  const [showFilter,   setShowFilter]   = useState(false)

  const debounceTimer = useRef(null)
  const searchRef     = useRef(null)

  useEffect(() => { setVisibleCount(PAGE_SIZE) }, [search, selectedCat, priceMax, sortKey])

  const debouncedReload = useCallback(async () => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(async () => {
      const updated = await getProducts(500)
      setProducts(updated)
      const pubkeys = [...new Set(updated.map(p => p.pubkey).filter(Boolean))]
      const profs   = await getProfiles(pubkeys)
      const profMap = {}
      profs.forEach((pr, i) => { if (pr) profMap[pubkeys[i]] = pr })
      setProfiles(profMap)
    }, DEBOUNCE_MS)
  }, [])

  const loadFromDB = useCallback(async () => {
    await openDB()
    const saved = await getProducts(500)
    if (saved.length > 0) {
      setProducts(saved)
      setLoading(false)
      const pubkeys = [...new Set(saved.map(p => p.pubkey).filter(Boolean))]
      const profs   = await getProfiles(pubkeys)
      const profMap = {}
      profs.forEach((pr, i) => { if (pr) profMap[pubkeys[i]] = pr })
      setProfiles(profMap)
    }
  }, [])

  useEffect(() => {
    let mounted = true

    const init = async () => {
      await loadFromDB()
      setSyncing(true)

      await fetchAndSeed({
        onProduct: async () => { if (mounted) debouncedReload() },
        onProfile: (event) => {
          if (!mounted) return
          try {
            const p = typeof event.content === 'string' ? JSON.parse(event.content) : event.content
            setProfiles(prev => ({ ...prev, [event.pubkey]: p }))
          } catch {}
        },
        onDone: () => {
          if (!mounted) return
          setSyncing(false)
          setLoading(false)
          getProducts(500).then(all => { if (mounted) setProducts(all) })
        },
      })

      startSync({
        onProduct: async (event) => {
          if (!mounted) return
          if (event._deleted) {
            setProducts(prev => prev.filter(p => p.id !== event.id && p.event_id !== event.id))
            return
          }
          setProducts(prev => {
            const existing = prev.findIndex(p => p.id === event.id)
            if (existing >= 0) {
              if (event.created_at >= prev[existing].created_at) {
                const next = [...prev]
                next[existing] = event
                return next
              }
              return prev
            }
            return [event, ...prev]
          })
          const prof = await getProfile(event.pubkey)
          if (prof && mounted) setProfiles(prev => ({ ...prev, [event.pubkey]: prof }))
        },
        onProfile: (event) => {
          if (!mounted) return
          try {
            const p = typeof event.content === 'string' ? JSON.parse(event.content) : event.content
            setProfiles(prev => ({ ...prev, [event.pubkey]: p }))
          } catch {}
        },
      })
    }

    init()
    return () => {
      mounted = false
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      stopSync()
    }
  }, [])

  const filtered = products.filter(p => {
    if (p.status === 'deleted') return false
    const tTags = (p.tags || []).filter(t => t[0] === 't').map(t => t[1] || '')
    if (tTags.includes('deleted')) return false
    if (selectedCat && !(p.categories || []).includes(selectedCat)) return false
    if (priceMax != null && p.price > priceMax) return false
    if (search) {
      const q = search.toLowerCase()
      return p.name?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q)
    }
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === 'newest')     return b.created_at - a.created_at
    if (sortKey === 'oldest')     return a.created_at - b.created_at
    if (sortKey === 'price_asc')  return a.price - b.price
    if (sortKey === 'price_desc') return b.price - a.price
    return 0
  })

  const visible           = sorted.slice(0, visibleCount)
  const hasFilters        = selectedCat || priceMax != null
  const activeFilterCount = (selectedCat ? 1 : 0) + (priceMax != null ? 1 : 0)

  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: "'Inter',sans-serif", paddingBottom: 100 }}>

      {/* Sticky search + controls */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(247,244,240,0.95)', backdropFilter: 'blur(12px)',
        borderBottom: `1px solid ${C.border}`,
        padding: '12px 16px',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={16} color={C.muted} style={{ position: 'absolute', left: 12, pointerEvents: 'none' }}/>
          <input
            ref={searchRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search listings…"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '11px 36px 11px 36px',
              background: C.white, border: `1.5px solid ${search ? C.black : C.border}`,
              borderRadius: 12, outline: 'none',
              fontSize: 14, color: C.black, fontFamily: "'Inter',sans-serif",
            }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 10, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 4 }}>
              <X size={14} color={C.muted}/>
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => setShowSort(true)} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '8px 14px', borderRadius: 99,
            background: C.white, border: `1.5px solid ${C.border}`,
            cursor: 'pointer', fontSize: 12, fontWeight: 600, color: C.black,
          }}>
            <ArrowUpDown size={13} color={C.ochre}/>
            {SORT_OPTIONS.find(s => s.key === sortKey)?.label}
            <ChevronDown size={12} color={C.muted}/>
          </button>

          <button onClick={() => setShowFilter(true)} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '8px 14px', borderRadius: 99,
            background: activeFilterCount > 0 ? C.black : C.white,
            border: `1.5px solid ${activeFilterCount > 0 ? C.black : C.border}`,
            cursor: 'pointer', fontSize: 12, fontWeight: 600,
            color: activeFilterCount > 0 ? C.white : C.black,
          }}>
            <SlidersHorizontal size={13} color={activeFilterCount > 0 ? C.white : C.ochre}/>
            Filters
            {activeFilterCount > 0 && (
              <span style={{
                background: C.orange, color: C.white,
                fontSize: 10, fontWeight: 800,
                borderRadius: '50%', width: 16, height: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {activeFilterCount}
              </span>
            )}
          </button>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
            {syncing && <Loader size={12} color={C.ochre} style={{ animation: 'spin 1s linear infinite' }}/>}
            <span style={{ fontSize: 11, color: C.muted }}>
              {sorted.length} listing{sorted.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Category horizontal scroll */}
      <div style={{ overflowX: 'auto', padding: '12px 16px 0', display: 'flex', gap: 8, scrollbarWidth: 'none' }}>
        <button onClick={() => setSelectedCat('')} style={{
          flexShrink: 0, padding: '7px 16px', borderRadius: 99,
          background: !selectedCat ? C.black : C.white,
          border: `1.5px solid ${!selectedCat ? C.black : C.border}`,
          cursor: 'pointer', fontSize: 12, fontWeight: !selectedCat ? 700 : 400,
          color: !selectedCat ? C.white : C.black, whiteSpace: 'nowrap',
        }}>
          All
        </button>
        {CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setSelectedCat(selectedCat === cat ? '' : cat)} style={{
            flexShrink: 0, padding: '7px 16px', borderRadius: 99,
            background: selectedCat === cat ? C.black : C.white,
            border: `1.5px solid ${selectedCat === cat ? C.black : C.border}`,
            cursor: 'pointer', fontSize: 12,
            fontWeight: selectedCat === cat ? 700 : 400,
            color: selectedCat === cat ? C.white : C.black,
            whiteSpace: 'nowrap',
          }}>
            {cat}
          </button>
        ))}
      </div>

      {/* Product grid */}
      <div style={{ padding: '16px' }}>
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0', gap: 12 }}>
            <Loader size={26} color={C.ochre} style={{ animation: 'spin 1s linear infinite' }}/>
            <div style={{ fontSize: 13, color: C.muted }}>Loading listings…</div>
          </div>
        )}

        {!loading && sorted.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 20px', gap: 12, textAlign: 'center' }}>
            <Package size={44} color={C.border}/>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.black }}>
              {search || hasFilters ? 'No listings match' : 'No listings yet'}
            </div>
            <div style={{ fontSize: 13, color: C.muted }}>
              {search || hasFilters ? 'Try different search terms or filters' : 'Check back soon — syncing from relays'}
            </div>
            {(search || hasFilters) && (
              <button onClick={() => { setSearch(''); setSelectedCat(''); setPriceMax(null) }} style={{
                marginTop: 8, padding: '10px 24px', borderRadius: 12,
                background: C.black, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 700, color: C.white,
              }}>
                Clear filters
              </button>
            )}
          </div>
        )}

        {!loading && sorted.length > 0 && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {visible.map(p => (
                <ProductCard
                  key={p.id}
                  product={p}
                  profile={profiles[p.pubkey]}
                  onClick={() => navigate(`/product/${p.id}`)}
                  rate={rate}
                />
              ))}
            </div>

            {visibleCount < sorted.length && (
              <button
                onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                style={{
                  width: '100%', marginTop: 16, padding: 14,
                  background: C.white, border: `1.5px solid ${C.border}`,
                  borderRadius: 14, cursor: 'pointer',
                  fontSize: 13, fontWeight: 600, color: C.black,
                  fontFamily: "'Inter',sans-serif",
                }}
              >
                Load more · {sorted.length - visibleCount} remaining
              </button>
            )}
          </>
        )}
      </div>

      {showSort && (
        <SortSheet current={sortKey} onSelect={setSortKey} onClose={() => setShowSort(false)}/>
      )}
      {showFilter && (
        <FilterSheet
          selectedCat={selectedCat}
          priceMax={priceMax}
          onApply={({ cat, priceMax: pm }) => { setSelectedCat(cat); setPriceMax(pm) }}
          onClose={() => setShowFilter(false)}
          rate={rate}
        />
      )}

      <style>{`
        @keyframes spin    { to { transform: rotate(360deg) } }
        @keyframes sheetUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
        ::-webkit-scrollbar { display: none }
      `}</style>
    </div>
  )
}

