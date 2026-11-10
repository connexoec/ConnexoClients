import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FaTimes, FaSpinner, FaExclamationTriangle } from 'react-icons/fa';
import { supabase } from '../src/lib/supabase';
import { downscaleImageBlob } from '../src/lib/catalogVision';

/**
 * Piezas del panel compartidas por las pestañas de Gimnasio y Hotel.
 *
 * Escritas una sola vez: cada pestaña necesita la misma carga con tiempo real,
 * el mismo aviso sonoro, el mismo modal y la misma subida de imágenes, y
 * copiarlos en nueve archivos es justo lo que termina divergiendo.
 */

/* ── Aviso sonoro (un único AudioContext para toda la app) ─────────────────── */
let sharedCtx: AudioContext | null = null;
export const ping = () => {
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    if (!sharedCtx) sharedCtx = new AC();
    const ctx = sharedCtx;
    const play = () => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      const t = ctx.currentTime;
      osc.frequency.setValueAtTime(660, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.16, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.start(t); osc.stop(t + 0.35);
    };
    if (ctx.state === 'suspended') ctx.resume().then(play).catch(() => {}); else play();
  } catch { /* noop */ }
};

export const waLink = (phone?: string | null, msg = '') => {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '593' + d.slice(1);   // Ecuador
  return `https://wa.me/${d}?text=${encodeURIComponent(msg)}`;
};

/** Fecha local YYYY-MM-DD. toISOString() cambia de día a las 19:00 en UTC-5. */
export const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const addDaysLocal = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  t.setUTCDate(t.getUTCDate() + n);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
};
export const diffDays = (a: string, b: string) => {
  const p = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, (m || 1) - 1, d || 1); };
  return Math.round((p(b) - p(a)) / 86400000);
};
export const fmtDate = (iso?: string | null, opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' }) => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('es-EC', opts);
};
export const money = (n?: number | null) =>
  typeof n === 'number' && isFinite(n) ? `$${n.toLocaleString('es-EC', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}` : '—';

/** ¿El error de Supabase significa "esa tabla/función aún no existe"? → falta ejecutar el SQL. */
export const isMissingSql = (err: any) => {
  const c = String(err?.code || ''); const m = String(err?.message || '').toLowerCase();
  return ['42P01', '42883', 'PGRST205', 'PGRST202', '42703'].includes(c) || m.includes('could not find') || m.includes('does not exist');
};

/* ── Carga de una tabla del dueño con tiempo real ──────────────────────────── */
interface OwnerTableOpts<T> {
  table: string;
  ownerColumn: string;
  ownerId?: string;
  order?: { column: string; ascending?: boolean }[];
  realtime?: boolean;
  /** Reconsulta cada N ms y al volver a la pestaña (0 = nunca). */
  pollMs?: number;
  /** Filas que aparecen DESPUÉS de la primera carga (para sonar el ping). */
  onNew?: (fresh: T[]) => void;
}

export function useOwnerTable<T extends { id: string }>(opts: OwnerTableOpts<T>) {
  const { table, ownerColumn, ownerId, order, realtime = true, pollMs = 0 } = opts;
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [missingSql, setMissingSql] = useState(false);
  const known = useRef<Set<string>>(new Set());
  const ready = useRef(false);
  const onNew = useRef(opts.onNew);
  onNew.current = opts.onNew;
  const orderKey = JSON.stringify(order || []);

  const reload = useCallback(async () => {
    if (!ownerId) return;
    let q = supabase.from(table).select('*').eq(ownerColumn, ownerId);
    for (const o of (JSON.parse(orderKey) as { column: string; ascending?: boolean }[])) q = q.order(o.column, { ascending: o.ascending !== false });
    const { data, error } = await q;
    if (error) {
      if (isMissingSql(error)) setMissingSql(true); else console.error(`${table} fetch error:`, error.message);
      setLoading(false);
      return;
    }
    const list = (data ?? []) as T[];
    if (ready.current) {
      const fresh = list.filter(r => !known.current.has(r.id));
      if (fresh.length > 0) onNew.current?.(fresh);
    }
    known.current = new Set(list.map(r => r.id));
    ready.current = true;
    setMissingSql(false);
    setRows(list);
    setLoading(false);
  }, [table, ownerColumn, ownerId, orderKey]);

  useEffect(() => {
    if (!ownerId) return;
    reload();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    if (realtime) {
      channel = supabase.channel(`${table}_${ownerId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table, filter: `${ownerColumn}=eq.${ownerId}` }, () => reload())
        .subscribe();
    }
    const timer = pollMs > 0 ? setInterval(reload, pollMs) : null;
    const onFocus = () => { if (document.visibilityState !== 'hidden') reload(); };
    if (pollMs > 0) { window.addEventListener('focus', onFocus); document.addEventListener('visibilitychange', onFocus); }
    return () => {
      if (channel) supabase.removeChannel(channel);
      if (timer) clearInterval(timer);
      window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus);
    };
  }, [table, ownerColumn, ownerId, realtime, pollMs, reload]);

  return { rows, setRows, loading, reload, missingSql };
}

/**
 * Ajustes del negocio guardados en una columna jsonb de `profiles`
 * (gym_settings / hotel_settings). Cada guardado mezcla sobre lo último que
 * hay en memoria y actualiza el estado global del panel, así dos pestañas que
 * toquen la misma columna no se pisan con datos viejos.
 */
export function useJsonSettings<T extends Record<string, any>>(
  column: 'gym_settings' | 'hotel_settings' | 'books_settings' | 'stage_settings' | 'photo_settings',
  userId: string | undefined,
  profileData: any,
  setProfileData: React.Dispatch<React.SetStateAction<any>> | undefined,
  notify: (message: string, type: 'success' | 'error') => void,
) {
  const [saving, setSaving] = useState(false);
  const settings = ((profileData?.[column] as T) || {}) as T;
  const save = async (patch: Partial<T>, okMsg = 'Guardado.') => {
    if (!userId) return false;
    const next = { ...settings, ...patch };
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ [column]: next }).eq('id', userId);
    setSaving(false);
    if (error) {
      notify(isMissingSql(error) ? 'Falta ejecutar el SQL de la plantilla en Supabase.' : `No se pudo guardar: ${error.message}`, 'error');
      return false;
    }
    setProfileData?.((p: any) => ({ ...p, [column]: next }));
    notify(okMsg, 'success');
    return true;
  };
  return { settings, save, saving };
}

/* ── Subida de imágenes al bucket "assets" ─────────────────────────────────── */
export const uploadAsset = async (userId: string, folder: string, file: File): Promise<string> => {
  let body: Blob = file;
  try { body = await downscaleImageBlob(file, 1600, 0.86); } catch { /* si no se puede reescalar, se sube tal cual */ }
  const path = `${folder}/${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const { error } = await supabase.storage.from('assets').upload(path, body, { upsert: true, contentType: 'image/jpeg' });
  if (error) throw error;
  return supabase.storage.from('assets').getPublicUrl(path).data.publicUrl;
};

/* ── UI ────────────────────────────────────────────────────────────────────── */
export const adminInput = 'w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30';

export const AdminModal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; accent: string; wide?: boolean }> = ({ title, onClose, children, accent, wide }) =>
  createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div className={`w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'} rounded-t-2xl sm:rounded-2xl border bg-[#0f0f12] p-5 sm:p-6 space-y-4`}
        style={{ borderColor: `${accent}33`, maxHeight: '92svh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-black text-white tracking-wide">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="w-8 h-8 rounded-lg bg-white/5 text-white/50 hover:text-white flex items-center justify-center"><FaTimes /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );

export const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode; className?: string }> = ({ label, hint, children, className = '' }) => (
  <label className={`block ${className}`}>
    <span className="block text-[10px] font-black uppercase tracking-widest text-white/45 mb-1.5">{label}</span>
    {children}
    {hint && <span className="block text-[11px] text-white/35 mt-1">{hint}</span>}
  </label>
);

export const Kpi: React.FC<{ label: string; value: React.ReactNode; icon?: React.ReactNode; accent: string; tone?: 'warn' | 'bad' | 'good' }> = ({ label, value, icon, accent, tone }) => {
  const color = tone === 'bad' ? '#f87171' : tone === 'warn' ? '#fbbf24' : tone === 'good' ? '#34d399' : accent;
  return (
    <div className="bg-white/5 border border-white/5 rounded-xl p-4">
      {icon && <div className="text-lg" style={{ color }}>{icon}</div>}
      <p className="text-2xl font-black text-white mt-1">{value}</p>
      <p className="text-[11px] text-white/40 uppercase tracking-widest font-bold mt-0.5">{label}</p>
    </div>
  );
};

export const Pill: React.FC<{ active: boolean; onClick: () => void; accent: string; onAccent: string; children: React.ReactNode }> = ({ active, onClick, accent, onAccent, children }) => (
  <button type="button" onClick={onClick}
    className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${active ? '' : 'bg-white/5 text-white/50 hover:text-white border border-white/10'}`}
    style={active ? { background: accent, color: onAccent } : undefined}>
    {children}
  </button>
);

export const Spinner: React.FC<{ accent: string }> = ({ accent }) => (
  <div className="flex items-center justify-center min-h-[320px]">
    <FaSpinner className="animate-spin text-3xl" style={{ color: accent }} />
  </div>
);

/** Aviso cuando la tabla aún no existe: falta ejecutar el SQL de la plantilla. */
export const MissingSqlNotice: React.FC<{ file: string; accent: string }> = ({ file, accent }) => (
  <div className="rounded-2xl p-5 border flex gap-3 items-start" style={{ background: `${accent}10`, borderColor: `${accent}44` }}>
    <FaExclamationTriangle className="mt-0.5 shrink-0" style={{ color: accent }} />
    <div className="text-sm text-white/80">
      <p className="font-bold text-white">Falta activar esta función en la base de datos.</p>
      <p className="mt-1 text-white/60">Ejecuta <span className="font-mono text-white">{file}</span> en el SQL Editor de Supabase (es seguro re-ejecutarlo) y recarga el panel.</p>
    </div>
  </div>
);

/** Tarjeta de bloqueo por plan. */
export const PlanLock: React.FC<{ plan: 'PRO' | 'ULTRA'; what: string; accent: string }> = ({ plan, what, accent }) => (
  <div className="rounded-2xl p-6 border text-center" style={{ background: `${accent}0d`, borderColor: `${accent}33` }}>
    <p className="text-2xl mb-2">🔒</p>
    <p className="text-white font-bold">{what}</p>
    <p className="text-sm text-white/50 mt-1">Disponible en el plan <span className="font-black" style={{ color: accent }}>{plan}</span>. Mejora tu plan desde la pestaña Cuenta.</p>
  </div>
);
