import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Home, Search, Tag, ShoppingCart, Menu,
  User, Store, Package, MessageCircle,
  Settings, X, Zap, ChevronRight, Map
} from 'lucide-react'

const NAV_ITEMS = [
  { path: '/',        icon: Home,         label: 'Home'    },
  { path: '/explore', icon: Search,       label: 'Explore' },
  { path: '/deals',   icon: Tag,          label: 'Deals'   },
  { path: '/cart',    icon: ShoppingCart, label: 'Cart'    },
]

const MORE_ITEMS = [
  {
    section: 'account',
    items: [
      { path: '/profile',  icon: User,         label: 'Profile',  sub: 'Your public Nostr profile' },
      { path: '/shop',     icon: Store,        label: 'My Shop',  sub: 'Manage your listings'      },
      { path: '/orders',   icon: Package,      label: 'Orders',   sub: 'Purchases & sales'         },
      { path: '/messages', icon: MessageCircle,label: 'Messages', sub: 'DMs with buyers & sellers' },
      { path: '/wallet',   icon: Zap,           label: 'Wallet',   sub: 'Cashu • Lightning payments'  },
      { path: '/map',     icon: Map,           label: 'Bitcoin Map', sub: 'Bitcoin merchants near you'  },
    ]
  },
  {
    section: 'app',
    items: [
      { path: '/settings', icon: Settings, label: 'Settings', sub: 'App preferences' },
    ]
  }
]

const C = {
  bg:      '#f7f4f0',
  white:   '#ffffff',
  black:   '#1a1410',
  muted:   '#b0a496',
  border:  '#e8e0d5',
  orange:  '#f7931a',
  ochre:   '#c8860a',
  terra:   '#b5451b',
  overlay: 'rgba(26,20,16,0.5)',
}

function MoreSheet({ onClose, navigate, currentPath }) {
  const [displayName, setDisplayName] = useState(localStorage.getItem('bitsoko_display_name') || 'Anon')
  const [ln,          setLn]          = useState(localStorage.getItem('bitsoko_ln') || '')
  const npub      = localStorage.getItem('bitsoko_npub') || ''
  const shortNpub = npub ? `${npub.slice(0,10)}…${npub.slice(-4)}` : ''

  useEffect(() => {
    const onLogin = () => {
      const n = localStorage.getItem('bitsoko_display_name')
      const l = localStorage.getItem('bitsoko_ln')
      if (n) setDisplayName(n)
      if (l) setLn(l)
    }
    // bitsoko_login fires same-tab; storage fires cross-tab
    window.addEventListener('bitsoko_login', onLogin)
    window.addEventListener('storage', onLogin)
    return () => {
      window.removeEventListener('bitsoko_login', onLogin)
      window.removeEventListener('storage', onLogin)
    }
  }, [])

  // FIX: navigate directly — PageWrapper closes sheet via location useEffect
  // Old: navigate(path) + onClose() caused re-render flash through home
  const handleNav = (path) => navigate(path)

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 110, background: C.overlay, backdropFilter: 'blur(2px)' }} />

      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 120,
        background: C.white, borderRadius: '20px 20px 0 0',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
        animation: 'sheetUp .25s cubic-bezier(0.32,0.72,0,1)',
        boxShadow: '0 -4px 40px rgba(26,20,16,0.12)',
        maxHeight: '85vh', overflowY: 'auto',
      }}>
        <style>{`
          @keyframes sheetUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
        `}</style>

        <div style={{ padding: '12px 20px 0' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: C.border, margin: '0 auto 16px' }}/>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 21, fontWeight: 700, color: C.black }}>More</span>
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: '50%', background: C.bg, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <X size={16} color={C.muted}/>
            </button>
          </div>
        </div>

        {/* Profile card */}
        <div onClick={() => handleNav('/profile')} style={{ margin: '0 16px 16px', padding: '14px 16px', background: C.bg, borderRadius: 14, display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', border: `1px solid ${C.border}` }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: `linear-gradient(135deg,${C.ochre},${C.terra})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 20, fontWeight: 700, color: '#fff' }}>
            {displayName.slice(0, 1).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.black, marginBottom: 2 }}>{displayName}</div>
            {ln && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, fontSize: 11, color: C.ochre }}>
                <Zap size={11} fill={C.ochre} color={C.ochre} style={{ flexShrink: 0, marginTop: 1 }}/>
                <span style={{ wordBreak: 'break-all', lineHeight: 1.4 }}>{ln}</span>
              </div>
            )}
            {!ln && shortNpub && (
              <div style={{ fontFamily: 'monospace', fontSize: 10, color: C.muted }}>{shortNpub}</div>
            )}
          </div>
          <ChevronRight size={16} color={C.muted}/>
        </div>

        {/* Nav sections */}
        {MORE_ITEMS.map(({ section, items }) => (
          <div key={section} style={{ marginBottom: 8 }}>
            {items.map(({ path, icon: Icon, label, sub }) => {
              const active = currentPath === path
              return (
                <button key={path} onClick={() => handleNav(path)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px', background: active ? `${C.ochre}08` : 'none', border: 'none', borderLeft: active ? `3px solid ${C.ochre}` : '3px solid transparent', cursor: 'pointer', textAlign: 'left', transition: 'background .15s' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: active ? `${C.ochre}15` : C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={18} color={active ? C.ochre : C.black} strokeWidth={1.8}/>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: active ? 700 : 500, color: active ? C.ochre : C.black }}>{label}</div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{sub}</div>
                  </div>
                  <ChevronRight size={15} color={C.muted}/>
                </button>
              )
            })}
            {section === 'account' && <div style={{ height: 1, background: C.border, margin: '4px 20px' }}/>}
          </div>
        ))}

        <div style={{ height: 12 }}/>
      </div>
    </>
  )
}

function BottomNav({ onMorePress }) {
  const location   = useLocation()
  const navigate   = useNavigate()
  const current    = location.pathname
  const moreActive = ['/profile','/shop','/orders','/messages','/settings','/wallet','/map'].includes(current)

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
      background: 'rgba(247,244,240,0.97)',
      backdropFilter: 'blur(16px)',
      borderTop: `1px solid ${C.border}`,
      display: 'flex', alignItems: 'stretch',
      height: 64,
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>
      {NAV_ITEMS.map(({ path, icon: Icon, label }) => {
        const active = current === path
        return (
          <button key={path} onClick={() => navigate(path)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0', position: 'relative' }}>
            {active && <div style={{ position: 'absolute', top: 6, width: 4, height: 4, borderRadius: '50%', background: C.orange }}/>}
            <Icon size={22} strokeWidth={active ? 2.5 : 1.8} color={active ? C.black : C.muted}/>
            <span style={{ fontSize: 10, fontWeight: active ? 700 : 400, color: active ? C.black : C.muted, fontFamily: "'Inter',sans-serif" }}>{label}</span>
          </button>
        )
      })}

      <button onClick={onMorePress} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0', position: 'relative' }}>
        {moreActive && <div style={{ position: 'absolute', top: 6, width: 4, height: 4, borderRadius: '50%', background: C.orange }}/>}
        <Menu size={22} strokeWidth={moreActive ? 2.5 : 1.8} color={moreActive ? C.black : C.muted}/>
        <span style={{ fontSize: 10, fontWeight: moreActive ? 700 : 400, color: moreActive ? C.black : C.muted, fontFamily: "'Inter',sans-serif" }}>More</span>
      </button>
    </nav>
  )
}

export default function PageWrapper({ children }) {
  const [showMore, setShowMore] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    document.documentElement.style.overflowX = 'hidden'
    document.body.style.overflowX = 'hidden'
    document.body.style.width = '100%'
  }, [])

  // FIX: close the sheet automatically whenever the route changes
  // This replaces the old onClose() call inside handleNav which caused
  // the re-render flash through home before reaching the target page
  useEffect(() => {
    setShowMore(false)
  }, [location.pathname])

  useEffect(() => {
    if (location.state?.openMore) {
      setShowMore(true)
      window.history.replaceState({}, '')
    }
  }, [location.state])

  return (
    <div style={{
      minHeight: '100vh', width: '100%',
      maxWidth: '100vw', overflowX: 'hidden',
      background: C.bg,
    }}>
      <div style={{ paddingBottom: 64, overflowX: 'hidden' }}>
        {children}
      </div>

      <BottomNav onMorePress={() => setShowMore(true)} />

      {showMore && (
        <MoreSheet
          onClose={() => setShowMore(false)}
          navigate={navigate}
          currentPath={location.pathname}
        />
      )}
    </div>
  )
}

