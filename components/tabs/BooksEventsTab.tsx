import React, { useMemo, useState } from 'react';
import { supabase } from '../../src/lib/supabase';
import type { BookEvent, BookEventKind, BookRsvp } from '../../types';
import { FaCalendarAlt, FaPlus, FaPen, FaTrash, FaWhatsapp, FaToggleOn, FaToggleOff, FaImage, FaChevronDown, FaMapMarkerAlt, FaUserAlt } from 'react-icons/fa';
import { useOwnerTable, AdminModal, Field, adminInput, Spinner, MissingSqlNotice, Kpi, ping, waLink, money, isMissingSql, uploadAsset, todayLocal } from '../AdminKit';
import { ACCENT, ON_ACCENT, TITLE_FONT, btnPrimary, iconBtn, dangerBtn, TabHeader, Empty, ago } from '../books/BooksAdminUi';
import { EVENT_KIND_LABEL, EVENT_KINDS } from '../../src/lib/booksCommon';

interface Props {
  user: any;
  showNotification: (message: string, type: 'success' | 'error') => void;
}

const RSVP_STATUS: [BookRsvp['status'], string][] = [['confirmada', 'Confirmada'], ['asistio', 'Asistió'], ['no_show', 'No vino'], ['cancelada', 'Cancelada']];
const prettyDay = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('es-EC', { weekday: 'short', day: 'numeric', month: 'short' }); };

export const BooksEventsTab: React.FC<Props> = ({ user, showNotification }) => {
  const evT = useOwnerTable<BookEvent>({ table: 'books_events', ownerColumn: 'shop_profile_id', ownerId: user?.id, realtime: false, order: [{ column: 'event_date', ascending: false }] });
  const rsT = useOwnerTable<BookRsvp>({ table: 'books_event_rsvps', ownerColumn: 'shop_profile_id', ownerId: user?.id, realtime: true, pollMs: 20000, order: [{ column: 'created_at', ascending: false }], onNew: () => ping() });
  const [modal, setModal] = useState<{ open: boolean; editing: BookEvent | null }>({ open: false, editing: null });
  const [open, setOpen] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const today = todayLocal();

  const taken = useMemo(() => {
    const m = new Map<string, number>();
    rsT.rows.filter(r => r.status === 'confirmada' || r.status === 'asistio').forEach(r => m.set(r.event_id, (m.get(r.event_id) || 0) + r.seats));
    return m;
  }, [rsT.rows]);
  const upcoming = useMemo(() => evT.rows.filter(e => e.event_date.slice(0, 10) >= today).sort((a, b) => a.event_date.localeCompare(b.event_date) || String(a.start_time).localeCompare(String(b.start_time))), [evT.rows, today]);
  const past = useMemo(() => evT.rows.filter(e => e.event_date.slice(0, 10) < today), [evT.rows, today]);

  const togglePub = async (e: BookEvent) => {
    const { error } = await supabase.from('books_events').update({ is_published: !e.is_published }).eq('id', e.id);
    if (error) return showNotification(error.message, 'error');
    evT.reload();
  };
  const remove = async (e: BookEvent) => {
    if (!window.confirm(`¿Eliminar «${e.title}»? También se borran sus reservas.`)) return;
    const { error } = await supabase.from('books_events').delete().eq('id', e.id);
    if (error) return showNotification(error.message, 'error');
    evT.reload(); rsT.reload();
  };
  const setRsvp = async (r: BookRsvp, change: Partial<BookRsvp>) => {
    rsT.setRows(rs => rs.map(x => (x.id === r.id ? { ...x, ...change } : x)));
    const { error } = await supabase.from('books_event_rsvps').update(change).eq('id', r.id);
    if (error) { showNotification(error.message, 'error'); rsT.reload(); }
  };

  if (evT.loading) return <Spinner accent={ACCENT} />;

  const card = (e: BookEvent) => {
    const list = rsT.rows.filter(r => r.event_id === e.id);
    const t = taken.get(e.id) || 0;
    const pct = e.capacity ? Math.min(Math.round((t / e.capacity) * 100), 100) : 0;
    const isPast = e.event_date.slice(0, 10) < today;
    return (
      <div key={e.id} className="rounded-2xl border overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)', opacity: e.is_published ? 1 : 0.6 }}>
        <div className="p-4 flex items-start gap-3">
          <div className="w-14 shrink-0 rounded-lg py-2 text-center" style={{ background: `${ACCENT}1f`, border: `1px solid ${ACCENT}44` }}>
            <p className="text-xl font-bold text-white leading-none" style={{ fontFamily: TITLE_FONT }}>{e.event_date.slice(8, 10)}</p>
            <p className="text-[9px] uppercase tracking-widest mt-1" style={{ color: ACCENT }}>{prettyDay(e.event_date).split(' ').slice(-1)[0]}</p>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: ACCENT }}>{EVENT_KIND_LABEL[e.kind]}{!e.is_published ? ' · BORRADOR' : ''}{isPast ? ' · PASADO' : ''}</p>
            <p className="text-white font-bold leading-snug" style={{ fontFamily: TITLE_FONT }}>{e.title}</p>
            <p className="text-[11px] text-white/45 flex flex-wrap gap-x-3">
              <span>{prettyDay(e.event_date)}{e.start_time ? ` · ${e.start_time}` : ''}</span>
              {e.host_name && <span className="flex items-center gap-1"><FaUserAlt size={9} />{e.host_name}</span>}
              {e.location && <span className="flex items-center gap-1"><FaMapMarkerAlt size={9} />{e.location}</span>}
              <span>{e.price > 0 ? money(e.price) : 'Entrada libre'}</span>
            </p>
            <div className="mt-2">
              <div className="flex justify-between text-[11px] text-white/55 mb-1"><span>{t} {t === 1 ? 'lugar reservado' : 'lugares reservados'}</span><span>{e.capacity ? `de ${e.capacity}` : 'cupo abierto'}</span></div>
              {e.capacity ? <div className="h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 100 ? '#f87171' : ACCENT }} /></div> : null}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button type="button" aria-label={e.is_published ? 'Despublicar' : 'Publicar'} onClick={() => togglePub(e)} className="text-white/50">{e.is_published ? <FaToggleOn size={20} style={{ color: ACCENT }} /> : <FaToggleOff size={20} />}</button>
            <button type="button" aria-label="Editar evento" onClick={() => setModal({ open: true, editing: e })} className={iconBtn}><FaPen size={11} /></button>
            <button type="button" aria-label="Eliminar evento" onClick={() => remove(e)} className={dangerBtn}><FaTrash size={11} /></button>
          </div>
        </div>
        <button type="button" onClick={() => setOpen(open === e.id ? null : e.id)} className="w-full flex items-center justify-between px-4 py-2.5 border-t border-white/8 text-[11px] font-bold uppercase tracking-wider text-white/55 hover:text-white">
          <span>Asistentes ({list.length})</span><FaChevronDown size={10} style={{ transform: open === e.id ? 'rotate(180deg)' : undefined }} />
        </button>
        {open === e.id && (
          <div className="px-4 pb-4 space-y-2">
            {list.length === 0 ? <p className="text-xs text-white/35 py-2">Aún no hay reservas.</p> : list.map(r => (
              <div key={r.id} className="flex flex-wrap items-center gap-2.5 rounded-lg bg-white/[0.03] px-3 py-2" style={{ opacity: r.status === 'cancelada' ? 0.5 : 1 }}>
                <div className="min-w-0 flex-1 basis-40"><p className="text-sm text-white truncate">{r.name} <span className="text-white/40">× {r.seats}</span></p><p className="text-[11px] text-white/40 truncate"><span className="font-mono">{r.code}</span> · {[r.phone, r.email].filter(Boolean).join(' · ')} · {ago(r.created_at)}</p></div>
                <select aria-label="Estado de la reserva" value={r.status} onChange={ev => setRsvp(r, { status: ev.target.value as BookRsvp['status'] })} className="bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white">{RSVP_STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                {r.total > 0 && <button type="button" onClick={() => setRsvp(r, { payment_status: r.payment_status === 'pagado' ? 'pendiente' : 'pagado' })} className="text-[10px] font-black uppercase px-2 py-1.5 rounded-md" style={r.payment_status === 'pagado' ? { background: 'rgba(52,211,153,0.15)', color: '#34d399' } : { background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}>{r.payment_status === 'pagado' ? `Pagado ${money(r.total)}` : `Cobrar ${money(r.total)}`}</button>}
                {r.phone && <a href={waLink(r.phone, `Hola ${r.name.split(' ')[0]}, te esperamos en «${e.title}» el ${prettyDay(e.event_date)}${e.start_time ? ` a las ${e.start_time}` : ''}.`)} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className={iconBtn}><FaWhatsapp size={13} style={{ color: '#25D366' }} /></a>}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="animate-fade-in-up space-y-6 max-w-4xl mx-auto px-4 md:px-6 pb-32" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      <TabHeader icon={<FaCalendarAlt />} title="Eventos" subtitle="Presentaciones, firmas, clubes de lectura y talleres, con cupo y reserva."
        action={<button onClick={() => setModal({ open: true, editing: null })} className={btnPrimary} style={{ background: ACCENT, color: ON_ACCENT }}><FaPlus /> Nuevo evento</button>} />
      {evT.missingSql && <MissingSqlNotice file="setup_books.sql" accent={ACCENT} />}
      {!evT.missingSql && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Kpi label="Próximos eventos" value={upcoming.filter(e => e.is_published).length} accent={ACCENT} />
            <Kpi label="Lugares reservados" value={upcoming.reduce((a, e) => a + (taken.get(e.id) || 0), 0)} accent={ACCENT} tone="good" />
            <Kpi label="Por cobrar" value={money(rsT.rows.filter(r => r.payment_status === 'pendiente' && r.status === 'confirmada').reduce((a, r) => a + r.total, 0))} accent={ACCENT} tone="warn" />
          </div>
          {upcoming.length === 0 ? <Empty emoji="🎟️">No tienes eventos próximos. Crea el primero: un club de lectura, una firma de libros, un taller infantil…</Empty> : <div className="space-y-3">{upcoming.map(card)}</div>}
          {past.length > 0 && (
            <>
              <button type="button" onClick={() => setShowPast(s => !s)} className="text-xs font-bold uppercase tracking-wider text-white/45 hover:text-white">{showPast ? 'Ocultar' : 'Ver'} eventos pasados ({past.length})</button>
              {showPast && <div className="space-y-3">{past.map(card)}</div>}
            </>
          )}
        </>
      )}
      {modal.open && <EventModal userId={user.id} editing={modal.editing} showNotification={showNotification} onClose={() => setModal({ open: false, editing: null })} onSaved={() => { setModal({ open: false, editing: null }); evT.reload(); }} />}
    </div>
  );
};

const EventModal: React.FC<{ userId: string; editing: BookEvent | null; showNotification: Props['showNotification']; onClose: () => void; onSaved: () => void }> = ({ userId, editing, showNotification, onClose, onSaved }) => {
  const [f, setF] = useState({
    title: editing?.title || '', kind: (editing?.kind || 'club_lectura') as BookEventKind, event_date: editing?.event_date?.slice(0, 10) || todayLocal(),
    start_time: editing?.start_time || '', end_time: editing?.end_time || '', location: editing?.location || '', capacity: editing?.capacity != null ? String(editing.capacity) : '',
    price: editing ? String(editing.price) : '0', host_name: editing?.host_name || '', description: editing?.description || '', is_published: editing?.is_published ?? true,
  });
  const [image, setImage] = useState(editing?.image_url || '');
  const [uploading, setUploading] = useState(false); const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f, v: any) => setF(p => ({ ...p, [k]: v }));
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try { setImage(await uploadAsset(userId, 'books_events', files[0])); } catch (err: any) { showNotification(`Error al subir: ${err?.message}`, 'error'); } finally { setUploading(false); }
  };
  const save = async () => {
    if (!f.title.trim()) return showNotification('El evento necesita un título.', 'error');
    if (!f.event_date) return showNotification('Elige la fecha.', 'error');
    const price = f.price === '' ? 0 : Number(f.price.replace(',', '.'));
    if (!isFinite(price) || price < 0) return showNotification('El precio no es válido.', 'error');
    const payload = {
      shop_profile_id: userId, title: f.title.trim(), kind: f.kind, event_date: f.event_date, start_time: f.start_time || null, end_time: f.end_time || null,
      location: f.location.trim() || null, capacity: f.capacity.trim() === '' ? null : Math.min(Math.max(Math.round(Number(f.capacity)) || 1, 1), 5000),
      price, host_name: f.host_name.trim() || null, description: f.description.trim() || null, image_url: image || null, is_published: f.is_published,
    };
    setSaving(true);
    const { error } = editing ? await supabase.from('books_events').update(payload).eq('id', editing.id) : await supabase.from('books_events').insert(payload);
    setSaving(false);
    if (error) return showNotification(isMissingSql(error) ? 'Falta ejecutar setup_books.sql en Supabase.' : `No se pudo guardar: ${error.message}`, 'error');
    showNotification(editing ? 'Evento actualizado.' : 'Evento creado.', 'success'); onSaved();
  };
  return (
    <AdminModal title={editing ? 'Editar evento' : 'Nuevo evento'} accent={ACCENT} onClose={onClose} wide>
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Título *" className="sm:col-span-2"><input className={adminInput} value={f.title} onChange={e => set('title', e.target.value)} placeholder="Club de lectura: Cien años de soledad" /></Field>
          <Field label="Tipo"><select className={adminInput} value={f.kind} onChange={e => set('kind', e.target.value)}>{EVENT_KINDS.map(k => <option key={k} value={k}>{EVENT_KIND_LABEL[k]}</option>)}</select></Field>
          <Field label="Fecha *"><input type="date" className={adminInput} value={f.event_date} onChange={e => set('event_date', e.target.value)} /></Field>
          <Field label="Desde"><input type="time" className={adminInput} value={f.start_time} onChange={e => set('start_time', e.target.value)} /></Field>
          <Field label="Hasta"><input type="time" className={adminInput} value={f.end_time} onChange={e => set('end_time', e.target.value)} /></Field>
          <Field label="Cupo" hint="Vacío = sin límite"><input className={adminInput} inputMode="numeric" value={f.capacity} onChange={e => set('capacity', e.target.value.replace(/[^0-9]/g, ''))} /></Field>
          <Field label="Entrada ($)" hint="0 = libre"><input className={adminInput} inputMode="decimal" value={f.price} onChange={e => set('price', e.target.value)} /></Field>
          <Field label="Invitado / autor"><input className={adminInput} value={f.host_name} onChange={e => set('host_name', e.target.value)} /></Field>
        </div>
        <Field label="Lugar"><input className={adminInput} value={f.location} onChange={e => set('location', e.target.value)} placeholder="En la librería, sala de lectura" /></Field>
        <Field label="Descripción"><textarea className={adminInput} rows={3} value={f.description} onChange={e => set('description', e.target.value)} /></Field>
        <Field label="Imagen">
          <div className="flex items-center gap-3">
            <div className="w-24 aspect-[16/10] rounded-lg overflow-hidden bg-black/30 border border-white/10 flex items-center justify-center">{image ? <img src={image} alt="" className="w-full h-full object-cover" /> : <FaImage className="text-white/20" />}</div>
            <label className="px-3 py-2 rounded-lg border border-white/15 text-xs font-bold text-white/70 hover:text-white cursor-pointer">{uploading ? 'Subiendo…' : 'Subir imagen'}<input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={e => { upload(e.target.files); e.target.value = ''; }} /></label>
            {image && <button type="button" onClick={() => setImage('')} className="text-xs text-white/40 hover:text-white">Quitar</button>}
          </div>
        </Field>
        <label className="flex items-center gap-2 text-sm text-white/70"><input type="checkbox" checked={f.is_published} onChange={e => set('is_published', e.target.checked)} /> Publicado en el perfil</label>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl text-xs font-bold uppercase border border-white/10 text-white/60 hover:text-white">Cancelar</button>
          <button onClick={save} disabled={saving || uploading} className="flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-wider disabled:opacity-50" style={{ background: ACCENT, color: ON_ACCENT }}>{saving ? 'Guardando…' : 'Guardar evento'}</button>
        </div>
      </div>
    </AdminModal>
  );
};

export default BooksEventsTab;
