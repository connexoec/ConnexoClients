import { profileStyleLayer } from '../src/lib/profileStyleLayer';
import React, { useState, useMemo } from 'react';
import { MemberPlanCard } from './MemberPlanCard';
import { useMemberPlan } from '../hooks/useMemberPlan';
import { supabase } from '../src/lib/supabase';
import { ProfileExtraSections } from './ProfileExtraSections';
import FullCatalogView from './FullCatalogView';
import type { Profile, UserLink, Product, Release, TourDate } from '../types';
import {
  FaInstagram, FaFacebookF, FaTiktok, FaTwitter, FaYoutube, FaLinkedinIn,
  FaGlobe, FaSpotify, FaApple, FaSoundcloud, FaPlay, FaShareAlt, FaQrcode,
  FaTicketAlt, FaMapMarkerAlt, FaCalendarAlt, FaShoppingBag, FaHeart,
  FaCheckCircle, FaMusic, FaWhatsapp,
} from 'react-icons/fa';

interface ProfileStageTemplateProps {
  profile: Profile;
  links: UserLink[];
  onLinkClick?: (linkId: string) => void;
  onSelectProduct?: (product: Product) => void;
  onOpenLeadForm?: () => void;
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

const isOn = (profile: any, k: string) => profile?.sectionVisibility?.[k] !== false;

// Detecta el ícono de plataforma de streaming a partir del texto/URL.
const platformIcon = (raw?: string) => {
  const s = (raw || '').toLowerCase();
  if (s.includes('spotify')) return <FaSpotify />;
  if (s.includes('apple')) return <FaApple />;
  if (s.includes('youtube') || s.includes('youtu.be')) return <FaYoutube />;
  if (s.includes('soundcloud')) return <FaSoundcloud />;
  return <FaMusic />;
};

export const ProfileStageTemplate: React.FC<ProfileStageTemplateProps> = ({
  profile,
  links,
  onLinkClick,
  onSelectProduct,
  isMobilePreview = false,
  userId,
  handleShare,
  setShowQRModal,
}) => {
  // Neón de la plantilla. `borderColor` va primero por compatibilidad: es el
  // campo que esta plantilla usó como acento desde v0.26.0, y anteponerle
  // `buttonColor` le cambiaría el color a quien ya lo tenía configurado.
  const accent = profile?.borderColor || profile?.buttonColor || '#22d3ee';
  const plan = (profile?.plan ?? 'free').toString().toLowerCase();
  const isPro = plan === 'pro' || plan === 'ultra';
  const isUltra = plan === 'ultra';

  const releases: Release[] = Array.isArray(profile?.releases) ? profile.releases.filter(r => r?.url || r?.title) : [];
  const tourDates: TourDate[] = Array.isArray(profile?.tourDates) ? profile.tourDates.filter(d => d?.city) : [];
  const allProducts: Product[] = Array.isArray(profile?.products) ? profile.products : [];
  // Límite de catálogo de merch: 10 PRO / 25 ULTRA.
  const merchLimit = isUltra ? 25 : 10;
  const merch = allProducts.slice(0, merchLimit);
  // Vista de catálogo a página completa ("Ver todo") de la tienda de merch.
  const [showFullCatalog, setShowFullCatalog] = useState(false);
  const catalogItems = useMemo(
    () => merch.map((p: any) => ({
      id: String(p.id),
      name: p.name,
      price: p.price,
      image: p.imageURL,
      category: p.category,
      description: p.shortDescription || p.description,
      disabled: p.stock === 0,
      raw: p,
    })),
    [merch],
  );

  // ── Visibilidad + orden de módulos (organizable desde el panel) ──
  const moduleOrder = useMemo(() => {
    const defaults = ['releases', 'tour', 'merch', 'fanbase'];
    const order: any[] = Array.isArray(profile?.sectionOrder) ? profile.sectionOrder : [];
    const rank = (k: string) => {
      const found = order.find((s: any) => s?.type === k);
      return found && typeof found.order === 'number' ? found.order : defaults.indexOf(k) + 100;
    };
    return [...defaults].sort((a, b) => rank(a) - rank(b));
  }, [profile?.sectionOrder]);

  const showReleases = isPro && isOn(profile, 'releases') && releases.length > 0;
  // El enlace de contratación se guarda desde la pestaña Tour del panel, pero
  // esta plantilla nunca lo dibujaba: era un campo huérfano. Ahora la sección
  // también aparece si sólo hay enlace (un artista puede querer ofrecer
  // contratación sin tener fechas anunciadas todavía).
  const bookingLink: string = (profile?.bookingLink || '').toString().trim();
  const showTour = isPro && isOn(profile, 'tour') && (tourDates.length > 0 || !!bookingLink);
  const showMerch = isPro && isOn(profile, 'merch') && merch.length > 0;
  const showFanbase = isPro && isOn(profile, 'fanbase');

  const social = profile?.socialMedia || {};
  const socialLinks: { key: string; href?: string; icon: React.ReactNode }[] = [
    { key: 'instagram', href: social.instagram, icon: <FaInstagram /> },
    { key: 'tiktok', href: social.tiktok, icon: <FaTiktok /> },
    { key: 'youtube', href: social.youtube, icon: <FaYoutube /> },
    { key: 'facebook', href: social.facebook, icon: <FaFacebookF /> },
    { key: 'twitter', href: social.twitter, icon: <FaTwitter /> },
    { key: 'linkedin', href: social.linkedin, icon: <FaLinkedinIn /> },
    { key: 'website', href: social.website, icon: <FaGlobe /> },
  ].filter(s => s.href && s.href.trim());

  const SectionHeading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="flex items-center gap-3 mb-5">
      <span className="h-px flex-1" style={{ background: `linear-gradient(90deg, transparent, ${accent}66)` }} />
      <h2 className="text-xs font-black uppercase tracking-[0.3em] whitespace-nowrap" style={{ color: accent, fontFamily: "'Space Grotesk', sans-serif" }}>
        {children}
      </h2>
      <span className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${accent}66, transparent)` }} />
    </div>
  );

  // ── Módulos renderizables (clave → JSX) ──
  const modules: Record<string, React.ReactNode> = {
    releases: showReleases ? (
      <section key="releases">
        <SectionHeading>Lanzamientos</SectionHeading>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {releases.map((r) => (
            <a key={r.id} href={r.url || '#'} target="_blank" rel="noopener noreferrer"
              className="group flex items-center gap-3 rounded-2xl p-3 border transition-all hover:-translate-y-0.5"
              style={{ background: 'rgba(255,255,255,0.04)', borderColor: `${accent}22` }}>
              <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 relative" style={{ background: '#0a0a12' }}>
                {r.coverURL
                  ? <img src={r.coverURL} alt={r.title} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-2xl" style={{ color: accent }}>{platformIcon(r.platform || r.url)}</div>}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition" style={{ background: 'rgba(0,0,0,0.45)' }}>
                  <FaPlay style={{ color: accent }} />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-white font-bold text-sm truncate">{r.title || 'Nuevo lanzamiento'}</p>
                <p className="text-[11px] text-white/45 flex items-center gap-1.5 mt-0.5">
                  <span style={{ color: accent }}>{platformIcon(r.platform || r.url)}</span>
                  {r.platform || 'Escuchar ahora'}
                </p>
                {r.releaseDate && <p className="text-[10px] text-white/30 mt-0.5">{r.releaseDate}</p>}
              </div>
            </a>
          ))}
        </div>
      </section>
    ) : null,

    tour: showTour ? (
      <section key="tour">
        <SectionHeading>Tour & Tickets</SectionHeading>
        <div className="space-y-2.5">
          {tourDates.map((d) => (
            <div key={d.id}
              className="flex items-center gap-4 rounded-2xl p-4 border"
              style={{ background: 'rgba(255,255,255,0.04)', borderColor: `${accent}22` }}>
              <div className="flex flex-col items-center justify-center shrink-0 w-14">
                <FaCalendarAlt className="text-base mb-1" style={{ color: accent }} />
                <span className="text-[10px] font-bold text-white/60 text-center leading-tight">{d.date || 'Próx.'}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-white font-bold text-sm truncate flex items-center gap-1.5">
                  <FaMapMarkerAlt size={11} style={{ color: accent }} /> {d.city}
                </p>
                {d.venue && <p className="text-[12px] text-white/45 truncate">{d.venue}</p>}
              </div>
              {d.soldOut ? (
                <span className="shrink-0 text-[10px] font-black uppercase tracking-wider px-3 py-2 rounded-xl bg-white/5 text-white/40 border border-white/10">
                  Agotado
                </span>
              ) : d.ticketURL ? (
                <a href={d.ticketURL} target="_blank" rel="noopener noreferrer"
                  className="shrink-0 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider px-3.5 py-2.5 rounded-xl transition hover:brightness-110"
                  style={{ background: accent, color: '#06060c' }}>
                  <FaTicketAlt size={12} /> Tickets
                </a>
              ) : null}
            </div>
          ))}
          {/* Contratación general: mismo estilo que el botón de tickets de
              cada fecha, para no introducir un lenguaje visual nuevo. */}
          {bookingLink && (
            <a href={bookingLink} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 text-[11px] font-black uppercase tracking-wider px-3.5 py-3.5 rounded-2xl transition hover:brightness-110"
              style={{ background: accent, color: '#06060c' }}>
              <FaCalendarAlt size={12} /> Contrataciones
            </a>
          )}
        </div>
      </section>
    ) : null,

    merch: showMerch ? (
      <section key="merch">
        <SectionHeading>Merch Store</SectionHeading>
        <div className="grid grid-cols-2 gap-3">
          {merch.map((p) => (
            <button key={p.id} onClick={() => onSelectProduct?.(p)}
              className="group text-left rounded-2xl overflow-hidden border transition-all hover:-translate-y-1"
              style={{ background: 'rgba(255,255,255,0.04)', borderColor: `${accent}22` }}>
              <div className="aspect-square relative" style={{ background: '#0a0a12' }}>
                {p.imageURL
                  ? <img src={p.imageURL} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  : <div className="w-full h-full flex items-center justify-center"><FaShoppingBag className="text-3xl text-white/15" /></div>}
              </div>
              <div className="p-3">
                <p className="cnx-product-text text-white font-bold text-sm truncate">{p.name}</p>
                {p.price && <p className="text-sm font-black mt-0.5" style={{ color: accent }}>{p.price}</p>}
              </div>
            </button>
          ))}
        </div>
        {merch.length > 4 && (
          <button type="button" onClick={() => setShowFullCatalog(true)}
            className="mt-4 w-full py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all hover:brightness-110 active:scale-95 flex items-center justify-center gap-2"
            style={{ background: accent, color: '#06060c' }}>
            <FaShoppingBag size={12} /> Ver toda la tienda ({merch.length})
          </button>
        )}
      </section>
    ) : null,

    fanbase: showFanbase ? (
      <React.Fragment key="fanbase">
        <FanBaseModule accent={accent} userId={userId} artistName={profile?.displayName} isMobilePreview={isMobilePreview} />
        <StageMemberLookup accent={accent} userId={userId} />
      </React.Fragment>
    ) : null,
  };

  return (
    <div
      className={`min-h-screen relative overflow-hidden ${profileStyleLayer(profile).className}`}
      style={{
        ...profileStyleLayer(profile).style,
        backgroundColor: profile?.backgroundColor || '#06060c',
        color: profile?.textColor || '#ffffff',
        fontFamily: profile?.fontFamily || "'Space Grotesk', sans-serif",
      }}
    >
      {/* Glow ambiental de escenario */}
      {!isMobilePreview && (
        <>
          <div aria-hidden className="pointer-events-none fixed -top-40 left-1/2 -translate-x-1/2 w-[120vw] h-[60vh] rounded-full blur-[120px] opacity-30"
            style={{ background: `radial-gradient(circle, ${accent}, transparent 70%)` }} />
          <div aria-hidden className="pointer-events-none fixed bottom-0 right-0 w-[60vw] h-[40vh] rounded-full blur-[120px] opacity-20"
            style={{ background: `radial-gradient(circle, ${accent}, transparent 70%)` }} />
        </>
      )}

      <div className="relative z-10 max-w-2xl mx-auto px-4 pt-16 pb-24 space-y-12">
        {/* ── HERO ── */}
        <header className="text-center">
          {profile?.coverImageURL && (
            <div className="absolute inset-x-0 top-0 h-64 -z-0 opacity-40" style={{ maskImage: 'linear-gradient(to bottom, black, transparent)' }}>
              <img src={profile.coverImageURL} alt="" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="relative">
            <div className="inline-block rounded-full p-1 mb-5" style={{ background: `linear-gradient(135deg, ${accent}, transparent)` }}>
              <img
                src={profile?.profilePhotoURL || profile?.logoURL || 'https://via.placeholder.com/150'}
                alt={profile?.displayName}
                className="w-32 h-32 rounded-full object-cover"
                style={{ border: '3px solid #06060c' }}
              />
            </div>
            <h1 className="text-4xl font-black tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              {profile?.displayName || 'Artista'}
            </h1>
            {profile?.jobTitle && (
              <p className="text-sm font-bold uppercase tracking-[0.3em] mt-2" style={{ color: accent }}>
                {profile.jobTitle}
              </p>
            )}
            {(profile?.bio || profile?.aboutMe) && (
              <p className="text-white/55 text-sm leading-relaxed mt-4 max-w-md mx-auto whitespace-pre-wrap">
                {profile.bio || profile.aboutMe}
              </p>
            )}

            {/* Redes sociales */}
            {socialLinks.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-2.5 mt-6">
                {socialLinks.map(s => (
                  <a key={s.key} href={s.href} target="_blank" rel="noopener noreferrer"
                    className="w-11 h-11 rounded-full flex items-center justify-center text-white/70 hover:text-white transition-all hover:-translate-y-0.5 border"
                    style={{ background: 'rgba(255,255,255,0.05)', borderColor: `${accent}33` }}>
                    <span className="text-base">{s.icon}</span>
                  </a>
                ))}
              </div>
            )}

            {/* Acciones */}
            <div className="flex items-center justify-center gap-2.5 mt-6">
              <button onClick={() => handleShare?.()}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition hover:brightness-110"
                style={{ background: accent, color: '#06060c' }}>
                <FaShareAlt size={12} /> Compartir
              </button>
              <button onClick={() => setShowQRModal?.(true)}
                className="w-11 h-11 rounded-xl flex items-center justify-center text-white/70 hover:text-white border transition"
                style={{ background: 'rgba(255,255,255,0.05)', borderColor: `${accent}33` }}>
                <FaQrcode />
              </button>
              {profile?.whatsapp && (
                <a href={`https://wa.me/${profile.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
                  className="w-11 h-11 rounded-xl flex items-center justify-center text-[#25D366] border transition hover:bg-[#25D366]/10"
                  style={{ background: 'rgba(255,255,255,0.05)', borderColor: '#25D36633' }}>
                  <FaWhatsapp />
                </a>
              )}
            </div>
          </div>
        </header>

        {/* ── MÓDULOS ORDENABLES ── */}
        {moduleOrder.map(key => modules[key]).filter(Boolean)}

        {/* ── Enlaces personalizados (PRO+) ── */}
        {isPro && isOn(profile, 'links') && links.filter(l => l.isActive).length > 0 && (
          <section>
            <SectionHeading>Enlaces</SectionHeading>
            <div className="space-y-2.5">
              {links.filter(l => l.isActive).sort((a, b) => a.order - b.order).map(l => (
                <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer" onClick={() => onLinkClick?.(l.id)}
                  className="block w-full text-center rounded-xl py-3.5 px-4 text-sm font-bold transition hover:-translate-y-0.5 border"
                  style={{ background: 'rgba(255,255,255,0.04)', borderColor: `${accent}22`, color: '#fff' }}>
                  {l.title}
                </a>
              ))}
            </div>
          </section>
        )}

        {/* ── Videos Nativos (ULTRA) + EPK/Archivos (ULTRA) + Galería/FAQs ── */}
        <ProfileExtraSections profile={profile} accent={accent} isMobilePreview={isMobilePreview} />

        {/* Footer */}
        <footer className="text-center pt-6">
          <a href="https://connexo.app" target="_blank" rel="noopener noreferrer"
            className="text-[10px] uppercase tracking-[0.3em] text-white/25 hover:text-white/50 transition">
            Powered by Connexo
          </a>
        </footer>
      </div>

      {showFullCatalog && (
        <FullCatalogView
          items={catalogItems}
          onBack={() => setShowFullCatalog(false)}
          onSelect={(raw) => { setShowFullCatalog(false); onSelectProduct?.(raw); }}
          accent={accent}
          bg={profile?.backgroundColor || '#06060c'}
          text={profile?.textColor || '#ffffff'}
          fontFamily={profile?.fontFamily || "'Space Grotesk', sans-serif"}
          title="Merch Store"
          searchPlaceholder="Buscar por nombre o categoría"
          ctaLabel="Ver →"
          isMobilePreview={isMobilePreview}
        />
      )}
    </div>
  );
};

// ── Módulo Fan Base (Lead Gen directo a stage_fans) ──────────────────────────
/**
 * Consulta de estado del fan por su código.
 *
 * Stage era la única plantilla sin carnet: sus fans se registraban y no podían
 * consultar nada. Sin esto no hay dónde enseñarles las cuotas de su plan.
 * El código lo genera `setup_member_plans.sql` (formato F-XXXX).
 *
 * Sólo se dibuja si hay algo que enseñar: si el fan no existe o no tiene plan,
 * la tarjeta no aparece y la sección queda como estaba.
 */
const StageMemberLookup: React.FC<{ accent: string; userId?: string | null }> = ({ accent, userId }) => {
  const [code, setCode] = React.useState('');
  const [query, setQuery] = React.useState('');
  const plan = useMemberPlan(userId, query || null, 'stage', !!query);
  const [buscado, setBuscado] = React.useState(false);

  if (!userId) return null;

  return (
    <section className="mt-4">
      <div className="rounded-2xl p-5 border"
        style={{ background: 'rgba(255,255,255,0.02)', borderColor: `${accent}22` }}>
        <p className="text-[11px] font-bold uppercase tracking-widest mb-2.5" style={{ color: accent }}>
          ¿Ya eres del club? Consulta tu estado
        </p>
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); setQuery(code.trim()); setBuscado(true); }}>
          <input value={code} onChange={e => setCode(e.target.value)}
            placeholder="Tu código, correo o teléfono"
            className="flex-1 min-w-0 bg-black/40 border text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none placeholder-white/30"
            style={{ borderColor: `${accent}33` }} />
          <button type="submit" disabled={!code.trim()}
            className="px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-black disabled:opacity-40 shrink-0"
            style={{ background: accent }}>
            Ver
          </button>
        </form>

        {plan && <div className="mt-3"><MemberPlanCard plan={plan} accent={accent} /></div>}

        {buscado && query && plan && plan.found && !plan.has_plan && (
          <p className="text-[11px] text-white/45 mt-3">Estás registrado y no tienes pagos pendientes.</p>
        )}
        {buscado && query && plan && !plan.found && (
          <p className="text-[11px] text-white/45 mt-3">No encontramos ese código. Revísalo e inténtalo de nuevo.</p>
        )}
      </div>
    </section>
  );
};

const FanBaseModule: React.FC<{ accent: string; userId?: string | null; artistName?: string; isMobilePreview?: boolean }> = ({ accent, userId, artistName, isMobilePreview }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Campaña: deep-link ?campaign=... para atribuir la captación.
  const campaign = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('campaign');
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isMobilePreview) return; // no enviar desde la vista previa del panel
    if (!name.trim()) { setError('Escribe tu nombre.'); return; }
    if (!email.trim() && !phone.trim()) { setError('Déjanos tu email o teléfono.'); return; }
    if (!userId) { setError('No se pudo identificar al artista.'); return; }
    setError(null);
    setSubmitting(true);
    try {
      const { error: rpcError } = await supabase.rpc('join_stage_fanbase', {
        p_profile_id: userId,
        p_name: name.trim(),
        p_email: email.trim() || null,
        p_phone: phone.trim() || null,
        p_source_campaign: campaign || null,
      });
      if (rpcError) throw rpcError;
      setDone(true);
    } catch (err: any) {
      setError(err?.message || 'No se pudo completar el registro.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section>
      <div className="relative rounded-3xl p-7 border overflow-hidden text-center"
        style={{ background: `linear-gradient(160deg, ${accent}14, rgba(255,255,255,0.03))`, borderColor: `${accent}33` }}>
        <div aria-hidden className="absolute -top-20 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full blur-3xl opacity-20" style={{ background: accent }} />
        {done ? (
          <div className="relative py-4">
            <FaCheckCircle className="mx-auto text-4xl mb-3" style={{ color: accent }} />
            <h3 className="text-xl font-black text-white">¡Estás dentro! 🎶</h3>
            <p className="text-white/55 text-sm mt-2">Serás el primero en enterarte de nuevos lanzamientos, conciertos y drops exclusivos.</p>
          </div>
        ) : (
          <div className="relative">
            <FaHeart className="mx-auto text-3xl mb-3" style={{ color: accent }} />
            <h3 className="text-2xl font-black text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Únete al Fan Club
            </h3>
            <p className="text-white/55 text-sm mt-2 max-w-sm mx-auto">
              Recibe acceso anticipado a entradas, lanzamientos y contenido exclusivo de {artistName || 'el artista'}.
            </p>
            <form onSubmit={submit} className="mt-5 space-y-2.5 max-w-sm mx-auto">
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Tu nombre"
                className="w-full bg-black/40 border text-white text-sm rounded-xl px-4 py-3 focus:outline-none placeholder-white/30"
                style={{ borderColor: `${accent}33` }} />
              <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email"
                className="w-full bg-black/40 border text-white text-sm rounded-xl px-4 py-3 focus:outline-none placeholder-white/30"
                style={{ borderColor: `${accent}33` }} />
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Teléfono / WhatsApp (opcional)"
                className="w-full bg-black/40 border text-white text-sm rounded-xl px-4 py-3 focus:outline-none placeholder-white/30"
                style={{ borderColor: `${accent}33` }} />
              {error && <p className="text-red-400 text-xs">{error}</p>}
              <button type="submit" disabled={submitting}
                className="w-full py-3.5 rounded-xl text-sm font-black uppercase tracking-wider transition hover:brightness-110 disabled:opacity-50"
                style={{ background: accent, color: '#06060c' }}>
                {submitting ? 'Enviando…' : 'Quiero ser fan'}
              </button>
            </form>
          </div>
        )}
      </div>
    </section>
  );
};

export default ProfileStageTemplate;
