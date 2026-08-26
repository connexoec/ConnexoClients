/**
 * Importación masiva de catálogo (CSV / Excel).
 *
 * Excel no se lee en binario a propósito: no hay dependencia de hojas de
 * cálculo en el proyecto y meter una sería inflar el bundle de todos los
 * perfiles por una pantalla de administración. En su lugar se aceptan los dos
 * formatos que Excel/Sheets producen sin instalar nada:
 *   1. Archivo .csv (Archivo → Guardar como → CSV), con coma o punto y coma.
 *   2. Pegado directo de celdas, que el portapapeles entrega separado por tabs.
 *
 * El parser es RFC 4180: respeta comillas, comas dentro de comillas, comillas
 * escapadas ("") y saltos de línea dentro de una celda.
 */

export type ImportMode = 'append' | 'merge' | 'replace';

export interface ImportedProduct {
  id: string;
  name: string;
  category?: string;
  price?: string;
  brand?: string;
  activeIngredient?: string;
  shortDescription?: string;
  sku?: string;
  stock?: number;
  imageURL?: string;
  allergens?: string;
  available?: boolean;
}

export interface ParseResult {
  products: ImportedProduct[];
  headers: string[];
  unmappedHeaders: string[];
  skippedRows: number;   // filas descartadas por no tener nombre
  totalRows: number;
  error?: string;
}

export interface MergeResult<T> {
  next: T[];
  added: number;
  updated: number;
}

// ── Normalización ──────────────────────────────────────────────────────────
const norm = (value: unknown): string =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

// ── Delimitador ────────────────────────────────────────────────────────────
/** Elige el separador contando ocurrencias fuera de comillas en la 1ª línea. */
export const detectDelimiter = (text: string): string => {
  const firstLine = (text.split(/\r?\n/).find(l => l.trim().length > 0) || '');
  const candidates = ['\t', ';', ',', '|'];
  let best = ',';
  let bestCount = 0;
  for (const candidate of candidates) {
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < firstLine.length; i++) {
      const char = firstLine[i];
      if (char === '"') inQuotes = !inQuotes;
      else if (char === candidate && !inQuotes) count++;
    }
    if (count > bestCount) { bestCount = count; best = candidate; }
  }
  return best;
};

// ── Parser RFC 4180 ────────────────────────────────────────────────────────
export const parseDelimited = (text: string, delimiter?: string): string[][] => {
  const raw = text.replace(/^\uFEFF/, ''); // BOM de Excel
  const sep = delimiter || detectDelimiter(raw);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];

    if (inQuotes) {
      if (char === '"') {
        if (raw[i + 1] === '"') { field += '"'; i++; }  // comilla escapada
        else inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') { inQuotes = true; continue; }
    if (char === sep) { row.push(field); field = ''; continue; }
    if (char === '\r') continue;
    if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += char;
  }
  row.push(field);
  rows.push(row);

  // Descarta filas totalmente vacías (últimas líneas del archivo, separadores sueltos)
  return rows.filter(r => r.some(cell => cell.trim().length > 0));
};

// ── Mapeo de encabezados ───────────────────────────────────────────────────
type FieldKey = keyof Omit<ImportedProduct, 'id'>;

const HEADER_ALIASES: Record<FieldKey, string[]> = {
  name: ['nombre', 'name', 'producto', 'product', 'articulo', 'item', 'descripcion corta', 'servicio'],
  category: ['categoria', 'category', 'grupo', 'linea', 'seccion', 'familia', 'tipo'],
  price: ['precio', 'price', 'pvp', 'valor', 'precio unitario', 'precio venta', 'costo'],
  brand: ['marca', 'brand', 'fabricante', 'laboratorio', 'proveedor'],
  activeIngredient: ['principio activo', 'principioactivo', 'ingrediente activo', 'componente', 'sustancia activa', 'formula', 'compuesto'],
  shortDescription: ['descripcion', 'description', 'detalle', 'presentacion', 'observaciones', 'notas'],
  sku: ['sku', 'codigo', 'code', 'referencia', 'ref', 'codigo interno', 'cod'],
  stock: ['stock', 'existencia', 'existencias', 'cantidad', 'inventario', 'unidades'],
  imageURL: ['imagen', 'image', 'foto', 'url imagen', 'imagen url', 'image url', 'url de la imagen', 'photo'],
  allergens: ['alergenos', 'allergens', 'contraindicaciones', 'advertencias'],
  available: ['disponible', 'available', 'estado', 'publicado', 'activo', 'visible'],
};

/**
 * Alias demasiado genéricos para la coincidencia laxa: solo valen si el
 * encabezado es exactamente esa palabra. Sin esto, "Notas internas RRHH"
 * se mapearía a la descripción y "Tipo de cliente" a la categoría.
 */
const EXACT_ONLY_ALIASES = new Set([
  'notas', 'observaciones', 'detalle', 'tipo', 'item', 'ref', 'cod', 'code',
  'valor', 'costo', 'estado', 'activo', 'visible', 'familia', 'linea',
  'seccion', 'grupo', 'proveedor', 'n', 'photo',
]);

/** Devuelve el campo interno al que corresponde un encabezado del archivo. */
export const mapHeader = (header: string): FieldKey | null => {
  const clean = norm(header).replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ');
  if (!clean) return null;
  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [FieldKey, string[]][]) {
    if (aliases.includes(clean)) return field;
  }
  // Coincidencia laxa: "precio (USD)", "nombre del producto", "marca comercial"
  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [FieldKey, string[]][]) {
    const loose = aliases.filter(alias => !EXACT_ONLY_ALIASES.has(alias));
    if (loose.some(alias => clean.startsWith(alias + ' ') || clean.includes(' ' + alias))) return field;
  }
  return null;
};

// ── Conversión de valores ──────────────────────────────────────────────────
/** "$8,50" / "8,50" / "USD 8.5" → "$8.50". Si no es numérico, deja el texto. */
export const normalizePrice = (raw: string): string => {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  let digits = value.replace(/[^0-9.,-]/g, '');
  const lastComma = digits.lastIndexOf(',');
  const lastDot = digits.lastIndexOf('.');
  if (lastComma > -1 && lastComma > lastDot) {
    // Formato europeo: 1.234,56 → 1234.56
    digits = digits.replace(/\./g, '').replace(',', '.');
  } else {
    digits = digits.replace(/,/g, '');
  }
  const num = parseFloat(digits);
  if (!isFinite(num)) return value;
  return `$${num.toFixed(2)}`;
};

const FALSE_WORDS = ['no', 'false', '0', 'inactivo', 'inactiva', 'agotado', 'agotada', 'oculto', 'off', 'n'];

export const parseAvailable = (raw: string): boolean => {
  const value = norm(raw);
  if (!value) return true;
  return !FALSE_WORDS.includes(value);
};

export const parseStock = (raw: string): number | undefined => {
  const digits = String(raw ?? '').replace(/[^0-9-]/g, '');
  if (!digits) return undefined;
  const num = parseInt(digits, 10);
  return isFinite(num) ? num : undefined;
};

// ── Texto → productos ──────────────────────────────────────────────────────
export const parseCatalogText = (text: string, idPrefix = 'imp'): ParseResult => {
  const empty: ParseResult = { products: [], headers: [], unmappedHeaders: [], skippedRows: 0, totalRows: 0 };
  if (!text || !text.trim()) return { ...empty, error: 'No hay datos para importar.' };

  const rows = parseDelimited(text);
  if (rows.length < 2) {
    return { ...empty, error: 'Se necesita una fila de encabezados y al menos un producto.' };
  }

  const headers = rows[0].map(h => h.trim());
  const mapping = headers.map(mapHeader);
  if (!mapping.includes('name')) {
    return {
      ...empty,
      headers,
      error: 'No se encontró la columna de nombre. Agrega un encabezado "Nombre" (o "Producto") en la primera fila.',
    };
  }

  const unmappedHeaders = headers.filter((h, i) => h.trim() && mapping[i] === null);
  const products: ImportedProduct[] = [];
  let skippedRows = 0;
  const stamp = Date.now();

  rows.slice(1).forEach((cells, rowIndex) => {
    const record: Record<string, string> = {};
    mapping.forEach((field, colIndex) => {
      if (!field) return;
      const value = (cells[colIndex] ?? '').trim();
      if (value) record[field] = value;
    });

    if (!record.name) { skippedRows++; return; }

    const product: ImportedProduct = {
      id: `${idPrefix}_${stamp}_${rowIndex}`,
      name: record.name,
    };
    if (record.category) product.category = record.category;
    if (record.price) product.price = normalizePrice(record.price);
    if (record.brand) product.brand = record.brand;
    if (record.activeIngredient) product.activeIngredient = record.activeIngredient;
    if (record.shortDescription) product.shortDescription = record.shortDescription;
    if (record.sku) product.sku = record.sku;
    if (record.imageURL) product.imageURL = record.imageURL;
    if (record.allergens) product.allergens = record.allergens;
    const stock = record.stock !== undefined ? parseStock(record.stock) : undefined;
    if (stock !== undefined) product.stock = stock;
    product.available = record.available !== undefined ? parseAvailable(record.available) : true;

    products.push(product);
  });

  return { products, headers, unmappedHeaders, skippedRows, totalRows: rows.length - 1 };
};

// ── Fusión con el catálogo existente ───────────────────────────────────────
/** Clave de identidad: SKU si existe; si no, nombre + marca normalizados. */
const identityKey = (product: any): string => {
  const sku = norm(product?.sku);
  if (sku) return `sku:${sku}`;
  return `nm:${norm(product?.name)}|${norm(product?.brand)}`;
};

/**
 * Aplica los productos importados sobre el catálogo actual.
 * - append: agrega todo como nuevo.
 * - merge: actualiza los que coinciden (SKU, o nombre+marca) y agrega el resto.
 * - replace: reemplaza el catálogo completo.
 */
export const mergeCatalog = <T extends Record<string, any>>(
  current: T[],
  incoming: ImportedProduct[],
  mode: ImportMode,
): MergeResult<T> => {
  if (mode === 'replace') {
    return { next: incoming as unknown as T[], added: incoming.length, updated: 0 };
  }
  if (mode === 'append') {
    return { next: [...current, ...(incoming as unknown as T[])], added: incoming.length, updated: 0 };
  }

  const index = new Map<string, number>();
  current.forEach((product, i) => index.set(identityKey(product), i));

  const next = [...current];
  let added = 0;
  let updated = 0;

  incoming.forEach(product => {
    const key = identityKey(product);
    const at = index.get(key);
    if (at === undefined) {
      next.push(product as unknown as T);
      index.set(key, next.length - 1);
      added++;
    } else {
      // Conserva el id y los campos ricos del producto existente (imagen
      // subida, extras, receta) y sobreescribe solo lo que trae el archivo.
      const { id: _ignored, ...incomingFields } = product;
      next[at] = { ...next[at], ...incomingFields };
      updated++;
    }
  });

  return { next, added, updated };
};

// ── Salida CSV ─────────────────────────────────────────────────────────────
const CSV_COLUMNS: { header: string; key: FieldKey }[] = [
  { header: 'Nombre', key: 'name' },
  { header: 'Categoria', key: 'category' },
  { header: 'Marca', key: 'brand' },
  { header: 'Principio Activo', key: 'activeIngredient' },
  { header: 'Precio', key: 'price' },
  { header: 'Stock', key: 'stock' },
  { header: 'SKU', key: 'sku' },
  { header: 'Descripcion', key: 'shortDescription' },
  { header: 'Imagen', key: 'imageURL' },
  { header: 'Disponible', key: 'available' },
];

const csvCell = (value: unknown): string => {
  const text = value === undefined || value === null ? '' : String(value);
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** Exporta el catálogo actual a CSV (editable en Excel y re-importable). */
export const catalogToCsv = (products: any[]): string => {
  const lines = [CSV_COLUMNS.map(c => c.header).join(',')];
  products.forEach(product => {
    lines.push(CSV_COLUMNS.map(column => {
      if (column.key === 'available') return product.available === false ? 'No' : 'Si';
      return csvCell(product[column.key]);
    }).join(','));
  });
  return lines.join('\n');
};

/** Plantilla de ejemplo para que el dueño sepa qué columnas llenar. */
export const catalogCsvTemplate = (rows: string[][] = []): string => {
  const sample = rows.length > 0 ? rows : [
    ['Amoxicilina 500mg', 'Farmacia', 'Genfar', 'Amoxicilina', '12.50', '40', 'FAR-001', 'Antibiotico de amplio espectro', '', 'Si'],
    ['Royal Canin Adult 3kg', 'Alimento Canino', 'Royal Canin', '', '32.90', '15', 'ALC-014', 'Alimento seco para perro adulto', '', 'Si'],
    ['Bravecto 20-40kg', 'Farmacia', 'MSD', 'Fluralaner', '28.00', '9', 'FAR-022', 'Antipulgas masticable 12 semanas', '', 'Si'],
    ['Shampoo Hipoalergenico', 'Higiene y Estetica', 'Pet Care', '', '9.75', '25', 'HIG-003', 'Para pieles sensibles', '', 'Si'],
  ];
  return [CSV_COLUMNS.map(c => c.header).join(','), ...sample.map(r => r.map(csvCell).join(','))].join('\n');
};

/** Descarga un texto como archivo (sin dependencias). */
export const downloadCsv = (filename: string, content: string): void => {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
