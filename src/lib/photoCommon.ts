import type {
  PhotoPackage, PhotoPackageKind, PhotoPackageMode, PhotoSettings, PhotoWorkingDay,
  PhotoBookingStatus, PhotoPaymentStatus, PhotoQuoteStatus, PhotoLocationKind,
} from '../../types';
import { supabase } from './supabase';
import { downscaleImageBlob } from './catalogVision';

/**
 * Piezas comunes de la plantilla Fotografía (perfil público y panel).
 *
 * Todo el cálculo de franjas y de dinero vive aquí, aparte de la interfaz, porque es lo único que puede
 * fallar sin avisar: una hora de más en la agenda o un total distinto del que guarda el servidor. Las
 * reglas son las MISMAS de setup_photo.sql (book_photo_session); si cambias una, cámbiala en los dos.
 */

/* ── Textos ─────────────────────────────────────────────────────────────────── */
export const WORK_CATEGORIES = [
  'Bodas', 'Quinceañeras', 'Retratos', 'Familia', 'Maternidad y recién nacidos', 'Niños', 'Eventos',
  'Corporativo', 'Producto', 'Gastronomía', 'Inmobiliaria', 'Moda', 'Documentos', 'Otros',
];

export const KIND_LABEL: Record<PhotoPackageKind, string> = {
  sesion: 'Sesión', evento: 'Evento', documentos: 'Documentos', impresion: 'Impresión y marcos', estudio: 'Alquiler del estudio',
};
export const KIND_HINT: Record<PhotoPackageKind, string> = {
  sesion: 'Retratos, familia, pareja, producto… con duración fija',
  evento: 'Bodas, quinceañeras, eventos: por horas o día completo',
  documentos: 'Fotos carnet, pasaporte, visa',
  impresion: 'Ampliaciones, cuadros, álbumes, restauración',
  estudio: 'Se renta el estudio por hora',
};
export const MODE_LABEL: Record<PhotoPackageMode, string> = {
  reserva: 'Reservar con fecha y hora', cotizacion: 'Pedir cotización', consulta: 'Consultar por WhatsApp',
};

export const BOOKING_STEPS: PhotoBookingStatus[] = ['pendiente', 'confirmada', 'realizada', 'entregada'];
export const BOOKING_LABEL: Record<PhotoBookingStatus, string> = {
  pendiente: 'Pendiente de confirmar', confirmada: 'Confirmada', realizada: 'Sesión realizada', entregada: 'Fotos entregadas',
  cancelada: 'Cancelada', no_show: 'No asistió',
};
export const PAY_LABEL: Record<PhotoPaymentStatus, string> = { pendiente: 'Pago pendiente', anticipo: 'Anticipo recibido', pagado: 'Pagado' };
export const QUOTE_LABEL: Record<PhotoQuoteStatus, string> = {
  nueva: 'Recibida', contactado: 'Te contactamos', cotizada: 'Cotización enviada', aceptada: 'Aceptada', descartada: 'Cerrada',
};
export const LOCATION_LABEL: Record<PhotoLocationKind, string> = { estudio: 'En el estudio', domicilio: 'A domicilio', exterior: 'En exteriores' };

/** Errores de las RPC en palabras del cliente. */
export const PHOTO_ERRORS: Record<string, string> = {
  booking_unavailable: 'Las reservas en línea no están disponibles por ahora. Escríbenos por WhatsApp.',
  name_required: 'Escribe tu nombre.',
  contact_required: 'Déjanos un teléfono o un correo para confirmarte.',
  email_invalid: 'Ese correo no parece válido.',
  type_required: 'Cuéntanos qué tipo de sesión o evento necesitas.',
  package_unavailable: 'Ese paquete ya no está disponible.',
  date_out_of_range: 'Esa fecha no está disponible para reservar.',
  day_blocked: 'Ese día no atendemos. Elige otra fecha.',
  day_closed: 'Ese día no atendemos. Elige otra fecha.',
  hours_out_of_range: 'Elige un número de horas permitido.',
  time_required: 'Elige una hora.',
  outside_hours: 'Esa hora queda fuera del horario de atención.',
  bad_slot: 'Esa hora no está disponible. Elige otra.',
  too_soon: 'Necesitamos un poco más de anticipación para esa hora. Elige otra.',
  slot_taken: 'Alguien acaba de tomar ese horario. Elige otro.',
  rate_limited: 'Has enviado muchas solicitudes seguidas. Inténtalo en un rato o escríbenos por WhatsApp.',
  not_found: 'No encontramos ese código.',
  not_cancellable: 'Esta reserva ya no se puede cancelar.',
  too_late: 'Ya es muy tarde para cancelar por aquí. Escríbenos por WhatsApp.',
  owner_not_found: 'Este perfil no puede recibir solicitudes todavía.',
  invalid: 'El código o la clave no coinciden.',
  expired: 'Esta galería ya venció. Pídele al fotógrafo que la reactive.',
  locked: 'Demasiados intentos. Espera unos minutos y vuelve a probar.',
  galleries_unavailable: 'Las galerías de entrega no están disponibles en este perfil.',
  limit_exceeded: 'Superaste el número de fotos que puedes elegir.',
  favorites_invalid: 'No se pudo guardar tu selección.',
};
export const photoErr = (e: any, fallback = 'No se pudo completar. Inténtalo de nuevo.') => {
  if (e?.error && PHOTO_ERRORS[e.error]) return e.error === 'limit_exceeded' && e.limit ? `Puedes elegir hasta ${e.limit} fotos.` : PHOTO_ERRORS[e.error];
  const m = String(e?.message || '');
  if (/does not exist|could not find|PGRST202|42883/i.test(m)) return 'Esta función aún no está activada en el perfil.';
  return m || fallback;
};

/* ── Fechas y horas (siempre locales, nunca toISOString: cambia de día a las 19:00 en UTC-5) ── */
export const toMin = (hhmm?: string | null): number | null => {
  if (!hhmm || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm)) return null;
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
};
export const toHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
export const dowOf = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1).getDay(); };
export const nowMinutes = (d: Date = new Date()) => d.getHours() * 60 + d.getMinutes();

export const DEFAULT_HOURS: PhotoWorkingDay[] = [
  { day: 0, isOpen: false, openTime: '09:00', closeTime: '14:00' },
  { day: 1, isOpen: true, openTime: '09:00', closeTime: '18:00' },
  { day: 2, isOpen: true, openTime: '09:00', closeTime: '18:00' },
  { day: 3, isOpen: true, openTime: '09:00', closeTime: '18:00' },
  { day: 4, isOpen: true, openTime: '09:00', closeTime: '18:00' },
  { day: 5, isOpen: true, openTime: '09:00', closeTime: '18:00' },
  { day: 6, isOpen: true, openTime: '09:00', closeTime: '14:00' },
];
export const workingDay = (s: PhotoSettings | undefined, dow: number): PhotoWorkingDay => {
  const list = Array.isArray(s?.workingHours) && s!.workingHours!.length ? s!.workingHours! : DEFAULT_HOURS;
  return list.find(d => Number(d.day) === dow) ?? { day: dow, isOpen: false, openTime: '09:00', closeTime: '18:00' };
};

export const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);
export const settingsOf = (s: PhotoSettings | undefined, isUltra: boolean) => ({
  daysAhead: clamp(Number(s?.bookingDaysAhead) || 60, 1, 180),
  noticeHours: clamp(s?.minNoticeHours === undefined || s?.minNoticeHours === null ? 12 : Number(s.minNoticeHours), 0, 720),
  slot: clamp(Number(s?.slotMinutes) || 60, 15, 240),
  cancelHours: clamp(s?.cancelHours === undefined || s?.cancelHours === null ? 48 : Number(s.cancelHours), 0, 720),
  parallel: isUltra ? clamp(Number(s?.parallelSessions) || 1, 1, 10) : 1,
});

/* ── Dinero (el servidor recalcula; esto solo muestra lo mismo antes de enviar) ── */
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const packageHours = (p: Pick<PhotoPackage, 'hourly' | 'min_hours' | 'max_hours'>, wanted?: number | null) =>
  p.hourly ? clamp(Number(wanted) || p.min_hours, p.min_hours, p.max_hours) : null;
export const packageTotal = (p: Pick<PhotoPackage, 'price' | 'hourly' | 'min_hours' | 'max_hours'>, wanted?: number | null) =>
  round2(Number(p.price) * (p.hourly ? (packageHours(p, wanted) as number) : 1));
export const depositOf = (total: number, percent: number) => round2(total * (Number(percent) || 0) / 100);
export const packageDuration = (p: Pick<PhotoPackage, 'hourly' | 'duration_min' | 'min_hours' | 'max_hours'>, wanted?: number | null) =>
  p.hourly ? (packageHours(p, wanted) as number) * 60 : p.duration_min;
export const durationText = (p: Pick<PhotoPackage, 'full_day' | 'hourly' | 'duration_min'>) => {
  if (p.full_day) return 'Día completo';
  if (p.hourly) return 'Por hora';
  const m = p.duration_min;
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
};

/* ── Agenda ─────────────────────────────────────────────────────────────────── */
export interface BusySlot { date: string; start: number; end: number }
export interface BlockRange { from: string; to: string }
export type DayState = 'open' | 'closed' | 'blocked';

export const dayState = (iso: string, s: PhotoSettings | undefined, blocks: BlockRange[]): DayState => {
  if (blocks.some(b => iso >= b.from && iso <= b.to)) return 'blocked';
  return workingDay(s, dowOf(iso)).isOpen ? 'open' : 'closed';
};

/** Cuántas sesiones hay a la vez en el instante `t` (minutos) de ese día. */
const concurrencyAt = (busy: BusySlot[], date: string, t: number) => busy.filter(b => b.date === date && b.start <= t && t < b.end).length;

/** Mayor número de sesiones simultáneas dentro de [start, end): se mira en el comienzo pedido y en cada comienzo que caiga dentro. */
export const maxConcurrency = (busy: BusySlot[], date: string, start: number, end: number) => {
  const points = new Set<number>([start]);
  for (const b of busy) if (b.date === date && b.start > start && b.start < end) points.add(b.start);
  let max = 0;
  points.forEach(t => { max = Math.max(max, concurrencyAt(busy, date, t)); });
  return max;
};

export interface SlotInfo { time: string; available: boolean }

/** Franjas de ese día para un paquete: las mismas que el servidor aceptaría. `now` es la hora local del visitante. */
export const buildSlots = (opts: {
  date: string; durationMin: number; fullDay: boolean; settings?: PhotoSettings; isUltra: boolean;
  busy: BusySlot[]; blocks: BlockRange[]; now?: Date;
}): SlotInfo[] => {
  const { date, durationMin, fullDay, settings, isUltra, busy, blocks } = opts;
  const now = opts.now ?? new Date();
  if (dayState(date, settings, blocks) !== 'open') return [];
  const cfg = settingsOf(settings, isUltra);
  const wd = workingDay(settings, dowOf(date));
  const open = toMin(wd.openTime) ?? 540, close = toMin(wd.closeTime) ?? 1080;
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const nowAbs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 60000 + nowMinutes(now);
  const [y, m, d] = date.split('-').map(Number);
  const dayAbs = Date.UTC(y, (m || 1) - 1, d || 1) / 60000;
  const minStart = nowAbs + cfg.noticeHours * 60;
  if (date < todayIso) return [];

  if (fullDay) {
    const ok = dayAbs + open >= minStart && maxConcurrency(busy, date, 0, 1439) < cfg.parallel;
    return [{ time: 'Día completo', available: ok }];
  }
  const out: SlotInfo[] = [];
  for (let t = open; t + durationMin <= close; t += cfg.slot) {
    const free = maxConcurrency(busy, date, t, t + durationMin) < cfg.parallel;
    out.push({ time: toHHMM(t), available: free && dayAbs + t >= minStart });
  }
  return out;
};

/* ── Subida de fotos ────────────────────────────────────────────────────────── */
/** Sube una foto al bucket «assets» reescalada (lado mayor `maxSide`). Devuelve la URL pública. */
export const uploadPhotoFile = async (userId: string, folder: string, file: File, maxSide = 2000, quality = 0.88): Promise<string> => {
  let body: Blob = file;
  try { body = await downscaleImageBlob(file, maxSide, quality); } catch { /* si no se puede reescalar, se sube tal cual */ }
  const path = `${folder}/${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const { error } = await supabase.storage.from('assets').upload(path, body, { upsert: true, contentType: 'image/jpeg' });
  if (error) throw error;
  return supabase.storage.from('assets').getPublicUrl(path).data.publicUrl;
};

/** Sube varias fotos (de 3 en 3) y avisa el avance. Las que fallan se omiten y se devuelven en `failed`. */
export const uploadMany = async (
  userId: string, folder: string, files: File[], onProgress?: (done: number, total: number) => void, maxSide = 2000,
): Promise<{ ok: { url: string; name: string }[]; failed: string[] }> => {
  const ok: { url: string; name: string; i: number }[] = [];
  const failed: string[] = [];
  let next = 0, done = 0;
  const worker = async () => {
    while (next < files.length) {
      const i = next++;
      const f = files[i];
      try { ok.push({ url: await uploadPhotoFile(userId, folder, f, maxSide), name: f.name, i }); } catch { failed.push(f.name); }
      onProgress?.(++done, files.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, files.length) }, worker));
  ok.sort((a, b) => a.i - b.i);
  return { ok: ok.map(({ url, name }) => ({ url, name })), failed };
};

export const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
export const randomPin = () => String(Math.floor(1000 + Math.random() * 9000));
export const randomGalleryCode = (name: string) => {
  const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 6) || 'FOTOS';
  return `${base}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
};
