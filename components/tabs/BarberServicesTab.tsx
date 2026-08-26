import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../src/lib/supabase';
import type { Product } from '../../types';
import {
  FaPlus, FaTrash, FaPen, FaImage, FaTimes, FaSave,
  FaToggleOn, FaToggleOff,
} from 'react-icons/fa';
import { ProductSubscriptionField } from '../ProductSubscriptionField';
import { cleanSubscription } from '../../src/lib/memberPlans';

const BARBER_CATEGORIES = ['Cortes', 'Barbas', 'Tratamientos', 'Coloración', 'Cejas & Pestañas', 'Paquetes', 'Otros'];

type BarberProduct = Product & { available?: boolean };

const emptyForm = (): Partial<BarberProduct> => ({
  name: '', category: '', price: '', shortDescription: '', imageURL: '', available: true, stock: undefined,
});

interface Props {
  user: any;
  profileData: any;
  setProfileData: React.Dispatch<React.SetStateAction<any>>;
  showNotification: (message: string, type: 'success' | 'error') => void;
}

export const BarberServicesTab: React.FC<Props> = ({ user, profileData, setProfileData, showNotification }) => {
  const services: BarberProduct[] = Array.isArray(profileData?.products) ? profileData.products : [];

  const [editing, setEditing] = useState<BarberProduct | null>(null);
  const [form, setForm] = useState<Partial<BarberProduct>>(emptyForm());
  const [isOpen, setIsOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const openNew = () => { setEditing(null); setForm(emptyForm()); setIsOpen(true); };
  const openEdit = (s: BarberProduct) => { setEditing(s); setForm({ ...s }); setIsOpen(true); };
  const closeModal = () => { setEditing(null); setForm(emptyForm()); setIsOpen(false); };

  const persistProducts = async (list: BarberProduct[]) => {
    const { error } = await supabase.from('profiles').update({ products: list }).eq('id', user.id);
    if (error) throw error;
    setProfileData((prev: any) => ({ ...prev, products: list }));
  };

  const handleImageUpload = async (file: File) => {
    if (!user?.id) return;
    const slotId = editing?.id || `tmp_${Date.now()}`;
    setUploading(true);
    try {
      await supabase.storage.from('assets').upload(`products/${user.id}/${slotId}`, file, { upsert: true });
      const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(`products/${user.id}/${slotId}`);
      setForm(prev => ({ ...prev, imageURL: publicUrl }));
    } catch (err: any) {
      showNotification(`Error al subir imagen: ${err?.message}`, 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!form.name?.trim()) { showNotification('El nombre del servicio es requerido.', 'error'); return; }
    setSaving(true);
    try {
      const id = editing?.id || Date.now().toString();
      const updated: BarberProduct = {
        id,
        name: form.name.trim(),
        category: form.category?.trim() || '',
        price: form.price?.trim() || '',
        shortDescription: form.shortDescription?.trim() || '',
        imageURL: form.imageURL || '',
        available: form.available !== false,
        stock: form.stock != null && String(form.stock) !== '' ? Number(form.stock) : undefined,
        // Faltaba: sin esta linea el interruptor de suscripcion se activaba
        // en pantalla y el campo se descartaba al guardar.
        subscription: cleanSubscription(form.subscription),
      };
      const list = editing
        ? services.map(s => s.id === editing.id ? updated : s)
        : [...services, updated];
      await persistProducts(list);
      showNotification(editing ? 'Servicio actualizado' : 'Servicio agregado', 'success');
      closeModal();
    } catch (err: any) {
      showNotification(`Error: ${err?.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleAvailable = async (s: BarberProduct) => {
    const list = services.map(x => x.id === s.id ? { ...x, available: !(x.available !== false) } : x);
    setProfileData((prev: any) => ({ ...prev, products: list }));
    await supabase.from('profiles').update({ products: list }).eq('id', user.id);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Eliminar este servicio?')) return;
    try {
      const list = services.filter(s => s.id !== id);
      await persistProducts(list);
      showNotification('Servicio eliminado', 'success');
    } catch (err: any) {
      showNotification(`Error: ${err?.message}`, 'error');
    }
  };

  const categories = [...new Set(services.map(s => s.category?.trim() || 'Sin categoría').filter(Boolean))];

  const modal = isOpen && createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={closeModal}
    >
      <div
        className="bg-[#0f0702] border border-[#ffa35d]/20 rounded-2xl w-full max-w-lg shadow-2xl max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between p-5 border-b border-white/5 sticky top-0 bg-[#0f0702] z-10">
          <h3 className="font-black font-tomorrow text-[#ffa35d] uppercase tracking-wider text-sm">
            {editing ? 'Editar servicio' : 'Nuevo servicio'}
          </h3>
          <button onClick={closeModal} className="text-white/40 hover:text-white transition"><FaTimes /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Image upload */}
          <div className="flex items-center gap-4">
            {form.imageURL ? (
              <img src={form.imageURL} className="w-20 h-20 rounded-xl object-cover border border-[#ffa35d]/20 shrink-0" alt="preview" />
            ) : (
              <div className="w-20 h-20 rounded-xl bg-white/5 border border-dashed border-white/20 flex items-center justify-center text-white/30 shrink-0">
                <FaImage className="text-2xl" />
              </div>
            )}
            <label className="flex-1 cursor-pointer">
              <input type="file" accept="image/*" className="hidden"
                onChange={e => e.target.files?.[0] && handleImageUpload(e.target.files[0])} />
              <span className="block text-center text-xs py-2.5 px-4 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white hover:border-[#ffa35d]/40 transition select-none">
                {uploading ? 'Subiendo...' : form.imageURL ? 'Cambiar foto' : 'Subir foto'}
              </span>
            </label>
          </div>

          {/* Name */}
          <input
            value={form.name || ''}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            placeholder="Nombre del servicio *"
            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#ffa35d]/50"
          />

          {/* Category — datalist with presets + free text */}
          <div>
            <input
              list="barber-cats"
              value={form.category || ''}
              onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
              placeholder="Categoría (ej. Cortes, Barbas...)"
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#ffa35d]/50"
            />
            <datalist id="barber-cats">
              {BARBER_CATEGORIES.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>

          {/* Price + Stock */}
          <div className="flex gap-3">
            <input
              value={form.price || ''}
              onChange={e => setForm(p => ({ ...p, price: e.target.value }))}
              placeholder="Precio (ej. $12)"
              className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#ffa35d]/50"
            />
            <input
              type="number" min="0"
              value={form.stock ?? ''}
              onChange={e => setForm(p => ({ ...p, stock: e.target.value === '' ? undefined : Number(e.target.value) }))}
              placeholder="Stock (opcional)"
              className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#ffa35d]/50"
            />
          </div>

          {/* Description */}
          <textarea
            value={form.shortDescription || ''}
            onChange={e => setForm(p => ({ ...p, shortDescription: e.target.value }))}
            placeholder="Descripción corta (opcional)"
            rows={2}
            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#ffa35d]/50 resize-none"
          />

          <ProductSubscriptionField accent="#ffa35d"
            value={form.subscription} onChange={v => setForm(p => ({ ...p, subscription: v }))} />

          {/* Available toggle */}
          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-sm text-white/70 font-medium">Disponible para clientes</p>
              <p className="text-[11px] text-white/30 mt-0.5">Los clientes verán este servicio en tu perfil</p>
            </div>
            <button
              type="button"
              onClick={() => setForm(p => ({ ...p, available: p.available === false ? true : false }))}
              className={`text-3xl transition-colors ${form.available !== false ? 'text-green-400' : 'text-white/20'}`}
            >
              {form.available !== false ? <FaToggleOn /> : <FaToggleOff />}
            </button>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button onClick={closeModal}
              className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-bold uppercase tracking-wider active:scale-95 transition-all">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving || uploading}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[#ff6b35] to-[#ffa35d] text-black text-xs font-black uppercase tracking-wider disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95 transition-all">
              <FaSave /> {saving ? 'Guardando...' : editing ? 'Actualizar' : 'Agregar'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );

  return (
    <div className="space-y-6 max-w-4xl mx-auto px-4 md:px-6 pb-32" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      {modal}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#ffa35d]/15 pb-5">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2">
            ✂️ Servicios
          </h2>
          <p className="text-sm text-white/40 mt-1">
            Gestiona tus servicios, precios y disponibilidad.
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white bg-[#ffa35d] hover:bg-[#e8902a] rounded-xl transition-all shadow-lg shadow-[#ffa35d]/15">
          <FaPlus /> Agregar servicio
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Servicios', value: services.length, color: 'text-white' },
          { label: 'Disponibles', value: services.filter(s => s.available !== false).length, color: 'text-green-400' },
          { label: 'No disponibles', value: services.filter(s => s.available === false).length, color: 'text-red-400' },
        ].map(k => (
          <div key={k.label} className="bg-white/5 border border-white/5 rounded-xl p-4">
            <p className={`text-2xl font-black ${k.color}`}>{k.value}</p>
            <p className="text-[11px] text-white/40 uppercase tracking-widest font-bold mt-0.5">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Service list grouped by category */}
      {services.length === 0 ? (
        <div className="text-center py-20 text-white/30">
          <p className="text-5xl mb-4">✂️</p>
          <p className="text-sm font-medium">Aún no tienes servicios.</p>
          <p className="text-xs mt-1">Agrega tu primer servicio para que tus clientes lo vean.</p>
          <button onClick={openNew}
            className="mt-6 px-6 py-3 rounded-xl bg-[#ffa35d] text-black font-black text-xs uppercase tracking-wider">
            Agregar servicio
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {categories.map(cat => (
            <div key={cat}>
              <p className="text-[11px] text-[#ffa35d]/70 font-black font-tomorrow uppercase tracking-widest mb-3 flex items-center gap-2">
                <span className="h-px flex-1 bg-[#ffa35d]/10" />
                {cat}
                <span className="h-px flex-1 bg-[#ffa35d]/10" />
              </p>
              <div className="space-y-2">
                {services.filter(s => (s.category?.trim() || 'Sin categoría') === cat).map(s => (
                  <div
                    key={s.id}
                    className={`flex items-center gap-4 border rounded-xl p-4 transition-all group ${
                      s.available === false
                        ? 'border-white/5 bg-white/2 opacity-60'
                        : 'border-[#ffa35d]/10 bg-white/5 hover:border-[#ffa35d]/30'
                    }`}
                  >
                    {/* Image */}
                    {s.imageURL ? (
                      <img src={s.imageURL} className="w-14 h-14 rounded-xl object-cover shrink-0 border border-white/10" alt={s.name} />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-[#ffa35d]/10 flex items-center justify-center text-xl shrink-0">✂️</div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-black text-white text-sm font-tomorrow">{s.name}</p>
                        {s.available === false && (
                          <span className="text-[9px] text-red-400/70 bg-red-500/10 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">No disponible</span>
                        )}
                      </div>
                      {s.shortDescription && (
                        <p className="text-[11px] text-white/40 mt-0.5 line-clamp-1">{s.shortDescription}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        {s.price && (
                          <span className="text-xs font-black text-[#ffa35d]">{s.price}</span>
                        )}
                        {s.stock != null && (
                          <span className="text-[10px] text-white/40 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
                            Stock: {s.stock}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => toggleAvailable(s)}
                        title={s.available !== false ? 'Marcar como no disponible' : 'Marcar como disponible'}
                        className={`text-2xl transition-colors ${s.available !== false ? 'text-green-400 hover:text-green-300' : 'text-white/20 hover:text-white/40'}`}
                      >
                        {s.available !== false ? <FaToggleOn /> : <FaToggleOff />}
                      </button>
                      <button
                        onClick={() => openEdit(s)}
                        className="w-9 h-9 rounded-lg bg-white/5 hover:bg-[#ffa35d]/20 flex items-center justify-center text-white/40 hover:text-[#ffa35d] transition"
                      >
                        <FaPen className="text-xs" />
                      </button>
                      <button
                        onClick={() => handleDelete(s.id)}
                        className="w-9 h-9 rounded-lg bg-white/5 hover:bg-red-500/20 flex items-center justify-center text-white/30 hover:text-red-400 transition"
                      >
                        <FaTrash className="text-xs" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
