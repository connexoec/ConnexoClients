import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../src/lib/supabase';
import type { SublimaProduct, SublimaPriceTier , ProductSubscription } from '../../types';
import {
  FaPlus, FaTrash, FaPen, FaImage, FaSave, FaTimes, FaTshirt, FaTags,
  FaToggleOn, FaToggleOff, FaLayerGroup,
} from 'react-icons/fa';
import { ProductSubscriptionField } from '../ProductSubscriptionField';
import { cleanSubscription, parsePrice } from '../../src/lib/memberPlans';

/** Precio de texto libre a número para la columna numérica; null si no hay. */
const parseOrNull = (v: unknown) => { const n = parsePrice(v); return n > 0 ? n : null; };

interface Props {
  user: any;
  showNotification: (message: string, type: 'success' | 'error') => void;
}

const ACCENT = '#a3e635';
const ACCENT_LIGHT = '#d9f99d';
const ON_ACCENT = '#101403';
const TITLE_FONT = "'Tomorrow', sans-serif";

const CATEGORY_SUGGESTIONS = [
  'Camisetas', 'Gorras', 'Uniformes', 'Bordados', 'Chompas', 'Buzos',
  'Jarros y Tazas', 'Termos', 'Llaveros', 'Banderines', 'Otros',
];
const TECHNIQUES = ['Sublimado', 'Bordado', 'Estampado', 'DTF'];

interface TierForm { min_qty: string; unit_price: string; }
interface Form {
  name: string;
  category: string;
  base_price: string;
  min_qty: string;
  description: string;
  images: string[];
  tiers: TierForm[];
  techniques: string[];
  is_available: boolean;
  subscription?: ProductSubscription;
}

const emptyForm = (): Form => ({
  name: '', category: '', base_price: '', min_qty: '1', description: '',
  images: [], tiers: [], techniques: [], is_available: true, subscription: undefined,
});

const numOrNull = (s: string) => (s.trim() === '' ? null : Number(s));

export const SublimaProductsTab: React.FC<Props> = ({ user, showNotification }) => {
  const [items, setItems] = useState<SublimaProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SublimaProduct | null>(null);
  const [form, setForm] = useState<Form>(emptyForm());
  const [isOpen, setIsOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchItems = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('sublima_products')
        .select('*')
        .eq('factory_profile_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setItems((data ?? []) as SublimaProduct[]);
    } catch (err: any) {
      console.error('SublimaProductsTab fetch error:', err?.message ?? err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    fetchItems();
    const channel = supabase
      .channel(`sublima_products_${user.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'sublima_products', filter: `factory_profile_id=eq.${user.id}` },
        () => fetchItems())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, fetchItems]);

  const openNew = () => { setEditing(null); setForm(emptyForm()); setIsOpen(true); };
  const openEdit = (p: SublimaProduct) => {
    setEditing(p);
    setForm({
      name: p.name || '', category: p.category || '',
      base_price: p.base_price != null ? String(p.base_price) : '',
      min_qty: p.min_qty != null ? String(p.min_qty) : '1',
      description: p.description || '',
      images: Array.isArray(p.images) ? p.images : [],
      tiers: (Array.isArray(p.price_tiers) ? p.price_tiers : []).map(t => ({
        min_qty: t.min_qty != null ? String(t.min_qty) : '',
        unit_price: t.unit_price != null ? String(t.unit_price) : '',
      })),
      techniques: Array.isArray(p.techniques) ? p.techniques : [],
      is_available: p.is_available !== false,
      // Las columnas de la tabla se traducen al objeto que usa el control
      // compartido. Mensual y anual son independientes.
      subscription: ((p as any).subscription_monthly_price != null || (p as any).subscription_annual_price != null)
        ? {
            monthly: (p as any).subscription_monthly_price != null
              ? { price: String((p as any).subscription_monthly_price), installments: (p as any).subscription_monthly_installments ?? undefined }
              : undefined,
            annual: (p as any).subscription_annual_price != null
              ? { price: String((p as any).subscription_annual_price), installments: (p as any).subscription_annual_installments ?? undefined }
              : undefined,
          }
        : undefined,
    });
    setIsOpen(true);
  };
  const close = () => { setEditing(null); setForm(emptyForm()); setIsOpen(false); };

  const handleUpload = async (files: FileList) => {
    if (!user?.id || files.length === 0) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        const path = `sublima/${user.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await supabase.storage.from('assets').upload(path, file, { upsert: true });
        const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(path);
        urls.push(`${publicUrl}?t=${Date.now()}`);
      }
      setForm(prev => ({ ...prev, images: [...prev.images, ...urls] }));
    } catch (err: any) {
      showNotification(`Error al subir imágenes: ${err?.message}`, 'error');
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (idx: number) =>
    setForm(prev => ({ ...prev, images: prev.images.filter((_, i) => i !== idx) }));

  const addTier = () => setForm(prev => ({ ...prev, tiers: [...prev.tiers, { min_qty: '', unit_price: '' }] }));
  const removeTier = (idx: number) => setForm(prev => ({ ...prev, tiers: prev.tiers.filter((_, i) => i !== idx) }));
  const updateTier = (idx: number, patch: Partial<TierForm>) =>
    setForm(prev => ({ ...prev, tiers: prev.tiers.map((t, i) => i === idx ? { ...t, ...patch } : t) }));

  const toggleTechnique = (t: string) =>
    setForm(prev => ({
      ...prev,
      techniques: prev.techniques.includes(t) ? prev.techniques.filter(x => x !== t) : [...prev.techniques, t],
    }));

  const save = async () => {
    if (!form.name.trim()) { showNotification('Escribe el nombre del producto.', 'error'); return; }
    setSaving(true);
    try {
      const tiers: SublimaPriceTier[] = form.tiers
        .filter(t => t.min_qty.trim() !== '' && t.unit_price.trim() !== '')
        .map(t => ({ min_qty: Number(t.min_qty), unit_price: Number(t.unit_price) }))
        .filter(t => !Number.isNaN(t.min_qty) && !Number.isNaN(t.unit_price))
        .sort((a, b) => a.min_qty - b.min_qty);
      const payload = {
        factory_profile_id: user.id,
        name: form.name.trim(),
        category: form.category.trim() || null,
        base_price: numOrNull(form.base_price),
        min_qty: Math.max(1, Number(form.min_qty) || 1),
        description: form.description.trim() || null,
        images: form.images,
        price_tiers: tiers,
        techniques: form.techniques,
        is_available: form.is_available,
        // ⚠️ Al pasar a precios mensual/anual independientes esto se quedó
        // guardando `period`, un campo que ya no existe: se escribía null y la
        // suscripción no persistía. Ahora se mapean las columnas reales.
        subscription_enabled: !!cleanSubscription(form.subscription),
        subscription_monthly_price: parseOrNull(cleanSubscription(form.subscription)?.monthly?.price),
        subscription_annual_price: parseOrNull(cleanSubscription(form.subscription)?.annual?.price),
        subscription_monthly_installments: cleanSubscription(form.subscription)?.monthly?.installments ?? null,
        subscription_annual_installments: cleanSubscription(form.subscription)?.annual?.installments ?? null,
      };
      if (editing) {
        const { error } = await supabase.from('sublima_products').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('sublima_products').insert(payload);
        if (error) throw error;
      }
      showNotification('Producto guardado', 'success');
      close();
      fetchItems();
    } catch (err: any) {
      showNotification(`Error: ${err?.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleAvailable = async (p: SublimaProduct) => {
    try {
      const { error } = await supabase.from('sublima_products').update({ is_available: !p.is_available }).eq('id', p.id);
      if (error) throw error;
      setItems(prev => prev.map(x => x.id === p.id ? { ...x, is_available: !p.is_available } : x));
    } catch (err: any) {
      showNotification(`Error: ${err?.message}`, 'error');
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('¿Eliminar este producto del catálogo?')) return;
    try {
      const { error } = await supabase.from('sublima_products').delete().eq('id', id);
      if (error) throw error;
      setItems(prev => prev.filter(p => p.id !== id));
    } catch (err: any) {
      showNotification(`Error: ${err?.message}`, 'error');
    }
  };

  const fmt = (p?: number | null) => (typeof p === 'number' ? `$${p.toLocaleString('es-EC', { minimumFractionDigits: 2 })}` : '—');
  const inpCls = "w-full bg-black/40 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none placeholder-white/30";

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2" style={{ borderColor: ACCENT }} />
      </div>
    );
  }

  const categories = new Set(items.map(p => (p.category || 'Otros').trim() || 'Otros'));

  return (
    <div className="animate-fade-in-up space-y-6 max-w-4xl mx-auto px-4 md:px-6 pb-32" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5" style={{ borderColor: `${ACCENT}26` }}>
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2" style={{ fontFamily: TITLE_FONT }}>
            <FaTshirt style={{ color: ACCENT }} /> Catálogo
          </h2>
          <p className="text-sm text-white/40 mt-1">Productos con precios por volumen para pedidos al por mayor.</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl" style={{ background: ACCENT, color: ON_ACCENT, fontFamily: TITLE_FONT }}>
          <FaPlus /> Añadir producto
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Productos', value: items.length },
          { label: 'Disponibles', value: items.filter(p => p.is_available !== false).length },
          { label: 'Categorías', value: categories.size },
        ].map(k => (
          <div key={k.label} className="bg-white/5 border border-white/5 rounded-xl p-4">
            <p className="text-2xl font-black text-white">{k.value}</p>
            <p className="text-[11px] text-white/40 uppercase tracking-widest font-bold mt-0.5">{k.label}</p>
          </div>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="text-center py-16 text-white/30"><p className="text-4xl mb-3">👕</p><p className="text-sm">Aún no has publicado productos. Agrega camisetas, gorras, uniformes y más con sus precios por volumen.</p></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {items.map(p => {
            const tiers = Array.isArray(p.price_tiers) ? p.price_tiers : [];
            return (
              <div key={p.id} className="rounded-2xl border border-white/8 bg-white/[0.03] overflow-hidden" style={{ opacity: p.is_available === false ? 0.6 : 1 }}>
                <div className="aspect-[16/10] relative bg-black/40">
                  {p.images?.[0]
                    ? <img src={p.images[0]} alt={p.name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center"><FaTshirt className="text-white/15 text-3xl" /></div>}
                  {p.category && (
                    <span className="absolute top-2 left-2 text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-full" style={{ background: 'rgba(0,0,0,0.6)', color: ACCENT_LIGHT }}>{p.category}</span>
                  )}
                  {p.min_qty > 1 && (
                    <span className="absolute top-2 right-2 text-[9px] font-black px-2 py-1 rounded-full bg-black/60 text-white/70">Mín. {p.min_qty}</span>
                  )}
                </div>
                <div className="p-3">
                  <p className="text-white font-bold text-sm truncate">{p.name}</p>
                  <p className="text-sm font-black mt-1" style={{ color: ACCENT_LIGHT, fontFamily: TITLE_FONT }}>
                    {p.base_price != null ? `${fmt(p.base_price)} c/u` : 'Bajo cotización'}
                  </p>
                  {tiers.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {tiers.slice(0, 3).map((t, i) => (
                        <span key={i} className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ color: ACCENT_LIGHT, background: `${ACCENT}14` }}>
                          {t.min_qty}+ → {fmt(t.unit_price)}
                        </span>
                      ))}
                      {tiers.length > 3 && <span className="text-[9px] text-white/40">+{tiers.length - 3}</span>}
                    </div>
                  )}
                  {Array.isArray(p.techniques) && p.techniques.length > 0 && (
                    <p className="text-[10px] text-white/40 mt-1.5 truncate">{p.techniques.join(' · ')}</p>
                  )}
                  <div className="flex items-center gap-2 mt-3">
                    <button onClick={() => toggleAvailable(p)}
                      className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-white/5 border border-white/10 text-xs font-bold transition"
                      style={{ color: p.is_available !== false ? ACCENT_LIGHT : 'rgba(255,255,255,0.4)' }}
                      title={p.is_available !== false ? 'Marcar no disponible' : 'Marcar disponible'}>
                      {p.is_available !== false ? <FaToggleOn size={16} /> : <FaToggleOff size={16} />}
                    </button>
                    <button onClick={() => openEdit(p)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white/5 border border-white/10 text-white/70 text-xs font-bold hover:text-white transition"><FaPen size={10} /> Editar</button>
                    <button onClick={() => remove(p.id)} className="w-9 h-9 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center hover:bg-red-500/20 transition"><FaTrash size={11} /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal editor */}
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={close}>
          <div className="w-full max-w-md rounded-2xl border bg-[#0e1309] p-6 space-y-3" style={{ borderColor: `${ACCENT}33`, maxHeight: '92svh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-white" style={{ fontFamily: TITLE_FONT }}>{editing ? 'Editar' : 'Nuevo'} producto</h3>
              <button onClick={close} className="text-white/40 hover:text-white"><FaTimes /></button>
            </div>

            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Nombre (ej. Camiseta polo sublimada)" className={inpCls} />
            <div className="grid grid-cols-2 gap-2">
              <input value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} placeholder="Categoría" list="sublima-categories" className={inpCls} />
              <datalist id="sublima-categories">
                {CATEGORY_SUGGESTIONS.map(c => <option key={c} value={c} />)}
              </datalist>
              <input value={form.min_qty} onChange={e => setForm(p => ({ ...p, min_qty: e.target.value }))} type="number" min={1} placeholder="Pedido mínimo" className={inpCls} />
            </div>
            <div>
              <input value={form.base_price} onChange={e => setForm(p => ({ ...p, base_price: e.target.value }))} type="number" step="0.01" placeholder="Precio unitario base (USD)" className={inpCls} />
              <p className="text-[10px] text-white/30 mt-1">Precio "desde" para el pedido mínimo. Los tiers de abajo lo mejoran por volumen.</p>
            </div>

            {/* Tiers de precio por volumen */}
            <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: `${ACCENT}33`, background: `${ACCENT}08` }}>
              <p className="text-[11px] uppercase tracking-widest font-bold flex items-center gap-1.5" style={{ color: ACCENT_LIGHT }}>
                <FaLayerGroup size={10} /> Precios por volumen
              </p>
              {form.tiers.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 flex-1">
                    <span className="text-[10px] text-white/40 shrink-0">Desde</span>
                    <input value={t.min_qty} onChange={e => updateTier(i, { min_qty: e.target.value })} type="number" min={1} placeholder="Cant."
                      className="w-full bg-black/40 border border-white/10 text-white text-sm rounded-lg px-2 py-2 focus:outline-none text-center" />
                    <span className="text-[10px] text-white/40 shrink-0">uds. →</span>
                    <input value={t.unit_price} onChange={e => updateTier(i, { unit_price: e.target.value })} type="number" step="0.01" placeholder="$ c/u"
                      className="w-full bg-black/40 border border-white/10 text-white text-sm rounded-lg px-2 py-2 focus:outline-none text-center" />
                  </div>
                  <button onClick={() => removeTier(i)} className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center shrink-0"><FaTrash size={10} /></button>
                </div>
              ))}
              <button onClick={addTier} className="w-full py-2 rounded-lg border border-dashed text-xs font-bold transition hover:bg-white/[0.04]" style={{ borderColor: `${ACCENT}44`, color: ACCENT_LIGHT }}>
                + Agregar tramo (ej. 50+ unidades a $3.90)
              </button>
            </div>

            {/* Técnicas */}
            <div>
              <p className="text-[11px] uppercase tracking-widest font-bold mb-1.5 flex items-center gap-1.5" style={{ color: ACCENT_LIGHT }}><FaTags size={10} /> Técnicas</p>
              <div className="flex flex-wrap gap-1.5">
                {TECHNIQUES.map(t => (
                  <button key={t} type="button" onClick={() => toggleTechnique(t)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold border transition"
                    style={form.techniques.includes(t)
                      ? { background: ACCENT, color: ON_ACCENT, borderColor: ACCENT }
                      : { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.6)', borderColor: 'rgba(255,255,255,0.1)' }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Descripción (materiales, tallas disponibles, acabados…)" rows={3}
              className={`${inpCls} resize-none`} />

            <ProductSubscriptionField accent={ACCENT_LIGHT}
              value={form.subscription} onChange={v => setForm(p => ({ ...p, subscription: v }))} />

            {/* Disponibilidad */}
            <button type="button" onClick={() => setForm(p => ({ ...p, is_available: !p.is_available }))}
              className="flex items-center gap-2 text-sm font-bold" style={{ color: form.is_available ? ACCENT_LIGHT : 'rgba(255,255,255,0.4)' }}>
              {form.is_available ? <FaToggleOn size={20} /> : <FaToggleOff size={20} />}
              {form.is_available ? 'Disponible en el catálogo' : 'Oculto / no disponible'}
            </button>

            {/* Imágenes */}
            <div>
              <div className="flex flex-wrap gap-2 mb-2">
                {form.images.map((img, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-white/10">
                    <img src={img} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => removeImage(i)} className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center text-[10px]"><FaTimes /></button>
                  </div>
                ))}
                <label className="w-16 h-16 rounded-lg border border-dashed border-white/20 flex items-center justify-center cursor-pointer hover:border-white/40 transition" style={{ color: ACCENT_LIGHT }}>
                  {uploading ? <span className="text-[10px]">…</span> : <FaImage />}
                  <input type="file" accept="image/*" multiple className="hidden" onChange={e => { if (e.target.files) handleUpload(e.target.files); }} />
                </label>
              </div>
            </div>

            <button onClick={save} disabled={saving} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-black uppercase tracking-wider disabled:opacity-50" style={{ background: ACCENT, color: ON_ACCENT, fontFamily: TITLE_FONT }}>
              <FaSave /> {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SublimaProductsTab;
