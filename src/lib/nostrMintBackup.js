// src/utils/nostrMintBackup.js
// Ported directly from SatoshiPay — backs up mint list to Nostr (kind:30078)
// Encrypted with NIP-44 using keypair derived from wallet seed
import { bytesToHex } from '@noble/hashes/utils.js'
import { sha256 }     from '@noble/hashes/sha2.js'
import { getPublicKey } from 'nostr-tools'
import { mnemonicToSeedSync } from '@scure/bip39'
import { SimplePool } from 'nostr-tools/pool'
import { nip44 } from 'nostr-tools'

const MINT_BACKUP_KIND = 30078

const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.8333.space/',
  'wss://nos.lol',
  'wss://relay.primal.net',
]

// Derive Nostr keypair from wallet seed
export async function deriveMintBackupKeys(mnemonic) {
  const seed            = mnemonicToSeedSync(mnemonic)
  const domainSeparator = new TextEncoder().encode('cashu-mint-backup')
  const combinedData    = new Uint8Array(seed.length + domainSeparator.length)
  combinedData.set(seed)
  combinedData.set(domainSeparator, seed.length)
  const privateKeyBytes = sha256(combinedData)
  const privateKeyHex   = bytesToHex(privateKeyBytes)
  const publicKeyHex    = getPublicKey(privateKeyBytes)
  return { privateKeyHex, publicKeyHex, privateKeyBytes }
}

// Search Nostr for backed-up mints
export async function searchMintsOnNostr(mnemonic, relays = DEFAULT_RELAYS) {
  const pool = new SimplePool()
  try {
    const { publicKeyHex, privateKeyBytes } = await deriveMintBackupKeys(mnemonic)
    const events = await pool.querySync(relays, {
      kinds:   [MINT_BACKUP_KIND],
      authors: [publicKeyHex],
      '#d':    ['mint-list'],
      limit:   10,
    })
    const discovered = []
    for (const event of events) {
      try {
        const conversationKey  = nip44.v2.utils.getConversationKey(privateKeyBytes, publicKeyHex)
        const decryptedContent = nip44.v2.decrypt(event.content, conversationKey)
        const backupData       = JSON.parse(decryptedContent)
        for (const mintUrl of backupData.mints) {
          const existing = discovered.find(m => m.url === mintUrl)
          if (!existing) {
            discovered.push({ url: mintUrl, timestamp: backupData.timestamp })
          } else if (backupData.timestamp > existing.timestamp) {
            existing.timestamp = backupData.timestamp
          }
        }
      } catch(e) { console.error('Failed to decrypt backup event:', e) }
    }
    discovered.sort((a, b) => b.timestamp - a.timestamp)
    return discovered
  } catch(e) { throw e }
  finally { pool.close(relays) }
}

// Backup mint list to Nostr
export async function backupMintsToNostr(mnemonic, mintUrls, relays = DEFAULT_RELAYS) {
  if (!mintUrls?.length) return null
  const pool = new SimplePool()
  try {
    const { privateKeyBytes, publicKeyHex } = await deriveMintBackupKeys(mnemonic)
    const backupData = { mints: mintUrls, timestamp: Math.floor(Date.now() / 1000) }
    const conversationKey  = nip44.v2.utils.getConversationKey(privateKeyBytes, publicKeyHex)
    const encryptedContent = nip44.v2.encrypt(JSON.stringify(backupData), conversationKey)
    const { finalizeEvent } = await import('nostr-tools')
    const event = finalizeEvent({
      kind:       MINT_BACKUP_KIND,
      content:    encryptedContent,
      tags:       [['d', 'mint-list'], ['client', 'bitsoko']],
      created_at: backupData.timestamp,
    }, privateKeyBytes)
    await pool.publish(relays, event)
    return event.id
  } catch(e) { throw e }
  finally { pool.close(relays) }
}

