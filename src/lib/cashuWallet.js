// ─────────────────────────────────────────────
// cashuWallet.js — Bitsoko Cashu wallet logic
// Adapted from SatoshiPay (github.com/Codepocketdev/satoshi-pay-wallet)
// Requires: @cashu/cashu-ts@2.7.4 (exact)
// ─────────────────────────────────────────────

import { CashuMint, CashuWallet, getEncodedToken, getDecodedToken } from '@cashu/cashu-ts'

export const DEFAULT_MINT_URL  = 'https://mint.minibits.cash/Bitcoin'
export const BITSOKO_FEE_LUD16 = 'hodlcurator@blink.sv'
export const BITSOKO_FEE_PCT   = 0.02
export const BITSOKO_MIN_FEE   = 1

// ── Storage ────────────────────────────────────
export function getWalletData() {
  try {
    const mints   = JSON.parse(localStorage.getItem('bitsoko_wallet_mints')   || '[]')
    const tokens  = JSON.parse(localStorage.getItem('bitsoko_wallet_tokens')  || '[]')
    const history = JSON.parse(localStorage.getItem('bitsoko_wallet_history') || '[]')
    return {
      mints:   mints.length   ? mints   : [DEFAULT_MINT_URL],
      tokens:  Array.isArray(tokens)  ? tokens  : [],
      history: Array.isArray(history) ? history : [],
    }
  } catch {
    return { mints: [DEFAULT_MINT_URL], tokens: [], history: [] }
  }
}

export function saveTokens(tokens) {
  localStorage.setItem('bitsoko_wallet_tokens', JSON.stringify(tokens))
}

export function saveMints(mints) {
  localStorage.setItem('bitsoko_wallet_mints', JSON.stringify(mints))
}

function addHistory(entry) {
  try {
    const { history } = getWalletData()
    localStorage.setItem('bitsoko_wallet_history', JSON.stringify([entry, ...history]))
  } catch {}
}

export function getBalance() {
  try {
    return getWalletData().tokens.reduce((s, p) => s + (p.amount || 0), 0)
  } catch { return 0 }
}

// ── Create wallet — SatoshiPay useWallet.js pattern ──
// new CashuWallet(mint, { unit }) then await wallet.getKeys()
async function createWallet(mintUrl) {
  const url    = mintUrl || getWalletData().mints[0] || DEFAULT_MINT_URL
  const mint   = new CashuMint(url)
  const wallet = new CashuWallet(mint, { unit: 'sat' })
  await wallet.getKeys()
  return { wallet, mint, url }
}

// ── MINT ───────────────────────────────────────
// SatoshiPay: wallet.mint.createMintQuote({ amount, unit })
export async function createMintInvoice(amountSats, mintUrl) {
  const { wallet, url } = await createWallet(mintUrl)
  const mintQuote = await wallet.mint.createMintQuote({ amount: amountSats, unit: 'sat' })
  return { invoice: mintQuote.request, hash: mintQuote.quote, wallet, amountSats, mintUrl: url }
}

export function pollMintQuote(wallet, amountSats, hash, mintUrl, onPaid, onError) {
  let retries = 0
  let stopped = false

  const poll = async () => {
    if (stopped) return
    try {
      const mintQuote = await wallet.mint.checkMintQuote(hash)
      if (mintQuote.state === 'PAID' || mintQuote.state === 'ISSUED') {
        const proofs = await wallet.mintProofs(amountSats, hash)
        if (proofs?.length > 0) {
          const { tokens } = getWalletData()
          saveTokens([...tokens, ...proofs])
          addHistory({ type: 3, amount: amountSats, date: Math.floor(Date.now() / 1000) })
          onPaid?.(proofs)
          return
        }
      }
      retries++
      if (retries < 60 && !stopped) setTimeout(poll, 2000)
      else if (!stopped) onError?.('Invoice expired.')
    } catch(e) {
      retries++
      if (retries < 60 && !stopped) setTimeout(poll, 2000)
      else if (!stopped) onError?.(e.message || 'Mint failed')
    }
  }

  poll()
  return () => { stopped = true }
}

// ── PAY ────────────────────────────────────────
// SatoshiPay SendViaLightning: createMeltQuote → send → meltProofs → check PAID
export async function payLightningInvoice(invoiceString, mintUrl) {
  const { wallet } = await createWallet(mintUrl)
  const { tokens } = getWalletData()

  const meltQuote = await wallet.createMeltQuote(invoiceString)
  const total     = meltQuote.amount + meltQuote.fee_reserve

  if (tokens.reduce((s, p) => s + p.amount, 0) < total)
    throw new Error(`Insufficient balance. Need ${total} sats`)

  const sendResult   = await wallet.send(total, tokens)
  const proofsToKeep = sendResult.keep || []
  const proofsToSend = sendResult.send || []

  if (!proofsToSend.length) throw new Error('Failed to prepare proofs')

  const meltResponse = await wallet.meltProofs(meltQuote, proofsToSend)
  if (!meltResponse?.quote || meltResponse.quote.state !== 'PAID')
    throw new Error('Payment failed at the mint')

  const change  = meltResponse.change || []
  const newToks = [...proofsToKeep, ...change]
  const spent   = tokens.reduce((s, p) => s + p.amount, 0)
  const kept    = newToks.reduce((s, p) => s + p.amount, 0)

  saveTokens(newToks)
  addHistory({ type: 4, amount: spent - kept, date: Math.floor(Date.now() / 1000) })
  return { success: true }
}

export async function getMeltFeeEstimate(invoiceString, mintUrl) {
  try {
    const { wallet } = await createWallet(mintUrl)
    const q = await wallet.createMeltQuote(invoiceString)
    return q.fee_reserve || 0
  } catch { return 0 }
}

// ── SEND ───────────────────────────────────────
// SatoshiPay SendViaEcash: wallet.send → { send, keep } → getEncodedToken
export async function sendCashuToken(amountSats, mintUrl) {
  const { wallet, url } = await createWallet(mintUrl)
  const { tokens }      = getWalletData()

  if (tokens.reduce((s, p) => s + p.amount, 0) < amountSats)
    throw new Error('Insufficient balance')

  const result = await wallet.send(amountSats, tokens)
  const keep   = result.keep || []
  const send   = result.send || []

  if (!send.length) throw new Error('Failed to create send proofs')

  const tokenString = getEncodedToken({ mint: url, proofs: send })
  saveTokens(keep)
  addHistory({ type: 2, amount: amountSats, date: Math.floor(Date.now() / 1000) })
  return tokenString
}

// ── RECEIVE ────────────────────────────────────
// SatoshiPay ReceivePage: getDecodedToken → wallet.receive(token, { counter, proofsWeHave })
export async function receiveCashuToken(tokenString) {
  const { tokens } = getWalletData()

  // Strip cashu: / cashu:// / web+cashu:// prefixes
  let tokenToDecode = tokenString.trim()
  if (tokenToDecode.toLowerCase().startsWith('cashu')) {
    if (tokenToDecode.startsWith('cashu:')) {
      tokenToDecode = tokenToDecode.substring(6)
      if (tokenToDecode.startsWith('//')) tokenToDecode = tokenToDecode.substring(2)
    } else {
      tokenToDecode = tokenToDecode.substring(5)
    }
  }

  const decoded = getDecodedToken(tokenToDecode)
  let tokenMintUrl

  if (decoded.token && Array.isArray(decoded.token)) {
    tokenMintUrl = decoded.token[0]?.mint      // V3
  } else if (decoded.mint) {
    tokenMintUrl = decoded.mint                // V4
  } else if (Array.isArray(decoded)) {
    tokenMintUrl = decoded[0]?.mint
  }

  if (!tokenMintUrl) throw new Error('Could not find mint URL in token')

  const mint   = new CashuMint(tokenMintUrl)
  const wallet = new CashuWallet(mint, { unit: 'sat' })
  await wallet.getKeys()

  // Don't pass counter/proofsWeHave — requires bip39seed which we don't have
  // Simple receive works fine without deterministic blinding
  const receivedProofs = await wallet.receive(tokenToDecode)

  if (!receivedProofs?.length) throw new Error('Token already claimed or invalid')

  const amount = receivedProofs.reduce((s, p) => s + p.amount, 0)
  saveTokens([...tokens, ...receivedProofs])

  const { mints } = getWalletData()
  if (!mints.includes(tokenMintUrl)) saveMints([...mints, tokenMintUrl])

  addHistory({ type: 1, amount, date: Math.floor(Date.now() / 1000) })
  return amount
}

// ── LNURL-pay ──────────────────────────────────
export async function fetchLnurlInvoice(lud16, amountSats) {
  if (!lud16?.includes('@')) throw new Error('Invalid Lightning address')
  const [user, domain] = lud16.split('@')
  const res  = await fetch(`https://${domain}/.well-known/lnurlp/${user}`)
  if (!res.ok) throw new Error(`Could not reach ${domain}`)
  const data = await res.json()
  if (data.status === 'ERROR') throw new Error(data.reason || 'LNURL error')
  const cbUrl = new URL(data.callback)
  cbUrl.searchParams.set('amount', (amountSats * 1000).toString())
  const cbRes  = await fetch(cbUrl.toString())
  const cbData = await cbRes.json()
  if (!cbData.pr) throw new Error('No invoice returned')
  return cbData.pr
}

// ── PURCHASE WITH FEE SPLIT ────────────────────
export async function purchaseWithFeeSplit({ sellerLud16, totalSats, mintUrl, productName = 'Product' }) {
  if (!sellerLud16) throw new Error('Seller has no Lightning address')
  const feeSats    = Math.max(BITSOKO_MIN_FEE, Math.floor(totalSats * BITSOKO_FEE_PCT))
  const sellerSats = totalSats - feeSats

  const [sellerInvoice, feeInvoice] = await Promise.all([
    fetchLnurlInvoice(sellerLud16, sellerSats),
    fetchLnurlInvoice(BITSOKO_FEE_LUD16, feeSats).catch(() => null),
  ])

  await payLightningInvoice(sellerInvoice, mintUrl)
  if (feeInvoice) payLightningInvoice(feeInvoice, mintUrl).catch(() => {})

  addHistory({ type: 5, amount: totalSats, label: productName, date: Math.floor(Date.now() / 1000) })
  return { success: true, sellerSats, feeSats }
}

export function clearWallet() {
  localStorage.removeItem('bitsoko_wallet_tokens')
  localStorage.removeItem('bitsoko_wallet_history')
}

