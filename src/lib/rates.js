// ─────────────────────────────────────────────
// rates.js — Live BTC/KES rate
// Primary:   Kraken  (BTC/USDT + USD/KES)
// Secondary: Binance (BTC/USDT + USD/KES)
// Tertiary:  CoinGecko (direct BTC/KES)
// Cache:     localStorage — survives refresh
// Fallback:  last known → hardcoded 13M
// Polls:     every 60s
// ─────────────────────────────────────────────

import { useState, useEffect } from 'react'

const CACHE_KEY     = 'bitsoko_btc_kes_rate'
const FALLBACK_RATE = 13_000_000
const POLL_INTERVAL = 60_000

// ── Cache ─────────────────────────────────────
function saveCache(rate, source) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      rate, source, ts: Date.now(),
    }))
  } catch {}
}

export function getRate() {
  try {
    const c = localStorage.getItem(CACHE_KEY)
    if (!c) return FALLBACK_RATE
    return JSON.parse(c).rate || FALLBACK_RATE
  } catch { return FALLBACK_RATE }
}

export function getRateInfo() {
  try {
    const c = localStorage.getItem(CACHE_KEY)
    if (!c) return { rate: FALLBACK_RATE, source: 'fallback', ts: null }
    return JSON.parse(c)
  } catch { return { rate: FALLBACK_RATE, source: 'fallback', ts: null } }
}

// ── Kraken — primary ──────────────────────────
async function fetchKraken() {
  const [btcRes, fxRes] = await Promise.all([
    fetch('https://api.kraken.com/0/public/Ticker?pair=XBTUSDT'),
    fetch('https://api.exchangerate-api.com/v4/latest/USD'),
  ])
  const btcData = await btcRes.json()
  const fxData  = await fxRes.json()
  if (btcData.error?.length) throw new Error(btcData.error[0])
  const pair   = Object.keys(btcData.result)[0]
  const btcUsd = parseFloat(btcData.result[pair]?.c?.[0])
  const usdKes = fxData?.rates?.KES
  if (!btcUsd || !usdKes) throw new Error('Invalid rate')
  return Math.round(btcUsd * usdKes)
}

// ── Binance — secondary ───────────────────────
async function fetchBinance() {
  const [btcRes, fxRes] = await Promise.all([
    fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT'),
    fetch('https://api.exchangerate-api.com/v4/latest/USD'),
  ])
  const btcData = await btcRes.json()
  const fxData  = await fxRes.json()
  const btcUsd  = parseFloat(btcData?.price)
  const usdKes  = fxData?.rates?.KES
  if (!btcUsd || !usdKes) throw new Error('Invalid rate')
  return Math.round(btcUsd * usdKes)
}

// ── CoinGecko — tertiary ──────────────────────
async function fetchCoinGecko() {
  const res  = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=kes')
  const data = await res.json()
  const rate = data?.bitcoin?.kes
  if (!rate || rate <= 0) throw new Error('Invalid rate')
  return rate
}

// ── Main fetch — waterfall ────────────────────
const SOURCES = [
  { name: 'Kraken',    fn: fetchKraken    },
  { name: 'Binance',   fn: fetchBinance   },
  { name: 'CoinGecko', fn: fetchCoinGecko },
]

export async function fetchRate() {
  for (const { name, fn } of SOURCES) {
    try {
      const rate = await fn()
      saveCache(rate, name)
      return rate
    } catch(e) {
      console.warn(`[bitsoko] ${name} failed:`, e.message)
    }
  }
  console.warn('[bitsoko] All rate sources failed — using cached/fallback')
  return getRate()
}

// ── satsToKsh — drop-in for all pages ─────────
export function satsToKsh(sats, rate) {
  const r   = rate || getRate()
  const ksh = (sats / 100_000_000) * r
  if (ksh >= 1_000_000) return `KSh ${(ksh / 1_000_000).toFixed(2)}M`
  if (ksh >= 1000)      return `KSh ${(ksh / 1000).toFixed(1)}k`
  return `KSh ${Math.round(ksh)}`
}

// ── useRate hook — polls every 60s ────────────
export function useRate() {
  const [rate, setRate] = useState(getRate)

  useEffect(() => {
    let mounted = true

    const poll = async () => {
      const r = await fetchRate()
      if (mounted) setRate(r)
    }

    poll()
    const interval = setInterval(poll, POLL_INTERVAL)
    return () => { mounted = false; clearInterval(interval) }
  }, [])

  return rate
}
