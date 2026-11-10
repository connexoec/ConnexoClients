// Banco de recursos por nicho para los perfiles borrador que llegan de KODA.
//
// Objetivo: que el negocio al que se le ofrece la plantilla la vea YA con contenido (como quedaría
// inspirada en su local), no vacía. Lee las cuentas demo (setup_demo_*.sql, solo existen en local) y
// arma UN paquete por nicho con:
//   · perfil   columnas de `profiles`: look, portada y galería, catálogo de EJEMPLO, horario tipo, FAQs
//   · tablas   filas de las tablas propias de la plantilla (planes y clases del gym, habitaciones del
//              hotel, propiedades de la inmobiliaria, equipo del salón…), con el dueño y los ids
//              reasignados al sembrar
//   · copy     textos genéricos con {{nombre}}, {{ciudad}}, {{ubicacion}}, {{username}} y {{wa593}}
//   · logo     colores y rótulo para el logo provisional con iniciales
// y deja:
//   · recursos.json                    fuente versionada (esto es lo que se revisa y se corrige)
//   · ../../setup_koda_recursos.sql    lo que se ejecuta en Supabase (los *.sql están en .gitignore)
//
// NO se copia de las demos: testimonios (citas inventadas con nombre propio), clientes, pedidos, reservas,
// cuentas bancarias, pasarelas de pago, marcas de productos, nombres/fotos de personas (el equipo queda
// como «Barbero 1», «Entrenador 2»…), lugares concretos, ni promesas del negocio (club de sellos,
// comisiones, urgencias 24/7, política de cancelación, depósito, estrellas, «clase de prueba gratis»).
//
// Uso:  node supabase/koda-recursos/build-recursos.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sanearPaleta, paletaLogo } from "./paleta.mjs";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, "..", "..");

// ── 1) Leer las demos: perfil + filas de sus tablas ──────────────────────────
const demos = {};
const filas = {};
for (const f of fs.readdirSync(raiz)) {
  const m = f.match(/^setup_demo_(\d\d)_.*\.sql$/);
  if (!m || m[1] === "00") continue;
  const sql = fs.readFileSync(path.join(raiz, f), "utf8");
  filas[m[1]] = {};
  for (const x of sql.matchAll(/cx_put\('public\.([a-z_]+)',\s*replace\(\$j\$(\{.*?\})\$j\$/gs)) {
    const doc = JSON.parse(x[2]);
    if (x[1] === "profiles") demos[m[1]] = doc;
    else (filas[m[1]][x[1]] ||= []).push(doc);
  }
}

// ── 2) Piezas comunes ────────────────────────────────────────────────────────
const ESTILO = ["backgroundColor", "buttonColor", "buttonTextColor", "textColor", "borderColor", "buttonStyle", "shadow", "fontFamily", "showSchedule", "businessHours"];
const GALERIA = ["coverImageURL", "galleryMode", "galleryImageURLs", "albums"];
const RESERVAS = ["openingHours", "reservationsEnabled", "reservationSettings", "tableCount"];

const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, structuredClone(o[k])]));

/** Un producto del catálogo de ejemplo: solo lo visible; sin recetas, alérgenos, marcas, SKU ni stock. */
const producto = (p, cambios = {}) => {
  const r = {
    id: p.id, name: p.name, category: p.category, price: p.price,
    shortDescription: p.shortDescription, imageURL: p.imageURL, available: true, ...cambios,
  };
  if (!r.imageURL) delete r.imageURL;
  return r;
};
const porNombre = (doc, nombres) => nombres.map((n) => {
  const p = (doc.products ?? []).find((x) => x.name === n);
  if (!p) throw new Error(`No existe el producto «${n}» en la demo ${doc.displayName}`);
  return p;
});
const porCategoria = (doc, cats) => (doc.products ?? []).filter((p) => cats.includes(p.category));
/** Catálogo escrito a mano: [categoría, nombre, precio, descripción]. */
const catalogo = (prefijo, items) => items.map(([category, name, price, shortDescription], i) => ({
  id: `${prefijo}_${i + 1}`, name, category, price, shortDescription, available: true,
}));

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

const quitar = (fila, cols) => { const r = structuredClone(fila); for (const c of cols) delete r[c]; return r; };

// ── Fotos que las demos no traen (peluquería, ropa, taller, oficina…) ─────────────────────────────
// Regla del dueño (2026-11-09): NINGÚN borrador sale sin foto de perfil, portada, galería y fotos en su catálogo; el negocio
// que ve su plantilla vacía la ve «incompleta» y se pierde el cliente. Son ids de fotos de Unsplash (verificadas con HTTP 200),
// con el mismo recorte que usan las demos. La foto de perfil NO está aquí: kodaIntake pone el logo con iniciales también como foto de perfil.
const U = (id) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=800&q=75`;
const FOTOS = {
  belleza: {
    cover: "1633681926022-84c23e8cb2d6",
    galeria: ["1781450090585-1a511b7066d9", "1600948836101-f9ffda59d250", "1761839256791-6a93f89fb8b0", "1580618672591-eb180b1a973f", "1634449571010-02389ed0f9b0", "1761718210089-ba3bb5ccb54f"],
    // Corte, Peinado, Tinte, Tratamiento capilar, Manicure, Pedicure, Limpieza facial, Masaje
    productos: ["1634449571010-02389ed0f9b0", "1580618672591-eb180b1a973f", "1761839256791-6a93f89fb8b0", "1595475884562-073c30d45670", "1632345031435-8727f6897d53", "1779636198585-658170ee0283", "1570172619644-dfd03ed5d881", "1616394584738-fc6e612e71b9"],
  },
  tiendas: {
    cover: "1441984904996-e0b6ba687e04",
    galeria: ["1532453288672-3a27e9be9efd", "1445205170230-053b83016050", "1718985342149-7178154e0aee", "1603400521630-9f2de124b33b", "1573879500655-98f2012dd1db", "1555529771-835f59fc5efe"],
    productos: ["1583316174775-bd6dc0e9f298", "1573612664822-d7d347da7b80", "1513884923967-4b182ef167ab", "1521335629791-ce4aec67dd15", "1760565030346-4b947220fe3a", "1595991209266-5ff5a3a2f008"],
  },
  talleres: {
    cover: "1767681092416-bccf9410bda4",
    galeria: ["1727893119356-1702fe921cf9", "1615906655593-ad0386982a0f", "1632733711679-529326f6db12", "1771340742493-52fbd5476ccb", "1487754180451-c456f719a1fc", "1676018366904-c083ed678e60"],
    productos: ["1771340742493-52fbd5476ccb", "1727893119356-1702fe921cf9", "1615906655593-ad0386982a0f", "1632733711679-529326f6db12", "1767681092416-bccf9410bda4", "1786198984387-b63cdf520602", "1487754180451-c456f719a1fc"],
  },
  oficinas: {
    cover: "1542744173-8e7e53415bb0",
    galeria: ["1591115765373-5207764f72e7", "1560439513-74b037a25d84", "1517048676732-d65bc937f952", "1542744173-8e7e53415bb0", "1688380692117-63178554d76d", "1646579886135-068c73800308"],
    productos: ["1620275765334-4ed948bb4502", "1563986768494-4dee2763ff3f", "1488998427799-e3362cec87c3", "1511385348-a52b4a160dc2", "1591115765373-5207764f72e7", "1460925895917-afdab827c52f"],
  },
  profesionales: { productos: ["1620275765334-4ed948bb4502", "1563986768494-4dee2763ff3f", "1488998427799-e3362cec87c3", "1511385348-a52b4a160dc2"] },
  // La inmobiliaria muestra sus propiedades; la galería del perfil usa las mismas fotos de las propiedades de ejemplo.
  inmobiliaria: { galeria: ["1706808849780-7a04fbac83ef", "1628592102751-ba83b0314276", "1738168246881-40f35f8aba0a", "1721815693498-cc28507c0ba2", "1707250441420-89c9b7a5b945", "1700809888987-cf2b29ecbd2c"] },
  // Alimento perro, alimento gato, snacks, arena (los 3 accesorios ya traen su foto de la demo).
  mascotas: { productos: ["1591946559594-8c6d3b7391eb", "1689723671448-3fb4dd4b294e", "1568640347023-a616a30bc3bd", "1727510153658-643787acb16a"] },
  // Camiseta oficial, camiseta especial, póster, disco, vinilo.
  musicos: { productos: ["1693443687750-611ad77f3aba", "1759572095384-1a7e646d0d4f", "1501612780327-45045538702b", "1602848596718-45693ff58c78", "1616714109948-c74fe5029a4d"] },
};
function aplicarFotos(clave, perfil) {
  const f = FOTOS[clave];
  if (!f) return perfil;
  if (f.cover) perfil.coverImageURL = U(f.cover);
  if (f.galeria) { perfil.galleryMode = "grid"; perfil.galleryImageURLs = f.galeria.map(U); perfil.albums = []; }
  if (f.productos && perfil.products) perfil.products = perfil.products.map((p, i) => (f.productos[i] ? { ...p, imageURL: U(f.productos[i]) } : p));
  return perfil;
}
const GALERIA_TITULO = "Galería";

/** Preguntas frecuentes NEUTRAS: explican cómo usar el perfil, no hablan por el negocio. */
const faq = (pregunta1, respuesta1) => [
  { id: "faq_1", question: pregunta1, answer: respuesta1, order: 1 },
  { id: "faq_2", question: "¿Dónde están ubicados?", answer: "Encuentra nuestra dirección y el mapa en este perfil.", order: 2 },
  { id: "faq_3", question: "¿Cómo puedo contactarlos?", answer: "Escríbenos por WhatsApp desde el botón de este perfil y te respondemos.", order: 3 },
];
const FAQ_CITA = faq("¿Cómo agendo una cita?", "Desde este perfil: elige el servicio, el día y la hora disponible. Recibirás un código de confirmación.");
const FAQ_INFO = faq("¿Cómo pido información?", "Escríbenos por WhatsApp desde este perfil y te atendemos.");

// Horario semanal del equipo de ejemplo (día 0 = domingo).
const HORARIO = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
  day, isOpen: day >= 1 && day <= 5 || day === 6,
  openTime: "09:00", closeTime: day === 6 ? "14:00" : "18:00",
}));

// ── 3) Definición de cada paquete ────────────────────────────────────────────
const D = demos;
const F = filas;
const paquetes = [
  {
    clave: "barberia", theme: "barber", demo: "02", etiqueta: "BARBERÍA",
    perfil: (d) => ({
      ...pick(d, [...ESTILO, ...GALERIA]),
      products: d.products.map((p) => p.id === "svc_vip"
        ? producto(p, { name: "Experiencia Completa", shortDescription: "Corte, barba, limpieza facial y masaje de cuello." })
        : producto(p)),
      barber_products: d.barber_products.filter((p) => !p.subscription).map((p) =>
        producto(p, { stock: p.stock, name: p.name.replace(" Cedro & Cuero", "") })),
      faqs: FAQ_CITA,
    }),
    tablas: () => [{
      tabla: "barber_staff", propietario: "barber_id",
      filas: [["Barbero Master", 1], ["Especialista en Fade", 2], ["Barbero & Barba", 3]].map(([role, n]) => ({
        id: `seed-bs${n}`, name: `Barbero ${n}`, role, sort_order: n, working_hours: HORARIO, is_active: true,
      })),
    }],
    copy: {
      jobTitle: "Barbería · Cortes y cuidado de barba",
      bio: "Cortes, barba y cuidado masculino en {{ciudad}}. Reserva tu cita desde este perfil.",
      aboutMe: "En {{nombre}} cuidamos tu imagen con oficio y buen trato: cortes clásicos y modernos, arreglo de barba y atención sin prisa. Agenda tu cita desde este perfil y llega a la hora que más te acomode.",
    },
  },
  {
    clave: "belleza", theme: "barber", demo: "02", etiqueta: "BELLEZA",
    perfil: (d) => ({
      ...pick(d, ESTILO),
      products: catalogo("bel", [
        ["Cabello", "Corte de cabello", "$12.00", "Corte y peinado final a tu estilo."],
        ["Cabello", "Peinado", "$15.00", "Peinado para el día a día o para tu evento."],
        ["Cabello", "Tinte", "$35.00", "Color completo con productos de calidad."],
        ["Cabello", "Tratamiento capilar", "$25.00", "Hidratación profunda para un cabello sano y brillante."],
        ["Uñas", "Manicure", "$10.00", "Limpieza, limado y esmaltado."],
        ["Uñas", "Pedicure", "$12.00", "Cuidado completo para tus pies."],
        ["Cuidado", "Limpieza facial", "$20.00", "Limpieza profunda e hidratación."],
        ["Cuidado", "Masaje relajante", "$30.00", "Un respiro para tu cuerpo, 60 minutos."],
      ]),
      faqs: FAQ_CITA,
    }),
    tablas: () => [{
      tabla: "barber_staff", propietario: "barber_id",
      filas: [1, 2].map((n) => ({ id: `seed-bs${n}`, name: `Estilista ${n}`, role: "Estilista", sort_order: n, working_hours: HORARIO, is_active: true })),
    }],
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
      faqs: faq("¿Cómo reservo una mesa?", "Desde este perfil: elige el día, la hora y el número de personas. Recibirás un código de confirmación."),
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
      faqs: faq("¿Cómo reservo una mesa?", "Desde este perfil: elige el día, la hora y el número de personas. Recibirás un código de confirmación."),
    }),
    copy: {
      jobTitle: "Café y bar",
      bio: "Tu lugar para tomar algo en {{ciudad}}. Mira la carta y reserva tu mesa desde este perfil.",
      aboutMe: "En {{nombre}} te esperamos con buen ambiente y una carta pensada para compartir. Conoce lo que ofrecemos y reserva tu mesa desde este perfil.",
    },
  },
  ...["clinica", "salud"].map((clave) => ({
    clave, theme: "medical", demo: "07", etiqueta: "SALUD",
    perfil: (d) => ({
      ...pick(d, [...ESTILO, ...GALERIA, ...RESERVAS]),
      products: d.products.filter((p) => p.category !== "Farmacia").map((p) => producto(p)),
      clinicServices: structuredClone(d.clinicServices),
      faqs: FAQ_CITA,
    }),
    copy: clave === "clinica" ? {
      jobTitle: "Atención médica y salud",
      bio: "Cuidamos tu salud en {{ciudad}}. Agenda tu cita desde este perfil.",
      aboutMe: "En {{nombre}} nos dedicamos a cuidar tu salud y la de tu familia. Conoce nuestros servicios y agenda tu cita desde este perfil, sin llamadas ni esperas.",
    } : {
      jobTitle: "Salud y bienestar",
      bio: "Salud y bienestar en {{ciudad}}. Agenda desde este perfil o escríbenos por WhatsApp.",
      aboutMe: "En {{nombre}} estamos para ayudarte con tu salud y bienestar. Conoce nuestros servicios y agenda desde este perfil.",
    },
  })),
  {
    clave: "veterinaria", theme: "petcare", demo: "06", etiqueta: "VETERINARIA",
    perfil: (d) => ({
      ...pick(d, [...ESTILO, ...GALERIA, ...RESERVAS]),
      products: porCategoria(d, ["Servicios", "Accesorios"]).map((p) => producto(p, p.name.startsWith("Vacunación") ? { name: "Vacunación" } : {})),
      clinicServices: structuredClone(d.clinicServices),
      faqs: FAQ_CITA,
    }),
    copy: {
      jobTitle: "Veterinaria · Cuidado de mascotas",
      bio: "Cuidamos a tu mejor amigo en {{ciudad}}. Agenda su cita desde este perfil.",
      aboutMe: "En {{nombre}} cuidamos la salud y el bienestar de tu mascota. Conoce nuestros servicios y agenda su cita desde este perfil.",
    },
  },
  {
    clave: "mascotas", theme: "petcare", demo: "06", etiqueta: "MASCOTAS",
    perfil: (d) => ({
      ...pick(d, [...ESTILO, ...GALERIA]),
      products: [
        ...catalogo("mas", [
          ["Alimento", "Alimento para perro adulto (3 kg)", "$38.00", "Nutrición balanceada para perros adultos."],
          ["Alimento", "Alimento para gato adulto (2 kg)", "$26.50", "Nutrición balanceada para gatos adultos."],
          ["Alimento", "Snacks y premios", "$5.50", "Para recompensar a tu mascota."],
          ["Higiene", "Arena sanitaria (5 kg)", "$9.00", "Control de olores y fácil limpieza."],
        ]),
        ...porCategoria(d, ["Accesorios"]).map((p) => producto(p)),
      ],
      faqs: FAQ_INFO,
    }),
    copy: {
      jobTitle: "Tienda de mascotas",
      bio: "Todo para tu mascota en {{ciudad}}. Escríbenos por WhatsApp y te atendemos.",
      aboutMe: "En {{nombre}} encuentras lo que tu mascota necesita. Escríbenos desde este perfil y te ayudamos.",
    },
  },
  {
    clave: "inmobiliaria", theme: "realty", demo: "08", etiqueta: "INMOBILIARIA",
    perfil: (d) => ({ ...pick(d, [...ESTILO, "coverImageURL"]), faqs: FAQ_INFO }),
    tablas: (_d, fl) => {
      const titulos = ["Casa moderna con piscina", "Departamento de 2 dormitorios", "Suite de inversión", "Casa familiar de tres plantas",
        "Penthouse con vista panorámica", "Oficina corporativa", "Residencia con piscina", "Casa de descanso", "Departamento familiar", "Terreno de 1.200 m²"];
      const lugares = /Cumbay[áa]|La Carolina|La Mariscal|Sangolqu[íi]|Valle de Los Chillos|Gonz[áa]lez Su[áa]rez|Naciones Unidas|Centro Financiero|Samborond[óo]n|Salinas|Santa Elena|Cuenca|Remigio Crespo|Tumbaco|Quito|Guayas/g;
      return [
        {
          tabla: "realty_agents", propietario: "agency_profile_id",
          filas: [1, 2].map((n) => ({ id: `seed-ra${n}`, agent_username: `{{username}}-asesor-${n}`, name: `Asesor ${n}`, phone_whatsapp: "{{wa593}}", is_active: true })),
        },
        {
          tabla: "realty_properties", propietario: "agency_profile_id",
          filas: fl.realty_properties.map((p, i) => ({
            ...quitar(p, ["agency_profile_id"]),
            title: titulos[i], location: "{{ubicacion}}", description: String(p.description).replace(lugares, "la zona"),
          })),
        },
      ];
    },
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
      faqs: faq("¿Cómo reservo mi clase?", "En la sección Horario elige la clase y la fecha. Recibirás un código para consultar o cancelar tu reserva."),
    }),
    tablas: (_d, fl) => {
      const nombres = Object.fromEntries(fl.gym_coaches.map((c, i) => [c.name, `Entrenador ${i + 1}`]));
      return [
        {
          tabla: "gym_coaches", propietario: "gym_profile_id",
          filas: fl.gym_coaches.map((c) => ({ ...quitar(c, ["gym_profile_id", "photo_url", "bio"]), name: nombres[c.name] })),
        },
        { tabla: "gym_plans", propietario: "gym_profile_id", filas: fl.gym_plans.map((p) => quitar(p, ["gym_profile_id"])) },
        {
          tabla: "gym_classes", propietario: "gym_profile_id",
          filas: fl.gym_classes.map((c) => ({ ...quitar(c, ["gym_profile_id"]), coach_name: nombres[c.coach_name] ?? c.coach_name })),
        },
      ];
    },
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
      faqs: faq("¿Cómo reservo?", "Elige tus fechas en «Reserva tu estadía», selecciona la habitación y envía tus datos."),
    }),
    tablas: (_d, fl) => {
      const habitaciones = [
        ["Suite", "Suite amplia con sala de estar, jacuzzi y balcón privado. Perfecta para escapadas en pareja y celebraciones especiales."],
        ["Doble Superior", "Habitación luminosa con dos camas dobles, escritorio y baño completo. Ideal para amigos o familias pequeñas."],
        ["Habitación Familiar", "Dos ambientes y cocina equipada para que toda la familia disfrute sin apuros."],
        ["Habitación Estándar", "Sencilla y cómoda, con todo lo necesario para descansar. La opción más económica."],
        ["Cabaña", "Cabaña independiente con terraza y hamaca. Para quienes buscan privacidad y tranquilidad."],
      ];
      const servicios = {
        "Desayuno buffet": "Frutas, panadería y platos calientes.",
        "Masaje relajante": "60 minutos de masaje relajante.",
        "Cena romántica en la playa": "Mesa privada con menú de tres tiempos.",
      };
      return [
        {
          tabla: "hotel_rooms", propietario: "hotel_profile_id",
          filas: fl.hotel_rooms.map((r, i) => ({
            ...quitar(r, ["hotel_profile_id"]), name: habitaciones[i][0], description: habitaciones[i][1],
            amenities: r.amenities.filter((a) => !/vista|jard[ií]n|\bmar\b|palmer/i.test(a)),
          })),
        },
        {
          tabla: "hotel_services", propietario: "hotel_profile_id",
          filas: fl.hotel_services.filter((s) => s.name !== "Tour de ballenas").map((s) => ({
            ...quitar(s, ["hotel_profile_id"]),
            name: s.name === "Cena romántica en la playa" ? "Cena romántica" : s.name,
            description: servicios[s.name] ?? s.description,
            // La demo deja sin foto el traslado y la lavandería; un servicio sin foto se ve «incompleto».
            image_url: s.image_url || U({ "Traslado aeropuerto": "1772465877912-08f178bd07f6", "Lavandería": "1760722974657-f64bce2f9cc5" }[s.name] ?? "1520250497591-112f2f40a3f4"),
          })),
        },
      ];
    },
    copy: {
      jobTitle: "Hotel · Hospedaje",
      bio: "Descansa en {{ciudad}}. Conoce nuestras habitaciones y reserva desde este perfil.",
      aboutMe: "En {{nombre}} queremos que tu estadía sea cómoda y tranquila. Conoce nuestras habitaciones y reserva directo desde este perfil.",
    },
  },
  ...[
    ["tiendas", "TIENDA", "Tienda", "Conoce lo que tenemos para ti en {{ciudad}}. Escríbenos por WhatsApp y te atendemos.",
      "En {{nombre}} te esperamos con lo que necesitas. Escríbenos desde este perfil y te ayudamos con tu compra.", [
        ["Destacados", "Producto más vendido", "$9.90", "El favorito de nuestros clientes."],
        ["Destacados", "Combo familiar", "$19.90", "Varios productos juntos a mejor precio."],
        ["Destacados", "Kit de regalo", "$24.90", "Listo para regalar, con envoltura incluida."],
        ["Ofertas", "Pack ahorro x3", "$14.50", "Lleva tres y ahorra."],
        ["Ofertas", "Oferta de la semana", "$7.90", "Por tiempo limitado."],
        ["Novedades", "Edición limitada", "$39.90", "Disponible hasta agotar stock."],
      ]],
    ["talleres", "TALLER", "Taller · Servicios", "Servicio de confianza en {{ciudad}}. Escríbenos por WhatsApp y coordinamos tu cita.",
      "En {{nombre}} nos encargamos de tu trabajo con responsabilidad. Cuéntanos qué necesitas desde este perfil y coordinamos.", [
        ["Mantenimiento", "Cambio de aceite y filtro", "$35.00", "Aceite y filtro nuevos, con revisión de niveles."],
        ["Mantenimiento", "Mantenimiento preventivo", "$60.00", "Revisión de los puntos clave para evitar daños mayores."],
        ["Mantenimiento", "Revisión general", "$40.00", "Chequeo completo de tu vehículo."],
        ["Frenos y suspensión", "Revisión de frenos", "$25.00", "Pastillas, discos y líquido."],
        ["Frenos y suspensión", "Alineación y balanceo", "$30.00", "Para que tu vehículo ruede recto y sin vibraciones."],
        ["Diagnóstico", "Diagnóstico con scanner", "$20.00", "Lectura de códigos de falla y reporte."],
        ["Diagnóstico", "Cambio de batería", "$15.00", "Mano de obra de instalación y prueba de carga."],
      ]],
    ["oficinas", "SERVICIOS", "Servicios profesionales", "Servicios profesionales en {{ciudad}}. Escríbenos por WhatsApp y conversemos.",
      "En {{nombre}} te asesoramos con atención personalizada. Cuéntanos tu caso desde este perfil y te respondemos.", [
        ["Asesoría", "Primera consulta", "$30.00", "Conversamos tu caso y te orientamos."],
        ["Asesoría", "Asesoría mensual", "$120.00", "Acompañamiento continuo durante el mes."],
        ["Trámites", "Revisión de documentos", "$45.00", "Revisamos tus documentos antes de que los presentes."],
        ["Trámites", "Elaboración de contratos", "$90.00", "Contratos a la medida de tu necesidad."],
        ["Trámites", "Gestión de trámites", "$60.00", "Nos encargamos del papeleo por ti."],
        ["Capacitación", "Capacitación para equipos", "$150.00", "Sesión práctica para tu equipo de trabajo."],
      ]],
  ].map(([clave, etiqueta, jobTitle, bio, aboutMe, items]) => ({
    clave, theme: "ecom", demo: "04", etiqueta,
    perfil: (d) => ({
      ...pick(d, ESTILO),
      products: catalogo(clave.slice(0, 3), items),
      ecom_booking_form: [
        { id: "f_nombre", label: "Nombre y apellido", type: "text", required: true, placeholder: "Ej. María Pérez" },
        { id: "f_tel", label: "WhatsApp", type: "tel", required: true, placeholder: "09XXXXXXXX" },
        { id: "f_notas", label: "¿En qué podemos ayudarte?", type: "textarea", required: false, placeholder: "Cuéntanos lo que necesitas" },
      ],
      faqs: FAQ_INFO,
    }),
    tablas: () => [{
      tabla: "ecom_staff", propietario: "seller_id",
      filas: [{ id: "seed-es1", name: "Atención al cliente", role: "Atención", slot_minutes: 60, sort_order: 1, working_hours: HORARIO, is_active: true }],
    }],
    copy: { jobTitle, bio, aboutMe },
  })),
  // ── Las 3 plantillas que faltaban: Artista, Sublimados y Estándar ──
  {
    clave: "musicos", theme: "stage", demo: "05", etiqueta: "MÚSICA",
    perfil: (d) => ({
      ...pick(d, [...ESTILO, ...GALERIA, "borderColor"]),
      // Merch genérico: nada de títulos de discos, giras ni fechas inventadas (serían promesas del artista).
      products: catalogo("mus", [
        ["Merch", "Camiseta oficial", "$15.00", "Algodón, con el diseño del proyecto."],
        ["Merch", "Camiseta edición especial", "$15.00", "Otro diseño del proyecto, en algodón."],
        ["Merch", "Póster", "$8.00", "Impresión en papel couché, tamaño A3."],
        ["Música", "Disco físico", "$10.00", "Edición física de tu música."],
        ["Música", "Vinilo", "$22.00", "Edición en vinilo de tu música."],
      ]),
      releases: [
        { id: "rel_1", title: "Tu primer sencillo", platform: "Spotify", coverURL: d.releases[0].coverURL },
        { id: "rel_2", title: "Tu próximo lanzamiento", platform: "YouTube", coverURL: d.releases[1].coverURL },
      ],
      bookingLink: "https://wa.me/{{wa593}}?text=Hola%2C%20quiero%20contratarlos%20para%20un%20evento",
      faqs: faq("¿Cómo los contrato para un evento?", "Escríbenos por WhatsApp desde el botón de contratación de este perfil y coordinamos fecha y lugar."),
    }),
    copy: {
      jobTitle: "Música · Artista",
      bio: "Música en vivo en {{ciudad}}. Escúchanos y contáctanos para tu evento.",
      aboutMe: "En {{nombre}} hacemos música con pasión. Conoce nuestro trabajo, escúchanos y escríbenos desde este perfil para contratarnos o colaborar.",
    },
  },
  {
    clave: "sublimados", theme: "sublima", demo: "09", etiqueta: "SUBLIMADOS",
    perfil: (d) => ({ ...pick(d, [...ESTILO, ...GALERIA]), faqs: faq("¿Cómo pido una cotización?", "Escríbenos por WhatsApp desde este perfil con lo que necesitas y la cantidad, y te cotizamos.") }),
    tablas: (_d, fl) => [{
      // Catálogo de EJEMPLO (productos, técnicas y precios por volumen de la demo). No se copian clientes, pedidos ni el club mayorista.
      tabla: "sublima_products", propietario: "factory_profile_id",
      // El producto «sin stock» de la demo se deja disponible y sin su nota de reposición: en un ejemplo no tiene sentido.
      filas: fl.sublima_products.map((p) => ({
        ...quitar(p, ["factory_profile_id"]), is_available: true,
        description: String(p.description).replace(/ Próximamente de nuevo en stock de película\./, ""),
      })),
    }],
    copy: {
      jobTitle: "Sublimados, bordados y uniformes",
      bio: "Sublimados, bordados y uniformes en {{ciudad}}. Pide tu cotización por WhatsApp.",
      aboutMe: "En {{nombre}} personalizamos camisetas, uniformes, tazas y más. Conoce lo que hacemos y pide tu cotización desde este perfil.",
    },
  },
  {
    clave: "librerias", theme: "books", demo: "12", etiqueta: "LIBRERÍA",
    perfil: (d) => ({
      ...pick(d, [...ESTILO, ...GALERIA]),
      // Sin tarifas de envío, días de apartado ni envoltorio de regalo: son promesas del negocio, no del ejemplo.
      books_settings: { ordersEnabled: true, pickupEnabled: true, pickupNote: "Retira en la librería con tu código de pedido.", deliveryEnabled: false, timezone: "America/Guayaquil" },
      faqs: faq("¿Cómo pido un libro?", "Elige el libro en el catálogo y envía tu pedido desde este perfil. Recibirás un código para consultarlo."),
    }),
    tablas: (_d, fl) => {
      // Catálogo de EJEMPLO: hasta 3 títulos por categoría (clásicos conocidos, con portada e ISBN). NO se copian lectores, pedidos,
      // pedidos especiales, listas de espera, listas escolares (nombran colegios), eventos (nombran invitados) ni tarjetas de regalo.
      // Se descartan los títulos de la demo que son inventados o ligados a ella o a un lugar (editorial/autor propios de la demo,
      // «Quito…», «Municipio…»): en un ejemplo sin dueño real no tienen sentido.
      const DE_LA_DEMO = /Rinc[oó]n|Mariscal|Municipio|Quito|Mariana Lazo/i;
      const porCategoria = new Map();
      for (const t of fl.books_titles) {
        if (DE_LA_DEMO.test([t.title, t.author, t.publisher, t.description].join(" "))) continue;
        if (!t.cover_url) continue;   // un libro sin portada se ve «incompleto»: solo entran los que la traen
        const lista = porCategoria.get(t.category) ?? [];
        if (lista.length < 3) lista.push(t);
        porCategoria.set(t.category, lista);
      }
      const titulos = [...porCategoria.values()].flat().map((t, i) => ({
        ...quitar(t, ["shop_profile_id", "staff_note", "images"]),
        // En un ejemplo no hay «agotados», ni descuentos, ni fechas de estreno de la demo (macros «@D(-9)» sin resolver),
        // ni marcas de papelería como si fueran editorial.
        sold_count: 0, original_price: null, release_date: null, is_available: true, sort_order: i + 1,
        stock: t.stock > 0 ? t.stock : 5,
        publisher: t.category === "Papelería" ? null : t.publisher,
      }));
      return [{ tabla: "books_titles", propietario: "shop_profile_id", filas: titulos }];
    },
    copy: {
      jobTitle: "Librería · Libros y papelería",
      bio: "Libros, papelería y más en {{ciudad}}. Pide el tuyo desde este perfil.",
      aboutMe: "En {{nombre}} encuentras novela, infantil, textos escolares y papelería. Mira el catálogo, pide tu libro desde este perfil y retíralo en la librería.",
    },
  },
  {
    clave: "profesionales", theme: "default", demo: "01", etiqueta: "PROFESIONAL",
    perfil: (d) => ({
      ...pick(d, [...ESTILO, "coverImageURL"]),
      galleryMode: "grid", galleryImageURLs: structuredClone(d.galleryImageURLs), albums: [],
      products: catalogo("prf", [
        ["Servicios", "Primera consulta", "$30.00", "Conversamos tu caso y te orientamos."],
        ["Servicios", "Sesión de seguimiento", "$45.00", "Revisamos avances y definimos los siguientes pasos."],
        ["Servicios", "Plan a la medida", "$120.00", "Un plan de trabajo pensado para tu objetivo."],
        ["Servicios", "Taller o charla", "$150.00", "Sesión práctica para tu equipo o comunidad."],
      ]),
      showCalendar: true,
      calendarServices: ["Primera consulta", "Sesión de seguimiento", "Taller o charla"],
      bookingLink: "https://wa.me/{{wa593}}?text=Hola%2C%20quiero%20agendar%20una%20cita",
      calendarWebhookUrl: "https://wa.me/{{wa593}}?text=Hola%2C%20quiero%20agendar%20una%20cita",
      faqs: FAQ_CITA,
    }),
    copy: {
      jobTitle: "Servicios profesionales",
      bio: "Servicios profesionales en {{ciudad}}. Agenda una cita o escríbenos por WhatsApp.",
      aboutMe: "En {{nombre}} te acompañamos con atención personalizada. Conoce nuestros servicios y agenda tu cita desde este perfil.",
    },
  },
];

// ── Academia de música: la plantilla Artista CON horario de clases (stage_classes) ──────────────────────────
// Variante del paquete «musicos» para escuelas y academias (claveDePack en kodaIntake la elige por categoría/nombre): mismo
// look, fotos y merch, más un horario semanal de ejemplo con cupos (todo EJEMPLO: sin nombres de profesores, precios ni promesas).
FOTOS.academia_musica = FOTOS.musicos;
{
  const base = paquetes.find((p) => p.clave === "musicos");
  const HORAS = (h, mins = 60) => { const [a, b] = h.split(":").map(Number); const t = a * 60 + b + mins; return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
  // [nombre, disciplina, día (0=Dom…6=Sáb), inicio, aforo, nivel, profesor, aula]
  const CLASES = [
    ["Guitarra inicial", "Guitarra", 1, "17:00", 8, "principiante", "Profesor 1", "Aula 1"],
    ["Canto", "Canto", 1, "18:30", 10, "todos", "Profesor 2", "Aula 2"],
    ["Piano", "Piano", 2, "16:00", 6, "principiante", "Profesor 3", "Aula 3"],
    ["Lenguaje musical", "Teoría", 2, "18:00", 12, "todos", "Profesor 2", "Aula 2"],
    ["Guitarra inicial", "Guitarra", 3, "17:00", 8, "principiante", "Profesor 1", "Aula 1"],
    ["Batería", "Batería", 3, "18:30", 4, "intermedio", "Profesor 4", "Aula 4"],
    ["Piano", "Piano", 4, "16:00", 6, "principiante", "Profesor 3", "Aula 3"],
    ["Violín", "Violín", 4, "17:30", 6, "principiante", "Profesor 5", "Aula 5"],
    ["Canto", "Canto", 5, "18:30", 10, "todos", "Profesor 2", "Aula 2"],
    ["Batería", "Batería", 6, "10:00", 4, "intermedio", "Profesor 4", "Aula 4"],
    ["Producción musical", "Producción", 6, "11:30", 10, "intermedio", "Profesor 6", "Aula 6"],
    ["Ensamble de música", "Banda", 6, "15:00", 12, "avanzado", "Profesor 1", "Aula 1"],
  ];
  paquetes.push({
    ...base,
    clave: "academia_musica", etiqueta: "ACADEMIA",
    perfil: (d) => ({
      ...base.perfil(d),
      stage_settings: { bookingEnabled: true, bookingDaysAhead: 14, cancelHours: 2, timezone: "America/Guayaquil" },
      faqs: faq("¿Cómo reservo una clase?", "En la sección Clases elige el día y la clase, y reserva tu cupo. Recibirás un código para consultarlo o cancelarlo."),
    }),
    tablas: () => [{
      tabla: "stage_classes", propietario: "stage_profile_id",
      filas: CLASES.map(([name, discipline, dia, inicio, capacity, level, teacher_name, room], i) => ({
        id: `seed-sc${i + 1}`, name, discipline, description: null, day_of_week: dia, start_time: inicio, end_time: HORAS(inicio),
        teacher_name, capacity, level, room, is_active: true, sort_order: i + 1,
      })),
    }],
    copy: {
      jobTitle: "Academia de música · Clases",
      bio: "Clases de música en {{ciudad}}. Mira el horario y reserva tu cupo desde este perfil.",
      aboutMe: "En {{nombre}} aprendes música con clases para todos los niveles. Conoce nuestro horario semanal, reserva tu cupo desde este perfil y escríbenos si tienes preguntas.",
    },
  });
}

// ── 4) Armar, limpiar y escribir ─────────────────────────────────────────────
// SOLO=librerias (o varias claves separadas por coma): arma únicamente esos paquetes, los mezcla en recursos.json sin tocar
// los demás (así un cambio en una demo ajena no reescribe todo el banco) y escribe un SQL solo con ellos.
const SOLO = process.env.SOLO ? process.env.SOLO.split(",").map((s) => s.trim()).filter(Boolean) : null;
const salida = [];
for (const p of paquetes) {
  if (SOLO && !SOLO.includes(p.clave)) continue;
  const d = D[p.demo];
  if (!d) throw new Error(`Falta la demo ${p.demo} (¿están los setup_demo_*.sql en la carpeta del proyecto?)`);
  const extra = { "01": ["Villacís Consultores", "Mateo Villacís"], "02": ["Navaja & Cuero"], "03": ["Brasa & Mar"], "04": ["Cumbre"], "05": ["Los Desvelados"], "06": ["Huellitas"], "07": ["Vitalis"], "08": ["Cimientos"], "09": ["Estampa Total", "Club Mayorista Estampa"], "10": ["Titán"], "11": ["Costa Rosa"], "12": ["El Rincón de Papel", "Rincón de Papel"] };
  const marcas = [d.displayName, d.company, ...(extra[p.demo] ?? [])].filter(Boolean).sort((a, b) => b.length - a.length);
  const perfil = aplicarFotos(p.clave, sinMarca(p.perfil(d), marcas));
  Object.assign(perfil, sanearPaleta(perfil));   // contraste (WCAG): acento legible, texto de botón y de página
  if (perfil.galleryImageURLs?.length) perfil.galleryTitle = GALERIA_TITULO;
  const tablas = sinMarca(p.tablas ? p.tablas(d, F[p.demo]) : [], marcas);
  const paquete = {
    clave: p.clave, theme: p.theme, fuente: `setup_demo_${p.demo}`,
    logo: { etiqueta: p.etiqueta, ...paletaLogo({ fondo: perfil.backgroundColor ?? d.backgroundColor, acento: perfil.buttonColor ?? d.buttonColor, texto: perfil.textColor ?? d.textColor }) },
    copy: p.copy, perfil,
  };
  if (tablas.length) paquete.tablas = tablas;
  salida.push(paquete);
}
{
  const ruta = path.join(aqui, "recursos.json");
  let completo = salida;
  if (SOLO) {   // mezcla: reemplaza los paquetes pedidos y deja intactos los demás
    const previos = fs.existsSync(ruta) ? JSON.parse(fs.readFileSync(ruta, "utf8")) : [];
    completo = [...previos.filter((x) => !SOLO.includes(x.clave)), ...salida];
  }
  fs.writeFileSync(ruta, JSON.stringify(completo, null, 2) + "\n");
}

// Revisión automática: restos de las demos que no deben pasar.
const turbio = /navaja|cuero|brasa|huellitas|vitalis|cimientos|tit[aá]n|costa rosa|cumbre|estampa total|desvelados|villac[ií]s|quito|guayaquil|cuenca|urdesa|floresta|cumbay|carolina|mariscal|samborond|salinas|tumbaco|chillos|\.test|connexo|club |banco|@|diego|andr[eé]s|valeria|camila|roberto|silvana|andrea|mateo/i;
let alertas = 0;
const revisar = (v, ruta) => {
  if (typeof v === "string") { if (turbio.test(v) && !/^https?:\/\/images\.unsplash\.com/.test(v)) { console.log(`  ⚠ ${ruta}: ${v.slice(0, 100)}`); alertas++; } }
  else if (Array.isArray(v)) v.forEach((x, i) => revisar(x, `${ruta}[${i}]`));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) revisar(x, `${ruta}.${k}`);
};
for (const s of salida) revisar({ copy: s.copy, perfil: s.perfil, tablas: s.tablas }, s.clave);
console.log(`Paquetes: ${salida.length} · alertas de texto: ${alertas}`);
for (const s of salida) {
  const t = (s.tablas ?? []).map((x) => `${x.tabla}:${x.filas.length}`).join(" ");
  console.log(`  ${s.clave.padEnd(13)} ${s.theme.padEnd(8)} productos:${String(s.perfil.products?.length ?? 0).padEnd(3)} fotos:${String(s.perfil.galleryImageURLs?.length ?? 0).padEnd(2)} faqs:${s.perfil.faqs?.length ?? 0}  ${t}`);
}
const claves = new Set(salida.flatMap((s) => Object.keys(s.perfil)));
console.log("Columnas de perfil que usa el banco:", [...claves].sort().join(", "));

// ── 5) SQL ───────────────────────────────────────────────────────────────────
const filasSql = salida.map((s) =>
  `INSERT INTO public.koda_recursos_nicho (clave, theme, pack, nota) VALUES (\n  '${s.clave}', '${s.theme}',\n  $koda$${JSON.stringify({ logo: s.logo, copy: s.copy, perfil: s.perfil, ...(s.tablas ? { tablas: s.tablas } : {}) })}$koda$::jsonb,\n  'Generado de ${s.fuente}. Contenido de EJEMPLO: el negocio debe revisarlo.'\n)\nON CONFLICT (clave) DO UPDATE SET theme = EXCLUDED.theme, pack = EXCLUDED.pack, nota = EXCLUDED.nota, updated_at = now();`
).join("\n\n");

const sql = `-- ═══════════════════════════════════════════════════════════════════════════
-- setup_koda_recursos.sql — Banco de recursos por nicho (FASE 2 del puente KODA → Connexo)
--
-- QUÉ HACE: kodaIntake completa cada perfil borrador con lo que KODA no trae (look, fotos del local,
-- catálogo de EJEMPLO, planes/clases/habitaciones/propiedades según la plantilla, horario tipo, FAQs
-- neutras y textos genéricos) para que el negocio vea la plantilla CON contenido. Esos paquetes viven
-- aquí, en la tabla koda_recursos_nicho (una fila por nicho), para corregirlos sin volver a desplegar.
--
-- ✔ Solo crea una tabla nueva y agrega 2 columnas a koda_prospectos (creada por setup_koda_bridge.sql).
-- ✔ Idempotente. Re-ejecutarlo REFRESCA los paquetes (pisa cambios hechos a mano en esas filas).
-- ✔ Se genera con: node supabase/koda-recursos/build-recursos.mjs  (fuente: recursos.json)
-- Ejecutar TODO en Supabase → SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.koda_recursos_nicho (
  clave      text PRIMARY KEY,                 -- nicho: barberia, belleza, restaurantes, cafe_bar, clinica, salud, veterinaria, mascotas, inmobiliaria, gimnasios, hoteles, tiendas, talleres, oficinas, musicos, sublimados, profesionales
  theme      text NOT NULL,                    -- profiles.theme al que pertenece
  pack       jsonb NOT NULL,                   -- { logo, copy, perfil, tablas? }
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

${filasSql}

-- Qué plantilla le toca a cada rubro NUEVO de KODA (no pisa lo que ya hayas cambiado a mano).
INSERT INTO public.koda_rubro_plantilla (rubro, theme, nota) VALUES
  ('musicos',       'stage',   'Plantilla Artista: músicos, bandas, DJ, estudios y escuelas de música.'),
  ('sublimados',    'sublima', 'Plantilla Sublimados: sublimación, bordados, serigrafía, imprentas y uniformes.'),
  ('profesionales', 'default', 'Plantilla Estándar: profesionales independientes (fotógrafos, coaches, psicólogos, consultores).'),
  ('librerias',     'books',   'Plantilla Librería: librerías y papelerías (catálogo con ISBN y stock, pedidos con apartado).')
ON CONFLICT (rubro) DO NOTHING;

-- VERIFICACIÓN (opcional)
-- SELECT clave, theme, jsonb_array_length(coalesce(pack->'perfil'->'products', '[]'::jsonb)) AS productos, jsonb_array_length(coalesce(pack->'tablas', '[]'::jsonb)) AS tablas FROM koda_recursos_nicho ORDER BY clave;
`;
if (SOLO) {
  const nombreSql = `setup_koda_${SOLO.join("_")}.sql`;
  const reglas = SOLO.includes("librerias")
    ? `\n-- Qué plantilla le toca al rubro NUEVO «librerias» de KODA (no pisa lo que ya hayas cambiado a mano).\nINSERT INTO public.koda_rubro_plantilla (rubro, theme, nota) VALUES\n  ('librerias', 'books', 'Plantilla Librería: librerías y papelerías (catálogo con ISBN y stock, pedidos con apartado).')\nON CONFLICT (rubro) DO NOTHING;\n`
    : "";
  const subconjunto = `-- Paquete(s) ${SOLO.join(", ")} del banco de recursos — subconjunto de setup_koda_recursos.sql.\n-- Requiere que koda_recursos_nicho y koda_rubro_plantilla ya existan (Fase 2). Idempotente.\n-- Generado con: SOLO=${SOLO.join(",")} node supabase/koda-recursos/build-recursos.mjs\n\n${filasSql}\n${reglas}\n-- VERIFICACIÓN\nSELECT clave, theme, jsonb_array_length(coalesce(pack->'tablas'->0->'filas', '[]'::jsonb)) AS filas_tabla FROM public.koda_recursos_nicho ORDER BY clave;\n`;
  fs.writeFileSync(path.join(raiz, nombreSql), subconjunto);
  console.log(`SQL (solo ${SOLO.join(", ")}): ${path.join(raiz, nombreSql)} (${(subconjunto.length / 1024).toFixed(1)} KB)`);
} else
fs.writeFileSync(path.join(raiz, "setup_koda_recursos.sql"), sql);
console.log(`SQL: ${path.join(raiz, "setup_koda_recursos.sql")} (${(sql.length / 1024).toFixed(1)} KB)`);
