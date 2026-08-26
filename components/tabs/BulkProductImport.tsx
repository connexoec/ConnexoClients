import React, { useMemo, useRef, useState } from 'react';
import {
  FaFileUpload, FaChevronDown, FaDownload, FaTimes, FaCheckCircle,
  FaExclamationTriangle, FaTable, FaCrown,
} from 'react-icons/fa';
import {
  parseCatalogText, mergeCatalog, catalogCsvTemplate, catalogToCsv, downloadCsv,
  type ImportMode, type ParseResult,
} from '../../src/lib/csvImport';

interface BulkProductImportProps {
  /** Catálogo actual (se fusiona con lo importado según el modo elegido). */
  products: any[];
  /** Persiste el catálogo resultante. Debe lanzar si la escritura falla. */
  onImport: (next: any[]) => Promise<void>;
  showNotification: (message: string, type: 'success' | 'error') => void;
  /** Solo ULTRA puede importar en lote; en otros planes se muestra el candado. */
  isUltra: boolean;
  accent?: string;
  /** Nombre del archivo de exportación, sin extensión. */
  exportName?: string;
  /** Ejemplo de plantilla acorde al negocio (clínica, restaurante, tienda). */
  templateRows?: string[][];
}

const MODE_LABELS: Record<ImportMode, { title: string; hint: string }> = {
  merge: {
    title: 'Actualizar y agregar',
    hint: 'Si el producto ya existe (mismo SKU, o mismo nombre y marca) se actualiza; el resto se agrega. Conserva la imagen y los extras que ya tenías.',
  },
  append: {
    title: 'Solo agregar',
    hint: 'Todo el archivo entra como productos nuevos, aunque se repitan nombres.',
  },
  replace: {
    title: 'Reemplazar catálogo',
    hint: 'Borra el catálogo actual y lo deja exactamente como el archivo. Úsalo solo si el archivo es tu catálogo completo.',
  },
};

export const BulkProductImport: React.FC<BulkProductImportProps> = ({
  products, onImport, showNotification, isUltra,
  accent = '#ff6b35', exportName = 'catalogo', templateRows,
}) => {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState('');
  const [mode, setMode] = useState<ImportMode>('merge');
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const parsed: ParseResult | null = useMemo(
    () => (raw.trim() ? parseCatalogText(raw) : null),
    [raw],
  );

  const reset = () => { setRaw(''); setFileName(''); if (fileRef.current) fileRef.current.value = ''; };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setRaw(text);
      setFileName(file.name);
    } catch (err: any) {
      showNotification(`No se pudo leer el archivo: ${err?.message ?? err}`, 'error');
    }
  };

  const handleImport = async () => {
    if (!parsed || parsed.error || parsed.products.length === 0) return;
    if (mode === 'replace' && !window.confirm(
      `Vas a reemplazar los ${products.length} productos actuales por los ${parsed.products.length} del archivo. ¿Continuar?`
    )) return;

    setImporting(true);
    try {
      const { next, added, updated } = mergeCatalog(products, parsed.products, mode);
      await onImport(next);
      showNotification(
        mode === 'replace'
          ? `Catálogo reemplazado: ${next.length} productos`
          : `${added} producto(s) agregado(s)${updated > 0 ? ` y ${updated} actualizado(s)` : ''}`,
        'success',
      );
      reset();
      setOpen(false);
    } catch (err: any) {
      showNotification(`Error al importar: ${err?.message ?? err}`, 'error');
    } finally {
      setImporting(false);
    }
  };

  const preview = parsed?.products.slice(0, 5) ?? [];

  return (
    <div className="bg-white/[0.03] border rounded-2xl p-5" style={{ borderColor: `${accent}26` }}>
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-2 text-left">
        <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2" style={{ color: accent }}>
          <FaTable size={13} /> Importación masiva (CSV / Excel)
          {!isUltra && (
            <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/60 font-bold flex items-center gap-1">
              <FaCrown size={8} /> ULTRA
            </span>
          )}
        </h3>
        <FaChevronDown size={14} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} style={{ color: accent }} />
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          {!isUltra ? (
            <div className="rounded-xl bg-black/25 border border-white/10 p-4 text-xs text-white/60 leading-relaxed">
              La carga de catálogo por archivo está disponible en el <b className="text-white/85">plan ULTRA</b>,
              junto con el catálogo ilimitado. En tu plan actual puedes cargar hasta 25 productos desde el formulario de arriba.
            </div>
          ) : (
            <>
              <p className="text-xs text-white/50 leading-relaxed">
                Sube tu lista completa de una sola vez. Acepta un archivo <b className="text-white/75">.csv</b> (en Excel:
                Archivo → Guardar como → CSV) o, más rápido todavía, <b className="text-white/75">copia las celdas
                desde Excel y pégalas</b> en el recuadro de abajo.
              </p>

              {/* Plantilla / exportación */}
              <div className="flex flex-wrap gap-2">
                <button type="button"
                  onClick={() => downloadCsv('plantilla_catalogo.csv', catalogCsvTemplate(templateRows))}
                  className="px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:text-white hover:border-white/25 text-[11px] font-bold uppercase tracking-wider transition-all flex items-center gap-2">
                  <FaDownload size={10} /> Descargar plantilla
                </button>
                {products.length > 0 && (
                  <button type="button"
                    onClick={() => downloadCsv(`${exportName}.csv`, catalogToCsv(products))}
                    className="px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:text-white hover:border-white/25 text-[11px] font-bold uppercase tracking-wider transition-all flex items-center gap-2">
                    <FaDownload size={10} /> Exportar catálogo actual ({products.length})
                  </button>
                )}
              </div>

              {/* Entrada de datos */}
              <div className="grid gap-3">
                <label className="flex items-center gap-3 px-4 py-3 rounded-xl bg-black/30 border border-dashed border-white/15 cursor-pointer hover:border-white/30 transition-all">
                  <FaFileUpload size={14} style={{ color: accent }} />
                  <span className="text-xs text-white/60">
                    {fileName || 'Seleccionar archivo .csv'}
                  </span>
                  <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain"
                    onChange={handleFile} className="hidden" />
                </label>

                <div>
                  <label className="block text-[11px] text-white/45 uppercase tracking-widest font-bold mb-1.5">
                    …o pega aquí las celdas copiadas de Excel
                  </label>
                  <textarea value={raw} onChange={e => { setRaw(e.target.value); setFileName(''); }} rows={5}
                    placeholder={'Nombre\tCategoria\tMarca\tPrincipio Activo\tPrecio\nAmoxicilina 500mg\tFarmacia\tGenfar\tAmoxicilina\t12.50'}
                    className="w-full bg-black/40 border border-white/10 text-white text-xs font-mono rounded-xl px-3 py-2.5 focus:outline-none placeholder-white/20 resize-y"
                    style={{ borderColor: raw ? `${accent}40` : undefined }} />
                </div>
              </div>

              {/* Resultado del análisis */}
              {parsed?.error && (
                <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-300 flex items-start gap-2">
                  <FaExclamationTriangle size={12} className="mt-0.5 shrink-0" />
                  <span>{parsed.error}</span>
                </div>
              )}

              {parsed && !parsed.error && (
                <div className="space-y-3">
                  <div className="rounded-xl bg-black/25 border border-white/10 p-3 space-y-1.5">
                    <p className="text-xs text-white/80 flex items-center gap-2">
                      <FaCheckCircle size={11} className="text-emerald-400" />
                      <b>{parsed.products.length}</b> producto(s) listo(s) para importar
                    </p>
                    {parsed.skippedRows > 0 && (
                      <p className="text-[11px] text-amber-300/80">
                        {parsed.skippedRows} fila(s) sin nombre se omitieron.
                      </p>
                    )}
                    {parsed.unmappedHeaders.length > 0 && (
                      <p className="text-[11px] text-white/40">
                        Columnas no reconocidas (se ignoran): {parsed.unmappedHeaders.join(', ')}
                      </p>
                    )}
                  </div>

                  {/* Vista previa */}
                  {preview.length > 0 && (
                    <div className="overflow-x-auto rounded-xl border border-white/10">
                      <table className="w-full text-[11px] text-left">
                        <thead className="bg-white/5 text-white/45 uppercase tracking-wider">
                          <tr>
                            <th className="px-3 py-2 font-bold">Nombre</th>
                            <th className="px-3 py-2 font-bold">Categoría</th>
                            <th className="px-3 py-2 font-bold">Marca</th>
                            <th className="px-3 py-2 font-bold">P. activo</th>
                            <th className="px-3 py-2 font-bold">Precio</th>
                          </tr>
                        </thead>
                        <tbody className="text-white/70">
                          {preview.map(product => (
                            <tr key={product.id} className="border-t border-white/5">
                              <td className="px-3 py-2 text-white/90">{product.name}</td>
                              <td className="px-3 py-2">{product.category || '—'}</td>
                              <td className="px-3 py-2">{product.brand || '—'}</td>
                              <td className="px-3 py-2">{product.activeIngredient || '—'}</td>
                              <td className="px-3 py-2 font-mono">{product.price || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {parsed.products.length > preview.length && (
                        <p className="px-3 py-2 text-[10px] text-white/35 bg-white/[0.02]">
                          + {parsed.products.length - preview.length} producto(s) más…
                        </p>
                      )}
                    </div>
                  )}

                  {/* Modo de importación */}
                  <div className="space-y-2">
                    <p className="text-[11px] text-white/45 uppercase tracking-widest font-bold">¿Cómo aplicar el archivo?</p>
                    {(Object.keys(MODE_LABELS) as ImportMode[]).map(key => (
                      <label key={key}
                        className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                          mode === key ? 'bg-white/[0.06]' : 'bg-black/20 border-white/8 hover:border-white/20'
                        }`}
                        style={mode === key ? { borderColor: accent } : undefined}>
                        <input type="radio" name="import-mode" checked={mode === key}
                          onChange={() => setMode(key)} className="mt-0.5 w-4 h-4"
                          style={{ accentColor: accent }} />
                        <span className="text-xs leading-snug">
                          <b className="text-white/90">{MODE_LABELS[key].title}</b>
                          <span className="block text-white/45 mt-0.5">{MODE_LABELS[key].hint}</span>
                        </span>
                      </label>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button type="button" onClick={handleImport}
                      disabled={importing || parsed.products.length === 0}
                      className="px-5 py-2.5 rounded-xl text-white text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50 flex items-center gap-2"
                      style={{ backgroundColor: accent }}>
                      <FaFileUpload size={11} />
                      {importing ? 'Importando…' : `Importar ${parsed.products.length} producto(s)`}
                    </button>
                    <button type="button" onClick={reset} disabled={importing}
                      className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 disabled:opacity-50">
                      <FaTimes size={10} /> Limpiar
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
