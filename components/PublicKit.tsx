import React, { createContext, useContext } from 'react';
import {
  FaTimes, FaArrowRight, FaCheckCircle, FaShareAlt, FaQrcode, FaWhatsapp, FaPhoneAlt,
  FaRegAddressCard, FaMapMarkerAlt, FaInstagram, FaFacebookF, FaTiktok, FaTwitter,
  FaYoutube, FaLinkedinIn, FaGlobe, FaStar, FaRegClock,
} from 'react-icons/fa';

/**
 * Piezas visuales compartidas por las plantillas Gimnasio y Hotel.
 *
 * Están escritas una sola vez y se tematizan por contexto: copiarlas en cada
 * plantilla es lo que dejó el modal de reseñas duplicado y divergido hasta
 * v0.46.1, y aquí serían dos plantillas de ~1000 líneas cada una. Mantienen la
 * estructura estándar de Connexo (portada → logo → identidad → contacto →
 * redes → ubicación → píldoras → tarjetas de acción → pase de socio →
 * catálogo) y cada plantilla aporta su propia paleta, tipografía y detalles.
 */

export interface KitTheme {
  accent: string;        // color de acento (se sobreescribe con profile.buttonColor)
  accentLight: string;
  accentDark: string;
  bg: string;
  surface: string;       // modales y paneles
  text: string;
  onAccent: string;      // texto sobre el acento
  titleFont: string;
  bodyFont: string;
  /** gym: barra inclinada a la izquierda · hotel: ornamento centrado. */
  heading: 'slash' | 'ornament';
  /** Forma del logo: gym cuadrado con corte, hotel redondo. */
  logo: 'square' | 'round';
}

const KitContext = createContext<KitTheme | null>(null);
export const KitProvider: React.FC<{ theme: KitTheme; children: React.ReactNode }> = ({ theme, children }) => (
  <KitContext.Provider value={theme}>{children}</KitContext.Provider>
);
export const useKit = (): KitTheme => {
  const k = useContext(KitContext);
  if (!k) throw new Error('useKit debe usarse dentro de <KitProvider>');
  return k;
};

export const isOn = (profile: any, key: string) => profile?.sectionVisibility?.[key] !== false;

/** Aclara (amt > 0) u oscurece (amt < 0) un hex de 6 dígitos. Para derivar las variantes del acento elegido. */
export const shade = (hex: string, amt: number) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
  const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
};

/**
 * Color de texto legible sobre un acento. El cliente puede elegir cualquier
 * acento desde Apariencia: con uno oscuro, el texto oscuro de fábrica
 * dejaría los botones ilegibles.
 */
export const readableOn = (hex: string, dark: string, light = '#ffffff') => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return dark;
  const n = parseInt(m[1], 16);
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.4 ? dark : light;
};

export const fmtMoney = (n?: number | null, empty = 'Consultar') =>
  typeof n === 'number' && isFinite(n)
    ? `$${n.toLocaleString('es-EC', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`
    : empty;

/** Fecha local YYYY-MM-DD (nunca toISOString: en UTC-5 después de las 19:00 ya es "mañana"). */
export const localISO = (d: Date = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Suma días a una fecha YYYY-MM-DD sin construir fechas locales (evita saltos de horario de verano). */
export const addDaysISO = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  t.setUTCDate(t.getUTCDate() + n);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
};

export const prettyDate = (iso?: string | null, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) => {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('es-EC', opts);
};

export const waDigits = (phone?: string | null) => {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '593' + d.slice(1);   // Ecuador: 0XXXXXXXXX → 593XXXXXXXXX
  return d;
};

/* ── Estilos de formulario ─────────────────────────────────────────────────── */
export const inputCls = 'w-full bg-black/40 border text-sm rounded-xl px-4 py-3 focus:outline-none placeholder-white/30';
export const useInputStyle = (): React.CSSProperties => {
  const k = useKit();
  return { borderColor: `${k.accent}33`, color: k.text };
};

/* ── Encabezado de sección ─────────────────────────────────────────────────── */
export const SectionHeading: React.FC<{ children: React.ReactNode; kicker?: string }> = ({ children, kicker }) => {
  const k = useKit();
  if (k.heading === 'slash') {
    return (
      <div className="mb-5 flex items-end gap-3">
        <span aria-hidden className="block w-1.5 h-9 -skew-x-[14deg] rounded-[2px] shrink-0" style={{ background: k.accent }} />
        <div className="min-w-0">
          {kicker && <p className="text-[10px] font-semibold uppercase tracking-[0.32em] mb-0.5" style={{ color: k.accentLight }}>{kicker}</p>}
          <h2 className="text-[19px] leading-none font-semibold uppercase tracking-[0.1em] text-white" style={{ fontFamily: k.titleFont }}>{children}</h2>
        </div>
      </div>
    );
  }
  return (
    <div className="text-center mb-7">
      {kicker && <p className="text-[10px] font-semibold uppercase tracking-[0.4em] mb-2" style={{ color: k.accentLight }}>{kicker}</p>}
      <h2 className="text-[22px] font-bold tracking-[0.02em] text-white" style={{ fontFamily: k.titleFont }}>{children}</h2>
      <div className="mt-3 flex items-center justify-center gap-2.5" aria-hidden>
        <span className="h-px w-10" style={{ background: `linear-gradient(90deg, transparent, ${k.accent})` }} />
        <span className="block w-1.5 h-1.5 rotate-45" style={{ background: k.accent }} />
        <span className="h-px w-10" style={{ background: `linear-gradient(270deg, transparent, ${k.accent})` }} />
      </div>
    </div>
  );
};

/* ── Píldora oscura (enlace) ───────────────────────────────────────────────── */
export const PillLink: React.FC<{ onClick?: () => void; href?: string; icon?: React.ReactNode; children: React.ReactNode; onNavigate?: () => void }> = ({ onClick, href, icon, children, onNavigate }) => {
  const k = useKit();
  const cls = 'flex items-center justify-center gap-2 w-full rounded-2xl py-4 px-4 text-[13px] font-semibold tracking-wide transition hover:-translate-y-0.5';
  const style = { background: k.surface, border: `1px solid ${k.text}12`, color: k.text } as React.CSSProperties;
  if (href) {
    return <a href={href} target="_blank" rel="noopener noreferrer" onClick={onNavigate} className={cls} style={style}>{icon} {children}</a>;
  }
  return <button type="button" onClick={onClick} className={cls} style={style}>{icon} {children}</button>;
};

/* ── Tarjeta de acción ─────────────────────────────────────────────────────── */
export const FeatureCard: React.FC<{ icon: React.ReactNode; title: string; desc: string; onClick: () => void; badge?: string }> = ({ icon, title, desc, onClick, badge }) => {
  const k = useKit();
  return (
    <button type="button" onClick={onClick}
      className="w-full text-left rounded-2xl p-4 flex items-center gap-4 border transition hover:-translate-y-0.5 group relative overflow-hidden"
      style={{ background: k.surface, borderColor: `${k.accent}44` }}>
      <div className={`w-12 h-12 flex items-center justify-center shrink-0 text-lg ${k.logo === 'round' ? 'rounded-full' : 'rounded-xl'}`}
        style={{ background: `${k.accent}1a`, border: `1px solid ${k.accent}33`, color: k.accentLight }}>{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-white font-semibold text-[15px] tracking-[0.01em]" style={{ fontFamily: k.titleFont }}>{title}</p>
        <p className="text-[12px] leading-snug mt-0.5" style={{ color: `${k.text}b3` }}>{desc}</p>
      </div>
      {badge && <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.15em] px-2 py-1 rounded-full" style={{ background: k.accent, color: k.onAccent }}>{badge}</span>}
      <FaArrowRight size={13} className="shrink-0 transition group-hover:translate-x-0.5" style={{ color: k.accentLight }} />
    </button>
  );
};

/* ── Chip de filtro ────────────────────────────────────────────────────────── */
export const FilterChip: React.FC<{ active: boolean; onClick: () => void; label: string; count?: number; color?: string }> = ({ active, onClick, label, count, color }) => {
  const k = useKit();
  const c = color || k.accent;
  return (
    <button type="button" onClick={onClick}
      className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[10px] font-semibold uppercase tracking-[0.15em] transition border"
      style={active ? { background: c, color: k.onAccent, borderColor: c } : { background: 'transparent', color: `${k.text}cc`, borderColor: `${k.text}22` }}>
      {label}
      {count != null && <span className="text-[9px] font-semibold opacity-60">{count}</span>}
    </button>
  );
};

/* ── Modal ─────────────────────────────────────────────────────────────────── */
export const ModalShell: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; z?: number; wide?: boolean }> = ({ title, onClose, children, z = 10000, wide }) => {
  const k = useKit();
  return (
    <div className="fixed inset-0 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-sm" style={{ zIndex: z }} onClick={onClose}>
      <div className={`w-full ${wide ? 'sm:max-w-lg' : 'sm:max-w-md'} rounded-t-2xl sm:rounded-2xl border p-6 space-y-3`}
        style={{ background: k.surface, borderColor: `${k.accent}33`, maxHeight: '92svh', overflowY: 'auto', fontFamily: k.bodyFont, color: k.text }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-white tracking-[0.02em]" style={{ fontFamily: k.titleFont }}>{title}</h3>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-white/60 hover:text-white shrink-0"><FaTimes /></button>
        </div>
        {children}
      </div>
    </div>
  );
};

export const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const k = useKit();
  return <p className="text-[11px] uppercase tracking-widest font-bold mb-1.5" style={{ color: k.accentLight }}>{children}</p>;
};

export const PrimaryButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ children, style, className = '', ...rest }) => {
  const k = useKit();
  return (
    <button {...rest}
      className={`w-full py-3.5 rounded-xl text-[12px] font-bold uppercase tracking-[0.16em] transition hover:brightness-110 disabled:opacity-50 ${className}`}
      style={{ background: k.accent, color: k.onAccent, fontFamily: k.titleFont, ...style }}>
      {children}
    </button>
  );
};

export const GhostButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ children, style, className = '', ...rest }) => {
  const k = useKit();
  return (
    <button {...rest}
      className={`w-full py-3 rounded-xl text-[12px] font-semibold border transition hover:bg-white/[0.04] disabled:opacity-40 ${className}`}
      style={{ borderColor: `${k.accent}55`, color: k.text, ...style }}>
      {children}
    </button>
  );
};

/** Código grande (rastreo, carnet, confirmación). */
export const CodeBox: React.FC<{ code: string; small?: boolean }> = ({ code, small }) => {
  const k = useKit();
  return (
    <div className={`my-3 mx-auto inline-block px-6 py-3 rounded-xl border font-mono font-black tracking-[0.28em] ${small ? 'text-xl' : 'text-2xl'}`}
      style={{ background: 'rgba(255,255,255,0.04)', borderColor: `${k.accent}44`, color: k.accentLight }}>{code}</div>
  );
};

/** Pipeline vertical de pasos con el actual "En vivo". */
export const TrackerSteps: React.FC<{ steps: string[]; labels: Record<string, string>; current: string }> = ({ steps, labels, current }) => {
  const k = useKit();
  const idx = steps.indexOf(current);
  return (
    <div className="space-y-2.5">
      {steps.map((s, i) => {
        const done = i <= idx; const now = i === idx;
        return (
          <div key={s} className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0 transition"
              style={done ? { background: k.accent, color: k.onAccent } : { background: 'rgba(255,255,255,0.06)', color: `${k.text}b3` }}>
              {done ? <FaCheckCircle size={12} /> : i + 1}
            </div>
            <span className="text-sm font-bold" style={{ color: now ? '#fff' : done ? k.text : `${k.text}55` }}>
              {labels[s] || s}
              {now && <span className="ml-2 text-[10px] font-black uppercase animate-pulse" style={{ color: k.accentLight }}>● En vivo</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
};

/** Pase de socio / huésped: caja para consultar el carnet por código, email o teléfono. */
export const PassCard: React.FC<{
  kicker: string; badge: string; title: string; desc: string; button: string; placeholder: string; onOpen: (id: string) => void;
}> = ({ kicker, badge, title, desc, button, placeholder, onOpen }) => {
  const k = useKit();
  const [id, setId] = React.useState('');
  return (
    <div className="rounded-2xl p-5 border" style={{ background: `linear-gradient(160deg, ${k.accent}14, ${k.surface})`, borderColor: `${k.accent}44` }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[9px] font-semibold uppercase tracking-[0.3em]" style={{ color: k.accentLight }}>{kicker}</span>
        <span className="text-[9px] font-semibold uppercase tracking-[0.2em] px-2.5 py-1 rounded-full" style={{ border: `1px solid ${k.accent}55`, color: k.accentLight }}>{badge}</span>
      </div>
      <h3 className="text-white font-semibold text-lg tracking-[0.02em]" style={{ fontFamily: k.titleFont }}>{title}</h3>
      <p className="text-[12px] leading-relaxed mt-1" style={{ color: `${k.text}99` }}>{desc}</p>
      <form onSubmit={e => { e.preventDefault(); onOpen(id.trim()); }} className="mt-4 space-y-2.5">
        <input value={id} onChange={e => setId(e.target.value)} placeholder={placeholder}
          className="w-full bg-black/30 border text-sm rounded-xl px-4 py-3 focus:outline-none placeholder-white/30"
          style={{ borderColor: `${k.text}1a`, color: k.text }} />
        <PrimaryButton type="submit">{button}</PrimaryButton>
      </form>
    </div>
  );
};

/** Horario de atención (businessHours del perfil). Solo si showSchedule no está apagado. */
export const HoursSection: React.FC<{ profile: any; title?: string }> = ({ profile, title = 'Horarios' }) => {
  const k = useKit();
  const hours = Array.isArray(profile?.businessHours) ? profile.businessHours : [];
  if (profile?.showSchedule === false || hours.length === 0 || !isOn(profile, 'schedule')) return null;
  return (
    <section>
      <SectionHeading kicker="Atención">{title}</SectionHeading>
      <div className="rounded-2xl overflow-hidden border" style={{ background: k.surface, borderColor: `${k.text}12` }}>
        {hours.map((day: any, i: number) => (
          <div key={i} className={`flex items-center justify-between px-4 py-3 ${i < hours.length - 1 ? 'border-b' : ''}`} style={{ borderColor: `${k.text}0d` }}>
            <span className="text-sm font-semibold text-white/80 flex items-center gap-2"><FaRegClock size={11} style={{ color: k.accentLight }} /> {day.day}</span>
            {day.isOpen
              ? <span className="text-sm font-semibold" style={{ color: k.accentLight }}>{day.openTime} – {day.closeTime}</span>
              : <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: `${k.text}b3` }}>Cerrado</span>}
          </div>
        ))}
      </div>
    </section>
  );
};

/** Reseñas aprobadas + botón para dejar una (solo fuera de la vista previa del panel). */
export const ReviewsSection: React.FC<{ profile: any; onLeave?: () => void; isMobilePreview?: boolean; title?: string; kicker?: string }> = ({ profile, onLeave, isMobilePreview, title = 'Opiniones', kicker = 'Reseñas' }) => {
  const k = useKit();
  const list: any[] = Array.isArray(profile?.testimonials) ? profile.testimonials : [];
  const canLeave = !!onLeave && !isMobilePreview;
  const isProOrUltra = ['pro', 'ultra'].includes(String(profile?.plan || '').toLowerCase());
  if (!isOn(profile, 'testimonials') || !isProOrUltra || (list.length === 0 && !canLeave)) return null;
  return (
    <section>
      <SectionHeading kicker={kicker}>{title}</SectionHeading>
      <div className="space-y-3">
        {list.map(t => (
          <div key={t.id} className="rounded-2xl p-4 border" style={{ background: 'rgba(255,255,255,0.025)', borderColor: `${k.text}12` }}>
            <div className="flex gap-0.5 mb-2" aria-hidden>{[0, 1, 2, 3, 4].map(i => <FaStar key={i} size={11} style={{ color: k.accent }} />)}</div>
            <p className="cnx-testimonial-text text-[13px] italic leading-relaxed" style={{ color: `${k.text}cc` }}>"{t.quote}"</p>
            <div className="flex items-center gap-2.5 mt-3">
              {t.authorImageURL && <img src={t.authorImageURL} alt={t.author} className="w-7 h-7 rounded-full object-cover" style={{ border: `1px solid ${k.accent}55` }} />}
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider truncate" style={{ color: k.accentLight }}>{t.author}</p>
                {t.authorTitle && <p className="text-[10px] truncate" style={{ color: `${k.text}b3` }}>{t.authorTitle}</p>}
              </div>
            </div>
          </div>
        ))}
        {list.length === 0 && <p className="text-xs italic text-center py-3" style={{ color: `${k.text}b3` }}>Aún no hay opiniones. ¡Sé el primero en dejar una!</p>}
      </div>
      {canLeave && (
        <div className="mt-4 text-center">
          <button type="button" onClick={onLeave}
            className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] rounded-full py-2.5 px-5 border transition hover:bg-white/[0.04] min-h-[44px]"
            style={{ borderColor: `${k.accent}66`, color: k.accentLight }}>
            ✍ Dejar una reseña
          </button>
        </div>
      )}
    </section>
  );
};

/* ── Encabezado estándar: portada → logo → identidad → contacto → redes → ubicación ─ */
interface HeroProps {
  profile: any;
  roleFallback: string;
  waText: string;
  contactWhatsapp?: string;
  setShowQRModal?: (show: boolean) => void;
  downloadVCard?: () => Promise<void> | void;
  isVCardLoading?: boolean;
  handleShare?: () => Promise<void> | void;
  /** Línea extra bajo el cargo (p. ej. las estrellas del hotel). */
  extra?: React.ReactNode;
  children: React.ReactNode;
}

export const ProfileHero: React.FC<HeroProps> = ({
  profile, roleFallback, waText, contactWhatsapp, setShowQRModal, downloadVCard, isVCardLoading, handleShare, extra, children,
}) => {
  const k = useKit();
  const wa = contactWhatsapp || waDigits(profile?.whatsapp);
  const sqCls = 'w-11 h-11 rounded-xl flex items-center justify-center transition hover:-translate-y-0.5 disabled:opacity-50';
  const sqStyle = { background: k.surface, border: `1px solid ${k.text}16`, color: k.text } as React.CSSProperties;
  const social = profile?.socialMedia || {};
  const socials = [
    { key: 'instagram', href: social.instagram, icon: <FaInstagram /> },
    { key: 'facebook', href: social.facebook, icon: <FaFacebookF /> },
    { key: 'tiktok', href: social.tiktok, icon: <FaTiktok /> },
    { key: 'youtube', href: social.youtube, icon: <FaYoutube /> },
    { key: 'twitter', href: social.twitter, icon: <FaTwitter /> },
    { key: 'linkedin', href: social.linkedin, icon: <FaLinkedinIn /> },
    { key: 'website', href: social.website, icon: <FaGlobe /> },
  ].filter(s => s.href && String(s.href).trim());
  const location = profile?.location || (Array.isArray(profile?.locations) && profile.locations[0]) || '';
  const bg = profile?.backgroundColor || k.bg;

  return (
    <>
      <div className="relative h-52 sm:h-60 w-full overflow-hidden">
        {profile?.coverImageURL
          ? <img src={profile.coverImageURL} alt="" className="w-full h-full object-cover" />
          : <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${k.accentDark}55, ${k.bg})` }} />}
        <div className="absolute inset-0" style={{ background: `linear-gradient(to top, ${bg} 3%, transparent 68%)` }} />
      </div>

      <div className="px-4 -mt-16 relative space-y-9">
        <header className="text-center">
          <div className={`inline-block p-1.5 mb-4 ${k.logo === 'round' ? 'rounded-full' : 'rounded-[22px]'}`}
            style={{ background: k.surface, border: `1px solid ${k.accent}44`, boxShadow: '0 16px 44px -14px rgba(0,0,0,0.75)' }}>
            <img src={profile?.logoURL || profile?.profilePhotoURL || 'https://via.placeholder.com/150'} alt={profile?.displayName}
              className={`w-24 h-24 object-cover ${k.logo === 'round' ? 'rounded-full' : 'rounded-2xl'}`} />
          </div>
          <h1 className="text-[26px] leading-tight font-semibold tracking-[0.04em]" style={{ fontFamily: k.titleFont, color: '#fff' }}>
            {profile?.displayName}
          </h1>
          {profile?.company && profile.company.trim() && profile.company !== profile.displayName && (
            <p className="text-[13px] mt-1" style={{ color: `${k.text}80` }}>{profile.company}</p>
          )}
          <p className="text-[11px] font-semibold uppercase tracking-[0.38em] mt-2.5" style={{ color: k.accentLight }}>
            {profile?.jobTitle?.trim() || roleFallback}
          </p>
          {extra}
          {(profile?.bio || profile?.aboutMe) && (
            <p className="text-[13px] italic leading-relaxed mt-4 max-w-md mx-auto whitespace-pre-wrap" style={{ color: `${k.text}aa` }}>
              {profile.bio || profile.aboutMe}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-center gap-2 mt-6">
            {profile?.phone && <a href={`tel:${String(profile.phone).replace(/\s/g, '')}`} aria-label="Llamar" className={sqCls} style={sqStyle}><FaPhoneAlt size={13} /></a>}
            {wa && <a href={`https://wa.me/${wa}?text=${encodeURIComponent(waText)}`} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className={sqCls} style={sqStyle}><FaWhatsapp size={15} /></a>}
            <button type="button" onClick={() => setShowQRModal?.(true)} aria-label="Código QR" className={sqCls} style={sqStyle}><FaQrcode size={14} /></button>
            {downloadVCard && <button type="button" onClick={() => downloadVCard()} disabled={isVCardLoading} aria-label="Guardar contacto" className={sqCls} style={sqStyle}><FaRegAddressCard size={15} /></button>}
            <button type="button" onClick={() => handleShare?.()}
              className="flex items-center gap-2 h-11 px-5 rounded-xl text-[11px] font-semibold uppercase tracking-[0.2em] transition hover:brightness-110"
              style={{ background: k.accent, color: k.onAccent, fontFamily: k.titleFont, boxShadow: `0 10px 26px -12px ${k.accent}` }}>
              <FaShareAlt size={12} /> Compartir
            </button>
          </div>

          {socials.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
              {socials.map(s => (
                <a key={s.key} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.key} className={sqCls} style={sqStyle}>
                  <span className="text-[15px]">{s.icon}</span>
                </a>
              ))}
            </div>
          )}

          {location && (
            <p className="flex items-center justify-center gap-1.5 mt-5 text-[13px]" style={{ color: `${k.text}cc` }}>
              <FaMapMarkerAlt size={12} style={{ color: k.accentLight }} /> {location}
            </p>
          )}
        </header>
        {children}
      </div>
    </>
  );
};
