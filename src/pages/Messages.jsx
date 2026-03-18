import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Send, Loader, Lock,
  MessageCircle, ChevronLeft,
} from 'lucide-react'
import { getPool, getReadRelays, getWriteRelays, DEFAULT_RELAYS, getSecretKey } from '../lib/nostrSync'
import { getProfile, saveProfile } from '../lib/db'
import { nip04 } from 'nostr-tools'
import { finalizeEvent } from 'nostr-tools/pure'
import { nip19 } from 'nostr-tools'
import { saveUnreadCount, markAllMessagesRead, getLastSeenTs } from '../hooks/useNotifications'

const C = {
  bg:     '#f7f4f0',
  white:  '#ffffff',
  black:  '#1a1410',
  muted:  '#b0a496',
  border: '#e8e0d5',
  orange: '#f7931a',
  ochre:  '#c8860a',
  red:    '#ef4444',
  green:  '#22c55e',
}

const skToHex = (sk) => Array.from(sk).map(b => b.toString(16).padStart(2, '0')).join('')

function timeAgo(ts) {
  const s = Math.floor(Date.now() / 1000) - ts
  if (s < 60)    return 'just now'
  if (s < 3600)  return `${Math.floor(s/60)}m`
  if (s < 86400) return `${Math.floor(s/3600)}h`
  return new Date(ts * 1000).toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

// ── NIP-42 raw WS DM fetcher (borrowed from satscode) ────────────────────────
function fetchDMsFromRelay(relayUrl, skBytes, f1, f2, onEvent, onDone) {
  const subId = 'dm-' + Math.random().toString(36).slice(2, 8)
  let ws, done = false, authed = false

  const finish = () => {
    if (done) return; done = true
    try { ws?.close() } catch {}
    onDone()
  }
  const sendReq  = () => ws.send(JSON.stringify(['REQ', subId, f1, f2]))
  const sendAuth = (ch) => {
    const ev = finalizeEvent({
      kind: 22242,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['relay', relayUrl], ['challenge', ch]],
      content: '',
    }, skBytes)
    ws.send(JSON.stringify(['AUTH', ev]))
  }

  try {
    ws = new WebSocket(relayUrl)
    ws.onopen    = () => sendReq()
    ws.onmessage = ({ data }) => {
      if (done) return
      let msg; try { msg = JSON.parse(data) } catch { return }
      const [type, ...rest] = msg
      if (type === 'AUTH') sendAuth(rest[0])
      if (type === 'OK' && !authed) { authed = true; sendReq() }
      if (type === 'EVENT' && rest[1]?.kind === 4) onEvent(rest[1])
      if (type === 'EOSE') finish()
      if (type === 'CLOSED' && !(rest[1] || '').toLowerCase().includes('auth-required')) finish()
    }
    ws.onerror = () => finish()
    ws.onclose = () => finish()
    setTimeout(() => finish(), 12000)
  } catch { finish() }

  return () => { done = true; try { ws?.close() } catch {} }
}

// ── Live WS subscription — stays open, auto-reconnects (borrowed from satscode) ──
function subscribeLiveDMs(relayUrl, skBytes, f1, f2, onEvent) {
  let ws, closed = false, authed = false
  const subId = 'dm-live-' + Math.random().toString(36).slice(2, 8)

  const sendReq  = () => ws.send(JSON.stringify(['REQ', subId, f1, f2]))
  const sendAuth = (ch) => {
    const ev = finalizeEvent({
      kind: 22242,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['relay', relayUrl], ['challenge', ch]],
      content: '',
    }, skBytes)
    ws.send(JSON.stringify(['AUTH', ev]))
  }

  const connect = () => {
    if (closed) return
    try {
      ws = new WebSocket(relayUrl)
      ws.onopen    = () => { if (!closed) sendReq() }
      ws.onmessage = ({ data }) => {
        if (closed) return
        let msg; try { msg = JSON.parse(data) } catch { return }
        const [type, ...rest] = msg
        if (type === 'AUTH') sendAuth(rest[0])
        if (type === 'OK' && !authed) { authed = true; sendReq() }
        if (type === 'EVENT' && rest[1]?.kind === 4) onEvent(rest[1])
      }
      ws.onerror = () => {}
      ws.onclose = () => { if (!closed) setTimeout(connect, 3000) } // auto-reconnect
    } catch {}
  }

  connect()
  return () => { closed = true; try { ws?.close() } catch {} }
}

// ─────────────────────────────────────────────────────────────────────────────

function Avatar({ profile, pubkey, size = 40 }) {
  const [err, setErr] = useState(false)
  const name   = profile?.display_name || profile?.name || pubkey?.slice(0, 2) || '?'
  const letter = name[0].toUpperCase()
  if (profile?.picture && !err) {
    return (
      <img src={profile.picture} alt={letter} onError={() => setErr(true)}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: `1.5px solid ${C.border}` }}/>
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: C.black,
      flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size * 0.38, color: C.white,
    }}>
      {letter}
    </div>
  )
}

function ConversationRow({ partnerPubkey, profile, lastMessage, lastTs, unread, onClick }) {
  const name = profile?.display_name || profile?.name || `${partnerPubkey.slice(0,8)}…`
  return (
    <button onClick={onClick} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 12,
      padding: '14px 16px', background: C.white, border: 'none',
      borderBottom: `1px solid ${C.border}`, cursor: 'pointer', textAlign: 'left',
    }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <Avatar profile={profile} pubkey={partnerPubkey} size={46}/>
        {unread && (
          <div style={{ position: 'absolute', top: 0, right: 0, width: 10, height: 10, borderRadius: '50%', background: C.orange, border: `2px solid ${C.white}` }}/>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
          <span style={{ fontSize: 14, fontWeight: unread ? 700 : 500, color: C.black, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{name}</span>
          <span style={{ fontSize: 10, color: C.muted, flexShrink: 0 }}>{timeAgo(lastTs)}</span>
        </div>
        <div style={{ fontSize: 12, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {lastMessage || '…'}
        </div>
      </div>
    </button>
  )
}

function Bubble({ text, ts, isMe }) {
  return (
    <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
      <div style={{
        maxWidth: '78%', padding: '10px 14px',
        background: isMe ? C.black : C.white,
        color: isMe ? C.white : C.black,
        borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
        border: isMe ? 'none' : `1px solid ${C.border}`,
        fontSize: 13, lineHeight: 1.5,
      }}>
        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{text}</div>
        <div style={{ fontSize: 9, marginTop: 4, opacity: 0.5, textAlign: 'right' }}>{timeAgo(ts)}</div>
      </div>
    </div>
  )
}

export default function Messages() {
  const navigate = useNavigate()
  const myPubkey = (() => {
    try { return nip19.decode(localStorage.getItem('bitsoko_npub')).data } catch { return null }
  })()

  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState('')
  const [conversations, setConversations] = useState({})
  const [selected,      setSelected]      = useState(null)
  const [input,         setInput]         = useState('')
  const [sending,       setSending]       = useState(false)

  const bottomRef  = useRef(null)
  const seenRef    = useRef(new Set())
  const convRef    = useRef({})
  const liveClosersRef = useRef([])

  const CACHE_KEY = `bitsoko_msgs_${myPubkey}`

  // ── Load cache instantly ────────────────────
  useEffect(() => {
    if (!myPubkey) return
    try {
      const cached = localStorage.getItem(CACHE_KEY)
      if (cached) {
        const parsed = JSON.parse(cached)
        convRef.current = parsed
        setConversations(parsed)
        setLoading(false)
      }
    } catch {}
  }, [myPubkey])

  // ── Main fetch + live subscription ──────────
  useEffect(() => {
    if (!myPubkey) { setLoading(false); return }

    let sk, skHex
    try {
      sk    = getSecretKey()
      skHex = skToHex(sk)
    } catch {
      setError('Could not load keys')
      setLoading(false)
      return
    }

    const relays = [...new Set([...getReadRelays(), ...DEFAULT_RELAYS])]
    let doneCount = 0
    const totalRelays = relays.length

    const onEvent = async (event) => {
      if (seenRef.current.has(event.id)) return
      seenRef.current.add(event.id)

      const isMe      = event.pubkey === myPubkey
      const partnerPk = isMe
        ? (event.tags.find(t => t[0] === 'p')?.[1] || '')
        : event.pubkey
      if (!partnerPk) return

      let text = '[encrypted message]'
      try { text = await nip04.decrypt(skHex, partnerPk, event.content) } catch {}

      const msg = { id: event.id, text, ts: event.created_at, isMe }

      if (!convRef.current[partnerPk]) {
        convRef.current[partnerPk] = { messages: [], lastTs: 0, profile: null }
        // Fetch profile for new conversation partner
        fetchProfile(partnerPk, relays)
      }

      const conv     = convRef.current[partnerPk]
      const existing = conv.messages.findIndex(m => m.id === event.id)
      if (existing >= 0) return

      conv.messages = [...conv.messages, msg].sort((a, b) => a.ts - b.ts)
      conv.lastTs   = Math.max(conv.lastTs, event.created_at)

      convRef.current = { ...convRef.current, [partnerPk]: { ...conv } }
      setConversations({ ...convRef.current })

      // Update bell count on live incoming message
      const lastSeenTs = getLastSeenTs()
      const unread = Object.values(convRef.current).filter(c => {
        const lastMsg = c.messages?.[c.messages.length - 1]
        return lastMsg && !lastMsg.isMe && lastMsg.ts > lastSeenTs
      }).length
      saveUnreadCount(unread)
    }

    const onDone = () => {
      doneCount++
      if (doneCount >= totalRelays) {
        setLoading(false)
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(convRef.current)) } catch {}

        // Update bell count after initial fetch
        const lastSeenTs = getLastSeenTs()
        const unread = Object.values(convRef.current).filter(c => {
          const lastMsg = c.messages?.[c.messages.length - 1]
          return lastMsg && !lastMsg.isMe && lastMsg.ts > lastSeenTs
        }).length
        saveUnreadCount(unread)
        markAllMessagesRead()
      }
    }

    // Historical fetch
    const fSent = { kinds: [4], authors: [myPubkey], limit: 200 }
    const fRecv = { kinds: [4], '#p': [myPubkey], limit: 200 }
    const fetchClosers = relays.map(r =>
      fetchDMsFromRelay(r, sk, fSent, fRecv, onEvent, onDone)
    )

    // Live subscription — stays open and auto-reconnects
    const now    = Math.floor(Date.now() / 1000)
    const lSent  = { kinds: [4], authors: [myPubkey], since: now }
    const lRecv  = { kinds: [4], '#p': [myPubkey], since: now }
    const liveClosers = relays.map(r =>
      subscribeLiveDMs(r, sk, lSent, lRecv, onEvent)
    )
    liveClosersRef.current = liveClosers

    return () => {
      fetchClosers.forEach(c => c?.())
      liveClosers.forEach(c => c?.())
    }
  }, [myPubkey])

  // ── Profile fetcher ─────────────────────────
  const fetchProfile = async (pubkey, relays) => {
    try {
      const cached = await getProfile(pubkey)
      if (cached) {
        convRef.current[pubkey] = { ...convRef.current[pubkey], profile: cached }
        setConversations({ ...convRef.current })
        return
      }
      const pool   = getPool()
      const events = await pool.querySync(relays, { kinds: [0], authors: [pubkey], limit: 1 })
      if (events.length) {
        const p = JSON.parse(events[0].content)
        await saveProfile(pubkey, p)
        convRef.current[pubkey] = { ...convRef.current[pubkey], profile: p }
        setConversations({ ...convRef.current })
      }
    } catch {}
  }

  useEffect(() => {
    if (selected && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [selected, conversations])

  const handleSend = async () => {
    if (!input.trim() || !selected || sending) return
    setSending(true)
    const text = input.trim()
    setInput('')

    try {
      const sk        = getSecretKey()
      const skHex     = skToHex(sk)
      const encrypted = await nip04.encrypt(skHex, selected, text)

      const event = finalizeEvent({
        kind:       4,
        created_at: Math.floor(Date.now() / 1000),
        tags:       [['p', selected]],
        content:    encrypted,
      }, sk)

      const relays = [...new Set([...getWriteRelays(), ...DEFAULT_RELAYS])]
      await Promise.any(getPool().publish(relays, event))

      // Optimistic update
      const msg = { id: event.id, text, ts: event.created_at, isMe: true }
      if (!convRef.current[selected]) {
        convRef.current[selected] = { messages: [], lastTs: 0, profile: null }
      }
      convRef.current[selected].messages = [...convRef.current[selected].messages, msg]
      convRef.current[selected].lastTs   = event.created_at
      seenRef.current.add(event.id)
      setConversations({ ...convRef.current })

    } catch(e) {
      setInput(text)
      console.error('[bitsoko] send DM error:', e)
    }
    setSending(false)
  }

  const sortedConvs  = Object.entries(conversations).sort((a, b) => b[1].lastTs - a[1].lastTs)
  const selectedConv = selected ? conversations[selected] : null
  const partnerName  = selectedConv?.profile?.display_name || selectedConv?.profile?.name || `${selected?.slice(0,8)}…`

  if (!myPubkey) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, textAlign: 'center' }}>
        <MessageCircle size={44} color={C.border}/>
        <div style={{ fontSize: '1rem', fontWeight: 700, color: C.black }}>Not logged in</div>
        <div style={{ fontSize: '0.82rem', color: C.muted }}>Log in to see your messages</div>
      </div>
    )
  }

  // ── Thread view ─────────────────────────────
  if (selected && selectedConv) {
    return (
      <div style={{ background: C.bg, minHeight: '100vh', fontFamily: "'Inter',sans-serif", display: 'flex', flexDirection: 'column' }}>

        <div style={{ background: C.white, borderBottom: `1px solid ${C.border}`, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 50, flexShrink: 0 }}>
          <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: C.black, padding: 4 }}>
            <ChevronLeft size={22}/>
          </button>
          <Avatar profile={selectedConv.profile} pubkey={selected} size={36}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.black, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{partnerName}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: C.muted }}>
              <Lock size={9}/> End-to-end encrypted
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 80px' }}>
          {selectedConv.messages.map(msg => (
            <Bubble key={msg.id} text={msg.text} ts={msg.ts} isMe={msg.isMe}/>
          ))}
          <div ref={bottomRef}/>
        </div>

        <div style={{ position: 'fixed', bottom: 64, left: 0, right: 0, background: C.white, borderTop: `1px solid ${C.border}`, padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder="Type a message…"
            rows={1}
            style={{
              flex: 1, padding: '11px 14px', background: C.bg,
              border: `1.5px solid ${input ? C.black : C.border}`, borderRadius: 12,
              outline: 'none', resize: 'none', fontSize: '0.88rem', color: C.black,
              lineHeight: 1.5, fontFamily: "'Inter',sans-serif", maxHeight: 100, overflowY: 'auto',
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            style={{
              width: 44, height: 44, borderRadius: 12, flexShrink: 0,
              background: input.trim() && !sending ? C.black : C.border,
              border: 'none', cursor: input.trim() && !sending ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.15s',
            }}
          >
            {sending
              ? <Loader size={16} color={C.white} style={{ animation: 'spin 1s linear infinite' }}/>
              : <Send size={16} color={C.white}/>
            }
          </button>
        </div>

        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  // ── Conversation list ───────────────────────
  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: "'Inter',sans-serif", paddingBottom: 100 }}>

      <div style={{ background: C.white, borderBottom: `1px solid ${C.border}`, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, position: 'sticky', top: 0, zIndex: 50 }}>
        <button onClick={() => navigate('/', { state: { openMore: true } })} style={{ width: 36, height: 36, borderRadius: '50%', background: C.bg, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <ArrowLeft size={17} color={C.black}/>
        </button>
        <div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: C.black }}>Messages</div>
          <div style={{ fontSize: '0.68rem', color: C.muted }}>{sortedConvs.length} conversation{sortedConvs.length !== 1 ? 's' : ''}</div>
        </div>
      </div>

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0', gap: 12 }}>
          <Loader size={24} color={C.ochre} style={{ animation: 'spin 1s linear infinite' }}/>
          <div style={{ fontSize: 12, color: C.muted }}>Loading encrypted messages…</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      {!loading && error && (
        <div style={{ margin: '16px', padding: '14px 16px', background: 'rgba(239,68,68,0.06)', border: `1px solid rgba(239,68,68,0.2)`, borderRadius: 12, fontSize: 13, color: C.red }}>
          {error}
        </div>
      )}

      {!loading && !error && sortedConvs.length === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 20px', gap: 14, textAlign: 'center' }}>
          <MessageCircle size={48} color={C.border}/>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: C.black }}>No messages yet</div>
          <div style={{ fontSize: '0.82rem', color: C.muted, lineHeight: 1.6 }}>
            When you buy something and contact a seller, or a buyer messages you, conversations appear here.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', background: C.white, border: `1px solid ${C.border}`, borderRadius: 10 }}>
            <Lock size={12} color={C.muted}/>
            <span style={{ fontSize: 11, color: C.muted }}>All messages are end-to-end encrypted via Nostr DMs</span>
          </div>
          <button onClick={() => navigate('/explore')} style={{ padding: '12px 28px', background: C.black, border: 'none', borderRadius: 12, cursor: 'pointer', fontSize: '0.88rem', fontWeight: 700, color: C.white }}>
            Browse marketplace
          </button>
        </div>
      )}

      {!loading && sortedConvs.length > 0 && (
        <div style={{ background: C.white, borderBottom: `1px solid ${C.border}` }}>
          {sortedConvs.map(([pubkey, conv]) => {
            const lastMsg = conv.messages[conv.messages.length - 1]
            const unread  = lastMsg && !lastMsg.isMe
            return (
              <ConversationRow
                key={pubkey}
                partnerPubkey={pubkey}
                profile={conv.profile}
                lastMessage={lastMsg?.text}
                lastTs={conv.lastTs}
                unread={unread}
                onClick={() => setSelected(pubkey)}
              />
            )
          })}
        </div>
      )}

      {!loading && (
        <div style={{ textAlign: 'center', padding: '16px', fontSize: 10, color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <Lock size={9}/> End-to-end encrypted via Nostr NIP-04
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

