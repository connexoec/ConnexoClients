/**
 * Recordatorios de citas — cálculo de la agenda del día.
 *
 * Vive aparte de la interfaz porque es lo único que puede fallar EN SILENCIO:
 * un día de diferencia y el dueño ve la agenda equivocada sin que nada avise.
 * Aquí se puede comprobar sin montar React.
 *
 * ⚠️ Las fechas se comparan COMO TEXTO. En "YYYY-MM-DD" el orden alfabético ya
 * es el cronológico, así que no se construye ningún `Date` que pueda correrse
 * de día por zona horaria — el mismo criterio de `exportRange.ts` (v0.51.0).
 */

/** Una cita ya normalizada, venga de la tabla que venga. */
export interface AgendaRow {
  id: string;
  /** 'YYYY-MM-DD' */
  date: string;
  /** 'HH:MM'. Vacío cuando la plantilla no guarda hora (visitas de realty). */
  time: string;
  name: string;
  phone: string;
  status: string;
  /** Servicio, vendedor, nº de personas… lo que dé contexto en la lista. */
  detail?: string;
}

/**
 * Fecha de hoy en la zona horaria DEL NAVEGADOR.
 *
 * ⚠️ No usar `new Date().toISOString().slice(0,10)`: eso da la fecha en UTC, y
 * en Ecuador (UTC−5) a partir de las 19:00 devuelve YA EL DÍA SIGUIENTE. Una
 * agenda "de hoy" calculada así se vacía cada tarde y muestra la de mañana.
 */
export const todayISO = (d: Date = new Date()): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/**
 * Suma días a una fecha 'YYYY-MM-DD'.
 * Se opera en UTC a propósito: así el cambio de horario de verano de cualquier
 * zona no puede hacer que "mañana" caiga en el mismo día o se salte uno.
 */
export const addDaysISO = (iso: string, days: number): string => {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + days);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`;
};

/**
 * Estados que siguen "en pie".
 *
 * Se define por EXCLUSIÓN (lo cancelado / ya atendido / no asistió) en vez de
 * por lista blanca: las 4 tablas usan vocabularios distintos —barber y ecom
 * dicen 'completada', gastro dice 'sentada', realty dice 'cerrado'— y una lista
 * blanca dejaría fuera en silencio los estados de la plantilla que se añada
 * mañana, es decir: dejaría de recordar citas sin que nadie se entere.
 */
const CLOSED = new Set([
  'cancelada', 'cancelado', 'no_show', 'completada', 'completado',
  'atendida', 'cerrado', 'entregado',
]);

export const isActiveStatus = (status?: string | null): boolean =>
  !CLOSED.has(String(status || '').trim().toLowerCase());

/** Ordena por hora. Las que no tienen hora van al final, no al principio. */
const byTime = (a: AgendaRow, b: AgendaRow): number => {
  if (!a.time && !b.time) return a.name.localeCompare(b.name);
  if (!a.time) return 1;
  if (!b.time) return -1;
  return a.time.localeCompare(b.time);
};

export interface Agenda {
  today: AgendaRow[];
  tomorrow: AgendaRow[];
}

/** Reparte las citas activas en hoy / mañana, ya ordenadas por hora. */
export const buildAgenda = (rows: AgendaRow[], today: string = todayISO()): Agenda => {
  const tomorrow = addDaysISO(today, 1);
  const pick = (day: string) =>
    rows.filter(r => r.date === day && isActiveStatus(r.status)).sort(byTime);
  return { today: pick(today), tomorrow: pick(tomorrow) };
};

/** '14:30' → '2:30 PM'. Si no reconoce el formato devuelve el original. */
export const formatTime12 = (time?: string | null): string => {
  const raw = String(time || '').trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return raw;
  const h = Number(m[1]);
  if (!Number.isFinite(h) || h > 23) return raw;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${suffix}`;
};

/**
 * Número a formato wa.me.
 * Los teléfonos ecuatorianos se teclean como '0987654321'; WhatsApp los quiere
 * con el código de país, así que el 0 inicial se sustituye por 593.
 */
export const waNumber = (phone?: string | null): string => {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '593' + d.slice(1);
  return d;
};

export interface ReminderMessageInput {
  name: string;
  businessName?: string | null;
  /** 'cita' | 'reserva' | 'visita' */
  noun: string;
  time?: string | null;
  /** true = hoy, false = mañana */
  isToday: boolean;
  detail?: string | null;
}

/** Texto del recordatorio que se le manda al cliente por WhatsApp. */
export const reminderMessage = (i: ReminderMessageInput): string => {
  const firstName = String(i.name || '').trim().split(/\s+/)[0] || '';
  const when = i.isToday ? 'hoy' : 'mañana';
  const at = i.time ? ` a las ${formatTime12(i.time)}` : '';
  const where = i.businessName ? ` en ${i.businessName}` : '';
  const extra = i.detail ? `\n${i.detail}` : '';
  return (
    `Hola ${firstName} 👋\n\n` +
    `Te recordamos tu ${i.noun}${where} para ${when}${at}.${extra}\n\n` +
    `¿Nos confirmas que vienes? ¡Te esperamos!`
  );
};

/** Enlace de WhatsApp listo para abrir. */
export const reminderWaLink = (phone: string | null | undefined, msg: string): string =>
  `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(msg)}`;

/**
 * Clave de "ya le recordé a este cliente" en el navegador.
 *
 * Lleva la fecha dentro a propósito: la marca debe caducar sola cada día, o un
 * cliente con cita semanal aparecería como "ya avisado" para siempre.
 */
export const remindedKey = (id: string, date: string): string =>
  `cnx_reminded_${date}_${id}`;
