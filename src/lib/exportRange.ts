/**
 * Rango de fechas para las descargas de citas.
 *
 * Vive aparte de la interfaz porque es lo único que puede dar un resultado
 * silenciosamente equivocado (un día de menos al final del rango, un mes que
 * empieza el día 2), y así se puede comprobar sin montar React.
 *
 * Convención: todas las fechas son cadenas "YYYY-MM-DD". Se comparan como
 * texto a propósito — en ese formato el orden alfabético ES el orden
 * cronológico, y así no se construye ningún `Date` que pueda desplazarse una
 * hora por la zona horaria.
 */

export interface DateRange { from: string; to: string; }

const pad = (n: number): string => String(n).padStart(2, '0');

/** "YYYY-MM-DD" de una fecha, en hora LOCAL (toISOString daría el día en UTC). */
export const toISODate = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const todayISO = (): string => toISODate(new Date());

/** Rango por defecto al abrir el panel: del día 1 del mes actual hasta hoy. */
export const defaultRange = (today = new Date()): DateRange => ({
  from: toISODate(new Date(today.getFullYear(), today.getMonth(), 1)),
  to: toISODate(today),
});

export interface RangePreset { key: string; label: string; range: (today?: Date) => DateRange; }

export const RANGE_PRESETS: RangePreset[] = [
  {
    key: 'hoy', label: 'Hoy',
    range: (t = new Date()) => ({ from: toISODate(t), to: toISODate(t) }),
  },
  {
    key: 'semana', label: 'Últimos 7 días',
    range: (t = new Date()) => ({
      from: toISODate(new Date(t.getFullYear(), t.getMonth(), t.getDate() - 6)),
      to: toISODate(t),
    }),
  },
  {
    key: 'mes', label: 'Este mes',
    range: (t = new Date()) => ({
      from: toISODate(new Date(t.getFullYear(), t.getMonth(), 1)),
      to: toISODate(t),
    }),
  },
  {
    key: 'mes_pasado', label: 'Mes pasado',
    // Día 0 del mes actual = último día del mes anterior; así funciona igual
    // en meses de 28, 30 y 31 días sin ningún caso especial.
    range: (t = new Date()) => ({
      from: toISODate(new Date(t.getFullYear(), t.getMonth() - 1, 1)),
      to: toISODate(new Date(t.getFullYear(), t.getMonth(), 0)),
    }),
  },
  {
    key: 'anio', label: 'Este año',
    range: (t = new Date()) => ({
      from: toISODate(new Date(t.getFullYear(), 0, 1)),
      to: toISODate(t),
    }),
  },
];

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isISODate = (value: unknown): boolean => typeof value === 'string' && ISO_RE.test(value);

export interface RangeCheck { ok: boolean; error?: string; range: DateRange; }

/**
 * Valida el rango que escribió el dueño. Si invirtió las fechas **no se
 * corrigen en silencio**: se avisa, porque adivinar la intención y descargar
 * otra cosa es peor que decirlo.
 */
export const checkRange = (from: string, to: string): RangeCheck => {
  const range = { from, to };
  if (!isISODate(from) || !isISODate(to)) {
    return { ok: false, error: 'Elige la fecha de inicio y la de fin.', range };
  }
  if (from > to) {
    return { ok: false, error: 'La fecha "desde" es posterior a la fecha "hasta".', range };
  }
  return { ok: true, range };
};

/** Registros cuya fecha cae dentro del rango, extremos incluidos. */
export const filterByRange = <T,>(
  rows: T[],
  getDate: (row: T) => string | null | undefined,
  { from, to }: DateRange,
): T[] => rows.filter(row => {
  const date = (getDate(row) || '').slice(0, 10);
  return !!date && date >= from && date <= to;
});

/** Rango que abarca todo lo que hay cargado (para el botón "Todo"). */
export const spanOf = <T,>(
  rows: T[],
  getDate: (row: T) => string | null | undefined,
  fallback = todayISO(),
): DateRange => {
  let min = '';
  let max = '';
  for (const row of rows) {
    const date = (getDate(row) || '').slice(0, 10);
    if (!isISODate(date)) continue;
    if (!min || date < min) min = date;
    if (!max || date > max) max = date;
  }
  return { from: min || fallback, to: max || fallback };
};

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "01 jul 2026" — sin `new Date`, para que no se desplace de día. */
export const prettyDate = (iso: string): string => {
  if (!isISODate(iso)) return iso || '';
  const [y, m, d] = iso.split('-');
  return `${d} ${MONTHS[Number(m) - 1] || m} ${y}`;
};

export const prettyRange = ({ from, to }: DateRange): string =>
  from === to ? prettyDate(from) : `${prettyDate(from)} → ${prettyDate(to)}`;

/** Trozo de nombre de archivo: "2026-07-01_a_2026-07-31" (o un solo día). */
export const rangeFileStamp = ({ from, to }: DateRange): string =>
  from === to ? from : `${from}_a_${to}`;

/** Nombre de archivo sin caracteres que Windows rechaza. */
export const safeFileName = (name: string): string =>
  name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90) || 'export';

/**
 * Límites en instantes ISO para columnas de tipo timestamp (`created_at`).
 * El día se toma en hora LOCAL del dueño: una solicitud de las 20:00 en
 * Ecuador es del día 31 para él, aunque en UTC ya sea el 1.
 */
export const rangeToTimestamps = ({ from, to }: DateRange): { start: string; end: string } => ({
  start: new Date(`${from}T00:00:00`).toISOString(),
  end: new Date(`${to}T23:59:59.999`).toISOString(),
});
