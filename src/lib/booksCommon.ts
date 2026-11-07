import type { BookTitle, BookFormat, BookCondition, BookOrderStatus, BookRequestStatus, BookEventKind } from '../../types';
import { normalizeText } from '../../hooks/useCatalogSearch';

/**
 * Lógica de la plantilla Librería compartida por el perfil público y por el
 * panel: etiquetas, estado de stock, descuentos, preventas y búsqueda.
 *
 * Está aparte de los componentes porque es lo único que puede fallar en
 * silencio (un «Últimas unidades» que no sale, un descuento mal redondeado, un
 * título que no aparece al buscarlo por ISBN).
 */

export const FORMAT_LABEL: Record<BookFormat, string> = {
  tapa_blanda: 'Tapa blanda', tapa_dura: 'Tapa dura', bolsillo: 'Bolsillo',
  digital: 'Digital', audiolibro: 'Audiolibro', otro: 'Otro formato',
};
export const FORMATS = Object.keys(FORMAT_LABEL) as BookFormat[];

export const CONDITION_LABEL: Record<BookCondition, string> = {
  nuevo: 'Nuevo', como_nuevo: 'Como nuevo', bueno: 'Buen estado', aceptable: 'Aceptable',
};
export const CONDITIONS = Object.keys(CONDITION_LABEL) as BookCondition[];

export const ORDER_STEPS: BookOrderStatus[] = ['recibido', 'preparando', 'listo', 'entregado'];
export const ORDER_STATUS_LABEL: Record<BookOrderStatus, string> = {
  recibido: 'Pedido recibido', preparando: 'Preparando tus libros', listo: 'Listo', entregado: 'Entregado', cancelado: 'Cancelado',
};
/** Texto del estado «listo» según cómo recibe el lector sus libros. */
export const readyLabel = (deliveryType?: string) => (deliveryType === 'envio' ? 'Listo para enviar' : 'Listo para retirar');

export const REQUEST_STEPS: BookRequestStatus[] = ['recibido', 'buscando', 'cotizado', 'conseguido', 'entregado'];
export const REQUEST_STATUS_LABEL: Record<BookRequestStatus, string> = {
  recibido: 'Encargo recibido', buscando: 'Buscándolo', cotizado: 'Cotizado', conseguido: 'Ya lo tenemos',
  entregado: 'Entregado', no_disponible: 'No disponible', cancelado: 'Cancelado',
};

export const EVENT_KIND_LABEL: Record<BookEventKind, string> = {
  presentacion: 'Presentación', firma: 'Firma de libros', club_lectura: 'Club de lectura',
  taller: 'Taller', infantil: 'Infantil', otro: 'Evento',
};
export const EVENT_KINDS = Object.keys(EVENT_KIND_LABEL) as BookEventKind[];

/** Géneros que se sugieren al cargar un libro (el dueño puede escribir cualquiera). */
export const BOOK_CATEGORY_PRESETS = [
  'Novela', 'Cuento y relato', 'Poesía', 'Ensayo', 'Historia', 'Biografía', 'Ciencia', 'Autoayuda',
  'Negocios', 'Infantil', 'Juvenil', 'Cómic y manga', 'Arte', 'Cocina', 'Religión', 'Texto escolar',
  'Universitario', 'Idiomas', 'Papelería',
];

/** Cuántos títulos admite cada plan (espejo del trigger del servidor; ultra = sin tope). */
export const titleLimit = (plan?: string | null): number | null => {
  const p = String(plan || '').toLowerCase();
  return p === 'ultra' ? null : p === 'pro' ? 500 : 50;
};

/** ¿Cuántos libros quedan en el plan? null = sin tope. */
export const titlesLeft = (plan: string | undefined | null, current: number): number | null => {
  const lim = titleLimit(plan);
  return lim === null ? null : Math.max(lim - current, 0);
};

export type StockKind = 'bajo_pedido' | 'agotado' | 'ultimas' | 'disponible';
export const LOW_STOCK = 3;

export const stockState = (stock?: number | null): { kind: StockKind; label: string } => {
  if (stock === null || stock === undefined) return { kind: 'bajo_pedido', label: 'Bajo pedido' };
  if (stock <= 0) return { kind: 'agotado', label: 'Agotado' };
  if (stock <= LOW_STOCK) return { kind: 'ultimas', label: stock === 1 ? '¡Última unidad!' : `¡Últimas ${stock} unidades!` };
  return { kind: 'disponible', label: 'Disponible' };
};

/** ¿Se puede pedir ahora? (visible y con copias, o sin control de stock). */
export const canOrder = (t: Pick<BookTitle, 'stock' | 'is_available'>): boolean =>
  t.is_available !== false && (t.stock === null || t.stock === undefined || t.stock > 0);

/** Copias que se pueden poner en un pedido (tope de 20 por título, igual que el servidor). */
export const maxQty = (t: Pick<BookTitle, 'stock'>): number =>
  t.stock === null || t.stock === undefined ? 20 : Math.max(Math.min(t.stock, 20), 0);

/** % de descuento frente al precio de lista, redondeado; 0 si no hay precio tachado válido. */
export const discountPercent = (price?: number | null, original?: number | null): number => {
  const p = Number(price), o = Number(original);
  if (!isFinite(p) || !isFinite(o) || o <= 0 || o <= p) return 0;
  return Math.round(((o - p) / o) * 100);
};

/** Preventa: sale en el futuro (fecha YYYY-MM-DD comparada como texto, sin Date ni zona horaria). */
export const isPreorder = (t: Pick<BookTitle, 'release_date'>, todayISO: string): boolean =>
  !!t.release_date && t.release_date.slice(0, 10) > todayISO;

/** Novedad: salió en los últimos N días (o se cargó hace poco si no tiene fecha de salida). */
export const isNewRelease = (t: Pick<BookTitle, 'release_date' | 'created_at'>, todayISO: string, days = 60): boolean => {
  const ref = (t.release_date || '').slice(0, 10);
  if (!ref) return false;
  if (ref > todayISO) return false;                     // las preventas no son «novedad» todavía
  const ms = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, (m || 1) - 1, d || 1); };
  return (ms(todayISO) - ms(ref)) / 86400000 <= days;
};

export const isUsed = (t: Pick<BookTitle, 'book_condition'>) => (t.book_condition || 'nuevo') !== 'nuevo';

export const authorLine = (t: Pick<BookTitle, 'author' | 'publisher' | 'pub_year'>) =>
  [t.author, t.publisher, t.pub_year].filter(Boolean).join(' · ');

/* ── Búsqueda ──────────────────────────────────────────────────────────────── */
/** Texto sobre el que se busca: título, autor, editorial, ISBN (con y sin guiones), género y etiquetas. */
export const bookHaystack = (t: Partial<BookTitle>): string =>
  normalizeText([t.title, t.subtitle, t.author, t.publisher, t.isbn, t.category, t.lang, ...(t.tags || [])].filter(Boolean).join(' '));

/** Tokens en AND y en cualquier orden: «garcia cien» encuentra «Cien años de soledad · García Márquez». */
export const matchesBookQuery = (t: Partial<BookTitle>, query: string): boolean => {
  const raw = String(query || '').trim();
  if (!raw) return true;
  const hay = bookHaystack(t);
  // Un ISBN tecleado con guiones («978-84-376-…») se parte en trozos; cada trozo
  // aparece dentro del ISBN guardado sin guiones, así que también lo encuentra.
  return normalizeText(raw.replace(/[-–]/g, ' '))
    .split(/\s+/).filter(Boolean)
    .every(tok => hay.includes(tok));
};

/* ── ISBN ──────────────────────────────────────────────────────────────────── */
export const normalizeIsbn = (raw: string): string => String(raw || '').toUpperCase().replace(/[^0-9X]/g, '').slice(0, 13);

export const isValidIsbn = (raw: string): boolean => {
  const s = normalizeIsbn(raw);
  if (s.length === 13 && /^\d{13}$/.test(s)) {
    const sum = s.split('').reduce((a, c, i) => a + Number(c) * (i % 2 === 0 ? 1 : 3), 0);
    return sum % 10 === 0;
  }
  if (s.length === 10 && /^\d{9}[\dX]$/.test(s)) {
    const sum = s.split('').reduce((a, c, i) => a + (c === 'X' ? 10 : Number(c)) * (10 - i), 0);
    return sum % 11 === 0;
  }
  return false;
};

/* ── Dinero ────────────────────────────────────────────────────────────────── */
/** Redondeo a centavos sin errores de coma flotante (0.1 + 0.2). */
export const round2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export interface CartLine { id: string; qty: number }

/**
 * Estimado del pedido en pantalla. ⚠️ Es solo una vista previa: el precio real
 * lo calcula SIEMPRE place_books_order en el servidor. La prueba de integración
 * exige que ambos coincidan.
 */
export const estimateOrder = (
  lines: { price: number; qty: number }[],
  opts: { discountPct?: number; deliveryType?: 'retiro' | 'envio'; deliveryFee?: number; freeShippingFrom?: number; giftWrap?: boolean; giftWrapFee?: number },
) => {
  const subtotal = round2(lines.reduce((a, l) => a + round2(l.price * l.qty), 0));
  const discount = round2(subtotal * Math.min(Math.max(opts.discountPct || 0, 0), 100) / 100);
  let fee = 0;
  if (opts.deliveryType === 'envio') {
    fee = Math.max(opts.deliveryFee || 0, 0);
    if ((opts.freeShippingFrom || 0) > 0 && subtotal - discount >= (opts.freeShippingFrom || 0)) fee = 0;
  }
  const wrap = opts.giftWrap ? Math.max(opts.giftWrapFee || 0, 0) : 0;
  return { subtotal, discount, fee, wrap, total: round2(subtotal - discount + fee + wrap) };
};
