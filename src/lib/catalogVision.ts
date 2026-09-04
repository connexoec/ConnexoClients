/**
 * Digitalización de catálogo por foto.
 *
 * El dueño sube la foto de una carta física / menú impreso / folleto de
 * servicios; la Edge Function `extractCatalog` la lee con Claude (visión) y
 * devuelve los productos estructurados. Aquí va todo lo del lado del navegador:
 *   1. Reescalar la foto antes de enviarla (las fotos de teléfono pesan varios
 *      MB y la API de Claude rechaza imágenes demasiado grandes en base64).
 *   2. Invocar la función y normalizar la respuesta a `ImportedProduct`, que es
 *      el mismo tipo que produce la importación por CSV/Excel → se reutiliza
 *      `mergeCatalog` y la deduplicación ya probada, sin inventar otro camino.
 */

import { supabase } from './supabase';
import { normalizePrice, type ImportedProduct } from './csvImport';

export interface VisionImage {
  data: string;       // base64 sin el prefijo "data:...;base64,"
  mediaType: string;  // p.ej. image/jpeg
}

/** Forma cruda que devuelve la Edge Function por cada producto detectado. */
export interface ExtractedRow {
  name?: string;
  category?: string;
  price?: string;
  description?: string;
  /** Índice (0-based) de la imagen enviada donde aparece el producto. */
  imageIndex?: number;
  /** Recuadro de la foto del producto: [ymin, xmin, ymax, xmax] en 0..1000. null si no tiene foto. */
  box?: number[] | null;
}

/** `ImportedProduct` + los datos para recortar su foto de la imagen original. */
export type VisionProduct = ImportedProduct & {
  imageIndex?: number;
  box?: number[] | null;
};

// ── Normalización de nombres (para deduplicar) ──────────────────────────────
export const nameKey = (name: unknown): string =>
  String(name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Reescala una imagen a `maxDim` px por el lado mayor y la exporta como JPEG.
 * Devuelve base64 sin el prefijo data:, listo para la API de Claude.
 * Se hace en canvas para no meter dependencias y para no enviar fotos de 5 MB+.
 */
export const fileToResizedImage = (
  file: File,
  maxDim = 1600,
  quality = 0.85,
): Promise<VisionImage> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('No se pudo leer la imagen.'));
      img.onload = () => {
        try {
          let { width, height } = img;
          const longest = Math.max(width, height);
          if (longest > maxDim) {
            const scale = maxDim / longest;
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) { reject(new Error('No se pudo procesar la imagen.')); return; }
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          const base64 = dataUrl.split(',')[1] ?? '';
          if (!base64) { reject(new Error('No se pudo procesar la imagen.')); return; }
          resolve({ data: base64, mediaType: 'image/jpeg' });
        } catch (err: any) {
          reject(new Error(err?.message ?? 'No se pudo procesar la imagen.'));
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });

/** Invoca la Edge Function de visión. Nunca lanza: devuelve error como texto. */
export const extractCatalogFromImages = async (
  images: VisionImage[],
): Promise<{ products: ExtractedRow[]; error?: string }> => {
  try {
    const { data, error } = await supabase.functions.invoke('extractCatalog', {
      body: { images },
    });
    if (error) {
      // La función no desplegada da 404; se traduce a un aviso accionable.
      const msg = /not found|404/i.test(error.message ?? '')
        ? 'La función de lectura de imágenes no está disponible todavía. Falta desplegar "extractCatalog" en Supabase.'
        : (error.message || 'No se pudo analizar la imagen.');
      return { products: [], error: msg };
    }
    if (data?.error && (!Array.isArray(data?.products) || data.products.length === 0)) {
      return { products: [], error: data.error };
    }
    return { products: Array.isArray(data?.products) ? data.products : [] };
  } catch (err: any) {
    return { products: [], error: err?.message ?? 'No se pudo analizar la imagen.' };
  }
};

/**
 * Marca qué filas detectadas son duplicadas. Una fila es duplicada si su nombre
 * (normalizado) coincide con un producto ya existente en el catálogo o con una
 * fila anterior del mismo análisis. Fuente única para el badge de la UI y para
 * decidir qué se importa → no pueden divergir.
 */
export const duplicateFlags = (
  current: { name?: string }[],
  rows: { id: string; name: string }[],
): Record<string, boolean> => {
  const seen = new Set(current.map(p => nameKey(p?.name)));
  const flags: Record<string, boolean> = {};
  rows.forEach(row => {
    const key = nameKey(row.name);
    if (!row.name.trim()) { flags[row.id] = false; return; }
    if (seen.has(key)) { flags[row.id] = true; }
    else { flags[row.id] = false; seen.add(key); }
  });
  return flags;
};

/** Convierte la salida cruda de la IA en `VisionProduct[]` con id, precio normalizado y datos de recorte. */
export const normalizeExtracted = (
  rows: ExtractedRow[],
  idPrefix = 'cam',
): VisionProduct[] => {
  const stamp = Date.now();
  const out: VisionProduct[] = [];
  rows.forEach((row, i) => {
    const name = String(row?.name ?? '').trim();
    if (!name) return;
    const product: VisionProduct = {
      id: `${idPrefix}_${stamp}_${i}`,
      name,
      available: true,
    };
    const category = String(row?.category ?? '').trim();
    if (category) product.category = category;
    const price = String(row?.price ?? '').trim();
    if (price) product.price = normalizePrice(price);
    const description = String(row?.description ?? '').trim();
    if (description) product.shortDescription = description;
    product.imageIndex = Number.isInteger(row?.imageIndex) && (row!.imageIndex as number) >= 0
      ? row!.imageIndex : 0;
    if (Array.isArray(row?.box) && row!.box!.length === 4) product.box = row!.box;
    out.push(product);
  });
  return out;
};

/**
 * Recorta la región `box` ([ymin, xmin, ymax, xmax] en 0..1000) de la imagen
 * original y devuelve un JPEG. Se recorta del archivo original (buena calidad);
 * como el box es proporcional, no importa que la imagen enviada a la IA fuera
 * reescalada: el recorte cae en la misma zona.
 */
export const cropRegionToBlob = (
  file: File,
  box: number[],
  quality = 0.9,
): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('No se pudo leer la imagen.'));
      img.onload = () => {
        try {
          const [ymin, xmin, ymax, xmax] = box;
          const W = img.naturalWidth, H = img.naturalHeight;
          const sx = Math.max(0, Math.round((xmin / 1000) * W));
          const sy = Math.max(0, Math.round((ymin / 1000) * H));
          const sw = Math.min(W - sx, Math.round(((xmax - xmin) / 1000) * W));
          const sh = Math.min(H - sy, Math.round(((ymax - ymin) / 1000) * H));
          if (sw < 2 || sh < 2) { reject(new Error('Recorte vacío.')); return; }
          const canvas = document.createElement('canvas');
          canvas.width = sw;
          canvas.height = sh;
          const ctx = canvas.getContext('2d');
          if (!ctx) { reject(new Error('No se pudo procesar la imagen.')); return; }
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
          canvas.toBlob(
            (blob) => blob ? resolve(blob) : reject(new Error('No se pudo generar el recorte.')),
            'image/jpeg', quality,
          );
        } catch (err: any) {
          reject(new Error(err?.message ?? 'No se pudo recortar la imagen.'));
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
