import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Zap, Share2, Heart, Store,
  Truck, Package, ChevronRight, Loader,
  CheckCircle, AlertCircle, MessageCircle,
  ShieldCheck,
} from 'lucide-react'
import { getProductById, getProfile, addToCart, saveProduct, saveProfile } from '../lib/db'
import { publishOrder, getPool, getReadRelays, DEFAULT_RELAYS, KINDS } from '../lib/nostrSync'
import { purchaseWithFeeSplit, getBalance } from '../lib/cashuWallet'
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
  green:  '#22c55e',
}

function timeAgo(ts) {
  const s = Math.floor(Date.now() / 1000) - ts
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function Avatar({ profile, pubkey, size = 40 }) {
  const [err, setErr] = useState(false)
  const name   = profile?.name || profile?.display_name || pubkey?.slice(0, 4) || '?'
  const letter = name[0].toUpperCase()
  if (profile?.picture && !err) {
    return (
      <img src={profile.picture} alt={letter} onError={() => setErr(true)}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover',
          flexShrink: 0, border: `1.5px solid ${C.border}` }}/>
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: C.black,
      flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Inter',sans-serif", fontWeight: 700,
      fontSize: size * 0.38, color: C.white,
    }}>
      {letter}
    </div>
  )
}

export default function ProductDetail() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const rate     = useRate() // ← live BTC/KES rate

  const [product,      setProduct]      = useState(null)
  const [profile,      setProfile]      = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [activeImg,    setActiveImg]    = useState(0)
  const [quantity,     setQuantity]     = useState(1)
  const [saved,        setSaved]        = useState(false)
  const [cartStatus,   setCartStatus]   = useState('idle')
  const [orderStatus,  setOrderStatus]  = useState('idle')
  const [orderErr,     setOrderErr]     = useState('')
  const [showOrder,    setShowOrder]    = useState(false)
  const [orderMessage, setOrderMessage] = useState('')
  const [showCopied,   setShowCopied]   = useState(false)

  const myPubkey = (() => {
    try {
      const npub = localStorage.getItem('bitsoko_npub')
      if (!npub) return null
      return nip19.decode(npub).data
    } catch { return null }
  })()

  const isMyProduct = product && myPubkey && product.pubkey === myPubkey

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const relays = [...new Set([...getReadRelays(), ...DEFAULT_RELAYS])]
        const pool   = getPool()

        let p = await getProductById(id)
        if (p && mounted) {
          setProduct(p)
          setLoading(false)
        }

        if (!p) {
          const parts  = id.split(':')
          const pubkey = parts[0]
          const dTag   = parts.slice(1).join(':')

          let fetchedEvents = []
          try {
            if (pubkey && dTag) {
              fetchedEvents = await pool.querySync(
                relays,
                { kinds: [KINDS.LISTING], authors: [pubkey], '#d': [dTag], limit: 5 }
              )
            }
            if (!fetchedEvents.length) {
              fetchedEvents = await pool.querySync(
                relays,
                { kinds: [KINDS.LISTING], ids: [id], limit: 1 }
              )
            }
          } catch(e) {
            console.warn('[bitsoko] ProductDetail relay fetch error:', e)
          }

          if (fetchedEvents.length && mounted) {
            fetchedEvents.sort((a, b) => b.created_at - a.created_at)
            await saveProduct(fetchedEvents[0])
            p = await getProductById(id)
            if (p && mounted) setProduct(p)
          }

          if (mounted) setLoading(false)
          if (!p) return
        }

        const cached = await getProfile(p.pubkey)
        if (cached && mounted) setProfile(cached)

        try {
          const profileEvents = await pool.querySync(
            relays,
            { kinds: [0], authors: [p.pubkey], limit: 1 }
          )
          if (profileEvents.length && mounted) {
            profileEvents.sort((a, b) => b.created_at - a.created_at)
            const parsed = JSON.parse(profileEvents[0].content)
            await saveProfile(p.pubkey, parsed, profileEvents[0].created_at)
            if (mounted) setProfile(parsed)
          }
        } catch(e) {
          console.warn('[bitsoko] profile fetch error:', e)
        }

      } catch(e) {
        console.error('[bitsoko] ProductDetail load error:', e)
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [id])

  const [buyStatus, setBuyStatus] = useState('idle')
  const [buyErr,    setBuyErr]    = useState('')

  const handleBuyNow = async () => {
    if (!product || buyStatus === 'paying' || buyStatus === 'done') return
    setBuyStatus('checking'); setBuyErr('')

    const sellerLud16 = profile?.lud16 || profile?.lightning || profile?.lud06

    if (!sellerLud16) {
      setBuyStatus('noLN')
      setBuyErr(`Seller has no Lightning address. Profile fields: ${Object.keys(profile||{}).join(', ')}`)
      return
    }

    const total   = product.price * quantity
    const balance = getBalance()
    if (balance < total) {
      setBuyStatus('noFunds')
      setBuyErr(`Need ${total.toLocaleString()} sats — wallet has ${balance.toLocaleString()} sats`)
      return
    }

    setBuyStatus('paying')
    try {
      await purchaseWithFeeSplit({
        sellerLud16,
        totalSats:   total,
        productName: product.name,
      })
      await publishOrder({ sellerPubkey: product.pubkey, product, quantity, message: orderMessage }).catch(() => {})
      setBuyStatus('done')
    } catch(e) {
      setBuyErr(e.message || 'Payment failed')
      setBuyStatus('error')
    }
  }

  const handleAddToCart = async () => {
    if (!product) return
    await addToCart(product, quantity)
    setCartStatus('added')
    setTimeout(() => setCartStatus('idle'), 2000)
  }

  const handleOrder = async () => {
    if (!product || orderStatus === 'sending' || orderStatus === 'done') return
    setOrderStatus('sending'); setOrderErr('')
    try {
      await publishOrder({ sellerPubkey: product.pubkey, product, quantity, message: orderMessage })
      setOrderStatus('done')
      setTimeout(() => setShowOrder(false), 2000)
    } catch (e) {
      setOrderErr(e.message || 'Failed to send order')
      setOrderStatus('error')
    }
  }

  const copyLink = () => {
    navigator.clipboard?.writeText(`${window.location.origin}/product/${id}`)
    setShowCopied(true)
    setTimeout(() => setShowCopied(false), 1500)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader size={28} color={C.ochre} style={{ animation: 'spin 1s linear infinite' }}/>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (!product) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
        <Package size={40} color={C.border}/>
        <div style={{ fontSize: '1rem', fontWeight: 700, color: C.black }}>Product not found</div>
        <div style={{ fontSize: '0.8rem', color: C.muted }}>It may have been removed or not synced yet</div>
        <button onClick={() => navigate(-1)} style={{ marginTop: 8, padding: '10px 24px', background: C.black, border: 'none', borderRadius: 12, cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700, color: C.white }}>
          Go back
        </button>
      </div>
    )
  }

  const images     = product.images?.length > 0 ? product.images : []
  const hasImages  = images.length > 0
  const sellerName = profile?.name || profile?.display_name || product.pubkey?.slice(0, 12) + '…'
  const PROPER_CATS  = ['Electronics','Fashion','Food & Drinks','Art & Crafts','Home & Living','Books','Music','Wellness','Services','Collectibles','Sports','Other']
  const RESERVED_TAGS = new Set(['bitsoko','bitcoin','deleted','active','sold','sale','deal'])
  const tags = [...new Set(
    (product.tags || [])
      .filter(t => t[0] === 't' && !RESERVED_TAGS.has(t[1]))
      .map(t => PROPER_CATS.find(p => p.toLowerCase() === t[1].toLowerCase()) || t[1])
  )]
  const inStock    = product.quantity === -1 || product.quantity > 0
  const stockLabel = product.quantity === -1 ? 'In stock' : product.quantity === 0 ? 'Out of stock' : `${product.quantity} left`

  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: "'Inter',sans-serif" }}>

      {/* Sticky header */}
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
        <div style={{ display: 'flex', gap: 10 }}>
          {isMyProduct && (
            <button onClick={() => navigate('/shop')} style={{
              height: 36, borderRadius: 99,
              background: C.white, border: `1px solid ${C.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', gap: 6, padding: '0 14px',
              fontSize: '0.72rem', fontWeight: 700, color: C.black,
            }}>
              <Store size={13}/> Edit
            </button>
          )}
          <button onClick={copyLink} style={{
            width: 36, height: 36, borderRadius: '50%',
            background: C.white, border: `1px solid ${C.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}>
            {showCopied ? <CheckCircle size={16} color={C.green}/> : <Share2 size={16} color={C.black}/>}
          </button>
          <button onClick={() => setSaved(s => !s)} style={{
            width: 36, height: 36, borderRadius: '50%',
            background: saved ? '#fff0f0' : C.white,
            border: `1px solid ${saved ? '#ffd0d0' : C.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}>
            <Heart size={16} fill={saved ? C.red : 'none'} color={saved ? C.red : C.black}/>
          </button>
        </div>
      </div>

      {/* Image gallery */}
      {hasImages && (
        <div style={{ background: C.black }}>
          <div style={{ width: '100%', aspectRatio: '1', overflow: 'hidden', position: 'relative' }}>
            <img
              src={images[activeImg]} alt={product.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={e => e.target.style.display = 'none'}
            />
            {images.length > 1 && (
              <div style={{
                position: 'absolute', bottom: 14, right: 14,
                background: 'rgba(0,0,0,0.5)', borderRadius: 99,
                padding: '4px 10px', backdropFilter: 'blur(4px)',
                fontSize: '0.65rem', fontWeight: 600, color: C.white,
                fontFamily: "'Inter',sans-serif",
              }}>
                {activeImg + 1} / {images.length}
              </div>
            )}
          </div>
          {images.length > 1 && (
            <div style={{ display: 'flex', gap: 8, padding: '10px 16px', overflowX: 'auto', scrollbarWidth: 'none' }}>
              {images.map((url, i) => (
                <button key={i} onClick={() => setActiveImg(i)} style={{
                  flexShrink: 0, width: 56, height: 56, borderRadius: 10,
                  overflow: 'hidden', padding: 0, cursor: 'pointer',
                  border: `2px solid ${i === activeImg ? C.ochre : 'transparent'}`,
                  transition: 'border-color .2s',
                }}>
                  <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!hasImages && (
        <div style={{ width: '100%', aspectRatio: '1', background: C.border, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Store size={48} color="rgba(26,20,16,0.15)"/>
        </div>
      )}

      <div style={{ padding: '20px 20px 120px' }}>

        {tags.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {tags.map(t => (
              <span key={t} style={{
                padding: '3px 10px', borderRadius: 99,
                background: C.white, border: `1px solid ${C.border}`,
                fontSize: '0.65rem', color: C.muted, textTransform: 'capitalize',
                fontFamily: "'Inter',sans-serif",
              }}>
                {t}
              </span>
            ))}
          </div>
        )}

        {/* Name + price */}
        <div style={{ marginBottom: 16 }}>
          <h1 style={{
            fontSize: '1.4rem', fontWeight: 700, color: C.black,
            lineHeight: 1.3, marginBottom: 10, fontFamily: "'Inter',sans-serif",
          }}>
            {product.name}
          </h1>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Zap size={18} fill={C.orange} color={C.orange}/>
                <span style={{ fontSize: '1.6rem', fontWeight: 800, color: C.black, fontFamily: "'Inter',sans-serif" }}>
                  {product.price?.toLocaleString()}
                </span>
                <span style={{ fontSize: '0.85rem', color: C.muted, fontFamily: "'Inter',sans-serif" }}>sats</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: C.muted, fontFamily: "'Inter',sans-serif" }}>
                ≈ {satsToKsh(product.price, rate)}
              </div>
            </div>
            <div style={{
              padding: '6px 12px', borderRadius: 99,
              background: inStock ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
              border: `1px solid ${inStock ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
              fontSize: '0.72rem', fontWeight: 600,
              color: inStock ? C.green : C.red, fontFamily: "'Inter',sans-serif",
            }}>
              {stockLabel}
            </div>
          </div>
        </div>

        {/* Seller card */}
        <div
          onClick={() => navigate(`/seller/${product.pubkey}`)}
          style={{
            background: C.white, borderRadius: 14,
            border: `1px solid ${C.border}`, padding: '14px 16px',
            display: 'flex', alignItems: 'center', gap: 12,
            cursor: 'pointer', marginBottom: 20,
          }}
        >
          <Avatar profile={profile} pubkey={product.pubkey} size={44}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: C.black }}>{sellerName}</div>
            {profile?.lud16 && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, fontSize: 11, color: C.ochre, marginTop: 2 }}>
                <Zap size={10} fill={C.ochre} color={C.ochre} style={{ flexShrink: 0, marginTop: 1 }}/>
                <span style={{ wordBreak: 'break-all', lineHeight: 1.4 }}>{profile.lud16}</span>
              </div>
            )}
            {profile?.nip05 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.65rem', color: C.muted, marginTop: 2 }}>
                <ShieldCheck size={10} color={C.green}/> {profile.nip05}
              </div>
            )}
          </div>
          <ChevronRight size={16} color={C.muted}/>
        </div>

        {/* Description */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: C.black, marginBottom: 10 }}>About this product</div>
          <div style={{
            fontSize: '0.88rem', color: '#4a4039', lineHeight: 1.75,
            fontFamily: "'Inter',sans-serif", whiteSpace: 'pre-wrap',
          }}>
            {product.description || 'No description provided.'}
          </div>
        </div>

        {/* Shipping */}
        {product.shipping?.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: C.black, marginBottom: 10 }}>
              <Truck size={14} style={{ marginRight: 6, verticalAlign: 'middle' }}/>
              Shipping options
            </div>
            {product.shipping.map((s, i) => (
              <div key={i} style={{
                background: C.white, borderRadius: 12,
                border: `1px solid ${C.border}`, padding: '12px 14px',
                marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: C.black }}>{s.name}</div>
                  <div style={{ fontSize: '0.68rem', color: C.muted, marginTop: 2 }}>{s.regions}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {parseInt(s.cost) === 0
                    ? <span style={{ fontSize: '0.78rem', fontWeight: 700, color: C.green }}>Free</span>
                    : <><Zap size={12} fill={C.orange} color={C.orange}/>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: C.black }}>{parseInt(s.cost).toLocaleString()} sats</span>
                      </>
                  }
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ fontSize: '0.68rem', color: C.muted, textAlign: 'center', marginTop: 8 }}>
          Listed {timeAgo(product.created_at)}
        </div>
      </div>

      {/* Bottom action bar */}
      {inStock && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: C.white, borderTop: `1px solid ${C.border}`,
          padding: '14px 20px',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)',
          display: 'flex', gap: 10, alignItems: 'center',
          boxShadow: '0 -4px 16px rgba(26,20,16,0.06)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', border: `1.5px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
            <button onClick={() => setQuantity(q => Math.max(1, q - 1))} style={{
              width: 36, height: 44, background: C.bg, border: 'none',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.1rem', color: C.black,
            }}>−</button>
            <div style={{ width: 32, textAlign: 'center', fontSize: '0.88rem', fontWeight: 700, color: C.black }}>
              {quantity}
            </div>
            <button onClick={() => setQuantity(q => product.quantity === -1 ? q + 1 : Math.min(product.quantity, q + 1))} style={{
              width: 36, height: 44, background: C.bg, border: 'none',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.1rem', color: C.black,
            }}>+</button>
          </div>
          <button onClick={handleAddToCart} style={{
            flex: 1, padding: '13px',
            background: cartStatus === 'added' ? 'rgba(34,197,94,0.08)' : C.bg,
            border: `1.5px solid ${cartStatus === 'added' ? C.green : C.border}`,
            borderRadius: 12, cursor: 'pointer',
            fontSize: '0.82rem', fontWeight: 700,
            color: cartStatus === 'added' ? C.green : C.black,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            transition: 'all .2s',
          }}>
            {cartStatus === 'added' ? <><CheckCircle size={15}/> Added</> : 'Add to cart'}
          </button>
          <button onClick={handleBuyNow} disabled={buyStatus === 'paying' || buyStatus === 'done'} style={{
            flex: 1, padding: '13px',
            background: C.black, border: 'none', borderRadius: 12, cursor: 'pointer',
            fontSize: '0.82rem', fontWeight: 700, color: C.white,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            {buyStatus === 'paying'
              ? <><Loader size={14} style={{ animation:'spin 1s linear infinite' }}/> Paying…</>
              : buyStatus === 'done'
              ? <><CheckCircle size={14}/> Paid!</>
              : <><Zap size={14} fill={C.orange} color={C.orange}/> Buy now</>
            }
          </button>
        </div>
      )}

      {/* Buy Now status feedback */}
      {buyStatus === 'noLN' && (
        <div style={{ margin:'0 16px 8px',display:'flex',alignItems:'center',gap:8,padding:'10px 14px',borderRadius:10,background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.2)',fontSize:12,color:C.red }}>
          <AlertCircle size={14}/> Seller has no Lightning address — message them directly.
        </div>
      )}
      {buyStatus === 'noFunds' && (
        <div style={{ margin:'0 16px 8px',display:'flex',alignItems:'center',gap:8,padding:'10px 14px',borderRadius:10,background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.2)',fontSize:12,color:C.red }}>
          <AlertCircle size={14}/> {buyErr} — <span style={{ textDecoration:'underline',cursor:'pointer' }} onClick={() => navigate('/wallet')}>top up wallet</span>
        </div>
      )}
      {buyStatus === 'error' && (
        <div style={{ margin:'0 16px 8px',display:'flex',alignItems:'center',gap:8,padding:'10px 14px',borderRadius:10,background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.2)',fontSize:12,color:C.red }}>
          <AlertCircle size={14}/> {buyErr}
        </div>
      )}
      {buyStatus === 'done' && (
        <div style={{ margin:'0 16px 8px',display:'flex',alignItems:'center',gap:8,padding:'10px 14px',borderRadius:10,background:'rgba(34,197,94,0.06)',border:'1px solid rgba(34,197,94,0.2)',fontSize:12,color:C.green }}>
          <CheckCircle size={14}/> Payment sent! Seller notified.
        </div>
      )}

      {/* Order sheet */}
      {showOrder && (
        <>
          <div onClick={() => setShowOrder(false)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(26,20,16,0.5)', backdropFilter: 'blur(2px)' }}/>
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 210,
            background: C.white, borderRadius: '20px 20px 0 0',
            padding: '20px 20px 48px',
            animation: 'sheetUp .25s cubic-bezier(0.32,0.72,0,1)',
            boxShadow: '0 -4px 40px rgba(26,20,16,0.15)',
          }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: C.border, margin: '0 auto 20px' }}/>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: C.black, marginBottom: 4 }}>
              Send order to seller
            </div>
            <div style={{ fontSize: '0.75rem', color: C.muted, marginBottom: 20 }}>
              This sends an encrypted DM to {sellerName} with your order details.
            </div>
            <div style={{ background: C.bg, borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '0.82rem', color: C.black, fontWeight: 600 }}>{product.name}</div>
                <div style={{ fontSize: '0.75rem', color: C.muted }}>×{quantity}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
                <Zap size={13} fill={C.orange} color={C.orange}/>
                <span style={{ fontSize: '0.95rem', fontWeight: 800, color: C.black }}>
                  {(product.price * quantity).toLocaleString()} sats
                </span>
                <span style={{ fontSize: '0.68rem', color: C.muted }}>≈ {satsToKsh(product.price * quantity, rate)}</span>
              </div>
            </div>
            <textarea
              value={orderMessage}
              onChange={e => setOrderMessage(e.target.value)}
              placeholder="Add a note to the seller (address, size, colour…)"
              rows={3}
              style={{
                width: '100%', padding: '12px 14px', background: C.bg,
                border: `1.5px solid ${C.border}`, borderRadius: 12,
                outline: 'none', resize: 'none', fontSize: '0.85rem',
                color: C.black, lineHeight: 1.6,
                fontFamily: "'Inter',sans-serif", boxSizing: 'border-box', marginBottom: 14,
              }}
            />
            {orderStatus === 'error' && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px', borderRadius: 10,
                background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
                fontSize: '0.75rem', color: C.red, marginBottom: 12,
                fontFamily: "'Inter',sans-serif",
              }}>
                <AlertCircle size={14}/> {orderErr}
              </div>
            )}
            <button onClick={handleOrder} disabled={orderStatus === 'sending' || orderStatus === 'done'} style={{
              width: '100%', padding: '15px',
              background: orderStatus === 'done' ? C.green : C.black,
              border: 'none', borderRadius: 14,
              cursor: orderStatus === 'sending' || orderStatus === 'done' ? 'not-allowed' : 'pointer',
              fontSize: '0.92rem', fontWeight: 700, color: C.white,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all .2s',
            }}>
              {orderStatus === 'sending'
                ? <><Loader size={16} style={{ animation: 'spin 1s linear infinite' }}/> Sending order…</>
                : orderStatus === 'done'
                ? <><CheckCircle size={16}/> Order sent!</>
                : <><MessageCircle size={16}/> Send order to seller</>
              }
            </button>
            <div style={{ textAlign: 'center', marginTop: 12, fontSize: '0.65rem', color: C.muted }}>
              Encrypted end-to-end via Nostr DM
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes spin    { to { transform: rotate(360deg) } }
        @keyframes sheetUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
      `}</style>
    </div>
  )
}

