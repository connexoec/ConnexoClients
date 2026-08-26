import { supabase } from './supabase';

// Llave pública VAPID. Es pública por diseño (va al navegador). Se deja como
// fallback hardcodeado para que funcione en Vercel aunque no inyecte envs,
// igual que el cliente de Supabase.
const VAPID_PUBLIC_KEY =
  (import.meta as any).env?.VITE_VAPID_PUBLIC_KEY ||
  'BDij2x_91xL6FWMELNK2kXALVW48ujFjVQ5mS4ai7cStMC6IuBPyEIkmTF5r_r19JRa9cGxhPXXsbsGRAAGREj4';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

/**
 * ¿La suscripción existente fue creada con la MISMA llave VAPID que usamos hoy?
 *
 * Es la causa silenciosa nº1 de "en la PC llega y en el teléfono no": el
 * navegador guarda la suscripción para siempre, así que si el dispositivo se
 * suscribió con una llave anterior, `getSubscription()` la devuelve como buena,
 * se guarda en la BD sin errores (la UI se pone verde) y el servidor de push la
 * rechaza con 403 en cada envío. Hay que detectarla y re-suscribir.
 */
function subscriptionKeyMatches(sub: PushSubscription, expected: Uint8Array): boolean {
  const raw = (sub.options as any)?.applicationServerKey as ArrayBuffer | null | undefined;
  if (!raw) return false; // sin llave conocida → mejor re-suscribir
  const actual = new Uint8Array(raw);
  if (actual.length !== expected.length) return false;
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] !== expected[i]) return false;
  }
  return true;
}

/**
 * ¿El error de Supabase es "esa función no existe todavía"? Se usa para poder
 * desplegar el frontend ANTES de correr el SQL sin dejar a nadie sin avisos.
 * PostgREST devuelve 404 con code PGRST202 cuando la RPC no está en el esquema.
 */
function isMissingFunction(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === 'PGRST202' || error.code === '42883') return true;
  const m = (error.message || '').toLowerCase();
  return m.includes('could not find the function') || m.includes('does not exist');
}

export function pushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function pushPermission(): NotificationPermission | 'unsupported' {
  if (!pushSupported()) return 'unsupported';
  return Notification.permission;
}

export type EnablePushResult = { ok: boolean; reason?: string };

// Compat: Safari antiguo usa requestPermission(callback) en vez de promesa.
function requestPermissionCompat(): Promise<NotificationPermission> {
  return new Promise((resolve) => {
    try {
      const p = (Notification as any).requestPermission((res: NotificationPermission) => resolve(res));
      if (p && typeof p.then === 'function') {
        p.then(resolve).catch(() => resolve(Notification.permission));
      }
    } catch (_) {
      resolve(Notification.permission);
    }
  });
}

/**
 * Muestra una notificación LOCAL en este dispositivo (sin backend).
 * Sirve para verificar que el permiso + service worker funcionan aquí.
 */
export async function sendLocalTest(): Promise<EnablePushResult> {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };
  try {
    let permission: NotificationPermission = Notification.permission;
    if (permission !== 'granted') permission = await requestPermissionCompat();
    if (permission === 'denied') return { ok: false, reason: 'denied' };
    if (permission !== 'granted') return { ok: false, reason: 'dismissed' };

    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification('Connexo ✅', {
      body: 'Las notificaciones funcionan en este dispositivo.',
      icon: '/connexo-iso-o.png',
      // Silueta transparente: Android pinta el badge solo con el canal alfa,
      // así que una imagen opaca saldría como un cuadrado blanco.
      badge: '/connexo-badge.png',
      tag: 'connexo-test',
      // @ts-ignore vibrate es válido en Android aunque el tipo no lo liste
      vibrate: [80, 40, 80],
      data: { url: '/' },
    });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: (e?.name ? e.name + ': ' : '') + (e?.message || String(e)) };
  }
}

/**
 * Garantiza que la suscripción push de ESTE dispositivo exista y esté guardada
 * en Supabase, SIN pedir permiso (solo actúa si ya está concedido).
 * Llamar en cada carga del dashboard: repara suscripciones perdidas/rotadas.
 */
export async function ensurePushSubscription(userId: string): Promise<EnablePushResult> {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };
  if (!userId) return { ok: false, reason: 'no-user' };
  if (Notification.permission !== 'granted') return { ok: false, reason: 'no-permission' };
  return enablePush(userId); // enablePush no vuelve a pedir permiso si ya está concedido
}

/**
 * Pide permiso (solo si hace falta), crea la suscripción Web Push y la guarda
 * en Supabase. Idempotente: si ya está suscrito reutiliza/actualiza el registro.
 * Devuelve un `reason` descriptivo con la causa real si falla.
 */
export async function enablePush(userId: string, opts?: { force?: boolean }): Promise<EnablePushResult> {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };
  if (!userId) return { ok: false, reason: 'no-user' };

  try {
    // Si YA está concedido, no volvemos a pedirlo (evita falsos "denegado").
    let permission: NotificationPermission = Notification.permission;
    if (permission !== 'granted') {
      permission = await requestPermissionCompat();
    }
    if (permission === 'denied') return { ok: false, reason: 'denied' };
    if (permission !== 'granted') return { ok: false, reason: 'dismissed' };

    const reg = await navigator.serviceWorker.ready;
    const appServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);

    let sub = await reg.pushManager.getSubscription();

    // Descartamos la suscripción existente si quedó atada a otra llave VAPID
    // (o si el usuario pidió reparar a mano): si no, se reutilizaría una
    // suscripción que el servidor de push rechaza en cada envío.
    if (sub && (opts?.force || !subscriptionKeyMatches(sub, appServerKey))) {
      const staleEndpoint = sub.endpoint;
      try { await sub.unsubscribe(); } catch (_) { /* ignore */ }
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', userId)
        .eq('endpoint', staleEndpoint);
      sub = null;
    }

    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey,
      });
    }

    const json: any = sub.toJSON();

    // ESTE dispositivo pasa a pertenecer a la cuenta que lo está usando, y deja
    // de pertenecer a cualquier otra.
    //
    // ⚠️ Es la corrección de las "notificaciones fantasma". Antes se hacía un
    // `upsert` por (user_id, endpoint), así que cada cuenta que se abría en el
    // teléfono dejaba su propia fila y NINGUNA se borraba al cerrar sesión: el
    // aparato terminaba recibiendo los pedidos y reservas de todos los negocios
    // que alguna vez se habían abierto en él, mientras la campana de la app
    // —que filtra por la cuenta activa— no mostraba nada.
    //
    // El borrado de la fila ajena TIENE que hacerlo el servidor: RLS impide
    // (con razón) que una cuenta toque las filas de otra, así que desde aquí
    // era imposible limpiar lo que dejó la sesión anterior.
    const { error } = await supabase.rpc('claim_push_device', {
      p_endpoint: sub.endpoint,
      p_p256dh: json.keys?.p256dh,
      p_auth: json.keys?.auth,
      p_user_agent: navigator.userAgent,
    });

    if (error) {
      // Todavía no se ha ejecutado setup_notifications_fix.sql: se registra
      // como antes para no dejar el dispositivo sin avisos, pero se avisa de
      // que los fantasmas seguirán hasta que se ejecute.
      if (isMissingFunction(error)) {
        const { error: upsertError } = await supabase.from('push_subscriptions').upsert(
          {
            user_id: userId,
            endpoint: sub.endpoint,
            p256dh: json.keys?.p256dh,
            auth: json.keys?.auth,
            user_agent: navigator.userAgent,
          },
          { onConflict: 'user_id,endpoint' },
        );
        if (upsertError) return { ok: false, reason: 'db: ' + upsertError.message };
        console.warn(
          '[push] Falta ejecutar setup_notifications_fix.sql en Supabase: ' +
          'este dispositivo puede seguir recibiendo avisos de otras cuentas.',
        );
        return { ok: true };
      }
      return { ok: false, reason: 'db: ' + error.message };
    }

    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: (e?.name ? e.name + ': ' : '') + (e?.message || String(e)) };
  }
}

/**
 * Fuerza una suscripción nueva en este dispositivo: tira la actual (aunque
 * parezca válida), se vuelve a suscribir y guarda el registro.
 * Es el botón "no me llegan los avisos" del panel de notificaciones.
 */
export async function repairPushSubscription(userId: string): Promise<EnablePushResult> {
  return enablePush(userId, { force: true });
}

/** Un negocio que está recibiendo avisos en este dispositivo. */
export interface DeviceAccount {
  userId: string;
  name: string;
  isMe: boolean;
}

/** El endpoint de push de ESTE navegador, o null si no está suscrito. */
async function currentEndpoint(): Promise<string | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub?.endpoint ?? null;
}

/**
 * Qué negocios están recibiendo avisos en este teléfono/navegador.
 *
 * Devuelve lista vacía —sin ruido— cuando no hay nada que enseñar: sin
 * suscripción, o con el proyecto en modo "un dispositivo = una cuenta" (ahí la
 * RPC no existe y no hay nada que desambiguar).
 *
 * Existe porque lo que convertía un aviso compartido en "fantasma" no era
 * compartir el aparato, sino que no hubiera forma de VER quién lo usa ni de
 * quitarlo.
 */
export async function listDeviceAccounts(): Promise<DeviceAccount[]> {
  try {
    const endpoint = await currentEndpoint();
    if (!endpoint) return [];
    const { data, error } = await supabase.rpc('list_push_device_accounts', {
      p_endpoint: endpoint,
    });
    if (error || !Array.isArray(data)) return [];
    return data.map((r: any) => ({
      userId: r.user_id,
      name: r.name || 'Negocio',
      isMe: !!r.is_me,
    }));
  } catch (_) {
    return [];
  }
}

/**
 * ¿El proyecto permite que un mismo aparato reciba avisos de varias cuentas?
 * Lo decide la base de datos: en modo multicuenta existe la RPC de listado.
 *
 * Se usa para saber si al cerrar sesión hay que soltar el dispositivo. Si no
 * se puede averiguar, se responde `true` (no soltar) a propósito: en el modo
 * exclusivo el registro sobrante lo limpia igualmente el siguiente inicio de
 * sesión en ese aparato, mientras que soltar por error un negocio que el dueño
 * quería vigilar lo dejaría sin sus avisos sin que él hubiera hecho nada.
 */
export async function pushMultiAccountEnabled(): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('list_push_device_accounts', { p_endpoint: '' });
    if (error && isMissingFunction(error)) return false;
    return true;
  } catch (_) {
    return true;
  }
}

/** Deja de recibir en ESTE dispositivo los avisos del negocio indicado. */
export async function releaseDeviceAccount(userId: string): Promise<boolean> {
  try {
    const endpoint = await currentEndpoint();
    if (!endpoint) return false;
    const { data, error } = await supabase.rpc('release_push_device_account', {
      p_endpoint: endpoint,
      p_user_id: userId,
    });
    return !error && data === true;
  } catch (_) {
    return false;
  }
}

/**
 * Suelta ESTE dispositivo de la cuenta indicada, SIN cancelar la suscripción
 * del navegador. Se llama al cerrar sesión.
 *
 * ⚠️ Es la otra mitad de la corrección de los fantasmas: hasta ahora cerrar
 * sesión sólo hacía `signOut()` y la fila de `push_subscriptions` se quedaba
 * ahí para siempre, así que el teléfono seguía recibiendo los avisos de un
 * negocio que ya no estaba usando.
 *
 * No se hace `unsubscribe()` del navegador a propósito: el permiso y la
 * suscripción del aparato se conservan, de modo que al entrar con la siguiente
 * cuenta los avisos quedan activos de inmediato y sin volver a pedir permiso.
 *
 * Nunca lanza: cerrar sesión no puede fallar porque falle esta limpieza.
 */
export async function releasePushDevice(userId: string): Promise<void> {
  try {
    if (!pushSupported() || !userId) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('endpoint', sub.endpoint);
  } catch (_) {
    /* no bloquea el cierre de sesión */
  }
}

/** Cancela la suscripción del dispositivo actual y la borra de Supabase. */
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  try { await sub.unsubscribe(); } catch (_) { /* ignore */ }
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
}
