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

// ── Mejora de calidad (Fase 1: sin IA, en el navegador) ─────────────────────
// Ajuste clásico y honesto de fotos de teléfono: reescalado suave si son
// pequeñas + balance de blancos (gray-world), auto-contraste por percentiles y
// realce de nitidez (unsharp mask). NO inventa detalle ni altera el producto,
// a diferencia de un modelo generativo — importante para un catálogo real.
const loadImageEl = (src: string): Promise<HTMLImageElement> =>
  new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('No se pudo leer la imagen.'));
    img.src = src;
  });

/** Desenfoque de caja separable O(n) (ventana deslizante), para el unsharp mask. */
const boxBlur = (src: Uint8ClampedArray, W: number, H: number, r: number): Float32Array => {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const win = r * 2 + 1;
  const clampI = (v: number, max: number) => (v < 0 ? 0 : v > max ? max : v);
  for (let y = 0; y < H; y++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let x = -r; x <= r; x++) sum += src[(y * W + clampI(x, W - 1)) * 4 + c];
      for (let x = 0; x < W; x++) {
        tmp[(y * W + x) * 4 + c] = sum / win;
        sum += src[(y * W + clampI(x + r + 1, W - 1)) * 4 + c]
             - src[(y * W + clampI(x - r, W - 1)) * 4 + c];
      }
    }
  }
  for (let x = 0; x < W; x++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let y = -r; y <= r; y++) sum += tmp[(clampI(y, H - 1) * W + x) * 4 + c];
      for (let y = 0; y < H; y++) {
        out[(y * W + x) * 4 + c] = sum / win;
        sum += tmp[(clampI(y + r + 1, H - 1) * W + x) * 4 + c]
             - tmp[(clampI(y - r, H - 1) * W + x) * 4 + c];
      }
    }
  }
  return out;
};

export const enhanceImageBlob = async (
  blob: Blob,
  opts?: { targetLong?: number; maxUpscale?: number; sharpen?: number; saturation?: number; quality?: number },
): Promise<Blob> => {
  const targetLong = opts?.targetLong ?? 1400;
  const maxUpscale = opts?.maxUpscale ?? 2;
  const amount = opts?.sharpen ?? 1.0;
  const saturation = opts?.saturation ?? 1.18;
  const quality = opts?.quality ?? 0.92;
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImageEl(url);
    const W0 = img.naturalWidth, H0 = img.naturalHeight;
    const longSide = Math.max(W0, H0) || 1;
    const scale = longSide >= targetLong ? 1 : Math.min(maxUpscale, targetLong / longSide);
    const W = Math.max(1, Math.round(W0 * scale));
    const H = Math.max(1, Math.round(H0 * scale));
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo procesar la imagen.');
    ctx.imageSmoothingEnabled = true;
    (ctx as any).imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, W, H);

    const image = ctx.getImageData(0, 0, W, H);
    const d = image.data;
    const n = W * H;

    // 1) Balance de blancos gray-world, con topes para no exagerar el color.
    let sr = 0, sg = 0, sb = 0;
    for (let i = 0; i < d.length; i += 4) { sr += d[i]; sg += d[i + 1]; sb += d[i + 2]; }
    const ar = sr / n || 1, ag = sg / n || 1, ab = sb / n || 1;
    const gray = (ar + ag + ab) / 3;
    const clampGain = (g: number) => Math.max(0.85, Math.min(1.15, g));
    const gr = clampGain(gray / ar), gg = clampGain(gray / ag), gb = clampGain(gray / ab);

    // 2) Auto-contraste por luminancia (percentiles 0.5% / 99.5%).
    const hist = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) {
      hist[(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0]++;
    }
    let acc = 0, lo = 0, hi = 255;
    const lowCut = n * 0.005;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= lowCut) { lo = v; break; } }
    acc = 0;
    const highKeep = n * 0.005;
    for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= highKeep) { hi = v; break; } }
    if (hi - lo < 16) { lo = 0; hi = 255; } // imagen plana: no estirar de más
    const range = hi - lo || 1;
    const stretch = (x: number) => ((x - lo) * 255) / range;
    const clamp8 = (x: number) => (x < 0 ? 0 : x > 255 ? 255 : x);

    for (let i = 0; i < d.length; i += 4) {
      let r = stretch(d[i] * gr);
      let g2 = stretch(d[i + 1] * gg);
      let b = stretch(d[i + 2] * gb);
      // Realce de saturación alrededor de la luminancia (color más vivo sin virar el tono).
      if (saturation !== 1) {
        const L = 0.299 * r + 0.587 * g2 + 0.114 * b;
        r = L + saturation * (r - L);
        g2 = L + saturation * (g2 - L);
        b = L + saturation * (b - L);
      }
      d[i] = clamp8(r); d[i + 1] = clamp8(g2); d[i + 2] = clamp8(b);
    }

    // 3) Unsharp mask (realce de nitidez).
    if (amount > 0) {
      const blurred = boxBlur(d, W, H, 1);
      for (let i = 0; i < d.length; i += 4) {
        for (let c = 0; c < 3; c++) {
          const o = d[i + c];
          d[i + c] = clamp8(o + amount * (o - blurred[i + c]));
        }
      }
    }

    ctx.putImageData(image, 0, 0);
    return await new Promise<Blob>((res, rej) =>
      canvas.toBlob((x) => (x ? res(x) : rej(new Error('No se pudo generar la imagen.'))), 'image/jpeg', quality),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
};

/**
 * Redimensiona una imagen a JPEG sin filtros (solo reescala si supera `maxDim`).
 * Se usa para las fotos de producto cuando el dueño NO activó la mejora: las
 * fotos de teléfono pesan varios MB y conviene guardarlas más livianas, pero
 * sin tocar color ni nitidez.
 */
export const downscaleImageBlob = async (
  blob: Blob,
  maxDim = 1600,
  quality = 0.9,
): Promise<Blob> => {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImageEl(url);
    const W0 = img.naturalWidth, H0 = img.naturalHeight;
    const longSide = Math.max(W0, H0) || 1;
    const scale = longSide > maxDim ? maxDim / longSide : 1;
    const W = Math.max(1, Math.round(W0 * scale));
    const H = Math.max(1, Math.round(H0 * scale));
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo procesar la imagen.');
    ctx.imageSmoothingEnabled = true;
    (ctx as any).imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, W, H);
    return await new Promise<Blob>((res, rej) =>
      canvas.toBlob((x) => (x ? res(x) : rej(new Error('No se pudo generar la imagen.'))), 'image/jpeg', quality),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
};
