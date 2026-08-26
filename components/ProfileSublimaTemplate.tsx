import { profileStyleLayer } from '../src/lib/profileStyleLayer';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { MemberPlanBadge } from './MemberPlanCard';
import { supabase } from '../src/lib/supabase';
import { ProfileExtraSections } from './ProfileExtraSections';
import FullCatalogView from './FullCatalogView';
import type { Profile, UserLink, SublimaProduct, SublimaRequestType, SublimaOrderItem } from '../types';
import {
  FaInstagram, FaFacebookF, FaTiktok, FaTwitter, FaYoutube, FaLinkedinIn,
  FaGlobe, FaWhatsapp, FaShareAlt, FaQrcode, FaMapMarkerAlt, FaCheckCircle,
  FaTimes, FaChevronLeft, FaChevronRight, FaCrown, FaSearch, FaArrowRight,
  FaCamera, FaPhoneAlt, FaRegAddressCard, FaLink, FaTshirt, FaShieldAlt,
  FaGift, FaClipboardCheck, FaFileInvoiceDollar, FaBoxOpen, FaPlus, FaMinus,
  FaTags, FaIndustry, FaSearchLocation, FaTrash, FaRegStar,
} from 'react-icons/fa';

// ── Identidad visual: alineada a la plantilla realty (champagne gold / espresso)
// El DISEÑO (paleta, tipografías, estructura y orden de secciones/botones) sigue
// a ProfileRealtyTemplate. Las FUNCIONES son 100% independientes (motor sublima_*).
const ACCENT_BASE = '#c9a86a';   // acento por defecto (champagne gold)

/**
 * El acento deja de ser una constante fija para poder elegirse desde
 * Apariencia. Va por contexto porque lo usan varios subcomponentes de módulo:
 * cada uno hace `const ACCENT = useAccent()` y así **todas** sus referencias
 * existentes (incluidas las interpoladas del tipo `${ACCENT}22`) siguen
 * funcionando sin tocarlas. Sin valor del cliente, se usa el oro de la marca.
 */
const AccentContext = React.createContext<string>(ACCENT_BASE);
const useAccent = () => React.useContext(AccentContext);
const ACCENT_LIGHT = '#e6cf9c';  // acento claro
const ACCENT_DARK = '#9a7b45';   // acento profundo
const BG_DARK = '#141210';       // fondo espresso / carbón cálido
const OFF_WHITE = '#f2ece1';     // marfil (texto)
const MODAL_BG = '#1b1712';      // superficie de modales/paneles
const ON_ACCENT_BASE = '#141210'; // texto sobre el acento (espresso, como realty)
// Igual que el acento: elegible desde Apariencia y repartido por contexto,
// para no reescribir las 12 referencias existentes.
const OnAccentContext = React.createContext<string>(ON_ACCENT_BASE);
const useOnAccent = () => React.useContext(OnAccentContext);
const TITLE_FONT = "'Tomorrow', sans-serif";
const BODY_FONT = "'Space Grotesk', sans-serif";

// Técnicas de personalización disponibles en el cotizador.
const TECHNIQUES = ['Sublimado', 'Bordado', 'Estampado', 'DTF', 'Mixto'];

// Pipeline de rastreo del pedido mayorista.
const TRACK_STEPS = ['recibido', 'cotizado', 'en_produccion', 'listo', 'entregado'];
const TRACK_LABEL: Record<string, string> = {
  recibido: 'Recibido', cotizado: 'Cotizado', en_produccion: 'En producción',
  listo: 'Listo para entrega', entregado: 'Entregado', cancelado: 'Cancelado',
};
const REQUEST_LABEL: Record<string, string> = { mayorista: 'Pedido mayorista', muestra: 'Solicitud de muestra' };
const PAYMENT_META: Record<string, { label: string; color: string }> = {
  pendiente: { label: 'Pago pendiente', color: '#f87171' },
  anticipo:  { label: 'Anticipo recibido', color: '#fbbf24' },
  pagado:    { label: 'Pagado', color: '#4ade80' },
};

const isOn = (profile: any, k: string) => profile?.sectionVisibility?.[k] !== false;
const fmtMoney = (p?: number | null) =>
  typeof p === 'number' && !Number.isNaN(p) ? `$${p.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Consultar';

// Precio unitario según cantidad: usa el tier de mayor min_qty que la cantidad alcance;
// si no alcanza ninguno, cae al base_price.
export const unitPriceFor = (product: SublimaProduct, qty: number): number | null => {
  const tiers = Array.isArray(product.price_tiers) ? [...product.price_tiers] : [];
  tiers.sort((a, b) => (b.min_qty || 0) - (a.min_qty || 0));
  for (const t of tiers) {
    if (qty >= (t.min_qty || 0) && typeof t.unit_price === 'number') return t.unit_price;
  }
  return typeof product.base_price === 'number' ? product.base_price : null;
};

interface ProfileSublimaTemplateProps {
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

export const ProfileSublimaTemplate: React.FC<ProfileSublimaTemplateProps> = ({
  profile, links, onLinkClick, isMobilePreview = false, userId, handleShare, setShowQRModal,
  downloadVCard, isVCardLoading,
}) => {
  // Acento elegible desde Apariencia; sin elección, el oro de la plantilla.
  // Se reparte a los subcomponentes por contexto (ver AccentContext arriba).
  const ACCENT = profile?.buttonColor || ACCENT_BASE;
  const ON_ACCENT = profile?.buttonTextColor || ON_ACCENT_BASE;
  const clubName = profile?.clubName?.trim() || 'Club Mayorista';
  const clubTagline = profile?.clubTagline?.trim() || 'Descuentos por volumen, prioridad en producción y beneficios exclusivos para clientes frecuentes.';

  const [products, setProducts] = useState<SublimaProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [selected, setSelected] = useState<SublimaProduct | null>(null);

  // Modales de flujo
  const [quoteMode, setQuoteMode] = useState<SublimaRequestType | null>(null);
  const [quoteInitial, setQuoteInitial] = useState<SublimaOrderItem[]>([]);
  const [clubOpen, setClubOpen] = useState(false);
  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupInitial, setLookupInitial] = useState('');
  const [trackerOpen, setTrackerOpen] = useState(false);
  const [trackerCode, setTrackerCode] = useState('');

  // Filtros del catálogo
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  // Vista de catálogo a página completa ("Ver todo")
  const [showFullCatalog, setShowFullCatalog] = useState(false);

  // ?campaign= y deep-link ?pedido=CODIGO
  const { campaign, deepCode } = useMemo(() => {
    if (typeof window === 'undefined') return { campaign: null as string | null, deepCode: null as string | null };
    const params = new URLSearchParams(window.location.search);
    return { campaign: params.get('campaign'), deepCode: params.get('pedido') };
  }, []);

  useEffect(() => {
    if (deepCode) { setTrackerCode(deepCode); setTrackerOpen(true); }
  }, [deepCode]);

  const contactName = profile?.displayName || 'el taller';
  const contactWhatsapp = (profile?.whatsapp || '').replace(/\D/g, '');
  const waHref = (text: string) =>
    contactWhatsapp ? `https://wa.me/${contactWhatsapp}?text=${encodeURIComponent(text)}` : undefined;

  const fetchProducts = useCallback(async () => {
    if (!userId) { setLoadingProducts(false); return; }
    try {
      const { data, error } = await supabase
        .from('sublima_products').select('*').eq('factory_profile_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setProducts((data ?? []) as SublimaProduct[]);
    } catch (err: any) {
      console.error('Sublima products fetch error:', err?.message ?? err);
    } finally { setLoadingProducts(false); }
  }, [userId]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const openQuote = (mode: SublimaRequestType, initial?: SublimaOrderItem[]) => {
    setQuoteInitial(initial || []);
    setQuoteMode(mode);
  };

  // Botón cuadrado de contacto.
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

  // Categorías presentes con conteo.
  const categoryChips = useMemo(() => {
    const c: Record<string, number> = {};
    products.forEach(p => { const k = (p.category || 'Otros').trim() || 'Otros'; c[k] = (c[k] || 0) + 1; });
    return Object.entries(c).map(([label, count]) => ({ label, count }));
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter(p => {
      const cat = (p.category || 'Otros').trim() || 'Otros';
      if (categoryFilter !== 'all' && cat !== categoryFilter) return false;
      if (q && !(`${p.name} ${p.category || ''} ${p.description || ''}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [products, categoryFilter, searchQuery]);

  // Catálogo tipo realty: primer producto Destacado + resto en grid 2-col.
  const featuredProduct = filteredProducts[0] || null;
  const restProducts = filteredProducts.slice(1);

  // Ítems para la vista de catálogo a página completa (todo el catálogo).
  const catalogItems = useMemo(
    () => products.map((p) => {
      const tiers = Array.isArray(p.price_tiers) ? p.price_tiers : [];
      const bestTier = tiers.length ? Math.min(...tiers.map(t => t.unit_price ?? Infinity)) : null;
      const fromPrice = bestTier != null && bestTier !== Infinity ? bestTier : (typeof p.base_price === 'number' ? p.base_price : null);
      return {
        id: String(p.id),
        name: p.name,
        price: fromPrice != null ? `${fmtMoney(fromPrice)} c/u` : 'Consultar',
        image: p.images?.[0],
        category: p.category,
        description: p.description,
        disabled: !p.is_available,
        badge: (p.is_available && p.min_qty > 1) ? `Mín. ${p.min_qty}` : undefined,
        raw: p,
      };
    }),
    [products],
  );

  const quoteProduct = (p: SublimaProduct) => {
    const q = Math.max(1, p.min_qty || 1);
    openQuote('mayorista', [{ product_id: p.id, name: p.name, qty: q, unit_price: unitPriceFor(p, q) }]);
  };

  const SectionHeading: React.FC<{ children: React.ReactNode; kicker?: string }> = ({ children, kicker }) => (
    <div className="text-center mb-7">
      {kicker && (
        <p className="text-[10px] font-semibold uppercase tracking-[0.4em] mb-2" style={{ color: ACCENT_LIGHT }}>{kicker}</p>
      )}
      <h2 className="text-xl font-semibold tracking-[0.12em] uppercase" style={{ color: '#fff', fontFamily: TITLE_FONT }}>
        {children}
      </h2>
      <div className="mx-auto mt-3 h-px w-12" style={{ background: `linear-gradient(90deg, transparent, ${ACCENT}, transparent)` }} />
    </div>
  );

  return (
    <AccentContext.Provider value={ACCENT}>
    <OnAccentContext.Provider value={ON_ACCENT}>
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
            style={{ background: `radial-gradient(120% 55% at 50% -5%, ${ACCENT}10, transparent 55%)` }} />
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
            <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${ACCENT_DARK}55, ${BG_DARK})` }} />
          )}
          <div className="absolute inset-0" style={{ background: `linear-gradient(to top, ${profile?.backgroundColor || BG_DARK} 3%, transparent 68%)` }} />
        </div>

        <div className="px-4 -mt-16 relative space-y-9">
          {/* ── IDENTIDAD ── */}
          <header className="text-center">
            <div className="inline-block rounded-[22px] p-1.5 mb-4" style={{ background: MODAL_BG, border: `1px solid ${ACCENT}44`, boxShadow: '0 16px 44px -14px rgba(0,0,0,0.75)' }}>
              <img src={profile?.logoURL || profile?.profilePhotoURL || 'https://via.placeholder.com/150'}
                alt={profile?.displayName} className="w-24 h-24 rounded-2xl object-cover" />
            </div>
            <h1 className="text-[26px] leading-tight font-semibold tracking-[0.04em]" style={{ fontFamily: TITLE_FONT, color: '#fff' }}>
              {profile?.displayName || 'Taller Textil'}
            </h1>
            {profile?.company && profile.company.trim() && profile.company !== profile.displayName && (
              <p className="text-[13px] mt-1" style={{ color: `${OFF_WHITE}80` }}>{profile.company}</p>
            )}
            <p className="text-[11px] font-semibold uppercase tracking-[0.38em] mt-2.5" style={{ color: ACCENT_LIGHT }}>
              {profile?.jobTitle?.trim() || 'Sublimados & Bordados'}
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
                <a href={waHref(`Hola ${contactName}, quiero información sobre sus productos y pedidos al por mayor.`)} target="_blank" rel="noopener noreferrer" className={sqCls} style={sqStyle}><FaWhatsapp size={15} /></a>
              )}
              <button onClick={() => setShowQRModal?.(true)} className={sqCls} style={sqStyle}><FaQrcode size={14} /></button>
              {downloadVCard && (
                <button onClick={() => downloadVCard()} disabled={isVCardLoading} className={sqCls} style={sqStyle}><FaRegAddressCard size={15} /></button>
              )}
              <button onClick={() => handleShare?.()}
                className="flex items-center gap-2 h-11 px-5 rounded-xl text-[11px] font-semibold uppercase tracking-[0.2em] transition hover:brightness-110"
                style={{ background: ACCENT, color: ON_ACCENT, fontFamily: TITLE_FONT, boxShadow: `0 10px 26px -12px ${ACCENT}` }}>
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
                <FaMapMarkerAlt size={12} style={{ color: ACCENT_LIGHT }} />
                {profile?.location || (profile?.locations as string[])[0]}
              </p>
            )}
          </header>

          {/* ── Banner institucional (bordado de uniformes para instituciones) ── */}
          <div className="rounded-2xl p-4 border" style={{ background: `linear-gradient(160deg, ${ACCENT}10, ${MODAL_BG})`, borderColor: `${ACCENT}33` }}>
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${ACCENT}1a`, border: `1px solid ${ACCENT}33`, color: ACCENT_LIGHT }}>
                <FaShieldAlt size={17} />
              </div>
              <div className="min-w-0 flex-1 text-left">
                <p className="text-[9px] uppercase tracking-[0.25em] font-semibold" style={{ color: ACCENT_LIGHT }}>Confección institucional</p>
                <p className="text-white font-semibold text-sm mt-0.5" style={{ fontFamily: TITLE_FONT }}>Uniformes y bordado para instituciones</p>
                <p className="text-[12px] leading-snug mt-1" style={{ color: `${OFF_WHITE}88` }}>
                  {profile?.specialty?.trim() || 'Dotación completa, bordado de insignias, parches y distintivos con estándares institucionales.'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {['Policía y Fuerzas del Orden', 'Empresas', 'Equipos deportivos', 'Instituciones educativas'].map(tag => (
                <span key={tag} className="text-[10px] font-semibold px-2.5 py-1 rounded-full border" style={{ color: `${OFF_WHITE}cc`, borderColor: `${OFF_WHITE}1e`, background: 'rgba(0,0,0,0.25)' }}>
                  {tag}
                </span>
              ))}
            </div>
            {contactWhatsapp && (
              <a href={waHref(`Hola ${contactName}, represento a una institución/empresa y quiero información sobre convenios de uniformes y bordado.`)} target="_blank" rel="noopener noreferrer"
                className="mt-3 flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-[10px] font-semibold uppercase tracking-[0.2em] border transition hover:bg-white/[0.04]"
                style={{ borderColor: `${ACCENT}55`, color: ACCENT_LIGHT, fontFamily: TITLE_FONT }}>
                <FaWhatsapp size={13} /> Solicitar convenio institucional
              </a>
            )}
          </div>

          {/* ── Enlaces (píldoras oscuras) ── */}
          <div className="space-y-2.5">
            <PillLink onClick={() => setTrackerOpen(true)} icon={<FaSearchLocation size={13} style={{ color: ACCENT_LIGHT }} />}>
              Rastrear mi pedido
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
            <FeatureCard icon={<FaIndustry />} title="Pedido al por mayor"
              desc="Arma tu pedido en gran cantidad con precios por volumen y recibe tu cotización con código de rastreo." onClick={() => openQuote('mayorista')} />
            <FeatureCard icon={<FaBoxOpen />} title="Solicitar una muestra"
              desc="Pide una muestra física de calidad antes de confirmar tu pedido grande." onClick={() => openQuote('muestra')} />
            <FeatureCard icon={<FaGift />} title={`Únete al ${clubName}`}
              desc={clubTagline} onClick={() => setClubOpen(true)} />
          </div>

          {/* ── Pase de membresía ── */}
          <MembershipPass clubName={clubName} onOpen={(id) => { setLookupInitial(id); setLookupOpen(true); }} />

          {/* ── CATÁLOGO ── */}
          {isOn(profile, 'products') && (
            <section>
              <SectionHeading kicker="Catálogo">Nuestros Productos</SectionHeading>
              {loadingProducts ? (
                <div className="flex justify-center py-10">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2" style={{ borderColor: ACCENT }} />
                </div>
              ) : products.length === 0 ? (
                <div className="text-center py-10 rounded-2xl border" style={{ borderColor: `${ACCENT}22`, background: 'rgba(255,255,255,0.02)' }}>
                  <FaTshirt className="mx-auto text-3xl mb-2" style={{ color: `${OFF_WHITE}33` }} />
                  <p className="text-sm" style={{ color: `${OFF_WHITE}66` }}>Pronto publicaremos nuestro catálogo.</p>
                </div>
              ) : (
                <>
                  {/* Buscador */}
                  <div className="flex items-center gap-2.5 rounded-full px-4 py-3 mb-3.5 border" style={{ background: 'rgba(0,0,0,0.2)', borderColor: `${OFF_WHITE}1a` }}>
                    <FaSearch size={12} style={{ color: `${OFF_WHITE}55` }} />
                    <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Buscar producto…"
                      className="bg-transparent text-white text-sm focus:outline-none w-full placeholder-white/30" style={{ color: OFF_WHITE }} />
                  </div>

                  {/* Chips de categoría */}
                  {categoryChips.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto pb-1 mb-5 -mx-1 px-1">
                      <FilterChip active={categoryFilter === 'all'} onClick={() => setCategoryFilter('all')} label="Todo" count={products.length} />
                      {categoryChips.map(c => (
                        <FilterChip key={c.label} active={categoryFilter === c.label} onClick={() => setCategoryFilter(c.label)} label={c.label} count={c.count} />
                      ))}
                    </div>
                  )}

                  {filteredProducts.length === 0 ? (
                    <p className="text-center text-sm py-8" style={{ color: `${OFF_WHITE}66` }}>No hay productos que coincidan con tu búsqueda.</p>
                  ) : (
                    <div className="space-y-3">
                      {featuredProduct && <FeaturedProductCard product={featuredProduct} onClick={() => setSelected(featuredProduct)} onQuote={() => quoteProduct(featuredProduct)} />}
                      {restProducts.length > 0 && (
                        <div className="grid grid-cols-2 gap-3">
                          {restProducts.map(p => <ProductCard key={p.id} product={p} onClick={() => setSelected(p)} />)}
                        </div>
                      )}
                      {products.length > 4 && (
                        <button type="button" onClick={() => setShowFullCatalog(true)}
                          className="mt-2 w-full py-3.5 rounded-xl font-semibold text-xs uppercase tracking-[0.15em] transition-all hover:brightness-110 active:scale-95 flex items-center justify-center gap-2"
                          style={{ backgroundColor: ACCENT, color: ON_ACCENT }}>
                          <FaTshirt size={12} /> Ver todo el catálogo ({products.length})
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          <ProfileExtraSections profile={profile} accent={ACCENT} isMobilePreview={isMobilePreview} />

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
          accent={ACCENT}
          bg={BG_DARK}
          text={OFF_WHITE}
          muted={`${OFF_WHITE}80`}
          title="Nuestro Catálogo"
          searchPlaceholder="Buscar producto…"
          emptyLabel="Pronto publicaremos nuestro catálogo."
          ctaLabel="Ver →"
          isMobilePreview={isMobilePreview}
        />
      )}

      {/* ── Modal Detalle de Producto ── */}
      {selected && (
        <ProductDetailModal
          product={selected} contactName={contactName} waHref={waHref}
          onClose={() => setSelected(null)}
          onQuote={(item) => { setSelected(null); openQuote('mayorista', [item]); }}
          onSample={(item) => { setSelected(null); openQuote('muestra', [{ ...item, qty: 1 }]); }}
        />
      )}

      {/* ── Modal Cotizador mayorista / muestra ── */}
      {quoteMode && (
        <QuoteModal
          userId={userId} mode={quoteMode} products={products} initialItems={quoteInitial}
          campaign={campaign} isMobilePreview={isMobilePreview}
          onTrack={(code) => { setQuoteMode(null); setTrackerCode(code); setTrackerOpen(true); }}
          onClose={() => setQuoteMode(null)}
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
    </OnAccentContext.Provider>
    </AccentContext.Provider>
  );
};

// ── Píldora oscura (enlace) ──────────────────────────────────────────────────
const PillLink: React.FC<{ onClick: () => void; icon: React.ReactNode; children: React.ReactNode }> = ({ onClick, icon, children }) => (
  <button onClick={onClick}
    className="flex items-center justify-center gap-2 w-full rounded-2xl py-4 px-4 text-[13px] font-semibold tracking-wide transition hover:-translate-y-0.5"
    style={{ background: MODAL_BG, border: `1px solid ${OFF_WHITE}12`, color: OFF_WHITE }}>
    {icon} {children}
  </button>
);

// ── Tarjeta de acción ─────────────────────────────────────────────────────────
const FeatureCard: React.FC<{ icon: React.ReactNode; title: string; desc: string; onClick: () => void }> = ({ icon, title, desc, onClick }) => { const ACCENT = useAccent(); const ON_ACCENT = useOnAccent(); return (
  <button onClick={onClick}
    className="w-full text-left rounded-2xl p-4 flex items-center gap-4 border transition hover:-translate-y-0.5 group"
    style={{ background: MODAL_BG, borderColor: `${ACCENT}44` }}>
    <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-lg" style={{ background: `${ACCENT}1a`, border: `1px solid ${ACCENT}33`, color: ACCENT_LIGHT }}>
      {icon}
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-white font-semibold text-[15px] tracking-[0.01em]" style={{ fontFamily: TITLE_FONT }}>{title}</p>
      <p className="text-[12px] leading-snug mt-0.5" style={{ color: `${OFF_WHITE}88` }}>{desc}</p>
    </div>
    <FaArrowRight size={13} className="shrink-0 transition group-hover:translate-x-0.5" style={{ color: ACCENT_LIGHT }} />
  </button>
);
};

// ── Pase de membresía ─────────────────────────────────────────────────────────
const MembershipPass: React.FC<{ clubName: string; onOpen: (id: string) => void }> = ({ clubName, onOpen }) => {
  const ACCENT = useAccent();
  const ON_ACCENT = useOnAccent();
  const [id, setId] = useState('');
  return (
    <div className="rounded-2xl p-5 border" style={{ background: `linear-gradient(160deg, ${ACCENT}12, ${MODAL_BG})`, borderColor: `${ACCENT}44` }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[9px] font-semibold uppercase tracking-[0.3em]" style={{ color: ACCENT_LIGHT }}>Connexo Pass</span>
        <span className="text-[9px] font-semibold uppercase tracking-[0.2em] px-2.5 py-1 rounded-full" style={{ border: `1px solid ${ACCENT}55`, color: ACCENT_LIGHT }}>VIP</span>
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
          style={{ background: ACCENT, color: ON_ACCENT, fontFamily: TITLE_FONT }}>
          Ver mi membresía
        </button>
      </form>
    </div>
  );
};

// ── Chip de filtro por categoría ──────────────────────────────────────────────
const FilterChip: React.FC<{ active: boolean; onClick: () => void; label: string; count: number }> = ({ active, onClick, label, count }) => { const ACCENT = useAccent(); const ON_ACCENT = useOnAccent(); return (
  <button onClick={onClick}
    className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[10px] font-semibold uppercase tracking-[0.15em] transition border"
    style={active
      ? { background: ACCENT, color: ON_ACCENT, borderColor: ACCENT }
      : { background: 'transparent', color: `${OFF_WHITE}cc`, borderColor: `${OFF_WHITE}22` }}>
    <span className="w-1.5 h-1.5 rounded-full" style={{ background: active ? ON_ACCENT : ACCENT }} />
    {label}
    <span className="text-[9px] font-semibold opacity-60">{count}</span>
  </button>
);
};

// ── Tarjeta de producto (grid 2 columnas, estructura de PropertyCard/realty) ──
const ProductCard: React.FC<{ product: SublimaProduct; onClick: () => void }> = ({ product: p, onClick }) => {
  const ACCENT = useAccent();
  const ON_ACCENT = useOnAccent();
  const photoCount = Array.isArray(p.images) ? p.images.length : 0;
  const tiers = Array.isArray(p.price_tiers) ? p.price_tiers : [];
  const bestTier = tiers.length ? Math.min(...tiers.map(t => t.unit_price ?? Infinity)) : null;
  const fromPrice = bestTier != null && bestTier !== Infinity ? bestTier : (typeof p.base_price === 'number' ? p.base_price : null);
  const techniques = Array.isArray(p.techniques) ? p.techniques : [];
  return (
    <button onClick={onClick}
      className="group text-left rounded-2xl overflow-hidden border transition-all duration-300 hover:-translate-y-1"
      style={{ background: 'rgba(255,255,255,0.025)', borderColor: `${OFF_WHITE}12`, opacity: p.is_available ? 1 : 0.55 }}>
      <div className="aspect-[4/3] relative overflow-hidden" style={{ background: '#0a0a12' }}>
        {p.images?.[0]
          ? <img src={p.images[0]} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
          : <div className="w-full h-full flex items-center justify-center"><FaTshirt className="text-3xl" style={{ color: `${OFF_WHITE}22` }} /></div>}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(10,3,0,0.85), transparent 60%)' }} />
        {!p.is_available
          ? <span className="absolute top-2.5 left-2.5 text-[8px] font-semibold uppercase tracking-[0.15em] px-2 py-1 rounded-full backdrop-blur-sm" style={{ background: 'rgba(0,0,0,0.6)', color: '#f87171' }}>No disponible</span>
          : (p.min_qty > 1 && <span className="absolute top-2.5 left-2.5 text-[8px] font-semibold uppercase tracking-[0.15em] px-2 py-1 rounded-full backdrop-blur-sm" style={{ background: `${ACCENT}dd`, color: BG_DARK }}>Mín. {p.min_qty}</span>)}
        {photoCount > 1 && (
          <span className="absolute top-2.5 right-2.5 text-[9px] font-semibold px-1.5 py-1 rounded-md flex items-center gap-1 backdrop-blur-sm"
            style={{ background: 'rgba(0,0,0,0.45)', color: '#fff' }}><FaCamera size={8} /> {photoCount}</span>
        )}
        <p className="absolute bottom-2.5 left-3 right-3 text-[17px] font-semibold" style={{ color: '#fff', fontFamily: TITLE_FONT, textShadow: '0 1px 12px rgba(0,0,0,0.6)' }}>
          {fromPrice != null ? `${fmtMoney(fromPrice)} c/u` : 'Consultar'}
        </p>
      </div>
      <div className="p-3.5">
        <p className="cnx-product-text text-white font-medium text-[13px] truncate">{p.name}</p>
        {p.category && (
          <p className="text-[11px] truncate flex items-center gap-1 mt-1" style={{ color: `${OFF_WHITE}80` }}>
            <FaTags size={9} style={{ color: ACCENT_LIGHT }} /> {p.category}
          </p>
        )}
        {techniques.length > 0 && (
          <div className="flex items-center gap-3 mt-2.5 pt-2.5 border-t text-[10px]" style={{ color: `${OFF_WHITE}66`, borderColor: `${OFF_WHITE}10` }}>
            {techniques.slice(0, 3).map(tq => <span key={tq}>{tq}</span>)}
          </div>
        )}
      </div>
    </button>
  );
};

// ── Tarjeta destacada (hero del primer producto, estructura de FeaturedCard) ──
const FeaturedProductCard: React.FC<{ product: SublimaProduct; onClick: () => void; onQuote: () => void }> = ({ product: p, onClick, onQuote }) => {
  const ACCENT = useAccent();
  const ON_ACCENT = useOnAccent();
  const photoCount = Array.isArray(p.images) ? p.images.length : 0;
  const tiers = Array.isArray(p.price_tiers) ? p.price_tiers : [];
  const bestTier = tiers.length ? Math.min(...tiers.map(t => t.unit_price ?? Infinity)) : null;
  const fromPrice = bestTier != null && bestTier !== Infinity ? bestTier : (typeof p.base_price === 'number' ? p.base_price : null);
  const techniques = Array.isArray(p.techniques) ? p.techniques : [];
  return (
    <div className="rounded-3xl overflow-hidden border relative group" style={{ borderColor: `${ACCENT}33`, background: 'rgba(255,255,255,0.02)' }}>
      <button onClick={onClick} className="block w-full text-left">
        <div className="aspect-[16/10] relative overflow-hidden" style={{ background: '#0a0a12' }}>
          {p.images?.[0]
            ? <img src={p.images[0]} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-[900ms]" />
            : <div className="w-full h-full flex items-center justify-center"><FaTshirt className="text-5xl" style={{ color: `${OFF_WHITE}22` }} /></div>}
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(10,3,0,0.94) 6%, rgba(10,3,0,0.2) 55%, transparent)' }} />
          <div className="absolute top-3.5 left-3.5 flex items-center gap-2">
            <span className="text-[9px] font-semibold uppercase tracking-[0.2em] px-3 py-1.5 rounded-full flex items-center gap-1.5"
              style={{ background: ACCENT, color: BG_DARK, fontFamily: TITLE_FONT }}><FaRegStar size={9} /> Destacado</span>
            {p.min_qty > 1 && (
              <span className="text-[9px] font-semibold uppercase tracking-[0.15em] px-2.5 py-1.5 rounded-full backdrop-blur-sm" style={{ background: 'rgba(0,0,0,0.5)', color: ACCENT_LIGHT }}>Mín. {p.min_qty}</span>
            )}
          </div>
          {photoCount > 1 && (
            <span className="absolute top-3.5 right-3.5 text-[10px] font-semibold px-2 py-1 rounded-md flex items-center gap-1 backdrop-blur-sm" style={{ background: 'rgba(0,0,0,0.45)', color: '#fff' }}><FaCamera size={9} /> {photoCount}</span>
          )}
          <div className="absolute bottom-0 inset-x-0 p-5">
            <h3 className="text-white font-semibold text-xl leading-tight tracking-[0.02em]" style={{ fontFamily: TITLE_FONT }}>{p.name}</h3>
            {p.category && (
              <p className="text-xs flex items-center gap-1.5 mt-1.5" style={{ color: `${OFF_WHITE}cc` }}>
                <FaTags size={10} style={{ color: ACCENT_LIGHT }} /> {p.category}
              </p>
            )}
            <div className="flex items-end justify-between mt-3 gap-2">
              <p className="text-[26px] font-semibold leading-none" style={{ color: '#fff', fontFamily: TITLE_FONT }}>
                {fromPrice != null ? `${fmtMoney(fromPrice)} c/u` : 'Consultar'}
              </p>
              {techniques.length > 0 && (
                <div className="flex items-center gap-2.5 text-[11px] pb-1" style={{ color: `${OFF_WHITE}cc` }}>
                  {techniques.slice(0, 3).map(tq => <span key={tq}>{tq}</span>)}
                </div>
              )}
            </div>
          </div>
        </div>
      </button>
      <div className="grid grid-cols-2 gap-2.5 p-3.5">
        <button onClick={onClick}
          className="flex items-center justify-center gap-2 py-3 rounded-full text-[10px] font-semibold uppercase tracking-[0.18em] transition hover:brightness-110"
          style={{ background: ACCENT, color: BG_DARK, fontFamily: TITLE_FONT }}>
          Ver detalle <FaArrowRight size={10} />
        </button>
        <button onClick={onQuote}
          className="flex items-center justify-center gap-2 py-3 rounded-full text-[10px] font-semibold uppercase tracking-[0.18em] transition border hover:bg-white/[0.04]"
          style={{ borderColor: `${ACCENT}55`, color: OFF_WHITE, fontFamily: TITLE_FONT }}>
          <FaFileInvoiceDollar size={10} /> Cotizar
        </button>
      </div>
    </div>
  );
};

// ── Modal: detalle de producto (galería + tabla de precios por volumen) ───────
const ProductDetailModal: React.FC<{
  product: SublimaProduct;
  contactName: string;
  waHref: (t: string) => string | undefined;
  onClose: () => void;
  onQuote: (item: SublimaOrderItem) => void;
  onSample: (item: SublimaOrderItem) => void;
}> = ({ product: p, contactName, waHref, onClose, onQuote, onSample }) => {
  const ACCENT = useAccent();
  const ON_ACCENT = useOnAccent();
  const images = Array.isArray(p.images) && p.images.length ? p.images : [];
  const [img, setImg] = useState(0);
  const go = (dir: number) => setImg(i => (images.length ? (i + dir + images.length) % images.length : 0));

  const [qty, setQty] = useState(Math.max(1, p.min_qty || 1));
  const unit = unitPriceFor(p, qty);
  const total = unit != null ? unit * qty : null;

  const tiers = useMemo(() => {
    const list = Array.isArray(p.price_tiers) ? [...p.price_tiers] : [];
    return list
      .filter(t => typeof t.unit_price === 'number')
      .sort((a, b) => (a.min_qty || 0) - (b.min_qty || 0));
  }, [p.price_tiers]);

  const makeItem = (): SublimaOrderItem => ({
    product_id: p.id, name: p.name, qty, unit_price: unit,
  });

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl relative flex flex-col overflow-hidden border"
        style={{ background: MODAL_BG, borderColor: `${ACCENT}33`, maxHeight: '92svh', fontFamily: BODY_FONT }}
        onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 z-20 w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center">
          <FaTimes />
        </button>
        {/* Galería */}
        <div className="aspect-[16/10] relative shrink-0" style={{ background: '#0a0d07' }}>
          {images.length ? (
            <img src={images[img]} alt={`${p.name} ${img + 1}`} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center"><FaTshirt className="text-5xl" style={{ color: `${OFF_WHITE}22` }} /></div>
          )}
          {!p.is_available && (
            <span className="absolute top-3 left-3 text-[9px] font-semibold uppercase tracking-[0.15em] px-2.5 py-1.5 rounded-full backdrop-blur-sm"
              style={{ background: 'rgba(0,0,0,0.6)', color: '#f87171' }}>No disponible</span>
          )}
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
                style={{ borderColor: i === img ? ACCENT : 'transparent', opacity: i === img ? 1 : 0.6 }}>
                <img src={src} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
        <div className="p-6 overflow-y-auto">
          <h3 className="text-xl font-semibold text-white tracking-[0.02em]" style={{ fontFamily: TITLE_FONT }}>{p.name}</h3>
          {p.category && (
            <p className="text-sm mt-1.5 flex items-center gap-1.5" style={{ color: `${OFF_WHITE}99` }}>
              <FaTags size={12} style={{ color: ACCENT_LIGHT }} /> {p.category}
            </p>
          )}
          {Array.isArray(p.techniques) && p.techniques.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {p.techniques.map(t => (
                <span key={t} className="text-[10px] font-semibold px-2.5 py-1 rounded-full" style={{ color: ACCENT_LIGHT, background: `${ACCENT}14`, border: `1px solid ${ACCENT}33` }}>{t}</span>
              ))}
            </div>
          )}
          {p.description && (
            <p className="text-[13px] mt-4 whitespace-pre-wrap leading-relaxed" style={{ color: `${OFF_WHITE}99` }}>{p.description}</p>
          )}

          {/* Tabla de precios por volumen */}
          <div className="mt-4 rounded-xl border overflow-hidden" style={{ borderColor: `${ACCENT}33` }}>
            <div className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.2em] flex items-center gap-2" style={{ background: `${ACCENT}14`, color: ACCENT_LIGHT }}>
              <FaTags size={10} /> Precios por volumen
            </div>
            <div className="divide-y" style={{ background: 'rgba(0,0,0,0.25)' }}>
              {typeof p.base_price === 'number' && (
                <div className="flex items-center justify-between px-4 py-2.5 text-sm" style={{ borderColor: `${OFF_WHITE}0d` }}>
                  <span style={{ color: `${OFF_WHITE}99` }}>Desde {Math.max(1, p.min_qty || 1)} unidad{(p.min_qty || 1) > 1 ? 'es' : ''}</span>
                  <span className="font-semibold text-white" style={{ fontFamily: TITLE_FONT }}>{fmtMoney(p.base_price)} c/u</span>
                </div>
              )}
              {tiers.map((t, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm" style={{ borderColor: `${OFF_WHITE}0d` }}>
                  <span style={{ color: `${OFF_WHITE}99` }}>{t.min_qty}+ unidades</span>
                  <span className="font-semibold" style={{ color: ACCENT_LIGHT, fontFamily: TITLE_FONT }}>{fmtMoney(t.unit_price)} c/u</span>
                </div>
              ))}
              {tiers.length === 0 && typeof p.base_price !== 'number' && (
                <div className="px-4 py-3 text-sm text-center" style={{ color: `${OFF_WHITE}66` }}>Precio bajo cotización.</div>
              )}
            </div>
          </div>

          {/* Selector de cantidad + estimado */}
          <div className="mt-4 rounded-xl p-4 border" style={{ background: 'rgba(255,255,255,0.025)', borderColor: `${OFF_WHITE}12` }}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] uppercase tracking-[0.2em] font-semibold" style={{ color: `${OFF_WHITE}88` }}>Cantidad</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setQty(q => Math.max(1, q - (q > 50 ? 10 : 1)))} className="w-8 h-8 rounded-lg flex items-center justify-center border" style={{ borderColor: `${OFF_WHITE}22`, color: OFF_WHITE }}><FaMinus size={9} /></button>
                <input type="number" min={1} value={qty}
                  onChange={e => setQty(Math.max(1, Number(e.target.value) || 1))}
                  className="w-20 text-center bg-black/40 border text-white text-sm rounded-lg px-2 py-1.5 focus:outline-none" style={{ borderColor: `${OFF_WHITE}1a` }} />
                <button onClick={() => setQty(q => q + (q >= 50 ? 10 : 1))} className="w-8 h-8 rounded-lg flex items-center justify-center border" style={{ borderColor: `${OFF_WHITE}22`, color: OFF_WHITE }}><FaPlus size={9} /></button>
              </div>
            </div>
            {p.min_qty > 1 && qty < p.min_qty && (
              <p className="text-[11px] mt-2" style={{ color: '#fbbf24' }}>⚠️ El pedido mínimo de este producto es de {p.min_qty} unidades.</p>
            )}
            {unit != null && (
              <div className="flex items-center justify-between mt-3 pt-3 border-t" style={{ borderColor: `${OFF_WHITE}10` }}>
                <span className="text-[12px]" style={{ color: `${OFF_WHITE}88` }}>{fmtMoney(unit)} c/u × {qty}</span>
                <span className="text-lg font-semibold" style={{ color: ACCENT_LIGHT, fontFamily: TITLE_FONT }}>{fmtMoney(total)}</span>
              </div>
            )}
            <p className="text-[10px] mt-1.5" style={{ color: `${OFF_WHITE}55` }}>Estimado referencial — la cotización final la confirma el taller.</p>
          </div>

          <button onClick={() => onQuote(makeItem())}
            className="mt-4 w-full flex items-center justify-center gap-2 py-3.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.18em] transition hover:brightness-110"
            style={{ background: ACCENT, color: ON_ACCENT, fontFamily: TITLE_FONT, boxShadow: `0 10px 30px -12px ${ACCENT}` }}>
            <FaFileInvoiceDollar size={12} /> Cotizar este producto
          </button>
          <div className="grid grid-cols-2 gap-2.5 mt-2.5">
            <button onClick={() => onSample(makeItem())}
              className="flex items-center justify-center gap-2 py-3 rounded-full text-[10px] font-semibold uppercase tracking-[0.18em] transition hover:bg-white/[0.04] border"
              style={{ borderColor: `${ACCENT}55`, color: OFF_WHITE, fontFamily: TITLE_FONT }}>
              <FaBoxOpen size={11} /> Pedir muestra
            </button>
            {waHref(`Hola ${contactName}, me interesa "${p.name}" para un pedido al por mayor.`) ? (
              <a href={waHref(`Hola ${contactName}, me interesa "${p.name}" para un pedido al por mayor.`)} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 py-3 rounded-full text-[10px] font-semibold uppercase tracking-[0.18em] border text-[#25D366] border-[#25D366]/30 hover:bg-[#25D366]/10 transition"
                style={{ fontFamily: TITLE_FONT }}>
                <FaWhatsapp size={12} /> WhatsApp
              </a>
            ) : <span />}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Utilidades de estilo compartidas para modales ────────────────────────────
const inputCls = "w-full bg-black/40 border text-white text-sm rounded-xl px-4 py-3 focus:outline-none placeholder-white/30";
const inputStyle = (accent: string) => ({ borderColor: `${accent}33` } as React.CSSProperties);
const ModalShell: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; z?: number }> = ({ title, onClose, children, z = 10000 }) => { const ACCENT = useAccent(); const ON_ACCENT = useOnAccent(); return (
  <div className="fixed inset-0 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-sm" style={{ zIndex: z }} onClick={onClose}>
    <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border p-6 space-y-3"
      style={{ background: MODAL_BG, borderColor: `${ACCENT}33`, maxHeight: '92svh', overflowY: 'auto', fontFamily: BODY_FONT }}
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

// ── Modal: cotizador (pedido mayorista / muestra) con carrito multi-producto ──
const QuoteModal: React.FC<{
  userId?: string | null;
  mode: SublimaRequestType;
  products: SublimaProduct[];
  initialItems: SublimaOrderItem[];
  campaign?: string | null;
  isMobilePreview?: boolean;
  onTrack: (code: string) => void;
  onClose: () => void;
}> = ({ userId, mode, products, initialItems, campaign, isMobilePreview, onTrack, onClose }) => {
  const ACCENT = useAccent();
  const ON_ACCENT = useOnAccent();
  const [memberCode, setMemberCode] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [items, setItems] = useState<SublimaOrderItem[]>(initialItems);
  const [otherItems, setOtherItems] = useState('');
  const [technique, setTechnique] = useState('');
  const [neededDate, setNeededDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const title = mode === 'muestra' ? 'Solicitar muestra' : 'Pedido al por mayor';
  const available = products.filter(p => p.is_available);

  // Autocompletado por código de miembro.
  const lookupMember = async () => {
    if (!userId || !memberCode.trim()) return;
    setLookingUp(true);
    try {
      const { data } = await supabase.rpc('get_sublima_member', { p_factory_id: userId, p_identifier: memberCode.trim() });
      if (data?.found) {
        if (!name && data.name) setName(data.name);
        if (!phone && data.phone) setPhone(data.phone);
        if (!email && data.email) setEmail(data.email);
        if (!company && data.company) setCompany(data.company);
      } else setError('No encontramos esa membresía.');
    } catch { /* noop */ } finally { setLookingUp(false); }
  };

  const setItemQty = (productId: string, qty: number) => {
    setItems(prev => prev.map(it => {
      if (it.product_id !== productId) return it;
      const prod = products.find(p => p.id === productId);
      const q = Math.max(1, qty);
      return { ...it, qty: q, unit_price: prod ? unitPriceFor(prod, q) : it.unit_price };
    }));
  };

  const addProduct = (p: SublimaProduct) => {
    setItems(prev => {
      if (prev.some(it => it.product_id === p.id)) return prev;
      const q = Math.max(1, mode === 'muestra' ? 1 : (p.min_qty || 1));
      return [...prev, { product_id: p.id, name: p.name, qty: q, unit_price: unitPriceFor(p, q) }];
    });
  };

  const removeItem = (productId: string) =>
    setItems(prev => prev.filter(it => it.product_id !== productId));

  const estimatedTotal = useMemo(() => {
    let sum = 0; let hasPrice = false;
    items.forEach(it => {
      if (typeof it.unit_price === 'number') { sum += it.unit_price * it.qty; hasPrice = true; }
    });
    return hasPrice ? sum : null;
  }, [items]);

  const totalUnits = items.reduce((s, it) => s + it.qty, 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isMobilePreview) return;
    if (!name.trim()) { setError('Escribe tu nombre.'); return; }
    if (!phone.trim() && !email.trim()) { setError('Déjanos tu teléfono o email.'); return; }
    if (items.length === 0 && !otherItems.trim()) { setError('Agrega al menos un artículo a tu pedido.'); return; }
    if (!userId) { setError('No se pudo identificar el negocio.'); return; }
    setError(null);
    setSubmitting(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('place_sublima_order', {
        p_factory_id: userId,
        p_request_type: mode,
        p_client_name: name.trim(),
        p_client_phone: phone.trim() || null,
        p_client_email: email.trim() || null,
        p_client_company: company.trim() || null,
        p_items: items,
        p_other_items: otherItems.trim() || null,
        p_technique: technique || null,
        p_notes: notes.trim() || null,
        p_needed_date: neededDate || null,
        p_estimated_total: estimatedTotal,
        p_member_code: memberCode.trim() || null,
        p_source_campaign: campaign || null,
      });
      if (rpcError) throw rpcError;
      setResult(data?.tracking_code || '');
    } catch (err: any) {
      setError(err?.message || 'No se pudo completar el registro.');
    } finally { setSubmitting(false); }
  };

  return (
    <ModalShell title={result ? '¡Listo!' : title} onClose={onClose}>
      {result ? (
        <div className="py-4 text-center">
          <FaClipboardCheck className="mx-auto text-4xl mb-3" style={{ color: ACCENT_LIGHT }} />
          <p className="text-white font-bold">Tu {REQUEST_LABEL[mode].toLowerCase()} fue registrado.</p>
          <p className="text-sm mt-2" style={{ color: `${OFF_WHITE}88` }}>Guarda tu código de rastreo:</p>
          <div className="my-3 mx-auto inline-block px-6 py-3 rounded-xl border font-mono text-2xl font-black tracking-[0.3em]"
            style={{ background: 'rgba(255,255,255,0.04)', borderColor: `${ACCENT}44`, color: ACCENT_LIGHT }}>
            {result}
          </div>
          <p className="text-xs" style={{ color: `${OFF_WHITE}66` }}>Te enviaremos la cotización oficial; podrás verla al rastrear tu pedido.</p>
          <button onClick={() => onTrack(result)}
            className="mt-3 w-full py-3.5 rounded-xl text-sm font-black uppercase tracking-wider transition hover:brightness-110"
            style={{ background: ACCENT, color: ON_ACCENT, fontFamily: TITLE_FONT }}>
            Rastrear mi pedido
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          {/* Código de miembro */}
          <div className="flex gap-2">
            <input value={memberCode} onChange={e => setMemberCode(e.target.value)} placeholder="¿Ya eres miembro? Código (S-XXXX)"
              className={inputCls} style={inputStyle(ACCENT)} />
            <button type="button" onClick={lookupMember} disabled={lookingUp || !memberCode.trim()}
              className="shrink-0 px-4 rounded-xl text-xs font-bold uppercase border disabled:opacity-40"
              style={{ borderColor: `${ACCENT}44`, color: ACCENT_LIGHT }}>
              {lookingUp ? '…' : 'Autocompletar'}
            </button>
          </div>

          <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre completo" className={inputCls} style={inputStyle(ACCENT)} />
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Teléfono / WhatsApp" className={inputCls} style={inputStyle(ACCENT)} />
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email (opcional)" className={inputCls} style={inputStyle(ACCENT)} />
          <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Empresa / Institución (opcional)" className={inputCls} style={inputStyle(ACCENT)} />

          {/* Artículos del pedido */}
          <div>
            <p className="text-[11px] uppercase tracking-widest font-bold mb-2" style={{ color: ACCENT_LIGHT }}>
              {mode === 'muestra' ? 'Artículos de la muestra' : 'Artículos del pedido'}
            </p>
            {items.length > 0 && (
              <div className="space-y-2 mb-2.5">
                {items.map(it => (
                  <div key={it.product_id} className="rounded-xl p-3 border flex items-center gap-2.5" style={{ background: 'rgba(255,255,255,0.03)', borderColor: `${ACCENT}22` }}>
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-[13px] font-semibold truncate">{it.name}</p>
                      <p className="text-[11px]" style={{ color: `${OFF_WHITE}77` }}>
                        {typeof it.unit_price === 'number' ? `${fmtMoney(it.unit_price)} c/u · ${fmtMoney(it.unit_price * it.qty)}` : 'Precio bajo cotización'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button type="button" onClick={() => setItemQty(it.product_id, it.qty - (it.qty > 50 ? 10 : 1))}
                        className="w-7 h-7 rounded-lg flex items-center justify-center border" style={{ borderColor: `${OFF_WHITE}22`, color: OFF_WHITE }}><FaMinus size={8} /></button>
                      <input type="number" min={1} value={it.qty}
                        onChange={e => setItemQty(it.product_id, Number(e.target.value) || 1)}
                        className="w-16 text-center bg-black/40 border text-white text-xs rounded-lg px-1 py-1.5 focus:outline-none" style={{ borderColor: `${OFF_WHITE}1a` }} />
                      <button type="button" onClick={() => setItemQty(it.product_id, it.qty + (it.qty >= 50 ? 10 : 1))}
                        className="w-7 h-7 rounded-lg flex items-center justify-center border" style={{ borderColor: `${OFF_WHITE}22`, color: OFF_WHITE }}><FaPlus size={8} /></button>
                      <button type="button" onClick={() => removeItem(it.product_id)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-red-400 border border-red-400/30"><FaTrash size={9} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Agregar del catálogo */}
            {available.filter(p => !items.some(it => it.product_id === p.id)).length > 0 && (
              <div className="rounded-xl p-3 border space-y-2" style={{ background: `${ACCENT}0d`, borderColor: `${ACCENT}33` }}>
                <p className="text-[11px] font-bold flex items-center gap-1.5" style={{ color: ACCENT_LIGHT }}>
                  <FaTshirt size={10} /> Toca para agregar del catálogo
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {available.filter(p => !items.some(it => it.product_id === p.id)).slice(0, 12).map(p => (
                    <button key={p.id} type="button" onClick={() => addProduct(p)}
                      className="shrink-0 w-28 text-left rounded-lg overflow-hidden border transition hover:brightness-110"
                      style={{ borderColor: `${ACCENT}22`, background: 'rgba(0,0,0,0.3)' }}>
                      <div className="h-14 bg-black/40">
                        {p.images?.[0] ? <img src={p.images[0]} alt={p.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><FaTshirt style={{ color: `${OFF_WHITE}22` }} /></div>}
                      </div>
                      <div className="p-1.5">
                        <p className="text-white text-[10px] font-bold truncate">{p.name}</p>
                        <p className="text-[9px] font-black" style={{ color: ACCENT_LIGHT }}>+ Agregar</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <textarea value={otherItems} onChange={e => setOtherItems(e.target.value)} rows={2}
              placeholder="¿Necesitas algo fuera del catálogo? Descríbelo aquí (ej. 200 chompas con bordado institucional)…"
              className={`${inputCls} mt-2.5 resize-none`} style={inputStyle(ACCENT)} />
          </div>

          {/* Técnica */}
          <div>
            <p className="text-[11px] uppercase tracking-widest font-bold mb-2" style={{ color: ACCENT_LIGHT }}>Técnica de personalización</p>
            <div className="flex flex-wrap gap-2">
              {TECHNIQUES.map(t => (
                <button key={t} type="button" onClick={() => setTechnique(technique === t ? '' : t)}
                  className="rounded-xl px-3 py-2 text-xs font-bold border transition"
                  style={technique === t
                    ? { background: ACCENT, color: ON_ACCENT, borderColor: ACCENT }
                    : { background: 'rgba(255,255,255,0.04)', color: OFF_WHITE, borderColor: `${ACCENT}33` }}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Fecha requerida */}
          <div>
            <p className="text-[11px] uppercase tracking-widest font-bold mb-1.5" style={{ color: ACCENT_LIGHT }}>¿Para cuándo lo necesitas? (opcional)</p>
            <input value={neededDate} onChange={e => setNeededDate(e.target.value)} type="date"
              min={new Date().toISOString().slice(0, 10)} className={inputCls} style={inputStyle(ACCENT)} />
          </div>

          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            placeholder="Detalles: tallas, colores, logo a bordar/sublimar, referencias…"
            className={`${inputCls} resize-none`} style={inputStyle(ACCENT)} />

          {/* Resumen estimado */}
          {(items.length > 0) && (
            <div className="rounded-xl p-3.5 border" style={{ background: 'rgba(255,255,255,0.03)', borderColor: `${OFF_WHITE}12` }}>
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: `${OFF_WHITE}88` }}>{totalUnits} unidad{totalUnits !== 1 ? 'es' : ''} · {items.length} artículo{items.length !== 1 ? 's' : ''}</span>
                <span className="font-semibold text-lg" style={{ color: ACCENT_LIGHT, fontFamily: TITLE_FONT }}>{estimatedTotal != null ? fmtMoney(estimatedTotal) : 'Por cotizar'}</span>
              </div>
              <p className="text-[10px] mt-1" style={{ color: `${OFF_WHITE}55` }}>Estimado referencial — el taller te confirmará la cotización oficial.</p>
            </div>
          )}

          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button type="submit" disabled={submitting}
            className="w-full py-3.5 rounded-xl text-sm font-black uppercase tracking-wider transition hover:brightness-110 disabled:opacity-50"
            style={{ background: ACCENT, color: ON_ACCENT, fontFamily: TITLE_FONT }}>
            {submitting ? 'Enviando…' : mode === 'muestra' ? 'Solicitar muestra' : 'Solicitar cotización'}
          </button>
        </form>
      )}
    </ModalShell>
  );
};

// ── Modal: unirse al Club ─────────────────────────────────────────────────────
const ClubModal: React.FC<{ userId?: string | null; clubName: string; clubTagline: string; isMobilePreview?: boolean; onClose: () => void }> = ({ userId, clubName, clubTagline, isMobilePreview, onClose }) => {
  const ACCENT = useAccent();
  const ON_ACCENT = useOnAccent();
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
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
    if (!userId) { setError('No se pudo identificar el negocio.'); return; }
    setError(null); setSubmitting(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('join_sublima_club', {
        p_factory_id: userId, p_name: name.trim(), p_company: company.trim() || null,
        p_email: email.trim() || null, p_phone: phone.trim() || null,
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
          <FaCrown className="mx-auto text-4xl mb-3" style={{ color: ACCENT_LIGHT }} />
          <p className="text-white font-bold">Tu tarjeta de miembro:</p>
          <div className="my-3 mx-auto inline-block px-6 py-3 rounded-xl border font-mono text-2xl font-black tracking-[0.25em]"
            style={{ background: 'rgba(255,255,255,0.04)', borderColor: `${ACCENT}44`, color: ACCENT_LIGHT }}>{code}</div>
          <p className="text-sm mt-1" style={{ color: `${OFF_WHITE}88` }}>Guárdalo: úsalo al cotizar tus pedidos o consultar tu membresía.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <p className="text-sm" style={{ color: `${OFF_WHITE}99` }}>{clubTagline}</p>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Tu nombre" className={inputCls} style={inputStyle(ACCENT)} />
          <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Empresa / Institución (opcional)" className={inputCls} style={inputStyle(ACCENT)} />
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email" className={inputCls} style={inputStyle(ACCENT)} />
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Teléfono / WhatsApp" className={inputCls} style={inputStyle(ACCENT)} />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button type="submit" disabled={submitting}
            className="w-full py-3.5 rounded-xl text-sm font-black uppercase tracking-wider transition hover:brightness-110 disabled:opacity-50"
            style={{ background: ACCENT, color: ON_ACCENT, fontFamily: TITLE_FONT }}>
            {submitting ? 'Uniéndote…' : 'Quiero unirme'}
          </button>
        </form>
      )}
    </ModalShell>
  );
};

// ── Modal: ver mi membresía ───────────────────────────────────────────────────
const MembershipModal: React.FC<{ userId?: string | null; clubName: string; initialId?: string; onClose: () => void }> = ({ userId, clubName, initialId = '', onClose }) => {
  const ACCENT = useAccent();
  const ON_ACCENT = useOnAccent();
  const [id, setId] = useState(initialId);
  const [loading, setLoading] = useState(false);
  const [member, setMember] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runLookup = useCallback(async (value: string) => {
    if (!userId || !value.trim()) return;
    setError(null); setLoading(true); setMember(null);
    try {
      const { data } = await supabase.rpc('get_sublima_member', { p_factory_id: userId, p_identifier: value.trim() });
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
          <div className="rounded-2xl p-5 border text-center" style={{ background: `linear-gradient(160deg, ${ACCENT}22, rgba(255,255,255,0.03))`, borderColor: `${ACCENT}44` }}>
            <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: ACCENT_LIGHT }}>{clubName}</p>
            <p className="text-white font-bold text-lg mt-1">{member.name || 'Miembro'}</p>
            {member.company && <p className="text-[12px] mt-0.5" style={{ color: `${OFF_WHITE}88` }}>{member.company}</p>}
            <div className="my-2 inline-block px-4 py-2 rounded-lg font-mono text-xl font-black tracking-[0.2em]" style={{ background: 'rgba(0,0,0,0.3)', color: ACCENT_LIGHT }}>{member.member_code}</div>
            <div className="mt-3 text-left"><MemberPlanBadge ownerId={userId} identifier={member.member_code} system="sublima" accent={ACCENT_LIGHT} /></div>
            <div className="flex items-center justify-center gap-4 mt-2 text-sm">
              {member.is_vip && <span className="flex items-center gap-1 font-bold" style={{ color: ACCENT_LIGHT }}><FaCrown size={12} /> VIP</span>}
              {member.discount_percent > 0 && <span className="text-white font-bold">{member.discount_percent}% dcto.</span>}
              <span style={{ color: `${OFF_WHITE}88` }}>{member.orders_count || 0} pedido{(member.orders_count || 0) !== 1 ? 's' : ''}</span>
            </div>
          </div>
          {member.benefits && (
            <div className="rounded-xl p-3 border text-sm" style={{ background: `${ACCENT}0f`, borderColor: `${ACCENT}33`, color: `${OFF_WHITE}dd` }}>
              <span className="font-bold flex items-center gap-1.5" style={{ color: ACCENT_LIGHT }}><FaGift size={11} /> Tus beneficios</span>
              <p className="mt-1 whitespace-pre-wrap">{member.benefits}</p>
            </div>
          )}
          <button onClick={() => { setMember(null); setId(''); }} className="w-full py-3 rounded-xl text-sm font-bold border transition" style={{ borderColor: `${ACCENT}44`, color: OFF_WHITE }}>Consultar otra</button>
        </div>
      ) : (
        <form onSubmit={lookup} className="space-y-3">
          <p className="text-sm" style={{ color: `${OFF_WHITE}99` }}>Ingresa tu código de miembro, email o teléfono.</p>
          <input value={id} onChange={e => setId(e.target.value)} placeholder="S-XXXX / email / teléfono" className={inputCls} style={inputStyle(ACCENT)} />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full py-3.5 rounded-xl text-sm font-black uppercase tracking-wider transition hover:brightness-110 disabled:opacity-50"
            style={{ background: ACCENT, color: ON_ACCENT, fontFamily: TITLE_FONT }}>
            {loading ? 'Buscando…' : 'Consultar'}
          </button>
        </form>
      )}
    </ModalShell>
  );
};

// ── Modal: rastreador de pedido en tiempo real ────────────────────────────────
const TrackerModal: React.FC<{ userId?: string | null; initialCode?: string; onClose: () => void }> = ({ userId, initialCode = '', onClose }) => {
  const ACCENT = useAccent();
  const ON_ACCENT = useOnAccent();
  const [code, setCode] = useState(initialCode);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<any>(null);

  const check = useCallback(async (silent = false) => {
    if (!userId || !code.trim()) return;
    if (!silent) { setError(null); setLoading(true); }
    try {
      const { data } = await supabase.rpc('get_sublima_order_status', { p_factory_id: userId, p_code: code.trim() });
      if (data?.found) setStatus(data);
      else { setStatus(null); if (!silent) setError('No encontramos ese código.'); }
    } catch (err: any) { if (!silent) setError(err?.message || 'Error al consultar.'); }
    finally { if (!silent) setLoading(false); }
  }, [userId, code]);

  // Polling en vivo cada 6s cuando ya hay un pedido cargado.
  useEffect(() => {
    if (!status) return;
    pollRef.current = setInterval(() => check(true), 6000);
    return () => clearInterval(pollRef.current);
  }, [status, check]);

  // Auto-consulta si viene por deep-link.
  useEffect(() => { if (initialCode) check(); /* eslint-disable-next-line */ }, []);

  const stepIndex = status ? TRACK_STEPS.indexOf(status.status) : -1;
  const cancelled = status?.status === 'cancelado';
  const items: SublimaOrderItem[] = Array.isArray(status?.items) ? status.items : [];
  const pay = status?.payment_status ? PAYMENT_META[status.payment_status] : null;

  return (
    <ModalShell title="Rastrear pedido" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); check(); }} className="flex gap-2">
        <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Código (ej. A1B2C3)"
          className={inputCls} style={inputStyle(ACCENT)} />
        <button type="submit" disabled={loading || !code.trim()}
          className="shrink-0 px-5 rounded-xl text-sm font-black uppercase disabled:opacity-40"
          style={{ background: ACCENT, color: ON_ACCENT, fontFamily: TITLE_FONT }}>
          {loading ? '…' : 'Ver'}
        </button>
      </form>
      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}

      {status && (
        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-bold" style={{ color: ACCENT_LIGHT }}>{REQUEST_LABEL[status.request_type] || 'Pedido'}</span>
            <span className="font-mono text-xs" style={{ color: `${OFF_WHITE}88` }}>{status.code}</span>
          </div>

          {/* Artículos */}
          {(items.length > 0 || status.other_items) && (
            <div className="rounded-xl p-3 border text-sm space-y-1.5" style={{ background: 'rgba(255,255,255,0.03)', borderColor: `${OFF_WHITE}12` }}>
              {items.map((it, i) => (
                <div key={i} className="flex items-center justify-between gap-2">
                  <span className="truncate" style={{ color: `${OFF_WHITE}cc` }}>{it.qty} × {it.name}</span>
                  {typeof it.unit_price === 'number' && <span className="shrink-0 text-xs" style={{ color: `${OFF_WHITE}77` }}>{fmtMoney(it.unit_price * it.qty)}</span>}
                </div>
              ))}
              {status.other_items && <p className="text-xs whitespace-pre-wrap" style={{ color: `${OFF_WHITE}88` }}>+ {status.other_items}</p>}
              {status.technique && <p className="text-xs" style={{ color: ACCENT_LIGHT }}>Técnica: {status.technique}</p>}
            </div>
          )}

          {/* Cotización + pago */}
          <div className="rounded-xl p-3.5 border" style={{ background: `${ACCENT}0d`, borderColor: `${ACCENT}33` }}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-widest font-bold" style={{ color: ACCENT_LIGHT }}>
                {status.quoted_total != null ? 'Cotización oficial' : 'Estimado referencial'}
              </span>
              {pay && (
                <span className="text-[10px] font-black uppercase tracking-widest rounded-full px-2.5 py-1" style={{ color: pay.color, background: `${pay.color}1f`, border: `1px solid ${pay.color}44` }}>
                  {pay.label}
                </span>
              )}
            </div>
            <p className="text-2xl font-semibold mt-1.5" style={{ color: '#fff', fontFamily: TITLE_FONT }}>
              {status.quoted_total != null ? fmtMoney(Number(status.quoted_total)) : (status.estimated_total != null ? fmtMoney(Number(status.estimated_total)) : 'Por cotizar')}
            </p>
            {status.quoted_total == null && (
              <p className="text-[10px] mt-1" style={{ color: `${OFF_WHITE}66` }}>El taller confirmará tu cotización oficial pronto.</p>
            )}
          </div>

          {cancelled ? (
            <div className="rounded-xl p-4 text-center border" style={{ background: 'rgba(248,113,113,0.1)', borderColor: 'rgba(248,113,113,0.3)', color: '#f87171' }}>
              Este pedido fue cancelado.
            </div>
          ) : (
            <div className="space-y-2.5">
              {TRACK_STEPS.map((s, i) => {
                const done = i <= stepIndex;
                const current = i === stepIndex;
                return (
                  <div key={s} className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0 transition"
                      style={done ? { background: ACCENT, color: ON_ACCENT } : { background: 'rgba(255,255,255,0.06)', color: `${OFF_WHITE}55` }}>
                      {done ? <FaCheckCircle size={12} /> : i + 1}
                    </div>
                    <span className="text-sm font-bold" style={{ color: current ? '#fff' : done ? OFF_WHITE : `${OFF_WHITE}55` }}>
                      {TRACK_LABEL[s]}{current && <span className="ml-2 text-[10px] font-black uppercase animate-pulse" style={{ color: ACCENT_LIGHT }}>● En vivo</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {status.admin_note && (
            <div className="rounded-xl p-3 border text-sm" style={{ background: `${ACCENT}0f`, borderColor: `${ACCENT}33`, color: `${OFF_WHITE}dd` }}>
              <span className="font-bold" style={{ color: ACCENT_LIGHT }}>Mensaje del taller:</span>
              <p className="mt-1 whitespace-pre-wrap">{status.admin_note}</p>
            </div>
          )}
          {status.needed_date && (
            <p className="text-xs" style={{ color: `${OFF_WHITE}77` }}>📅 Fecha solicitada: {status.needed_date}</p>
          )}
        </div>
      )}
    </ModalShell>
  );
};

export default ProfileSublimaTemplate;
