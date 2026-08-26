import type {
  Product, MemberPlan, MemberPlanLine, SubscriptionPeriod, ProductSubscription,
} from '../../types';

/**
 * Suscripciones y planes de pago.
 *
 * Un producto puede ofrecer modalidad mensual, anual o ambas, **con precios
 * independientes**: el anual normalmente sale más barato que 12 mensualidades, y
 * esa diferencia es la que se le enseña al cliente. En la pestaña de clientes, el
 * dueño asigna planes; un mismo cliente puede tener VARIOS y se suman.
 */

export const PERIOD_LABEL: Record<SubscriptionPeriod, string> = {
  mensual: 'Mensual',
  anual: 'Anual',
};

export const DEFAULT_INSTALLMENTS: Record<SubscriptionPeriod, number> = {
  mensual: 12,
  anual: 1,
};

/**
 * Los precios se guardan como texto libre ("$12,50", "12.50 USD", "desde $8").
 * Se extrae el primer número admitiendo coma o punto decimal; sin nada legible
 * devuelve 0 y el dueño escribe el total a mano.
 */
export function parsePrice(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const s = String(raw ?? '');
  const m = s.replace(/\s/g, '').match(/-?\d+(?:[.,]\d+)?/);
  if (!m) return 0;
  const n = parseFloat(m[0].replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

export const money = (n: unknown): string => `$${(Number(n) || 0).toFixed(2)}`;

/**
 * Deja la suscripción lista para guardar: descarta las modalidades sin precio y
 * devuelve `undefined` si no queda ninguna.
 *
 * ⚠️ Devolver `undefined` y no `{}` importa: un objeto vacío guardado en el
 * catálogo haría que el producto pareciera tener suscripción sin tener precios.
 */
export function cleanSubscription(s: ProductSubscription | undefined): ProductSubscription | undefined {
  if (!s) return undefined;
  const out: ProductSubscription = {};
  if ((s.monthly?.price ?? '').toString().trim() !== '') out.monthly = { ...s.monthly };
  if ((s.annual?.price ?? '').toString().trim() !== '') out.annual = { ...s.annual };
  return (out.monthly || out.annual) ? out : undefined;
}

/** ¿Está activada la suscripción en este producto? */
export function isSubscription(p: { subscription?: ProductSubscription } | null | undefined): boolean {
  const s = p?.subscription;
  if (!s) return false;
  return hasTier(s, 'mensual') || hasTier(s, 'anual');
}

export function hasTier(s: ProductSubscription | undefined, period: SubscriptionPeriod): boolean {
  if (!s) return false;
  const t = period === 'mensual' ? s.monthly : s.annual;
  if (t && (t.price ?? '') !== '') return true;
  // Compatibilidad con la v1, que sólo guardaba un periodo suelto.
  return s.period === period;
}

/** Nº de cuotas de una modalidad, con el valor por defecto de su periodo. */
export function tierInstallments(s: ProductSubscription | undefined, period: SubscriptionPeriod): number {
  const t = period === 'mensual' ? s?.monthly : s?.annual;
  return t?.installments ?? s?.installments ?? DEFAULT_INSTALLMENTS[period];
}

/** Precio POR CUOTA de una modalidad. */
export function tierUnitPrice(s: ProductSubscription | undefined, period: SubscriptionPeriod): number {
  const t = period === 'mensual' ? s?.monthly : s?.annual;
  return parsePrice(t?.price);
}

/**
 * Modalidad que se muestra seleccionada de entrada.
 *
 * Vive aquí para que el selector del perfil y el carrito arranquen en la MISMA:
 * si cada uno decidiera por su cuenta, el cliente podría estar viendo el precio
 * anual y añadir el mensual al carrito.
 */
export function defaultPeriod(s: ProductSubscription | undefined): SubscriptionPeriod {
  return hasTier(s, 'mensual') ? 'mensual' : 'anual';
}

/** Precio del CICLO COMPLETO de una modalidad (cuotas × precio por cuota). */
export function tierCycleTotal(s: ProductSubscription | undefined, period: SubscriptionPeriod): number {
  return Number((tierUnitPrice(s, period) * tierInstallments(s, period)).toFixed(2));
}

/**
 * Ahorro del plan anual frente a pagar el mensual durante un año.
 *
 * Compara el ciclo anual contra 12 mensualidades (no contra el ciclo mensual
 * declarado, que podría ser de 6 o 24 cuotas): lo que el cliente quiere saber es
 * cuánto se ahorra en un año.
 * Devuelve null si falta alguna de las dos modalidades o si no hay ahorro.
 */
export function annualSavings(s: ProductSubscription | undefined): { amount: number; percent: number } | null {
  if (!s || !hasTier(s, 'mensual') || !hasTier(s, 'anual')) return null;
  const anioMensual = tierUnitPrice(s, 'mensual') * 12;
  const anual = tierCycleTotal(s, 'anual');
  if (anioMensual <= 0 || anual <= 0) return null;
  const amount = Number((anioMensual - anual).toFixed(2));
  if (amount <= 0) return null;
  return { amount, percent: Math.round((amount / anioMensual) * 100) };
}

// ── Opciones para el desplegable de la pestaña de clientes ───────────────────

export interface PlanOption {
  productId: string;
  name: string;
  period: SubscriptionPeriod;
  unitPrice: number;
  installments: number;
  cycleTotal: number;
}

/**
 * Cada producto con suscripción genera UNA opción por modalidad disponible:
 * un producto con mensual y anual aparece dos veces, y así el dueño elige cuál
 * está pagando ese cliente.
 */
export function subscriptionOptions(products: Product[] | undefined | null): PlanOption[] {
  if (!Array.isArray(products)) return [];
  const out: PlanOption[] = [];
  for (const p of products) {
    if (!isSubscription(p)) continue;
    const id = String(p.id ?? p.name ?? '');
    if (!id) continue;
    // Convención "Categoría | Nombre" del catálogo: se muestra sólo el nombre.
    const name = (p.name || '').includes('|') ? p.name.split('|').pop()!.trim() : (p.name || 'Sin nombre');
    for (const period of ['mensual', 'anual'] as SubscriptionPeriod[]) {
      if (!hasTier(p.subscription, period)) continue;
      out.push({
        productId: id, name, period,
        unitPrice: tierUnitPrice(p.subscription, period),
        installments: tierInstallments(p.subscription, period),
        cycleTotal: tierCycleTotal(p.subscription, period),
      });
    }
  }
  return out;
}

/** Al elegir una opción se rellenan periodo, cuotas y total del plan. */
export function planFromOption(opt: PlanOption): Partial<MemberPlan> {
  return {
    product_id: opt.productId,
    plan_name: opt.name,
    plan_period: opt.period,
    installments_total: opt.installments,
    plan_total: opt.cycleTotal,
  };
}

// ── Cálculos de saldo ────────────────────────────────────────────────────────

/** Saldo de UN plan. Nunca negativo: pagar de más no genera saldo a favor. */
export function amountDue(plan: { plan_total?: number | null; plan_paid?: number | null }): number {
  return Math.max(0, (Number(plan?.plan_total) || 0) - (Number(plan?.plan_paid) || 0));
}

/** Totales sumados de TODOS los planes de un cliente. */
export function sumPlans(plans: Array<Partial<MemberPlan>> | null | undefined) {
  const list = Array.isArray(plans) ? plans : [];
  const total = list.reduce((a, p) => a + (Number(p.plan_total) || 0), 0);
  const paid = list.reduce((a, p) => a + (Number(p.plan_paid) || 0), 0);
  return {
    count: list.length,
    total: Number(total.toFixed(2)),
    paid: Number(paid.toFixed(2)),
    due: Number(Math.max(0, total - paid).toFixed(2)),
    installmentsTotal: list.reduce((a, p) => a + (Number(p.installments_total) || 0), 0),
    installmentsPaid: list.reduce((a, p) => a + (Number(p.installments_paid) || 0), 0),
  };
}

/** Fecha legible; '' si no hay o no se puede interpretar. */
export function formatDue(date: string | null | undefined): string {
  if (!date) return '';
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' });
}

/** Días que faltan (negativo = vencido). null si no hay fecha. */
export function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null;
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - hoy.getTime()) / 86400000);
}

/**
 * Recordatorio de pago. Si el cliente tiene varios planes, se listan todos y se
 * cierra con el total: mandar un recordatorio por plan sería acosarlo.
 */
export function reminderMessage(opts: {
  clientName?: string | null;
  businessName?: string | null;
  plans: Array<Partial<MemberPlan>>;
}): string {
  const { clientName, businessName, plans } = opts;
  const pendientes = (plans || []).filter(p => amountDue(p) > 0);
  const s = sumPlans(plans);

  const detalle = pendientes.map(p => {
    const cuotas = (p.installments_total ?? 0) > 0
      ? ` (cuota ${(p.installments_paid ?? 0) + 1} de ${p.installments_total})`
      : '';
    return `\n• ${p.plan_name ?? 'Plan'}: ${money(amountDue(p))}${cuotas}`;
  }).join('');

  const venc = pendientes
    .map(p => p.next_due_date).filter(Boolean)
    .sort()[0];

  return [
    `Hola ${clientName || ''}`.trim() + ',',
    pendientes.length === 1
      ? ` te recordamos tu pago pendiente:`
      : ` te recordamos tus ${pendientes.length} pagos pendientes:`,
    detalle,
    `\n\nTotal pendiente: ${money(s.due)}.`,
    venc ? ` El próximo vence el ${formatDue(venc as string)}.` : '',
    businessName ? `\n— ${businessName}` : '',
  ].join('');
}

/** Normaliza a wa.me. Ecuador: 0XXXXXXXXX → 593XXXXXXXXX. */
export function waNumber(raw: string | null | undefined): string {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('593')) return d;
  if (d.startsWith('0')) return `593${d.slice(1)}`;
  return d;
}

export function reminderLink(phone: string | null | undefined, message: string): string {
  return `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(message)}`;
}

/** Totales de la lista que devuelve la RPC al cliente. */
export function sumLines(lines: MemberPlanLine[] | undefined | null) {
  const list = Array.isArray(lines) ? lines : [];
  const total = list.reduce((a, l) => a + (Number(l.total) || 0), 0);
  const paid = list.reduce((a, l) => a + (Number(l.paid) || 0), 0);
  return { count: list.length, total, paid, due: Math.max(0, total - paid) };
}
