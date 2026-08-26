import React from 'react';

/**
 * Motor de catálogo compartido (búsqueda + categorías + límites por plan).
 *
 * Lo usan las plantillas que guardan su catálogo en `profiles.products`
 * (gastro, petcare, medical, ecom) y sus pestañas de administración.
 * No toca la base de datos: opera sobre el arreglo ya cargado en memoria.
 */

// ── Límite de catálogo por plan ────────────────────────────────────────────
// ULTRA = ilimitado. Los planes inferiores conservan el tope histórico de 25.
export const CATALOG_LIMIT_BASIC = 25;

export const catalogLimit = (plan?: string | null): number =>
  (plan ?? '').toString().toLowerCase() === 'ultra' ? Infinity : CATALOG_LIMIT_BASIC;

/** Aplica el tope del plan sin copiar el arreglo cuando es ilimitado. */
export const applyCatalogLimit = <T,>(items: T[], plan?: string | null): T[] => {
  const limit = catalogLimit(plan);
  return Number.isFinite(limit) ? items.slice(0, limit) : items;
};

// ── Normalización ──────────────────────────────────────────────────────────
// Sin acentos y en minúsculas: "Higiene y Estética" se encuentra con "estetica".
export const normalizeText = (value: unknown): string =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

/**
 * Texto sobre el que se busca un producto: nombre, marca, principio activo,
 * categoría, SKU y descripciones. `cleanName` es el nombre ya separado de la
 * categoría en la convención "Categoría | Producto".
 */
export const productHaystack = (product: any): string =>
  normalizeText([
    product?.cleanName,
    product?.name,
    product?.brand,
    product?.activeIngredient,
    product?.category,
    product?.sku,
    product?.shortDescription,
    product?.longDescription,
    product?.allergens,
  ].filter(Boolean).join(' '));

/**
 * Coincidencia por tokens (AND): "royal canin" exige ambas palabras, en
 * cualquier orden y en cualquiera de los campos indexados.
 */
export const matchesQuery = (product: any, query: string): boolean => {
  const tokens = normalizeText(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = productHaystack(product);
  return tokens.every(token => haystack.includes(token));
};

export const filterCatalog = <T,>(products: T[], query: string): T[] => {
  if (!normalizeText(query)) return products;
  return products.filter(p => matchesQuery(p, query));
};

// ── Categorías ─────────────────────────────────────────────────────────────
/** Agrupa por `category` (o por la convención "Categoría | Producto"). */
export const groupByCategory = <T extends Record<string, any>>(
  products: T[],
  fallbackCategory = 'Catálogo',
): Record<string, (T & { cleanName: string })[]> => {
  const map: Record<string, (T & { cleanName: string })[]> = {};
  products.forEach(product => {
    let category = fallbackCategory;
    let name = product?.name || '';
    if (product?.category && String(product.category).trim()) {
      category = String(product.category).trim();
    } else if (name.includes('|')) {
      const parts = name.split('|');
      category = parts[0].trim();
      name = parts.slice(1).join('|').trim();
    }
    if (!map[category]) map[category] = [];
    // Se estampa la categoría resuelta para que el conteo y los filtros
    // funcionen igual con la convención "Categoría | Producto".
    map[category].push({ ...product, cleanName: name, category });
  });
  return map;
};

/** Conteo por categoría sobre el conjunto ya filtrado por la búsqueda. */
export const countByCategory = (products: any[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  products.forEach(p => {
    const category = (p?.category && String(p.category).trim()) || 'Catálogo';
    counts[category] = (counts[category] || 0) + 1;
  });
  return counts;
};

/** Categorías sugeridas al dueño según el tipo de negocio. */
export const CLINIC_CATEGORY_PRESETS = [
  'Farmacia', 'Alimento Canino', 'Alimento Felino',
  'Accesorios', 'Higiene y Estética', 'Servicios',
];

export const MEDICAL_CATEGORY_PRESETS = [
  'Farmacia', 'Consultas', 'Exámenes de Laboratorio',
  'Procedimientos', 'Insumos y Accesorios', 'Programas de Salud',
];

export const GASTRO_CATEGORY_PRESETS = [
  'Entradas', 'Platos Fuertes', 'Postres', 'Bebidas', 'Promociones', 'Extras',
];

// ── Debounce ───────────────────────────────────────────────────────────────
/** Devuelve el valor con retardo: evita recalcular el filtro en cada tecla. */
export function useDebouncedValue<T>(value: T, delay = 220): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/**
 * Estado completo del buscador de catálogo: input inmediato (para que el campo
 * no se sienta lento) + resultado calculado sobre el valor con debounce.
 */
export function useCatalogSearch<T>(products: T[], delay = 220) {
  const [query, setQuery] = React.useState('');
  const debouncedQuery = useDebouncedValue(query, delay);
  const results = React.useMemo(
    () => filterCatalog(products, debouncedQuery),
    [products, debouncedQuery],
  );
  const isSearching = normalizeText(debouncedQuery).length > 0;
  return { query, setQuery, debouncedQuery, results, isSearching };
}
