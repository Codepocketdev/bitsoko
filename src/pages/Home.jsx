import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Bell, Zap, ChevronRight, Store,
  TrendingUp, Coffee, Smartphone, Shirt, Music,
  BookOpen, Palette, Home as HomeIcon, Leaf,
  RefreshCw, Loader, Plus, ShoppingBag
} from 'lucide-react'
import { openDB, getProducts, getProfile, getProfiles } from '../lib/db'
import { fetchAndSeed, startSync, stopSync, getPublicKeyHex } from '../lib/nostrSync'
import { useNostrProfile } from '../hooks/useNostrProfile'
import { satsToKsh, useRate } from '../lib/rates'
import { useNotifications } from '../hooks/useNotifications'

const C = {
  bg:     '#f7f4f0',
  white:  '#ffffff',
  black:  '#1a1410',
  muted:  '#b0a496',
  border: '#e8e0d5',
  orange: '#f7931a',
  ochre:  '#c8860a',
  terra:  '#b5451b',
  sage:   '#2d6a4f',
}

// FIX: tag values now match p.categories exactly (full names from db.js saveProduct)
// Old tags were lowercase short ('electronics', 'food') — never matched p.categories
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

const PAGE_SIZE   = 20
const DEBOUNCE_MS = 300

function timeAgo(ts) {
  const s = Math.floor(Date.now() / 1000) - ts
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function Avatar({ profile, pubkey, size = 36 }) {
  const [err, setErr] = useState(false)
  const name   = profile?.name || profile?.display_name || pubkey?.slice(0, 4) || '?'
  const letter = name[0].toUpperCase()
  if (profile?.picture && !err) {
    return (
      <img src={profile.picture} alt={letter} onError={() => setErr(true)}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: `1.5px solid ${C.border}` }}/>
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: C.black, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Inter',sans-serif", fontWeight: 700,
      fontSize: size * 0.38, color: C.white,
    }}>
      {letter}
    </div>
  )
}

function ProductCard({ product, profile, onClick, rate }) {
  const image      = product.images?.[0]
  const name       = product.name  || 'Untitled'
  const price      = product.price || 0
  const sellerName = profile?.name || profile?.display_name || product.pubkey?.slice(0, 8) + '…'
  const [imgErr,   setImgErr] = useState(false)

  return (
    <div onClick={onClick} style={{
      background: C.white, borderRadius: 16,
      border: `1px solid ${C.border}`, overflow: 'hidden',
      cursor: 'pointer',
      boxShadow: '0 2px 8px rgba(26,20,16,0.04)',
    }}>
      <div style={{ width: '100%', aspectRatio: '1', background: C.bg, position: 'relative', overflow: 'hidden' }}>
        {image && !imgErr ? (
          <img
            src={image} alt={name}
            onError={() => setImgErr(true)}
            loading="eager" decoding="async"
            style={{ width: '100%', height: '100%', objectFit: 'cover', willChange: 'transform' }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Store size={28} color="rgba(26,20,16,0.12)"/>
          </div>
        )}
        <div style={{
          position: 'absolute', bottom: 8, left: 8,
          background: 'rgba(26,20,16,0.85)', backdropFilter: 'blur(4px)',
          borderRadius: 99, padding: '3px 8px',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <Zap size={10} fill={C.orange} color={C.orange}/>
          <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, fontWeight: 700, color: C.white }}>
            {price.toLocaleString()} sats
          </span>
        </div>
      </div>
      <div style={{ padding: '10px 12px 12px' }}>
        <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 600, color: C.black, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name}
        </div>
        <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: C.muted, marginBottom: 6 }}>
          {satsToKsh(price, rate)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Avatar profile={profile} pubkey={product.pubkey} size={16}/>
          <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {sellerName}
          </span>
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  const rate = useRate()
  const navigate = useNavigate()
  const { unreadCount } = useNotifications()

  const [products,     setProducts]     = useState([])
  const [profiles,     setProfiles]     = useState({})
  const [loading,      setLoading]      = useState(true)
  const [syncing,      setSyncing]      = useState(false)
  const [newCount,     setNewCount]     = useState(0)
  const [selectedCat,  setSelectedCat]  = useState(null)
  const [searchQuery,  setSearchQuery]  = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const debounceTimer = useRef(null)

  const _pubkeyHex = (() => { try { return getPublicKeyHex() } catch { return '' } })()
  const { profile: _userProfile } = useNostrProfile(_pubkeyHex)

  const [displayName, setDisplayName] = useState(
    () => localStorage.getItem('bitsoko_display_name') || null
  )

  useEffect(() => {
    if (!_userProfile) return
    const n = _userProfile.display_name || _userProfile.name
    if (n) {
      setDisplayName(n)
      localStorage.setItem('bitsoko_display_name', n)
    } else {
      setDisplayName(prev => prev || 'there')
    }
  }, [_userProfile])

  useEffect(() => {
    const onLogin = () => {
      const n = localStorage.getItem('bitsoko_display_name')
      if (n) setDisplayName(n)
    }
    window.addEventListener('bitsoko_login', onLogin)
    return () => window.removeEventListener('bitsoko_login', onLogin)
  }, [])

  // Reset pagination when filter/search changes
  useEffect(() => { setVisibleCount(PAGE_SIZE) }, [selectedCat, searchQuery])

  // ── Debounced DB reload ───────────────────
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

  // ── Banners ───────────────────────────────
  const BANNERS = [
    { bg: '#e8614a', accent: '#fdf0e8', tag: 'LIGHTNING DEALS',   title: 'Pay with sats,\npay in seconds',       cta: 'Browse deals',  path: '/deals',          bubble: 'rgba(253,240,232,0.15)' },
    { bg: '#f5a623', accent: '#1a1410', tag: 'BITCOIN PAYMENTS',  title: 'Your storefront.\nOn Bitcoin rails.',   cta: 'Start selling', path: '/create-listing', bubble: 'rgba(26,20,16,0.08)'   },
    { bg: '#4a7fc1', accent: '#fdf0e8', tag: 'LOCAL SELLERS',     title: 'Fresh finds from\nyour community',     cta: 'Explore now',   path: '/explore',        bubble: 'rgba(253,240,232,0.12)' },
    { bg: '#4ab8a0', accent: '#fdf0e8', tag: 'NEW ARRIVALS',      title: 'Just listed\nthis week',               cta: 'See listings',  path: '/explore',        bubble: 'rgba(253,240,232,0.12)' },
    { bg: '#e85d3a', accent: '#f5a623', tag: 'START SELLING',     title: 'List your product,\nearn in sats',     cta: 'List now',      path: '/create-listing', bubble: 'rgba(245,166,35,0.12)' },
  ]
  const [bannerIdx, setBannerIdx] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setBannerIdx(i => (i + 1) % BANNERS.length), 4000)
    return () => clearInterval(t)
  }, [])

  // ── Load from IndexedDB first ─────────────
  const loadFromDB = useCallback(async () => {
    await openDB()
    const saved = await getProducts(500)
    if (saved.length > 0) {
      setProducts(saved)
      setLoading(false)
      const pubkeys = [...new Set(saved.map(p => p.pubkey))]
      const profs   = await getProfiles(pubkeys)
      const profMap = {}
      profs.forEach((pr, i) => { if (pr) profMap[pubkeys[i]] = pr })
      setProfiles(profMap)
    }
  }, [])

  // ── Seed + live sync ──────────────────────
  useEffect(() => {
    let mounted = true

    const init = async () => {
      // If toggle was switched, skip DB cache (it was cleared) and go straight to relay
      const needsResync = localStorage.getItem('bitsoko_needs_resync')
      if (needsResync) {
        localStorage.removeItem('bitsoko_needs_resync')
        setLoading(true)
      } else {
        await loadFromDB()
      }
      setSyncing(true)

      await fetchAndSeed({
        // FIX: debounced — was calling getProducts on every event, dozens per second during seed
        onProduct: () => { if (mounted) debouncedReload() },
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
        // FIX: direct state update — no DB round-trip on every live event
        onProduct: async (event) => {
          if (!mounted) return
          if (event._deleted) {
            setProducts(prev => prev.filter(p => p.id !== event.id && p.event_id !== event.id))
            return
          }
          setProducts(prev => {
            const idx = prev.findIndex(p => p.id === event.id)
            if (idx >= 0) {
              if (event.created_at >= prev[idx].created_at) {
                const next = [...prev]; next[idx] = event; return next
              }
              return prev
            }
            return [event, ...prev]
          })
          setNewCount(n => n + 1)
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

  // ── Filter ────────────────────────────────
  // FIX: was using raw p.tags array — now uses p.categories (parsed by db.js saveProduct)
  const filtered = products.filter(p => {
    if (p.deleted || p.status === 'deleted') return false
    const tTags = (p.tags || []).filter(t => t[0] === 't').map(t => t[1] || '')
    if (tTags.includes('deleted')) return false
    // p.categories = already-parsed category names (e.g. 'Electronics', 'Food & Drinks')
    if (selectedCat && !(p.categories || []).includes(selectedCat)) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return p.name?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q)
    }
    return true
  })

  const sorted   = [...filtered].sort((a, b) => b.created_at - a.created_at)
  const visible  = sorted.slice(0, visibleCount)

  const topSellers = Object.values(
    products.reduce((acc, p) => {
      if (!acc[p.pubkey]) acc[p.pubkey] = { pubkey: p.pubkey, count: 0 }
      acc[p.pubkey].count++
      return acc
    }, {})
  ).sort((a, b) => b.count - a.count).slice(0, 3)

  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: "'Inter',sans-serif", paddingBottom: 100 }}>

      {/* ── Topbar ── */}
      <div style={{
        background: C.white, borderBottom: `1px solid ${C.border}`,
        padding: '16px 20px 12px',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: C.muted }}>Good day,</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.black }}>
              {displayName === null
                ? <span style={{ display: 'inline-block', width: 80, height: 16, borderRadius: 6, background: C.border, verticalAlign: 'middle' }}/>
                : displayName
              }
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {syncing && <Loader size={16} color={C.muted} style={{ animation: 'spin 1s linear infinite' }}/>}
            {newCount > 0 && (
              <button onClick={() => setNewCount(0)} style={{
                background: C.orange, border: 'none', borderRadius: 99,
                padding: '4px 10px', cursor: 'pointer',
                fontSize: 10, fontWeight: 700, color: C.white,
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <RefreshCw size={10}/> {newCount} new
              </button>
            )}
            <button onClick={() => navigate('/create-listing')} style={{
              width: 36, height: 36, borderRadius: '50%',
              background: C.black, border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}>
              <Plus size={17} color={C.white}/>
            </button>
            <button onClick={() => navigate('/messages')} style={{
              width: 36, height: 36, borderRadius: '50%',
              background: C.bg, border: `1px solid ${C.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              position: 'relative',
            }}>
              <Bell size={17} color={C.black}/>
              {unreadCount > 0 && (
                <div style={{
                  position: 'absolute', top: 2, right: 2,
                  minWidth: 16, height: 16, borderRadius: 99,
                  background: C.orange, border: `2px solid ${C.white}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, fontWeight: 700, color: C.white,
                  padding: '0 3px',
                }}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </div>
              )}
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: C.bg, border: `1px solid ${C.border}`,
          borderRadius: 12, padding: '10px 14px',
        }}>
          <Search size={16} color={C.muted}/>
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search products, sellers…"
            style={{
              flex: 1, border: 'none', background: 'none', outline: 'none',
              fontSize: 14, color: C.black, fontFamily: "'Inter',sans-serif",
            }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: C.muted, lineHeight: 1, padding: 0 }}>×</button>
          )}
        </div>
      </div>

      <div style={{ padding: '0 0 24px' }}>

        {/* ── Banner ── */}
        <div style={{ margin: '16px 16px 0' }}>
          <div style={{
            background: BANNERS[bannerIdx].bg, borderRadius: 16, padding: '20px',
            position: 'relative', overflow: 'hidden',
            transition: 'background 0.6s ease', minHeight: 130,
          }}>
            <div style={{
              position: 'absolute', right: -20, top: -20,
              width: 130, height: 130, borderRadius: '50%',
              background: BANNERS[bannerIdx].bubble, transition: 'background 0.6s ease',
            }}/>
            <div style={{ fontSize: 10, fontWeight: 700, color: BANNERS[bannerIdx].accent, letterSpacing: '0.12em', marginBottom: 6, transition: 'color 0.5s ease' }}>
              {BANNERS[bannerIdx].tag}
            </div>
            <div style={{ fontSize: 19, fontWeight: 700, color: '#ffffff', marginBottom: 14, lineHeight: 1.35, whiteSpace: 'pre-line' }}>
              {BANNERS[bannerIdx].title}
            </div>
            <button onClick={() => navigate(BANNERS[bannerIdx].path)} style={{
              background: BANNERS[bannerIdx].accent, border: 'none', borderRadius: 99,
              padding: '8px 16px', cursor: 'pointer',
              fontSize: 12, fontWeight: 700, color: BANNERS[bannerIdx].bg,
              display: 'inline-flex', alignItems: 'center', gap: 6,
              transition: 'background 0.5s ease, color 0.5s ease',
            }}>
              <Zap size={13}/> {BANNERS[bannerIdx].cta}
            </button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 10 }}>
            {BANNERS.map((_, i) => (
              <button key={i} onClick={() => setBannerIdx(i)} style={{
                width: i === bannerIdx ? 20 : 6, height: 6, borderRadius: 99,
                background: i === bannerIdx ? C.black : C.border,
                border: 'none', cursor: 'pointer', padding: 0, transition: 'all 0.3s ease',
              }}/>
            ))}
          </div>
        </div>

        {/* ── Categories ── */}
        <div style={{ padding: '20px 16px 0' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.black, marginBottom: 14 }}>Categories</div>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
            <button onClick={() => setSelectedCat(null)} style={{
              flexShrink: 0, padding: '8px 16px', borderRadius: 99,
              background: !selectedCat ? C.black : C.white,
              border: `1px solid ${!selectedCat ? C.black : C.border}`,
              cursor: 'pointer', fontSize: 12, fontWeight: 600,
              color: !selectedCat ? C.white : C.black, transition: 'all .15s',
            }}>All</button>
            {CATEGORIES.map(({ icon: Icon, label, tag }) => {
              const active = selectedCat === tag
              return (
                <button key={tag} onClick={() => setSelectedCat(active ? null : tag)} style={{
                  flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 99,
                  background: active ? C.black : C.white,
                  border: `1px solid ${active ? C.black : C.border}`,
                  cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  color: active ? C.white : C.black, transition: 'all .15s',
                }}>
                  <Icon size={13} color={active ? C.white : C.ochre}/> {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Loading ── */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <Loader size={24} color={C.ochre} style={{ animation: 'spin 1s linear infinite', display: 'block', margin: '0 auto' }}/>
          </div>
        )}

        {/* ── Empty ── */}
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <ShoppingBag size={40} color={C.border} style={{ margin: '0 auto 16px', display: 'block' }}/>
            <div style={{ fontSize: 16, fontWeight: 600, color: C.black, marginBottom: 6 }}>
              {searchQuery || selectedCat ? 'No results found' : 'No products yet'}
            </div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>
              {searchQuery || selectedCat ? 'Try a different filter' : 'Be the first seller on Bitsoko'}
            </div>
            {(!searchQuery && !selectedCat) && (
              <button onClick={() => navigate('/create-listing')} style={{
                background: C.black, border: 'none', borderRadius: 12,
                padding: '12px 24px', cursor: 'pointer',
                fontSize: 14, fontWeight: 700, color: C.white,
                display: 'inline-flex', alignItems: 'center', gap: 8,
              }}>
                <Plus size={16}/> List a product
              </button>
            )}
          </div>
        )}

        {/* ── Listings ── */}
        {!loading && visible.length > 0 && (
          <div style={{ padding: '20px 16px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.black }}>
                {selectedCat ? CATEGORIES.find(c => c.tag === selectedCat)?.label : 'Recent listings'}
              </div>
              <button onClick={() => navigate('/explore')} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 12, color: C.ochre, fontWeight: 600,
              }}>
                See all <ChevronRight size={14}/>
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {visible.map(product => (
                <ProductCard
                  key={product.id}
                  product={product}
                  profile={profiles[product.pubkey]}
                  onClick={() => navigate(`/product/${product.id}`)}
                  rate={rate}
                />
              ))}
            </div>

            {/* Load more */}
            {visibleCount < sorted.length && (
              <button onClick={() => setVisibleCount(c => c + PAGE_SIZE)} style={{
                width: '100%', marginTop: 16, padding: 14,
                background: C.white, border: `1.5px solid ${C.border}`,
                borderRadius: 14, cursor: 'pointer',
                fontSize: 13, fontWeight: 600, color: C.black,
                fontFamily: "'Inter',sans-serif",
              }}>
                Load more · {sorted.length - visibleCount} remaining
              </button>
            )}
          </div>
        )}

        {/* ── Featured sellers (top 3) ── */}
        {!loading && topSellers.length > 0 && !selectedCat && !searchQuery && (
          <div style={{ padding: '24px 16px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <TrendingUp size={16} color={C.ochre}/>
                <span style={{ fontSize: 16, fontWeight: 700, color: C.black }}>Featured sellers</span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {topSellers.map(({ pubkey, count }) => {
                const profile = profiles[pubkey]
                const name    = profile?.name || profile?.display_name || pubkey.slice(0, 12) + '…'
                const ln      = profile?.lud16 || ''
                return (
                  <div key={pubkey} onClick={() => navigate(`/seller/${pubkey}`)} style={{
                    background: C.white, borderRadius: 14,
                    border: `1px solid ${C.border}`, padding: '12px 16px',
                    display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                  }}>
                    <Avatar profile={profile} pubkey={pubkey} size={44}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.black }}>{name}</div>
                      {ln && (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, fontSize: 11, color: C.ochre, marginTop: 2 }}>
                          <Zap size={10} fill={C.ochre} color={C.ochre} style={{ flexShrink: 0, marginTop: 1 }}/>
                          <span style={{ wordBreak: 'break-all', lineHeight: 1.4 }}>{ln}</span>
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                        {count} listing{count !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <ChevronRight size={16} color={C.muted}/>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Sell CTA ── */}
        {!searchQuery && (
          <div style={{ margin: '24px 16px 0', background: C.white, borderRadius: 16, border: `1px solid ${C.border}`, padding: '20px', display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: C.bg, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Store size={22} color={C.ochre}/>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.black, marginBottom: 2 }}>Start selling today</div>
              <div style={{ fontSize: 11, color: C.muted }}>List products, get paid in sats</div>
            </div>
            <button onClick={() => navigate('/create-listing')} style={{
              background: C.black, border: 'none', borderRadius: 10,
              padding: '10px 16px', cursor: 'pointer',
              fontSize: 12, fontWeight: 700, color: C.white,
              display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
            }}>
              <Plus size={14}/> List
            </button>
          </div>
        )}
      </div>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        @keyframes spin { to { transform: rotate(360deg) } }
        ::-webkit-scrollbar { display: none }
      `}</style>
    </div>
  )
}

