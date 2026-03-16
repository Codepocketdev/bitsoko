// Wallet.jsx — Bitsoko Cashu Wallet
import { useState, useEffect, useCallback, Component } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Zap, Copy, Check, RefreshCw,
  ArrowDownToLine, ArrowUpFromLine, Banknote,
  Send, Loader, X, AlertCircle, CheckCircle,
  ShoppingBag, Settings, Eye, EyeOff,
  TrendingUp, ChevronRight, Mail, QrCode,
  Wallet as WalletIcon, CircleDollarSign,
  RotateCcw, Plus,
} from 'lucide-react'
import { useNpubcash } from '../hooks/useNpubcash'
import { satsToKsh, useRate } from '../lib/rates'
import {
  getWalletData, getBalance, saveMints,
  createMintInvoice, pollMintQuote,
  payLightningInvoice, getMeltFeeEstimate,
  sendCashuToken, receiveCashuToken,
  fetchLnurlInvoice, DEFAULT_MINT_URL,
} from '../lib/cashuWallet'

// ── Color palette — matches Bitsoko site ──────
const C = {
  bg:      '#f7f4f0',
  white:   '#ffffff',
  black:   '#1a1410',
  muted:   '#b0a496',
  border:  '#e8e0d5',
  orange:  '#f7931a',
  ochre:   '#c8860a',
  red:     '#ef4444',
  glass:   'rgba(247,244,240,0.85)',
  glassBorder: 'rgba(176,164,150,0.4)',
  green:   '#22c55e',
}

const TX_CONFIG = {
  1: { label:'Token received',  color:C.ochre,  debit:false, Icon:ArrowDownToLine },
  2: { label:'Token sent',      color:C.orange, debit:true,  Icon:ArrowUpFromLine },
  3: { label:'Minted',          color:C.ochre,  debit:false, Icon:Plus            },
  4: { label:'Paid invoice',    color:C.orange, debit:true,  Icon:Zap             },
  5: { label:'Purchase',        color:C.orange, debit:true,  Icon:ShoppingBag     },
}

const PENDING_QUOTE_KEY = 'bitsoko_pending_mint_quote'

function timeAgo(ts) {
  const s = Math.floor(Date.now() / 1000) - ts
  if (s < 3600)  return `${Math.floor(s/60)}m ago`
  if (s < 86400) return `${Math.floor(s/3600)}h ago`
  if (s < 86400*7) return `${Math.floor(s/86400)}d ago`
  return new Date(ts*1000).toLocaleDateString('en',{month:'short',day:'numeric'})
}

function isLightningAddress(str) {
  if (!str) return false
  const parts = str.trim().split('@')
  return parts.length === 2 && parts[0].length > 0 && parts[1].includes('.')
}

function savePendingQuote(data) { try { localStorage.setItem(PENDING_QUOTE_KEY, JSON.stringify(data)) } catch {} }
function loadPendingQuote()     { try { const d = localStorage.getItem(PENDING_QUOTE_KEY); return d ? JSON.parse(d) : null } catch { return null } }
function clearPendingQuote()    { try { localStorage.removeItem(PENDING_QUOTE_KEY) } catch {} }

// ── Error boundary ─────────────────────────────
class WalletErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(e) { return { error: e } }
  render() {
    if (this.state.error) return (
      <div style={{ minHeight:'100vh',background:C.bg,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12,padding:24,textAlign:'center' }}>
        <AlertCircle size={44} color={C.red}/>
        <div style={{ fontSize:16,fontWeight:700,color:C.black }}>Wallet error</div>
        <div style={{ fontSize:12,color:C.muted,maxWidth:300,wordBreak:'break-word' }}>{this.state.error.message}</div>
        <button onClick={() => this.setState({ error:null })} style={{ marginTop:8,padding:'10px 24px',background:C.black,border:'none',borderRadius:12,cursor:'pointer',fontSize:13,fontWeight:700,color:C.white }}>Retry</button>
      </div>
    )
    return this.props.children
  }
}

// ── Sheet wrapper ──────────────────────────────
function Sheet({ title, onClose, children }) {
  return (
    <>
      <div onClick={onClose} style={{ position:'fixed',inset:0,zIndex:200,background:'rgba(26,20,16,0.5)',backdropFilter:'blur(2px)' }}/>
      <div style={{ position:'fixed',bottom:0,left:0,right:0,zIndex:210,background:C.white,borderRadius:'20px 20px 0 0',maxHeight:'90vh',display:'flex',flexDirection:'column',animation:'sheetUp .25s cubic-bezier(0.32,0.72,0,1)',boxShadow:'0 -4px 40px rgba(26,20,16,0.15)' }}>
        <div style={{ padding:'16px 20px 0',flexShrink:0 }}>
          <div style={{ width:36,height:4,borderRadius:2,background:C.border,margin:'0 auto 16px' }}/>
          <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20 }}>
            <span style={{ fontSize:16,fontWeight:700,color:C.black }}>{title}</span>
            <button onClick={onClose} style={{ width:30,height:30,borderRadius:'50%',background:C.bg,border:`1px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer' }}>
              <X size={14} color={C.muted}/>
            </button>
          </div>
        </div>
        <div style={{ flex:1,overflowY:'auto',padding:'0 20px 48px' }}>{children}</div>
      </div>
    </>
  )
}

// ── Receive menu sheet ────────────────────────
function ReceiveMenuSheet({ onClose, onSelect }) {
  const options = [
    { key:'mint',      Icon:Plus,            label:'Add funds',   sub:'Pay a Lightning invoice to top up' },
    { key:'lnaddress', Icon:Mail,            label:'LN Address',  sub:'Your npub.cash Lightning address'  },
    { key:'receive',   Icon:ArrowDownToLine, label:'Claim token', sub:'Paste a Cashu token to redeem'     },
  ]
  return (
    <Sheet title="Receive" onClose={onClose}>
      {options.map(({ key, Icon, label, sub }) => (
        <button key={key} onClick={()=>{ onClose(); onSelect(key) }} style={{
          width:'100%', display:'flex', alignItems:'center', gap:14,
          padding:'14px 16px', marginBottom:10,
          background:C.bg, border:`1.5px solid ${C.border}`,
          borderRadius:16, cursor:'pointer', textAlign:'left',
        }}>
          <div style={{ width:42,height:42,borderRadius:12,background:'rgba(176,164,150,0.15)',border:`1px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
            <Icon size={19} color={C.black}/>
          </div>
          <div>
            <div style={{ fontSize:14,fontWeight:700,color:C.black,marginBottom:2 }}>{label}</div>
            <div style={{ fontSize:11,color:C.muted }}>{sub}</div>
          </div>
        </button>
      ))}
    </Sheet>
  )
}

// ── Send menu sheet ────────────────────────────
function SendMenuSheet({ onClose, onSelect }) {
  const options = [
    { key:'pay',  Icon:Zap,             label:'Pay invoice',  sub:'Pay a Lightning invoice or LN address' },
    { key:'send', Icon:ArrowUpFromLine, label:'Send token',   sub:'Generate a Cashu token to share'       },
  ]
  return (
    <Sheet title="Send" onClose={onClose}>
      {options.map(({ key, Icon, label, sub }) => (
        <button key={key} onClick={()=>{ onClose(); onSelect(key) }} style={{
          width:'100%', display:'flex', alignItems:'center', gap:14,
          padding:'14px 16px', marginBottom:10,
          background:'rgba(247,147,26,0.04)', border:`1.5px solid rgba(247,147,26,0.2)`,
          borderRadius:16, cursor:'pointer', textAlign:'left',
        }}>
          <div style={{ width:42,height:42,borderRadius:12,background:'rgba(247,147,26,0.1)',border:`1px solid rgba(247,147,26,0.2)`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
            <Icon size={19} color={C.orange}/>
          </div>
          <div>
            <div style={{ fontSize:14,fontWeight:700,color:C.black,marginBottom:2 }}>{label}</div>
            <div style={{ fontSize:11,color:C.muted }}>{sub}</div>
          </div>
        </button>
      ))}
    </Sheet>
  )
}

// ── Add Funds sheet ────────────────────────────
function MintSheet({ onClose, onSuccess, rate }) {
  const [amount,     setAmount]     = useState('')
  const [step,       setStep]       = useState('input')
  const [invoice,    setInvoice]    = useState('')
  const [copied,     setCopied]     = useState(false)
  const [errMsg,     setErrMsg]     = useState('')
  const [cancelPoll, setCancelPoll] = useState(null)

  useEffect(() => {
    const pending = loadPendingQuote()
    if (pending && Date.now() / 1000 - pending.createdAt < 600) {
      setAmount(String(pending.amountSats))
      setInvoice(pending.invoice)
      setStep('invoice')
      resumePoll(pending)
    }
  }, [])

  const resumePoll = async (pending) => {
    try {
      const { CashuMint, CashuWallet } = await import('@cashu/cashu-ts')
      const mint   = new CashuMint(pending.mintUrl)
      const wallet = new CashuWallet(mint, { unit:'sat' })
      await wallet.getKeys()
      const cancel = pollMintQuote(wallet, pending.amountSats, pending.hash, pending.mintUrl,
        () => { clearPendingQuote(); setStep('done'); onSuccess?.() },
        (err) => { clearPendingQuote(); setStep('error'); setErrMsg(err) }
      )
      setCancelPoll(() => cancel)
    } catch(e) {}
  }

  const handleMint = async () => {
    const sats = parseInt(amount)
    if (!sats || sats < 1) return
    setStep('invoice'); setErrMsg('')
    try {
      const result = await createMintInvoice(sats)
      setInvoice(result.invoice)
      savePendingQuote({ invoice: result.invoice, hash: result.hash, amountSats: result.amountSats, mintUrl: result.mintUrl, createdAt: Math.floor(Date.now() / 1000) })
      if (typeof window.webln !== 'undefined') {
        try { await window.webln.enable(); await window.webln.sendPayment(result.invoice) } catch {}
      }
      const cancel = pollMintQuote(result.wallet, result.amountSats, result.hash, result.mintUrl,
        () => { clearPendingQuote(); setStep('done'); onSuccess?.() },
        (err) => { clearPendingQuote(); setStep('error'); setErrMsg(err) }
      )
      setCancelPoll(() => cancel)
    } catch(e) { setStep('error'); setErrMsg(e.message || 'Failed to create invoice') }
  }

  const reset = () => { cancelPoll?.(); clearPendingQuote(); setStep('input'); setAmount(''); setInvoice(''); setErrMsg('') }
  const copyInvoice = async () => { await navigator.clipboard.writeText(invoice); setCopied(true); setTimeout(()=>setCopied(false),2000) }
  const QUICK = [1000,5000,10000,50000]

  return (
    <Sheet title="Add funds" onClose={() => { cancelPoll?.(); onClose() }}>
      {step === 'input' && (
        <div>
          <div style={{ fontSize:13,color:C.muted,marginBottom:16,lineHeight:1.6 }}>Pay a Lightning invoice to add sats to your wallet.</div>
          <div style={{ position:'relative',marginBottom:12 }}>
            <div style={{ position:'absolute',left:12,top:'50%',transform:'translateY(-50%)' }}><Zap size={15} fill={C.orange} color={C.orange}/></div>
            <input type="number" min="1" autoFocus value={amount} onChange={e=>setAmount(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleMint()} placeholder="Amount in sats"
              style={{ width:'100%',padding:'13px 13px 13px 34px',background:C.bg,border:`1.5px solid ${amount?C.black:C.border}`,borderRadius:12,outline:'none',fontSize:16,fontWeight:600,color:C.black,boxSizing:'border-box' }}/>
          </div>
          {amount && parseInt(amount)>0 && <div style={{ fontSize:11,color:C.muted,marginBottom:12 }}>≈ {satsToKsh(parseInt(amount), rate)}</div>}
          <div style={{ display:'flex',gap:8,marginBottom:20 }}>
            {QUICK.map(n => (
              <button key={n} onClick={()=>setAmount(String(n))} style={{ flex:1,padding:'8px 4px',borderRadius:10,background:parseInt(amount)===n?C.black:C.bg,border:`1px solid ${parseInt(amount)===n?C.black:C.border}`,cursor:'pointer',fontSize:11,fontWeight:600,color:parseInt(amount)===n?C.white:C.black }}>
                {n>=1000?`${n/1000}k`:n}
              </button>
            ))}
          </div>
          <button onClick={handleMint} disabled={!amount||parseInt(amount)<1} style={{ width:'100%',padding:14,background:amount&&parseInt(amount)>=1?C.black:C.border,border:'none',borderRadius:14,cursor:amount&&parseInt(amount)>=1?'pointer':'not-allowed',fontSize:14,fontWeight:700,color:C.white }}>
            Generate invoice
          </button>
        </div>
      )}
      {step === 'invoice' && (
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:13,color:C.muted,marginBottom:20 }}>
            Scan or copy — payment detected automatically even if you close this screen
          </div>
          {invoice && <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(invoice)}&bgcolor=f7f4f0&color=1a1410&margin=10`} alt="LN Invoice" style={{ width:200,height:200,borderRadius:14,border:`1px solid ${C.border}`,display:'block',margin:'0 auto 16px' }}/>}
          <button onClick={copyInvoice} style={{ display:'inline-flex',alignItems:'center',gap:6,padding:'10px 20px',background:C.bg,border:`1px solid ${C.border}`,borderRadius:10,cursor:'pointer',fontSize:12,fontWeight:600,color:copied?C.green:C.black,marginBottom:20 }}>
            {copied ? <><Check size={13}/> Copied</> : <><Copy size={13}/> Copy invoice</>}
          </button>
          <div style={{ display:'flex',alignItems:'center',justifyContent:'center',gap:8,fontSize:12,color:C.muted }}>
            <Loader size={13} style={{ animation:'spin 1s linear infinite' }}/> Waiting for payment…
          </div>
          <button onClick={reset} style={{ marginTop:16,background:'none',border:'none',cursor:'pointer',fontSize:12,color:C.muted }}>Cancel</button>
        </div>
      )}
      {step === 'done' && (
        <div style={{ textAlign:'center',padding:'24px 0' }}>
          <CheckCircle size={48} color={C.green} style={{ margin:'0 auto 16px',display:'block' }}/>
          <div style={{ fontSize:18,fontWeight:700,color:C.black,marginBottom:8 }}>Payment confirmed!</div>
          <div style={{ fontSize:13,color:C.muted,marginBottom:24 }}>{amount} sats added to your wallet</div>
          <button onClick={onClose} style={{ padding:'12px 32px',background:C.black,border:'none',borderRadius:12,cursor:'pointer',fontSize:14,fontWeight:700,color:C.white }}>Done</button>
        </div>
      )}
      {step === 'error' && (
        <div style={{ textAlign:'center',padding:'24px 0' }}>
          <AlertCircle size={44} color={C.red} style={{ margin:'0 auto 16px',display:'block' }}/>
          <div style={{ fontSize:16,fontWeight:700,color:C.black,marginBottom:8 }}>Something went wrong</div>
          <div style={{ fontSize:13,color:C.muted,marginBottom:24,lineHeight:1.5 }}>{errMsg}</div>
          <button onClick={reset} style={{ padding:'12px 32px',background:C.black,border:'none',borderRadius:12,cursor:'pointer',fontSize:14,fontWeight:700,color:C.white }}>Try again</button>
        </div>
      )}
    </Sheet>
  )
}

// ── Pay sheet ──────────────────────────────────
function PaySheet({ onClose, onSuccess, rate }) {
  const [input,   setInput]   = useState('')
  const [lnAmt,   setLnAmt]   = useState('')
  const [decoded, setDecoded] = useState(null)
  const [step,    setStep]    = useState('input')
  const [errMsg,  setErrMsg]  = useState('')
  const isLnAddr = isLightningAddress(input)
  const QUICK = [1000,5000,10000,50000]

  const handleDecode = async () => {
    setErrMsg(''); setStep('resolving')
    try {
      let invoice = input.trim()
      if (isLnAddr) {
        if (!lnAmt || parseInt(lnAmt) < 1) { setErrMsg('Enter an amount'); setStep('input'); return }
        invoice = await fetchLnurlInvoice(input.trim(), parseInt(lnAmt))
      }
      const { CashuMint, CashuWallet } = await import('@cashu/cashu-ts')
      const { mints } = getWalletData()
      const wallet = new CashuWallet(new CashuMint(mints[0] || DEFAULT_MINT_URL), { unit:'sat' })
      await wallet.getKeys()
      const q = await wallet.createMeltQuote(invoice)
      setDecoded({ invoice, amount:q.amount, fee:q.fee_reserve, total:q.amount+q.fee_reserve })
      setStep('confirm')
    } catch(e) { setErrMsg(e.message||'Failed'); setStep('input') }
  }

  const handlePay = async () => {
    if (!decoded) return
    setStep('paying'); setErrMsg('')
    try {
      await payLightningInvoice(decoded.invoice)
      setStep('done')
      setTimeout(() => { onSuccess?.(); onClose() }, 1500)
    } catch(e) { setErrMsg(e.message||'Payment failed'); setStep('confirm') }
  }

  if (step === 'done') return (
    <Sheet title="Pay" onClose={onClose}>
      <div style={{ textAlign:'center',padding:'24px 0' }}>
        <CheckCircle size={48} color={C.green} style={{ margin:'0 auto 16px',display:'block' }}/>
        <div style={{ fontSize:18,fontWeight:700,color:C.black }}>Payment sent!</div>
      </div>
    </Sheet>
  )

  if (step === 'confirm' && decoded) return (
    <Sheet title="Confirm payment" onClose={() => { setStep('input'); setDecoded(null) }}>
      {isLnAddr && (
        <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:12,padding:'10px 14px',background:'rgba(247,147,26,0.08)',borderRadius:10 }}>
          <Mail size={14} color={C.orange}/>
          <span style={{ fontSize:12,color:C.black }}>Paying <strong>{input.trim()}</strong></span>
        </div>
      )}
      <div style={{ background:C.bg,borderRadius:14,padding:16,marginBottom:16 }}>
        {[['Amount', decoded.amount], ['Network fee', decoded.fee]].map(([k,v]) => (
          <div key={k} style={{ display:'flex',justifyContent:'space-between',marginBottom:8 }}>
            <span style={{ fontSize:13,color:C.muted }}>{k}</span>
            <span style={{ fontSize:13,fontWeight:600,color:C.black }}>{v.toLocaleString()} sats</span>
          </div>
        ))}
        <div style={{ borderTop:`1px solid ${C.border}`,paddingTop:8,display:'flex',justifyContent:'space-between' }}>
          <span style={{ fontSize:14,fontWeight:700,color:C.black }}>Total</span>
          <span style={{ fontSize:14,fontWeight:700,color:C.orange }}>{decoded.total.toLocaleString()} sats</span>
        </div>
      </div>
      {errMsg && <div style={{ display:'flex',alignItems:'center',gap:8,padding:'10px 14px',borderRadius:10,background:'rgba(239,68,68,0.06)',border:`1px solid rgba(239,68,68,0.2)`,fontSize:12,color:C.red,marginBottom:12 }}><AlertCircle size={14}/> {errMsg}</div>}
      <button onClick={handlePay} style={{ width:'100%',padding:14,background:C.orange,border:'none',borderRadius:14,cursor:'pointer',fontSize:14,fontWeight:700,color:C.white,display:'flex',alignItems:'center',justifyContent:'center',gap:8,marginBottom:10 }}>
        <Zap size={15} fill={C.white} color={C.white}/> Pay {decoded.total.toLocaleString()} sats
      </button>
      <button onClick={() => { setStep('input'); setDecoded(null) }} style={{ width:'100%',padding:12,background:'none',border:`1px solid ${C.border}`,borderRadius:14,cursor:'pointer',fontSize:13,color:C.muted }}>Cancel</button>
    </Sheet>
  )

  return (
    <Sheet title="Pay" onClose={onClose}>
      <div style={{ fontSize:13,color:C.muted,marginBottom:16,lineHeight:1.6 }}>Paste a Lightning invoice or enter a Lightning address</div>
      <textarea value={input} onChange={e=>{ setInput(e.target.value); setErrMsg('') }} placeholder="lnbc... or user@domain.com" rows={3}
        style={{ width:'100%',padding:'12px 14px',background:C.bg,border:`1.5px solid ${input?C.black:C.border}`,borderRadius:12,outline:'none',resize:'none',fontSize:12,color:C.black,fontFamily:'monospace',boxSizing:'border-box',marginBottom:8 }}/>
      {isLnAddr && (
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:12,color:C.ochre,marginBottom:8,display:'flex',alignItems:'center',gap:5 }}>
            <Mail size={12}/> Lightning address — enter amount
          </div>
          <div style={{ display:'flex',gap:6,flexWrap:'wrap',marginBottom:8 }}>
            {QUICK.map(n => (
              <button key={n} onClick={()=>setLnAmt(String(n))} style={{ padding:'6px 12px',borderRadius:8,background:parseInt(lnAmt)===n?C.black:C.bg,border:`1px solid ${parseInt(lnAmt)===n?C.black:C.border}`,cursor:'pointer',fontSize:11,fontWeight:600,color:parseInt(lnAmt)===n?C.white:C.black }}>
                {n>=1000?`${n/1000}k`:n}
              </button>
            ))}
          </div>
          <input type="number" min="1" value={lnAmt} onChange={e=>setLnAmt(e.target.value)} placeholder="Or type amount in sats"
            style={{ width:'100%',padding:'10px 12px',background:C.bg,border:`1.5px solid ${lnAmt?C.black:C.border}`,borderRadius:10,outline:'none',fontSize:13,color:C.black,boxSizing:'border-box' }}/>
        </div>
      )}
      {errMsg && <div style={{ display:'flex',alignItems:'center',gap:8,padding:'10px 14px',borderRadius:10,background:'rgba(239,68,68,0.06)',border:`1px solid rgba(239,68,68,0.2)`,fontSize:12,color:C.red,marginBottom:12 }}><AlertCircle size={14}/> {errMsg}</div>}
      {step === 'resolving'
        ? <div style={{ display:'flex',alignItems:'center',justifyContent:'center',gap:8,padding:14,fontSize:13,color:C.muted }}><Loader size={16} style={{ animation:'spin 1s linear infinite' }}/> Resolving…</div>
        : <button onClick={handleDecode} disabled={!input.trim()||(isLnAddr&&!lnAmt)} style={{ width:'100%',padding:14,background:input.trim()&&(!isLnAddr||lnAmt)?C.orange:C.border,border:'none',borderRadius:14,cursor:input.trim()&&(!isLnAddr||lnAmt)?'pointer':'not-allowed',fontSize:14,fontWeight:700,color:C.white,display:'flex',alignItems:'center',justifyContent:'center',gap:8 }}>
            <Zap size={15} fill={C.white} color={C.white}/> {isLnAddr ? 'Get invoice' : 'Decode & pay'}
          </button>
      }
    </Sheet>
  )
}

// ── Send sheet (Cashu token) ───────────────────
function SendSheet({ onClose }) {
  const [amount, setAmount] = useState('')
  const [token,  setToken]  = useState('')
  const [copied, setCopied] = useState(false)
  const [busy,   setBusy]   = useState(false)
  const [errMsg, setErrMsg] = useState('')

  const handleSend = async () => {
    const sats = parseInt(amount)
    if (!sats || sats < 1) return
    setBusy(true); setErrMsg('')
    try { setToken(await sendCashuToken(sats)) }
    catch(e) { setErrMsg(e.message||'Send failed') }
    setBusy(false)
  }

  const copyToken = async () => { await navigator.clipboard.writeText(token); setCopied(true); setTimeout(()=>setCopied(false),2000) }

  return (
    <Sheet title="Send ecash" onClose={onClose}>
      {!token ? (
        <div>
          <div style={{ fontSize:13,color:C.muted,marginBottom:16,lineHeight:1.6 }}>Generate a Cashu token to send to anyone. They paste it to claim.</div>
          <div style={{ position:'relative',marginBottom:16 }}>
            <div style={{ position:'absolute',left:12,top:'50%',transform:'translateY(-50%)' }}><Zap size={15} fill={C.orange} color={C.orange}/></div>
            <input type="number" min="1" autoFocus value={amount} onChange={e=>setAmount(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleSend()} placeholder="Amount in sats"
              style={{ width:'100%',padding:'13px 13px 13px 34px',background:C.bg,border:`1.5px solid ${amount?C.black:C.border}`,borderRadius:12,outline:'none',fontSize:16,fontWeight:600,color:C.black,boxSizing:'border-box' }}/>
          </div>
          {errMsg && <div style={{ display:'flex',alignItems:'center',gap:8,padding:'10px 14px',borderRadius:10,background:'rgba(239,68,68,0.06)',border:`1px solid rgba(239,68,68,0.2)`,fontSize:12,color:C.red,marginBottom:12 }}><AlertCircle size={14}/> {errMsg}</div>}
          <button onClick={handleSend} disabled={busy||!amount||parseInt(amount)<1} style={{ width:'100%',padding:14,background:amount&&!busy?C.orange:C.border,border:'none',borderRadius:14,cursor:amount&&!busy?'pointer':'not-allowed',fontSize:14,fontWeight:700,color:C.white,display:'flex',alignItems:'center',justifyContent:'center',gap:8 }}>
            {busy ? <><Loader size={16} style={{ animation:'spin 1s linear infinite' }}/> Generating…</> : <><ArrowUpFromLine size={15}/> Generate token</>}
          </button>
        </div>
      ) : (
        <div>
          <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:16 }}>
            <CheckCircle size={18} color={C.green}/>
            <span style={{ fontSize:14,fontWeight:700,color:C.black }}>Token ready — copy and share</span>
          </div>
          <div style={{ background:C.bg,borderRadius:12,border:`1px solid ${C.border}`,padding:'12px 14px',marginBottom:16,fontSize:11,fontFamily:'monospace',color:C.muted,wordBreak:'break-all',lineHeight:1.6,maxHeight:100,overflowY:'auto' }}>
            {token}
          </div>
          <button onClick={copyToken} style={{ width:'100%',padding:14,background:copied?C.green:C.black,border:'none',borderRadius:14,cursor:'pointer',fontSize:14,fontWeight:700,color:C.white,display:'flex',alignItems:'center',justifyContent:'center',gap:8,transition:'background 0.2s' }}>
            {copied ? <><Check size={16}/> Copied!</> : <><Copy size={16}/> Copy token</>}
          </button>
          <div style={{ textAlign:'center',marginTop:10,fontSize:11,color:C.muted }}>Token expires when claimed</div>
        </div>
      )}
    </Sheet>
  )
}

// ── Receive sheet (claim token) ────────────────
function ReceiveSheet({ onClose, onSuccess }) {
  const [token,  setToken]  = useState('')
  const [busy,   setBusy]   = useState(false)
  const [done,   setDone]   = useState(false)
  const [amount, setAmount] = useState(0)
  const [errMsg, setErrMsg] = useState('')

  const handleReceive = async () => {
    if (!token.trim()) return
    setBusy(true); setErrMsg('')
    try { const amt = await receiveCashuToken(token.trim()); setAmount(amt); setDone(true); onSuccess?.() }
    catch(e) { setErrMsg(e.message||'Could not claim token') }
    setBusy(false)
  }

  if (done) return (
    <Sheet title="Receive ecash" onClose={onClose}>
      <div style={{ textAlign:'center',padding:'24px 0' }}>
        <CheckCircle size={48} color={C.green} style={{ margin:'0 auto 16px',display:'block' }}/>
        <div style={{ fontSize:18,fontWeight:700,color:C.black,marginBottom:8 }}>Token claimed!</div>
        <div style={{ fontSize:13,color:C.muted,marginBottom:24 }}>{amount} sats added to your wallet</div>
        <button onClick={onClose} style={{ padding:'12px 32px',background:C.black,border:'none',borderRadius:12,cursor:'pointer',fontSize:14,fontWeight:700,color:C.white }}>Done</button>
      </div>
    </Sheet>
  )

  return (
    <Sheet title="Receive ecash" onClose={onClose}>
      <div style={{ fontSize:13,color:C.muted,marginBottom:16,lineHeight:1.6 }}>Paste a Cashu token (cashuA… or cashuB…) to add sats to your wallet.</div>
      <textarea value={token} onChange={e=>{ setToken(e.target.value); setErrMsg('') }} placeholder="cashuA... or cashuB..." rows={5}
        style={{ width:'100%',padding:'12px 14px',background:C.bg,border:`1.5px solid ${token?C.black:C.border}`,borderRadius:12,outline:'none',resize:'none',fontSize:12,color:C.black,fontFamily:'monospace',boxSizing:'border-box',marginBottom:12 }}/>
      {errMsg && <div style={{ display:'flex',alignItems:'center',gap:8,padding:'10px 14px',borderRadius:10,background:'rgba(239,68,68,0.06)',border:`1px solid rgba(239,68,68,0.2)`,fontSize:12,color:C.red,marginBottom:12 }}><AlertCircle size={14}/> {errMsg}</div>}
      <button onClick={handleReceive} disabled={busy||!token.trim()} style={{ width:'100%',padding:14,background:token.trim()&&!busy?C.black:C.border,border:'none',borderRadius:14,cursor:token.trim()&&!busy?'pointer':'not-allowed',fontSize:14,fontWeight:700,color:C.white,display:'flex',alignItems:'center',justifyContent:'center',gap:8 }}>
        {busy ? <><Loader size={16} style={{ animation:'spin 1s linear infinite' }}/> Claiming…</> : <><ArrowDownToLine size={15}/> Claim token</>}
      </button>
    </Sheet>
  )
}

// ── LN Address sheet ───────────────────────────
function LnAddressSheet({ onClose, onSatsReceived }) {
  const nsec = localStorage.getItem('bitsoko_nsec')
  const [copied,   setCopied]   = useState(false)
  const [claimMsg, setClaimMsg] = useState('')

  const npubcash = useNpubcash({
    nsec:    nsec || '',
    enabled: !!nsec,
    onTokenClaimed: async (token, amount) => {
      setClaimMsg(`${amount} sats received`)
      onSatsReceived?.()
      setTimeout(() => setClaimMsg(''), 4000)
    }
  })

  const lnAddr = npubcash.lightningAddress
  const copy = async () => { if (!lnAddr) return; await navigator.clipboard.writeText(lnAddr); setCopied(true); setTimeout(()=>setCopied(false),2000) }

  return (
    <Sheet title="Lightning Address" onClose={onClose}>
      <div style={{ fontSize:13,color:C.muted,marginBottom:16,lineHeight:1.6 }}>
        Anyone can pay this address to send sats to your wallet. Auto-claimed when this page is open.
      </div>
      {npubcash.balance > 0 && (
        <div style={{ background:'rgba(247,147,26,0.08)',border:`1px solid rgba(247,147,26,0.3)`,borderRadius:12,padding:'12px 16px',marginBottom:16,display:'flex',alignItems:'center',gap:10 }}>
          <Loader size={14} color={C.orange} style={{ animation:'spin 1s linear infinite',flexShrink:0 }}/>
          <div>
            <div style={{ fontSize:12,fontWeight:600,color:C.ochre }}>Receiving {npubcash.balance} sats…</div>
            <div style={{ fontSize:11,color:C.muted }}>Auto-claiming from npub.cash</div>
          </div>
        </div>
      )}
      {claimMsg && (
        <div style={{ display:'flex',alignItems:'center',gap:8,padding:'10px 14px',borderRadius:10,background:'rgba(247,147,26,0.06)',border:`1px solid rgba(247,147,26,0.2)`,fontSize:12,color:C.ochre,marginBottom:12 }}>
          <CheckCircle size={13}/> {claimMsg}
        </div>
      )}
      {lnAddr ? (
        <>
          <div style={{ background:'rgba(247,147,26,0.08)',border:`1px solid rgba(247,147,26,0.3)`,borderRadius:12,padding:'14px 16px',marginBottom:16,wordBreak:'break-all',fontSize:13,fontWeight:600,color:C.black,textAlign:'center' }}>
            {lnAddr}
          </div>
          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(lnAddr)}&bgcolor=f7f4f0&color=1a1410&margin=10`}
            alt="LN Address QR" style={{ width:180,height:180,borderRadius:14,border:`1px solid ${C.border}`,display:'block',margin:'0 auto 16px' }}/>
          <button onClick={copy} style={{ width:'100%',padding:14,background:copied?C.green:C.black,border:'none',borderRadius:14,cursor:'pointer',fontSize:14,fontWeight:700,color:C.white,display:'flex',alignItems:'center',justifyContent:'center',gap:8,transition:'background 0.2s',marginBottom:12 }}>
            {copied ? <><Check size={16}/> Copied!</> : <><Copy size={16}/> Copy address</>}
          </button>
          <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',background:C.bg,borderRadius:10,border:`1px solid ${C.border}`,marginBottom:12 }}>
            <div style={{ display:'flex',alignItems:'center',gap:6 }}>
              <RotateCcw size={11} color={C.muted}/>
              <span style={{ fontSize:11,color:C.muted }}>{npubcash.loading ? 'Checking…' : 'Polls every 30s'}</span>
            </div>
            <button onClick={npubcash.refresh} disabled={npubcash.loading} style={{ background:'none',border:'none',cursor:'pointer',display:'flex' }}>
              <RefreshCw size={13} color={C.muted} style={{ animation:npubcash.loading?'spin 1s linear infinite':'none' }}/>
            </button>
          </div>
          <div style={{ padding:'12px 14px',background:C.bg,borderRadius:12,border:`1px solid ${C.border}`,fontSize:11,color:C.muted,lineHeight:1.6 }}>
            <CircleDollarSign size={11} style={{ display:'inline',verticalAlign:'middle',marginRight:4 }}/>
            Get a custom username at <strong style={{ color:C.black }}>npub.cash</strong> — e.g. <em>martin@npub.cash</em>
          </div>
        </>
      ) : (
        <div style={{ textAlign:'center',padding:'20px 0',color:C.muted,fontSize:13 }}>
          <WalletIcon size={28} color={C.border} style={{ display:'block',margin:'0 auto 10px' }}/>
          Log in with your Nostr key to get your Lightning address
        </div>
      )}
    </Sheet>
  )
}

// ── Mint settings ──────────────────────────────
function MintSettingsSheet({ onClose }) {
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
    <Sheet title="Mint settings" onClose={onClose}>
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
          style={{ width:'100%',padding:'11px 14px',background:C.bg,border:`1.5px solid ${newMint?C.black:C.border}`,borderRadius:12,outline:'none',fontSize:13,color:C.black,boxSizing:'border-box',marginBottom:8 }}/>
        {errMsg && <div style={{ fontSize:11,color:C.red,marginBottom:8 }}>{errMsg}</div>}
        <button onClick={addMint} style={{ width:'100%',padding:12,background:C.black,border:'none',borderRadius:12,cursor:'pointer',fontSize:13,fontWeight:700,color:C.white }}>Add mint</button>
      </div>
    </Sheet>
  )
}

// ── Main wallet ────────────────────────────────
function WalletInner() {
  const navigate = useNavigate()
  const rate     = useRate()  // ← live BTC/KES rate, polls every 60s

  const [balance,     setBalance]     = useState(0)
  const [history,     setHistory]     = useState([])
  const [showBalance, setShowBalance] = useState(true)
  const [sheet,       setSheet]       = useState(null)

  const reload = useCallback(() => {
    setBalance(getBalance())
    const { history: h } = getWalletData()
    setHistory(Array.isArray(h) ? h : [])
  }, [])

  useEffect(() => { reload() }, [reload])

  useEffect(() => {
    const pending = loadPendingQuote()
    if (pending && Date.now() / 1000 - pending.createdAt < 600) setSheet('mint')
  }, [])

  const nsec = localStorage.getItem('bitsoko_nsec')
  useNpubcash({
    nsec:    nsec || '',
    enabled: !!nsec,
    onTokenClaimed: async (token, amount) => {
      try {
        await receiveCashuToken(token)
        reload()
      } catch(e) {}
    }
  })

  const activeMint = (() => {
    try { return getWalletData().mints[0]?.replace('https://','') || DEFAULT_MINT_URL.replace('https://','') }
    catch { return DEFAULT_MINT_URL.replace('https://','') }
  })()

  return (
    <div style={{ background:C.bg,minHeight:'100vh',fontFamily:"'Inter',sans-serif",paddingBottom:100 }}>

      {/* Black header */}
      <div style={{ background:C.black,padding:'16px 20px 24px' }}>
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24 }}>
          <button onClick={()=>navigate(-1)} style={{ width:36,height:36,borderRadius:'50%',background:'rgba(255,255,255,0.1)',border:'none',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer' }}>
            <ArrowLeft size={17} color={C.white}/>
          </button>
          <span style={{ fontSize:16,fontWeight:700,color:C.white }}>Wallet</span>
          <button onClick={()=>setSheet('mintSettings')} style={{ width:36,height:36,borderRadius:'50%',background:'rgba(255,255,255,0.1)',border:'none',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer' }}>
            <Settings size={16} color={C.white}/>
          </button>
        </div>

        {/* Balance */}
        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:11,color:'rgba(255,255,255,0.4)',marginBottom:6,letterSpacing:'0.1em',textTransform:'uppercase' }}>Available balance</div>
          <div style={{ display:'flex',alignItems:'center',gap:10 }}>
            <div>
              {showBalance ? (
                <>
                  <div style={{ display:'flex',alignItems:'baseline',gap:6 }}>
                    <span style={{ fontSize:40,fontWeight:800,color:C.white,lineHeight:1 }}>{balance.toLocaleString()}</span>
                    <span style={{ fontSize:15,color:'rgba(255,255,255,0.4)' }}>sats</span>
                  </div>
                  <div style={{ fontSize:13,color:'rgba(255,255,255,0.4)',marginTop:4 }}>≈ {satsToKsh(balance, rate)}</div>
                </>
              ) : (
                <div style={{ fontSize:40,fontWeight:800,color:'rgba(255,255,255,0.2)',letterSpacing:4 }}>••••••</div>
              )}
            </div>
            <button onClick={()=>setShowBalance(s=>!s)} style={{ background:'none',border:'none',cursor:'pointer',padding:4 }}>
              {showBalance ? <EyeOff size={18} color="rgba(255,255,255,0.4)"/> : <Eye size={18} color="rgba(255,255,255,0.4)"/>}
            </button>
          </div>
        </div>

        {/* Two main action buttons */}
        <div style={{ display:'flex',gap:10 }}>
          <button onClick={()=>setSheet('receiveMenu')} style={{
            flex:1,padding:'14px 0',borderRadius:16,cursor:'pointer',
            background:'rgba(247,244,240,0.1)',border:'1px solid rgba(247,244,240,0.2)',
            display:'flex',alignItems:'center',justifyContent:'center',gap:8,
          }}>
            <ArrowDownToLine size={18} color="rgba(247,244,240,0.85)"/>
            <span style={{ fontSize:14,fontWeight:700,color:'rgba(247,244,240,0.85)' }}>Receive</span>
          </button>
          <button onClick={()=>setSheet('sendMenu')} style={{
            flex:1,padding:'14px 0',borderRadius:16,cursor:'pointer',
            background:'rgba(247,147,26,0.18)',border:'1px solid rgba(247,147,26,0.3)',
            display:'flex',alignItems:'center',justifyContent:'center',gap:8,
          }}>
            <ArrowUpFromLine size={18} color={C.orange}/>
            <span style={{ fontSize:14,fontWeight:700,color:C.orange }}>Send</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding:'16px 20px 0' }}>

        {/* Active mint */}
        <div style={{ background:C.white,borderRadius:12,border:`1px solid ${C.border}`,padding:'12px 14px',display:'flex',alignItems:'center',gap:10,marginBottom:20 }}>
          <div style={{ width:8,height:8,borderRadius:'50%',background:C.ochre,flexShrink:0 }}/>
          <div style={{ flex:1,minWidth:0 }}>
            <div style={{ fontSize:10,color:C.muted }}>Active mint</div>
            <div style={{ fontSize:12,fontWeight:600,color:C.black,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{activeMint}</div>
          </div>
          <button onClick={()=>setSheet('mintSettings')} style={{ background:'none',border:'none',cursor:'pointer',display:'flex' }}>
            <ChevronRight size={15} color={C.muted}/>
          </button>
        </div>

        {/* Transactions */}
        <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:14 }}>
          <TrendingUp size={15} color={C.ochre}/>
          <span style={{ fontSize:15,fontWeight:700,color:C.black }}>Transactions</span>
          <button onClick={reload} style={{ marginLeft:'auto',background:'none',border:'none',cursor:'pointer',display:'flex' }}>
            <RefreshCw size={14} color={C.muted}/>
          </button>
        </div>

        {history.length === 0 && (
          <div style={{ textAlign:'center',padding:'40px 20px' }}>
            <Banknote size={36} color={C.border} style={{ margin:'0 auto 12px',display:'block' }}/>
            <div style={{ fontSize:14,fontWeight:600,color:C.black,marginBottom:4 }}>No transactions yet</div>
            <div style={{ fontSize:12,color:C.muted }}>Add funds to get started</div>
          </div>
        )}

        {history.map((tx, i) => {
          const cfg    = TX_CONFIG[tx.type] || TX_CONFIG[4]
          const TxIcon = cfg.Icon
          return (
            <div key={i} style={{ display:'flex',alignItems:'center',gap:12,padding:'12px 0',borderBottom:`1px solid ${C.bg}` }}>
              <div style={{ width:38,height:38,borderRadius:10,background:`${cfg.color}12`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
                <TxIcon size={16} color={cfg.color}/>
              </div>
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ fontSize:13,fontWeight:600,color:C.black,marginBottom:2 }}>{tx.label || cfg.label}</div>
                <div style={{ fontSize:11,color:C.muted }}>{timeAgo(tx.date)}</div>
              </div>
              <div style={{ textAlign:'right',flexShrink:0 }}>
                <div style={{ fontSize:13,fontWeight:700,color:cfg.debit?C.orange:C.black }}>
                  {cfg.debit?'−':'+'}{(tx.amount||0).toLocaleString()} sats
                </div>
                <div style={{ fontSize:10,color:C.muted }}>{satsToKsh(tx.amount||0, rate)}</div>
              </div>
            </div>
          )
        })}

        <div style={{ marginTop:20,padding:'12px 14px',background:C.white,borderRadius:12,border:`1px solid ${C.border}` }}>
          <div style={{ display:'flex',alignItems:'flex-start',gap:8 }}>
            <AlertCircle size={13} color={C.muted} style={{ flexShrink:0,marginTop:1 }}/>
            <div style={{ fontSize:11,color:C.muted,lineHeight:1.6 }}>
              Cashu tokens stored locally. Your balance is private — the mint cannot track you.
            </div>
          </div>
        </div>
      </div>

      {sheet === 'receiveMenu'  && <ReceiveMenuSheet  onClose={()=>setSheet(null)} onSelect={k=>setSheet(k)}/>}
      {sheet === 'sendMenu'     && <SendMenuSheet     onClose={()=>setSheet(null)} onSelect={k=>setSheet(k)}/>}
      {sheet === 'mint'         && <MintSheet         onClose={()=>{ setSheet(null); reload() }} onSuccess={reload} rate={rate}/>}
      {sheet === 'pay'          && <PaySheet          onClose={()=>setSheet(null)} onSuccess={reload} rate={rate}/>}
      {sheet === 'send'         && <SendSheet         onClose={()=>{ setSheet(null); reload() }}/>}
      {sheet === 'receive'      && <ReceiveSheet      onClose={()=>setSheet(null)} onSuccess={reload}/>}
      {sheet === 'lnaddress'    && <LnAddressSheet    onClose={()=>setSheet(null)} onSatsReceived={reload}/>}
      {sheet === 'mintSettings' && <MintSettingsSheet onClose={()=>{ setSheet(null); reload() }}/>}

      <style>{`
        @keyframes spin    { to { transform: rotate(360deg) } }
        @keyframes sheetUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
      `}</style>
    </div>
  )
}

export default function Wallet() {
  return <WalletErrorBoundary><WalletInner/></WalletErrorBoundary>
}

