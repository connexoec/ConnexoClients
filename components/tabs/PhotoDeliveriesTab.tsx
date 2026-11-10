import React, { useMemo, useRef, useState } from 'react';
import { supabase } from '../../src/lib/supabase';
import type { PhotoGallery, PhotoGalleryPhoto, PhotoBooking } from '../../types';
import {
  FaPlus, FaPen, FaTrash, FaWhatsapp, FaHeart, FaUpload, FaTimes, FaCopy, FaArchive, FaUndo, FaEye, FaLock, FaCheck,
} from 'react-icons/fa';
import { useOwnerTable, AdminModal, Field, adminInput, Spinner, MissingSqlNotice, Kpi, ping, fmtDate, todayLocal, isMissingSql } from '../AdminKit';
import { ACCENT, ON_ACCENT, btnPrimary, btnGhost, iconBtn, dangerBtn, TabHeader, Empty, Pills, ago } from '../photo/PhotoAdminUi';
import { uploadMany, newId, randomPin, randomGalleryCode } from '../../src/lib/photoCommon';

interface Props {
  user: any;
  profileData: any;
  showNotification: (message: string, type: 'success' | 'error') => void;
  plan: 'conecta' | 'pro' | 'ultra';
}

const MAX_PHOTOS = 400;
type Form = {
  client_name: string; title: string; note: string; gallery_code: string; pin: string; allow_download: boolean; download_url: string;
  favorites_limit: string; expires_at: string; booking_id: string; photos: PhotoGalleryPhoto[];
};
const emptyForm = (): Form => ({ client_name: '', title: '', note: '', gallery_code: '', pin: randomPin(), allow_download: true, download_url: '', favorites_limit: '', expires_at: '', booking_id: '', photos: [] });

export const PhotoDeliveriesTab: React.FC<Props> = ({ user, profileData, showNotification, plan }) => {
  const t = useOwnerTable<PhotoGallery>({
    table: 'photo_galleries', ownerColumn: 'photo_profile_id', ownerId: user?.id, realtime: true, pollMs: 30000,
    order: [{ column: 'created_at', ascending: false }],
    onNew: () => ping(),
  });
  const bk = useOwnerTable<PhotoBooking>({ table: 'photo_bookings', ownerColumn: 'photo_profile_id', ownerId: user?.id, realtime: false, order: [{ column: 'session_date', ascending: false }] });
  const [filter, setFilter] = useState<'activas' | 'archivadas'>('activas');
  const [modal, setModal] = useState<{ open: boolean; editing: PhotoGallery | null }>({ open: false, editing: null });
  const [form, setForm] = useState<Form>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [favView, setFavView] = useState<PhotoGallery | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const activeCount = t.rows.filter(g => g.status === 'activa').length;
  const capReached = plan === 'pro' && activeCount >= 5;

  const shown = useMemo(() => t.rows.filter(g => (filter === 'activas' ? g.status === 'activa' : g.status === 'archivada')), [t.rows, filter]);
  const waiting = t.rows.filter(g => g.status === 'activa' && g.favorites_sent_at).length;

  const openNew = () => {
    if (capReached) return showNotification('Tu plan permite 5 galerías activas. Archiva una para crear otra.', 'error');
    setForm(emptyForm()); setModal({ open: true, editing: null });
  };
  const openEdit = (g: PhotoGallery) => {
    setForm({
      client_name: g.client_name, title: g.title, note: g.note || '', gallery_code: g.gallery_code, pin: g.pin, allow_download: g.allow_download,
      download_url: g.download_url || '', favorites_limit: g.favorites_limit ? String(g.favorites_limit) : '', expires_at: g.expires_at || '',
      booking_id: g.booking_id || '', photos: [...(g.photos || [])],
    });
    setModal({ open: true, editing: g });
  };
  const pickBooking = (id: string) => {
    const b = bk.rows.find(x => x.id === id);
    setForm(f => ({
      ...f, booking_id: id,
      client_name: f.client_name || b?.customer_name || '', title: f.title || (b ? b.package_name : ''),
      gallery_code: f.gallery_code || (b ? randomGalleryCode(b.customer_name) : ''),
    }));
  };

  const addFiles = async (files: FileList | null) => {
    if (!files || !user?.id) return;
    const list = Array.from(files).filter(f => f.type.startsWith('image/')).slice(0, Math.max(MAX_PHOTOS - form.photos.length, 0));
    if (!list.length) return;
    setProgress({ done: 0, total: list.length });
    const { ok, failed } = await uploadMany(user.id, 'photo_galleries', list, (done, total) => setProgress({ done, total }), 2400);
    setProgress(null);
    if (failed.length) showNotification(`No se pudieron subir ${failed.length} foto(s).`, 'error');
    setForm(f => ({ ...f, photos: [...f.photos, ...ok.map(o => ({ id: newId(), url: o.url, name: o.name }))] }));
    if (fileRef.current) fileRef.current.value = '';
  };

  const save = async () => {
    if (!user?.id) return;
    if (!form.client_name.trim() || !form.title.trim()) return showNotification('Falta el nombre del cliente o el título.', 'error');
    const code = (form.gallery_code.trim() || randomGalleryCode(form.client_name)).toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9-]{2,30}$/.test(code)) return showNotification('El código solo puede llevar letras, números y guiones (3 a 31).', 'error');
    if (form.pin.trim().length < 4) return showNotification('La clave debe tener al menos 4 caracteres.', 'error');
    setSaving(true);
    const payload = {
      client_name: form.client_name.trim(), title: form.title.trim(), note: form.note.trim() || null, gallery_code: code, pin: form.pin.trim(),
      allow_download: form.allow_download, download_url: form.download_url.trim() || null,
      favorites_limit: Number(form.favorites_limit) > 0 ? Math.min(1000, Math.round(Number(form.favorites_limit))) : null,
      expires_at: form.expires_at || null, booking_id: form.booking_id || null, photos: form.photos,
    };
    const { editing } = modal;
    const { error } = editing
      ? await supabase.from('photo_galleries').update(payload).eq('id', editing.id)
      : await supabase.from('photo_galleries').insert({ ...payload, photo_profile_id: user.id });
    setSaving(false);
    if (error) {
      if (/galleries_limit/.test(error.message)) return showNotification('Tu plan permite 5 galerías activas. Archiva una para crear otra.', 'error');
      if (/duplicate key|photo_galleries_code_idx/.test(error.message)) return showNotification('Ya tienes una galería con ese código. Cámbialo.', 'error');
      return showNotification(isMissingSql(error) ? 'Falta ejecutar setup_photo.sql en Supabase.' : `No se pudo guardar: ${error.message}`, 'error');
    }
    showNotification(editing ? 'Galería actualizada.' : 'Galería creada. Ya puedes compartirla con tu cliente.', 'success');
    setModal({ open: false, editing: null });
    t.reload();
  };

  const setStatus = async (g: PhotoGallery, status: 'activa' | 'archivada') => {
    if (status === 'activa' && plan === 'pro' && activeCount >= 5) return showNotification('Tu plan permite 5 galerías activas.', 'error');
    const { error } = await supabase.from('photo_galleries').update({ status }).eq('id', g.id);
    if (error) return showNotification(/galleries_limit/.test(error.message) ? 'Tu plan permite 5 galerías activas.' : error.message, 'error');
    t.reload();
  };
  const remove = async (g: PhotoGallery) => {
    if (!window.confirm(`¿Eliminar la galería de ${g.client_name}? El cliente dejará de poder verla.`)) return;
    const { error } = await supabase.from('photo_galleries').delete().eq('id', g.id);
    if (error) return showNotification(error.message, 'error');
    t.reload();
  };

  const link = (g: PhotoGallery) => `${window.location.origin}/${profileData?.username || ''}?galeria=${encodeURIComponent(g.gallery_code)}`;
  const message = (g: PhotoGallery) => `Hola ${g.client_name.split(' ')[0]}, ya están listas tus fotos de "${g.title}" 📸\n\nEntra aquí: ${link(g)}\nCódigo: ${g.gallery_code}\nClave: ${g.pin}\n\nMarca tus favoritas con el corazón y envíamelas.`;
  const copy = async (text: string, ok = 'Copiado.') => { try { await navigator.clipboard.writeText(text); showNotification(ok, 'success'); } catch { showNotification('No se pudo copiar.', 'error'); } };

  if (t.loading) return <Spinner accent={ACCENT} />;
  if (t.missingSql) return <MissingSqlNotice file="setup_photo.sql" accent={ACCENT} />;

  const favPhotos = (g: PhotoGallery) => (g.photos || []).filter(p => (g.favorites || []).includes(p.id));

  return (
    <div className="space-y-6">
      <TabHeader icon={<FaLock />} title="Entregas" subtitle="Galerías privadas para tus clientes: entran con código y clave, marcan sus favoritas y descargan."
        action={<button type="button" className={btnPrimary} style={{ background: ACCENT, color: ON_ACCENT }} onClick={openNew}><FaPlus /> Nueva galería</button>} />
      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Activas" value={activeCount} accent={ACCENT} />
        <Kpi label="Selecciones por revisar" value={waiting} accent={ACCENT} tone={waiting ? 'warn' : undefined} />
        <Kpi label="Visitas" value={t.rows.reduce((a, g) => a + (g.views || 0), 0)} accent={ACCENT} />
      </div>
      {plan === 'pro' && <p className="text-[11px] text-white/40">{activeCount} de 5 galerías activas en tu plan. Archiva las que ya entregaste para liberar cupo.</p>}
      <Pills items={[['activas', 'Activas'], ['archivadas', 'Archivadas']]} value={filter} onChange={setFilter} />

      {shown.length === 0 ? (
        <Empty emoji="🔐">{filter === 'activas' ? 'Crea una galería por cliente: sube las fotos editadas, comparte el código y la clave por WhatsApp y él elige sus favoritas.' : 'No tienes galerías archivadas.'}</Empty>
      ) : (
        <div className="space-y-3">
          {shown.map(g => {
            const expired = g.expires_at && g.expires_at < todayLocal();
            return (
              <div key={g.id} className="rounded-2xl border p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.03)', borderColor: g.favorites_sent_at && g.status === 'activa' ? `${ACCENT}66` : 'rgba(255,255,255,0.08)' }}>
                <div className="flex items-start gap-3">
                  <div className="w-16 h-16 rounded-lg overflow-hidden bg-black/40 shrink-0">{g.photos?.[0] ? <img src={g.photos[0].url} alt="" className="w-full h-full object-cover" /> : null}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-white font-semibold truncate">{g.title}</p>
                    <p className="text-[12px] text-white/55">{g.client_name} · {g.photos?.length || 0} fotos · creada {ago(g.created_at)}</p>
                    <p className="text-[11px] text-white/40 flex flex-wrap gap-x-3 mt-0.5">
                      <span className="flex items-center gap-1"><FaEye size={9} /> {g.views || 0}</span>
                      {g.expires_at && <span style={{ color: expired ? '#f87171' : undefined }}>{expired ? 'Venció' : 'Vence'} el {fmtDate(g.expires_at, { day: 'numeric', month: 'short' })}</span>}
                      {!g.allow_download && <span>Sin descargas</span>}
                    </p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button type="button" aria-label="Editar galería" onClick={() => openEdit(g)} className={iconBtn}><FaPen size={11} /></button>
                    <button type="button" aria-label={g.status === 'activa' ? 'Archivar' : 'Reactivar'} onClick={() => setStatus(g, g.status === 'activa' ? 'archivada' : 'activa')} className={iconBtn}>{g.status === 'activa' ? <FaArchive size={11} /> : <FaUndo size={11} />}</button>
                    <button type="button" aria-label="Eliminar galería" onClick={() => remove(g)} className={dangerBtn}><FaTrash size={11} /></button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 rounded-xl bg-black/30 px-3 py-2 text-[12px]">
                  <span className="text-white/45">Código</span><b className="font-mono text-white tracking-wider">{g.gallery_code}</b>
                  <span className="text-white/45 ml-2">Clave</span>
                  <button type="button" onClick={() => setRevealed(revealed === g.id ? null : g.id)} className="font-mono font-bold text-white tracking-widest" aria-label="Mostrar u ocultar la clave">{revealed === g.id ? g.pin : '••••'}</button>
                  <span className="flex-1" />
                  <button type="button" onClick={() => copy(message(g), 'Mensaje copiado. Pégalo en WhatsApp.')} className={`${btnGhost} !py-1.5 !px-2.5 flex items-center gap-1.5`}><FaCopy size={10} /> Copiar mensaje</button>
                </div>

                {g.favorites_sent_at ? (
                  <button type="button" onClick={() => setFavView(g)} className="w-full text-left rounded-xl p-3 border flex items-center gap-3" style={{ background: `${ACCENT}12`, borderColor: `${ACCENT}44` }}>
                    <FaHeart style={{ color: ACCENT }} />
                    <span className="text-sm text-white"><b>{g.favorites.length}</b> favoritas elegidas · enviadas {ago(g.favorites_sent_at)}</span>
                    <span className="ml-auto text-[11px] font-bold uppercase tracking-wider" style={{ color: ACCENT }}>Ver</span>
                  </button>
                ) : g.favorites?.length ? (
                  <p className="text-[12px] text-white/45"><FaHeart className="inline mr-1" size={10} /> El cliente ha marcado {g.favorites.length} favoritas (aún no las envía).</p>
                ) : null}

                <div className="flex gap-2">
                  <a href={`https://wa.me/?text=${encodeURIComponent(message(g))}`} target="_blank" rel="noopener noreferrer" className={`${btnGhost} flex items-center gap-1.5`}><FaWhatsapp /> Enviar por WhatsApp</a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {favView && (
        <AdminModal title={`Favoritas de ${favView.client_name}`} onClose={() => setFavView(null)} accent={ACCENT} wide>
          <div className="space-y-4">
            <p className="text-sm text-white/60">{favPhotos(favView).length} fotos elegidas de «{favView.title}».</p>
            {favView.favorites_note && <p className="text-sm rounded-xl p-3 border" style={{ borderColor: `${ACCENT}33`, background: `${ACCENT}0f`, color: 'rgba(255,255,255,0.85)' }}>“{favView.favorites_note}”</p>}
            <div className="grid grid-cols-4 gap-1.5">
              {favPhotos(favView).map(p => (
                <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" className="relative aspect-square rounded overflow-hidden bg-black/40 block" title={p.name || ''}>
                  <img src={p.url} alt={p.name || 'Foto elegida'} className="w-full h-full object-cover" />
                  {p.name && <span className="absolute inset-x-0 bottom-0 bg-black/70 text-[8px] text-white/80 px-1 py-0.5 truncate">{p.name}</span>}
                </a>
              ))}
            </div>
            <button type="button" className={`${btnPrimary} w-full justify-center`} style={{ background: ACCENT, color: ON_ACCENT }}
              onClick={() => copy(favPhotos(favView).map(p => p.name || p.url).join('\n'), 'Lista de archivos copiada.')}><FaCopy /> Copiar nombres de archivo</button>
            <p className="text-[11px] text-white/35">Los nombres son los de los archivos que subiste, para encontrarlos rápido en tu programa de edición.</p>
          </div>
        </AdminModal>
      )}

      {modal.open && (
        <AdminModal title={modal.editing ? 'Editar galería' : 'Nueva galería'} onClose={() => setModal({ open: false, editing: null })} accent={ACCENT} wide>
          <div className="space-y-4">
            {!modal.editing && bk.rows.length > 0 && (
              <Field label="Basada en una sesión (opcional)" hint="Rellena el cliente, el título y el código por ti.">
                <select value={form.booking_id} onChange={e => pickBooking(e.target.value)} className={adminInput}>
                  <option value="">Ninguna</option>
                  {bk.rows.filter(b => b.status !== 'cancelada' && b.status !== 'no_show').slice(0, 40).map(b => <option key={b.id} value={b.id}>{b.customer_name} · {b.package_name} · {fmtDate(b.session_date)}</option>)}
                </select>
              </Field>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Cliente"><input value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })} className={adminInput} /></Field>
              <Field label="Título"><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Boda de María y Juan" className={adminInput} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Código" hint="Lo teclea el cliente."><input value={form.gallery_code} onChange={e => setForm({ ...form, gallery_code: e.target.value.toUpperCase() })} placeholder="Se crea solo" className={`${adminInput} font-mono`} /></Field>
              <Field label="Clave" hint="Mínimo 4 caracteres."><input value={form.pin} onChange={e => setForm({ ...form, pin: e.target.value })} className={`${adminInput} font-mono`} /></Field>
            </div>
            <Field label="Mensaje para tu cliente (opcional)"><textarea rows={2} value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className={adminInput} placeholder="Fue un gusto fotografiarlos. Elijan sus favoritas…" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Máximo de favoritas" hint="Vacío = sin límite."><input inputMode="numeric" value={form.favorites_limit} onChange={e => setForm({ ...form, favorites_limit: e.target.value.replace(/\D/g, '') })} className={adminInput} /></Field>
              <Field label="Disponible hasta"><input type="date" value={form.expires_at} min={todayLocal()} onChange={e => setForm({ ...form, expires_at: e.target.value })} className={adminInput} /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-white/70"><input type="checkbox" checked={form.allow_download} onChange={e => setForm({ ...form, allow_download: e.target.checked })} /> Permitir descargas</label>
            <Field label="Enlace a los originales (opcional)" hint="Google Drive, WeTransfer… para fotos en alta resolución. Aquí se suben versiones livianas para ver y elegir."><input value={form.download_url} onChange={e => setForm({ ...form, download_url: e.target.value })} placeholder="https://" className={adminInput} /></Field>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-white/45">Fotos ({form.photos.length}/{MAX_PHOTOS})</span>
                <label className={`${btnPrimary} cursor-pointer`} style={{ background: `${ACCENT}22`, color: ACCENT }}>
                  <FaUpload size={11} /> {progress ? `Subiendo ${progress.done}/${progress.total}…` : 'Subir fotos'}
                  <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" disabled={!!progress} onChange={e => addFiles(e.target.files)} />
                </label>
              </div>
              {form.photos.length === 0 ? <p className="text-[12px] text-white/35 border border-dashed border-white/10 rounded-xl p-5 text-center">Sube las fotos editadas de la sesión. Se reducen a 2400 px para que carguen rápido.</p> : (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 max-h-72 overflow-y-auto pr-1">
                  {form.photos.map(p => (
                    <div key={p.id} className="relative aspect-square rounded overflow-hidden bg-black/40">
                      <img src={p.url} alt={p.name || 'Foto'} className="w-full h-full object-cover" />
                      <button type="button" aria-label="Quitar foto" onClick={() => setForm({ ...form, photos: form.photos.filter(x => x.id !== p.id) })} className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center"><FaTimes size={8} /></button>
                      {modal.editing?.favorites?.includes(p.id) && <span className="absolute bottom-0.5 left-0.5 text-[9px]" style={{ color: ACCENT }}><FaCheck /></span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button type="button" disabled={saving || !!progress} onClick={save} className={`${btnPrimary} w-full justify-center`} style={{ background: ACCENT, color: ON_ACCENT }}>{saving ? 'Guardando…' : 'Guardar galería'}</button>
          </div>
        </AdminModal>
      )}
    </div>
  );
};

export default PhotoDeliveriesTab;
