// WalletSettings.jsx — wallet settings pages (seed, backup, restore, mints)
import { useState } from 'react'
import {
  ArrowLeft, Check, Copy, Eye, EyeOff, Loader, AlertCircle,
  CheckCircle, Download, Upload, Key, Database, ChevronRight,
  Cloud,
} from 'lucide-react'
import {
  getWalletData, saveMints, getSeed, getOrCreateSeed,
  validateSeedPhrase, restoreWallet, exportWalletToken,
  receiveCashuToken,
} from '../lib/cashuWallet'
import { backupMintsToNostr, searchMintsOnNostr, getNostrBackupEnabled, setNostrBackupEnabled } from '../lib/nostrMintBackup'
import { C } from './walletConstants'

export function WalletSettingsPage({ onClose, onReload }) {
  const [subPage, setSubPage] = useState(null)

  if (subPage === 'seed')    return <SeedPhrasePage    onBack={() => setSubPage(null)} />
  if (subPage === 'backup')  return <BackupPage        onBack={() => setSubPage(null)} />
  if (subPage === 'restore') return <RestorePage       onBack={() => setSubPage(null)} onReload={onReload} />
  if (subPage === 'mints')   return <MintsPage         onBack={() => setSubPage(null)} />

  const sections = [
    {
      title: 'Recovery',
      items: [
        { key:'seed',    Icon:Key,      label:'Seed phrase',    sub:'View your 12-word recovery phrase',       danger:false },
        { key:'backup',  Icon:Download, label:'Backup wallet',  sub:'Export your proofs as a Cashu token',     danger:false },
        { key:'restore', Icon:Upload,   label:'Restore wallet', sub:'Restore from seed phrase or Cashu token', danger:false },
      ]
    },
    {
      title: 'Mint',
      items: [
        { key:'mints', Icon:Database, label:'Manage mints', sub:'Add or remove Cashu mints', danger:false },
      ]
    },
  ]

  return (
    <div style={{ minHeight:'100vh',background:C.bg,fontFamily:"'Inter',sans-serif" }}>
      <div style={{ background:C.white,borderBottom:`1px solid ${C.border}`,padding:'14px 20px',display:'flex',alignItems:'center',gap:12,position:'sticky',top:0,zIndex:10 }}>
        <button onClick={onClose} style={{ width:36,height:36,borderRadius:'50%',background:C.bg,border:`1px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer' }}>
          <ArrowLeft size={17} color={C.black}/>
        </button>
        <span style={{ fontSize:16,fontWeight:700,color:C.black }}>Wallet Settings</span>
      </div>

      <div style={{ padding:'20px 16px' }}>
        {sections.map(({ title, items }) => (
          <div key={title} style={{ marginBottom:24 }}>
            <div style={{ fontSize:11,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:10 }}>{title}</div>
            <div style={{ background:C.white,borderRadius:16,border:`1px solid ${C.border}`,overflow:'hidden' }}>
              {items.map(({ key, Icon, label, sub, danger }, i) => (
                <button key={key} onClick={() => setSubPage(key)} style={{
                  width:'100%',display:'flex',alignItems:'center',gap:14,padding:'14px 16px',
                  background:'none',border:'none',borderBottom: i < items.length-1 ? `1px solid ${C.border}` : 'none',
                  cursor:'pointer',textAlign:'left',
                }}>
                  <div style={{ width:38,height:38,borderRadius:10,background:danger?'rgba(239,68,68,0.08)':C.bg,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
                    <Icon size={17} color={danger?C.red:C.black}/>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14,fontWeight:600,color:danger?C.red:C.black,marginBottom:1 }}>{label}</div>
                    <div style={{ fontSize:11,color:C.muted }}>{sub}</div>
                  </div>
                  <ChevronRight size={15} color={C.muted}/>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Seed phrase page ───────────────────────────
export function SeedPhrasePage({ onBack }) {
  const [show,   setShow]   = useState(false)
  const [copied, setCopied] = useState(false)
  const seed  = getSeed() || getOrCreateSeed()
  const words = seed.split(' ')

  const copy = async () => {
    await navigator.clipboard.writeText(seed)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ minHeight:'100vh',background:C.bg,fontFamily:"'Inter',sans-serif",paddingBottom:40 }}>
      <div style={{ background:C.white,borderBottom:`1px solid ${C.border}`,padding:'14px 20px',display:'flex',alignItems:'center',gap:12,position:'sticky',top:0,zIndex:10 }}>
        <button onClick={onBack} style={{ width:36,height:36,borderRadius:'50%',background:C.bg,border:`1px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer' }}>
          <ArrowLeft size={17} color={C.black}/>
        </button>
        <span style={{ fontSize:16,fontWeight:700,color:C.black }}>Seed Phrase</span>
      </div>

      <div style={{ padding:'20px 16px' }}>
        <div style={{ background:'rgba(239,68,68,0.06)',border:`1px solid rgba(239,68,68,0.2)`,borderRadius:14,padding:'14px 16px',marginBottom:20 }}>
          <div style={{ fontSize:13,fontWeight:700,color:C.red,marginBottom:6 }}>⚠️ Keep this secret</div>
          <div style={{ fontSize:12,color:C.muted,lineHeight:1.6 }}>
            Anyone with these words can access your wallet. Write them down on paper and store safely. Never share digitally.
          </div>
        </div>

        {!show ? (
          <button onClick={() => setShow(true)} style={{ width:'100%',padding:14,background:C.black,border:'none',borderRadius:14,cursor:'pointer',fontSize:14,fontWeight:700,color:C.white,display:'flex',alignItems:'center',justifyContent:'center',gap:8,marginBottom:16 }}>
            <Eye size={16}/> Reveal seed phrase
          </button>
        ) : (
          <>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:16 }}>
              {words.map((word, i) => (
                <div key={i} style={{ background:C.white,border:`1px solid ${C.border}`,borderRadius:10,padding:'10px 12px',display:'flex',alignItems:'center',gap:8 }}>
                  <span style={{ fontSize:11,color:C.muted,minWidth:18 }}>{i+1}.</span>
                  <span style={{ fontSize:14,fontWeight:600,color:C.black }}>{word}</span>
                </div>
              ))}
            </div>
            <button onClick={copy} style={{ width:'100%',padding:13,background:copied?C.green:C.bg,border:`1px solid ${copied?C.green:C.border}`,borderRadius:14,cursor:'pointer',fontSize:13,fontWeight:600,color:copied?C.white:C.black,display:'flex',alignItems:'center',justifyContent:'center',gap:8,marginBottom:12,transition:'all 0.2s' }}>
              {copied ? <><Check size={15}/> Copied!</> : <><Copy size={15}/> Copy to clipboard</>}
            </button>
            <button onClick={() => setShow(false)} style={{ width:'100%',padding:12,background:'none',border:`1px solid ${C.border}`,borderRadius:14,cursor:'pointer',fontSize:13,color:C.muted,display:'flex',alignItems:'center',justifyContent:'center',gap:8 }}>
              <EyeOff size={14}/> Hide
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Backup page ────────────────────────────────
// Backs up mint list to Nostr (NIP-44 encrypted, kind:30078)
// Exact port of SatoshiPay NostrMintBackup.jsx
export function BackupPage({ onBack }) {
  const AUTO_KEY   = 'bitsoko_nostr_backup_enabled'
  const LAST_KEY   = 'bitsoko_nostr_backup_last'

  const { mints }   = getWalletData()
  const seed         = getSeed()
  const mintObjects  = mints.map(url => ({ url, name: url.replace('https://','').split('/')[0] }))

  const [backing,    setBacking]    = useState(false)
  const [autoBackup, setAutoBackup] = useState(() => localStorage.getItem(AUTO_KEY) === 'true')
  const [lastBackup, setLastBackup] = useState(() => localStorage.getItem(LAST_KEY) ? new Date(parseInt(localStorage.getItem(LAST_KEY))) : null)
  const [msg,        setMsg]        = useState({ type:'', text:'' })

  const toggleAuto = () => {
    const next = !autoBackup
    setAutoBackup(next)
    localStorage.setItem(AUTO_KEY, String(next))
    setMsg({ type:'ok', text: next ? 'Auto-backup enabled' : 'Auto-backup disabled' })
    setTimeout(() => setMsg({ type:'', text:'' }), 2000)
  }

  const handleBackup = async () => {
    if (!seed) { setMsg({ type:'err', text:'No seed phrase found — open Seed Phrase first' }); return }
    setBacking(true); setMsg({ type:'', text:'' })
    try {
      await backupMintsToNostr(seed, mints)
      const now = Date.now()
      localStorage.setItem(LAST_KEY, String(now))
      setLastBackup(new Date(now))
      setMsg({ type:'ok', text:'Mints backed up to Nostr!' })
    } catch(e) {
      setMsg({ type:'err', text: 'Backup failed: ' + e.message })
    }
    setBacking(false)
    setTimeout(() => setMsg({ type:'', text:'' }), 3000)
  }

  return (
    <div style={{ minHeight:'100vh',background:C.bg,fontFamily:"'Inter',sans-serif",paddingBottom:40 }}>
      <div style={{ background:C.white,borderBottom:`1px solid ${C.border}`,padding:'14px 20px',display:'flex',alignItems:'center',gap:12,position:'sticky',top:0,zIndex:10 }}>
        <button onClick={onBack} style={{ width:36,height:36,borderRadius:'50%',background:C.bg,border:`1px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer' }}>
          <ArrowLeft size={17} color={C.black}/>
        </button>
        <span style={{ fontSize:16,fontWeight:700,color:C.black }}>Nostr Backup</span>
      </div>

      <div style={{ padding:'20px 16px' }}>
        {/* Info */}
        <div style={{ background:'rgba(59,130,246,0.06)',border:`1px solid rgba(59,130,246,0.2)`,borderRadius:14,padding:'14px 16px',marginBottom:16 }}>
          <div style={{ fontSize:13,fontWeight:700,color:'#3b82f6',marginBottom:6 }}>☁️ Nostr Backup</div>
          <div style={{ fontSize:12,color:C.muted,lineHeight:1.7,marginBottom:10 }}>
            Your mint list is encrypted with NIP-44 and published to Nostr relays. Only you can decrypt it with your seed phrase. Restore it on any device.
          </div>
          <div style={{ fontSize:11,color:C.muted }}>Mints to backup: <strong style={{ color:C.black }}>{mintObjects.length}</strong></div>
        </div>

        {/* Last backup */}
        {lastBackup && (
          <div style={{ display:'flex',alignItems:'center',gap:8,padding:'10px 14px',borderRadius:10,background:'rgba(34,197,94,0.06)',border:`1px solid rgba(34,197,94,0.2)`,fontSize:12,color:C.green,marginBottom:14 }}>
            <CheckCircle size={13}/> Last backup: {lastBackup.toLocaleString()}
          </div>
        )}

        {/* Message */}
        {msg.text && (
          <div style={{ display:'flex',alignItems:'center',gap:8,padding:'10px 14px',borderRadius:10,background:msg.type==='ok'?'rgba(34,197,94,0.06)':'rgba(239,68,68,0.06)',border:`1px solid ${msg.type==='ok'?'rgba(34,197,94,0.2)':'rgba(239,68,68,0.2)'}`,fontSize:12,color:msg.type==='ok'?C.green:C.red,marginBottom:14 }}>
            {msg.type==='ok' ? <CheckCircle size={13}/> : <AlertCircle size={13}/>} {msg.text}
          </div>
        )}

        {/* Auto backup toggle */}
        <div style={{ background:C.white,border:`1px solid ${C.border}`,borderRadius:14,padding:'14px 16px',marginBottom:14,display:'flex',alignItems:'center',justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:14,fontWeight:600,color:C.black,marginBottom:2 }}>Auto-backup</div>
            <div style={{ fontSize:11,color:C.muted }}>Backup when mints change</div>
          </div>
          <button onClick={toggleAuto} style={{ width:48,height:26,borderRadius:13,background:autoBackup?C.ochre:C.border,border:'none',cursor:'pointer',position:'relative',transition:'background 0.2s',flexShrink:0 }}>
            <div style={{ width:20,height:20,borderRadius:'50%',background:C.white,position:'absolute',top:3,left:autoBackup?24:4,transition:'left 0.2s',boxShadow:'0 1px 4px rgba(0,0,0,0.2)' }}/>
          </button>
        </div>

        {/* Backup button */}
        <button onClick={handleBackup} disabled={backing || !mints.length} style={{ width:'100%',padding:14,background:mints.length&&!backing?C.black:C.border,border:'none',borderRadius:14,cursor:mints.length&&!backing?'pointer':'not-allowed',fontSize:14,fontWeight:700,color:C.white,display:'flex',alignItems:'center',justifyContent:'center',gap:8,marginBottom:16 }}>
          {backing ? <><Loader size={16} style={{ animation:'spin 1s linear infinite' }}/> Backing up…</> : <><Download size={16}/> Backup to Nostr</>}
        </button>

        {/* How it works */}
        <div style={{ background:'rgba(247,147,26,0.04)',border:`1px solid rgba(247,147,26,0.15)`,borderRadius:12,padding:'12px 14px' }}>
          <div style={{ fontSize:12,fontWeight:600,color:C.ochre,marginBottom:8 }}>How it works</div>
          <div style={{ fontSize:11,color:C.muted,lineHeight:1.8 }}>
            <div>• Your mint list is encrypted with NIP-44</div>
            <div>• Published to public Nostr relays</div>
            <div>• Only you can decrypt it with your seed phrase</div>
            <div>• Restore on any device by entering your seed</div>
          </div>
        </div>

        {/* Current mints */}
        <div style={{ marginTop:16 }}>
          <div style={{ fontSize:12,fontWeight:700,color:C.black,marginBottom:10 }}>Current mints</div>
          {mintObjects.map(m => (
            <div key={m.url} style={{ background:C.white,border:`1px solid ${C.border}`,borderRadius:10,padding:'10px 12px',marginBottom:8 }}>
              <div style={{ fontSize:12,fontWeight:600,color:C.black,marginBottom:2 }}>{m.name}</div>
              <div style={{ fontSize:10,fontFamily:'monospace',color:C.muted,wordBreak:'break-all' }}>{m.url}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Restore page ───────────────────────────────
export function RestorePage({ onBack, onReload }) {
  const [tab,      setTab]      = useState('seed')  // 'seed' | 'token'
  const [step,     setStep]     = useState(1)        // seed tab: 1=input 2=select 3=progress
  const [seedInput,setSeedInput]= useState('')
  const [errMsg,   setErrMsg]   = useState('')
  const [loading,  setLoading]  = useState(false)
  const [progress, setProgress] = useState({})
  const [result,   setResult]   = useState(null)     // { totalSats, tokens }
  const [selectedMints, setSelectedMints] = useState([])

  // Token tab
  const [tokenInput, setTokenInput] = useState('')
  const [tokenBusy,  setTokenBusy]  = useState(false)
  const [tokenDone,  setTokenDone]  = useState(false)
  const [tokenAmt,   setTokenAmt]   = useState(0)
  const [tokenErr,   setTokenErr]   = useState('')

  const { mints } = getWalletData()

  // ── Seed flow ──
  const handleSeedNext = () => {
    setErrMsg('')
    if (!validateSeedPhrase(seedInput)) { setErrMsg('Invalid recovery phrase — must be 12 or 24 words'); return }
    setSelectedMints(mints.slice())
    setStep(2)
  }

  const handleStartRestore = async () => {
    setLoading(true); setStep(3); setProgress({}); setResult(null)
    try {
      const res = await restoreWallet(seedInput, selectedMints, (mintUrl, status, data) => {
        setProgress(prev => ({ ...prev, [mintUrl]: { status, ...data } }))
      })
      setResult(res)
      // Auto-receive all found tokens
      for (const t of res.tokens) {
        try { await receiveCashuToken(t.token) } catch {}
      }
      onReload?.()
    } catch(e) { setErrMsg(e.message) }
    setLoading(false)
  }

  // ── Token flow ──
  const handleTokenClaim = async () => {
    if (!tokenInput.trim()) return
    setTokenBusy(true); setTokenErr('')
    try {
      const amt = await receiveCashuToken(tokenInput.trim())
      setTokenAmt(amt); setTokenDone(true); onReload?.()
    } catch(e) { setTokenErr(e.message || 'Invalid token') }
    setTokenBusy(false)
  }

  return (
    <div style={{ minHeight:'100vh',background:C.bg,fontFamily:"'Inter',sans-serif",paddingBottom:40 }}>
      <div style={{ background:C.white,borderBottom:`1px solid ${C.border}`,padding:'14px 20px',display:'flex',alignItems:'center',gap:12,position:'sticky',top:0,zIndex:10 }}>
        <button onClick={step > 1 && tab==='seed' ? () => setStep(s=>s-1) : onBack} style={{ width:36,height:36,borderRadius:'50%',background:C.bg,border:`1px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer' }}>
          <ArrowLeft size={17} color={C.black}/>
        </button>
        <span style={{ fontSize:16,fontWeight:700,color:C.black }}>Restore Wallet</span>
      </div>

      <div style={{ padding:'16px' }}>
        {/* Tab selector */}
        <div style={{ display:'flex',background:C.white,borderRadius:12,padding:4,border:`1px solid ${C.border}`,marginBottom:20 }}>
          {[{ k:'seed', label:'From seed phrase' }, { k:'token', label:'From token' }].map(({ k, label }) => (
            <button key={k} onClick={() => setTab(k)} style={{ flex:1,padding:'9px 4px',borderRadius:9,background:tab===k?C.black:'transparent',border:'none',cursor:'pointer',fontSize:12,fontWeight:tab===k?700:400,color:tab===k?C.white:C.muted,transition:'all .15s' }}>
              {label}
            </button>
          ))}
        </div>

        {/* ── Seed tab ── */}
        {tab === 'seed' && (
          <>
            {step === 1 && (
              <div>
                <div style={{ fontSize:13,color:C.muted,marginBottom:16,lineHeight:1.6 }}>Enter your 12 or 24-word recovery phrase to restore your wallet balance.</div>
                <textarea value={seedInput} onChange={e => setSeedInput(e.target.value)} placeholder="Enter recovery words separated by spaces…" rows={4}
                  style={{ width:'100%',padding:'12px 14px',background:C.white,border:`1.5px solid ${seedInput?C.black:C.border}`,borderRadius:12,outline:'none',resize:'none',fontSize:13,color:C.black,fontFamily:'monospace',boxSizing:'border-box',marginBottom:12,lineHeight:1.6 }}/>
                {errMsg && <div style={{ display:'flex',alignItems:'center',gap:8,padding:'10px 14px',borderRadius:10,background:'rgba(239,68,68,0.06)',border:`1px solid rgba(239,68,68,0.2)`,fontSize:12,color:C.red,marginBottom:12 }}><AlertCircle size={14}/> {errMsg}</div>}
                <button onClick={handleSeedNext} disabled={!seedInput.trim()} style={{ width:'100%',padding:14,background:seedInput.trim()?C.black:C.border,border:'none',borderRadius:14,cursor:seedInput.trim()?'pointer':'not-allowed',fontSize:14,fontWeight:700,color:C.white }}>
                  Next — select mints
                </button>
              </div>
            )}

            {step === 2 && (
              <div>
                <div style={{ fontSize:13,color:C.muted,marginBottom:16,lineHeight:1.6 }}>Select which mints to scan for your proofs.</div>

                {/* Search Nostr for backed-up mints */}
                <button onClick={async () => {
                  setErrMsg('')
                  try {
                    const discovered = await searchMintsOnNostr(seedInput)
                    const newUrls = discovered.map(m => m.url).filter(u => !mints.includes(u))
                    if (newUrls.length > 0) {
                      const updated = [...mints, ...newUrls]
                      saveMints(updated)
                      setSelectedMints(updated)
                    } else {
                      setSelectedMints(prev => [...new Set([...prev, ...discovered.map(m => m.url)])])
                    }
                  } catch(e) { setErrMsg('Nostr search failed: ' + e.message) }
                }} style={{ width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:8,padding:'11px',background:'rgba(59,130,246,0.06)',border:`1px solid rgba(59,130,246,0.2)`,borderRadius:12,cursor:'pointer',fontSize:12,fontWeight:600,color:'#3b82f6',marginBottom:14 }}>
                  ☁️ Search Nostr for backed-up mints
                </button>

                {mints.length === 0 && (
                  <div style={{ padding:'14px 16px',background:'rgba(247,147,26,0.06)',border:`1px solid rgba(247,147,26,0.2)`,borderRadius:12,fontSize:12,color:C.ochre,marginBottom:16 }}>
                    No mints found. Add mints in settings first.
                  </div>
                )}
                {mints.map(url => {
                  const selected = selectedMints.includes(url)
                  return (
                    <button key={url} onClick={() => setSelectedMints(prev => selected ? prev.filter(u=>u!==url) : [...prev, url])}
                      style={{ width:'100%',display:'flex',alignItems:'center',gap:12,padding:'12px 14px',marginBottom:8,background:selected?'rgba(26,20,16,0.04)':C.white,border:`1.5px solid ${selected?C.black:C.border}`,borderRadius:12,cursor:'pointer',textAlign:'left' }}>
                      <div style={{ width:20,height:20,borderRadius:4,background:selected?C.black:'transparent',border:`2px solid ${selected?C.black:C.border}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
                        {selected && <Check size={12} color={C.white}/>}
                      </div>
                      <span style={{ fontSize:12,fontFamily:'monospace',color:C.black,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{url.replace('https://','')}</span>
                    </button>
                  )
                })}
                <button onClick={handleStartRestore} disabled={!selectedMints.length} style={{ width:'100%',marginTop:8,padding:14,background:selectedMints.length?C.black:C.border,border:'none',borderRadius:14,cursor:selectedMints.length?'pointer':'not-allowed',fontSize:14,fontWeight:700,color:C.white }}>
                  Restore from {selectedMints.length} mint{selectedMints.length!==1?'s':''}
                </button>
              </div>
            )}

            {step === 3 && (
              <div>
                <div style={{ textAlign:'center',marginBottom:24,padding:'16px',background:C.white,borderRadius:14,border:`1px solid ${C.border}` }}>
                  <div style={{ fontSize:28,fontWeight:800,color:result?.totalSats>0?C.green:C.black,marginBottom:4 }}>
                    {result ? `${result.totalSats} sats` : '…'}
                  </div>
                  <div style={{ fontSize:12,color:C.muted }}>
                    {result ? `${result.totalProofs} proofs found` : 'Scanning…'}
                  </div>
                </div>

                {mints.filter(u => selectedMints.includes(u)).map(url => {
                  const p = progress[url] || { status:'pending' }
                  return (
                    <div key={url} style={{ background:C.white,borderRadius:12,border:`1px solid ${C.border}`,padding:'12px 14px',marginBottom:8 }}>
                      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4 }}>
                        <span style={{ fontSize:12,fontFamily:'monospace',color:C.black,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{url.replace('https://','')}</span>
                        {p.status==='scanning' && <Loader size={13} color={C.ochre} style={{ animation:'spin 1s linear infinite',flexShrink:0 }}/>}
                        {p.status==='done'     && <CheckCircle size={13} color={C.green} style={{ flexShrink:0 }}/>}
                        {p.status==='error'    && <AlertCircle size={13} color={C.red} style={{ flexShrink:0 }}/>}
                      </div>
                      {p.message && <div style={{ fontSize:11,color:C.muted }}>{p.message}</div>}
                      {p.totalSats > 0 && <div style={{ fontSize:11,color:C.green,marginTop:3 }}>✓ {p.totalSats} sats restored</div>}
                    </div>
                  )
                })}

                {result && (
                  <button onClick={onBack} style={{ width:'100%',marginTop:12,padding:14,background:C.black,border:'none',borderRadius:14,cursor:'pointer',fontSize:14,fontWeight:700,color:C.white }}>
                    {result.totalSats > 0 ? 'Done — balance restored!' : 'Done'}
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {/* ── Token tab ── */}
        {tab === 'token' && (
          <div>
            {!tokenDone ? (
              <>
                <div style={{ fontSize:13,color:C.muted,marginBottom:16,lineHeight:1.6 }}>Paste a Cashu token from your backup to restore your balance.</div>
                <textarea value={tokenInput} onChange={e => { setTokenInput(e.target.value); setTokenErr('') }} placeholder="cashuA..." rows={5}
                  style={{ width:'100%',padding:'12px 14px',background:C.white,border:`1.5px solid ${tokenInput?C.black:C.border}`,borderRadius:12,outline:'none',resize:'none',fontSize:12,color:C.black,fontFamily:'monospace',boxSizing:'border-box',marginBottom:12,lineHeight:1.6 }}/>
                {tokenErr && <div style={{ display:'flex',alignItems:'center',gap:8,padding:'10px 14px',borderRadius:10,background:'rgba(239,68,68,0.06)',border:`1px solid rgba(239,68,68,0.2)`,fontSize:12,color:C.red,marginBottom:12 }}><AlertCircle size={14}/> {tokenErr}</div>}
                <button onClick={handleTokenClaim} disabled={tokenBusy||!tokenInput.trim()} style={{ width:'100%',padding:14,background:tokenInput.trim()&&!tokenBusy?C.black:C.border,border:'none',borderRadius:14,cursor:tokenInput.trim()&&!tokenBusy?'pointer':'not-allowed',fontSize:14,fontWeight:700,color:C.white,display:'flex',alignItems:'center',justifyContent:'center',gap:8 }}>
                  {tokenBusy ? <><Loader size={16} style={{ animation:'spin 1s linear infinite' }}/> Claiming…</> : <><ArrowDownToLine size={15}/> Claim token</>}
                </button>
              </>
            ) : (
              <div style={{ textAlign:'center',padding:'24px 0' }}>
                <CheckCircle size={52} color={C.green} style={{ display:'block',margin:'0 auto 16px' }}/>
                <div style={{ fontSize:18,fontWeight:700,color:C.black,marginBottom:6 }}>Token claimed!</div>
                <div style={{ fontSize:13,color:C.muted,marginBottom:24 }}>{tokenAmt} sats restored to your wallet</div>
                <button onClick={onBack} style={{ padding:'12px 32px',background:C.black,border:'none',borderRadius:14,cursor:'pointer',fontSize:14,fontWeight:700,color:C.white }}>Done</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Mints page ─────────────────────────────────
export function MintsPage({ onBack }) {
  const { mints }  = getWalletData()
  const [newMint,  setNewMint]  = useState('')
  const [mintList, setMintList] = useState(mints)
  const [errMsg,   setErrMsg]   = useState('')

  const addMint = () => {
    const url = newMint.trim().replace(/\/$/, '')
    if (!url.startsWith('https://')) { setErrMsg('Must start with https://'); return }
    if (mintList.includes(url)) { setErrMsg('Already added'); return }
    const updated = [...mintList, url]; setMintList(updated); saveMints(updated)
    setNewMint(''); setErrMsg('')
  }

  const removeMint = (url) => {
    if (mintList.length === 1) { setErrMsg("Can't remove your only mint"); return }
    const updated = mintList.filter(m=>m!==url); setMintList(updated); saveMints(updated)
  }

  return (
    <div style={{ minHeight:'100vh',background:C.bg,fontFamily:"'Inter',sans-serif",paddingBottom:40 }}>
      <div style={{ background:C.white,borderBottom:`1px solid ${C.border}`,padding:'14px 20px',display:'flex',alignItems:'center',gap:12,position:'sticky',top:0,zIndex:10 }}>
        <button onClick={onBack} style={{ width:36,height:36,borderRadius:'50%',background:C.bg,border:`1px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer' }}>
          <ArrowLeft size={17} color={C.black}/>
        </button>
        <span style={{ fontSize:16,fontWeight:700,color:C.black }}>Manage Mints</span>
      </div>

      <div style={{ padding:'20px 16px' }}>
        <div style={{ fontSize:13,color:C.muted,marginBottom:16,lineHeight:1.6 }}>Mints hold your Cashu tokens. The first one is used by default.</div>
        {mintList.map((url, i) => (
          <div key={url} style={{ display:'flex',alignItems:'center',gap:10,padding:'12px 14px',background:C.white,border:`1px solid ${C.border}`,borderRadius:12,marginBottom:8 }}>
            <div style={{ width:6,height:6,borderRadius:'50%',background:i===0?C.ochre:C.muted,flexShrink:0 }}/>
            <span style={{ flex:1,fontSize:12,fontFamily:'monospace',color:C.black,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{url.replace('https://','')}</span>
            {i === 0
              ? <span style={{ fontSize:10,color:C.ochre,fontWeight:700 }}>DEFAULT</span>
              : <button onClick={()=>removeMint(url)} style={{ background:'none',border:'none',cursor:'pointer',color:C.red,fontSize:11,fontWeight:600 }}>Remove</button>
            }
          </div>
        ))}
        <div style={{ marginTop:16 }}>
          <input value={newMint} onChange={e=>{ setNewMint(e.target.value); setErrMsg('') }} placeholder="https://mint.example.com"
            style={{ width:'100%',padding:'11px 14px',background:C.white,border:`1.5px solid ${newMint?C.black:C.border}`,borderRadius:12,outline:'none',fontSize:13,color:C.black,boxSizing:'border-box',marginBottom:8 }}/>
          {errMsg && <div style={{ fontSize:11,color:C.red,marginBottom:8 }}>{errMsg}</div>}
          <button onClick={addMint} style={{ width:'100%',padding:12,background:C.black,border:'none',borderRadius:12,cursor:'pointer',fontSize:13,fontWeight:700,color:C.white }}>Add mint</button>
        </div>
      </div>
    </div>
  )
}

// ── Main wallet ────────────────────────────────
