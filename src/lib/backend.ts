/**
 * Capa de datos de Connexo contra el backend propio (`backend/`, NestJS).
 *
 * Sustituye a `@supabase/supabase-js`. Mantiene a propósito la forma de la API
 * anterior —`db.from(tabla).select().eq(...)`, `{ data, error }`, `db.rpc(...)`—
 * porque las ~200 llamadas repartidas por las pantallas ya estaban escritas así:
 * migrar el transporte sin reescribir cada pantalla mantiene el cambio revisable.
 *
 * Diferencias que importan respecto de Supabase:
 *
 *  - **El dueño lo pone el token, no el filtro.** Antes la pantalla mandaba
 *    `.eq('user_id', user.id)` y confiaba en RLS. Aquí cada ruta `/clients/me/*`
 *    ya está acotada al usuario del JWT, así que esos filtros se ignoran: no se
 *    puede pedir lo de otro cambiando el argumento.
 *  - **Nada de SQL en el navegador.** Una tabla sin ruta equivalente lanza un
 *    error explícito en vez de fallar en silencio (ver `UNMAPPED`).
 *  - **Los filtros que el backend no entiende se aplican aquí**, sobre la
 *    colección ya acotada al dueño, para que `.eq('status', …)` siga
 *    significando lo mismo que antes.
 */

import {
  ApiError,
  getSession,
  onAuthStateChange as onAuthStateChangeRaw,
  request,
  settle,
  sessionFromTokens,
  setSession,
  type Session,
  type SessionUser,
} from './api';
import { subscribe, type RealtimeStatus, type Subscription } from './realtime';

// ───────────────────────── mapa de recursos ─────────────────────────

interface Collection {
  /** Ruta de la colección del dueño autenticado. */
  path: string;
  /** Nombre del recurso en los eventos de realtime (`{resource}.{op}`). */
  resource: string;
}

/** Tabla de Supabase → ruta REST del backend. */
const COLLECTIONS: Record<string, Collection> = {
  links: { path: '/clients/me/links', resource: 'links' },
  notifications: { path: '/clients/me/notifications', resource: 'notifications' },
  chats: { path: '/clients/me/chats', resource: 'chats' },
  leads: { path: '/clients/me/leads', resource: 'leads' },
  pending_testimonials: {
    path: '/clients/me/testimonials',
    resource: 'testimonials',
  },
  member_plans: { path: '/clients/me/member-plans', resource: 'member-plans' },

  barber_clients: { path: '/clients/me/barber/clients', resource: 'barber.clients' },
  barber_staff: { path: '/clients/me/barber/staff', resource: 'barber.staff' },
  barber_reservations: {
    path: '/clients/me/barber/reservations',
    resource: 'barber.reservations',
  },

  ecom_clients: { path: '/clients/me/ecom/clients', resource: 'ecom.clients' },
  ecom_staff: { path: '/clients/me/ecom/staff', resource: 'ecom.staff' },
  ecom_orders: { path: '/clients/me/ecom/orders', resource: 'ecom.orders' },
  ecom_appointments: {
    path: '/clients/me/ecom/appointments',
    resource: 'ecom.appointments',
  },

  gastro_clients: { path: '/clients/me/gastro/clients', resource: 'gastro.clients' },
  gastro_inventory: {
    path: '/clients/me/gastro/inventory',
    resource: 'gastro.inventory',
  },
  gastro_purchases: {
    path: '/clients/me/gastro/purchases',
    resource: 'gastro.purchases',
  },
  gastro_reservations: {
    path: '/clients/me/gastro/reservations',
    resource: 'gastro.reservations',
  },

  realty_agents: { path: '/clients/me/realty/agents', resource: 'realty.agents' },
  realty_clients: { path: '/clients/me/realty/clients', resource: 'realty.clients' },
  realty_leads: { path: '/clients/me/realty/leads', resource: 'realty.leads' },
  realty_properties: {
    path: '/clients/me/realty/properties',
    resource: 'realty.properties',
  },

  stage_fans: { path: '/clients/me/stage/fans', resource: 'stage.fans' },

  sublima_clients: {
    path: '/clients/me/sublima/clients',
    resource: 'sublima.clients',
  },
  sublima_orders: { path: '/clients/me/sublima/orders', resource: 'sublima.orders' },
  sublima_products: {
    path: '/clients/me/sublima/products',
    resource: 'sublima.products',
  },
};

/**
 * Tablas que el backend todavía no expone para el dueño.
 *
 * `orders` son los pedidos de restaurante: el cliente final sí puede crearlos
 * (`POST /api/public/profiles/:ownerId/gastro/orders`) pero no existe la ruta
 * `/api/clients/me/gastro/orders` para que el dueño los liste o cambie su
 * estado. Falla aquí, ruidosamente, en vez de devolver una lista vacía que
 * parecería "no hay pedidos".
 */
const UNMAPPED: Record<string, string> = {
  orders:
    'El backend aún no expone los pedidos de gastronomía al dueño: falta ' +
    '/api/clients/me/gastro/orders (GET, PATCH, DELETE). Hasta que exista, ' +
    'OrdersTab y la parte de pedidos de AnalyticsTab no tienen de dónde leer.',
};

/**
 * Lo ultimo que devolvio `GET /public/profiles/:handle`, indexado por id y por
 * username.
 *
 * Las paginas publicas piden primero el perfil y despues sus colecciones
 * (`links`, ...) con `.eq('userId', ownerId)`. Esas colecciones ya vienen
 * dentro del perfil publico, asi que se sirven de aqui en vez de pedir
 * `/clients/me/*`, que para un visitante anonimo es un 401.
 */
const publicProfiles = new Map<string, Record<string, unknown>>();

/**
 * Colecciones que una pagina publica necesita y el backend todavia no expone
 * sin sesion. Igual que `UNMAPPED`: mejor un error con nombre que una lista
 * vacia, que se lee como "este negocio no tiene personal".
 */
const NO_PUBLIC_ROUTE: Record<string, string> = {
  barber_staff:
    'Falta GET /api/public/profiles/:ownerId/barber/staff: el perfil publico ' +
    'de barberia no puede listar su equipo (la ruta de disponibilidad exige ' +
    'ya un staffId concreto).',
  ecom_staff:
    'Falta GET /api/public/profiles/:ownerId/ecom/staff: el perfil publico de ' +
    'e-commerce no puede listar su equipo para agendar.',
  sublima_products:
    'Falta GET /api/public/profiles/:ownerId/sublima/products: el catalogo ' +
    'publico de Sublima no tiene de donde leer.',
};

/**
 * Columnas con las que las pantallas decían "esto es mío". El token ya lo dice,
 * así que se descartan como filtro.
 */
const OWNER_KEYS = new Set([
  'user_id',
  'userId',
  'owner_id',
  'ownerId',
  'profile_id',
  'profileId',
  'restaurant_id',
  'restaurantId',
  'seller_id',
  'sellerId',
  'barber_id',
  'barberId',
  'agency_id',
  'agencyId',
  'factory_id',
  'factoryId',
]);

// ──────────────────────────── utilidades ────────────────────────────

const camel = (key: string): string =>
  key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

const snake = (key: string): string =>
  key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** Lee una columna tolerando snake_case ↔ camelCase: las pantallas piden
 *  `created_at` y Prisma devuelve `createdAt`. */
function pick(row: Record<string, unknown>, key: string): unknown {
  if (row == null) return undefined;
  if (key in row) return row[key];
  const c = camel(key);
  if (c in row) return row[c];
  const s = snake(key);
  if (s in row) return row[s];
  return undefined;
}

/** `{ p_total_price: 1 }` → `{ totalPrice: 1 }`, que es como se llaman los
 *  campos en los DTO del backend. */
function toDto(args: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args ?? {})) {
    out[camel(key.replace(/^p_/, ''))] = value;
  }
  return out;
}

function currentUserId(): string | null {
  return getSession()?.user.id ?? null;
}

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

// ──────────────────────── constructor de consultas ────────────────────────

type Filter =
  | { op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'is'; column: string; value: unknown }
  | { op: 'in' | 'contains'; column: string; value: unknown[] }
  | { op: 'like' | 'ilike'; column: string; value: string };

type Mode = 'select' | 'insert' | 'update' | 'upsert' | 'delete';

export interface Result<T = any> {
  data: T;
  error: ApiError | null;
  count?: number | null;
}

class QueryBuilder<T = any> implements PromiseLike<Result<T>> {
  private mode: Mode = 'select';
  private readonly filters: Filter[] = [];
  private payload: unknown = undefined;
  private orderBy: { column: string; ascending: boolean }[] = [];
  private limitTo: number | null = null;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private wantsSingle = false;
  private wantsMaybeSingle = false;
  private returnsRows = true;
  private wantsCount = false;
  private headOnly = false;

  constructor(private readonly table: string) {}

  // — selección / escritura —

  select(_columns?: string, options?: { count?: string; head?: boolean }): this {
    // Las columnas se ignoran: el backend ya devuelve una lista blanca fija por
    // ruta (es justamente lo que arregla el `select('*')` público de antes).
    if (this.mode === 'select') this.mode = 'select';
    this.returnsRows = true;
    if (options?.count) this.wantsCount = true;
    if (options?.head) this.headOnly = true;
    return this;
  }

  insert(values: unknown): this {
    this.mode = 'insert';
    this.payload = values;
    this.returnsRows = false;
    return this;
  }

  upsert(values: unknown, _options?: unknown): this {
    this.mode = 'upsert';
    this.payload = values;
    this.returnsRows = false;
    return this;
  }

  update(values: unknown): this {
    this.mode = 'update';
    this.payload = values;
    this.returnsRows = false;
    return this;
  }

  delete(): this {
    this.mode = 'delete';
    this.returnsRows = false;
    return this;
  }

  // — filtros —

  eq(column: string, value: unknown): this {
    this.filters.push({ op: 'eq', column, value });
    return this;
  }
  neq(column: string, value: unknown): this {
    this.filters.push({ op: 'neq', column, value });
    return this;
  }
  gt(column: string, value: unknown): this {
    this.filters.push({ op: 'gt', column, value });
    return this;
  }
  gte(column: string, value: unknown): this {
    this.filters.push({ op: 'gte', column, value });
    return this;
  }
  lt(column: string, value: unknown): this {
    this.filters.push({ op: 'lt', column, value });
    return this;
  }
  lte(column: string, value: unknown): this {
    this.filters.push({ op: 'lte', column, value });
    return this;
  }
  is(column: string, value: unknown): this {
    this.filters.push({ op: 'is', column, value });
    return this;
  }
  in(column: string, value: unknown[]): this {
    this.filters.push({ op: 'in', column, value: value ?? [] });
    return this;
  }
  /** La columna (un array) contiene todos esos valores. */
  contains(column: string, value: unknown[]): this {
    this.filters.push({ op: 'contains', column, value: value ?? [] });
    return this;
  }
  like(column: string, value: string): this {
    this.filters.push({ op: 'like', column, value });
    return this;
  }
  ilike(column: string, value: string): this {
    this.filters.push({ op: 'ilike', column, value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.orderBy.push({ column, ascending: options?.ascending !== false });
    return this;
  }
  limit(n: number): this {
    this.limitTo = n;
    return this;
  }
  range(from: number, to: number): this {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }
  single(): this {
    this.wantsSingle = true;
    return this;
  }
  maybeSingle(): this {
    this.wantsMaybeSingle = true;
    return this;
  }

  // — ejecución —

  then<R1 = Result<T>, R2 = never>(
    onfulfilled?: ((value: Result<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.run().then(onfulfilled, onrejected);
  }

  private async run(): Promise<Result<T>> {
    const { data, error } = await settle(() => this.execute());
    if (error) {
      // Se conserva el convenio de Supabase: nunca lanza, devuelve `error`.
      return { data: (this.wantsSingle || this.wantsMaybeSingle ? null : []) as T, error };
    }
    return { data: data as T, error: null, count: this.lastCount };
  }

  private lastCount: number | null = null;

  /** Valor del filtro `eq` sobre `column`, si existe. */
  private eqValue(column: string): unknown {
    const found = this.filters.find(
      (f) => f.op === 'eq' && (f.column === column || camel(f.column) === camel(column)),
    );
    return found?.value;
  }

  /** Filtros que aún significan algo una vez el token fija al dueño. */
  private meaningfulFilters(): Filter[] {
    return this.filters.filter((f) => !OWNER_KEYS.has(f.column));
  }

  /** El id de dueno que traia el filtro, antes de descartarlo. */
  private ownerFilterValue(): string | null {
    for (const f of this.filters) {
      if (OWNER_KEYS.has(f.column) && typeof f.value === 'string' && f.value) {
        return f.value;
      }
    }
    return null;
  }

  /**
   * Si esto se esta leyendo desde una pagina publica, el id del dueno; si no,
   * `null`.
   *
   * Hay dos casos: un visitante sin sesion, y un usuario con sesion que mira
   * el perfil de otro. En ambos hay que ir por `/public/*`.
   */
  private publicOwnerId(): string | null {
    const owner = this.ownerFilterValue();
    const me = currentUserId();
    if (me === null) return owner;
    if (owner && owner !== me) return owner;
    return null;
  }

  /** Perfil publico, de la cache o pidiendolo. */
  private async publicProfile(ownerId: string): Promise<Record<string, unknown>> {
    const cached = publicProfiles.get(ownerId);
    if (cached) return cached;
    const row = await request<Record<string, unknown>>(
      `/public/profiles/${encodeURIComponent(ownerId)}`,
      { auth: false },
    );
    rememberPublicProfile(row);
    return row;
  }

  /** Colecciones de un perfil ajeno, por rutas publicas. */
  private async executePublicCollection(ownerId: string): Promise<unknown> {
    const missing = NO_PUBLIC_ROUTE[this.table];
    if (missing) throw new ApiError(missing, 501, 'NOT_MIGRATED');

    if (this.table === 'links') {
      const profile = await this.publicProfile(ownerId);
      const rows = normalizeList(profile.links ?? []);
      return this.shape(this.applyFilters(rows));
    }

    if (this.table === 'realty_properties') {
      const rows = normalizeList(
        await request(
          `/public/profiles/${encodeURIComponent(ownerId)}/realty/properties`,
          { auth: false },
        ),
      );
      return this.shape(this.applyFilters(rows));
    }

    throw new ApiError(
      `"${this.table}" no se puede leer desde un perfil publico: no hay ruta en /api/public.`,
      501,
      'NOT_MIGRATED',
    );
  }

  private async execute(): Promise<unknown> {
    const blocked = UNMAPPED[this.table];
    if (blocked) throw new ApiError(blocked, 501, 'NOT_MIGRATED');

    if (this.table === 'profiles') return this.executeProfiles();
    if (this.table === 'subscriptions') return this.executeSubscriptions();
    if (this.table === 'messages') return this.executeMessages();
    if (this.table === 'push_subscriptions') return this.executePushDevices();

    const collection = COLLECTIONS[this.table];
    if (!collection) {
      throw new ApiError(
        `La tabla "${this.table}" no tiene ruta equivalente en el backend.`,
        501,
        'NOT_MIGRATED',
      );
    }

    // Leer lo de otro (o sin sesion) va por /public, nunca por /clients/me.
    const publicOwner = this.publicOwnerId();
    if (this.mode === 'select' && publicOwner) {
      return this.executePublicCollection(publicOwner);
    }

    return this.executeCollection(collection.path);
  }

  /** CRUD normal sobre `/clients/me/...`. */
  private async executeCollection(path: string): Promise<unknown> {
    const id = this.eqValue('id');

    switch (this.mode) {
      case 'insert':
      case 'upsert': {
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
        const created = [];
        for (const row of rows) {
          created.push(await request(path, { method: 'POST', body: strip(row) }));
        }
        return this.shape(created);
      }

      case 'update': {
        const targets = id !== undefined ? [id] : await this.idsMatching(path);
        const updated = [];
        for (const target of targets) {
          updated.push(
            await request(`${path}/${encodeURIComponent(String(target))}`, {
              method: 'PATCH',
              body: strip(this.payload),
            }),
          );
        }
        return this.shape(updated);
      }

      case 'delete': {
        const targets = id !== undefined ? [id] : await this.idsMatching(path);
        for (const target of targets) {
          await request(`${path}/${encodeURIComponent(String(target))}`, {
            method: 'DELETE',
          });
        }
        return this.shape([]);
      }

      default: {
        // Una fila concreta se pide directa… salvo que ese recurso no tenga
        // ruta `GET /:id` (p. ej. `links`, que sólo expone la colección). En
        // ese caso se cae a la lista y se filtra aquí, en vez de dar un 404
        // que la pantalla leería como "no existe".
        if (id !== undefined && (this.wantsSingle || this.wantsMaybeSingle)) {
          try {
            const row = await request(`${path}/${encodeURIComponent(String(id))}`);
            return this.shape([row as Record<string, unknown>]);
          } catch (err) {
            const status = err instanceof ApiError ? err.status : 0;
            if (status !== 404 && status !== 405) throw err;
          }
        }
        const rows = await this.fetchCollection(path);
        return this.shape(rows);
      }
    }
  }

  private async fetchCollection(path: string): Promise<Record<string, unknown>[]> {
    const body = await request<unknown>(path, { query: this.serverQuery() });
    const rows = normalizeList(body);
    this.lastCount = rows.length;
    return this.applyFilters(rows);
  }

  /** Lo que el backend sí entiende como query string. */
  private serverQuery(): Record<string, unknown> {
    const query: Record<string, unknown> = {};
    if (this.limitTo != null) query.limit = this.limitTo;
    return query;
  }

  private async idsMatching(path: string): Promise<unknown[]> {
    const rows = await this.fetchCollection(path);
    return rows.map((row) => row.id).filter((id) => id !== undefined);
  }

  /** Filtros, orden y recorte, ya sobre datos del dueño. */
  private applyFilters(
    rows: Record<string, unknown>[],
  ): Record<string, unknown>[] {
    let out = rows;

    for (const filter of this.meaningfulFilters()) {
      out = out.filter((row) => {
        const actual = pick(row, filter.column);
        switch (filter.op) {
          case 'eq':
            return looseEq(actual, filter.value);
          case 'neq':
            return !looseEq(actual, filter.value);
          case 'is':
            return filter.value === null ? actual == null : actual === filter.value;
          case 'in':
            return filter.value.some((v) => looseEq(actual, v));
          case 'contains': {
            const list = Array.isArray(actual) ? actual : [];
            return filter.value.every((v) => list.some((a) => looseEq(a, v)));
          }
          case 'gt':
            return compare(actual, filter.value) > 0;
          case 'gte':
            return compare(actual, filter.value) >= 0;
          case 'lt':
            return compare(actual, filter.value) < 0;
          case 'lte':
            return compare(actual, filter.value) <= 0;
          case 'like':
          case 'ilike': {
            const pattern = String(filter.value).replace(/%/g, '');
            return String(actual ?? '')
              .toLowerCase()
              .includes(pattern.toLowerCase());
          }
          default:
            return true;
        }
      });
    }

    for (const { column, ascending } of [...this.orderBy].reverse()) {
      out = [...out].sort((a, b) => {
        const diff = compare(pick(a, column), pick(b, column));
        return ascending ? diff : -diff;
      });
    }

    if (this.rangeFrom != null && this.rangeTo != null) {
      out = out.slice(this.rangeFrom, this.rangeTo + 1);
    }
    if (this.limitTo != null) out = out.slice(0, this.limitTo);

    return out;
  }

  /** Da a la respuesta la forma que espera quien llamó. */
  private shape(rows: unknown[]): unknown {
    if (this.wantsSingle || this.wantsMaybeSingle) {
      const first = rows[0] ?? null;
      if (first == null && this.wantsSingle && !this.wantsMaybeSingle) {
        throw new ApiError('No se encontró el registro.', 404, 'NOT_FOUND');
      }
      return first;
    }
    if (this.headOnly) return [];
    return rows;
  }

  // — tablas con forma propia —

  /** `profiles` es a la vez "mi perfil", "un perfil público" y, para el
   *  superadmin, "todos los usuarios". */
  private async executeProfiles(): Promise<unknown> {
    const me = currentUserId();
    const id = this.eqValue('id');
    const username = this.eqValue('username');

    if (this.mode === 'update') {
      if (id !== undefined && me !== null && id === me) {
        return this.shape([
          (await request('/clients/me/profile', {
            method: 'PATCH',
            body: strip(this.payload),
          })) as Record<string, unknown>,
        ]);
      }
      throw new ApiError(
        'Editar el perfil de otro usuario ya no se hace escribiendo en `profiles`: ' +
          'usa las rutas de administración (/clients/admin/users/:id/plan, /active, /trial).',
        501,
        'NOT_MIGRATED',
      );
    }

    if (this.mode === 'insert') {
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
      const created = [];
      for (const row of rows) {
        created.push(
          await request('/clients/admin/users', { method: 'POST', body: strip(row) }),
        );
      }
      return this.shape(created);
    }

    if (this.mode === 'delete') {
      if (id === undefined) {
        throw new ApiError('Borrar perfiles requiere un id.', 400, 'VALIDATION');
      }
      await request(`/clients/admin/users/${encodeURIComponent(String(id))}`, {
        method: 'DELETE',
      });
      return this.shape([]);
    }

    // Lectura.
    if (username !== undefined) {
      const row = await request<Record<string, unknown>>(
        `/public/profiles/${encodeURIComponent(String(username))}`,
        { auth: false },
      );
      rememberPublicProfile(row);
      return this.shape([row]);
    }

    if (id !== undefined) {
      if (me !== null && id === me) {
        const row = await request<Record<string, unknown>>('/clients/me/profile');
        return this.shape([row]);
      }
      const row = await request<Record<string, unknown>>(
        `/public/profiles/${encodeURIComponent(String(id))}`,
        { auth: false },
      );
      rememberPublicProfile(row);
      return this.shape([row]);
    }

    // Sin sesion no hay listado que valga: el del superadmin exige token.
    if (currentUserId() === null) {
      throw new ApiError(
        'Listar perfiles requiere sesion de administrador.',
        401,
        'UNAUTHORIZED',
      );
    }

    // Sin filtro por identidad: es el listado del superadmin.
    const body = await request<{ items?: unknown[]; total?: number }>(
      '/clients/admin/users',
      { query: { pageSize: this.limitTo ?? 200 } },
    );
    const rows = normalizeList(body?.items ?? body);
    this.lastCount = body?.total ?? rows.length;
    return this.shape(this.applyFilters(rows));
  }

  /** `subscriptions`: la propia va en `/clients/me/subscription`; el listado
   *  del superadmin viene incrustado en cada usuario. */
  private async executeSubscriptions(): Promise<unknown> {
    if (this.mode !== 'select') {
      throw new ApiError(
        'Las suscripciones se cambian por /clients/admin/users/:id/plan, /trial ' +
          'o /subscription/convert, no escribiendo en la tabla.',
        501,
        'NOT_MIGRATED',
      );
    }

    const me = currentUserId();
    const userId = this.eqValue('user_id') ?? this.eqValue('userId');

    // Un visitante anonimo consultaba esto solo para ver si el trial del dueno
    // habia caducado. Ya no hace falta -ni se puede- preguntarlo:
    // `/public/profiles/:handle` solo devuelve perfiles activos, asi que si la
    // pagina llego hasta aqui el perfil esta vigente. Sin fila, la pantalla se
    // salta esa comprobacion.
    if (me === null) return this.shape([]);

    if (userId === undefined || (userId === me)) {
      const row = await request<Record<string, unknown> | null>(
        '/clients/me/subscription',
      );
      return this.shape(row ? [row] : []);
    }

    const body = await request<{ items?: Record<string, unknown>[] }>(
      '/clients/admin/users',
      { query: { pageSize: 200 } },
    );
    const rows = normalizeList(body?.items ?? body)
      .map((user): Record<string, unknown> | null => {
        const sub = user.subscription as Record<string, unknown> | null;
        return sub ? { ...sub, user_id: user.id, userId: user.id } : null;
      })
      .filter((row): row is Record<string, unknown> => row !== null);
    return this.shape(this.applyFilters(rows));
  }

  /** `messages` cuelga de un chat: `/clients/me/chats/:id/messages`. */
  private async executeMessages(): Promise<unknown> {
    const chatId =
      this.eqValue('chat_id') ??
      this.eqValue('chatId') ??
      (this.payload as Record<string, unknown> | undefined)?.chat_id ??
      (this.payload as Record<string, unknown> | undefined)?.chatId;

    if (!chatId) {
      throw new ApiError(
        'Los mensajes se piden por chat: falta chat_id.',
        400,
        'VALIDATION',
      );
    }

    const path = `/clients/me/chats/${encodeURIComponent(String(chatId))}/messages`;

    if (this.mode === 'insert') {
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
      const created = [];
      for (const row of rows) {
        const body = strip(row) as Record<string, unknown>;
        delete body.chat_id;
        delete body.chatId;
        created.push(await request(path, { method: 'POST', body }));
      }
      return this.shape(created);
    }

    if (this.mode !== 'select') {
      throw new ApiError(
        'Sólo se pueden leer y crear mensajes.',
        501,
        'NOT_MIGRATED',
      );
    }

    return this.shape(await this.fetchCollection(path));
  }

  /** `push_subscriptions` se maneja por las rutas de dispositivos. */
  private async executePushDevices(): Promise<unknown> {
    if (this.mode === 'insert' || this.mode === 'upsert') {
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
      const created = [];
      for (const row of rows) {
        const dto = toDto(row as Record<string, unknown>);
        created.push(
          await request('/clients/me/push/devices/claim', {
            method: 'POST',
            body: {
              endpoint: dto.endpoint,
              p256dh: dto.p256dh,
              auth: dto.auth,
              userAgent: dto.userAgent,
            },
          }),
        );
      }
      return this.shape(created);
    }

    if (this.mode === 'delete') {
      const endpoint = this.eqValue('endpoint');
      if (!endpoint) {
        throw new ApiError('Falta el endpoint del dispositivo.', 400, 'VALIDATION');
      }
      await request('/clients/me/push/devices', {
        method: 'DELETE',
        body: { endpoint },
      });
      return this.shape([]);
    }

    const endpoint = this.eqValue('endpoint');
    const rows = normalizeList(
      await request('/clients/me/push/devices/accounts', {
        query: { endpoint: endpoint ? String(endpoint) : '' },
      }),
    );
    return this.shape(this.applyFilters(rows));
  }
}

function rememberPublicProfile(row: Record<string, unknown> | null): void {
  if (!row) return;
  if (typeof row.id === 'string') publicProfiles.set(row.id, row);
  if (typeof row.username === 'string') publicProfiles.set(row.username, row);
}

function looseEq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

function compare(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const as = String(a);
  const bs = String(b);
  return as < bs ? -1 : as > bs ? 1 : 0;
}

/** Quita las columnas que ahora fija el servidor. */
function strip(row: unknown): unknown {
  if (row == null || typeof row !== 'object') return row;
  const out: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  for (const key of OWNER_KEYS) delete out[key];
  delete out.created_at;
  delete out.createdAt;
  delete out.updated_at;
  delete out.updatedAt;
  return out;
}

function normalizeList(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) return body as Record<string, unknown>[];
  if (body && typeof body === 'object') {
    const maybe = (body as { items?: unknown; data?: unknown }).items ??
      (body as { data?: unknown }).data;
    if (Array.isArray(maybe)) return maybe as Record<string, unknown>[];
    return [body as Record<string, unknown>];
  }
  return [];
}

// ─────────────────────────────── RPC ───────────────────────────────

type RpcArgs = Record<string, unknown>;

/** El id del dueño viaja en la ruta, no en el cuerpo. */
function ownerOf(args: RpcArgs): string {
  for (const key of [
    'p_owner_id',
    'p_restaurant_id',
    'p_seller_id',
    'p_barber_id',
    'p_agency_id',
    'p_factory_id',
    'p_profile_id',
    'p_user_id',
  ]) {
    const value = args?.[key];
    if (typeof value === 'string' && value) return value;
  }
  throw new ApiError('Falta el identificador del negocio.', 400, 'VALIDATION');
}

/** Cuerpo del DTO sin las claves que ya van en la ruta. */
function bodyOf(args: RpcArgs, drop: string[] = []): Record<string, unknown> {
  const clone: RpcArgs = { ...args };
  for (const key of [
    'p_owner_id',
    'p_restaurant_id',
    'p_seller_id',
    'p_barber_id',
    'p_agency_id',
    'p_factory_id',
    'p_profile_id',
    ...drop,
  ]) {
    delete clone[key];
  }
  return toDto(clone);
}

const code = (args: RpcArgs): string =>
  encodeURIComponent(String(args.p_code ?? ''));

type RpcHandler = (args: RpcArgs) => Promise<unknown>;

/**
 * Cada función SQL de Supabase, mapeada a su ruta.
 *
 * El backend las porta una a una (ver los comentarios "Ports …" en sus
 * controladores), así que esto es una tabla de equivalencias, no lógica nueva.
 */
const RPCS: Record<string, RpcHandler> = {
  // — clubes y socios, seis verticales sobre dos rutas —
  join_gastro_club: (a) => joinClub('gastro', a),
  join_ecom_club: (a) => joinClub('ecom', a),
  join_barber_club: (a) => joinClub('barber', a),
  join_realty_club: (a) => joinClub('realty', a),
  join_sublima_club: (a) => joinClub('sublima', a),
  join_stage_fanbase: (a) => joinClub('stage', a),

  get_gastro_member: (a) => findMember('gastro', a),
  get_ecom_member: (a) => findMember('ecom', a),
  get_barber_member: (a) => findMember('barber', a),
  get_realty_member: (a) => findMember('realty', a),
  get_sublima_member: (a) => findMember('sublima', a),

  get_member_plan: (a) =>
    request(`/public/profiles/${ownerOf(a)}/${String(a.p_system ?? 'gastro')}/member-plan`, {
      auth: false,
      query: { memberCode: a.p_identifier },
    }),

  // — disponibilidad y carta —
  get_gastro_menu_availability: (a) =>
    request(`/public/profiles/${ownerOf(a)}/gastro/availability`, { auth: false }),
  get_barber_staff_availability: (a) =>
    request(`/public/profiles/${ownerOf(a)}/barber/availability`, {
      auth: false,
      query: { staffId: a.p_staff_id, date: a.p_date },
    }),
  get_ecom_staff_availability: (a) =>
    request(`/public/profiles/${ownerOf(a)}/ecom/availability`, {
      auth: false,
      query: { staffId: a.p_staff_id, date: a.p_date },
    }),

  // — pedidos y reservas del cliente final —
  place_gastro_order: (a) =>
    request(`/public/profiles/${ownerOf(a)}/gastro/orders`, {
      method: 'POST',
      auth: false,
      // `p_total_price` no se manda: el precio lo calcula el servidor.
      body: bodyOf(a, ['p_total_price']),
    }),
  place_ecom_order: (a) =>
    request(`/public/profiles/${ownerOf(a)}/ecom/orders`, {
      method: 'POST',
      auth: false,
      body: bodyOf(a, ['p_total_price']),
    }),
  place_sublima_order: (a) =>
    request(`/public/profiles/${ownerOf(a)}/sublima/orders`, {
      method: 'POST',
      auth: false,
      body: bodyOf(a),
    }),
  place_gastro_reservation: (a) =>
    request(`/public/profiles/${ownerOf(a)}/gastro/reservations`, {
      method: 'POST',
      auth: false,
      body: bodyOf(a),
    }),
  place_barber_reservation: (a) =>
    request(`/public/profiles/${ownerOf(a)}/barber/reservations`, {
      method: 'POST',
      auth: false,
      body: bodyOf(a),
    }),
  place_ecom_appointment: (a) =>
    request(`/public/profiles/${ownerOf(a)}/ecom/appointments`, {
      method: 'POST',
      auth: false,
      body: bodyOf(a),
    }),
  place_realty_request: (a) =>
    request(`/public/profiles/${ownerOf(a)}/realty/requests`, {
      method: 'POST',
      auth: false,
      body: bodyOf(a),
    }),

  // — consulta de estado por código —
  get_order_status: (a) =>
    request(`/public/profiles/${ownerOf(a)}/gastro/orders/${code(a)}`, { auth: false }),
  get_gastro_reservation_status: (a) =>
    request(`/public/profiles/${ownerOf(a)}/gastro/reservations/${code(a)}`, {
      auth: false,
    }),
  get_ecom_order_status: (a) =>
    request(`/public/profiles/${ownerOf(a)}/ecom/orders/${code(a)}`, { auth: false }),
  get_ecom_appointment_status: (a) =>
    request(`/public/profiles/${ownerOf(a)}/ecom/appointments/${code(a)}`, {
      auth: false,
    }),
  get_barber_reservation_status: (a) =>
    request(`/public/profiles/${ownerOf(a)}/barber/reservations/${code(a)}`, {
      auth: false,
    }),
  get_realty_request_status: (a) =>
    request(`/public/profiles/${ownerOf(a)}/realty/requests/${code(a)}`, {
      auth: false,
    }),
  get_sublima_order_status: (a) =>
    request(`/public/profiles/${ownerOf(a)}/sublima/orders/${code(a)}`, {
      auth: false,
    }),

  // — facturación y avisos de pago —
  submit_gastro_invoice: (a) =>
    request(`/public/profiles/${ownerOf(a)}/gastro/orders/${code(a)}/invoice`, {
      method: 'POST',
      auth: false,
      body: bodyOf(a, ['p_code']),
    }),
  submit_ecom_invoice: (a) =>
    request(`/public/profiles/${ownerOf(a)}/ecom/orders/${code(a)}/invoice`, {
      method: 'POST',
      auth: false,
      body: bodyOf(a, ['p_code']),
    }),
  notify_gastro_payment: (a) =>
    request(
      `/public/profiles/${ownerOf(a)}/gastro/orders/${code(a)}/payment-notice`,
      { method: 'POST', auth: false, body: bodyOf(a, ['p_code']) },
    ),

  // — fichas médicas / veterinarias —
  get_medical_records: (a) =>
    request(`/public/profiles/${ownerOf(a)}/medical/records`, {
      auth: false,
      query: { memberCode: a.p_member_code },
    }),
  get_petcare_records: (a) =>
    request(`/public/profiles/${ownerOf(a)}/petcare/records`, {
      auth: false,
      query: { memberCode: a.p_member_code },
    }),

  get_realty_agent: (a) =>
    request(
      `/public/profiles/${ownerOf(a)}/realty/agents/${encodeURIComponent(
        String(a.p_agent_username ?? ''),
      )}`,
      { auth: false },
    ),

  // — captación desde el perfil público —
  submit_lead: (a) =>
    request(`/public/profiles/${ownerOf(a)}/leads`, {
      method: 'POST',
      auth: false,
      body: bodyOf(a),
    }),
  submit_testimonial: (a) =>
    request(`/public/profiles/${ownerOf(a)}/testimonials`, {
      method: 'POST',
      auth: false,
      body: bodyOf(a),
    }),
  track_profile_view: (a) =>
    request(`/public/profiles/${ownerOf(a)}/views`, {
      method: 'POST',
      auth: false,
      body: bodyOf(a),
    }),
  track_link_click: (a) =>
    request(`/public/links/${encodeURIComponent(String(a.p_link_id ?? ''))}/clicks`, {
      method: 'POST',
      auth: false,
      body: bodyOf(a, ['p_link_id']),
    }),

  // — panel del dueño —
  get_profile_analytics: (a) =>
    request('/clients/me/analytics', {
      query: { days: a.p_days, tz: a.p_tz },
    }),
  receive_gastro_purchase: (a) =>
    request(
      `/clients/me/gastro/purchases/${encodeURIComponent(
        String(a.p_purchase_id ?? ''),
      )}/receive`,
      { method: 'POST' },
    ),

  // — dispositivos de notificación —
  claim_push_device: (a) =>
    request('/clients/me/push/devices/claim', {
      method: 'POST',
      body: {
        endpoint: a.p_endpoint,
        p256dh: a.p_p256dh,
        auth: a.p_auth,
        userAgent: a.p_user_agent,
      },
    }),
  list_push_device_accounts: (a) =>
    request('/clients/me/push/devices/accounts', {
      query: { endpoint: a.p_endpoint ?? '' },
    }),
  release_push_device_account: (a) =>
    request('/clients/me/push/devices/release', {
      method: 'POST',
      body: { endpoint: a.p_endpoint },
    }),

  // — telemetría —
  log_client_error: (a) =>
    request('/telemetry/errors', {
      method: 'POST',
      auth: getSession() !== null,
      body: bodyOf(a),
    }),

  // — administración —
  get_my_admin_role: async () => {
    // SuperAdmin.tsx espera la forma de la RPC antigua: { is_admin, role }.
    // Devolver el string pelado dejaba `is_admin` en undefined y el panel
    // cerraba la puerta a su propio dueño.
    //
    // Además el vocabulario cambió: la tabla admin_roles guarda `admin`, y la
    // UI sigue hablando de `super_admin`. Se traduce aquí, que es la capa de
    // compatibilidad, y no en la página.
    const me = await request<{ role?: string }>('/clients/auth/me');
    const role = me?.role === 'admin' ? 'super_admin' : me?.role === 'operator' ? 'operator' : null;
    return { is_admin: role !== null, role };
  },
  admin_list_admins: async () => {
    // Misma traducción que get_my_admin_role: la API responde en camelCase con
    // el rol `admin`, y la pantalla lee snake_case y `super_admin`. Sin esto,
    // el Super Admin se ve a sí mismo como «OPERADOR · Revocado».
    const rows = await request<any[]>('/clients/admin/operators');
    return (rows ?? []).map((r) => ({
      user_id: r.userId,
      email: r.email,
      role: r.role === 'admin' ? 'super_admin' : r.role,
      is_active: r.isActive,
      note: r.note,
      created_at: r.createdAt,
      last_sign_in: r.lastSignInAt ?? null,
    }));
  },
  admin_register_operator: (a) =>
    request('/clients/admin/operators', {
      method: 'POST',
      body: { userId: a.p_user_id, email: a.p_email, note: a.p_note },
    }),
  admin_set_operator_active: (a) =>
    request(`/clients/admin/operators/${String(a.p_user_id)}/active`, {
      method: 'PATCH',
      body: { isActive: a.p_is_active },
    }),
  admin_remove_operator: (a) =>
    request(`/clients/admin/operators/${String(a.p_user_id)}`, { method: 'DELETE' }),
  admin_delete_admin_profile: (a) =>
    request(`/clients/admin/operators/${String(a.p_user_id)}`, { method: 'DELETE' }),

  set_profile_active: (a) =>
    request(`/clients/admin/users/${String(a.p_user_id)}/active`, {
      method: 'PATCH',
      body: { isActive: a.p_is_active },
    }),
  update_user_plan_theme: (a) =>
    request(`/clients/admin/users/${String(a.p_user_id)}/plan`, {
      method: 'PATCH',
      body: { plan: a.p_plan, theme: a.p_theme },
    }),
  set_user_trial: (a) =>
    request(`/clients/admin/users/${String(a.p_user_id)}/trial`, {
      method: 'PUT',
      body: { trialDays: a.p_trial_days, sourceCampaign: a.p_source_campaign },
    }),
  convert_trial_to_paid: (a) =>
    request(`/clients/admin/users/${String(a.p_user_id)}/subscription/convert`, {
      method: 'POST',
      body: { planType: a.p_plan_type },
    }),
  delete_user_complete: (a) =>
    request(`/clients/admin/users/${String(a.p_user_id)}`, { method: 'DELETE' }),
  expire_trials: () =>
    request('/clients/admin/jobs/expire-trials', { method: 'POST' }),
  log_admin_event: (a) => {
    // Los eventos los registra el backend dentro de cada operación; dejarlo
    // pasar evita que el panel muestre un error por algo que ya está hecho.
    void a;
    return Promise.resolve({ ok: true });
  },

  /**
   * `create_user_profile`, `auto_confirm_user_email` y
   * `create_trial_subscription` eran tres llamadas encadenadas tras un
   * `auth.signUp`. Ahora `POST /clients/admin/users` hace las cuatro cosas en
   * una transacción, así que las tres sobrantes son no-ops.
   */
  create_user_profile: () => Promise.resolve({ ok: true }),
  auto_confirm_user_email: () => Promise.resolve({ ok: true }),
  create_trial_subscription: () => Promise.resolve({ ok: true }),
};

async function joinClub(vertical: string, args: RpcArgs): Promise<unknown> {
  return request(`/public/profiles/${ownerOf(args)}/${vertical}/club`, {
    method: 'POST',
    auth: false,
    body: bodyOf(args),
  });
}

async function findMember(vertical: string, args: RpcArgs): Promise<unknown> {
  const identifier = args.p_identifier ?? args.p_query ?? args.p_member_code;
  return request(`/public/profiles/${ownerOf(args)}/${vertical}/member`, {
    auth: false,
    query: { identifier },
  });
}

// ───────────────────────────── storage ─────────────────────────────

/**
 * Puente para `storage.from('assets')`.
 *
 * El backend elige la clave del objeto (la acota al dueño, que es lo que le
 * permite comprobar un borrado sin ir a la base de datos), así que la ruta que
 * pedía la pantalla ya no manda. Como todas las llamadas hacen
 * `upload(ruta, archivo)` y acto seguido `getPublicUrl(ruta)`, se recuerda la
 * URL real devuelta para esa ruta.
 */
const uploadedUrls = new Map<string, string>();

/** `gallery_images/<uid>/<archivo>` → prefijo `gallery_images`. */
function prefixOf(path: string): string {
  const head = path.split('/')[0];
  return head && head !== path ? head : 'uploads';
}

const storageBucket = {
  async upload(path: string, file: File | Blob, _options?: unknown) {
    const form = new FormData();
    const name =
      (file as File).name || path.split('/').pop() || 'archivo';
    form.append('file', file, name);

    const { data, error } = await settle(() =>
      request<{ key: string; url: string }>('/uploads', {
        method: 'POST',
        body: form,
        query: { prefix: prefixOf(path) },
      }),
    );
    if (error) return { data: null, error };

    uploadedUrls.set(path, data!.url);
    return { data: { path: data!.key, fullPath: data!.url }, error: null };
  },

  getPublicUrl(path: string) {
    return { data: { publicUrl: uploadedUrls.get(path) ?? path } };
  },

  async remove(paths: string[]) {
    for (const key of paths) {
      const { error } = await settle(() =>
        request('/uploads', { method: 'DELETE', body: { key } }),
      );
      if (error) return { data: null, error };
    }
    return { data: paths.map((key) => ({ name: key })), error: null };
  },

  /** El backend firma un PUT directo; es lo que se usa para vídeo. */
  async createSignedUploadUrl(path: string, contentType = 'video/mp4') {
    const { data, error } = await settle(() =>
      request<{ key: string; uploadUrl: string; publicUrl: string }>(
        '/uploads/sign',
        {
          method: 'POST',
          body: {
            filename: path.split('/').pop() || 'archivo',
            contentType,
            prefix: prefixOf(path),
          },
        },
      ),
    );
    if (error) return { data: null, error };
    uploadedUrls.set(path, data!.publicUrl);
    return {
      data: { signedUrl: data!.uploadUrl, path: data!.key, token: '' },
      error: null,
    };
  },
};

// ─────────────────────────────── auth ───────────────────────────────

/** La sesión con la forma que leían las pantallas (`session.user.id`). */
function asAuthSession(session: Session | null) {
  if (!session) return null;
  return {
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
    expires_at: Math.floor(session.expiresAt / 1000),
    token_type: 'bearer' as const,
    user: asAuthUser(session.user),
  };
}

function asAuthUser(user: SessionUser) {
  return {
    ...user,
    // Supabase exponía el resto de datos bajo `user_metadata`.
    user_metadata: {
      username: user.username,
      display_name: user.displayName,
      plan: user.plan,
      theme: user.theme,
    },
    app_metadata: { role: user.role },
  };
}

const auth = {
  async getSession() {
    return { data: { session: asAuthSession(getSession()) }, error: null };
  },

  async getUser() {
    const session = getSession();
    if (!session) return { data: { user: null }, error: null };
    const { data, error } = await settle(() =>
      request<{ id: string; email: string; role?: string }>('/clients/auth/me'),
    );
    if (error) return { data: { user: null }, error };
    return { data: { user: asAuthUser({ ...session.user, ...data! }) }, error: null };
  },

  async signInWithPassword({ email, password }: { email: string; password: string }) {
    const { data, error } = await settle(() =>
      request<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
        user: SessionUser;
      }>('/clients/auth/login', {
        method: 'POST',
        auth: false,
        body: { email, password },
      }),
    );
    if (error) return { data: { user: null, session: null }, error };

    const session = sessionFromTokens(data!);
    setSession(session, 'SIGNED_IN');
    return {
      data: { user: asAuthUser(session.user), session: asAuthSession(session) },
      error: null,
    };
  },

  async signOut() {
    const session = getSession();
    if (session) {
      // Se revoca el refresh token en el servidor; si falla, la sesión local
      // se cierra igual — quedarse dentro sería peor.
      await settle(() =>
        request('/clients/auth/logout', {
          method: 'POST',
          auth: false,
          body: { refreshToken: session.refreshToken },
        }),
      );
    }
    setSession(null, 'SIGNED_OUT');
    return { error: null };
  },

  /** Alta hecha por el superadmin: una sola ruta transaccional. */
  async signUp({
    email,
    password,
    options,
  }: {
    email: string;
    password: string;
    options?: { data?: Record<string, unknown> };
  }) {
    const meta = options?.data ?? {};
    const { data, error } = await settle(() =>
      request<{ id: string; email: string }>('/clients/admin/users', {
        method: 'POST',
        body: { email, password, ...toDto(meta) },
      }),
    );
    if (error) return { data: { user: null, session: null }, error };
    return {
      data: { user: { id: data!.id, email: data!.email }, session: null },
      error: null,
    };
  },

  /**
   * Antes servía para recolocar la sesión del superadmin tras crear un usuario
   * (el `signUp` de Supabase dejaba al admin logueado como el recién creado).
   * Aquí crear un usuario no toca la sesión, así que no hay nada que restaurar.
   */
  async setSession(_tokens: unknown) {
    return { data: { session: asAuthSession(getSession()) }, error: null };
  },

  async updateUser(attrs: { password?: string; email?: string; data?: unknown }) {
    if (attrs.password) {
      const { error } = await settle(() =>
        request('/clients/auth/password', {
          method: 'PATCH',
          body: { newPassword: attrs.password },
        }),
      );
      if (error) return { data: { user: null }, error };
    }
    const session = getSession();
    return {
      data: { user: session ? asAuthUser(session.user) : null },
      error: null,
    };
  },

  async resetPasswordForEmail(email: string) {
    const { error } = await settle(() =>
      request('/clients/auth/password/forgot', {
        method: 'POST',
        auth: false,
        body: { email },
      }),
    );
    return { data: {}, error };
  },

  onAuthStateChange(
    callback: (event: string, session: ReturnType<typeof asAuthSession>) => void,
  ) {
    const unsubscribe = onAuthStateChangeRaw((event, session) => {
      callback(event, asAuthSession(session));
    });
    // Estado inicial, como hacía Supabase.
    const current = getSession();
    if (current) {
      queueMicrotask(() => callback('INITIAL_SESSION', asAuthSession(current)));
    }
    return { data: { subscription: { unsubscribe } } };
  },
};

// ───────────────────────────── realtime ─────────────────────────────

/**
 * Puente para `db.channel(...).on('postgres_changes', {table}, cb)`.
 *
 * El backend no emite cambios de tabla sino eventos de recurso, así que la
 * tabla se traduce con el mismo mapa de arriba. El filtro (`user_id=eq.…`) se
 * ignora a propósito: el servidor ya sólo manda a las salas del dueño.
 */
class Channel {
  private readonly resources = new Set<string>();
  private readonly callbacks: ((payload: any) => void)[] = [];
  private subscription: Subscription | null = null;

  constructor(readonly name: string) {}

  on(
    _event: string,
    config: { table?: string; [key: string]: unknown } | ((payload: any) => void),
    callback?: (payload: any) => void,
  ): this {
    const table = typeof config === 'object' ? config.table : undefined;
    const fn = callback ?? (typeof config === 'function' ? config : undefined);
    if (table) {
      const mapped = COLLECTIONS[table]?.resource;
      // Una tabla sin recurso conocido no acota nada: mejor recibir de más y
      // refrescar, que quedarse mudo.
      if (mapped) this.resources.add(mapped);
    }
    if (fn) this.callbacks.push(fn);
    return this;
  }

  subscribe(onStatus?: (status: RealtimeStatus) => void): this {
    this.subscription = subscribe(
      [...this.resources],
      (payload) => {
        for (const cb of this.callbacks) cb(payload);
      },
      onStatus,
    );
    return this;
  }

  unsubscribe(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
  }
}

// ──────────────────── funciones (ex Edge Functions) ────────────────────

const FUNCTIONS: Record<string, { path: string; auth?: boolean }> = {
  extractCatalog: { path: '/clients/ai/extract-catalog' },
  generateCopySuggestions: { path: '/clients/ai/copy-suggestions' },
  // Los avisos ya los manda el backend dentro de cada operación.
  notifyAdminEvent: { path: '' },
  notifyError: { path: '/telemetry/errors', auth: false },
  sendPush: { path: '' },
};

const functions = {
  async invoke(
    name: string,
    options?: { body?: unknown },
  ): Promise<{ data: any; error: ApiError | null }> {
    const mapped = FUNCTIONS[name];
    if (!mapped) {
      return {
        data: null,
        error: new ApiError(
          `La función "${name}" no tiene equivalente en el backend.`,
          501,
          'NOT_MIGRATED',
        ),
      };
    }
    if (!mapped.path) return { data: { ok: true }, error: null };

    return settle(() =>
      request(mapped.path, {
        method: 'POST',
        body: options?.body ?? {},
        auth: mapped.auth !== false,
      }),
    );
  },
};

// ─────────────────────────── payphone ───────────────────────────

/** `POST /api/public/profiles/:ownerId/payments/payphone`. */
export async function preparePayphone(
  ownerId: string,
  payload: Record<string, unknown>,
) {
  return settle(() =>
    request(`/public/profiles/${ownerId}/payments/payphone`, {
      method: 'POST',
      auth: false,
      body: payload,
    }),
  );
}

/** `GET /api/public/profiles/:ownerId/payments/methods`. */
export async function paymentMethods(ownerId: string) {
  return settle(() =>
    request(`/public/profiles/${ownerId}/payments/methods`, { auth: false }),
  );
}

// ─────────────────────────── cliente ───────────────────────────

export const db = {
  from<T = any>(table: string): QueryBuilder<T> {
    return new QueryBuilder<T>(table);
  },

  async rpc<T = any>(name: string, args?: RpcArgs): Promise<Result<T>> {
    const handler = RPCS[name];
    if (!handler) {
      return {
        data: null as T,
        error: new ApiError(
          `La función "${name}" no tiene equivalente en el backend.`,
          501,
          'NOT_MIGRATED',
        ),
      };
    }
    const { data, error } = await settle(() => handler(args ?? {}));
    return { data: data as T, error };
  },

  storage: {
    from(_bucket: string) {
      // Sólo existía el bucket `assets`; el backend ya no expone buckets.
      return storageBucket;
    },
  },

  auth,
  functions,

  channel(name: string): Channel {
    return new Channel(name);
  },

  removeChannel(channel: Channel | null | undefined): void {
    channel?.unsubscribe();
  },
};

export { ApiError, isUuid };
export default db;
