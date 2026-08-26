import React, { useMemo, useState } from 'react';
import {
  FaArrowLeft, FaSearch, FaTimes, FaInbox, FaChevronRight, FaThLarge,
} from 'react-icons/fa';
import { normalizeText } from '../hooks/useCatalogSearch';

/**
 * Vista de catálogo a PÁGINA COMPLETA, compartida por todas las plantillas que
 * venden productos o servicios (default, barber, gastro, ecom, petcare, medical,
 * realty, sublima, stage).
 *
 * No sustituye el modal/carrito de detalle de cada plantilla: es sólo una vista
 * organizada de "ver todo". Al tocar un ítem se cierra ella misma y se dispara
 * `onSelect(raw)`, donde cada plantilla abre su propio flujo (ficha, carrito…)
 * — el mismo patrón que ya usaba el "Ver Menú Completo" de gastro.
 *
 * Los colores llegan por props para respetar la paleta propia de cada perfil.
 */

export interface CatalogItem {
  id: string;
  name: string;
  price?: string;
  image?: string;
  category?: string;
  description?: string;
  /** Etiqueta pequeña sobre la imagen (p. ej. "Agotado", "Destacado"). */
  badge?: string;
  /** Si está agotado / no disponible: se atenúa y no es clickeable. */
  disabled?: boolean;
  /** Producto original de la plantilla; viaja intacto a `onSelect`. */
  raw?: any;
}

interface FullCatalogViewProps {
  items: CatalogItem[];
  onBack: () => void;
  onSelect: (raw: any) => void;
  /** Acento del perfil (hex de 6 dígitos idealmente). */
  accent?: string;
  bg?: string;
  surface?: string;
  text?: string;
  muted?: string;
  fontFamily?: string;
  title?: string;
  backLabel?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  /** Texto del "llamado" en cada tarjeta (p. ej. "Pedir →", "Ver →"). */
  ctaLabel?: string;
  isMobilePreview?: boolean;
}

/** Añade opacidad a un hex de 6 dígitos; si no lo es, devuelve el color tal cual. */
const withAlpha = (hex: string, alpha: string): string =>
  /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}${alpha}` : hex;

const ALL = '__all__';

const FullCatalogView: React.FC<FullCatalogViewProps> = ({
  items,
  onBack,
  onSelect,
  accent = '#ff6b35',
  bg = '#0b0502',
  surface = 'rgba(255,255,255,0.03)',
  text = '#ffffff',
  muted = 'rgba(255,255,255,0.55)',
  fontFamily,
  title = 'Catálogo',
  backLabel = 'Volver al perfil',
  searchPlaceholder = 'Buscar por nombre o categoría',
  emptyLabel = 'No hay nada por aquí todavía.',
  ctaLabel = 'Ver →',
  isMobilePreview = false,
}) => {
  const [query, setQuery] = useState('');
  const [activeCat, setActiveCat] = useState<string>(ALL);

  const border = withAlpha(accent, '22');
  const borderStrong = withAlpha(accent, '40');
  const accentTint = withAlpha(accent, '14');

  // Categorías presentes (en orden de aparición).
  const categories = useMemo(() => {
    const seen: string[] = [];
    items.forEach((it) => {
      const cat = (it.category || '').trim() || 'Catálogo';
      if (!seen.includes(cat)) seen.push(cat);
    });
    return seen;
  }, [items]);

  const q = normalizeText(query);
  const isSearching = q.length > 0;

  const filtered = useMemo(() => {
    return items.filter((it) => {
      const cat = (it.category || '').trim() || 'Catálogo';
      if (!isSearching && activeCat !== ALL && cat !== activeCat) return false;
      if (!isSearching) return true;
      const hay = normalizeText([it.name, it.category, it.description].filter(Boolean).join(' '));
      return q.split(/\s+/).filter(Boolean).every((t) => hay.includes(t));
    });
  }, [items, activeCat, q, isSearching]);

  const countFor = (cat: string) =>
    items.filter((it) => ((it.category || '').trim() || 'Catálogo') === cat).length;

  return (
    <div
      className={`${isMobilePreview ? 'absolute' : 'fixed'} inset-0 z-[9985] flex flex-col overflow-hidden`}
      style={{ backgroundColor: bg, color: text, fontFamily }}
    >
      {/* ── Cabecera ── */}
      <div
        className="shrink-0 border-b backdrop-blur-md"
        style={{ borderColor: border, backgroundColor: withAlpha(bg, 'ee') === bg ? bg : bg }}
      >
        <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-3.5 flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-wider transition-all hover:brightness-125 active:scale-95 shrink-0"
            style={{ color: accent, backgroundColor: accentTint, border: `1px solid ${border}` }}
          >
            <FaArrowLeft size={12} />
            <span className="hidden xs:inline sm:inline">{backLabel}</span>
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <FaThLarge size={14} style={{ color: accent }} className="shrink-0" />
            <h1 className="text-sm sm:text-base font-black uppercase tracking-widest truncate">
              {title}
            </h1>
            <span
              className="text-[10px] font-black rounded-full px-2 py-0.5 shrink-0"
              style={{ color: accent, backgroundColor: accentTint }}
            >
              {items.length}
            </span>
          </div>
        </div>
      </div>

      {/* ── Búsqueda + categorías ── */}
      <div className="shrink-0 border-b" style={{ borderColor: withAlpha(accent, '10') }}>
        <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-3 space-y-3">
          <div className="relative">
            <FaSearch
              className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
              style={{ color: muted }}
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full text-sm rounded-xl pl-10 pr-9 py-2.5 focus:outline-none"
              style={{
                backgroundColor: 'rgba(0,0,0,0.35)',
                border: `1px solid ${border}`,
                color: text,
              }}
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                aria-label="Limpiar búsqueda"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 transition hover:brightness-150"
                style={{ color: muted }}
              >
                <FaTimes size={12} />
              </button>
            )}
          </div>

          {categories.length > 1 && !isSearching && (
            <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-0.5">
              {[ALL, ...categories].map((cat) => {
                const active = activeCat === cat;
                const label = cat === ALL ? 'Todos' : cat;
                const count = cat === ALL ? items.length : countFor(cat);
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveCat(cat)}
                    className="px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider shrink-0 transition-all"
                    style={
                      active
                        ? { backgroundColor: accent, color: bg, border: `1px solid ${accent}` }
                        : { backgroundColor: accentTint, color: muted, border: `1px solid ${border}` }
                    }
                  >
                    {label} <span className="opacity-60">({count})</span>
                  </button>
                );
              })}
            </div>
          )}
          {isSearching && (
            <p className="text-[11px] tracking-wide" style={{ color: muted }}>
              {filtered.length} resultado{filtered.length === 1 ? '' : 's'} para “{query}”
            </p>
          )}
        </div>
      </div>

      {/* ── Rejilla ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-5">
          {filtered.length === 0 ? (
            <div className="text-center py-20" style={{ color: muted }}>
              <FaInbox className="mx-auto text-4xl mb-3 opacity-70" />
              <p className="text-sm">
                {isSearching ? `Sin resultados para “${query}”.` : emptyLabel}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {filtered.map((it) => {
                const disabled = !!it.disabled;
                return (
                  <button
                    key={it.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => { if (disabled) return; onSelect(it.raw ?? it); }}
                    className={`group text-left rounded-2xl overflow-hidden transition-all flex flex-col ${
                      disabled ? 'opacity-60 cursor-not-allowed' : 'hover:-translate-y-0.5'
                    }`}
                    style={{ backgroundColor: surface, border: `1px solid ${border}` }}
                    onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.borderColor = borderStrong; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = border; }}
                  >
                    <div className="relative aspect-[4/3] w-full overflow-hidden" style={{ backgroundColor: withAlpha(accent, '0d') }}>
                      {it.image ? (
                        <img
                          src={it.image}
                          alt={it.name}
                          loading="lazy"
                          className={`w-full h-full object-cover transition-transform duration-300 ${disabled ? 'grayscale' : 'group-hover:scale-105'}`}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center" style={{ color: withAlpha(accent, '55') }}>
                          <FaThLarge size={26} />
                        </div>
                      )}
                      {it.category && (
                        <span
                          className="absolute top-2 left-2 text-[9px] font-black uppercase tracking-wider rounded-md px-1.5 py-0.5 backdrop-blur-sm"
                          style={{ color: text, backgroundColor: 'rgba(0,0,0,0.45)' }}
                        >
                          {it.category}
                        </span>
                      )}
                      {it.badge && (
                        <span
                          className="absolute top-2 right-2 text-[9px] font-black uppercase tracking-widest rounded-md px-1.5 py-0.5"
                          style={{ color: bg, backgroundColor: accent }}
                        >
                          {it.badge}
                        </span>
                      )}
                      {disabled && (
                        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black uppercase tracking-widest text-white bg-black/55">
                          Agotado
                        </span>
                      )}
                    </div>
                    <div className="p-3 flex flex-col flex-1">
                      <h4 className="cnx-product-text font-bold text-xs sm:text-sm leading-snug line-clamp-2" style={{ color: text }}>
                        {it.name}
                      </h4>
                      {it.description && (
                        <p className="text-[10px] sm:text-[11px] mt-1 line-clamp-2 leading-snug" style={{ color: muted }}>
                          {it.description}
                        </p>
                      )}
                      <div className="flex items-center justify-between gap-2 mt-2 pt-1">
                        {it.price ? (
                          <span className="font-black text-xs sm:text-sm" style={{ color: accent }}>
                            {it.price}
                          </span>
                        ) : <span />}
                        {!disabled && (
                          <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider shrink-0" style={{ color: withAlpha(accent, 'cc') }}>
                            {ctaLabel} <FaChevronRight size={9} />
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FullCatalogView;
