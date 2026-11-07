import React, { useMemo } from 'react';
import { FaMinus, FaPlus, FaBookOpen } from 'react-icons/fa';
import type { BookTitle } from '../../types';
import { useKit, fmtMoney } from '../PublicKit';
import { discountPercent, isPreorder, isNewRelease, isUsed, stockState, canOrder, CONDITION_LABEL } from '../../src/lib/booksCommon';

/** Mensajes para el lector, por código de error de las RPC (setup_books.sql). */
export const ERRORS: Record<string, string> = {
  name_required: 'Escribe tu nombre.',
  contact_required: 'Déjanos tu teléfono o email.',
  shop_not_found: 'No se pudo identificar la librería.',
  orders_unavailable: 'Los pedidos en línea no están disponibles por ahora.',
  empty_order: 'Tu pedido está vacío.',
  too_many_items: 'Demasiados títulos en un pedido. Divídelo en dos.',
  title_unavailable: 'Alguno de los libros ya no está disponible.',
  pickup_unavailable: 'El retiro en tienda no está disponible por ahora.',
  delivery_unavailable: 'Esta librería no hace envíos por ahora.',
  address_required: 'Escribe la dirección de entrega.',
  member_not_found: 'No encontramos ese código de lector.',
  club_unavailable: 'El club no está disponible por ahora.',
  requests_unavailable: 'Los encargos no están disponibles por ahora.',
  title_required: 'Escribe el título que buscas.',
  waitlist_unavailable: 'El aviso de llegada no está disponible por ahora.',
  events_unavailable: 'Las reservas de eventos no están disponibles.',
  event_unavailable: 'Ese evento ya no está disponible.',
  event_past: 'Ese evento ya pasó.',
  already_booked: 'Ya tienes un lugar reservado en este evento.',
  giftcards_unavailable: 'Las tarjetas de regalo no están disponibles por ahora.',
  bad_amount: 'Elige un monto entre $5 y $500.',
  too_many: 'Demasiados intentos seguidos. Espera un momento e inténtalo de nuevo.',
  not_cancellable: 'Esto ya no se puede cancelar.',
};

export const errMsg = (e: any, fallback = 'No se pudo completar. Inténtalo de nuevo.') => {
  if (e?.error === 'out_of_stock') {
    return e.available > 0
      ? `«${e.title}»: solo quedan ${e.available}. Ajusta la cantidad.`
      : `«${e.title}» se acaba de agotar. Quítalo del pedido o pídenos avisarte cuando llegue.`;
  }
  if (e?.error === 'event_full') return e.seats_left > 0 ? `Solo quedan ${e.seats_left} lugar(es).` : 'Este evento ya está lleno.';
  return ERRORS[e?.error] || (typeof e?.message === 'string' && !e?.error ? e.message : fallback);
};

/** Paleta de lomos para las portadas que aún no tienen foto. */
const SPINES = ['#2f4a3f', '#4a2f3a', '#2f3a4a', '#4a3f2f', '#3a2f4a', '#4a2f2f', '#2f4a4a'];
export const spineColor = (title: string) => SPINES[hash(title || '') % SPINES.length];
const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };

/** Portada del libro; sin foto dibuja un lomo con el título (que sigue siendo legible y bonito). */
export const BookCover: React.FC<{ t: Pick<BookTitle, 'title' | 'author' | 'cover_url'>; className?: string; fit?: 'cover' | 'contain' }> = ({ t, className = '', fit = 'cover' }) => {
  const k = useKit();
  const [broken, setBroken] = React.useState(false);
  const color = useMemo(() => SPINES[hash(t.title || '') % SPINES.length], [t.title]);
  if (t.cover_url && !broken) {
    return <img src={t.cover_url} alt={t.title} loading="lazy" onError={() => setBroken(true)} className={`w-full h-full ${fit === 'contain' ? 'object-contain' : 'object-cover'} ${className}`} />;
  }
  return (
    <div className={`w-full h-full flex flex-col items-center justify-between text-center p-3 ${className}`}
      style={{ background: `linear-gradient(160deg, ${color}, ${k.bg})`, boxShadow: `inset 0 0 0 1px ${k.accent}33, inset 6px 0 0 ${k.accent}22` }}
      aria-label={t.title} role="img">
      <FaBookOpen size={14} style={{ color: `${k.accent}99` }} />
      <p className="text-[12px] leading-tight font-bold line-clamp-4" style={{ color: k.text, fontFamily: k.titleFont }}>{t.title}</p>
      <p className="text-[9px] uppercase tracking-[0.18em] line-clamp-1" style={{ color: `${k.text}99` }}>{t.author || ' '}</p>
    </div>
  );
};

const Tag: React.FC<{ children: React.ReactNode; bg?: string; fg?: string }> = ({ children, bg, fg }) => {
  const k = useKit();
  return <span className="text-[8.5px] font-bold uppercase tracking-[0.12em] px-1.5 py-[3px] rounded-md leading-none backdrop-blur-sm" style={{ background: bg || k.accent, color: fg || k.onAccent }}>{children}</span>;
};

/** Etiquetas sobre la portada (máx. 2, la más importante primero). */
export const BookBadges: React.FC<{ t: BookTitle; today: string }> = ({ t, today }) => {
  const st = stockState(t.stock);
  const pct = discountPercent(t.price, t.original_price);
  const tags: React.ReactNode[] = [];
  if (st.kind === 'agotado') tags.push(<Tag key="a" bg="#7f1d1d" fg="#fecaca">Agotado</Tag>);
  else if (isPreorder(t, today)) tags.push(<Tag key="p">Preventa</Tag>);
  if (isUsed(t) && st.kind !== 'agotado') tags.push(<Tag key="u" bg="#0f172a" fg="#e2e8f0">{CONDITION_LABEL[t.book_condition]}</Tag>);
  if (pct > 0 && st.kind !== 'agotado') tags.push(<Tag key="d" bg="#be123c" fg="#fff">−{pct}%</Tag>);
  if (tags.length < 2 && isNewRelease(t, today) && st.kind !== 'agotado') tags.push(<Tag key="n">Novedad</Tag>);
  if (tags.length < 2 && st.kind === 'ultimas') tags.push(<Tag key="l" bg="#92400e" fg="#fde68a">¡Últimas!</Tag>);
  if (tags.length === 0) return null;
  return <div className="absolute top-1.5 left-1.5 flex flex-col items-start gap-1">{tags.slice(0, 2)}</div>;
};

export const PriceTag: React.FC<{ t: Pick<BookTitle, 'price' | 'original_price'>; size?: 'sm' | 'lg' }> = ({ t, size = 'sm' }) => {
  const k = useKit();
  const pct = discountPercent(t.price, t.original_price);
  return (
    <span className="inline-flex items-baseline gap-1.5 flex-wrap">
      <span className={`font-bold text-white ${size === 'lg' ? 'text-[26px]' : 'text-[14px]'}`} style={{ fontFamily: k.titleFont }}>{t.price > 0 ? fmtMoney(t.price) : 'Consultar'}</span>
      {pct > 0 && t.original_price ? <span className={`line-through ${size === 'lg' ? 'text-sm' : 'text-[10px]'}`} style={{ color: `${k.text}77` }}>{fmtMoney(t.original_price)}</span> : null}
    </span>
  );
};

/** Tarjeta de libro para la cuadrícula y los estantes. */
export const BookCard: React.FC<{
  t: BookTitle; today: string; onOpen: () => void; onAdd?: () => void; inCart?: number; shelf?: boolean;
}> = ({ t, today, onOpen, onAdd, inCart = 0, shelf }) => {
  const k = useKit();
  const orderable = canOrder(t);
  return (
    <div className={`${shelf ? 'snap-start shrink-0 w-[128px]' : ''} group text-left`}>
      <div className="relative">
        <button type="button" onClick={onOpen} aria-label={`Ver ${t.title}`}
          className="block w-full aspect-[2/3] rounded-lg overflow-hidden relative transition-transform duration-300 group-hover:-translate-y-1"
          style={{ background: k.surface, boxShadow: '0 14px 28px -14px rgba(0,0,0,0.85), 0 2px 6px rgba(0,0,0,0.5)', opacity: t.stock === 0 ? 0.62 : 1 }}>
          <BookCover t={t} />
          <span aria-hidden className="absolute inset-y-0 left-0 w-[7px]" style={{ background: 'linear-gradient(90deg, rgba(0,0,0,0.38), rgba(255,255,255,0.1) 55%, transparent)' }} />
          <BookBadges t={t} today={today} />
        </button>
        {onAdd && orderable && (
          <button type="button" onClick={onAdd} aria-label={`Agregar ${t.title} al pedido`}
            className="absolute bottom-1.5 right-1.5 w-8 h-8 rounded-full flex items-center justify-center shadow-lg transition hover:scale-110 active:scale-95"
            style={{ background: inCart > 0 ? '#fff' : k.accent, color: inCart > 0 ? '#111' : k.onAccent }}>
            {inCart > 0 ? <span className="text-[11px] font-black">{inCart}</span> : <FaPlus size={11} />}
          </button>
        )}
      </div>
      <button type="button" onClick={onOpen} className="block text-left w-full mt-2">
        <p className="cnx-product-text text-white font-semibold text-[12.5px] leading-snug line-clamp-2 min-h-[2.4em]" style={{ fontFamily: k.titleFont }}>{t.title}</p>
        {t.author && <p className="text-[10.5px] truncate mt-0.5" style={{ color: `${k.text}99` }}>{t.author}</p>}
        <div className="mt-1"><PriceTag t={t} /></div>
      </button>
    </div>
  );
};

/** Contador +/− compacto (cantidades de pedido, asientos, etc.). */
export const QtyStepper: React.FC<{ value: number; min?: number; max: number; onChange: (v: number) => void; label?: string }> = ({ value, min = 1, max, onChange, label = 'Cantidad' }) => {
  const k = useKit();
  const btn = 'w-8 h-8 rounded-full flex items-center justify-center border transition disabled:opacity-30';
  return (
    <div className="inline-flex items-center gap-2.5" role="group" aria-label={label}>
      <button type="button" aria-label={`Menos ${label}`} className={btn} disabled={value <= min} onClick={() => onChange(value - 1)} style={{ borderColor: `${k.accent}66`, color: k.accentLight }}><FaMinus size={9} /></button>
      <span className="text-white font-bold w-6 text-center tabular-nums">{value}</span>
      <button type="button" aria-label={`Más ${label}`} className={btn} disabled={value >= max} onClick={() => onChange(value + 1)} style={{ borderColor: `${k.accent}66`, color: k.accentLight }}><FaPlus size={9} /></button>
    </div>
  );
};

/** Estante horizontal con título propio (Recomendados, Novedades…). */
export const Shelf: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex gap-3.5 overflow-x-auto pb-3 -mx-4 px-4 snap-x scroll-px-4" style={{ scrollbarWidth: 'none' }}>{children}</div>
);
