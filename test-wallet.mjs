import { CashuMint, CashuWallet, getEncodedToken, getDecodedToken } from '@cashu/cashu-ts'

const MINT_URL  = 'https://mint.npub.cash'
const FEE_LUD16 = 'hodlcurator@blink.sv'

console.log('\n── Test 1: Import ──')
console.log('CashuMint:', typeof CashuMint)
console.log('CashuWallet:', typeof CashuWallet)
console.log('getEncodedToken:', typeof getEncodedToken)
console.log('getDecodedToken:', typeof getDecodedToken)

console.log('\n── Test 2: Wallet instance ──')
const wallet = new CashuWallet(new CashuMint(MINT_URL))
console.log('Wallet created:', !!wallet)

console.log('\n── Test 3: Mint info ──')
try {
  const mint = new CashuMint(MINT_URL)
  const info = await mint.getInfo()
  console.log('Mint name:', info.name)
} catch(e) { console.log('FAILED:', e.message) }

console.log('\n── Test 4: Create mint quote (100 sats) ──')
try {
  const result = await wallet.createMintQuote(100)
  console.log('Invoice:', result.request.slice(0,50) + '...')
  console.log('Quote:', result.quote.slice(0,20) + '...')
} catch(e) { console.log('FAILED:', e.message) }

console.log('\n── Test 5: LNURL resolve ──')
try {
  const [user, domain] = FEE_LUD16.split('@')
  const res  = await fetch(`https://${domain}/.well-known/lnurlp/${user}`)
  const data = await res.json()
  console.log('Min:', data.minSendable/1000, 'sats')
  console.log('Max:', data.maxSendable/1000, 'sats')
} catch(e) { console.log('FAILED:', e.message) }

console.log('\nDone.')
