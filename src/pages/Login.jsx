import { useState } from 'react'
import { getPublicKey, nip19 } from 'nostr-tools'
import { Eye, EyeOff, ArrowRight, ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function Login({ onAuth }) {
  const navigate = useNavigate()
  const [nsec, setNsec] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handle = () => {
    setError('')
    if (!nsec.trim()) { setError('Enter your secret key'); return }
    if (!nsec.startsWith('nsec1')) { setError('Must start with nsec1'); return }
    setLoading(true)
    try {
      const { data: sk } = nip19.decode(nsec.trim())
      const pk = getPublicKey(sk)
      localStorage.setItem('bitsoko_nsec', nsec.trim())
      localStorage.setItem('bitsoko_npub', nip19.npubEncode(pk))
      onAuth()
    } catch {
      setError('Invalid key — check and try again')
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f7f4f0',
      fontFamily: "'Inter', sans-serif",
      display: 'flex',
      flexDirection: 'column',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400;1,600&family=Inter:wght@400;500;600&display=swap');
        .bs-input:focus { border-color: #1a1410 !important; outline: none; }
      `}</style>

      {/* Topbar */}
      <div style={{
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
      }}>
        <button onClick={() => navigate(-1)} style={{
          display: 'flex', alignItems: 'center', gap: '4px',
          background: 'none', border: 'none', fontSize: '13px',
          color: '#9c8e80', cursor: 'pointer', fontFamily: "'Inter', sans-serif",
          padding: '6px 0',
        }}>
          <ArrowLeft size={15} /> Back
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: '12px 20px 40px', maxWidth: '480px', width: '100%', margin: '0 auto' }}>

        {/* Hero section */}
        <div style={{ marginBottom: '36px' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            background: 'rgba(247,147,26,0.1)', border: '1px solid rgba(247,147,26,0.2)',
            borderRadius: '99px', padding: '4px 12px',
            fontSize: '11px', fontWeight: '600', color: '#c8860a',
            letterSpacing: '0.3px', marginBottom: '16px',
          }}>
            <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#f7931a' }} />
            Bitcoin Marketplace
          </div>

          <div style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: '42px', fontWeight: '600', fontStyle: 'italic',
            color: '#1a1410', letterSpacing: '-1px', lineHeight: 1.05,
            marginBottom: '10px',
          }}>
            Welcome<br />back
          </div>
          <div style={{ fontSize: '14px', color: '#9c8e80', lineHeight: '1.5' }}>
            Enter your secret key to access your shop and orders.
          </div>
        </div>

        {/* Input card */}
        <div style={{
          background: '#ffffff', borderRadius: '20px',
          border: '1px solid #e8e0d5',
          boxShadow: '0 2px 16px rgba(26,20,16,0.05)',
          padding: '20px', marginBottom: '16px',
        }}>
          <label style={{
            fontSize: '11px', fontWeight: '600', letterSpacing: '0.8px',
            textTransform: 'uppercase', color: '#6b5f52',
            display: 'block', marginBottom: '8px',
          }}>
            Secret Key
          </label>

          <div style={{ position: 'relative', marginBottom: error ? '12px' : '16px' }}>
            <input
              className="bs-input"
              style={{
                width: '100%', padding: '14px 48px 14px 16px',
                background: '#f7f4f0', border: `1.5px solid ${error ? 'rgba(181,69,27,0.4)' : '#e8e0d5'}`,
                borderRadius: '12px', fontSize: '13.5px', color: '#1a1410',
                fontFamily: 'monospace', transition: 'border 0.15s',
              }}
              type={show ? 'text' : 'password'}
              placeholder="nsec1..."
              value={nsec}
              onChange={e => { setNsec(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && handle()}
            />
            <button onClick={() => setShow(!show)} style={{
              position: 'absolute', right: '14px', top: '50%',
              transform: 'translateY(-50%)', background: 'none',
              border: 'none', cursor: 'pointer', color: '#9c8e80',
              display: 'flex', alignItems: 'center', padding: '4px',
            }}>
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {error && (
            <div style={{
              background: 'rgba(181,69,27,0.06)', border: '1px solid rgba(181,69,27,0.15)',
              borderRadius: '10px', padding: '10px 14px',
              fontSize: '12.5px', color: '#b5451b', marginBottom: '14px',
            }}>
              {error}
            </div>
          )}

          <button onClick={handle} disabled={loading} style={{
            width: '100%', padding: '15px', background: '#1a1410',
            color: '#f7f4f0', border: 'none', borderRadius: '12px',
            fontSize: '14px', fontWeight: '600',
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            fontFamily: "'Inter', sans-serif", opacity: loading ? 0.6 : 1,
            transition: 'opacity 0.15s',
          }}>
            {loading ? 'Logging in...' : 'Login'} {!loading && <ArrowRight size={16} />}
          </button>
        </div>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '20px 0' }}>
          <div style={{ flex: 1, height: '1px', background: '#e8e0d5' }} />
          <span style={{ fontSize: '12px', color: '#c9bdb0' }}>or</span>
          <div style={{ flex: 1, height: '1px', background: '#e8e0d5' }} />
        </div>

        {/* Create account */}
        <button onClick={() => navigate('/create')} style={{
          width: '100%', padding: '15px', background: 'transparent',
          color: '#1a1410', border: '1.5px solid #d4c9b8', borderRadius: '12px',
          fontSize: '14px', fontWeight: '600', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          fontFamily: "'Inter', sans-serif",
        }}>
          Create New Account <ArrowRight size={15} />
        </button>

        {/* Bottom note */}
        <div style={{
          marginTop: '40px', padding: '16px',
          background: '#ffffff', borderRadius: '14px',
          border: '1px solid #e8e0d5',
        }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: '#1a1410', marginBottom: '4px' }}>
            Your keys, your market
          </div>
          <div style={{ fontSize: '12px', color: '#9c8e80', lineHeight: '1.6' }}>
            Bitsoko never stores your secret key. It lives only on your device.
          </div>
        </div>
      </div>
    </div>
  )
}

