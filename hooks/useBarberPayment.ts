import { supabase } from '../src/lib/supabase';
import type {
  BarberPaymentGatewaysConfig,
  BarberPaymentMethodType,
  BarberCheckoutPayload,
} from '../types';

/**
 * Motor de pagos de la barbería. Independiente de ecom/gastro: lee su propia
 * config (profiles.barber_gateways) y no toca ninguna tabla/RPC de otra plantilla.
 *
 * La barbería no genera órdenes en base de datos: el cobro es presencial o por
 * enlace, así que cada método resuelve con la acción del cliente (abrir la
 * pasarela, mostrar los datos de la cuenta o abrir WhatsApp).
 */

/** Normaliza un número ecuatoriano a formato wa.me (0XXXXXXXXX → 593XXXXXXXXX). */
export const barberWaNumber = (raw?: string): string => {
  const digits = (raw || '').replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (digits.startsWith('593')) return digits;
  if (digits.startsWith('0')) return `593${digits.slice(1)}`;
  return digits;
};

/** Métodos activos de la config, en orden de presentación. */
export const barberEnabledMethods = (
  gateways?: BarberPaymentGatewaysConfig | null
): BarberPaymentMethodType[] => {
  if (!gateways || Array.isArray(gateways)) return [];
  const order: BarberPaymentMethodType[] = ['direct_link', 'payphone', 'bank_transfer', 'whatsapp_manual'];
  return order.filter(m => (gateways as any)[m]?.enabled);
};

export const useBarberPayment = (gateways: BarberPaymentGatewaysConfig | undefined, barberId?: string) => {
  const processPayment = async (
    method: BarberPaymentMethodType,
    payload: BarberCheckoutPayload,
    onSuccess?: (orderId?: string) => void
  ) => {
    const config = gateways && !Array.isArray(gateways) ? (gateways as any)[method] : null;
    if (!config?.enabled) {
      throw new Error(`El método de pago ${method} no está disponible.`);
    }

    switch (method) {
      case 'direct_link': {
        if (!config.url) throw new Error('El enlace de pago no está configurado.');
        const url = new URL(config.url);
        if (payload.amount) url.searchParams.append('amount', payload.amount.toString());
        if (payload.orderId) url.searchParams.append('order_id', payload.orderId);
        window.open(url.toString(), '_blank', 'noopener');
        onSuccess?.();
        break;
      }

      case 'payphone': {
        // Requiere la Edge Function `payphone-process` desplegada en Supabase.
        // El token NO viaja desde aquí: la función lo lee del lado servidor a
        // partir de barberId (ver setup_barber_payphone.sql).
        if (!barberId) throw new Error('No pudimos identificar el negocio.');
        const { data, error } = await supabase.functions.invoke('payphone-process', {
          body: {
            profile_id: barberId,
            amount: payload.amount,
            orderId: payload.orderId,
            reference: payload.items?.map(i => i.name).join(', '),
            customer: payload.customerDetails,
            responseUrl: window.location.href,
            cancellationUrl: window.location.href,
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        if (!data?.payUrl) throw new Error('La pasarela no devolvió un enlace de pago.');
        window.location.href = data.payUrl;
        onSuccess?.(data?.orderId);
        break;
      }

      case 'bank_transfer': {
        // Sin orden en BD: el cliente ve los datos de la cuenta y envía el
        // comprobante por WhatsApp desde la misma pantalla.
        onSuccess?.(payload.orderId);
        break;
      }

      case 'whatsapp_manual': {
        const phone = barberWaNumber(config.phone);
        if (!phone) throw new Error('El número de WhatsApp no está configurado.');
        const lines = [
          '¡Hola! Quisiera confirmar mi pedido:',
          `Monto: $${payload.amount}`,
          payload.orderId ? `Referencia: ${payload.orderId}` : '',
          payload.customerDetails?.name ? `Cliente: ${payload.customerDetails.name}` : '',
          ...(payload.items || []).map(i => `• ${i.quantity}x ${i.name}`),
        ].filter(Boolean);
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(lines.join('\n'))}`, '_blank', 'noopener');
        onSuccess?.(payload.orderId);
        break;
      }

      default:
        throw new Error('Método no soportado');
    }
  };

  return { processPayment, enabledMethods: barberEnabledMethods(gateways) };
};
