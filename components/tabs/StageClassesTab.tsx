import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../src/lib/supabase';
import type { StageClass, StageClassBooking, StageClassLevel, StageSettings } from '../../types';
import {
  FaPlus, FaPen, FaTrash, FaCalendarAlt, FaToggleOn, FaToggleOff, FaWhatsapp, FaCheck, FaTimes, FaChevronLeft, FaChevronRight,
} from 'react-icons/fa';
import {
  useOwnerTable, useJsonSettings, AdminModal, Field, adminInput, Spinner, MissingSqlNotice, PlanLock, Pill, ping, waLink,
  todayLocal, addDaysLocal, fmtDate, isMissingSql,
} from '../AdminKit';
import { ExportRangePanel, fetchOwnerRange, type ExportColumn } from '../ExportRangePanel';

/**
 * Pestaña «Clases» de la plantilla Artista (academias y escuelas de música).
 * Horario semanal (PRO+) + reservas de cupo con aforo y lista de asistentes (ULTRA). Motor propio: stage_classes /
 * stage_class_bookings (setup_stage_classes.sql).
 */

interface Props {
  user: any;
  profileData: any;
  setProfileData: React.Dispatch<React.SetStateAction<any>>;
  showNotification: (message: string, type: 'success' | 'error') => void;
  plan: 'conecta' | 'pro' | 'ultra';
}

const ACCENT = '#22d3ee';
const ON_ACCENT = '#06060c';
// Lunes primero: así se lee una semana de clases.
const DAYS = [{ d: 1, l: 'Lunes' }, { d: 2, l: 'Martes' }, { d: 3, l: 'Miércoles' }, { d: 4, l: 'Jueves' }, { d: 5, l: 'Viernes' }, { d: 6, l: 'Sábado' }, { d: 0, l: 'Domingo' }];
const LEVELS: { val: StageClassLevel; label: string }[] = [
  { val: 'todos', label: 'Todos los niveles' }, { val: 'principiante', label: 'Principiante' },
  { val: 'intermedio', label: 'Intermedio' }, { val: 'avanzado', label: 'Avanzado' },
];
const STATUS: Record<string, { label: string; cls: string }> = {
  reservada: { label: 'Reservada', cls: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  asistio: { label: 'Asistió', cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  no_asistio: { label: 'No asistió', cls: 'text-gray-400 bg-white/5 border-white/10' },
  cancelada: { label: 'Cancelada', cls: 'text-red-400 bg-red-500/10 border-red-500/30' },
};
const dowOf = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1).getDay(); };

const BOOKING_COLUMNS: ExportColumn<StageClassBooking>[] = [
  { header: 'Fecha', get: r => r.class_date }, { header: 'Hora', get: r => r.start_time || '' }, { header: 'Clase', get: r => r.class_name },
  { header: 'Profesor', get: r => r.teacher_name || '' }, { header: 'Nombre', get: r => r.customer_name },
  { header: 'Teléfono', get: r => r.customer_phone || '' }, { header: 'Email', get: r => r.customer_email || '' },
  { header: 'Estado', get: r => STATUS[r.status]?.label || r.status },
  { header: 'Código de reserva', get: r => r.confirmation_code }, { header: 'Reservada el', get: r => (r.created_at ? new Date(r.created_at).toLocaleString('es-EC') : '') },
];

export const StageClassesTab: React.FC<Props> = ({ user, profileData, setProfileData, showNotification, plan }) => {
  const isUltra = plan === 'ultra';
  const isPro = plan === 'pro' || isUltra;
  const [view, setView] = useState<'horario' | 'reservas'>('horario');

  const classesT = useOwnerTable<StageClass>({ table: 'stage_classes', ownerColumn: 'stage_profile_id', ownerId: user?.id, realtime: false, order: [{ column: 'day_of_week' }, { column: 'start_time' }] });
  const classes = classesT.rows;
  const [classOpen, setClassOpen] = useState(false);
  const [editing, setEditing] = useState<StageClass | null>(null);

  const toggleClass = async (c: StageClass) => {
    const { error } = await supabase.from('stage_classes').update({ is_active: !c.is_active }).eq('id', c.id);
    if (error) return showNotification(error.message, 'error');
    classesT.reload();
  };
  const removeClass = async (c: StageClass) => {
    if (!window.confirm(`¿Eliminar la clase "${c.name}" de los ${DAYS.find(d => d.d === c.day_of_week)?.l.toLowerCase()}? Las reservas ya hechas se conservan.`)) return;
    const { error } = await supabase.from('stage_classes').delete().eq('id', c.id);
    if (error) return showNotification(error.message, 'error');
    classesT.reload();
  };

  if (classesT.loading) return <Spinner accent={ACCENT} />;

  return (
    <div className="animate-fade-in-up space-y-6 max-w-4xl mx-auto px-4 md:px-6 pb-32" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5" style={{ borderColor: `${ACCENT}26` }}>
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2"><FaCalendarAlt style={{ color: ACCENT }} /> Clases</h2>
          <p className="text-sm text-white/40 mt-1">
            El horario semanal de tu academia. {isUltra ? 'Con aforo, reservas de cupo y lista de asistentes.' : 'En ULTRA añades aforo, reservas de cupo y lista de asistentes.'}
          </p>
          {!isPro && <p className="text-xs mt-2 text-amber-400">El horario se muestra en tu perfil con el plan PRO o ULTRA.</p>}
        </div>
        {view === 'horario' && (
          <button onClick={() => { setEditing(null); setClassOpen(true); }} className="flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl" style={{ background: ACCENT, color: ON_ACCENT }}>
            <FaPlus size={11} /> Nueva clase
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Pill active={view === 'horario'} onClick={() => setView('horario')} accent={ACCENT} onAccent={ON_ACCENT}>Horario</Pill>
        <Pill active={view === 'reservas'} onClick={() => setView('reservas')} accent={ACCENT} onAccent={ON_ACCENT}>Reservas {!isUltra && '🔒'}</Pill>
      </div>

      {classesT.missingSql && <MissingSqlNotice file="setup_stage_classes.sql" accent={ACCENT} />}

      {view === 'horario' && !classesT.missingSql && (
        classes.length === 0 ? (
          <div className="text-center py-16 text-white/30"><p className="text-4xl mb-3">🎸</p><p className="text-sm">Aún no hay clases. Crea la primera y márcala en varios días a la vez.</p></div>
        ) : (
          <div className="space-y-5">
            {DAYS.map(({ d, l }) => {
              const list = classes.filter(c => c.day_of_week === d);
              if (list.length === 0) return null;
              return (
                <div key={d}>
                  <p className="text-[11px] font-black uppercase tracking-[0.25em] mb-2" style={{ color: ACCENT }}>{l}</p>
                  <div className="space-y-2">
                    {list.map(c => (
                      <div key={c.id} className="flex items-center gap-3 rounded-xl border px-3.5 py-3" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)', opacity: c.is_active ? 1 : 0.5 }}>
                        <div className="w-[70px] shrink-0 text-center">
                          <p className="text-white font-black">{c.start_time}</p>
                          {c.end_time && <p className="text-[10px] text-white/35">{c.end_time}</p>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-white font-bold truncate">{c.name}</p>
                          <p className="text-[11px] text-white/45 truncate">{[c.discipline, c.teacher_name, c.room, LEVELS.find(x => x.val === c.level)?.label, c.capacity ? `${c.capacity} cupos` : null].filter(Boolean).join(' · ')}</p>
                        </div>
                        <button title={c.is_active ? 'Desactivar' : 'Activar'} onClick={() => toggleClass(c)} className="text-white/50 hover:text-white">{c.is_active ? <FaToggleOn size={18} style={{ color: ACCENT }} /> : <FaToggleOff size={18} />}</button>
                        <button title="Editar" onClick={() => { setEditing(c); setClassOpen(true); }} className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 text-white/60 flex items-center justify-center hover:text-white"><FaPen size={11} /></button>
                        <button title="Eliminar" onClick={() => removeClass(c)} className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center hover:bg-red-500/20"><FaTrash size={11} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {view === 'reservas' && (isUltra
        ? <BookingsView user={user} classes={classes} profileData={profileData} setProfileData={setProfileData} showNotification={showNotification} />
        : <PlanLock plan="ULTRA" what="Reserva de cupos con aforo y lista de asistentes" accent={ACCENT} />)}

      {classOpen && (
        <ClassModal userId={user.id} editing={editing} isUltra={isUltra} showNotification={showNotification}
          onClose={() => setClassOpen(false)} onSaved={() => { setClassOpen(false); classesT.reload(); }} />
      )}
    </div>
  );
};

/* ── Modal de clase ───────────────────────────────────────────────────────── */
const ClassModal: React.FC<{
  userId: string; editing: StageClass | null; isUltra: boolean;
  showNotification: Props['showNotification']; onClose: () => void; onSaved: () => void;
}> = ({ userId, editing, isUltra, showNotification, onClose, onSaved }) => {
  const [name, setName] = useState(editing?.name || '');
  const [discipline, setDiscipline] = useState(editing?.discipline || '');
  const [description, setDescription] = useState(editing?.description || '');
  const [days, setDays] = useState<number[]>(editing ? [editing.day_of_week] : [1, 3]);
  const [start, setStart] = useState(editing?.start_time || '17:00');
  const [end, setEnd] = useState(editing?.end_time || '18:00');
  const [teacher, setTeacher] = useState(editing?.teacher_name || '');
  const [capacity, setCapacity] = useState(editing?.capacity != null ? String(editing.capacity) : '');
  const [level, setLevel] = useState<StageClassLevel>(editing?.level || 'todos');
  const [room, setRoom] = useState(editing?.room || '');
  const [active, setActive] = useState(editing?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  const toggleDay = (d: number) => setDays(p => editing ? [d] : p.includes(d) ? p.filter(x => x !== d) : [...p, d]);

  const save = async () => {
    if (!name.trim()) return showNotification('El nombre de la clase es obligatorio.', 'error');
    if (days.length === 0) return showNotification('Elige al menos un día.', 'error');
    if (!/^[0-2]\d:[0-5]\d$/.test(start)) return showNotification('Indica la hora de inicio.', 'error');
    if (end && end <= start) return showNotification('La hora de fin debe ser posterior a la de inicio.', 'error');
    const base = {
      stage_profile_id: userId, name: name.trim(), discipline: discipline.trim() || null, description: description.trim() || null,
      start_time: start, end_time: end || null, teacher_name: teacher.trim() || null,
      capacity: isUltra && capacity !== '' ? Math.max(1, Math.round(Number(capacity))) : (editing?.capacity ?? null),
      level, room: room.trim() || null, is_active: active,
    };
    setSaving(true);
    const { error } = editing
      ? await supabase.from('stage_classes').update({ ...base, day_of_week: days[0] }).eq('id', editing.id)
      : await supabase.from('stage_classes').insert(days.map(d => ({ ...base, day_of_week: d })));
    setSaving(false);
    if (error) return showNotification(isMissingSql(error) ? 'Falta ejecutar setup_stage_classes.sql en Supabase.' : `No se pudo guardar: ${error.message}`, 'error');
    showNotification(editing ? 'Clase actualizada.' : `${days.length} clase${days.length === 1 ? '' : 's'} creada${days.length === 1 ? '' : 's'}.`, 'success');
    onSaved();
  };

  return (
    <AdminModal title={editing ? 'Editar clase' : 'Nueva clase'} accent={ACCENT} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Nombre *"><input className={adminInput} value={name} onChange={e => setName(e.target.value)} placeholder="Guitarra inicial, Canto, Piano…" /></Field>
        <Field label="Instrumento o disciplina"><input className={adminInput} value={discipline} onChange={e => setDiscipline(e.target.value)} placeholder="Guitarra · Piano · Canto · Batería" /></Field>
        <Field label={editing ? 'Día' : 'Días en que se repite'}>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map(({ d, l }) => (
              <button key={d} type="button" onClick={() => toggleDay(d)} className="px-3 py-1.5 rounded-lg text-xs font-bold border transition"
                style={days.includes(d) ? { background: ACCENT, color: ON_ACCENT, borderColor: ACCENT } : { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.6)', borderColor: 'rgba(255,255,255,0.1)' }}>{l.slice(0, 3)}</button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Inicio *"><input type="time" className={adminInput} value={start} onChange={e => setStart(e.target.value)} /></Field>
          <Field label="Fin"><input type="time" className={adminInput} value={end} onChange={e => setEnd(e.target.value)} /></Field>
        </div>
        <Field label="Profesor"><input className={adminInput} value={teacher} onChange={e => setTeacher(e.target.value)} placeholder="Nombre del profesor" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nivel"><select className={adminInput} value={level} onChange={e => setLevel(e.target.value as StageClassLevel)}>{LEVELS.map(l => <option key={l.val} value={l.val}>{l.label}</option>)}</select></Field>
          <Field label="Aula / sala"><input className={adminInput} value={room} onChange={e => setRoom(e.target.value)} placeholder="Aula 2" /></Field>
        </div>
        <Field label="Aforo (cupos)" hint={isUltra ? 'Vacío = sin límite. Es el tope de reservas por clase.' : 'El aforo y las reservas son parte del plan ULTRA.'}>
          <input type="number" min={1} className={adminInput} value={capacity} onChange={e => setCapacity(e.target.value)} disabled={!isUltra} placeholder={isUltra ? 'Ej. 8' : 'ULTRA'} />
        </Field>
        <Field label="Descripción"><textarea className={adminInput} rows={2} value={description} onChange={e => setDescription(e.target.value)} /></Field>
        <label className="flex items-center gap-2 text-sm text-white/70"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Visible en el perfil</label>
        <button onClick={save} disabled={saving} className="w-full py-3 rounded-xl text-sm font-black uppercase tracking-wider disabled:opacity-50" style={{ background: ACCENT, color: ON_ACCENT }}>{saving ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </AdminModal>
  );
};

/* ── Reservas de cupo (ULTRA) ─────────────────────────────────────────────── */
const BookingsView: React.FC<{
  user: any; classes: StageClass[]; profileData: any; setProfileData: Props['setProfileData']; showNotification: Props['showNotification'];
}> = ({ user, classes, profileData, setProfileData, showNotification }) => {
  const { settings, save, saving } = useJsonSettings<StageSettings>('stage_settings', user?.id, profileData, setProfileData, showNotification);
  const [date, setDate] = useState(todayLocal());
  const [bookings, setBookings] = useState<StageClassBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<StageSettings | null>(null);
  const cfg = { ...settings, ...(draft || {}) };

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await supabase.from('stage_class_bookings').select('*').eq('stage_profile_id', user.id).eq('class_date', date).order('start_time');
    if (!error) setBookings((data ?? []) as StageClassBooking[]);
    setLoading(false);
  }, [user?.id, date]);

  useEffect(() => {
    load();
    const ch = supabase.channel(`stage_class_bookings_${user?.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stage_class_bookings', filter: `stage_profile_id=eq.${user?.id}` }, (p: any) => {
        if (p.eventType === 'INSERT') ping();
        load();
      }).subscribe();
    const t = setInterval(load, 20000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, [load, user?.id]);

  const dayClasses = useMemo(() => {
    const dow = dowOf(date);
    const fromSchedule = classes.filter(c => c.day_of_week === dow && c.is_active);
    // Una reserva de una clase ya borrada igual debe verse.
    const orphan = bookings.filter(b => !b.class_id || !fromSchedule.some(c => c.id === b.class_id));
    return { fromSchedule, orphan };
  }, [classes, bookings, date]);

  const setStatus = async (b: StageClassBooking, status: StageClassBooking['status']) => {
    const { error } = await supabase.from('stage_class_bookings').update({ status }).eq('id', b.id);
    if (error) return showNotification(error.message, 'error');
    setBookings(prev => prev.map(x => x.id === b.id ? { ...x, status } : x));
  };
  const remove = async (b: StageClassBooking) => {
    if (!window.confirm('¿Eliminar esta reserva?')) return;
    const { error } = await supabase.from('stage_class_bookings').delete().eq('id', b.id);
    if (error) return showNotification(error.message, 'error');
    setBookings(prev => prev.filter(x => x.id !== b.id));
  };

  const renderList = (list: StageClassBooking[]) => list.length === 0 ? <p className="text-xs text-white/30 py-2">Sin reservas todavía.</p> : (
    <div className="space-y-2">
      {list.map(b => (
        <div key={b.id} className="flex items-center gap-2.5 rounded-lg border px-3 py-2.5 bg-black/20 border-white/5">
          <div className="min-w-0 flex-1">
            <p className="text-white text-sm font-semibold truncate">{b.customer_name}</p>
            <p className="text-[11px] text-white/40 truncate">{[b.customer_phone, b.customer_email, b.confirmation_code].filter(Boolean).join(' · ')}</p>
          </div>
          <span className={`text-[10px] font-bold uppercase tracking-wider border rounded-full px-2 py-0.5 ${STATUS[b.status]?.cls}`}>{STATUS[b.status]?.label}</span>
          {b.status !== 'asistio' && <button title="Asistió" onClick={() => setStatus(b, 'asistio')} className="w-7 h-7 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 flex items-center justify-center"><FaCheck size={10} /></button>}
          {b.status !== 'no_asistio' && b.status !== 'cancelada' && <button title="No asistió" onClick={() => setStatus(b, 'no_asistio')} className="w-7 h-7 rounded-md bg-white/5 border border-white/10 text-white/50 flex items-center justify-center"><FaTimes size={10} /></button>}
          {b.status === 'reservada' && <button title="Cancelar reserva" onClick={() => setStatus(b, 'cancelada')} className="w-7 h-7 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center"><FaTimes size={10} /></button>}
          {b.customer_phone && <a title="WhatsApp" href={waLink(b.customer_phone, `Hola ${b.customer_name.split(' ')[0]}, te escribimos por tu reserva de ${b.class_name} el ${fmtDate(b.class_date)} a las ${b.start_time}.`)} target="_blank" rel="noopener noreferrer" className="w-7 h-7 rounded-md bg-[#25D366]/10 border border-[#25D366]/25 text-[#25D366] flex items-center justify-center"><FaWhatsapp size={11} /></a>}
          <button title="Eliminar" onClick={() => remove(b)} className="w-7 h-7 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center"><FaTrash size={9} /></button>
        </div>
      ))}
    </div>
  );

  const live = (list: StageClassBooking[]) => list.filter(b => b.status === 'reservada' || b.status === 'asistio').length;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border p-4 space-y-3" style={{ background: `${ACCENT}0a`, borderColor: `${ACCENT}2b` }}>
        <p className="text-xs font-black uppercase tracking-widest text-white">Reglas de reserva</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex items-center gap-2 text-sm text-white/70 sm:col-span-2"><input type="checkbox" checked={cfg.bookingEnabled !== false} onChange={e => setDraft(d => ({ ...(d || {}), bookingEnabled: e.target.checked }))} /> Permitir reservas desde el perfil</label>
          <Field label="Días hacia adelante"><input type="number" min={1} max={60} className={adminInput} value={cfg.bookingDaysAhead ?? 14} onChange={e => setDraft(d => ({ ...(d || {}), bookingDaysAhead: Number(e.target.value) }))} /></Field>
          <Field label="Cancelar hasta (horas antes)"><input type="number" min={0} max={168} className={adminInput} value={cfg.cancelHours ?? 2} onChange={e => setDraft(d => ({ ...(d || {}), cancelHours: Number(e.target.value) }))} /></Field>
        </div>
        {draft && (
          <button disabled={saving} onClick={async () => { if (await save(draft, 'Reglas guardadas.')) setDraft(null); }} className="px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider disabled:opacity-50" style={{ background: ACCENT, color: ON_ACCENT }}>{saving ? 'Guardando…' : 'Guardar reglas'}</button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button onClick={() => setDate(addDaysLocal(date, -1))} aria-label="Día anterior" className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 text-white/60 flex items-center justify-center"><FaChevronLeft size={11} /></button>
        <input type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)} className={`${adminInput} !w-auto`} />
        <button onClick={() => setDate(addDaysLocal(date, 1))} aria-label="Día siguiente" className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 text-white/60 flex items-center justify-center"><FaChevronRight size={11} /></button>
        <button onClick={() => setDate(todayLocal())} className="px-3 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider bg-white/5 border border-white/10 text-white/60">Hoy</button>
      </div>

      {loading ? <Spinner accent={ACCENT} /> : (
        <div className="space-y-4">
          {dayClasses.fromSchedule.length === 0 && dayClasses.orphan.length === 0 && <p className="text-center text-sm text-white/30 py-10">No hay clases este día.</p>}
          {dayClasses.fromSchedule.map(c => {
            const list = bookings.filter(b => b.class_id === c.id); const taken = live(list);
            return (
              <div key={c.id} className="rounded-2xl border p-4" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div><p className="text-white font-bold">{c.start_time} · {c.name}</p><p className="text-[11px] text-white/40">{[c.teacher_name, c.room].filter(Boolean).join(' · ') || 'Sin profesor'}</p></div>
                  <span className="text-[11px] font-black uppercase tracking-wider rounded-full px-3 py-1 border" style={{ color: c.capacity && taken >= c.capacity ? '#f87171' : ACCENT, borderColor: c.capacity && taken >= c.capacity ? '#f8717155' : `${ACCENT}55` }}>{taken}{c.capacity ? ` / ${c.capacity}` : ''} cupos</span>
                </div>
                {renderList(list)}
              </div>
            );
          })}
          {dayClasses.orphan.length > 0 && (
            <div className="rounded-2xl border p-4 border-white/8 bg-white/[0.03]"><p className="text-white/60 text-xs font-bold uppercase tracking-wider mb-2">Clases ya eliminadas</p>{renderList(dayClasses.orphan)}</div>
          )}
        </div>
      )}

      <ExportRangePanel<StageClassBooking>
        accent={ACCENT} noun="reservas" dateLabel="la fecha de la clase" fileBase="reservas-clases" sheetName="Reservas"
        localRows={bookings} getDate={r => r.class_date}
        fetchRange={range => fetchOwnerRange<StageClassBooking>({ table: 'stage_class_bookings', ownerColumn: 'stage_profile_id', ownerId: user.id, dateColumn: 'class_date', range, orderBy: [{ column: 'class_date' }, { column: 'start_time' }] })}
        columns={BOOKING_COLUMNS} showNotification={showNotification} />
    </div>
  );
};

export default StageClassesTab;
