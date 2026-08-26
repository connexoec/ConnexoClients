import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FaBell, FaWhatsapp, FaCheck, FaChevronDown, FaClock } from 'react-icons/fa';
import { supabase } from '../src/lib/supabase';
import {
  buildAgenda, formatTime12, reminderMessage, reminderWaLink, remindedKey,
  todayISO, waNumber, type AgendaRow,
} from '../src/lib/reminders';

/**
 * Panel «Recordar las citas de hoy» compartido por las 4 pestañas que agendan
 * (e-commerce, barbería, restaurante/clínica e inmobiliaria).
 *
 * Escrito UNA SOLA VEZ, igual que `ExportRangePanel`: copiarlo por pestaña es
 * lo que dejó el modal de reseñas duplicado y divergido hasta v0.46.1.
 *
 * Resuelve la mitad "cliente" del problema. La otra mitad —el aviso que le
 * llega al dueño al teléfono el día de la cita— es automática y vive en la base
 * de datos (`setup_appointment_reminders.sql`), porque el navegador del dueño
 * puede estar cerrado justo cuando hay que avisar.
 *
 * ⚠️ Es aditivo: sólo LEE las citas que la pestaña ya tiene cargadas. Lo único
 * que escribe es la marca de "ya le recordé", y si esa columna no existe se
 * degrada al almacenamiento del navegador sin romper nada.
 */

interface Props {
  accent: string;
  /** Singular, tal como lo llama esa plantilla: "cita", "reserva", "visita". */
  noun: string;
  /** Nombre del negocio, para el mensaje que recibe el cliente. */
  businessName?: string | null;
  /** Citas ya cargadas por la pestaña, normalizadas a `AgendaRow`. */
  rows: AgendaRow[];
  /** Tabla donde persistir la marca de recordatorio (opcional). */
  table?: string;
}

const isMarked = (id: string, date: string): boolean => {
  try { return localStorage.getItem(remindedKey(id, date)) === '1'; } catch { return false; }
};

const mark = (id: string, date: string) => {
  try { localStorage.setItem(remindedKey(id, date), '1'); } catch { /* modo privado */ }
};

export const DailyAgendaPanel: React.FC<Props> = ({
  accent, noun, businessName, rows, table,
}) => {
  const [open, setOpen] = useState(true);
  const [showTomorrow, setShowTomorrow] = useState(false);
  /** Ids ya recordados. En estado para que la lista se repinte al pulsar. */
  const [done, setDone] = useState<Set<string>>(new Set());

  /**
   * El día se recalcula solo.
   *
   * Sin esto, un panel abierto desde ayer por la noche seguiría enseñando la
   * agenda de ayer toda la mañana siguiente — que es justo el fallo que se está
   * corrigiendo, sólo que del lado del navegador.
   */
  const [today, setToday] = useState(todayISO());
  useEffect(() => {
    const t = setInterval(() => setToday(todayISO()), 60_000);
    return () => clearInterval(t);
  }, []);

  const agenda = useMemo(() => buildAgenda(rows, today), [rows, today]);

  // Al cambiar el día, la marca vuelve a leerse: las claves llevan la fecha
  // dentro, así que lo de ayer no puede contaminar lo de hoy.
  useEffect(() => {
    const next = new Set<string>();
    [...agenda.today, ...agenda.tomorrow].forEach(r => {
      if (isMarked(r.id, r.date)) next.add(r.id);
    });
    setDone(next);
  }, [agenda]);

  const remind = useCallback(async (row: AgendaRow, isToday: boolean) => {
    const msg = reminderMessage({
      name: row.name,
      businessName,
      noun,
      time: row.time,
      isToday,
      detail: row.detail,
    });

    // La ventana se abre ANTES de cualquier `await`: si se abriera después, el
    // navegador ya no la considera consecuencia del clic y la bloquea.
    window.open(reminderWaLink(row.phone, msg), '_blank', 'noopener,noreferrer');

    mark(row.id, row.date);
    setDone(prev => new Set(prev).add(row.id));

    // Persistir es un extra: si la columna no existe (no se ejecutó el SQL) el
    // panel sigue funcionando con la marca del navegador. Fallar aquí en voz
    // alta sería peor que el propio olvido que estamos evitando.
    if (!table) return;
    try {
      await supabase.from(table).update({ reminded_at: new Date().toISOString() }).eq('id', row.id);
    } catch { /* columna ausente: se queda la marca local */ }
  }, [businessName, noun, table]);

  /**
   * Cuántas quedan por recordar.
   *
   * ⚠️ Sólo cuentan las que TIENEN teléfono. Si se contaran todas, una cita sin
   * número dejaría el aviso clavado en "1 sin recordar" para siempre —el dueño
   * no puede hacer nada con ella— y el contador se volvería ruido que se ignora.
   */
  const pending = agenda.today.filter(
    r => !done.has(r.id) && waNumber(r.phone).length >= 8
  ).length;

  const List: React.FC<{ items: AgendaRow[]; isToday: boolean }> = ({ items, isToday }) => (
    <div className="space-y-2">
      {items.map(r => {
        const marked = done.has(r.id);
        const phoneOk = waNumber(r.phone).length >= 8;
        return (
          <div key={r.id}
            className="flex items-center gap-3 bg-black/25 border border-white/10 rounded-xl px-3 py-2.5 min-w-0">
            <div className="text-xs font-black tabular-nums shrink-0 w-[68px]" style={{ color: accent }}>
              {r.time ? formatTime12(r.time) : '—'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm text-white font-semibold truncate">{r.name}</div>
              {r.detail && (
                <div className="text-[11px] text-white/40 truncate">{r.detail}</div>
              )}
            </div>
            {phoneOk ? (
              <button
                onClick={() => remind(r, isToday)}
                title={marked ? 'Ya le recordaste. Puedes volver a escribirle.' : 'Abrir WhatsApp con el recordatorio escrito'}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition ${
                  marked
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25'
                    : 'bg-[#25D366]/15 text-[#25D366] border border-[#25D366]/30 hover:bg-[#25D366]/25'
                }`}>
                {marked ? <FaCheck size={10} /> : <FaWhatsapp size={12} />}
                {marked ? 'Avisado' : 'Recordar'}
              </button>
            ) : (
              <span className="shrink-0 text-[10px] text-white/25 uppercase tracking-wider px-2">Sin teléfono</span>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="rounded-2xl border overflow-hidden"
      style={{ borderColor: `${accent}33`, background: `linear-gradient(180deg, ${accent}0d, transparent)` }}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left">
        <FaBell style={{ color: accent }} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black text-white uppercase tracking-wider">
            Agenda de hoy
          </div>
          <div className="text-[11px] text-white/45 mt-0.5">
            {agenda.today.length === 0
              ? `Sin ${noun}s para hoy.`
              : `${agenda.today.length} ${noun}${agenda.today.length === 1 ? '' : 's'}` +
                (pending > 0 ? ` · ${pending} sin recordar` : ' · todas avisadas')}
          </div>
        </div>
        {pending > 0 && (
          <span className="shrink-0 text-[10px] font-black px-2 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
            {pending}
          </span>
        )}
        <FaChevronDown className={`shrink-0 text-white/30 transition-transform ${open ? 'rotate-180' : ''}`} size={12} />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {agenda.today.length === 0 ? (
            <div className="text-xs text-white/35 bg-black/20 border border-white/5 rounded-xl p-4 text-center">
              No tienes {noun}s agendadas para hoy.
            </div>
          ) : (
            <List items={agenda.today} isToday />
          )}

          {agenda.tomorrow.length > 0 && (
            <div className="pt-1">
              <button onClick={() => setShowTomorrow(s => !s)}
                className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-white/45 hover:text-white/70 transition">
                <FaClock size={10} />
                Mañana ({agenda.tomorrow.length})
                <FaChevronDown className={`transition-transform ${showTomorrow ? 'rotate-180' : ''}`} size={10} />
              </button>
              {showTomorrow && <div className="mt-2"><List items={agenda.tomorrow} isToday={false} /></div>}
            </div>
          )}

          <p className="text-[10px] text-white/30 leading-relaxed">
            El aviso a tu teléfono se envía solo la tarde anterior y a primera hora del día.
            Aquí le recuerdas al cliente: el mensaje se abre ya escrito, sólo lo envías.
          </p>
        </div>
      )}
    </div>
  );
};

export default DailyAgendaPanel;
