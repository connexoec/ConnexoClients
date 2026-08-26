import React, { useMemo, useState } from 'react';
import { FaFileExcel, FaChevronDown, FaDownload, FaSpinner } from 'react-icons/fa';
import { supabase } from '../src/lib/supabase';
import {
  RANGE_PRESETS, checkRange, defaultRange, filterByRange, prettyRange,
  rangeFileStamp, rangeToTimestamps, safeFileName, spanOf,
  type DateRange,
} from '../src/lib/exportRange';
import { downloadXlsx, downloadCsvFile, type CellValue } from '../src/lib/xlsx';

/**
 * Panel «Descargar en Excel» compartido por las pestañas de citas.
 *
 * Está escrito una sola vez y lo usan barbería, e-commerce, restaurante,
 * clínica veterinaria, consultorio médico e inmobiliaria: copiarlo en cada
 * pestaña es exactamente lo que dejó el modal de reseñas duplicado y divergido
 * hasta v0.46.1, y aquí el riesgo sería peor —un rango mal calculado en una
 * copia y no en la otra—.
 *
 * Es **puramente aditivo**: no toca los datos, no escribe en la base y no
 * cambia ningún filtro de la pantalla. Sólo lee.
 */

export interface ExportColumn<T> {
  header: string;
  get: (row: T) => CellValue;
}

interface Props<T> {
  /** Color del tema, para que el panel no desentone con su plantilla. */
  accent: string;
  /** Nombre en plural de lo que se descarga: "citas", "reservas", "solicitudes". */
  noun: string;
  /** Qué fecha se está filtrando, dicho para el dueño. */
  dateLabel: string;
  /** Base del nombre del archivo, sin extensión ni fechas. */
  fileBase: string;
  /** Nombre de la pestaña dentro del Excel. */
  sheetName: string;
  /** Lo que ya está cargado en pantalla: sólo alimenta el contador en vivo. */
  localRows: T[];
  /** Fecha "YYYY-MM-DD" de un registro. */
  getDate: (row: T) => string | null | undefined;
  /** Trae del servidor exactamente el rango pedido. */
  fetchRange: (range: DateRange) => Promise<T[]>;
  /** Columnas de la hoja. Como función si dependen de los datos (formularios). */
  columns: ExportColumn<T>[] | ((rows: T[]) => ExportColumn<T>[]);
  showNotification: (message: string, type: 'success' | 'error') => void;
  /** Texto extra bajo el título (p. ej. explicar qué incluye la descarga). */
  hint?: string;
}

export function ExportRangePanel<T>({
  accent, noun, dateLabel, fileBase, sheetName,
  localRows, getDate, fetchRange, columns, showNotification, hint,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange>(() => defaultRange());
  const [busy, setBusy] = useState<null | 'xlsx' | 'csv'>(null);

  const check = useMemo(() => checkRange(range.from, range.to), [range.from, range.to]);

  // Conteo orientativo con lo que ya está en memoria. La descarga se pide
  // igualmente al servidor, así que un historial largo no se queda corto.
  const localCount = useMemo(
    () => (check.ok ? filterByRange(localRows, getDate, range).length : 0),
    [localRows, getDate, range, check.ok],
  );

  const applyPreset = (next: DateRange) => setRange(next);

  const run = async (format: 'xlsx' | 'csv') => {
    if (!check.ok || busy) return;
    setBusy(format);
    try {
      const rows = await fetchRange(range);
      if (rows.length === 0) {
        showNotification(`No hay ${noun} entre ${prettyRange(range)}.`, 'error');
        return;
      }
      const cols = typeof columns === 'function' ? columns(rows) : columns;
      const sheet = {
        sheetName,
        headers: cols.map(c => c.header),
        rows: rows.map(row => cols.map(c => {
          try { return c.get(row); } catch { return ''; }
        })),
      };
      const name = safeFileName(`${fileBase}_${rangeFileStamp(range)}`);
      if (format === 'xlsx') downloadXlsx(`${name}.xlsx`, sheet);
      else downloadCsvFile(`${name}.csv`, sheet);
      showNotification(
        `${rows.length} ${rows.length === 1 ? noun.replace(/s$/, '') : noun} · ${prettyRange(range)}`,
        'success',
      );
    } catch (err: any) {
      showNotification(`No se pudo generar la descarga: ${err?.message ?? err}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const chip = (label: string, onClick: () => void, key: string) => (
    <button key={key} type="button" onClick={onClick} disabled={!!busy}
      className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border transition disabled:opacity-40"
      style={{ background: `${accent}14`, borderColor: `${accent}40`, color: accent }}>
      {label}
    </button>
  );

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ background: `${accent}0a`, borderColor: `${accent}2b` }}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 p-4 text-left">
        <span className="flex items-center gap-2.5 min-w-0">
          <FaFileExcel style={{ color: accent }} className="shrink-0" />
          <span className="min-w-0">
            <span className="block text-xs font-black uppercase tracking-widest text-white">
              Descargar en Excel
            </span>
            <span className="block text-[11px] text-white/40 mt-0.5">
              Elige desde qué fecha hasta qué fecha
            </span>
          </span>
        </span>
        <FaChevronDown className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} style={{ color: accent }} size={12} />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3.5 border-t" style={{ borderColor: `${accent}1f` }}>
          <div className="pt-3.5" />

          {hint && <p className="text-[11px] text-white/45 leading-relaxed">{hint}</p>}

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[10px] uppercase tracking-widest font-bold text-white/40 mb-1">Desde</label>
              <input type="date" value={range.from} max={range.to || undefined}
                onChange={e => setRange(r => ({ ...r, from: e.target.value }))}
                className="w-full bg-black/40 text-white text-sm rounded-xl px-3 py-2 border focus:outline-none"
                style={{ borderColor: `${accent}33` }} />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-widest font-bold text-white/40 mb-1">Hasta</label>
              <input type="date" value={range.to} min={range.from || undefined}
                onChange={e => setRange(r => ({ ...r, to: e.target.value }))}
                className="w-full bg-black/40 text-white text-sm rounded-xl px-3 py-2 border focus:outline-none"
                style={{ borderColor: `${accent}33` }} />
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {RANGE_PRESETS.map(p => chip(p.label, () => applyPreset(p.range()), p.key))}
            {chip('Todo', () => applyPreset(spanOf(localRows, getDate)), 'todo')}
          </div>

          {check.ok ? (
            <p className="text-[11px] text-white/50">
              <b className="text-white/80">{localCount}</b> {localCount === 1 ? noun.replace(/s$/, '') : noun} en pantalla dentro del rango.
              <span className="block text-white/30 mt-0.5">Se descarga según la {dateLabel.toLowerCase()}.</span>
            </p>
          ) : (
            <p className="text-[11px] text-amber-300/90">{check.error}</p>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <button type="button" onClick={() => run('xlsx')} disabled={!check.ok || !!busy}
              className="flex-1 py-3 rounded-xl text-black text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-40 active:scale-95 transition-all"
              style={{ background: accent }}>
              {busy === 'xlsx' ? <FaSpinner className="animate-spin" /> : <FaFileExcel />}
              {busy === 'xlsx' ? 'Preparando...' : 'Descargar Excel'}
            </button>
            <button type="button" onClick={() => run('csv')} disabled={!check.ok || !!busy}
              className="sm:w-40 py-3 rounded-xl bg-white/5 border border-white/10 text-white/70 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-40 hover:text-white transition">
              {busy === 'csv' ? <FaSpinner className="animate-spin" /> : <FaDownload />} CSV
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Lee del servidor todos los registros del dueño dentro del rango.
 *
 * Se consulta al servidor en vez de filtrar lo que ya está en pantalla porque
 * PostgREST devuelve como mucho 1000 filas por consulta: un negocio con años de
 * historial tiene la lista recortada, y una descarga que se dejara meses fuera
 * **sin avisar** sería peor que no tener el botón. Por eso además se pagina.
 */
export const fetchOwnerRange = async <T,>(opts: {
  table: string;
  ownerColumn: string;
  ownerId: string;
  dateColumn: string;
  /** true si la columna es timestamp (created_at) y no una fecha suelta. */
  isTimestamp?: boolean;
  range: DateRange;
  /** Orden final de las filas en la hoja. */
  orderBy?: { column: string; ascending?: boolean }[];
}): Promise<T[]> => {
  const { table, ownerColumn, ownerId, dateColumn, isTimestamp, range, orderBy } = opts;
  const PAGE = 1000;
  const out: T[] = [];
  let offset = 0;

  for (;;) {
    let query = supabase.from(table).select('*').eq(ownerColumn, ownerId);
    if (isTimestamp) {
      const { start, end } = rangeToTimestamps(range);
      query = query.gte(dateColumn, start).lte(dateColumn, end);
    } else {
      query = query.gte(dateColumn, range.from).lte(dateColumn, range.to);
    }
    for (const o of orderBy || [{ column: dateColumn, ascending: true }]) {
      query = query.order(o.column, { ascending: o.ascending !== false });
    }
    const { data, error } = await query.range(offset, offset + PAGE - 1);
    if (error) throw error;
    const chunk = (data as T[]) || [];
    out.push(...chunk);
    // Se avanza por lo REALMENTE devuelto: si el servidor topa por debajo de
    // PAGE, comparar contra PAGE cortaría el barrido antes de tiempo.
    if (chunk.length === 0) break;
    offset += chunk.length;
    if (out.length >= 50000) break;   // freno de seguridad
  }
  return out;
};

export default ExportRangePanel;
