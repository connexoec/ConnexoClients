import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { profileStyleLayer } from '../src/lib/profileStyleLayer';
import { supabase } from '../src/lib/supabase';
import { ProfileExtraSections } from './ProfileExtraSections';
import type { Profile, UserLink, GymPlan, GymClass, GymCoach, GymRequestType, GymSettings } from '../types';
import {
  KitProvider, useKit, useInputStyle, inputCls, isOn, fmtMoney, localISO, addDaysISO, prettyDate, shade, readableOn,
  SectionHeading, PillLink, FeatureCard, ModalShell, FieldLabel, PrimaryButton, GhostButton, CodeBox, TrackerSteps,
  PassCard, HoursSection, ReviewsSection, ProfileHero, type KitTheme,
} from './PublicKit';
import {
  FaDumbbell, FaFire, FaCalendarCheck, FaCheck, FaSearch, FaLink, FaWhatsapp, FaClipboardCheck,
  FaMedal, FaCrown, FaGift, FaRunning, FaStopwatch, FaBolt,
} from 'react-icons/fa';

// ── Identidad: "Volt" — grafito casi negro con verde eléctrico (energía/fitness) ──
const ACCENT_BASE = '#c6f432';
const BG_DARK = '#0a0c09';
const SURFACE = '#131610';
const TEXT = '#f1f5e9';
const ON_ACCENT = '#0a0c09';
const TITLE_FONT = "'Tomorrow', sans-serif";
const BODY_FONT = "'Space Grotesk', sans-serif";

const PERIOD: Record<string, string> = { dia: 'día', semana: 'semana', mes: 'mes', trimestre: 'trimestre', semestre: 'semestre', anio: 'año' };
const LEVEL: Record<string, { label: string; color: string }> = {
  todos: { label: 'Todos los niveles', color: '' },
  principiante: { label: 'Principiante', color: '#34d399' },
  intermedio: { label: 'Intermedio', color: '#fbbf24' },
  avanzado: { label: 'Avanzado', color: '#f87171' },
};
const GOALS = ['Bajar de peso', 'Ganar músculo', 'Tonificar', 'Salud y bienestar', 'Rendimiento deportivo'];
const LEAD_STEPS = ['recibido', 'contactado', 'agendado', 'inscrito'];
const LEAD_LABEL: Record<string, string> = { recibido: 'Recibido', contactado: 'Contactado', agendado: 'Clase agendada', inscrito: 'Inscrito', cancelado: 'Cancelado' };
const LEAD_TYPE: Record<string, string> = { prueba: 'Clase de prueba', inscripcion: 'Inscripción', consulta: 'Consulta' };
const BOOKING_LABEL: Record<string, string> = { reservada: 'Reservada', asistio: 'Asististe', no_asistio: 'No asististe', cancelada: 'Cancelada' };
const MEMBER_STATE: Record<string, { label: string; color: string }> = {
  activo: { label: 'Activo', color: '#34d399' },
  por_vencer: { label: 'Por vencer', color: '#fbbf24' },
  vencido: { label: 'Vencido', color: '#f87171' },
  congelado: { label: 'Congelado', color: '#60a5fa' },
  baja: { label: 'Baja', color: '#9ca3af' },
  sin_plan: { label: 'Sin plan', color: '#9ca3af' },
};

const ERRORS: Record<string, string> = {
  name_required: 'Escribe tu nombre.',
  contact_required: 'Déjanos tu teléfono o email.',
  rate_limited: 'Ya enviaste varias solicitudes. Espera un momento e inténtalo de nuevo.',
  trial_disabled: 'Las clases de prueba no están disponibles por ahora.',
  gym_not_found: 'No se pudo identificar el gimnasio.',
  booking_unavailable: 'Las reservas de clases no están disponibles por ahora.',
  class_unavailable: 'Esa clase ya no está disponible.',
  date_out_of_range: 'Esa fecha no está disponible para reservar.',
  wrong_day: 'Esa fecha no corresponde al día de la clase.',
  class_started: 'Esa clase ya comenzó.',
  class_full: 'La clase está llena. Prueba otro horario.',
  already_booked: 'Ya tienes un cupo reservado en esa clase.',
  member_not_found: 'No encontramos ese carnet.',
  membership_inactive: 'Tu membresía no está vigente. Renuévala para reservar.',
  members_only: 'Las reservas son solo para socios: ingresa tu código de carnet.',
  too_late: 'Ya no se puede cancelar: pasó el plazo de cancelación.',
  not_cancellable: 'Esta reserva ya no se puede cancelar.',
};
const errMsg = (e: any, fallback = 'No se pudo completar. Inténtalo de nuevo.') =>
  ERRORS[e?.error] || (typeof e?.message === 'string' && !e?.error ? e.message : fallback);

const dowOf = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1).getDay(); };
const nowHHMM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

interface Props {
  profile: Profile;
  links: UserLink[];
  onLinkClick?: (linkId: string) => void;
  onLeaveTestimonial?: () => void;
  isMobilePreview?: boolean;
  currentUser?: any;
  visitorProfile?: any;
  userId?: string | null;
  downloadVCard?: () => Promise<void> | void;
  handleShare?: () => Promise<void> | void;
  setShowQRModal?: (show: boolean) => void;
  isVCardLoading?: boolean;
  handleStartChat?: () => Promise<void> | void;
  isStartingChat?: boolean;
}

export const ProfileGymTemplate: React.FC<Props> = ({
  profile, links, onLinkClick, onLeaveTestimonial, isMobilePreview = false, userId,
  handleShare, setShowQRModal, downloadVCard, isVCardLoading,
}) => {
  const accent = profile?.buttonColor || ACCENT_BASE;
  const theme: KitTheme = useMemo(() => ({
    accent,
    accentLight: profile?.buttonColor ? shade(accent, 0.35) : '#e0fb7c',
    accentDark: profile?.buttonColor ? shade(accent, -0.35) : '#8fb61a',
    bg: BG_DARK, surface: SURFACE, text: TEXT,
    onAccent: profile?.buttonTextColor || readableOn(accent, ON_ACCENT),
    titleFont: TITLE_FONT, bodyFont: BODY_FONT, heading: 'slash', logo: 'square',
  }), [accent, profile?.buttonColor, profile?.buttonTextColor]);

  const planName = String(profile?.plan ?? 'free').toLowerCase();
  const isUltra = planName === 'ultra';
  const isPro = planName === 'pro' || isUltra;
  const settings: GymSettings = (profile?.gym_settings as GymSettings) || {};
  const trialOn = settings.trialEnabled !== false;
  const bookingOn = isUltra && settings.bookingEnabled !== false;
  const daysAhead = Math.min(Math.max(Number(settings.bookingDaysAhead) || 14, 1), 60);

  const [plans, setPlans] = useState<GymPlan[]>([]);
  const [classes, setClasses] = useState<GymClass[]>([]);
  const [coaches, setCoaches] = useState<GymCoach[]>([]);
  const [booked, setBooked] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const [request, setRequest] = useState<{ type: GymRequestType; planId?: string } | null>(null);
  const [booking, setBooking] = useState<{ cls: GymClass; date: string } | null>(null);
  const [trackerOpen, setTrackerOpen] = useState(false);
  const [trackerCode, setTrackerCode] = useState('');
  const [passOpen, setPassOpen] = useState<string | null>(null);
  const scheduleRef = useRef<HTMLDivElement>(null);

  const { campaign, deepCode } = useMemo(() => {
    if (typeof window === 'undefined') return { campaign: null as string | null, deepCode: null as string | null };
    const p = new URLSearchParams(window.location.search);
    return { campaign: p.get('campaign'), deepCode: p.get('rastreo') };
  }, []);
  useEffect(() => { if (deepCode && !isMobilePreview) { setTrackerCode(deepCode); setTrackerOpen(true); } }, [deepCode, isMobilePreview]);

  // Catálogo público. Una tabla ausente (SQL sin ejecutar) deja simplemente la sección vacía.
  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    let alive = true;
    (async () => {
      try {
        const [p, c, co] = await Promise.all([
          supabase.from('gym_plans').select('*').eq('gym_profile_id', userId).eq('is_available', true).order('sort_order').order('price'),
          isPro ? supabase.from('gym_classes').select('*').eq('gym_profile_id', userId).eq('is_active', true).order('start_time') : Promise.resolve({ data: [] as any[] }),
          isUltra ? supabase.from('gym_coaches').select('*').eq('gym_profile_id', userId).eq('is_active', true).order('sort_order') : Promise.resolve({ data: [] as any[] }),
        ]);
        if (!alive) return;
        setPlans((p.data ?? []) as GymPlan[]);
        setClasses((c.data ?? []) as GymClass[]);
        setCoaches((co.data ?? []) as GymCoach[]);
      } catch (err: any) { console.error('Gym fetch error:', err?.message ?? err); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [userId, isPro, isUltra]);

  const [today] = useState(() => localISO());
  const refreshBooked = useCallback(async () => {
    if (!userId || !bookingOn || classes.length === 0) return;
    try {
      const { data } = await supabase.rpc('get_gym_class_availability', { p_gym_id: userId, p_from: today, p_to: addDaysISO(today, daysAhead) });
      setBooked((data?.booked as Record<string, number>) || {});
    } catch { /* sin disponibilidad: se muestran las clases sin contador */ }
  }, [userId, bookingOn, classes.length, today, daysAhead]);
  useEffect(() => { refreshBooked(); }, [refreshBooked]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysISO(today, i)), [today]);
  const [dayIdx, setDayIdx] = useState(0);
  const dayClasses = useMemo(
    () => classes.filter(c => c.day_of_week === dowOf(days[dayIdx])).sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [classes, days, dayIdx],
  );
  const dayCount = (iso: string) => classes.filter(c => c.day_of_week === dowOf(iso)).length;

  const wa = (profile?.whatsapp || '').replace(/\D/g, '');
  const trialLabel = settings.trialLabel?.trim() || 'Clase de prueba gratis';
  const sorted = links.filter(l => l.isActive).sort((a, b) => a.order - b.order);

  return (
    <KitProvider theme={theme}>
      <div className={`min-h-screen relative overflow-hidden ${profileStyleLayer(profile).className}`}
        style={{ ...profileStyleLayer(profile).style, backgroundColor: profile?.backgroundColor || BG_DARK, color: profile?.textColor || TEXT, fontFamily: profile?.fontFamily || BODY_FONT }}>
        {!isMobilePreview && (
          <>
            <div aria-hidden className="pointer-events-none fixed inset-0"
              style={{ background: `radial-gradient(110% 50% at 50% -8%, ${accent}1f, transparent 58%)` }} />
            <div aria-hidden className="pointer-events-none fixed inset-x-0 bottom-0 h-48"
              style={{ background: `linear-gradient(to top, ${BG_DARK}, transparent)` }} />
          </>
        )}

        <div className="relative z-10 max-w-xl mx-auto pb-24">
          <ProfileHero
            profile={profile} roleFallback="Gimnasio" contactWhatsapp={wa}
            waText={`Hola ${profile?.displayName || ''}, quiero información sobre sus planes.`}
            setShowQRModal={setShowQRModal} downloadVCard={downloadVCard} isVCardLoading={isVCardLoading} handleShare={handleShare}>

            {/* ── Enlaces ── */}
            <div className="space-y-2.5">
              <PillLink onClick={() => { setTrackerCode(''); setTrackerOpen(true); }} icon={<FaSearch size={13} style={{ color: theme.accentLight }} />}>
                Rastrear mi solicitud o reserva
              </PillLink>
              {isOn(profile, 'links') && sorted.map(l => (
                <PillLink key={l.id} href={l.url} onNavigate={() => onLinkClick?.(l.id)} icon={<FaLink size={12} style={{ color: `${TEXT}66` }} />}>{l.title}</PillLink>
              ))}
            </div>

            {/* ── Tarjetas de acción ── */}
            <div className="space-y-3">
              {trialOn && (
                <FeatureCard icon={<FaFire />} title={trialLabel} badge="Gratis"
                  desc="Conoce el gimnasio sin compromiso. Elige el día y te esperamos."
                  onClick={() => setRequest({ type: 'prueba' })} />
              )}
              {bookingOn && classes.length > 0 && (
                <FeatureCard icon={<FaCalendarCheck />} title="Reserva tu cupo en clase"
                  desc="Asegura tu lugar en las clases grupales. Cupos limitados."
                  onClick={() => scheduleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
              )}
              <FeatureCard icon={<FaDumbbell />} title="Quiero inscribirme"
                desc="Elige tu plan de membresía y nuestro equipo te contacta."
                onClick={() => setRequest({ type: 'inscripcion' })} />
            </div>

            {/* ── Carnet de socio (PRO+) ── */}
            {isPro && isOn(profile, 'club') && (
              <PassCard kicker="Connexo Pass" badge="Socio" title="Mi carnet"
                desc="Consulta tu plan, tu vencimiento y tus beneficios con tu código, email o teléfono."
                button="Ver mi carnet" placeholder="Tu código (G-XXXX), email o teléfono"
                onOpen={id => setPassOpen(id)} />
            )}

            {/* ── Planes ── */}
            {isOn(profile, 'plans') && (loading || plans.length > 0) && (
              <section>
                <SectionHeading kicker="Membresías">Elige tu plan</SectionHeading>
                {loading ? (
                  <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2" style={{ borderColor: accent }} /></div>
                ) : (
                  <div className="space-y-3.5">
                    {plans.map(p => <PlanCard key={p.id} plan={p} onChoose={() => setRequest({ type: 'inscripcion', planId: p.id })} />)}
                  </div>
                )}
              </section>
            )}

            {/* ── Horario de clases (PRO+) ── */}
            {isPro && isOn(profile, 'classes') && classes.length > 0 && (
              <section ref={scheduleRef} className="scroll-mt-4">
                <SectionHeading kicker="Clases grupales">Horario</SectionHeading>
                <div className="flex gap-2 overflow-x-auto pb-1 mb-4 -mx-1 px-1">
                  {days.map((d, i) => {
                    const active = i === dayIdx; const n = dayCount(d);
                    return (
                      <button key={d} type="button" onClick={() => setDayIdx(i)} disabled={n === 0}
                        className="shrink-0 w-[58px] py-2.5 rounded-xl border text-center transition disabled:opacity-30"
                        style={active ? { background: accent, color: theme.onAccent, borderColor: accent } : { background: SURFACE, color: TEXT, borderColor: `${TEXT}14` }}>
                        <p className="text-[9px] font-semibold uppercase tracking-[0.18em] opacity-70">{i === 0 ? 'Hoy' : prettyDate(d, { weekday: 'short' })}</p>
                        <p className="text-lg font-black leading-none mt-1" style={{ fontFamily: TITLE_FONT }}>{Number(d.slice(8))}</p>
                      </button>
                    );
                  })}
                </div>
                <div className="space-y-2.5">
                  {dayClasses.length === 0 && <p className="text-center text-sm py-6" style={{ color: `${TEXT}66` }}>No hay clases este día.</p>}
                  {dayClasses.map(c => {
                    const date = days[dayIdx];
                    const taken = booked[`${c.id}|${date}`] || 0;
                    const left = c.capacity == null ? null : Math.max(c.capacity - taken, 0);
                    const started = date === today && c.start_time <= nowHHMM();
                    const full = left === 0;
                    const lv = LEVEL[c.level] || LEVEL.todos;
                    const lvColor = lv.color || accent;
                    return (
                      <div key={c.id} className={`flex items-stretch rounded-2xl border overflow-hidden ${started ? 'opacity-50' : ''}`} style={{ background: SURFACE, borderColor: `${TEXT}12` }}>
                        <span className="w-1 shrink-0" style={{ background: lvColor }} />
                        <div className="w-[68px] shrink-0 py-3 text-center">
                          <p className="text-[16px] font-black leading-none" style={{ fontFamily: TITLE_FONT, color: '#fff' }}>{c.start_time}</p>
                          {c.end_time && <p className="text-[10px] mt-1" style={{ color: `${TEXT}66` }}>{c.end_time}</p>}
                        </div>
                        <div className="flex-1 min-w-0 py-3">
                          <p className="text-white font-semibold text-[14px] truncate">{c.name}</p>
                          <p className="text-[11px] truncate mt-0.5" style={{ color: `${TEXT}88` }}>{[c.coach_name, c.room].filter(Boolean).join(' · ') || ' '}</p>
                          <span className="inline-block mt-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] px-2 py-0.5 rounded-full" style={{ color: lvColor, border: `1px solid ${lvColor}55` }}>{lv.label}</span>
                        </div>
                        <div className="pr-3 pl-2 flex flex-col items-end justify-center gap-1.5 shrink-0">
                          {bookingOn ? (
                            <>
                              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: full ? '#f87171' : left != null && left <= 3 ? '#fbbf24' : theme.accentLight }}>
                                {started ? 'Ya empezó' : left == null ? 'Cupo libre' : full ? 'Llena' : `${left} cupo${left === 1 ? '' : 's'}`}
                              </p>
                              {!started && !full && (
                                <button type="button" onClick={() => setBooking({ cls: c, date })}
                                  className="px-3.5 py-2 rounded-lg text-[10px] font-bold uppercase tracking-[0.14em] transition hover:brightness-110"
                                  style={{ background: accent, color: theme.onAccent, fontFamily: TITLE_FONT }}>Reservar</button>
                              )}
                            </>
                          ) : (
                            <FaBolt size={12} style={{ color: `${lvColor}aa` }} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {!bookingOn && (
                  <p className="text-[11px] text-center mt-3" style={{ color: `${TEXT}66` }}>
                    ¿Quieres probar una clase? <button type="button" className="underline" style={{ color: theme.accentLight }} onClick={() => setRequest({ type: 'prueba' })}>Pídela aquí</button>.
                  </p>
                )}
              </section>
            )}

            {/* ── Entrenadores (ULTRA) ── */}
            {isUltra && isOn(profile, 'coaches') && coaches.length > 0 && (
              <section>
                <SectionHeading kicker="Tu equipo">Entrenadores</SectionHeading>
                <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x">
                  {coaches.map(c => (
                    <div key={c.id} className="snap-start shrink-0 w-[150px] rounded-2xl overflow-hidden border" style={{ background: SURFACE, borderColor: `${TEXT}12` }}>
                      <div className="aspect-[4/5] relative" style={{ background: '#0c0e0a' }}>
                        {c.photo_url
                          ? <img src={c.photo_url} alt={c.name} className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center"><FaMedal className="text-3xl" style={{ color: `${TEXT}22` }} /></div>}
                        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(10,12,9,0.92), transparent 55%)' }} />
                        <div className="absolute bottom-0 inset-x-0 p-3">
                          <p className="text-white font-semibold text-[13px] truncate" style={{ fontFamily: TITLE_FONT }}>{c.name}</p>
                          {c.specialty && <p className="text-[10px] uppercase tracking-wider truncate mt-0.5" style={{ color: theme.accentLight }}>{c.specialty}</p>}
                        </div>
                      </div>
                      {c.bio && <p className="text-[11px] leading-snug p-3 line-clamp-3" style={{ color: `${TEXT}99` }}>{c.bio}</p>}
                    </div>
                  ))}
                </div>
              </section>
            )}

            <HoursSection profile={profile} title="Horario del gimnasio" />

            <ProfileExtraSections profile={profile} accent={accent} isMobilePreview={isMobilePreview} />

            <ReviewsSection profile={profile} onLeave={onLeaveTestimonial} isMobilePreview={isMobilePreview} title="Lo que dicen nuestros socios" kicker="Resultados" />

            <footer className="text-center pt-6">
              <a href="https://connexo.app" target="_blank" rel="noopener noreferrer"
                className="text-[10px] uppercase tracking-[0.3em] transition" style={{ color: `${TEXT}33` }}>Powered by Connexo</a>
            </footer>
          </ProfileHero>
        </div>

        {request && (
          <RequestModal userId={userId} type={request.type} initialPlanId={request.planId} plans={plans} campaign={campaign}
            isMobilePreview={isMobilePreview} onTrack={code => { setRequest(null); setTrackerCode(code); setTrackerOpen(true); }}
            onClose={() => setRequest(null)} />
        )}
        {booking && (
          <BookingModal userId={userId} cls={booking.cls} initialDate={booking.date} booked={booked} settings={settings} daysAhead={daysAhead}
            isMobilePreview={isMobilePreview} onDone={refreshBooked}
            onTrack={code => { setBooking(null); setTrackerCode(code); setTrackerOpen(true); }}
            onClose={() => setBooking(null)} />
        )}
        {trackerOpen && <TrackerModal userId={userId} initialCode={trackerCode} isMobilePreview={isMobilePreview} onChanged={refreshBooked} onClose={() => setTrackerOpen(false)} />}
        {passOpen !== null && <MemberModal userId={userId} initialId={passOpen} waNumber={wa} gymName={profile?.displayName || ''} onClose={() => setPassOpen(null)} />}
      </div>
    </KitProvider>
  );
};

/* ── Tarjeta de plan ──────────────────────────────────────────────────────── */
const PlanCard: React.FC<{ plan: GymPlan; onChoose: () => void }> = ({ plan: p, onChoose }) => {
  const k = useKit();
  const save = p.compare_price && p.compare_price > p.price ? Math.round((1 - p.price / p.compare_price) * 100) : 0;
  return (
    <div className="relative rounded-3xl border overflow-hidden"
      style={{ background: p.is_popular ? `linear-gradient(160deg, ${k.accent}1c, ${k.surface} 55%)` : k.surface, borderColor: p.is_popular ? `${k.accent}77` : `${k.text}14`,
        boxShadow: p.is_popular ? `0 18px 50px -24px ${k.accent}` : undefined }}>
      {p.is_popular && (
        <div className="absolute top-0 right-0 text-[9px] font-black uppercase tracking-[0.2em] pl-5 pr-4 py-1.5"
          style={{ background: k.accent, color: k.onAccent, clipPath: 'polygon(14px 0, 100% 0, 100% 100%, 0 100%)', fontFamily: k.titleFont }}>Más popular</div>
      )}
      <div className="p-5">
        <h3 className="cnx-product-text text-white text-lg font-semibold uppercase tracking-[0.08em]" style={{ fontFamily: k.titleFont }}>{p.name}</h3>
        {p.description && <p className="text-[12px] mt-1" style={{ color: `${k.text}88` }}>{p.description}</p>}
        <div className="flex items-end gap-2 mt-4">
          <p className="text-[38px] leading-none font-black text-white" style={{ fontFamily: k.titleFont }}>{fmtMoney(p.price)}</p>
          <p className="text-[12px] pb-1.5" style={{ color: `${k.text}88` }}>/ {PERIOD[p.billing_period] || p.billing_period}</p>
          {save > 0 && (
            <span className="ml-auto mb-1.5 text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-md" style={{ background: `${k.accent}26`, color: k.accentLight }}>Ahorra {save}%</span>
          )}
        </div>
        {save > 0 && <p className="text-[12px] line-through mt-0.5" style={{ color: `${k.text}55` }}>{fmtMoney(p.compare_price)}</p>}
        {(p.features?.length > 0 || p.sessions_limit) && (
          <ul className="mt-4 space-y-2">
            {p.sessions_limit ? (
              <li className="flex items-start gap-2 text-[13px]" style={{ color: `${k.text}cc` }}><FaCheck size={11} className="mt-1 shrink-0" style={{ color: k.accent }} /> {p.sessions_limit} clases por {PERIOD[p.billing_period] || 'ciclo'}</li>
            ) : null}
            {p.features.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px]" style={{ color: `${k.text}cc` }}><FaCheck size={11} className="mt-1 shrink-0" style={{ color: k.accent }} /> {f}</li>
            ))}
          </ul>
        )}
        {p.enrollment_fee > 0 && <p className="text-[11px] mt-3" style={{ color: `${k.text}77` }}>+ {fmtMoney(p.enrollment_fee)} de matrícula (pago único)</p>}
        <button type="button" onClick={onChoose}
          className="mt-5 w-full py-3.5 rounded-xl text-[12px] font-bold uppercase tracking-[0.18em] transition hover:brightness-110"
          style={p.is_popular ? { background: k.accent, color: k.onAccent, fontFamily: k.titleFont } : { border: `1px solid ${k.accent}66`, color: k.text, fontFamily: k.titleFont }}>
          Elegir este plan
        </button>
      </div>
    </div>
  );
};

/* ── Solicitud: clase de prueba / inscripción ─────────────────────────────── */
const RequestModal: React.FC<{
  userId?: string | null; type: GymRequestType; initialPlanId?: string; plans: GymPlan[]; campaign: string | null;
  isMobilePreview?: boolean; onTrack: (code: string) => void; onClose: () => void;
}> = ({ userId, type, initialPlanId, plans, campaign, isMobilePreview, onTrack, onClose }) => {
  const k = useKit(); const inp = useInputStyle();
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [email, setEmail] = useState('');
  const [goal, setGoal] = useState(''); const [date, setDate] = useState(''); const [notes, setNotes] = useState('');
  const [planId, setPlanId] = useState(initialPlanId || '');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isMobilePreview) return;
    if (!name.trim()) return setError(ERRORS.name_required);
    if (!phone.trim() && !email.trim()) return setError(ERRORS.contact_required);
    if (!userId) return setError(ERRORS.gym_not_found);
    setError(null); setBusy(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('place_gym_request', {
        p_gym_id: userId, p_request_type: type, p_name: name.trim(), p_phone: phone.trim() || null, p_email: email.trim() || null,
        p_plan_id: planId || null, p_preferred_date: date || null, p_goal: goal || null, p_notes: notes.trim() || null,
        p_member_code: null, p_source_campaign: campaign,
      });
      if (rpcError) throw rpcError;
      if (!data?.ok) return setError(errMsg(data));
      setCode(data.tracking_code);
    } catch (err: any) { setError(errMsg(err)); } finally { setBusy(false); }
  };

  const title = type === 'prueba' ? 'Clase de prueba' : type === 'inscripcion' ? 'Inscripción' : 'Consulta';
  return (
    <ModalShell title={code ? '¡Listo!' : title} onClose={onClose}>
      {code ? (
        <div className="py-3 text-center">
          <FaClipboardCheck className="mx-auto text-4xl mb-3" style={{ color: k.accentLight }} />
          <p className="text-white font-bold">Recibimos tu solicitud.</p>
          <p className="text-sm mt-2" style={{ color: `${k.text}88` }}>Guarda tu código de rastreo:</p>
          <CodeBox code={code} />
          <PrimaryButton type="button" onClick={() => onTrack(code)} className="mt-1">Rastrear mi solicitud</PrimaryButton>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          {type === 'prueba' && <p className="text-[13px]" style={{ color: `${k.text}99` }}>Cuéntanos cuándo quieres venir y te confirmamos el horario.</p>}
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre completo" className={inputCls} style={inp} />
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Teléfono / WhatsApp" className={inputCls} style={inp} />
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email (opcional)" className={inputCls} style={inp} />
          {type === 'inscripcion' && plans.length > 0 && (
            <div>
              <FieldLabel>Plan</FieldLabel>
              <div className="grid grid-cols-1 gap-2">
                {plans.map(p => (
                  <button key={p.id} type="button" onClick={() => setPlanId(planId === p.id ? '' : p.id)}
                    className="flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm border transition text-left"
                    style={planId === p.id ? { background: k.accent, color: k.onAccent, borderColor: k.accent } : { background: 'rgba(255,255,255,0.04)', color: k.text, borderColor: `${k.accent}33` }}>
                    <span className="font-semibold">{p.name}</span><span className="text-xs font-bold">{fmtMoney(p.price)} / {PERIOD[p.billing_period]}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <FieldLabel>Tu objetivo</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {GOALS.map(g => (
                <button key={g} type="button" onClick={() => setGoal(goal === g ? '' : g)}
                  className="px-3 py-1.5 rounded-full text-[11px] font-semibold border transition"
                  style={goal === g ? { background: k.accent, color: k.onAccent, borderColor: k.accent } : { background: 'transparent', color: `${k.text}cc`, borderColor: `${k.text}26` }}>{g}</button>
              ))}
            </div>
          </div>
          {type !== 'consulta' && (
            <div>
              <FieldLabel>{type === 'prueba' ? 'Día que te gustaría venir' : 'Fecha de inicio deseada'}</FieldLabel>
              <input value={date} onChange={e => setDate(e.target.value)} type="date" min={localISO()} className={inputCls} style={inp} />
            </div>
          )}
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="¿Alguna lesión o comentario? (opcional)" className={inputCls} style={inp} />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <PrimaryButton type="submit" disabled={busy}>{busy ? 'Enviando…' : type === 'prueba' ? 'Pedir mi clase gratis' : 'Enviar inscripción'}</PrimaryButton>
        </form>
      )}
    </ModalShell>
  );
};

/* ── Reserva de cupo ───────────────────────────────────────────────────────── */
const BookingModal: React.FC<{
  userId?: string | null; cls: GymClass; initialDate: string; booked: Record<string, number>; settings: GymSettings; daysAhead: number;
  isMobilePreview?: boolean; onDone: () => void; onTrack: (code: string) => void; onClose: () => void;
}> = ({ userId, cls, initialDate, booked, settings, daysAhead, isMobilePreview, onDone, onTrack, onClose }) => {
  const k = useKit(); const inp = useInputStyle();
  const options = useMemo(() => {
    const t = localISO(); const out: string[] = [];
    for (let i = 0; i <= daysAhead && out.length < 4; i++) {
      const d = addDaysISO(t, i);
      if (dowOf(d) === cls.day_of_week && !(i === 0 && cls.start_time <= nowHHMM())) out.push(d);
    }
    return out.length ? out : [initialDate];
  }, [cls, daysAhead, initialDate]);
  const [date, setDate] = useState(options.includes(initialDate) ? initialDate : options[0]);
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [email, setEmail] = useState(''); const [member, setMember] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [code, setCode] = useState<string | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  const autofill = async () => {
    if (!userId || !member.trim()) return;
    setLookingUp(true); setError(null);
    try {
      const { data } = await supabase.rpc('get_gym_member', { p_gym_id: userId, p_identifier: member.trim() });
      if (!data?.found) return setError(ERRORS.member_not_found);
      if (data.name && !name) setName(data.name); if (data.phone && !phone) setPhone(data.phone); if (data.email && !email) setEmail(data.email);
      setMember(data.member_code);
    } catch { /* noop */ } finally { setLookingUp(false); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isMobilePreview) return;
    if (!name.trim()) return setError(ERRORS.name_required);
    if (!phone.trim() && !email.trim()) return setError(ERRORS.contact_required);
    if (settings.membersOnly && !member.trim()) return setError(ERRORS.members_only);
    if (!userId) return setError(ERRORS.gym_not_found);
    setError(null); setBusy(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('book_gym_class', {
        p_gym_id: userId, p_class_id: cls.id, p_date: date, p_name: name.trim(), p_phone: phone.trim() || null,
        p_email: email.trim() || null, p_member_code: member.trim() || null, p_notes: null,
      });
      if (rpcError) throw rpcError;
      if (!data?.ok) { onDone(); return setError(errMsg(data)); }
      setCode(data.confirmation_code); onDone();
    } catch (err: any) { setError(errMsg(err)); } finally { setBusy(false); }
  };

  const left = (d: string) => cls.capacity == null ? null : Math.max(cls.capacity - (booked[`${cls.id}|${d}`] || 0), 0);
  return (
    <ModalShell title={code ? '¡Cupo reservado!' : 'Reservar cupo'} onClose={onClose}>
      {code ? (
        <div className="py-3 text-center">
          <FaCalendarCheck className="mx-auto text-4xl mb-3" style={{ color: k.accentLight }} />
          <p className="text-white font-bold">{cls.name}</p>
          <p className="text-sm mt-1" style={{ color: `${k.text}99` }}>{prettyDate(date, { weekday: 'long', day: 'numeric', month: 'long' })} · {cls.start_time}</p>
          <p className="text-sm mt-3" style={{ color: `${k.text}88` }}>Tu código de reserva:</p>
          <CodeBox code={code} />
          <p className="text-[11px] mb-3" style={{ color: `${k.text}77` }}>Con este código puedes consultar o cancelar tu cupo.</p>
          <PrimaryButton type="button" onClick={() => onTrack(code)}>Ver mi reserva</PrimaryButton>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <div className="rounded-xl p-3.5 border" style={{ background: 'rgba(255,255,255,0.03)', borderColor: `${k.accent}33` }}>
            <p className="text-white font-semibold" style={{ fontFamily: k.titleFont }}>{cls.name}</p>
            <p className="text-[12px] mt-0.5" style={{ color: `${k.text}99` }}>{[cls.start_time + (cls.end_time ? ` – ${cls.end_time}` : ''), cls.coach_name, cls.room].filter(Boolean).join(' · ')}</p>
          </div>
          <div>
            <FieldLabel>Fecha</FieldLabel>
            <div className="grid grid-cols-2 gap-2">
              {options.map(d => {
                const l = left(d); const full = l === 0;
                return (
                  <button key={d} type="button" disabled={full} onClick={() => setDate(d)}
                    className="rounded-xl px-3 py-2.5 text-left border transition disabled:opacity-40"
                    style={date === d ? { background: k.accent, color: k.onAccent, borderColor: k.accent } : { background: 'rgba(255,255,255,0.04)', color: k.text, borderColor: `${k.accent}33` }}>
                    <p className="text-sm font-semibold capitalize">{prettyDate(d, { weekday: 'short', day: 'numeric', month: 'short' })}</p>
                    <p className="text-[10px] uppercase tracking-wider opacity-70">{full ? 'Llena' : l == null ? 'Cupo libre' : `${l} cupos`}</p>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex gap-2">
            <input value={member} onChange={e => setMember(e.target.value)} placeholder={settings.membersOnly ? 'Código de socio (requerido)' : '¿Eres socio? Tu código (G-XXXX)'} className={inputCls} style={inp} />
            <button type="button" onClick={autofill} disabled={lookingUp || !member.trim()} className="shrink-0 px-4 rounded-xl text-[11px] font-bold uppercase border disabled:opacity-40" style={{ borderColor: `${k.accent}44`, color: k.accentLight }}>{lookingUp ? '…' : 'Autocompletar'}</button>
          </div>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre completo" className={inputCls} style={inp} />
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Teléfono / WhatsApp" className={inputCls} style={inp} />
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email (opcional)" className={inputCls} style={inp} />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <PrimaryButton type="submit" disabled={busy}>{busy ? 'Reservando…' : 'Confirmar reserva'}</PrimaryButton>
        </form>
      )}
    </ModalShell>
  );
};

/* ── Rastreador: solicitudes y reservas con el mismo código ───────────────── */
const TrackerModal: React.FC<{ userId?: string | null; initialCode?: string; isMobilePreview?: boolean; onChanged: () => void; onClose: () => void }> = ({ userId, initialCode = '', isMobilePreview, onChanged, onClose }) => {
  const k = useKit(); const inp = useInputStyle();
  const [code, setCode] = useState(initialCode);
  const [res, setRes] = useState<{ kind: 'lead' | 'booking'; data: any } | null>(null);
  const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const check = useCallback(async (silent = false) => {
    if (!userId || !code.trim()) return;
    if (!silent) { setError(null); setLoading(true); }
    try {
      const a = await supabase.rpc('get_gym_request_status', { p_gym_id: userId, p_code: code.trim() });
      if (a.data?.found) { setRes({ kind: 'lead', data: a.data }); return; }
      const b = await supabase.rpc('get_gym_booking_status', { p_gym_id: userId, p_code: code.trim() });
      if (b.data?.found) { setRes({ kind: 'booking', data: b.data }); return; }
      setRes(null); if (!silent) setError('No encontramos ese código.');
    } catch (err: any) { if (!silent) setError(err?.message || 'Error al consultar.'); }
    finally { if (!silent) setLoading(false); }
  }, [userId, code]);

  useEffect(() => { if (initialCode) check(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { if (!res) return; const t = setInterval(() => check(true), 8000); return () => clearInterval(t); }, [res, check]);

  const cancel = async () => {
    if (!userId || !res || isMobilePreview || !window.confirm('¿Cancelar esta reserva?')) return;
    setCancelling(true); setError(null);
    try {
      const { data } = await supabase.rpc('cancel_gym_booking', { p_gym_id: userId, p_code: code.trim() });
      if (!data?.ok) setError(data?.error === 'too_late' ? `Ya no se puede cancelar: el plazo es de ${data.hours} h antes de la clase.` : errMsg(data));
      await check(true); onChanged();
    } finally { setCancelling(false); }
  };

  return (
    <ModalShell title="Rastrear" onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); check(); }} className="flex gap-2">
        <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Código (ej. A1B2C3)" className={inputCls} style={inp} />
        <button type="submit" disabled={loading || !code.trim()} className="shrink-0 px-5 rounded-xl text-sm font-bold uppercase disabled:opacity-40" style={{ background: k.accent, color: k.onAccent, fontFamily: k.titleFont }}>{loading ? '…' : 'Ver'}</button>
      </form>
      {error && <p className="text-red-400 text-xs">{error}</p>}

      {res?.kind === 'lead' && (
        <div className="space-y-4 pt-1">
          <div className="flex items-center justify-between text-sm">
            <span className="font-bold" style={{ color: k.accentLight }}>{LEAD_TYPE[res.data.request_type] || 'Solicitud'}</span>
            <span className="font-mono text-xs" style={{ color: `${k.text}88` }}>{res.data.code}</span>
          </div>
          {res.data.plan_name && <p className="text-sm" style={{ color: `${k.text}cc` }}><span className="font-bold" style={{ color: k.accentLight }}>Plan:</span> {res.data.plan_name}</p>}
          {res.data.status === 'cancelado'
            ? <div className="rounded-xl p-4 text-center border" style={{ background: 'rgba(248,113,113,0.1)', borderColor: 'rgba(248,113,113,0.3)', color: '#f87171' }}>Esta solicitud fue cancelada.</div>
            : <TrackerSteps steps={LEAD_STEPS} labels={LEAD_LABEL} current={res.data.status} />}
          {res.data.status === 'inscrito' && res.data.member_code && (
            <div className="text-center"><p className="text-sm" style={{ color: `${k.text}88` }}>¡Bienvenido! Tu carnet de socio:</p><CodeBox code={res.data.member_code} small /></div>
          )}
          {res.data.admin_note && (
            <div className="rounded-xl p-3 border text-sm" style={{ background: `${k.accent}0f`, borderColor: `${k.accent}33`, color: `${k.text}dd` }}>
              <span className="font-bold" style={{ color: k.accentLight }}>Mensaje del gimnasio:</span>
              <p className="mt-1 whitespace-pre-wrap">{res.data.admin_note}</p>
            </div>
          )}
          {res.data.preferred_date && <p className="text-xs" style={{ color: `${k.text}77` }}>📅 Fecha solicitada: {res.data.preferred_date}</p>}
        </div>
      )}

      {res?.kind === 'booking' && (
        <div className="space-y-3 pt-1">
          <div className="rounded-2xl p-4 border text-center" style={{ background: `linear-gradient(160deg, ${k.accent}18, rgba(255,255,255,0.02))`, borderColor: `${k.accent}44` }}>
            <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: k.accentLight }}>Reserva de clase</p>
            <p className="text-white font-semibold text-lg mt-1" style={{ fontFamily: k.titleFont }}>{res.data.class_name}</p>
            <p className="text-sm mt-1 capitalize" style={{ color: `${k.text}cc` }}>{prettyDate(res.data.class_date, { weekday: 'long', day: 'numeric', month: 'long' })} · {res.data.start_time}</p>
            {res.data.coach_name && <p className="text-xs mt-0.5" style={{ color: `${k.text}88` }}>con {res.data.coach_name}</p>}
            <p className="inline-block mt-3 text-[10px] font-bold uppercase tracking-[0.18em] px-3 py-1 rounded-full"
              style={{ background: res.data.status === 'cancelada' || res.data.status === 'no_asistio' ? 'rgba(248,113,113,0.15)' : `${k.accent}26`, color: res.data.status === 'cancelada' || res.data.status === 'no_asistio' ? '#f87171' : k.accentLight }}>
              {BOOKING_LABEL[res.data.status] || res.data.status}
            </p>
          </div>
          {res.data.status === 'reservada' && (
            <GhostButton type="button" onClick={cancel} disabled={cancelling}>{cancelling ? 'Cancelando…' : 'Cancelar mi reserva'}</GhostButton>
          )}
        </div>
      )}
    </ModalShell>
  );
};

/* ── Carnet de socio ───────────────────────────────────────────────────────── */
const MemberModal: React.FC<{ userId?: string | null; initialId: string; waNumber: string; gymName: string; onClose: () => void }> = ({ userId, initialId, waNumber, gymName, onClose }) => {
  const k = useKit(); const inp = useInputStyle();
  const [id, setId] = useState(initialId);
  const [member, setMember] = useState<any | null>(null);
  const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);

  const lookup = useCallback(async (value: string) => {
    if (!userId || !value.trim()) return;
    setError(null); setLoading(true); setMember(null);
    try {
      const { data } = await supabase.rpc('get_gym_member', { p_gym_id: userId, p_identifier: value.trim() });
      if (data?.found) setMember(data); else setError('No encontramos tu carnet. Verifica el código, email o teléfono.');
    } catch (err: any) { setError(err?.message || 'Error al consultar.'); } finally { setLoading(false); }
  }, [userId]);
  useEffect(() => { if (initialId.trim()) lookup(initialId); /* eslint-disable-next-line */ }, []);

  const st = member ? (MEMBER_STATE[member.state] || MEMBER_STATE.activo) : null;
  const total = member?.start_date && member?.end_date
    ? Math.max(Math.round((Date.parse(member.end_date) - Date.parse(member.start_date)) / 86400000) + 1, 1) : 0;
  const pct = total && member?.days_left != null ? Math.max(0, Math.min(100, Math.round((member.days_left / total) * 100))) : 0;
  const needsRenewal = member && (member.state === 'por_vencer' || member.state === 'vencido');

  return (
    <ModalShell title="Mi carnet" onClose={onClose}>
      {member && st ? (
        <div className="space-y-3">
          <div className="rounded-2xl overflow-hidden border" style={{ background: `linear-gradient(150deg, ${k.accent}26, ${k.surface} 60%)`, borderColor: `${k.accent}55` }}>
            <div className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-semibold uppercase tracking-[0.3em]" style={{ color: k.accentLight }}>{gymName || 'Socio'}</span>
                <span className="text-[9px] font-bold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full" style={{ background: `${st.color}22`, color: st.color, border: `1px solid ${st.color}55` }}>{st.label}</span>
              </div>
              <p className="text-white font-semibold text-xl mt-3" style={{ fontFamily: k.titleFont }}>{member.name}</p>
              <p className="text-[12px] mt-0.5" style={{ color: `${k.text}99` }}>{member.plan_name || 'Sin plan activo'}</p>
              {member.end_date && (
                <div className="mt-4">
                  <div className="flex items-center justify-between text-[11px]" style={{ color: `${k.text}aa` }}>
                    <span>Vence {prettyDate(member.end_date, { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                    <span className="font-bold" style={{ color: st.color }}>{member.days_left != null && member.days_left >= 0 ? `${member.days_left} día${member.days_left === 1 ? '' : 's'}` : 'Vencido'}</span>
                  </div>
                  <div className="h-1.5 rounded-full mt-1.5 overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: st.color }} />
                  </div>
                </div>
              )}
            </div>
            {/* Tira tipo código de barras (decorativa) con el código del carnet */}
            <div className="px-5 py-3 border-t flex items-center justify-between gap-3" style={{ borderColor: `${k.text}12`, background: 'rgba(0,0,0,0.3)' }}>
              <div aria-hidden className="h-8 flex-1 rounded-sm opacity-70"
                style={{ background: `repeating-linear-gradient(90deg, ${k.text} 0 2px, transparent 2px 5px, ${k.text} 5px 6px, transparent 6px 10px, ${k.text} 10px 13px, transparent 13px 15px)` }} />
              <span className="font-mono text-lg font-black tracking-[0.2em]" style={{ color: k.accentLight }}>{member.member_code}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5 text-center">
            <div className="rounded-xl p-3 border" style={{ background: 'rgba(255,255,255,0.03)', borderColor: `${k.text}12` }}>
              <FaRunning className="mx-auto" style={{ color: k.accentLight }} /><p className="text-white font-black text-lg mt-1" style={{ fontFamily: k.titleFont }}>{member.visits || 0}</p><p className="text-[9px] uppercase tracking-widest" style={{ color: `${k.text}66` }}>Asistencias</p>
            </div>
            <div className="rounded-xl p-3 border" style={{ background: 'rgba(255,255,255,0.03)', borderColor: `${k.text}12` }}>
              {member.is_vip ? <FaCrown className="mx-auto" style={{ color: k.accentLight }} /> : <FaStopwatch className="mx-auto" style={{ color: k.accentLight }} />}
              <p className="text-white font-black text-lg mt-1" style={{ fontFamily: k.titleFont }}>{member.is_vip ? 'VIP' : member.discount_percent > 0 ? `${member.discount_percent}%` : '—'}</p>
              <p className="text-[9px] uppercase tracking-widest" style={{ color: `${k.text}66` }}>{member.is_vip ? 'Socio' : 'Descuento'}</p>
            </div>
          </div>
          {member.benefits && (
            <div className="rounded-xl p-3 border text-sm" style={{ background: `${k.accent}0f`, borderColor: `${k.accent}33`, color: `${k.text}dd` }}>
              <span className="font-bold flex items-center gap-1.5" style={{ color: k.accentLight }}><FaGift size={11} /> Tus beneficios</span>
              <p className="mt-1 whitespace-pre-wrap">{member.benefits}</p>
            </div>
          )}
          {needsRenewal && waNumber && (
            <a href={`https://wa.me/${waNumber}?text=${encodeURIComponent(`Hola, soy ${member.name} (${member.member_code}). Quiero renovar mi membresía.`)}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold border text-[#25D366] border-[#25D366]/30 hover:bg-[#25D366]/10 transition"><FaWhatsapp /> Renovar por WhatsApp</a>
          )}
          <GhostButton type="button" onClick={() => { setMember(null); setId(''); }}>Consultar otro</GhostButton>
        </div>
      ) : (
        <form onSubmit={e => { e.preventDefault(); lookup(id); }} className="space-y-3">
          <p className="text-sm" style={{ color: `${k.text}99` }}>Ingresa tu código de socio, email o teléfono.</p>
          <input value={id} onChange={e => setId(e.target.value)} placeholder="G-XXXX / email / teléfono" className={inputCls} style={inp} />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <PrimaryButton type="submit" disabled={loading}>{loading ? 'Buscando…' : 'Consultar'}</PrimaryButton>
        </form>
      )}
    </ModalShell>
  );
};

export default ProfileGymTemplate;
