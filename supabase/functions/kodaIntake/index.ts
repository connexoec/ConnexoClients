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
//   { action: 'lote_set', lote: { id, numero, nombre }, envio_ids } → asigna (o renombra) el LOTE de varios envíos a la vez
//
// Lotes (setup_koda_lotes.sql): cada envío llega con `koda.lote` = { id, numero, nombre }; así el SuperAdmin ve los negocios
// agrupados igual que en KODA. Un celular NUNCA recibe dos perfiles ni dos saludos: si otro negocio con el mismo celular ya
// está en marcha, el nuevo se registra como «descartado» (duplicado) y no se crea cuenta.
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
// Correo interno de acceso cuando KODA no trae uno real: <usuario>@connexoapp.com (corto y con el nombre del negocio, para que
// se vea confiable). No es un buzón real: nunca se envía nada ahí. Los borradores viejos (p-xxxx@prospectos.connexoapp.com)
// se renombran a este formato cuando el negocio acepta (ver kodaWhatsApp).
const DOMINIO_SINTETICO = "connexoapp.com";
// Buzones de rol que podrían existir de verdad en connexoapp.com: un negocio con ese nombre recibe «-perfil».
const BUZONES_RESERVADOS = new Set([
  "admin", "administrador", "info", "hola", "hello", "contacto", "contact", "ventas", "sales", "soporte", "support", "ayuda",
  "help", "noreply", "no-reply", "postmaster", "abuse", "webmaster", "root", "security", "seguridad", "billing", "pagos",
  "facturacion", "marketing", "prensa", "rrhh", "empleo", "trabajo", "connexo", "connexoec", "koda",
]);
const correoInterno = (username: string): string => {
  const base = username.slice(0, 40);
  return `${BUZONES_RESERVADOS.has(base) ? `${base}-perfil` : base}@${DOMINIO_SINTETICO}`;
};
// Rutas de la app que un username no puede pisar (`/:username` es el perfil público).
const USERNAMES_RESERVADOS = new Set([
  "auth", "dashboard", "admin", "api", "login", "registro", "signup", "superadmin", "assets", "public",
]);

// Fotografía (sin acentos y en minúsculas). «photograph» cubre photographer, photography y photography_studio; «fotograf», fotógrafo/fotografía.
const FOTO_RE = /photograph|photo.?(studio|lab)|portrait.?studio|fotograf|foto.?estudio|estudio.?foto|laboratorio.?foto/;

// Excepciones por categoría: un rubro de KODA es más amplio que la plantilla de Connexo.
const SOBRE_CATEGORIA: { re: RegExp; theme: string; conNombre?: boolean }[] = [
  { re: /veterinar|pet.?(shop|store)|mascota/, theme: "petcare" },
  { re: /inmobiliar|estate.?agent|real.?estate|bienes.?raices/, theme: "realty" },
  // Fotógrafos y estudios fotográficos: por categoría de Google (photographer, photography_studio, wedding_photographer, photo_lab,
  // portrait_studio…) o por el NOMBRE («Edward López Fotografía», «Estudio Fotográfico Esteves»). Una tienda de cámaras o de fotocopias NO entra.
  { re: FOTO_RE, theme: "photo", conNombre: true },
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

/** El lote que manda KODA ({ id, numero, nombre }), o null si no trae uno válido. */
function leerLote(x: unknown): { id: string; numero: number; nombre: string | null } | null {
  const l = x as Json | null | undefined;
  if (!l || typeof l.id !== "string" || !UUID_RE.test(l.id)) return null;
  const numero = Number(l.numero);
  if (!Number.isInteger(numero) || numero < 1 || numero > 100000) return null;
  return { id: l.id, numero, nombre: str(l.nombre, 80) };
}

function admin() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

type Admin = ReturnType<typeof admin>;

/** Nicho del banco de recursos (koda_recursos_nicho.clave) que le toca a este negocio. */
function claveDePack(rubro: string | null, categoria: string | null, nombre: string | null = null): string | null {
  const cat = sinAcentos(categoria ?? "").toLowerCase();
  // Escuelas y academias de música: la plantilla Artista CON horario de clases (las bandas, DJ y estudios siguen con «musicos»).
  if (rubro === "musicos" && /music.?school|educational|school|escuela|academia|conservatorio/.test(`${cat} ${sinAcentos(nombre ?? "").toLowerCase()}`)) {
    return "academia_musica";
  }
  // Fotógrafos y estudios fotográficos: la plantilla Fotografía (aunque KODA los clasifique como «profesionales»).
  if (FOTO_RE.test(`${cat} ${sinAcentos(nombre ?? "").toLowerCase()}`)) return "fotografia";
  if (/veterinar/.test(cat)) return "veterinaria";
  if (/pet.?(shop|store)|mascota/.test(cat)) return "mascotas";
  if (/inmobiliar|estate.?agent|real.?estate|bienes.?raices/.test(cat)) return "inmobiliaria";
  if (rubro === "belleza") return /barber/.test(cat) ? "barberia" : "belleza";
  // Regla del dueño (2026-11-13): a cada negocio, el contenido de SU subnicho (un café con cosas de café, un dentista con tratamientos
  // dentales…), no el del rubro en general.
  const texto = `${cat} ${sinAcentos(nombre ?? "").toLowerCase()}`;
  if (rubro === "musicos" && /mariachi|serenata/.test(texto)) return "mariachi";
  if (rubro === "restaurantes" || rubro === "cafe_bar") return subnichoGastro(rubro, cat, texto);
  if (rubro === "salud") {
    if (/nutri|dietist/.test(texto)) return "nutricion";
    if (/psicolog|psicoterap|terapeut|psychologist|psychotherap|therapist|counsel/.test(texto)) return "psicologia";
    if (/dental|dentist|odontolog|ortodon/.test(texto)) return "odontologia";
    return /doctor|clinic|hospital|medic|physio|fisio/.test(cat) ? "clinica" : "salud";
  }
  return rubro;
}

/** Gastronomía: cafetería (cafés, desayunos, pastelería), bar (bares, pubs, discotecas) o la carta general del rubro. */
function subnichoGastro(rubro: string, cat: string, texto: string): string {
  const esRestaurante = /restaurant|grill|steak|pizz|seafood|sushi|parrill|asador|cevich|marisq/.test(cat);
  if (/coffee|(^|_)cafe($|_)|cafeteria|tea.?house|bakery|pasteler|breakfast|brunch|desayun|panader/.test(cat)) return "cafeteria";
  if (/(^|_)(bar|pub|night.?club|biergarten|lounge|brewery)($|_)|discoteca|cerveceria|cocktail|wine.?bar/.test(cat) && !esRestaurante) return "bar";
  // Categoría genérica (un restaurante de Google que en realidad es un café, o un «bar» sin tipo): manda el NOMBRE.
  if (!/ice.?cream|helader/.test(cat)) {
    if (/\bcafe\b|cafeteria|cafecito|coffee|cafebreria|brunch|desayuno|pasteleria|panaderia|chocolater/.test(texto)) return "cafeteria";
    if (!esRestaurante && /\bbar\b|\bpub\b|cerveceria|resto ?bar|lounge|discoteca|karaoke/.test(texto)) return "bar";
  }
  return rubro;
}

/** Plantilla (profiles.theme) y nicho del banco que le tocan a este negocio; theme null si su rubro aún no tiene. */
async function resolverPlantilla(
  db: Admin, rubro: string | null, categoria: string | null, nombre: string | null = null,
): Promise<{ theme: string | null; clave: string | null }> {
  const clave = claveDePack(rubro, categoria, nombre);
  const cat = sinAcentos(categoria ?? "").toLowerCase();
  const texto = `${cat} ${sinAcentos(nombre ?? "").toLowerCase()}`;
  for (const o of SOBRE_CATEGORIA) if (o.re.test(o.conNombre ? texto : cat)) return { theme: o.theme, clave };
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
  "sublima_products", "books_titles", "stage_classes", "photo_works", "photo_packages", "photo_team",
]);

// Estas plantillas muestran una «prueba social» propia; en las demás la calificación va al final de la bio.
const PLANTILLAS_CON_PRUEBA_SOCIAL = new Set(["gastro", "petcare", "medical"]);

// Redes sociales (regla del dueño, 2026-11-13): el perfil se ve MÁS atractivo con TODOS los iconos llenos, así que lo que KODA no trae se
// rellena con un enlace vacío (la portada de la red) para que el negocio vea, al abrir su prueba, todo lo que puede conectar.
// Cada plantilla dibuja las redes a su manera: estas 9 pintan una fila de iconos desde `profiles.socialMedia` (las otras 4 —gym, hotel,
// fotografía y librería— solo muestran la lista de `links`, y ahí van los enlaces de redes).
const PLANTILLAS_CON_ICONOS_DE_REDES = new Set(["barber", "ecom", "gastro", "medical", "petcare", "default", "stage", "realty", "sublima"]);
// De esas, estas arman la URL de Instagram, TikTok y X a partir del @usuario (instagram.com/<usuario>): con una URL completa el enlace
// salía roto («instagram.com/https://instagram.com/…»). Stage, Realty y Sublima usan el enlace tal cual.
const PLANTILLAS_REDES_POR_USUARIO = new Set(["barber", "ecom", "gastro", "medical", "petcare", "default"]);
const REDES_ICONOS = ["instagram", "facebook", "tiktok", "youtube", "twitter", "linkedin", "website"] as const;

function usuarioDeRed(url: string, red: string): string | null {
  const re = red === "instagram" ? /instagram\.com\/([^/?#\s]+)/i : red === "tiktok" ? /tiktok\.com\/@?([^/?#\s]+)/i : /(?:twitter|x)\.com\/@?([^/?#\s]+)/i;
  const m = url.match(re);
  return m ? m[1].replace(/^@/, "") : null;
}

/**
 * Ciudad para los textos del perfil («Café recién hecho en {{ciudad}}»). \`negocio.ciudad\` de KODA suele ser basura —el primer trozo de la
 * dirección de Google («8VXG+P38», «Ofi 608», «Agustín Cueva y Ines Salcedo &»)—, y así quedaban textos como «Cuidamos tu salud en Ofi 608».
 * La ciudad de verdad va al final de la dirección («…, Ibarra», «…, 170135 Quito»): se toma de ahí; si no se puede, mejor sin ciudad (la
 * frase «en {{ciudad}}» desaparece) que con un dato roto.
 */
function ciudadDe(n: Json): string | null {
  const LETRAS = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ .'-]{2,29}$/;
  const dir = str(n.direccion, 300);
  if (dir) {
    const partes = dir.split(",").map((p) => p.trim()).filter((p) => p && !/^ecuador$/i.test(p));
    const ultima = (partes.at(-1) ?? "").replace(/^\d{4,}\s*/, "").replace(/\s*\d{4,}$/, "").trim();
    if (partes.length > 1 && LETRAS.test(ultima) && !/\b(av|avenida|calle|y|oe|ne|no|n|s)\b\.?$/i.test(ultima)) return ultima;
  }
  const c = str(n.ciudad, 80);
  return c && LETRAS.test(c) && !/\b(av|avenida|calle|pasaje|y|e|oe|ne|no|ofi|piso|local|km)\b/i.test(c) && !/\d/.test(c) ? c : null;
}

/** Las 7 redes del perfil: las reales de KODA y, donde falten, un enlace vacío. `propias` = cuántas son reales. */
function armarRedes(theme: string, reales: Record<string, string>, username: string): { redes: Record<string, string>; propias: number } {
  const porUsuario = PLANTILLAS_REDES_POR_USUARIO.has(theme);
  const vacias: Record<string, string> = {
    instagram: "https://instagram.com/", facebook: "https://facebook.com/", tiktok: "https://tiktok.com/", youtube: "https://youtube.com/",
    twitter: "https://x.com/", linkedin: "https://linkedin.com/", website: `https://www.connexoapp.com/${username}`,
  };
  const redes: Record<string, string> = {};
  let propias = 0;
  for (const r of REDES_ICONOS) {
    const real = reales[r];
    if (porUsuario && (r === "instagram" || r === "tiktok" || r === "twitter")) {
      const u = real ? usuarioDeRed(real, r) : null;
      if (u) { redes[r] = u; propias++; } else redes[r] = "@";
    } else if (real) { redes[r] = real; propias++; } else redes[r] = vacias[r];
  }
  return { redes, propias };
}
const HEX_RE = /^#[0-9a-f]{3,8}$/i;
const PALABRAS_VACIAS = new Set(["de", "del", "la", "el", "los", "las", "y", "e", "en", "the", "and"]);

const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** Fecha de hoy + n días (hora de Ecuador, UTC-5) en texto corto: «Sáb 22 nov» (con año si es @F: «22 nov 2026»). */
function fechaRelativa(dias: number, conAnio: boolean): string {
  const d = new Date(Date.now() - 5 * 3600_000 + dias * 86400_000);
  const base = `${d.getUTCDate()} ${MESES_CORTOS[d.getUTCMonth()]}`;
  return conAnio ? `${base} ${d.getUTCFullYear()}` : `${DIAS_CORTOS[d.getUTCDay()]} ${base}`;
}

/**
 * Cambia {{nombre}}, {{ciudad}}, {{ubicacion}}, {{username}} y {{wa593}}; sin ciudad, «en {{ciudad}}» desaparece.
 * Las fechas de ejemplo de un paquete se escriben @D(9) (dentro de 9 días: «Sáb 22 nov») o @F(-30) (hace 30 días: «14 oct 2026»):
 * así una gira de ejemplo siempre queda en el futuro y los lanzamientos en el pasado, sea cuando sea que se arme el borrador.
 */
function sustituir(valor: unknown, vars: Vars): unknown {
  if (typeof valor === "string") {
    const fecha = valor.match(/^@([DF])\((-?\d{1,4})\)$/);
    if (fecha) return fechaRelativa(Number(fecha[2]), fecha[1] === "F");
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
  const ciudad = ciudadDe(n);
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

  const reales: Record<string, string> = {};
  for (const r of ["instagram", "facebook", "tiktok", "website"] as const) {
    const u = urlRed(n[r], r);
    if (u) reales[r] = u;
  }
  if (PLANTILLAS_CON_ICONOS_DE_REDES.has(theme)) {
    const { redes, propias } = armarRedes(theme, reales, username);
    poner("socialMedia", redes, propias >= REDES_ICONOS.length ? "koda" : propias ? "mixto" : "banco");
  }

  const descripcion = str(n.descripcion, 300);
  if (descripcion) poner("bio", descripcion, "koda");
  const puntaje = frasePuntaje(n.rating, n.reviews_count);
  if (puntaje) {
    if (PLANTILLAS_CON_PRUEBA_SOCIAL.has(theme)) poner("socialProof", puntaje, "koda");
    else poner("bio", `${cols.bio ? cols.bio + " " : ""}${puntaje}`, cols.bio && origen.bio === "banco" ? "mixto" : "koda");
  }

  // 3) Logo provisional con las iniciales.
  // El mismo logo sirve de FOTO DE PERFIL: varias plantillas (barbería, estándar…) solo muestran `profilePhotoURL` y, sin él,
  // el avatar sale vacío o con una letra. Un borrador nunca debe verse sin foto de perfil.
  const logo = logoSvg(nombre, paquete?.logo?.etiqueta ?? "", paquete?.logo?.fondo, paquete?.logo?.acento, paquete?.logo?.texto);
  poner("logoURL", logo, "banco");
  poner("profilePhotoURL", logo, "banco");

  const { error } = await db.from("profiles").update(cols).eq("id", uid);
  if (error) throw new Error(`perfil: ${error.message}`);

  // 4) Enlaces del perfil, con los datos reales de KODA.
  const enlaces: { title: string; url: string }[] = [];
  if (wa && WHATSAPP_RE.test(wa)) {
    enlaces.push({ title: "Escríbenos por WhatsApp", url: `https://wa.me/${wa.slice(1)}?text=${encodeURIComponent("Hola, vi tu perfil y quisiera más información.")}` });
  }
  const mapa = str(n.google_maps_url, 500);
  if (mapa && /^https?:\/\//i.test(mapa)) enlaces.push({ title: "Ubicación en Google Maps", url: mapa });
  // Las plantillas sin fila de iconos (gym, hotel, fotografía, librería) muestran SOLO los enlaces: ahí las 4 redes van siempre (con enlace vacío si KODA no la trae).
  const sinIconos = !PLANTILLAS_CON_ICONOS_DE_REDES.has(theme);
  const redEnlace = (clave: string, titulo: string, vacio: string) => {
    if (reales[clave]) enlaces.push({ title: titulo, url: reales[clave] });
    else if (sinIconos) enlaces.push({ title: titulo, url: vacio });
  };
  redEnlace("instagram", "Síguenos en Instagram", "https://instagram.com/");
  redEnlace("facebook", "Síguenos en Facebook", "https://facebook.com/");
  redEnlace("tiktok", "Síguenos en TikTok", "https://tiktok.com/");
  redEnlace("website", "Visita nuestra página web", `https://www.connexoapp.com/${username}`);

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

// ── Control de completitud ───────────────────────────────────────────────────
// Regla del dueño (2026-11-09): un borrador NO se aprueba ni se manda por WhatsApp si, al abrirlo, el negocio lo vería
// incompleto (sin foto de perfil, portada, galería, catálogo con fotos…) y se perdería el cliente. Se compara con lo mínimo
// universal Y con lo que promete el paquete de su nicho, así un paquete al que le falte algo (p. ej. las fotos de las
// peluquerías, que se escaparon en la primera oleada) también salta. Devuelve etiquetas en español; vacío = completo.
const TABLA_ETIQUETA: Record<string, string> = {
  barber_staff: "equipo", ecom_staff: "equipo", realty_agents: "asesores", realty_properties: "propiedades",
  gym_plans: "planes", gym_classes: "clases", gym_coaches: "entrenadores", hotel_rooms: "habitaciones",
  hotel_services: "servicios del hotel", sublima_products: "productos", books_titles: "libros", stage_classes: "clases",
  photo_works: "portafolio", photo_packages: "paquetes", photo_team: "equipo",
};
const COLS_IMAGEN = ["image_url", "photo_url", "images", "cover_url", "imageURL", "image"];
const CON_PRODUCTOS = new Set(["gastro", "barber", "ecom", "medical", "petcare", "stage", "default"]);
const vacia = (v: unknown): boolean =>
  v === null || v === undefined || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && v.length === 0) ||
  (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0);

async function faltantes(db: Admin, uid: string, paquete: Paquete | null): Promise<string[]> {
  const { data: p, error } = await db.from("profiles").select("*").eq("id", uid).maybeSingle();
  if (error || !p) return ["el perfil"];
  const f = new Set<string>();

  const exige: [string, string][] = [
    ["profilePhotoURL", "foto de perfil"], ["logoURL", "logo"], ["coverImageURL", "portada"], ["jobTitle", "título"],
    ["bio", "descripción"], ["aboutMe", "sobre nosotros"], ["location", "dirección"], ["whatsapp", "WhatsApp"],
    ["backgroundColor", "colores"], ["buttonColor", "colores"], ["textColor", "colores"],
  ];
  for (const [k, etiqueta] of exige) if (vacia(p[k])) f.add(etiqueta);
  if (!Array.isArray(p.galleryImageURLs) || p.galleryImageURLs.filter(Boolean).length < 3) f.add("galería (mínimo 3 fotos)");
  if (!Array.isArray(p.faqs) || p.faqs.length < 3) f.add("preguntas frecuentes");
  if (p.theme !== "stage" && vacia(p.businessHours)) f.add("horario");   // el artista no tiene horario de atención
  const { data: enlaces } = await db.from("links").select("id").eq("userId", uid).limit(10);
  if (!enlaces?.length) f.add("enlaces");
  // Redes: con fila de iconos, las 7 deben tener enlace (real o vacío); sin ella, la lista de enlaces debe traer las 4 redes.
  if (PLANTILLAS_CON_ICONOS_DE_REDES.has(p.theme)) {
    const sm = (p.socialMedia ?? {}) as Json;
    if (REDES_ICONOS.some((r) => vacia(sm[r]))) f.add("redes sociales");
  } else if ((enlaces?.length ?? 0) < 4) f.add("enlaces de redes");

  // Catálogo del perfil (platos, servicios, productos): lo que prometa el paquete y, como mínimo, 3.
  const productos: Json[] = Array.isArray(p.products) ? p.products : [];
  const delPaquete: Json[] = Array.isArray(paquete?.perfil?.products) ? (paquete!.perfil!.products as Json[]) : [];
  if (CON_PRODUCTOS.has(p.theme) || delPaquete.length) {
    if (productos.length < Math.max(3, Math.min(delPaquete.length, 3))) f.add("catálogo");
    // Si el paquete trae fotos de catálogo, el perfil las muestra (al menos 80 %).
    if (delPaquete.some((x) => !vacia(x.imageURL)) && productos.filter((x) => !vacia(x?.imageURL)).length < Math.ceil(productos.length * 0.8)) {
      f.add("fotos del catálogo");
    }
  }

  // Tablas propias de la plantilla (planes, habitaciones, propiedades, libros…): las filas del paquete y sus fotos.
  for (const t of paquete?.tablas ?? []) {
    if (!/^[a-z_]+$/.test(t.tabla) || !/^[a-z_]+$/.test(t.propietario)) continue;
    const etiqueta = TABLA_ETIQUETA[t.tabla] ?? t.tabla;
    const { data: filas, error: tErr } = await db.from(t.tabla).select("*").eq(t.propietario, uid).limit(100);
    if (tErr || !filas || filas.length < t.filas.length) { f.add(etiqueta); continue; }
    const col = COLS_IMAGEN.find((c) => t.filas.some((x) => !vacia(x[c])));
    if (col && filas.filter((x) => !vacia(x[col])).length < Math.ceil(filas.length * 0.8)) f.add(`fotos de ${etiqueta}`);
  }
  return [...f];
}

/** Rellena y guarda el resultado en koda_prospectos. Nunca lanza: si falla, el borrador queda y se avisa en `detalle`. */
async function aplicarRelleno(
  db: Admin, fila: Json, uid: string, theme: string, clave: string | null, n: Json, username: string,
): Promise<{ ok: boolean; fila: Json }> {
  const ahora = new Date().toISOString();
  const previo = typeof fila.detalle === "string" ? fila.detalle.replace(/^Relleno incompleto:[^·]*(· )?/, "").trim() : "";
  try {
    const relleno = await rellenarPerfil(db, uid, theme, clave, n, username);
    // Control de completitud: lo que falte se guarda en `relleno.faltan` y en `detalle`, y bloquea la aprobación.
    const faltan = await faltantes(db, uid, await cargarPaquete(db, clave));
    relleno.faltan = faltan;
    const { data, error } = await db.from("koda_prospectos")
      .update({
        clave, relleno, updated_at: ahora,
        detalle: faltan.length ? `Relleno incompleto: falta ${faltan.join(", ")}${previo ? ` · ${previo}` : ""}` : (previo || null),
      }).eq("id", fila.id).select("*").single();
    if (error) throw new Error(error.message);
    return { ok: faltan.length === 0, fila: data };
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
  const lote = leerLote(k.lote);
  const { theme, clave } = await resolverPlantilla(db, rubro, categoria, nombre);

  const comun = {
    koda_envio_id: k.envio_id,
    koda_prospect_id: k.prospect_id,
    koda_owner_email: str(k.owner_email, 200),
    koda_owner_nombre: str(k.owner_nombre, 200),
    busqueda_job_id: typeof k.busqueda?.job_id === "string" && UUID_RE.test(k.busqueda.job_id) ? k.busqueda.job_id : null,
    busqueda_nombre: str(k.busqueda?.nombre, 200),
    ...(lote ? { lote_id: lote.id, lote_numero: lote.numero, lote_nombre: lote.nombre } : {}),
    rubro,
    whatsapp,
    negocio: n,
    updated_at: new Date().toISOString(),
  };

  // Un celular nunca recibe dos perfiles ni dos saludos: si OTRO negocio con este mismo celular ya tiene cuenta, ya recibió el
  // saludo o pidió que no le escriban, este no se crea (queda registrado como duplicado, a la vista del administrador).
  const { data: gemelos, error: gErr } = await db
    .from("koda_prospectos")
    .select("id, koda_envio_id, koda_prospect_id, estado, opt_out, user_id, wa_enviado_at, negocio")
    .eq("whatsapp", whatsapp);
  if (gErr) return json({ error: gErr.message }, 500);
  const gemelo = (gemelos ?? []).find((g) =>
    g.id !== previo?.id && g.koda_envio_id !== k.envio_id && g.koda_prospect_id !== k.prospect_id
    && (g.opt_out || g.wa_enviado_at || g.user_id));
  if (gemelo) {
    const quien = String(gemelo.negocio?.nombre ?? "otro negocio");
    const fila = {
      ...comun, estado: "descartado", theme: null, user_id: null,
      detalle: `Duplicado: ese celular ya está en Connexo como «${quien}» (${gemelo.estado}). No se creó otro perfil ni se le escribirá.`,
    };
    const { data, error } = previo
      ? await db.from("koda_prospectos").update(fila).eq("id", previo.id).select("*").single()
      : await db.from("koda_prospectos").insert(fila).select("*").single();
    if (error) return json({ error: error.message }, 500);
    return json(respuesta(data));
  }

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
  // Corto y con el nombre del negocio; si ya estuviera tomado, se le agrega un sufijo aleatorio.
  const sintetico = (conSufijo = false) =>
    conSufijo ? `${username.slice(0, 34)}-${textoAleatorio(4, "abcdefghjkmnpqrstuvwxyz23456789")}@${DOMINIO_SINTETICO}` : correoInterno(username);
  const yaExiste = (m: string) => /already|registered|exists/i.test(m);
  let email = emailKoda && EMAIL_RE.test(emailKoda) ? emailKoda : sintetico();
  let emailReal = email === emailKoda;
  let nota: string | null = null;
  // Contraseña aleatoria que NADIE conoce: al aceptar, se genera y se entrega una nueva.
  const password = textoAleatorio(32, "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!#$%");
  const meta = { origen: "koda", koda: true, username, displayName: nombre, full_name: nombre };

  let creado = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: meta });
  if (creado.error && emailReal && yaExiste(creado.error.message)) {
    // Ese correo ya tiene cuenta en Connexo: no se toca. Se usa uno sintético y se deja aviso.
    nota = `El correo ${email} ya tiene cuenta en Connexo; se creó el borrador con un correo interno.`;
    email = sintetico();
    emailReal = false;
    creado = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: meta });
  }
  if (creado.error && !emailReal && yaExiste(creado.error.message)) {
    // El correo interno corto ya existe (p. ej. un perfil anterior con el mismo usuario): se prueba con un sufijo.
    email = sintetico(true);
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
  if (!["borrador", "aprobado", "wa_enviado"].includes(fila.estado)) {
    return json({ error: `Solo se puede rellenar un borrador, aprobado o con saludo enviado: un perfil aceptado, vencido o descartado no se toca (estado actual: ${fila.estado}).` }, 409);
  }

  const negocio: Json = fila.negocio ?? {};
  const clave = claveDePack(fila.rubro ?? null, str(negocio.categoria, 120), str(negocio.nombre, 120));
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
  // Nada incompleto sale por WhatsApp: se comprueba el perfil en vivo (puede haber cambiado desde el relleno).
  if (nuevo === "aprobado" && body.forzar !== true) {
    if (!fila.user_id) return json({ error: "Ese envío no tiene cuenta borrador." }, 409);
    const faltan = await faltantes(db, fila.user_id, await cargarPaquete(db, fila.clave ?? null));
    if (faltan.length) {
      return json({ error: `No se puede aprobar: al perfil le falta ${faltan.join(", ")}. Rehaz el contenido y vuelve a intentar.` }, 409);
    }
  }

  const { data, error: uErr } = await db.from("koda_prospectos")
    .update({ estado: nuevo, updated_at: new Date().toISOString() }).eq("id", fila.id).select("*").single();
  if (uErr) return json({ error: uErr.message }, 500);
  return json(respuesta(data));
}

/** Asigna (o renombra) el lote de varios envíos de una vez. Solo toca las columnas del lote. */
async function fijarLote(db: Admin, body: Json): Promise<Response> {
  const lote = leerLote(body.lote);
  if (!lote) return json({ error: "lote inválido (id, numero, nombre)." }, 400);
  const pedidos: unknown[] = Array.isArray(body.envio_ids) ? body.envio_ids : [];
  const ids = [...new Set(pedidos.filter((x): x is string => typeof x === "string" && UUID_RE.test(x)))].slice(0, 500);
  if (!ids.length) return json({ ok: true, actualizados: 0 });
  const { data, error } = await db.from("koda_prospectos")
    .update({ lote_id: lote.id, lote_numero: lote.numero, lote_nombre: lote.nombre })
    .in("koda_envio_id", ids).select("id");
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, actualizados: (data ?? []).length });
}

/** Qué le falta a cada borrador para verse completo (solo lectura; hasta 25 por llamada). */
async function auditarBorradores(db: Admin, body: Json): Promise<Response> {
  const pedidos: unknown[] = Array.isArray(body.envio_ids) ? body.envio_ids : [];
  const ids = [...new Set(pedidos.filter((x): x is string => typeof x === "string" && UUID_RE.test(x)))].slice(0, 25);
  if (!ids.length) return json({ ok: true, items: [] });
  const { data, error } = await db.from("koda_prospectos").select("koda_envio_id, user_id, username, theme, clave, estado").in("koda_envio_id", ids);
  if (error) return json({ error: error.message }, 500);
  const items: Json[] = [];
  for (const f of data ?? []) {
    const faltan = f.user_id ? await faltantes(db, f.user_id, await cargarPaquete(db, f.clave ?? null)) : ["la cuenta borrador"];
    items.push({ envio_id: f.koda_envio_id, username: f.username, theme: f.theme, clave: f.clave ?? null, estado: f.estado, faltan });
  }
  return json({ ok: true, items });
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
    if (body.action === "auditar") return await auditarBorradores(db, body);
    if (body.action === "lote_set") return await fijarLote(db, body);
    return json({ error: "Acción desconocida." }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
