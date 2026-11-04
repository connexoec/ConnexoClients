import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { profileStyleLayer } from '../src/lib/profileStyleLayer';
import { supabase } from '../src/lib/supabase';
import { ProfileExtraSections } from './ProfileExtraSections';
import FullCatalogView from './FullCatalogView';
import type { Profile, UserLink, HotelRoom, HotelService, HotelSettings, HotelServiceMode } from '../types';
import {
  KitProvider, useKit, useInputStyle, inputCls, isOn, fmtMoney, localISO, addDaysISO, prettyDate, shade, readableOn,
  SectionHeading, PillLink, FeatureCard, ModalShell, FieldLabel, PrimaryButton, GhostButton, CodeBox, TrackerSteps,
  PassCard, HoursSection, ReviewsSection, ProfileHero, type KitTheme,
} from './PublicKit';
import {
  FaBed, FaUsers, FaRulerCombined, FaStar, FaSearch, FaLink, FaCheck, FaWifi, FaSnowflake, FaTv, FaCoffee,
  FaSwimmingPool, FaParking, FaGlassMartiniAlt, FaHotTub, FaShower, FaConciergeBell, FaUtensils, FaSpa, FaPaw,
  FaChevronLeft, FaChevronRight, FaTimes, FaCalendarCheck, FaCrown, FaGift, FaClock, FaCamera, FaMinus, FaPlus,
  FaClipboardCheck, FaDoorOpen,
} from 'react-icons/fa';

// ── Identidad: "Boutique rosé" — vino casi negro, marfil cálido y rosa cobrizo; títulos en serif ──
const ACCENT_BASE = '#d9958b';
const BG_DARK = '#130b0e';
const SURFACE = '#1d1115';
const TEXT = '#f6ece6';
const ON_ACCENT = '#1a0d10';
const TITLE_FONT = "'Merriweather', serif";
const BODY_FONT = "'Space Grotesk', sans-serif";

const STEPS = ['pendiente', 'confirmada', 'en_casa', 'completada'];
const STATUS_LABEL: Record<string, string> = { pendiente: 'Pendiente de confirmar', confirmada: 'Confirmada', en_casa: 'Check-in realizado', completada: 'Estancia completada', cancelada: 'Cancelada', no_show: 'No se presentó' };
const PAY_LABEL: Record<string, string> = { pendiente: 'Pago pendiente', deposito: 'Depósito recibido', pagado: 'Pagado' };
const MODE_LABEL: Record<HotelServiceMode, string> = { por_reserva: 'por reserva', por_noche: 'por noche', por_persona: 'por persona', por_persona_noche: 'por persona y noche' };

const ERRORS: Record<string, string> = {
  name_required: 'Escribe tu nombre.',
  contact_required: 'Déjanos tu teléfono o email.',
  hotel_not_found: 'No se pudo identificar el hotel.',
  booking_unavailable: 'Las reservas en línea no están disponibles por ahora.',
  bad_dates: 'Revisa las fechas: la salida debe ser posterior a la llegada.',
  past_date: 'La fecha de llegada no puede estar en el pasado.',
  too_long: 'Para estancias de más de 60 noches contáctanos directamente.',
  room_unavailable: 'Esa habitación ya no está disponible.',
  no_availability: 'Alguien acaba de reservar la última habitación para esas fechas. Prueba otras fechas u otro tipo.',
  capacity_exceeded: 'La habitación no admite tantos huéspedes.',
  member_not_found: 'No encontramos ese código de huésped.',
  not_cancellable: 'Esta reserva ya no se puede cancelar.',
  club_unavailable: 'El club no está disponible por ahora.',
};
const errMsg = (e: any, fallback = 'No se pudo completar. Inténtalo de nuevo.') => {
  if (e?.error === 'min_nights') return `Esta habitación requiere una estancia mínima de ${e.min_nights} noches.`;
  if (e?.error === 'too_late') return `Ya no se puede cancelar: la política exige ${e.days} día(s) de anticipación.`;
  return ERRORS[e?.error] || (typeof e?.message === 'string' && !e?.error ? e.message : fallback);
};

const AMENITY_ICON: [RegExp, React.ReactNode][] = [
  [/wi-?fi|internet/i, <FaWifi />], [/aire|a\/c|clima/i, <FaSnowflake />], [/tv|televis/i, <FaTv />],
  [/desayuno|caf[eé]/i, <FaCoffee />], [/piscina|alberca|pool/i, <FaSwimmingPool />], [/parque|garaje|estacion/i, <FaParking />],
  [/minibar|bar/i, <FaGlassMartiniAlt />], [/jacuzzi|tina|ba[ñn]era/i, <FaHotTub />], [/ducha|ba[ñn]o/i, <FaShower />],
  [/room service|servicio a la habit/i, <FaConciergeBell />], [/restaur|cocina/i, <FaUtensils />], [/spa|masaj/i, <FaSpa />],
  [/mascota|pet/i, <FaPaw />], [/balc[oó]n|terraza/i, <FaDoorOpen />],
];
const amenityIcon = (a: string) => AMENITY_ICON.find(([re]) => re.test(a))?.[1] ?? <FaCheck />;

const serviceUnits = (mode: HotelServiceMode, qty: number, nights: number, guests: number) =>
  mode === 'por_reserva' ? qty : mode === 'por_noche' ? qty * nights : mode === 'por_persona' ? guests : guests * nights;

interface Offer {
  room: HotelRoom;
  units_free: number; nights: number; subtotal: number; nightly_avg: number; min_nights: number;
  needed: number; reason: '' | 'min_nights' | 'capacity' | 'sold_out';
}

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

export const ProfileHotelTemplate: React.FC<Props> = ({
  profile, links, onLinkClick, onLeaveTestimonial, isMobilePreview = false, userId,
  handleShare, setShowQRModal, downloadVCard, isVCardLoading,
}) => {
  const accent = profile?.buttonColor || ACCENT_BASE;
  const theme: KitTheme = useMemo(() => ({
    accent,
    accentLight: profile?.buttonColor ? shade(accent, 0.35) : '#f0c4bb',
    accentDark: profile?.buttonColor ? shade(accent, -0.35) : '#a45f58',
    bg: BG_DARK, surface: SURFACE, text: TEXT,
    onAccent: profile?.buttonTextColor || readableOn(accent, ON_ACCENT),
    titleFont: TITLE_FONT, bodyFont: BODY_FONT, heading: 'ornament', logo: 'round',
  }), [accent, profile?.buttonColor, profile?.buttonTextColor]);

  const planName = String(profile?.plan ?? 'free').toLowerCase();
  const isPro = planName === 'pro' || planName === 'ultra';
  const settings: HotelSettings = (profile?.hotel_settings as HotelSettings) || {};
  const bookingOn = settings.bookingEnabled !== false;

  const [rooms, setRooms] = useState<HotelRoom[]>([]);
  const [services, setServices] = useState<HotelService[]>([]);
  const [loading, setLoading] = useState(true);

  // Buscador de disponibilidad
  const [today] = useState(() => localISO());
  const [checkIn, setCheckIn] = useState(() => addDaysISO(localISO(), 1));
  const [checkOut, setCheckOut] = useState(() => addDaysISO(localISO(), 2));
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const widgetRef = useRef<HTMLDivElement>(null);

  const [detail, setDetail] = useState<HotelRoom | null>(null);
  const [showAllRooms, setShowAllRooms] = useState(false);
  const [booking, setBooking] = useState<Offer | null>(null);
  const [trackerOpen, setTrackerOpen] = useState(false);
  const [trackerCode, setTrackerCode] = useState('');
  const [clubOpen, setClubOpen] = useState(false);
  const [passOpen, setPassOpen] = useState<string | null>(null);

  const { campaign, deepCode } = useMemo(() => {
    if (typeof window === 'undefined') return { campaign: null as string | null, deepCode: null as string | null };
    const p = new URLSearchParams(window.location.search);
    return { campaign: p.get('campaign'), deepCode: p.get('reserva') };
  }, []);
  useEffect(() => { if (deepCode && !isMobilePreview) { setTrackerCode(deepCode); setTrackerOpen(true); } }, [deepCode, isMobilePreview]);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    let alive = true;
    (async () => {
      try {
        const [r, s] = await Promise.all([
          supabase.from('hotel_rooms').select('*').eq('hotel_profile_id', userId).eq('is_available', true).order('sort_order').order('base_price'),
          isPro ? supabase.from('hotel_services').select('*').eq('hotel_profile_id', userId).eq('is_available', true).order('sort_order') : Promise.resolve({ data: [] as any[] }),
        ]);
        if (!alive) return;
        setRooms((r.data ?? []) as HotelRoom[]);
        setServices((s.data ?? []) as HotelService[]);
      } catch (err: any) { console.error('Hotel fetch error:', err?.message ?? err); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [userId, isPro]);

  const nights = Math.max(Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86400000), 0);

  const search = useCallback(async () => {
    if (!userId) return;
    setSearchError(null); setOffers(null); setSearching(true);
    try {
      const { data, error } = await supabase.rpc('get_hotel_availability', { p_hotel_id: userId, p_check_in: checkIn, p_check_out: checkOut });
      if (error) throw error;
      if (!data?.ok) { setSearchError(errMsg(data)); return; }
      const byId = new Map(rooms.map(r => [r.id, r]));
      const list: Offer[] = [];
      for (const row of data.rooms as any[]) {
        const room = byId.get(row.room_id); if (!room) continue;
        const needA = Math.ceil(adults / Math.max(room.max_adults, 1));
        const needC = children === 0 ? 1 : room.max_children > 0 ? Math.ceil(children / room.max_children) : Infinity;
        const needed = Math.max(needA, needC, 1);
        let reason: Offer['reason'] = '';
        if (!isFinite(needed)) reason = 'capacity';
        else if (data.nights < row.min_nights) reason = 'min_nights';
        else if (row.units_free < needed) reason = row.units_free === 0 ? 'sold_out' : 'capacity';
        list.push({ room, units_free: row.units_free, nights: data.nights, subtotal: Number(row.subtotal), nightly_avg: Number(row.nightly_avg), min_nights: row.min_nights, needed: isFinite(needed) ? needed : 1, reason });
      }
      // Disponibles primero, luego por precio.
      list.sort((a, b) => Number(!!a.reason) - Number(!!b.reason) || a.nightly_avg - b.nightly_avg);
      setOffers(list);
    } catch (err: any) { setSearchError(err?.message || 'No se pudo consultar la disponibilidad.'); }
    finally { setSearching(false); }
  }, [userId, checkIn, checkOut, adults, children, rooms]);

  const reserveRoom = (room: HotelRoom) => {
    setDetail(null);
    setHighlight(room.id);
    widgetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (offers === null && nights > 0) search();
  };

  const wa = (profile?.whatsapp || '').replace(/\D/g, '');
  const clubName = profile?.clubName?.trim() || 'Club de Huéspedes';
  const clubTagline = profile?.clubTagline?.trim() || 'Descuentos en tus próximas estancias, beneficios exclusivos y atención preferente.';
  const sorted = links.filter(l => l.isActive).sort((a, b) => a.order - b.order);
  const stars = Math.min(Math.max(Number(settings.stars) || 0, 0), 5);
  const hasPolicies = !!(settings.checkInTime || settings.checkOutTime || settings.cancellationPolicy || settings.petsAllowed != null || settings.depositPercent);

  const featured = rooms[0] || null;
  const restRooms = rooms.slice(1);
  const catalogItems = useMemo(() => rooms.map(r => ({
    id: r.id, name: r.name, price: `${fmtMoney(r.base_price)} / noche`, image: r.images?.[0], category: r.category || 'Habitaciones',
    description: r.beds || undefined, raw: r,
  })), [rooms]);

  return (
    <KitProvider theme={theme}>
      <div className={`min-h-screen relative overflow-hidden ${profileStyleLayer(profile).className}`}
        style={{ ...profileStyleLayer(profile).style, backgroundColor: profile?.backgroundColor || BG_DARK, color: profile?.textColor || TEXT, fontFamily: profile?.fontFamily || BODY_FONT }}>
        {!isMobilePreview && (
          <>
            <div aria-hidden className="pointer-events-none fixed inset-0"
              style={{ background: `radial-gradient(120% 55% at 50% -5%, ${accent}1a, transparent 58%)` }} />
            <div aria-hidden className="pointer-events-none fixed inset-x-0 bottom-0 h-48"
              style={{ background: `linear-gradient(to top, ${BG_DARK}, transparent)` }} />
          </>
        )}

        <div className="relative z-10 max-w-xl mx-auto pb-24">
          <ProfileHero
            profile={profile} roleFallback="Hotel" contactWhatsapp={wa}
            waText={`Hola ${profile?.displayName || ''}, quisiera información para una reserva.`}
            setShowQRModal={setShowQRModal} downloadVCard={downloadVCard} isVCardLoading={isVCardLoading} handleShare={handleShare}
            extra={stars > 0 ? (
              <div className="flex justify-center gap-1 mt-2.5" aria-label={`${stars} estrellas`}>
                {Array.from({ length: stars }).map((_, i) => <FaStar key={i} size={12} style={{ color: accent }} />)}
              </div>
            ) : undefined}>

            {/* ── Buscador de disponibilidad ── */}
            {bookingOn && isOn(profile, 'booking') && rooms.length > 0 && (
              <div ref={widgetRef} className="scroll-mt-4 rounded-3xl border p-5 -mt-2"
                style={{ background: `linear-gradient(165deg, ${accent}16, ${SURFACE} 62%)`, borderColor: `${accent}55`, boxShadow: `0 24px 60px -32px ${accent}` }}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.34em]" style={{ color: theme.accentLight }}>Reserva directa</p>
                <h2 className="text-white text-xl font-bold mt-1" style={{ fontFamily: TITLE_FONT }}>Reserva tu estadía</h2>
                <div className="grid grid-cols-2 gap-2.5 mt-4">
                  <div>
                    <FieldLabel>Llegada</FieldLabel>
                    <input type="date" value={checkIn} min={today}
                      onChange={e => { const v = e.target.value; setCheckIn(v); if (v && checkOut <= v) setCheckOut(addDaysISO(v, 1)); setOffers(null); }}
                      className={inputCls} style={{ borderColor: `${accent}33`, color: TEXT }} />
                  </div>
                  <div>
                    <FieldLabel>Salida</FieldLabel>
                    <input type="date" value={checkOut} min={addDaysISO(checkIn || today, 1)}
                      onChange={e => { setCheckOut(e.target.value); setOffers(null); }}
                      className={inputCls} style={{ borderColor: `${accent}33`, color: TEXT }} />
                  </div>
                  <Stepper label="Adultos" value={adults} min={1} max={12} onChange={v => { setAdults(v); setOffers(null); }} />
                  <Stepper label="Niños" value={children} min={0} max={10} onChange={v => { setChildren(v); setOffers(null); }} />
                </div>
                <PrimaryButton type="button" onClick={search} disabled={searching || nights < 1} className="mt-4">
                  {searching ? 'Buscando…' : nights > 0 ? `Ver disponibilidad · ${nights} noche${nights === 1 ? '' : 's'}` : 'Elige tus fechas'}
                </PrimaryButton>
                {searchError && <p className="text-red-400 text-xs mt-3">{searchError}</p>}

                {offers && (
                  <div className="mt-5 space-y-3">
                    {offers.length === 0 && <p className="text-center text-sm py-4" style={{ color: `${TEXT}77` }}>No hay habitaciones para esas fechas.</p>}
                    {offers.map(o => (
                      <OfferCard key={o.room.id} offer={o} highlighted={highlight === o.room.id}
                        onDetail={() => setDetail(o.room)} onBook={() => setBooking(o)} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Enlaces ── */}
            <div className="space-y-2.5">
              {bookingOn && (
                <PillLink onClick={() => { setTrackerCode(''); setTrackerOpen(true); }} icon={<FaSearch size={13} style={{ color: theme.accentLight }} />}>
                  Consultar mi reserva
                </PillLink>
              )}
              {isOn(profile, 'links') && sorted.map(l => (
                <PillLink key={l.id} href={l.url} onNavigate={() => onLinkClick?.(l.id)} icon={<FaLink size={12} style={{ color: `${TEXT}66` }} />}>{l.title}</PillLink>
              ))}
            </div>

            {/* ── Club de huéspedes (PRO+) ── */}
            {isPro && isOn(profile, 'club') && (
              <div className="space-y-3">
                <FeatureCard icon={<FaGift />} title={`Únete al ${clubName}`} desc={clubTagline} onClick={() => setClubOpen(true)} />
                <PassCard kicker="Connexo Pass" badge="Huésped" title="Mi carnet de huésped"
                  desc="Consulta tu descuento, tus estancias y tus beneficios con tu código, email o teléfono."
                  button="Ver mi carnet" placeholder="Tu código (H-XXXX), email o teléfono" onOpen={id => setPassOpen(id)} />
              </div>
            )}

            {/* ── Habitaciones ── */}
            {isOn(profile, 'rooms') && (loading || rooms.length > 0) && (
              <section>
                <SectionHeading kicker="Alojamiento">Nuestras habitaciones</SectionHeading>
                {loading ? (
                  <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2" style={{ borderColor: accent }} /></div>
                ) : (
                  <div className="space-y-3">
                    {featured && <RoomHero room={featured} onClick={() => setDetail(featured)} />}
                    {restRooms.length > 0 && (
                      <div className="grid grid-cols-2 gap-3">
                        {restRooms.map(r => <RoomCard key={r.id} room={r} onClick={() => setDetail(r)} />)}
                      </div>
                    )}
                    {rooms.length > 4 && (
                      <button type="button" onClick={() => setShowAllRooms(true)}
                        className="mt-1 w-full py-3.5 rounded-xl font-semibold text-xs uppercase tracking-[0.15em] transition hover:brightness-110 flex items-center justify-center gap-2"
                        style={{ background: accent, color: theme.onAccent }}>
                        <FaBed size={12} /> Ver todas las habitaciones ({rooms.length})
                      </button>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* ── Servicios y experiencias (PRO+) ── */}
            {isPro && isOn(profile, 'services') && services.length > 0 && (
              <section>
                <SectionHeading kicker="Haz tu estadía única">Servicios & experiencias</SectionHeading>
                <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x">
                  {services.map(s => (
                    <div key={s.id} className="snap-start shrink-0 w-[190px] rounded-2xl overflow-hidden border" style={{ background: SURFACE, borderColor: `${TEXT}12` }}>
                      <div className="aspect-[4/3]" style={{ background: '#150b0e' }}>
                        {s.image_url
                          ? <img src={s.image_url} alt={s.name} className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center"><FaConciergeBell className="text-3xl" style={{ color: `${TEXT}22` }} /></div>}
                      </div>
                      <div className="p-3.5">
                        {s.category && <p className="text-[9px] uppercase tracking-[0.2em] font-semibold" style={{ color: theme.accentLight }}>{s.category}</p>}
                        <p className="text-white font-bold text-[14px] mt-0.5" style={{ fontFamily: TITLE_FONT }}>{s.name}</p>
                        {s.description && <p className="text-[11px] mt-1 leading-snug line-clamp-2" style={{ color: `${TEXT}88` }}>{s.description}</p>}
                        <p className="text-[13px] font-bold mt-2" style={{ color: accent }}>{s.price > 0 ? fmtMoney(s.price) : 'Incluido'} <span className="text-[10px] font-normal" style={{ color: `${TEXT}66` }}>{s.price > 0 ? MODE_LABEL[s.price_mode] : ''}</span></p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-center mt-2" style={{ color: `${TEXT}66` }}>Puedes añadirlos al reservar tu habitación.</p>
              </section>
            )}

            {/* ── Políticas ── */}
            {isOn(profile, 'policies') && hasPolicies && (
              <section>
                <SectionHeading kicker="Bueno saber">Políticas del hotel</SectionHeading>
                <div className="rounded-2xl border overflow-hidden" style={{ background: SURFACE, borderColor: `${TEXT}12` }}>
                  {(settings.checkInTime || settings.checkOutTime) && (
                    <div className="grid grid-cols-2 divide-x" style={{ borderColor: `${TEXT}12` }}>
                      <div className="p-4 text-center"><FaClock className="mx-auto mb-1.5" style={{ color: theme.accentLight }} /><p className="text-[9px] uppercase tracking-widest" style={{ color: `${TEXT}66` }}>Check-in</p><p className="text-white font-bold mt-0.5" style={{ fontFamily: TITLE_FONT }}>{settings.checkInTime || '—'}</p></div>
                      <div className="p-4 text-center" style={{ borderColor: `${TEXT}12` }}><FaClock className="mx-auto mb-1.5" style={{ color: theme.accentLight }} /><p className="text-[9px] uppercase tracking-widest" style={{ color: `${TEXT}66` }}>Check-out</p><p className="text-white font-bold mt-0.5" style={{ fontFamily: TITLE_FONT }}>{settings.checkOutTime || '—'}</p></div>
                    </div>
                  )}
                  <ul className="p-4 space-y-2.5 text-[13px] border-t" style={{ borderColor: `${TEXT}12`, color: `${TEXT}cc` }}>
                    {settings.depositPercent ? <li className="flex gap-2"><FaCheck size={11} className="mt-1 shrink-0" style={{ color: accent }} /> Se solicita un depósito del {settings.depositPercent}% para garantizar la reserva.</li> : null}
                    {settings.cancelDaysBefore != null && <li className="flex gap-2"><FaCheck size={11} className="mt-1 shrink-0" style={{ color: accent }} /> Cancelación sin costo hasta {settings.cancelDaysBefore} día(s) antes de la llegada.</li>}
                    {settings.petsAllowed != null && <li className="flex gap-2"><FaPaw size={11} className="mt-1 shrink-0" style={{ color: accent }} /> {settings.petsAllowed ? 'Aceptamos mascotas.' : 'No se admiten mascotas.'}</li>}
                    {settings.cancellationPolicy && <li className="flex gap-2 whitespace-pre-wrap"><FaCheck size={11} className="mt-1 shrink-0" style={{ color: accent }} /> {settings.cancellationPolicy}</li>}
                  </ul>
                </div>
              </section>
            )}

            <HoursSection profile={profile} title="Horario de recepción" />

            <ProfileExtraSections profile={profile} accent={accent} isMobilePreview={isMobilePreview} />

            <ReviewsSection profile={profile} onLeave={onLeaveTestimonial} isMobilePreview={isMobilePreview} title="Opiniones de nuestros huéspedes" kicker="Experiencias" />

            <footer className="text-center pt-6">
              <a href="https://connexo.app" target="_blank" rel="noopener noreferrer"
                className="text-[10px] uppercase tracking-[0.3em] transition" style={{ color: `${TEXT}33` }}>Powered by Connexo</a>
            </footer>
          </ProfileHero>
        </div>

        {showAllRooms && (
          <FullCatalogView items={catalogItems} onBack={() => setShowAllRooms(false)}
            onSelect={raw => { setShowAllRooms(false); setDetail(raw); }}
            accent={accent} bg={BG_DARK} text={TEXT} muted={`${TEXT}80`} fontFamily={BODY_FONT}
            title="Nuestras habitaciones" searchPlaceholder="Buscar habitación…" emptyLabel="Pronto publicaremos nuestras habitaciones."
            ctaLabel="Ver detalle →" isMobilePreview={isMobilePreview} />
        )}
        {detail && <RoomDetailModal room={detail} onClose={() => setDetail(null)} onReserve={() => reserveRoom(detail)} canBook={bookingOn} />}
        {booking && (
          <BookingModal userId={userId} offer={booking} checkIn={checkIn} checkOut={checkOut} adults={adults} children={children}
            services={services} settings={settings} isPro={isPro} campaign={campaign} isMobilePreview={isMobilePreview}
            onTrack={code => { setBooking(null); setTrackerCode(code); setTrackerOpen(true); }}
            onClose={() => setBooking(null)} onBooked={search} />
        )}
        {trackerOpen && <TrackerModal userId={userId} initialCode={trackerCode} isMobilePreview={isMobilePreview} onClose={() => setTrackerOpen(false)} />}
        {clubOpen && <ClubModal userId={userId} clubName={clubName} clubTagline={clubTagline} isMobilePreview={isMobilePreview} onClose={() => setClubOpen(false)} />}
        {passOpen !== null && <MemberModal userId={userId} initialId={passOpen} onClose={() => setPassOpen(null)} />}
      </div>
    </KitProvider>
  );
};

/* ── Contador +/- ─────────────────────────────────────────────────────────── */
const Stepper: React.FC<{ label: string; value: number; min: number; max: number; onChange: (v: number) => void }> = ({ label, value, min, max, onChange }) => {
  const k = useKit();
  const btn = 'w-8 h-8 rounded-full flex items-center justify-center border transition disabled:opacity-30';
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex items-center justify-between rounded-xl border px-2 py-1.5" style={{ background: 'rgba(0,0,0,0.4)', borderColor: `${k.accent}33` }}>
        <button type="button" aria-label={`Menos ${label}`} className={btn} disabled={value <= min} onClick={() => onChange(value - 1)} style={{ borderColor: `${k.accent}55`, color: k.accentLight }}><FaMinus size={9} /></button>
        <span className="text-white font-bold">{value}</span>
        <button type="button" aria-label={`Más ${label}`} className={btn} disabled={value >= max} onClick={() => onChange(value + 1)} style={{ borderColor: `${k.accent}55`, color: k.accentLight }}><FaPlus size={9} /></button>
      </div>
    </div>
  );
};

/* ── Resultado de la búsqueda ─────────────────────────────────────────────── */
const OfferCard: React.FC<{ offer: Offer; highlighted: boolean; onDetail: () => void; onBook: () => void }> = ({ offer: o, highlighted, onDetail, onBook }) => {
  const k = useKit();
  const total = o.subtotal * o.needed;
  const blocked = !!o.reason;
  return (
    <div className="rounded-2xl border overflow-hidden flex" style={{ background: k.surface, borderColor: highlighted ? k.accent : `${k.text}14`, boxShadow: highlighted ? `0 0 0 1px ${k.accent}` : undefined, opacity: blocked ? 0.7 : 1 }}>
      <button type="button" onClick={onDetail} className="w-[112px] shrink-0 relative" style={{ background: '#150b0e' }} aria-label={`Ver ${o.room.name}`}>
        {o.room.images?.[0] ? <img src={o.room.images[0]} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><FaBed style={{ color: `${k.text}22` }} /></div>}
      </button>
      <div className="flex-1 min-w-0 p-3.5">
        <p className="text-white font-bold text-[14px] truncate" style={{ fontFamily: k.titleFont }}>{o.room.name}</p>
        <p className="text-[11px] mt-0.5 truncate" style={{ color: `${k.text}88` }}>{[o.room.beds, `${o.room.max_adults} adultos`].filter(Boolean).join(' · ')}</p>
        {!blocked && o.units_free <= 2 && <p className="text-[10px] font-semibold uppercase tracking-wider mt-1" style={{ color: '#fbbf24' }}>¡Quedan {o.units_free}!</p>}
        <div className="flex items-end justify-between gap-2 mt-2">
          <div>
            <p className="text-[18px] font-bold leading-none text-white" style={{ fontFamily: k.titleFont }}>{fmtMoney(total)}</p>
            <p className="text-[10px] mt-1" style={{ color: `${k.text}77` }}>{o.nights} noche{o.nights === 1 ? '' : 's'}{o.needed > 1 ? ` · ${o.needed} hab.` : ''} · {fmtMoney(o.nightly_avg)}/noche</p>
          </div>
          {blocked ? (
            <span className="text-[10px] font-semibold uppercase tracking-wider text-right" style={{ color: '#f87171' }}>
              {o.reason === 'min_nights' ? `Mín. ${o.min_nights} noches` : o.reason === 'sold_out' ? 'Agotada' : 'No hay cupo'}
            </span>
          ) : (
            <button type="button" onClick={onBook} className="shrink-0 px-4 py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-[0.14em] transition hover:brightness-110"
              style={{ background: k.accent, color: k.onAccent, fontFamily: k.titleFont }}>Reservar</button>
          )}
        </div>
      </div>
    </div>
  );
};

/* ── Tarjetas de habitación ───────────────────────────────────────────────── */
const RoomHero: React.FC<{ room: HotelRoom; onClick: () => void }> = ({ room: r, onClick }) => {
  const k = useKit();
  return (
    <button type="button" onClick={onClick} className="group block w-full text-left rounded-3xl overflow-hidden border relative" style={{ borderColor: `${k.accent}33`, background: k.surface }}>
      <div className="aspect-[16/10] relative overflow-hidden" style={{ background: '#150b0e' }}>
        {r.images?.[0] ? <img src={r.images[0]} alt={r.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-[900ms]" /> : <div className="w-full h-full flex items-center justify-center"><FaBed className="text-5xl" style={{ color: `${k.text}22` }} /></div>}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(19,11,14,0.95) 8%, rgba(19,11,14,0.2) 58%, transparent)' }} />
        {r.images?.length > 1 && <span className="absolute top-3.5 right-3.5 text-[10px] font-semibold px-2 py-1 rounded-md flex items-center gap-1 backdrop-blur-sm" style={{ background: 'rgba(0,0,0,0.45)', color: '#fff' }}><FaCamera size={9} /> {r.images.length}</span>}
        <div className="absolute bottom-0 inset-x-0 p-5">
          {r.category && <p className="text-[9px] uppercase tracking-[0.3em] font-semibold" style={{ color: k.accentLight }}>{r.category}</p>}
          <h3 className="text-white font-bold text-xl leading-tight mt-0.5" style={{ fontFamily: k.titleFont }}>{r.name}</h3>
          <div className="flex items-end justify-between mt-3 gap-2">
            <p className="text-[24px] font-bold leading-none text-white" style={{ fontFamily: k.titleFont }}>{fmtMoney(r.base_price)}<span className="text-[11px] font-normal ml-1" style={{ color: `${k.text}99` }}>/ noche</span></p>
            <div className="flex items-center gap-3 text-[11px] pb-0.5" style={{ color: `${k.text}cc` }}>
              <span className="flex items-center gap-1"><FaUsers size={11} /> {r.max_adults + r.max_children}</span>
              {r.size_m2 ? <span className="flex items-center gap-1"><FaRulerCombined size={11} /> {r.size_m2}m²</span> : null}
            </div>
          </div>
        </div>
      </div>
    </button>
  );
};

const RoomCard: React.FC<{ room: HotelRoom; onClick: () => void }> = ({ room: r, onClick }) => {
  const k = useKit();
  return (
    <button type="button" onClick={onClick} className="group text-left rounded-2xl overflow-hidden border transition-all duration-300 hover:-translate-y-1" style={{ background: 'rgba(255,255,255,0.025)', borderColor: `${k.text}12` }}>
      <div className="aspect-[4/3] relative overflow-hidden" style={{ background: '#150b0e' }}>
        {r.images?.[0] ? <img src={r.images[0]} alt={r.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" /> : <div className="w-full h-full flex items-center justify-center"><FaBed className="text-3xl" style={{ color: `${k.text}22` }} /></div>}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(19,11,14,0.85), transparent 60%)' }} />
        <p className="absolute bottom-2.5 left-3 right-3 text-[16px] font-bold text-white" style={{ fontFamily: k.titleFont }}>{fmtMoney(r.base_price)}<span className="text-[10px] font-normal ml-1 opacity-70">/ noche</span></p>
      </div>
      <div className="p-3.5">
        <p className="cnx-product-text text-white font-semibold text-[13px] truncate">{r.name}</p>
        <div className="flex items-center gap-3 mt-2 pt-2 border-t text-[10px]" style={{ color: `${k.text}77`, borderColor: `${k.text}10` }}>
          <span className="flex items-center gap-1"><FaUsers size={10} /> {r.max_adults + r.max_children}</span>
          {r.beds && <span className="flex items-center gap-1 truncate"><FaBed size={10} /> {r.beds}</span>}
        </div>
      </div>
    </button>
  );
};

/* ── Detalle de habitación ────────────────────────────────────────────────── */
const RoomDetailModal: React.FC<{ room: HotelRoom; onClose: () => void; onReserve: () => void; canBook: boolean }> = ({ room: r, onClose, onReserve, canBook }) => {
  const k = useKit();
  const images = Array.isArray(r.images) ? r.images : [];
  const [img, setImg] = useState(0);
  const go = (d: number) => setImg(i => (images.length ? (i + d + images.length) % images.length : 0));
  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl relative flex flex-col overflow-hidden border"
        style={{ background: k.surface, borderColor: `${k.accent}33`, maxHeight: '92svh', fontFamily: k.bodyFont }} onClick={e => e.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label="Cerrar" className="absolute top-3 right-3 z-20 w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center"><FaTimes /></button>
        <div className="aspect-[16/10] relative shrink-0" style={{ background: '#150b0e' }}>
          {images.length ? <img src={images[img]} alt={`${r.name} ${img + 1}`} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><FaBed className="text-5xl" style={{ color: `${k.text}22` }} /></div>}
          {images.length > 1 && (
            <>
              <button type="button" aria-label="Anterior" onClick={() => go(-1)} className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm text-white flex items-center justify-center"><FaChevronLeft /></button>
              <button type="button" aria-label="Siguiente" onClick={() => go(1)} className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm text-white flex items-center justify-center"><FaChevronRight /></button>
              <span className="absolute bottom-3 right-3 text-[10px] font-semibold px-2 py-1 rounded-md backdrop-blur-sm" style={{ background: 'rgba(0,0,0,0.45)', color: '#fff' }}>{img + 1} / {images.length}</span>
            </>
          )}
        </div>
        {images.length > 1 && (
          <div className="flex gap-1.5 px-4 pt-3 overflow-x-auto shrink-0">
            {images.map((src, i) => (
              <button key={i} type="button" onClick={() => setImg(i)} className="w-14 h-14 rounded-lg overflow-hidden shrink-0 border-2 transition" style={{ borderColor: i === img ? k.accent : 'transparent', opacity: i === img ? 1 : 0.6 }}>
                <img src={src} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
        <div className="p-6 overflow-y-auto">
          {r.category && <p className="text-[10px] uppercase tracking-[0.3em] font-semibold" style={{ color: k.accentLight }}>{r.category}</p>}
          <h3 className="text-xl font-bold text-white mt-0.5" style={{ fontFamily: k.titleFont }}>{r.name}</h3>
          <p className="text-[26px] font-bold mt-2 text-white" style={{ fontFamily: k.titleFont }}>{fmtMoney(r.base_price)}<span className="text-xs font-normal ml-1.5" style={{ color: `${k.text}88` }}>por noche</span></p>
          <div className="grid grid-cols-3 gap-2 mt-4">
            {[
              { icon: <FaUsers />, val: `${r.max_adults}${r.max_children ? ` + ${r.max_children}` : ''}`, label: r.max_children ? 'Adultos + niños' : 'Adultos' },
              r.beds ? { icon: <FaBed />, val: r.beds, label: 'Camas' } : null,
              r.size_m2 ? { icon: <FaRulerCombined />, val: `${r.size_m2}m²`, label: 'Tamaño' } : null,
            ].filter(Boolean).map((x: any, i) => (
              <div key={i} className="rounded-xl p-2.5 text-center border" style={{ background: 'rgba(255,255,255,0.025)', borderColor: `${k.text}12` }}>
                <div className="flex justify-center" style={{ color: k.accentLight }}>{x.icon}</div>
                <p className="text-white font-semibold text-[12px] mt-1.5 leading-tight">{x.val}</p>
                <p className="text-[9px] uppercase tracking-[0.15em] mt-0.5" style={{ color: `${k.text}55` }}>{x.label}</p>
              </div>
            ))}
          </div>
          {r.description && <p className="text-[13px] mt-4 whitespace-pre-wrap leading-relaxed" style={{ color: `${k.text}99` }}>{r.description}</p>}
          {r.amenities?.length > 0 && (
            <div className="mt-4">
              <FieldLabel>Comodidades</FieldLabel>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                {r.amenities.map((a, i) => (
                  <p key={i} className="flex items-center gap-2 text-[12px]" style={{ color: `${k.text}cc` }}><span style={{ color: k.accent }} className="text-[12px]">{amenityIcon(a)}</span> {a}</p>
                ))}
              </div>
            </div>
          )}
          {r.min_nights > 1 && <p className="text-[11px] mt-4" style={{ color: `${k.text}77` }}>Estancia mínima: {r.min_nights} noches.</p>}
          {canBook && <PrimaryButton type="button" onClick={onReserve} className="mt-5 flex items-center justify-center gap-2"><FaCalendarCheck size={12} /> Ver disponibilidad y reservar</PrimaryButton>}
        </div>
      </div>
    </div>
  );
};

/* ── Reserva ──────────────────────────────────────────────────────────────── */
const BookingModal: React.FC<{
  userId?: string | null; offer: Offer; checkIn: string; checkOut: string; adults: number; children: number;
  services: HotelService[]; settings: HotelSettings; isPro: boolean; campaign: string | null; isMobilePreview?: boolean;
  onTrack: (code: string) => void; onClose: () => void; onBooked: () => void;
}> = ({ userId, offer, checkIn, checkOut, adults, children, services, settings, isPro, campaign, isMobilePreview, onTrack, onClose, onBooked }) => {
  const k = useKit(); const inp = useInputStyle();
  const { room, nights, needed } = offer;
  const guests = adults + children;
  const [chosen, setChosen] = useState<Record<string, number>>({});
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [email, setEmail] = useState('');
  const [arrival, setArrival] = useState(''); const [requests, setRequests] = useState(''); const [member, setMember] = useState('');
  const [discountPct, setDiscountPct] = useState(0);
  const [busy, setBusy] = useState(false); const [lookingUp, setLookingUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<any | null>(null);

  const lines = services.filter(s => chosen[s.id]).map(s => ({ s, qty: chosen[s.id], total: s.price * serviceUnits(s.price_mode, chosen[s.id], nights, guests) }));
  const svcTotal = lines.reduce((a, l) => a + l.total, 0);
  const roomsTotal = offer.subtotal * needed;
  const disc = Math.round(roomsTotal * discountPct) / 100;
  const base = roomsTotal - disc + svcTotal;
  const tax = Math.round(base * (settings.taxPercent || 0)) / 100;
  const total = base + tax;
  const deposit = Math.round(total * (settings.depositPercent || 0)) / 100;

  const toggle = (s: HotelService) => setChosen(c => { const n = { ...c }; if (n[s.id]) delete n[s.id]; else n[s.id] = 1; return n; });
  const setQty = (s: HotelService, q: number) => setChosen(c => ({ ...c, [s.id]: Math.min(Math.max(q, 1), 20) }));

  const autofill = async () => {
    if (!userId || !member.trim()) return;
    setLookingUp(true); setError(null);
    try {
      const { data } = await supabase.rpc('get_hotel_member', { p_hotel_id: userId, p_identifier: member.trim() });
      if (!data?.found) { setDiscountPct(0); return setError(ERRORS.member_not_found); }
      if (data.name && !name) setName(data.name); if (data.phone && !phone) setPhone(data.phone); if (data.email && !email) setEmail(data.email);
      setMember(data.member_code); setDiscountPct(Number(data.discount_percent) || 0);
    } catch { /* noop */ } finally { setLookingUp(false); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isMobilePreview) return;
    if (!name.trim()) return setError(ERRORS.name_required);
    if (!phone.trim() && !email.trim()) return setError(ERRORS.contact_required);
    if (!userId) return setError(ERRORS.hotel_not_found);
    setError(null); setBusy(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('place_hotel_booking', {
        p_hotel_id: userId, p_room_id: room.id, p_check_in: checkIn, p_check_out: checkOut, p_adults: adults, p_children: children,
        p_rooms_count: needed, p_name: name.trim(), p_phone: phone.trim() || null, p_email: email.trim() || null,
        p_services: lines.map(l => ({ id: l.s.id, qty: l.qty })), p_requests: requests.trim() || null,
        p_arrival_time: arrival || null, p_member_code: member.trim() || null, p_source_campaign: campaign,
      });
      if (rpcError) throw rpcError;
      if (!data?.ok) { onBooked(); return setError(errMsg(data)); }
      setDone(data); onBooked();
    } catch (err: any) { setError(errMsg(err)); } finally { setBusy(false); }
  };

  const row = (label: string, value: string, strong?: boolean, neg?: boolean) => (
    <div key={label} className="flex items-center justify-between text-[13px]" style={{ color: strong ? '#fff' : `${k.text}aa`, fontWeight: strong ? 700 : 400 }}>
      <span>{label}</span><span style={neg ? { color: k.accentLight } : undefined}>{value}</span>
    </div>
  );

  return (
    <ModalShell title={done ? '¡Reserva enviada!' : 'Confirmar reserva'} onClose={onClose} wide>
      {done ? (
        <div className="py-3 text-center">
          <FaClipboardCheck className="mx-auto text-4xl mb-3" style={{ color: k.accentLight }} />
          <p className="text-white font-bold" style={{ fontFamily: k.titleFont }}>{done.room_name}</p>
          <p className="text-sm mt-1" style={{ color: `${k.text}99` }}>{prettyDate(done.check_in, { day: 'numeric', month: 'long' })} → {prettyDate(done.check_out, { day: 'numeric', month: 'long', year: 'numeric' })} · {done.nights} noche{done.nights === 1 ? '' : 's'}</p>
          <p className="text-sm mt-3" style={{ color: `${k.text}88` }}>Tu código de reserva:</p>
          <CodeBox code={done.confirmation_code} />
          <div className="rounded-xl p-3.5 border text-left space-y-1.5 mb-3" style={{ background: 'rgba(255,255,255,0.03)', borderColor: `${k.accent}33` }}>
            {row('Total', fmtMoney(done.total), true)}
            {done.deposit_required > 0 && row('Depósito para garantizar', fmtMoney(done.deposit_required))}
          </div>
          <p className="text-[12px] mb-3" style={{ color: `${k.text}88` }}>El hotel confirmará tu reserva en breve{done.deposit_required > 0 ? ' y te indicará cómo enviar el depósito' : ''}. Guarda tu código para consultar el estado.</p>
          {done.member_code && <p className="text-[12px] mb-3" style={{ color: `${k.text}99` }}>Tu código de huésped: <span className="font-mono font-bold" style={{ color: k.accentLight }}>{done.member_code}</span></p>}
          <PrimaryButton type="button" onClick={() => onTrack(done.confirmation_code)}>Ver mi reserva</PrimaryButton>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="rounded-xl p-3.5 border flex gap-3" style={{ background: 'rgba(255,255,255,0.03)', borderColor: `${k.accent}33` }}>
            {room.images?.[0] && <img src={room.images[0]} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />}
            <div className="min-w-0">
              <p className="text-white font-bold truncate" style={{ fontFamily: k.titleFont }}>{room.name}{needed > 1 ? ` × ${needed}` : ''}</p>
              <p className="text-[12px] mt-0.5" style={{ color: `${k.text}99` }}>{prettyDate(checkIn)} → {prettyDate(checkOut)} · {nights} noche{nights === 1 ? '' : 's'}</p>
              <p className="text-[12px]" style={{ color: `${k.text}77` }}>{adults} adulto{adults === 1 ? '' : 's'}{children ? ` · ${children} niño${children === 1 ? '' : 's'}` : ''}</p>
            </div>
          </div>

          {isPro && services.length > 0 && (
            <div>
              <FieldLabel>Añade a tu estadía</FieldLabel>
              <div className="space-y-2">
                {services.map(s => {
                  const on = !!chosen[s.id]; const q = chosen[s.id] || 1;
                  const stepped = s.price_mode === 'por_reserva' || s.price_mode === 'por_noche';
                  return (
                    <div key={s.id} className="rounded-xl border px-3.5 py-2.5 flex items-center gap-3 transition" style={{ background: on ? `${k.accent}14` : 'rgba(255,255,255,0.03)', borderColor: on ? `${k.accent}77` : `${k.text}14` }}>
                      <button type="button" onClick={() => toggle(s)} aria-pressed={on} aria-label={s.name}
                        className="w-5 h-5 rounded-md border flex items-center justify-center shrink-0" style={{ borderColor: on ? k.accent : `${k.text}44`, background: on ? k.accent : 'transparent', color: k.onAccent }}>
                        {on && <FaCheck size={9} />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-white truncate">{s.name}</p>
                        <p className="text-[10px]" style={{ color: `${k.text}77` }}>{s.price > 0 ? `${fmtMoney(s.price)} ${MODE_LABEL[s.price_mode]}` : 'Incluido'}</p>
                      </div>
                      {on && stepped && (
                        <div className="flex items-center gap-2 shrink-0">
                          <button type="button" aria-label="Menos" onClick={() => setQty(s, q - 1)} className="w-6 h-6 rounded-full border flex items-center justify-center" style={{ borderColor: `${k.accent}55`, color: k.accentLight }}><FaMinus size={8} /></button>
                          <span className="text-sm font-bold text-white w-4 text-center">{q}</span>
                          <button type="button" aria-label="Más" onClick={() => setQty(s, q + 1)} className="w-6 h-6 rounded-full border flex items-center justify-center" style={{ borderColor: `${k.accent}55`, color: k.accentLight }}><FaPlus size={8} /></button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-2.5">
            <FieldLabel>Tus datos</FieldLabel>
            {isPro && (
              <div className="flex gap-2">
                <input value={member} onChange={e => { setMember(e.target.value); setDiscountPct(0); }} placeholder="¿Eres del club? Tu código (H-XXXX)" className={inputCls} style={inp} />
                <button type="button" onClick={autofill} disabled={lookingUp || !member.trim()} className="shrink-0 px-4 rounded-xl text-[11px] font-bold uppercase border disabled:opacity-40" style={{ borderColor: `${k.accent}44`, color: k.accentLight }}>{lookingUp ? '…' : 'Aplicar'}</button>
              </div>
            )}
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre completo" className={inputCls} style={inp} />
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Teléfono / WhatsApp" className={inputCls} style={inp} />
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email" className={inputCls} style={inp} />
            <select value={arrival} onChange={e => setArrival(e.target.value)} className={inputCls} style={inp}>
              <option value="">Hora estimada de llegada (opcional)</option>
              {['Antes de las 12:00', '12:00 – 15:00', '15:00 – 18:00', '18:00 – 21:00', 'Después de las 21:00'].map(h => <option key={h} value={h}>{h}</option>)}
            </select>
            <textarea value={requests} onChange={e => setRequests(e.target.value)} rows={2} placeholder="Peticiones especiales: cama extra, aniversario, alergias… (opcional)" className={inputCls} style={inp} />
          </div>

          <div className="rounded-xl p-4 border space-y-1.5" style={{ background: 'rgba(255,255,255,0.03)', borderColor: `${k.accent}33` }}>
            {row(`Hospedaje · ${nights} noche${nights === 1 ? '' : 's'}${needed > 1 ? ` × ${needed} hab.` : ''}`, fmtMoney(roomsTotal))}
            {discountPct > 0 && row(`Descuento del club (${discountPct}%)`, `− ${fmtMoney(disc)}`, false, true)}
            {lines.map(l => row(l.s.name, fmtMoney(l.total)))}
            {tax > 0 && row(`Impuestos (${settings.taxPercent}%)`, fmtMoney(tax))}
            <div className="h-px my-1" style={{ background: `${k.text}14` }} />
            {row('Total estimado', fmtMoney(total), true)}
            {deposit > 0 && row(`Depósito (${settings.depositPercent}%)`, fmtMoney(deposit))}
            <p className="text-[10px] pt-1" style={{ color: `${k.text}66` }}>El hotel confirma el monto exacto al recibir tu reserva.</p>
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}
          <PrimaryButton type="submit" disabled={busy}>{busy ? 'Enviando…' : 'Enviar reserva'}</PrimaryButton>
          <p className="text-[10px] text-center" style={{ color: `${k.text}66` }}>No se cobra nada ahora. El hotel confirmará tu reserva.</p>
        </form>
      )}
    </ModalShell>
  );
};

/* ── Rastreador de reserva ────────────────────────────────────────────────── */
const TrackerModal: React.FC<{ userId?: string | null; initialCode?: string; isMobilePreview?: boolean; onClose: () => void }> = ({ userId, initialCode = '', isMobilePreview, onClose }) => {
  const k = useKit(); const inp = useInputStyle();
  const [code, setCode] = useState(initialCode);
  const [res, setRes] = useState<any | null>(null);
  const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const check = useCallback(async (silent = false) => {
    if (!userId || !code.trim()) return;
    if (!silent) { setError(null); setLoading(true); }
    try {
      const { data } = await supabase.rpc('get_hotel_booking_status', { p_hotel_id: userId, p_code: code.trim() });
      if (data?.found) setRes(data); else { setRes(null); if (!silent) setError('No encontramos ese código.'); }
    } catch (err: any) { if (!silent) setError(err?.message || 'Error al consultar.'); }
    finally { if (!silent) setLoading(false); }
  }, [userId, code]);
  useEffect(() => { if (initialCode) check(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { if (!res) return; const t = setInterval(() => check(true), 8000); return () => clearInterval(t); }, [res, check]);

  const cancel = async () => {
    if (!userId || isMobilePreview || !window.confirm('¿Cancelar esta reserva?')) return;
    setCancelling(true); setError(null);
    try {
      const { data } = await supabase.rpc('cancel_hotel_booking', { p_hotel_id: userId, p_code: code.trim() });
      if (!data?.ok) setError(errMsg(data));
      await check(true);
    } finally { setCancelling(false); }
  };

  const cancelled = res?.status === 'cancelada' || res?.status === 'no_show';
  return (
    <ModalShell title="Consultar reserva" onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); check(); }} className="flex gap-2">
        <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Código (ej. A1B2C3)" className={inputCls} style={inp} />
        <button type="submit" disabled={loading || !code.trim()} className="shrink-0 px-5 rounded-xl text-sm font-bold uppercase disabled:opacity-40" style={{ background: k.accent, color: k.onAccent, fontFamily: k.titleFont }}>{loading ? '…' : 'Ver'}</button>
      </form>
      {error && <p className="text-red-400 text-xs">{error}</p>}
      {res && (
        <div className="space-y-4 pt-1">
          <div className="rounded-2xl p-4 border" style={{ background: `linear-gradient(160deg, ${k.accent}18, rgba(255,255,255,0.02))`, borderColor: `${k.accent}44` }}>
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: k.accentLight }}>{res.guest_name}</p>
              <span className="font-mono text-xs" style={{ color: `${k.text}88` }}>{res.code}</span>
            </div>
            <p className="text-white font-bold text-lg mt-1" style={{ fontFamily: k.titleFont }}>{res.room_name}{res.rooms_count > 1 ? ` × ${res.rooms_count}` : ''}</p>
            <p className="text-sm mt-1" style={{ color: `${k.text}cc` }}>{prettyDate(res.check_in, { weekday: 'short', day: 'numeric', month: 'short' })} → {prettyDate(res.check_out, { weekday: 'short', day: 'numeric', month: 'short' })} · {res.nights} noche{res.nights === 1 ? '' : 's'}</p>
            <p className="text-xs mt-0.5" style={{ color: `${k.text}88` }}>{res.adults} adulto{res.adults === 1 ? '' : 's'}{res.children ? ` · ${res.children} niño${res.children === 1 ? '' : 's'}` : ''}{res.check_in_time ? ` · Check-in ${res.check_in_time}` : ''}{res.check_out_time ? ` · Check-out ${res.check_out_time}` : ''}</p>
          </div>
          {cancelled
            ? <div className="rounded-xl p-4 text-center border" style={{ background: 'rgba(248,113,113,0.1)', borderColor: 'rgba(248,113,113,0.3)', color: '#f87171' }}>{STATUS_LABEL[res.status]}</div>
            : <TrackerSteps steps={STEPS} labels={STATUS_LABEL} current={res.status} />}
          <div className="rounded-xl p-3.5 border space-y-1.5" style={{ background: 'rgba(255,255,255,0.03)', borderColor: `${k.text}12` }}>
            {Array.isArray(res.services) && res.services.map((s: any, i: number) => (
              <div key={i} className="flex justify-between text-[12px]" style={{ color: `${k.text}aa` }}><span>{s.name}{s.qty > 1 ? ` × ${s.qty}` : ''}</span><span>{fmtMoney(s.total)}</span></div>
            ))}
            <div className="flex justify-between text-sm font-bold text-white"><span>Total</span><span>{fmtMoney(res.total)}</span></div>
            <div className="flex justify-between text-[11px]" style={{ color: `${k.text}88` }}>
              <span>{PAY_LABEL[res.payment_status] || res.payment_status}</span>
              {res.deposit_required > 0 && res.payment_status === 'pendiente' && <span>Depósito: {fmtMoney(res.deposit_required)}</span>}
            </div>
          </div>
          {res.admin_note && (
            <div className="rounded-xl p-3 border text-sm" style={{ background: `${k.accent}0f`, borderColor: `${k.accent}33`, color: `${k.text}dd` }}>
              <span className="font-bold" style={{ color: k.accentLight }}>Mensaje del hotel:</span>
              <p className="mt-1 whitespace-pre-wrap">{res.admin_note}</p>
            </div>
          )}
          {(res.status === 'pendiente' || res.status === 'confirmada') && (
            <GhostButton type="button" onClick={cancel} disabled={cancelling}>{cancelling ? 'Cancelando…' : 'Cancelar mi reserva'}</GhostButton>
          )}
        </div>
      )}
    </ModalShell>
  );
};

/* ── Club de huéspedes ────────────────────────────────────────────────────── */
const ClubModal: React.FC<{ userId?: string | null; clubName: string; clubTagline: string; isMobilePreview?: boolean; onClose: () => void }> = ({ userId, clubName, clubTagline, isMobilePreview, onClose }) => {
  const k = useKit(); const inp = useInputStyle();
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [code, setCode] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isMobilePreview) return;
    if (!name.trim()) return setError(ERRORS.name_required);
    if (!email.trim() && !phone.trim()) return setError(ERRORS.contact_required);
    if (!userId) return setError(ERRORS.hotel_not_found);
    setError(null); setBusy(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('join_hotel_club', { p_hotel_id: userId, p_name: name.trim(), p_email: email.trim() || null, p_phone: phone.trim() || null });
      if (rpcError) throw rpcError;
      if (!data?.ok) return setError(errMsg(data));
      setCode(data.member_code);
    } catch (err: any) { setError(errMsg(err)); } finally { setBusy(false); }
  };
  return (
    <ModalShell title={code ? '¡Bienvenido al club!' : clubName} onClose={onClose}>
      {code ? (
        <div className="py-3 text-center">
          <FaCrown className="mx-auto text-4xl mb-3" style={{ color: k.accentLight }} />
          <p className="text-white font-bold">Tu código de huésped:</p>
          <CodeBox code={code} />
          <p className="text-sm" style={{ color: `${k.text}88` }}>Úsalo al reservar para aplicar tus beneficios.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <p className="text-sm" style={{ color: `${k.text}99` }}>{clubTagline}</p>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Tu nombre" className={inputCls} style={inp} />
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email" className={inputCls} style={inp} />
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Teléfono / WhatsApp" className={inputCls} style={inp} />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <PrimaryButton type="submit" disabled={busy}>{busy ? 'Uniéndote…' : 'Quiero unirme'}</PrimaryButton>
        </form>
      )}
    </ModalShell>
  );
};

/* ── Carnet de huésped ────────────────────────────────────────────────────── */
const MemberModal: React.FC<{ userId?: string | null; initialId: string; onClose: () => void }> = ({ userId, initialId, onClose }) => {
  const k = useKit(); const inp = useInputStyle();
  const [id, setId] = useState(initialId);
  const [member, setMember] = useState<any | null>(null);
  const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  const lookup = useCallback(async (value: string) => {
    if (!userId || !value.trim()) return;
    setError(null); setLoading(true); setMember(null);
    try {
      const { data } = await supabase.rpc('get_hotel_member', { p_hotel_id: userId, p_identifier: value.trim() });
      if (data?.found) setMember(data); else setError('No encontramos tu carnet. Verifica el código, email o teléfono.');
    } catch (err: any) { setError(err?.message || 'Error al consultar.'); } finally { setLoading(false); }
  }, [userId]);
  useEffect(() => { if (initialId.trim()) lookup(initialId); /* eslint-disable-next-line */ }, []);
  return (
    <ModalShell title="Mi carnet de huésped" onClose={onClose}>
      {member ? (
        <div className="space-y-3">
          <div className="rounded-2xl p-5 border text-center" style={{ background: `linear-gradient(160deg, ${k.accent}26, ${k.surface})`, borderColor: `${k.accent}55` }}>
            <p className="text-[10px] uppercase tracking-[0.3em] font-semibold" style={{ color: k.accentLight }}>{member.is_vip ? 'Huésped VIP' : 'Huésped del club'}</p>
            <p className="text-white font-bold text-xl mt-1.5" style={{ fontFamily: k.titleFont }}>{member.name || 'Huésped'}</p>
            <CodeBox code={member.member_code} small />
            <div className="grid grid-cols-3 gap-2 mt-1">
              {[{ v: member.stays_count || 0, l: 'Estancias' }, { v: member.nights_total || 0, l: 'Noches' }, { v: member.discount_percent > 0 ? `${member.discount_percent}%` : '—', l: 'Descuento' }].map(x => (
                <div key={x.l} className="rounded-lg py-2" style={{ background: 'rgba(0,0,0,0.25)' }}>
                  <p className="text-white font-bold" style={{ fontFamily: k.titleFont }}>{x.v}</p><p className="text-[9px] uppercase tracking-widest" style={{ color: `${k.text}66` }}>{x.l}</p>
                </div>
              ))}
            </div>
          </div>
          {member.benefits && (
            <div className="rounded-xl p-3 border text-sm" style={{ background: `${k.accent}0f`, borderColor: `${k.accent}33`, color: `${k.text}dd` }}>
              <span className="font-bold flex items-center gap-1.5" style={{ color: k.accentLight }}><FaGift size={11} /> Tus beneficios</span>
              <p className="mt-1 whitespace-pre-wrap">{member.benefits}</p>
            </div>
          )}
          <GhostButton type="button" onClick={() => { setMember(null); setId(''); }}>Consultar otro</GhostButton>
        </div>
      ) : (
        <form onSubmit={e => { e.preventDefault(); lookup(id); }} className="space-y-3">
          <p className="text-sm" style={{ color: `${k.text}99` }}>Ingresa tu código de huésped, email o teléfono.</p>
          <input value={id} onChange={e => setId(e.target.value)} placeholder="H-XXXX / email / teléfono" className={inputCls} style={inp} />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <PrimaryButton type="submit" disabled={loading}>{loading ? 'Buscando…' : 'Consultar'}</PrimaryButton>
        </form>
      )}
    </ModalShell>
  );
};

export default ProfileHotelTemplate;
