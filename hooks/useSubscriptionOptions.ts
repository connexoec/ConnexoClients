import { useEffect, useState } from 'react';
import { supabase } from '../src/lib/supabase';
import { subscriptionOptions, type PlanOption } from '../src/lib/memberPlans';
import type { Product } from '../types';

/**
 * Productos marcados como suscripción, para el desplegable de planes de la
 * pestaña de clientes.
 *
 * Las pestañas de clientes sólo reciben `user`, así que el catálogo se carga
 * aquí en vez de bajarlo por props desde el panel a través de seis sitios.
 *
 * De dónde sale según la plantilla:
 *   'products'  → profiles.products              (gastro, petcare, medical, ecom, stage)
 *   'barber'    → profiles.products + barber_products (servicios Y productos)
 *   'sublima'   → tabla sublima_products
 *   'none'      → sin catálogo enlazable (realty: sus inmuebles no son
 *                 suscripciones; el dueño usa «Otro concepto»)
 */
export type OptionSource = 'products' | 'barber' | 'sublima' | 'none';

export function useSubscriptionOptions(userId: string | undefined, source: OptionSource): PlanOption[] {
  const [options, setOptions] = useState<PlanOption[]>([]);

  useEffect(() => {
    if (!userId || source === 'none') { setOptions([]); return; }
    let cancelado = false;

    (async () => {
      try {
        if (source === 'sublima') {
          // Sublima guarda el catálogo en tabla propia: sus columnas se traducen
          // al mismo objeto `subscription` que usan los catálogos en jsonb, para
          // que el resto del sistema no tenga que distinguir de dónde viene.
          const { data, error } = await supabase
            .from('sublima_products')
            .select('id, name, subscription_monthly_price, subscription_annual_price, subscription_monthly_installments, subscription_annual_installments')
            .eq('subscription_enabled', true);
          if (error) throw error;
          if (cancelado) return;
          const comoProductos = (data || []).map((p: any) => ({
            id: String(p.id),
            name: p.name || 'Sin nombre',
            subscription: {
              monthly: p.subscription_monthly_price != null
                ? { price: String(p.subscription_monthly_price), installments: p.subscription_monthly_installments ?? undefined }
                : undefined,
              annual: p.subscription_annual_price != null
                ? { price: String(p.subscription_annual_price), installments: p.subscription_annual_installments ?? undefined }
                : undefined,
            },
          })) as unknown as Product[];
          setOptions(subscriptionOptions(comoProductos));
          return;
        }

        const cols = source === 'barber' ? 'products, barber_products' : 'products';
        const { data, error } = await supabase.from('profiles').select(cols).eq('id', userId).single();
        if (error) throw error;
        if (cancelado) return;

        const base = subscriptionOptions((data as any)?.products as Product[]);
        const retail = source === 'barber'
          ? subscriptionOptions((data as any)?.barber_products as Product[])
          : [];
        setOptions([...base, ...retail]);
      } catch {
        // Silencioso a propósito: sin catálogo el editor sigue sirviendo con
        // «Otro concepto». Un fallo aquí no debe tumbar la pestaña de clientes.
        if (!cancelado) setOptions([]);
      }
    })();

    return () => { cancelado = true; };
  }, [userId, source]);

  return options;
}
