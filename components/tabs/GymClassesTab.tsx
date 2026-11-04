import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../src/lib/supabase';
import type { GymClass, GymCoach, GymBooking, GymClassLevel, GymSettings } from '../../types';
import {
  FaPlus, FaPen, FaTrash, FaCalendarAlt, FaUserTie, FaImage, FaToggleOn, FaToggleOff, FaWhatsapp,
  FaCheck, FaTimes, FaChevronLeft, FaChevronRight,
} from 'react-icons/fa';
import {
  useOwnerTable, useJsonSettings, AdminModal, Field, adminInput, Spinner, MissingSqlNotice, PlanLock, Pill, ping, waLink,
  uploadAsset, todayLocal, addDaysLocal, fmtDate, isMissingSql,
} from '../AdminKit';
import { ExportRangePanel, fetchOwnerRange, type ExportColumn } from '../ExportRangePanel';

interface Props {
  user: any;
  profileData: any;
  setProfileData: React.Dispatch<React.SetStateAction<any>>;
  showNotification: (message: string, type: 'success' | 'error') => void;
  plan: 'conecta' | 'pro' | 'ultra';
}

const ACCENT = '#c6f432';
const ON_ACCENT = '#0a0c09';
const TITLE_FONT = "'Tomorrow', sans-serif";
// Lunes primero: así se lee una semana de gimnasio.
const DAYS = [{ d: 1, l: 'Lunes' }, { d: 2, l: 'Martes' }, { d: 3, l: 'Miércoles' }, { d: 4, l: 'Jueves' }, { d: 5, l: 'Viernes' }, { d: 6, l: 'Sábado' }, { d: 0, l: 'Domingo' }];
const LEVELS: { val: GymClassLevel; label: string }[] = [
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

const BOOKING_COLUMNS: ExportColumn<GymBooking>[] = [
  { header: 'Fecha', get: r => r.class_date }, { header: 'Hora', get: r => r.start_time || '' }, { header: 'Clase', get: r => r.class_name },
  { header: 'Entrenador', get: r => r.coach_name || '' }, { header: 'Nombre', get: r => r.customer_name },
  { header: 'Teléfono', get: r => r.customer_phone || '' }, { header: 'Email', get: r => r.customer_email || '' },
  { header: 'Carnet', get: r => r.member_code || '' }, { header: 'Estado', get: r => STATUS[r.status]?.label || r.status },
  { header: 'Código de reserva', get: r => r.confirmation_code }, { header: 'Reservada el', get: r => (r.created_at ? new Date(r.created_at).toLocaleString('es-EC') : '') },
];

export const GymClassesTab: React.FC<Props> = ({ user, profileData, setProfileData, showNotification, plan }) => {
  const isUltra = plan === 'ultra';
  const [view, setView] = useState<'horario' | 'reservas' | 'equipo'>('horario');

  const classesT = useOwnerTable<GymClass>({ table: 'gym_classes', ownerColumn: 'gym_profile_id', ownerId: user?.id, realtime: false, order: [{ column: 'day_of_week' }, { column: 'start_time' }] });
  const coachesT = useOwnerTable<GymCoach>({ table: 'gym_coaches', ownerColumn: 'gym_profile_id', ownerId: user?.id, realtime: false, order: [{ column: 'sort_order' }, { column: 'created_at' }] });
  const classes = classesT.rows; const coaches = coachesT.rows;

  const [classOpen, setClassOpen] = useState(false);
  const [editing, setEditing] = useState<GymClass | null>(null);
  const [coachOpen, setCoachOpen] = useState(false);
  const [editingCoach, setEditingCoach] = useState<GymCoach | null>(null);

  const toggleClass = async (c: GymClass) => {
    const { error } = await supabase.from('gym_classes').update({ is_active: !c.is_active }).eq('id', c.id);
    if (error) return showNotification(error.message, 'error');
    classesT.reload();
  };
  const removeClass = async (c: GymClass) => {
    if (!window.confirm(`¿Eliminar la clase "${c.name}" de los ${DAYS.find(d => d.d === c.day_of_week)?.l.toLowerCase()}? Las reservas ya hechas se conservan.`)) return;
    const { error } = await supabase.from('gym_classes').delete().eq('id', c.id);
    if (error) return showNotification(error.message, 'error');
    classesT.reload();
  };
  const removeCoach = async (c: GymCoach) => {
    if (!window.confirm(`¿Eliminar a ${c.name}? Sus clases se mantienen con su nombre.`)) return;
    const { error } = await supabase.from('gym_coaches').delete().eq('id', c.id);
    if (error) return showNotification(error.message, 'error');
    coachesT.reload(); classesT.reload();
  };

  if (classesT.loading) return <Spinner accent={ACCENT} />;

  return (
    <div className="animate-fade-in-up space-y-6 max-w-4xl mx-auto px-4 md:px-6 pb-32" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5" style={{ borderColor: `${ACCENT}26` }}>
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2" style={{ fontFamily: TITLE_FONT }}><FaCalendarAlt style={{ color: ACCENT }} /> Clases</h2>
          <p className="text-sm text-white/40 mt-1">Tu horario semanal. {isUltra ? 'Con aforo, reservas de cupo y entrenadores.' : 'En ULTRA añades aforo, reservas de cupo y entrenadores.'}</p>
        </div>
        {view === 'horario' && (
          <button onClick={() => { setEditing(null); setClassOpen(true); }} className="flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl" style={{ background: ACCENT, color: ON_ACCENT, fontFamily: TITLE_FONT }}><FaPlus /> Nueva clase</button>
        )}
        {view === 'equipo' && isUltra && (
          <button onClick={() => { setEditingCoach(null); setCoachOpen(true); }} className="flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl" style={{ background: ACCENT, color: ON_ACCENT, fontFamily: TITLE_FONT }}><FaPlus /> Nuevo entrenador</button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Pill active={view === 'horario'} onClick={() => setView('horario')} accent={ACCENT} onAccent={ON_ACCENT}>Horario</Pill>
        <Pill active={view === 'reservas'} onClick={() => setView('reservas')} accent={ACCENT} onAccent={ON_ACCENT}>Reservas {!isUltra && '🔒'}</Pill>
        <Pill active={view === 'equipo'} onClick={() => setView('equipo')} accent={ACCENT} onAccent={ON_ACCENT}>Entrenadores {!isUltra && '🔒'}</Pill>
      </div>

      {classesT.missingSql && <MissingSqlNotice file="setup_gym.sql" accent={ACCENT} />}

      {view === 'horario' && !classesT.missingSql && (
        classes.length === 0 ? (
          <div className="text-center py-16 text-white/30"><p className="text-4xl mb-3">📅</p><p className="text-sm">Aún no hay clases. Crea la primera y márcala en varios días a la vez.</p></div>
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
                          <p className="text-white font-black" style={{ fontFamily: TITLE_FONT }}>{c.start_time}</p>
                          {c.end_time && <p className="text-[10px] text-white/35">{c.end_time}</p>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-white font-bold truncate">{c.name}</p>
                          <p className="text-[11px] text-white/45 truncate">{[c.coach_name, c.room, LEVELS.find(x => x.val === c.level)?.label, c.capacity ? `${c.capacity} cupos` : null].filter(Boolean).join(' · ')}</p>
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

      {view === 'equipo' && (isUltra ? (
        coaches.length === 0 ? (
          <div className="text-center py-16 text-white/30"><p className="text-4xl mb-3">🏅</p><p className="text-sm">Agrega a tus entrenadores: aparecerán en tu perfil y podrás asignarlos a cada clase.</p></div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {coaches.map(c => (
              <div key={c.id} className="flex items-center gap-3 rounded-2xl border p-3.5" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)', opacity: c.is_active ? 1 : 0.5 }}>
                <div className="w-14 h-14 rounded-xl overflow-hidden bg-white/5 shrink-0 flex items-center justify-center">{c.photo_url ? <img src={c.photo_url} alt="" className="w-full h-full object-cover" /> : <FaUserTie className="text-white/20" />}</div>
                <div className="min-w-0 flex-1"><p className="text-white font-bold truncate">{c.name}</p><p className="text-[11px] text-white/45 truncate">{c.specialty || 'Entrenador'}</p></div>
                <button onClick={() => { setEditingCoach(c); setCoachOpen(true); }} className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 text-white/60 flex items-center justify-center hover:text-white"><FaPen size={11} /></button>
                <button onClick={() => removeCoach(c)} className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center hover:bg-red-500/20"><FaTrash size={11} /></button>
              </div>
            ))}
          </div>
        )
      ) : <PlanLock plan="ULTRA" what="Perfiles de entrenadores y asignación por clase" accent={ACCENT} />)}

      {classOpen && (
        <ClassModal userId={user.id} editing={editing} coaches={coaches} isUltra={isUltra} showNotification={showNotification}
          onClose={() => setClassOpen(false)} onSaved={() => { setClassOpen(false); classesT.reload(); }} />
      )}
      {coachOpen && (
        <CoachModal userId={user.id} editing={editingCoach} showNotification={showNotification}
          onClose={() => setCoachOpen(false)} onSaved={() => { setCoachOpen(false); coachesT.reload(); }} />
      )}
    </div>
  );
};

/* ── Modal de clase ───────────────────────────────────────────────────────── */
const ClassModal: React.FC<{
  userId: string; editing: GymClass | null; coaches: GymCoach[]; isUltra: boolean;
  showNotification: Props['showNotification']; onClose: () => void; onSaved: () => void;
}> = ({ userId, editing, coaches, isUltra, showNotification, onClose, onSaved }) => {
  const [name, setName] = useState(editing?.name || '');
  const [description, setDescription] = useState(editing?.description || '');
  const [days, setDays] = useState<number[]>(editing ? [editing.day_of_week] : [1, 3, 5]);
  const [start, setStart] = useState(editing?.start_time || '18:00');
  const [end, setEnd] = useState(editing?.end_time || '19:00');
  const [coachName, setCoachName] = useState(editing?.coach_name || '');
  const [capacity, setCapacity] = useState(editing?.capacity != null ? String(editing.capacity) : '');
  const [level, setLevel] = useState<GymClassLevel>(editing?.level || 'todos');
  const [room, setRoom] = useState(editing?.room || '');
  const [active, setActive] = useState(editing?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  const toggleDay = (d: number) => setDays(p => editing ? [d] : p.includes(d) ? p.filter(x => x !== d) : [...p, d]);

  const save = async () => {
    if (!name.trim()) return showNotification('El nombre de la clase es obligatorio.', 'error');
    if (days.length === 0) return showNotification('Elige al menos un día.', 'error');
    if (!/^[0-2]\d:[0-5]\d$/.test(start)) return showNotification('Indica la hora de inicio.', 'error');
    if (end && end <= start) return showNotification('La hora de fin debe ser posterior a la de inicio.', 'error');
    const coach = coaches.find(c => c.name.toLowerCase() === coachName.trim().toLowerCase());
    const base = {
      gym_profile_id: userId, name: name.trim(), description: description.trim() || null, start_time: start, end_time: end || null,
      coach_id: coach?.id ?? null, coach_name: coachName.trim() || null,
      capacity: isUltra && capacity !== '' ? Math.max(1, Math.round(Number(capacity))) : (editing?.capacity ?? null),
      level, room: room.trim() || null, is_active: active,
    };
    setSaving(true);
    const { error } = editing
      ? await supabase.from('gym_classes').update({ ...base, day_of_week: days[0] }).eq('id', editing.id)
      : await supabase.from('gym_classes').insert(days.map(d => ({ ...base, day_of_week: d })));
    setSaving(false);
    if (error) return showNotification(isMissingSql(error) ? 'Falta ejecutar setup_gym.sql en Supabase.' : `No se pudo guardar: ${error.message}`, 'error');
    showNotification(editing ? 'Clase actualizada.' : `${days.length} clase${days.length === 1 ? '' : 's'} creada${days.length === 1 ? '' : 's'}.`, 'success');
    onSaved();
  };

  return (
    <AdminModal title={editing ? 'Editar clase' : 'Nueva clase'} accent={ACCENT} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Nombre *"><input className={adminInput} value={name} onChange={e => setName(e.target.value)} placeholder="Spinning, Funcional, Yoga…" /></Field>
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
        <Field label="Entrenador" hint={isUltra && coaches.length ? 'Elige uno de tu equipo o escribe otro nombre' : undefined}>
          <input className={adminInput} list="gym-coaches" value={coachName} onChange={e => setCoachName(e.target.value)} placeholder="Nombre del entrenador" />
          <datalist id="gym-coaches">{coaches.map(c => <option key={c.id} value={c.name} />)}</datalist>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nivel"><select className={adminInput} value={level} onChange={e => setLevel(e.target.value as GymClassLevel)}>{LEVELS.map(l => <option key={l.val} value={l.val}>{l.label}</option>)}</select></Field>
          <Field label="Sala / zona"><input className={adminInput} value={room} onChange={e => setRoom(e.target.value)} placeholder="Sala 2" /></Field>
        </div>
        <Field label="Aforo (cupos)" hint={isUltra ? 'Vacío = sin límite. Es el tope de reservas por clase.' : 'El aforo y las reservas son parte del plan ULTRA.'}>
          <input type="number" min={1} className={adminInput} value={capacity} onChange={e => setCapacity(e.target.value)} disabled={!isUltra} placeholder={isUltra ? 'Ej. 20' : 'ULTRA'} />
        </Field>
        <Field label="Descripción"><textarea className={adminInput} rows={2} value={description} onChange={e => setDescription(e.target.value)} /></Field>
        <label className="flex items-center gap-2 text-sm text-white/70"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Visible en el perfil</label>
        <button onClick={save} disabled={saving} className="w-full py-3 rounded-xl text-sm font-black uppercase tracking-wider disabled:opacity-50" style={{ background: ACCENT, color: ON_ACCENT, fontFamily: TITLE_FONT }}>{saving ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </AdminModal>
  );
};

/* ── Modal de entrenador ──────────────────────────────────────────────────── */
const CoachModal: React.FC<{ userId: string; editing: GymCoach | null; showNotification: Props['showNotification']; onClose: () => void; onSaved: () => void }> = ({ userId, editing, showNotification, onClose, onSaved }) => {
  const [name, setName] = useState(editing?.name || ''); const [specialty, setSpecialty] = useState(editing?.specialty || '');
  const [bio, setBio] = useState(editing?.bio || ''); const [photo, setPhoto] = useState(editing?.photo_url || '');
  const [active, setActive] = useState(editing?.is_active ?? true);
  const [uploading, setUploading] = useState(false); const [saving, setSaving] = useState(false);

  const upload = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try { setPhoto(await uploadAsset(userId, 'gym_coaches', file)); }
    catch (err: any) { showNotification(`Error al subir la foto: ${err?.message}`, 'error'); }
    finally { setUploading(false); }
  };
  const save = async () => {
    if (!name.trim()) return showNotification('El nombre es obligatorio.', 'error');
    const payload = { gym_profile_id: userId, name: name.trim(), specialty: specialty.trim() || null, bio: bio.trim() || null, photo_url: photo || null, is_active: active };
    setSaving(true);
    const { error } = editing ? await supabase.from('gym_coaches').update(payload).eq('id', editing.id) : await supabase.from('gym_coaches').insert(payload);
    setSaving(false);
    if (error) return showNotification(`No se pudo guardar: ${error.message}`, 'error');
    onSaved();
  };
  return (
    <AdminModal title={editing ? 'Editar entrenador' : 'Nuevo entrenador'} accent={ACCENT} onClose={onClose}>
      <div className="space-y-3">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-2xl overflow-hidden bg-white/5 flex items-center justify-center shrink-0">{photo ? <img src={photo} alt="" className="w-full h-full object-cover" /> : <FaUserTie className="text-white/20 text-2xl" />}</div>
          <label className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider border cursor-pointer text-white/70 hover:text-white" style={{ borderColor: `${ACCENT}44` }}>
            <FaImage className="inline mr-2" />{uploading ? 'Subiendo…' : 'Subir foto'}
            <input type="file" accept="image/*" className="hidden" onChange={e => upload(e.target.files?.[0])} />
          </label>
        </div>
        <Field label="Nombre *"><input className={adminInput} value={name} onChange={e => setName(e.target.value)} /></Field>
        <Field label="Especialidad"><input className={adminInput} value={specialty} onChange={e => setSpecialty(e.target.value)} placeholder="Funcional · CrossFit · Yoga" /></Field>
        <Field label="Presentación"><textarea className={adminInput} rows={3} value={bio} onChange={e => setBio(e.target.value)} /></Field>
        <label className="flex items-center gap-2 text-sm text-white/70"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Visible en el perfil</label>
        <button onClick={save} disabled={saving || uploading} className="w-full py-3 rounded-xl text-sm font-black uppercase tracking-wider disabled:opacity-50" style={{ background: ACCENT, color: ON_ACCENT, fontFamily: TITLE_FONT }}>{saving ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </AdminModal>
  );
};

/* ── Reservas de cupo (ULTRA) ─────────────────────────────────────────────── */
const BookingsView: React.FC<{
  user: any; classes: GymClass[]; profileData: any; setProfileData: Props['setProfileData']; showNotification: Props['showNotification'];
}> = ({ user, classes, profileData, setProfileData, showNotification }) => {
  const { settings, save, saving } = useJsonSettings<GymSettings>('gym_settings', user?.id, profileData, setProfileData, showNotification);
  const [date, setDate] = useState(todayLocal());
  const [bookings, setBookings] = useState<GymBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<GymSettings | null>(null);
  const cfg = { ...settings, ...(draft || {}) };

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await supabase.from('gym_bookings').select('*').eq('gym_profile_id', user.id).eq('class_date', date).order('start_time');
    if (!error) setBookings((data ?? []) as GymBooking[]);
    setLoading(false);
  }, [user?.id, date]);

  useEffect(() => {
    load();
    const ch = supabase.channel(`gym_bookings_${user?.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gym_bookings', filter: `gym_profile_id=eq.${user?.id}` }, (p: any) => {
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

  const setStatus = async (b: GymBooking, status: GymBooking['status']) => {
    const { error } = await supabase.from('gym_bookings').update({ status }).eq('id', b.id);
    if (error) return showNotification(error.message, 'error');
    setBookings(prev => prev.map(x => x.id === b.id ? { ...x, status } : x));
  };
  const remove = async (b: GymBooking) => {
    if (!window.confirm('¿Eliminar esta reserva?')) return;
    const { error } = await supabase.from('gym_bookings').delete().eq('id', b.id);
    if (error) return showNotification(error.message, 'error');
    setBookings(prev => prev.filter(x => x.id !== b.id));
  };

  const renderList = (list: GymBooking[]) => list.length === 0 ? <p className="text-xs text-white/30 py-2">Sin reservas todavía.</p> : (
    <div className="space-y-2">
      {list.map(b => (
        <div key={b.id} className="flex items-center gap-2.5 rounded-lg border px-3 py-2.5 bg-black/20 border-white/5">
          <div className="min-w-0 flex-1">
            <p className="text-white text-sm font-semibold truncate">{b.customer_name} {b.member_code && <span className="text-[10px] font-mono ml-1" style={{ color: ACCENT }}>{b.member_code}</span>}</p>
            <p className="text-[11px] text-white/40 truncate">{[b.customer_phone, b.customer_email, b.confirmation_code].filter(Boolean).join(' · ')}</p>
          </div>
          <span className={`text-[10px] font-bold uppercase tracking-wider border rounded-full px-2 py-0.5 ${STATUS[b.status]?.cls}`}>{STATUS[b.status]?.label}</span>
          {b.status !== 'asistio' && <button title="Asistió" onClick={() => setStatus(b, 'asistio')} className="w-7 h-7 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 flex items-center justify-center"><FaCheck size={10} /></button>}
          {b.status !== 'no_asistio' && b.status !== 'cancelada' && <button title="No asistió" onClick={() => setStatus(b, 'no_asistio')} className="w-7 h-7 rounded-md bg-white/5 border border-white/10 text-white/50 flex items-center justify-center"><FaTimes size={10} /></button>}
          {b.status === 'reservada' && <button title="Cancelar reserva" onClick={() => setStatus(b, 'cancelada')} className="w-7 h-7 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center"><FaTimes size={10} /></button>}
          {b.customer_phone && <a title="WhatsApp" href={waLink(b.customer_phone, `Hola ${b.customer_name.split(' ')[0]}, te escribimos por tu reserva de ${b.class_name} el ${fmtDate(b.class_date)} a las ${b.start_time}.`)} target="_blank" rel="noopener noreferrer" className="w-7 h-7 rounded-md bg-[#25D366]/10 border border-[#25D366]/20 text-[#25D366] flex items-center justify-center"><FaWhatsapp size={12} /></a>}
          <button title="Eliminar" onClick={() => remove(b)} className="w-7 h-7 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center"><FaTrash size={9} /></button>
        </div>
      ))}
    </div>
  );

  const live = (list: GymBooking[]) => list.filter(b => b.status === 'reservada' || b.status === 'asistio').length;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border p-4 space-y-3" style={{ background: `${ACCENT}0a`, borderColor: `${ACCENT}2b` }}>
        <p className="text-xs font-black uppercase tracking-widest text-white">Reglas de reserva</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex items-center gap-2 text-sm text-white/70"><input type="checkbox" checked={cfg.bookingEnabled !== false} onChange={e => setDraft(d => ({ ...(d || {}), bookingEnabled: e.target.checked }))} /> Permitir reservas desde el perfil</label>
          <label className="flex items-center gap-2 text-sm text-white/70"><input type="checkbox" checked={!!cfg.membersOnly} onChange={e => setDraft(d => ({ ...(d || {}), membersOnly: e.target.checked }))} /> Solo socios con carnet vigente</label>
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
                  <div><p className="text-white font-bold">{c.start_time} · {c.name}</p><p className="text-[11px] text-white/40">{[c.coach_name, c.room].filter(Boolean).join(' · ') || 'Sin entrenador'}</p></div>
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

      <ExportRangePanel<GymBooking>
        accent={ACCENT} noun="reservas" dateLabel="la fecha de la clase" fileBase="reservas-clases" sheetName="Reservas"
        localRows={bookings} getDate={r => r.class_date}
        fetchRange={range => fetchOwnerRange<GymBooking>({ table: 'gym_bookings', ownerColumn: 'gym_profile_id', ownerId: user.id, dateColumn: 'class_date', range, orderBy: [{ column: 'class_date' }, { column: 'start_time' }] })}
        columns={BOOKING_COLUMNS} showNotification={showNotification} />
    </div>
  );
};

export default GymClassesTab;
