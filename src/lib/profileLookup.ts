/**
 * Búsqueda de perfiles por la dirección (username) que trae el enlace.
 *
 * ⚠️ POR QUÉ EXISTE. Hasta ahora el perfil se buscaba con `.eq('username', ruta)`,
 * es decir, IGUALDAD EXACTA: mayúsculas, espacios, tildes y todo. Cualquier enlace
 * que llegara con la más mínima diferencia respecto a lo guardado mostraba
 * «Perfil no encontrado» aunque el perfil existiera y estuviera activo:
 *
 *   · El Super Admin, al crear un cliente, MOSTRABA la dirección sin espacios
 *     (`/joseenrique`) pero GUARDABA el username con espacios (`jose enrique`):
 *     la dirección que se le comunicaba al cliente no abría.
 *   · La pestaña Cuenta deja escribir cualquier cosa: «JuniorDev», «Mi Negocio»,
 *     «Petrick González»… y quien escribe el enlace a mano, o lo reenvía por una
 *     app que parte en el primer espacio o pasa a minúsculas, lo rompe.
 *   · Un fallo de red al consultar se mostraba igual que «no existe».
 *
 * Esta librería hace la búsqueda en dos pasos: primero la exacta de siempre (los
 * perfiles que ya funcionaban no cambian en nada) y, sólo si no hay resultado,
 * una tolerante que compara sin mayúsculas, tildes ni separadores.
 */

/** Direcciones que ya son rutas o archivos de la app: un perfil no puede llamarse así. */
export const RESERVED_USERNAMES = new Set([
  'auth', 'dashboard', 'admin', 'api', 'assets', 'p', 'privacidad', 'login',
  'sw.js', 'manifest.json', 'index.html', 'favicon.ico', 'robots.txt',
]);

/**
 * Clave de comparación: sin tildes, sin mayúsculas y sin ningún separador ni
 * signo (sólo letras y números). «Mi-Negocio», «mi negocio», «MiNegocio» y
 * «mí.negocio» dan la misma clave: `minegocio`.
 */
export const usernameKey = (s: string): string =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * Escribiendo (campo de texto): lo deja con forma de dirección sin estorbar.
 * Espacios → guion, sin tildes, minúsculas, y se descarta lo que rompe una URL.
 * NO recorta guiones de los extremos: si lo hiciera, el guion que sale al pulsar
 * la barra espaciadora desaparecería antes de poder escribir la palabra siguiente.
 */
export const slugifyUsernameLive = (s: string): string =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\s/]+/g, '-') // «marcelo/mariapaz» son dos nombres, no dos tramos de la dirección
    .replace(/[^a-z0-9._-]+/g, '')
    .replace(/-{2,}/g, '-');

/** Versión definitiva, la que se guarda: igual que la anterior pero sin guiones ni puntos en los extremos. */
export const normalizeUsername = (s: string): string =>
  slugifyUsernameLive(s).replace(/^[-._]+|[-._]+$/g, '');

/** `null` si la dirección es válida; si no, el motivo (para mostrarlo al usuario). */
export const usernameProblem = (clean: string): 'empty' | 'short' | 'reserved' | null => {
  if (!clean) return 'empty';
  if (usernameKey(clean).length < 3) return 'short';
  if (RESERVED_USERNAMES.has(clean)) return 'reserved';
  return null;
};

/**
 * ¿Ya hay OTRO perfil con esa dirección (sin distinguir mayúsculas)? Se pregunta antes de crear o
 * renombrar: la base puede aceptar «JuniorDev» y «juniordev» como distintos, pero un visitante no.
 * Ante un fallo de la consulta responde `false`: la base sigue siendo la que tiene la última palabra.
 */
export async function usernameTaken(
  client: { from: (t: string) => any },
  clean: string,
  myId: string,
): Promise<boolean> {
  try {
    const exacto = clean.replace(/[\\%_]/g, (m) => '\\' + m); // en LIKE, % y _ son comodines
    const { data, error } = await client.from('profiles').select('id').ilike('username', exacto).neq('id', myId).limit(1);
    return !error && !!(data && data.length > 0);
  } catch {
    return false;
  }
}

/** Ruta pública de un username, con cada trozo escapado (un `?` o un `#` cortarían la dirección). */
export const profilePath = (username: string): string =>
  '/' + String(username ?? '').split('/').map(encodeURIComponent).join('/');

// ─── Búsqueda ─────────────────────────────────────────────────────────────────

// Letras que pueden venir con tilde/diéresis/virgulilla en la base: en el patrón
// de búsqueda valen «cualquier carácter», y la comparación fina se hace después.
const ACCENT_CAPABLE = /[aeiouync]/;

/**
 * Patrón LIKE tosco que deja pasar a todo username que contenga, EN ESE ORDEN,
 * las letras de la clave. Es un filtro de red, no el criterio final: el criterio
 * final es `usernameKey(candidato) === clave`, que se comprueba aquí en JavaScript.
 * Sirve para que la consulta devuelva decenas de filas y no toda la tabla.
 */
const likePattern = (key: string): string => {
  const parts = Array.from(key).map((c) =>
    /[a-z0-9]/.test(c) && !ACCENT_CAPABLE.test(c) ? c : '_'
  );
  return `%${parts.join('%')}%`;
};

interface Candidate { id: string; username: string; displayName?: string | null; is_active?: boolean | null; created_at?: string | null }

/** Entre varios candidatos con la misma clave, el que más se parece a lo que se pidió. */
const elegir = (cands: Candidate[], pedido: string): Candidate => {
  const p = pedido.trim().toLowerCase();
  return [...cands].sort((a, b) => {
    const act = Number(b.is_active !== false) - Number(a.is_active !== false);
    if (act) return act;
    const exa = Number(b.username.trim().toLowerCase() === p) - Number(a.username.trim().toLowerCase() === p);
    if (exa) return exa;
    return String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')); // el más antiguo
  })[0];
};

/**
 * Dirección LIMPIA para compartir un perfil cuyo username es frágil (espacios, tildes, mayúsculas).
 *
 * «Fundación Arupo» se comparte como `/Fundaci%C3%B3n%20Arupo`, y ese enlace se rompe en cuanto una
 * app lo corta en el espacio o lo vuelve a codificar. `/fundacion-arupo` no tiene nada que romper, y
 * la búsqueda tolerante lo resuelve al mismo perfil.
 *
 * Sólo se devuelve si NINGÚN otro perfil comparte esa clave (si «jose enrique» y «jose-enrique»
 * existieran los dos, `/jose-enrique` apuntaría al equivocado). `null` = compartir la dirección tal cual.
 */
export async function shareSlugFor(
  client: { from: (t: string) => any },
  username: string,
  myId: string,
): Promise<string | null> {
  try {
    const slug = normalizeUsername(username);
    if (!slug || slug === username || usernameProblem(slug)) return null;
    const key = usernameKey(username);
    if (usernameKey(slug) !== key) return null; // la limpieza cambió letras: no sirve para encontrarlo
    const { data, error } = await client.from('profiles').select('id, username').ilike('username', likePattern(key)).limit(500);
    if (error || !data) return null;
    const mismos = (data as Candidate[]).filter((c) => typeof c?.username === 'string' && usernameKey(c.username) === key);
    return mismos.length === 1 && mismos[0].id === myId ? slug : null;
  } catch {
    return null;
  }
}

export interface ProfileSuggestion { username: string; displayName: string | null }

export interface ProfileLookupResult {
  /** Fila completa del perfil, o `null` si de verdad no existe. */
  data: any | null;
  /** Hubo un FALLO al consultar (red, servidor): NO significa que el perfil no exista. */
  error: unknown | null;
  /**
   * `exact` = coincidió tal cual; `loose` = hizo falta la búsqueda tolerante;
   * `prefix` = el enlace llegó CORTADO (p. ej. `/Fundación` en vez de `/Fundación Arupo`)
   * y sólo un perfil activo empieza así.
   */
  via: 'exact' | 'loose' | 'prefix' | null;
  /** Si no hubo coincidencia pero hay perfiles parecidos, hasta 6 para ofrecérselos al visitante. */
  suggestions?: ProfileSuggestion[];
}

/**
 * Convierte la ruta del navegador (`/Fundaci%C3%B3n%20Arupo`) en el texto a buscar.
 *
 * Decodifica VARIAS veces, no una: algunas apps (mensajería, redes) vuelven a codificar el
 * enlace al reenviarlo y `%20` llega como `%2520`. Con una sola pasada la clave quedaba como
 * «Fundaci%C3%B3n%20Arupo» y no coincidía con nada. Es seguro porque un username nunca lleva `%`.
 */
export const decodeProfileKey = (pathname: string, fallback = ''): string => {
  let s = String(pathname ?? '').replace(/^\/+/, '').replace(/\/+$/, '');
  if (!s) return fallback;
  for (let i = 0; i < 3 && /%[0-9a-f]{2}/i.test(s); i++) {
    try {
      const d = decodeURIComponent(s);
      if (d === s) break;
      s = d;
    } catch {
      break; // porcentaje mal formado: se busca tal cual antes que reventar
    }
  }
  return s;
};

/**
 * Busca el perfil de `raw`. Nunca lanza: devuelve `{ data, error }`.
 * `error` y `data: null` a la vez = falló la consulta, no hay certeza de nada.
 * `error: null` y `data: null` = se consultó bien y no existe.
 */
export async function findProfileByUsername(
  // Tipado flojo a propósito: sólo se usa `.from()`, y así se puede probar con un cliente falso.
  client: { from: (t: string) => any },
  raw: string,
): Promise<ProfileLookupResult> {
  const pedido = String(raw ?? '');
  if (!pedido.trim()) return { data: null, error: null, via: null };

  try {
    // 1) Exacta: lo que ya funcionaba sigue funcionando igual.
    const exacta = await client.from('profiles').select('*').eq('username', pedido).limit(1);
    if (exacta.error) return { data: null, error: exacta.error, via: null };
    if (exacta.data && exacta.data.length > 0) return { data: exacta.data[0], error: null, via: 'exact' };

    // 2) Tolerante: sin mayúsculas, tildes ni separadores.
    const key = usernameKey(pedido);
    if (key.length < 3) return { data: null, error: null, via: null };

    const cand = await client
      .from('profiles')
      .select('id, username, displayName, is_active, created_at')
      .ilike('username', likePattern(key))
      .limit(500);
    if (cand.error) return { data: null, error: cand.error, via: null };

    const todos: Candidate[] = (cand.data || []).filter((c: Candidate) => typeof c?.username === 'string');
    const iguales = todos.filter((c) => usernameKey(c.username) === key);

    // Trae la fila completa del candidato elegido.
    const completo = async (c: Candidate, via: 'loose' | 'prefix'): Promise<ProfileLookupResult> => {
      const full = await client.from('profiles').select('*').eq('id', c.id).limit(1);
      if (full.error) return { data: null, error: full.error, via: null };
      if (full.data && full.data.length > 0) return { data: full.data[0], error: null, via };
      return { data: null, error: null, via: null };
    };

    if (iguales.length > 0) return completo(elegir(iguales, pedido), 'loose');

    // 3) Enlace CORTADO. Los nombres con espacios son frágiles: muchas apps parten el enlace en el
    // primer espacio y el visitante recibe `/Fundación` en vez de `/Fundación Arupo`. Si un solo
    // perfil ACTIVO empieza así, es ese. Si hay varios, no se adivina: se le ofrecen al visitante.
    if (key.length >= 4) {
      const activos = todos.filter((c) => c.is_active !== false);
      const empiezan = activos.filter((c) => usernameKey(c.username).startsWith(key));
      if (empiezan.length === 1) return completo(empiezan[0], 'prefix');

      const parecidos = (empiezan.length > 1 ? empiezan : activos.filter((c) => usernameKey(c.username).includes(key)))
        .slice(0, 6)
        .map((c) => ({ username: c.username, displayName: c.displayName ?? null }));
      return { data: null, error: null, via: null, suggestions: parecidos };
    }
    return { data: null, error: null, via: null };
  } catch (error) {
    return { data: null, error, via: null };
  }
}
