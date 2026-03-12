import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Camera, Check, Loader, AlertCircle,
  Zap, ShieldCheck, User,
  Eye, EyeOff, Copy, Key,
  CheckCircle, ArrowLeft,
} from 'lucide-react'
import { getProfile, saveProfile } from '../lib/db'
import { uploadImage, getPool, RELAYS } from '../lib/nostrSync'
import { finalizeEvent, nip19 } from 'nostr-tools'

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

function getSecretKey() {
  const nsec = localStorage.getItem('bitsoko_nsec')
  if (!nsec) throw new Error('No secret key')
  return nip19.decode(nsec).data
}

function getPublicKeyHex() {
  try {
    const npub = localStorage.getItem('bitsoko_npub')
    return nip19.decode(npub).data
  } catch { throw new Error('No public key') }
}

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{
        display: 'block', fontSize: '0.78rem',
        fontWeight: 600, color: C.black, marginBottom: hint ? 4 : 8,
        fontFamily: "'Inter',sans-serif",
      }}>
        {label}
      </label>
      {hint && (
        <div style={{ fontSize: '0.68rem', color: C.muted, marginBottom: 8, fontFamily: "'Inter',sans-serif" }}>
          {hint}
        </div>
      )}
      {children}
    </div>
  )
}

export default function Profile() {
  const navigate  = useNavigate()
  const fileRef   = useRef()
  const pubkeyHex = getPublicKeyHex()
  const npub      = localStorage.getItem('bitsoko_npub') || ''
  const nsec      = localStorage.getItem('bitsoko_nsec') || ''

  const [showNsec,    setShowNsec]    = useState(false)
  const [nsecCopied,  setNsecCopied]  = useState(false)
  const [npubCopied,  setNpubCopied]  = useState(false)

  // ── Form state ────────────────────────────
  const [name,        setName]        = useState('')
  const [displayName, setDisplayName] = useState('')
  const [bio,         setBio]         = useState('')
  const [picture,     setPicture]     = useState('')
  const [lud16,       setLud16]       = useState(localStorage.getItem('bitsoko_ln') || '')
  const [nip05,       setNip05]       = useState('')
  const [website,     setWebsite]     = useState('')

  const [uploading,   setUploading]   = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [saved,       setSaved]       = useState(false)
  const [errMsg,      setErrMsg]      = useState('')
  const [loading,     setLoading]     = useState(true)
  const [avatarErr,   setAvatarErr]   = useState(false)

  // ── Load existing kind:0 ──────────────────
  useEffect(() => {
    let mounted = true
    const load = async () => {
      // 1. Load from IndexedDB first (instant)
      const cached = await getProfile(pubkeyHex)
      if (cached && mounted) {
        setName(cached.name              || '')
        setDisplayName(cached.display_name || '')
        setBio(cached.about              || '')
        setPicture(cached.picture        || '')
        setLud16(cached.lud16            || localStorage.getItem('bitsoko_ln') || '')
        setNip05(cached.nip05            || '')
        setWebsite(cached.website        || '')
        setLoading(false)
      }

      // 2. Fetch fresh from relay
      const pool = getPool()
      const sub  = pool.subscribe(
        RELAYS,
        [{ kinds: [0], authors: [pubkeyHex], limit: 1 }],
        {
          onevent(e) {
            try {
              const p = JSON.parse(e.content)
              if (!mounted) return
              setName(p.name              || '')
              setDisplayName(p.display_name || '')
              setBio(p.about              || '')
              setPicture(p.picture        || '')
              setLud16(p.lud16            || localStorage.getItem('bitsoko_ln') || '')
              setNip05(p.nip05            || '')
              setWebsite(p.website        || '')
              setLoading(false)
              // Cache it
              saveProfile(pubkeyHex, p)
            } catch {}
          },
          oneose() {
            if (mounted) setLoading(false)
            sub.close()
          },
        }
      )
      setTimeout(() => { try { sub.close() } catch {} }, 6000)
    }
    load()
    return () => { mounted = false }
  }, [pubkeyHex])

  // ── Upload avatar ─────────────────────────
  const handleAvatar = async (file) => {
    if (!file || !file.type.startsWith('image/')) return
    if (file.size > 10 * 1024 * 1024) { setErrMsg('Max 10MB'); return }
    setUploading(true); setErrMsg(''); setAvatarErr(false)
    try {
      const url = await uploadImage(file)
      setPicture(url)
    } catch (e) {
      setErrMsg(e.message || 'Upload failed')
    }
    setUploading(false)
  }

  // ── Publish kind:0 ────────────────────────
  const handleSave = async () => {
    if (saving || saved) return
    if (!name.trim() && !displayName.trim()) {
      setErrMsg('Add at least a name or display name')
      return
    }
    setSaving(true); setErrMsg('')

    try {
      const sk      = getSecretKey()
      const content = JSON.stringify({
        name:         name.trim(),
        display_name: displayName.trim(),
        about:        bio.trim(),
        picture:      picture.trim(),
        lud16:        lud16.trim(),
        nip05:        nip05.trim(),
        website:      website.trim(),
        // Bitsoko tag so other clients know this seller is on Bitsoko
        bitsoko:      'true',
      })

      const event = finalizeEvent({
        kind:       0,
        created_at: Math.floor(Date.now() / 1000),
        tags:       [],
        content,
      }, sk)

      // Save to IndexedDB
      await saveProfile(pubkeyHex, JSON.parse(content))

      // Broadcast to all relays
      const pool = getPool()
      await Promise.any(pool.publish(RELAYS, event))

      // Update localStorage display name for header greeting
      localStorage.setItem('bitsoko_display_name', displayName.trim() || name.trim())

      setSaving(false); setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setErrMsg(e.message || 'Failed to save — check connection')
      setSaving(false)
    }
  }

  const copyNpub = () => {
    navigator.clipboard?.writeText(npub)
    setNpubCopied(true)
    setTimeout(() => setNpubCopied(false), 2000)
  }

  const copyNsec = () => {
    navigator.clipboard?.writeText(nsec)
    setNsecCopied(true)
    setTimeout(() => setNsecCopied(false), 2000)
  }

  const nameToShow = displayName || name

  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: "'Inter',sans-serif" }}>

      {/* ── Header ── */}
      <div style={{
        background: C.white, borderBottom: `1px solid ${C.border}`,
        padding: '16px 20px',
        display: 'flex', alignItems: 'center', gap: 14,
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <button onClick={() => navigate(-1)} style={{
          width: 36, height: 36, borderRadius: '50%',
          background: C.bg, border: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', flexShrink: 0,
        }}>
          <ArrowLeft size={17} color={C.black}/>
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: C.black }}>Your profile</div>
          <div style={{ fontSize: '0.68rem', color: C.muted }}>Visible to buyers on Bitsoko + all Nostr clients</div>
        </div>
        {/* Save button in header */}
        <button
          onClick={handleSave}
          disabled={saving || saved}
          style={{
            padding: '8px 18px', borderRadius: 99,
            background: saved ? C.green : C.black,
            border: 'none', cursor: saving || saved ? 'not-allowed' : 'pointer',
            fontSize: '0.78rem', fontWeight: 700, color: C.white,
            display: 'flex', alignItems: 'center', gap: 6,
            transition: 'all .2s',
          }}
        >
          {saving
            ? <><Loader size={13} style={{ animation: 'spin 1s linear infinite' }}/> Saving…</>
            : saved
            ? <><CheckCircle size={13}/> Saved!</>
            : 'Save'
          }
        </button>
      </div>

      <div style={{ padding: '28px 20px 40px' }}>

        {/* ── Avatar section ── */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 32 }}>
          <div style={{ position: 'relative', marginBottom: 12 }}>
            {/* Avatar */}
            <div style={{
              width: 96, height: 96, borderRadius: '50%',
              background: C.black, overflow: 'hidden',
              border: `3px solid ${C.white}`,
              boxShadow: '0 4px 16px rgba(26,20,16,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {picture && !avatarErr
                ? <img src={picture} alt={nameToShow} onError={() => setAvatarErr(true)}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                : <span style={{ fontSize: '2rem', fontWeight: 700, color: C.white }}>
                    {nameToShow?.[0]?.toUpperCase() || '?'}
                  </span>
              }
            </div>

            {/* Camera button */}
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              style={{
                position: 'absolute', bottom: 0, right: 0,
                width: 30, height: 30, borderRadius: '50%',
                background: C.black, border: `2px solid ${C.white}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: uploading ? 'not-allowed' : 'pointer',
              }}
            >
              {uploading
                ? <Loader size={13} color={C.white} style={{ animation: 'spin 1s linear infinite' }}/>
                : <Camera size={13} color={C.white}/>
              }
            </button>
          </div>

          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: C.black }}>
            {nameToShow || 'Your name'}
          </div>
          <div style={{ fontSize: '0.68rem', color: C.muted, marginTop: 3, fontFamily: 'monospace' }}>
            {npub.slice(0, 20)}…
          </div>

          <input ref={fileRef} type="file" accept="image/*"
            onChange={e => handleAvatar(e.target.files?.[0])}
            style={{ display: 'none' }}/>
        </div>

        {/* ── Fields ── */}

        {/* Identity section */}
        <div style={{
          background: C.white, borderRadius: 16,
          border: `1px solid ${C.border}`, padding: '18px',
          marginBottom: 16,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: 18,
          }}>
            <User size={15} color={C.ochre}/>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: C.black }}>Identity</span>
          </div>

          <Field label="Display name *" hint="This is what buyers see on your listings">
            <input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="e.g. Hodl Leather Works"
              maxLength={50}
              style={{
                width: '100%', padding: '12px 14px',
                background: C.bg, border: `1.5px solid ${displayName ? C.black : C.border}`,
                borderRadius: 12, outline: 'none',
                fontSize: '0.9rem', color: C.black,
                fontFamily: "'Inter',sans-serif",
                boxSizing: 'border-box', transition: 'border-color .2s',
              }}
            />
          </Field>

          <Field label="Username" hint="Your @handle on Nostr (no spaces)">
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute', left: 14, top: '50%',
                transform: 'translateY(-50%)',
                fontSize: '0.9rem', color: C.muted,
                fontFamily: "'Inter',sans-serif",
              }}>@</span>
              <input
                value={name}
                onChange={e => setName(e.target.value.replace(/\s/g, '').toLowerCase())}
                placeholder="hodlleather"
                maxLength={30}
                style={{
                  width: '100%', padding: '12px 14px 12px 28px',
                  background: C.bg, border: `1.5px solid ${name ? C.black : C.border}`,
                  borderRadius: 12, outline: 'none',
                  fontSize: '0.9rem', color: C.black,
                  fontFamily: "'Inter',sans-serif",
                  boxSizing: 'border-box', transition: 'border-color .2s',
                }}
              />
            </div>
          </Field>

          <Field label="Bio" hint="Tell buyers about you or your craft">
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value)}
              placeholder="Handcrafting premium leather goods in Nairobi since 2021…"
              maxLength={300}
              rows={3}
              style={{
                width: '100%', padding: '12px 14px',
                background: C.bg, border: `1.5px solid ${bio ? C.black : C.border}`,
                borderRadius: 12, outline: 'none', resize: 'none',
                fontSize: '0.85rem', color: C.black, lineHeight: 1.6,
                fontFamily: "'Inter',sans-serif",
                boxSizing: 'border-box', transition: 'border-color .2s',
              }}
            />
            <div style={{ textAlign: 'right', fontSize: '0.65rem', color: C.muted, marginTop: 4 }}>
              {bio.length}/300
            </div>
          </Field>
        </div>

        {/* Payment section */}
        <div style={{
          background: C.white, borderRadius: 16,
          border: `1px solid ${C.border}`, padding: '18px',
          marginBottom: 16,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: 18,
          }}>
            <Zap size={15} color={C.orange} fill={C.orange}/>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: C.black }}>Lightning payments</span>
          </div>

          <Field label="Lightning address" hint="Buyers pay you directly here — e.g. you@blink.sv">
            <input
              value={lud16}
              onChange={e => setLud16(e.target.value.trim())}
              placeholder="you@blink.sv"
              type="email"
              style={{
                width: '100%', padding: '12px 14px',
                background: C.bg, border: `1.5px solid ${lud16 ? C.orange : C.border}`,
                borderRadius: 12, outline: 'none',
                fontSize: '0.9rem', color: C.black,
                fontFamily: "'Inter',sans-serif",
                boxSizing: 'border-box', transition: 'border-color .2s',
              }}
            />
            {lud16 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                marginTop: 6, fontSize: '0.68rem', color: C.green,
                fontFamily: "'Inter',sans-serif",
              }}>
                <Zap size={10} fill={C.green} color={C.green}/> Buyers can pay you directly in sats
              </div>
            )}
          </Field>
        </div>

        {/* Verification section */}
        <div style={{
          background: C.white, borderRadius: 16,
          border: `1px solid ${C.border}`, padding: '18px',
          marginBottom: 16,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: 18,
          }}>
            <ShieldCheck size={15} color={C.green}/>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: C.black }}>Verification</span>
          </div>

          <Field label="NIP-05 identifier" hint="Verified Nostr identity — e.g. you@yourdomain.com">
            <input
              value={nip05}
              onChange={e => setNip05(e.target.value.trim())}
              placeholder="you@yourdomain.com"
              style={{
                width: '100%', padding: '12px 14px',
                background: C.bg, border: `1.5px solid ${nip05 ? C.black : C.border}`,
                borderRadius: 12, outline: 'none',
                fontSize: '0.9rem', color: C.black,
                fontFamily: "'Inter',sans-serif",
                boxSizing: 'border-box', transition: 'border-color .2s',
              }}
            />
          </Field>

          <Field label="Website">
            <input
              value={website}
              onChange={e => setWebsite(e.target.value.trim())}
              placeholder="https://yoursite.com"
              type="url"
              style={{
                width: '100%', padding: '12px 14px',
                background: C.bg, border: `1.5px solid ${website ? C.black : C.border}`,
                borderRadius: 12, outline: 'none',
                fontSize: '0.9rem', color: C.black,
                fontFamily: "'Inter',sans-serif",
                boxSizing: 'border-box', transition: 'border-color .2s',
              }}
            />
          </Field>
        </div>

        {/* ── Keys section ── */}
        <div style={{
          background: C.white, borderRadius: 16,
          border: `1px solid ${C.border}`, padding: '18px',
          marginBottom: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
            <Key size={15} color={C.muted}/>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: C.black }}>Your Nostr keys</span>
          </div>

          {/* npub */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: C.black, marginBottom: 6 }}>
              Public key (npub)
            </div>
            <div style={{ fontSize: '0.62rem', color: C.muted, marginBottom: 8 }}>
              Share this freely — it's your Nostr identity
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
              <div style={{
                flex: 1, background: C.bg, borderRadius: 10,
                padding: '10px 12px', fontSize: '0.68rem',
                color: C.black, fontFamily: 'monospace',
                wordBreak: 'break-all', lineHeight: 1.6,
                border: `1px solid ${C.border}`,
              }}>
                {npub}
              </div>
              <button onClick={copyNpub} style={{
                flexShrink: 0, width: 38, borderRadius: 10,
                background: npubCopied ? 'rgba(34,197,94,0.08)' : C.bg,
                border: `1px solid ${npubCopied ? C.green : C.border}`,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {npubCopied
                  ? <Check size={15} color={C.green}/>
                  : <Copy size={15} color={C.muted}/>
                }
              </button>
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: C.border, margin: '4px 0 16px' }}/>

          {/* nsec warning banner */}
          <div style={{
            background: 'rgba(239,68,68,0.06)',
            border: `1px solid rgba(239,68,68,0.15)`,
            borderRadius: 12, padding: '12px 14px', marginBottom: 12,
            display: 'flex', gap: 10, alignItems: 'flex-start',
          }}>
            <AlertCircle size={15} color={C.red} style={{ flexShrink: 0, marginTop: 1 }}/>
            <div style={{ fontSize: '0.7rem', color: '#7a1f1f', lineHeight: 1.6, fontFamily: "'Inter',sans-serif" }}>
              <strong>Never share your secret key.</strong> Anyone with your nsec has full control of your account and all your listings. Store it somewhere safe offline.
            </div>
          </div>

          {/* nsec */}
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: C.black, marginBottom: 6 }}>
              Secret key (nsec)
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
              <div style={{
                flex: 1, background: showNsec ? '#fff8f8' : C.bg,
                borderRadius: 10, padding: '10px 12px',
                fontSize: '0.68rem', fontFamily: 'monospace',
                wordBreak: 'break-all', lineHeight: 1.6,
                border: `1px solid ${showNsec ? 'rgba(239,68,68,0.3)' : C.border}`,
                color: showNsec ? C.black : 'transparent',
                textShadow: showNsec ? 'none' : '0 0 8px rgba(26,20,16,0.5)',
                userSelect: showNsec ? 'text' : 'none',
                transition: 'all .2s',
                filter: showNsec ? 'none' : 'blur(4px)',
              }}>
                {nsec}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {/* Reveal toggle */}
                <button onClick={() => setShowNsec(s => !s)} style={{
                  flexShrink: 0, width: 38, flex: 1, borderRadius: 10,
                  background: showNsec ? 'rgba(239,68,68,0.06)' : C.bg,
                  border: `1px solid ${showNsec ? 'rgba(239,68,68,0.2)' : C.border}`,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {showNsec
                    ? <EyeOff size={15} color={C.red}/>
                    : <Eye size={15} color={C.muted}/>
                  }
                </button>
                {/* Copy — only when revealed */}
                {showNsec && (
                  <button onClick={copyNsec} style={{
                    flexShrink: 0, width: 38, flex: 1, borderRadius: 10,
                    background: nsecCopied ? 'rgba(34,197,94,0.08)' : C.bg,
                    border: `1px solid ${nsecCopied ? C.green : C.border}`,
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {nsecCopied
                      ? <Check size={15} color={C.green}/>
                      : <Copy size={15} color={C.muted}/>
                    }
                  </button>
                )}
              </div>
            </div>
            {showNsec && (
              <div style={{ fontSize: '0.65rem', color: C.red, marginTop: 8, fontFamily: "'Inter',sans-serif" }}>
                Hide this screen before sharing or screenshotting
              </div>
            )}
          </div>
        </div>

        {/* Error */}
        {errMsg && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '12px 14px', borderRadius: 12,
            background: 'rgba(239,68,68,0.06)',
            border: `1px solid rgba(239,68,68,0.2)`,
            fontSize: '0.78rem', color: C.red,
            fontFamily: "'Inter',sans-serif",
          }}>
            <AlertCircle size={15}/> {errMsg}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

