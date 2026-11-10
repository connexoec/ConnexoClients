import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../src/lib/supabase';
import type { Profile, StageClass, StageSettings } from '../types';
import { FaCalendarCheck, FaCheckCircle, FaClock, FaSearch, FaWhatsapp, FaChalkboardTeacher } from 'react-icons/fa';

/**
 * CLASES / ACADEMIA de la plantilla Artista: horario semanal con cupos, como el del gimnasio.
 *
 * Es un módulo AISLADO: lee solo `stage_classes` y llama solo a las RPC `*_stage_*` (setup_stage_classes.sql).
 * Si el perfil no tiene clases activas, o la tabla aún no existe, NO dibuja nada: los perfiles Artista que ya
 * existen se ven exactamente igual que antes.
 *   · Horario semanal (PRO+)          · Reservar un cupo con aforo y código de reserva (ULTRA)
 *   · Consultar / cancelar con el código                                    · Consulta por WhatsApp
 */

const LEVEL: Record<string, { label: string; color: string }> = {
  todos: { label: 'Todos los niveles', color: '' },
  principiante: { label: 'Principiante', color: '#34d399' },
  intermedio: { label: 'Intermedio', color: '#fbbf24' },
  avanzado: { label: 'Avanzado', color: '#f87171' },
};

const ERRORS: Record<string, string> = {
  booking_unavailable: 'Las reservas de clases no están disponibles por ahora.',
  name_required: 'Escribe tu nombre.',
  contact_required: 'Déjanos tu teléfono o tu correo.',
  class_unavailable: 'Esa clase ya no está disponible.',
  date_out_of_range: 'Esa fecha no está disponible para reservar.',
  wrong_day: 'Esa clase no se da ese día.',
  class_started: 'Esa clase ya empezó. Elige otra fecha.',
  already_booked: 'Ya tienes un cupo reservado en esa clase.',
  class_full: 'Esa clase está llena. Prueba con otra fecha u otro horario.',
  not_found: 'No encontramos ese código.',
  not_cancellable: 'Esta reserva ya no se puede cancelar.',
  too_late: 'Ya es muy tarde para cancelar por aquí. Escríbenos por WhatsApp.',
};
const STATUS_LABEL: Record<string, string> = { reservada: 'Reservada', asistio: 'Asististe', no_asistio: 'No asististe', cancelada: 'Cancelada' };
const errMsg = (e: any) => ERRORS[e?.error] || e?.message || 'No se pudo completar. Inténtalo de nuevo.';

const localISO = (d: Date = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDaysISO = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  t.setUTCDate(t.getUTCDate() + n);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
};
const dowOf = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1).getDay(); };
const prettyDate = (iso: string, opts: Intl.DateTimeFormatOptions) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('es-EC', opts);
};
const nowHHMM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

interface Props {
  profile: Profile;
  userId?: string | null;
  accent: string;
  isMobilePreview?: boolean;
}

export const StageClassesSection: React.FC<Props> = ({ profile, userId, accent, isMobilePreview }) => {
  const plan = String(profile?.plan ?? 'free').toLowerCase();
  const isUltra = plan === 'ultra';
  const isPro = plan === 'pro' || isUltra;
  const settings: StageSettings = (profile?.stage_settings as StageSettings) || {};
  const bookingOn = isUltra && settings.bookingEnabled !== false;
  const daysAhead = Math.min(Math.max(Number(settings.bookingDaysAhead) || 14, 1), 60);

  const [classes, setClasses] = useState<StageClass[]>([]);
  const [booked, setBooked] = useState<Record<string, number>>({});
  const [booking, setBooking] = useState<{ cls: StageClass; date: string } | null>(null);
  const [trackerOpen, setTrackerOpen] = useState(false);
  const [today] = useState(() => localISO());
  const [dayIdx, setDayIdx] = useState(0);

  // Horario público. Si la tabla aún no existe (SQL sin ejecutar) o falla, la sección simplemente no aparece.
  useEffect(() => {
    if (!userId || !isPro) return;
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase.from('stage_classes').select('*')
          .eq('stage_profile_id', userId).eq('is_active', true).order('start_time');
        if (!alive || error) return;
        setClasses((data ?? []) as StageClass[]);
      } catch { /* sin clases: no se dibuja nada */ }
    })();
    return () => { alive = false; };
  }, [userId, isPro]);

  const refreshBooked = useCallback(async () => {
    if (!userId || !bookingOn || classes.length === 0) return;
    try {
      const { data } = await supabase.rpc('get_stage_class_availability', { p_stage_id: userId, p_from: today, p_to: addDaysISO(today, daysAhead) });
      setBooked((data?.booked as Record<string, number>) || {});
    } catch { /* sin disponibilidad: se muestran las clases sin contador */ }
  }, [userId, bookingOn, classes.length, today, daysAhead]);
  useEffect(() => { refreshBooked(); }, [refreshBooked]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysISO(today, i)), [today]);
  const dayClasses = useMemo(
    () => classes.filter(c => c.day_of_week === dowOf(days[dayIdx])).sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [classes, days, dayIdx],
  );
  const dayCount = (iso: string) => classes.filter(c => c.day_of_week === dowOf(iso)).length;

  // Abre en el primer día que tenga clases.
  useEffect(() => {
    if (classes.length === 0) return;
    const first = days.findIndex(d => dayCount(d) > 0);
    if (first > 0) setDayIdx(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes.length]);

  if (!isPro || classes.length === 0) return null;

  const wa = (profile?.whatsapp || '').replace(/\D/g, '');

  return (
    <section>
      <div className="flex items-center gap-3 mb-5">
        <span className="h-px flex-1" style={{ background: `linear-gradient(90deg, transparent, ${accent}66)` }} />
        <h2 className="text-xs font-black uppercase tracking-[0.3em] whitespace-nowrap" style={{ color: accent, fontFamily: "'Space Grotesk', sans-serif" }}>Clases</h2>
        <span className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${accent}66, transparent)` }} />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 mb-4 -mx-1 px-1">
        {days.map((d, i) => {
          const active = i === dayIdx; const n = dayCount(d);
          return (
            <button key={d} type="button" onClick={() => setDayIdx(i)} disabled={n === 0}
              className="shrink-0 w-[58px] py-2.5 rounded-xl border text-center transition disabled:opacity-30"
              style={active ? { background: accent, color: '#06060c', borderColor: accent } : { background: 'rgba(255,255,255,0.04)', color: '#fff', borderColor: `${accent}22` }}>
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] opacity-70">{i === 0 ? 'Hoy' : prettyDate(d, { weekday: 'short' })}</p>
              <p className="text-lg font-black leading-none mt-1">{Number(d.slice(8))}</p>
            </button>
          );
        })}
      </div>

      <div className="space-y-2.5">
        {dayClasses.length === 0 && <p className="text-center text-sm py-6 text-white/45">No hay clases este día.</p>}
        {dayClasses.map(c => {
          const date = days[dayIdx];
          const taken = booked[`${c.id}|${date}`] || 0;
          const left = c.capacity == null ? null : Math.max(c.capacity - taken, 0);
          const started = date === today && c.start_time <= nowHHMM();
          const full = left === 0;
          const lv = LEVEL[c.level] || LEVEL.todos;
          const lvColor = lv.color || accent;
          return (
            <div key={c.id} className={`flex items-stretch rounded-2xl border overflow-hidden ${started ? 'opacity-70' : ''}`}
              style={{ background: 'rgba(255,255,255,0.04)', borderColor: `${accent}22` }}>
              <span className="w-1 shrink-0" style={{ background: lvColor }} />
              <div className="w-[68px] shrink-0 py-3 text-center">
                <p className="text-[16px] font-black leading-none text-white">{c.start_time}</p>
                {c.end_time && <p className="text-[10px] mt-1 text-white/45">{c.end_time}</p>}
              </div>
              <div className="flex-1 min-w-0 py-3">
                <p className="text-white font-bold text-[14px] truncate">{c.name}</p>
                <p className="text-[11px] truncate mt-0.5 text-white/45">{[c.discipline, c.teacher_name, c.room].filter(Boolean).join(' · ') || ' '}</p>
                <span className="inline-block mt-1.5 text-[9px] font-bold uppercase tracking-[0.14em] px-2 py-0.5 rounded-full" style={{ color: lvColor, border: `1px solid ${lvColor}55` }}>{lv.label}</span>
              </div>
              <div className="pr-3 pl-2 flex flex-col items-end justify-center gap-1.5 shrink-0">
                {bookingOn ? (
                  <>
                    <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: full ? '#f87171' : left != null && left <= 3 ? '#fbbf24' : accent }}>
                      {started ? 'Ya empezó' : left == null ? 'Cupo libre' : full ? 'Llena' : `${left} cupo${left === 1 ? '' : 's'}`}
                    </p>
                    {!started && !full && (
                      <button type="button" onClick={() => setBooking({ cls: c, date })}
                        className="px-3.5 py-2 rounded-lg text-[10px] font-black uppercase tracking-[0.14em] transition hover:brightness-110"
                        style={{ background: accent, color: '#06060c' }}>Reservar</button>
                    )}
                  </>
                ) : (
                  <FaChalkboardTeacher size={13} style={{ color: `${lvColor}aa` }} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
        {bookingOn && (
          <button type="button" onClick={() => setTrackerOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wider border text-white/70 hover:text-white transition"
            style={{ background: 'rgba(255,255,255,0.04)', borderColor: `${accent}33` }}>
            <FaSearch size={11} /> Consultar o cancelar mi reserva
          </button>
        )}
        {wa && (
          <a href={`https://wa.me/${wa}?text=${encodeURIComponent('Hola, quiero información sobre las clases.')}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wider border transition hover:bg-[#25D366]/10"
            style={{ background: 'rgba(255,255,255,0.04)', borderColor: '#25D36644', color: '#25D366' }}>
            <FaWhatsapp size={13} /> Consultar por WhatsApp
          </a>
        )}
      </div>

      {booking && (
        <BookingModal cls={booking.cls} initialDate={booking.date} today={today} daysAhead={daysAhead} booked={booked}
          accent={accent} userId={userId} isMobilePreview={isMobilePreview}
          onDone={refreshBooked} onClose={() => setBooking(null)} onTrack={() => { setBooking(null); setTrackerOpen(true); }} />
      )}
      {trackerOpen && <TrackerModal accent={accent} userId={userId} isMobilePreview={isMobilePreview} onChanged={refreshBooked} onClose={() => setTrackerOpen(false)} />}
    </section>
  );
};

/* ── Ventana base ─────────────────────────────────────────────────────────── */
const Shell: React.FC<{ title: string; accent: string; onClose: () => void; children: React.ReactNode }> = ({ title, accent, onClose, children }) => (
  <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 bg-black/75 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true">
    <div className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-3xl border p-5" onClick={e => e.stopPropagation()}
      style={{ background: '#0b0b14', borderColor: `${accent}44`, color: '#fff' }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-black" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{title}</h3>
        <button type="button" onClick={onClose} aria-label="Cerrar" className="w-8 h-8 rounded-full bg-white/5 text-white/60 hover:text-white">✕</button>
      </div>
      {children}
    </div>
  </div>
);

const inputCls = 'w-full bg-black/40 border text-white text-sm rounded-xl px-4 py-3 focus:outline-none placeholder-white/30';

/* ── Reservar un cupo ─────────────────────────────────────────────────────── */
const BookingModal: React.FC<{
  cls: StageClass; initialDate: string; today: string; daysAhead: number; booked: Record<string, number>; accent: string;
  userId?: string | null; isMobilePreview?: boolean; onDone: () => void; onClose: () => void; onTrack: () => void;
}> = ({ cls, initialDate, today, daysAhead, booked, accent, userId, isMobilePreview, onDone, onClose, onTrack }) => {
  const options = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i <= daysAhead; i++) {
      const d = addDaysISO(today, i);
      if (dowOf(d) === cls.day_of_week && !(i === 0 && cls.start_time <= nowHHMM())) out.push(d);
    }
    return out.length ? out : [initialDate];
  }, [cls, daysAhead, today, initialDate]);
  const [date, setDate] = useState(options.includes(initialDate) ? initialDate : options[0]);
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [code, setCode] = useState<string | null>(null);
  const bd = { borderColor: `${accent}33` };

  const left = (d: string) => cls.capacity == null ? null : Math.max(cls.capacity - (booked[`${cls.id}|${d}`] || 0), 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isMobilePreview) return;
    if (!name.trim()) return setError(ERRORS.name_required);
    if (!phone.trim() && !email.trim()) return setError(ERRORS.contact_required);
    if (!userId) return setError('No se pudo identificar el perfil.');
    setError(null); setBusy(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('book_stage_class', {
        p_stage_id: userId, p_class_id: cls.id, p_date: date, p_name: name.trim(), p_phone: phone.trim() || null, p_email: email.trim() || null, p_notes: null,
      });
      if (rpcError) throw rpcError;
      onDone();
      if (!data?.ok) return setError(errMsg(data));
      setCode(data.confirmation_code);
    } catch (err: any) { setError(errMsg(err)); } finally { setBusy(false); }
  };

  return (
    <Shell title={code ? '¡Cupo reservado!' : 'Reservar cupo'} accent={accent} onClose={onClose}>
      {code ? (
        <div className="py-3 text-center">
          <FaCalendarCheck className="mx-auto text-4xl mb-3" style={{ color: accent }} />
          <p className="font-bold">{cls.name}</p>
          <p className="text-sm mt-1 text-white/60">{prettyDate(date, { weekday: 'long', day: 'numeric', month: 'long' })} · {cls.start_time}</p>
          <p className="text-sm mt-3 text-white/60">Tu código de reserva:</p>
          <p className="text-3xl font-black tracking-[0.3em] my-2" style={{ color: accent }}>{code}</p>
          <p className="text-[11px] mb-4 text-white/45">Con este código puedes consultar o cancelar tu cupo.</p>
          <button type="button" onClick={onTrack} className="w-full py-3 rounded-xl text-sm font-black uppercase tracking-wider" style={{ background: accent, color: '#06060c' }}>Ver mi reserva</button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <div className="rounded-xl p-3.5 border" style={{ background: 'rgba(255,255,255,0.03)', borderColor: `${accent}33` }}>
            <p className="font-bold">{cls.name}</p>
            <p className="text-[12px] mt-0.5 text-white/55">{[cls.start_time + (cls.end_time ? ` – ${cls.end_time}` : ''), cls.teacher_name, cls.room].filter(Boolean).join(' · ')}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest mb-1.5 text-white/55">Fecha</p>
            <div className="grid grid-cols-2 gap-2">
              {options.map(d => {
                const l = left(d); const full = l === 0;
                return (
                  <button key={d} type="button" disabled={full} onClick={() => setDate(d)}
                    className="rounded-xl px-3 py-2.5 text-left border transition disabled:opacity-40"
                    style={date === d ? { background: accent, color: '#06060c', borderColor: accent } : { background: 'rgba(255,255,255,0.04)', color: '#fff', ...bd }}>
                    <p className="text-sm font-bold capitalize">{prettyDate(d, { weekday: 'short', day: 'numeric', month: 'short' })}</p>
                    <p className="text-[10px] uppercase tracking-wider opacity-70">{full ? 'Llena' : l == null ? 'Cupo libre' : `${l} cupos`}</p>
                  </button>
                );
              })}
            </div>
          </div>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre completo" className={inputCls} style={bd} />
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Teléfono / WhatsApp" className={inputCls} style={bd} />
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email (opcional)" className={inputCls} style={bd} />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button type="submit" disabled={busy} className="w-full py-3.5 rounded-xl text-sm font-black uppercase tracking-wider disabled:opacity-50" style={{ background: accent, color: '#06060c' }}>
            {busy ? 'Reservando…' : 'Confirmar reserva'}
          </button>
        </form>
      )}
    </Shell>
  );
};

/* ── Consultar o cancelar con el código ───────────────────────────────────── */
const TrackerModal: React.FC<{ accent: string; userId?: string | null; isMobilePreview?: boolean; onChanged: () => void; onClose: () => void }> = ({ accent, userId, isMobilePreview, onChanged, onClose }) => {
  const [code, setCode] = useState('');
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  const bd = { borderColor: `${accent}33` };

  const lookup = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!userId || !code.trim()) return;
    setBusy(true); setMsg(null);
    try {
      const { data } = await supabase.rpc('get_stage_booking_status', { p_stage_id: userId, p_code: code.trim() });
      setRes(data); if (!data?.found) setMsg(ERRORS.not_found);
    } catch (err: any) { setMsg(errMsg(err)); } finally { setBusy(false); }
  };
  const cancel = async () => {
    if (!userId || isMobilePreview || !window.confirm('¿Cancelar esta reserva?')) return;
    setBusy(true); setMsg(null);
    try {
      const { data } = await supabase.rpc('cancel_stage_booking', { p_stage_id: userId, p_code: code.trim() });
      if (!data?.ok) setMsg(errMsg(data)); else { onChanged(); await lookup(); }
    } catch (err: any) { setMsg(errMsg(err)); } finally { setBusy(false); }
  };

  return (
    <Shell title="Mi reserva" accent={accent} onClose={onClose}>
      <form onSubmit={lookup} className="flex gap-2">
        <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Tu código de reserva" className={inputCls + ' flex-1 min-w-0 uppercase tracking-widest'} style={bd} />
        <button type="submit" disabled={busy || !code.trim()} className="px-4 rounded-xl text-xs font-black uppercase text-black disabled:opacity-40 shrink-0" style={{ background: accent }}>Ver</button>
      </form>
      {msg && <p className="text-red-400 text-xs mt-3">{msg}</p>}
      {res?.found && (
        <div className="mt-4 rounded-2xl p-4 border" style={{ background: 'rgba(255,255,255,0.03)', borderColor: `${accent}33` }}>
          <p className="font-bold flex items-center gap-2"><FaCheckCircle style={{ color: accent }} /> {res.class_name}</p>
          <p className="text-sm text-white/60 mt-1 flex items-center gap-1.5"><FaClock size={11} /> {prettyDate(res.class_date, { weekday: 'long', day: 'numeric', month: 'long' })} · {res.start_time}</p>
          {res.teacher_name && <p className="text-[12px] text-white/45 mt-0.5">{res.teacher_name}</p>}
          <p className="text-[11px] font-bold uppercase tracking-widest mt-3" style={{ color: res.status === 'cancelada' ? '#f87171' : accent }}>{STATUS_LABEL[res.status] || res.status}</p>
          {res.status === 'reservada' && (
            <button type="button" onClick={cancel} disabled={busy} className="mt-3 w-full py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider border text-white/70 hover:text-white disabled:opacity-50" style={bd}>
              {busy ? 'Cancelando…' : 'Cancelar mi reserva'}
            </button>
          )}
        </div>
      )}
    </Shell>
  );
};

export default StageClassesSection;
