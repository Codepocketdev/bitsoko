import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Package, Zap, Loader, Pencil,
  Trash2, Eye, AlertCircle, CheckCircle,
  Store, TrendingUp, X, ArrowLeft,
  Upload, Image as ImageIcon, Minus,
  Truck, Tag, Check
} from 'lucide-react'
import { getProductsByPubkey, deleteProduct, saveProduct } from '../lib/db'
import { publishProduct, deleteProductEvent, getPool, RELAYS, uploadImage } from '../lib/nostrSync'
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

function satsToKsh(sats) {
  const ksh = (sats / 100_000_000) * 13_000_000
  if (ksh >= 1000) return `KSh ${(ksh/1000).toFixed(1)}k`
  return `KSh ${Math.round(ksh)}`
}

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
          }}>
            Cancel
          </button>
          <button onClick={onConfirm} disabled={deleting} style={{
            flex:1,padding:'13px',
            background:C.red,border:'none',borderRadius:14,
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
function EditSheet({ product, onSave, onCancel }) {
  const [images,      setImages]      = useState(product.images      || [])
  const [name,        setName]        = useState(product.name        || '')
  const [description, setDescription] = useState(product.description || '')
  const [price,       setPrice]       = useState(String(product.price || ''))
  const [quantity,    setQuantity]    = useState(product.quantity     ?? -1)
  const [categories,  setCategories]  = useState(
    (product.tags || []).filter(t => t[0]==='t' && !['bitsoko','bitcoin','deleted'].includes(t[1])).map(t=>t[1])
  )
  const [shipping,    setShipping]    = useState(product.shipping    || [])
  const [uploading,   setUploading]   = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [errMsg,      setErrMsg]      = useState('')
  const [activeTab,   setActiveTab]   = useState('details') // details | price | shipping

  const ksh = price ? Math.round((parseInt(price)/100_000_000)*13_000_000) : 0

  const handleImageAdd = async (files) => {
    const arr = Array.from(files).slice(0, 4 - images.length)
    if (!arr.length) return
    setUploading(true); setErrMsg('')
    for (const file of arr) {
      if (!file.type.startsWith('image/')) continue
      try {
        const url = await uploadImage(file)
        setImages(prev => [...prev, url])
      } catch (e) { setErrMsg('Image upload failed') }
    }
    setUploading(false)
  }

  const toggleCat = (cat) =>
    setCategories(prev => prev.includes(cat) ? prev.filter(c=>c!==cat) : [...prev, cat])

  const addShipping    = () => setShipping(prev => [...prev, { name:'', cost:'', regions:'' }])
  const removeShipping = (i) => setShipping(prev => prev.filter((_,idx)=>idx!==i))
  const updateShipping = (i, field, val) =>
    setShipping(prev => prev.map((s,idx) => idx===i ? {...s,[field]:val} : s))

  const handleSave = async () => {
    if (!name.trim())        { setErrMsg('Name is required'); return }
    if (!parseInt(price) > 0){ setErrMsg('Price is required'); return }
    setSaving(true); setErrMsg('')
    try {
      await onSave({ images, name, description, price:parseInt(price), quantity, categories, shipping })
    } catch (e) {
      setErrMsg(e.message || 'Save failed')
      setSaving(false)
    }
  }

  const TABS = [
    { id:'details',  label:'Details', icon:Tag   },
    { id:'price',    label:'Price',   icon:Zap   },
    { id:'shipping', label:'Shipping',icon:Truck },
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
        {/* Sheet header */}
        <div style={{ padding:'16px 20px 0',flexShrink:0 }}>
          <div style={{ width:36,height:4,borderRadius:2,background:C.border,margin:'0 auto 16px' }}/>
          <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16 }}>
            <div style={{ fontSize:'1rem',fontWeight:700,color:C.black }}>Edit listing</div>
            <button onClick={handleSave} disabled={saving} style={{
              padding:'8px 18px',borderRadius:99,
              background:C.black,border:'none',
              cursor:saving?'not-allowed':'pointer',
              fontSize:'0.78rem',fontWeight:700,color:C.white,
              display:'flex',alignItems:'center',gap:6,
            }}>
              {saving ? <><Loader size={13} style={{animation:'spin 1s linear infinite'}}/> Saving…</> : 'Save changes'}
            </button>
          </div>

          {/* Tab bar */}
          <div style={{ display:'flex',gap:4,background:C.bg,borderRadius:12,padding:4,marginBottom:4 }}>
            {TABS.map(({id,label,icon:Icon}) => (
              <button key={id} onClick={() => setActiveTab(id)} style={{
                flex:1,padding:'8px 4px',borderRadius:9,
                background:activeTab===id ? C.white : 'transparent',
                border:'none',cursor:'pointer',
                fontSize:'0.72rem',fontWeight:activeTab===id ? 700 : 400,
                color:activeTab===id ? C.black : C.muted,
                display:'flex',alignItems:'center',justifyContent:'center',gap:4,
                boxShadow:activeTab===id ? '0 1px 4px rgba(26,20,16,0.08)' : 'none',
                transition:'all .15s',
              }}>
                <Icon size={12}/> {label}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{ flex:1,overflowY:'auto',padding:'16px 20px 32px' }}>

          {errMsg && (
            <div style={{
              display:'flex',alignItems:'center',gap:8,
              padding:'10px 14px',borderRadius:10,marginBottom:14,
              background:'rgba(239,68,68,0.06)',border:`1px solid rgba(239,68,68,0.2)`,
              fontSize:'0.75rem',color:C.red,fontFamily:"'Inter',sans-serif",
            }}>
              <AlertCircle size={14}/> {errMsg}
            </div>
          )}

          {/* ── Details tab ── */}
          {activeTab === 'details' && (
            <div>
              {/* Photos */}
              <div style={{ marginBottom:18 }}>
                <div style={{ fontSize:'0.78rem',fontWeight:600,color:C.black,marginBottom:10 }}>Photos</div>
                <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8 }}>
                  {images.map((url,i) => (
                    <div key={url} style={{
                      aspectRatio:'1',borderRadius:10,overflow:'hidden',
                      position:'relative',border:`2px solid ${i===0?C.ochre:C.border}`,
                    }}>
                      <img src={url} alt="" style={{ width:'100%',height:'100%',objectFit:'cover' }}/>
                      <button onClick={() => setImages(prev=>prev.filter((_,idx)=>idx!==i))} style={{
                        position:'absolute',top:3,right:3,
                        width:18,height:18,borderRadius:'50%',
                        background:'rgba(0,0,0,0.6)',border:'none',
                        display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',
                      }}>
                        <X size={10} color={C.white}/>
                      </button>
                    </div>
                  ))}
                  {images.length < 4 && (
                    <label style={{
                      aspectRatio:'1',borderRadius:10,
                      border:`2px dashed ${C.border}`,background:C.bg,
                      display:'flex',alignItems:'center',justifyContent:'center',
                      cursor:'pointer',
                    }}>
                      {uploading
                        ? <Loader size={18} color={C.muted} style={{animation:'spin 1s linear infinite'}}/>
                        : <Upload size={18} color={C.muted}/>
                      }
                      <input type="file" accept="image/*" multiple style={{display:'none'}}
                        onChange={e => handleImageAdd(e.target.files)}/>
                    </label>
                  )}
                </div>
              </div>

              {/* Name */}
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:'0.78rem',fontWeight:600,color:C.black,marginBottom:8 }}>Name *</div>
                <input value={name} onChange={e=>setName(e.target.value)} maxLength={100}
                  style={{
                    width:'100%',padding:'11px 14px',background:C.bg,
                    border:`1.5px solid ${name?C.black:C.border}`,borderRadius:12,
                    outline:'none',fontSize:'0.88rem',color:C.black,
                    fontFamily:"'Inter',sans-serif",boxSizing:'border-box',
                  }}/>
              </div>

              {/* Description */}
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:'0.78rem',fontWeight:600,color:C.black,marginBottom:8 }}>Description</div>
                <textarea value={description} onChange={e=>setDescription(e.target.value)}
                  maxLength={1000} rows={4}
                  style={{
                    width:'100%',padding:'11px 14px',background:C.bg,
                    border:`1.5px solid ${description?C.black:C.border}`,borderRadius:12,
                    outline:'none',resize:'none',fontSize:'0.85rem',color:C.black,
                    lineHeight:1.6,fontFamily:"'Inter',sans-serif",boxSizing:'border-box',
                  }}/>
              </div>

              {/* Categories */}
              <div>
                <div style={{ fontSize:'0.78rem',fontWeight:600,color:C.black,marginBottom:10 }}>Categories</div>
                <div style={{ display:'flex',flexWrap:'wrap',gap:8 }}>
                  {CATEGORIES.map(cat => {
                    const active = categories.includes(cat)
                    return (
                      <button key={cat} onClick={() => toggleCat(cat)} style={{
                        padding:'6px 12px',borderRadius:99,
                        background:active?C.black:C.white,
                        border:`1.5px solid ${active?C.black:C.border}`,
                        cursor:'pointer',fontSize:'0.72rem',
                        fontWeight:active?700:400,
                        color:active?C.white:C.black,
                        transition:'all .15s',
                      }}>
                        {cat}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── Price tab ── */}
          {activeTab === 'price' && (
            <div>
              <div style={{ marginBottom:18 }}>
                <div style={{ fontSize:'0.78rem',fontWeight:600,color:C.black,marginBottom:8 }}>Price (sats) *</div>
                <div style={{ position:'relative' }}>
                  <div style={{ position:'absolute',left:14,top:'50%',transform:'translateY(-50%)' }}>
                    <Zap size={15} fill={C.orange} color={C.orange}/>
                  </div>
                  <input type="number" min="1" value={price} onChange={e=>setPrice(e.target.value)}
                    style={{
                      width:'100%',padding:'12px 14px 12px 36px',background:C.bg,
                      border:`1.5px solid ${price?C.black:C.border}`,borderRadius:12,
                      outline:'none',fontSize:'1rem',fontWeight:600,color:C.black,
                      fontFamily:"'Inter',sans-serif",boxSizing:'border-box',
                    }}/>
                </div>
                {price && (
                  <div style={{ fontSize:'0.72rem',color:C.muted,marginTop:6 }}>
                    ≈ KSh {ksh.toLocaleString()} at current rate
                  </div>
                )}
              </div>

              <div>
                <div style={{ fontSize:'0.78rem',fontWeight:600,color:C.black,marginBottom:8 }}>Quantity</div>
                <div style={{ display:'flex',alignItems:'center' }}>
                  <button onClick={() => setQuantity(q=>Math.max(-1,q-1))} style={{
                    width:44,height:44,borderRadius:'12px 0 0 12px',
                    background:C.white,border:`1.5px solid ${C.border}`,borderRight:'none',
                    cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',
                  }}>
                    <Minus size={16} color={C.black}/>
                  </button>
                  <div style={{
                    flex:1,height:44,background:C.white,border:`1.5px solid ${C.border}`,
                    display:'flex',alignItems:'center',justifyContent:'center',
                    fontSize:'0.9rem',fontWeight:700,color:C.black,
                  }}>
                    {quantity===-1 ? 'Unlimited' : quantity}
                  </div>
                  <button onClick={() => setQuantity(q=>q===-1?1:q+1)} style={{
                    width:44,height:44,borderRadius:'0 12px 12px 0',
                    background:C.white,border:`1.5px solid ${C.border}`,borderLeft:'none',
                    cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',
                  }}>
                    <Plus size={16} color={C.black}/>
                  </button>
                </div>
                <div style={{ fontSize:'0.68rem',color:C.muted,marginTop:6 }}>
                  Unlimited for digital goods or services
                </div>
              </div>
            </div>
          )}

          {/* ── Shipping tab ── */}
          {activeTab === 'shipping' && (
            <div>
              <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12 }}>
                <div style={{ fontSize:'0.78rem',fontWeight:600,color:C.black }}>Delivery options</div>
                <button onClick={addShipping} style={{
                  display:'flex',alignItems:'center',gap:4,
                  background:'none',border:'none',cursor:'pointer',
                  fontSize:'0.75rem',fontWeight:600,color:C.ochre,
                }}>
                  <Plus size={14}/> Add option
                </button>
              </div>

              {shipping.length === 0 && (
                <div style={{
                  padding:'20px',borderRadius:12,background:C.bg,
                  border:`1px dashed ${C.border}`,textAlign:'center',
                  fontSize:'0.75rem',color:C.muted,
                }}>
                  No delivery options yet — tap Add option
                </div>
              )}

              {shipping.map((s,i) => (
                <div key={i} style={{
                  background:C.bg,border:`1px solid ${C.border}`,
                  borderRadius:12,padding:'14px',marginBottom:10,
                }}>
                  <div style={{ display:'flex',justifyContent:'space-between',marginBottom:10 }}>
                    <span style={{ fontSize:'0.75rem',fontWeight:600,color:C.black }}>Option {i+1}</span>
                    <button onClick={() => removeShipping(i)} style={{ background:'none',border:'none',cursor:'pointer' }}>
                      <X size={15} color={C.muted}/>
                    </button>
                  </div>
                  {[
                    { field:'name',    placeholder:'e.g. Nairobi CBD pickup, DHL Kenya' },
                    { field:'cost',    placeholder:'Cost in sats (0 for free)'          },
                    { field:'regions', placeholder:'Regions e.g. Nairobi, Kenya, EA'    },
                  ].map(({ field, placeholder }) => (
                    <input key={field} value={s[field]} onChange={e=>updateShipping(i,field,e.target.value)}
                      placeholder={placeholder}
                      style={{
                        width:'100%',padding:'9px 12px',marginBottom:8,
                        background:C.white,border:`1px solid ${C.border}`,
                        borderRadius:8,outline:'none',
                        fontSize:'0.8rem',color:C.black,
                        fontFamily:"'Inter',sans-serif",boxSizing:'border-box',
                      }}/>
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
function ProductRow({ product, onEdit, onDelete, onView }) {
  const image = product.images?.[0]
  const [imgErr, setImgErr] = useState(false)
  return (
    <div style={{
      background:C.white,borderRadius:14,
      border:`1px solid ${C.border}`,padding:'12px',
      display:'flex',gap:12,alignItems:'center',
    }}>
      {/* Thumbnail */}
      <div style={{
        width:60,height:60,borderRadius:10,overflow:'hidden',
        background:C.border,flexShrink:0,
      }}>
        {image && !imgErr
          ? <img src={image} alt={product.name} onError={()=>setImgErr(true)}
              style={{ width:'100%',height:'100%',objectFit:'cover' }}/>
          : <div style={{ width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center' }}>
              <Package size={22} color="rgba(26,20,16,0.2)"/>
            </div>
        }
      </div>

      {/* Info */}
      <div style={{ flex:1,minWidth:0 }}>
        <div style={{
          fontSize:'0.85rem',fontWeight:700,color:C.black,
          overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',
          marginBottom:3,
        }}>
          {product.name || 'Untitled'}
        </div>
        <div style={{ display:'flex',alignItems:'center',gap:4,marginBottom:3 }}>
          <Zap size={11} fill={C.orange} color={C.orange}/>
          <span style={{ fontSize:'0.75rem',fontWeight:700,color:C.black }}>
            {product.price?.toLocaleString()} sats
          </span>
          <span style={{ fontSize:'0.68rem',color:C.muted }}>
            · {satsToKsh(product.price)}
          </span>
        </div>
        <div style={{ fontSize:'0.65rem',color:C.muted }}>
          {product.quantity===-1 ? 'Unlimited stock' : `${product.quantity} left`}
          {product.shipping?.length > 0 && ` · ${product.shipping.length} delivery option${product.shipping.length!==1?'s':''}`}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display:'flex',flexDirection:'column',gap:6,flexShrink:0 }}>
        <button onClick={onView} style={{
          width:32,height:32,borderRadius:8,
          background:C.bg,border:`1px solid ${C.border}`,
          display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',
        }}>
          <Eye size={14} color={C.muted}/>
        </button>
        <button onClick={onEdit} style={{
          width:32,height:32,borderRadius:8,
          background:C.bg,border:`1px solid ${C.border}`,
          display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',
        }}>
          <Pencil size={14} color={C.black}/>
        </button>
        <button onClick={onDelete} style={{
          width:32,height:32,borderRadius:8,
          background:'rgba(239,68,68,0.06)',border:`1px solid rgba(239,68,68,0.15)`,
          display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',
        }}>
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

  const [products,    setProducts]    = useState([])
  const [profile,     setProfile]     = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [editProduct, setEditProduct] = useState(null)
  const [delProduct,  setDelProduct]  = useState(null)
  const [deleting,    setDeleting]    = useState(false)
  const [toast,       setToast]       = useState('')
  const [activeChart, setActiveChart] = useState('week') // week | month | year

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  // ── Load my products ──────────────────────
  useEffect(() => {
    let mounted = true
    const load = async () => {
      if (!pubkeyHex) { setLoading(false); return }
      const [prods, prof] = await Promise.all([
        getProductsByPubkey(pubkeyHex),
        import('../lib/db').then(m => m.getProfile(pubkeyHex)),
      ])
      if (mounted) {
        setProducts(prods.filter(p =>
          !p.tags?.some(t => t[0]==='t' && t[1]==='deleted')
        ))
        setProfile(prof)
        setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [pubkeyHex])

  // ── Delete ────────────────────────────────
  const handleDelete = async () => {
    if (!delProduct) return
    setDeleting(true)
    try {
      await deleteProductEvent(delProduct.id, delProduct.raw)
      setProducts(prev => prev.filter(p => p.id !== delProduct.id))
      setDelProduct(null)
      showToast('Listing deleted')
    } catch (e) {
      showToast('Delete failed — try again')
    }
    setDeleting(false)
  }

  // ── Edit / republish ──────────────────────
  const handleSaveEdit = async ({ images, name, description, price, quantity, categories, shipping }) => {
    const stall_id = `stall-${pubkeyHex?.slice(0,8) || 'default'}`
    await publishProduct({
      name, description, price, images,
      quantity, categories, shipping,
      stall_id,
      productId: editProduct.id,
    })
    const prods = await getProductsByPubkey(pubkeyHex)
    setProducts(prods.filter(p =>
      !p.tags?.some(t => t[0]==='t' && t[1]==='deleted')
    ))
    setEditProduct(null)
    showToast('Listing updated!')
  }

  const totalSats = products.reduce((sum, p) => sum + (p.price || 0), 0)
  const storeName = profile?.display_name || profile?.name || 'My Shop'

  // ── Build chart data from orders in IndexedDB ──
  // Since orders are encrypted DMs we use listing created_at as proxy
  // Real sales data would come from parsed kind:4 orders
  const now = Math.floor(Date.now() / 1000)
  const DAY = 86400

  const chartData = (() => {
    if (activeChart === 'week') {
      return Array.from({ length: 7 }, (_, i) => {
        const dayStart = now - (6 - i) * DAY
        const dayEnd   = dayStart + DAY
        const label    = new Date(dayStart * 1000).toLocaleDateString('en', { weekday: 'short' })
        const count    = products.filter(p => p.created_at >= dayStart && p.created_at < dayEnd).length
        return { label, count }
      })
    }
    if (activeChart === 'month') {
      return Array.from({ length: 4 }, (_, i) => {
        const weekStart = now - (3 - i) * 7 * DAY
        const weekEnd   = weekStart + 7 * DAY
        const label     = `W${i + 1}`
        const count     = products.filter(p => p.created_at >= weekStart && p.created_at < weekEnd).length
        return { label, count }
      })
    }
    // year
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(); d.setMonth(d.getMonth() - (11 - i)); d.setDate(1)
      const monthStart = Math.floor(d.getTime() / 1000)
      const nextMonth  = new Date(d); nextMonth.setMonth(nextMonth.getMonth() + 1)
      const monthEnd   = Math.floor(nextMonth.getTime() / 1000)
      const label      = d.toLocaleDateString('en', { month: 'short' })
      const count      = products.filter(p => p.created_at >= monthStart && p.created_at < monthEnd).length
      return { label, count }
    })
  })()

  const maxCount = Math.max(...chartData.map(d => d.count), 1)

  return (
    <div style={{ background:C.bg,minHeight:'100vh',fontFamily:"'Inter',sans-serif",paddingBottom:120 }}>

      {/* Header */}
      <div style={{
        background:C.white,borderBottom:`1px solid ${C.border}`,
        padding:'16px 20px',
        display:'flex',alignItems:'center',justifyContent:'space-between',
        position:'sticky',top:0,zIndex:50,
      }}>
        <div style={{ display:'flex',alignItems:'center',gap:14 }}>
          <button onClick={() => navigate('/', { state: { openMore: true } })} style={{
            width:36,height:36,borderRadius:'50%',
            background:C.bg,border:`1px solid ${C.border}`,
            display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',
          }}>
            <ArrowLeft size={17} color={C.black}/>
          </button>
          <div>
            <div style={{ fontSize:'1rem',fontWeight:700,color:C.black }}>{storeName}</div>
            <div style={{ fontSize:'0.68rem',color:C.muted }}>{products.length} active listing{products.length!==1?'s':''}</div>
          </div>
        </div>
        <button onClick={() => navigate('/create-listing')} style={{
          display:'flex',alignItems:'center',gap:6,
          padding:'9px 16px',borderRadius:99,
          background:C.black,border:'none',cursor:'pointer',
          fontSize:'0.78rem',fontWeight:700,color:C.white,
        }}>
          <Plus size={14}/> List
        </button>
      </div>

      <div style={{ padding:'20px' }}>

        {/* Stats */}
        <div style={{
          display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:20,
        }}>
          <div style={{
            background:C.white,borderRadius:14,border:`1px solid ${C.border}`,
            padding:'14px 16px',
          }}>
            <div style={{ fontSize:'0.65rem',color:C.muted,marginBottom:6,textTransform:'uppercase',letterSpacing:'0.08em' }}>Listings</div>
            <div style={{ fontSize:'1.6rem',fontWeight:800,color:C.black }}>{products.length}</div>
          </div>
          <div style={{
            background:C.white,borderRadius:14,border:`1px solid ${C.border}`,
            padding:'14px 16px',
          }}>
            <div style={{ fontSize:'0.65rem',color:C.muted,marginBottom:6,textTransform:'uppercase',letterSpacing:'0.08em' }}>Total value</div>
            <div style={{ display:'flex',alignItems:'center',gap:4 }}>
              <Zap size={14} fill={C.orange} color={C.orange}/>
              <span style={{ fontSize:'1.1rem',fontWeight:800,color:C.black }}>
                {totalSats.toLocaleString()}
              </span>
            </div>
            <div style={{ fontSize:'0.65rem',color:C.muted,marginTop:2 }}>{satsToKsh(totalSats)}</div>
          </div>
        </div>

        {/* Listings */}
        {loading && (
          <div style={{ display:'flex',justifyContent:'center',padding:'48px 0' }}>
            <Loader size={24} color={C.ochre} style={{ animation:'spin 1s linear infinite' }}/>
          </div>
        )}

        {!loading && products.length === 0 && (
          <div style={{
            textAlign:'center',padding:'48px 20px',
            display:'flex',flexDirection:'column',alignItems:'center',gap:12,
          }}>
            <Store size={44} color={C.border}/>
            <div style={{ fontSize:'0.95rem',fontWeight:700,color:C.black }}>No listings yet</div>
            <div style={{ fontSize:'0.78rem',color:C.muted }}>Add your first product to start selling</div>
            <button onClick={() => navigate('/create-listing')} style={{
              marginTop:8,padding:'12px 28px',
              background:C.black,border:'none',borderRadius:12,
              cursor:'pointer',fontSize:'0.88rem',fontWeight:700,color:C.white,
              display:'flex',alignItems:'center',gap:8,
            }}>
              <Plus size={16}/> List a product
            </button>
          </div>
        )}

        {!loading && products.length > 0 && (
          <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
            {products.map(p => (
              <ProductRow
                key={p.id}
                product={p}
                onView   ={() => navigate(`/product/${p.id}`)}
                onEdit   ={() => setEditProduct(p)}
                onDelete ={() => setDelProduct(p)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Edit sheet */}
      {editProduct && (
        <EditSheet
          product={editProduct}
          onSave={handleSaveEdit}
          onCancel={() => setEditProduct(null)}
        />
      )}

      {/* Delete sheet */}
      {delProduct && (
        <DeleteSheet
          product={delProduct}
          onConfirm={handleDelete}
          onCancel={() => setDelProduct(null)}
          deleting={deleting}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position:'fixed',top:80,left:'50%',transform:'translateX(-50%)',
          zIndex:300,background:C.black,color:C.white,
          padding:'10px 20px',borderRadius:99,
          fontSize:'0.78rem',fontWeight:600,
          display:'flex',alignItems:'center',gap:8,
          boxShadow:'0 4px 20px rgba(26,20,16,0.2)',
          animation:'fadeIn .2s ease',
          whiteSpace:'nowrap',
        }}>
          <CheckCircle size={14} color={C.green}/> {toast}
        </div>
      )}

      <style>{`
        @keyframes spin   { to { transform: rotate(360deg) } }
        @keyframes sheetUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
        @keyframes fadeIn  { from { opacity: 0; transform: translateX(-50%) translateY(-8px) } to { opacity: 1; transform: translateX(-50%) translateY(0) } }
      `}</style>
    </div>
  )
}

