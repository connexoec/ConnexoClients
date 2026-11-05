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
//   { action: 'rellenar', envio_id } → vuelve a llenar un borrador con KODA + banco de recursos
//   { action: 'detalle', envio_id } → qué se llenó y de dónde salió cada dato
//   { action: 'estado_set', envio_id, estado } → revisión desde KODA: borrador↔aprobado, descartar y restaurar
//
// El WhatsApp, la aceptación y el vencimiento NO se mueven desde aquí: los maneja Connexo (SuperAdmin).
//
// Fase 2: al crear el borrador se completa el perfil. KODA manda (nombre, dirección, teléfono, WhatsApp,
// redes, correo, calificación); el banco (tabla koda_recursos_nicho, setup_koda_recursos.sql) pone lo que
// KODA no trae: look, fotos del local, catálogo de ejemplo, horario tipo y textos genéricos.
//
// Despliegue (una sola vez):
//   1. supabase secrets set KODA_BRIDGE_SECRET=<el mismo valor que CONNEXO_BRIDGE_SECRET en KODA>
//   2. supabase functions deploy kodaIntake --no-verify-jwt --project-ref wxkqmotksjcjwhytodvx
//   Requiere haber ejecutado setup_koda_bridge.sql y setup_koda_recursos.sql.
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
  { re: /veterinar|pet.?(shop|store)|mascota/, theme: "petcare" },
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

/** Nicho del banco de recursos (koda_recursos_nicho.clave) que le toca a este negocio. */
function claveDePack(rubro: string | null, categoria: string | null): string | null {
  const cat = sinAcentos(categoria ?? "").toLowerCase();
  if (/veterinar/.test(cat)) return "veterinaria";
  if (/pet.?(shop|store)|mascota/.test(cat)) return "mascotas";
  if (/inmobiliar|estate.?agent|real.?estate|bienes.?raices/.test(cat)) return "inmobiliaria";
  if (rubro === "belleza") return /barber/.test(cat) ? "barberia" : "belleza";
  if (rubro === "salud") return /doctor|clinic|hospital|medic|physio|fisio|dentist|dental|odontolog/.test(cat) ? "clinica" : "salud";
  return rubro;
}

/** Plantilla (profiles.theme) y nicho del banco que le tocan a este negocio; theme null si su rubro aún no tiene. */
async function resolverPlantilla(
  db: Admin, rubro: string | null, categoria: string | null,
): Promise<{ theme: string | null; clave: string | null }> {
  const clave = claveDePack(rubro, categoria);
  const cat = sinAcentos(categoria ?? "").toLowerCase();
  for (const o of SOBRE_CATEGORIA) if (o.re.test(cat)) return { theme: o.theme, clave };
  if (!rubro) return { theme: null, clave };
  const { data } = await db.from("koda_rubro_plantilla").select("theme").eq("rubro", rubro).maybeSingle();
  return { theme: (data?.theme as string | null) ?? null, clave };
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
    clave: fila.clave ?? null,
  };
}

// ── Relleno del perfil (Fase 2) ──────────────────────────────────────────────
// KODA manda sobre el banco: nombre, dirección, teléfono, WhatsApp, redes, correo y calificación de
// Google se usan siempre. El banco (tabla koda_recursos_nicho) solo completa lo que KODA no trae:
// look, fotos del local, catálogo de EJEMPLO, horario tipo y textos genéricos.

type Origen = "koda" | "banco" | "mixto";
type TablaSemilla = { tabla: string; propietario: string; filas: Json[] };
type Paquete = {
  logo?: { etiqueta?: string; fondo?: string; acento?: string; texto?: string };
  copy?: { jobTitle?: string; bio?: string; aboutMe?: string };
  perfil?: Json;
  tablas?: TablaSemilla[];
};
type Vars = { nombre: string; ciudad: string | null; ubicacion: string; username: string; wa593: string };

// Tablas propias de las plantillas que el banco puede sembrar (contenido de ejemplo, no transacciones).
const TABLAS_SEMBRABLES = new Set([
  "barber_staff", "ecom_staff", "realty_agents", "realty_properties",
  "gym_plans", "gym_coaches", "gym_classes", "hotel_rooms", "hotel_services",
]);

// Estas plantillas muestran una «prueba social» propia; en las demás la calificación va al final de la bio.
const PLANTILLAS_CON_PRUEBA_SOCIAL = new Set(["gastro", "petcare", "medical"]);
const HEX_RE = /^#[0-9a-f]{3,8}$/i;
const PALABRAS_VACIAS = new Set(["de", "del", "la", "el", "los", "las", "y", "e", "en", "the", "and"]);

/** Cambia {{nombre}}, {{ciudad}}, {{ubicacion}}, {{username}} y {{wa593}}; sin ciudad, «en {{ciudad}}» desaparece. */
function sustituir(valor: unknown, vars: Vars): unknown {
  if (typeof valor === "string") {
    if (!valor.includes("{{")) return valor;
    let s = valor.split("{{nombre}}").join(vars.nombre);
    s = vars.ciudad ? s.split("{{ciudad}}").join(vars.ciudad) : s.replace(/\s+en \{\{ciudad\}\}/g, "").split("{{ciudad}}").join("");
    return s.split("{{ubicacion}}").join(vars.ubicacion).split("{{username}}").join(vars.username).split("{{wa593}}").join(vars.wa593);
  }
  if (Array.isArray(valor)) return valor.map((v) => sustituir(v, vars));
  if (valor && typeof valor === "object") {
    return Object.fromEntries(Object.entries(valor as Json).map(([k, v]) => [k, sustituir(v, vars)]));
  }
  return valor;
}

// ── Contraste (WCAG 2.x). Copia de supabase/koda-recursos/paleta.mjs: si cambias una regla, cámbiala en los dos. ──
const ACENTO_MIN = 6.5;   // el acento se usa también como TEXTO sobre el fondo oscuro y sobre superficies teñidas
const BOTON_MIN = 4.5;    // texto de botón sobre el acento
const TEXTO_MIN = 7;      // texto de la página sobre el fondo
const esHex = (s: unknown): s is string => typeof s === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s.trim());
function aRgb(hex: string): number[] {
  let h = hex.trim().slice(1);
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
const aHex = (rgb: number[]) => "#" + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
function luminancia(hex: string): number {
  const [r, g, b] = aRgb(hex).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function razon(a: string, b: string): number {
  const x = luminancia(a), y = luminancia(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function mezclar(a: string, b: string, t: number): string {
  const x = aRgb(a), y = aRgb(b);
  return aHex(x.map((v, i) => v + (y[i] - v) * t));
}
/** Aclara `hex` (hacia blanco, mismo tono) hasta que contraste >= minimo con `fondo`. */
function aclarar(hex: string, fondo: string, minimo: number): string {
  if (razon(hex, fondo) >= minimo) return hex.toLowerCase();
  for (let t = 0.02; t <= 1.0001; t += 0.02) {
    const c = mezclar(hex, "#ffffff", t);
    if (razon(c, fondo) >= minimo) return c;
  }
  return "#ffffff";
}
/** Primer candidato con contraste suficiente sobre `fondo`; si ninguno llega, el mejor entre ellos, negro y blanco. */
function textoSobre(fondo: string, candidatos: unknown[], minimo = BOTON_MIN): string {
  const lista = candidatos.filter(esHex).map((c) => c.toLowerCase());
  for (const c of lista) if (razon(c, fondo) >= minimo) return c;
  return [...lista, "#000000", "#ffffff"].reduce((m, c) => (razon(c, fondo) > razon(m, fondo) ? c : m));
}
/** Devuelve solo lo que hay que cambiar en la paleta del paquete para que se lea (acento, texto de botón, texto). */
function sanearPaleta(p: Json): Json {
  const fondo = p.backgroundColor;
  if (!esHex(fondo)) return {};
  const salida: Json = {};
  if (esHex(p.buttonColor)) {
    const acento = aclarar(p.buttonColor, fondo, ACENTO_MIN);
    if (acento !== p.buttonColor.toLowerCase()) salida.buttonColor = acento;
    const bt = textoSobre(acento, [p.buttonTextColor, fondo, "#0b0b0b"]);
    if (bt !== String(p.buttonTextColor ?? "").toLowerCase()) salida.buttonTextColor = bt;
  }
  if (esHex(p.textColor) && razon(p.textColor, fondo) < TEXTO_MIN) salida.textColor = textoSobre(fondo, ["#ffffff"], TEXTO_MIN);
  return salida;
}

/** Logo provisional con las iniciales del negocio: degradado OSCURO y texto/rótulo con contraste suficiente. */
function logoSvg(nombre: string, etiqueta: string, fondo?: string, acento?: string, texto?: string): string {
  const f = fondo && HEX_RE.test(fondo) ? fondo : "#111111";
  const a0 = acento && HEX_RE.test(acento) ? acento : "#ff6b35";
  const extremo = mezclar(f, a0, 0.2);                  // el degradado termina en fondo + 20 % de acento
  const a = aclarar(a0, f, 4.5);                        // el rótulo va en el acento
  const peorRazon = (c: string) => Math.min(razon(c, f), razon(c, extremo));
  const candidatos = [texto, "#ffffff", "#000000"].filter(esHex).map((c) => c.toLowerCase());
  const t = candidatos.find((c) => peorRazon(c) >= 7) ?? candidatos.reduce((m, c) => (peorRazon(c) > peorRazon(m) ? c : m));
  const palabras = nombre.split(/[\s&\-_/.,]+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((w) => w && !PALABRAS_VACIAS.has(sinAcentos(w).toLowerCase()));
  const iniciales = (palabras.length > 1 ? palabras.slice(0, 3).map((w) => w[0]).join("") : (palabras[0] ?? nombre).slice(0, 2))
    .toUpperCase().slice(0, 3);
  const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const rotulo = etiqueta
    ? `<text x="256" y="370" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="30" font-weight="700" fill="${a}" letter-spacing="7">${xml(etiqueta.slice(0, 14))}</text>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${f}"/><stop offset="1" stop-color="${a}" stop-opacity=".2"/></linearGradient></defs>` +
    `<rect width="512" height="512" rx="256" fill="url(#g)"/>` +
    `<rect x="26" y="26" width="460" height="460" rx="230" fill="none" stroke="${a}" stroke-width="7" opacity=".9"/>` +
    `<text x="256" y="${etiqueta ? 292 : 310}" text-anchor="middle" font-family="Georgia,'Times New Roman',serif" font-size="${iniciales.length > 2 ? 118 : 150}" font-weight="700" fill="${t}" letter-spacing="2">${xml(iniciales)}</text>` +
    `${rotulo}</svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

/** URL de una red social o web a partir de lo que trajo KODA (URL completa, @usuario o dominio). */
function urlRed(v: unknown, red: "instagram" | "facebook" | "tiktok" | "website"): string | null {
  const t = str(v, 300);
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return null;   // javascript:, mailto:, etc.
  const h = t.replace(/^@/, "");
  if (red === "instagram" && /^[\w.]+$/.test(h)) return `https://instagram.com/${h}`;
  if (red === "facebook" && /^[\w.\-]+$/.test(h)) return `https://facebook.com/${h}`;
  if (red === "tiktok" && /^[\w.]+$/.test(h)) return `https://tiktok.com/@${h}`;
  if (/^[^\s/]+\.[^\s]{2,}/.test(t)) return `https://${t}`;
  return null;
}

function frasePuntaje(rating: unknown, resenas: unknown): string | null {
  const r = typeof rating === "number" ? rating : Number(rating);
  if (!Number.isFinite(r) || r <= 0 || r > 5) return null;
  const c = Math.round(Number(resenas));
  const base = `⭐ ${r.toFixed(1)} en Google`;
  return Number.isFinite(c) && c > 0 ? `${base} (${c} ${c === 1 ? "reseña" : "reseñas"})` : base;
}

async function cargarPaquete(db: Admin, clave: string | null): Promise<Paquete | null> {
  if (!clave) return null;
  const { data } = await db.from("koda_recursos_nicho").select("pack").eq("clave", clave).maybeSingle();
  return (data?.pack as Paquete | undefined) ?? null;
}

/**
 * Siembra las tablas propias de la plantilla (planes y clases, habitaciones, propiedades, equipo…).
 * Los ids del banco son locales: se reasignan, y las referencias entre tablas (p. ej. clases → entrenador)
 * se corrigen. Primero se borra lo que ESTE borrador ya tuviera (reintentos sin duplicar), de atrás hacia delante.
 */
async function sembrarTablas(db: Admin, uid: string, tablas: TablaSemilla[], vars: Vars): Promise<Record<string, number>> {
  for (const t of tablas) {
    if (!TABLAS_SEMBRABLES.has(t.tabla) || !/^[a-z_]+$/.test(t.propietario)) throw new Error(`tabla no permitida: ${t.tabla}`);
  }
  const ids = new Map<string, string>();
  for (const t of tablas) for (const f of t.filas) if (typeof f.id === "string") ids.set(f.id, crypto.randomUUID());

  for (const t of [...tablas].reverse()) {
    const { error } = await db.from(t.tabla).delete().eq(t.propietario, uid);
    if (error) throw new Error(`${t.tabla}: ${error.message}`);
  }
  const hechas: Record<string, number> = {};
  for (const t of tablas) {
    const filas = t.filas.map((f) => {
      const o: Json = {};
      for (const [k, v] of Object.entries(sustituir(f, vars) as Json)) o[k] = typeof v === "string" && ids.has(v) ? ids.get(v) : v;
      o[t.propietario] = uid;
      return o;
    });
    if (!filas.length) continue;
    const { error } = await db.from(t.tabla).insert(filas);
    if (error) throw new Error(`${t.tabla}: ${error.message}`);
    hechas[t.tabla] = filas.length;
  }
  return hechas;
}

/** Completa el perfil con lo de KODA + el banco, y arma sus enlaces. Devuelve de dónde salió cada campo. */
async function rellenarPerfil(
  db: Admin, uid: string, theme: string, clave: string | null, n: Json, username: string,
): Promise<Json> {
  const nombre = str(n.nombre, 120);
  if (!nombre) throw new Error("El negocio no tiene nombre.");
  const ciudad = str(n.ciudad, 80);
  const paquete = await cargarPaquete(db, clave);
  const waKoda = str(n.whatsapp, 20);
  const vars: Vars = {
    nombre, ciudad, username,
    ubicacion: ciudad ?? "Ecuador",
    wa593: waKoda && WHATSAPP_RE.test(waKoda) ? waKoda.slice(1) : "",
  };
  const banco = (paquete?.perfil ? sustituir(paquete.perfil, vars) : {}) as Json;
  Object.assign(banco, sanearPaleta(banco));   // contraste: aunque el paquete guardado sea antiguo, la paleta que se aplica se lee
  const copy = (paquete?.copy ? sustituir(paquete.copy, vars) : {}) as Json;

  const cols: Json = {};
  const origen: Record<string, Origen> = {};
  const poner = (k: string, v: unknown, de: Origen) => {
    if (v === undefined || v === null || v === "") return;
    cols[k] = v;
    origen[k] = de;
  };

  // 1) Banco: look, fotos, catálogo de ejemplo, horario tipo, textos genéricos.
  for (const [k, v] of Object.entries(banco)) poner(k, v, "banco");
  for (const k of ["jobTitle", "bio", "aboutMe"]) poner(k, copy[k], "banco");

  // 2) KODA: manda sobre el banco.
  poner("displayName", nombre, "koda");
  poner("company", nombre, "koda");
  const direccion = str(n.direccion, 300) ?? str(n.ciudad, 120);
  if (direccion) { poner("location", direccion, "koda"); poner("locations", [direccion], "koda"); }
  poner("phone", str(n.telefono, 30), "koda");
  const wa = str(n.whatsapp, 20);
  if (wa && WHATSAPP_RE.test(wa)) poner("whatsapp", "0" + wa.slice(4), "koda");   // +593991234567 → 0991234567
  const correo = str(n.email, 200)?.toLowerCase();
  if (correo && EMAIL_RE.test(correo)) poner("contactEmail", correo, "koda");

  const redes: Record<string, string> = {};
  for (const r of ["instagram", "facebook", "tiktok", "website"] as const) {
    const u = urlRed(n[r], r);
    if (u) redes[r] = u;
  }
  if (Object.keys(redes).length) poner("socialMedia", redes, "koda");

  const descripcion = str(n.descripcion, 300);
  if (descripcion) poner("bio", descripcion, "koda");
  const puntaje = frasePuntaje(n.rating, n.reviews_count);
  if (puntaje) {
    if (PLANTILLAS_CON_PRUEBA_SOCIAL.has(theme)) poner("socialProof", puntaje, "koda");
    else poner("bio", `${cols.bio ? cols.bio + " " : ""}${puntaje}`, cols.bio && origen.bio === "banco" ? "mixto" : "koda");
  }

  // 3) Logo provisional con las iniciales.
  poner("logoURL", logoSvg(nombre, paquete?.logo?.etiqueta ?? "", paquete?.logo?.fondo, paquete?.logo?.acento, paquete?.logo?.texto), "banco");

  const { error } = await db.from("profiles").update(cols).eq("id", uid);
  if (error) throw new Error(`perfil: ${error.message}`);

  // 4) Enlaces del perfil, con los datos reales de KODA.
  const enlaces: { title: string; url: string }[] = [];
  if (wa && WHATSAPP_RE.test(wa)) {
    enlaces.push({ title: "Escríbenos por WhatsApp", url: `https://wa.me/${wa.slice(1)}?text=${encodeURIComponent("Hola, vi tu perfil y quisiera más información.")}` });
  }
  const mapa = str(n.google_maps_url, 500);
  if (mapa && /^https?:\/\//i.test(mapa)) enlaces.push({ title: "Ubicación en Google Maps", url: mapa });
  if (redes.instagram) enlaces.push({ title: "Síguenos en Instagram", url: redes.instagram });
  if (redes.facebook) enlaces.push({ title: "Síguenos en Facebook", url: redes.facebook });
  if (redes.tiktok) enlaces.push({ title: "Síguenos en TikTok", url: redes.tiktok });
  if (redes.website) enlaces.push({ title: "Visita nuestra página web", url: redes.website });

  const { error: delErr } = await db.from("links").delete().eq("userId", uid);   // solo los de este borrador
  if (delErr) throw new Error(`enlaces: ${delErr.message}`);
  if (enlaces.length) {
    const { error: insErr } = await db.from("links").insert(
      enlaces.map((e, i) => ({ userId: uid, title: e.title, url: e.url, isActive: true, order: i, clickCount: 0 })),
    );
    if (insErr) throw new Error(`enlaces: ${insErr.message}`);
  }
  // 5) Tablas propias de la plantilla (contenido de ejemplo).
  const tablas = paquete?.tablas?.length ? await sembrarTablas(db, uid, paquete.tablas, vars) : {};
  return { paquete: paquete ? clave : null, campos: origen, enlaces: enlaces.length, tablas };
}

/** Rellena y guarda el resultado en koda_prospectos. Nunca lanza: si falla, el borrador queda y se avisa en `detalle`. */
async function aplicarRelleno(
  db: Admin, fila: Json, uid: string, theme: string, clave: string | null, n: Json, username: string,
): Promise<{ ok: boolean; fila: Json }> {
  const ahora = new Date().toISOString();
  const previo = typeof fila.detalle === "string" ? fila.detalle.replace(/^Relleno incompleto:[^·]*(· )?/, "").trim() : "";
  try {
    const relleno = await rellenarPerfil(db, uid, theme, clave, n, username);
    const { data, error } = await db.from("koda_prospectos")
      .update({ clave, relleno, detalle: previo || null, updated_at: ahora }).eq("id", fila.id).select("*").single();
    if (error) throw new Error(error.message);
    return { ok: true, fila: data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const detalle = `Relleno incompleto: ${msg}${previo ? ` · ${previo}` : ""}`;
    const { data } = await db.from("koda_prospectos").update({ detalle, updated_at: ahora }).eq("id", fila.id).select("*").maybeSingle();
    return { ok: false, fila: data ?? { ...fila, detalle } };
  }
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
  const { theme, clave } = await resolverPlantilla(db, rubro, categoria);

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
    location: str(n.direccion, 300) ?? str(n.ciudad, 120) ?? "Ecuador",
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

  // Fase 2: completar el perfil con lo de KODA + el banco de recursos. Si falla, el borrador queda y se avisa.
  const relleno = await aplicarRelleno(db, data, uid, theme, clave, n, username);
  return json({ ...respuesta(relleno.fila), relleno_ok: relleno.ok });
}

/** Vuelve a llenar un borrador (p. ej. tras corregir el banco). Solo mientras siga en `borrador`. */
async function rellenarBorrador(db: Admin, body: Json): Promise<Response> {
  const envio = body.envio_id;
  if (typeof envio !== "string" || !UUID_RE.test(envio)) return json({ error: "envio_id inválido." }, 400);
  const { data: fila, error } = await db.from("koda_prospectos").select("*").eq("koda_envio_id", envio).maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!fila) return json({ error: "Ese envío no existe." }, 404);
  if (!fila.user_id || !fila.theme) return json({ error: "Ese envío no tiene cuenta borrador." }, 409);
  if (fila.estado !== "borrador") return json({ error: `Solo se puede rellenar un borrador (estado actual: ${fila.estado}).` }, 409);

  const negocio: Json = fila.negocio ?? {};
  const clave = claveDePack(fila.rubro ?? null, str(negocio.categoria, 120));
  const res = await aplicarRelleno(db, fila, fila.user_id, fila.theme, clave, negocio, fila.username ?? "");
  return json({ ...respuesta(res.fila), relleno_ok: res.ok, relleno: res.fila.relleno ?? null });
}

/** Resumen corto de lo que se llenó: cuántos datos vienen de KODA y cuántos son de ejemplo. */
function resumenRelleno(r: Json | null | undefined): Json | null {
  if (!r) return null;
  const vals = Object.values((r.campos ?? {}) as Record<string, string>);
  const n = (o: string) => vals.filter((v) => v === o).length;
  return { paquete: r.paquete ?? null, koda: n("koda"), banco: n("banco"), mixto: n("mixto"), enlaces: Number(r.enlaces ?? 0), tablas: r.tablas ?? {} };
}

async function estados(db: Admin, body: Json): Promise<Response> {
  const items: Json[] = Array.isArray(body.items) ? body.items.slice(0, 500) : [];
  const ids = items.map((i) => i?.envio_id).filter((x): x is string => typeof x === "string" && UUID_RE.test(x));
  if (!ids.length) return json({ ok: true, items: [] });

  const { data, error } = await db
    .from("koda_prospectos")
    .select("koda_envio_id, koda_prospect_id, estado, user_id, username, theme, detalle, opt_out, clave, relleno")
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
      clave: f.clave ?? null,
      relleno_resumen: resumenRelleno(f.relleno),
    })),
  });
}

/** Qué se llenó en un borrador y de dónde salió cada dato (para la pantalla de revisión). */
async function detalleBorrador(db: Admin, body: Json): Promise<Response> {
  const envio = body.envio_id;
  if (typeof envio !== "string" || !UUID_RE.test(envio)) return json({ error: "envio_id inválido." }, 400);
  const { data: fila, error } = await db.from("koda_prospectos").select("*").eq("koda_envio_id", envio).maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!fila) return json({ error: "Ese envío no existe." }, 404);
  return json({ ...respuesta(fila), relleno: fila.relleno ?? null, opt_out: fila.opt_out ?? false });
}

// Pasos que KODA puede dar sobre un borrador (revisión). Todo lo demás del embudo —enviar el WhatsApp,
// que el negocio acepte o decline, que venza— lo maneja Connexo.
const PASOS_DESDE_KODA: Record<string, string[]> = {
  borrador: ["aprobado", "descartado"],
  aprobado: ["borrador", "descartado"],
  descartado: ["borrador"],
};

async function cambiarEstado(db: Admin, body: Json): Promise<Response> {
  const envio = body.envio_id;
  const nuevo = body.estado;
  if (typeof envio !== "string" || !UUID_RE.test(envio)) return json({ error: "envio_id inválido." }, 400);
  if (typeof nuevo !== "string") return json({ error: "Falta el estado." }, 400);
  const { data: fila, error } = await db.from("koda_prospectos").select("*").eq("koda_envio_id", envio).maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!fila) return json({ error: "Ese envío no existe." }, 404);
  if (!(PASOS_DESDE_KODA[fila.estado] ?? []).includes(nuevo)) {
    return json({ error: `Desde KODA no se puede pasar de «${fila.estado}» a «${nuevo}». Ese paso lo hace Connexo.` }, 409);
  }
  if (nuevo === "borrador" && !fila.user_id) return json({ error: "Ese envío no tiene cuenta borrador." }, 409);

  const { data, error: uErr } = await db.from("koda_prospectos")
    .update({ estado: nuevo, updated_at: new Date().toISOString() }).eq("id", fila.id).select("*").single();
  if (uErr) return json({ error: uErr.message }, 500);
  return json(respuesta(data));
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
    if (body.action === "rellenar") return await rellenarBorrador(db, body);
    if (body.action === "detalle") return await detalleBorrador(db, body);
    if (body.action === "estado_set") return await cambiarEstado(db, body);
    return json({ error: "Acción desconocida." }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
