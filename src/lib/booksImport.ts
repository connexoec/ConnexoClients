import type { BookFormat, BookCondition } from '../../types';
import { detectDelimiter, parseDelimited, normalizePrice } from './csvImport';
import { normalizeIsbn, isValidIsbn, FORMATS, CONDITIONS, FORMAT_LABEL, CONDITION_LABEL } from './booksCommon';
import { normalizeText } from '../../hooks/useCatalogSearch';

/**
 * Importación masiva del catálogo de la librería desde CSV o celdas pegadas
 * de Excel (ULTRA). Reutiliza el lector RFC 4180 del resto del proyecto
 * (comillas, comas internas, saltos de línea dentro de una celda, BOM y
 * separador detectado solo) y añade lo propio de los libros: columnas ES/EN,
 * ISBN validado, formato/condición reconocidos por nombre y emparejamiento
 * con el catálogo por ISBN.
 */

export interface ImportedBook {
  title: string;
  author?: string;
  publisher?: string;
  isbn?: string;
  category?: string;
  price?: number;
  original_price?: number | null;
  stock?: number | null;          // null = bajo pedido
  book_format?: BookFormat;
  lang?: string;
  pages?: number;
  pub_year?: number;
  description?: string;
  cover_url?: string;
  book_condition?: BookCondition;
  line: number;                   // fila del archivo (para los avisos)
}

export type BookField = keyof Omit<ImportedBook, 'line'>;

const ALIASES: Record<BookField, string[]> = {
  title: ['titulo', 'title', 'libro', 'nombre', 'nombre del libro', 'nombre del producto'],
  author: ['autor', 'author', 'autores', 'escritor'],
  publisher: ['editorial', 'publisher', 'sello', 'editor'],
  isbn: ['isbn', 'isbn13', 'isbn 13', 'isbn-13', 'codigo de barras', 'ean', 'codigo isbn'],
  category: ['genero', 'categoria', 'category', 'genre', 'materia', 'seccion', 'tipo'],
  price: ['precio', 'price', 'pvp', 'precio venta', 'precio de venta', 'precio usd', 'precio (usd)', 'valor'],
  original_price: ['precio lista', 'precio de lista', 'precio original', 'precio anterior', 'precio normal', 'original price', 'list price', 'precio regular'],
  stock: ['stock', 'existencias', 'existencia', 'inventario', 'cantidad', 'unidades', 'qty', 'copias'],
  book_format: ['formato', 'format', 'encuadernacion', 'tapa'],
  lang: ['idioma', 'language', 'lengua'],
  pages: ['paginas', 'páginas', 'pages', 'num paginas', 'numero de paginas', 'no. paginas'],
  pub_year: ['ano', 'año', 'year', 'anio', 'ano de publicacion', 'año de publicación', 'fecha de publicacion'],
  description: ['descripcion', 'sinopsis', 'description', 'resumen', 'reseña', 'resena'],
  cover_url: ['portada', 'cover', 'imagen', 'foto', 'url portada', 'url de la portada', 'imagen url', 'image'],
  book_condition: ['condicion', 'estado', 'condition', 'estado del libro'],
};

/** Encabezado del archivo → campo del libro (comparación sin tildes ni mayúsculas). */
export const mapBookHeader = (header: string): BookField | null => {
  const h = normalizeText(header).replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!h) return null;
  for (const [field, list] of Object.entries(ALIASES) as [BookField, string[]][]) {
    if (list.some(a => normalizeText(a).replace(/[_\-.]+/g, ' ') === h)) return field;
  }
  return null;
};

const num = (raw: string): number | undefined => {
  const n = Number(normalizePrice(raw).replace('$', ''));
  return isFinite(n) && String(raw).trim() !== '' ? n : undefined;
};
const intIn = (raw: string, min: number, max: number): number | undefined => {
  const m = /(\d+)/.exec(String(raw || ''));
  if (!m) return undefined;
  const n = Number(m[1]);
  return n >= min && n <= max ? n : undefined;
};

const parseFormat = (raw: string): BookFormat | undefined => {
  const t = normalizeText(raw);
  if (!t) return undefined;
  if (/dura|hardcover|hard cover|pasta dura/.test(t)) return 'tapa_dura';
  if (/blanda|paperback|rustica|pasta blanda|rustica/.test(t)) return 'tapa_blanda';
  if (/bolsillo|pocket/.test(t)) return 'bolsillo';
  if (/digital|ebook|e-book|epub|pdf/.test(t)) return 'digital';
  if (/audio/.test(t)) return 'audiolibro';
  const direct = FORMATS.find(f => f === t.replace(/\s+/g, '_') || normalizeText(FORMAT_LABEL[f]) === t);
  return direct ?? 'otro';
};

const parseCondition = (raw: string): BookCondition | undefined => {
  const t = normalizeText(raw);
  if (!t) return undefined;
  if (/como nuevo|like new|seminuevo|casi nuevo/.test(t)) return 'como_nuevo';
  if (/aceptable|regular|desgastado|acceptable/.test(t)) return 'aceptable';
  if (/bueno|buen estado|usado|good|segunda mano|used/.test(t)) return 'bueno';
  if (/nuevo|new/.test(t)) return 'nuevo';
  return CONDITIONS.find(c => normalizeText(CONDITION_LABEL[c]) === t);
};

export interface BooksParseResult {
  rows: ImportedBook[];
  headers: { raw: string; field: BookField | null }[];
  warnings: string[];
  skipped: number;
}

export const parseBooksText = (text: string): BooksParseResult => {
  const warnings: string[] = [];
  const grid = parseDelimited(text, detectDelimiter(text)).filter(r => r.some(c => String(c).trim() !== ''));
  if (grid.length === 0) return { rows: [], headers: [], warnings: ['El archivo está vacío.'], skipped: 0 };

  const headRow = grid[0];
  const headers = headRow.map(raw => ({ raw: String(raw).trim(), field: mapBookHeader(String(raw)) }));
  const idx = (f: BookField) => headers.findIndex(h => h.field === f);
  if (idx('title') < 0) {
    return { rows: [], headers, warnings: ['No encontré la columna del título. Usa una primera fila con encabezados como «Título», «Autor», «ISBN», «Precio»…'], skipped: 0 };
  }
  const unknown = headers.filter(h => h.raw && !h.field).map(h => h.raw);
  if (unknown.length) warnings.push(`Columnas que no reconocí y se ignoran: ${unknown.slice(0, 6).join(', ')}${unknown.length > 6 ? '…' : ''}.`);

  const rows: ImportedBook[] = [];
  let skipped = 0;
  let badIsbn = 0;
  grid.slice(1).forEach((r, i) => {
    const get = (f: BookField) => { const k = idx(f); return k >= 0 ? String(r[k] ?? '').trim() : ''; };
    const title = get('title');
    if (!title) { skipped += 1; return; }
    const isbnRaw = get('isbn');
    const isbn = isbnRaw ? normalizeIsbn(isbnRaw) : '';
    if (isbnRaw && !isValidIsbn(isbn)) badIsbn += 1;
    const stockRaw = get('stock');
    const orig = num(get('original_price'));
    rows.push({
      line: i + 2,
      title: title.slice(0, 300),
      author: get('author') || undefined,
      publisher: get('publisher') || undefined,
      isbn: isbnRaw ? (isbn || undefined) : undefined,
      category: get('category') || undefined,
      price: num(get('price')),
      original_price: orig !== undefined && orig > 0 ? orig : undefined,
      // Celda vacía = no tocar el stock; «bajo pedido» / «-» = sin control.
      stock: stockRaw === '' ? undefined : /^(bajo pedido|sin control|ilimitado|-|∞)$/i.test(stockRaw) ? null : (intIn(stockRaw, 0, 1_000_000) ?? undefined),
      book_format: parseFormat(get('book_format')),
      lang: get('lang') || undefined,
      pages: intIn(get('pages'), 1, 20000),
      pub_year: intIn(get('pub_year'), 1000, 2200),
      description: get('description') || undefined,
      cover_url: /^https?:\/\//i.test(get('cover_url')) ? get('cover_url') : undefined,
      book_condition: parseCondition(get('book_condition')),
    });
  });
  if (skipped) warnings.push(`${skipped} fila(s) sin título se omitieron.`);
  if (badIsbn) warnings.push(`${badIsbn} ISBN no pasan la validación (dígito de control). Se importan igual: revísalos.`);
  const noPrice = rows.filter(r => r.price === undefined).length;
  if (noPrice) warnings.push(`${noPrice} libro(s) sin precio quedarán en «Consultar».`);
  return { rows, headers, warnings, skipped };
};

export type ImportAction = 'nuevo' | 'actualizar' | 'omitir';
export interface ImportPlan {
  row: ImportedBook;
  action: ImportAction;
  existingId?: string;
  reason?: string;
}

/**
 * Decide qué hacer con cada fila frente al catálogo actual.
 *  - mode «solo nuevos»: lo que ya existe (mismo ISBN) se omite.
 *  - mode «actualizar»: lo que ya existe se actualiza (precio, stock, etc.) y lo demás se agrega.
 * Sin ISBN no hay forma segura de emparejar, así que se trata como nuevo; un mismo
 * ISBN repetido DENTRO del archivo se agrupa en una sola fila (la última manda).
 */
export const planImport = (
  rows: ImportedBook[],
  existing: { id: string; isbn?: string | null }[],
  mode: 'solo_nuevos' | 'actualizar',
): ImportPlan[] => {
  const byIsbn = new Map<string, string>();
  existing.forEach(e => { const k = e.isbn ? normalizeIsbn(e.isbn) : ''; if (k && !byIsbn.has(k)) byIsbn.set(k, e.id); });

  const lastByIsbn = new Map<string, number>();
  rows.forEach((r, i) => { if (r.isbn) lastByIsbn.set(r.isbn, i); });

  return rows.map((row, i) => {
    if (row.isbn && lastByIsbn.get(row.isbn) !== i) return { row, action: 'omitir' as const, reason: 'ISBN repetido en el archivo' };
    const id = row.isbn ? byIsbn.get(row.isbn) : undefined;
    if (id) return mode === 'actualizar' ? { row, action: 'actualizar' as const, existingId: id } : { row, action: 'omitir' as const, reason: 'Ya está en tu catálogo' };
    return { row, action: 'nuevo' as const };
  });
};

/** Campos que realmente vienen en la fila (para no pisar con vacío lo que ya tenía el libro). */
export const rowToPayload = (row: ImportedBook): Record<string, any> => {
  const p: Record<string, any> = { title: row.title };
  const set = (k: string, v: any) => { if (v !== undefined) p[k] = v; };
  set('author', row.author); set('publisher', row.publisher); set('isbn', row.isbn); set('category', row.category);
  set('price', row.price); set('original_price', row.original_price); set('stock', row.stock);
  set('book_format', row.book_format); set('lang', row.lang); set('pages', row.pages); set('pub_year', row.pub_year);
  set('description', row.description); set('cover_url', row.cover_url); set('book_condition', row.book_condition);
  return p;
};

export const BOOKS_CSV_HEADERS = ['Título', 'Autor', 'Editorial', 'ISBN', 'Género', 'Precio', 'Precio de lista', 'Stock', 'Formato', 'Idioma', 'Páginas', 'Año', 'Condición', 'Descripción', 'Portada'];

export const booksCsvTemplate = (): string => {
  const esc = (v: string) => (/[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const sample = [
    ['Cien años de soledad', 'Gabriel García Márquez', 'Debolsillo', '9788437604947', 'Novela', '14.90', '18.00', '12', 'Tapa blanda', 'Español', '496', '1967', 'Nuevo', 'La saga de los Buendía en Macondo.', ''],
    ['El principito', 'Antoine de Saint-Exupéry', 'Salamandra', '9788478887194', 'Infantil', '9.50', '', '', 'Tapa dura', 'Español', '96', '1943', 'Nuevo', '', ''],
  ];
  return '﻿' + [BOOKS_CSV_HEADERS, ...sample].map(r => r.map(esc).join(',')).join('\r\n');
};

export const booksToCsv = (books: any[]): string => {
  const esc = (v: any) => { const s = v === null || v === undefined ? '' : String(v); return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rows = books.map(b => [
    b.title, b.author, b.publisher, b.isbn, b.category, b.price, b.original_price, b.stock === null || b.stock === undefined ? 'Bajo pedido' : b.stock,
    FORMAT_LABEL[b.book_format as BookFormat] || b.book_format, b.lang, b.pages, b.pub_year,
    CONDITION_LABEL[b.book_condition as BookCondition] || b.book_condition, b.description, b.cover_url,
  ]);
  return '﻿' + [BOOKS_CSV_HEADERS, ...rows].map(r => r.map(esc).join(',')).join('\r\n');
};
