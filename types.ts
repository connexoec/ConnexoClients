export interface UserLink {
  id: string;
  title: string;
  url: string;
  isActive: boolean;
  order: number;
  icon?: string;
}

export type SectionType =
  | 'video'
  | 'links'
  | 'products'
  | 'gallery'
  | 'testimonials'
  | 'schedule'
  | 'files'
  | 'faqs'
  | 'calendar'
  // --- Módulos plantilla Stage (artistas/músicos) ---
  | 'releases'
  | 'tour'
  | 'merch'
  | 'fanbase';

// --- Plantilla Stage: lanzamiento musical / streaming ---
export interface Release {
  id: string;
  title: string;
  platform?: string;   // Spotify, Apple Music, YouTube, SoundCloud, etc.
  url: string;         // enlace al lanzamiento o embed
  coverURL?: string;   // portada del single/álbum
  releaseDate?: string;
}

// --- Plantilla Stage: fecha de gira / ticket ---
export interface TourDate {
  id: string;
  date?: string;       // ISO o texto libre
  city: string;
  venue?: string;
  ticketURL?: string;  // enlace de compra de entradas
  soldOut?: boolean;
}

export interface SectionOrder {
  type: SectionType;
  enabled: boolean;
  order: number;
}

export interface ProductExtraOption {
  id: string;
  label: string;
  price: number; // precio adicional en unidad monetaria; 0 = gratis
}

export interface ProductExtra {
  id: string;
  name: string;       // e.g. "Tamaño", "Adicionales"
  required?: boolean;
  multiSelect?: boolean;
  options: ProductExtraOption[];
}

export interface SelectedExtra {
  groupId: string;
  groupName: string;
  optionId: string;
  optionLabel: string;
  optionPrice: number;
}

// --- E-commerce: precio por volumen / pedidos mayoristas ---
export interface EcomPriceTier {
  minQty: number;   // cantidad mínima para aplicar este precio unitario
  price: string;    // precio unitario (ej. "$8.50")
}

// --- E-commerce: pasarelas de pago configuradas por el vendedor ---
// (legacy: lista simple usada antes de v0.37.0)
export interface PaymentGateway {
  id: string;
  name: string;    // nombre visible (ej. "PayPhone", "Transferencia Banco Pichincha")
  link?: string;   // URL del botón de pago (opcional)
}

// Config estructurada de pasarelas de pago (se guarda en profiles.payment_gateways jsonb)
export interface DirectLinkGateway {
  enabled?: boolean;
  name?: string;   // etiqueta visible (ej. "Pagar con tarjeta")
  url?: string;    // URL pública de cobro generada por el banco/pasarela
}
export interface PayphoneGateway {
  enabled?: boolean;
  token?: string;    // token/credencial API del comercio
  storeId?: string;  // Store ID del comercio en PayPhone
}
export interface BankTransferGateway {
  enabled?: boolean;
  bank?: string;          // Banco
  accountType?: string;   // Tipo de cuenta (Ahorros/Corriente)
  accountNumber?: string; // Número de cuenta
  idNumber?: string;      // Cédula / RUC
  email?: string;         // Email para envío del comprobante
  holder?: string;        // Titular de la cuenta
}
export interface WhatsappGateway {
  enabled?: boolean;
  phone?: string;  // Número de recepción de comprobantes
}
export interface PaymentGatewaysConfig {
  directLink?: DirectLinkGateway;
  payphone?: PayphoneGateway;
  bankTransfer?: BankTransferGateway;
  whatsapp?: WhatsappGateway;
}

// ─── Barbería: motor propio ─────────────────────────────────────────────────
// Catálogo de productos de venta (columna profiles.barber_products jsonb).
// Independiente de `Profile.products`, que en barbería son los SERVICIOS.
export interface BarberRetailProduct {
  id: string;
  name: string;
  category?: string;
  price?: string;
  shortDescription?: string;
  imageURL?: string;
  available?: boolean;
  stock?: number;
  /** Suscripción opcional; ausente = producto normal de pago único. */
  subscription?: ProductSubscription;
}

// Pasarelas de pago de barbería (columna profiles.barber_gateways jsonb).
// Contrato propio, sin relación con `PaymentGatewaysConfig` de ecom/gastro.
export interface BarberDirectLinkConfig {
  enabled: boolean;
  url: string;
  label?: string;
}
// ⚠️ Sin credenciales: `barber_gateways` la lee CUALQUIER visitante del perfil
// público (RLS `public_read_profiles` da SELECT a anon sobre toda la fila).
// El token y el client_id de PayPhone viven en `barber_payment_secrets`
// (sin acceso anónimo) y solo los usa la Edge Function `payphone-process`.
export interface BarberPayphoneConfig {
  enabled: boolean;
}

/** Credenciales de PayPhone. Tabla barber_payment_secrets: solo el dueño. */
export interface BarberPaymentSecrets {
  payphone_token?: string;
  payphone_client_id?: string;
}
export interface BarberBankTransferConfig {
  enabled: boolean;
  bank_name: string;
  account_type: string;
  account_number: string;
  holder?: string;
  id_number: string;
  email: string;
}
export interface BarberWhatsappManualConfig {
  enabled: boolean;
  phone: string;
}
export interface BarberPaymentGatewaysConfig {
  direct_link?: BarberDirectLinkConfig;
  payphone?: BarberPayphoneConfig;
  bank_transfer?: BarberBankTransferConfig;
  whatsapp_manual?: BarberWhatsappManualConfig;
}

export type BarberPaymentMethodType = 'direct_link' | 'payphone' | 'bank_transfer' | 'whatsapp_manual';

export interface BarberCheckoutPayload {
  amount: number;
  currency?: string;
  orderId?: string;
  customerDetails?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  items?: Array<{ name: string; quantity: number; price: number }>;
}

// --- Reservas de barbería (motor propio, tablas barber_staff / barber_reservations) ---
// Horario de trabajo de un barbero: una entrada por día de semana.
// day = 0 (Domingo) .. 6 (Sábado), alineado con Date.getDay().
export interface BarberStaffHours {
  day: number;
  isOpen: boolean;
  openTime: string;   // "HH:MM"
  closeTime: string;  // "HH:MM"
}

// Un barbero/estilista del equipo (tabla barber_staff).
export interface BarberStaff {
  id: string;
  barber_id?: string;
  name: string;
  role?: string;
  photo_url?: string;
  working_hours?: BarberStaffHours[];
  is_active?: boolean;
  sort_order?: number;
  created_at?: string;
}

export type BarberReservationStatus = 'pendiente' | 'confirmada' | 'completada' | 'cancelada' | 'no_show';

// Una cita agendada (tabla barber_reservations).
export interface BarberReservation {
  id: string;
  barber_id: string;
  staff_id?: string | null;
  staff_name?: string | null;
  service_name?: string | null;
  customer_name: string;
  customer_phone?: string | null;
  customer_email?: string | null;
  reservation_date: string;   // "YYYY-MM-DD"
  reservation_time: string;   // "HH:MM"
  status: BarberReservationStatus;
  confirmation_code?: string | null;
  member_code?: string | null;
  notes?: string | null;
  created_at?: string;
}

// --- Citas E-Commerce (motor propio, tablas ecom_staff / ecom_appointments) ---
// Horario de trabajo de un vendedor: una entrada por día de semana.
// day = 0 (Domingo) .. 6 (Sábado), alineado con Date.getDay().
export interface EcomStaffHours {
  day: number;
  isOpen: boolean;
  openTime: string;   // "HH:MM"
  closeTime: string;  // "HH:MM"
}

// Un vendedor/asesor del equipo (tabla ecom_staff).
export interface EcomStaff {
  id: string;
  seller_id?: string;
  name: string;
  role?: string;
  photo_url?: string;
  working_hours?: EcomStaffHours[];
  slot_minutes?: number;   // duración de cada franja (default 30)
  is_active?: boolean;
  sort_order?: number;
  created_at?: string;
}

// Un ítem del catálogo elegido al agendar (snapshot dentro de la cita).
export interface EcomAppointmentItem {
  id: string;
  name: string;
  price?: string;
}

// Una respuesta del formulario personalizado (snapshot con su etiqueta, para
// que la cita siga siendo legible aunque el dueño edite el formulario después).
export interface EcomAppointmentFormAnswer {
  id: string;
  label: string;
  value: string;
}

export type EcomAppointmentStatus = 'pendiente' | 'confirmada' | 'completada' | 'cancelada' | 'no_show';

// Una cita agendada (tabla ecom_appointments).
export interface EcomAppointment {
  id: string;
  seller_id: string;
  staff_id?: string | null;
  staff_name?: string | null;
  items?: EcomAppointmentItem[];
  form_data?: EcomAppointmentFormAnswer[];
  customer_name: string;
  customer_phone?: string | null;
  customer_email?: string | null;
  appointment_date: string;   // "YYYY-MM-DD"
  appointment_time: string;   // "HH:MM"
  status: EcomAppointmentStatus;
  confirmation_code?: string | null;
  member_code?: string | null;
  notes?: string | null;
  created_at?: string;
}

// Tipos de campo del formulario personalizado de citas.
export type EcomBookingFieldType =
  | 'text' | 'textarea' | 'tel' | 'email' | 'number' | 'date' | 'select' | 'checkbox';

// Un campo del formulario que el dueño arma en su panel
// (se guarda en profiles.ecom_booking_form jsonb, por perfil).
export interface EcomBookingField {
  id: string;
  label: string;
  type: EcomBookingFieldType;
  required?: boolean;
  placeholder?: string;
  options?: string[];   // solo para type === 'select'
}

// --- Receta (gastro ULTRA): ingredientes que consume un plato del inventario ---
export interface RecipeIngredient {
  itemId: string;     // id del ítem en gastro_inventory
  itemName?: string;  // snapshot del nombre (para mostrar sin re-consultar)
  unit?: string;      // snapshot de la unidad (g, ml, unidad…)
  qty: number;        // cantidad consumida por cada plato vendido
}

export type Product = {
  id: string;
  name: string;
  shortDescription?: string;
  longDescription?: string;
  price?: string;
  imageURL?: string;
  imageURLs?: string[];
  linkURL?: string;
  // --- Campos E-commerce ---
  stock?: number;
  checkoutMode?: 'stripe' | 'whatsapp' | 'both';
  stripeURL?: string;
  allergens?: string;
  category?: string;
  available?: boolean;
  // --- Catálogo extendido (buscador ágil + importación masiva) ---
  brand?: string;             // marca / laboratorio (ej. "Royal Canin", "MSD")
  activeIngredient?: string;  // principio activo (ej. "Amoxicilina", "Fluralaner")
  sku?: string;               // código interno; clave de actualización al importar
  extras?: ProductExtra[]; // grupos de complementos/personalizaciones
  minQty?: number;              // pedido mínimo en unidades (ecom mayorista; default 1)
  priceTiers?: EcomPriceTier[]; // precios por volumen (ecom mayorista)
  // --- Gastro ULTRA: receta enlazada al inventario ---
  recipe?: RecipeIngredient[];
  // --- Suscripción (opcional, todas las plantillas con catálogo) ---
  // Ausente = producto normal de pago único, que es como se comportan todos los
  // productos que ya existen. Sólo se activa si el dueño lo marca.
  subscription?: ProductSubscription;
};

export type SubscriptionPeriod = 'mensual' | 'anual';

/** Precio de una de las dos modalidades de una suscripción. */
export interface SubscriptionTier {
  /** Precio POR CUOTA de esta modalidad. Texto libre, como el resto de precios. */
  price?: string;
  /** Nº de cuotas del ciclo. Por defecto 12 en mensual y 1 en anual. */
  installments?: number;
}

/**
 * Suscripción de un producto. Ver `setup_member_plans.sql`.
 *
 * ⚠️ Mensual y anual son INDEPENDIENTES y opcionales por separado: el anual
 * suele costar menos que 12 mensualidades, y esa diferencia es justo lo que se
 * le enseña al cliente ("ahorras X"). Un producto puede ofrecer sólo una de las
 * dos, o ambas; con ambas, el perfil dibuja el selector Mensual/Anual.
 */
export interface ProductSubscription {
  monthly?: SubscriptionTier;
  annual?: SubscriptionTier;
  /** @deprecated v1: un único periodo. Se sigue leyendo para no perder datos. */
  period?: SubscriptionPeriod;
  /** @deprecated v1. */
  installments?: number;
}

/**
 * Un plan de pago = una fila de `member_plans`.
 * ⚠️ Un mismo cliente puede tener VARIOS: paga 3 productos y se suman.
 */
export interface MemberPlan {
  id?: string;
  owner_id?: string;
  system?: MemberPlanSystem;
  client_id?: string;
  member_code?: string | null;
  product_id?: string | null;
  plan_name: string;
  plan_period: SubscriptionPeriod;
  plan_total: number;
  plan_paid: number;
  installments_total: number;
  installments_paid: number;
  next_due_date?: string | null;
  created_at?: string;
  updated_at?: string;
}

/** Un plan tal y como lo devuelve la RPC al cliente. */
export interface MemberPlanLine {
  id: string;
  name: string;
  period: SubscriptionPeriod;
  total: number;
  paid: number;
  due: number;
  installments_total: number;
  installments_paid: number;
  next_due_date?: string | null;
  settled: boolean;
}

/** Lo que devuelve `get_member_plan`: la lista + los totales ya sumados. */
export interface MemberPlanStatus {
  found: boolean;
  has_plan?: boolean;
  plans?: MemberPlanLine[];
  plan_count?: number;
  plan_total?: number;
  plan_paid?: number;
  amount_due?: number;
  installments_total?: number;
  installments_paid?: number;
  settled?: boolean;
}

/** Sistemas de clientes que admite `get_member_plan`. */
export type MemberPlanSystem = 'gastro' | 'barber' | 'ecom' | 'realty' | 'sublima' | 'stage';

// --- Inventario (gastro ULTRA) ---
export interface InventoryItem {
  id: string;
  restaurant_id: string;
  name: string;
  unit: string;              // 'unidad' | 'g' | 'kg' | 'ml' | 'l' | ...
  stock_qty: number;
  low_stock_threshold: number;
  cost_per_unit: number;
  supplier_name?: string | null;
  supplier_phone?: string | null;
  supplier_email?: string | null;
  supplier_status?: string;  // 'ninguno' | 'contactado' | 'cotizado' | 'pedido' | 'recibido'
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface InventoryPurchase {
  id: string;
  restaurant_id: string;
  item_id?: string | null;
  item_name?: string | null;
  supplier_name?: string | null;
  supplier_phone?: string | null;
  qty: number;
  unit?: string | null;
  unit_cost: number;
  total_cost: number;
  status: string;            // 'contactado' | 'pedido' | 'recibido' | 'cancelado'
  notes?: string | null;
  created_at?: string;
  received_at?: string | null;
}

// --- Reservas (gastro ULTRA) ---
export interface GastroReservation {
  id: string;
  restaurant_id: string;
  customer_name: string;
  customer_phone?: string | null;
  customer_email?: string | null;
  party_size: number;
  reservation_date: string;  // YYYY-MM-DD
  reservation_time: string;  // HH:MM
  status: string;            // 'pendiente' | 'confirmada' | 'sentada' | 'cancelada' | 'no_show'
  table_number?: string | null;
  notes?: string | null;
  member_code?: string | null;
  confirmation_code?: string | null;
  preorder_items?: any[] | null;
  payment_status?: string; // 'pendiente' | 'pagado'
  points_awarded?: boolean; // punto de carnet ya asignado (medical)
  created_at?: string;
}

// ── Plantilla Realty (inmobiliaria) — motor 100% aislado ────────────────────
// Sub-usuario (Agente) controlado por el Broker Admin (plan ULTRA).
export interface RealtyAgent {
  id: string;
  agency_profile_id: string;
  agent_username: string;
  name?: string | null;
  phone_whatsapp?: string | null;
  nfc_tag_id?: string | null;   // mapeo físico de la tarjeta NFC
  is_active: boolean;
  created_at?: string;
}

// Características técnicas de una propiedad (m², habitaciones, etc.)
export interface RealtyPropertyFeatures {
  area_m2?: number;
  bedrooms?: number;
  bathrooms?: number;
  parking?: number;
  [key: string]: any;
}

// Inventario centralizado de la agencia.
export interface RealtyProperty {
  id: string;
  agency_profile_id: string;
  title: string;
  price?: number | null;
  location?: string | null;
  status: 'pre_venta' | 'disponible' | 'reservado' | 'vendido';
  description?: string | null;
  images: string[];
  features: RealtyPropertyFeatures;
  created_at?: string;
}

// Método de pago declarado en la pre-calificación financiera del lead.
export type RealtyPaymentMethod =
  | 'Contado'
  | 'Crédito Bancario'
  | 'Hipotecario BIESS'
  | 'Fondos Propios';

// Tipo de proceso trackable iniciado por el cliente.
export type RealtyRequestType = 'cotizacion' | 'visita' | 'compra';

// Lead / proceso trackable con atribución activa (qué agente lo capturó).
export interface RealtyLead {
  id: string;
  agency_profile_id: string;
  agent_id?: string | null;
  request_type?: RealtyRequestType | string;   // cotizacion | visita | compra
  tracking_code?: string | null;               // código público de rastreo
  client_name?: string | null;
  client_phone?: string | null;
  client_email?: string | null;
  budget_range?: string | null;
  payment_method?: RealtyPaymentMethod | string | null;
  property_id?: string | null;
  preferred_date?: string | null;              // fecha deseada (visita)
  member_code?: string | null;                 // vínculo al Club
  admin_note?: string | null;                  // mensaje al cliente (visible en el rastreador)
  estimated_days?: number | null;
  source_campaign?: string | null;
  status: string;               // 'recibido' | 'contactado' | 'en_proceso' | 'cerrado' | 'cancelado'
  created_at?: string;
}

// Miembro del Club de Inversionistas (VIP).
export interface RealtyClient {
  id: string;
  agency_profile_id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  is_vip: boolean;
  discount_percent: number;
  notes?: string | null;
  benefits?: string | null;
  source: string;               // 'club' | 'cotizacion' | 'visita' | 'compra' | 'manual'
  visits: number;
  member_code?: string | null;
  created_at?: string;
}

// ── Plantilla Sublima (fábrica-tienda de sublimados/bordados) — motor aislado ─
// Tramo de precio por volumen: desde min_qty unidades, el precio unitario baja.
export interface SublimaPriceTier {
  min_qty: number;
  unit_price: number;
}

// Producto del catálogo textil (camisetas, gorras, uniformes, bordados…).
export interface SublimaProduct {
  id: string;
  factory_profile_id: string;
  name: string;
  category?: string | null;
  description?: string | null;
  images: string[];
  base_price?: number | null;   // precio unitario referencial ("desde")
  min_qty: number;              // pedido mínimo
  price_tiers: SublimaPriceTier[];
  techniques: string[];         // Sublimado / Bordado / Estampado / DTF
  is_available: boolean;
  created_at?: string;
}

// Tipo de solicitud trackable iniciada por el cliente.
export type SublimaRequestType = 'mayorista' | 'muestra';

// Línea de un pedido mayorista (se serializa a jsonb en sublima_orders.items).
export interface SublimaOrderItem {
  product_id: string;
  name: string;
  qty: number;
  unit_price?: number | null;   // según el tier alcanzado al cotizar
}

// Pedido mayorista / muestra con código de rastreo.
export interface SublimaOrder {
  id: string;
  factory_profile_id: string;
  tracking_code?: string | null;
  request_type?: SublimaRequestType | string;
  client_name?: string | null;
  client_phone?: string | null;
  client_email?: string | null;
  client_company?: string | null;          // empresa / institución
  items: SublimaOrderItem[];
  other_items?: string | null;             // artículos fuera del catálogo
  technique?: string | null;
  notes?: string | null;
  needed_date?: string | null;
  estimated_total?: number | null;         // estimado referencial (tiers)
  quoted_total?: number | null;            // cotización oficial de la fábrica
  payment_status?: 'pendiente' | 'anticipo' | 'pagado' | string;
  status: string;                          // recibido | cotizado | en_produccion | listo | entregado | cancelado
  member_code?: string | null;             // vínculo al Club Mayorista
  admin_note?: string | null;              // mensaje visible en el rastreador del cliente
  source_campaign?: string | null;
  created_at?: string;
}

// Miembro del Club Mayorista (VIP).
export interface SublimaClient {
  id: string;
  factory_profile_id: string;
  name?: string | null;
  company?: string | null;
  client_type: 'persona' | 'empresa' | 'institucion' | string;
  email?: string | null;
  phone?: string | null;
  is_vip: boolean;
  discount_percent: number;
  notes?: string | null;
  benefits?: string | null;
  source: string;               // 'club' | 'mayorista' | 'muestra' | 'manual'
  orders_count: number;
  member_code?: string | null;
  created_at?: string;
}

// Ítem del carrito e-commerce
export interface EcomCartItem {
  product: Product;
  quantity: number;
  selectedExtras?: SelectedExtra[];
  extrasUnitPrice?: number; // precio extra por unidad (suma de opciones seleccionadas)
  tierUnitPrice?: number;   // precio unitario del tramo activo (precios por volumen)
}

export type Testimonial = {
  id: string; // ID único
  quote: string; // El testimonio en sí (texto)
  author: string; // Nombre de quien da el testimonio
  authorTitle?: string; // Cargo/Compañía (opcional)
  authorImageURL?: string; // Foto (opcional)
};

export interface Profile {
  // UUID del perfil (= auth.users.id). Viene siempre de Supabase y las
  // plantillas lo usan como seller_id/restaurant_id en los RPC.
  id?: string;
  displayName: string;
  bio: string;
  profilePhotoURL: string;
  coverImageURL: string;
  email?: string; // (El del formulario de 'Cuenta')
  // Color de texto configurable en Apariencia (usado por el perfil por defecto).
  textColor?: string;

  // --- Campos que faltan (¡añadir estos!) ---
  jobTitle?: string;
  company?: string;
  username?: string;
  showSchedule?: boolean;
  logoURL?: string;
  contactEmail?: string;
  phone?: string;
  location?: string;
  locations?: string[];
  whatsapp?: string;
  plan?: string; // <-- AÑADE ESTA LÍNEA (ej. 'free' o 'pro')
  bookingLink?: string; // <-- AÑADE ESTA LÍNEA
  theme?: string;
  showCalendar?: boolean;
  calendarWebhookUrl?: string;
  calendarServices?: string[];
  tableCount?: number;
  paymentLink?: string;
  stampsReward?: string;
  deliveryFee?: number; // Costo de domicilio (ecom); 0 = gratis
  paymentGateways?: PaymentGateway[]; // pasarelas de pago configuradas (ecom)
  // Formulario de citas personalizado de ESTE perfil ecom (columna
  // profiles.ecom_booking_form jsonb). Vacío/ausente = solo los campos base.
  ecom_booking_form?: EcomBookingField[];

  // --- Barbería (motor propio, independiente de ecom/gastro) ---
  barber_products?: BarberRetailProduct[];        // catálogo de productos de venta
  barber_gateways?: BarberPaymentGatewaysConfig;  // pasarelas de pago de la barbería

  clubName?: string;    // Nombre del club de fidelidad (gastro); default "Club Secreto"
  clubTagline?: string; // Eslogan del club de fidelidad (gastro)

  // --- Petcare (clínica veterinaria) ---
  emergencyPhone?: string; // Línea de guardia 24/7 para el botón SOS; fallback a phone
  specialty?: string;      // Especialidad/subtítulo del hero (ej. "Trauma 24/7")
  socialProof?: string;    // Prueba social del hero (ej. "+5,000 pacientes atendidos")
  clinicServices?: string[]; // Servicios agendables (Vacunación, Desparasitación, ...)

  // --- Reservas (gastro ULTRA) ---
  reservationsEnabled?: boolean;
  reservationSettings?: {
    maxPartySize?: number;
    openTime?: string;   // HH:MM
    closeTime?: string;  // HH:MM
    daysAhead?: number;  // cuántos días hacia adelante se puede reservar
    autoConfirm?: boolean;
  };

  // --- Plantilla Stage (artistas/músicos) ---
  releases?: Release[];   // lanzamientos / streaming
  tourDates?: TourDate[]; // fechas de gira / tickets

  sectionOrder?: SectionOrder[];

  // --- Social Media ---
  socialMedia?: {
    instagram?: string;
    facebook?: string;
    tiktok?: string;
    twitter?: string;
    linkedin?: string;
    youtube?: string;
    website?: string;
    github?: string;
  };

  // --- Extended Profile Fields ---
  aboutMe?: string;
  fontFamily?: string;
  galleryTitle?: string;
  galleryMode?: string;
  albums?: any[];
  businessHours?: any[];
  digitalFiles?: any[];
  faqs?: any[];

  // --- Nuevos campos de estilo ---
  backgroundColor?: string;
  buttonColor?: string;
  buttonTextColor?: string;
  buttonStyle?: string; // (ej. 'rounded', 'square')
  borderColor?: string;
  borderWidth?: number;
  shadow?: string; // (ej. 'none', 'soft', 'hard')
  openingHours?: WeekHours;
  products?: Product[]; // <-- AÑADE ESTA LÍNEA
  galleryImageURLs?: string[]; // <-- AÑADE ESTA LÍNEA
  featuredVideoURL?: string; // legacy — usar featuredVideos
  uploadedVideoURL?: string;
  videoOrientation?: 'horizontal' | 'vertical';
  featuredVideos?: Array<{ url: string; thumbnailURL?: string }>;
  testimonials?: Testimonial[]; // <-- AÑADE ESTA LÍNEA
  productsTextColor?: string;
  testimonialsTextColor?: string;
}

export interface DayHours {
  isActive: boolean;
  start: string;
  end: string;
}

export interface WeekHours {
  monday: DayHours;
  tuesday: DayHours;
  wednesday: DayHours;
  thursday: DayHours;
  friday: DayHours;
  saturday: DayHours;
  sunday: DayHours;
}

export interface ContactInfo {
  contactEmail: string;
  phone: string;
  location: string;
  whatsapp: string;
  openingHours: WeekHours;
}

export interface Analytics {
  totalViews: number;
  totalClicks: number;
  ctr: string;
  performanceSummary: { day: string; views: number; clicks: number }[];
  linkPerformance: { id: string; title: string; clickCount: number }[];
}

export interface Account {
  username: string;
  email: string;
  plan: string;
}

export interface AppearanceSettings {
  background: {
    type: 'solid' | 'gradient';
    color: string;
  };
  button: {
    style: 'rounded' | 'sharp' | 'pills';
    backgroundColor: string;
    textColor: string;
    borderColor: string;
    borderWidth: number;
    shadow: 'none' | 'soft' | 'hard';
  };
  typography: {
    fontFamily: string;
    textColor: string;
  };
}
