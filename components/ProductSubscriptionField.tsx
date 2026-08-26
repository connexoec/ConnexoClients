import React from 'react';
import { FaToggleOn, FaToggleOff, FaSyncAlt, FaTag } from 'react-icons/fa';
import type { ProductSubscription, SubscriptionPeriod } from '../types';
import {
  money, tierUnitPrice, tierInstallments, tierCycleTotal, hasTier, annualSavings,
  DEFAULT_INSTALLMENTS,
} from '../src/lib/memberPlans';

/**
 * Editor de suscripción de un producto: precio MENSUAL y ANUAL por separado.
 *
 * ⚠️ Los dos precios son independientes a propósito. El anual casi siempre sale
 * más barato que 12 mensualidades, y esa diferencia —el ahorro— es justo lo que
 * el cliente ve en el perfil. Un único precio no permitiría expresarlo.
 *
 * Se puede activar sólo mensual, sólo anual o ambas. Con ambas, el perfil dibuja
 * el selector Mensual/Anual.
 *
 * Compartido por los cinco editores de catálogo para que se comporte igual en
 * las nueve plantillas.
 */
export const ProductSubscriptionField: React.FC<{
  value?: ProductSubscription;
  onChange: (v: ProductSubscription | undefined) => void;
  accent?: string;
}> = ({ value, onChange, accent = '#ff6b35' }) => {
  const on = !!value && (hasTier(value, 'mensual') || hasTier(value, 'anual') || !!value.monthly || !!value.annual);
  const ahorro = annualSavings(value);

  const toggleAll = () => {
    if (on) { onChange(undefined); return; }
    onChange({ monthly: { price: '', installments: 12 } });
  };

  const toggleTier = (period: SubscriptionPeriod) => {
    const key = period === 'mensual' ? 'monthly' : 'annual';
    const activo = !!value?.[key];
    const next: ProductSubscription = { ...(value || {}) };
    if (activo) delete next[key];
    else next[key] = { price: '', installments: DEFAULT_INSTALLMENTS[period] };
    // Si se apagan las dos, la suscripción se desactiva entera.
    if (!next.monthly && !next.annual) { onChange(undefined); return; }
    onChange(next);
  };

  const setTier = (period: SubscriptionPeriod, patch: { price?: string; installments?: number }) => {
    const key = period === 'mensual' ? 'monthly' : 'annual';
    onChange({ ...(value || {}), [key]: { ...(value?.[key] || {}), ...patch } });
  };

  const inp = 'w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-white/30';
  const lbl = 'block text-[10px] font-bold uppercase tracking-wider text-white/40 mb-1.5';

  const TierBox: React.FC<{ period: SubscriptionPeriod }> = ({ period }) => {
    const key = period === 'mensual' ? 'monthly' : 'annual';
    const activo = !!value?.[key];
    const unit = tierUnitPrice(value, period);
    const cuotas = tierInstallments(value, period);
    return (
      <div className="rounded-xl border p-3 space-y-2.5"
        style={{ background: activo ? 'rgba(255,255,255,0.03)' : 'transparent', borderColor: activo ? `${accent}40` : 'rgba(255,255,255,0.08)' }}>
        <button type="button" onClick={() => toggleTier(period)} className="flex items-center gap-2 w-full text-left">
          {activo ? <FaToggleOn size={18} style={{ color: accent }} /> : <FaToggleOff size={18} className="text-white/25" />}
          <span className="text-sm font-bold text-white">{period === 'mensual' ? 'Mensual' : 'Anual'}</span>
        </button>

        {activo && (
          <>
            <div>
              <label className={lbl}>Precio por cuota</label>
              <input className={inp} value={value?.[key]?.price ?? ''} placeholder={period === 'mensual' ? '$40' : '$400'}
                onChange={e => setTier(period, { price: e.target.value })} />
            </div>
            <div>
              <label className={lbl}>Nº de cuotas</label>
              <input type="number" min={1} className={inp} value={value?.[key]?.installments ?? ''}
                placeholder={String(DEFAULT_INSTALLMENTS[period])}
                onChange={e => setTier(period, { installments: e.target.value === '' ? undefined : Math.max(1, Number(e.target.value)) })} />
            </div>
            {unit > 0 && (
              <p className="text-[11px] text-white/45">
                Ciclo completo: {cuotas} × {money(unit)} = <strong className="text-white/80">{money(tierCycleTotal(value, period))}</strong>
              </p>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="rounded-xl border p-3.5 space-y-3"
      style={{ background: 'rgba(255,255,255,0.02)', borderColor: on ? `${accent}44` : 'rgba(255,255,255,0.08)' }}>
      <button type="button" onClick={toggleAll} className="flex items-center gap-2.5 w-full text-left">
        {on ? <FaToggleOn size={22} style={{ color: accent }} /> : <FaToggleOff size={22} className="text-white/25" />}
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-bold text-white">
            <FaSyncAlt size={10} style={{ color: on ? accent : undefined }} className={on ? '' : 'text-white/30'} />
            Es una suscripción
          </span>
          <span className="block text-[11px] text-white/40 mt-0.5">
            Cobro recurrente con precio mensual y anual por separado. Opcional: los demás productos siguen siendo de pago único.
          </span>
        </span>
      </button>

      {on && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <TierBox period="mensual" />
            <TierBox period="anual" />
          </div>

          {/* El ahorro es lo que verá el cliente en el selector del perfil. */}
          {ahorro ? (
            <div className="flex items-center gap-2 rounded-lg px-3 py-2.5 border"
              style={{ background: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.25)' }}>
              <FaTag size={11} className="text-emerald-400 shrink-0" />
              <p className="text-[11px] text-emerald-300">
                Con el plan anual tu cliente ahorra <strong>{money(ahorro.amount)}</strong> al año ({ahorro.percent}%).
                Se le mostrará en el perfil.
              </p>
            </div>
          ) : (hasTier(value, 'mensual') && hasTier(value, 'anual')) ? (
            <p className="text-[11px] text-white/35 px-1">
              El plan anual no sale más barato que 12 mensualidades, así que no se mostrará ningún ahorro.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
};
