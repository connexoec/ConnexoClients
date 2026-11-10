import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FaCheck, FaChevronLeft, FaChevronRight, FaClipboardCheck, FaDownload, FaHeart, FaRegHeart, FaLock, FaWhatsapp, FaExpand,
} from 'react-icons/fa';
import { supabase } from '../../src/lib/supabase';
import { ImageLightbox } from '../ImageLightbox';
import { PaymentOptions } from '../PaymentOptions';
import {
  ModalShell, FieldLabel, PrimaryButton, GhostButton, CodeBox, TrackerSteps, inputCls, useInputStyle, useKit,
  fmtMoney, localISO, addDaysISO, prettyDate, waDigits,
} from '../PublicKit';
import type {
  Profile, PhotoSettings, PhotoPackage, PhotoWork, PhotoTeamMember, PhotoGallery, PhotoLocationKind,
} from '../../types';
import {
  WORK_CATEGORIES, KIND_LABEL, BOOKING_STEPS, BOOKING_LABEL, PAY_LABEL, QUOTE_LABEL, LOCATION_LABEL, photoErr,
  buildSlots, dayState, settingsOf, packageTotal, packageDuration, depositOf, durationText, toMin, toHHMM,
  type BusySlot, type BlockRange,
} from '../../src/lib/photoCommon';
import { priceLine } from './PhotoUi';

export interface PhotoCtx {
  profile: Profile;
  userId?: string | null;
  settings: PhotoSettings;
  isPro: boolean;
  isUltra: boolean;
  isMobilePreview: boolean;
  campaign: string | null;
  team: PhotoTeamMember[];
}

const waLink = (profile: any, text: string) => {
  const d = waDigits(profile?.whatsapp);
  return d ? `https://wa.me/${d}?text=${encodeURIComponent(text)}` : '';
};

/* ═══ Serie del portafolio ═══════════════════════════════════════════════════ */
export const WorkModal: React.FC<{ w: PhotoWork; ctx: PhotoCtx; onQuote: (type: string) => void; onClose: () => void }> = ({ w, ctx, onQuote, onClose }) => {
  const k = useKit();
  const all = useMemo(() => Array.from(new Set([w.cover_url, ...(w.images || [])].filter(Boolean) as string[])), [w]);
  const [viewer, setViewer] = useState<number | null>(null);
  return (
    <ModalShell title={w.title} onClose={onClose} wide>
      <p className="text-[10px] uppercase tracking-[0.3em] font-semibold -mt-1" style={{ color: k.accentLight }}>{w.category}{all.length > 1 ? ` · ${all.length} fotos` : ''}</p>
      {w.description && <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: `${k.text}cc` }}>{w.description}</p>}
      <div className="grid grid-cols-2 gap-2">
        {all.map((src, i) => (
          <button key={src + i} type="button" onClick={() => { if (!ctx.isMobilePreview) setViewer(i); }} aria-label={`Ver foto ${i + 1}`}
            className={`relative overflow-hidden rounded-md group ${i === 0 && all.length > 2 ? 'col-span-2' : ''}`}
            style={{ aspectRatio: i === 0 && all.length > 2 ? '16 / 10' : '4 / 5', background: k.bg }}>
            <img src={src} alt={`${w.title} ${i + 1}`} loading="lazy" className="absolute inset-0 w-full h-full object-cover transition duration-500 group-hover:scale-[1.03]" />
            <span className="absolute bottom-2 right-2 w-7 h-7 rounded-full bg-black/55 backdrop-blur flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition"><FaExpand size={10} /></span>
          </button>
        ))}
      </div>
      <PrimaryButton type="button" onClick={() => onQuote(w.category)}>Quiero una sesión así</PrimaryButton>
      {viewer !== null && <ImageLightbox images={all} startIndex={viewer} accent={k.accent} onClose={() => setViewer(null)} />}
    </ModalShell>
  );
};

/* ═══ Detalle de un paquete ══════════════════════════════════════════════════ */
export const PackageModal: React.FC<{ p: PhotoPackage; ctaLabel: string; onAction: () => void; onClose: () => void }> = ({ p, ctaLabel, onAction, onClose }) => {
  const k = useKit();
  const total = packageTotal(p);
  const dep = depositOf(total, p.deposit_percent);
  return (
    <ModalShell title={p.name} onClose={onClose} wide>
      {p.image_url && <img src={p.image_url} alt={p.name} className="w-full h-48 object-cover rounded-xl" />}
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] font-semibold" style={{ color: k.accentLight }}>{KIND_LABEL[p.kind]}</p>
          <p className="text-[12px] mt-1" style={{ color: `${k.text}99` }}>{[p.mode !== 'consulta' ? durationText(p) : '', p.delivery_note].filter(Boolean).join(' · ')}</p>
        </div>
        <p className="text-white text-[26px] font-semibold leading-none" style={{ fontFamily: k.titleFont }}>{priceLine(p)}</p>
      </div>
      {p.description && <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: `${k.text}cc` }}>{p.description}</p>}
      {p.includes?.length > 0 && (
        <div>
          <FieldLabel>Qué incluye</FieldLabel>
          <ul className="space-y-2">
            {p.includes.map((x, i) => <li key={i} className="flex gap-2.5 text-[13px]" style={{ color: `${k.text}dd` }}><FaCheck size={10} className="mt-1 shrink-0" style={{ color: k.accent }} /><span>{x}</span></li>)}
          </ul>
        </div>
      )}
      {p.mode === 'reserva' && p.deposit_percent > 0 && Number(p.price) > 0 && !p.hourly && (
        <p className="text-[12px] rounded-xl border p-3" style={{ borderColor: `${k.accent}33`, background: `${k.accent}0f`, color: `${k.text}cc` }}>
          Para apartar tu fecha se pide un anticipo de <b className="text-white">{fmtMoney(dep)}</b> ({p.deposit_percent} %).
        </p>
      )}
      <PrimaryButton type="button" onClick={onAction}>{ctaLabel}</PrimaryButton>
    </ModalShell>
  );
};

/* ═══ Reservar una sesión ════════════════════════════════════════════════════ */
const WEEK = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export const BookingModal: React.FC<{
  pkg: PhotoPackage; ctx: PhotoCtx; onTrack: (code: string) => void; onClose: () => void;
}> = ({ pkg, ctx, onTrack, onClose }) => {
  const k = useKit(); const inp = useInputStyle();
  const { userId, profile, settings, isUltra, isMobilePreview } = ctx;
  const cfg = useMemo(() => settingsOf(settings, isUltra), [settings, isUltra]);
  const [today] = useState(() => localISO());
  const lastDay = useMemo(() => addDaysISO(today, cfg.daysAhead), [today, cfg.daysAhead]);

  const [hours, setHours] = useState(pkg.min_hours);
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [loc, setLoc] = useState<PhotoLocationKind>('estudio');
  const [locText, setLocText] = useState('');
  const [people, setPeople] = useState('');
  const [notes, setNotes] = useState('');
  const [photographer, setPhotographer] = useState('');
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [email, setEmail] = useState('');
  const [busyList, setBusyList] = useState<BusySlot[]>([]);
  const [blocks, setBlocks] = useState<BlockRange[]>([]);
  const [loadingAv, setLoadingAv] = useState(true);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<any | null>(null);

  const loadAvailability = useCallback(async () => {
    if (!userId || isMobilePreview) { setLoadingAv(false); return; }
    try {
      const { data } = await supabase.rpc('get_photo_availability', { p_owner: userId, p_from: today, p_to: lastDay });
      setBusyList(Array.isArray(data?.bookings) ? data.bookings.map((b: any) => ({ date: String(b.date).slice(0, 10), start: Number(b.start), end: Number(b.end) })) : []);
      setBlocks(Array.isArray(data?.blocks) ? data.blocks.map((b: any) => ({ from: String(b.from).slice(0, 10), to: String(b.to).slice(0, 10) })) : []);
    } catch { /* sin disponibilidad: el servidor igual valida al enviar */ }
    finally { setLoadingAv(false); }
  }, [userId, isMobilePreview, today, lastDay]);
  useEffect(() => { loadAvailability(); }, [loadAvailability]);

  const duration = packageDuration(pkg, hours);
  const slotsFor = useCallback((iso: string) => buildSlots({
    date: iso, durationMin: duration, fullDay: pkg.full_day, settings, isUltra, busy: busyList, blocks,
  }), [duration, pkg.full_day, settings, isUltra, busyList, blocks]);

  // Estado de cada día del mes mostrado.
  const grid = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const lead = (first.getDay() + 6) % 7;                  // lunes primero
    const count = new Date(y, m, 0).getDate();
    const cells: { iso: string; day: number; ok: boolean; why: 'ok' | 'out' | 'closed' | 'full' }[] = [];
    for (let d = 1; d <= count; d++) {
      const iso = `${month}-${String(d).padStart(2, '0')}`;
      if (iso < today || iso > lastDay) { cells.push({ iso, day: d, ok: false, why: 'out' }); continue; }
      if (dayState(iso, settings, blocks) !== 'open') { cells.push({ iso, day: d, ok: false, why: 'closed' }); continue; }
      const any = slotsFor(iso).some(s => s.available);
      cells.push({ iso, day: d, ok: any, why: any ? 'ok' : 'full' });
    }
    return { lead, cells };
  }, [month, today, lastDay, settings, blocks, slotsFor]);

  const monthLabel = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const s = new Date(y, m - 1, 1).toLocaleDateString('es-EC', { month: 'long', year: 'numeric' }).replace(' de ', ' ');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }, [month]);
  const shiftMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const canPrev = month > today.slice(0, 7);
  const canNext = (() => { const [y, m] = month.split('-').map(Number); const n = new Date(y, m, 1); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-01` <= lastDay; })();

  const slots = date ? slotsFor(date) : [];
  // Si al cambiar las horas la franja elegida ya no cabe, se desmarca.
  useEffect(() => { if (time && !slots.some(s => s.time === time && s.available)) setTime(''); /* eslint-disable-next-line */ }, [duration, date, busyList]);

  const total = packageTotal(pkg, hours);
  const deposit = depositOf(total, pkg.deposit_percent);
  const isStudio = pkg.kind === 'estudio';
  const endTime = time && !pkg.full_day && toMin(time) !== null ? toHHMM((toMin(time) as number) + duration) : '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isMobilePreview) return;
    if (!date) return setError('Elige un día.');
    if (!pkg.full_day && !time) return setError('Elige una hora.');
    if (!name.trim()) return setError(photoErr({ error: 'name_required' }));
    if (!phone.trim() && !email.trim()) return setError(photoErr({ error: 'contact_required' }));
    if (!userId) return setError(photoErr({ error: 'owner_not_found' }));
    setError(null); setBusy(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('book_photo_session', {
        p_owner: userId, p_package_id: pkg.id, p_date: date, p_start: pkg.full_day ? null : time, p_hours: pkg.hourly ? hours : null,
        p_name: name.trim(), p_phone: phone.trim() || null, p_email: email.trim() || null,
        p_location_kind: isStudio ? 'estudio' : loc, p_location_text: locText.trim() || null,
        p_people: Number(people) > 0 ? Number(people) : null, p_notes: notes.trim() || null,
        p_photographer: photographer || null, p_campaign: ctx.campaign,
      });
      if (rpcError) throw rpcError;
      if (!data?.ok) { loadAvailability(); return setError(photoErr(data)); }
      setDone(data);
    } catch (err: any) { setError(photoErr(err)); } finally { setBusy(false); }
  };

  const row = (label: string, value: string, strong?: boolean) => (
    <div className="flex items-center justify-between text-[13px]" style={{ color: strong ? '#fff' : `${k.text}aa`, fontWeight: strong ? 700 : 400 }}><span>{label}</span><span>{value}</span></div>
  );

  if (done) {
    const depositDue = Number(done.deposit_required) || 0;
    const payMsg = `Hola, acabo de reservar "${done.package_name}" el ${prettyDate(done.session_date, { day: 'numeric', month: 'long' })}. Mi código es ${done.confirmation_code}.`;
    const wa = waLink(profile, payMsg);
    return (
      <ModalShell title="¡Solicitud enviada!" onClose={onClose} wide>
        <div className="py-2 text-center">
          <FaClipboardCheck className="mx-auto text-4xl mb-3" style={{ color: k.accentLight }} />
          <p className="text-white font-semibold text-lg" style={{ fontFamily: k.titleFont }}>{done.package_name}</p>
          <p className="text-sm mt-1" style={{ color: `${k.text}99` }}>
            {prettyDate(done.session_date, { weekday: 'long', day: 'numeric', month: 'long' })}{done.full_day ? ' · día completo' : ` · ${done.start_time} a ${done.end_time}`}
          </p>
          <p className="text-sm mt-3" style={{ color: `${k.text}b3` }}>Tu código de reserva:</p>
          <CodeBox code={done.confirmation_code} />
          <div className="rounded-xl p-3.5 border text-left space-y-1.5 mb-3" style={{ background: 'rgba(255,255,255,0.03)', borderColor: `${k.accent}33` }}>
            {row('Total', fmtMoney(done.total), true)}
            {depositDue > 0 && row('Anticipo para apartar la fecha', fmtMoney(depositDue))}
          </div>
          <p className="text-[12px] mb-3" style={{ color: `${k.text}b3` }}>
            Quedó <b className="text-white">pendiente de confirmar</b>: el fotógrafo la revisa y te escribe{depositDue > 0 ? '. La fecha se aparta cuando recibe el anticipo' : ''}. Guarda tu código para ver el estado o cancelar.
          </p>
          {depositDue > 0 && ctx.isUltra && (
            <div className="mb-3">
              <PaymentOptions profile={profile} ownerId={userId} reference={done.confirmation_code} amount={depositDue}
                title="Paga tu anticipo" concept={`el anticipo de tu sesión «${done.package_name}»`}
                customer={{ name: name.trim(), phone: phone.trim(), email: email.trim() }} isMobilePreview={isMobilePreview} />
            </div>
          )}
          {depositDue > 0 && !ctx.isUltra && wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 py-3 rounded-xl text-[12px] font-semibold border mb-3" style={{ borderColor: `${k.accent}55`, color: k.text }}>
              <FaWhatsapp /> Coordinar el anticipo por WhatsApp
            </a>
          )}
          <PrimaryButton type="button" onClick={() => onTrack(done.confirmation_code)}>Ver mi reserva</PrimaryButton>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell title="Reservar sesión" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-5">
        <div className="rounded-xl p-3.5 border flex gap-3" style={{ background: 'rgba(255,255,255,0.03)', borderColor: `${k.accent}33` }}>
          {pkg.image_url && <img src={pkg.image_url} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />}
          <div className="min-w-0">
            <p className="text-white font-semibold truncate" style={{ fontFamily: k.titleFont }}>{pkg.name}</p>
            <p className="text-[12px] mt-0.5" style={{ color: `${k.text}99` }}>{pkg.hourly ? `${hours} h` : durationText(pkg)} · {priceLine(pkg)}</p>
          </div>
        </div>

        {pkg.hourly && (
          <div>
            <FieldLabel>¿Cuántas horas?</FieldLabel>
            <div className="flex items-center gap-4">
              <button type="button" aria-label="Menos horas" onClick={() => setHours(h => Math.max(pkg.min_hours, h - 1))} disabled={hours <= pkg.min_hours}
                className="w-10 h-10 rounded-full border text-lg disabled:opacity-30" style={{ borderColor: `${k.accent}55`, color: k.accentLight }}>−</button>
              <span className="text-white text-2xl font-semibold w-10 text-center" style={{ fontFamily: k.titleFont }}>{hours}</span>
              <button type="button" aria-label="Más horas" onClick={() => setHours(h => Math.min(pkg.max_hours, h + 1))} disabled={hours >= pkg.max_hours}
                className="w-10 h-10 rounded-full border text-lg disabled:opacity-30" style={{ borderColor: `${k.accent}55`, color: k.accentLight }}>+</button>
              <span className="text-[11px]" style={{ color: `${k.text}99` }}>Mínimo {pkg.min_hours} h · máximo {pkg.max_hours} h</span>
            </div>
          </div>
        )}

        {/* Calendario */}
        <div>
          <FieldLabel>Elige el día</FieldLabel>
          <div className="rounded-xl border p-3" style={{ background: 'rgba(255,255,255,0.03)', borderColor: `${k.text}14` }}>
            <div className="flex items-center justify-between mb-2">
              <button type="button" aria-label="Mes anterior" onClick={() => shiftMonth(-1)} disabled={!canPrev} className="w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-25" style={{ color: k.accentLight }}><FaChevronLeft size={12} /></button>
              <p className="text-white text-sm font-semibold">{monthLabel}</p>
              <button type="button" aria-label="Mes siguiente" onClick={() => shiftMonth(1)} disabled={!canNext} className="w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-25" style={{ color: k.accentLight }}><FaChevronRight size={12} /></button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center">
              {WEEK.map((d, i) => <span key={i} className="text-[10px] font-semibold py-1" style={{ color: `${k.text}77` }}>{d}</span>)}
              {Array.from({ length: grid.lead }).map((_, i) => <span key={`l${i}`} />)}
              {grid.cells.map(c => {
                const sel = c.iso === date;
                return (
                  <button key={c.iso} type="button" disabled={!c.ok} onClick={() => { setDate(c.iso); setTime(''); setError(null); }}
                    aria-label={`${c.day}${c.why === 'full' ? ' (sin horas)' : ''}`} aria-pressed={sel}
                    className="aspect-square rounded-lg text-[13px] font-semibold transition disabled:cursor-not-allowed"
                    style={sel ? { background: k.accent, color: k.onAccent }
                      : c.ok ? { background: `${k.accent}14`, color: '#fff', border: `1px solid ${k.accent}33` }
                      : { color: `${k.text}33`, textDecoration: c.why === 'full' ? 'line-through' : undefined }}>
                    {c.day}
                  </button>
                );
              })}
            </div>
            {loadingAv && <p className="text-[10px] text-center mt-2" style={{ color: `${k.text}77` }}>Cargando disponibilidad…</p>}
          </div>
        </div>

        {date && (
          <div>
            <FieldLabel>{pkg.full_day ? 'Duración' : 'Elige la hora'}</FieldLabel>
            {pkg.full_day ? (
              <p className="text-[13px] rounded-xl border p-3" style={{ borderColor: `${k.accent}44`, background: `${k.accent}0f`, color: `${k.text}dd` }}>
                Esta sesión ocupa <b className="text-white">el día completo</b> ({prettyDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}). Acordamos la hora de inicio contigo después.
              </p>
            ) : slots.length === 0 ? (
              <p className="text-[12px]" style={{ color: `${k.text}99` }}>No hay horas disponibles ese día.</p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {slots.map(s => (
                  <button key={s.time} type="button" disabled={!s.available} onClick={() => { setTime(s.time); setError(null); }} aria-pressed={time === s.time}
                    className="py-2.5 rounded-lg text-[13px] font-semibold border transition disabled:opacity-30 disabled:line-through"
                    style={time === s.time ? { background: k.accent, color: k.onAccent, borderColor: k.accent } : { background: 'transparent', color: k.text, borderColor: `${k.text}26` }}>
                    {s.time}
                  </button>
                ))}
              </div>
            )}
            {endTime && <p className="text-[11px] mt-2" style={{ color: `${k.text}99` }}>Termina a las {endTime}.</p>}
          </div>
        )}

        {!isStudio && (
          <div className="space-y-2.5">
            <FieldLabel>¿Dónde?</FieldLabel>
            <div className="flex gap-2 flex-wrap">
              {(Object.keys(LOCATION_LABEL) as PhotoLocationKind[]).map(l => (
                <button key={l} type="button" onClick={() => setLoc(l)} aria-pressed={loc === l}
                  className="px-3.5 py-2 rounded-full text-[11px] font-semibold uppercase tracking-[0.12em] border"
                  style={loc === l ? { background: k.accent, color: k.onAccent, borderColor: k.accent } : { color: `${k.text}cc`, borderColor: `${k.text}26` }}>{LOCATION_LABEL[l]}</button>
              ))}
            </div>
            {loc !== 'estudio' && <input value={locText} onChange={e => setLocText(e.target.value)} placeholder={loc === 'domicilio' ? 'Dirección' : 'Lugar o referencia (parque, playa, hacienda…)'} className={inputCls} style={inp} />}
          </div>
        )}

        <div className="space-y-2.5">
          <FieldLabel>Tus datos</FieldLabel>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre completo" autoComplete="name" className={inputCls} style={inp} />
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Teléfono / WhatsApp" autoComplete="tel" inputMode="tel" className={inputCls} style={inp} />
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Correo (opcional)" autoComplete="email" className={inputCls} style={inp} />
          <div className="grid grid-cols-2 gap-2.5">
            <input value={people} onChange={e => setPeople(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="Personas (opcional)" inputMode="numeric" className={inputCls} style={inp} />
            {ctx.isUltra && ctx.team.length > 0 && (
              <select value={photographer} onChange={e => setPhotographer(e.target.value)} className={inputCls} style={inp} aria-label="Fotógrafo preferido">
                <option value="">Fotógrafo: cualquiera</option>
                {ctx.team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            )}
          </div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Cuéntanos de tu sesión: ideas, estilo, ocasión… (opcional)" className={inputCls} style={inp} />
        </div>

        <div className="rounded-xl p-4 border space-y-1.5" style={{ background: 'rgba(255,255,255,0.03)', borderColor: `${k.accent}33` }}>
          {pkg.hourly && row(`${hours} hora${hours === 1 ? '' : 's'} × ${fmtMoney(Number(pkg.price))}`, fmtMoney(total))}
          {row('Total', Number(pkg.price) > 0 ? fmtMoney(total) : 'A confirmar', true)}
          {deposit > 0 && row(`Anticipo (${pkg.deposit_percent} %)`, fmtMoney(deposit))}
          <p className="text-[10px] pt-1" style={{ color: `${k.text}b3` }}>No se cobra nada ahora. El fotógrafo confirma tu solicitud.</p>
        </div>

        {error && <p className="text-red-400 text-xs" role="alert">{error}</p>}
        <PrimaryButton type="submit" disabled={busy}>{busy ? 'Enviando…' : 'Enviar solicitud de reserva'}</PrimaryButton>
      </form>
    </ModalShell>
  );
};

/* ═══ Pedir una cotización ═══════════════════════════════════════════════════ */
const BUDGETS = ['Menos de $100', '$100 – $300', '$300 – $600', '$600 – $1.000', 'Más de $1.000', 'Aún no lo sé'];

export const QuoteModal: React.FC<{
  ctx: PhotoCtx; initialType?: string; pkg?: PhotoPackage | null; categories: string[]; onTrack: (code: string) => void; onClose: () => void;
}> = ({ ctx, initialType = '', pkg, categories, onTrack, onClose }) => {
  const k = useKit(); const inp = useInputStyle();
  const [type, setType] = useState(initialType || pkg?.name || '');
  const [eventDate, setEventDate] = useState(''); const [place, setPlace] = useState(''); const [people, setPeople] = useState('');
  const [budget, setBudget] = useState(''); const [details, setDetails] = useState('');
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const options = useMemo(() => Array.from(new Set([...categories, ...WORK_CATEGORIES])).filter(c => c !== 'Otros').concat('Otro'), [categories]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (ctx.isMobilePreview) return;
    if (!type.trim()) return setError(photoErr({ error: 'type_required' }));
    if (!name.trim()) return setError(photoErr({ error: 'name_required' }));
    if (!phone.trim() && !email.trim()) return setError(photoErr({ error: 'contact_required' }));
    if (!ctx.userId) return setError(photoErr({ error: 'owner_not_found' }));
    setError(null); setBusy(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('place_photo_quote', {
        p_owner: ctx.userId, p_name: name.trim(), p_phone: phone.trim() || null, p_email: email.trim() || null, p_session_type: type.trim(),
        p_event_date: eventDate || null, p_location: place.trim() || null, p_people: Number(people) > 0 ? Number(people) : null,
        p_budget: budget || null, p_details: details.trim() || null, p_package_id: pkg?.id ?? null, p_campaign: ctx.campaign,
      });
      if (rpcError) throw rpcError;
      if (!data?.ok) return setError(photoErr(data));
      setDone(data.quote_code);
    } catch (err: any) { setError(photoErr(err)); } finally { setBusy(false); }
  };

  if (done) {
    const wa = waLink(ctx.profile, `Hola, envié una solicitud de cotización (código ${done}).`);
    return (
      <ModalShell title="¡Solicitud recibida!" onClose={onClose}>
        <div className="py-2 text-center">
          <FaClipboardCheck className="mx-auto text-4xl mb-3" style={{ color: k.accentLight }} />
          <p className="text-sm" style={{ color: `${k.text}b3` }}>Te responderemos con una propuesta a tu medida. Tu código de seguimiento:</p>
          <CodeBox code={done} />
          <div className="space-y-2.5 mt-2">
            <PrimaryButton type="button" onClick={() => onTrack(done)}>Ver el estado</PrimaryButton>
            {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 py-3 rounded-xl text-[12px] font-semibold border" style={{ borderColor: `${k.accent}55`, color: k.text }}><FaWhatsapp /> Avisar por WhatsApp</a>}
          </div>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell title={pkg ? `Cotizar: ${pkg.name}` : 'Pedir cotización'} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-[12px]" style={{ color: `${k.text}99` }}>Cuéntanos qué necesitas y te enviamos una propuesta. No te compromete a nada.</p>
        <div className="space-y-2.5">
          <FieldLabel>Tu proyecto</FieldLabel>
          <select value={options.includes(type) ? type : (type ? 'Otro' : '')} onChange={e => setType(e.target.value === 'Otro' ? '' : e.target.value)} className={inputCls} style={inp} aria-label="Tipo de sesión o evento">
            <option value="">Tipo de sesión o evento…</option>
            {options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          {(!options.includes(type) || type === 'Otro') && <input value={type === 'Otro' ? '' : type} onChange={e => setType(e.target.value)} placeholder="¿Qué necesitas fotografiar?" className={inputCls} style={inp} />}
          <div className="grid grid-cols-2 gap-2.5">
            <label className="block"><span className="block text-[10px] mb-1" style={{ color: `${k.text}77` }}>Fecha (si ya la tienes)</span>
              <input type="date" value={eventDate} min={localISO()} onChange={e => setEventDate(e.target.value)} className={inputCls} style={inp} /></label>
            <label className="block"><span className="block text-[10px] mb-1" style={{ color: `${k.text}77` }}>Personas aprox.</span>
              <input value={people} onChange={e => setPeople(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" className={inputCls} style={inp} /></label>
          </div>
          <input value={place} onChange={e => setPlace(e.target.value)} placeholder="Lugar o ciudad" className={inputCls} style={inp} />
          <select value={budget} onChange={e => setBudget(e.target.value)} className={inputCls} style={inp} aria-label="Presupuesto">
            <option value="">Presupuesto aproximado (opcional)</option>
            {BUDGETS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <textarea value={details} onChange={e => setDetails(e.target.value)} rows={3} placeholder="Detalles: horas de cobertura, estilo que te gusta, referencias…" className={inputCls} style={inp} />
        </div>
        <div className="space-y-2.5">
          <FieldLabel>Tus datos</FieldLabel>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre completo" autoComplete="name" className={inputCls} style={inp} />
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Teléfono / WhatsApp" autoComplete="tel" inputMode="tel" className={inputCls} style={inp} />
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Correo (opcional)" autoComplete="email" className={inputCls} style={inp} />
        </div>
        {error && <p className="text-red-400 text-xs" role="alert">{error}</p>}
        <PrimaryButton type="submit" disabled={busy}>{busy ? 'Enviando…' : 'Enviar solicitud'}</PrimaryButton>
      </form>
    </ModalShell>
  );
};

/* ═══ Consultar mi reserva o cotización ══════════════════════════════════════ */
const QUOTE_STEPS = ['nueva', 'contactado', 'cotizada', 'aceptada'];

export const TrackerModal: React.FC<{ ctx: PhotoCtx; initialCode?: string; onClose: () => void }> = ({ ctx, initialCode = '', onClose }) => {
  const k = useKit(); const inp = useInputStyle();
  const { userId, profile, isMobilePreview } = ctx;
  const [code, setCode] = useState(initialCode);
  const [res, setRes] = useState<any | null>(null);
  const [kind, setKind] = useState<'booking' | 'quote'>('booking');
  const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const codeRef = useRef(code); codeRef.current = code;

  const check = useCallback(async (silent = false) => {
    const c = codeRef.current.trim();
    if (!userId || !c) return;
    if (!silent) { setError(null); setLoading(true); }
    try {
      const isQuote = /^q-/i.test(c);
      const { data } = await supabase.rpc(isQuote ? 'get_photo_quote_status' : 'get_photo_booking_status', { p_owner: userId, p_code: c });
      if (data?.found) { setKind(isQuote ? 'quote' : 'booking'); setRes(data); } else { setRes(null); if (!silent) setError('No encontramos ese código.'); }
    } catch (err: any) { if (!silent) setError(photoErr(err)); }
    finally { if (!silent) setLoading(false); }
  }, [userId]);
  useEffect(() => { if (initialCode) check(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { if (!res || isMobilePreview) return; const t = setInterval(() => check(true), 8000); return () => clearInterval(t); }, [res, check, isMobilePreview]);

  const cancel = async () => {
    if (!userId || isMobilePreview || !window.confirm('¿Cancelar esta reserva?')) return;
    setCancelling(true); setError(null);
    try {
      const { data } = await supabase.rpc('cancel_photo_booking', { p_owner: userId, p_code: code.trim() });
      if (!data?.ok) setError(photoErr(data));
      await check(true);
    } finally { setCancelling(false); }
  };

  const closed = res?.status === 'cancelada' || res?.status === 'no_show' || res?.status === 'descartada';
  return (
    <ModalShell title="Consultar mi reserva o cotización" onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); check(); }} className="flex gap-2">
        <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Tu código (ej. K7P2QX o Q-4ZP9M)" className={inputCls} style={inp} />
        <button type="submit" disabled={loading || !code.trim()} className="shrink-0 px-5 rounded-xl text-sm font-bold uppercase disabled:opacity-40" style={{ background: k.accent, color: k.onAccent }}>{loading ? '…' : 'Ver'}</button>
      </form>
      {error && <p className="text-red-400 text-xs" role="alert">{error}</p>}

      {res && kind === 'booking' && (
        <div className="space-y-4 pt-1">
          <div className="rounded-2xl p-4 border" style={{ background: `linear-gradient(160deg, ${k.accent}18, rgba(255,255,255,0.02))`, borderColor: `${k.accent}44` }}>
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: k.accentLight }}>{res.customer_name}</p>
              <span className="font-mono text-xs" style={{ color: `${k.text}b3` }}>{res.code}</span>
            </div>
            <p className="text-white font-semibold text-lg mt-1" style={{ fontFamily: k.titleFont }}>{res.package_name}</p>
            <p className="text-sm mt-1" style={{ color: `${k.text}cc` }}>
              {prettyDate(res.session_date, { weekday: 'long', day: 'numeric', month: 'long' })}{res.full_day ? ' · día completo' : ` · ${res.start_time} a ${res.end_time}`}
            </p>
            <p className="text-xs mt-0.5" style={{ color: `${k.text}b3` }}>
              {LOCATION_LABEL[res.location_kind as PhotoLocationKind] || ''}{res.location_text ? `: ${res.location_text}` : ''}{res.photographer_name ? ` · con ${res.photographer_name}` : ''}
            </p>
          </div>
          {closed
            ? <div className="rounded-xl p-4 text-center border" style={{ background: 'rgba(248,113,113,0.1)', borderColor: 'rgba(248,113,113,0.3)', color: '#f87171' }}>{BOOKING_LABEL[res.status as keyof typeof BOOKING_LABEL]}</div>
            : <TrackerSteps steps={BOOKING_STEPS} labels={BOOKING_LABEL} current={res.status} />}
          <div className="rounded-xl p-3.5 border space-y-1.5" style={{ background: 'rgba(255,255,255,0.03)', borderColor: `${k.text}12` }}>
            <div className="flex justify-between text-sm font-bold text-white"><span>Total</span><span>{Number(res.total) > 0 ? fmtMoney(res.total) : 'A confirmar'}</span></div>
            <div className="flex justify-between text-[11px]" style={{ color: `${k.text}b3` }}>
              <span>{PAY_LABEL[res.payment_status as keyof typeof PAY_LABEL] || res.payment_status}</span>
              {res.deposit_required > 0 && res.payment_status === 'pendiente' && <span>Anticipo: {fmtMoney(res.deposit_required)}</span>}
            </div>
          </div>
          {ctx.isUltra && res.payment_status === 'pendiente' && res.deposit_required > 0 && (res.status === 'pendiente' || res.status === 'confirmada') && (
            <PaymentOptions profile={profile} ownerId={userId} reference={res.code} amount={Number(res.deposit_required)}
              title="Paga tu anticipo" concept={`el anticipo de tu sesión «${res.package_name}»`} customer={{ name: res.customer_name }} isMobilePreview={isMobilePreview} />
          )}
          {res.admin_note && (
            <div className="rounded-xl p-3 border text-sm" style={{ background: `${k.accent}0f`, borderColor: `${k.accent}33`, color: `${k.text}dd` }}>
              <span className="font-bold" style={{ color: k.accentLight }}>Mensaje del fotógrafo:</span>
              <p className="mt-1 whitespace-pre-wrap">{res.admin_note}</p>
            </div>
          )}
          {(res.status === 'pendiente' || res.status === 'confirmada') && (
            <GhostButton type="button" onClick={cancel} disabled={cancelling}>{cancelling ? 'Cancelando…' : 'Cancelar mi reserva'}</GhostButton>
          )}
        </div>
      )}

      {res && kind === 'quote' && (
        <div className="space-y-4 pt-1">
          <div className="rounded-2xl p-4 border" style={{ background: `linear-gradient(160deg, ${k.accent}18, rgba(255,255,255,0.02))`, borderColor: `${k.accent}44` }}>
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: k.accentLight }}>{res.customer_name}</p>
              <span className="font-mono text-xs" style={{ color: `${k.text}b3` }}>{res.code}</span>
            </div>
            <p className="text-white font-semibold text-lg mt-1" style={{ fontFamily: k.titleFont }}>{res.session_type}</p>
            {res.event_date && <p className="text-sm mt-1" style={{ color: `${k.text}cc` }}>{prettyDate(res.event_date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>}
          </div>
          {closed
            ? <div className="rounded-xl p-4 text-center border" style={{ background: 'rgba(248,113,113,0.1)', borderColor: 'rgba(248,113,113,0.3)', color: '#f87171' }}>{QUOTE_LABEL[res.status as keyof typeof QUOTE_LABEL]}</div>
            : <TrackerSteps steps={QUOTE_STEPS} labels={QUOTE_LABEL} current={res.status} />}
          {res.quoted_total != null && (
            <div className="rounded-xl p-3.5 border flex justify-between text-sm font-bold text-white" style={{ background: 'rgba(255,255,255,0.03)', borderColor: `${k.accent}33` }}>
              <span>Cotización</span><span>{fmtMoney(Number(res.quoted_total))}</span>
            </div>
          )}
          {res.admin_note && (
            <div className="rounded-xl p-3 border text-sm" style={{ background: `${k.accent}0f`, borderColor: `${k.accent}33`, color: `${k.text}dd` }}>
              <span className="font-bold" style={{ color: k.accentLight }}>Mensaje del fotógrafo:</span>
              <p className="mt-1 whitespace-pre-wrap">{res.admin_note}</p>
            </div>
          )}
        </div>
      )}
    </ModalShell>
  );
};

/* ═══ Mi galería (entrega privada) ═══════════════════════════════════════════ */
type OpenGallery = Pick<PhotoGallery, 'title' | 'client_name' | 'note' | 'photos' | 'allow_download' | 'download_url' | 'favorites' | 'favorites_limit' | 'favorites_note' | 'favorites_sent_at' | 'expires_at'>;

export const GalleryModal: React.FC<{ ctx: PhotoCtx; initialCode?: string; onClose: () => void }> = ({ ctx, initialCode = '', onClose }) => {
  const k = useKit(); const inp = useInputStyle();
  const { userId, isMobilePreview } = ctx;
  const [code, setCode] = useState(initialCode); const [pin, setPin] = useState('');
  const [g, setG] = useState<OpenGallery | null>(null);
  const [favs, setFavs] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false); const [viewer, setViewer] = useState<number | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const open = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isMobilePreview || !userId) return;
    setBusy(true); setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('get_photo_gallery', { p_owner: userId, p_code: code.trim(), p_pin: pin.trim() });
      if (rpcError) throw rpcError;
      if (!data?.ok) return setError(photoErr(data));
      setG(data as OpenGallery);
      setFavs(Array.isArray(data.favorites) ? data.favorites : []);
      setNote(data.favorites_note || '');
      setSent(!!data.favorites_sent_at);
    } catch (err: any) { setError(photoErr(err)); } finally { setBusy(false); }
  };

  const persist = useCallback(async (list: string[], send: boolean, text: string) => {
    if (!userId) return false;
    const { data } = await supabase.rpc('set_photo_favorites', { p_owner: userId, p_code: code.trim(), p_pin: pin.trim(), p_favorites: list, p_note: text || null, p_send: send });
    if (!data?.ok) { setError(photoErr(data)); return false; }
    return true;
  }, [userId, code, pin]);

  const toggle = (id: string) => {
    if (!g) return;
    setError(null);
    setFavs(cur => {
      const has = cur.includes(id);
      if (!has && g.favorites_limit && cur.length >= g.favorites_limit) { setError(`Puedes elegir hasta ${g.favorites_limit} fotos.`); return cur; }
      const next = has ? cur.filter(x => x !== id) : [...cur, id];
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => { persist(next, false, note); }, 700);   // se guarda sola para no perder la selección
      return next;
    });
  };
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const send = async () => {
    setBusy(true); setError(null);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const ok = await persist(favs, true, note);
    setBusy(false);
    if (ok) setSent(true);
  };

  if (!g) {
    return (
      <ModalShell title="Mi galería" onClose={onClose}>
        <form onSubmit={open} className="space-y-3">
          <p className="text-[12px] flex gap-2" style={{ color: `${k.text}b3` }}><FaLock className="mt-0.5 shrink-0" style={{ color: k.accentLight }} /> Tus fotos son privadas. Ingresa el código y la clave que te dio tu fotógrafo.</p>
          <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Código de la galería" autoComplete="off" className={inputCls} style={inp} />
          <input value={pin} onChange={e => setPin(e.target.value)} placeholder="Clave" type="password" autoComplete="off" className={inputCls} style={inp} />
          {error && <p className="text-red-400 text-xs" role="alert">{error}</p>}
          <PrimaryButton type="submit" disabled={busy || !code.trim() || !pin.trim()}>{busy ? 'Abriendo…' : 'Abrir mi galería'}</PrimaryButton>
        </form>
      </ModalShell>
    );
  }

  const photos = g.photos || [];
  const urls = photos.map(p => p.url);
  return (
    <ModalShell title={g.title} onClose={onClose} wide>
      <p className="text-[10px] uppercase tracking-[0.3em] font-semibold -mt-1" style={{ color: k.accentLight }}>
        {g.client_name} · {photos.length} foto{photos.length === 1 ? '' : 's'}{g.expires_at ? ` · disponible hasta el ${prettyDate(g.expires_at, { day: 'numeric', month: 'long' })}` : ''}
      </p>
      {g.note && <p className="text-[13px] leading-relaxed whitespace-pre-wrap rounded-xl border p-3" style={{ borderColor: `${k.accent}33`, background: `${k.accent}0f`, color: `${k.text}dd` }}>{g.note}</p>}

      <div className="flex items-center justify-between gap-3 text-[12px]" style={{ color: `${k.text}cc` }}>
        <span><FaHeart className="inline mr-1.5" style={{ color: k.accent }} /> <b className="text-white">{favs.length}</b>{g.favorites_limit ? ` de ${g.favorites_limit}` : ''} elegidas</span>
        {g.download_url && g.allow_download && (
          <a href={g.download_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 font-semibold" style={{ color: k.accentLight }}><FaDownload size={11} /> Descargar todas</a>
        )}
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {photos.map((p, i) => {
          const on = favs.includes(p.id);
          return (
            <div key={p.id} className="relative aspect-square overflow-hidden rounded-sm" style={{ background: k.bg, outline: on ? `2px solid ${k.accent}` : 'none', outlineOffset: -2 }}>
              <button type="button" onClick={() => setViewer(i)} aria-label={`Ver foto ${i + 1}`} className="absolute inset-0">
                <img src={p.url} alt={`Foto ${i + 1}`} loading="lazy" className="w-full h-full object-cover" />
              </button>
              <button type="button" onClick={() => toggle(p.id)} aria-pressed={on} aria-label={on ? `Quitar la foto ${i + 1} de mis favoritas` : `Marcar la foto ${i + 1} como favorita`}
                className="absolute top-1.5 right-1.5 w-8 h-8 rounded-full flex items-center justify-center bg-black/55 backdrop-blur text-white">
                {on ? <FaHeart size={13} style={{ color: k.accent }} /> : <FaRegHeart size={13} />}
              </button>
            </div>
          );
        })}
      </div>

      <div className="space-y-2.5 pt-1">
        <FieldLabel>Tu selección</FieldLabel>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Mensaje para tu fotógrafo (opcional): retoques, orden del álbum…" className={inputCls} style={inp} />
        {error && <p className="text-red-400 text-xs" role="alert">{error}</p>}
        {sent && <p className="text-[12px] flex items-center gap-1.5" style={{ color: '#4ade80' }}><FaCheck size={11} /> Tu selección ya está con tu fotógrafo. Puedes cambiarla y volver a enviarla.</p>}
        <PrimaryButton type="button" onClick={send} disabled={busy || favs.length === 0}>{busy ? 'Enviando…' : sent ? 'Enviar de nuevo mi selección' : 'Enviar mi selección al fotógrafo'}</PrimaryButton>
        {!g.allow_download && <p className="text-[10px] text-center" style={{ color: `${k.text}88` }}>Las descargas las gestiona tu fotógrafo.</p>}
      </div>
      {viewer !== null && <ImageLightbox images={urls} startIndex={viewer} accent={k.accent} onClose={() => setViewer(null)} />}
    </ModalShell>
  );
};
