import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Package, Zap, Loader, Pencil, Check,
  Trash2, Eye, AlertCircle, CheckCircle,
  Store, BarChart2, X, ArrowLeft,
  Upload, Minus, Truck, Tag,
} from 'lucide-react'
import { getProductsByPubkey, saveProduct, getProfile } from '../lib/db'
import { publishProduct, deleteProductEvent, getPool, getReadRelays, DEFAULT_RELAYS, KINDS, uploadImage } from '../lib/nostrSync'
import { satsToKsh, useRate } from '../lib/rates'
import { nip19 } from 'nostr-tools'

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
}

const CATEGORIES = [
  'Electronics','Fashion','Food & Drinks','Art & Crafts',
  'Home & Living','Books','Music','Wellness',
  'Services','Collectibles','Sports','Other',
]

function getMyPubkeyHex() {
  try { return nip19.decode(localStorage.getItem('bitsoko_npub')).data } catch { return null }
}

// ── Delete confirm sheet ──────────────────────
function DeleteSheet({ product, onConfirm, onCancel, deleting }) {
  return (
    <>
      <div onClick={onCancel} style={{ position:'fixed',inset:0,zIndex:200,background:'rgba(26,20,16,0.5)',backdropFilter:'blur(2px)' }}/>
      <div style={{
        position:'fixed',bottom:0,left:0,right:0,zIndex:210,
        background:C.white,borderRadius:'20px 20px 0 0',
        padding:'20px 20px 40px',
        animation:'sheetUp .25s cubic-bezier(0.32,0.72,0,1)',
      }}>
        <div style={{ width:36,height:4,borderRadius:2,background:C.border,margin:'0 auto 20px' }}/>
        <div style={{ fontSize:'1rem',fontWeight:700,color:C.black,marginBottom:6 }}>Delete listing?</div>
        <div style={{ fontSize:'0.78rem',color:C.muted,marginBottom:20,lineHeight:1.6 }}>
          <strong>{product.name}</strong> will be removed from Bitsoko and Nostr relays. This cannot be undone.
        </div>
        <div style={{ display:'flex',gap:10 }}>
          <button onClick={onCancel} style={{
            flex:1,padding:'13px',background:C.bg,
            border:`1.5px solid ${C.border}`,borderRadius:14,
            cursor:'pointer',fontSize:'0.88rem',fontWeight:600,color:C.black,
          }}>Cancel</button>
          <button onClick={onConfirm} disabled={deleting} style={{
            flex:1,padding:'13px',background:C.red,border:'none',borderRadius:14,
            cursor:deleting?'not-allowed':'pointer',
            fontSize:'0.88rem',fontWeight:700,color:C.white,
            display:'flex',alignItems:'center',justifyContent:'center',gap:8,
          }}>
            {deleting ? <><Loader size={15} style={{animation:'spin 1s linear infinite'}}/> Deleting…</> : <><Trash2 size={15}/> Delete</>}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Edit sheet ────────────────────────────────
function EditSheet({ product, onSave, onCancel, rate }) {
  const [images,      setImages]      = useState(product.images      || [])
  const [name,        setName]        = useState(product.name        || '')
  const [description, setDescription] = useState(product.description || '')
  const [price,       setPrice]       = useState(String(product.price || ''))
  const [quantity,    setQuantity]    = useState(product.quantity     ?? -1)
  const [categories,  setCategories]  = useState(() => {
    const CATS = ['Electronics','Fashion','Food & Drinks','Art & Crafts','Home & Living','Books','Music','Wellness','Services','Collectibles','Sports','Other']
    const raw  = product.categories || []
    const normalized = raw
      .map(c => CATS.find(p => p.toLowerCase() === c.toLowerCase()) || c)
      .filter((c, i, arr) => arr.indexOf(c) === i)
    return normalized
  })
  const [isDeal,       setIsDeal]       = useState(() => (product.tags||[]).some(t=>t[0]==='t'&&t[1]==='deal'))
  const [discountPct,  setDiscountPct]  = useState(() => {
    const origTag = (product.tags||[]).find(t=>t[0]==='original_price')
    if (!origTag) return ''
    const orig = parseInt(origTag[1])
    const curr = product.price || 0
    if (orig > curr && orig > 0) return String(Math.round(((orig - curr) / orig) * 100))
    return ''
  })
  const [shipping,  setShipping]  = useState(product.shipping || [])
  const [uploading, setUploading] = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)
  const [errMsg,    setErrMsg]    = useState('')
  const [activeTab, setActiveTab] = useState('details')

  const ksh = price ? Math.round((parseInt(price)/100_000_000) * (rate || 13_000_000)) : 0

  const handleImageAdd = async (files) => {
    const arr = Array.from(files).slice(0, 4 - images.length)
    if (!arr.length) return
    setUploading(true); setErrMsg('')
    for (const file of arr) {
      if (!file.type.startsWith('image/')) continue
      try {
        const url = await uploadImage(file)
        setImages(prev => [...prev, url])
      } catch { setErrMsg('Image upload failed') }
    }
    setUploading(false)
  }

  const toggleDeal = () => {
    const turningOff = isDeal
    setIsDeal(d => !d)
    if (turningOff) {
      const origTag = (product.tags||[]).find(t=>t[0]==='original_price')
      if (origTag) setPrice(origTag[1])
      setDiscountPct('')
    }
  }

  const toggleCat = (cat) =>
    setCategories(prev => prev.includes(cat) ? prev.filter(c=>c!==cat) : [...prev, cat])
  const addShipping    = () => setShipping(prev=>[...prev,{name:'',cost:'',regions:''}])
  const removeShipping = (i) => setShipping(prev=>prev.filter((_,idx)=>idx!==i))
  const updateShipping = (i,field,val) =>
    setShipping(prev=>prev.map((s,idx)=>idx===i?{...s,[field]:val}:s))

  const handleSave = async () => {
    if (!name.trim()) { setErrMsg('Name is required'); return }
    setSaving(true); setErrMsg('')
    try {
      const discPct         = parseInt(discountPct)
      const currPrice       = parseInt(price)
      const salePrice       = isDeal && discPct > 0 && discPct < 100
        ? Math.round(currPrice * (1 - discPct / 100))
        : currPrice
      const computedOriginal = isDeal && discPct > 0 && discPct < 100 ? currPrice : 0
      await onSave({ images, name, description, price: salePrice, quantity, categories, shipping, isDeal, originalPrice: computedOriginal })
      setSaved(true)
      setTimeout(() => onCancel(), 1200)
    }
    catch (e) { setErrMsg(e.message||'Save failed'); setSaving(false) }
  }

  const TABS = [
    { id:'details',  label:'Details',  icon:Tag   },
    { id:'price',    label:'Price',    icon:Zap   },
    { id:'shipping', label:'Shipping', icon:Truck },
  ]

  return (
    <>
      <div onClick={onCancel} style={{ position:'fixed',inset:0,zIndex:200,background:'rgba(26,20,16,0.5)',backdropFilter:'blur(2px)' }}/>
      <div style={{
        position:'fixed',bottom:0,left:0,right:0,zIndex:210,
        background:C.white,borderRadius:'20px 20px 0 0',
        maxHeight:'90vh',display:'flex',flexDirection:'column',
        animation:'sheetUp .25s cubic-bezier(0.32,0.72,0,1)',
      }}>
        <div style={{ padding:'16px 20px 0',flexShrink:0 }}>
          <div style={{ width:36,height:4,borderRadius:2,background:C.border,margin:'0 auto 16px' }}/>
          <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16 }}>
            <div style={{ display:'flex',alignItems:'center',gap:10 }}>
              <button onClick={onCancel} style={{ width:32,height:32,borderRadius:'50%',background:C.bg,border:`1px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0 }}>
                <X size={15} color={C.muted}/>
              </button>
              <div style={{ fontSize:'1rem',fontWeight:700,color:C.black }}>Edit listing</div>
            </div>
            <button onClick={handleSave} disabled={saving||saved} style={{
              padding:'8px 18px',borderRadius:99,
              background:saved?C.muted:C.black,border:'none',
              cursor:saving||saved?'not-allowed':'pointer',fontSize:'0.78rem',fontWeight:700,color:C.white,
              display:'flex',alignItems:'center',gap:6,transition:'background 0.2s',
            }}>
              {saving ? <><Loader size={13} style={{animation:'spin 1s linear infinite'}}/> Saving…</> : saved ? <><Check size={13}/> Saved!</> : 'Save changes'}
            </button>
          </div>
          <div style={{ display:'flex',gap:4,background:C.bg,borderRadius:12,padding:4,marginBottom:4 }}>
            {TABS.map(({id,label,icon:Icon}) => (
              <button key={id} onClick={()=>setActiveTab(id)} style={{
                flex:1,padding:'8px 4px',borderRadius:9,
                background:activeTab===id?C.white:'transparent',border:'none',cursor:'pointer',
                fontSize:'0.72rem',fontWeight:activeTab===id?700:400,
                color:activeTab===id?C.black:C.muted,
                display:'flex',alignItems:'center',justifyContent:'center',gap:4,
                boxShadow:activeTab===id?'0 1px 4px rgba(26,20,16,0.08)':'none',transition:'all .15s',
              }}>
                <Icon size={12}/> {label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex:1,overflowY:'auto',padding:'16px 20px 32px' }}>
          {errMsg && (
            <div style={{ display:'flex',alignItems:'center',gap:8,padding:'10px 14px',borderRadius:10,marginBottom:14,background:'rgba(239,68,68,0.06)',border:`1px solid rgba(239,68,68,0.2)`,fontSize:'0.75rem',color:C.red }}>
              <AlertCircle size={14}/> {errMsg}
            </div>
          )}

          {activeTab === 'details' && (
            <div>
              <div style={{ marginBottom:18 }}>
                <div style={{ fontSize:'0.78rem',fontWeight:600,color:C.black,marginBottom:10 }}>Photos</div>
                <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8 }}>
                  {images.map((url,i) => (
                    <div key={url} style={{ aspectRatio:'1',borderRadius:10,overflow:'hidden',position:'relative',border:`2px solid ${i===0?C.ochre:C.border}` }}>
                      <img src={url} alt="" loading="eager" decoding="async"
                        style={{ width:'100%',height:'100%',objectFit:'cover',willChange:'transform' }}/>
                      <button onClick={()=>setImages(prev=>prev.filter((_,idx)=>idx!==i))} style={{
                        position:'absolute',top:3,right:3,width:18,height:18,borderRadius:'50%',
                        background:'rgba(0,0,0,0.6)',border:'none',
                        display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',
                      }}>
                        <X size={10} color={C.white}/>
                      </button>
                    </div>
                  ))}
                  {images.length < 4 && (
                    <label style={{ aspectRatio:'1',borderRadius:10,border:`2px dashed ${C.border}`,background:C.bg,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer' }}>
                      {uploading ? <Loader size={18} color={C.muted} style={{animation:'spin 1s linear infinite'}}/> : <Upload size={18} color={C.muted}/>}
                      <input type="file" accept="image/*" multiple style={{display:'none'}} onChange={e=>handleImageAdd(e.target.files)}/>
                    </label>
                  )}
                </div>
              </div>
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:'0.78rem',fontWeight:600,color:C.black,marginBottom:8 }}>Name *</div>
                <input value={name} onChange={e=>setName(e.target.value)} maxLength={100}
                  style={{ width:'100%',padding:'11px 14px',background:C.bg,border:`1.5px solid ${name?C.black:C.border}`,borderRadius:12,outline:'none',fontSize:'0.88rem',color:C.black,fontFamily:"'Inter',sans-serif",boxSizing:'border-box' }}/>
              </div>
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:'0.78rem',fontWeight:600,color:C.black,marginBottom:8 }}>Description</div>
                <textarea value={description} onChange={e=>setDescription(e.target.value)} maxLength={1000} rows={4}
                  style={{ width:'100%',padding:'11px 14px',background:C.bg,border:`1.5px solid ${description?C.black:C.border}`,borderRadius:12,outline:'none',resize:'none',fontSize:'0.85rem',color:C.black,lineHeight:1.6,fontFamily:"'Inter',sans-serif",boxSizing:'border-box' }}/>
              </div>
              <div>
                <div style={{ fontSize:'0.78rem',fontWeight:600,color:C.black,marginBottom:10 }}>Categories</div>
                <div style={{ display:'flex',flexWrap:'wrap',gap:8 }}>
                  {CATEGORIES.map(cat => {
                    const active = categories.includes(cat)
                    return (
                      <button key={cat} onClick={()=>toggleCat(cat)} style={{
                        padding:'6px 12px',borderRadius:99,
                        background:active?C.black:C.white,border:`1.5px solid ${active?C.black:C.border}`,
                        cursor:'pointer',fontSize:'0.72rem',fontWeight:active?700:400,
                        color:active?C.white:C.black,transition:'all .15s',
                      }}>{cat}</button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'price' && (
            <div>
              <div style={{ marginBottom:18 }}>
                <div style={{ fontSize:'0.78rem',fontWeight:600,color:C.black,marginBottom:8 }}>Price (sats) *</div>
                <div style={{ position:'relative' }}>
                  <div style={{ position:'absolute',left:14,top:'50%',transform:'translateY(-50%)' }}>
                    <Zap size={15} fill={C.orange} color={C.orange}/>
                  </div>
                  <input type="number" min="1" value={price} onChange={e=>setPrice(e.target.value)}
                    style={{ width:'100%',padding:'12px 14px 12px 36px',background:C.bg,border:`1.5px solid ${price?C.black:C.border}`,borderRadius:12,outline:'none',fontSize:'1rem',fontWeight:600,color:C.black,fontFamily:"'Inter',sans-serif",boxSizing:'border-box' }}/>
                </div>
                {price && <div style={{ fontSize:'0.72rem',color:C.muted,marginTop:6 }}>≈ KSh {ksh.toLocaleString()} at current rate</div>}
              </div>
              <div>
                <div style={{ fontSize:'0.78rem',fontWeight:600,color:C.black,marginBottom:8 }}>Quantity</div>
                <div style={{ display:'flex',alignItems:'center' }}>
                  <button onClick={()=>setQuantity(q=>Math.max(-1,q-1))} style={{ width:44,height:44,borderRadius:'12px 0 0 12px',background:C.white,border:`1.5px solid ${C.border}`,borderRight:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}><Minus size={16} color={C.black}/></button>
                  <div style={{ flex:1,height:44,background:C.white,border:`1.5px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.9rem',fontWeight:700,color:C.black }}>{quantity===-1?'Unlimited':quantity}</div>
                  <button onClick={()=>setQuantity(q=>q===-1?1:q+1)} style={{ width:44,height:44,borderRadius:'0 12px 12px 0',background:C.white,border:`1.5px solid ${C.border}`,borderLeft:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}><Plus size={16} color={C.black}/></button>
                </div>
                <div style={{ fontSize:'0.68rem',color:C.muted,marginTop:6 }}>Unlimited for digital goods or services</div>
              </div>

              <div style={{ marginTop:18,background:isDeal?'rgba(232,97,74,0.06)':C.white,border:`1.5px solid ${isDeal?'rgba(232,97,74,0.4)':C.border}`,borderRadius:14,padding:'14px 16px',display:'flex',alignItems:'center',gap:14,transition:'all 0.2s' }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13,fontWeight:700,color:C.black,marginBottom:3,display:'flex',alignItems:'center',gap:6 }}>
                    <Tag size={13} color={isDeal?'#e8614a':C.muted}/>
                    Mark as Deal
                    {isDeal && <span style={{ background:'#e8614a',color:'#fff',fontSize:9,fontWeight:800,padding:'2px 7px',borderRadius:99 }}>ACTIVE</span>}
                  </div>
                  <div style={{ fontSize:11,color:C.muted }}>Featured on the Deals page</div>
                </div>
                <button onClick={toggleDeal} style={{ width:48,height:26,borderRadius:13,flexShrink:0,background:isDeal?'#e8614a':C.border,border:'none',cursor:'pointer',position:'relative',transition:'background 0.2s' }}>
                  <div style={{ width:20,height:20,borderRadius:'50%',background:C.white,position:'absolute',top:3,left:isDeal?24:4,transition:'left 0.2s',boxShadow:'0 1px 4px rgba(0,0,0,0.2)' }}/>
                </button>
              </div>
              {isDeal && (
                <div style={{ marginTop:10,padding:'12px 14px',background:'rgba(232,97,74,0.04)',border:'1px solid rgba(232,97,74,0.15)',borderRadius:12 }}>
                  <div style={{ fontSize:12,fontWeight:600,color:'#e8614a',marginBottom:8 }}>Discount % — optional</div>
                  <div style={{ position:'relative' }}>
                    <input type="number" min="1" max="99" value={discountPct} onChange={e=>setDiscountPct(e.target.value)}
                      placeholder="e.g. 20 for 20% off"
                      style={{ width:'100%',padding:'10px 40px 10px 12px',background:C.white,border:'1px solid rgba(232,97,74,0.25)',borderRadius:10,outline:'none',fontSize:13,color:C.black,boxSizing:'border-box' }}/>
                    <span style={{ position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',fontSize:13,fontWeight:700,color:'#e8614a' }}>%</span>
                  </div>
                  {discountPct && parseInt(discountPct) > 0 && parseInt(price) > 0 && (
                    <div style={{ marginTop:8,fontSize:11,color:C.muted,display:'flex',gap:12,flexWrap:'wrap' }}>
                      <span>Was: <strong style={{ textDecoration:'line-through',color:C.muted }}>
                        {parseInt(price).toLocaleString()} sats
                      </strong></span>
                      <span>Now: <strong style={{ color:'#e8614a' }}>
                        {Math.round(parseInt(price)*(1-parseInt(discountPct)/100)).toLocaleString()} sats
                      </strong></span>
                      <span style={{ color:'#e8614a' }}>
                        ({satsToKsh(Math.round(parseInt(price)*(1-parseInt(discountPct)/100)), rate)})
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'shipping' && (
            <div>
              <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12 }}>
                <div style={{ fontSize:'0.78rem',fontWeight:600,color:C.black }}>Delivery options</div>
                <button onClick={addShipping} style={{ display:'flex',alignItems:'center',gap:4,background:'none',border:'none',cursor:'pointer',fontSize:'0.75rem',fontWeight:600,color:C.ochre }}>
                  <Plus size={14}/> Add option
                </button>
              </div>
              {shipping.length === 0 && (
                <div style={{ padding:'20px',borderRadius:12,background:C.bg,border:`1px dashed ${C.border}`,textAlign:'center',fontSize:'0.75rem',color:C.muted }}>
                  No delivery options yet — tap Add option
                </div>
              )}
              {shipping.map((s,i) => (
                <div key={i} style={{ background:C.bg,border:`1px solid ${C.border}`,borderRadius:12,padding:'14px',marginBottom:10 }}>
                  <div style={{ display:'flex',justifyContent:'space-between',marginBottom:10 }}>
                    <span style={{ fontSize:'0.75rem',fontWeight:600,color:C.black }}>Option {i+1}</span>
                    <button onClick={()=>removeShipping(i)} style={{ background:'none',border:'none',cursor:'pointer' }}><X size={15} color={C.muted}/></button>
                  </div>
                  {[
                    { field:'name',    placeholder:'e.g. Nairobi CBD pickup, DHL Kenya' },
                    { field:'cost',    placeholder:'Cost in sats (0 for free)'          },
                    { field:'regions', placeholder:'Regions e.g. Nairobi, Kenya, EA'    },
                  ].map(({field,placeholder}) => (
                    <input key={field} value={s[field]} onChange={e=>updateShipping(i,field,e.target.value)}
                      placeholder={placeholder}
                      style={{ width:'100%',padding:'9px 12px',marginBottom:8,background:C.white,border:`1px solid ${C.border}`,borderRadius:8,outline:'none',fontSize:'0.8rem',color:C.black,fontFamily:"'Inter',sans-serif",boxSizing:'border-box' }}/>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── Product row ───────────────────────────────
function ProductRow({ product, onEdit, onDelete, onView, rate }) {
  const image = product.images?.[0]
  const [imgErr, setImgErr] = useState(false)
  return (
    <div style={{ background:C.white,borderRadius:14,border:`1px solid ${C.border}`,padding:'12px',display:'flex',gap:12,alignItems:'center' }}>
      <div style={{ width:60,height:60,borderRadius:10,overflow:'hidden',background:C.border,flexShrink:0 }}>
        {image && !imgErr
          ? <img src={image} alt={product.name} onError={()=>setImgErr(true)} loading="eager" decoding="async"
              style={{ width:'100%',height:'100%',objectFit:'cover',willChange:'transform' }}/>
          : <div style={{ width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center' }}>
              <Package size={22} color="rgba(26,20,16,0.2)"/>
            </div>
        }
      </div>
      <div style={{ flex:1,minWidth:0 }}>
        <div style={{ fontSize:'0.85rem',fontWeight:700,color:C.black,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginBottom:3 }}>
          {product.name || 'Untitled'}
        </div>
        <div style={{ display:'flex',alignItems:'center',gap:4,marginBottom:3,flexWrap:'wrap' }}>
          {product.originalPrice > product.price && product.originalPrice > 0 && (
            <span style={{ fontSize:'0.68rem',color:C.muted,textDecoration:'line-through' }}>{product.originalPrice?.toLocaleString()} sats</span>
          )}
          <Zap size={11} fill={C.orange} color={C.orange}/>
          <span style={{ fontSize:'0.75rem',fontWeight:700,color:C.black }}>{product.price?.toLocaleString()} sats</span>
          <span style={{ fontSize:'0.68rem',color:C.muted }}>· {satsToKsh(product.price, rate)}</span>
        </div>
        <div style={{ fontSize:'0.65rem',color:C.muted }}>
          {product.quantity===-1?'Unlimited stock':`${product.quantity} left`}
          {product.shipping?.length>0&&` · ${product.shipping.length} delivery option${product.shipping.length!==1?'s':''}`}
        </div>
      </div>
      <div style={{ display:'flex',flexDirection:'column',gap:6,flexShrink:0 }}>
        <button onClick={onView} style={{ width:32,height:32,borderRadius:8,background:C.bg,border:`1px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer' }}>
          <Eye size={14} color={C.muted}/>
        </button>
        <button onClick={onEdit} style={{ width:32,height:32,borderRadius:8,background:C.bg,border:`1px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer' }}>
          <Pencil size={14} color={C.black}/>
        </button>
        <button onClick={onDelete} style={{ width:32,height:32,borderRadius:8,background:'rgba(239,68,68,0.06)',border:`1px solid rgba(239,68,68,0.15)`,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer' }}>
          <Trash2 size={14} color={C.red}/>
        </button>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────
export default function MyShop() {
  const navigate  = useNavigate()
  const pubkeyHex = getMyPubkeyHex()
  const rate      = useRate() // ← live BTC/KES rate

  const [products,    setProducts]    = useState([])
  const [profile,     setProfile]     = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [editProduct, setEditProduct] = useState(null)
  const [delProduct,  setDelProduct]  = useState(null)
  const [deleting,    setDeleting]    = useState(false)
  const [toast,       setToast]       = useState('')

  const showToast = (msg) => { setToast(msg); setTimeout(()=>setToast(''), 2500) }

  useEffect(() => {
    let mounted = true
    const load = async () => {
      if (!pubkeyHex) { setLoading(false); return }

      const [cached, prof] = await Promise.all([
        getProductsByPubkey(pubkeyHex),
        getProfile(pubkeyHex),
      ])
      if (mounted) {
        setProducts(cached.filter(p => p.status !== 'deleted' && !p.tags?.some(t=>t[0]==='t'&&t[1]==='deleted')))
        setProfile(prof)
        setLoading(false)
      }

      try {
        const relays = [...new Set([...getReadRelays(), ...DEFAULT_RELAYS])]
        const events = await getPool().querySync(relays, { kinds:[KINDS.LISTING], authors:[pubkeyHex], limit:500 })
        if (!events.length || !mounted) return

        const map = new Map()
        for (const e of events) {
          const dTag = (e.tags||[]).find(t=>t[0]==='d')?.[1]
          const key  = dTag ? `${e.pubkey}:${dTag}` : e.id
          const ex   = map.get(key)
          if (!ex || e.created_at >= ex.created_at) map.set(key, e)
        }
        for (const e of map.values()) await saveProduct(e)

        const fresh = await getProductsByPubkey(pubkeyHex)
        if (mounted) setProducts(fresh.filter(p =>
          p.status !== 'deleted' && !p.tags?.some(t=>t[0]==='t'&&t[1]==='deleted')
        ))
      } catch(e) { console.warn('[bitsoko] MyShop relay refresh:', e) }
    }
    load()
    return () => { mounted = false }
  }, [pubkeyHex])

  const handleDelete = async () => {
    if (!delProduct) return
    setDeleting(true)
    try {
      await deleteProductEvent(delProduct.id, delProduct.raw)
      setProducts(prev => prev.filter(p => p.id !== delProduct.id))
      setDelProduct(null)
      showToast('Listing deleted')
    } catch { showToast('Delete failed — try again') }
    setDeleting(false)
  }

  const handleSaveEdit = async ({ images, name, description, price, quantity, categories, shipping, isDeal, originalPrice }) => {
    await publishProduct({ name, description, price, images, quantity, categories, shipping, productId: editProduct.id, isDeal, originalPrice })
    const prods = await getProductsByPubkey(pubkeyHex)
    setProducts(prods.filter(p => p.status !== 'deleted' && !p.tags?.some(t=>t[0]==='t'&&t[1]==='deleted')))
    setEditProduct(null)
    showToast('Listing updated!')
  }

  const totalSats = products.reduce((s, p) => s + (p.price||0), 0)
  const storeName = profile?.display_name || profile?.name || 'My Shop'

  return (
    <div style={{ background:C.bg,minHeight:'100vh',fontFamily:"'Inter',sans-serif",paddingBottom:120 }}>

      {/* Header */}
      <div style={{ background:C.white,borderBottom:`1px solid ${C.border}`,padding:'16px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:50 }}>
        <div style={{ display:'flex',alignItems:'center',gap:14 }}>
          <button onClick={()=>navigate('/', { state: { openMore: true } })} style={{ width:36,height:36,borderRadius:'50%',background:C.bg,border:`1px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer' }}>
            <ArrowLeft size={17} color={C.black}/>
          </button>
          <div>
            <div style={{ fontSize:'1rem',fontWeight:700,color:C.black }}>{storeName}</div>
            <div style={{ fontSize:'0.68rem',color:C.muted }}>{products.length} active listing{products.length!==1?'s':''}</div>
          </div>
        </div>
        <div style={{ display:'flex',gap:8 }}>
          <button onClick={()=>navigate('/shop/analytics')} style={{
            display:'flex',alignItems:'center',gap:5,
            padding:'9px 14px',borderRadius:99,
            background:C.bg,border:`1px solid ${C.border}`,
            cursor:'pointer',fontSize:'0.75rem',fontWeight:600,color:C.ochre,
          }}>
            <BarChart2 size={14} color={C.ochre}/> Analytics
          </button>
          <button onClick={()=>navigate('/create-listing')} style={{
            display:'flex',alignItems:'center',gap:6,
            padding:'9px 16px',borderRadius:99,
            background:C.black,border:'none',cursor:'pointer',
            fontSize:'0.78rem',fontWeight:700,color:C.white,
          }}>
            <Plus size={14}/> List
          </button>
        </div>
      </div>

      <div style={{ padding:'20px' }}>
        {/* Stats */}
        <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:20 }}>
          <div style={{ background:C.white,borderRadius:14,border:`1px solid ${C.border}`,padding:'14px 16px' }}>
            <div style={{ fontSize:'0.65rem',color:C.muted,marginBottom:6,textTransform:'uppercase',letterSpacing:'0.08em' }}>Listings</div>
            <div style={{ fontSize:'1.6rem',fontWeight:800,color:C.black }}>{products.length}</div>
          </div>
          <div style={{ background:C.white,borderRadius:14,border:`1px solid ${C.border}`,padding:'14px 16px' }}>
            <div style={{ fontSize:'0.65rem',color:C.muted,marginBottom:6,textTransform:'uppercase',letterSpacing:'0.08em' }}>Catalog value</div>
            <div style={{ display:'flex',alignItems:'center',gap:4 }}>
              <Zap size={14} fill={C.orange} color={C.orange}/>
              <span style={{ fontSize:'1.1rem',fontWeight:800,color:C.black }}>{totalSats.toLocaleString()}</span>
            </div>
            <div style={{ fontSize:'0.65rem',color:C.muted,marginTop:2 }}>{satsToKsh(totalSats, rate)}</div>
          </div>
        </div>

        {loading && (
          <div style={{ display:'flex',justifyContent:'center',padding:'48px 0' }}>
            <Loader size={24} color={C.ochre} style={{ animation:'spin 1s linear infinite' }}/>
          </div>
        )}

        {!loading && products.length === 0 && (
          <div style={{ textAlign:'center',padding:'48px 20px',display:'flex',flexDirection:'column',alignItems:'center',gap:12 }}>
            <Store size={44} color={C.border}/>
            <div style={{ fontSize:'0.95rem',fontWeight:700,color:C.black }}>No listings yet</div>
            <div style={{ fontSize:'0.78rem',color:C.muted }}>Add your first product to start selling</div>
            <button onClick={()=>navigate('/create-listing')} style={{ marginTop:8,padding:'12px 28px',background:C.black,border:'none',borderRadius:12,cursor:'pointer',fontSize:'0.88rem',fontWeight:700,color:C.white,display:'flex',alignItems:'center',gap:8 }}>
              <Plus size={16}/> List a product
            </button>
          </div>
        )}

        {!loading && products.length > 0 && (
          <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
            {products.map(p => (
              <ProductRow key={p.id} product={p}
                onView  ={()=>navigate(`/product/${p.id}`)}
                onEdit  ={()=>setEditProduct(p)}
                onDelete={()=>setDelProduct(p)}
                rate={rate}
              />
            ))}
          </div>
        )}
      </div>

      {editProduct && <EditSheet product={editProduct} onSave={handleSaveEdit} onCancel={()=>setEditProduct(null)} rate={rate}/>}
      {delProduct  && <DeleteSheet product={delProduct} onConfirm={handleDelete} onCancel={()=>setDelProduct(null)} deleting={deleting}/>}

      {toast && (
        <div style={{ position:'fixed',top:80,left:'50%',transform:'translateX(-50%)',zIndex:300,background:C.black,color:C.white,padding:'10px 20px',borderRadius:99,fontSize:'0.78rem',fontWeight:600,display:'flex',alignItems:'center',gap:8,boxShadow:'0 4px 20px rgba(26,20,16,0.2)',animation:'fadeIn .2s ease',whiteSpace:'nowrap' }}>
          <CheckCircle size={14} color={C.green}/> {toast}
        </div>
      )}

      <style>{`
        @keyframes spin    { to { transform: rotate(360deg) } }
        @keyframes sheetUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
        @keyframes fadeIn  { from { opacity:0;transform:translateX(-50%) translateY(-8px) } to { opacity:1;transform:translateX(-50%) translateY(0) } }
      `}</style>
    </div>
  )
}

