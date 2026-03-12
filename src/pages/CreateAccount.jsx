import { useState } from 'react'
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools'
import { Copy, Check, ArrowRight, ArrowLeft, RefreshCw, Zap } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function CreateAccount({ onAuth }) {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [keys, setKeys] = useState(null)
  const [displayName, setDisplayName] = useState('')
  const [lnAddress, setLnAddress] = useState('')
  const [copied, setCopied] = useState('')
  const [confirmed, setConfirmed] = useState(false)

  const generate = () => {
    const sk = generateSecretKey()
    const pk = getPublicKey(sk)
    setKeys({ nsec: nip19.nsecEncode(sk), npub: nip19.npubEncode(pk) })
    setConfirmed(false)
    setStep(2)
  }

  const copy = (text, key) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(''), 2000)
    })
  }

  const finish = () => {
    if (!keys) return
    localStorage.setItem('bitsoko_nsec', keys.nsec)
    localStorage.setItem('bitsoko_npub', keys.npub)
    localStorage.setItem('bitsoko_display_name', displayName.trim() || 'Anon')
    if (lnAddress.trim()) localStorage.setItem('bitsoko_ln', lnAddress.trim())
    onAuth()
  }

  const stepTitles = ['Create account', 'Save your keys', 'Your profile']
  const stepSubs = ['Start selling in minutes', 'Copy these before continuing', 'Almost done']

  return (
    <div style={{
      minHeight: '100vh', background: '#f7f4f0',
      fontFamily: "'Inter', sans-serif",
      display: 'flex', flexDirection: 'column',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400;1,600&family=Inter:wght@400;500;600&display=swap');
        .bs-input:focus { border-color: #1a1410 !important; outline: none; }
      `}</style>

      {/* Topbar */}
      <div style={{
        padding: '16px 20px',
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <button onClick={() => step === 1 ? navigate(-1) : setStep(s => s - 1)} style={{
          display: 'flex', alignItems: 'center', gap: '4px',
          background: 'none', border: 'none', fontSize: '13px',
          color: '#9c8e80', cursor: 'pointer', fontFamily: "'Inter', sans-serif",
          padding: '6px 0',
        }}>
          <ArrowLeft size={15} /> Back
        </button>

        {/* Step pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {[1, 2, 3].map(s => (
            <div key={s} style={{
              width: step === s ? '20px' : '6px',
              height: '6px', borderRadius: '99px',
              background: step >= s ? '#1a1410' : '#d4c9b8',
              transition: 'all 0.3s',
            }} />
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: '12px 20px 40px', maxWidth: '480px', width: '100%', margin: '0 auto' }}>

        {/* Hero */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            background: 'rgba(247,147,26,0.1)', border: '1px solid rgba(247,147,26,0.2)',
            borderRadius: '99px', padding: '4px 12px',
            fontSize: '11px', fontWeight: '600', color: '#c8860a',
            letterSpacing: '0.3px', marginBottom: '16px',
          }}>
            <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#f7931a' }} />
            Step {step} of 3
          </div>

          <div style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: '42px', fontWeight: '600', fontStyle: 'italic',
            color: '#1a1410', letterSpacing: '-1px', lineHeight: 1.05,
            marginBottom: '8px',
          }}>
            {stepTitles[step - 1]}
          </div>
          <div style={{ fontSize: '14px', color: '#9c8e80' }}>
            {stepSubs[step - 1]}
          </div>
        </div>

        {/* STEP 1 */}
        {step === 1 && (
          <>
            <div style={{
              background: '#ffffff', borderRadius: '20px',
              border: '1px solid #e8e0d5',
              boxShadow: '0 2px 16px rgba(26,20,16,0.05)',
              padding: '20px', marginBottom: '16px',
            }}>
              <p style={{ fontSize: '14px', color: '#6b5f52', lineHeight: '1.7', marginBottom: '20px' }}>
                Bitsoko gives you a keypair — a public key others see, and a secret key only you hold. No email, no password, no middleman.
              </p>
              <button onClick={generate} style={{
                width: '100%', padding: '15px', background: '#1a1410',
                color: '#f7f4f0', border: 'none', borderRadius: '12px',
                fontSize: '14px', fontWeight: '600', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                fontFamily: "'Inter', sans-serif",
              }}>
                Generate My Keys <ArrowRight size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '20px 0' }}>
              <div style={{ flex: 1, height: '1px', background: '#e8e0d5' }} />
              <span style={{ fontSize: '12px', color: '#c9bdb0' }}>or</span>
              <div style={{ flex: 1, height: '1px', background: '#e8e0d5' }} />
            </div>

            <button onClick={() => navigate('/login')} style={{
              width: '100%', padding: '15px', background: 'transparent',
              color: '#1a1410', border: '1.5px solid #d4c9b8', borderRadius: '12px',
              fontSize: '14px', fontWeight: '600', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              fontFamily: "'Inter', sans-serif",
            }}>
              I already have an nsec <ArrowRight size={15} />
            </button>
          </>
        )}

        {/* STEP 2 */}
        {step === 2 && keys && (
          <>
            {/* npub */}
            <div style={{
              background: '#ffffff', borderRadius: '16px',
              border: '1px solid #e8e0d5', padding: '16px', marginBottom: '10px',
            }}>
              <div style={{
                fontSize: '10px', fontWeight: '600', letterSpacing: '1px',
                textTransform: 'uppercase', color: '#9c8e80', marginBottom: '10px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span>Public Key — share freely</span>
                <button onClick={() => copy(keys.npub, 'npub')} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#9c8e80', display: 'flex', alignItems: 'center', gap: '4px',
                  fontSize: '10px', fontWeight: '600', fontFamily: "'Inter', sans-serif",
                }}>
                  {copied === 'npub' ? <><Check size={12} color="#2d6a4f" /> Copied</> : <><Copy size={12} /> Copy</>}
                </button>
              </div>
              <div style={{ fontSize: '11.5px', color: '#1a1410', wordBreak: 'break-all', lineHeight: '1.6', fontFamily: 'monospace' }}>
                {keys.npub}
              </div>
            </div>

            {/* nsec */}
            <div style={{
              background: 'rgba(181,69,27,0.02)', borderRadius: '16px',
              border: '1.5px solid rgba(181,69,27,0.18)', padding: '16px', marginBottom: '14px',
            }}>
              <div style={{
                fontSize: '10px', fontWeight: '600', letterSpacing: '1px',
                textTransform: 'uppercase', color: '#b5451b', marginBottom: '10px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span>Secret Key — never share</span>
                <button onClick={() => copy(keys.nsec, 'nsec')} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#b5451b', display: 'flex', alignItems: 'center', gap: '4px',
                  fontSize: '10px', fontWeight: '600', fontFamily: "'Inter', sans-serif",
                }}>
                  {copied === 'nsec' ? <><Check size={12} color="#2d6a4f" /> Copied</> : <><Copy size={12} /> Copy</>}
                </button>
              </div>
              <div style={{ fontSize: '11.5px', color: '#b5451b', wordBreak: 'break-all', lineHeight: '1.6', fontFamily: 'monospace' }}>
                {keys.nsec}
              </div>
            </div>

            {/* Warning */}
            <div style={{
              background: 'rgba(181,69,27,0.05)', border: '1px solid rgba(181,69,27,0.12)',
              borderRadius: '12px', padding: '12px 14px', marginBottom: '20px',
              fontSize: '12.5px', color: '#b5451b', lineHeight: '1.6',
            }}>
              Losing your secret key means losing your account permanently. Save it in your notes or password manager.
            </div>

            {/* Confirm */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', cursor: 'pointer' }}>
              <div onClick={() => setConfirmed(!confirmed)} style={{
                width: '22px', height: '22px', flexShrink: 0, borderRadius: '7px',
                border: `2px solid ${confirmed ? '#1a1410' : '#c9bdb0'}`,
                background: confirmed ? '#1a1410' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
              }}>
                {confirmed && <Check size={13} color="#f7f4f0" />}
              </div>
              <span style={{ fontSize: '13.5px', color: '#6b5f52', lineHeight: '1.4' }}>
                I've saved my secret key somewhere safe
              </span>
            </label>

            <button onClick={() => confirmed && setStep(3)} style={{
              width: '100%', padding: '15px',
              background: confirmed ? '#1a1410' : '#e8e0d5',
              color: confirmed ? '#f7f4f0' : '#9c8e80',
              border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: '600',
              cursor: confirmed ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              fontFamily: "'Inter', sans-serif", transition: 'all 0.2s', marginBottom: '10px',
            }}>
              Continue <ArrowRight size={16} />
            </button>

            <button onClick={generate} style={{
              width: '100%', padding: '13px', background: 'none',
              color: '#9c8e80', border: '1.5px solid #e8e0d5', borderRadius: '12px',
              fontSize: '13px', fontWeight: '500', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              fontFamily: "'Inter', sans-serif",
            }}>
              <RefreshCw size={13} /> Regenerate Keys
            </button>
          </>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <>
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
              }}>Display Name</label>
              <input
                className="bs-input"
                style={{
                  width: '100%', padding: '14px 16px',
                  background: '#f7f4f0', border: '1.5px solid #e8e0d5',
                  borderRadius: '12px', fontSize: '13.5px', color: '#1a1410',
                  fontFamily: "'Inter', sans-serif", outline: 'none', marginBottom: '16px',
                }}
                placeholder="e.g. Wanjiku Kariuki"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
              />

              <label style={{
                fontSize: '11px', fontWeight: '600', letterSpacing: '0.8px',
                textTransform: 'uppercase', color: '#6b5f52',
                display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px',
              }}>
                Lightning Address
                <span style={{ color: '#c9bdb0', fontWeight: '400', fontSize: '10px', textTransform: 'none', letterSpacing: 0 }}>optional</span>
              </label>
              <input
                className="bs-input"
                style={{
                  width: '100%', padding: '14px 16px',
                  background: '#f7f4f0', border: '1.5px solid #e8e0d5',
                  borderRadius: '12px', fontSize: '13.5px', color: '#1a1410',
                  fontFamily: "'Inter', sans-serif", outline: 'none', marginBottom: '16px',
                }}
                placeholder="you@blink.sv"
                value={lnAddress}
                onChange={e => setLnAddress(e.target.value)}
              />

              <button onClick={finish} style={{
                width: '100%', padding: '15px', background: '#1a1410',
                color: '#f7f4f0', border: 'none', borderRadius: '12px',
                fontSize: '14px', fontWeight: '600', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                fontFamily: "'Inter', sans-serif",
              }}>
                Enter Bitsoko <ArrowRight size={16} />
              </button>
            </div>

            {/* Lightning hint */}
            <div style={{
              padding: '14px 16px',
              background: 'rgba(247,147,26,0.06)', border: '1px solid rgba(247,147,26,0.15)',
              borderRadius: '14px', display: 'flex', gap: '12px', alignItems: 'flex-start',
            }}>
              <div style={{
                width: '32px', height: '32px', background: 'rgba(247,147,26,0.12)',
                borderRadius: '8px', display: 'flex', alignItems: 'center',
                justifyContent: 'center', flexShrink: 0, color: '#c8860a',
              }}>
                <Zap size={15} />
              </div>
              <div>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#9c6800', marginBottom: '2px' }}>
                  Add Lightning to get paid
                </div>
                <div style={{ fontSize: '11.5px', color: '#c8860a', lineHeight: '1.5' }}>
                  Get a free Lightning address at blink.sv to receive payments from buyers.
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

