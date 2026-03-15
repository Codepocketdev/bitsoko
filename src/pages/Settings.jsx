import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Trash2, Server,
  LogOut, ChevronRight, Shield, Zap, Info,
  Copy, Check, RefreshCw, Github,
} from 'lucide-react'
import { DEFAULT_RELAYS } from '../lib/nostrSync'
import { openDB } from '../lib/db'

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

const APP_VERSION = '1.0.0'

function SectionLabel({ label }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '20px 4px 8px' }}>
      {label}
    </div>
  )
}

export default function Settings() {
  const navigate = useNavigate()

  const [copied,     setCopied]     = useState(false)
  const [clearing,   setClearing]   = useState(false)
  const [clearDone,  setClearDone]  = useState(false)
  const [showRelays, setShowRelays] = useState(false)
  const [showDanger, setShowDanger] = useState(false)

  const npub      = localStorage.getItem('bitsoko_npub') || ''
  const shortNpub = npub ? `${npub.slice(0,12)}…${npub.slice(-6)}` : 'Not set'

  const copyNpub = async () => {
    try { await navigator.clipboard.writeText(npub); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch {}
  }

  const clearProductCache = async () => {
    setClearing(true)
    try {
      const db = await openDB()
      await new Promise((res, rej) => {
        const tx = db.transaction(['products', 'profiles'], 'readwrite')
        tx.objectStore('products').clear()
        tx.objectStore('profiles').clear()
        tx.oncomplete = res
        tx.onerror = () => rej(tx.error)
      })
      setClearDone(true)
      setTimeout(() => setClearDone(false), 2500)
    } catch(e) { console.error(e) }
    setClearing(false)
  }

  const handleLogout = () => {
    localStorage.removeItem('bitsoko_nsec')
    localStorage.removeItem('bitsoko_npub')
    localStorage.removeItem('bitsoko_display_name')
    localStorage.removeItem('bitsoko_ln')
    window.location.href = '/'
  }

  const handleClearAll = async () => {
    localStorage.clear()
    try { indexedDB.deleteDatabase('bitsoko_db') } catch {}
    window.location.href = '/'
  }

  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: "'Inter',sans-serif", paddingBottom: 100 }}>

      <div style={{ background: C.white, borderBottom: `1px solid ${C.border}`, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, position: 'sticky', top: 0, zIndex: 50 }}>
        <button onClick={() => navigate('/', { state: { openMore: true } })} style={{ width: 36, height: 36, borderRadius: '50%', background: C.bg, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <ArrowLeft size={17} color={C.black}/>
        </button>
        <div style={{ fontSize: '1rem', fontWeight: 700, color: C.black }}>Settings</div>
      </div>

      <div style={{ padding: '0 16px' }}>

        {/* Account */}
        <SectionLabel label="Account"/>
        <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${C.border}` }}>
          <div style={{ background: C.white, padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: C.bg, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Shield size={16} color={C.black}/>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: C.black }}>Public Key</div>
              <div style={{ fontSize: 11, color: C.muted, fontFamily: 'monospace', marginTop: 2 }}>{shortNpub}</div>
            </div>
            <button onClick={copyNpub} style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? C.green : C.muted, padding: 4 }}>
              {copied ? <Check size={15}/> : <Copy size={15}/>}
            </button>
          </div>
          <button onClick={() => navigate('/profile')} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 14,
            padding: '14px 16px', background: C.white, border: 'none', cursor: 'pointer', textAlign: 'left',
          }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: C.bg, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <ChevronRight size={16} color={C.black}/>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: C.black }}>Edit Profile</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Name, avatar, Lightning address</div>
            </div>
            <ChevronRight size={15} color={C.muted}/>
          </button>
        </div>

        {/* Data */}
        <SectionLabel label="Data & Cache"/>
        <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${C.border}` }}>
          <button onClick={clearProductCache} disabled={clearing} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 14,
            padding: '14px 16px', background: C.white, border: 'none',
            borderBottom: `1px solid ${C.border}`, cursor: 'pointer', textAlign: 'left',
          }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: C.bg, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {clearing ? <RefreshCw size={16} color={C.ochre} style={{ animation: 'spin 1s linear infinite' }}/> : clearDone ? <Check size={16} color={C.green}/> : <Trash2 size={16} color={C.black}/>}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: C.black }}>{clearDone ? 'Cache cleared!' : 'Clear product cache'}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Removes cached listings and profiles. Re-syncs from relay on next visit.</div>
            </div>
          </button>
          <div style={{ background: C.white, padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: C.bg, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Info size={16} color={C.muted}/>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: C.black }}>Your data stays local</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2, lineHeight: 1.6 }}>Orders, cart, and keys are stored only on this device. Listings and profiles sync from Nostr relays.</div>
            </div>
          </div>
        </div>

        {/* Relays */}
        <SectionLabel label="Network"/>
        <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${C.border}` }}>
          <button onClick={() => setShowRelays(s => !s)} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 14,
            padding: '14px 16px', background: C.white, border: 'none',
            borderBottom: showRelays ? `1px solid ${C.border}` : 'none', cursor: 'pointer', textAlign: 'left',
          }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: C.bg, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Server size={16} color={C.black}/>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: C.black }}>Relays</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{DEFAULT_RELAYS.length} default relays connected</div>
            </div>
            <ChevronRight size={15} color={C.muted} style={{ transform: showRelays ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }}/>
          </button>
          {showRelays && (
            <div style={{ background: C.white, padding: '8px 16px 14px' }}>
              {DEFAULT_RELAYS.map(relay => (
                <div key={relay} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: `1px solid ${C.bg}` }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, flexShrink: 0 }}/>
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: C.muted }}>{relay.replace('wss://', '')}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* About */}
        <SectionLabel label="About"/>
        <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${C.border}` }}>
          <div style={{ background: C.white, padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: C.black, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Zap size={16} fill={C.orange} color={C.orange}/>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.black }}>Bitsoko v{APP_VERSION}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Bitcoin P2P Marketplace</div>
            </div>
          </div>
          <a href="https://github.com/Codepocketdev/bitsoko" target="_blank" rel="noreferrer" style={{
            display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
            background: C.white, textDecoration: 'none',
          }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: C.bg, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Github size={16} color={C.black}/>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: C.black }}>Open Source</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>github.com/Codepocketdev/bitsoko</div>
            </div>
            <ChevronRight size={15} color={C.muted}/>
          </a>
        </div>

        {/* Danger */}
        <SectionLabel label="Danger Zone"/>
        <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid rgba(239,68,68,0.2)` }}>
          <button onClick={handleLogout} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 14,
            padding: '14px 16px', background: C.white, border: 'none',
            borderBottom: `1px solid rgba(239,68,68,0.1)`, cursor: 'pointer', textAlign: 'left',
          }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(239,68,68,0.06)', border: `1px solid rgba(239,68,68,0.12)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <LogOut size={16} color={C.red}/>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: C.red }}>Log Out</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Keys remain on this device</div>
            </div>
          </button>
          <button onClick={() => setShowDanger(s => !s)} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 14,
            padding: '14px 16px', background: C.white, border: 'none',
            borderBottom: showDanger ? `1px solid rgba(239,68,68,0.1)` : 'none',
            cursor: 'pointer', textAlign: 'left',
            borderRadius: showDanger ? 0 : '0 0 14px 14px',
          }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(239,68,68,0.06)', border: `1px solid rgba(239,68,68,0.12)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Trash2 size={16} color={C.red}/>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: C.red }}>Clear all data</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Wipes keys, cache, orders, cart. Cannot undo.</div>
            </div>
            <ChevronRight size={15} color={C.red} style={{ transform: showDanger ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }}/>
          </button>
          {showDanger && (
            <div style={{ background: 'rgba(239,68,68,0.03)', padding: '14px 16px', borderRadius: '0 0 14px 14px' }}>
              <div style={{ fontSize: 12, color: C.red, lineHeight: 1.6, marginBottom: 12 }}>
                ⚠️ This will delete your secret key and all local data. You'll lose access permanently unless you've saved your nsec elsewhere.
              </div>
              <button onClick={handleClearAll} style={{ width: '100%', padding: '12px', background: C.red, border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: C.white }}>
                Yes, clear everything
              </button>
            </div>
          )}
        </div>
        <div style={{ height: 20 }}/>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

