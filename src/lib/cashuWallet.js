// ─────────────────────────────────────────────
// cashuWallet.js — Bitsoko Cashu wallet logic
// Adapted from SatoshiPay (github.com/Codepocketdev/satoshi-pay-wallet)
// Requires: @cashu/cashu-ts@2.7.4 (exact)
// ─────────────────────────────────────────────

import { CashuMint, CashuWallet, getEncodedToken, getDecodedToken, CheckStateEnum } from '@cashu/cashu-ts'
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'

export const DEFAULT_MINT_URL  = 'https://mint.minibits.cash/Bitcoin'
export const BITSOKO_FEE_LUD16 = 'hodlcurator@blink.sv'
export const BITSOKO_FEE_PCT   = 0.02
export const BITSOKO_MIN_FEE   = 1

const SEED_KEY = 'bitsoko_wallet_seed'

// ── Seed management ────────────────────────────
// Generates a 12-word mnemonic on first use — stored in localStorage
// Proofs are now deterministic: restoreable from seed on any device
export function getOrCreateSeed() {
  let seed = localStorage.getItem(SEED_KEY)
  if (!seed) {
    seed = generateMnemonic(wordlist, 128) // 12 words
    localStorage.setItem(SEED_KEY, seed)
  }
  return seed
}

export function getSeed() {
  return localStorage.getItem(SEED_KEY) || null
}

export function validateSeedPhrase(phrase) {
  return validateMnemonic(phrase.trim().toLowerCase().replace(/\s+/g, ' '), wordlist)
}

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

// ── Create wallet — with bip39seed for deterministic proofs ──
// Proofs created with bip39seed are restoreable from the seed phrase
async function createWallet(mintUrl) {
  const url      = mintUrl || getWalletData().mints[0] || DEFAULT_MINT_URL
  const mint     = new CashuMint(url)
  const mnemonic = getOrCreateSeed()
  const bip39seed = mnemonicToSeedSync(mnemonic)
  const wallet   = new CashuWallet(mint, { unit: 'sat', bip39seed })
  await wallet.getKeys()
  return { wallet, mint, url }
}

// ── Export wallet token ────────────────────────
// Encodes ALL current proofs as a cashuA token — paste anywhere to restore
export function exportWalletToken() {
  const { tokens, mints } = getWalletData()
  if (!tokens.length) throw new Error('No proofs to export')
  const mintUrl = mints[0] || DEFAULT_MINT_URL
  return getEncodedToken({ mint: mintUrl, proofs: tokens })
}

// ── Restore wallet from seed ───────────────────
// Ports SatoshiPay handleRestoreWallet exactly
// progressCallback(mintUrl, status, data) — status: 'scanning' | 'done' | 'error'
export async function restoreWallet(mnemonic, mintUrls, progressCallback) {
  const cleanMnemonic = mnemonic.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!validateMnemonic(cleanMnemonic, wordlist)) throw new Error('Invalid recovery phrase')

  const bip39seed  = mnemonicToSeedSync(cleanMnemonic)
  const BATCH_SIZE = 200
  const MAX_EMPTY  = 2

  let totalSats   = 0
  let totalProofs = 0
  const allTokens = []

  for (const mintUrl of mintUrls) {
    try {
      progressCallback(mintUrl, 'scanning', { message: 'Connecting to mint…' })

      const mint       = new CashuMint(mintUrl)
      const scanWallet = new CashuWallet(mint, { bip39seed, unit: 'sat' })

      let info
      try { info = await mint.getInfo() } catch { info = {} }

      const supportsRestore = info?.nuts?.['9']?.supported || info?.nuts?.['7']?.supported
      if (!supportsRestore) {
        progressCallback(mintUrl, 'done', { message: 'Mint does not support restore', totalSats: 0, proofCount: 0 })
        continue
      }

      const keysetsData = await mint.getKeySets()
      const keysets     = keysetsData.keysets || []
      let mintSats   = 0
      let mintProofs = 0

      for (const keyset of keysets) {
        try {
          progressCallback(mintUrl, 'scanning', { message: `Scanning keyset ${keyset.id.slice(0, 12)}…` })

          const kWallet = new CashuWallet(mint, { bip39seed, unit: keyset.unit || 'sat' })
          let start = 0, emptyCount = 0, restoreProofs = []

          while (emptyCount < MAX_EMPTY) {
            let proofs = []
            try {
              const res = await kWallet.restore(start, BATCH_SIZE, { keysetId: keyset.id })
              proofs = res?.proofs || []
            } catch { proofs = [] }

            if (!proofs.length) { emptyCount++ }
            else { restoreProofs = restoreProofs.concat(proofs); emptyCount = 0 }
            start += BATCH_SIZE
          }

          if (restoreProofs.length > 0) {
            progressCallback(mintUrl, 'scanning', { message: `Checking ${restoreProofs.length} proofs…` })

            let unspent = []
            for (let i = 0; i < restoreProofs.length; i += BATCH_SIZE) {
              const batch  = restoreProofs.slice(i, i + BATCH_SIZE)
              const states = await kWallet.checkProofsStates(batch)
              const unspentProofs = batch.filter((_, j) =>
                states[j]?.state === CheckStateEnum.UNSPENT
              )
              unspent = unspent.concat(unspentProofs)
            }

            if (unspent.length > 0) {
              const amount = unspent.reduce((s, p) => s + p.amount, 0)
              mintSats   += amount
              mintProofs += unspent.length
              const token = getEncodedToken({ mint: mintUrl, proofs: unspent })
              allTokens.push({ mint: mintUrl, token, amount, proofCount: unspent.length })
            }
          }
        } catch(e) { console.warn('[bitsoko] keyset scan error:', e.message) }
      }

      progressCallback(mintUrl, 'done', {
        message:    mintSats > 0 ? `Found ${mintSats} sats` : 'No tokens found',
        totalSats:  mintSats,
        proofCount: mintProofs,
      })

      totalSats   += mintSats
      totalProofs += mintProofs
    } catch(e) {
      progressCallback(mintUrl, 'error', { message: e.message, totalSats: 0, proofCount: 0 })
    }
  }

  return { tokens: allTokens, totalSats, totalProofs }
}

// ── MINT ───────────────────────────────────────
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
export async function receiveCashuToken(tokenString) {
  const { tokens } = getWalletData()

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
    tokenMintUrl = decoded.token[0]?.mint
  } else if (decoded.mint) {
    tokenMintUrl = decoded.mint
  } else if (Array.isArray(decoded)) {
    tokenMintUrl = decoded[0]?.mint
  }

  if (!tokenMintUrl) throw new Error('Could not find mint URL in token')

  const mint   = new CashuMint(tokenMintUrl)
  const wallet = new CashuWallet(mint, { unit: 'sat' })
  await wallet.getKeys()

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

  const { wallet } = await createWallet(mintUrl)
  const { tokens } = getWalletData()
  const balance    = tokens.reduce((s, p) => s + p.amount, 0)

  if (balance < totalSats) throw new Error(`Need ${totalSats} sats, wallet has ${balance}`)

  // Step 1: Pay our 2% fee FIRST
  const feeSats = Math.floor(totalSats * BITSOKO_FEE_PCT)

  if (feeSats >= 1) {
    try {
      const feeInvoice   = await fetchLnurlInvoice(BITSOKO_FEE_LUD16, feeSats)
      const feeMeltQuote = await wallet.createMeltQuote(feeInvoice)
      const feeNeeded    = feeMeltQuote.amount + feeMeltQuote.fee_reserve
      const { send: feeProofs, keep: feeKeep } = await wallet.send(feeNeeded, tokens)
      saveTokens(feeKeep || [])
      const feeMelt = await wallet.meltProofs(feeMeltQuote, feeProofs)
      const { tokens: afterFee } = getWalletData()
      saveTokens([...afterFee, ...(feeMelt?.change || [])])
    } catch(e) {
      console.warn('[bitsoko] fee payment failed:', e.message)
    }
  }

  // Step 2: Pay seller from remaining balance
  const { tokens: remaining } = getWalletData()
  const remainingBal = remaining.reduce((s, p) => s + p.amount, 0)
  if (remainingBal < 1) throw new Error('Insufficient balance for seller payment')

  const dummyInvoice   = await fetchLnurlInvoice(sellerLud16, remainingBal)
  const dummyQuote     = await wallet.createMeltQuote(dummyInvoice)
  const sellerAmount   = remainingBal - dummyQuote.fee_reserve
  if (sellerAmount < 1) throw new Error('Amount too low after routing fee')

  const sellerInvoice   = await fetchLnurlInvoice(sellerLud16, sellerAmount)
  const sellerMeltQuote = await wallet.createMeltQuote(sellerInvoice)
  const sellerNeeded    = sellerMeltQuote.amount + sellerMeltQuote.fee_reserve

  const { send: sellerProofs, keep: sellerKeep } = await wallet.send(sellerNeeded, remaining)
  if (!sellerProofs?.length) throw new Error('Failed to prepare proofs')
  saveTokens(sellerKeep || [])

  const sellerMelt = await wallet.meltProofs(sellerMeltQuote, sellerProofs)
  if (!sellerMelt?.quote || sellerMelt.quote.state !== 'PAID') {
    const { tokens: cur } = getWalletData()
    saveTokens([...cur, ...sellerProofs])
    throw new Error('Seller payment failed')
  }

  const { tokens: afterSeller } = getWalletData()
  saveTokens([...afterSeller, ...(sellerMelt.change || [])])

  addHistory({ type: 5, amount: totalSats, label: productName, date: Math.floor(Date.now() / 1000) })
  return { success: true, sellerSats: sellerAmount, feeSats }
}

export function clearWallet() {
  localStorage.removeItem('bitsoko_wallet_tokens')
  localStorage.removeItem('bitsoko_wallet_history')
}

