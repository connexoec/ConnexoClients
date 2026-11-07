import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { profileStyleLayer } from '../src/lib/profileStyleLayer';
import { supabase } from '../src/lib/supabase';
import { ProfileExtraSections } from './ProfileExtraSections';
import FullCatalogView from './FullCatalogView';
import type { Profile, UserLink, BookTitle, BooksSettings } from '../types';
import {
  KitProvider, isOn, fmtMoney, localISO, prettyDate, shade, readableOn,
  SectionHeading, PillLink, FeatureCard, FilterChip, PassCard, HoursSection, ReviewsSection, ProfileHero, type KitTheme,
} from './PublicKit';
import { useDebouncedValue } from '../hooks/useCatalogSearch';
import { BookCard, Shelf, spineColor } from './books/BooksUi';
import {
  BookDetailModal, WaitlistModal, RequestModal, CartModal, type ShopCtx,
} from './books/BooksCommerceModals';
import {
  TrackerModal, ClubModal, MemberModal, ListModal, EventModal, GiftCardModal, listTotal, type ListData, type EventData,
} from './books/BooksExtrasModals';
import {
  matchesBookQuery, isNewRelease, isPreorder, isUsed, discountPercent, canOrder, maxQty, stockState, EVENT_KIND_LABEL,
} from '../src/lib/booksCommon';
import {
  FaSearch, FaLink, FaBookOpen, FaShoppingBag, FaGift, FaStore, FaTruck, FaTimes, FaMapMarkerAlt,
  FaUserAlt, FaClipboardList, FaBoxOpen, FaFeatherAlt, FaClock,
} from 'react-icons/fa';

// ── Identidad: «Biblioteca» — verde tinta casi negro, papel cálido y latón de lámpara; títulos en Playfair ──
const ACCENT_BASE = '#e2a43f';
const BG_DARK = '#0b1512';
const SURFACE = '#12211c';
const TEXT = '#f1e8d6';
const ON_ACCENT = '#1a1206';
const TITLE_FONT = "'Playfair Display', serif";
const BODY_FONT = "'Space Grotesk', sans-serif";

const PAGE = 18;               // libros por tanda en la cuadrícula
const ALL = '__all__';
type Quick = 'todos' | 'novedades' | 'vendidos' | 'ofertas' | 'usados' | 'preventa';

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

/** PostgREST devuelve como mucho 1000 filas por consulta: se pagina para no dejar libros fuera sin avisar. */
const fetchAllTitles = async (shopId: string): Promise<BookTitle[]> => {
  const out: BookTitle[] = [];
  for (let from = 0; from < 5000; from += 1000) {
    const { data, error } = await supabase.from('books_titles').select('*')
      .eq('shop_profile_id', shopId).eq('is_available', true)
      .order('sort_order').order('created_at', { ascending: false }).range(from, from + 999);
    if (error) throw error;
    const rows = (data ?? []) as BookTitle[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
};

export const ProfileBooksTemplate: React.FC<Props> = ({
  profile, links, onLinkClick, onLeaveTestimonial, isMobilePreview = false, userId,
  handleShare, setShowQRModal, downloadVCard, isVCardLoading,
}) => {
  const accent = profile?.buttonColor || ACCENT_BASE;
  const theme: KitTheme = useMemo(() => ({
    accent,
    accentLight: profile?.buttonColor ? shade(accent, 0.35) : '#f6cf86',
    accentDark: profile?.buttonColor ? shade(accent, -0.35) : '#9c6a1c',
    bg: BG_DARK, surface: SURFACE, text: TEXT,
    onAccent: profile?.buttonTextColor || readableOn(accent, ON_ACCENT),
    titleFont: TITLE_FONT, bodyFont: BODY_FONT, heading: 'fleuron', logo: 'arch',
  }), [accent, profile?.buttonColor, profile?.buttonTextColor]);

  const planName = String(profile?.plan ?? 'free').toLowerCase();
  const isPro = planName === 'pro' || planName === 'ultra';
  const isUltra = planName === 'ultra';
  const settings: BooksSettings = useMemo(() => (profile?.books_settings as BooksSettings) || {}, [profile?.books_settings]);
  const ordersOn = settings.ordersEnabled !== false;

  const [titles, setTitles] = useState<BookTitle[]>([]);
  const [lists, setLists] = useState<ListData[]>([]);
  const [events, setEvents] = useState<EventData[]>([]);
  const [loading, setLoading] = useState(true);
  const [today] = useState(() => localISO());

  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, 200);
  // Al vaciar el campo la búsqueda se limpia al instante; solo al teclear se espera la pausa.
  const dq = query.trim() === '' ? '' : debounced;
  const [quick, setQuick] = useState<Quick>('todos');
  const [activeCat, setActiveCat] = useState<string>(ALL);
  const [visible, setVisible] = useState(PAGE);

  const [cart, setCart] = useState<Record<string, number>>({});
  const [listName, setListName] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [detail, setDetail] = useState<BookTitle | null>(null);
  const [waitFor, setWaitFor] = useState<BookTitle | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [trackerOpen, setTrackerOpen] = useState(false);
  const [trackerCode, setTrackerCode] = useState('');
  const [clubOpen, setClubOpen] = useState(false);
  const [passOpen, setPassOpen] = useState<string | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const [listOpen, setListOpen] = useState<ListData | null>(null);
  const [eventOpen, setEventOpen] = useState<EventData | null>(null);
  const [showAll, setShowAll] = useState(false);
  const catalogRef = useRef<HTMLDivElement>(null);

  const { campaign, deepCode } = useMemo(() => {
    if (typeof window === 'undefined') return { campaign: null as string | null, deepCode: null as string | null };
    const p = new URLSearchParams(window.location.search);
    return { campaign: p.get('campaign'), deepCode: p.get('pedido') || p.get('encargo') || p.get('reserva') };
  }, []);
  useEffect(() => { if (deepCode && !isMobilePreview) { setTrackerCode(deepCode); setTrackerOpen(true); } }, [deepCode, isMobilePreview]);

  const ctx: ShopCtx = useMemo(() => ({ profile, userId, settings, isPro, isUltra, isMobilePreview, campaign }),
    [profile, userId, settings, isPro, isUltra, isMobilePreview, campaign]);

  /* ── Carga ── */
  const reloadTitles = useCallback(async () => {
    if (!userId) return;
    try { setTitles(await fetchAllTitles(userId)); } catch (err: any) { console.error('Books titles fetch error:', err?.message ?? err); }
  }, [userId]);
  const reloadEvents = useCallback(async () => {
    if (!userId || !isUltra) { setEvents([]); return; }
    try { const { data } = await supabase.rpc('get_books_events', { p_shop_id: userId }); setEvents(Array.isArray(data) ? data : []); } catch { setEvents([]); }
  }, [userId, isUltra]);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    let alive = true;
    (async () => {
      try {
        const rows = await fetchAllTitles(userId);
        if (alive) setTitles(rows);
        if (isPro) {
          try { const { data } = await supabase.rpc('get_books_lists', { p_shop_id: userId }); if (alive) setLists(Array.isArray(data) ? data : []); } catch { /* sin SQL de listas */ }
        }
      } catch (err: any) { console.error('Books fetch error:', err?.message ?? err); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [userId, isPro]);
  useEffect(() => { reloadEvents(); }, [reloadEvents]);

  /* ── Carrito (se recuerda por librería en este navegador) ── */
  const cartKey = userId ? `cnx_books_cart_${userId}` : null;
  useEffect(() => {
    if (!cartKey || isMobilePreview) return;
    try { const raw = localStorage.getItem(cartKey); if (raw) { const c = JSON.parse(raw); if (c && typeof c === 'object') setCart(c); } } catch { /* sin almacenamiento */ }
  }, [cartKey, isMobilePreview]);
  useEffect(() => {
    if (!cartKey || isMobilePreview) return;
    try { localStorage.setItem(cartKey, JSON.stringify(cart)); } catch { /* sin almacenamiento */ }
  }, [cart, cartKey, isMobilePreview]);

  const titlesById = useMemo(() => new Map(titles.map(t => [t.id, t])), [titles]);

  // Un libro que se agotó o se ocultó desde que se agregó no puede quedar en el carrito para siempre.
  useEffect(() => {
    if (loading || titles.length === 0) return;
    setCart(c => {
      let changed = false; const n: Record<string, number> = {};
      for (const [id, q] of Object.entries(c)) {
        const t = titlesById.get(id);
        if (!t) { changed = true; continue; }            // ya no existe o el dueño lo ocultó
        // Agotado: se CONSERVA en el pedido (el modal lo marca para que el lector lo quite
        // y entienda por qué); si se vaciara en silencio, "Enviar" parecería haber borrado todo.
        const cap = maxQty(t);
        const qty = cap === 0 ? q : Math.min(q, cap);
        if (qty !== q) changed = true;
        if (qty > 0) n[id] = qty; else changed = true;
      }
      return changed ? n : c;
    });
  }, [loading, titles, titlesById]);
  useEffect(() => { if (Object.keys(cart).length === 0) setListName(null); }, [cart]);

  const cartCount = useMemo(() => Object.entries(cart).reduce((a, [id, q]) => a + (titlesById.get(id) && canOrder(titlesById.get(id)!) ? q : 0), 0), [cart, titlesById]);
  const cartTotal = useMemo(() => Object.entries(cart).reduce((a, [id, q]) => { const t = titlesById.get(id); return a + (t && canOrder(t) ? t.price * q : 0); }, 0), [cart, titlesById]);

  const flash = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  };
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const addToCart = (t: BookTitle, qty = 1) => {
    if (!ordersOn || !canOrder(t)) return;
    setCart(c => {
      const next = Math.min((c[t.id] || 0) + qty, maxQty(t));
      return next === (c[t.id] || 0) ? c : { ...c, [t.id]: next };
    });
    flash(`«${t.title.length > 34 ? t.title.slice(0, 34) + '…' : t.title}» en tu pedido`);
  };
  const setQty = (id: string, qty: number) => setCart(c => ({ ...c, [id]: qty }));
  const removeFromCart = (id: string) => setCart(c => { const n = { ...c }; delete n[id]; return n; });

  /* ── Derivados del catálogo ── */
  const counts = useMemo(() => ({
    novedades: titles.filter(t => isNewRelease(t, today)).length,
    vendidos: titles.filter(t => t.sold_count > 0).length,
    ofertas: titles.filter(t => discountPercent(t.price, t.original_price) > 0 && t.stock !== 0).length,
    usados: titles.filter(isUsed).length,
    preventa: titles.filter(t => isPreorder(t, today)).length,
  }), [titles, today]);

  const categories = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of titles) { const c = (t.category || '').trim() || 'Otros'; m.set(c, (m.get(c) || 0) + 1); }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [titles]);

  const featured = useMemo(() => titles.filter(t => t.is_featured && t.stock !== 0).slice(0, 12), [titles]);
  const news = useMemo(() => titles.filter(t => isNewRelease(t, today) || isPreorder(t, today))
    .sort((a, b) => String(b.release_date).localeCompare(String(a.release_date))).slice(0, 12), [titles, today]);
  const bestsellers = useMemo(() => titles.filter(t => t.sold_count > 0 && t.stock !== 0)
    .sort((a, b) => b.sold_count - a.sold_count).slice(0, 12), [titles]);

  const filtering = dq.trim().length > 0 || quick !== 'todos';
  const results = useMemo(() => {
    let list = titles;
    if (quick === 'novedades') list = list.filter(t => isNewRelease(t, today));
    else if (quick === 'vendidos') list = list.filter(t => t.sold_count > 0).sort((a, b) => b.sold_count - a.sold_count);
    else if (quick === 'ofertas') list = list.filter(t => discountPercent(t.price, t.original_price) > 0).sort((a, b) => discountPercent(b.price, b.original_price) - discountPercent(a.price, a.original_price));
    else if (quick === 'usados') list = list.filter(isUsed);
    else if (quick === 'preventa') list = list.filter(t => isPreorder(t, today));
    const q = dq.trim();
    if (q) {
      list = list.filter(t => matchesBookQuery(t, q));
      const ql = q.toLowerCase();
      // Lo que empieza igual que lo escrito va primero.
      list = [...list].sort((a, b) => Number(b.title.toLowerCase().startsWith(ql)) - Number(a.title.toLowerCase().startsWith(ql)));
    }
    return list;
  }, [titles, quick, dq, today]);

  const gridList = useMemo(() => (activeCat === ALL ? titles : titles.filter(t => ((t.category || '').trim() || 'Otros') === activeCat)), [titles, activeCat]);
  useEffect(() => { setVisible(PAGE); }, [activeCat, quick, dq]);

  const catalogItems = useMemo(() => titles.map(t => ({
    id: t.id, name: t.title, price: t.price > 0 ? fmtMoney(t.price) : 'Consultar', image: t.cover_url || undefined,
    category: t.category || 'Otros', description: [t.author, t.publisher, t.isbn].filter(Boolean).join(' · ') || undefined,
    badge: stockState(t.stock).kind === 'agotado' ? 'Agotado' : isPreorder(t, today) ? 'Preventa' : undefined, raw: t,
  })), [titles, today]);

  const wa = (profile?.whatsapp || '').replace(/\D/g, '');
  const clubName = profile?.clubName?.trim() || 'Club de Lectores';
  const clubTagline = profile?.clubTagline?.trim() || 'Descuentos en tus compras, avisos de novedades y beneficios para quienes viven entre libros.';
  const sorted = links.filter(l => l.isActive).sort((a, b) => a.order - b.order);
  const openTracker = (code = '') => { setTrackerCode(code); setTrackerOpen(true); };

  const addList = (items: { id: string; qty: number }[], name: string) => {
    setCart(c => {
      const n = { ...c };
      for (const it of items) {
        const t = titlesById.get(it.id);
        if (!t || !canOrder(t)) continue;
        n[it.id] = Math.min((n[it.id] || 0) + it.qty, maxQty(t));
      }
      return n;
    });
    setListName(name);
    setCartOpen(true);
  };

  const quickChips: [Quick, string, number][] = [
    ['novedades', 'Novedades', counts.novedades], ['vendidos', 'Más vendidos', counts.vendidos], ['ofertas', 'Ofertas', counts.ofertas],
    ['usados', 'Usados', counts.usados], ['preventa', 'Preventa', counts.preventa],
  ];
  const hasHold = !!settings.holdDays;
  const hasPolicies = !!(settings.pickupEnabled !== false || settings.deliveryEnabled || hasHold || isPro);

  return (
    <KitProvider theme={theme}>
      <div className={`min-h-screen relative overflow-hidden ${profileStyleLayer(profile).className}`}
        style={{ ...profileStyleLayer(profile).style, backgroundColor: profile?.backgroundColor || BG_DARK, color: profile?.textColor || TEXT, fontFamily: profile?.fontFamily || BODY_FONT }}>
        {!isMobilePreview && (
          <>
            <div aria-hidden className="pointer-events-none fixed inset-0"
              style={{ background: `radial-gradient(120% 50% at 50% -8%, ${accent}1c, transparent 60%)` }} />
            <div aria-hidden className="pointer-events-none fixed inset-x-0 bottom-0 h-48"
              style={{ background: `linear-gradient(to top, ${BG_DARK}, transparent)` }} />
          </>
        )}

        <div className="relative z-10 max-w-xl mx-auto pb-28">
          <ProfileHero
            profile={profile} roleFallback="Librería" contactWhatsapp={wa}
            waText={`Hola ${profile?.displayName || ''}, quisiera información sobre un libro.`}
            setShowQRModal={setShowQRModal} downloadVCard={downloadVCard} isVCardLoading={isVCardLoading} handleShare={handleShare}
            extra={(settings.pickupEnabled !== false || settings.deliveryEnabled) ? (
              <div className="flex items-center justify-center gap-3 mt-3 text-[11px]" style={{ color: `${TEXT}b3` }}>
                {settings.pickupEnabled !== false && <span className="flex items-center gap-1.5"><FaStore size={10} style={{ color: accent }} /> Retiro en tienda</span>}
                {settings.deliveryEnabled && <span className="flex items-center gap-1.5"><FaTruck size={10} style={{ color: accent }} /> Envíos</span>}
              </div>
            ) : undefined}>

            {/* ── Buscador ── */}
            {isOn(profile, 'catalog') && (loading || titles.length > 0) && (
              <div className="rounded-3xl border p-5 -mt-2" style={{ background: `linear-gradient(165deg, ${accent}16, ${SURFACE} 62%)`, borderColor: `${accent}55`, boxShadow: `0 24px 60px -32px ${accent}` }}>
                <p className="text-[11px] italic tracking-[0.16em]" style={{ color: theme.accentLight, fontFamily: TITLE_FONT }}>Encuentra tu próxima lectura</p>
                <h2 className="text-white text-xl font-bold mt-0.5" style={{ fontFamily: TITLE_FONT }}>¿Qué quieres leer hoy?</h2>
                <div className="relative mt-4">
                  <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2" size={13} style={{ color: `${TEXT}77` }} />
                  <input value={query} onChange={e => setQuery(e.target.value)} aria-label="Buscar por título, autor o ISBN"
                    placeholder="Título, autor, editorial o ISBN" className="w-full bg-black/40 border text-sm rounded-xl pl-10 pr-10 py-3.5 focus:outline-none placeholder-white/30"
                    style={{ borderColor: `${accent}44`, color: TEXT }} />
                  {query && <button type="button" onClick={() => setQuery('')} aria-label="Limpiar búsqueda" className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5" style={{ color: `${TEXT}88` }}><FaTimes size={12} /></button>}
                </div>
                <div className="flex gap-2 overflow-x-auto mt-3 -mx-1 px-1 pb-0.5" style={{ scrollbarWidth: 'none' }}>
                  <FilterChip active={quick === 'todos'} onClick={() => setQuick('todos')} label="Todo" />
                  {quickChips.filter(([, , n]) => n > 0).map(([key, label, n]) => (
                    <FilterChip key={key} active={quick === key} onClick={() => setQuick(quick === key ? 'todos' : key)} label={label} count={n} />
                  ))}
                </div>
                {ordersOn && (
                  <button type="button" onClick={() => openTracker()} className="mt-3.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: theme.accentLight }}>
                    <FaClipboardList size={11} /> Consultar mi pedido o encargo
                  </button>
                )}
              </div>
            )}

            {/* ── Resultados de la búsqueda / filtro ── */}
            {isOn(profile, 'catalog') && filtering && (
              <section ref={catalogRef} className="scroll-mt-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[12px]" style={{ color: `${TEXT}b3` }}>{results.length} resultado{results.length === 1 ? '' : 's'}{dq.trim() ? ` para «${dq.trim()}»` : ''}</p>
                  <button type="button" onClick={() => { setQuery(''); setQuick('todos'); }} className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: theme.accentLight }}>Limpiar</button>
                </div>
                {results.length === 0 ? (
                  <div className="text-center py-8 rounded-2xl border" style={{ background: SURFACE, borderColor: `${TEXT}12` }}>
                    <FaBoxOpen className="mx-auto text-3xl mb-2" style={{ color: `${TEXT}33` }} />
                    <p className="text-sm text-white font-semibold">No encontramos ese libro</p>
                    <p className="text-[12px] mt-1 px-6" style={{ color: `${TEXT}99` }}>{isPro ? 'Si no está en el catálogo, te lo conseguimos.' : 'Prueba con otras palabras o escríbenos por WhatsApp.'}</p>
                    {isPro && <button type="button" onClick={() => setRequestOpen(true)} className="mt-4 px-5 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-[0.14em]" style={{ background: accent, color: theme.onAccent }}>Encargarlo</button>}
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-x-3 gap-y-5">
                    {results.slice(0, visible).map(t => <BookCard key={t.id} t={t} today={today} onOpen={() => setDetail(t)} onAdd={ordersOn ? () => addToCart(t) : undefined} inCart={cart[t.id]} />)}
                  </div>
                )}
                {results.length > visible && (
                  <button type="button" onClick={() => setVisible(v => v + PAGE)} className="mt-5 w-full py-3 rounded-xl text-[11px] font-semibold uppercase tracking-[0.16em] border transition hover:bg-white/[0.04]" style={{ borderColor: `${accent}55`, color: TEXT }}>Ver más ({results.length - visible})</button>
                )}
              </section>
            )}

            {/* ── Estantes curados ── */}
            {!filtering && isOn(profile, 'featured') && featured.length > 0 && (
              <section>
                <SectionHeading kicker="Selección del librero">El librero recomienda</SectionHeading>
                <Shelf>{featured.map(t => <BookCard key={t.id} t={t} today={today} shelf onOpen={() => setDetail(t)} onAdd={ordersOn ? () => addToCart(t) : undefined} inCart={cart[t.id]} />)}</Shelf>
              </section>
            )}
            {!filtering && isOn(profile, 'news') && news.length > 0 && (
              <section>
                <SectionHeading kicker="Recién llegados">Novedades y preventas</SectionHeading>
                <Shelf>{news.map(t => <BookCard key={t.id} t={t} today={today} shelf onOpen={() => setDetail(t)} onAdd={ordersOn ? () => addToCart(t) : undefined} inCart={cart[t.id]} />)}</Shelf>
              </section>
            )}
            {!filtering && isOn(profile, 'bestsellers') && bestsellers.length >= 3 && (
              <section>
                <SectionHeading kicker="Lo que más se lee">Más vendidos</SectionHeading>
                <Shelf>{bestsellers.map(t => <BookCard key={t.id} t={t} today={today} shelf onOpen={() => setDetail(t)} onAdd={ordersOn ? () => addToCart(t) : undefined} inCart={cart[t.id]} />)}</Shelf>
              </section>
            )}

            {/* ── Catálogo por género ── */}
            {!filtering && isOn(profile, 'catalog') && (loading || titles.length > 0) && (
              <section ref={catalogRef} className="scroll-mt-4">
                <SectionHeading kicker="Nuestro fondo">Catálogo</SectionHeading>
                {loading ? (
                  <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2" style={{ borderColor: accent }} /></div>
                ) : (
                  <>
                    {categories.length > 1 && (
                      <div className="flex gap-2 overflow-x-auto mb-5 -mx-4 px-4 pb-1" style={{ scrollbarWidth: 'none' }}>
                        <FilterChip active={activeCat === ALL} onClick={() => setActiveCat(ALL)} label="Todos" count={titles.length} />
                        {categories.map(([c, n]) => <FilterChip key={c} active={activeCat === c} onClick={() => setActiveCat(c)} label={c} count={n} />)}
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-x-3 gap-y-5">
                      {gridList.slice(0, visible).map(t => <BookCard key={t.id} t={t} today={today} onOpen={() => setDetail(t)} onAdd={ordersOn ? () => addToCart(t) : undefined} inCart={cart[t.id]} />)}
                    </div>
                    <div className="mt-6 space-y-2.5">
                      {gridList.length > visible && (
                        <button type="button" onClick={() => setVisible(v => v + PAGE)} className="w-full py-3 rounded-xl text-[11px] font-semibold uppercase tracking-[0.16em] border transition hover:bg-white/[0.04]" style={{ borderColor: `${accent}55`, color: TEXT }}>Ver más libros ({gridList.length - visible})</button>
                      )}
                      {titles.length > PAGE && (
                        <button type="button" onClick={() => setShowAll(true)} className="w-full py-3.5 rounded-xl font-semibold text-xs uppercase tracking-[0.15em] transition hover:brightness-110 flex items-center justify-center gap-2" style={{ background: accent, color: theme.onAccent }}>
                          <FaBookOpen size={12} /> Ver todo el catálogo ({titles.length})
                        </button>
                      )}
                    </div>
                  </>
                )}
              </section>
            )}

            {/* ── Tarjetas de acción por plan ── */}
            {(isPro || isUltra) && (
              <div className="space-y-3">
                {isPro && isOn(profile, 'requests') && (
                  <FeatureCard icon={<FaFeatherAlt />} title="¿No lo encuentras? Encárgalo" desc="Dinos el título y lo conseguimos por ti, con precio y plazo." onClick={() => setRequestOpen(true)} />
                )}
                {isUltra && isOn(profile, 'giftcards') && (
                  <FeatureCard icon={<FaGift />} title="Tarjeta de regalo" desc="Que elija su próximo libro. Desde $5, con tu dedicatoria." onClick={() => setGiftOpen(true)} />
                )}
                {isPro && isOn(profile, 'club') && (
                  <>
                    <FeatureCard icon={<FaBookOpen />} title={`Únete al ${clubName}`} desc={clubTagline} onClick={() => setClubOpen(true)} />
                    <PassCard kicker="Connexo Pass" badge="Lector" title="Mi carnet de lector"
                      desc="Consulta tu descuento, tus compras y tus beneficios con tu código, email o teléfono."
                      button="Ver mi carnet" placeholder="Tu código (L-XXXX), email o teléfono" onOpen={id => setPassOpen(id)} />
                  </>
                )}
              </div>
            )}

            {/* ── Listas escolares (PRO+) ── */}
            {isPro && isOn(profile, 'lists') && lists.length > 0 && (
              <section>
                <SectionHeading kicker="Pídela completa de un toque">Listas escolares y de lectura</SectionHeading>
                <div className="space-y-3">
                  {lists.map(l => {
                    const total = listTotal(l); const availN = l.items.filter(i => i.available).length;
                    return (
                      <button key={l.id} type="button" onClick={() => setListOpen(l)}
                        className="w-full text-left rounded-2xl border p-4 flex items-center gap-3.5 transition hover:-translate-y-0.5" style={{ background: SURFACE, borderColor: `${accent}33` }}>
                        <div className="flex -space-x-5 shrink-0" aria-hidden>
                          {l.items.slice(0, 3).map((i, n) => (
                            <div key={i.title_id} className="w-9 h-[54px] rounded overflow-hidden border" style={{ borderColor: SURFACE, zIndex: 3 - n, boxShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>
                              {i.cover_url ? <img src={i.cover_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full" style={{ background: `linear-gradient(160deg, ${spineColor(i.title)}, ${BG_DARK})`, boxShadow: `inset 0 0 0 1px ${accent}33, inset 4px 0 0 ${accent}22` }} />}
                            </div>
                          ))}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-white font-bold text-[15px] leading-snug" style={{ fontFamily: TITLE_FONT }}>{l.name}</p>
                          <p className="text-[11px] mt-0.5" style={{ color: `${TEXT}99` }}>{[l.school, l.grade].filter(Boolean).join(' · ') || `${l.items.length} libros`}</p>
                          <p className="text-[11px] mt-1 font-semibold" style={{ color: availN < l.items.length ? '#fbbf24' : theme.accentLight }}>
                            {availN} de {l.items.length} disponibles · {fmtMoney(total)}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ── Eventos (ULTRA) ── */}
            {isUltra && isOn(profile, 'events') && events.length > 0 && (
              <section>
                <SectionHeading kicker="En la librería">Próximos eventos</SectionHeading>
                <div className="space-y-3">
                  {events.map(ev => {
                    const full = ev.seats_left !== null && ev.seats_left <= 0;
                    const [, mm, dd] = ev.event_date.slice(0, 10).split('-');
                    return (
                      <button key={ev.id} type="button" onClick={() => setEventOpen(ev)}
                        className="w-full text-left rounded-2xl border overflow-hidden flex transition hover:-translate-y-0.5" style={{ background: SURFACE, borderColor: `${accent}33` }}>
                        <div className="w-[68px] shrink-0 flex flex-col items-center justify-center" style={{ background: `${accent}1f`, borderRight: `1px solid ${accent}33` }}>
                          <span className="text-[24px] font-bold leading-none text-white" style={{ fontFamily: TITLE_FONT }}>{dd}</span>
                          <span className="text-[10px] uppercase tracking-[0.2em] mt-1" style={{ color: theme.accentLight }}>{prettyDate(`${ev.event_date.slice(0, 4)}-${mm}-${dd}`, { month: 'short' })}</span>
                        </div>
                        <div className="min-w-0 flex-1 p-3.5">
                          <p className="text-[9px] uppercase tracking-[0.22em] font-semibold" style={{ color: theme.accentLight }}>{EVENT_KIND_LABEL[ev.kind as keyof typeof EVENT_KIND_LABEL] || 'Evento'}</p>
                          <p className="text-white font-bold text-[15px] leading-snug mt-0.5" style={{ fontFamily: TITLE_FONT }}>{ev.title}</p>
                          <p className="text-[11px] mt-1 flex flex-wrap gap-x-3 gap-y-0.5" style={{ color: `${TEXT}99` }}>
                            {ev.start_time && <span className="flex items-center gap-1"><FaClock size={9} /> {ev.start_time}</span>}
                            {ev.host_name && <span className="flex items-center gap-1"><FaUserAlt size={9} /> {ev.host_name}</span>}
                            {ev.location && <span className="flex items-center gap-1 min-w-0"><FaMapMarkerAlt size={9} /> <span className="truncate">{ev.location}</span></span>}
                          </p>
                          <p className="text-[11px] font-semibold mt-1.5" style={{ color: full ? '#f87171' : ev.seats_left !== null && ev.seats_left <= 5 ? '#fbbf24' : '#4ade80' }}>
                            {full ? 'Lleno' : ev.seats_left === null ? 'Cupo abierto' : `Quedan ${ev.seats_left} lugares`} · {ev.price > 0 ? fmtMoney(ev.price) : 'Entrada libre'}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ── Enlaces ── */}
            {isOn(profile, 'links') && sorted.length > 0 && (
              <div className="space-y-2.5">
                {sorted.map(l => <PillLink key={l.id} href={l.url} onNavigate={() => onLinkClick?.(l.id)} icon={<FaLink size={12} style={{ color: `${TEXT}b3` }} />}>{l.title}</PillLink>)}
              </div>
            )}

            {/* ── Cómo recibes tus libros ── */}
            {isOn(profile, 'policies') && hasPolicies && (
              <section>
                <SectionHeading kicker="Bueno saber">Cómo recibes tus libros</SectionHeading>
                <ul className="rounded-2xl border p-4 space-y-3 text-[13px]" style={{ background: SURFACE, borderColor: `${TEXT}12`, color: `${TEXT}cc` }}>
                  {settings.pickupEnabled !== false && (
                    <li className="flex gap-3"><FaStore size={13} className="mt-0.5 shrink-0" style={{ color: accent }} /><span><b className="text-white">Retiro en tienda.</b> {settings.pickupNote || 'Te avisamos cuando tu pedido esté listo.'}</span></li>
                  )}
                  {settings.deliveryEnabled && (
                    <li className="flex gap-3"><FaTruck size={13} className="mt-0.5 shrink-0" style={{ color: accent }} /><span><b className="text-white">Envío a domicilio</b>{(settings.deliveryFee || 0) > 0 ? ` por ${fmtMoney(settings.deliveryFee)}` : ' sin costo'}{(settings.freeShippingFrom || 0) > 0 ? `, gratis desde ${fmtMoney(settings.freeShippingFrom)}` : ''}. {settings.deliveryNote || ''}</span></li>
                  )}
                  {hasHold && <li className="flex gap-3"><FaShoppingBag size={13} className="mt-0.5 shrink-0" style={{ color: accent }} /><span><b className="text-white">Apartado.</b> Guardamos tu pedido {settings.holdDays} día{settings.holdDays === 1 ? '' : 's'}.</span></li>}
                  {isPro && <li className="flex gap-3"><FaFeatherAlt size={13} className="mt-0.5 shrink-0" style={{ color: accent }} /><span><b className="text-white">Encargos.</b> ¿No tenemos tu libro? Lo pedimos por ti.</span></li>}
                  {(settings.giftWrapFee !== undefined) && isPro && <li className="flex gap-3"><FaGift size={13} className="mt-0.5 shrink-0" style={{ color: accent }} /><span><b className="text-white">Para regalo.</b> Lo envolvemos con tu dedicatoria{(settings.giftWrapFee || 0) > 0 ? ` (+${fmtMoney(settings.giftWrapFee)})` : ''}.</span></li>}
                </ul>
              </section>
            )}

            <HoursSection profile={profile} title="Horario de la librería" />

            <ProfileExtraSections profile={profile} accent={accent} isMobilePreview={isMobilePreview} />

            <ReviewsSection profile={profile} onLeave={onLeaveTestimonial} isMobilePreview={isMobilePreview} title="Lo que dicen nuestros lectores" kicker="Opiniones" />

            <footer className="text-center pt-6">
              <a href="https://connexo.app" target="_blank" rel="noopener noreferrer"
                className="text-[10px] uppercase tracking-[0.3em] transition" style={{ color: `${TEXT}b3` }}>Powered by Connexo</a>
            </footer>
          </ProfileHero>
        </div>

        {/* ── Pedido flotante ── */}
        {!isMobilePreview && ordersOn && cartCount > 0 && !cartOpen && (
          <div className="fixed inset-x-0 bottom-0 z-[9000] px-4 pb-4 pointer-events-none">
            <div className="max-w-xl mx-auto pointer-events-auto">
              {toast && <p role="status" className="mb-2 text-center text-[11px] font-semibold rounded-full px-4 py-2 mx-auto w-fit max-w-full truncate" style={{ background: '#fff', color: '#111' }}>{toast}</p>}
              <button type="button" onClick={() => setCartOpen(true)}
                className="w-full flex items-center justify-between gap-3 rounded-2xl px-5 py-4 font-bold shadow-2xl transition hover:brightness-110"
                style={{ background: accent, color: theme.onAccent, boxShadow: `0 18px 40px -12px ${accent}` }}>
                <span className="flex items-center gap-2.5 text-[13px] uppercase tracking-[0.12em]"><FaShoppingBag size={14} /> Ver mi pedido · {cartCount}</span>
                <span className="text-[16px]" style={{ fontFamily: TITLE_FONT }}>{fmtMoney(cartTotal)}</span>
              </button>
            </div>
          </div>
        )}

        {showAll && (
          <FullCatalogView items={catalogItems} onBack={() => setShowAll(false)}
            onSelect={raw => { setShowAll(false); setDetail(raw); }}
            accent={accent} bg={BG_DARK} text={TEXT} muted={`${TEXT}80`} fontFamily={BODY_FONT}
            title="Catálogo completo" searchPlaceholder="Título, autor, editorial o ISBN" emptyLabel="Pronto publicaremos nuestro catálogo."
            ctaLabel="Ver libro →" isMobilePreview={isMobilePreview} />
        )}

        {detail && (
          <BookDetailModal t={detail} titles={titles} today={today} ctx={ctx} inCart={cart[detail.id] || 0}
            onAdd={qty => addToCart(detail, qty)} onClose={() => setDetail(null)}
            onOpenOther={t => setDetail(t)} onWait={t => setWaitFor(t)} />
        )}
        {waitFor && <WaitlistModal t={waitFor} ctx={ctx} onClose={() => setWaitFor(null)} />}
        {requestOpen && <RequestModal ctx={ctx} initialTitle={dq.trim()} onTrack={code => { setRequestOpen(false); openTracker(code); }} onClose={() => setRequestOpen(false)} />}
        {cartOpen && (
          <CartModal ctx={ctx} titlesById={titlesById} cart={cart} listName={listName}
            setQty={setQty} remove={removeFromCart} clear={() => { setCart({}); setListName(null); }}
            onTrack={code => { setCartOpen(false); openTracker(code); }} onClose={() => setCartOpen(false)} onChanged={reloadTitles} />
        )}
        {trackerOpen && <TrackerModal ctx={ctx} initialCode={trackerCode} onClose={() => setTrackerOpen(false)} />}
        {clubOpen && <ClubModal ctx={ctx} clubName={clubName} clubTagline={clubTagline} onClose={() => setClubOpen(false)} />}
        {passOpen !== null && <MemberModal ctx={ctx} initialId={passOpen} onClose={() => setPassOpen(null)} />}
        {listOpen && <ListModal list={listOpen} onAdd={addList} onClose={() => setListOpen(null)} />}
        {eventOpen && <EventModal ev={eventOpen} ctx={ctx} onTrack={code => { setEventOpen(null); openTracker(code); }} onBooked={reloadEvents} onClose={() => setEventOpen(null)} />}
        {giftOpen && <GiftCardModal ctx={ctx} onTrack={code => { setGiftOpen(false); openTracker(code); }} onClose={() => setGiftOpen(false)} />}
      </div>
    </KitProvider>
  );
};

export default ProfileBooksTemplate;
