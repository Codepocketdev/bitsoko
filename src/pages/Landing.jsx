import { useNavigate } from 'react-router-dom'
import {
  ShoppingBag, Zap, Shield, Globe,
  Store, Package, Users, Github,
  MapPin, TrendingUp, Star, Coffee, Smartphone,
  Shirt, Music, BookOpen, Palette, Home, Leaf, BadgeCheck
} from 'lucide-react'

import heroBuyer    from '../assets/hero-buyer.jpg'
import heroPlatform from '../assets/hero-platform.jpg'
import heroSeller   from '../assets/hero-seller.jpg'
import heroTrolley  from '../assets/hero-trolley.jpg'

function ToteLogo() {
  return (
    <svg width="22" height="26" viewBox="0 0 88 96" fill="none">
      <path d="M28 30 C28 16 36 10 44 10 C52 10 60 16 60 30"
        stroke="#f7f4f0" strokeWidth="5" strokeLinecap="round" fill="none"/>
      <path d="M14 32 L18 84 Q18 88 22 88 L66 88 Q70 88 70 84 L74 32 Z" fill="#f7f4f0"/>
      <path d="M14 30 L74 30 L74 38 Q44 42 14 38 Z" fill="#f7931a"/>
      <path d="M47 46 L40 60 L45 60 L41 74 L52 56 L46 56 Z" fill="#f7931a"/>
    </svg>
  )
}

const CATEGORIES = [
  { icon: <Smartphone size={14} />, label: 'Electronics' },
  { icon: <Shirt size={14} />,       label: 'Fashion' },
  { icon: <Coffee size={14} />,      label: 'Food & Drinks' },
  { icon: <Palette size={14} />,     label: 'Art & Crafts' },
  { icon: <Home size={14} />,        label: 'Home & Living' },
  { icon: <BookOpen size={14} />,    label: 'Books' },
  { icon: <Music size={14} />,       label: 'Music' },
  { icon: <Leaf size={14} />,        label: 'Wellness' },
]

const STEPS = [
  {
    num: '01', icon: <Shield size={18} />,
    title: 'Create your account',
    desc: 'Sign up in seconds. No bank details, no long forms. Just get started.',
  },
  {
    num: '02', icon: <Store size={18} />,
    title: 'List what you sell',
    desc: 'Add your products with photos, price and description. Your shop is live instantly.',
  },
  {
    num: '03', icon: <Zap size={18} />,
    title: 'Get paid fast',
    desc: 'Buyers pay with Bitcoin Lightning. Fast, borderless, straight to your wallet.',
  },
]

export default function Landing() {
  const navigate = useNavigate()

  return (
    <div style={{
      minHeight: '100vh', background: '#f7f4f0',
      fontFamily: "'Inter', sans-serif", overflowX: 'hidden',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500;1,600&family=Inter:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        .cat-pill:hover { background: #1a1410 !important; color: #f7f4f0 !important; }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.7)} }
        ::-webkit-scrollbar { display: none; }
      `}</style>

      {/* ── NAV ── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(247,244,240,0.94)',
        backdropFilter: 'blur(14px)',
        borderBottom: '1px solid #e8e0d5',
        padding: '13px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
          <div style={{
            width: '34px', height: '34px', background: '#1a1410',
            borderRadius: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ToteLogo />
          </div>
          <span style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: '22px', fontWeight: '600', fontStyle: 'italic',
            color: '#1a1410', letterSpacing: '-0.5px',
          }}>
            Bit<span style={{ color: '#f7931a' }}>soko</span>
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => navigate('/login')} style={{
            padding: '8px 14px', background: 'none',
            border: '1.5px solid #d4c9b8', borderRadius: '9px',
            fontSize: '13px', fontWeight: '600', color: '#1a1410',
            cursor: 'pointer', fontFamily: "'Inter', sans-serif",
          }}>Login</button>
          <button onClick={() => navigate('/create')} style={{
            padding: '8px 14px', background: '#1a1410',
            border: 'none', borderRadius: '9px',
            fontSize: '13px', fontWeight: '600', color: '#f7f4f0',
            cursor: 'pointer', fontFamily: "'Inter', sans-serif",
          }}>Start Selling</button>
        </div>
      </nav>

      {/* ════════════════════════════════
          HERO
      ════════════════════════════════ */}
      <section style={{ padding: '40px 20px 0', maxWidth: '480px', margin: '0 auto' }}>

        {/* Badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '7px',
          background: 'rgba(247,147,26,0.1)', border: '1px solid rgba(247,147,26,0.25)',
          borderRadius: '99px', padding: '5px 14px',
          fontSize: '11px', fontWeight: '600', color: '#c8860a', marginBottom: '20px',
        }}>
          <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#f7931a', animation: 'pulse 2s infinite' }} />
          Africa's Bitcoin Marketplace
        </div>

        {/* Headline */}
        <div style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: '54px', fontWeight: '600', fontStyle: 'italic',
          color: '#1a1410', letterSpacing: '-1.5px', lineHeight: 0.95,
          marginBottom: '18px',
        }}>
          The market<br />
          <span style={{ color: '#f7931a' }}>belongs</span><br />
          to you
        </div>

        <p style={{
          fontSize: '14.5px', color: '#6b5f52', lineHeight: '1.75',
          marginBottom: '28px', fontWeight: '300',
        }}>
          Buy and sell anything across Africa. Pay and get paid with Bitcoin Lightning — fast, borderless, secure.
        </p>

        {/* CTAs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '28px' }}>
          <button onClick={() => navigate('/create')} style={{
            width: '100%', padding: '16px', background: '#1a1410', color: '#f7f4f0',
            border: 'none', borderRadius: '13px', fontSize: '15px', fontWeight: '700',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '9px',
            fontFamily: "'Inter', sans-serif",
          }}>
            <Store size={17} /> Start Selling
          </button>
          <button onClick={() => navigate('/login')} style={{
            width: '100%', padding: '16px', background: 'transparent', color: '#1a1410',
            border: '1.5px solid #d4c9b8', borderRadius: '13px', fontSize: '15px', fontWeight: '600',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '9px',
            fontFamily: "'Inter', sans-serif",
          }}>
            <ShoppingBag size={17} /> Browse Marketplace
          </button>
        </div>

        {/* Trolley image */}
        <div style={{
          borderRadius: '20px', overflow: 'hidden',
          border: '1px solid #e8e0d5',
          boxShadow: '0 6px 28px rgba(26,20,16,0.1)',
          marginBottom: '24px',
        }}>
          <img
            src={heroTrolley}
            alt="Bitsoko marketplace"
            style={{ width: '100%', display: 'block', objectFit: 'cover', height: '230px' }}
          />
        </div>

        {/* Trust strip — honest, no fake numbers */}
        <div style={{
          display: 'flex', background: '#ffffff',
          borderRadius: '16px', border: '1px solid #e8e0d5',
          overflow: 'hidden', marginBottom: '0',
        }}>
          {[
            { icon: <Zap size={15} />,        label: 'Lightning Fast' },
            { icon: <BadgeCheck size={15} />, label: 'Verified Sellers' },
            { icon: <Globe size={15} />,      label: 'Secure Payments' },
          ].map((s, i) => (
            <div key={i} style={{
              flex: 1, padding: '14px 8px', textAlign: 'center',
              borderRight: i < 2 ? '1px solid #e8e0d5' : 'none',
            }}>
              <div style={{ display: 'flex', justifyContent: 'center', color: '#f7931a', marginBottom: '5px' }}>{s.icon}</div>
              <div style={{ fontSize: '11px', fontWeight: '600', color: '#1a1410' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ════════════════════════════════
          CATEGORIES — buyer image
      ════════════════════════════════ */}
      <section style={{ padding: '52px 20px 0', maxWidth: '480px', margin: '0 auto' }}>
        <div style={{
          borderRadius: '20px', overflow: 'hidden',
          border: '1px solid #e8e0d5',
          boxShadow: '0 4px 20px rgba(26,20,16,0.07)',
          marginBottom: '24px', position: 'relative',
        }}>
          <img
            src={heroBuyer}
            alt="Shop on Bitsoko"
            style={{ width: '100%', display: 'block', objectFit: 'cover', height: '200px', objectPosition: 'top' }}
          />
          <div style={{
            position: 'absolute', bottom: '12px', left: '12px',
            background: 'rgba(26,20,16,0.72)', backdropFilter: 'blur(8px)',
            borderRadius: '99px', padding: '5px 12px',
            fontSize: '11.5px', fontWeight: '600', color: '#f7f4f0',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            <ShoppingBag size={12} /> Browse thousands of listings
          </div>
        </div>

        <div style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: '28px', fontWeight: '500', fontStyle: 'italic',
          color: '#1a1410', marginBottom: '16px',
        }}>
          Shop by category
        </div>
      </section>

      {/* Category pills */}
      <div style={{
        display: 'flex', gap: '8px',
        overflowX: 'auto', padding: '2px 20px 48px',
        scrollbarWidth: 'none',
      }}>
        {CATEGORIES.map((c, i) => (
          <button key={i} className="cat-pill" style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '9px 14px', flexShrink: 0,
            background: '#ffffff', border: '1.5px solid #e8e0d5',
            borderRadius: '99px', fontSize: '12.5px', fontWeight: '500',
            color: '#1a1410', cursor: 'pointer',
            fontFamily: "'Inter', sans-serif", transition: 'all 0.15s',
          }}>
            {c.icon} {c.label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════
          HOW IT WORKS — platform image
      ════════════════════════════════ */}
      <section style={{ background: '#1a1410', padding: '48px 20px' }}>
        <div style={{ maxWidth: '480px', margin: '0 auto' }}>
          <div style={{
            fontSize: '10px', fontWeight: '600', letterSpacing: '2.5px',
            textTransform: 'uppercase', color: '#4a3f35', marginBottom: '10px',
          }}>
            How it works
          </div>
          <div style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: '32px', fontWeight: '500', fontStyle: 'italic',
            color: '#f7f4f0', letterSpacing: '-0.8px', lineHeight: 1.1, marginBottom: '24px',
          }}>
            Up and running<br />in minutes
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '28px' }}>
            {STEPS.map((s, i) => (
              <div key={i} style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '16px', padding: '18px 20px',
                display: 'flex', gap: '16px', alignItems: 'flex-start',
              }}>
                <div style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: '30px', fontWeight: '600', fontStyle: 'italic',
                  color: 'rgba(247,147,26,0.25)', lineHeight: 1, flexShrink: 0, width: '34px',
                }}>
                  {s.num}
                </div>
                <div>
                  <div style={{
                    fontSize: '13.5px', fontWeight: '600', color: '#f0ebe4',
                    marginBottom: '5px', display: 'flex', alignItems: 'center', gap: '7px',
                  }}>
                    <span style={{ color: '#f7931a' }}>{s.icon}</span>
                    {s.title}
                  </div>
                  <div style={{ fontSize: '12.5px', color: '#5a4f44', lineHeight: '1.6' }}>
                    {s.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Platform image */}
          <div style={{
            borderRadius: '18px', overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.06)',
            marginBottom: '28px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          }}>
            <img
              src={heroPlatform}
              alt="Bitsoko marketplace"
              style={{ width: '100%', display: 'block', objectFit: 'cover', height: '200px' }}
            />
            <div style={{
              padding: '13px 16px',
              background: 'rgba(255,255,255,0.03)',
              borderTop: '1px solid rgba(255,255,255,0.05)',
              display: 'flex', alignItems: 'center', gap: '8px',
            }}>
              <Zap size={14} color="#f7931a" />
              <span style={{ fontSize: '12.5px', color: '#6b5f52', fontWeight: '500' }}>
                Your storefront. On Bitcoin rails.
              </span>
            </div>
          </div>

          <button onClick={() => navigate('/create')} style={{
            width: '100%', padding: '16px',
            background: '#f7931a', color: '#1a1410',
            border: 'none', borderRadius: '13px',
            fontSize: '15px', fontWeight: '700', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '9px',
            fontFamily: "'Inter', sans-serif",
          }}>
            <Zap size={17} /> Start Selling Now
          </button>
        </div>
      </section>

      {/* ════════════════════════════════
          COMMUNITY — seller image
      ════════════════════════════════ */}
      <section style={{ padding: '48px 20px', maxWidth: '480px', margin: '0 auto' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          background: 'rgba(45,106,79,0.08)', border: '1px solid rgba(45,106,79,0.15)',
          borderRadius: '99px', padding: '5px 12px',
          fontSize: '11px', fontWeight: '600', color: '#2d6a4f', marginBottom: '14px',
        }}>
          <MapPin size={11} /> Nairobi, Kenya
        </div>

        <div style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: '32px', fontWeight: '500', fontStyle: 'italic',
          color: '#1a1410', letterSpacing: '-0.8px', lineHeight: 1.1, marginBottom: '14px',
        }}>
          Built for African<br />merchants
        </div>

        <p style={{ fontSize: '14px', color: '#6b5f52', lineHeight: '1.75', marginBottom: '24px' }}>
          Inspired by the African Bitcoin Circular Economies — where real merchants earn, save and spend sats daily. Bitsoko brings that energy to every market across the continent.
        </p>

        {/* Seller image */}
        <div style={{
          borderRadius: '20px', overflow: 'hidden',
          border: '1px solid #e8e0d5',
          boxShadow: '0 4px 20px rgba(26,20,16,0.07)',
          marginBottom: '24px', position: 'relative',
        }}>
          <img
            src={heroSeller}
            alt="African merchant on Bitsoko"
            style={{ width: '100%', display: 'block', objectFit: 'cover', height: '210px', objectPosition: 'top' }}
          />
          <div style={{
            position: 'absolute', bottom: '12px', left: '12px',
            background: 'rgba(26,20,16,0.72)', backdropFilter: 'blur(8px)',
            borderRadius: '99px', padding: '5px 12px',
            fontSize: '11.5px', fontWeight: '600', color: '#f7f4f0',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            <Zap size={12} color="#f7931a" /> Sell with just a phone
          </div>
        </div>

        {/* Feature cards — honest messaging */}
        {[
          {
            icon: <TrendingUp size={15} />,
            title: 'No bank account needed',
            desc: 'If you have a phone and a Bitcoin wallet, you can buy and sell on Bitsoko.',
          },
          {
            icon: <Globe size={15} />,
            title: 'Sell across borders',
            desc: 'Bitcoin has no borders. Sell from Nairobi to Lagos to Accra.',
          },
          {
            icon: <Star size={15} />,
            title: 'Simple, fair pricing',
            desc: 'Small fees keep the platform running and improving. No hidden charges, ever.',
          },
        ].map((c, i) => (
          <div key={i} style={{
            display: 'flex', gap: '14px', alignItems: 'flex-start',
            padding: '14px 16px', background: '#ffffff',
            border: '1px solid #e8e0d5', borderRadius: '14px', marginBottom: '8px',
          }}>
            <div style={{
              width: '34px', height: '34px', flexShrink: 0,
              background: '#f7f4f0', borderRadius: '9px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f7931a',
            }}>
              {c.icon}
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#1a1410', marginBottom: '3px' }}>{c.title}</div>
              <div style={{ fontSize: '12px', color: '#9c8e80', lineHeight: '1.5' }}>{c.desc}</div>
            </div>
          </div>
        ))}
      </section>

      {/* ════════════════════════════════
          FINAL CTA
      ════════════════════════════════ */}
      <section style={{ padding: '44px 20px 52px', background: '#f0ebe4', borderTop: '1px solid #e8e0d5' }}>
        <div style={{ maxWidth: '480px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: '40px', fontWeight: '600', fontStyle: 'italic',
            color: '#1a1410', letterSpacing: '-1px', lineHeight: 1.05, marginBottom: '12px',
          }}>
            Ready to start<br />earning in sats?
          </div>
          <p style={{ fontSize: '14px', color: '#6b5f52', lineHeight: '1.7', marginBottom: '28px' }}>
            Thousands of buyers are looking for what you sell. Open your shop today.
          </p>
          <button onClick={() => navigate('/create')} style={{
            width: '100%', padding: '16px', background: '#1a1410', color: '#f7f4f0',
            border: 'none', borderRadius: '13px', fontSize: '15px', fontWeight: '700',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '9px',
            fontFamily: "'Inter', sans-serif", marginBottom: '10px',
          }}>
            <Store size={17} /> Open Your Shop
          </button>
          <button onClick={() => navigate('/login')} style={{
            width: '100%', padding: '14px', background: 'transparent', color: '#6b5f52',
            border: '1.5px solid #d4c9b8', borderRadius: '13px',
            fontSize: '14px', fontWeight: '600', cursor: 'pointer', fontFamily: "'Inter', sans-serif",
          }}>
            Already have an account? Login
          </button>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ background: '#1a1410', padding: '28px 20px 40px' }}>
        <div style={{ maxWidth: '480px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <div style={{
              width: '30px', height: '30px', background: 'rgba(255,255,255,0.06)',
              borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ToteLogo />
            </div>
            <span style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: '20px', fontWeight: '600', fontStyle: 'italic', color: '#f0ebe4',
            }}>
              Bit<span style={{ color: '#f7931a' }}>soko</span>
            </span>
          </div>

          <p style={{ fontSize: '12px', color: '#4a3f35', lineHeight: '1.7', marginBottom: '20px' }}>
            A peer-to-peer marketplace powered by Bitcoin Lightning. Built in Nairobi, for Africa and the world.
          </p>

          <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', marginBottom: '24px' }}>
            {['Open source', 'Bitcoin Lightning', 'Secure Payments', 'P2P'].map((tag, i) => (
              <div key={i} style={{
                padding: '4px 10px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '99px', fontSize: '11px', color: '#4a3f35',
              }}>
                {tag}
              </div>
            ))}
          </div>

          <div style={{
            borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '18px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ fontSize: '11px', color: '#3a3028' }}>© 2026 Bitsoko. Built in Nairobi</div>
            <a href="https://github.com/Codepocketdev/bitsoko" target="_blank" rel="noreferrer" style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              fontSize: '11px', color: '#4a3f45', textDecoration: 'none',
            }}>
              <Github size={12} /> GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}

