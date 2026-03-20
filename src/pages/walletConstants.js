// walletConstants.js — shared colors, helpers and Sheet wrapper
export const C = {
  bg:      '#f7f4f0',
  white:   '#ffffff',
  black:   '#1a1410',
  muted:   '#b0a496',
  border:  '#e8e0d5',
  orange:  '#f7931a',
  ochre:   '#c8860a',
  red:     '#ef4444',
  green:   '#22c55e',
}

export const TX_CONFIG = {
  1: { label:'Token received',  color:'#c8860a', debit:false },
  2: { label:'Token sent',      color:'#f7931a', debit:true  },
  3: { label:'Minted',          color:'#c8860a', debit:false },
  4: { label:'Paid invoice',    color:'#f7931a', debit:true  },
  5: { label:'Purchase',        color:'#f7931a', debit:true  },
}

export const PENDING_QUOTE_KEY = 'bitsoko_pending_mint_quote'

export function timeAgo(ts) {
  const s = Math.floor(Date.now() / 1000) - ts
  if (s < 3600)  return `${Math.floor(s/60)}m ago`
  if (s < 86400) return `${Math.floor(s/3600)}h ago`
  if (s < 86400*7) return `${Math.floor(s/86400)}d ago`
  return new Date(ts*1000).toLocaleDateString('en',{month:'short',day:'numeric'})
}

export function isLightningAddress(str) {
  if (!str) return false
  const parts = str.trim().split('@')
  return parts.length === 2 && parts[0].length > 0 && parts[1].includes('.')
}

export function savePendingQuote(data) { try { localStorage.setItem(PENDING_QUOTE_KEY, JSON.stringify(data)) } catch {} }
export function loadPendingQuote()     { try { const d = localStorage.getItem(PENDING_QUOTE_KEY); return d ? JSON.parse(d) : null } catch { return null } }
export function clearPendingQuote()    { try { localStorage.removeItem(PENDING_QUOTE_KEY) } catch {} }

