import React, { useMemo, useRef, useState } from 'react';
import { supabase } from '../../src/lib/supabase';
import type { PhotoWork } from '../../types';
import {
  FaCamera, FaPlus, FaPen, FaTrash, FaStar, FaRegStar, FaToggleOn, FaToggleOff, FaArrowUp, FaArrowDown, FaImages, FaTimes, FaUpload,
} from 'react-icons/fa';
import { useOwnerTable, AdminModal, Field, adminInput, Spinner, MissingSqlNotice, isMissingSql } from '../AdminKit';
import { ACCENT, ON_ACCENT, btnPrimary, iconBtn, dangerBtn, TabHeader, Empty, Pills, CapNote, capFor } from '../photo/PhotoAdminUi';
import { WORK_CATEGORIES, uploadMany } from '../../src/lib/photoCommon';

interface Props {
  user: any;
  showNotification: (message: string, type: 'success' | 'error') => void;
  plan: 'conecta' | 'pro' | 'ultra';
}

const MAX_IMAGES = 80;
type Form = { title: string; category: string; description: string; images: string[]; cover_url: string; is_featured: boolean; is_visible: boolean };
const EMPTY: Form = { title: '', category: 'Retratos', description: '', images: [], cover_url: '', is_featured: false, is_visible: true };

export const PhotoPortfolioTab: React.FC<Props> = ({ user, showNotification, plan }) => {
  const t = useOwnerTable<PhotoWork>({ table: 'photo_works', ownerColumn: 'photo_profile_id', ownerId: user?.id, realtime: false, order: [{ column: 'sort_order' }, { column: 'created_at', ascending: false }] });
  const [cat, setCat] = useState<string>('__all__');
  const [modal, setModal] = useState<{ open: boolean; editing: PhotoWork | null }>({ open: false, editing: null });
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cap = capFor(plan, 'works');

  const categories = useMemo(() => {
    const m = new Map<string, number>();
    t.rows.forEach(w => m.set(w.category, (m.get(w.category) || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [t.rows]);
  const shown = useMemo(() => (cat === '__all__' ? t.rows : t.rows.filter(w => w.category === cat)), [t.rows, cat]);

  const openNew = () => {
    if (cap && t.rows.length >= cap) return showNotification(`Tu plan permite ${cap} series en el portafolio.`, 'error');
    setForm(EMPTY); setModal({ open: true, editing: null });
  };
  const openEdit = (w: PhotoWork) => {
    setForm({ title: w.title, category: w.category, description: w.description || '', images: [...(w.images || [])], cover_url: w.cover_url || '', is_featured: w.is_featured, is_visible: w.is_visible });
    setModal({ open: true, editing: w });
  };

  const addFiles = async (files: FileList | null) => {
    if (!files || !user?.id) return;
    const room = MAX_IMAGES - form.images.length;
    const list = Array.from(files).filter(f => f.type.startsWith('image/')).slice(0, Math.max(room, 0));
    if (files.length > list.length) showNotification(`Máximo ${MAX_IMAGES} fotos por serie.`, 'error');
    if (!list.length) return;
    setProgress({ done: 0, total: list.length });
    const { ok, failed } = await uploadMany(user.id, 'photo_works', list, (done, total) => setProgress({ done, total }), 2000);
    setProgress(null);
    if (failed.length) showNotification(`No se pudieron subir ${failed.length} foto(s).`, 'error');
    setForm(f => {
      const images = [...f.images, ...ok.map(o => o.url)];
      return { ...f, images, cover_url: f.cover_url || images[0] || '' };
    });
    if (fileRef.current) fileRef.current.value = '';
  };
  const removeImage = (url: string) => setForm(f => {
    const images = f.images.filter(x => x !== url);
    return { ...f, images, cover_url: f.cover_url === url ? (images[0] || '') : f.cover_url };
  });
  const moveImage = (i: number, d: number) => setForm(f => {
    const images = [...f.images]; const j = i + d;
    if (j < 0 || j >= images.length) return f;
    [images[i], images[j]] = [images[j], images[i]];
    return { ...f, images };
  });

  const save = async () => {
    if (!user?.id) return;
    if (!form.title.trim()) return showNotification('Ponle un título a la serie.', 'error');
    if (form.images.length === 0) return showNotification('Sube al menos una foto.', 'error');
    setSaving(true);
    const payload = {
      title: form.title.trim(), category: form.category.trim() || 'Otros', description: form.description.trim() || null,
      images: form.images, cover_url: form.cover_url || form.images[0], is_featured: form.is_featured, is_visible: form.is_visible,
    };
    const { editing } = modal;
    const { error } = editing
      ? await supabase.from('photo_works').update(payload).eq('id', editing.id)
      : await supabase.from('photo_works').insert({ ...payload, photo_profile_id: user.id, sort_order: (t.rows.reduce((m, r) => Math.max(m, r.sort_order), 0) || 0) + 1 });
    setSaving(false);
    if (error) {
      if (/works_limit/.test(error.message)) return showNotification('Llegaste al límite de series de tu plan.', 'error');
      return showNotification(isMissingSql(error) ? 'Falta ejecutar setup_photo.sql en Supabase.' : `No se pudo guardar: ${error.message}`, 'error');
    }
    showNotification(editing ? 'Serie actualizada.' : 'Serie agregada al portafolio.', 'success');
    setModal({ open: false, editing: null });
    t.reload();
  };

  const patch = async (w: PhotoWork, change: Partial<PhotoWork>) => {
    t.setRows(rs => rs.map(x => (x.id === w.id ? { ...x, ...change } : x)));
    const { error } = await supabase.from('photo_works').update(change).eq('id', w.id);
    if (error) { showNotification(error.message, 'error'); t.reload(); }
  };
  const remove = async (w: PhotoWork) => {
    if (!window.confirm(`¿Eliminar la serie «${w.title}»? Las fotos dejarán de verse en tu perfil.`)) return;
    const { error } = await supabase.from('photo_works').delete().eq('id', w.id);
    if (error) return showNotification(error.message, 'error');
    t.reload();
  };
  const move = async (w: PhotoWork, d: number) => {
    const list = [...t.rows].sort((a, b) => a.sort_order - b.sort_order);
    const i = list.findIndex(x => x.id === w.id), j = i + d;
    if (j < 0 || j >= list.length) return;
    const a = list[i], b = list[j];
    const sa = a.sort_order, sb = b.sort_order === a.sort_order ? b.sort_order + d : b.sort_order;
    t.setRows(rs => rs.map(x => (x.id === a.id ? { ...x, sort_order: sb } : x.id === b.id ? { ...x, sort_order: sa } : x)));
    await Promise.all([
      supabase.from('photo_works').update({ sort_order: sb }).eq('id', a.id),
      supabase.from('photo_works').update({ sort_order: sa }).eq('id', b.id),
    ]);
    t.reload();
  };

  if (t.loading) return <Spinner accent={ACCENT} />;
  if (t.missingSql) return <MissingSqlNotice file="setup_photo.sql" accent={ACCENT} />;

  return (
    <div className="space-y-6">
      <TabHeader icon={<FaCamera />} title="Portafolio" subtitle="Tus mejores series, ordenadas por tipo de sesión. Es lo primero que ve tu cliente."
        action={<button type="button" className={btnPrimary} style={{ background: ACCENT, color: ON_ACCENT }} onClick={openNew}><FaPlus /> Nueva serie</button>} />
      <CapNote count={t.rows.length} cap={cap} label={t.rows.length === 1 ? 'serie' : 'series'} />

      {categories.length > 1 && <Pills items={[['__all__', `Todas (${t.rows.length})`], ...categories.map(([c, n]) => [c, `${c} (${n})`] as [string, string])]} value={cat} onChange={setCat} />}

      {t.rows.length === 0 ? (
        <Empty emoji="📷">Aún no hay series. Crea una por tipo de sesión (bodas, retratos, familia…) con tus 6 a 20 mejores fotos.</Empty>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {shown.map(w => (
            <div key={w.id} className="rounded-2xl border overflow-hidden flex flex-col" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)', opacity: w.is_visible ? 1 : 0.55 }}>
              <div className="relative aspect-[4/3] bg-black/40">
                {(w.cover_url || w.images?.[0]) ? <img src={w.cover_url || w.images[0]} alt={w.title} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-white/20"><FaCamera size={28} /></div>}
                <span className="absolute top-2 right-2 text-[10px] font-bold px-2 py-1 rounded-full bg-black/60 text-white flex items-center gap-1"><FaImages size={9} /> {w.images?.length || 0}</span>
                {!w.is_visible && <span className="absolute top-2 left-2 text-[9px] font-black px-2 py-1 rounded-full bg-black/70 text-white/70 uppercase">Oculta</span>}
              </div>
              <div className="p-3 flex-1 flex flex-col">
                <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: ACCENT }}>{w.category}</p>
                <p className="text-white font-semibold leading-snug truncate">{w.title}</p>
                <div className="mt-auto pt-3 flex items-center gap-1.5">
                  <button type="button" aria-label={w.is_featured ? 'Quitar de destacadas' : 'Destacar'} onClick={() => patch(w, { is_featured: !w.is_featured })} className={iconBtn}>{w.is_featured ? <FaStar size={12} style={{ color: ACCENT }} /> : <FaRegStar size={12} />}</button>
                  <button type="button" aria-label={w.is_visible ? 'Ocultar' : 'Mostrar'} onClick={() => patch(w, { is_visible: !w.is_visible })} className="text-white/50">{w.is_visible ? <FaToggleOn size={22} style={{ color: ACCENT }} /> : <FaToggleOff size={22} />}</button>
                  <span className="flex-1" />
                  <button type="button" aria-label="Subir" onClick={() => move(w, -1)} className={iconBtn}><FaArrowUp size={10} /></button>
                  <button type="button" aria-label="Bajar" onClick={() => move(w, 1)} className={iconBtn}><FaArrowDown size={10} /></button>
                  <button type="button" aria-label="Editar serie" onClick={() => openEdit(w)} className={iconBtn}><FaPen size={11} /></button>
                  <button type="button" aria-label="Eliminar serie" onClick={() => remove(w)} className={dangerBtn}><FaTrash size={11} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal.open && (
        <AdminModal title={modal.editing ? 'Editar serie' : 'Nueva serie'} onClose={() => setModal({ open: false, editing: null })} accent={ACCENT} wide>
          <div className="space-y-4">
            <Field label="Título"><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Boda en la hacienda" className={adminInput} /></Field>
            <Field label="Categoría" hint="Elige una o escribe la tuya. Con ellas se arman los filtros del portafolio.">
              <input list="photo-cats" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className={adminInput} />
              <datalist id="photo-cats">{WORK_CATEGORIES.map(c => <option key={c} value={c} />)}</datalist>
            </Field>
            <Field label="Descripción (opcional)"><textarea rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className={adminInput} placeholder="Una línea sobre la sesión, el lugar o el estilo." /></Field>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-white/45">Fotos ({form.images.length}/{MAX_IMAGES})</span>
                <label className={`${btnPrimary} cursor-pointer`} style={{ background: `${ACCENT}22`, color: ACCENT }}>
                  <FaUpload size={11} /> {progress ? `Subiendo ${progress.done}/${progress.total}…` : 'Subir fotos'}
                  <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" disabled={!!progress} onChange={e => addFiles(e.target.files)} />
                </label>
              </div>
              {form.images.length === 0 ? (
                <p className="text-[12px] text-white/35 border border-dashed border-white/10 rounded-xl p-5 text-center">Sube varias fotos a la vez. Se reducen automáticamente para que el perfil cargue rápido.</p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {form.images.map((url, i) => (
                    <div key={url} className="relative aspect-square rounded-lg overflow-hidden bg-black/40 group" style={{ outline: form.cover_url === url ? `2px solid ${ACCENT}` : 'none' }}>
                      <img src={url} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                      <div className="absolute inset-x-0 bottom-0 flex justify-between p-1 bg-gradient-to-t from-black/80">
                        <button type="button" aria-label="Usar de portada" onClick={() => setForm({ ...form, cover_url: url })} className="w-6 h-6 rounded bg-black/60 flex items-center justify-center">{form.cover_url === url ? <FaStar size={10} style={{ color: ACCENT }} /> : <FaRegStar size={10} className="text-white/70" />}</button>
                        <span className="flex gap-1">
                          <button type="button" aria-label="Mover antes" onClick={() => moveImage(i, -1)} disabled={i === 0} className="w-6 h-6 rounded bg-black/60 text-white/70 text-[10px] disabled:opacity-30">‹</button>
                          <button type="button" aria-label="Mover después" onClick={() => moveImage(i, 1)} disabled={i === form.images.length - 1} className="w-6 h-6 rounded bg-black/60 text-white/70 text-[10px] disabled:opacity-30">›</button>
                        </span>
                      </div>
                      <button type="button" aria-label="Quitar foto" onClick={() => removeImage(url)} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center"><FaTimes size={10} /></button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-white/35 mt-2">La estrella marca la portada de la serie.</p>
            </div>

            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-sm text-white/70"><input type="checkbox" checked={form.is_featured} onChange={e => setForm({ ...form, is_featured: e.target.checked })} /> Destacada (se ve grande, primero)</label>
              <label className="flex items-center gap-2 text-sm text-white/70"><input type="checkbox" checked={form.is_visible} onChange={e => setForm({ ...form, is_visible: e.target.checked })} /> Visible en mi perfil</label>
            </div>
            <button type="button" disabled={saving || !!progress} onClick={save} className={`${btnPrimary} w-full justify-center`} style={{ background: ACCENT, color: ON_ACCENT }}>{saving ? 'Guardando…' : 'Guardar serie'}</button>
          </div>
        </AdminModal>
      )}
    </div>
  );
};

export default PhotoPortfolioTab;
