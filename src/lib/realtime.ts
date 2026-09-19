/**
 * Realtime sobre el backend propio.
 *
 * Supabase abría una suscripción `postgres_changes` por tabla (23 en total) y
 * el filtro viajaba desde el navegador. Aquí hay **un** socket autenticado en
 * el namespace `/clients`; el servidor decide a qué salas entra el usuario, de
 * modo que nadie puede suscribirse a datos que no puede leer.
 *
 * Los eventos son `{resource}.{op}` — p. ej. `ecom.orders.created`.
 */

import { io, type Socket } from 'socket.io-client';
import { API_URL, getSession, onAuthStateChange } from './api';

export type RealtimeOp = 'created' | 'updated' | 'deleted';

export interface RealtimePayload<T = unknown> {
  id: string;
  op: RealtimeOp;
  data: T;
}

export type RealtimeStatus =
  | 'SUBSCRIBED'
  | 'CLOSED'
  | 'CHANNEL_ERROR'
  | 'TIMED_OUT';

/** El origen del socket es el del API sin el sufijo `/api`. */
const SOCKET_ORIGIN = API_URL.replace(/\/api\/?$/, '');

type Handler = (resource: string, payload: RealtimePayload) => void;

let socket: Socket | null = null;
const handlers = new Set<Handler>();
const statusWatchers = new Set<(status: RealtimeStatus) => void>();
let lastStatus: RealtimeStatus = 'CLOSED';

function announce(status: RealtimeStatus): void {
  lastStatus = status;
  for (const watcher of statusWatchers) {
    try {
      watcher(status);
    } catch (err) {
      console.error('[realtime] watcher falló:', err);
    }
  }
}

function ensureSocket(): Socket | null {
  const session = getSession();
  if (!session) return null;
  if (socket?.connected) return socket;
  if (socket) return socket; // ya conectando

  socket = io(`${SOCKET_ORIGIN}/clients`, {
    auth: { token: session.accessToken },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
  });

  socket.on('connect', () => announce('SUBSCRIBED'));
  socket.on('disconnect', () => announce('CLOSED'));
  socket.on('connect_error', () => announce('CHANNEL_ERROR'));

  // El gateway emite un evento por recurso. `onAny` evita tener que registrar
  // los ~30 nombres a mano y sobrevive a que el backend añada recursos.
  socket.onAny((event: string, payload: RealtimePayload) => {
    if (event === 'connect' || event === 'disconnect') return;
    const resource = event.replace(/\.(created|updated|deleted)$/, '');
    for (const handler of handlers) {
      try {
        handler(resource, payload);
      } catch (err) {
        console.error('[realtime] handler falló:', err);
      }
    }
  });

  return socket;
}

/** Al cambiar la sesión hay que rehacer el socket: el token va en el
 *  handshake, así que un token nuevo exige reconectar. */
onAuthStateChange((_event, session) => {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
    announce('CLOSED');
  }
  if (session && (handlers.size > 0 || statusWatchers.size > 0)) {
    ensureSocket();
  }
});

function maybeClose(): void {
  if (handlers.size === 0 && statusWatchers.size === 0 && socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
    lastStatus = 'CLOSED';
  }
}

export interface Subscription {
  unsubscribe: () => void;
}

/**
 * Escucha los recursos indicados. `resources` vacío = todos.
 *
 * Las pantallas sólo necesitan saber que *algo* cambió para volver a pedir la
 * lista, así que el payload se pasa tal cual pero nadie está obligado a usarlo.
 */
export function subscribe(
  resources: string[],
  onChange: (payload: RealtimePayload, resource: string) => void,
  onStatus?: (status: RealtimeStatus) => void,
): Subscription {
  const wanted = new Set(resources);

  const handler: Handler = (resource, payload) => {
    if (wanted.size > 0 && !wanted.has(resource)) return;
    onChange(payload, resource);
  };
  handlers.add(handler);

  const watcher = onStatus ?? null;
  if (watcher) {
    statusWatchers.add(watcher);
    // Estado actual de entrada, para que la UI no se quede en "conectando".
    watcher(lastStatus);
  }

  ensureSocket();

  return {
    unsubscribe() {
      handlers.delete(handler);
      if (watcher) statusWatchers.delete(watcher);
      maybeClose();
    },
  };
}
