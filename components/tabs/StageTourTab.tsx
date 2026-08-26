import React, { useState } from 'react';
import { supabase } from '../../src/lib/supabase';
import type { TourDate } from '../../types';
import { FaPlus, FaTrash, FaPen, FaSave, FaTimes, FaTicketAlt, FaMapMarkerAlt, FaLink } from 'react-icons/fa';

interface Props {
  user: any;
  profileData: any;
  setProfileData: React.Dispatch<React.SetStateAction<any>>;
  showNotification: (message: string, type: 'success' | 'error') => void;
}

const ACCENT = '#22d3ee';

const emptyForm = (): Partial<TourDate> => ({ date: '', city: '', venue: '', ticketURL: '', soldOut: false });

export const StageTourTab: React.FC<Props> = ({ user, profileData, setProfileData, showNotification }) => {
  const dates: TourDate[] = Array.isArray(profileData?.tourDates) ? profileData.tourDates : [];
  const [editing, setEditing] = useState<TourDate | null>(null);
  const [form, setForm] = useState<Partial<TourDate>>(emptyForm());
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Enlace de booking general (reutiliza el campo bookingLink de la base de Booking).
  const [bookingDraft, setBookingDraft] = useState(profileData?.bookingLink || '');
  const [savingBooking, setSavingBooking] = useState(false);

  const openNew = () => { setEditing(null); setForm(emptyForm()); setIsOpen(true); };
  const openEdit = (d: TourDate) => { setEditing(d); setForm({ ...d }); setIsOpen(true); };
  const close = () => { setEditing(null); setForm(emptyForm()); setIsOpen(false); };

  const persist = async (list: TourDate[]) => {
    const { error } = await supabase.from('profiles').update({ tourDates: list }).eq('id', user.id);
    if (error) throw error;
    setProfileData((prev: any) => ({ ...prev, tourDates: list }));
  };

  const saveBooking = async () => {
    setSavingBooking(true);
    try {
      const { error } = await supabase.from('profiles').update({ bookingLink: bookingDraft.trim() || null }).eq('id', user.id);
      if (error) throw error;
      setProfileData((prev: any) => ({ ...prev, bookingLink: bookingDraft.trim() }));
      showNotification('Enlace de contrataciones guardado', 'success');
    } catch (err: any) {
      showNotification(`Error: ${err?.message}`, 'error');
    } finally {
      setSavingBooking(false);
    }
  };

  const save = async () => {
    if (!form.city?.trim()) { showNotification('Indica la ciudad.', 'error'); return; }
    setSaving(true);
    try {
      let list: TourDate[];
      if (editing) list = dates.map(d => d.id === editing.id ? { ...editing, ...form } as TourDate : d);
      else list = [...dates, { ...form, id: `tour_${Date.now()}` } as TourDate];
      await persist(list);
      showNotification('Fecha guardada', 'success');
      close();
    } catch (err: any) {
      showNotification(`Error: ${err?.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('¿Eliminar esta fecha?')) return;
    try { await persist(dates.filter(d => d.id !== id)); }
    catch (err: any) { showNotification(`Error: ${err?.message}`, 'error'); }
  };

  return (
    <div className="animate-fade-in-up space-y-6 max-w-3xl mx-auto px-4 md:px-6 pb-32" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5" style={{ borderColor: `${ACCENT}26` }}>
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2"><FaTicketAlt style={{ color: ACCENT }} /> Tour & Tickets</h2>
          <p className="text-sm text-white/40 mt-1">Tus conciertos y enlaces de venta de entradas.</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-black rounded-xl" style={{ background: ACCENT }}>
          <FaPlus /> Añadir fecha
        </button>
      </div>

      {/* Enlace de contrataciones / booking */}
      <div className="rounded-2xl border bg-white/[0.03] p-4 space-y-2" style={{ borderColor: `${ACCENT}22` }}>
        <p className="text-xs font-black uppercase tracking-wider text-white/50 flex items-center gap-2"><FaLink style={{ color: ACCENT }} /> Enlace de contrataciones (Booking)</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={bookingDraft} onChange={e => setBookingDraft(e.target.value)} placeholder="https://... (formulario o agenda de contrataciones)"
            className="flex-1 bg-black/40 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none placeholder-white/30" />
          <button onClick={saveBooking} disabled={savingBooking} className="px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-black disabled:opacity-50" style={{ background: ACCENT }}>
            {savingBooking ? '…' : 'Guardar'}
          </button>
        </div>
      </div>

      {dates.length === 0 ? (
        <div className="text-center py-16 text-white/30"><p className="text-4xl mb-3">🎤</p><p className="text-sm">Aún no has añadido fechas de gira.</p></div>
      ) : (
        <div className="space-y-2.5">
          {dates.map(d => (
            <div key={d.id} className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <div className="min-w-0 flex-1">
                <p className="text-white font-bold text-sm truncate flex items-center gap-1.5"><FaMapMarkerAlt size={11} style={{ color: ACCENT }} /> {d.city}{d.soldOut ? ' · AGOTADO' : ''}</p>
                <p className="text-[11px] text-white/40 truncate">{[d.date, d.venue].filter(Boolean).join(' · ')}</p>
              </div>
              <button onClick={() => openEdit(d)} className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 text-white/50 flex items-center justify-center hover:text-white transition"><FaPen size={11} /></button>
              <button onClick={() => remove(d.id)} className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center hover:bg-red-500/20 transition"><FaTrash size={11} /></button>
            </div>
          ))}
        </div>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={close}>
          <div className="w-full max-w-md rounded-2xl border bg-[#0d0d14] p-6 space-y-3" style={{ borderColor: `${ACCENT}33`, maxHeight: '92svh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-white">{editing ? 'Editar' : 'Nueva'} fecha</h3>
              <button onClick={close} className="text-white/40 hover:text-white"><FaTimes /></button>
            </div>
            <input value={form.city || ''} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} placeholder="Ciudad (ej. Quito)"
              className="w-full bg-black/40 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none placeholder-white/30" />
            <input value={form.date || ''} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} placeholder="Fecha (ej. 20 Jul 2026)"
              className="w-full bg-black/40 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none placeholder-white/30" />
            <input value={form.venue || ''} onChange={e => setForm(p => ({ ...p, venue: e.target.value }))} placeholder="Venue / lugar (opcional)"
              className="w-full bg-black/40 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none placeholder-white/30" />
            <input value={form.ticketURL || ''} onChange={e => setForm(p => ({ ...p, ticketURL: e.target.value }))} placeholder="Enlace de tickets (https://...)"
              className="w-full bg-black/40 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none placeholder-white/30" />
            <label className="flex items-center gap-2 text-sm text-white/70 cursor-pointer">
              <input type="checkbox" checked={!!form.soldOut} onChange={e => setForm(p => ({ ...p, soldOut: e.target.checked }))} />
              Marcar como agotado
            </label>
            <button onClick={save} disabled={saving} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-black uppercase tracking-wider text-black disabled:opacity-50" style={{ background: ACCENT }}>
              <FaSave /> {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default StageTourTab;
