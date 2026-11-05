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
];

// ── 4) Armar, limpiar y escribir ─────────────────────────────────────────────
const salida = [];
for (const p of paquetes) {
  const d = D[p.demo];
  if (!d) throw new Error(`Falta la demo ${p.demo} (¿están los setup_demo_*.sql en la carpeta del proyecto?)`);
  const extra = { "02": ["Navaja & Cuero"], "03": ["Brasa & Mar"], "04": ["Cumbre"], "06": ["Huellitas"], "07": ["Vitalis"], "08": ["Cimientos"], "10": ["Titán"], "11": ["Costa Rosa"] };
  const marcas = [d.displayName, d.company, ...(extra[p.demo] ?? [])].filter(Boolean).sort((a, b) => b.length - a.length);
  const perfil = sinMarca(p.perfil(d), marcas);
  if (perfil.galleryImageURLs?.length) perfil.galleryTitle = GALERIA_TITULO;
  const tablas = sinMarca(p.tablas ? p.tablas(d, F[p.demo]) : [], marcas);
  const paquete = {
    clave: p.clave, theme: p.theme, fuente: `setup_demo_${p.demo}`,
    logo: { etiqueta: p.etiqueta, fondo: d.backgroundColor, acento: d.buttonColor, texto: d.textColor },
    copy: p.copy, perfil,
  };
  if (tablas.length) paquete.tablas = tablas;
  salida.push(paquete);
}
fs.writeFileSync(path.join(aqui, "recursos.json"), JSON.stringify(salida, null, 2) + "\n");

// Revisión automática: restos de las demos que no deben pasar.
const turbio = /navaja|cuero|brasa|huellitas|vitalis|cimientos|tit[aá]n|costa rosa|cumbre|estampa|quito|guayaquil|cuenca|urdesa|floresta|cumbay|carolina|mariscal|samborond|salinas|tumbaco|chillos|\.test|connexo|club |banco|@|diego|andr[eé]s|valeria|camila|roberto|silvana|andrea|mateo/i;
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
  clave      text PRIMARY KEY,                 -- nicho: barberia, belleza, restaurantes, cafe_bar, clinica, salud, veterinaria, mascotas, inmobiliaria, gimnasios, hoteles, tiendas, talleres, oficinas
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

-- VERIFICACIÓN (opcional)
-- SELECT clave, theme, jsonb_array_length(coalesce(pack->'perfil'->'products', '[]'::jsonb)) AS productos, jsonb_array_length(coalesce(pack->'tablas', '[]'::jsonb)) AS tablas FROM koda_recursos_nicho ORDER BY clave;
`;
fs.writeFileSync(path.join(raiz, "setup_koda_recursos.sql"), sql);
console.log(`SQL: ${path.join(raiz, "setup_koda_recursos.sql")} (${(sql.length / 1024).toFixed(1)} KB)`);
