import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { nip19 } from 'nostr-tools'
import { finalizeEvent } from 'nostr-tools/pure'
import { SimplePool } from 'nostr-tools/pool'
import {
  ArrowLeft, Check, Copy, Eye, EyeOff, Save,
  Upload, Zap, Globe, AtSign, User, FileText,
  Image, RefreshCw, X, Grid,
} from 'lucide-react'
import { getSecretKey, getPublicKeyHex, getWriteRelays, DEFAULT_RELAYS, uploadImage } from '../lib/nostrSync'
import { saveProfile, getProfile } from '../lib/db'

const C = {
  bg:     '#f7f4f0',
  white:  '#ffffff',
  black:  '#1a1410',
  muted:  '#b0a496',
  border: '#e8e0d5',
  orange: '#f7931a',
  terra:  '#b5451b',
  sage:   '#2d6a4f',
  inputBg:'#faf8f5',
  red:    '#ef4444',
  green:  '#22c55e',
}

// Hardcoded — don't depend on NIP-65 loading, works immediately on mount
const FETCH_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://relay.nostr.band',
  'wss://nostr-pub.wellorder.net',
]

const FIELDS = [
  { key: 'name',         label: 'Username',          icon: AtSign,   placeholder: 'satoshi',              type: 'text'     },
  { key: 'display_name', label: 'Display Name',      icon: User,     placeholder: 'Satoshi Nakamoto',     type: 'text'     },
  { key: 'about',        label: 'Bio',               icon: FileText, placeholder: 'Building on Bitcoin…', type: 'textarea' },
  { key: 'picture',      label: 'Avatar URL',        icon: Image,    placeholder: 'https://…',            type: 'text'     },
  { key: 'banner',       label: 'Banner URL',        icon: Image,    placeholder: 'https://…',            type: 'text'     },
  { key: 'website',      label: 'Website',           icon: Globe,    placeholder: 'https://yoursite.com', type: 'text'     },
  { key: 'lud16',        label: 'Lightning Address', icon: Zap,      placeholder: 'you@wallet.com',       type: 'text'     },
]

export default function Profile() {
  const navigate  = useNavigate()
  const subRef    = useRef(null)

  // Reactive pubkey — updates if localStorage is set after initial render (e.g. fresh login)
  const [pubkeyHex, setPubkeyHex] = useState(() => {
    try { return getPublicKeyHex() } catch { return '' }
  })

  // Listen for bitsoko_npub being set (happens right after login)
  useEffect(() => {
    const onStorage = () => {
      try { setPubkeyHex(getPublicKeyHex()) } catch {}
    }
    window.addEventListener('storage', onStorage)
    // Also poll once immediately in case same-tab login just happened
    try { const k = getPublicKeyHex(); if (k) setPubkeyHex(k) } catch {}
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const npub      = pubkeyHex ? nip19.npubEncode(pubkeyHex) : ''
  const nsec      = (() => { try { return nip19.nsecEncode(getSecretKey()) } catch { return '' } })()
  const shortNpub = npub ? `${npub.slice(0,16)}…${npub.slice(-8)}` : ''

  const [form,        setForm]        = useState({})
  const [fetched,     setFetched]     = useState(null)
  const [fetchStatus, setFetchStatus] = useState('loading')
  const [saving,      setSaving]      = useState(false)
  const [saved,       setSaved]       = useState(false)
  const [error,       setError]       = useState('')
  const [showNsec,    setShowNsec]    = useState(false)
  const [copied,      setCopied]      = useState('')
  const [uploading,   setUploading]   = useState(null)
  const [showQR,      setShowQR]      = useState(false)
  const [refreshing,  setRefreshing]  = useState(false)

  const fillForm = (p) => {
    setFetched(p)
    setForm(prev => {
      const merged = { ...prev }
      FIELDS.forEach(({ key }) => { if (p[key]) merged[key] = p[key] })
      return merged
    })
    setFetchStatus('found')
    if (p.display_name || p.name) localStorage.setItem('bitsoko_display_name', p.display_name || p.name)
    if (p.lud16) localStorage.setItem('bitsoko_ln', p.lud16)
  }

  useEffect(() => {
    if (!pubkeyHex) { setFetchStatus('empty'); return }

    // Step 1: instant from IndexedDB
    getProfile(pubkeyHex).then(cached => {
      if (cached && (cached.name || cached.display_name || cached.about)) {
        fillForm(cached)
      } else {
        const n = localStorage.getItem('bitsoko_display_name')
        const l = localStorage.getItem('bitsoko_ln')
        if (n) setForm(prev => ({ ...prev, display_name: n, name: n }))
        if (l) setForm(prev => ({ ...prev, lud16: l }))
      }
    }).catch(() => {})

    // Step 2: live WebSocket — hardcoded relays, no async dependency
    const pool = new SimplePool()
    const sub  = pool.subscribe(
      FETCH_RELAYS,
      [{ kinds: [0], authors: [pubkeyHex], limit: 1 }],
      {
        onevent(e) {
          try { const p = JSON.parse(e.content); fillForm(p); saveProfile(pubkeyHex, p).catch(() => {}) } catch {}
        },
        oneose() {
          try { sub.close() } catch {}
          setFetchStatus(prev => prev === 'loading' ? 'empty' : prev)
        },
      }
    )
    subRef.current = sub
    const t = setTimeout(() => {
      try { sub.close() } catch {}
      setFetchStatus(prev => prev === 'loading' ? 'empty' : prev)
    }, 10000)

    return () => { clearTimeout(t); try { subRef.current?.close() } catch {} }
  }, [pubkeyHex])

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }))

  const handleRefresh = async () => {
    if (!pubkeyHex) return
    setRefreshing(true); setError('')
    try {
      const pool   = new SimplePool()
      const events = await pool.querySync(FETCH_RELAYS, { kinds: [0], authors: [pubkeyHex], limit: 1 })
      if (!events.length) throw new Error('No profile found on relays')
      const p = JSON.parse(events[0].content)
      fillForm(p)
      await saveProfile(pubkeyHex, p)
    } catch (e) { setError(e.message || 'Refresh failed') }
    setRefreshing(false)
  }

  const handleSave = async () => {
    setSaving(true); setError(''); setSaved(false)
    try {
      const payload = { ...(fetched || {}), ...form }
      Object.keys(payload).forEach(k => { if (!payload[k]) delete payload[k] })
      const sk     = getSecretKey()
      const relays = [...new Set([...getWriteRelays(), ...DEFAULT_RELAYS])]
      const event  = finalizeEvent({
        kind: 0, created_at: Math.floor(Date.now() / 1000),
        tags: [], content: JSON.stringify(payload),
      }, sk)
      await Promise.any(new SimplePool().publish(relays, event))
      await saveProfile(pubkeyHex, payload)
      fillForm(payload)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) { setError(e.message || 'Publish failed') }
    setSaving(false)
  }

  const handleUpload = async (fieldKey, file) => {
    if (!file) return
    setUploading(fieldKey)
    try { set(fieldKey, await uploadImage(file)) }
    catch (e) { setError(`Upload failed: ${e.message}`) }
    setUploading(null)
  }

  const copy = async (text, label) => {
    try { await navigator.clipboard.writeText(text); setCopied(label); setTimeout(() => setCopied(''), 2000) } catch {}
  }

  const avatar   = form.picture || fetched?.picture
  const dispName = form.display_name || form.name || fetched?.display_name || fetched?.name || shortNpub

  return (
    <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: 100 }}>

      {/* Top bar */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: C.white, borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
      }}>
        <button onClick={() => navigate('/', { state: { openMore: true } })} style={{
          width: 36, height: 36, borderRadius: '50%', border: `1px solid ${C.border}`,
          background: C.bg, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <ArrowLeft size={18} color={C.black} />
        </button>
        <span style={{ fontSize: 17, fontWeight: 800, color: C.black, flex: 1 }}>My Profile</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: fetchStatus === 'found' ? C.sage : fetchStatus === 'loading' ? C.orange : C.muted,
            animation: fetchStatus === 'loading' ? 'pulse 1.2s ease-in-out infinite' : 'none',
          }} />
          <span style={{ fontSize: 11, color: C.muted }}>
            {fetchStatus === 'found' ? 'Loaded' : fetchStatus === 'loading' ? 'Fetching…' : 'New'}
          </span>
        </div>
      </div>

      {/* Avatar row */}
      <div style={{ background: C.white, padding: '20px 16px 20px', marginBottom: 10, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <label style={{ cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
            <div style={{
              width: 76, height: 76, borderRadius: '50%',
              background: `linear-gradient(135deg, ${C.orange}, ${C.terra})`,
              border: `3px solid ${C.bg}`, boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24, fontWeight: 900, color: '#fff', overflow: 'hidden',
            }}>
              {avatar
                ? <img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => e.target.style.display = 'none'} />
                : dispName.slice(0, 2).toUpperCase()
              }
            </div>
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: 'rgba(0,0,0,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: 0, transition: 'opacity .2s',
            }}
              onMouseEnter={e => e.currentTarget.style.opacity = 1}
              onMouseLeave={e => e.currentTarget.style.opacity = 0}
            >
              {uploading === 'picture'
                ? <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #fff', borderTopColor: 'transparent', animation: 'spin .7s linear infinite' }} />
                : <Upload size={14} color="#fff" />
              }
            </div>
            <input type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => handleUpload('picture', e.target.files?.[0])} />
          </label>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.black }}>{dispName}</div>
            {(form.lud16 || fetched?.lud16) && (
              <div style={{ fontSize: 12, color: C.sage, display: 'flex', alignItems: 'flex-start', gap: 4, marginTop: 2 }}>
                <Zap size={11} style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ wordBreak: 'break-all', lineHeight: 1.4 }}>{form.lud16 || fetched?.lud16}</span>
              </div>
            )}
            <div style={{ fontSize: 11, color: C.muted, fontFamily: 'monospace', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shortNpub}</div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowQR(true)} style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Grid size={15} color={C.muted} />
            </button>
            <button onClick={handleRefresh} disabled={refreshing} style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg, cursor: refreshing ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <RefreshCw size={15} color={refreshing ? C.orange : C.muted} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 16px' }}>

        {/* Keys */}
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>Identity Keys</div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Public Key (npub) — safe to share</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.inputBg, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px' }}>
              <span style={{ flex: 1, fontSize: 11, fontFamily: 'monospace', color: C.black, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shortNpub || 'Not available'}</span>
              <button onClick={() => copy(npub, 'npub')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied === 'npub' ? C.sage : C.muted, display: 'flex', padding: 2 }}>
                {copied === 'npub' ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, color: C.red, marginBottom: 6, fontWeight: 600 }}>Secret Key — NEVER share ⚠️</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 10, padding: '10px 12px' }}>
              <span style={{ flex: 1, fontSize: 11, fontFamily: 'monospace', color: C.red, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {showNsec ? (nsec || 'Not found') : '•'.repeat(40)}
              </span>
              <button onClick={() => setShowNsec(s => !s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, display: 'flex', padding: 2 }}>
                {showNsec ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              {showNsec && (
                <button onClick={() => copy(nsec, 'nsec')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied === 'nsec' ? C.sage : C.muted, display: 'flex', padding: 2 }}>
                  {copied === 'nsec' ? <Check size={14} /> : <Copy size={14} />}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Profile fields */}
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>Profile Info</div>

          {FIELDS.map(({ key, label, icon: Icon, placeholder, type }) => (
            <div key={key} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Icon size={12} color={C.muted} />
                <span style={{ fontSize: 12, color: C.black, fontWeight: 600 }}>{label}</span>
                {fetched?.[key] && form[key] === fetched[key] && (
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: C.sage, background: 'rgba(45,106,79,0.08)', padding: '2px 7px', borderRadius: 4, border: '1px solid rgba(45,106,79,0.2)' }}>
                    from Nostr ✓
                  </span>
                )}
              </div>
              {type === 'textarea' ? (
                <textarea value={form[key] || ''} onChange={e => set(key, e.target.value)} placeholder={placeholder} rows={3}
                  style={{ width: '100%', boxSizing: 'border-box', background: C.inputBg, border: `1px solid ${form[key] ? C.orange + '66' : C.border}`, borderRadius: 10, padding: '10px 12px', color: C.black, fontSize: 13, resize: 'vertical', fontFamily: 'inherit', outline: 'none' }} />
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="text" value={form[key] || ''} onChange={e => set(key, e.target.value)} placeholder={placeholder}
                    style={{ flex: 1, background: C.inputBg, border: `1px solid ${form[key] ? C.orange + '66' : C.border}`, borderRadius: 10, padding: '10px 12px', color: C.black, fontSize: 13, outline: 'none' }} />
                  {(key === 'picture' || key === 'banner') && (
                    <label style={{ width: 42, height: 42, borderRadius: 10, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(247,147,26,0.08)', border: `1px solid ${C.border}`, color: uploading === key ? C.orange : C.muted }}>
                      {uploading === key
                        ? <div style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${C.orange}`, borderTopColor: 'transparent', animation: 'spin .7s linear infinite' }} />
                        : <Upload size={14} />
                      }
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleUpload(key, e.target.files?.[0])} />
                    </label>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: C.red }}>{error}</div>
        )}

        <button onClick={handleSave} disabled={saving} style={{
          width: '100%', padding: 16, borderRadius: 14, border: 'none',
          background: saved ? `linear-gradient(135deg,#9e9890,#7a7068)` : `linear-gradient(135deg,${C.orange},${C.terra})`,
          color: '#fff', fontWeight: 800, fontSize: 16, cursor: saving ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          opacity: saving ? 0.7 : 1, transition: 'all 0.3s', boxShadow: '0 4px 20px rgba(247,147,26,0.3)',
        }}>
          {saving ? <><div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', animation: 'spin .7s linear infinite' }} /> Publishing…</>
            : saved ? <><Check size={18} /> Saved to Nostr</>
            : <><Save size={18} /> Save Profile</>}
        </button>
        <div style={{ marginTop: 10, fontSize: 11, color: C.muted, textAlign: 'center' }}>
          Publishes kind:0 · visible on Damus, Amethyst, Primal and all Nostr clients
        </div>
      </div>

      {/* QR Modal */}
      {showQR && npub && (
        <div onClick={e => e.target === e.currentTarget && setShowQR(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: 480, background: C.white, borderRadius: '20px 20px 0 0', border: `1px solid ${C.border}`, padding: '24px 20px 48px', position: 'relative', textAlign: 'center' }}>
            <button onClick={() => setShowQR(false)} style={{ position: 'absolute', top: 14, right: 14, width: 30, height: 30, borderRadius: '50%', border: `1px solid ${C.border}`, background: C.bg, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={14} color={C.muted} />
            </button>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.black, marginBottom: 4 }}>{dispName}</div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 20 }}>Scan to find on Nostr</div>
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(npub)}&bgcolor=f7f4f0&color=1a1410&margin=12`}
              alt="QR" style={{ width: 220, height: 220, borderRadius: 14, display: 'block', margin: '0 auto', border: `1px solid ${C.border}` }} />
            <div style={{ marginTop: 14, fontSize: 11, color: C.muted, fontFamily: 'monospace', wordBreak: 'break-all', padding: '0 16px' }}>{npub}</div>
            <button onClick={() => copy(npub, 'qr')} style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 6, background: C.bg, border: `1px solid ${C.border}`, color: copied === 'qr' ? C.sage : C.black, padding: '10px 22px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              {copied === 'qr' ? <Check size={13} /> : <Copy size={13} />}
              {copied === 'qr' ? 'Copied!' : 'Copy npub'}
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin  { to { transform: rotate(360deg) } }
        @keyframes pulse { 0%,100%{ opacity:1 } 50%{ opacity:0.35 } }
        input::placeholder, textarea::placeholder { color: #c0b8b0; }
        input:focus, textarea:focus { border-color: rgba(247,147,26,0.6) !important; outline: none; }
      `}</style>
    </div>
  )
}

