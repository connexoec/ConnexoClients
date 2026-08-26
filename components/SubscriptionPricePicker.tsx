import React, { useState } from 'react';
import type { ProductSubscription, SubscriptionPeriod } from '../types';
import {
  money, hasTier, tierUnitPrice, tierInstallments, defaultPeriod,
} from '../src/lib/memberPlans';

/**
 * Selector Mensual / Anual del perfil público.
 *
 * Lo que ve el CLIENTE, deliberadamente sobrio: precio, modalidad y cuotas.
 * ⚠️ **No se le muestra el ahorro ni el total del ciclo sumado** (decisión del
 * usuario): enseñar "$480 al año" junto a "$40 al mes" hace que el precio
 * parezca más caro de lo que se percibe. El ahorro sigue calculándose y se le
 * muestra **al dueño** en su editor de producto, que es donde le sirve para
 * fijar precios.
 *
 * Ambas modalidades llevan **la misma línea de descripción**: antes la anual se
 * quedaba sin ninguna porque su condición era `cuotas > 1` y suele tener 1.
 *
 * Puede usarse controlado (`period` + `onPeriodChange`) para que el carrito se
 * lleve el precio de la modalidad elegida, o suelto para sólo mostrar.
 */
export const SubscriptionPricePicker: React.FC<{
  subscription?: ProductSubscription;
  accent?: string;
  period?: SubscriptionPeriod;
  onPeriodChange?: (period: SubscriptionPeriod) => void;
}> = ({ subscription, accent = '#ff6b35', period, onPeriodChange }) => {
  const tieneMensual = hasTier(subscription, 'mensual');
  const tieneAnual = hasTier(subscription, 'anual');
  const ambas = tieneMensual && tieneAnual;

  const [interno, setInterno] = useState<SubscriptionPeriod>(() => defaultPeriod(subscription));
  if (!tieneMensual && !tieneAnual) return null;

  // Controlado si el padre pasa `period`; si no, se gestiona solo.
  const elegido = period ?? interno;
  const activo: SubscriptionPeriod = ambas ? elegido : (tieneMensual ? 'mensual' : 'anual');

  const pick = (p: SubscriptionPeriod) => { setInterno(p); onPeriodChange?.(p); };

  const unit = tierUnitPrice(subscription, activo);
  const cuotas = tierInstallments(subscription, activo);

  // Una sola frase para las dos modalidades, para que ninguna quede muda.
  const descripcion = cuotas > 1
    ? `${cuotas} cuotas de ${money(unit)}`
    : activo === 'mensual' ? 'Se cobra cada mes' : 'Un solo pago al año';

  return (
    <div className="rounded-2xl border p-4 min-w-0"
      style={{ background: 'rgba(0,0,0,0.28)', borderColor: `${accent}33` }}>

      {ambas && (
        <div className="flex p-1 rounded-xl mb-3.5" style={{ background: 'rgba(255,255,255,0.05)' }}>
          {(['mensual', 'anual'] as SubscriptionPeriod[]).map(p => {
            const sel = activo === p;
            return (
              <button key={p} type="button" onClick={() => pick(p)}
                className="flex-1 min-w-0 rounded-lg py-2 px-2 text-[11px] font-black uppercase tracking-wider transition-all"
                style={{
                  background: sel ? accent : 'transparent',
                  color: sel ? '#000' : 'rgba(255,255,255,0.55)',
                }}>
                {p === 'mensual' ? 'Mensual' : 'Anual'}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-end gap-1.5 flex-wrap">
        <span className="text-3xl font-black text-white leading-none">{money(unit)}</span>
        <span className="text-xs text-white/45 mb-0.5">
          /{activo === 'mensual' ? 'mes' : 'año'}
        </span>
      </div>

      <p className="text-[11px] text-white/45 mt-1.5">{descripcion}</p>
    </div>
  );
};
