// Supabase Edge Function: kodaWhatsApp
// Puente KODA → Connexo, FASE 4: el WhatsApp. Envía el saludo inicial (plantilla de Meta aprobada
// `saludo_inicial_connexo`) a los negocios que el propietario APROBÓ en KODA, respeta el tope diario y
// reacciona al botón que el negocio toque:
//
//   «¡Sí, enviar demo!»  → activa el perfil, arranca la prueba de 7 días DESDE ESE MOMENTO y le manda su
//                          enlace + usuario y clave temporal (recién ahí salen las credenciales).
//   «Ver más tarde»      → queda como «declinado»; se le agradece y no se insiste.
//   «STOP», «no», «baja»… (texto libre) → «no contactar»: no se le vuelve a escribir.
//
// Seguridad: no usa JWT; se autentica con el secreto compartido `KODA_BRIDGE_SECRET` (cabecera
// `x-koda-secret`), igual que `kodaIntake`. Lo llaman (1) la función `koda-connexo` de KODA para enviar y
// (2) el webhook de Meta en Vercel (`api/webhooks/whatsapp.ts`) con lo que el negocio responde.
// El token de Meta vive SOLO en los secretos de esta función; KODA nunca lo ve.
//
// Acciones (todas con { v: 1 }):
//   { action: 'cupo' }                          → { limite, usados, disponibles, configurado }
//   { action: 'enviar', envio_ids: string[] }   → envía la plantilla a los aprobados que quepan hoy
//                                                  (`sin_variable: true` solo para pruebas internas con la plantilla sin variable; KODA nunca lo manda)
//   { action: 'webhook', payload: <Meta> }      → procesa respuestas de botones, bajas y fallos de entrega
//
// Secretos (supabase secrets set …):
//   KODA_BRIDGE_SECRET          el mismo de kodaIntake
//   WHATSAPP_TOKEN              token PERMANENTE del usuario del sistema de Meta (whatsapp_business_messaging)
//   WHATSAPP_PHONE_NUMBER_ID    identificador del número emisor (+593 99 430 7367)
// Opcionales (traen valor por defecto):
//   KODA_WA_DAILY_LIMIT         envíos por 24 h (50; el máximo de Meta es 250)
//   KODA_WA_TEMPLATE            saludo_inicial_connexo
//   KODA_WA_LANG                es_EC
//   KODA_WA_BODY_PARAM_NAME     vacío = variable posicional {{1}}; si la plantilla usa variable con NOMBRE, ese nombre
//   KODA_WA_HEADER_IMAGE_URL    imagen del encabezado (por defecto <sitio>/koda-saludo.jpg)
//   KODA_WA_SITE_URL            https://www.connexoapp.com (¡con www!: sin www no resuelve)
//   WHATSAPP_GRAPH_VERSION      v23.0
//
// Requiere haber ejecutado setup_koda_bridge.sql y setup_koda_whatsapp.sql.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-koda-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VERSION_CONTRATO = 1;
const MAX_POR_LLAMADA = 50;
const CONCURRENCIA = 3;
const TIMEOUT_META_MS = 15_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WHATSAPP_RE = /^\+5939\d{8}$/;
const PAYLOAD_RE = /^koda:(si|luego):([0-9a-f]{32})$/;
const ALFABETO_CLAVE = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
// Texto libre que, SI ES TODO EL MENSAJE (ya normalizado, sin tildes), se toma como «no me escriban más».
// Se exige coincidencia completa: «no sé de qué se trata» NO es una baja.
const BAJA_RE = /^(stop|baja|bajas|no( gracias| quiero| me interesa)?|ya no|no (me )?(molesten|escriban|escribas|contacten|llamen)( mas)?|cancelar|salir|darme de baja|dejar de recibir|desuscribir|eliminar)( gracias| por favor)?$/;

// deno-lint-ignore no-explicit-any
type Json = Record<string, any>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

function admin() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
type Admin = ReturnType<typeof admin>;

// ── Configuración ───────────────────────────────────────────────────────────
function config() {
  const sitio = (Deno.env.get("KODA_WA_SITE_URL") ?? "https://www.connexoapp.com").replace(/\/+$/, "");
  const limiteEnv = Number(Deno.env.get("KODA_WA_DAILY_LIMIT") ?? 50);
  return {
    token: Deno.env.get("WHATSAPP_TOKEN") ?? "",
    phoneId: Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "",
    version: Deno.env.get("WHATSAPP_GRAPH_VERSION") ?? "v23.0",
    plantilla: Deno.env.get("KODA_WA_TEMPLATE") ?? "saludo_inicial_connexo",
    idioma: Deno.env.get("KODA_WA_LANG") ?? "es_EC",
    paramNombre: Deno.env.get("KODA_WA_BODY_PARAM_NAME") ?? "",
    imagen: Deno.env.get("KODA_WA_HEADER_IMAGE_URL") ?? `${sitio}/koda-saludo.jpg`,
    sitio,
    limite: Math.min(Math.max(Number.isFinite(limiteEnv) ? Math.trunc(limiteEnv) : 50, 1), 250),
  };
}
type Config = ReturnType<typeof config>;
const configurado = (c: Config) => !!c.token && !!c.phoneId;

// ── Meta (WhatsApp Cloud API) ───────────────────────────────────────────────
class MetaError extends Error {
  constructor(message: string, public code: number | null, public fatal: boolean) { super(message); }
}

const SIN_VARIABLE =
  "La plantilla aprobada NO tiene variable en el cuerpo (su texto dice literalmente «{{}}»): enviarla así saludaría «¡Hola {{}}!». " +
  "Corrígela en Meta o crea una nueva con {{1}} y pon su nombre en KODA_WA_TEMPLATE.";

/** Mensaje en español para los errores de Meta que más se ven; el resto se muestra tal cual. */
function explicarMeta(code: number | null, titulo: string): { texto: string; fatal: boolean } {
  switch (code) {
    case 190: return { texto: "El token de WhatsApp venció o es inválido (WHATSAPP_TOKEN).", fatal: true };
    case 10: case 200: case 3: return { texto: "El token no tiene permiso para enviar mensajes de WhatsApp.", fatal: true };
    case 131030: return { texto: "Ese número no está en la lista permitida (la cuenta de WhatsApp sigue en modo prueba).", fatal: false };
    case 131026: return { texto: "Ese número no tiene WhatsApp o no puede recibir el mensaje.", fatal: false };
    case 131049: return { texto: "Meta frenó este mensaje de marketing (límite de frecuencia/calidad para ese número).", fatal: false };
    case 131048: case 130429: case 131056: return { texto: "Meta pide bajar el ritmo de envío (límite de velocidad). Reintenta más tarde.", fatal: false };
    case 132000: case 132012: case 132005: case 132007:
      // Meta dice que el cuerpo espera 0 variables: el «{{}}» de la plantilla es texto literal, no una variable.
      if (/expected number of params \(0\)/i.test(titulo)) {
        return { texto: SIN_VARIABLE, fatal: true };
      }
      return { texto: `La plantilla no coincide con lo que se envía (${titulo}). Revisa KODA_WA_BODY_PARAM_NAME y KODA_WA_LANG.`, fatal: true };
    case 132001: return { texto: "La plantilla no existe con ese nombre o idioma (KODA_WA_TEMPLATE / KODA_WA_LANG).", fatal: true };
    case 132015: case 132016: return { texto: "La plantilla está pausada o deshabilitada en Meta.", fatal: true };
    case 133010: return { texto: "El número emisor no está registrado en WhatsApp Cloud API.", fatal: true };
    default: return { texto: `Meta ${code ?? "?"}: ${titulo}`, fatal: false };
  }
}

async function llamarMeta(c: Config, cuerpo: Json): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_META_MS);
  try {
    const res = await fetch(`https://graph.facebook.com/${c.version}/${c.phoneId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.token}` },
      body: JSON.stringify({ messaging_product: "whatsapp", ...cuerpo }),
      signal: ctrl.signal,
    });
    const data: Json = await res.json().catch(() => ({}));
    if (!res.ok || data?.error) {
      const e = data?.error ?? {};
      const code = typeof e.code === "number" ? e.code : null;
      const detalle = e.error_data?.details ?? e.message ?? `HTTP ${res.status}`;
      const x = explicarMeta(code, String(detalle));
      throw new MetaError(x.texto, code, x.fatal);
    }
    const id = data?.messages?.[0]?.id;
    if (typeof id !== "string") throw new MetaError("Meta no devolvió el id del mensaje.", null, false);
    return id;
  } catch (e) {
    if (e instanceof MetaError) throw e;
    if (e instanceof DOMException && e.name === "AbortError") throw new MetaError("Meta tardó demasiado en responder.", null, false);
    throw new MetaError(`No se pudo contactar a Meta: ${e instanceof Error ? e.message : String(e)}`, null, false);
  } finally {
    clearTimeout(timer);
  }
}

/** Una variable de plantilla no admite saltos de línea, tabulaciones ni más de 4 espacios seguidos. */
const paraVariable = (s: string) => s.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim().slice(0, 60);

function cuerpoPlantilla(c: Config, aNumero: string, nombre: string, token: string, paramNombre: string, sinVariable = false): Json {
  const param: Json = { type: "text", text: paraVariable(nombre) || "amigo" };
  if (paramNombre) param.parameter_name = paramNombre;
  return {
    to: aNumero,
    type: "template",
    template: {
      name: c.plantilla,
      language: { code: c.idioma },
      components: [
        { type: "header", parameters: [{ type: "image", image: { link: c.imagen } }] },
        ...(sinVariable ? [] : [{ type: "body", parameters: [param] }]),
        // El token viaja dentro del botón: así la respuesta se asocia a ESTA invitación, no a un teléfono.
        { type: "button", sub_type: "quick_reply", index: "0", parameters: [{ type: "payload", payload: `koda:si:${token}` }] },
        { type: "button", sub_type: "quick_reply", index: "1", parameters: [{ type: "payload", payload: `koda:luego:${token}` }] },
      ],
    },
  };
}

// La variable del saludo puede ser posicional ({{1}}) o con NOMBRE ({{nombre}}), y el editor de Meta no deja ver cuál es.
// Se prueba primero lo configurado (KODA_WA_BODY_PARAM_NAME; vacío = posicional) y, solo si Meta responde que el formato
// no coincide (132000 / 132012), las alternativas más comunes. El que funcione se recuerda mientras viva la función.
const ERRORES_DE_FORMATO = new Set([132000, 132012]);
const NOMBRES_ALTERNATIVOS = ["", "nombre", "name", "customer_name", "nombre_cliente", "cliente"];
let formatoQueFunciona: string | null = null;

async function enviarPlantilla(c: Config, aNumero: string, nombre: string, token: string, sinVariable = false): Promise<string> {
  // Solo para pruebas internas (quien llama con el secreto del puente lo pide explícito): la plantilla se manda sin variable.
  if (sinVariable) return await llamarMeta(c, cuerpoPlantilla(c, aNumero, nombre, token, "", true));
  const orden =[c.paramNombre || (formatoQueFunciona ?? ""), ...NOMBRES_ALTERNATIVOS].filter((x, i, a) => a.indexOf(x) === i);
  let ultimo: MetaError | null = null;
  for (const paramNombre of orden) {
    try {
      const id = await llamarMeta(c, cuerpoPlantilla(c, aNumero, nombre, token, paramNombre));
      if (formatoQueFunciona !== paramNombre) {
        formatoQueFunciona = paramNombre;
        console.log(`[kodaWhatsApp] la variable de la plantilla es ${paramNombre ? `con nombre «${paramNombre}»` : "posicional"}`);
      }
      return id;
    } catch (e) {
      // «No tiene variable» no se arregla probando otros formatos: se corta aquí con el mensaje claro.
      if (e instanceof MetaError && e.message === SIN_VARIABLE) throw e;
      if (e instanceof MetaError && e.code !== null && ERRORES_DE_FORMATO.has(e.code)) { ultimo = e; continue; }
      throw e;
    }
  }
  throw ultimo ?? new MetaError("No se pudo enviar la plantilla.", null, false);
}

function enviarTexto(c: Config, aNumero: string, cuerpo: string): Promise<string> {
  return llamarMeta(c, { to: aNumero, type: "text", text: { body: cuerpo, preview_url: true } });
}

// ── Acción: cupo ────────────────────────────────────────────────────────────
async function cupo(db: Admin, c: Config): Promise<Json> {
  const { data, error } = await db.rpc("koda_wa_cupo", { p_limite: c.limite });
  if (error) throw new Error(error.message);
  return { ...(data as Json), configurado: configurado(c) };
}

// ── Acción: enviar ──────────────────────────────────────────────────────────
async function enParalelo<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]);
    }
  }));
  return out;
}

async function enviar(db: Admin, body: Json): Promise<Response> {
  const pedidos: unknown[] = Array.isArray(body.envio_ids) ? body.envio_ids : [];
  const ids = [...new Set(pedidos.filter((x): x is string => typeof x === "string" && UUID_RE.test(x)))];
  if (!ids.length) return json({ error: "No elegiste ningún negocio." }, 400);
  if (ids.length > MAX_POR_LLAMADA) return json({ error: `Envía como máximo ${MAX_POR_LLAMADA} por vez.` }, 400);
  const sinVariable = body.sin_variable === true;

  const c = config();
  if (!configurado(c)) {
    return json({ error: "El WhatsApp de Connexo no está configurado (faltan WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID)." }, 503);
  }

  const { data: filas, error } = await db
    .from("koda_prospectos")
    .select("id, koda_envio_id, estado, opt_out, whatsapp, user_id, wa_intentos")
    .in("koda_envio_id", ids);
  if (error) return json({ error: error.message }, 500);
  const porEnvio = new Map((filas ?? []).map((f) => [f.koda_envio_id as string, f]));

  const resultados: Json[] = [];
  const aptos: string[] = [];          // ids de koda_prospectos
  const envioDe = new Map<string, string>();
  for (const envio of ids) {
    const f = porEnvio.get(envio);
    const base = { envio_id: envio };
    if (!f) { resultados.push({ ...base, resultado: "omitido", motivo: "Ese envío no existe en Connexo." }); continue; }
    if (f.estado !== "aprobado") { resultados.push({ ...base, resultado: "omitido", motivo: `Está en «${f.estado}»: solo se envía lo aprobado.` }); continue; }
    if (f.opt_out) { resultados.push({ ...base, resultado: "omitido", motivo: "Pidió no ser contactado." }); continue; }
    if (!f.user_id) { resultados.push({ ...base, resultado: "omitido", motivo: "No tiene cuenta borrador." }); continue; }
    if (!f.whatsapp || !WHATSAPP_RE.test(f.whatsapp)) { resultados.push({ ...base, resultado: "omitido", motivo: "No tiene un celular de Ecuador válido." }); continue; }
    if ((f.wa_intentos ?? 0) >= 2) { resultados.push({ ...base, resultado: "omitido", motivo: "Ya falló dos veces: revisa el número antes de insistir." }); continue; }
    aptos.push(f.id);
    envioDe.set(f.id, envio);
  }

  type Reservado = { id: string; koda_envio_id: string; whatsapp: string; nombre: string | null; wa_token: string };
  let reservados: Reservado[] = [];
  if (aptos.length) {
    const r = await db.rpc("koda_wa_reclamar", { p_ids: aptos, p_limite: c.limite });
    if (r.error) return json({ error: r.error.message }, 500);
    reservados = (r.data ?? []) as Reservado[];
  }
  const reservadoIds = new Set(reservados.map((r) => r.id));
  for (const id of aptos) {
    if (!reservadoIds.has(id)) {
      resultados.push({ envio_id: envioDe.get(id), resultado: "omitido", motivo: `Sin cupo: el límite es ${c.limite} cada 24 horas. Se envía mañana.` });
    }
  }

  let abortar: string | null = null;     // un fallo que afecta a TODOS (token vencido, plantilla pausada…)
  await enParalelo(reservados, CONCURRENCIA, async (r) => {
    const base = { envio_id: r.koda_envio_id };
    if (abortar) {
      await db.rpc("koda_wa_revertir", { p_id: r.id, p_error: abortar });
      resultados.push({ ...base, resultado: "error", motivo: abortar });
      return;
    }
    try {
      const wamid = await enviarPlantilla(c, r.whatsapp.slice(1), r.nombre ?? "", r.wa_token, sinVariable);
      // El mensaje YA salió: aunque no se pueda guardar su id, no se revierte (sería un doble envío).
      const g = await db.from("koda_prospectos").update({ wa_message_id: wamid, updated_at: new Date().toISOString() }).eq("id", r.id);
      if (g.error) console.error("[kodaWhatsApp] no se guardó wa_message_id:", g.error.message);
      resultados.push({ ...base, resultado: "enviado" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (e instanceof MetaError && e.fatal) abortar = msg;
      await db.rpc("koda_wa_revertir", { p_id: r.id, p_error: msg });
      resultados.push({ ...base, resultado: "error", motivo: msg });
    }
  });

  return json({
    ok: true,
    enviados: resultados.filter((r) => r.resultado === "enviado").length,
    resultados,
    cupo: await cupo(db, c),
  });
}

// ── Acción: webhook (lo que el negocio responde y avisos de entrega) ────────
interface WaMsg {
  id?: string;
  from?: string;
  type?: string;
  text?: { body?: string };
  button?: { payload?: string; text?: string };
  interactive?: { button_reply?: { id?: string; title?: string } };
  context?: { id?: string };
}
interface WaStatus { id?: string; status?: string; errors?: Array<{ code?: number; title?: string; message?: string; error_data?: { details?: string } }> }

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const normalizar = (s: string) => sinAcentos(s).toLowerCase().replace(/[^a-z0-9ñ\s]/g, " ").replace(/\s+/g, " ").trim();

function generarClave(): string {
  const b = crypto.getRandomValues(new Uint32Array(10));
  return Array.from(b, (x) => ALFABETO_CLAVE[x % ALFABETO_CLAVE.length]).join("");
}

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString("es-EC", { day: "numeric", month: "long", timeZone: "America/Guayaquil" });
}

/** Qué quiso decir el negocio con un botón: el token de la invitación y si dijo sí o «más tarde». */
function leerBoton(m: WaMsg): { accion: "si" | "luego"; token: string | null } | null {
  const payload = m.button?.payload ?? m.interactive?.button_reply?.id ?? "";
  const p = PAYLOAD_RE.exec(payload);
  if (p) return { accion: p[1] as "si" | "luego", token: p[2] };
  // Sin payload (mensajes viejos): se reconoce por el texto del botón y se ubica por el mensaje citado.
  const t = normalizar(m.button?.text ?? m.interactive?.button_reply?.title ?? "");
  if (/enviar demo|^si\b/.test(t)) return { accion: "si", token: null };
  if (/mas tarde/.test(t)) return { accion: "luego", token: null };
  return null;
}

type Fila = Json;

/** Lo que pasó con un negocio, ya redactado para Discord (el webhook de Vercel lo publica). */
interface Evento { msg_id: string | null; tipo: string; clave: string; texto: string }
// Mismo formato que kodaIntake (cada función es un solo archivo, por eso se repite): <usuario>@connexoapp.com.
const BUZONES_RESERVADOS = new Set([
  "admin", "administrador", "info", "hola", "hello", "contacto", "contact", "ventas", "sales", "soporte", "support", "ayuda",
  "help", "noreply", "no-reply", "postmaster", "abuse", "webmaster", "root", "security", "seguridad", "billing", "pagos",
  "facturacion", "marketing", "prensa", "rrhh", "empleo", "trabajo", "connexo", "connexoec", "koda",
]);
const correoInterno = (username: string): string => {
  const base = username.slice(0, 40);
  return `${BUZONES_RESERVADOS.has(base) ? `${base}-perfil` : base}@connexoapp.com`;
};
const nombreDe = (f: Fila) => String(f.negocio?.nombre ?? f.username ?? "Un negocio").trim() || "Un negocio";

/** Las funciones SQL rechazan con RAISE EXCEPTION (P0001) lo que no procede (descartado, sin cuenta…): eso se ignora.
 *  Cualquier otro error es de la base o de la red: se lanza para que el webhook responda 500 y Meta reintente. */
const esReglaDeNegocio = (e: { code?: string }) => e.code === "P0001";

async function buscarPorToken(db: Admin, token: string): Promise<Fila | null> {
  const { data } = await db.from("koda_prospectos").select("*").eq("wa_token", token).maybeSingle();
  return data ?? null;
}
async function buscarPorMensaje(db: Admin, wamid: string): Promise<Fila | null> {
  const { data } = await db.from("koda_prospectos").select("*").eq("wa_message_id", wamid).maybeSingle();
  return data ?? null;
}
/** El negocio más reciente al que se le escribió desde ese número (para bajas por texto libre). */
async function buscarPorTelefono(db: Admin, from: string): Promise<Fila | null> {
  const { data } = await db.from("koda_prospectos").select("*").eq("whatsapp", `+${from}`)
    .not("wa_enviado_at", "is", null).order("wa_enviado_at", { ascending: false }).limit(1);
  return (data ?? [])[0] ?? null;
}

async function marcarError(db: Admin, id: string, msg: string) {
  await db.from("koda_prospectos").update({ wa_error: msg.slice(0, 400), updated_at: new Date().toISOString() }).eq("id", id);
}

/** Usuario y clave temporal + enlaces. Solo UNA vez por negocio (el reclamo es atómico) y se reintenta si falla. */
async function entregarCredenciales(db: Admin, c: Config, f: Fila): Promise<boolean> {
  const ahora = new Date().toISOString();
  const { data: reclamo } = await db.from("koda_prospectos").update({ wa_credenciales_at: ahora })
    .eq("id", f.id).is("wa_credenciales_at", null).select("id").maybeSingle();
  if (!reclamo) return false;                          // ya se entregaron (o las está entregando otra llamada)

  try {
    const u = await db.auth.admin.getUserById(f.user_id);
    let correo = u.data?.user?.email;
    if (u.error || !correo) throw new Error(`No encontré la cuenta del negocio: ${u.error?.message ?? "sin correo"}`);

    // Borradores viejos con correo interno feo (p-xxxx@prospectos.connexoapp.com): se les pone uno corto con el nombre
    // del negocio (<usuario>@connexoapp.com). Si ese ya existe o falla, se deja el anterior: el acceso nunca se rompe.
    if (/@prospectos\.connexoapp\.com$/i.test(correo) && f.username) {
      const nuevo = correoInterno(String(f.username));
      const cambio = await db.auth.admin.updateUserById(f.user_id, { email: nuevo, email_confirm: true });
      if (!cambio.error) {
        correo = nuevo;
        await db.from("profiles").update({ email: nuevo }).eq("id", f.user_id);   // el perfil guarda una copia del correo
      } else {
        console.error("[kodaWhatsApp] no se pudo renombrar el correo interno:", cambio.error.message);
      }
    }

    const clave = generarClave();
    const upd = await db.auth.admin.updateUserById(f.user_id, { password: clave });
    if (upd.error) throw new Error(`No pude crear la clave temporal: ${upd.error.message}`);

    const nombre = String(f.negocio?.nombre ?? "").trim();
    const hasta = f.trial_ends_at ? ` (hasta el ${fechaCorta(f.trial_ends_at)})` : "";
    const texto =
      `¡Genial${nombre ? `, ${nombre}` : ""}! 🎉 Aquí tienes tu demo:\n\n` +
      `🔗 Tu perfil: ${c.sitio}/${f.username}\n\n` +
      `Tu prueba gratis de 7 días ya empezó${hasta}. Para editarlo entra aquí:\n` +
      `👉 ${c.sitio}/auth\n` +
      `Correo de acceso: ${correo}\n` +
      `Clave temporal: ${clave}\n\n` +
      `Cámbiala apenas entres. Si necesitas ayuda, responde a este mensaje y te escribimos.`;
    await enviarTexto(c, String(f.whatsapp).slice(1), texto);
    return true;
  } catch (e) {
    // Se libera el reclamo para que el reintento de Meta (o el siguiente toque) lo vuelva a intentar.
    await db.from("koda_prospectos").update({ wa_credenciales_at: null }).eq("id", f.id);
    await marcarError(db, f.id, `Aceptó, pero no se pudieron entregar las credenciales: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
}

async function procesarRespuesta(db: Admin, c: Config, m: WaMsg, out: Evento[]): Promise<void> {
  const from = m.from ?? "";
  if (!/^\d{8,15}$/.test(from)) return;
  const msgId = m.id ?? null;

  // 1) Un botón de la plantilla.
  if (m.type === "button" || m.type === "interactive") {
    const b = leerBoton(m);
    if (!b) return;
    let f = b.token ? await buscarPorToken(db, b.token) : null;
    if (!f && m.context?.id) f = await buscarPorMensaje(db, m.context.id);
    if (!f) return;                                    // no es un negocio de KODA (o token inventado)
    if (f.whatsapp !== `+${from}`) return;             // el botón lo tocó otro número: se ignora

    if (b.accion === "si") {
      if (f.opt_out) return;
      const r = await db.rpc("koda_wa_aceptar", { p_id: f.id });
      if (r.error) {
        if (!esReglaDeNegocio(r.error)) throw new Error(r.error.message);
        // Estados que ya no admiten aceptar (p. ej. descartado): no se activa nada ni se reintenta.
        console.error("[kodaWhatsApp] aceptar:", r.error.message);
        return;
      }
      const ya = (r.data as Json).ya === true;
      const fila = (r.data as Json).prospecto as Fila;
      const hasta = fila.trial_ends_at ? ` Su prueba de 7 días corre hasta el ${fechaCorta(fila.trial_ends_at)}.` : "";
      // La primera vez se avisa que aceptó (aunque luego falle la entrega de credenciales: queda el aviso de error).
      if (!ya) {
        out.push({
          msg_id: msgId, tipo: "acepto", clave: `aceptó ${f.id}`,
          texto: `✅ **${nombreDe(fila)}** aceptó la demo.${hasta} Perfil: ${c.sitio}/${fila.username}`,
        });
      }
      let entregadas = false;
      try {
        entregadas = await entregarCredenciales(db, c, fila);
      } catch (e) {
        out.push({
          msg_id: ya ? msgId : null, tipo: "error", clave: `credenciales ${f.id}`,
          texto: `❗ **${nombreDe(fila)}** aceptó, pero NO se pudieron entregar sus credenciales: ${e instanceof Error ? e.message : String(e)}. Meta reintenta solo; si sigue, escríbele a mano.`,
        });
        throw e;
      }
      if (ya && entregadas) {
        out.push({ msg_id: msgId, tipo: "credenciales", clave: `credenciales ${f.id}`, texto: `📨 Ya se le entregaron sus credenciales a **${nombreDe(fila)}**.` });
      }
      return;
    }

    const r = await db.rpc("koda_wa_declinar", { p_id: f.id, p_baja: false });
    if (r.error) {
      if (!esReglaDeNegocio(r.error)) throw new Error(r.error.message);
      console.error("[kodaWhatsApp] declinar:", r.error.message);
      return;
    }
    if ((r.data as Json).cambio) {
      await enviarTexto(c, from, "¡Sin problema! 🙌 Cuando quieras ver cómo quedó tu vista previa, solo escríbenos por aquí.").catch(() => {});
      out.push({ msg_id: msgId, tipo: "luego", clave: `declinó ${f.id}`, texto: `🕐 **${nombreDe(f)}** respondió «Ver más tarde».` });
    }
    return;
  }

  // 2) Texto libre: solo interesa si pide que no le escribamos más.
  if (m.type === "text") {
    const crudo = (m.text?.body ?? "").trim();
    const t = normalizar(crudo);
    if (!t || t.length > 40 || !BAJA_RE.test(t)) return;
    const f = await buscarPorTelefono(db, from);
    if (!f) return;
    const r = await db.rpc("koda_wa_declinar", { p_id: f.id, p_baja: true });
    if (r.error) {
      if (!esReglaDeNegocio(r.error)) throw new Error(r.error.message);
      console.error("[kodaWhatsApp] baja:", r.error.message);
      return;
    }
    if ((r.data as Json).cambio) {
      await enviarTexto(c, from, "Listo, no te volveremos a escribir. Gracias por tu tiempo. 🙏").catch(() => {});
      out.push({ msg_id: msgId, tipo: "baja", clave: `baja ${f.id}`, texto: `🚫 **${nombreDe(f)}** pidió no recibir más mensajes («${crudo.slice(0, 40)}»). Quedó como «no contactar».` });
    }
  }
}

async function procesarEstado(db: Admin, s: WaStatus, out: Evento[]): Promise<void> {
  if (s.status !== "failed" || !s.id) return;
  const f = await buscarPorMensaje(db, s.id);
  if (!f || f.estado !== "wa_enviado") return;
  const e = s.errors?.[0] ?? {};
  const x = explicarMeta(typeof e.code === "number" ? e.code : null, String(e.error_data?.details ?? e.message ?? e.title ?? "no se entregó"));
  const r = await db.rpc("koda_wa_revertir", { p_id: f.id, p_error: x.texto });
  if (r.error) throw new Error(r.error.message);
  out.push({ msg_id: null, tipo: "fallo", clave: `falló ${f.id}`, texto: `⚠️ El saludo a **${nombreDe(f)}** no se entregó: ${x.texto} Volvió a «aprobado».` });
}

async function webhook(db: Admin, body: Json): Promise<Response> {
  const payload = body.payload as { entry?: Array<{ changes?: Array<{ value?: { messages?: WaMsg[]; statuses?: WaStatus[] } }> }> } | undefined;
  const c = config();
  const eventos: Evento[] = [];
  let primerError: unknown = null;

  for (const entry of payload?.entry ?? []) {
    for (const ch of entry.changes ?? []) {
      for (const m of ch.value?.messages ?? []) {
        try {
          await procesarRespuesta(db, c, m, eventos);
        } catch (e) {
          primerError ??= e;
          console.error("[kodaWhatsApp] respuesta:", e instanceof Error ? e.message : e);
        }
      }
      for (const s of ch.value?.statuses ?? []) {
        try {
          await procesarEstado(db, s, eventos);
        } catch (e) {
          primerError ??= e;
          console.error("[kodaWhatsApp] estado:", e instanceof Error ? e.message : e);
        }
      }
    }
  }
  // `eventos` viaja de vuelta para que el webhook de Vercel los publique en Discord en lugar de la línea cruda.
  const hechos = eventos.map((e) => e.clave);
  // Un fallo transitorio devuelve 500: Meta reintenta y todo lo anterior es idempotente.
  if (primerError) return json({ error: primerError instanceof Error ? primerError.message : String(primerError), hechos, eventos }, 500);
  return json({ ok: true, hechos, eventos });
}

// ── Entrada ─────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const secret = Deno.env.get("KODA_BRIDGE_SECRET") ?? "";
  const recibido = req.headers.get("x-koda-secret") ?? "";
  if (!secret || !safeEqual(recibido, secret)) return json({ error: "No autorizado." }, 401);

  try {
    const body: Json = await req.json().catch(() => ({}));
    if (body.v !== VERSION_CONTRATO) return json({ error: `Versión de contrato no soportada (se espera ${VERSION_CONTRATO}).` }, 400);

    const db = admin();
    if (body.action === "cupo") return json({ ok: true, ...(await cupo(db, config())) });
    if (body.action === "enviar") return await enviar(db, body);
    if (body.action === "webhook") return await webhook(db, body);
    return json({ error: "Acción desconocida." }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
