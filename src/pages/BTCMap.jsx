// BTCMap.jsx — Bitcoin merchants near you
// Uses official btcmap.org iframe embed
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader, Navigation, ExternalLink, MapPin } from 'lucide-react'

const C = {
  bg:     '#f7f4f0',
  white:  '#ffffff',
  black:  '#1a1410',
  muted:  '#b0a496',
  border: '#e8e0d5',
  orange: '#f7931a',
  ochre:  '#c8860a',
}

const DEFAULT = { lat: -1.2921, lon: 36.8219 } // Nairobi CBD

export default function BTCMap() {
  const navigate = useNavigate()
  const [loc,    setLoc]    = useState(null)
  const [ready,  setReady]  = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!navigator.geolocation) {
      setLoc(DEFAULT); setReady(true); return
    }
    navigator.geolocation.getCurrentPosition(
      pos => { setLoc({ lat: pos.coords.latitude, lon: pos.coords.longitude }); setReady(true) },
      ()  => { setLoc(DEFAULT); setReady(true) },
      { timeout: 8000, maximumAge: 300000 }
    )
  }, [])

  const mapUrl = ready && loc
    ? `https://btcmap.org/map?lat=${loc.lat}&long=${loc.lon}`
    : null

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: "'Inter',sans-serif", background: C.bg }}>

      {/* Header */}
      <div style={{ background: C.white, borderBottom: `1px solid ${C.border}`, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate(-1)} style={{ width: 36, height: 36, borderRadius: '50%', background: C.bg, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <ArrowLeft size={17} color={C.black}/>
          </button>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.black }}>Bitcoin Map</div>
            <div style={{ fontSize: 11, color: C.muted, display: 'flex', alignItems: 'center', gap: 4 }}>
              {!ready
                ? <><Loader size={9} color={C.muted} style={{ animation: 'spin 1s linear infinite' }}/> Getting location…</>
                : <><Navigation size={9} color={C.orange}/> Bitcoin merchants near you</>
              }
            </div>
          </div>
        </div>
        {mapUrl && (
          <a href={mapUrl} target="_blank" rel="noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 99, fontSize: 11, fontWeight: 600, color: C.black, textDecoration: 'none' }}>
            <ExternalLink size={11}/> Full screen
          </a>
        )}
      </div>

      {/* Map area */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

        {/* Spinner while locating or iframe loading */}
        {(!ready || !loaded) && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: C.bg, zIndex: 1 }}>
            <Loader size={28} color={C.ochre} style={{ animation: 'spin 1s linear infinite' }}/>
            <div style={{ fontSize: 13, color: C.muted }}>
              {!ready ? 'Getting your location…' : 'Loading map…'}
            </div>
          </div>
        )}

        {/* iframe */}
        {mapUrl && (
          <iframe
            key={mapUrl}
            src={mapUrl}
            title="Bitcoin Map"
            onLoad={() => setLoaded(true)}
            allow="geolocation"
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          />
        )}
      </div>

      {/* Footer */}
      <div style={{ background: C.white, borderTop: `1px solid ${C.border}`, padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.muted }}>
          <MapPin size={11} color={C.orange}/>
          Orange pins accept Lightning
        </div>
        <a href="https://btcmap.org/add-location" target="_blank" rel="noreferrer"
          style={{ fontSize: 11, fontWeight: 600, color: C.ochre, textDecoration: 'none' }}>
          + Add your business
        </a>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

