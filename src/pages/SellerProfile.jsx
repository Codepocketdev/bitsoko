import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Zap, ShieldCheck, Store,
  Package, Loader, ExternalLink
} from 'lucide-react'
import { getProfile, getProductsByPubkey, saveProfile, saveProduct } from '../lib/db'
import { getPool, getReadRelays, DEFAULT_RELAYS, KINDS } from '../lib/nostrSync'
import { nip19 } from 'nostr-tools'

// Pagination: cap DOM images to prevent mobile GPU bitmap eviction
// (the real cause of the blank-on-scroll bug — same fix Shopstr uses)
const PAGE_SIZE = 20

const C = {
  bg:     '#f7f4f0',
  white:  '#ffffff',
  black:  '#1a1410',
  muted:  '#b0a496',
  border: '#e8e0d5',
  orange: '#f7931a',
  ochre:  '#c8860a',
  green:  '#22c55e',
}

function satsToKsh(sats) {
  const ksh = (sats / 100_000_000) * 13_000_000
  if (ksh >= 1000) return `KSh ${(ksh / 1000).toFixed(1)}k`
  return `KSh ${Math.round(ksh)}`
}

function Avatar({ profile, pubkey, size = 72 }) {
  const [err, setErr] = useState(false)
  const name   = profile?.name || profile?.display_name || pubkey?.slice(0, 4) || '?'
  const letter = name[0].toUpperCase()
  if (profile?.picture && !err) {
    return (
      <img src={profile.picture} alt={letter} onError={() => setErr(true)}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover',
          border: `3px solid ${C.white}`, boxShadow: '0 4px 16px rgba(26,20,16,0.12)' }}/>
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: C.black,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Inter',sans-serif", fontWeight: 700,
      fontSize: size * 0.38, color: C.white,
      border: `3px solid ${C.white}`, boxShadow: '0 4px 16px rgba(26,20,16,0.12)',
    }}>
      {letter}
    </div>
  )
}

function ProductCard({ product, onClick }) {
  const image = product.images?.[0]
  const [imgErr, setImgErr] = useState(false)
  return (
    <div onClick={onClick} style={{
      background: C.white, borderRadius: 14,
      border: `1px solid ${C.border}`, overflow: 'hidden', cursor: 'pointer',
    }}>
      <div style={{ aspectRatio: '1', background: C.border, overflow: 'hidden', position: 'relative' }}>
        {image && !imgErr
          ? <img
              src={image}
              alt={product.name}
              onError={() => setImgErr(true)}
              loading="eager"
              decoding="async"
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
          <span style={{ fontSize: '0.65rem', fontWeight: 700, color: C.white, fontFamily: "'Inter',sans-serif" }}>
            {product.price?.toLocaleString()}
          </span>
        </div>
      </div>
      <div style={{ padding: '10px 12px' }}>
        <div style={{
          fontSize: '0.8rem', fontWeight: 600, color: C.black,
          fontFamily: "'Inter',sans-serif",
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {product.name || 'Untitled'}
        </div>
        <div style={{ fontSize: '0.68rem', color: C.muted, marginTop: 2, fontFamily: "'Inter',sans-serif" }}>
          {satsToKsh(product.price)}
        </div>
      </div>
    </div>
  )
}

export default function SellerProfile() {
  const { pubkey } = useParams()
  const navigate   = useNavigate()

  const [profile,      setProfile]      = useState(null)
  const [products,     setProducts]     = useState([])
  const [loading,      setLoading]      = useState(true)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const myPubkeyHex = (() => {
    try { return nip19.decode(localStorage.getItem('bitsoko_npub')).data } catch { return null }
  })()
  const isMe = pubkey === myPubkeyHex

  // Reset pagination when viewing a different seller
  useEffect(() => { setVisibleCount(PAGE_SIZE) }, [pubkey])

  useEffect(() => {
    let mounted = true
    const load = async () => {
      const relays = [...new Set([...getReadRelays(), ...DEFAULT_RELAYS])]
      const pool   = getPool()

      // ── Step 1: IndexedDB first for both profile + products ──
      const [cached, cachedProds] = await Promise.all([
        getProfile(pubkey),
        getProductsByPubkey(pubkey),
      ])

      if (cached && mounted) setProfile(cached)

      const activeProds = cachedProds.filter(p =>
        !p.tags?.some(t => t[0] === 't' && t[1] === 'deleted') && p.status !== 'deleted'
      )
      if (activeProds.length > 0 && mounted) {
        setProducts(activeProds)
        setLoading(false)
      }

      // ── Step 2: Fetch fresh profile from relay (querySync) ──
      try {
        const profileEvents = await pool.querySync(
          relays,
          { kinds: [0], authors: [pubkey], limit: 1 }
        )
        if (profileEvents.length && mounted) {
          profileEvents.sort((a, b) => b.created_at - a.created_at)
          const p = JSON.parse(profileEvents[0].content)
          await saveProfile(pubkey, p)
          if (mounted) setProfile(p)
        }
      } catch(e) {
        console.warn('[bitsoko] SellerProfile profile fetch error:', e)
      }

      // ── Step 3: Fetch this seller's products from relay (querySync) ──
      // This is the fix for: photos disappear on scroll + cleared data empty shop.
      // We always fetch from relay so the product list is always fresh and complete.
      try {
        const productEvents = await pool.querySync(
          relays,
          { kinds: [KINDS.LISTING], authors: [pubkey], limit: 200 }
        )

        if (productEvents.length && mounted) {
          // Merge: newer created_at wins for same pubkey:d-tag
          const mergedMap = new Map()
          for (const event of productEvents) {
            const dTag = (event.tags || []).find(t => t[0] === 'd')?.[1]
            const key  = dTag ? `${event.pubkey}:${dTag}` : event.id
            const ex   = mergedMap.get(key)
            if (!ex || event.created_at >= ex.created_at) mergedMap.set(key, event)
          }

          // Save all to IndexedDB
          for (const event of mergedMap.values()) {
            await saveProduct(event)
          }

          // Reload from IndexedDB (normalised, parsed)
          const fresh = await getProductsByPubkey(pubkey)
          const active = fresh.filter(p =>
            !p.tags?.some(t => t[0] === 't' && t[1] === 'deleted') && p.status !== 'deleted'
          )
          if (mounted) setProducts(active)
        }
      } catch(e) {
        console.warn('[bitsoko] SellerProfile products fetch error:', e)
      }

      if (mounted) setLoading(false)
    }

    load()
    return () => { mounted = false }
  }, [pubkey])

  const displayName = profile?.display_name || profile?.name || pubkey?.slice(0, 16) + '…'

  let npubShort = ''
  try { npubShort = nip19.npubEncode(pubkey).slice(0, 20) + '…' } catch {}

  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: "'Inter',sans-serif" }}>

      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(247,244,240,0.92)', backdropFilter: 'blur(12px)',
        padding: '14px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <button onClick={() => navigate(-1)} style={{
          width: 36, height: 36, borderRadius: '50%',
          background: C.white, border: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}>
          <ArrowLeft size={17} color={C.black}/>
        </button>
        {isMe && (
          <button onClick={() => navigate('/profile')} style={{
            padding: '8px 16px', borderRadius: 99,
            background: C.black, border: 'none', cursor: 'pointer',
            fontSize: '0.75rem', fontWeight: 700, color: C.white,
          }}>
            Edit profile
          </button>
        )}
      </div>

      {/* Hero card — curvy, not edge-to-edge */}
      <div style={{
        background: C.black,
        margin: '0 16px',
        borderRadius: 24,
        padding: '28px 20px 24px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
      }}>
        <Avatar profile={profile} pubkey={pubkey} size={80}/>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: C.white, marginBottom: 4 }}>
            {displayName}
          </div>
          {profile?.about && (
            <div style={{
              fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)',
              lineHeight: 1.6, maxWidth: 280, margin: '0 auto',
            }}>
              {profile.about}
            </div>
          )}
        </div>

        {/* Badges */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          {profile?.lud16 && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: 'rgba(247,147,26,0.18)', borderRadius: 99,
              padding: '6px 14px', border: '1px solid rgba(247,147,26,0.3)',
              maxWidth: 240,
            }}>
              <Zap size={11} fill={C.orange} color={C.orange} style={{ flexShrink: 0 }}/>
              <span style={{
                fontSize: 11, color: C.orange, fontWeight: 600,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {profile.lud16}
              </span>
            </div>
          )}
          {profile?.nip05 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'rgba(34,197,94,0.12)', borderRadius: 99,
              padding: '5px 12px', border: '1px solid rgba(34,197,94,0.2)',
            }}>
              <ShieldCheck size={11} color={C.green}/>
              <span style={{ fontSize: '0.7rem', color: C.green, fontWeight: 600 }}>
                {profile.nip05}
              </span>
            </div>
          )}
          {profile?.website && (
            <a href={profile.website} target="_blank" rel="noreferrer" style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'rgba(255,255,255,0.08)', borderRadius: 99,
              padding: '5px 12px', border: '1px solid rgba(255,255,255,0.12)',
              textDecoration: 'none',
            }}>
              <ExternalLink size={11} color="rgba(255,255,255,0.6)"/>
              <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>
                Website
              </span>
            </a>
          )}
        </div>

        <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>
          {npubShort}
        </div>
      </div>

      {/* Stats bar */}
      <div style={{
        background: C.white, borderBottom: `1px solid ${C.border}`,
        padding: '14px 20px', marginTop: 16,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <Store size={14} color={C.ochre}/>
        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: C.black }}>
          {products.length} listing{products.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Products grid */}
      <div style={{ padding: '20px' }}>
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
            <Loader size={24} color={C.ochre} style={{ animation: 'spin 1s linear infinite' }}/>
          </div>
        )}

        {!loading && products.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '48px 20px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          }}>
            <Package size={40} color={C.border}/>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: C.black }}>No listings yet</div>
            <div style={{ fontSize: '0.75rem', color: C.muted }}>
              {isMe ? 'Add your first product' : "This seller hasn't listed anything yet"}
            </div>
            {isMe && (
              <button onClick={() => navigate('/create-listing')} style={{
                marginTop: 8, padding: '10px 24px',
                background: C.black, border: 'none', borderRadius: 12,
                cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700, color: C.white,
              }}>
                + List a product
              </button>
            )}
          </div>
        )}

        {!loading && products.length > 0 && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {products.slice(0, visibleCount).map(p => (
                <ProductCard key={p.id} product={p} onClick={() => navigate(`/product/${p.id}`)}/>
              ))}
            </div>

            {/* Load more — keeps DOM image count low, prevents GPU bitmap eviction */}
            {visibleCount < products.length && (
              <button
                onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                style={{
                  width: '100%', marginTop: 16, padding: '13px',
                  background: C.white, border: `1.5px solid ${C.border}`,
                  borderRadius: 14, cursor: 'pointer',
                  fontSize: '0.82rem', fontWeight: 600, color: C.black,
                  fontFamily: "'Inter',sans-serif",
                }}
              >
                Load more · {products.length - visibleCount} remaining
              </button>
            )}
          </>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

