// Wallet.jsx — main wallet page
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Zap, RefreshCw, ArrowDownToLine, ArrowUpFromLine,
  Banknote, Eye, EyeOff, TrendingUp, ChevronRight,
  Settings, Shield,
} from 'lucide-react'
import { useNpubcash } from '../hooks/useNpubcash'
import { satsToKsh, useRate } from '../lib/rates'
import { getWalletData, getBalance, DEFAULT_MINT_URL, receiveCashuToken } from '../lib/cashuWallet'
import { WalletErrorBoundary, ReceiveMenuSheet, SendMenuSheet, MintSheet, PaySheet, SendSheet, ReceiveSheet, LnAddressSheet } from './WalletSheets'
import { WalletSettingsPage } from './WalletSettings'
import { C, TX_CONFIG, timeAgo, loadPendingQuote } from './walletConstants'

function WalletInner() {
  const navigate = useNavigate()
  const rate     = useRate()

  const [balance,     setBalance]     = useState(0)
  const [history,     setHistory]     = useState([])
  const [showBalance, setShowBalance] = useState(true)
  const [sheet,       setSheet]       = useState(null)
  const [showSettings,setShowSettings]= useState(false)

  const reload = useCallback(() => {
    setBalance(getBalance())
    const { history: h } = getWalletData()
    setHistory(Array.isArray(h) ? h : [])
  }, [])

  useEffect(() => { reload() }, [reload])

  // Listen for background LN claims from App.jsx global listener
  useEffect(() => {
    const handler = () => reload()
    window.addEventListener('bitsoko_wallet_update', handler)
    return () => window.removeEventListener('bitsoko_wallet_update', handler)
  }, [reload])

  useEffect(() => {
    const pending = loadPendingQuote()
    if (pending && Date.now() / 1000 - pending.createdAt < 600) setSheet('mint')
  }, [])

  const nsec = localStorage.getItem('bitsoko_nsec')
  useNpubcash({
    nsec:    nsec || '',
    enabled: !!nsec,
    onTokenClaimed: async (token, amount) => {
      try { await receiveCashuToken(token); reload() } catch {}
    }
  })

  const activeMint = (() => {
    try { return getWalletData().mints[0]?.replace('https://','') || DEFAULT_MINT_URL.replace('https://','') }
    catch { return DEFAULT_MINT_URL.replace('https://','') }
  })()

  if (showSettings) return (
    <WalletErrorBoundary>
      <WalletSettingsPage onClose={() => setShowSettings(false)} onReload={reload}/>
    </WalletErrorBoundary>
  )

  return (
    <div style={{ background:C.bg,minHeight:'100vh',fontFamily:"'Inter',sans-serif",paddingBottom:100 }}>

      {/* Black header */}
      <div style={{ background:C.black,padding:'16px 20px 24px' }}>
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24 }}>
          <button onClick={()=>navigate(-1)} style={{ width:36,height:36,borderRadius:'50%',background:'rgba(255,255,255,0.1)',border:'none',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer' }}>
            <ArrowLeft size={17} color={C.white}/>
          </button>
          <span style={{ fontSize:16,fontWeight:700,color:C.white }}>Wallet</span>
          <button onClick={()=>setShowSettings(true)} style={{ width:36,height:36,borderRadius:'50%',background:'rgba(255,255,255,0.1)',border:'none',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer' }}>
            <Settings size={16} color={C.white}/>
          </button>
        </div>

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

        <div style={{ display:'flex',gap:10 }}>
          <button onClick={()=>setSheet('receiveMenu')} style={{ flex:1,padding:'14px 0',borderRadius:16,cursor:'pointer',background:'rgba(247,244,240,0.1)',border:'1px solid rgba(247,244,240,0.2)',display:'flex',alignItems:'center',justifyContent:'center',gap:8 }}>
            <ArrowDownToLine size={18} color="rgba(247,244,240,0.85)"/>
            <span style={{ fontSize:14,fontWeight:700,color:'rgba(247,244,240,0.85)' }}>Receive</span>
          </button>
          <button onClick={()=>setSheet('sendMenu')} style={{ flex:1,padding:'14px 0',borderRadius:16,cursor:'pointer',background:'rgba(247,147,26,0.18)',border:'1px solid rgba(247,147,26,0.3)',display:'flex',alignItems:'center',justifyContent:'center',gap:8 }}>
            <ArrowUpFromLine size={18} color={C.orange}/>
            <span style={{ fontSize:14,fontWeight:700,color:C.orange }}>Send</span>
          </button>
        </div>
      </div>

      <div style={{ padding:'16px 20px 0' }}>
        <div style={{ background:C.white,borderRadius:12,border:`1px solid ${C.border}`,padding:'12px 14px',display:'flex',alignItems:'center',gap:10,marginBottom:20 }}>
          <div style={{ width:8,height:8,borderRadius:'50%',background:C.ochre,flexShrink:0 }}/>
          <div style={{ flex:1,minWidth:0 }}>
            <div style={{ fontSize:10,color:C.muted }}>Active mint</div>
            <div style={{ fontSize:12,fontWeight:600,color:C.black,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{activeMint}</div>
          </div>
          <button onClick={()=>setShowSettings(true)} style={{ background:'none',border:'none',cursor:'pointer',display:'flex' }}>
            <ChevronRight size={15} color={C.muted}/>
          </button>
        </div>

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
          const cfg = TX_CONFIG[tx.type] || TX_CONFIG[4]
          return (
            <div key={i} style={{ display:'flex',alignItems:'center',gap:12,padding:'12px 0',borderBottom:`1px solid ${C.bg}` }}>
              <div style={{ width:38,height:38,borderRadius:10,background:`${cfg.color}18`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
                <Zap size={16} color={cfg.color}/>
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
            <Shield size={13} color={C.muted} style={{ flexShrink:0,marginTop:1 }}/>
            <div style={{ fontSize:11,color:C.muted,lineHeight:1.6 }}>
              Proofs are backed by your seed phrase — restoreable on any device via Wallet Settings.
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

