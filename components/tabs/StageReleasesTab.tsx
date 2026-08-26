import React, { useState } from 'react';
import { supabase } from '../../src/lib/supabase';
import type { Release } from '../../types';
import { FaPlus, FaTrash, FaPen, FaImage, FaSave, FaTimes, FaMusic } from 'react-icons/fa';

interface Props {
  user: any;
  profileData: any;
  setProfileData: React.Dispatch<React.SetStateAction<any>>;
  showNotification: (message: string, type: 'success' | 'error') => void;
}

const ACCENT = '#22d3ee';
const PLATFORMS = ['Spotify', 'Apple Music', 'YouTube', 'SoundCloud', 'Deezer', 'Tidal', 'Bandcamp', 'Otro'];

const emptyForm = (): Partial<Release> => ({ title: '', platform: 'Spotify', url: '', coverURL: '', releaseDate: '' });

export const StageReleasesTab: React.FC<Props> = ({ user, profileData, setProfileData, showNotification }) => {
  const releases: Release[] = Array.isArray(profileData?.releases) ? profileData.releases : [];
  const [editing, setEditing] = useState<Release | null>(null);
  const [form, setForm] = useState<Partial<Release>>(emptyForm());
  const [isOpen, setIsOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const openNew = () => { setEditing(null); setForm(emptyForm()); setIsOpen(true); };
  const openEdit = (r: Release) => { setEditing(r); setForm({ ...r }); setIsOpen(true); };
  const close = () => { setEditing(null); setForm(emptyForm()); setIsOpen(false); };

  const persist = async (list: Release[]) => {
    const { error } = await supabase.from('profiles').update({ releases: list }).eq('id', user.id);
    if (error) throw error;
    setProfileData((prev: any) => ({ ...prev, releases: list }));
  };

  const handleCover = async (file: File) => {
    if (!user?.id) return;
    const slot = editing?.id || `tmp_${Date.now()}`;
    setUploading(true);
    try {
      await supabase.storage.from('assets').upload(`releases/${user.id}/${slot}`, file, { upsert: true });
      const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(`releases/${user.id}/${slot}`);
      setForm(prev => ({ ...prev, coverURL: `${publicUrl}?t=${Date.now()}` }));
    } catch (err: any) {
      showNotification(`Error al subir portada: ${err?.message}`, 'error');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!form.title?.trim() && !form.url?.trim()) {
      showNotification('Indica al menos el título o el enlace.', 'error');
      return;
    }
    setSaving(true);
    try {
      let list: Release[];
      if (editing) {
        list = releases.map(r => r.id === editing.id ? { ...editing, ...form } as Release : r);
      } else {
        list = [...releases, { ...form, id: `rel_${Date.now()}` } as Release];
      }
      await persist(list);
      showNotification('Lanzamiento guardado', 'success');
      close();
    } catch (err: any) {
      showNotification(`Error: ${err?.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('¿Eliminar este lanzamiento?')) return;
    try { await persist(releases.filter(r => r.id !== id)); }
    catch (err: any) { showNotification(`Error: ${err?.message}`, 'error'); }
  };

  return (
    <div className="animate-fade-in-up space-y-6 max-w-3xl mx-auto px-4 md:px-6 pb-32" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5" style={{ borderColor: `${ACCENT}26` }}>
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2"><FaMusic style={{ color: ACCENT }} /> Lanzamientos</h2>
          <p className="text-sm text-white/40 mt-1">Tus singles, álbumes y enlaces de streaming.</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-black rounded-xl" style={{ background: ACCENT }}>
          <FaPlus /> Añadir lanzamiento
        </button>
      </div>

      {releases.length === 0 ? (
        <div className="text-center py-16 text-white/30"><p className="text-4xl mb-3">🎵</p><p className="text-sm">Aún no has añadido lanzamientos.</p></div>
      ) : (
        <div className="space-y-2.5">
          {releases.map(r => (
            <div key={r.id} className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-3">
              <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-black/40 flex items-center justify-center">
                {r.coverURL ? <img src={r.coverURL} alt={r.title} className="w-full h-full object-cover" /> : <FaMusic className="text-white/20 text-xl" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-white font-bold text-sm truncate">{r.title || 'Sin título'}</p>
                <p className="text-[11px] text-white/40 truncate">{r.platform}{r.releaseDate ? ` · ${r.releaseDate}` : ''}</p>
              </div>
              <button onClick={() => openEdit(r)} className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 text-white/50 flex items-center justify-center hover:text-white transition"><FaPen size={11} /></button>
              <button onClick={() => remove(r.id)} className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center hover:bg-red-500/20 transition"><FaTrash size={11} /></button>
            </div>
          ))}
        </div>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={close}>
          <div className="w-full max-w-md rounded-2xl border bg-[#0d0d14] p-6 space-y-3" style={{ borderColor: `${ACCENT}33`, maxHeight: '92svh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-white">{editing ? 'Editar' : 'Nuevo'} lanzamiento</h3>
              <button onClick={close} className="text-white/40 hover:text-white"><FaTimes /></button>
            </div>
            <input value={form.title || ''} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Título (ej. Nuevo single)"
              className="w-full bg-black/40 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none placeholder-white/30" />
            <select value={form.platform || 'Spotify'} onChange={e => setForm(p => ({ ...p, platform: e.target.value }))}
              className="w-full bg-black/40 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none">
              {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <input value={form.url || ''} onChange={e => setForm(p => ({ ...p, url: e.target.value }))} placeholder="Enlace (https://...)"
              className="w-full bg-black/40 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none placeholder-white/30" />
            <input value={form.releaseDate || ''} onChange={e => setForm(p => ({ ...p, releaseDate: e.target.value }))} placeholder="Fecha (ej. 12 Jun 2026)"
              className="w-full bg-black/40 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none placeholder-white/30" />
            <label className="flex items-center gap-3 cursor-pointer">
              <div className="w-16 h-16 rounded-xl overflow-hidden bg-black/40 flex items-center justify-center shrink-0 border border-white/10">
                {form.coverURL ? <img src={form.coverURL} alt="" className="w-full h-full object-cover" /> : <FaImage className="text-white/20" />}
              </div>
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: ACCENT }}>{uploading ? 'Subiendo…' : 'Subir portada'}</span>
              <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleCover(f); }} />
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

export default StageReleasesTab;
