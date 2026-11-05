// Banco de recursos por nicho para los perfiles borrador que llegan de KODA.
//
// Lee las cuentas demo (setup_demo_*.sql, solo existen en local) y arma UN paquete por nicho:
//   · look (colores), fotos del local y portada, catálogo de EJEMPLO donde el nicho lo permite, horario tipo
//   · textos genéricos (sin promesas del negocio) con {{nombre}} y {{ciudad}} como marcadores
// y deja:
//   · recursos.json          fuente versionada (esto es lo que se revisa y se corrige)
//   · ../../setup_koda_recursos.sql   lo que se ejecuta en Supabase (los *.sql están en .gitignore)
//
// NO se copia de las demos: testimonios, equipo, clientes, pedidos, reservas, cuentas bancarias, pasarelas
// de pago, marcas de productos, promesas (club de sellos, comisiones, urgencias 24/7, cancelación, depósito…),
// fotos de personas como foto de perfil, ni FAQs (hablan por el negocio).
//
// Uso:  node supabase/koda-recursos/build-recursos.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, "..", "..");

// ── 1) Leer las demos ────────────────────────────────────────────────────────
const demos = {};
for (const f of fs.readdirSync(raiz)) {
  const m = f.match(/^setup_demo_(\d\d)_.*\.sql$/);
  if (!m || m[1] === "00") continue;
  const sql = fs.readFileSync(path.join(raiz, f), "utf8");
  const p = sql.match(/cx_put\('public\.profiles',\s*replace\(\$j\$(\{.*?\})\$j\$,/s);
  if (p) demos[m[1]] = JSON.parse(p[1]);
}

// ── 2) Piezas comunes ────────────────────────────────────────────────────────
const ESTILO = ["backgroundColor", "buttonColor", "buttonTextColor", "textColor", "borderColor", "buttonStyle", "shadow", "fontFamily", "showSchedule", "businessHours"];
const GALERIA = ["coverImageURL", "galleryMode", "galleryImageURLs", "albums"];
const RESERVAS = ["openingHours", "reservationsEnabled", "reservationSettings", "tableCount"];

const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, structuredClone(o[k])]));

/** Un producto del catálogo de ejemplo: solo lo visible; sin recetas, alérgenos, marcas, SKU ni stock. */
const producto = (p, cambios = {}) => {
  const base = {
    id: p.id, name: p.name, category: p.category, price: p.price,
    shortDescription: p.shortDescription, imageURL: p.imageURL, available: true,
  };
  const r = { ...base, ...cambios };
  if (!r.imageURL) delete r.imageURL;
  return r;
};
const porNombre = (doc, nombres) => nombres.map((n) => {
  const p = (doc.products ?? []).find((x) => x.name === n);
  if (!p) throw new Error(`No existe el producto «${n}» en la demo ${doc.displayName}`);
  return p;
});
const porCategoria = (doc, cats) => (doc.products ?? []).filter((p) => cats.includes(p.category));

/** Cambia el nombre de marca de la demo por {{nombre}} en todos los textos. */
function sinMarca(valor, marcas) {
  if (typeof valor === "string") {
    let s = valor;
    for (const m of marcas) s = s.split(m).join("{{nombre}}");
    return s;
  }
  if (Array.isArray(valor)) return valor.map((v) => sinMarca(v, marcas));
  if (valor && typeof valor === "object") return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, sinMarca(v, marcas)]));
  return valor;
}

const GALERIA_TITULO = "Galería";

// ── 3) Definición de cada paquete ────────────────────────────────────────────
const D = demos;
const paquetes = [
  {
    clave: "barberia", theme: "barber", demo: "02", etiqueta: "BARBERÍA",
    perfil: (d) => ({
      ...pick(d, [...ESTILO, ...GALERIA]),
      products: d.products.map((p) => p.id === "svc_vip"
        ? producto(p, { name: "Experiencia Completa", shortDescription: "Corte, barba, limpieza facial y masaje de cuello." })
        : producto(p)),
    }),
    copy: {
      jobTitle: "Barbería · Cortes y cuidado de barba",
      bio: "Cortes, barba y cuidado masculino en {{ciudad}}. Reserva tu cita desde este perfil.",
      aboutMe: "En {{nombre}} cuidamos tu imagen con oficio y buen trato: cortes clásicos y modernos, arreglo de barba y atención sin prisa. Agenda tu cita desde este perfil y llega a la hora que más te acomode.",
    },
  },
  {
    clave: "belleza", theme: "barber", demo: "02", etiqueta: "BELLEZA",
    perfil: (d) => pick(d, ESTILO),
    copy: {
      jobTitle: "Belleza y cuidado personal",
      bio: "Belleza y cuidado personal en {{ciudad}}. Reserva tu cita desde este perfil.",
      aboutMe: "En {{nombre}} nos dedicamos a tu cuidado personal. Conoce nuestros servicios y agenda tu cita desde este perfil.",
    },
  },
  {
    clave: "restaurantes", theme: "gastro", demo: "03", etiqueta: "RESTAURANTE",
    perfil: (d) => ({
      ...pick(d, [...ESTILO, ...GALERIA, ...RESERVAS]),
      products: d.products.map((p) => producto(p)),
    }),
    copy: {
      jobTitle: "Restaurante",
      bio: "Disfruta de la buena mesa en {{ciudad}}. Mira el menú y reserva tu mesa desde este perfil.",
      aboutMe: "En {{nombre}} nos importa que disfrutes cada plato. Conoce nuestro menú, reserva tu mesa y pide fácil desde este perfil.",
    },
  },
  {
    clave: "cafe_bar", theme: "gastro", demo: "03", etiqueta: "CAFÉ · BAR",
    perfil: (d) => ({
      ...pick(d, [...ESTILO, ...GALERIA, ...RESERVAS]),
      products: [...porNombre(d, ["Empanadas de Viento (4 uds)"]), ...porCategoria(d, ["Postres", "Bebidas"])].map((p) => producto(p)),
    }),
    copy: {
      jobTitle: "Café y bar",
      bio: "Tu lugar para tomar algo en {{ciudad}}. Mira la carta y reserva tu mesa desde este perfil.",
      aboutMe: "En {{nombre}} te esperamos con buen ambiente y una carta pensada para compartir. Conoce lo que ofrecemos y reserva tu mesa desde este perfil.",
    },
  },
  {
    clave: "clinica", theme: "medical", demo: "07", etiqueta: "SALUD",
    perfil: (d) => {
      const consulta = d.products.find((p) => p.id === "med_consulta");
      return {
        ...pick(d, [...ESTILO, ...GALERIA, ...RESERVAS]),
        products: [
          producto(consulta, { name: "Consulta general", shortDescription: "Evaluación, diagnóstico y plan de tratamiento." }),
          { id: "med_control", name: "Consulta de control", category: "Consultas", price: "$20.00", shortDescription: "Seguimiento de tu tratamiento o resultados.", available: true },
        ],
        clinicServices: ["Consulta general", "Consulta de control"],
      };
    },
    copy: {
      jobTitle: "Atención médica y salud",
      bio: "Cuidamos tu salud en {{ciudad}}. Agenda tu cita desde este perfil.",
      aboutMe: "En {{nombre}} nos dedicamos a cuidar tu salud y la de tu familia. Conoce nuestros servicios y agenda tu cita desde este perfil, sin llamadas ni esperas.",
    },
  },
  {
    clave: "salud", theme: "medical", demo: "07", etiqueta: "SALUD",
    perfil: (d) => pick(d, ESTILO),
    copy: {
      jobTitle: "Salud y bienestar",
      bio: "Salud y bienestar en {{ciudad}}. Escríbenos por WhatsApp y te ayudamos.",
      aboutMe: "En {{nombre}} estamos para ayudarte con tu salud y bienestar. Escríbenos desde este perfil y te atendemos.",
    },
  },
  {
    clave: "veterinaria", theme: "petcare", demo: "06", etiqueta: "VETERINARIA",
    perfil: (d) => {
      const nombres = ["Consulta general", "Vacunación (múltiple + antirrábica)", "Baño medicado y peluquería", "Desparasitación"];
      return {
        ...pick(d, [...ESTILO, ...GALERIA, ...RESERVAS]),
        products: porNombre(d, nombres).map((p) => producto(p, p.name.startsWith("Vacunación") ? { name: "Vacunación" } : {})),
        clinicServices: ["Consulta general", "Vacunación", "Baño y peluquería", "Desparasitación"],
      };
    },
    copy: {
      jobTitle: "Veterinaria · Cuidado de mascotas",
      bio: "Cuidamos a tu mejor amigo en {{ciudad}}. Agenda su cita desde este perfil.",
      aboutMe: "En {{nombre}} cuidamos la salud y el bienestar de tu mascota. Conoce nuestros servicios y agenda su cita desde este perfil.",
    },
  },
  {
    clave: "mascotas", theme: "petcare", demo: "06", etiqueta: "MASCOTAS",
    perfil: (d) => pick(d, [...ESTILO, ...GALERIA]),
    copy: {
      jobTitle: "Tienda de mascotas",
      bio: "Todo para tu mascota en {{ciudad}}. Escríbenos por WhatsApp y te atendemos.",
      aboutMe: "En {{nombre}} encuentras lo que tu mascota necesita. Escríbenos desde este perfil y te ayudamos.",
    },
  },
  {
    clave: "inmobiliaria", theme: "realty", demo: "08", etiqueta: "INMOBILIARIA",
    perfil: (d) => pick(d, [...ESTILO, "coverImageURL"]),
    copy: {
      jobTitle: "Inmobiliaria · Compra, venta y arriendo",
      bio: "Te acompañamos a encontrar el inmueble ideal en {{ciudad}}. Conversemos por WhatsApp.",
      aboutMe: "En {{nombre}} te asesoramos en la compra, venta y arriendo de inmuebles. Cuéntanos qué buscas y te ayudamos a encontrarlo.",
    },
  },
  {
    clave: "gimnasios", theme: "gym", demo: "10", etiqueta: "GIMNASIO",
    perfil: (d) => ({
      ...pick(d, [...ESTILO, ...GALERIA]),
      gym_settings: { bookingEnabled: true, bookingDaysAhead: 14, membersOnly: false, timezone: "America/Guayaquil" },
    }),
    copy: {
      jobTitle: "Gimnasio · Entrenamiento y clases",
      bio: "Entrena con nosotros en {{ciudad}}. Conoce nuestros planes y horarios desde este perfil.",
      aboutMe: "En {{nombre}} te acompañamos a alcanzar tus metas con entrenamiento constante y buen ambiente. Conoce nuestros planes y reserva tu clase desde este perfil.",
    },
  },
  {
    clave: "hoteles", theme: "hotel", demo: "11", etiqueta: "HOTEL",
    perfil: (d) => ({
      ...pick(d, [...ESTILO, ...GALERIA]),
      hotel_settings: { bookingEnabled: true, timezone: "America/Guayaquil" },
    }),
    copy: {
      jobTitle: "Hotel · Hospedaje",
      bio: "Descansa en {{ciudad}}. Conoce nuestras habitaciones y reserva desde este perfil.",
      aboutMe: "En {{nombre}} queremos que tu estadía sea cómoda y tranquila. Conoce nuestras habitaciones y reserva directo desde este perfil.",
    },
  },
  {
    clave: "tiendas", theme: "ecom", demo: "04", etiqueta: "TIENDA",
    perfil: (d) => pick(d, ESTILO),
    copy: {
      jobTitle: "Tienda",
      bio: "Conoce lo que tenemos para ti en {{ciudad}}. Escríbenos por WhatsApp y te atendemos.",
      aboutMe: "En {{nombre}} te esperamos con lo que necesitas. Escríbenos desde este perfil y te ayudamos con tu compra.",
    },
  },
  {
    clave: "talleres", theme: "ecom", demo: "04", etiqueta: "TALLER",
    perfil: (d) => pick(d, ESTILO),
    copy: {
      jobTitle: "Taller · Servicios",
      bio: "Servicio de confianza en {{ciudad}}. Escríbenos por WhatsApp y coordinamos tu cita.",
      aboutMe: "En {{nombre}} nos encargamos de tu trabajo con responsabilidad. Cuéntanos qué necesitas desde este perfil y coordinamos.",
    },
  },
  {
    clave: "oficinas", theme: "ecom", demo: "04", etiqueta: "SERVICIOS",
    perfil: (d) => pick(d, ESTILO),
    copy: {
      jobTitle: "Servicios profesionales",
      bio: "Servicios profesionales en {{ciudad}}. Escríbenos por WhatsApp y conversemos.",
      aboutMe: "En {{nombre}} te asesoramos con atención personalizada. Cuéntanos tu caso desde este perfil y te respondemos.",
    },
  },
];

// ── 4) Armar, limpiar y escribir ─────────────────────────────────────────────
const salida = [];
for (const p of paquetes) {
  const d = D[p.demo];
  if (!d) throw new Error(`Falta la demo ${p.demo} (¿están los setup_demo_*.sql en la carpeta del proyecto?)`);
  const marcas = [d.displayName, d.company].filter(Boolean).sort((a, b) => b.length - a.length);
  const perfil = sinMarca(p.perfil(d), marcas);
  if (perfil.galleryImageURLs?.length) perfil.galleryTitle = GALERIA_TITULO;
  salida.push({
    clave: p.clave,
    theme: p.theme,
    fuente: `setup_demo_${p.demo}`,
    logo: { etiqueta: p.etiqueta, fondo: d.backgroundColor, acento: d.buttonColor, texto: d.textColor },
    copy: p.copy,
    perfil,
  });
}
fs.writeFileSync(path.join(aqui, "recursos.json"), JSON.stringify(salida, null, 2) + "\n");

// Revisión automática: restos de las demos que no deben pasar.
const turbio = /navaja|cuero|brasa|huellitas|vitalis|cimientos|tit[aá]n|costa rosa|cumbre|estampa|quito|guayaquil|cuenca|urdesa|floresta|cumbay|\.test|connexo|club |banco|@/i;
let alertas = 0;
const revisar = (v, ruta) => {
  if (typeof v === "string") { if (turbio.test(v) && !/^https?:\/\/images\.unsplash\.com/.test(v)) { console.log(`  ⚠ ${ruta}: ${v.slice(0, 90)}`); alertas++; } }
  else if (Array.isArray(v)) v.forEach((x, i) => revisar(x, `${ruta}[${i}]`));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) revisar(x, `${ruta}.${k}`);
};
for (const s of salida) revisar({ copy: s.copy, perfil: s.perfil }, s.clave);
console.log(`Paquetes: ${salida.length} · alertas de texto: ${alertas}`);
const claves = new Set(salida.flatMap((s) => Object.keys(s.perfil)));
console.log("Columnas de perfil que usa el banco:", [...claves].sort().join(", "));

// ── 5) SQL ───────────────────────────────────────────────────────────────────
const filas = salida.map((s) =>
  `INSERT INTO public.koda_recursos_nicho (clave, theme, pack, nota) VALUES (\n  '${s.clave}', '${s.theme}',\n  $koda$${JSON.stringify({ logo: s.logo, copy: s.copy, perfil: s.perfil })}$koda$::jsonb,\n  'Generado de ${s.fuente}. Contenido de EJEMPLO: el negocio debe revisarlo.'\n)\nON CONFLICT (clave) DO UPDATE SET theme = EXCLUDED.theme, pack = EXCLUDED.pack, nota = EXCLUDED.nota, updated_at = now();`
).join("\n\n");

const sql = `-- ═══════════════════════════════════════════════════════════════════════════
-- setup_koda_recursos.sql — Banco de recursos por nicho (FASE 2 del puente KODA → Connexo)
--
-- QUÉ HACE: kodaIntake completa cada perfil borrador con lo que KODA no trae (look, fotos del local,
-- catálogo de EJEMPLO, horario tipo, textos genéricos). Esos paquetes viven aquí, en la tabla
-- koda_recursos_nicho (una fila por nicho), para poder corregirlos sin volver a desplegar la función.
--
-- ✔ Solo crea una tabla nueva y agrega 2 columnas a koda_prospectos (creada por setup_koda_bridge.sql).
-- ✔ Idempotente. Re-ejecutarlo REFRESCA los paquetes (pisa cambios hechos a mano en esas filas).
-- ✔ Se genera con: node supabase/koda-recursos/build-recursos.mjs  (fuente: recursos.json)
-- Ejecutar TODO en Supabase → SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.koda_recursos_nicho (
  clave      text PRIMARY KEY,                 -- nicho: barberia, belleza, restaurantes, cafe_bar, clinica, salud, veterinaria, mascotas, inmobiliaria, gimnasios, hoteles, tiendas, talleres, oficinas
  theme      text NOT NULL,                    -- profiles.theme al que pertenece
  pack       jsonb NOT NULL,                   -- { logo, copy, perfil }
  nota       text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.koda_recursos_nicho ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "koda_recursos_nicho: admin lee" ON public.koda_recursos_nicho;
CREATE POLICY "koda_recursos_nicho: admin lee" ON public.koda_recursos_nicho
  FOR SELECT TO authenticated USING (public.is_platform_admin());

-- Qué paquete se usó y de dónde salió cada dato (koda | banco) para mostrarlo en la revisión.
ALTER TABLE public.koda_prospectos ADD COLUMN IF NOT EXISTS clave   text;
ALTER TABLE public.koda_prospectos ADD COLUMN IF NOT EXISTS relleno jsonb;

${filas}

-- VERIFICACIÓN (opcional)
-- SELECT clave, theme, jsonb_array_length(coalesce(pack->'perfil'->'products', '[]'::jsonb)) AS productos FROM koda_recursos_nicho ORDER BY clave;
`;
fs.writeFileSync(path.join(raiz, "setup_koda_recursos.sql"), sql);
console.log(`SQL: ${path.join(raiz, "setup_koda_recursos.sql")} (${(sql.length / 1024).toFixed(1)} KB)`);
