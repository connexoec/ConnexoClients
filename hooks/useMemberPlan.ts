import { useEffect, useState } from 'react';
import { supabase } from '../src/lib/supabase';
import type { MemberPlanStatus, MemberPlanSystem } from '../types';

/**
 * Plan de pago del cliente que acaba de consultar su código, para mostrarle
 * cuotas, total y saldo junto a su carnet.
 *
 * Va en una RPC APARTE (`get_member_plan`) y no colgado de las RPC de carnet que
 * ya existen: así el carnet de las nueve plantillas sigue funcionando aunque
 * esto falle o aunque todavía no se haya ejecutado `setup_member_plans.sql`.
 * En ese caso simplemente devuelve null y no se dibuja nada.
 */
export function useMemberPlan(
  ownerId: string | undefined | null,
  identifier: string | undefined | null,
  system: MemberPlanSystem,
  enabled = true,
): MemberPlanStatus | null {
  const [plan, setPlan] = useState<MemberPlanStatus | null>(null);

  useEffect(() => {
    if (!enabled || !ownerId || !identifier) { setPlan(null); return; }
    let cancelado = false;

    (async () => {
      try {
        const { data, error } = await supabase.rpc('get_member_plan', {
          p_owner_id: ownerId,
          p_identifier: identifier,
          p_system: system,
        });
        if (cancelado) return;
        // Sin SQL ejecutado el error es "function does not exist": se ignora en
        // silencio, que es justo lo que permite desplegar esto antes que el SQL.
        setPlan(error ? null : (data as MemberPlanStatus));
      } catch {
        if (!cancelado) setPlan(null);
      }
    })();

    return () => { cancelado = true; };
  }, [ownerId, identifier, system, enabled]);

  return plan;
}
