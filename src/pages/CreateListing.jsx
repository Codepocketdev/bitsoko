import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, Check, Upload, X,
  Image as ImageIcon, Loader, Zap, Tag,
  Package, Truck, AlertCircle, CheckCircle,
  Plus, Minus,
} from 'lucide-react'
import { publishProduct, uploadImage } from '../lib/nostrSync'
import { satsToKsh, useRate, getRate } from '../lib/rates'

const C = {
  bg:     '#f7f4f0',
  white:  '#ffffff',
  black:  '#1a1410',
  muted:  '#b0a496',
  border: '#e8e0d5',
  orange: '#f7931a',
  ochre:  '#c8860a',
  terra:  '#b5451b',
  red:    '#ef4444',
  green:  '#22c55e',
  deal:   '#e8614a',
}

const CATEGORIES = [
  'Electronics', 'Fashion', 'Food & Drinks', 'Art & Crafts',
  'Home & Living', 'Books', 'Music', 'Wellness',
  'Services', 'Collectibles', 'Sports', 'Other',
]

const STEPS = [
  { id: 1, label: 'Photos',  icon: ImageIcon },
  { id: 2, label: 'Details', icon: Tag       },
  { id: 3, label: 'Price',   icon: Zap       },
  { id: 4, label: 'Publish', icon: Check     },
]

const DRAFT_KEY = 'bitsoko_listing_draft'
const saveDraft  = (data) => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)) } catch {} }
const loadDraft  = ()     => { try { const r = localStorage.getItem(DRAFT_KEY); return r ? JSON.parse(r) : null } catch { return null } }
const clearDraft = ()     => { try { localStorage.removeItem(DRAFT_KEY) } catch {} }

// ── Step bar ──────────────────────────────────
function StepBar({ current }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '0 20px', marginBottom: 28 }}>
      {STEPS.map((step, i) => {
        const done   = current > step.id
        const active = current === step.id
        const Icon   = step.icon
        return (
          <div key={step.id} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: done ? C.black : active ? C.ochre : C.border,
                display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .3s',
              }}>
                {done
                  ? <Check size={16} color={C.white} strokeWidth={2.5}/>
                  : <Icon size={16} color={active ? C.white : C.muted} strokeWidth={1.8}/>
                }
              </div>
              <span style={{
                fontSize: '0.6rem', fontWeight: active ? 700 : 400,
                color: active ? C.ochre : done ? C.black : C.muted,
                fontFamily: "'Inter',sans-serif", whiteSpace: 'nowrap',
              }}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{
                flex: 1, height: 2, margin: '0 6px', marginBottom: 18,
                background: done ? C.black : C.border, transition: 'background .3s',
              }}/>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Step 1: Photos ────────────────────────────
function PhotoStep({ images, setImages }) {
  const [uploading, setUploading] = useState(false)
  const [errMsg,    setErrMsg]    = useState('')
  const inputRef = useRef()

  const handleFiles = async (files) => {
    const arr = Array.from(files).slice(0, 4 - images.length)
    if (!arr.length) return
    setUploading(true); setErrMsg('')
    for (const file of arr) {
      if (!file.type.startsWith('image/')) continue
      if (file.size > 10 * 1024 * 1024) { setErrMsg('Max 10MB per image'); continue }
      try {
        const url = await uploadImage(file)
        setImages(prev => [...prev, url])
      } catch(e) { setErrMsg(e.message || 'Upload failed') }
    }
    setUploading(false)
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: '1.2rem', fontWeight: 700, color: C.black, marginBottom: 4 }}>Product photos</div>
        <div style={{ fontSize: '0.78rem', color: C.muted }}>Add up to 4 photos. First photo is your cover image.</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        {images.map((url, i) => (
          <div key={url} style={{ aspectRatio: '1', borderRadius: 14, overflow: 'hidden', position: 'relative', border: `2px solid ${i === 0 ? C.ochre : C.border}` }}>
            <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
            {i === 0 && (
              <div style={{ position: 'absolute', top: 8, left: 8, background: C.ochre, borderRadius: 99, padding: '2px 8px', fontSize: '0.58rem', fontWeight: 700, color: C.white }}>Cover</div>
            )}
            <button onClick={() => setImages(prev => prev.filter((_, idx) => idx !== i))} style={{
              position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: '50%',
              background: 'rgba(0,0,0,0.6)', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}>
              <X size={13} color={C.white}/>
            </button>
          </div>
        ))}
        {images.length < 4 && (
          <button onClick={() => inputRef.current?.click()} disabled={uploading} style={{
            aspectRatio: '1', borderRadius: 14, border: `2px dashed ${C.border}`, background: C.bg,
            cursor: uploading ? 'not-allowed' : 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            {uploading
              ? <Loader size={24} color={C.muted} style={{ animation: 'spin 1s linear infinite' }}/>
              : <Upload size={24} color={C.muted}/>
            }
            <span style={{ fontSize: '0.72rem', color: C.muted, fontFamily: "'Inter',sans-serif" }}>
              {uploading ? 'Uploading…' : 'Add photo'}
            </span>
          </button>
        )}
      </div>
      {errMsg && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.06)', border: `1px solid rgba(239,68,68,0.2)`, fontSize: '0.75rem', color: C.red }}>
          <AlertCircle size={14}/> {errMsg}
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" multiple onChange={e => handleFiles(e.target.files)} style={{ display: 'none' }}/>
    </div>
  )
}

// ── Step 2: Details ───────────────────────────
function DetailsStep({ name, setName, description, setDescription, categories, setCategories, isDeal, setIsDeal, discountPct, setDiscountPct, preDealPrice, setPreDealPrice, price, setPrice, rate }) {
  const toggle = (cat) =>
    setCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat])

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: '1.2rem', fontWeight: 700, color: C.black, marginBottom: 4 }}>Product details</div>
        <div style={{ fontSize: '0.78rem', color: C.muted }}>Help buyers find and understand your product.</div>
      </div>

      {/* Name */}
      <div style={{ marginBottom: 18 }}>
        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: C.black, marginBottom: 8 }}>
          Product name *
        </label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Handmade leather wallet" maxLength={100}
          style={{ width: '100%', padding: '12px 14px', background: C.white, border: `1.5px solid ${name ? C.black : C.border}`, borderRadius: 12, outline: 'none', fontSize: '0.9rem', color: C.black, fontFamily: "'Inter',sans-serif", boxSizing: 'border-box', transition: 'border-color .2s' }}/>
        <div style={{ textAlign: 'right', fontSize: '0.65rem', color: C.muted, marginTop: 4 }}>{name.length}/100</div>
      </div>

      {/* Description */}
      <div style={{ marginBottom: 18 }}>
        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: C.black, marginBottom: 8 }}>
          Description *
        </label>
        <textarea value={description} onChange={e => setDescription(e.target.value)}
          placeholder="Describe your product — material, size, condition, story…" maxLength={1000} rows={5}
          style={{ width: '100%', padding: '12px 14px', background: C.white, border: `1.5px solid ${description ? C.black : C.border}`, borderRadius: 12, outline: 'none', resize: 'none', fontSize: '0.88rem', color: C.black, lineHeight: 1.6, fontFamily: "'Inter',sans-serif", boxSizing: 'border-box', transition: 'border-color .2s' }}/>
        <div style={{ textAlign: 'right', fontSize: '0.65rem', color: C.muted, marginTop: 4 }}>{description.length}/1000</div>
      </div>

      {/* Categories */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: C.black, marginBottom: 10 }}>
          Category tags
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {CATEGORIES.map(cat => {
            const active = categories.includes(cat)
            return (
              <button key={cat} onClick={() => toggle(cat)} style={{
                padding: '7px 14px', borderRadius: 99,
                background: active ? C.black : C.white,
                border: `1.5px solid ${active ? C.black : C.border}`,
                cursor: 'pointer', fontSize: '0.75rem',
                fontWeight: active ? 700 : 400,
                color: active ? C.white : C.black,
                fontFamily: "'Inter',sans-serif", transition: 'all .15s',
              }}>
                {cat}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Mark as Deal toggle ── */}
      <div style={{
        background: isDeal ? 'rgba(232,97,74,0.06)' : C.white,
        border: `1.5px solid ${isDeal ? 'rgba(232,97,74,0.4)' : C.border}`,
        borderRadius: 14, padding: '14px 16px',
        display: 'flex', alignItems: 'center', gap: 14,
        transition: 'all 0.2s',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.black, marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Tag size={14} color={isDeal ? C.deal : C.muted}/>
            Mark as Deal
            {isDeal && (
              <span style={{ background: C.deal, color: C.white, fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 99, letterSpacing: '0.08em' }}>
                ACTIVE
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
            Featured on the Deals page — use for promotions, flash sales, or clearing stock fast.
          </div>
        </div>
        <button onClick={() => {
            if (isDeal) {
              if (preDealPrice) setPrice(preDealPrice)
              setDiscountPct('')
              setPreDealPrice('')
            } else {
              setPreDealPrice(price)
            }
            setIsDeal(d => !d)
          }} style={{
          width: 48, height: 26, borderRadius: 13, flexShrink: 0,
          background: isDeal ? C.deal : C.border,
          border: 'none', cursor: 'pointer', position: 'relative',
          transition: 'background 0.2s',
        }}>
          <div style={{
            width: 20, height: 20, borderRadius: '50%', background: C.white,
            position: 'absolute', top: 3,
            left: isDeal ? 24 : 4,
            transition: 'left 0.2s',
            boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
          }}/>
        </button>
      </div>

      {isDeal && (
        <div style={{ marginTop: 12, padding: '14px 16px', background: 'rgba(232,97,74,0.04)', border: `1px solid rgba(232,97,74,0.15)`, borderRadius: 12 }}>
          <label style={{ display:'block', fontSize:'0.75rem', fontWeight:600, color:C.deal, marginBottom:8 }}>
            Discount % — optional
          </label>
          <div style={{ position:'relative' }}>
            <input
              type="number" min="1" max="99"
              value={discountPct}
              onChange={e => setDiscountPct(e.target.value)}
              placeholder="e.g. 20 for 20% off"
              style={{
                width:'100%', padding:'10px 40px 10px 12px',
                background:C.white, border:`1px solid rgba(232,97,74,0.25)`,
                borderRadius:10, outline:'none', fontSize:'0.85rem',
                color:C.black, fontFamily:"'Inter',sans-serif", boxSizing:'border-box',
              }}
            />
            <span style={{ position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',fontSize:14,fontWeight:700,color:C.deal }}>%</span>
          </div>
          {discountPct && parseInt(discountPct) > 0 && price && parseInt(price) > 0 && (
            <div style={{ fontSize:11, color:C.muted, marginTop:6, lineHeight:1.6 }}>
              Was: <span style={{ textDecoration:'line-through' }}>{parseInt(price).toLocaleString()} sats</span>
              {' '}→ Now: <strong style={{ color:'#e8614a' }}>
                {Math.round(parseInt(price)*(1-parseInt(discountPct)/100)).toLocaleString()} sats
              </strong>
              {' '}({satsToKsh(Math.round(parseInt(price)*(1-parseInt(discountPct)/100)), rate)})
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Step 3: Price ─────────────────────────────
function PriceStep({ price, setPrice, quantity, setQuantity, shipping, setShipping, rate }) {
  const ksh = price ? Math.round((parseInt(price) / 100_000_000) * (rate || getRate())) : 0

  const addShipping    = () => setShipping(prev => [...prev, { name: '', cost: '', regions: '' }])
  const removeShipping = (i) => setShipping(prev => prev.filter((_, idx) => idx !== i))
  const updateShipping = (i, field, val) =>
    setShipping(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: val } : s))

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: '1.2rem', fontWeight: 700, color: C.black, marginBottom: 4 }}>Pricing & stock</div>
        <div style={{ fontSize: '0.78rem', color: C.muted }}>Set your price in sats and manage inventory.</div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: C.black, marginBottom: 8 }}>Price (sats) *</label>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }}>
            <Zap size={15} fill={C.orange} color={C.orange}/>
          </div>
          <input type="number" min="1" value={price} onChange={e => setPrice(e.target.value)} placeholder="e.g. 50000"
            style={{ width: '100%', padding: '12px 14px 12px 36px', background: C.white, border: `1.5px solid ${price ? C.black : C.border}`, borderRadius: 12, outline: 'none', fontSize: '1rem', fontWeight: 600, color: C.black, fontFamily: "'Inter',sans-serif", boxSizing: 'border-box', transition: 'border-color .2s' }}/>
        </div>
        {price && <div style={{ fontSize: '0.72rem', color: C.muted, marginTop: 6 }}>≈ KSh {ksh.toLocaleString()} at current rate</div>}
      </div>

      <div style={{ marginBottom: 24 }}>
        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: C.black, marginBottom: 8 }}>Quantity</label>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button onClick={() => setQuantity(q => Math.max(-1, q - 1))} style={{ width: 44, height: 44, borderRadius: '12px 0 0 12px', background: C.white, border: `1.5px solid ${C.border}`, borderRight: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Minus size={16} color={C.black}/>
          </button>
          <div style={{ flex: 1, height: 44, background: C.white, border: `1.5px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', fontWeight: 700, color: C.black }}>
            {quantity === -1 ? 'Unlimited' : quantity}
          </div>
          <button onClick={() => setQuantity(q => q === -1 ? 1 : q + 1)} style={{ width: 44, height: 44, borderRadius: '0 12px 12px 0', background: C.white, border: `1.5px solid ${C.border}`, borderLeft: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Plus size={16} color={C.black}/>
          </button>
        </div>
        <div style={{ fontSize: '0.68rem', color: C.muted, marginTop: 6 }}>Set to Unlimited for digital goods or services</div>
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, color: C.black }}>Shipping options</label>
          <button onClick={addShipping} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, color: C.ochre }}>
            <Plus size={14}/> Add
          </button>
        </div>
        {shipping.length === 0 && (
          <div style={{ padding: '14px', borderRadius: 12, background: C.bg, border: `1px dashed ${C.border}`, textAlign: 'center', fontSize: '0.75rem', color: C.muted }}>
            No shipping options — tap Add for physical products
          </div>
        )}
        {shipping.map((s, i) => (
          <div key={i} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px', marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: C.black }}>Option {i + 1}</span>
              <button onClick={() => removeShipping(i)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={15} color={C.muted}/>
              </button>
            </div>
            {[
              { field: 'name',    placeholder: 'e.g. Nairobi CBD pickup, DHL Kenya' },
              { field: 'cost',    placeholder: 'Cost in sats (0 for free)'          },
              { field: 'regions', placeholder: 'Regions (e.g. Nairobi, Kenya, EA)'  },
            ].map(({ field, placeholder }) => (
              <input key={field} value={s[field]} onChange={e => updateShipping(i, field, e.target.value)} placeholder={placeholder}
                style={{ width: '100%', padding: '9px 12px', marginBottom: 8, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, outline: 'none', fontSize: '0.8rem', color: C.black, fontFamily: "'Inter',sans-serif", boxSizing: 'border-box' }}/>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Step 4: Publish ───────────────────────────
function PublishStep({ images, name, description, categories, price, quantity, shipping, isDeal, status, errMsg, rate }) {
  const ksh = price ? Math.round((parseInt(price) / 100_000_000) * (rate || getRate())) : 0
  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: '1.2rem', fontWeight: 700, color: C.black, marginBottom: 4 }}>Review & publish</div>
        <div style={{ fontSize: '0.78rem', color: C.muted }}>Everything look good? Hit publish to go live on Bitsoko.</div>
      </div>

      {images[0] && (
        <div style={{ width: '100%', aspectRatio: '16/9', borderRadius: 14, overflow: 'hidden', marginBottom: 16, border: `1px solid ${C.border}` }}>
          <img src={images[0]} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
        </div>
      )}

      <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, padding: '16px', marginBottom: 16 }}>
        <div style={{ fontSize: '1rem', fontWeight: 700, color: C.black, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
          {name}
          {isDeal && (
            <span style={{ background: C.deal, color: C.white, fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 99, letterSpacing: '0.08em' }}>
              DEAL
            </span>
          )}
        </div>
        <div style={{ fontSize: '0.8rem', color: C.muted, lineHeight: 1.5, marginBottom: 12 }}>{description}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {categories.map(c => (
            <span key={c} style={{ padding: '4px 10px', borderRadius: 99, background: C.bg, border: `1px solid ${C.border}`, fontSize: '0.68rem', color: C.black }}>{c}</span>
          ))}
          {isDeal && (
            <span style={{ padding: '4px 10px', borderRadius: 99, background: 'rgba(232,97,74,0.08)', border: `1px solid rgba(232,97,74,0.25)`, fontSize: '0.68rem', color: C.deal, fontWeight: 700 }}>
              🏷️ Deal
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 20 }}>
          <div>
            <div style={{ fontSize: '0.65rem', color: C.muted, marginBottom: 2 }}>Price</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.95rem', fontWeight: 700, color: C.black }}>
              <Zap size={13} fill={C.orange} color={C.orange}/> {parseInt(price).toLocaleString()} sats
            </div>
            <div style={{ fontSize: '0.65rem', color: C.muted }}>≈ KSh {ksh.toLocaleString()}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.65rem', color: C.muted, marginBottom: 2 }}>Stock</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: C.black }}>
              {quantity === -1 ? 'Unlimited' : quantity}
            </div>
          </div>
          {shipping.length > 0 && (
            <div>
              <div style={{ fontSize: '0.65rem', color: C.muted, marginBottom: 2 }}>Shipping</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: C.black }}>{shipping.length} option{shipping.length !== 1 ? 's' : ''}</div>
            </div>
          )}
        </div>
      </div>

      {images.length > 1 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {images.slice(1).map((url, i) => (
            <div key={i} style={{ width: 64, height: 64, borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.border}` }}>
              <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
            </div>
          ))}
        </div>
      )}

      {status === 'publishing' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px', borderRadius: 12, background: 'rgba(200,134,10,0.06)', border: `1px solid rgba(200,134,10,0.2)`, fontSize: '0.8rem', color: C.ochre }}>
          <Loader size={16} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}/> Publishing to Nostr relays…
        </div>
      )}
      {status === 'done' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px', borderRadius: 12, background: 'rgba(34,197,94,0.06)', border: `1px solid rgba(34,197,94,0.2)`, fontSize: '0.8rem', color: C.green }}>
          <CheckCircle size={16} style={{ flexShrink: 0 }}/> Published! Redirecting to your shop…
        </div>
      )}
      {status === 'error' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px', borderRadius: 12, background: 'rgba(239,68,68,0.06)', border: `1px solid rgba(239,68,68,0.2)`, fontSize: '0.8rem', color: C.red }}>
          <AlertCircle size={16} style={{ flexShrink: 0 }}/> {errMsg}
        </div>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────
export default function CreateListing() {
  const navigate = useNavigate()
  const draft    = loadDraft()
  const rate     = useRate() // ← live BTC/KES rate

  const [step,        setStep]        = useState(draft?.step        ?? 1)
  const [images,      setImages]      = useState(draft?.images      ?? [])
  const [name,        setName]        = useState(draft?.name        ?? '')
  const [description, setDescription] = useState(draft?.description ?? '')
  const [categories,  setCategories]  = useState(draft?.categories  ?? [])
  const [isDeal,      setIsDeal]      = useState(draft?.isDeal      ?? false)
  const [discountPct,  setDiscountPct]  = useState(draft?.discountPct  ?? '')
  const [preDealPrice, setPreDealPrice] = useState(draft?.preDealPrice ?? '')
  const [price,       setPrice]       = useState(draft?.price       ?? '')
  const [quantity,    setQuantity]    = useState(draft?.quantity     ?? -1)
  const [shipping,    setShipping]    = useState(draft?.shipping     ?? [])
  const [status,      setStatus]      = useState('idle')
  const [errMsg,      setErrMsg]      = useState('')

  useEffect(() => {
    saveDraft({ step, images, name, description, categories, isDeal, discountPct, price, quantity, shipping })
  }, [step, images, name, description, categories, isDeal, price, quantity, shipping])

  const canNext = () => {
    if (step === 1) return images.length > 0
    if (step === 2) return name.trim().length > 0 && description.trim().length > 0
    if (step === 3) return parseInt(price) > 0
    return false
  }

  const next = () => { if (canNext()) setStep(s => s + 1) }
  const back = () => setStep(s => s - 1)

  const publish = async () => {
    if (status === 'publishing' || status === 'done') return
    setStatus('publishing'); setErrMsg('')
    try {
      await publishProduct({
        name:        name.trim(),
        description: description.trim(),
        price:       parseInt(price),
        images, quantity, categories, shipping,
        ...(() => {
          const pct = parseInt(discountPct)
          const p   = parseInt(price)
          if (isDeal && pct > 0 && pct < 100 && p > 0) {
            return {
              price:         Math.round(p * (1 - pct / 100)),
              originalPrice: p,
              isDeal:        true,
            }
          }
          return { price: p, originalPrice: 0, isDeal }
        })(),
        stall_id: `stall-${localStorage.getItem('bitsoko_npub')?.slice(0, 8) || 'default'}`,
      })
      setStatus('done')
      clearDraft()
      setTimeout(() => navigate('/shop'), 1800)
    } catch(e) {
      setErrMsg(e.message || 'Publish failed — check your connection')
      setStatus('error')
    }
  }

  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: "'Inter',sans-serif" }}>

      {/* Header */}
      <div style={{ background: C.white, borderBottom: `1px solid ${C.border}`, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, position: 'sticky', top: 0, zIndex: 50 }}>
        <button onClick={() => step === 1 ? navigate(-1) : back()} style={{ width: 36, height: 36, borderRadius: '50%', background: C.bg, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
          <ArrowLeft size={17} color={C.black}/>
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: C.black }}>New listing</div>
          <div style={{ fontSize: '0.68rem', color: C.muted }}>Step {step} of {STEPS.length}</div>
        </div>
        {(name || images.length > 0) && status === 'idle' && (
          <div style={{ fontSize: '0.65rem', color: C.muted, display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.green }}/>
            Draft saved
          </div>
        )}
      </div>

      <div style={{ padding: '24px 20px 160px' }}>
        <StepBar current={step}/>
        {step === 1 && <PhotoStep images={images} setImages={setImages}/>}
        {step === 2 && (
          <DetailsStep
            name={name} setName={setName}
            description={description} setDescription={setDescription}
            categories={categories} setCategories={setCategories}
            isDeal={isDeal} setIsDeal={setIsDeal}
            preDealPrice={preDealPrice} setPreDealPrice={setPreDealPrice}
            price={price} setPrice={setPrice}
            discountPct={discountPct} setDiscountPct={setDiscountPct}
            rate={rate}
          />
        )}
        {step === 3 && (
          <PriceStep
            price={price} setPrice={setPrice}
            quantity={quantity} setQuantity={setQuantity}
            shipping={shipping} setShipping={setShipping}
            rate={rate}
          />
        )}
        {step === 4 && (
          <PublishStep
            images={images} name={name} description={description}
            categories={categories} price={price} quantity={quantity}
            shipping={shipping} isDeal={isDeal}
            status={status} errMsg={errMsg}
            rate={rate}
          />
        )}
      </div>

      {/* Action bar */}
      <div style={{
        position: 'fixed', bottom: '64px', left: 0, right: 0,
        background: C.white, borderTop: `1px solid ${C.border}`,
        padding: '16px 20px', display: 'flex', gap: 12,
        boxShadow: '0 -4px 16px rgba(26,20,16,0.06)',
      }}>
        {step > 1 && (
          <button onClick={back} style={{ flex: 1, padding: '14px', background: C.bg, border: `1.5px solid ${C.border}`, borderRadius: 14, cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600, color: C.black, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <ArrowLeft size={16}/> Back
          </button>
        )}
        {step < 4 && (
          <button onClick={next} disabled={!canNext()} style={{
            flex: 2, padding: '14px',
            background: canNext() ? C.black : C.border,
            border: 'none', borderRadius: 14,
            cursor: canNext() ? 'pointer' : 'not-allowed',
            fontSize: '0.88rem', fontWeight: 700,
            color: canNext() ? C.white : C.muted,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            transition: 'all .2s',
          }}>
            Continue <ArrowRight size={16}/>
          </button>
        )}
        {step === 4 && (
          <button onClick={publish} disabled={status === 'publishing' || status === 'done'} style={{
            flex: 2, padding: '14px',
            background: status === 'done' ? C.green : C.black,
            border: 'none', borderRadius: 14,
            cursor: status === 'publishing' || status === 'done' ? 'not-allowed' : 'pointer',
            fontSize: '0.88rem', fontWeight: 700, color: C.white,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all .2s',
          }}>
            {status === 'publishing'
              ? <><Loader size={16} style={{ animation: 'spin 1s linear infinite' }}/> Publishing…</>
              : status === 'done'
              ? <><CheckCircle size={16}/> Published!</>
              : <><Zap size={16} fill={C.white} color={C.white}/> Publish listing</>
            }
          </button>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

