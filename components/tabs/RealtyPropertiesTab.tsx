import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../src/lib/supabase';
import type { RealtyProperty } from '../../types';
import {
  FaPlus, FaTrash, FaPen, FaImage, FaSave, FaTimes, FaBuilding,
  FaBed, FaBath, FaRulerCombined, FaCar, FaMapMarkerAlt,
} from 'react-icons/fa';

interface Props {
  user: any;
  showNotification: (message: string, type: 'success' | 'error') => void;
}

const ACCENT = '#ff6600';
const ACCENT_LIGHT = '#ffa35d';
const TITLE_FONT = "'Tomorrow', sans-serif";

const STATUSES: { val: RealtyProperty['status']; label: string; color: string }[] = [
  { val: 'pre_venta',  label: 'Pre-venta',  color: '#8b5cf6' },
  { val: 'disponible', label: 'Disponible', color: '#16a34a' },
  { val: 'reservado',  label: 'Reservado',  color: ACCENT_LIGHT },
  { val: 'vendido',    label: 'Vendido',    color: '#6b7280' },
];

interface Form {
  title: string;
  price: string;
  location: string;
  status: RealtyProperty['status'];
  description: string;
  images: string[];
  area_m2: string;
  bedrooms: string;
  bathrooms: string;
  parking: string;
}

const emptyForm = (): Form => ({
  title: '', price: '', location: '', status: 'disponible', description: '',
  images: [], area_m2: '', bedrooms: '', bathrooms: '', parking: '',
});

const numOrNull = (s: string) => (s.trim() === '' ? null : Number(s));

export const RealtyPropertiesTab: React.FC<Props> = ({ user, showNotification }) => {
  const [items, setItems] = useState<RealtyProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<RealtyProperty | null>(null);
  const [form, setForm] = useState<Form>(emptyForm());
  const [isOpen, setIsOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchItems = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('realty_properties')
        .select('*')
        .eq('agency_profile_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setItems((data ?? []) as RealtyProperty[]);
    } catch (err: any) {
      console.error('RealtyPropertiesTab fetch error:', err?.message ?? err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    fetchItems();
    const channel = supabase
      .channel(`realty_properties_${user.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'realty_properties', filter: `agency_profile_id=eq.${user.id}` },
        () => fetchItems())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, fetchItems]);

  const openNew = () => { setEditing(null); setForm(emptyForm()); setIsOpen(true); };
  const openEdit = (p: RealtyProperty) => {
    setEditing(p);
    const f = p.features || {};
    setForm({
      title: p.title || '', price: p.price != null ? String(p.price) : '',
      location: p.location || '', status: p.status, description: p.description || '',
      images: Array.isArray(p.images) ? p.images : [],
      area_m2: f.area_m2 != null ? String(f.area_m2) : '',
      bedrooms: f.bedrooms != null ? String(f.bedrooms) : '',
      bathrooms: f.bathrooms != null ? String(f.bathrooms) : '',
      parking: f.parking != null ? String(f.parking) : '',
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
        const path = `realty/${user.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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

  const save = async () => {
    if (!form.title.trim()) { showNotification('Escribe el título de la propiedad.', 'error'); return; }
    setSaving(true);
    try {
      const payload = {
        agency_profile_id: user.id,
        title: form.title.trim(),
        price: numOrNull(form.price),
        location: form.location.trim() || null,
        status: form.status,
        description: form.description.trim() || null,
        images: form.images,
        features: {
          area_m2: numOrNull(form.area_m2),
          bedrooms: numOrNull(form.bedrooms),
          bathrooms: numOrNull(form.bathrooms),
          parking: numOrNull(form.parking),
        },
      };
      if (editing) {
        const { error } = await supabase.from('realty_properties').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('realty_properties').insert(payload);
        if (error) throw error;
      }
      showNotification('Propiedad guardada', 'success');
      close();
      fetchItems();
    } catch (err: any) {
      showNotification(`Error: ${err?.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('¿Eliminar esta propiedad del inventario?')) return;
    try {
      const { error } = await supabase.from('realty_properties').delete().eq('id', id);
      if (error) throw error;
      setItems(prev => prev.filter(p => p.id !== id));
    } catch (err: any) {
      showNotification(`Error: ${err?.message}`, 'error');
    }
  };

  const fmtPrice = (p?: number | null) => (typeof p === 'number' ? `$${p.toLocaleString('es-EC')}` : 'Consultar');

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2" style={{ borderColor: ACCENT }} />
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up space-y-6 max-w-4xl mx-auto px-4 md:px-6 pb-32" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5" style={{ borderColor: `${ACCENT}26` }}>
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2 italic" style={{ fontFamily: TITLE_FONT }}>
            <FaBuilding style={{ color: ACCENT }} /> Propiedades
          </h2>
          <p className="text-sm text-white/40 mt-1">Inventario centralizado de la agencia.</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white rounded-xl italic" style={{ background: ACCENT, fontFamily: TITLE_FONT }}>
          <FaPlus /> Añadir propiedad
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3">
        {STATUSES.map(s => (
          <div key={s.val} className="bg-white/5 border border-white/5 rounded-xl p-4">
            <p className="text-2xl font-black text-white">{items.filter(p => p.status === s.val).length}</p>
            <p className="text-[10px] uppercase tracking-widest font-bold mt-0.5" style={{ color: s.color }}>{s.label}</p>
          </div>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="text-center py-16 text-white/30"><p className="text-4xl mb-3">🏠</p><p className="text-sm">Aún no has publicado propiedades.</p></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {items.map(p => {
            const st = STATUSES.find(s => s.val === p.status) || STATUSES[1];
            const f = p.features || {};
            return (
              <div key={p.id} className="rounded-2xl border border-white/8 bg-white/[0.03] overflow-hidden">
                <div className="aspect-[16/10] relative bg-black/40">
                  {p.images?.[0]
                    ? <img src={p.images[0]} alt={p.title} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center"><FaBuilding className="text-white/15 text-3xl" /></div>}
                  <span className="absolute top-2 left-2 text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-full" style={{ background: `${st.color}e6`, color: '#fff' }}>{st.label}</span>
                </div>
                <div className="p-3">
                  <p className="text-white font-bold text-sm truncate">{p.title}</p>
                  {p.location && <p className="text-[11px] text-white/40 truncate flex items-center gap-1 mt-0.5"><FaMapMarkerAlt size={9} /> {p.location}</p>}
                  <p className="text-sm font-black mt-1 italic" style={{ color: ACCENT_LIGHT, fontFamily: TITLE_FONT }}>{fmtPrice(p.price)}</p>
                  <div className="flex items-center gap-2.5 mt-1.5 text-[10px] text-white/50">
                    {f.bedrooms != null && <span className="flex items-center gap-1"><FaBed size={10} /> {f.bedrooms}</span>}
                    {f.bathrooms != null && <span className="flex items-center gap-1"><FaBath size={10} /> {f.bathrooms}</span>}
                    {f.area_m2 != null && <span className="flex items-center gap-1"><FaRulerCombined size={10} /> {f.area_m2}m²</span>}
                    {f.parking != null && <span className="flex items-center gap-1"><FaCar size={10} /> {f.parking}</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-3">
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
          <div className="w-full max-w-md rounded-2xl border bg-[#160600] p-6 space-y-3" style={{ borderColor: `${ACCENT}33`, maxHeight: '92svh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-white italic" style={{ fontFamily: TITLE_FONT }}>{editing ? 'Editar' : 'Nueva'} propiedad</h3>
              <button onClick={close} className="text-white/40 hover:text-white"><FaTimes /></button>
            </div>

            <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Título (ej. Departamento en Cumbayá)"
              className="w-full bg-black/40 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none placeholder-white/30" />
            <div className="grid grid-cols-2 gap-2">
              <input value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} type="number" placeholder="Precio (USD)"
                className="w-full bg-black/40 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none placeholder-white/30" />
              <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as RealtyProperty['status'] }))}
                className="w-full bg-black/40 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none">
                {STATUSES.map(s => <option key={s.val} value={s.val}>{s.label}</option>)}
              </select>
            </div>
            <input value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} placeholder="Ubicación (ej. Quito, Cumbayá)"
              className="w-full bg-black/40 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none placeholder-white/30" />

            <div className="grid grid-cols-4 gap-2">
              <input value={form.area_m2} onChange={e => setForm(p => ({ ...p, area_m2: e.target.value }))} type="number" placeholder="m²"
                className="w-full bg-black/40 border border-white/10 text-white text-sm rounded-xl px-2 py-2.5 focus:outline-none placeholder-white/30 text-center" />
              <input value={form.bedrooms} onChange={e => setForm(p => ({ ...p, bedrooms: e.target.value }))} type="number" placeholder="Hab"
                className="w-full bg-black/40 border border-white/10 text-white text-sm rounded-xl px-2 py-2.5 focus:outline-none placeholder-white/30 text-center" />
              <input value={form.bathrooms} onChange={e => setForm(p => ({ ...p, bathrooms: e.target.value }))} type="number" placeholder="Baño"
                className="w-full bg-black/40 border border-white/10 text-white text-sm rounded-xl px-2 py-2.5 focus:outline-none placeholder-white/30 text-center" />
              <input value={form.parking} onChange={e => setForm(p => ({ ...p, parking: e.target.value }))} type="number" placeholder="Parq"
                className="w-full bg-black/40 border border-white/10 text-white text-sm rounded-xl px-2 py-2.5 focus:outline-none placeholder-white/30 text-center" />
            </div>

            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Descripción" rows={3}
              className="w-full bg-black/40 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none placeholder-white/30 resize-none" />

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

            <button onClick={save} disabled={saving} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-black uppercase tracking-wider text-white disabled:opacity-50 italic" style={{ background: ACCENT, fontFamily: TITLE_FONT }}>
              <FaSave /> {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default RealtyPropertiesTab;
