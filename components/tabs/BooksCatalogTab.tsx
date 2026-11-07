import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../src/lib/supabase';
import type { BookTitle, BookFormat, BookCondition } from '../../types';
import {
  FaPlus, FaPen, FaTrash, FaBook, FaEye, FaEyeSlash, FaStar, FaRegStar, FaMinus, FaBarcode, FaSearch, FaImage, FaTimes, FaMagic,
} from 'react-icons/fa';
import { AdminModal, Field, adminInput, Spinner, MissingSqlNotice, Kpi, PlanLock, uploadAsset, money, isMissingSql } from '../AdminKit';
import {
  ACCENT, ON_ACCENT, TITLE_FONT, btnPrimary, iconBtn, dangerBtn, TabHeader, Empty, SearchBox, Pills,
} from '../books/BooksAdminUi';
import { IsbnScanner, canScanBarcodes } from '../books/BooksIsbnScanner';
import { BooksListsPanel } from '../books/BooksListsPanel';
import { BooksImportPanel } from '../books/BooksImportPanel';
import {
  FORMATS, FORMAT_LABEL, CONDITIONS, CONDITION_LABEL, BOOK_CATEGORY_PRESETS, titleLimit, matchesBookQuery, normalizeIsbn, isValidIsbn,
  LOW_STOCK, stockState,
} from '../../src/lib/booksCommon';
import { lookupIsbn, searchBooks, fetchCoverFile, type BookSuggestion } from '../../src/lib/booksIsbn';

interface Props {
  user: any;
  profileData: any;
  setProfileData: React.Dispatch<React.SetStateAction<any>>;
  showNotification: (message: string, type: 'success' | 'error') => void;
  plan: 'conecta' | 'pro' | 'ultra';
}

type View = 'libros' | 'listas' | 'importar';
type Filter = 'todos' | 'agotados' | 'bajo' | 'destacados' | 'ocultos' | 'usados';
const SHOWN = 40;

/** Trae TODO el catálogo del dueño (PostgREST corta en 1000 filas por consulta). */
const loadAll = async (userId: string): Promise<BookTitle[]> => {
  const out: BookTitle[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabase.from('books_titles').select('*').eq('shop_profile_id', userId)
      .order('created_at', { ascending: false }).range(from, from + 999);
    if (error) throw error;
    const rows = (data ?? []) as BookTitle[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
};

export const BooksCatalogTab: React.FC<Props> = ({ user, showNotification, plan }) => {
  const isPro = plan !== 'conecta';
  const isUltra = plan === 'ultra';
  const [view, setView] = useState<View>('libros');
  const [titles, setTitles] = useState<BookTitle[]>([]);
  const [loading, setLoading] = useState(true);
  const [missingSql, setMissingSql] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('todos');
  const [shown, setShown] = useState(SHOWN);
  const [modal, setModal] = useState<{ open: boolean; editing: BookTitle | null }>({ open: false, editing: null });

  const reload = useCallback(async () => {
    if (!user?.id) return;
    try { setTitles(await loadAll(user.id)); setMissingSql(false); }
    catch (err: any) { if (isMissingSql(err)) setMissingSql(true); else console.error('books_titles fetch error:', err?.message); }
    finally { setLoading(false); }
  }, [user?.id]);
  useEffect(() => { reload(); }, [reload]);

  const limit = titleLimit(plan);
  const atLimit = limit !== null && titles.length >= limit;

  const stats = useMemo(() => ({
    out: titles.filter(t => t.stock === 0).length,
    low: titles.filter(t => t.stock !== null && t.stock !== undefined && t.stock > 0 && t.stock <= LOW_STOCK).length,
    value: titles.reduce((a, t) => a + (t.stock ? t.price * t.stock : 0), 0),
  }), [titles]);

  const visible = useMemo(() => {
    let list = titles;
    if (filter === 'agotados') list = list.filter(t => t.stock === 0);
    else if (filter === 'bajo') list = list.filter(t => t.stock !== null && t.stock !== undefined && t.stock > 0 && t.stock <= LOW_STOCK);
    else if (filter === 'destacados') list = list.filter(t => t.is_featured);
    else if (filter === 'ocultos') list = list.filter(t => !t.is_available);
    else if (filter === 'usados') list = list.filter(t => t.book_condition !== 'nuevo');
    return query.trim() ? list.filter(t => matchesBookQuery(t, query)) : list;
  }, [titles, filter, query]);
  useEffect(() => { setShown(SHOWN); }, [filter, query, view]);

  const patch = async (id: string, change: Partial<BookTitle>) => {
    setTitles(ts => ts.map(t => (t.id === id ? { ...t, ...change } : t)));       // optimista
    const { error } = await supabase.from('books_titles').update(change).eq('id', id);
    if (error) { showNotification(error.message, 'error'); reload(); }
  };
  const bump = (t: BookTitle, d: number) => {
    const next = Math.max((t.stock ?? 0) + d, 0);
    patch(t.id, { stock: next });
  };
  const remove = async (t: BookTitle) => {
    if (!window.confirm(`¿Eliminar «${t.title}»? Los pedidos ya hechos conservan su nombre.`)) return;
    const { error } = await supabase.from('books_titles').delete().eq('id', t.id);
    if (error) return showNotification(error.message, 'error');
    setTitles(ts => ts.filter(x => x.id !== t.id));
  };

  if (loading) return <Spinner accent={ACCENT} />;

  return (
    <div className="animate-fade-in-up space-y-6 max-w-4xl mx-auto px-4 md:px-6 pb-32" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      <TabHeader icon={<FaBook />} title="Catálogo" subtitle="Tus libros: precios, stock, portadas y el librero recomienda."
        action={view === 'libros' && !missingSql ? (
          <button onClick={() => atLimit ? showNotification(`Tu plan permite ${limit} títulos. Mejora tu plan para cargar más.`, 'error') : setModal({ open: true, editing: null })}
            className={btnPrimary} style={{ background: ACCENT, color: ON_ACCENT }}><FaPlus /> Agregar libro</button>
        ) : undefined} />

      <Pills<View> value={view} onChange={setView} items={[['libros', `Libros (${titles.length})`], ['listas', `Listas escolares${isPro ? '' : ' 🔒'}`], ['importar', `Importar${isUltra ? '' : ' 🔒'}`]]} />

      {missingSql && <MissingSqlNotice file="setup_books.sql" accent={ACCENT} />}

      {view === 'libros' && !missingSql && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label={limit === null ? 'Títulos' : `Títulos de ${limit}`} value={titles.length} accent={ACCENT} tone={atLimit ? 'warn' : undefined} />
            <Kpi label="Agotados" value={stats.out} accent={ACCENT} tone={stats.out > 0 ? 'bad' : undefined} />
            <Kpi label={`Stock bajo (≤${LOW_STOCK})`} value={stats.low} accent={ACCENT} tone={stats.low > 0 ? 'warn' : undefined} />
            <Kpi label="Valor del inventario" value={money(stats.value)} accent={ACCENT} />
          </div>
          {atLimit && <p className="text-xs rounded-xl border px-4 py-3" style={{ background: `${ACCENT}10`, borderColor: `${ACCENT}44`, color: '#fff' }}>Llegaste al límite de {limit} títulos de tu plan. Con PRO llegas a 500 y con ULTRA es ilimitado.</p>}

          <div className="flex flex-col sm:flex-row gap-3">
            <SearchBox value={query} onChange={setQuery} placeholder="Buscar por título, autor, ISBN o editorial" />
          </div>
          <Pills<Filter> value={filter} onChange={setFilter} items={[['todos', 'Todos'], ['agotados', 'Agotados'], ['bajo', 'Stock bajo'], ['destacados', 'Recomendados'], ['usados', 'Usados'], ['ocultos', 'Ocultos']]} />

          {titles.length === 0 ? (
            <Empty emoji="📚">Carga tu primer libro. Escribe o escanea su ISBN y completamos el título, el autor y la portada por ti.</Empty>
          ) : visible.length === 0 ? (
            <Empty emoji="🔎">Ningún libro coincide con esa búsqueda.</Empty>
          ) : (
            <div className="space-y-2.5">
              {visible.slice(0, shown).map(t => {
                const st = stockState(t.stock);
                return (
                  <div key={t.id} className="flex items-center gap-3 rounded-xl border px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)', opacity: t.is_available ? 1 : 0.5 }}>
                    <div className="w-10 h-[60px] rounded overflow-hidden bg-white/5 shrink-0 flex items-center justify-center">
                      {t.cover_url ? <img src={t.cover_url} alt="" className="w-full h-full object-cover" /> : <FaBook className="text-white/20" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-white font-bold truncate" style={{ fontFamily: TITLE_FONT }}>{t.title}</p>
                      <p className="text-[11px] text-white/45 truncate">{[t.author, t.category, t.isbn].filter(Boolean).join(' · ') || 'Sin datos'}</p>
                      <p className="text-[12px] mt-0.5"><b className="text-white">{t.price > 0 ? money(t.price) : 'Consultar'}</b>{t.original_price && t.original_price > t.price ? <span className="text-white/35 line-through ml-1.5">{money(t.original_price)}</span> : null}
                        {t.book_condition !== 'nuevo' && <span className="ml-2 text-[10px] uppercase text-white/50">{CONDITION_LABEL[t.book_condition]}</span>}
                        <span className="ml-2 text-[10px] font-semibold" style={{ color: st.kind === 'agotado' ? '#f87171' : st.kind === 'ultimas' ? '#fbbf24' : 'rgba(255,255,255,0.4)' }}>{t.sold_count > 0 ? `· ${t.sold_count} vendidos` : ''}</span></p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0" title="Copias en stock">
                      <button aria-label="Menos stock" onClick={() => bump(t, -1)} disabled={!t.stock} className={iconBtn}><FaMinus size={9} /></button>
                      <span className="w-10 text-center text-sm font-black" style={{ color: st.kind === 'agotado' ? '#f87171' : st.kind === 'ultimas' ? '#fbbf24' : '#fff' }}>{t.stock === null || t.stock === undefined ? '∞' : t.stock}</span>
                      <button aria-label="Más stock" onClick={() => bump(t, 1)} className={iconBtn}><FaPlus size={9} /></button>
                    </div>
                    <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                      <button title={t.is_featured ? 'Quitar de recomendados' : 'Recomendar'} aria-label="Recomendado" onClick={() => patch(t.id, { is_featured: !t.is_featured })} className={iconBtn}>{t.is_featured ? <FaStar style={{ color: ACCENT }} /> : <FaRegStar />}</button>
                      <button title={t.is_available ? 'Ocultar del catálogo' : 'Mostrar en el catálogo'} aria-label="Visible" onClick={() => patch(t.id, { is_available: !t.is_available })} className={iconBtn}>{t.is_available ? <FaEye /> : <FaEyeSlash />}</button>
                      <button aria-label="Editar" onClick={() => setModal({ open: true, editing: t })} className={iconBtn}><FaPen size={11} /></button>
                      <button aria-label="Eliminar" onClick={() => remove(t)} className={dangerBtn}><FaTrash size={11} /></button>
                    </div>
                    <button className="sm:hidden w-8 h-8 rounded-lg bg-white/5 border border-white/10 text-white/70 flex items-center justify-center" aria-label="Opciones" onClick={() => setModal({ open: true, editing: t })}><FaPen size={11} /></button>
                  </div>
                );
              })}
              {visible.length > shown && (
                <button type="button" onClick={() => setShown(s => s + SHOWN)} className="w-full py-3 rounded-xl text-xs font-bold uppercase tracking-wider border border-white/10 text-white/60 hover:text-white hover:bg-white/5">Ver más ({visible.length - shown})</button>
              )}
            </div>
          )}
        </>
      )}

      {view === 'listas' && (isPro
        ? <BooksListsPanel userId={user.id} titles={titles} showNotification={showNotification} />
        : <PlanLock plan="PRO" what="Listas escolares: paquetes de libros que tus clientes piden de un toque" accent={ACCENT} />)}

      {view === 'importar' && (isUltra
        ? <BooksImportPanel userId={user.id} titles={titles} showNotification={showNotification} onDone={reload} />
        : <PlanLock plan="ULTRA" what="Importar tu catálogo completo desde Excel o CSV" accent={ACCENT} />)}

      {modal.open && (
        <BookModal userId={user.id} editing={modal.editing} titles={titles} showNotification={showNotification}
          onClose={() => setModal({ open: false, editing: null })} onSaved={() => { setModal({ open: false, editing: null }); reload(); }} />
      )}
    </div>
  );
};

/* ── Libro ─────────────────────────────────────────────────────────────────── */
const BookModal: React.FC<{
  userId: string; editing: BookTitle | null; titles: BookTitle[]; showNotification: Props['showNotification']; onClose: () => void; onSaved: () => void;
}> = ({ userId, editing, titles, showNotification, onClose, onSaved }) => {
  const [f, setF] = useState({
    title: editing?.title || '', subtitle: editing?.subtitle || '', author: editing?.author || '', publisher: editing?.publisher || '',
    isbn: editing?.isbn || '', category: editing?.category || '', book_format: (editing?.book_format || 'tapa_blanda') as BookFormat,
    lang: editing?.lang || 'Español', pages: editing?.pages != null ? String(editing.pages) : '', pub_year: editing?.pub_year != null ? String(editing.pub_year) : '',
    release_date: editing?.release_date?.slice(0, 10) || '', description: editing?.description || '',
    price: editing ? String(editing.price) : '', original_price: editing?.original_price != null ? String(editing.original_price) : '',
    stock: editing ? (editing.stock === null || editing.stock === undefined ? '' : String(editing.stock)) : '1',
    book_condition: (editing?.book_condition || 'nuevo') as BookCondition, is_featured: editing?.is_featured ?? false,
    staff_note: editing?.staff_note || '', tags: (editing?.tags || []).join(', '), is_available: editing?.is_available ?? true,
  });
  const [cover, setCover] = useState<string>(editing?.cover_url || '');
  const [images, setImages] = useState<string[]>(editing?.images || []);
  const [uploading, setUploading] = useState(false); const [saving, setSaving] = useState(false);
  const [lookup, setLookup] = useState<{ state: 'idle' | 'busy' | 'ok' | 'miss'; msg?: string }>({ state: 'idle' });
  const [suggestions, setSuggestions] = useState<BookSuggestion[]>([]);
  const [scanning, setScanning] = useState(false);
  const set = (k: keyof typeof f, v: any) => setF(p => ({ ...p, [k]: v }));

  /** Aplica una sugerencia SIN pisar lo que el dueño ya escribió (salvo `force`). */
  const apply = async (s: BookSuggestion, force = false) => {
    setF(p => {
      const pick = (cur: string, next?: string | number) => (!force && cur.trim() ? cur : next != null ? String(next) : cur);
      return {
        ...p, title: pick(p.title, s.title), subtitle: pick(p.subtitle, s.subtitle), author: pick(p.author, s.author),
        publisher: pick(p.publisher, s.publisher), isbn: pick(p.isbn, s.isbn), category: pick(p.category, s.category),
        pages: pick(p.pages, s.pages), pub_year: pick(p.pub_year, s.pub_year), description: pick(p.description, s.description),
      };
    });
    if (s.cover_url && (force || !cover)) {
      const file = await fetchCoverFile(s.cover_url);
      if (file) { try { setCover(await uploadAsset(userId, 'books_covers', file)); return; } catch { /* sigue con la URL externa */ } }
      if (/^https:\/\//i.test(s.cover_url) && !s.cover_url.includes('default=false')) setCover(s.cover_url);
    }
  };

  const doLookup = async (isbnArg?: string) => {
    const isbn = normalizeIsbn(isbnArg ?? f.isbn);
    if (!isValidIsbn(isbn)) return setLookup({ state: 'miss', msg: 'Ese ISBN no es válido. Revisa los dígitos (10 o 13).' });
    setLookup({ state: 'busy' });
    const s = await lookupIsbn(isbn);
    if (!s) return setLookup({ state: 'miss', msg: 'No encontré ese ISBN en la base abierta. Llénalo a mano.' });
    set('isbn', isbn);
    await apply({ ...s, isbn }, false);
    setLookup({ state: 'ok', msg: 'Autocompletado desde Open Library. Revisa los datos antes de guardar.' });
  };

  const doSearch = async () => {
    if (f.title.trim().length < 3) return;
    setLookup({ state: 'busy' });
    const list = await searchBooks(`${f.title} ${f.author}`.trim());
    setSuggestions(list);
    setLookup(list.length ? { state: 'idle' } : { state: 'miss', msg: 'No encontré coincidencias. Llénalo a mano.' });
  };

  const upload = async (files: FileList | null, asCover: boolean) => {
    if (!files?.length) return;
    const room = asCover ? 1 : 3 - images.length;
    if (room <= 0) return showNotification('Máximo 3 fotos extra por libro.', 'error');
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files).slice(0, room)) urls.push(await uploadAsset(userId, 'books_covers', file));
      if (asCover) setCover(urls[0]); else setImages(p => [...p, ...urls]);
    } catch (err: any) { showNotification(`Error al subir: ${err?.message}`, 'error'); }
    finally { setUploading(false); }
  };

  const save = async () => {
    if (!f.title.trim()) return showNotification('El título es obligatorio.', 'error');
    const price = f.price === '' ? 0 : Number(f.price.replace(',', '.'));
    if (!isFinite(price) || price < 0) return showNotification('El precio no es válido.', 'error');
    const orig = f.original_price === '' ? null : Number(f.original_price.replace(',', '.'));
    if (orig !== null && (!isFinite(orig) || orig < 0)) return showNotification('El precio de lista no es válido.', 'error');
    const stock = f.stock.trim() === '' ? null : Math.max(Math.round(Number(f.stock)), 0);
    if (stock !== null && !isFinite(stock)) return showNotification('El stock no es válido.', 'error');
    const isbn = normalizeIsbn(f.isbn);
    if (isbn && titles.some(t => t.isbn && normalizeIsbn(t.isbn) === isbn && t.id !== editing?.id)
        && !window.confirm('Ya tienes un libro con ese ISBN (¿otra edición o un ejemplar usado?). ¿Guardar igual?')) return;
    const payload = {
      shop_profile_id: userId, title: f.title.trim(), subtitle: f.subtitle.trim() || null, author: f.author.trim() || null,
      publisher: f.publisher.trim() || null, isbn: isbn || null, category: f.category.trim() || null, book_format: f.book_format,
      lang: f.lang.trim() || 'Español', pages: f.pages ? Math.round(Number(f.pages)) || null : null, pub_year: f.pub_year ? Math.round(Number(f.pub_year)) || null : null,
      release_date: f.release_date || null, description: f.description.trim() || null, cover_url: cover || null, images,
      price, original_price: orig !== null && orig > price ? orig : null, stock, book_condition: f.book_condition,
      is_featured: f.is_featured, staff_note: f.staff_note.trim() || null,
      tags: f.tags.split(',').map(s => s.trim()).filter(Boolean).slice(0, 12), is_available: f.is_available,
    };
    setSaving(true);
    const { error } = editing ? await supabase.from('books_titles').update(payload).eq('id', editing.id) : await supabase.from('books_titles').insert(payload);
    setSaving(false);
    if (error) {
      if (/catalog_limit/.test(error.message)) return showNotification('Llegaste al límite de títulos de tu plan.', 'error');
      return showNotification(isMissingSql(error) ? 'Falta ejecutar setup_books.sql en Supabase.' : `No se pudo guardar: ${error.message}`, 'error');
    }
    showNotification(editing ? 'Libro actualizado.' : 'Libro agregado.', 'success');
    onSaved();
  };

  const origNum = Number(f.original_price.replace(',', '.')); const priceNum = Number(f.price.replace(',', '.'));

  return (
    <AdminModal title={editing ? 'Editar libro' : 'Nuevo libro'} accent={ACCENT} onClose={onClose} wide>
      <div className="space-y-3">
        <div className="rounded-xl border p-3.5 space-y-2.5" style={{ background: `${ACCENT}0d`, borderColor: `${ACCENT}33` }}>
          <p className="text-[11px] font-black uppercase tracking-widest text-white/70 flex items-center gap-2"><FaMagic style={{ color: ACCENT }} /> Autocompletar</p>
          <div className="flex gap-2">
            <input className={adminInput} value={f.isbn} onChange={e => set('isbn', e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); doLookup(); } }}
              placeholder="ISBN (978…)" inputMode="numeric" aria-label="ISBN" />
            <button type="button" onClick={() => doLookup()} disabled={lookup.state === 'busy' || !f.isbn.trim()} className="shrink-0 px-4 rounded-xl text-[11px] font-black uppercase disabled:opacity-40" style={{ background: ACCENT, color: ON_ACCENT }}>{lookup.state === 'busy' ? '…' : 'Buscar'}</button>
            {canScanBarcodes() && <button type="button" onClick={() => setScanning(true)} aria-label="Escanear código de barras" className="shrink-0 w-11 rounded-xl border border-white/15 text-white/70 hover:text-white flex items-center justify-center"><FaBarcode /></button>}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={doSearch} disabled={f.title.trim().length < 3 || lookup.state === 'busy'} className="text-[11px] font-bold underline underline-offset-2 disabled:opacity-40" style={{ color: ACCENT }}><FaSearch className="inline mr-1" size={9} />Buscar por título y autor</button>
            {lookup.msg && <span className="text-[11px]" style={{ color: lookup.state === 'ok' ? '#4ade80' : '#fbbf24' }}>{lookup.msg}</span>}
          </div>
          {suggestions.length > 0 && (
            <div className="rounded-lg border border-white/10 divide-y divide-white/5 overflow-hidden">
              {suggestions.map((s, i) => (
                <button key={i} type="button" onClick={async () => { setSuggestions([]); await apply(s, true); setLookup({ state: 'ok', msg: 'Datos aplicados. Revísalos antes de guardar.' }); }}
                  className="w-full text-left px-3 py-2 hover:bg-white/5 flex items-center gap-3">
                  {s.cover_url ? <img src={s.cover_url} alt="" className="w-7 h-10 object-cover rounded shrink-0" /> : <div className="w-7 h-10 rounded bg-white/5 shrink-0" />}
                  <span className="min-w-0"><span className="block text-sm text-white font-semibold truncate">{s.title}</span><span className="block text-[11px] text-white/45 truncate">{[s.author, s.publisher, s.pub_year].filter(Boolean).join(' · ')}</span></span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Título *"><input className={adminInput} value={f.title} onChange={e => set('title', e.target.value)} placeholder="Cien años de soledad" /></Field>
          <Field label="Subtítulo"><input className={adminInput} value={f.subtitle} onChange={e => set('subtitle', e.target.value)} /></Field>
          <Field label="Autor"><input className={adminInput} value={f.author} onChange={e => set('author', e.target.value)} placeholder="Gabriel García Márquez" /></Field>
          <Field label="Editorial"><input className={adminInput} value={f.publisher} onChange={e => set('publisher', e.target.value)} /></Field>
          <Field label="Género"><input className={adminInput} list="books-cats" value={f.category} onChange={e => set('category', e.target.value)} placeholder="Novela" />
            <datalist id="books-cats">{Array.from(new Set([...BOOK_CATEGORY_PRESETS, ...titles.map(t => t.category).filter(Boolean) as string[]])).map(c => <option key={c} value={c} />)}</datalist></Field>
          <Field label="Formato"><select className={adminInput} value={f.book_format} onChange={e => set('book_format', e.target.value)}>{FORMATS.map(x => <option key={x} value={x}>{FORMAT_LABEL[x]}</option>)}</select></Field>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Precio *"><input className={adminInput} inputMode="decimal" value={f.price} onChange={e => set('price', e.target.value)} placeholder="14.90" /></Field>
          <Field label="Precio de lista" hint="Para mostrar el descuento"><input className={adminInput} inputMode="decimal" value={f.original_price} onChange={e => set('original_price', e.target.value)} /></Field>
          <Field label="Stock" hint="Vacío = bajo pedido"><input className={adminInput} inputMode="numeric" value={f.stock} onChange={e => set('stock', e.target.value.replace(/[^0-9]/g, ''))} /></Field>
          <Field label="Estado"><select className={adminInput} value={f.book_condition} onChange={e => set('book_condition', e.target.value)}>{CONDITIONS.map(x => <option key={x} value={x}>{CONDITION_LABEL[x]}</option>)}</select></Field>
        </div>
        {origNum > 0 && origNum <= priceNum && <p className="text-[11px] text-amber-400">El precio de lista debe ser mayor que el precio para mostrar el descuento.</p>}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Páginas"><input className={adminInput} inputMode="numeric" value={f.pages} onChange={e => set('pages', e.target.value.replace(/[^0-9]/g, ''))} /></Field>
          <Field label="Año"><input className={adminInput} inputMode="numeric" value={f.pub_year} onChange={e => set('pub_year', e.target.value.replace(/[^0-9]/g, ''))} /></Field>
          <Field label="Idioma"><input className={adminInput} list="books-langs" value={f.lang} onChange={e => set('lang', e.target.value)} /><datalist id="books-langs">{['Español', 'Inglés', 'Francés', 'Portugués', 'Italiano', 'Alemán', 'Bilingüe'].map(l => <option key={l} value={l} />)}</datalist></Field>
          <Field label="Sale el" hint="Futuro = preventa"><input type="date" className={adminInput} value={f.release_date} onChange={e => set('release_date', e.target.value)} /></Field>
        </div>

        <Field label="Sinopsis"><textarea className={adminInput} rows={3} value={f.description} onChange={e => set('description', e.target.value)} /></Field>
        <Field label="El librero dice" hint="Tu recomendación en una frase: se muestra destacada en la ficha"><textarea className={adminInput} rows={2} maxLength={300} value={f.staff_note} onChange={e => set('staff_note', e.target.value)} /></Field>
        <Field label="Etiquetas" hint="Separadas por coma: bestseller, regalo, premio nobel"><input className={adminInput} value={f.tags} onChange={e => set('tags', e.target.value)} /></Field>

        <Field label="Portada y fotos">
          <div className="flex gap-3 items-start">
            <div className="w-24 aspect-[2/3] rounded-lg overflow-hidden bg-black/30 border border-white/10 shrink-0 relative">
              {cover ? <img src={cover} alt="Portada" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-white/20"><FaImage size={22} /></div>}
              {cover && <button type="button" aria-label="Quitar portada" onClick={() => setCover('')} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white text-[9px] flex items-center justify-center"><FaTimes /></button>}
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/15 text-xs font-bold text-white/70 hover:text-white cursor-pointer">
                <FaImage /> {uploading ? 'Subiendo…' : 'Subir portada'}
                <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={e => { upload(e.target.files, true); e.target.value = ''; }} />
              </label>
              <div className="flex gap-2 flex-wrap">
                {images.map((src, i) => (
                  <div key={src + i} className="relative w-12 h-16 rounded overflow-hidden bg-black/30">
                    <img src={src} alt="" className="w-full h-full object-cover" />
                    <button type="button" aria-label="Quitar foto" onClick={() => setImages(p => p.filter((_, x) => x !== i))} className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 text-white text-[8px] flex items-center justify-center"><FaTimes /></button>
                  </div>
                ))}
                {images.length < 3 && (
                  <label className="w-12 h-16 rounded border border-dashed border-white/20 text-white/40 hover:text-white flex items-center justify-center cursor-pointer" title="Contraportada u otras fotos">
                    <FaPlus size={11} /><input type="file" accept="image/*" multiple className="hidden" disabled={uploading} onChange={e => { upload(e.target.files, false); e.target.value = ''; }} />
                  </label>
                )}
              </div>
            </div>
          </div>
        </Field>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <label className="flex items-center gap-2 text-sm text-white/70"><input type="checkbox" checked={f.is_featured} onChange={e => set('is_featured', e.target.checked)} /> El librero recomienda</label>
          <label className="flex items-center gap-2 text-sm text-white/70"><input type="checkbox" checked={f.is_available} onChange={e => set('is_available', e.target.checked)} /> Visible en el catálogo</label>
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl text-xs font-bold uppercase border border-white/10 text-white/60 hover:text-white">Cancelar</button>
          <button onClick={save} disabled={saving || uploading} className="flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-wider disabled:opacity-50" style={{ background: ACCENT, color: ON_ACCENT }}>{saving ? 'Guardando…' : 'Guardar libro'}</button>
        </div>
      </div>
      {scanning && <IsbnScanner onClose={() => setScanning(false)} onDetected={code => { setScanning(false); set('isbn', code); doLookup(code); }} />}
    </AdminModal>
  );
};

export default BooksCatalogTab;
