import { normalizeIsbn, isValidIsbn } from './booksCommon';

/**
 * Autocompletado de un libro por ISBN o por título con Open Library
 * (https://openlibrary.org): gratis, sin clave, con CORS abierto (comprobado:
 * responde `access-control-allow-origin: *` tanto la API como las portadas).
 *
 * Todo es «mejor esfuerzo»: si no hay internet, el libro no está o el servicio
 * cae, devuelve null / [] y el dueño sigue cargando a mano. NUNCA lanza.
 * Lo que trae es una sugerencia que el dueño revisa antes de guardar.
 */

export interface BookSuggestion {
  title: string;
  subtitle?: string;
  author?: string;
  publisher?: string;
  isbn?: string;
  pages?: number;
  pub_year?: number;
  category?: string;
  description?: string;
  cover_url?: string;
  lang?: string;
}

const OL = 'https://openlibrary.org';
const TIMEOUT_MS = 9000;

const getJson = async (url: string): Promise<any | null> => {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null;
  try {
    const res = await fetch(url, { signal: ctrl?.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; } finally { if (timer) clearTimeout(timer); }
};

/** Open Library mezcla temas en inglés y español: se traduce al género más cercano. */
const GENRE_MAP: [RegExp, string][] = [
  [/juvenile|children|infantil|ni[ñn]os/i, 'Infantil'],
  [/young adult|juvenil/i, 'Juvenil'],
  [/comic|manga|graphic novel/i, 'Cómic y manga'],
  [/poetry|poes[ií]a|poems/i, 'Poesía'],
  [/biograph|memoir|biograf/i, 'Biografía'],
  [/histor/i, 'Historia'],
  [/self-help|autoayuda|self help/i, 'Autoayuda'],
  [/business|economics|negocios|management/i, 'Negocios'],
  [/cook|cocina|gastronom/i, 'Cocina'],
  [/science|ciencia|physics|biology|mathematics/i, 'Ciencia'],
  [/religion|spiritual|bible|biblia/i, 'Religión'],
  [/art\b|arte|painting|photography/i, 'Arte'],
  [/short stories|cuentos|relatos/i, 'Cuento y relato'],
  [/essay|ensayo/i, 'Ensayo'],
  [/fiction|novel|ficci[oó]n|novela/i, 'Novela'],
];
export const guessCategory = (subjects: string[] = []): string | undefined => {
  const blob = subjects.join(' | ');
  for (const [re, label] of GENRE_MAP) if (re.test(blob)) return label;
  return undefined;
};

const yearOf = (s?: string): number | undefined => {
  const m = /(1[0-9]{3}|2[01][0-9]{2})/.exec(String(s || ''));
  return m ? Number(m[1]) : undefined;
};

const fromData = (d: any, isbn: string): BookSuggestion => {
  const text = (v: any) => (typeof v === 'string' ? v : v?.value);
  const subjects: string[] = Array.isArray(d.subjects) ? d.subjects.map((s: any) => s?.name).filter(Boolean) : [];
  const desc = text(d.notes) || (Array.isArray(d.excerpts) ? text(d.excerpts[0]?.text) : undefined);
  return {
    title: String(d.title || '').trim(),
    subtitle: d.subtitle ? String(d.subtitle).trim() : undefined,
    author: Array.isArray(d.authors) ? d.authors.map((a: any) => a?.name).filter(Boolean).join(', ') || undefined : undefined,
    publisher: Array.isArray(d.publishers) ? d.publishers[0]?.name : undefined,
    isbn,
    pages: Number(d.number_of_pages) > 0 ? Number(d.number_of_pages) : undefined,
    pub_year: yearOf(d.publish_date),
    category: guessCategory(subjects),
    description: desc ? String(desc).slice(0, 1500) : undefined,
    cover_url: d.cover?.large || d.cover?.medium || undefined,
  };
};

/** Busca por ISBN-10/13. null = no se encontró o no hay conexión. */
export const lookupIsbn = async (raw: string): Promise<BookSuggestion | null> => {
  const isbn = normalizeIsbn(raw);
  if (!isValidIsbn(isbn)) return null;
  const json = await getJson(`${OL}/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
  const d = json?.[`ISBN:${isbn}`];
  if (!d || !d.title) return null;
  const out = fromData(d, isbn);
  // Si la API no trae portada pero Open Library la tiene por ISBN, se usa esa URL.
  if (!out.cover_url) out.cover_url = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;
  return out;
};

/** Sugerencias por título/autor (hasta 6), con el primer ISBN que traiga cada una. */
export const searchBooks = async (query: string): Promise<BookSuggestion[]> => {
  const q = String(query || '').trim();
  if (q.length < 3) return [];
  const fields = 'title,subtitle,author_name,first_publish_year,publisher,number_of_pages_median,isbn,cover_i,subject';
  const json = await getJson(`${OL}/search.json?q=${encodeURIComponent(q)}&limit=6&fields=${fields}`);
  const docs: any[] = Array.isArray(json?.docs) ? json.docs : [];
  return docs.filter(d => d?.title).map(d => {
    const isbn13 = (Array.isArray(d.isbn) ? d.isbn : []).map(normalizeIsbn).find((i: string) => i.length === 13 && isValidIsbn(i));
    return {
      title: String(d.title).trim(),
      subtitle: d.subtitle ? String(d.subtitle).trim() : undefined,
      author: Array.isArray(d.author_name) ? d.author_name.slice(0, 3).join(', ') : undefined,
      publisher: Array.isArray(d.publisher) ? d.publisher[0] : undefined,
      isbn: isbn13,
      pages: Number(d.number_of_pages_median) > 0 ? Number(d.number_of_pages_median) : undefined,
      pub_year: Number(d.first_publish_year) || undefined,
      category: guessCategory(Array.isArray(d.subject) ? d.subject.slice(0, 40) : []),
      cover_url: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : undefined,
    } as BookSuggestion;
  });
};

/**
 * Descarga una portada externa como archivo para subirla a NUESTRO almacenamiento
 * (así no depende de que Open Library siga sirviéndola). null si no se pudo.
 */
export const fetchCoverFile = async (url?: string): Promise<File | null> => {
  if (!url || !/^https:\/\//i.test(url)) return null;
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null;
  try {
    const res = await fetch(url, { signal: ctrl?.signal });
    if (!res.ok) return null;
    const blob = await res.blob();
    // Open Library devuelve un GIF de 1×1 cuando no hay portada: se descarta.
    if (!blob.type.startsWith('image/') || blob.size < 1200) return null;
    return new File([blob], 'portada.jpg', { type: blob.type });
  } catch { return null; } finally { if (timer) clearTimeout(timer); }
};
