// ─────────────────────────────────────────────────────────────────────────────
//  Reporte de errores del frontend → RPC log_client_error (setup_error_logging.sql)
//
//  Diseño defensivo: NADA de aquí puede volver a romper la app. Todo va envuelto
//  en try/catch y jamás lanza. Si Supabase no responde o la RPC aún no existe,
//  el error simplemente no se registra — la interfaz sigue igual.
//
//  Tres entradas de captura:
//    · reportError(...)         → llamada explícita (la usa el ErrorBoundary)
//    · window.onerror           → errores globales no controlados
//    · unhandledrejection       → promesas rechazadas sin catch
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabase';

export type ErrorType = 'render' | 'window' | 'promise' | 'manual';
export type Severity = 'info' | 'warning' | 'error' | 'critical';

export interface ReportInput {
  message: string;
  stack?: string | null;
  component?: string | null;
  errorType?: ErrorType;
  severity?: Severity;
  lastAction?: string | null;
  metadata?: Record<string, unknown>;
}

// ── Última acción del usuario ────────────────────────────────────────────────
// Se guarda una descripción corta del último clic/route para dar contexto de
// "qué intentaba hacer" cuando algo revienta. No captura contenido sensible:
// solo texto de botones/enlaces o su aria-label, recortado.
let lastAction = '';
export const getLastAction = () => lastAction;

// ── Dedup del lado del cliente ───────────────────────────────────────────────
// Un bucle de render puede disparar el mismo error decenas de veces por segundo.
// La RPC ya deduplica en el servidor, pero evitamos incluso la llamada de red si
// vimos el mismo mensaje hace < 15 s.
const recent = new Map<string, number>();
const DEDUP_MS = 15_000;

function deviceType(): 'mobile' | 'desktop' {
  try {
    const coarse = window.matchMedia?.('(pointer: coarse)')?.matches;
    const ua = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    return coarse || ua ? 'mobile' : 'desktop';
  } catch { return 'desktop'; }
}

function collectMetadata(extra?: Record<string, unknown>): Record<string, unknown> {
  const m: Record<string, unknown> = { ...(extra ?? {}) };
  try {
    m.device = deviceType();
    m.viewport = `${window.innerWidth}x${window.innerHeight}`;
    m.screen = `${window.screen?.width}x${window.screen?.height}`;
    m.language = navigator.language;
    m.online = navigator.onLine;
    m.platform = (navigator as any).userAgentData?.platform ?? navigator.platform ?? '';
  } catch { /* nada crítico */ }
  return m;
}

/**
 * Envía un error a la base. Devuelve una promesa que NUNCA rechaza.
 * Es "dispara y olvida": el que la llama no necesita esperar ni capturar.
 */
export async function reportError(input: ReportInput): Promise<void> {
  try {
    const message = (input.message ?? '').toString().slice(0, 2000);
    if (!message.trim()) return;

    // Dedup local.
    const now = Date.now();
    const prev = recent.get(message);
    if (prev && now - prev < DEDUP_MS) return;
    recent.set(message, now);
    // Limpieza mínima para que el Map no crezca sin límite.
    if (recent.size > 50) {
      for (const [k, t] of recent) if (now - t > DEDUP_MS) recent.delete(k);
    }

    await supabase.rpc('log_client_error', {
      p_message: message,
      p_stack: input.stack ? String(input.stack).slice(0, 8000) : null,
      p_url: (() => { try { return window.location.pathname + window.location.search; } catch { return null; } })(),
      p_component: input.component ?? null,
      p_error_type: input.errorType ?? 'manual',
      p_severity: input.severity ?? 'error',
      p_user_agent: (() => { try { return navigator.userAgent; } catch { return null; } })(),
      p_last_action: input.lastAction ?? lastAction ?? null,
      p_metadata: collectMetadata(input.metadata),
    });
  } catch {
    // Silencio absoluto: la telemetría jamás debe hacer fallar a la app.
  }
}

let installed = false;

/** Instala los captadores globales. Idempotente. Llamar una vez al arrancar. */
export function installGlobalErrorLogging(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  // Rastreo ligero de la última acción (para el contexto del error).
  try {
    window.addEventListener('click', (e) => {
      try {
        const el = (e.target as HTMLElement)?.closest?.('button, a, [role="button"]') as HTMLElement | null;
        if (!el) return;
        const label = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '').trim().replace(/\s+/g, ' ');
        if (label) lastAction = `clic: "${label.slice(0, 80)}"`;
      } catch { /* ignore */ }
    }, { capture: true, passive: true });
  } catch { /* ignore */ }

  // Errores globales no controlados.
  window.addEventListener('error', (e: ErrorEvent) => {
    // Los errores de carga de recursos (img/script) también disparan 'error'
    // pero no traen e.error; se ignoran para no llenar la tabla de ruido.
    if (!e.error && !e.message) return;
    reportError({
      message: e.message || String(e.error),
      stack: e.error?.stack ?? null,
      errorType: 'window',
      severity: 'error',
      metadata: { source: e.filename, line: e.lineno, col: e.colno },
    });
  });

  // Promesas rechazadas sin catch.
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    const reason: any = e.reason;
    reportError({
      message: reason?.message ? String(reason.message) : String(reason),
      stack: reason?.stack ?? null,
      errorType: 'promise',
      severity: 'error',
    });
  });
}
