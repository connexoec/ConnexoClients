import { profileStyleLayer } from '../src/lib/profileStyleLayer';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { MemberPlanBadge } from './MemberPlanCard';
import { supabase } from '../src/lib/supabase';
import { ProfileExtraSections } from './ProfileExtraSections';
import FullCatalogView from './FullCatalogView';
import type { Profile, UserLink, RealtyProperty, RealtyPaymentMethod, RealtyRequestType } from '../types';
import {
  FaInstagram, FaFacebookF, FaTiktok, FaTwitter, FaYoutube, FaLinkedinIn,
  FaGlobe, FaWhatsapp, FaShareAlt, FaQrcode, FaMapMarkerAlt, FaBed, FaBath,
  FaRulerCombined, FaCar, FaCheckCircle, FaTimes, FaBuilding, FaCalendarCheck,
  FaUserTie, FaChevronLeft, FaChevronRight, FaCrown, FaIdCard, FaSearchLocation,
  FaFileInvoiceDollar, FaClipboardCheck, FaKey, FaGift, FaSearch,
  FaArrowRight, FaRegStar, FaCamera, FaPhoneAlt,
  FaRegAddressCard, FaLink,
} from 'react-icons/fa';

// ── Paleta elegante inmobiliaria (champagne gold sobre espresso) ─────────────
// Identidad propia de la plantilla realty: oro/champán como acento de lujo,
// fondo espresso cálido y tipografía marfil. (Nombres heredados por compat.)
const ORANGE_BASE = '#c9a86a';  // acento por defecto (champagne gold)

/**
 * El acento deja de ser una constante fija para poder elegirse desde
 * Apariencia. Va por contexto porque lo usan diez subcomponentes de módulo:
 * cada uno hace `const ORANGE = useAccent()` y así **todas** sus referencias
 * existentes (incluidas las interpoladas del tipo `${ORANGE}22`) siguen
 * funcionando sin tocarlas. Sin valor del cliente, se usa el oro de la marca.
 */
const AccentContext = React.createContext<string>(ORANGE_BASE);
const useAccent = () => React.useContext(AccentContext);
const ORANGE_LIGHT = '#e6cf9c'; // acento claro
const ORANGE_DARK = '#9a7b45';  // acento profundo
const BG_DARK = '#141210';      // fondo espresso / carbón cálido
const OFF_WHITE = '#f2ece1';    // marfil (texto)
const MODAL_BG = '#1b1712';     // superficie de modales/paneles
const TITLE_FONT = "'Tomorrow', sans-serif";
const BODY_FONT = "'Space Grotesk', sans-serif";

const PAYMENT_METHODS: RealtyPaymentMethod[] = ['Contado', 'Crédito Bancario', 'Hipotecario BIESS', 'Fondos Propios'];

// Rangos de presupuesto con límites numéricos → alimentan el select Y filtran propiedades.
const BUDGET_RANGES: { label: string; min: number; max: number }[] = [
  { label: 'Hasta $50.000', min: 0, max: 50000 },
  { label: '$50.000 – $100.000', min: 50000, max: 100000 },
  { label: '$100.000 – $200.000', min: 100000, max: 200000 },
  { label: '$200.000 – $350.000', min: 200000, max: 350000 },
  { label: 'Más de $350.000', min: 350000, max: Infinity },
];

const STATUS_META: Record<string, { label: string; color: string }> = {
  pre_venta:  { label: 'Pre-venta',  color: '#8b5cf6' },
  disponible: { label: 'Disponible', color: '#16a34a' },
  reservado:  { label: 'Reservado',  color: ORANGE_LIGHT },
  vendido:    { label: 'Vendido',    color: '#6b7280' },
};

// Pipeline de rastreo (procesos): recibido → contactado → en_proceso → cerrado.
const TRACK_STEPS = ['recibido', 'contactado', 'en_proceso', 'cerrado'];
const TRACK_LABEL: Record<string, string> = {
  recibido: 'Recibido', contactado: 'Contactado', en_proceso: 'En proceso', cerrado: 'Cerrado', cancelado: 'Cancelado',
};
const REQUEST_LABEL: Record<string, string> = { cotizacion: 'Cotización', visita: 'Visita', compra: 'Compra' };

const isOn = (profile: any, k: string) => profile?.sectionVisibility?.[k] !== false;
const fmtPrice = (p?: number | null) =>
  typeof p === 'number' ? `$${p.toLocaleString('es-EC')}` : 'Consultar';

interface ProfileRealtyTemplateProps {
  profile: Profile;
  links: UserLink[];
  onLinkClick?: (linkId: string) => void;
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

interface AttributedAgent { id: string; name?: string | null; phone_whatsapp?: string | null; }

export const ProfileRealtyTemplate: React.FC<ProfileRealtyTemplateProps> = ({
  profile, links, onLinkClick, isMobilePreview = false, userId, handleShare, setShowQRModal,
  downloadVCard, isVCardLoading,
}) => {
  // Acento elegible desde Apariencia; sin elección, el oro de la plantilla.
  // Se reparte a los subcomponentes por contexto (ver AccentContext arriba).
  const ORANGE = profile?.buttonColor || ORANGE_BASE;
  const plan = (profile?.plan ?? 'free').toString().toLowerCase();
  const isUltra = plan === 'ultra';
  const clubName = profile?.clubName?.trim() || 'Club de Inversionistas';
  const clubTagline = profile?.clubTagline?.trim() || 'Acceso preferente a preventas, descuentos y oportunidades exclusivas.';

  const [properties, setProperties] = useState<RealtyProperty[]>([]);
  const [loadingProps, setLoadingProps] = useState(true);
  const [selected, setSelected] = useState<RealtyProperty | null>(null);

  // Modales de flujo
  const [requestMode, setRequestMode] = useState<RealtyRequestType | null>(null); // cotizacion | visita | compra
  const [requestProperty, setRequestProperty] = useState<RealtyProperty | null>(null);
  const [clubOpen, setClubOpen] = useState(false);
  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupInitial, setLookupInitial] = useState('');
  const [trackerOpen, setTrackerOpen] = useState(false);
  const [trackerCode, setTrackerCode] = useState('');

  // Filtros del catálogo
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [locationQuery, setLocationQuery] = useState('');
  // Vista de catálogo a página completa ("Ver todo")
  const [showFullCatalog, setShowFullCatalog] = useState(false);

  // ── Atribución: ?agent=<username> y ?campaign=<...> del URL ──
  const { agentUsername, campaign, deepCode } = useMemo(() => {
    if (typeof window === 'undefined') return { agentUsername: null as string | null, campaign: null as string | null, deepCode: null as string | null };
    const params = new URLSearchParams(window.location.search);
    return { agentUsername: params.get('agent'), campaign: params.get('campaign'), deepCode: params.get('rastreo') };
  }, []);
  const [agent, setAgent] = useState<AttributedAgent | null>(null);

  useEffect(() => {
    let alive = true;
    if (!userId || !agentUsername) { setAgent(null); return; }
    (async () => {
      try {
        const { data, error } = await supabase.rpc('get_realty_agent', { p_agency_id: userId, p_agent_username: agentUsername });
        if (!alive) return;
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        setAgent(row ? { id: row.id, name: row.name, phone_whatsapp: row.phone_whatsapp } : null);
      } catch { if (alive) setAgent(null); }
    })();
    return () => { alive = false; };
  }, [userId, agentUsername]);

  // Deep-link ?rastreo=CODIGO abre el rastreador automáticamente.
  useEffect(() => {
    if (deepCode) { setTrackerCode(deepCode); setTrackerOpen(true); }
  }, [deepCode]);

  const contactName = agent?.name || profile?.displayName || 'la agencia';
  const contactWhatsapp = (agent?.phone_whatsapp || profile?.whatsapp || '').replace(/\D/g, '');

  const fetchProperties = useCallback(async () => {
    if (!userId) { setLoadingProps(false); return; }
    try {
      const { data, error } = await supabase
        .from('realty_properties').select('*').eq('agency_profile_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setProperties((data ?? []) as RealtyProperty[]);
    } catch (err: any) {
      console.error('Realty properties fetch error:', err?.message ?? err);
    } finally { setLoadingProps(false); }
  }, [userId]);

  useEffect(() => { fetchProperties(); }, [fetchProperties]);

  const openRequest = (mode: RealtyRequestType, prop?: RealtyProperty | null) => {
    setRequestProperty(prop || null);
    setRequestMode(mode);
  };

  const waHref = (text: string) =>
    contactWhatsapp ? `https://wa.me/${contactWhatsapp}?text=${encodeURIComponent(text)}` : undefined;

  // Botón cuadrado de contacto (estilo referencia: superficie oscura, borde hairline).
  const sqCls = "w-11 h-11 rounded-xl flex items-center justify-center transition hover:-translate-y-0.5 disabled:opacity-50";
  const sqStyle = { background: MODAL_BG, border: `1px solid ${OFF_WHITE}16`, color: OFF_WHITE } as React.CSSProperties;

  const social = profile?.socialMedia || {};
  const socialLinks = [
    { key: 'instagram', href: social.instagram, icon: <FaInstagram /> },
    { key: 'facebook', href: social.facebook, icon: <FaFacebookF /> },
    { key: 'tiktok', href: social.tiktok, icon: <FaTiktok /> },
    { key: 'youtube', href: social.youtube, icon: <FaYoutube /> },
    { key: 'twitter', href: social.twitter, icon: <FaTwitter /> },
    { key: 'linkedin', href: social.linkedin, icon: <FaLinkedinIn /> },
    { key: 'website', href: social.website, icon: <FaGlobe /> },
  ].filter(s => s.href && s.href.trim());

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    properties.forEach(p => { c[p.status] = (c[p.status] || 0) + 1; });
    return c;
  }, [properties]);

  // Filtros: estado + búsqueda por título/ubicación.
  const filteredProps = useMemo(() => {
    const q = locationQuery.trim().toLowerCase();
    return properties.filter(p => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (q && !(`${p.title} ${p.location || ''}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [properties, statusFilter, locationQuery]);

  const featured = filteredProps[0] || null;
  const restProps = filteredProps.slice(1);

  // Ítems para la vista de catálogo a página completa (todo el portafolio).
  const catalogItems = useMemo(
    () => properties.map((p) => {
      const st = STATUS_META[p.status] || STATUS_META.disponible;
      return {
        id: String(p.id),
        name: p.title,
        price: fmtPrice(p.price),
        image: Array.isArray(p.images) ? p.images[0] : undefined,
        category: st.label,
        description: p.location,
        raw: p,
      };
    }),
    [properties],
  );

  // Chips de filtro con conteo (solo estados presentes en el inventario).
  const statusChips = useMemo(() => {
    const order = ['disponible', 'pre_venta', 'reservado', 'vendido'];
    return order.filter(s => statusCounts[s]).map(s => ({ key: s, label: STATUS_META[s].label, color: STATUS_META[s].color, count: statusCounts[s] }));
  }, [statusCounts]);

  const SectionHeading: React.FC<{ children: React.ReactNode; kicker?: string }> = ({ children, kicker }) => (
    <div className="text-center mb-7">
      {kicker && (
        <p className="text-[10px] font-semibold uppercase tracking-[0.4em] mb-2" style={{ color: `${ORANGE_LIGHT}` }}>{kicker}</p>
      )}
      <h2 className="text-xl font-semibold tracking-[0.12em] uppercase" style={{ color: '#fff', fontFamily: TITLE_FONT }}>
        {children}
      </h2>
      <div className="mx-auto mt-3 h-px w-12" style={{ background: `linear-gradient(90deg, transparent, ${ORANGE}, transparent)` }} />
    </div>
  );

  return (
    <AccentContext.Provider value={ORANGE}>
    <div className={`min-h-screen relative overflow-hidden ${profileStyleLayer(profile).className}`}
      style={{
        ...profileStyleLayer(profile).style,
        backgroundColor: profile?.backgroundColor || BG_DARK,
        color: profile?.textColor || OFF_WHITE,
        fontFamily: profile?.fontFamily || BODY_FONT,
      }}>
      {!isMobilePreview && (
        <>
          <div aria-hidden className="pointer-events-none fixed inset-0"
            style={{ background: `radial-gradient(120% 55% at 50% -5%, ${ORANGE}12, transparent 55%)` }} />
          <div aria-hidden className="pointer-events-none fixed inset-x-0 bottom-0 h-48"
            style={{ background: `linear-gradient(to top, ${BG_DARK}, transparent)` }} />
        </>
      )}

      <div className="relative z-10 max-w-xl mx-auto pb-24">
        {/* ── PORTADA ── */}
        <div className="relative h-52 sm:h-60 w-full overflow-hidden">
          {profile?.coverImageURL ? (
            <img src={profile.coverImageURL} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${ORANGE_DARK}44, ${BG_DARK})` }} />
          )}
          <div className="absolute inset-0" style={{ background: `linear-gradient(to top, ${profile?.backgroundColor || BG_DARK} 3%, transparent 68%)` }} />
        </div>

        <div className="px-4 -mt-16 relative space-y-9">
          {/* ── IDENTIDAD ── */}
          <header className="text-center">
            <div className="inline-block rounded-[22px] p-1.5 mb-4" style={{ background: MODAL_BG, border: `1px solid ${ORANGE}44`, boxShadow: '0 16px 44px -14px rgba(0,0,0,0.75)' }}>
              <img src={profile?.logoURL || profile?.profilePhotoURL || 'https://via.placeholder.com/150'}
                alt={profile?.displayName} className="w-24 h-24 rounded-2xl object-cover" />
            </div>
            <h1 className="text-[26px] leading-tight font-semibold tracking-[0.04em]" style={{ fontFamily: TITLE_FONT, color: '#fff' }}>
              {profile?.displayName || 'Inmobiliaria'}
            </h1>
            {profile?.company && profile.company.trim() && profile.company !== profile.displayName && (
              <p className="text-[13px] mt-1" style={{ color: `${OFF_WHITE}80` }}>{profile.company}</p>
            )}
            <p className="text-[11px] font-semibold uppercase tracking-[0.38em] mt-2.5" style={{ color: ORANGE_LIGHT }}>
              {profile?.jobTitle?.trim() || 'Inmobiliaria'}
            </p>
            {(profile?.bio || profile?.aboutMe) && (
              <p className="text-[13px] italic leading-relaxed mt-4 max-w-md mx-auto whitespace-pre-wrap" style={{ color: `${OFF_WHITE}aa` }}>
                {profile.bio || profile.aboutMe}
              </p>
            )}

            {/* Fila de contacto + Compartir */}
            <div className="flex flex-wrap items-center justify-center gap-2 mt-6">
              {profile?.phone && (
                <a href={`tel:${profile.phone.replace(/\s/g, '')}`} className={sqCls} style={sqStyle}><FaPhoneAlt size={13} /></a>
              )}
              {contactWhatsapp && (
                <a href={waHref(`Hola ${contactName}, quiero información sobre sus propiedades.`)} target="_blank" rel="noopener noreferrer" className={sqCls} style={sqStyle}><FaWhatsapp size={15} /></a>
              )}
              <button onClick={() => setShowQRModal?.(true)} className={sqCls} style={sqStyle}><FaQrcode size={14} /></button>
              {downloadVCard && (
                <button onClick={() => downloadVCard()} disabled={isVCardLoading} className={sqCls} style={sqStyle}><FaRegAddressCard size={15} /></button>
              )}
              <button onClick={() => handleShare?.()}
                className="flex items-center gap-2 h-11 px-5 rounded-xl text-[11px] font-semibold uppercase tracking-[0.2em] transition hover:brightness-110"
                style={{ background: ORANGE, color: BG_DARK, fontFamily: TITLE_FONT, boxShadow: `0 10px 26px -12px ${ORANGE}` }}>
                <FaShareAlt size={12} /> Compartir
              </button>
            </div>

            {/* Redes sociales */}
            {socialLinks.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
                {socialLinks.map(s => (
                  <a key={s.key} href={s.href} target="_blank" rel="noopener noreferrer" className={sqCls} style={sqStyle}>
                    <span className="text-[15px]">{s.icon}</span>
                  </a>
                ))}
              </div>
            )}

            {/* Ubicación */}
            {(profile?.location || (Array.isArray(profile?.locations) && profile.locations[0])) && (
              <p className="flex items-center justify-center gap-1.5 mt-5 text-[13px]" style={{ color: `${OFF_WHITE}cc` }}>
                <FaMapMarkerAlt size={12} style={{ color: ORANGE_LIGHT }} />
                {profile?.location || (profile?.locations as string[])[0]}
              </p>
            )}
          </header>

        {/* ── Banner de agente atribuido ── */}
        {agent && (
          <div className="rounded-2xl p-4 flex items-center gap-3.5 border"
            style={{ background: 'rgba(255,255,255,0.025)', borderColor: `${ORANGE}33` }}>
            <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={{ border: `1px solid ${ORANGE}44`, color: ORANGE_LIGHT }}>
              <FaUserTie />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] uppercase tracking-[0.25em] font-semibold" style={{ color: ORANGE_LIGHT }}>Tu asesor asignado</p>
              <p className="text-white font-semibold text-sm truncate mt-0.5">{agent.name || 'Asesor inmobiliario'}</p>
            </div>
            {contactWhatsapp && (
              <a href={waHref(`Hola ${contactName}, vi tu tarjeta y quiero asesoría inmobiliaria.`)} target="_blank" rel="noopener noreferrer"
                className="shrink-0 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] px-3.5 py-2.5 rounded-full text-[#25D366] border border-[#25D366]/30 hover:bg-[#25D366]/10 transition">
                <FaWhatsapp size={13} /> Escribir
              </a>
            )}
          </div>
        )}

        {/* ── Enlaces (píldoras oscuras) ── */}
        <div className="space-y-2.5">
          <PillLink onClick={() => setTrackerOpen(true)} icon={<FaSearchLocation size={13} style={{ color: ORANGE_LIGHT }} />}>
            Rastrear mi proceso
          </PillLink>
          {isOn(profile, 'links') && links.filter(l => l.isActive).sort((a, b) => a.order - b.order).map(l => (
            <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer" onClick={() => onLinkClick?.(l.id)}
              className="flex items-center justify-center gap-2 w-full rounded-2xl py-4 px-4 text-[13px] font-semibold tracking-wide transition hover:-translate-y-0.5"
              style={{ background: MODAL_BG, border: `1px solid ${OFF_WHITE}12`, color: OFF_WHITE }}>
              <FaLink size={12} style={{ color: `${OFF_WHITE}66` }} /> {l.title}
            </a>
          ))}
        </div>

        {/* ── Tarjetas de acción ── */}
        <div className="space-y-3">
          <FeatureCard icon={<FaFileInvoiceDollar />} title="Solicitar una cotización"
            desc="Recibe una propuesta a tu medida según tu presupuesto y forma de pago." onClick={() => openRequest('cotizacion')} />
          <FeatureCard icon={<FaCalendarCheck />} title="Agendar una cita"
            desc="Coordina una visita a la propiedad que te interese. Elige el día." onClick={() => openRequest('visita')} />
          <FeatureCard icon={<FaGift />} title={`Únete al ${clubName}`}
            desc={clubTagline} onClick={() => setClubOpen(true)} />
        </div>

        {/* ── Pase de membresía ── */}
        <MembershipPass clubName={clubName} onOpen={(id) => { setLookupInitial(id); setLookupOpen(true); }} />

        {/* ── CATÁLOGO DE PROPIEDADES ── */}
        {isOn(profile, 'properties') && (
          <section>
            <SectionHeading kicker="Portafolio">Nuestras Propiedades</SectionHeading>
            {loadingProps ? (
              <div className="flex justify-center py-10">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2" style={{ borderColor: ORANGE }} />
              </div>
            ) : properties.length === 0 ? (
              <div className="text-center py-10 rounded-2xl border" style={{ borderColor: `${ORANGE}22`, background: 'rgba(255,255,255,0.02)' }}>
                <FaBuilding className="mx-auto text-3xl mb-2" style={{ color: `${OFF_WHITE}33` }} />
                <p className="text-sm" style={{ color: `${OFF_WHITE}66` }}>Pronto publicaremos nuevas propiedades.</p>
              </div>
            ) : (
              <>
                {/* Buscador por zona / título */}
                <div className="flex items-center gap-2.5 rounded-full px-4 py-3 mb-3.5 border" style={{ background: 'rgba(0,0,0,0.2)', borderColor: `${OFF_WHITE}1a` }}>
                  <FaSearch size={12} style={{ color: `${OFF_WHITE}55` }} />
                  <input value={locationQuery} onChange={e => setLocationQuery(e.target.value)}
                    placeholder="Buscar por zona o nombre…"
                    className="bg-transparent text-white text-sm focus:outline-none w-full placeholder-white/30" style={{ color: OFF_WHITE }} />
                </div>

                {/* Chips de filtro por estado */}
                {statusChips.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pb-1 mb-5 -mx-1 px-1">
                    <FilterChip active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} label="Todas" count={properties.length} color={ORANGE} />
                    {statusChips.map(c => (
                      <FilterChip key={c.key} active={statusFilter === c.key} onClick={() => setStatusFilter(c.key)} label={c.label} count={c.count} color={c.color} />
                    ))}
                  </div>
                )}

                {filteredProps.length === 0 ? (
                  <p className="text-center text-sm py-8" style={{ color: `${OFF_WHITE}66` }}>No hay propiedades que coincidan con tu búsqueda.</p>
                ) : (
                  <div className="space-y-3">
                    {/* Propiedad destacada */}
                    {featured && <FeaturedCard property={featured} onClick={() => setSelected(featured)} onVisit={() => openRequest('visita', featured)} />}
                    {/* Resto en grid de 2 columnas */}
                    {restProps.length > 0 && (
                      <div className="grid grid-cols-2 gap-3">
                        {restProps.map(p => <PropertyCard key={p.id} property={p} onClick={() => setSelected(p)} />)}
                      </div>
                    )}
                    {properties.length > 4 && (
                      <button type="button" onClick={() => setShowFullCatalog(true)}
                        className="mt-2 w-full py-3.5 rounded-xl font-semibold text-xs uppercase tracking-[0.15em] transition-all hover:brightness-110 active:scale-95 flex items-center justify-center gap-2"
                        style={{ backgroundColor: ORANGE, color: BG_DARK }}>
                        <FaBuilding size={12} /> Ver todas las propiedades ({properties.length})
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </section>
        )}

          <ProfileExtraSections profile={profile} accent={ORANGE} isMobilePreview={isMobilePreview} />

          <footer className="text-center pt-6">
            <a href="https://connexo.app" target="_blank" rel="noopener noreferrer"
              className="text-[10px] uppercase tracking-[0.3em] transition" style={{ color: `${OFF_WHITE}33` }}>
              Powered by Connexo
            </a>
          </footer>
        </div>
      </div>

      {/* ── Vista de catálogo a página completa ── */}
      {showFullCatalog && (
        <FullCatalogView
          items={catalogItems}
          onBack={() => setShowFullCatalog(false)}
          onSelect={(raw) => { setShowFullCatalog(false); setSelected(raw); }}
          accent={ORANGE}
          bg={BG_DARK}
          text={OFF_WHITE}
          muted={`${OFF_WHITE}80`}
          title="Nuestras Propiedades"
          searchPlaceholder="Buscar por zona o nombre…"
          emptyLabel="Pronto publicaremos nuevas propiedades."
          ctaLabel="Ver detalle →"
          isMobilePreview={isMobilePreview}
        />
      )}

      {/* ── Modal Detalle de Propiedad ── */}
      {selected && (
        <PropertyDetailModal
          property={selected} contactName={contactName} waHref={waHref}
          onClose={() => setSelected(null)}
          onQuote={() => { const p = selected; setSelected(null); openRequest('cotizacion', p); }}
          onBuy={() => { const p = selected; setSelected(null); openRequest('compra', p); }}
          onVisit={() => { const p = selected; setSelected(null); openRequest('visita', p); }}
        />
      )}

      {/* ── Modal de proceso (cotización / visita / compra) ── */}
      {requestMode && (
        <RequestModal
          userId={userId} mode={requestMode} property={requestProperty} properties={properties}
          agentUsername={agent ? agentUsername : null} campaign={campaign} isMobilePreview={isMobilePreview}
          onTrack={(code) => { setRequestMode(null); setTrackerCode(code); setTrackerOpen(true); }}
          onClose={() => setRequestMode(null)}
        />
      )}

      {/* ── Modal Club ── */}
      {clubOpen && (
        <ClubModal userId={userId} clubName={clubName} clubTagline={clubTagline} isMobilePreview={isMobilePreview} onClose={() => setClubOpen(false)} />
      )}

      {/* ── Modal Membresía ── */}
      {lookupOpen && (
        <MembershipModal userId={userId} clubName={clubName} initialId={lookupInitial} onClose={() => { setLookupOpen(false); setLookupInitial(''); }} />
      )}

      {/* ── Modal Rastreador ── */}
      {trackerOpen && (
        <TrackerModal userId={userId} initialCode={trackerCode} onClose={() => setTrackerOpen(false)} />
      )}
    </div>
    </AccentContext.Provider>
  );
};

// ── Píldora oscura (enlace tipo referencia) ──────────────────────────────────
const PillLink: React.FC<{ onClick: () => void; icon: React.ReactNode; children: React.ReactNode }> = ({ onClick, icon, children }) => (
  <button onClick={onClick}
    className="flex items-center justify-center gap-2 w-full rounded-2xl py-4 px-4 text-[13px] font-semibold tracking-wide transition hover:-translate-y-0.5"
    style={{ background: MODAL_BG, border: `1px solid ${OFF_WHITE}12`, color: OFF_WHITE }}>
    {icon} {children}
  </button>
);

// ── Tarjeta de acción (estilo referencia: borde de acento + ícono + texto) ────
const FeatureCard: React.FC<{ icon: React.ReactNode; title: string; desc: string; onClick: () => void }> = ({ icon, title, desc, onClick }) => {
  const ORANGE = useAccent();
  return (
  <button onClick={onClick}
    className="w-full text-left rounded-2xl p-4 flex items-center gap-4 border transition hover:-translate-y-0.5 group"
    style={{ background: MODAL_BG, borderColor: `${ORANGE}44` }}>
    <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-lg" style={{ background: `${ORANGE}1a`, border: `1px solid ${ORANGE}33`, color: ORANGE_LIGHT }}>
      {icon}
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-white font-semibold text-[15px] tracking-[0.01em]" style={{ fontFamily: TITLE_FONT }}>{title}</p>
      <p className="text-[12px] leading-snug mt-0.5" style={{ color: `${OFF_WHITE}88` }}>{desc}</p>
    </div>
    <FaArrowRight size={13} className="shrink-0 transition group-hover:translate-x-0.5" style={{ color: ORANGE_LIGHT }} />
  </button>
);
};

// ── Pase de membresía (estilo referencia: "CONNEXO PASS") ─────────────────────
const MembershipPass: React.FC<{ clubName: string; onOpen: (id: string) => void }> = ({ clubName, onOpen }) => {
  const ORANGE = useAccent();
  const [id, setId] = useState('');
  return (
    <div className="rounded-2xl p-5 border" style={{ background: `linear-gradient(160deg, ${ORANGE}14, ${MODAL_BG})`, borderColor: `${ORANGE}44` }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[9px] font-semibold uppercase tracking-[0.3em]" style={{ color: ORANGE_LIGHT }}>Connexo Pass</span>
        <span className="text-[9px] font-semibold uppercase tracking-[0.2em] px-2.5 py-1 rounded-full" style={{ border: `1px solid ${ORANGE}55`, color: ORANGE_LIGHT }}>VIP</span>
      </div>
      <h3 className="text-white font-semibold text-lg tracking-[0.02em]" style={{ fontFamily: TITLE_FONT }}>Mi Membresía</h3>
      <p className="text-[12px] leading-relaxed mt-1" style={{ color: `${OFF_WHITE}99` }}>
        ¿Ya eres miembro del {clubName}? Ingresa tu código, email o teléfono para ver tu tarjeta y tus beneficios.
      </p>
      <form onSubmit={(e) => { e.preventDefault(); onOpen(id.trim()); }} className="mt-4 space-y-2.5">
        <input value={id} onChange={e => setId(e.target.value)} placeholder="Tu código, email o teléfono"
          className="w-full bg-black/30 border text-white text-sm rounded-xl px-4 py-3 focus:outline-none placeholder-white/30" style={{ borderColor: `${OFF_WHITE}1a` }} />
        <button type="submit"
          className="w-full py-3.5 rounded-xl text-[11px] font-semibold uppercase tracking-[0.2em] transition hover:brightness-110"
          style={{ background: ORANGE, color: BG_DARK, fontFamily: TITLE_FONT }}>
          Ver mi membresía
        </button>
      </form>
    </div>
  );
};

// ── Chip de filtro por estado ─────────────────────────────────────────────────
const FilterChip: React.FC<{ active: boolean; onClick: () => void; label: string; count: number; color: string }> = ({ active, onClick, label, count, color }) => (
  <button onClick={onClick}
    className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[10px] font-semibold uppercase tracking-[0.15em] transition border"
    style={active
      ? { background: color, color: '#160600', borderColor: color }
      : { background: 'transparent', color: `${OFF_WHITE}cc`, borderColor: `${OFF_WHITE}22` }}>
    <span className="w-1.5 h-1.5 rounded-full" style={{ background: active ? '#160600' : color }} />
    {label}
    <span className="text-[9px] font-semibold opacity-60">{count}</span>
  </button>
);

// ── Tarjeta de propiedad (grid 2 columnas) ────────────────────────────────────
const PropertyCard: React.FC<{ property: RealtyProperty; onClick: () => void }> = ({ property: p, onClick }) => {
  const st = STATUS_META[p.status] || STATUS_META.disponible;
  const f = p.features || {};
  const photoCount = Array.isArray(p.images) ? p.images.length : 0;
  return (
    <button onClick={onClick}
      className="group text-left rounded-2xl overflow-hidden border transition-all duration-300 hover:-translate-y-1"
      style={{ background: 'rgba(255,255,255,0.025)', borderColor: `${OFF_WHITE}12` }}>
      <div className="aspect-[4/3] relative overflow-hidden" style={{ background: '#0a0a12' }}>
        {p.images?.[0]
          ? <img src={p.images[0]} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
          : <div className="w-full h-full flex items-center justify-center"><FaBuilding className="text-3xl" style={{ color: `${OFF_WHITE}22` }} /></div>}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(10,3,0,0.85), transparent 60%)' }} />
        <span className="absolute top-2.5 left-2.5 text-[8px] font-semibold uppercase tracking-[0.15em] px-2 py-1 rounded-full backdrop-blur-sm"
          style={{ background: `${st.color}dd`, color: '#fff' }}>{st.label}</span>
        {photoCount > 1 && (
          <span className="absolute top-2.5 right-2.5 text-[9px] font-semibold px-1.5 py-1 rounded-md flex items-center gap-1 backdrop-blur-sm"
            style={{ background: 'rgba(0,0,0,0.45)', color: '#fff' }}><FaCamera size={8} /> {photoCount}</span>
        )}
        <p className="absolute bottom-2.5 left-3 right-3 text-[17px] font-semibold" style={{ color: '#fff', fontFamily: TITLE_FONT, textShadow: '0 1px 12px rgba(0,0,0,0.6)' }}>{fmtPrice(p.price)}</p>
      </div>
      <div className="p-3.5">
        <p className="cnx-product-text text-white font-medium text-[13px] truncate">{p.title}</p>
        {p.location && (
          <p className="text-[11px] truncate flex items-center gap-1 mt-1" style={{ color: `${OFF_WHITE}80` }}>
            <FaMapMarkerAlt size={9} style={{ color: ORANGE_LIGHT }} /> {p.location}
          </p>
        )}
        <div className="flex items-center gap-3 mt-2.5 pt-2.5 border-t text-[10px]" style={{ color: `${OFF_WHITE}66`, borderColor: `${OFF_WHITE}10` }}>
          {f.bedrooms != null && <span className="flex items-center gap-1"><FaBed size={10} /> {f.bedrooms}</span>}
          {f.bathrooms != null && <span className="flex items-center gap-1"><FaBath size={10} /> {f.bathrooms}</span>}
          {f.area_m2 != null && <span className="flex items-center gap-1"><FaRulerCombined size={10} /> {f.area_m2}m²</span>}
          {f.parking != null && <span className="flex items-center gap-1"><FaCar size={10} /> {f.parking}</span>}
        </div>
      </div>
    </button>
  );
};

// ── Tarjeta destacada (hero de la primera propiedad) ──────────────────────────
const FeaturedCard: React.FC<{ property: RealtyProperty; onClick: () => void; onVisit: () => void }> = ({ property: p, onClick, onVisit }) => {
  const ORANGE = useAccent();
  const st = STATUS_META[p.status] || STATUS_META.disponible;
  const f = p.features || {};
  const photoCount = Array.isArray(p.images) ? p.images.length : 0;
  return (
    <div className="rounded-3xl overflow-hidden border relative group" style={{ borderColor: `${ORANGE}33`, background: 'rgba(255,255,255,0.02)' }}>
      <button onClick={onClick} className="block w-full text-left">
        <div className="aspect-[16/10] relative overflow-hidden" style={{ background: '#0a0a12' }}>
          {p.images?.[0]
            ? <img src={p.images[0]} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-[900ms]" />
            : <div className="w-full h-full flex items-center justify-center"><FaBuilding className="text-5xl" style={{ color: `${OFF_WHITE}22` }} /></div>}
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(10,3,0,0.94) 6%, rgba(10,3,0,0.2) 55%, transparent)' }} />
          <div className="absolute top-3.5 left-3.5 flex items-center gap-2">
            <span className="text-[9px] font-semibold uppercase tracking-[0.2em] px-3 py-1.5 rounded-full flex items-center gap-1.5"
              style={{ background: ORANGE, color: '#fff', fontFamily: TITLE_FONT }}><FaRegStar size={9} /> Destacada</span>
            <span className="text-[9px] font-semibold uppercase tracking-[0.15em] px-2.5 py-1.5 rounded-full backdrop-blur-sm" style={{ background: `${st.color}dd`, color: '#fff' }}>{st.label}</span>
          </div>
          {photoCount > 1 && (
            <span className="absolute top-3.5 right-3.5 text-[10px] font-semibold px-2 py-1 rounded-md flex items-center gap-1 backdrop-blur-sm" style={{ background: 'rgba(0,0,0,0.45)', color: '#fff' }}><FaCamera size={9} /> {photoCount}</span>
          )}
          <div className="absolute bottom-0 inset-x-0 p-5">
            <h3 className="text-white font-semibold text-xl leading-tight tracking-[0.02em]" style={{ fontFamily: TITLE_FONT }}>{p.title}</h3>
            {p.location && (
              <p className="text-xs flex items-center gap-1.5 mt-1.5" style={{ color: `${OFF_WHITE}cc` }}>
                <FaMapMarkerAlt size={10} style={{ color: ORANGE_LIGHT }} /> {p.location}
              </p>
            )}
            <div className="flex items-end justify-between mt-3 gap-2">
              <p className="text-[26px] font-semibold leading-none" style={{ color: '#fff', fontFamily: TITLE_FONT }}>{fmtPrice(p.price)}</p>
              <div className="flex items-center gap-3.5 text-[11px] pb-1" style={{ color: `${OFF_WHITE}cc` }}>
                {f.bedrooms != null && <span className="flex items-center gap-1"><FaBed size={11} /> {f.bedrooms}</span>}
                {f.bathrooms != null && <span className="flex items-center gap-1"><FaBath size={11} /> {f.bathrooms}</span>}
                {f.area_m2 != null && <span className="flex items-center gap-1"><FaRulerCombined size={11} /> {f.area_m2}m²</span>}
              </div>
            </div>
          </div>
        </div>
      </button>
      <div className="grid grid-cols-2 gap-2.5 p-3.5">
        <button onClick={onClick}
          className="flex items-center justify-center gap-2 py-3 rounded-full text-[10px] font-semibold uppercase tracking-[0.18em] transition hover:brightness-110"
          style={{ background: ORANGE, color: '#fff', fontFamily: TITLE_FONT }}>
          Ver detalle <FaArrowRight size={10} />
        </button>
        <button onClick={onVisit}
          className="flex items-center justify-center gap-2 py-3 rounded-full text-[10px] font-semibold uppercase tracking-[0.18em] transition border hover:bg-white/[0.04]"
          style={{ borderColor: `${ORANGE}55`, color: OFF_WHITE, fontFamily: TITLE_FONT }}>
          <FaCalendarCheck size={10} /> Visita
        </button>
      </div>
    </div>
  );
};

// ── Modal: detalle de propiedad (galería completa con flechas + miniaturas) ───
const PropertyDetailModal: React.FC<{
  property: RealtyProperty;
  contactName: string;
  waHref: (t: string) => string | undefined;
  onClose: () => void;
  onQuote: () => void;
  onBuy: () => void;
  onVisit: () => void;
}> = ({ property: p, contactName, waHref, onClose, onQuote, onBuy, onVisit }) => {
  const ORANGE = useAccent();
  const st = STATUS_META[p.status] || STATUS_META.disponible;
  const f = p.features || {};
  const images = Array.isArray(p.images) && p.images.length ? p.images : [];
  const [img, setImg] = useState(0);
  const go = (dir: number) => setImg(i => (images.length ? (i + dir + images.length) % images.length : 0));
  const sold = p.status === 'vendido';

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl relative flex flex-col overflow-hidden border"
        style={{ background: MODAL_BG, borderColor: `${ORANGE}33`, maxHeight: '92svh', fontFamily: BODY_FONT }}
        onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 z-20 w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center">
          <FaTimes />
        </button>
        {/* Galería */}
        <div className="aspect-[16/10] relative shrink-0" style={{ background: '#0a0a12' }}>
          {images.length ? (
            <img src={images[img]} alt={`${p.title} ${img + 1}`} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center"><FaBuilding className="text-5xl" style={{ color: `${OFF_WHITE}22` }} /></div>
          )}
          <span className="absolute top-3 left-3 text-[9px] font-semibold uppercase tracking-[0.15em] px-2.5 py-1.5 rounded-full backdrop-blur-sm"
            style={{ background: `${st.color}dd`, color: '#fff' }}>{st.label}</span>
          {images.length > 1 && (
            <>
              <button onClick={() => go(-1)} className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/70 transition"><FaChevronLeft /></button>
              <button onClick={() => go(1)} className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/70 transition"><FaChevronRight /></button>
              <span className="absolute bottom-3 right-3 text-[10px] font-semibold px-2 py-1 rounded-md backdrop-blur-sm" style={{ background: 'rgba(0,0,0,0.45)', color: '#fff' }}>{img + 1} / {images.length}</span>
            </>
          )}
        </div>
        {/* Miniaturas */}
        {images.length > 1 && (
          <div className="flex gap-1.5 px-4 pt-3 overflow-x-auto shrink-0">
            {images.map((src, i) => (
              <button key={i} onClick={() => setImg(i)}
                className="w-14 h-14 rounded-lg overflow-hidden shrink-0 border-2 transition"
                style={{ borderColor: i === img ? ORANGE : 'transparent', opacity: i === img ? 1 : 0.6 }}>
                <img src={src} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
        <div className="p-6 overflow-y-auto">
          <h3 className="text-xl font-semibold text-white tracking-[0.02em]" style={{ fontFamily: TITLE_FONT }}>{p.title}</h3>
          {p.location && (
            <p className="text-sm mt-1.5 flex items-center gap-1.5" style={{ color: `${OFF_WHITE}99` }}>
              <FaMapMarkerAlt size={12} style={{ color: ORANGE_LIGHT }} /> {p.location}
            </p>
          )}
          <p className="text-[26px] font-semibold mt-2.5" style={{ color: '#fff', fontFamily: TITLE_FONT }}>{fmtPrice(p.price)}</p>
          <div className="mt-3 h-px w-full" style={{ background: `${OFF_WHITE}12` }} />

          {(f.bedrooms != null || f.bathrooms != null || f.area_m2 != null || f.parking != null) && (
            <div className="grid grid-cols-4 gap-2 mt-4">
              {[
                { on: f.area_m2 != null, icon: <FaRulerCombined />, val: `${f.area_m2}m²`, label: 'Área' },
                { on: f.bedrooms != null, icon: <FaBed />, val: f.bedrooms, label: 'Hab.' },
                { on: f.bathrooms != null, icon: <FaBath />, val: f.bathrooms, label: 'Baños' },
                { on: f.parking != null, icon: <FaCar />, val: f.parking, label: 'Parq.' },
              ].filter(x => x.on).map((x, i) => (
                <div key={i} className="rounded-xl p-2.5 text-center border" style={{ background: 'rgba(255,255,255,0.025)', borderColor: `${OFF_WHITE}12` }}>
                  <div className="flex justify-center text-base" style={{ color: ORANGE_LIGHT }}>{x.icon}</div>
                  <p className="text-white font-semibold text-sm mt-1.5" style={{ fontFamily: TITLE_FONT }}>{x.val as any}</p>
                  <p className="text-[9px] uppercase tracking-[0.15em] mt-0.5" style={{ color: `${OFF_WHITE}55` }}>{x.label}</p>
                </div>
              ))}
            </div>
          )}

          {p.description && (
            <p className="text-[13px] mt-4 whitespace-pre-wrap leading-relaxed" style={{ color: `${OFF_WHITE}99` }}>{p.description}</p>
          )}

          <div className="grid grid-cols-2 gap-2.5 mt-5">
            <button onClick={onQuote}
              className="flex items-center justify-center gap-2 py-3 rounded-full text-[10px] font-semibold uppercase tracking-[0.18em] transition hover:bg-white/[0.04] border"
              style={{ borderColor: `${ORANGE}55`, color: OFF_WHITE, fontFamily: TITLE_FONT }}>
              <FaFileInvoiceDollar size={12} /> Cotizar
            </button>
            <button onClick={onVisit}
              className="flex items-center justify-center gap-2 py-3 rounded-full text-[10px] font-semibold uppercase tracking-[0.18em] transition hover:bg-white/[0.04] border"
              style={{ borderColor: `${ORANGE}55`, color: OFF_WHITE, fontFamily: TITLE_FONT }}>
              <FaCalendarCheck size={12} /> Agendar visita
            </button>
          </div>
          {!sold && (
            <button onClick={onBuy}
              className="mt-2.5 w-full flex items-center justify-center gap-2 py-3.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.18em] transition hover:brightness-110"
              style={{ background: ORANGE, color: '#fff', fontFamily: TITLE_FONT, boxShadow: `0 10px 30px -12px ${ORANGE}` }}>
              <FaKey size={12} /> Reservar / Comprar
            </button>
          )}
          {waHref(`Hola ${contactName}, me interesa la propiedad "${p.title}" (${fmtPrice(p.price)}).`) && (
            <a href={waHref(`Hola ${contactName}, me interesa la propiedad "${p.title}" (${fmtPrice(p.price)}).`)} target="_blank" rel="noopener noreferrer"
              className="mt-2.5 w-full flex items-center justify-center gap-2 py-3 rounded-full text-[13px] font-medium border text-[#25D366] border-[#25D366]/30 hover:bg-[#25D366]/10 transition">
              <FaWhatsapp /> Consultar por WhatsApp
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Utilidades de estilo compartidas para modales ────────────────────────────
const inputCls = "w-full bg-black/40 border text-white text-sm rounded-xl px-4 py-3 focus:outline-none placeholder-white/30";
const inputStyle = (accent: string) => ({ borderColor: `${accent}33` } as React.CSSProperties);
const ModalShell: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; z?: number }> = ({ title, onClose, children, z = 10000 }) => {
  const ORANGE = useAccent();
  return (
  <div className="fixed inset-0 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-sm" style={{ zIndex: z }} onClick={onClose}>
    <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border p-6 space-y-3"
      style={{ background: MODAL_BG, borderColor: `${ORANGE}33`, maxHeight: '92svh', overflowY: 'auto', fontFamily: BODY_FONT }}
      onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white tracking-[0.02em]" style={{ fontFamily: TITLE_FONT }}>{title}</h3>
        <button onClick={onClose} className="text-white/40 hover:text-white"><FaTimes /></button>
      </div>
      {children}
    </div>
  </div>
);
};

// ── Modal: proceso (cotización / visita / compra) con sugerencia de propiedades ─
const RequestModal: React.FC<{
  userId?: string | null;
  mode: RealtyRequestType;
  property?: RealtyProperty | null;
  properties: RealtyProperty[];
  agentUsername?: string | null;
  campaign?: string | null;
  isMobilePreview?: boolean;
  onTrack: (code: string) => void;
  onClose: () => void;
}> = ({ userId, mode, property, properties, agentUsername, campaign, isMobilePreview, onTrack, onClose }) => {
  const ORANGE = useAccent();
  const [memberCode, setMemberCode] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [budget, setBudget] = useState('');
  const [payment, setPayment] = useState<RealtyPaymentMethod | ''>('');
  const [preferredDate, setPreferredDate] = useState('');
  const [propertyId, setPropertyId] = useState<string | null>(property?.id || null);
  const [lookingUp, setLookingUp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const title = mode === 'cotizacion' ? 'Cotizar' : mode === 'visita' ? 'Agendar cita' : 'Reservar / Comprar';

  // Autocompletado por código de miembro.
  const lookupMember = async () => {
    if (!userId || !memberCode.trim()) return;
    setLookingUp(true);
    try {
      const { data } = await supabase.rpc('get_realty_member', { p_agency_id: userId, p_identifier: memberCode.trim() });
      if (data?.found) {
        if (!name && data.name) setName(data.name);
        if (!phone && data.phone) setPhone(data.phone);
        if (!email && data.email) setEmail(data.email);
      } else setError('No encontramos esa membresía.');
    } catch { /* noop */ } finally { setLookingUp(false); }
  };

  // Sugerencia de propiedades dentro del rango de presupuesto (solo cotización).
  const suggestions = useMemo(() => {
    if (mode !== 'cotizacion' || !budget) return [];
    const range = BUDGET_RANGES.find(b => b.label === budget);
    if (!range) return [];
    return properties
      .filter(p => p.status !== 'vendido' && typeof p.price === 'number' && (p.price as number) >= range.min && (p.price as number) <= range.max)
      .slice(0, 6);
  }, [mode, budget, properties]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isMobilePreview) return;
    if (!name.trim()) { setError('Escribe tu nombre.'); return; }
    if (!phone.trim() && !email.trim()) { setError('Déjanos tu teléfono o email.'); return; }
    if (mode === 'cotizacion' && !payment) { setError('Selecciona tu método de pago.'); return; }
    if (mode === 'visita' && !preferredDate) { setError('Elige la fecha de la visita.'); return; }
    if (!userId) { setError('No se pudo identificar la agencia.'); return; }
    setError(null);
    setSubmitting(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('place_realty_request', {
        p_agency_id: userId,
        p_request_type: mode,
        p_client_name: name.trim(),
        p_client_phone: phone.trim() || null,
        p_client_email: email.trim() || null,
        p_budget_range: budget || null,
        p_payment_method: payment || null,
        p_property_id: propertyId,
        p_preferred_date: preferredDate || null,
        p_agent_username: agentUsername || null,
        p_member_code: memberCode.trim() || null,
        p_source_campaign: campaign || null,
      });
      if (rpcError) throw rpcError;
      setResult(data?.tracking_code || '');
    } catch (err: any) {
      setError(err?.message || 'No se pudo completar el registro.');
    } finally { setSubmitting(false); }
  };

  const selectedProp = properties.find(p => p.id === propertyId) || property || null;

  return (
    <ModalShell title={result ? '¡Listo!' : title} onClose={onClose}>
      {result ? (
        <div className="py-4 text-center">
          <FaClipboardCheck className="mx-auto text-4xl mb-3" style={{ color: ORANGE_LIGHT }} />
          <p className="text-white font-bold">Tu {REQUEST_LABEL[mode].toLowerCase()} fue registrada.</p>
          <p className="text-sm mt-2" style={{ color: `${OFF_WHITE}88` }}>Guarda tu código de rastreo:</p>
          <div className="my-3 mx-auto inline-block px-6 py-3 rounded-xl border font-mono text-2xl font-black tracking-[0.3em]"
            style={{ background: 'rgba(255,255,255,0.04)', borderColor: `${ORANGE}44`, color: ORANGE_LIGHT }}>
            {result}
          </div>
          <button onClick={() => onTrack(result)}
            className="mt-2 w-full py-3.5 rounded-xl text-sm font-black uppercase tracking-wider transition hover:brightness-110 italic"
            style={{ background: ORANGE, color: '#fff', fontFamily: TITLE_FONT }}>
            Rastrear mi proceso
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          {selectedProp && (
            <div className="rounded-xl p-3 border text-sm" style={{ background: 'rgba(255,255,255,0.03)', borderColor: `${ORANGE}22`, color: `${OFF_WHITE}cc` }}>
              <span style={{ color: ORANGE_LIGHT }} className="font-bold">Propiedad:</span> {selectedProp.title} · {fmtPrice(selectedProp.price)}
            </div>
          )}

          {/* Código de miembro */}
          <div className="flex gap-2">
            <input value={memberCode} onChange={e => setMemberCode(e.target.value)} placeholder="¿Ya eres miembro? Código (R-XXXX)"
              className={inputCls} style={inputStyle(ORANGE)} />
            <button type="button" onClick={lookupMember} disabled={lookingUp || !memberCode.trim()}
              className="shrink-0 px-4 rounded-xl text-xs font-bold uppercase border disabled:opacity-40"
              style={{ borderColor: `${ORANGE}44`, color: ORANGE_LIGHT }}>
              {lookingUp ? '…' : 'Autocompletar'}
            </button>
          </div>

          <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre completo" className={inputCls} style={inputStyle(ORANGE)} />
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Teléfono / WhatsApp" className={inputCls} style={inputStyle(ORANGE)} />
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email (opcional)" className={inputCls} style={inputStyle(ORANGE)} />

          {mode === 'visita' && (
            <div>
              <p className="text-[11px] uppercase tracking-widest font-bold mb-1.5" style={{ color: ORANGE_LIGHT }}>Fecha de la visita *</p>
              <input value={preferredDate} onChange={e => setPreferredDate(e.target.value)} type="date"
                min={new Date().toISOString().slice(0, 10)} className={inputCls} style={inputStyle(ORANGE)} />
            </div>
          )}

          {(mode === 'cotizacion' || mode === 'compra') && (
            <div>
              <p className="text-[11px] uppercase tracking-widest font-bold mb-2" style={{ color: ORANGE_LIGHT }}>Método de pago {mode === 'cotizacion' ? '*' : ''}</p>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_METHODS.map(m => (
                  <button key={m} type="button" onClick={() => setPayment(m)}
                    className="rounded-xl px-2 py-2.5 text-xs font-bold border transition text-center"
                    style={payment === m
                      ? { background: ORANGE, color: '#fff', borderColor: ORANGE }
                      : { background: 'rgba(255,255,255,0.04)', color: OFF_WHITE, borderColor: `${ORANGE}33` }}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode === 'cotizacion' && (
            <select value={budget} onChange={e => setBudget(e.target.value)} className={inputCls} style={inputStyle(ORANGE)}>
              <option value="">Presupuesto</option>
              {BUDGET_RANGES.map(b => <option key={b.label} value={b.label}>{b.label}</option>)}
            </select>
          )}

          {/* Sugerencias automáticas por rango de presupuesto */}
          {suggestions.length > 0 && (
            <div className="rounded-xl p-3 border space-y-2" style={{ background: `${ORANGE}0f`, borderColor: `${ORANGE}33` }}>
              <p className="text-[11px] font-bold flex items-center gap-1.5" style={{ color: ORANGE_LIGHT }}>
                <FaBuilding size={10} /> Propiedades en tu rango — toca para adjuntar
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {suggestions.map(s => {
                  const active = propertyId === s.id;
                  return (
                    <button key={s.id} type="button" onClick={() => setPropertyId(active ? null : s.id)}
                      className="shrink-0 w-32 text-left rounded-lg overflow-hidden border transition"
                      style={{ borderColor: active ? ORANGE : `${ORANGE}22`, background: 'rgba(0,0,0,0.3)' }}>
                      <div className="h-16 bg-black/40">
                        {s.images?.[0] ? <img src={s.images[0]} alt={s.title} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><FaBuilding style={{ color: `${OFF_WHITE}22` }} /></div>}
                      </div>
                      <div className="p-1.5">
                        <p className="text-white text-[11px] font-bold truncate">{s.title}</p>
                        <p className="text-[10px] font-black italic" style={{ color: ORANGE_LIGHT }}>{fmtPrice(s.price)}</p>
                      </div>
                      {active && <div className="text-center text-[9px] font-black py-0.5" style={{ background: ORANGE, color: '#fff' }}>✓ ADJUNTA</div>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button type="submit" disabled={submitting}
            className="w-full py-3.5 rounded-xl text-sm font-black uppercase tracking-wider transition hover:brightness-110 disabled:opacity-50 italic"
            style={{ background: ORANGE, color: '#fff', fontFamily: TITLE_FONT }}>
            {submitting ? 'Enviando…' : mode === 'visita' ? 'Solicitar cita' : mode === 'compra' ? 'Reservar ahora' : 'Solicitar cotización'}
          </button>
        </form>
      )}
    </ModalShell>
  );
};

// ── Modal: unirse al Club ─────────────────────────────────────────────────────
const ClubModal: React.FC<{ userId?: string | null; clubName: string; clubTagline: string; isMobilePreview?: boolean; onClose: () => void }> = ({ userId, clubName, clubTagline, isMobilePreview, onClose }) => {
  const ORANGE = useAccent();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isMobilePreview) return;
    if (!name.trim()) { setError('Escribe tu nombre.'); return; }
    if (!email.trim() && !phone.trim()) { setError('Déjanos tu email o teléfono.'); return; }
    if (!userId) { setError('No se pudo identificar la agencia.'); return; }
    setError(null); setSubmitting(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('join_realty_club', {
        p_agency_id: userId, p_name: name.trim(), p_email: email.trim() || null, p_phone: phone.trim() || null,
      });
      if (rpcError) throw rpcError;
      setCode(data?.member_code || '');
    } catch (err: any) { setError(err?.message || 'No se pudo completar el registro.'); }
    finally { setSubmitting(false); }
  };

  return (
    <ModalShell title={code ? '¡Bienvenido al club!' : clubName} onClose={onClose}>
      {code ? (
        <div className="py-4 text-center">
          <FaCrown className="mx-auto text-4xl mb-3" style={{ color: ORANGE_LIGHT }} />
          <p className="text-white font-bold">Tu tarjeta de miembro:</p>
          <div className="my-3 mx-auto inline-block px-6 py-3 rounded-xl border font-mono text-2xl font-black tracking-[0.25em]"
            style={{ background: 'rgba(255,255,255,0.04)', borderColor: `${ORANGE}44`, color: ORANGE_LIGHT }}>{code}</div>
          <p className="text-sm mt-1" style={{ color: `${OFF_WHITE}88` }}>Guárdalo: úsalo al cotizar o consultar tu membresía.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <p className="text-sm" style={{ color: `${OFF_WHITE}99` }}>{clubTagline}</p>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Tu nombre" className={inputCls} style={inputStyle(ORANGE)} />
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email" className={inputCls} style={inputStyle(ORANGE)} />
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Teléfono / WhatsApp" className={inputCls} style={inputStyle(ORANGE)} />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button type="submit" disabled={submitting}
            className="w-full py-3.5 rounded-xl text-sm font-black uppercase tracking-wider transition hover:brightness-110 disabled:opacity-50 italic"
            style={{ background: ORANGE, color: '#fff', fontFamily: TITLE_FONT }}>
            {submitting ? 'Uniéndote…' : 'Quiero unirme'}
          </button>
        </form>
      )}
    </ModalShell>
  );
};

// ── Modal: ver mi membresía ───────────────────────────────────────────────────
const MembershipModal: React.FC<{ userId?: string | null; clubName: string; initialId?: string; onClose: () => void }> = ({ userId, clubName, initialId = '', onClose }) => {
  const ORANGE = useAccent();
  const [id, setId] = useState(initialId);
  const [loading, setLoading] = useState(false);
  const [member, setMember] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runLookup = useCallback(async (value: string) => {
    if (!userId || !value.trim()) return;
    setError(null); setLoading(true); setMember(null);
    try {
      const { data } = await supabase.rpc('get_realty_member', { p_agency_id: userId, p_identifier: value.trim() });
      if (data?.found) setMember(data);
      else setError('No encontramos tu membresía. Verifica el código, email o teléfono.');
    } catch (err: any) { setError(err?.message || 'Error al consultar.'); }
    finally { setLoading(false); }
  }, [userId]);

  // Auto-consulta si llega con un identificador desde el pase.
  useEffect(() => { if (initialId.trim()) runLookup(initialId); /* eslint-disable-next-line */ }, []);

  const lookup = (e: React.FormEvent) => { e.preventDefault(); runLookup(id); };

  return (
    <ModalShell title="Mi membresía" onClose={onClose}>
      {member ? (
        <div className="space-y-3">
          <div className="rounded-2xl p-5 border text-center" style={{ background: `linear-gradient(160deg, ${ORANGE}22, rgba(255,255,255,0.03))`, borderColor: `${ORANGE}44` }}>
            <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: ORANGE_LIGHT }}>{clubName}</p>
            <p className="text-white font-bold text-lg mt-1">{member.name || 'Miembro'}</p>
            <div className="my-2 inline-block px-4 py-2 rounded-lg font-mono text-xl font-black tracking-[0.2em]" style={{ background: 'rgba(0,0,0,0.3)', color: ORANGE_LIGHT }}>{member.member_code}</div>
            <div className="mt-3 text-left"><MemberPlanBadge ownerId={userId} identifier={member.member_code} system="realty" accent={ORANGE_LIGHT} /></div>
            <div className="flex items-center justify-center gap-4 mt-2 text-sm">
              {member.is_vip && <span className="flex items-center gap-1 font-bold" style={{ color: ORANGE_LIGHT }}><FaCrown size={12} /> VIP</span>}
              {member.discount_percent > 0 && <span className="text-white font-bold">{member.discount_percent}% dcto.</span>}
              <span style={{ color: `${OFF_WHITE}88` }}>{member.visits || 0} interacciones</span>
            </div>
          </div>
          {member.benefits && (
            <div className="rounded-xl p-3 border text-sm" style={{ background: `${ORANGE}0f`, borderColor: `${ORANGE}33`, color: `${OFF_WHITE}dd` }}>
              <span className="font-bold flex items-center gap-1.5" style={{ color: ORANGE_LIGHT }}><FaGift size={11} /> Tus beneficios</span>
              <p className="mt-1 whitespace-pre-wrap">{member.benefits}</p>
            </div>
          )}
          <button onClick={() => { setMember(null); setId(''); }} className="w-full py-3 rounded-xl text-sm font-bold border transition" style={{ borderColor: `${ORANGE}44`, color: OFF_WHITE }}>Consultar otra</button>
        </div>
      ) : (
        <form onSubmit={lookup} className="space-y-3">
          <p className="text-sm" style={{ color: `${OFF_WHITE}99` }}>Ingresa tu código de miembro, email o teléfono.</p>
          <input value={id} onChange={e => setId(e.target.value)} placeholder="R-XXXX / email / teléfono" className={inputCls} style={inputStyle(ORANGE)} />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full py-3.5 rounded-xl text-sm font-black uppercase tracking-wider transition hover:brightness-110 disabled:opacity-50 italic"
            style={{ background: ORANGE, color: '#fff', fontFamily: TITLE_FONT }}>
            {loading ? 'Buscando…' : 'Consultar'}
          </button>
        </form>
      )}
    </ModalShell>
  );
};

// ── Modal: rastreador de proceso en tiempo real ───────────────────────────────
const TrackerModal: React.FC<{ userId?: string | null; initialCode?: string; onClose: () => void }> = ({ userId, initialCode = '', onClose }) => {
  const ORANGE = useAccent();
  const [code, setCode] = useState(initialCode);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<any>(null);

  const check = useCallback(async (silent = false) => {
    if (!userId || !code.trim()) return;
    if (!silent) { setError(null); setLoading(true); }
    try {
      const { data } = await supabase.rpc('get_realty_request_status', { p_agency_id: userId, p_code: code.trim() });
      if (data?.found) setStatus(data);
      else { setStatus(null); if (!silent) setError('No encontramos ese código.'); }
    } catch (err: any) { if (!silent) setError(err?.message || 'Error al consultar.'); }
    finally { if (!silent) setLoading(false); }
  }, [userId, code]);

  // Polling en vivo cada 6s cuando ya hay un proceso cargado.
  useEffect(() => {
    if (!status) return;
    pollRef.current = setInterval(() => check(true), 6000);
    return () => clearInterval(pollRef.current);
  }, [status, check]);

  // Auto-consulta si viene por deep-link.
  useEffect(() => { if (initialCode) check(); /* eslint-disable-next-line */ }, []);

  const stepIndex = status ? TRACK_STEPS.indexOf(status.status) : -1;
  const cancelled = status?.status === 'cancelado';

  return (
    <ModalShell title="Rastrear proceso" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); check(); }} className="flex gap-2">
        <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Código (ej. A1B2C3)"
          className={inputCls} style={inputStyle(ORANGE)} />
        <button type="submit" disabled={loading || !code.trim()}
          className="shrink-0 px-5 rounded-xl text-sm font-black uppercase italic disabled:opacity-40"
          style={{ background: ORANGE, color: '#fff', fontFamily: TITLE_FONT }}>
          {loading ? '…' : 'Ver'}
        </button>
      </form>
      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}

      {status && (
        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-bold" style={{ color: ORANGE_LIGHT }}>{REQUEST_LABEL[status.request_type] || 'Proceso'}</span>
            <span className="font-mono text-xs" style={{ color: `${OFF_WHITE}88` }}>{status.code}</span>
          </div>
          {status.property_title && (
            <p className="text-sm" style={{ color: `${OFF_WHITE}cc` }}><span style={{ color: ORANGE_LIGHT }} className="font-bold">Propiedad:</span> {status.property_title}</p>
          )}

          {cancelled ? (
            <div className="rounded-xl p-4 text-center border" style={{ background: 'rgba(248,113,113,0.1)', borderColor: 'rgba(248,113,113,0.3)', color: '#f87171' }}>
              Este proceso fue cancelado.
            </div>
          ) : (
            <div className="space-y-2.5">
              {TRACK_STEPS.map((s, i) => {
                const done = i <= stepIndex;
                const current = i === stepIndex;
                return (
                  <div key={s} className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0 transition"
                      style={done ? { background: ORANGE, color: '#fff' } : { background: 'rgba(255,255,255,0.06)', color: `${OFF_WHITE}55` }}>
                      {done ? <FaCheckCircle size={12} /> : i + 1}
                    </div>
                    <span className="text-sm font-bold" style={{ color: current ? '#fff' : done ? OFF_WHITE : `${OFF_WHITE}55` }}>
                      {TRACK_LABEL[s]}{current && <span className="ml-2 text-[10px] font-black uppercase animate-pulse" style={{ color: ORANGE_LIGHT }}>● En vivo</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {status.admin_note && (
            <div className="rounded-xl p-3 border text-sm" style={{ background: `${ORANGE}0f`, borderColor: `${ORANGE}33`, color: `${OFF_WHITE}dd` }}>
              <span className="font-bold" style={{ color: ORANGE_LIGHT }}>Mensaje de tu asesor{status.agent_name ? ` (${status.agent_name})` : ''}:</span>
              <p className="mt-1 whitespace-pre-wrap">{status.admin_note}</p>
            </div>
          )}
          {status.preferred_date && (
            <p className="text-xs" style={{ color: `${OFF_WHITE}77` }}>📅 Fecha solicitada: {status.preferred_date}</p>
          )}
        </div>
      )}
    </ModalShell>
  );
};

export default ProfileRealtyTemplate;
