/**
 * Cliente HTTP contra el backend propio de Connexo (`backend/`, NestJS).
 *
 * Sustituye la conexión directa a Supabase: aquí no hay claves de proyecto ni
 * RLS, sólo un JWT de acceso corto y un refresh token rotatorio que emite
 * `/api/clients/auth/*`.
 */

export const API_URL: string = (
  // Con `?.` para que el módulo también se pueda cargar fuera de Vite (tests,
  // scripts), donde `import.meta.env` no existe.
  ((import.meta as { env?: Record<string, string | undefined> })?.env
    ?.VITE_API_URL as string | undefined) || 'http://localhost:3000/api'
).replace(/\/+$/, '');

/** Dónde vive la sesión. Cambió el formato respecto de Supabase, así que la
 *  clave también: una sesión vieja de `sb-*` no se interpreta por error. */
const SESSION_KEY = 'connexo.clients.session';

export interface SessionUser {
  id: string;
  email: string;
  role?: string | null;
  username?: string | null;
  displayName?: string | null;
  plan?: string | null;
  theme?: string | null;
  isActive?: boolean;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms en que caduca `accessToken`. */
  expiresAt: number;
  user: SessionUser;
}

/** Error normalizado del backend. `code` es el identificador estable
 *  (`INVALID_CREDENTIALS`, …); `message` ya viene traducido al español. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    message: string,
    status: number,
    code = 'UNKNOWN',
    details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// ───────────────────────────── sesión ─────────────────────────────

type AuthEvent = 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED';
type AuthListener = (event: AuthEvent, session: Session | null) => void;

let current: Session | null = readStoredSession();
const listeners = new Set<AuthListener>();

function readStoredSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed?.accessToken || !parsed?.refreshToken || !parsed?.user) {
      return null;
    }
    return parsed;
  } catch {
    // Almacenamiento bloqueado (modo privado) o JSON corrupto: se arranca sin
    // sesión en vez de romper el render inicial.
    return null;
  }
}

function persist(session: Session | null): void {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* sin persistencia: la sesión vive sólo en memoria */
  }
}

export function getSession(): Session | null {
  return current;
}

/** ¿Hay algo guardado en disco? Lo usa App.tsx para decidir si espera. */
export function hasStoredSession(): boolean {
  return readStoredSession() !== null;
}

export function setSession(session: Session | null, event?: AuthEvent): void {
  current = session;
  persist(session);
  const kind: AuthEvent = event ?? (session ? 'SIGNED_IN' : 'SIGNED_OUT');
  for (const listener of listeners) {
    try {
      listener(kind, session);
    } catch (err) {
      console.error('[api] listener de sesión falló:', err);
    }
  }
}

export function onAuthStateChange(listener: AuthListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Construye la sesión a partir de la respuesta de `/auth/login` o
 * `/auth/refresh`, que devuelven `{ accessToken, refreshToken, expiresIn }`.
 */
export function sessionFromTokens(
  payload: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    user?: SessionUser;
  },
  fallbackUser?: SessionUser,
): Session {
  const user = payload.user ?? fallbackUser;
  if (!user) throw new ApiError('Respuesta de login sin usuario.', 500);
  return {
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    // Se renueva un poco antes de tiempo para no perder una carrera con el
    // reloj del servidor.
    expiresAt: Date.now() + Math.max(0, payload.expiresIn - 30) * 1000,
    user,
  };
}

// ──────────────────────────── refresco ────────────────────────────

/** Un solo refresh en vuelo: si diez peticiones caducan a la vez, sólo una
 *  rota el token (rotarlo dos veces invalidaría la sesión). */
let refreshing: Promise<Session | null> | null = null;

async function refreshSession(): Promise<Session | null> {
  if (refreshing) return refreshing;

  const token = current?.refreshToken;
  if (!token) return null;

  refreshing = (async () => {
    try {
      const res = await fetch(`${API_URL}/clients/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: token }),
      });
      if (!res.ok) {
        // El refresh token ya no vale: la sesión se acabó de verdad.
        setSession(null, 'SIGNED_OUT');
        return null;
      }
      const body = await res.json();
      const next = sessionFromTokens(body, current?.user);
      setSession(next, 'TOKEN_REFRESHED');
      return next;
    } catch {
      // Fallo de red: NO se cierra la sesión, se reintentará luego.
      return null;
    } finally {
      refreshing = null;
    }
  })();

  return refreshing;
}

// ───────────────────────────── request ─────────────────────────────

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, unknown>;
  /** Rutas de `/api/public/*`: no se manda Authorization ni se refresca. */
  auth?: boolean;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: Record<string, unknown>): string {
  const url = `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.append(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function parse(res: Response): Promise<unknown> {
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Lanza `ApiError`. Ante un 401 con sesión, intenta refrescar una vez y repite
 * la petición; si el refresco tampoco vale, la sesión se cierra.
 */
export async function request<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, query, auth = true, signal } = options;

  const send = async (token: string | null): Promise<Response> => {
    const headers: Record<string, string> = {};
    const isForm = body instanceof FormData;
    if (body !== undefined && !isForm) {
      headers['Content-Type'] = 'application/json';
    }
    if (token) headers.Authorization = `Bearer ${token}`;

    return fetch(buildUrl(path, query), {
      method,
      headers,
      body:
        body === undefined
          ? undefined
          : isForm
            ? (body as FormData)
            : JSON.stringify(body),
      signal,
    });
  };

  let token: string | null = null;
  if (auth) {
    // Si ya se sabe que caducó, se refresca antes de gastar un 401.
    if (current && current.expiresAt <= Date.now()) await refreshSession();
    token = current?.accessToken ?? null;
  }

  let res: Response;
  try {
    res = await send(token);
  } catch (err) {
    throw new ApiError(
      'No se pudo conectar con el servidor. Revisa tu conexión.',
      0,
      'NETWORK',
      err,
    );
  }

  if (res.status === 401 && auth && current) {
    const next = await refreshSession();
    if (next) {
      try {
        res = await send(next.accessToken);
      } catch (err) {
        throw new ApiError('No se pudo conectar con el servidor.', 0, 'NETWORK', err);
      }
    }
  }

  const payload = await parse(res);

  if (!res.ok) {
    const info = (payload ?? {}) as {
      message?: string | string[];
      code?: string;
    };
    const message = Array.isArray(info.message)
      ? info.message.join(' ')
      : info.message || `Error ${res.status}`;
    throw new ApiError(message, res.status, info.code || 'HTTP_ERROR', payload);
  }

  return payload as T;
}

/** Igual que `request`, pero en el convenio `{ data, error }` que ya usaban
 *  todas las pantallas cuando hablaban con Supabase. */
export async function settle<T>(
  run: () => Promise<T>,
): Promise<{ data: T | null; error: ApiError | null }> {
  try {
    return { data: await run(), error: null };
  } catch (err) {
    const error =
      err instanceof ApiError
        ? err
        : new ApiError(
            err instanceof Error ? err.message : 'Error desconocido',
            0,
            'UNKNOWN',
            err,
          );
    return { data: null, error };
  }
}
