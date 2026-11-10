import React, { useMemo, useState } from 'react';
import { supabase } from '../../src/lib/supabase';
import type { PhotoBooking, PhotoBlock, PhotoPackage, PhotoQuote, PhotoSettings, PhotoWorkingDay, PhotoBookingStatus, PhotoPaymentStatus, PhotoQuoteStatus } from '../../types';
import { FaCalendarCheck, FaPlus, FaTrash, FaWhatsapp, FaMapMarkerAlt, FaUserAlt, FaCamera, FaBan } from 'react-icons/fa';
import {
  useOwnerTable, useJsonSettings, AdminModal, Field, adminInput, Spinner, MissingSqlNotice, Kpi, PlanLock, ping, waLink, money, fmtDate, todayLocal, addDaysLocal, isMissingSql,
} from '../AdminKit';
import { ACCENT, ON_ACCENT, btnPrimary, btnGhost, dangerBtn, TabHeader, Empty, Pills, SearchBox, Toggle, ago } from '../photo/PhotoAdminUi';
import { BOOKING_LABEL, PAY_LABEL, QUOTE_LABEL, LOCATION_LABEL, DEFAULT_HOURS, toMin, toHHMM, KIND_LABEL } from '../../src/lib/photoCommon';

interface Props {
  user: any;
  profileData: any;
  setProfileData?: React.Dispatch<React.SetStateAction<any>>;
  showNotification: (message: string, type: 'success' | 'error') => void;
  plan: 'conecta' | 'pro' | 'ultra';
}

const prettyDay = (iso: string) => fmtDate(iso, { weekday: 'short', day: 'numeric', month: 'short' });
const STATUS_COLOR: Record<PhotoBookingStatus, string> = {
  pendiente: '#fbbf24', confirmada: '#34d399', realizada: '#60a5fa', entregada: '#a78bfa', cancelada: '#f87171', no_show: '#f87171',
};

export const PhotoSessionsTab: React.FC<Props> = ({ user, profileData, setProfileData, showNotification, plan }) => {
  const isPro = plan === 'pro' || plan === 'ultra';
  const [view, setView] = useState<'agenda' | 'cotizaciones' | 'horario'>(isPro ? 'agenda' : 'cotizaciones');
  const items: ['agenda' | 'cotizaciones' | 'horario', string][] = isPro ? [['agenda', 'Agenda'], ['cotizaciones', 'Cotizaciones'], ['horario', 'Horario y fechas cerradas']] : [['cotizaciones', 'Cotizaciones'], ['horario', 'Horario']];
  return (
    <div className="space-y-6">
      <TabHeader icon={<FaCalendarCheck />} title="Sesiones" subtitle="Reservas de tus clientes, solicitudes de cotización y los días en que atiendes." />
      <Pills items={items} value={view} onChange={setView} />
      {view === 'agenda' && isPro && <AgendaPanel user={user} showNotification={showNotification} />}
      {view === 'cotizaciones' && <QuotesPanel user={user} showNotification={showNotification} />}
      {view === 'horario' && (isPro
        ? <SchedulePanel user={user} profileData={profileData} setProfileData={setProfileData} showNotification={showNotification} isUltra={plan === 'ultra'} />
        : <PlanLock plan="PRO" what="Agenda de reservas con horario y fechas cerradas" accent={ACCENT} />)}
    </div>
  );
};

/* ═══ Agenda de reservas ═════════════════════════════════════════════════════ */
type AgendaFilter = 'proximas' | 'pendientes' | 'realizadas' | 'canceladas' | 'todas';

const AgendaPanel: React.FC<{ user: any; showNotification: Props['showNotification'] }> = ({ user, showNotification }) => {
  const t = useOwnerTable<PhotoBooking>({
    table: 'photo_bookings', ownerColumn: 'photo_profile_id', ownerId: user?.id, realtime: true, pollMs: 20000,
    order: [{ column: 'session_date' }, { column: 'start_time' }], onNew: () => ping(),
  });
  const [filter, setFilter] = useState<AgendaFilter>('proximas');
  const [q, setQ] = useState('');
  const [manual, setManual] = useState(false);
  const today = todayLocal();

  const stats = useMemo(() => {
    const live = t.rows.filter(b => b.status === 'pendiente' || b.status === 'confirmada');
    return {
      today: t.rows.filter(b => b.session_date === today && b.status !== 'cancelada' && b.status !== 'no_show').length,
      pending: t.rows.filter(b => b.status === 'pendiente').length,
      upcoming: live.filter(b => b.session_date >= today).length,
      deposits: live.filter(b => b.payment_status === 'pendiente').reduce((a, b) => a + Number(b.deposit_required || 0), 0),
    };
  }, [t.rows, today]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    let list = t.rows;
    if (filter === 'proximas') list = list.filter(b => (b.status === 'pendiente' || b.status === 'confirmada') && b.session_date >= today);
    else if (filter === 'pendientes') list = list.filter(b => b.status === 'pendiente');
    else if (filter === 'realizadas') list = list.filter(b => b.status === 'realizada' || b.status === 'entregada').reverse();
    else if (filter === 'canceladas') list = list.filter(b => b.status === 'cancelada' || b.status === 'no_show').reverse();
    else list = [...list].reverse();
    if (s) list = list.filter(b => [b.customer_name, b.customer_phone, b.confirmation_code, b.package_name].join(' ').toLowerCase().includes(s));
    return list;
  }, [t.rows, filter, q, today]);

  const patch = async (b: PhotoBooking, change: Partial<PhotoBooking>) => {
    t.setRows(rs => rs.map(x => (x.id === b.id ? { ...x, ...change } : x)));
    const { error } = await supabase.from('photo_bookings').update(change).eq('id', b.id);
    if (error) { showNotification(error.message, 'error'); t.reload(); }
  };
  const remove = async (b: PhotoBooking) => {
    if (!window.confirm(`¿Eliminar la reserva de ${b.customer_name}?`)) return;
    const { error } = await supabase.from('photo_bookings').delete().eq('id', b.id);
    if (error) return showNotification(error.message, 'error');
    t.reload();
  };

  if (t.loading) return <Spinner accent={ACCENT} />;
  if (t.missingSql) return <MissingSqlNotice file="setup_photo.sql" accent={ACCENT} />;

  const waText = (b: PhotoBooking) => {
    const when = `${prettyDay(b.session_date)}${b.full_day ? ' (día completo)' : ` a las ${b.start_time}`}`;
    if (b.status === 'pendiente') return `Hola ${b.customer_name.split(' ')[0]}, recibí tu solicitud de "${b.package_name}" para el ${when}. Código ${b.confirmation_code}.${b.deposit_required > 0 && b.payment_status === 'pendiente' ? ` Para apartar la fecha pedimos un anticipo de ${money(b.deposit_required)}.` : ''}`;
    if (b.status === 'confirmada') return `Hola ${b.customer_name.split(' ')[0]}, te confirmo tu sesión "${b.package_name}": ${when}. ¡Te espero!`;
    return `Hola ${b.customer_name.split(' ')[0]}, te escribo sobre tu sesión "${b.package_name}" del ${when}.`;
  };

  const next: Record<PhotoBookingStatus, [PhotoBookingStatus, string][]> = {
    pendiente: [['confirmada', 'Confirmar'], ['cancelada', 'Cancelar']],
    confirmada: [['realizada', 'Sesión realizada'], ['no_show', 'No asistió'], ['cancelada', 'Cancelar']],
    realizada: [['entregada', 'Fotos entregadas']],
    entregada: [], cancelada: [], no_show: [],
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Hoy" value={stats.today} accent={ACCENT} />
        <Kpi label="Por confirmar" value={stats.pending} accent={ACCENT} tone={stats.pending > 0 ? 'warn' : undefined} />
        <Kpi label="Próximas" value={stats.upcoming} accent={ACCENT} />
        <Kpi label="Anticipos por cobrar" value={money(stats.deposits)} accent={ACCENT} tone={stats.deposits > 0 ? 'warn' : undefined} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Pills items={[['proximas', 'Próximas'], ['pendientes', 'Por confirmar'], ['realizadas', 'Realizadas'], ['canceladas', 'Canceladas'], ['todas', 'Todas']]} value={filter} onChange={setFilter} />
        <SearchBox value={q} onChange={setQ} placeholder="Cliente, teléfono, código o paquete" />
        <button type="button" className={btnPrimary} style={{ background: ACCENT, color: ON_ACCENT }} onClick={() => setManual(true)}><FaPlus /> Agregar sesión</button>
      </div>

      {shown.length === 0 ? (
        <Empty emoji="🗓️">{filter === 'proximas' ? 'No tienes sesiones próximas. Cuando alguien reserve desde tu perfil aparecerá aquí con aviso al celular.' : 'No hay reservas con ese filtro.'}</Empty>
      ) : (
        <div className="space-y-3">
          {shown.map(b => (
            <div key={b.id} className="rounded-2xl border p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}>
              <div className="flex items-start gap-3">
                <div className="w-14 shrink-0 rounded-lg py-2 text-center" style={{ background: `${ACCENT}1f`, border: `1px solid ${ACCENT}44` }}>
                  <p className="text-xl font-bold text-white leading-none">{b.session_date.slice(8, 10)}</p>
                  <p className="text-[9px] uppercase tracking-widest mt-1" style={{ color: ACCENT }}>{prettyDay(b.session_date).split(' ').slice(-1)[0]}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: STATUS_COLOR[b.status] }}>{BOOKING_LABEL[b.status]} · {b.confirmation_code}</p>
                  <p className="text-white font-semibold leading-snug">{b.package_name}{b.hours ? ` · ${b.hours} h` : ''}</p>
                  <p className="text-[12px] text-white/55">{b.full_day ? 'Día completo' : `${b.start_time} – ${b.end_time}`} · {prettyDay(b.session_date)} · creada {ago(b.created_at)}</p>
                  <p className="text-[12px] text-white/70 mt-1 flex flex-wrap gap-x-3"><span className="flex items-center gap-1"><FaUserAlt size={9} /> {b.customer_name}</span>{b.customer_phone && <span>{b.customer_phone}</span>}{b.customer_email && <span>{b.customer_email}</span>}</p>
                  <p className="text-[11px] text-white/40 flex flex-wrap gap-x-3 mt-0.5">
                    <span className="flex items-center gap-1"><FaMapMarkerAlt size={9} /> {LOCATION_LABEL[b.location_kind]}{b.location_text ? `: ${b.location_text}` : ''}</span>
                    {b.people ? <span>{b.people} personas</span> : null}
                    {b.photographer_name ? <span className="flex items-center gap-1"><FaCamera size={9} /> {b.photographer_name}</span> : null}
                  </p>
                  {b.notes && <p className="text-[12px] text-white/60 italic mt-1.5">“{b.notes}”</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-white font-bold">{b.total > 0 ? money(b.total) : '—'}</p>
                  {b.deposit_required > 0 && <p className="text-[10px] text-white/40">anticipo {money(b.deposit_required)}</p>}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {(Object.keys(PAY_LABEL) as PhotoPaymentStatus[]).map(p => (
                  <button key={p} type="button" onClick={() => patch(b, { payment_status: p })} aria-pressed={b.payment_status === p}
                    className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border transition"
                    style={b.payment_status === p ? { background: ACCENT, color: ON_ACCENT, borderColor: ACCENT } : { color: 'rgba(255,255,255,0.45)', borderColor: 'rgba(255,255,255,0.12)' }}>{PAY_LABEL[p]}</button>
                ))}
                <span className="flex-1" />
                {b.customer_phone && <a href={waLink(b.customer_phone, waText(b))} target="_blank" rel="noopener noreferrer" aria-label="Escribir por WhatsApp" className={`${btnGhost} !px-3 flex items-center gap-1.5`}><FaWhatsapp /> WhatsApp</a>}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {next[b.status].map(([st, label]) => (
                  <button key={st} type="button" onClick={() => patch(b, { status: st })}
                    className={st === 'cancelada' || st === 'no_show' ? 'px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border border-red-500/30 text-red-400 hover:bg-red-500/10' : btnPrimary}
                    style={st === 'cancelada' || st === 'no_show' ? undefined : { background: ACCENT, color: ON_ACCENT }}>{label}</button>
                ))}
                <span className="flex-1" />
                {(b.status === 'cancelada' || b.status === 'no_show') && <button type="button" aria-label="Eliminar reserva" onClick={() => remove(b)} className={dangerBtn}><FaTrash size={11} /></button>}
              </div>

              <textarea defaultValue={b.admin_note || ''} rows={1} placeholder="Mensaje para el cliente (lo ve al consultar su código)"
                onBlur={e => { const v = e.target.value.trim(); if (v !== (b.admin_note || '')) patch(b, { admin_note: v || null }); }}
                className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-[13px] text-white placeholder-white/25 focus:outline-none focus:border-white/30 resize-none" />
            </div>
          ))}
        </div>
      )}

      {manual && <ManualBooking user={user} onClose={() => setManual(false)} onSaved={() => { setManual(false); t.reload(); }} showNotification={showNotification} />}
    </div>
  );
};

/** Sesión pactada por WhatsApp o en persona: se anota para que ocupe la agenda. */
const ManualBooking: React.FC<{ user: any; onClose: () => void; onSaved: () => void; showNotification: Props['showNotification'] }> = ({ user, onClose, onSaved, showNotification }) => {
  const pk = useOwnerTable<PhotoPackage>({ table: 'photo_packages', ownerColumn: 'photo_profile_id', ownerId: user?.id, realtime: false, order: [{ column: 'sort_order' }] });
  const [f, setF] = useState({ name: '', phone: '', packageId: '', concept: '', date: todayLocal(), time: '10:00', duration: '60', total: '' });
  const [saving, setSaving] = useState(false);
  const chosen = pk.rows.find(p => p.id === f.packageId);
  const pick = (id: string) => {
    const p = pk.rows.find(x => x.id === id);
    setF(s => ({ ...s, packageId: id, concept: p?.name || s.concept, duration: p ? String(p.hourly ? p.min_hours * 60 : p.duration_min) : s.duration, total: p && p.price > 0 ? String(p.hourly ? p.price * p.min_hours : p.price) : s.total }));
  };
  const save = async () => {
    if (!f.name.trim() || !(f.concept.trim() || chosen)) return showNotification('Falta el nombre del cliente o el concepto.', 'error');
    const full = !!chosen?.full_day;
    const start = full ? 0 : toMin(f.time);
    if (start === null) return showNotification('La hora no es válida.', 'error');
    const end = full ? 1439 : Math.min(start + Math.max(15, Number(f.duration) || 60), 1439);
    setSaving(true);
    const { error } = await supabase.from('photo_bookings').insert({
      photo_profile_id: user.id, package_id: chosen?.id ?? null, package_name: (f.concept.trim() || chosen?.name) as string, package_kind: chosen?.kind ?? null,
      session_date: f.date, start_time: toHHMM(start), end_time: toHHMM(end), full_day: full,
      customer_name: f.name.trim(), customer_phone: f.phone.trim() || null, total: Number(f.total) || 0, deposit_required: 0, status: 'confirmada',
    });
    setSaving(false);
    if (error) return showNotification(isMissingSql(error) ? 'Falta ejecutar setup_photo.sql en Supabase.' : `No se pudo guardar: ${error.message}`, 'error');
    showNotification('Sesión agregada a tu agenda.', 'success');
    onSaved();
  };
  return (
    <AdminModal title="Agregar sesión a la agenda" onClose={onClose} accent={ACCENT}>
      <div className="space-y-3">
        <p className="text-[12px] text-white/45">Para sesiones que acordaste por WhatsApp o en persona: así ese horario queda ocupado en tu perfil.</p>
        <Field label="Cliente"><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} className={adminInput} /></Field>
        <Field label="Teléfono (opcional)"><input value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} className={adminInput} /></Field>
        <Field label="Paquete">
          <select value={f.packageId} onChange={e => pick(e.target.value)} className={adminInput}>
            <option value="">Otro (lo escribo)</option>
            {pk.rows.map(p => <option key={p.id} value={p.id}>{p.name} · {KIND_LABEL[p.kind]}</option>)}
          </select>
        </Field>
        {!chosen && <Field label="Concepto"><input value={f.concept} onChange={e => setF({ ...f, concept: e.target.value })} placeholder="Sesión de familia" className={adminInput} /></Field>}
        <div className="grid grid-cols-3 gap-3">
          <Field label="Día"><input type="date" value={f.date} min={todayLocal()} onChange={e => setF({ ...f, date: e.target.value })} className={adminInput} /></Field>
          <Field label="Hora"><input type="time" value={f.time} disabled={!!chosen?.full_day} onChange={e => setF({ ...f, time: e.target.value })} className={adminInput} /></Field>
          <Field label="Minutos"><input inputMode="numeric" value={f.duration} disabled={!!chosen?.full_day} onChange={e => setF({ ...f, duration: e.target.value.replace(/\D/g, '') })} className={adminInput} /></Field>
        </div>
        <Field label="Total ($, opcional)"><input inputMode="decimal" value={f.total} onChange={e => setF({ ...f, total: e.target.value })} className={adminInput} /></Field>
        <button type="button" disabled={saving} onClick={save} className={`${btnPrimary} w-full justify-center`} style={{ background: ACCENT, color: ON_ACCENT }}>{saving ? 'Guardando…' : 'Agregar a mi agenda'}</button>
      </div>
    </AdminModal>
  );
};

/* ═══ Cotizaciones ═══════════════════════════════════════════════════════════ */
const QuotesPanel: React.FC<{ user: any; showNotification: Props['showNotification'] }> = ({ user, showNotification }) => {
  const t = useOwnerTable<PhotoQuote>({
    table: 'photo_quotes', ownerColumn: 'photo_profile_id', ownerId: user?.id, realtime: true, pollMs: 20000,
    order: [{ column: 'created_at', ascending: false }], onNew: () => ping(),
  });
  const [filter, setFilter] = useState<'abiertas' | 'todas'>('abiertas');
  const [open, setOpen] = useState<string | null>(null);
  const shown = useMemo(() => (filter === 'abiertas' ? t.rows.filter(q => q.status === 'nueva' || q.status === 'contactado' || q.status === 'cotizada') : t.rows), [t.rows, filter]);

  const patch = async (qt: PhotoQuote, change: Partial<PhotoQuote>) => {
    t.setRows(rs => rs.map(x => (x.id === qt.id ? { ...x, ...change } : x)));
    const { error } = await supabase.from('photo_quotes').update(change).eq('id', qt.id);
    if (error) { showNotification(error.message, 'error'); t.reload(); }
  };
  const remove = async (qt: PhotoQuote) => {
    if (!window.confirm(`¿Eliminar la solicitud de ${qt.customer_name}?`)) return;
    const { error } = await supabase.from('photo_quotes').delete().eq('id', qt.id);
    if (error) return showNotification(error.message, 'error');
    t.reload();
  };

  if (t.loading) return <Spinner accent={ACCENT} />;
  if (t.missingSql) return <MissingSqlNotice file="setup_photo.sql" accent={ACCENT} />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Kpi label="Nuevas" value={t.rows.filter(q => q.status === 'nueva').length} accent={ACCENT} tone={t.rows.some(q => q.status === 'nueva') ? 'warn' : undefined} />
        <Kpi label="En proceso" value={t.rows.filter(q => q.status === 'contactado' || q.status === 'cotizada').length} accent={ACCENT} />
        <Kpi label="Aceptadas" value={t.rows.filter(q => q.status === 'aceptada').length} accent={ACCENT} tone="good" />
      </div>
      <Pills items={[['abiertas', 'Abiertas'], ['todas', 'Todas']]} value={filter} onChange={setFilter} />
      {shown.length === 0 ? <Empty emoji="📋">Aquí llegan las solicitudes de cotización de bodas, eventos y proyectos a medida.</Empty> : (
        <div className="space-y-3">
          {shown.map(qt => {
            const isOpen = open === qt.id;
            return (
              <div key={qt.id} className="rounded-2xl border p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.03)', borderColor: qt.status === 'nueva' ? `${ACCENT}66` : 'rgba(255,255,255,0.08)' }}>
                <button type="button" onClick={() => setOpen(isOpen ? null : qt.id)} className="w-full text-left flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: ACCENT }}>{QUOTE_LABEL[qt.status]} · {qt.quote_code} · {ago(qt.created_at)}</p>
                    <p className="text-white font-semibold">{qt.customer_name} · {qt.session_type}</p>
                    <p className="text-[12px] text-white/50">{[qt.event_date ? prettyDay(qt.event_date) : null, qt.location_text, qt.people ? `${qt.people} personas` : null, qt.budget].filter(Boolean).join(' · ') || 'Sin más datos'}</p>
                  </div>
                  <span className="text-white/30 text-xs shrink-0">{isOpen ? '▲' : '▼'}</span>
                </button>
                {isOpen && (
                  <div className="space-y-3">
                    {qt.package_name && <p className="text-[12px] text-white/60">Interesado en: <b className="text-white">{qt.package_name}</b></p>}
                    {qt.details && <p className="text-[13px] text-white/75 whitespace-pre-wrap rounded-xl bg-black/30 p-3">{qt.details}</p>}
                    <p className="text-[12px] text-white/55 flex flex-wrap gap-x-4">{qt.customer_phone && <span>📞 {qt.customer_phone}</span>}{qt.customer_email && <span>✉️ {qt.customer_email}</span>}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="Estado">
                        <select value={qt.status} onChange={e => patch(qt, { status: e.target.value as PhotoQuoteStatus })} className={adminInput}>
                          {(Object.keys(QUOTE_LABEL) as PhotoQuoteStatus[]).map(s => <option key={s} value={s}>{QUOTE_LABEL[s]}</option>)}
                        </select>
                      </Field>
                      <Field label="Tu cotización ($)" hint="La ve el cliente al consultar su código.">
                        <input inputMode="decimal" defaultValue={qt.quoted_total ?? ''} onBlur={e => { const v = e.target.value.trim(); const n = v === '' ? null : Number(v.replace(',', '.')); if (n !== (qt.quoted_total ?? null) && (n === null || Number.isFinite(n))) patch(qt, { quoted_total: n, status: n !== null && qt.status === 'nueva' ? 'cotizada' : qt.status }); }} className={adminInput} />
                      </Field>
                    </div>
                    <Field label="Mensaje para el cliente"><textarea rows={2} defaultValue={qt.admin_note || ''} onBlur={e => { const v = e.target.value.trim(); if (v !== (qt.admin_note || '')) patch(qt, { admin_note: v || null }); }} className={adminInput} /></Field>
                    <div className="flex items-center gap-2">
                      {qt.customer_phone && <a href={waLink(qt.customer_phone, `Hola ${qt.customer_name.split(' ')[0]}, te escribo por tu solicitud de "${qt.session_type}" (código ${qt.quote_code}).${qt.quoted_total ? ` Mi propuesta: ${money(qt.quoted_total)}.` : ''}`)} target="_blank" rel="noopener noreferrer" className={`${btnGhost} flex items-center gap-1.5`}><FaWhatsapp /> WhatsApp</a>}
                      <span className="flex-1" />
                      <button type="button" aria-label="Eliminar solicitud" onClick={() => remove(qt)} className={dangerBtn}><FaTrash size={11} /></button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ═══ Horario, reglas de reserva y fechas cerradas ═══════════════════════════ */
const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const SchedulePanel: React.FC<{ user: any; profileData: any; setProfileData?: React.Dispatch<React.SetStateAction<any>>; showNotification: Props['showNotification']; isUltra: boolean }> = ({ user, profileData, setProfileData, showNotification, isUltra }) => {
  const { settings, save, saving } = useJsonSettings<PhotoSettings>('photo_settings', user?.id, profileData, setProfileData, showNotification);
  const [hours, setHours] = useState<PhotoWorkingDay[]>(() => (Array.isArray(settings.workingHours) && settings.workingHours.length ? settings.workingHours : DEFAULT_HOURS));
  const [cfg, setCfg] = useState({
    bookingEnabled: settings.bookingEnabled !== false, quotesEnabled: settings.quotesEnabled !== false, galleriesEnabled: settings.galleriesEnabled !== false,
    slotMinutes: String(settings.slotMinutes ?? 60), bookingDaysAhead: String(settings.bookingDaysAhead ?? 60), minNoticeHours: String(settings.minNoticeHours ?? 12),
    cancelHours: String(settings.cancelHours ?? 48), parallelSessions: String(settings.parallelSessions ?? 1),
  });
  const blocks = useOwnerTable<PhotoBlock>({ table: 'photo_blocks', ownerColumn: 'photo_profile_id', ownerId: user?.id, realtime: false, order: [{ column: 'date_from' }] });
  const [nb, setNb] = useState({ from: todayLocal(), to: todayLocal(), reason: '' });
  const setDay = (day: number, change: Partial<PhotoWorkingDay>) => setHours(hs => hs.map(h => (Number(h.day) === day ? { ...h, ...change } : h)));
  const num = (s: string, lo: number, hi: number, d: number) => { const n = Math.round(Number(s)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

  const saveAll = () => {
    for (const h of hours) if (h.isOpen && (toMin(h.openTime) === null || toMin(h.closeTime) === null || (toMin(h.closeTime) as number) <= (toMin(h.openTime) as number))) {
      return showNotification(`Revisa el horario del ${DAY_NAMES[h.day].toLowerCase()}: la hora de cierre debe ser después de la de apertura.`, 'error');
    }
    save({
      bookingEnabled: cfg.bookingEnabled, quotesEnabled: cfg.quotesEnabled, galleriesEnabled: cfg.galleriesEnabled, workingHours: hours,
      slotMinutes: num(cfg.slotMinutes, 15, 240, 60), bookingDaysAhead: num(cfg.bookingDaysAhead, 1, 180, 60), minNoticeHours: num(cfg.minNoticeHours, 0, 720, 12),
      cancelHours: num(cfg.cancelHours, 0, 720, 48), ...(isUltra ? { parallelSessions: num(cfg.parallelSessions, 1, 10, 1) } : {}),
    }, 'Horario y reglas guardados.');
  };

  const addBlock = async () => {
    if (!nb.from || !nb.to || nb.to < nb.from) return showNotification('La fecha final no puede ser anterior a la inicial.', 'error');
    const { error } = await supabase.from('photo_blocks').insert({ photo_profile_id: user.id, date_from: nb.from, date_to: nb.to, reason: nb.reason.trim() || null });
    if (error) return showNotification(isMissingSql(error) ? 'Falta ejecutar setup_photo.sql en Supabase.' : error.message, 'error');
    setNb({ from: nb.to, to: nb.to, reason: '' }); blocks.reload();
  };
  const delBlock = async (b: PhotoBlock) => { await supabase.from('photo_blocks').delete().eq('id', b.id); blocks.reload(); };

  if (blocks.missingSql) return <MissingSqlNotice file="setup_photo.sql" accent={ACCENT} />;
  const row = 'flex items-center justify-between gap-3 py-2';

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 p-4 space-y-1">
        <p className="text-[10px] font-black uppercase tracking-widest text-white/45 mb-2">Qué ofrece tu perfil</p>
        <div className={row}><span className="text-sm text-white/80">Reservas con fecha y hora</span><Toggle on={cfg.bookingEnabled} onChange={v => setCfg({ ...cfg, bookingEnabled: v })} label="Reservas en línea" /></div>
        <div className={row}><span className="text-sm text-white/80">Pedidos de cotización</span><Toggle on={cfg.quotesEnabled} onChange={v => setCfg({ ...cfg, quotesEnabled: v })} label="Cotizaciones" /></div>
        <div className={row}><span className="text-sm text-white/80">Galería privada para tus clientes</span><Toggle on={cfg.galleriesEnabled} onChange={v => setCfg({ ...cfg, galleriesEnabled: v })} label="Galería privada" /></div>
      </section>

      <section className="rounded-2xl border border-white/10 p-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-white/45 mb-3">Días y horas en que atiendes</p>
        <div className="space-y-2">
          {DAY_ORDER.map(d => {
            const h = hours.find(x => Number(x.day) === d) ?? { day: d, isOpen: false, openTime: '09:00', closeTime: '18:00' };
            return (
              <div key={d} className="flex items-center gap-3 flex-wrap">
                <span className="w-24 text-sm text-white/80">{DAY_NAMES[d]}</span>
                <Toggle on={h.isOpen} onChange={v => setDay(d, { isOpen: v })} label={`Atiendo el ${DAY_NAMES[d].toLowerCase()}`} />
                {h.isOpen ? (
                  <span className="flex items-center gap-2 text-white/50 text-sm">
                    <input type="time" value={h.openTime} onChange={e => setDay(d, { openTime: e.target.value })} className={`${adminInput} !w-auto`} aria-label={`Apertura del ${DAY_NAMES[d].toLowerCase()}`} /> a
                    <input type="time" value={h.closeTime} onChange={e => setDay(d, { closeTime: e.target.value })} className={`${adminInput} !w-auto`} aria-label={`Cierre del ${DAY_NAMES[d].toLowerCase()}`} />
                  </span>
                ) : <span className="text-xs text-white/30">Cerrado</span>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Field label="Cada cuántos minutos empieza una franja"><select value={cfg.slotMinutes} onChange={e => setCfg({ ...cfg, slotMinutes: e.target.value })} className={adminInput}>{[15, 30, 45, 60, 90, 120].map(m => <option key={m} value={m}>{m} min</option>)}</select></Field>
        <Field label="Días hacia adelante"><input inputMode="numeric" value={cfg.bookingDaysAhead} onChange={e => setCfg({ ...cfg, bookingDaysAhead: e.target.value })} className={adminInput} /></Field>
        <Field label="Anticipación mínima (horas)"><input inputMode="numeric" value={cfg.minNoticeHours} onChange={e => setCfg({ ...cfg, minNoticeHours: e.target.value })} className={adminInput} /></Field>
        <Field label="Cancelar hasta (horas antes)"><input inputMode="numeric" value={cfg.cancelHours} onChange={e => setCfg({ ...cfg, cancelHours: e.target.value })} className={adminInput} /></Field>
        <Field label="Sesiones a la vez" hint={isUltra ? 'Si tienes equipo, cuántas sesiones pueden coincidir.' : 'Plan ULTRA'}>
          <input inputMode="numeric" disabled={!isUltra} value={isUltra ? cfg.parallelSessions : '1'} onChange={e => setCfg({ ...cfg, parallelSessions: e.target.value })} className={adminInput} />
        </Field>
      </section>
      <button type="button" disabled={saving} onClick={saveAll} className={`${btnPrimary} w-full sm:w-auto justify-center`} style={{ background: ACCENT, color: ON_ACCENT }}>{saving ? 'Guardando…' : 'Guardar horario y reglas'}</button>

      <section className="rounded-2xl border border-white/10 p-4 space-y-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-white/45 flex items-center gap-1.5"><FaBan size={10} /> Fechas cerradas (vacaciones, otro evento…)</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
          <Field label="Desde"><input type="date" value={nb.from} min={todayLocal()} onChange={e => setNb({ ...nb, from: e.target.value, to: e.target.value > nb.to ? e.target.value : nb.to })} className={adminInput} /></Field>
          <Field label="Hasta"><input type="date" value={nb.to} min={nb.from} onChange={e => setNb({ ...nb, to: e.target.value })} className={adminInput} /></Field>
          <Field label="Motivo (opcional)" className="col-span-2 sm:col-span-1"><input value={nb.reason} onChange={e => setNb({ ...nb, reason: e.target.value })} className={adminInput} /></Field>
          <button type="button" onClick={addBlock} className={`${btnPrimary} justify-center`} style={{ background: ACCENT, color: ON_ACCENT }}><FaPlus /> Cerrar</button>
        </div>
        {blocks.rows.filter(b => b.date_to >= todayLocal() || b.date_to >= addDaysLocal(todayLocal(), -30)).length === 0 ? (
          <p className="text-[12px] text-white/35">Sin fechas cerradas.</p>
        ) : (
          <ul className="space-y-1.5">
            {blocks.rows.filter(b => b.date_to >= todayLocal()).map(b => (
              <li key={b.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2 text-sm text-white/80">
                <span>{b.date_from === b.date_to ? prettyDay(b.date_from) : `${prettyDay(b.date_from)} → ${prettyDay(b.date_to)}`}{b.reason ? ` · ${b.reason}` : ''}</span>
                <button type="button" aria-label="Reabrir fechas" onClick={() => delBlock(b)} className={dangerBtn}><FaTrash size={10} /></button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default PhotoSessionsTab;
