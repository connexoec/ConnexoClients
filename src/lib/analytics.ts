import { supabase } from './supabase';

/**
 * Registro de visitas y clics del perfil público.
 *
 * Sustituye a las Edge Functions `trackView` y `trackClick`, que se invocaban
 * desde PublicProfile pero NUNCA existieron en el proyecto (devolvían 404).
 * Ahora son RPC — ver `setup_analytics.sql`.
 *
 * Todo lo de aquí es "dispara y olvida": si algo falla, el perfil del cliente
 * no se entera. Es telemetría, no puede tumbar la página de nadie.
 */

const VISITOR_KEY = 'cnx_visitor_id';

/**
 * Identificador del navegador, no de la persona: se genera aquí mismo y no se
 * cruza con ningún dato personal. Solo sirve para que recargar la página no
 * cuente como visitas nuevas.
 */
function getVisitorId(): string | null {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = (crypto?.randomUUID?.() ?? `v${Date.now()}${Math.random().toString(36).slice(2)}`);
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    // Modo privado o storage bloqueado: se registra igual, solo que sin
    // deduplicar. Preferible a perder la visita entera.
    return null;
  }
}

function getDevice(): 'mobile' | 'desktop' {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent || '';
  const coarse = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches;
  return (/Android|iPhone|iPad|iPod|Mobile|Opera Mini|IEMobile/i.test(ua) || coarse)
    ? 'mobile'
    : 'desktop';
}

/**
 * Fuente del tráfico, ya legible. Se guarda el dominio, no la URL completa:
 * la ruta de origen no aporta al dueño y sí arrastra datos de más.
 */
function getReferrer(): string | null {
  try {
    const raw = document.referrer;
    if (!raw) return null;
    const host = new URL(raw).hostname.replace(/^www\./, '');
    if (!host || host === window.location.hostname) return null; // navegación interna
    return host;
  } catch {
    return null;
  }
}

/** Registra una visita al perfil. La RPC deduplica recargas (30 min). */
export function trackProfileView(ownerId: string): void {
  if (!ownerId) return;
  Promise.resolve(
    supabase.rpc('track_profile_view', {
      p_owner_id: ownerId,
      p_device: getDevice(),
      p_referrer: getReferrer(),
      p_visitor: getVisitorId(),
    })
  ).catch(() => { /* silencioso a propósito */ });
}

/** Registra el clic en un enlace del perfil. */
export function trackLinkClick(ownerId: string, linkId: string): void {
  if (!ownerId || !linkId) return;
  Promise.resolve(
    supabase.rpc('track_link_click', {
      p_owner_id: ownerId,
      p_link_id: linkId,
      p_device: getDevice(),
      p_visitor: getVisitorId(),
    })
  ).catch(() => { /* silencioso a propósito */ });
}

/** Zona horaria del dueño, para que el mapa de calor no salga corrido. */
export function getOwnerTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Guayaquil';
  } catch {
    return 'America/Guayaquil';
  }
}
