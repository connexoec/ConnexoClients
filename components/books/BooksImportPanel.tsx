import React, { useMemo, useRef, useState } from 'react';
import { supabase } from '../../src/lib/supabase';
import type { BookTitle } from '../../types';
import { FaFileUpload, FaDownload, FaCheckCircle, FaExclamationTriangle } from 'react-icons/fa';
import { adminInput } from '../AdminKit';
import { ACCENT, ON_ACCENT, btnGhost } from './BooksAdminUi';
import { downloadCsv } from '../../src/lib/csvImport';
import { parseBooksText, planImport, rowToPayload, booksCsvTemplate, booksToCsv, type BooksParseResult, type ImportPlan } from '../../src/lib/booksImport';

interface Props {
  userId: string;
  titles: BookTitle[];
  showNotification: (message: string, type: 'success' | 'error') => void;
  onDone: () => void;
}

type Mode = 'solo_nuevos' | 'actualizar';
const CHUNK = 200;

/**
 * Importación masiva del catálogo (ULTRA): CSV o celdas pegadas de Excel. Se
 * descarga una plantilla, se rellena y se sube; el ISBN empareja con lo que ya
 * existe para actualizar precio y stock sin duplicar libros.
 */
export const BooksImportPanel: React.FC<Props> = ({ userId, titles, showNotification, onDone }) => {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<Mode>('actualizar');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ added: number; updated: number; omitted: number; failed: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const parsed: BooksParseResult | null = useMemo(() => (text.trim() ? parseBooksText(text) : null), [text]);
  const plan: ImportPlan[] = useMemo(() => (parsed ? planImport(parsed.rows, titles, mode) : []), [parsed, titles, mode]);
  const count = (a: ImportPlan['action']) => plan.filter(p => p.action === a).length;

  const onFile = async (file?: File | null) => {
    if (!file) return;
    try { setText(await file.text()); setSummary(null); } catch { showNotification('No pude leer ese archivo.', 'error'); }
    if (fileRef.current) fileRef.current.value = '';
  };

  const run = async () => {
    if (!parsed || busy) return;
    const toAdd = plan.filter(p => p.action === 'nuevo');
    const toUpdate = plan.filter(p => p.action === 'actualizar');
    if (toAdd.length + toUpdate.length === 0) return showNotification('No hay nada que importar.', 'error');
    if (!window.confirm(`Se agregarán ${toAdd.length} libro(s) y se actualizarán ${toUpdate.length}. ¿Continuar?`)) return;
    setBusy(true); setSummary(null);
    let added = 0, updated = 0, failed = 0;
    try {
      for (let i = 0; i < toAdd.length; i += CHUNK) {
        const slice = toAdd.slice(i, i + CHUNK);
        setProgress(`Agregando ${Math.min(i + CHUNK, toAdd.length)} de ${toAdd.length}…`);
        const { error } = await supabase.from('books_titles').insert(slice.map(p => ({ shop_profile_id: userId, price: 0, ...rowToPayload(p.row) })));
        if (error) {
          // Si falla el bloque, se reintenta uno por uno para saber cuáles sí entran y no perder el resto.
          for (const p of slice) {
            const { error: e2 } = await supabase.from('books_titles').insert({ shop_profile_id: userId, price: 0, ...rowToPayload(p.row) });
            if (e2) failed += 1; else added += 1;
          }
        } else added += slice.length;
      }
      for (let i = 0; i < toUpdate.length; i += 10) {
        const slice = toUpdate.slice(i, i + 10);
        setProgress(`Actualizando ${Math.min(i + 10, toUpdate.length)} de ${toUpdate.length}…`);
        const results = await Promise.all(slice.map(p => supabase.from('books_titles').update(rowToPayload(p.row)).eq('id', p.existingId!).eq('shop_profile_id', userId)));
        results.forEach(r => { if (r.error) failed += 1; else updated += 1; });
      }
    } finally { setBusy(false); setProgress(null); }
    setSummary({ added, updated, omitted: count('omitir'), failed });
    showNotification(`Importación lista: ${added} nuevos, ${updated} actualizados${failed ? `, ${failed} con error` : ''}.`, failed ? 'error' : 'success');
    if (added + updated > 0) { setText(''); onDone(); }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border p-4 space-y-3" style={{ background: `${ACCENT}0a`, borderColor: `${ACCENT}2b` }}>
        <p className="text-sm text-white/70">Sube tu inventario desde Excel o Google Sheets (guárdalo como <b>CSV</b>) o <b>pega las celdas</b> directamente. La primera fila lleva los encabezados: <span className="text-white/90">Título, Autor, Editorial, ISBN, Género, Precio, Precio de lista, Stock, Formato…</span></p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => downloadCsv('plantilla-libros.csv', booksCsvTemplate())} className={`${btnGhost} flex items-center gap-2`}><FaDownload size={11} /> Descargar plantilla</button>
          <button type="button" onClick={() => downloadCsv('mi-catalogo.csv', booksToCsv(titles))} disabled={titles.length === 0} className={`${btnGhost} flex items-center gap-2`}><FaDownload size={11} /> Exportar mi catálogo</button>
          <label className={`${btnGhost} flex items-center gap-2 cursor-pointer`}><FaFileUpload size={11} /> Subir archivo
            <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" className="hidden" onChange={e => onFile(e.target.files?.[0])} /></label>
        </div>
        <textarea className={adminInput} rows={5} value={text} onChange={e => { setText(e.target.value); setSummary(null); }} placeholder="…o pega aquí las filas copiadas de Excel" aria-label="Pegar filas del catálogo" />
      </div>

      {parsed && (
        <div className="space-y-3">
          {parsed.warnings.map((w, i) => <p key={i} className="text-[12px] text-amber-300 flex gap-2"><FaExclamationTriangle className="mt-0.5 shrink-0" size={11} /> {w}</p>)}
          {parsed.rows.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                <span className="text-white"><b style={{ color: ACCENT }}>{count('nuevo')}</b> nuevos</span>
                <span className="text-white"><b style={{ color: ACCENT }}>{count('actualizar')}</b> a actualizar</span>
                <span className="text-white/50"><b>{count('omitir')}</b> omitidos</span>
                <select className="ml-auto bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white" value={mode} onChange={e => setMode(e.target.value as Mode)} aria-label="Qué hacer con los libros que ya existen">
                  <option value="actualizar">Actualizar los que ya tengo (por ISBN) y agregar nuevos</option>
                  <option value="solo_nuevos">Agregar solo los nuevos</option>
                </select>
              </div>
              <div className="rounded-xl border border-white/10 overflow-x-auto">
                <table className="w-full text-[12px] text-left">
                  <thead className="text-white/40 uppercase text-[10px] tracking-wider"><tr><th className="px-3 py-2">Título</th><th className="px-3 py-2">Autor</th><th className="px-3 py-2">ISBN</th><th className="px-3 py-2 text-right">Precio</th><th className="px-3 py-2 text-right">Stock</th><th className="px-3 py-2">Acción</th></tr></thead>
                  <tbody className="divide-y divide-white/5">
                    {plan.slice(0, 8).map(p => (
                      <tr key={p.row.line} className="text-white/80">
                        <td className="px-3 py-2 max-w-[200px] truncate">{p.row.title}</td>
                        <td className="px-3 py-2 max-w-[140px] truncate text-white/50">{p.row.author || '—'}</td>
                        <td className="px-3 py-2 font-mono text-white/50">{p.row.isbn || '—'}</td>
                        <td className="px-3 py-2 text-right">{p.row.price != null ? p.row.price.toFixed(2) : '—'}</td>
                        <td className="px-3 py-2 text-right">{p.row.stock === null ? '∞' : p.row.stock ?? '—'}</td>
                        <td className="px-3 py-2 text-[11px]" style={{ color: p.action === 'omitir' ? 'rgba(255,255,255,0.35)' : ACCENT }} title={p.reason}>{p.action}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {plan.length > 8 && <p className="px-3 py-2 text-[11px] text-white/35">…y {plan.length - 8} filas más.</p>}
              </div>
              <button type="button" onClick={run} disabled={busy || count('nuevo') + count('actualizar') === 0} className="w-full py-3 rounded-xl text-xs font-black uppercase tracking-wider disabled:opacity-50" style={{ background: ACCENT, color: ON_ACCENT }}>
                {busy ? (progress || 'Importando…') : `Importar ${count('nuevo') + count('actualizar')} libros`}
              </button>
            </>
          )}
        </div>
      )}

      {summary && (
        <p className="text-sm text-white flex items-center gap-2 rounded-xl border px-4 py-3" style={{ background: 'rgba(74,222,128,0.08)', borderColor: 'rgba(74,222,128,0.3)' }}>
          <FaCheckCircle className="text-green-400 shrink-0" /> {summary.added} agregados, {summary.updated} actualizados{summary.omitted ? `, ${summary.omitted} omitidos` : ''}{summary.failed ? `, ${summary.failed} con error` : ''}.
        </p>
      )}
    </div>
  );
};
