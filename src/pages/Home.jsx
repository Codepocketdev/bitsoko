import { useState, useEffect, useCallback } from 'react'
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

// ── Design tokens ─────────────────────────────
const C = {
  bg:      '#f7f4f0',
  white:   '#ffffff',
  black:   '#1a1410',
  muted:   '#b0a496',
  border:  '#e8e0d5',
  orange:  '#f7931a',
  ochre:   '#c8860a',
  terra:   '#b5451b',
  sage:    '#2d6a4f',
}

// ── Categories ────────────────────────────────
const CATEGORIES = [
  { icon: Smartphone, label: 'Electronics', tag: 'electronics' },
  { icon: Shirt,      label: 'Fashion',     tag: 'fashion'     },
  { icon: Coffee,     label: 'Food',        tag: 'food'        },
  { icon: Palette,    label: 'Art',         tag: 'art'         },
  { icon: HomeIcon,   label: 'Home',        tag: 'home'        },
  { icon: BookOpen,   label: 'Books',       tag: 'books'       },
  { icon: Music,      label: 'Music',       tag: 'music'       },
  { icon: Leaf,       label: 'Wellness',    tag: 'wellness'    },
]

// ── Helpers ───────────────────────────────────
function satsToKsh(sats) {
  const btcKsh = 13_000_000
  const ksh = (sats / 100_000_000) * btcKsh
  if (ksh >= 1000) return `KSh ${(ksh / 1000).toFixed(1)}k`
  return `KSh ${Math.round(ksh)}`
}

function timeAgo(ts) {
  const s = Math.floor(Date.now() / 1000) - ts
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

// ── Avatar ────────────────────────────────────
function Avatar({ profile, pubkey, size = 36 }) {
  const [err, setErr] = useState(false)
  const name   = profile?.name || profile?.display_name || pubkey?.slice(0, 4) || '?'
  const letter = name[0].toUpperCase()

  if (profile?.picture && !err) {
    return (
      <img
        src={profile.picture} alt={letter}
        onError={() => setErr(true)}
        style={{
          width: size, height: size, borderRadius: '50%',
          objectFit: 'cover', flexShrink: 0,
          border: `1.5px solid ${C.border}`,
        }}
      />
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

// ── Product Card ──────────────────────────────
function ProductCard({ product, profile, onClick }) {
  const image      = product.images?.[0]
  const hasImage   = !!image
  const name       = product.name  || 'Untitled'
  const price      = product.price || 0
  const sellerName = profile?.name || profile?.display_name || product.pubkey?.slice(0, 8) + '…'

  return (
    <div
      onClick={onClick}
      style={{
        background: C.white, borderRadius: 16,
        border: `1px solid ${C.border}`, overflow: 'hidden',
        cursor: 'pointer', transition: 'transform 0.18s, box-shadow 0.18s',
        boxShadow: '0 2px 8px rgba(26,20,16,0.04)',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = '0 6px 20px rgba(26,20,16,0.10)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(26,20,16,0.04)'
      }}
    >
      <div style={{
        width: '100%', aspectRatio: '1',
        background: C.bg, position: 'relative', overflow: 'hidden',
      }}>
        {hasImage ? (
          <img
            src={image} alt={name} loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={e => { e.target.style.display = 'none' }}
          />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
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
          <span style={{
            fontFamily: "'Inter',sans-serif",
            fontSize: '0.65rem', fontWeight: 700, color: C.white,
          }}>
            {price.toLocaleString()} sats
          </span>
        </div>
      </div>

      <div style={{ padding: '10px 12px 12px' }}>
        <div style={{
          fontFamily: "'Inter',sans-serif",
          fontSize: '0.82rem', fontWeight: 600,
          color: C.black, marginBottom: 2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {name}
        </div>
        <div style={{ fontFamily: "'Inter',sans-serif", fontSize: '0.68rem', color: C.muted, marginBottom: 6 }}>
          {satsToKsh(price)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Avatar profile={profile} pubkey={product.pubkey} size={16}/>
          <span style={{
            fontFamily: "'Inter',sans-serif",
            fontSize: '0.65rem', color: C.muted,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {sellerName}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────
export default function Home() {
  const navigate = useNavigate()

  const [products,    setProducts]    = useState([])
  const [profiles,    setProfiles]    = useState({})
  const [loading,     setLoading]     = useState(true)
  const [syncing,     setSyncing]     = useState(false)
  const [newCount,    setNewCount]    = useState(0)
  const [selectedCat, setSelectedCat] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')

  // ── Display name: useNostrProfile hook (IndexedDB first, relay second)
  // Same pattern as Profile page — no waiting, no flash, works on re-login
  const _pubkeyHex = (() => { try { return getPublicKeyHex() } catch { return '' } })()
  const { profile: _userProfile } = useNostrProfile(_pubkeyHex)

  // null  = still resolving (show nothing)
  // string = resolved (show name, or 'there' if not found)
  const [displayName, setDisplayName] = useState(
    () => localStorage.getItem('bitsoko_display_name') || null
  )

  // Update name when hook resolves from IndexedDB (instant) or relay (fresh)
  useEffect(() => {
    if (!_userProfile) return
    const n = _userProfile.display_name || _userProfile.name
    if (n) {
      setDisplayName(n)
      localStorage.setItem('bitsoko_display_name', n)
    } else {
      // Profile fetched but no name — now safe to show fallback
      setDisplayName(prev => prev || 'there')
    }
  }, [_userProfile])

  // Also catch same-tab bitsoko_login event as an instant fallback
  useEffect(() => {
    const onLogin = () => {
      const n = localStorage.getItem('bitsoko_display_name')
      if (n) setDisplayName(n)
    }
    window.addEventListener('bitsoko_login', onLogin)
    return () => window.removeEventListener('bitsoko_login', onLogin)
  }, [])

  // ── Cycling banner ────────────────────────
  const BANNERS = [
    {
      bg:     '#e8614a',
      accent: '#fdf0e8',
      tag:    'LIGHTNING DEALS',
      title:  'Pay with sats,\npay in seconds',
      cta:    'Browse deals',
      path:   '/deals',
      bubble: 'rgba(253,240,232,0.15)',
    },
    {
      bg:     '#f5a623',
      accent: '#1a1410',
      tag:    'BITCOIN PAYMENTS',
      title:  'Your storefront.\nOn Bitcoin rails.',
      cta:    'Start selling',
      path:   '/create-listing',
      bubble: 'rgba(26,20,16,0.08)',
    },
    {
      bg:     '#4a7fc1',
      accent: '#fdf0e8',
      tag:    'LOCAL SELLERS',
      title:  'Fresh finds from\nyour community',
      cta:    'Explore now',
      path:   '/explore',
      bubble: 'rgba(253,240,232,0.12)',
    },
    {
      bg:     '#4ab8a0',
      accent: '#fdf0e8',
      tag:    'NEW ARRIVALS',
      title:  'Just listed\nthis week',
      cta:    'See listings',
      path:   '/explore',
      bubble: 'rgba(253,240,232,0.12)',
    },
    {
      bg:     '#e85d3a',
      accent: '#f5a623',
      tag:    'START SELLING',
      title:  'List your product,\nearn in sats',
      cta:    'List now',
      path:   '/create-listing',
      bubble: 'rgba(245,166,35,0.12)',
    },
  ]
  const [bannerIdx, setBannerIdx] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setBannerIdx(i => (i + 1) % BANNERS.length), 4000)
    return () => clearInterval(t)
  }, [])

  // ── Load from IndexedDB first ──
  const loadFromDB = useCallback(async () => {
    await openDB()
    const saved = await getProducts(100)
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

  // ── Seed from relays then start live sync ──
  useEffect(() => {
    let mounted = true

    const init = async () => {
      await loadFromDB()

      setSyncing(true)
      await fetchAndSeed({
        onProduct: async (event) => {
          if (!mounted) return
          const updated = await getProducts(100)
          setProducts(updated)
          const prof = await getProfile(event.pubkey)
          if (prof) setProfiles(prev => ({ ...prev, [event.pubkey]: prof }))
        },
        onProfile: (event) => {
          if (!mounted) return
          try {
            const p = typeof event.content === 'string'
              ? JSON.parse(event.content)
              : event.content
            setProfiles(prev => ({ ...prev, [event.pubkey]: p }))
          } catch {}
        },
        onDone: () => {
          if (!mounted) return
          setSyncing(false)
          setLoading(false)
        },
      })

      startSync({
        onProduct: async (event) => {
          if (!mounted) return
          if (event._deleted) {
            setProducts(prev => prev.filter(p => p.id !== event.id))
            return
          }
          const updated = await getProducts(100)
          setProducts(updated)
          setNewCount(n => n + 1)
          const prof = await getProfile(event.pubkey)
          if (prof) setProfiles(prev => ({ ...prev, [event.pubkey]: prof }))
        },
        onProfile: (event) => {
          if (!mounted) return
          try {
            const p = typeof event.content === 'string'
              ? JSON.parse(event.content)
              : event.content
            setProfiles(prev => ({ ...prev, [event.pubkey]: p }))
          } catch {}
        },
      })
    }

    init()
    return () => {
      mounted = false
      stopSync()
    }
  }, [])

  // ── Filter ────────────────────────────────
  const filtered = products.filter(p => {
    if (p.deleted) return false
    const tags = (p.tags || []).map(t => t[1] || '')
    if (selectedCat && !tags.includes(selectedCat)) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return (
        p.name?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q)
      )
    }
    return true
  })

  const recent = filtered.slice(0, 6)
  const topSellers = Object.values(
    products.reduce((acc, p) => {
      if (!acc[p.pubkey]) acc[p.pubkey] = { pubkey: p.pubkey, count: 0 }
      acc[p.pubkey].count++
      return acc
    }, {})
  ).sort((a, b) => b.count - a.count).slice(0, 4)

  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: "'Inter',sans-serif" }}>

      {/* ── Topbar ── */}
      <div style={{
        background: C.white, borderBottom: `1px solid ${C.border}`,
        padding: '16px 20px 12px',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: '0.72rem', color: C.muted }}>Good day,</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: C.black }}>
              {displayName === null
                ? <span style={{ display: 'inline-block', width: 80, height: 16, borderRadius: 6, background: C.white, verticalAlign: 'middle' }} />
                : displayName
              }
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {syncing && <Loader size={16} color={C.muted} style={{ animation: 'spin 1s linear infinite' }}/>}
            {newCount > 0 && (
              <button
                onClick={() => setNewCount(0)}
                style={{
                  background: C.orange, border: 'none', borderRadius: 99,
                  padding: '4px 10px', cursor: 'pointer',
                  fontSize: '0.65rem', fontWeight: 700, color: C.white,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <RefreshCw size={10}/> {newCount} new
              </button>
            )}
            <button style={{
              width: 36, height: 36, borderRadius: '50%',
              background: C.bg, border: `1px solid ${C.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}>
              <Bell size={17} color={C.black}/>
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
              flex: 1, border: 'none', background: 'none',
              outline: 'none', fontSize: '0.85rem',
              color: C.black, fontFamily: "'Inter',sans-serif",
            }}
          />
        </div>
      </div>

      <div style={{ padding: '0 0 24px' }}>

        {/* ── Cycling banner ── */}
        <div style={{ margin: '16px 16px 0' }}>
          <div style={{
            background: BANNERS[bannerIdx].bg,
            borderRadius: 16, padding: '20px',
            position: 'relative', overflow: 'hidden',
            transition: 'background 0.6s ease', minHeight: 130,
          }}>
            <div style={{
              position: 'absolute', right: -20, top: -20,
              width: 130, height: 130, borderRadius: '50%',
              background: BANNERS[bannerIdx].bubble,
              transition: 'background 0.6s ease',
            }}/>
            <div style={{
              fontSize: '0.65rem', fontWeight: 700,
              color: BANNERS[bannerIdx].accent,
              letterSpacing: '0.12em', marginBottom: 6,
              transition: 'color 0.5s ease',
            }}>
              {BANNERS[bannerIdx].tag}
            </div>
            <div style={{
              fontSize: '1.2rem', fontWeight: 700,
              color: '#ffffff', marginBottom: 14, lineHeight: 1.35,
              whiteSpace: 'pre-line',
            }}>
              {BANNERS[bannerIdx].title}
            </div>
            <button
              onClick={() => navigate(BANNERS[bannerIdx].path)}
              style={{
                background: BANNERS[bannerIdx].accent, border: 'none',
                borderRadius: 99, padding: '8px 16px', cursor: 'pointer',
                fontSize: '0.75rem', fontWeight: 700, color: BANNERS[bannerIdx].bg,
                display: 'inline-flex', alignItems: 'center', gap: 6,
                transition: 'background 0.5s ease, color 0.5s ease',
              }}
            >
              <Zap size={13}/> {BANNERS[bannerIdx].cta}
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 10 }}>
            {BANNERS.map((_, i) => (
              <button
                key={i}
                onClick={() => setBannerIdx(i)}
                style={{
                  width: i === bannerIdx ? 20 : 6, height: 6, borderRadius: 99,
                  background: i === bannerIdx ? C.black : C.border,
                  border: 'none', cursor: 'pointer', padding: 0,
                  transition: 'all 0.3s ease',
                }}
              />
            ))}
          </div>
        </div>

        {/* ── Categories ── */}
        <div style={{ padding: '20px 16px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: C.black }}>Categories</div>
          </div>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
            <button
              onClick={() => setSelectedCat(null)}
              style={{
                flexShrink: 0, padding: '8px 16px', borderRadius: 99,
                background: !selectedCat ? C.black : C.white,
                border: `1px solid ${!selectedCat ? C.black : C.border}`,
                cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
                color: !selectedCat ? C.white : C.black, transition: 'all .15s',
              }}
            >
              All
            </button>
            {CATEGORIES.map(({ icon: Icon, label, tag }) => {
              const active = selectedCat === tag
              return (
                <button
                  key={tag}
                  onClick={() => setSelectedCat(active ? null : tag)}
                  style={{
                    flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 14px', borderRadius: 99,
                    background: active ? C.black : C.white,
                    border: `1px solid ${active ? C.black : C.border}`,
                    cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
                    color: active ? C.white : C.black, transition: 'all .15s',
                  }}
                >
                  <Icon size={13} color={active ? C.white : C.ochre}/>
                  {label}
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
            <div style={{ fontSize: '1rem', fontWeight: 600, color: C.black, marginBottom: 6 }}>
              {searchQuery ? 'No results found' : 'No products yet'}
            </div>
            <div style={{ fontSize: '0.8rem', color: C.muted, marginBottom: 20 }}>
              {searchQuery ? 'Try a different search' : 'Be the first seller on Bitsoko'}
            </div>
            {!searchQuery && (
              <button
                onClick={() => navigate('/create-listing')}
                style={{
                  background: C.black, border: 'none', borderRadius: 12,
                  padding: '12px 24px', cursor: 'pointer',
                  fontSize: '0.85rem', fontWeight: 700, color: C.white,
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                }}
              >
                <Plus size={16}/> List a product
              </button>
            )}
          </div>
        )}

        {/* ── Recent listings ── */}
        {!loading && recent.length > 0 && (
          <div style={{ padding: '20px 16px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: C.black }}>
                {selectedCat ? CATEGORIES.find(c => c.tag === selectedCat)?.label : 'Recent listings'}
              </div>
              <button
                onClick={() => navigate('/explore')}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: '0.75rem', color: C.ochre, fontWeight: 600,
                }}
              >
                See all <ChevronRight size={14}/>
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {recent.map(product => (
                <ProductCard
                  key={product.id}
                  product={product}
                  profile={profiles[product.pubkey]}
                  onClick={() => navigate(`/product/${product.id}`)}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Top sellers ── */}
        {!loading && topSellers.length > 0 && (
          <div style={{ padding: '24px 16px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <TrendingUp size={16} color={C.ochre}/>
                <span style={{ fontSize: '1rem', fontWeight: 700, color: C.black }}>Top sellers</span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {topSellers.map(({ pubkey, count }) => {
                const profile = profiles[pubkey]
                const name    = profile?.name || profile?.display_name || pubkey.slice(0, 12) + '…'
                const ln      = profile?.lud16 || ''
                return (
                  <div
                    key={pubkey}
                    onClick={() => navigate(`/seller/${pubkey}`)}
                    style={{
                      background: C.white, borderRadius: 14,
                      border: `1px solid ${C.border}`, padding: '12px 16px',
                      display: 'flex', alignItems: 'center', gap: 12,
                      cursor: 'pointer',
                    }}
                  >
                    <Avatar profile={profile} pubkey={pubkey} size={44}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.88rem', fontWeight: 700, color: C.black }}>{name}</div>
                      {ln && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.68rem', color: C.ochre, marginTop: 2 }}>
                          <Zap size={10} fill={C.ochre} color={C.ochre}/> {ln}
                        </div>
                      )}
                      <div style={{ fontSize: '0.68rem', color: C.muted, marginTop: 2 }}>
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
        <div style={{
          margin: '24px 16px 0',
          background: C.white, borderRadius: 16,
          border: `1px solid ${C.border}`, padding: '20px',
          display: 'flex', alignItems: 'center', gap: 16,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: C.bg, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Store size={22} color={C.ochre}/>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: C.black, marginBottom: 2 }}>Start selling today</div>
            <div style={{ fontSize: '0.72rem', color: C.muted }}>List products, get paid in sats</div>
          </div>
          <button
            onClick={() => navigate('/create-listing')}
            style={{
              background: C.black, border: 'none', borderRadius: 10,
              padding: '10px 16px', cursor: 'pointer',
              fontSize: '0.75rem', fontWeight: 700, color: C.white,
              display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
            }}
          >
            <Plus size={14}/> List
          </button>
        </div>

      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        ::-webkit-scrollbar { display: none }
      `}</style>
    </div>
  )
}

