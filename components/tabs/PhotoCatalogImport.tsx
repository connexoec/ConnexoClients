import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FaCamera, FaChevronDown, FaTimes, FaCheckCircle, FaExclamationTriangle,
  FaCrown, FaMagic, FaTrash, FaPlus, FaImage,
} from 'react-icons/fa';
import {
  fileToResizedImage, extractCatalogFromImages, normalizeExtracted, duplicateFlags,
  cropRegionToBlob, downscaleImageBlob, type VisionImage, type VisionProduct,
} from '../../src/lib/catalogVision';
import { mergeCatalog } from '../../src/lib/csvImport';
import { supabase } from '../../src/lib/supabase';

interface PhotoCatalogImportProps {
  /** Catálogo actual (para detectar duplicados y fusionar). */
  products: any[];
  /** Persiste el catálogo resultante. Debe lanzar si la escritura falla. */
  onImport: (next: any[]) => Promise<void>;
  showNotification: (message: string, type: 'success' | 'error') => void;
  /** Solo ULTRA, igual que la importación por archivo. */
  isUltra: boolean;
  /** Dueño del perfil: define la carpeta de storage de las fotos recortadas. */
  userId: string;
  accent?: string;
}

interface PickedImage { id: string; file: File; url: string; }
interface Crop { url: string; blob: Blob; }

export const PhotoCatalogImport: React.FC<PhotoCatalogImportProps> = ({
  products, onImport, showNotification, isUltra, userId, accent = '#00e5a0',
}) => {
  const [open, setOpen] = useState(false);
  const [images, setImages] = useState<PickedImage[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [rows, setRows] = useState<VisionProduct[]>([]);
  const [crops, setCrops] = useState<Record<string, Crop>>({});
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [analyzed, setAnalyzed] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<HTMLInputElement>(null);

  // Limpia las URLs de vista previa al desmontar (evita fugas de memoria).
  useEffect(() => () => { images.forEach(i => URL.revokeObjectURL(i.url)); }, [images]);

  const reset = () => {
    images.forEach(i => URL.revokeObjectURL(i.url));
    Object.values(crops).forEach(c => URL.revokeObjectURL(c.url));
    setImages([]);
    setRows([]);
    setCrops({});
    setExcluded(new Set());
    setAnalyzed(false);
    if (fileRef.current) fileRef.current.value = '';
    if (captureRef.current) captureRef.current.value = '';
  };

  const addFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(event.target.files ?? []);
    if (chosen.length === 0) return;
    const next = chosen.slice(0, 5).map(file => ({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      file,
      url: URL.createObjectURL(file),
    }));
    setImages(prev => [...prev, ...next].slice(0, 5)); // tope de 5 páginas
    // Limpia el input usado para poder volver a elegir el mismo archivo.
    event.target.value = '';
  };

  const removeImage = (id: string) => {
    setImages(prev => {
      const target = prev.find(i => i.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter(i => i.id !== id);
    });
  };

  const handleAnalyze = async () => {
    if (images.length === 0) return;
    setAnalyzing(true);
    try {
      const resized: VisionImage[] = [];
      for (const img of images) {
        resized.push(await fileToResizedImage(img.file));
      }
      const { products: raw, error } = await extractCatalogFromImages(resized);
      if (error) { showNotification(error, 'error'); return; }
      const normalized = normalizeExtracted(raw);

      // Recorta la foto de cada producto que traiga recuadro, desde la imagen
      // original (mejor calidad). Best-effort: si un recorte falla, el producto
      // simplemente queda sin foto.
      const newCrops: Record<string, Crop> = {};
      for (const row of normalized) {
        const idx = row.imageIndex ?? 0;
        const src = images[idx];
        if (!row.box || !src) continue;
        try {
          const blob = await cropRegionToBlob(src.file, row.box);
          newCrops[row.id] = { blob, url: URL.createObjectURL(blob) };
        } catch { /* sin foto para este producto */ }
      }
      Object.values(crops).forEach(c => URL.revokeObjectURL(c.url));
      setCrops(newCrops);
      setRows(normalized);
      setExcluded(new Set());
      setAnalyzed(true);
      if (normalized.length === 0) {
        showNotification('No se detectaron productos. Prueba con una foto más nítida y bien iluminada.', 'error');
      } else {
        const withPhoto = Object.keys(newCrops).length;
        showNotification(
          `${normalized.length} producto(s) detectado(s)${withPhoto > 0 ? ` · ${withPhoto} con foto` : ''}.`,
          'success',
        );
      }
    } catch (err: any) {
      showNotification(`No se pudo analizar la imagen: ${err?.message ?? err}`, 'error');
    } finally {
      setAnalyzing(false);
    }
  };

  const updateRow = (id: string, field: 'name' | 'category' | 'price' | 'shortDescription', value: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };
  const removeRow = (id: string) => {
    setRows(prev => prev.filter(r => r.id !== id));
    setCrops(prev => {
      if (!prev[id]) return prev;
      URL.revokeObjectURL(prev[id].url);
      const { [id]: _drop, ...rest } = prev;
      return rest;
    });
  };
  const removeCrop = (id: string) => {
    setCrops(prev => {
      if (!prev[id]) return prev;
      URL.revokeObjectURL(prev[id].url);
      const { [id]: _drop, ...rest } = prev;
      return rest;
    });
  };
  // Cambiar/subir la foto de un producto detectado (reemplaza el recorte automático).
  const setRowPhoto = async (id: string, files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    try {
      const blob = await downscaleImageBlob(file);
      const objUrl = URL.createObjectURL(blob);
      setCrops(prev => {
        if (prev[id]) URL.revokeObjectURL(prev[id].url);
        return { ...prev, [id]: { blob, url: objUrl } };
      });
    } catch (err: any) {
      showNotification(`No se pudo cargar la imagen: ${err?.message ?? err}`, 'error');
    }
  };
  const toggleExclude = (id: string) => {
    setExcluded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Marca cada fila como duplicada (mismo nombre que un producto existente o que
  // una fila anterior del análisis). Lógica compartida con la importación.
  const dupMap = useMemo(() => duplicateFlags(products, rows), [rows, products]);

  const dupCount = useMemo(
    () => rows.filter(r => r.name.trim() && dupMap[r.id]).length,
    [rows, dupMap],
  );
  const importableCount = useMemo(
    () => rows.filter(r => r.name.trim() && !dupMap[r.id] && !excluded.has(r.id)).length,
    [rows, dupMap, excluded],
  );

  const handleImport = async () => {
    const toAdd = rows.filter(r => r.name.trim() && !dupMap[r.id] && !excluded.has(r.id));
    const dupNames = rows.filter(r => r.name.trim() && dupMap[r.id]).map(r => r.name);

    if (toAdd.length === 0) {
      showNotification(
        dupNames.length > 0
          ? 'Todos los productos detectados ya existen en tu catálogo.'
          : 'No hay productos seleccionados para importar.',
        'error',
      );
      return;
    }

    setImporting(true);
    try {
      // Sube las fotos recortadas y fija la imageURL de cada producto que tenga.
      let photosUp = 0;
      const withPhotos = await Promise.all(toAdd.map(async (row) => {
        const crop = crops[row.id];
        if (!crop) return row;
        try {
          const path = `products/${userId}/${row.id}`;
          const { error: upErr } = await supabase.storage.from('assets')
            .upload(path, crop.blob, { upsert: true, contentType: 'image/jpeg' });
          if (upErr) throw upErr;
          const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(path);
          photosUp++;
          return { ...row, imageURL: publicUrl };
        } catch {
          return row; // si la subida falla, el producto entra sin foto
        }
      }));

      const { next, added } = mergeCatalog(products, withPhotos, 'append');
      await onImport(next);
      let msg = `${added} producto(s) agregado(s) desde la foto`;
      if (photosUp > 0) msg += ` · ${photosUp} con imagen`;
      if (dupNames.length > 0) {
        const sample = dupNames.slice(0, 3).join(', ');
        msg += ` · ${dupNames.length} duplicado(s) ignorado(s)`;
        if (sample) msg += ` (${sample}${dupNames.length > 3 ? '…' : ''})`;
      }
      showNotification(msg, 'success');
      reset();
      setOpen(false);
    } catch (err: any) {
      showNotification(`Error al importar: ${err?.message ?? err}`, 'error');
    } finally {
      setImporting(false);
    }
  };

  const cellCls = 'w-full bg-black/30 border border-white/8 rounded-lg px-2 py-1.5 text-xs text-white placeholder-white/20 focus:outline-none';

  return (
    <div className="bg-white/[0.03] border rounded-2xl p-5" style={{ borderColor: `${accent}26` }}>
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-2 text-left">
        <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2" style={{ color: accent }}>
          <FaCamera size={13} /> Cargar desde una foto
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
              Digitalizar el catálogo desde una foto está disponible en el <b className="text-white/85">plan ULTRA</b>,
              junto con el catálogo ilimitado y la importación por archivo. En tu plan actual puedes cargar hasta
              25 productos desde el formulario de arriba.
            </div>
          ) : (
            <>
              <p className="text-xs text-white/50 leading-relaxed">
                Foto de tu <b className="text-white/75">carta, menú o folleto</b> → creamos los productos con
                categoría, nombre, precio, descripción y foto. Revisa antes de agregar; los duplicados se ignoran.
              </p>

              {/* Selector de imágenes: cámara O archivos/galería (PC, teléfono, tablet) */}
              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-black/30 border border-dashed border-white/15 cursor-pointer hover:border-white/30 transition-all">
                    <FaCamera size={14} style={{ color: accent }} />
                    <span className="text-xs text-white/60">Tomar foto</span>
                    <input ref={captureRef} type="file" accept="image/*" capture="environment"
                      onChange={addFiles} className="hidden" />
                  </label>
                  <label className="flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-black/30 border border-dashed border-white/15 cursor-pointer hover:border-white/30 transition-all">
                    <FaImage size={14} style={{ color: accent }} />
                    <span className="text-xs text-white/60">Subir archivo</span>
                    <input ref={fileRef} type="file" accept="image/*"
                      multiple onChange={addFiles} className="hidden" />
                  </label>
                </div>
                <p className="text-[10px] text-white/30 -mt-1">
                  «Subir archivo» sirve para fotos, capturas o imágenes guardadas en tu PC, teléfono o tablet (hasta 5).
                </p>

                {images.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {images.map(img => (
                      <div key={img.id} className="relative">
                        <img src={img.url} alt="página"
                          className="w-20 h-20 rounded-xl object-cover border border-white/10" />
                        <button type="button" onClick={() => removeImage(img.id)}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg">
                          <FaTimes size={9} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {images.length > 0 && (
                  <>
                    <button type="button" onClick={handleAnalyze} disabled={analyzing}
                      className="px-5 py-2.5 rounded-xl text-black text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                      style={{ backgroundColor: accent }}>
                      <FaMagic size={11} />
                      {analyzing ? 'Leyendo la imagen…' : `Analizar ${images.length} foto(s)`}
                    </button>
                  </>
                )}
              </div>

              {/* Resultado del análisis */}
              {analyzed && rows.length > 0 && (
                <div className="space-y-3">
                  <div className="rounded-xl bg-black/25 border border-white/10 p-3 space-y-1.5">
                    <p className="text-xs text-white/80 flex items-center gap-2">
                      <FaCheckCircle size={11} className="text-emerald-400" />
                      <b>{rows.length}</b> producto(s) detectado(s)
                      {importableCount !== rows.length && (
                        <span className="text-white/50">· {importableCount} para agregar</span>
                      )}
                    </p>
                    {dupCount > 0 && (
                      <p className="text-[11px] text-amber-300/85 flex items-center gap-1.5">
                        <FaExclamationTriangle size={10} />
                        {dupCount} ya existe(n) en tu catálogo — se ignoran automáticamente.
                      </p>
                    )}
                    <p className="text-[10px] text-white/35">
                      Revisa y corrige lo que haga falta antes de agregar. Toca la foto de un producto para
                      cambiarla o subir la tuya. Destilda una fila para no importarla.
                    </p>
                    {Object.keys(crops).length > 0 && (
                      <p className="text-[10px] text-amber-300/70 flex items-start gap-1.5 pt-1 border-t border-white/5 mt-1">
                        <FaExclamationTriangle size={9} className="mt-0.5 shrink-0" />
                        <span>
                          Consejo: verifica que cada foto corresponda al producto real. Las imágenes se recortan
                          automáticamente de la carta; publicar una foto que no coincida con lo que vendes puede
                          generar reclamos o problemas legales. Si dudas, quita la foto con la ✕ o sube la correcta.
                        </span>
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    {rows.map(row => {
                      const isDup = dupMap[row.id];
                      const isExcluded = excluded.has(row.id) || isDup;
                      return (
                        <div key={row.id}
                          className={`rounded-xl border p-3 space-y-2 transition-all ${
                            isDup ? 'bg-amber-500/[0.05] border-amber-500/25'
                              : isExcluded ? 'bg-black/20 border-white/8 opacity-55'
                              : 'bg-black/25 border-white/10'
                          }`}>
                          <div className="flex items-center gap-2">
                            {!isDup && (
                              <input type="checkbox" checked={!isExcluded}
                                onChange={() => toggleExclude(row.id)}
                                className="w-4 h-4 shrink-0" style={{ accentColor: accent }} />
                            )}
                            {/* Foto del producto: toca para cambiar/subir; ✕ para quitar */}
                            <div className="relative shrink-0">
                              <label className="block w-11 h-11 rounded-lg overflow-hidden border border-white/10 bg-black/30 cursor-pointer"
                                title="Cambiar o subir foto">
                                {crops[row.id] ? (
                                  <img src={crops[row.id].url} alt="foto" className="w-full h-full object-cover" />
                                ) : (
                                  <span className="w-full h-full flex items-center justify-center text-white/25 text-sm">🛍️</span>
                                )}
                                <span className="absolute -bottom-1 -left-1 w-4 h-4 rounded-full bg-black/70 border border-white/15 flex items-center justify-center"
                                  style={{ color: accent }}>
                                  <FaCamera size={7} />
                                </span>
                                <input type="file" accept="image/*" className="hidden"
                                  onChange={e => { const el = e.currentTarget; setRowPhoto(row.id, el.files).finally(() => { el.value = ''; }); }} />
                              </label>
                              {crops[row.id] && (
                                <button type="button" onClick={() => removeCrop(row.id)} title="Quitar foto"
                                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center">
                                  <FaTimes size={7} />
                                </button>
                              )}
                            </div>
                            <input value={row.name}
                              onChange={e => updateRow(row.id, 'name', e.target.value)}
                              placeholder="Nombre del producto"
                              className={cellCls + ' font-bold'}
                              style={{ borderColor: `${accent}30` }} />
                            {isDup && (
                              <span className="shrink-0 text-[9px] font-black uppercase tracking-widest text-amber-300 bg-amber-500/15 border border-amber-500/30 rounded-md px-1.5 py-1">
                                Duplicado
                              </span>
                            )}
                            <button type="button" onClick={() => removeRow(row.id)}
                              className="text-white/30 hover:text-red-400 transition p-1 shrink-0">
                              <FaTrash size={11} />
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <input value={row.category ?? ''}
                              onChange={e => updateRow(row.id, 'category', e.target.value)}
                              placeholder="Categoría" className={cellCls} />
                            <input value={row.price ?? ''}
                              onChange={e => updateRow(row.id, 'price', e.target.value)}
                              placeholder="Precio" className={cellCls} />
                          </div>
                          <input value={row.shortDescription ?? ''}
                            onChange={e => updateRow(row.id, 'shortDescription', e.target.value)}
                            placeholder="Descripción (opcional)" className={cellCls} />
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button type="button" onClick={handleImport}
                      disabled={importing || importableCount === 0}
                      className="px-5 py-2.5 rounded-xl text-black text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50 flex items-center gap-2"
                      style={{ backgroundColor: accent }}>
                      <FaPlus size={11} />
                      {importing ? 'Agregando…' : `Agregar ${importableCount} producto(s)`}
                    </button>
                    <button type="button" onClick={reset} disabled={importing}
                      className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 disabled:opacity-50">
                      <FaTimes size={10} /> Descartar
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

export default PhotoCatalogImport;
