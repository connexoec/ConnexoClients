import React, { useState, useEffect, useMemo, useRef } from 'react';
import { profileStyleLayer } from '../src/lib/profileStyleLayer';
import { supabase } from '../src/lib/supabase';
import { ProfileExtraSections } from './ProfileExtraSections';
import type { Profile, UserLink, PhotoWork, PhotoPackage, PhotoTeamMember, PhotoSettings, PhotoPackageKind, PhotoPackageMode } from '../types';
import {
  KitProvider, isOn, shade, readableOn,
  SectionHeading, PillLink, FeatureCard, FilterChip, HoursSection, ReviewsSection, ProfileHero, type KitTheme,
} from './PublicKit';
import { WorkCard, PackageCard, TeamCard } from './photo/PhotoUi';
import { WorkModal, PackageModal, BookingModal, QuoteModal, TrackerModal, GalleryModal, type PhotoCtx } from './photo/PhotoModals';
import { KIND_LABEL } from '../src/lib/photoCommon';
import { FaLink, FaCalendarCheck, FaClipboardList, FaLock, FaFileInvoiceDollar, FaImages, FaWhatsapp } from 'react-icons/fa';

// ── Identidad: «Cuarto oscuro» — negro de galería, luz de seguridad coral y títulos en serif editorial ──
const ACCENT_BASE = '#ff6a56';
const BG_DARK = '#0b0b0d';
const SURFACE = '#151518';
const TEXT = '#ececee';
const ON_ACCENT = '#1a0805';
const TITLE_FONT = "'Cormorant Garamond', Georgia, serif";
const BODY_FONT = "'Space Grotesk', sans-serif";

const PAGE = 6;                 // series por tanda en el portafolio
const ALL = '__all__';

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

export const ProfilePhotoTemplate: React.FC<Props> = ({
  profile, links, onLinkClick, onLeaveTestimonial, isMobilePreview = false, userId,
  handleShare, setShowQRModal, downloadVCard, isVCardLoading,
}) => {
  const accent = profile?.buttonColor || ACCENT_BASE;
  const theme: KitTheme = useMemo(() => ({
    accent,
    accentLight: profile?.buttonColor ? shade(accent, 0.3) : '#ff8c7c',
    accentDark: profile?.buttonColor ? shade(accent, -0.4) : '#a8301f',
    bg: BG_DARK, surface: SURFACE, text: TEXT,
    onAccent: profile?.buttonTextColor || readableOn(accent, ON_ACCENT),
    titleFont: TITLE_FONT, bodyFont: BODY_FONT, heading: 'viewfinder', logo: 'frame',
  }), [accent, profile?.buttonColor, profile?.buttonTextColor]);

  const planName = String(profile?.plan ?? 'free').toLowerCase();
  const isUltra = planName === 'ultra';
  const isPro = planName === 'pro' || isUltra;
  const settings: PhotoSettings = useMemo(() => (profile?.photo_settings as PhotoSettings) || {}, [profile?.photo_settings]);
  const bookingOn = isPro && settings.bookingEnabled !== false;
  const galleriesOn = isPro && settings.galleriesEnabled !== false;
  const quotesOn = settings.quotesEnabled !== false;

  const [works, setWorks] = useState<PhotoWork[]>([]);
  const [packages, setPackages] = useState<PhotoPackage[]>([]);
  const [team, setTeam] = useState<PhotoTeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeCat, setActiveCat] = useState<string>(ALL);
  const [activeKind, setActiveKind] = useState<string>(ALL);
  const [visible, setVisible] = useState(PAGE);

  const [work, setWork] = useState<PhotoWork | null>(null);
  const [detail, setDetail] = useState<PhotoPackage | null>(null);
  const [booking, setBooking] = useState<PhotoPackage | null>(null);
  const [quote, setQuote] = useState<{ type: string; pkg: PhotoPackage | null } | null>(null);
  const [trackerOpen, setTrackerOpen] = useState(false);
  const [trackerCode, setTrackerCode] = useState('');
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryCode, setGalleryCode] = useState('');
  const portfolioRef = useRef<HTMLDivElement>(null);

  const { campaign, deepReserva, deepGaleria } = useMemo(() => {
    if (typeof window === 'undefined') return { campaign: null as string | null, deepReserva: null as string | null, deepGaleria: null as string | null };
    const p = new URLSearchParams(window.location.search);
    return { campaign: p.get('campaign'), deepReserva: p.get('reserva') || p.get('cotizacion'), deepGaleria: p.get('galeria') };
  }, []);
  useEffect(() => {
    if (isMobilePreview) return;
    if (deepReserva) { setTrackerCode(deepReserva); setTrackerOpen(true); }
    else if (deepGaleria) { setGalleryCode(deepGaleria); setGalleryOpen(true); }
  }, [deepReserva, deepGaleria, isMobilePreview]);

  /* ── Carga: si una tabla aún no existe (SQL sin ejecutar), esa sección simplemente no aparece ── */
  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    let alive = true;
    (async () => {
      try {
        const [w, p, t] = await Promise.all([
          supabase.from('photo_works').select('*').eq('photo_profile_id', userId).eq('is_visible', true).order('sort_order').order('created_at', { ascending: false }),
          supabase.from('photo_packages').select('*').eq('photo_profile_id', userId).eq('is_active', true).order('sort_order').order('created_at'),
          isUltra ? supabase.from('photo_team').select('*').eq('photo_profile_id', userId).eq('is_active', true).order('sort_order') : Promise.resolve({ data: [], error: null } as any),
        ]);
        if (!alive) return;
        if (!w.error) setWorks((w.data ?? []) as PhotoWork[]);
        if (!p.error) setPackages((p.data ?? []) as PhotoPackage[]);
        if (!t.error) setTeam((t.data ?? []) as PhotoTeamMember[]);
      } catch (err: any) { console.error('Photo fetch error:', err?.message ?? err); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [userId, isUltra]);

  const ctx: PhotoCtx = useMemo(() => ({ profile, userId, settings, isPro, isUltra, isMobilePreview, campaign, team }),
    [profile, userId, settings, isPro, isUltra, isMobilePreview, campaign, team]);

  /* ── Portafolio ── */
  const categories = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of works) m.set(w.category, (m.get(w.category) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [works]);
  const shownWorks = useMemo(() => {
    const list = activeCat === ALL ? works : works.filter(w => w.category === activeCat);
    return [...list].sort((a, b) => Number(b.is_featured) - Number(a.is_featured));
  }, [works, activeCat]);
  useEffect(() => { setVisible(PAGE); }, [activeCat]);

  /* ── Paquetes ── */
  const kinds = useMemo(() => {
    const m = new Map<PhotoPackageKind, number>();
    for (const p of packages) m.set(p.kind, (m.get(p.kind) || 0) + 1);
    return [...m.entries()];
  }, [packages]);
  const shownPackages = useMemo(() => (activeKind === ALL ? packages : packages.filter(p => p.kind === activeKind))
    .slice().sort((a, b) => Number(b.is_featured) - Number(a.is_featured)), [packages, activeKind]);

  /** Cómo se pide de verdad un paquete: sin plan que permita reservar, una «reserva» se vuelve cotización. */
  const modeOf = (p: PhotoPackage): PhotoPackageMode =>
    p.mode === 'reserva' && !bookingOn ? (quotesOn ? 'cotizacion' : 'consulta') : (p.mode === 'cotizacion' && !quotesOn ? 'consulta' : p.mode);

  const waDigitsOf = String(profile?.whatsapp || '').replace(/\D/g, '').replace(/^0/, '593');
  const act = (p: PhotoPackage) => {
    const mode = modeOf(p);
    if (mode === 'reserva') setBooking(p);
    else if (mode === 'cotizacion') setQuote({ type: p.name, pkg: p });
    else if (waDigitsOf) window.open(`https://wa.me/${waDigitsOf}?text=${encodeURIComponent(`Hola, quisiera información sobre "${p.name}".`)}`, '_blank', 'noopener');
    setDetail(null);
  };
  const ctaLabel = (p: PhotoPackage) => ({ reserva: 'Reservar esta sesión', cotizacion: 'Pedir cotización', consulta: 'Consultar por WhatsApp' }[modeOf(p)]);

  const bookable = packages.some(p => modeOf(p) === 'reserva');
  const sorted = useMemo(() => [...(links || [])].filter((l: any) => l.isActive !== false).sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0)), [links]);
  const hasTrackable = bookable || quotesOn;

  return (
    <KitProvider theme={theme}>
      <div className={`min-h-screen pb-16 ${profileStyleLayer(profile).className}`}
        style={{ ...profileStyleLayer(profile).style, background: profile?.backgroundColor || BG_DARK, color: profile?.textColor || TEXT, fontFamily: profile?.fontFamily || BODY_FONT }}>
        <div className="max-w-xl mx-auto">
          <ProfileHero profile={profile} roleFallback="Fotografía profesional" waText="Hola, vi tu perfil de fotografía y quisiera más información."
            setShowQRModal={setShowQRModal} downloadVCard={downloadVCard} isVCardLoading={isVCardLoading} handleShare={handleShare}>

            {/* ── Acciones principales ── */}
            <div className="space-y-3">
              {bookable && isOn(profile, 'booking') && (
                <FeatureCard icon={<FaCalendarCheck />} title="Reservar una sesión" desc="Elige paquete, día y hora. Recibes un código para seguir tu reserva."
                  onClick={() => { const first = packages.find(p => modeOf(p) === 'reserva'); if (packages.filter(p => modeOf(p) === 'reserva').length === 1 && first) setBooking(first); else document.getElementById('photo-packages')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} />
              )}
              {quotesOn && isOn(profile, 'quotes') && (
                <FeatureCard icon={<FaFileInvoiceDollar />} title="Pedir cotización" desc="Bodas, eventos, marcas… cuéntanos tu proyecto y te enviamos una propuesta."
                  onClick={() => setQuote({ type: '', pkg: null })} />
              )}
              {galleriesOn && isOn(profile, 'galleries') && (
                <FeatureCard icon={<FaLock />} title="Mi galería privada" desc="¿Ya hiciste tu sesión? Entra con tu código y clave, elige tus favoritas y descárgalas." onClick={() => { setGalleryCode(''); setGalleryOpen(true); }} />
              )}
              {hasTrackable && (
                <button type="button" onClick={() => { setTrackerCode(''); setTrackerOpen(true); }}
                  className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] mx-auto" style={{ color: theme.accentLight }}>
                  <FaClipboardList size={11} /> Consultar mi reserva o cotización
                </button>
              )}
            </div>

            {/* ── Portafolio ── */}
            {isOn(profile, 'portfolio') && (loading || works.length > 0) && (
              <section ref={portfolioRef} className="scroll-mt-4">
                <SectionHeading kicker="Mi trabajo">Portafolio</SectionHeading>
                {loading ? (
                  <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2" style={{ borderColor: accent }} /></div>
                ) : (
                  <>
                    {categories.length > 1 && (
                      <div className="flex gap-2 overflow-x-auto mb-5 -mx-4 px-4 pb-1" style={{ scrollbarWidth: 'none' }}>
                        <FilterChip active={activeCat === ALL} onClick={() => setActiveCat(ALL)} label="Todo" count={works.length} />
                        {categories.map(([c, n]) => <FilterChip key={c} active={activeCat === c} onClick={() => setActiveCat(c)} label={c} count={n} />)}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2.5">
                      {shownWorks.slice(0, visible).map((w, i) => (
                        <WorkCard key={w.id} w={w} wide={i === 0 && shownWorks.length > 2} onOpen={() => { if (!isMobilePreview) setWork(w); }} />
                      ))}
                    </div>
                    {shownWorks.length > visible && (
                      <button type="button" onClick={() => setVisible(v => v + PAGE)}
                        className="mt-5 w-full py-3 rounded-xl text-[11px] font-semibold uppercase tracking-[0.16em] border transition hover:bg-white/[0.04]"
                        style={{ borderColor: `${accent}55`, color: TEXT }}>Ver más series ({shownWorks.length - visible})</button>
                    )}
                  </>
                )}
              </section>
            )}

            {/* ── Paquetes y precios ── */}
            {isOn(profile, 'packages') && packages.length > 0 && (
              <section id="photo-packages" className="scroll-mt-4">
                <SectionHeading kicker="Elige tu sesión">Paquetes y precios</SectionHeading>
                {kinds.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto mb-5 -mx-4 px-4 pb-1" style={{ scrollbarWidth: 'none' }}>
                    <FilterChip active={activeKind === ALL} onClick={() => setActiveKind(ALL)} label="Todos" count={packages.length} />
                    {kinds.map(([kd, n]) => <FilterChip key={kd} active={activeKind === kd} onClick={() => setActiveKind(kd)} label={KIND_LABEL[kd]} count={n} />)}
                  </div>
                )}
                <div className="space-y-4">
                  {shownPackages.map(p => <PackageCard key={p.id} p={p} mode={modeOf(p)} onOpen={() => setDetail(p)} onAction={() => act(p)} />)}
                </div>
              </section>
            )}

            {/* ── Equipo (ULTRA) ── */}
            {isUltra && isOn(profile, 'team') && team.length > 0 && (
              <section>
                <SectionHeading kicker="Detrás de la cámara">Nuestro equipo</SectionHeading>
                <div className="grid grid-cols-2 gap-3">{team.map(m => <TeamCard key={m.id} m={m} />)}</div>
              </section>
            )}

            {/* ── Sin contenido todavía ── */}
            {!loading && works.length === 0 && packages.length === 0 && (
              <div className="text-center py-8 rounded-2xl border" style={{ background: SURFACE, borderColor: `${TEXT}12` }}>
                <FaImages className="mx-auto text-3xl mb-2" style={{ color: `${TEXT}33` }} />
                <p className="text-sm text-white font-semibold">Pronto publicaremos nuestro portafolio</p>
                {waDigitsOf && <a href={`https://wa.me/${waDigitsOf}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 mt-3 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: theme.accentLight }}><FaWhatsapp /> Escríbenos</a>}
              </div>
            )}

            <ProfileExtraSections profile={profile} accent={accent} isMobilePreview={isMobilePreview} />

            <HoursSection profile={profile} title="Horario de atención" />

            <ReviewsSection profile={profile} onLeave={onLeaveTestimonial} isMobilePreview={isMobilePreview} title="Lo que dicen mis clientes" kicker="Opiniones" />

            {/* ── Enlaces ── */}
            {isOn(profile, 'links') && sorted.length > 0 && (
              <div className="space-y-2.5">
                {sorted.map(l => <PillLink key={l.id} href={l.url} onNavigate={() => onLinkClick?.(l.id)} icon={<FaLink size={12} style={{ color: `${TEXT}b3` }} />}>{l.title}</PillLink>)}
              </div>
            )}

            <footer className="text-center pt-6">
              <a href="https://connexo.app" target="_blank" rel="noopener noreferrer"
                className="text-[10px] uppercase tracking-[0.3em] transition" style={{ color: `${TEXT}b3` }}>Powered by Connexo</a>
            </footer>
          </ProfileHero>
        </div>

        {work && <WorkModal w={work} ctx={ctx} onClose={() => setWork(null)} onQuote={type => { setWork(null); if (quotesOn) setQuote({ type, pkg: null }); else if (waDigitsOf) window.open(`https://wa.me/${waDigitsOf}`, '_blank', 'noopener'); }} />}
        {detail && <PackageModal p={detail} ctaLabel={ctaLabel(detail)} onAction={() => act(detail)} onClose={() => setDetail(null)} />}
        {booking && <BookingModal pkg={booking} ctx={ctx} onTrack={code => { setBooking(null); setTrackerCode(code); setTrackerOpen(true); }} onClose={() => setBooking(null)} />}
        {quote && (
          <QuoteModal ctx={ctx} initialType={quote.type} pkg={quote.pkg} categories={categories.map(c => c[0])}
            onTrack={code => { setQuote(null); setTrackerCode(code); setTrackerOpen(true); }} onClose={() => setQuote(null)} />
        )}
        {trackerOpen && <TrackerModal ctx={ctx} initialCode={trackerCode} onClose={() => setTrackerOpen(false)} />}
        {galleryOpen && <GalleryModal ctx={ctx} initialCode={galleryCode} onClose={() => setGalleryOpen(false)} />}
      </div>
    </KitProvider>
  );
};

export default ProfilePhotoTemplate;
