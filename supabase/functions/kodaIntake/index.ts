// Supabase Edge Function: kodaIntake
// Puente KODA → Connexo. KODA (otro proyecto Supabase) envía aquí los negocios que encontró y
// esta función crea un PERFIL BORRADOR por cada uno: usuario en Auth + fila en `profiles`,
// INACTIVO, plan ULTRA, con la plantilla que corresponde a su rubro.
//
// Seguridad: no usa JWT; se autentica con el secreto compartido `KODA_BRIDGE_SECRET`
// (cabecera `x-koda-secret`). KODA nunca recibe la service_role de Connexo.
//
// Los borradores NO reciben correo: `auth.admin.createUser` (a diferencia de `signUp`) no envía
// el correo de confirmación/bienvenida. Las credenciales solo salen cuando el negocio acepta.
//
// Acciones (todas con { v: 1 }):
//   { action: 'upsert', koda: {...}, negocio: {...} } → crea (o devuelve) el borrador
//   { action: 'status', items: [{ envio_id, koda_prospect_id }] } → estado actual de cada envío
//
// Despliegue (una sola vez):
//   1. supabase secrets set KODA_BRIDGE_SECRET=<el mismo valor que CONNEXO_BRIDGE_SECRET en KODA>
//   2. supabase functions deploy kodaIntake --no-verify-jwt --project-ref wxkqmotksjcjwhytodvx
//   Requiere haber ejecutado setup_koda_bridge.sql.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-koda-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VERSION_CONTRATO = 1;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const WHATSAPP_RE = /^\+5939\d{8}$/;
// Dominio propio para los correos sintéticos (nadie lee ese buzón; no se envía nada ahí).
const DOMINIO_SINTETICO = "prospectos.connexoapp.com";
// Rutas de la app que un username no puede pisar (`/:username` es el perfil público).
const USERNAMES_RESERVADOS = new Set([
  "auth", "dashboard", "admin", "api", "login", "registro", "signup", "superadmin", "assets", "public",
]);

// Excepciones por categoría: un rubro de KODA es más amplio que la plantilla de Connexo.
const SOBRE_CATEGORIA: { re: RegExp; theme: string }[] = [
  { re: /veterinar|pet.?shop|mascota/, theme: "petcare" },
  { re: /inmobiliar|estate.?agent|real.?estate|bienes.?raices/, theme: "realty" },
];

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

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

function slug(s: string): string {
  return sinAcentos(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function textoAleatorio(n: number, alfabeto: string): string {
  const b = crypto.getRandomValues(new Uint32Array(n));
  return Array.from(b, (x) => alfabeto[x % alfabeto.length]).join("");
}

const str = (v: unknown, max = 500): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};

function admin() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

type Admin = ReturnType<typeof admin>;

/** Plantilla (profiles.theme) que le toca a este negocio, o null si su rubro aún no tiene. */
async function resolverPlantilla(db: Admin, rubro: string | null, categoria: string | null): Promise<string | null> {
  const cat = sinAcentos(categoria ?? "").toLowerCase();
  for (const o of SOBRE_CATEGORIA) if (o.re.test(cat)) return o.theme;
  if (!rubro) return null;
  const { data } = await db.from("koda_rubro_plantilla").select("theme").eq("rubro", rubro).maybeSingle();
  return (data?.theme as string | null) ?? null;
}

/** Username público único: nombre, luego nombre-ciudad, luego nombre-2, nombre-3… */
async function usernameLibre(db: Admin, nombre: string, ciudad: string | null): Promise<string> {
  const base = (slug(nombre).slice(0, 40) || "negocio").replace(/^-+|-+$/g, "") || "negocio";
  const candidatos = [base];
  const c = ciudad ? slug(ciudad).slice(0, 20) : "";
  if (c) candidatos.push(`${base}-${c}`);
  for (let i = 2; i <= 9; i++) candidatos.push(`${base}-${i}`);
  candidatos.push(`${base}-${textoAleatorio(5, "abcdefghjkmnpqrstuvwxyz23456789")}`);

  for (const u of candidatos) {
    if (USERNAMES_RESERVADOS.has(u)) continue;
    const { data } = await db.from("profiles").select("id").eq("username", u).maybeSingle();
    if (!data) return u;
  }
  return `${base}-${textoAleatorio(8, "abcdefghjkmnpqrstuvwxyz23456789")}`;
}

function respuesta(fila: Json) {
  return {
    ok: true,
    estado: fila.estado,
    profile_id: fila.user_id ?? null,
    username: fila.username ?? null,
    theme: fila.theme ?? null,
    detalle: fila.detalle ?? null,
  };
}

async function upsertBorrador(db: Admin, body: Json): Promise<Response> {
  const k: Json = body.koda ?? {};
  const n: Json = body.negocio ?? {};

  if (typeof k.envio_id !== "string" || !UUID_RE.test(k.envio_id)) return json({ error: "koda.envio_id inválido." }, 400);
  if (typeof k.prospect_id !== "string" || !UUID_RE.test(k.prospect_id)) return json({ error: "koda.prospect_id inválido." }, 400);
  const nombre = str(n.nombre, 120);
  if (!nombre) return json({ error: "negocio.nombre es obligatorio." }, 400);
  const whatsapp = str(n.whatsapp, 20);
  if (!whatsapp || !WHATSAPP_RE.test(whatsapp)) return json({ error: "negocio.whatsapp debe ser un celular de Ecuador (+5939XXXXXXXX)." }, 400);

  // Idempotencia: KODA puede reintentar; un mismo prospecto nunca crea dos cuentas.
  const { data: previo, error: pErr } = await db
    .from("koda_prospectos")
    .select("*")
    .or(`koda_envio_id.eq.${k.envio_id},koda_prospect_id.eq.${k.prospect_id}`)
    .maybeSingle();
  if (pErr) return json({ error: pErr.message }, 500);
  if (previo?.user_id) return json(respuesta(previo));

  const rubro = str(n.rubro, 40);
  const categoria = str(n.categoria, 120);
  const theme = await resolverPlantilla(db, rubro, categoria);

  const comun = {
    koda_envio_id: k.envio_id,
    koda_prospect_id: k.prospect_id,
    koda_owner_email: str(k.owner_email, 200),
    koda_owner_nombre: str(k.owner_nombre, 200),
    busqueda_job_id: typeof k.busqueda?.job_id === "string" && UUID_RE.test(k.busqueda.job_id) ? k.busqueda.job_id : null,
    busqueda_nombre: str(k.busqueda?.nombre, 200),
    rubro,
    whatsapp,
    negocio: n,
    updated_at: new Date().toISOString(),
  };

  // Sin plantilla para su rubro (p. ej. Gimnasios/Hoteles hasta que existan): se registra y no se crea cuenta.
  if (!theme) {
    const fila = {
      ...comun, estado: "sin_plantilla", theme: null,
      detalle: `El rubro «${rubro ?? "sin rubro"}» todavía no tiene plantilla en Connexo.`,
    };
    const { data, error } = previo
      ? await db.from("koda_prospectos").update(fila).eq("id", previo.id).select("*").single()
      : await db.from("koda_prospectos").insert(fila).select("*").single();
    if (error) return json({ error: error.message }, 500);
    return json(respuesta(data));
  }

  // ── Cuenta borrador ──────────────────────────────────────────────────────
  const username = await usernameLibre(db, nombre, str(n.ciudad, 80));
  const emailKoda = str(n.email, 200)?.toLowerCase() ?? null;
  const sintetico = () => `p-${textoAleatorio(12, "abcdefghjkmnpqrstuvwxyz23456789")}@${DOMINIO_SINTETICO}`;
  let email = emailKoda && EMAIL_RE.test(emailKoda) ? emailKoda : sintetico();
  let emailReal = email === emailKoda;
  let nota: string | null = null;
  // Contraseña aleatoria que NADIE conoce: al aceptar, se genera y se entrega una nueva.
  const password = textoAleatorio(32, "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!#$%");
  const meta = { origen: "koda", koda: true, username, displayName: nombre, full_name: nombre };

  let creado = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: meta });
  if (creado.error && emailReal && /already|registered|exists/i.test(creado.error.message)) {
    // Ese correo ya tiene cuenta en Connexo: no se toca. Se usa uno sintético y se deja aviso.
    nota = `El correo ${email} ya tiene cuenta en Connexo; se creó el borrador con un correo interno.`;
    email = sintetico();
    emailReal = false;
    creado = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: meta });
  }
  if (creado.error || !creado.data.user) return json({ error: `No se pudo crear la cuenta: ${creado.error?.message ?? "sin detalle"}` }, 500);
  const uid = creado.data.user.id;

  const deshacer = async () => {
    await db.from("profiles").delete().eq("id", uid);
    await db.auth.admin.deleteUser(uid);
  };

  // Perfil INACTIVO: no se muestra en público hasta que el negocio acepte.
  const { error: perfErr } = await db.from("profiles").upsert({
    id: uid,
    email,
    username,
    displayName: nombre,
    plan: "ultra",
    theme,
    location: "EC",
    is_active: false,
  }, { onConflict: "id" });
  if (perfErr) {
    await deshacer();
    return json({ error: `No se pudo crear el perfil: ${perfErr.message}` }, 500);
  }

  const fila = { ...comun, user_id: uid, username, theme, estado: "borrador", detalle: nota, email_real: emailReal };
  const { data, error } = previo
    ? await db.from("koda_prospectos").update(fila).eq("id", previo.id).select("*").single()
    : await db.from("koda_prospectos").insert(fila).select("*").single();
  if (error) {
    await deshacer();
    return json({ error: error.message }, 500);
  }
  return json(respuesta(data));
}

async function estados(db: Admin, body: Json): Promise<Response> {
  const items: Json[] = Array.isArray(body.items) ? body.items.slice(0, 500) : [];
  const ids = items.map((i) => i?.envio_id).filter((x): x is string => typeof x === "string" && UUID_RE.test(x));
  if (!ids.length) return json({ ok: true, items: [] });

  const { data, error } = await db
    .from("koda_prospectos")
    .select("koda_envio_id, koda_prospect_id, estado, user_id, username, theme, detalle, opt_out")
    .in("koda_envio_id", ids);
  if (error) return json({ error: error.message }, 500);

  return json({
    ok: true,
    items: (data ?? []).map((f) => ({
      envio_id: f.koda_envio_id,
      koda_prospect_id: f.koda_prospect_id,
      estado: f.estado,
      profile_id: f.user_id,
      username: f.username,
      theme: f.theme,
      detalle: f.detalle,
      opt_out: f.opt_out,
    })),
  });
}

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
    if (body.action === "upsert") return await upsertBorrador(db, body);
    if (body.action === "status") return await estados(db, body);
    return json({ error: "Acción desconocida." }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
