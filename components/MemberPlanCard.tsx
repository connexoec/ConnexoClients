import React from 'react';
import type { MemberPlanStatus, MemberPlanSystem, MemberPlanLine } from '../types';
import { PERIOD_LABEL, money, formatDue, daysUntil } from '../src/lib/memberPlans';
import { useMemberPlan } from '../hooks/useMemberPlan';

/**
 * Lo que ve el CLIENTE al consultar su código: TODOS sus planes y el total.
 *
 * ⚠️ Un cliente puede estar pagando varios productos a la vez, así que se listan
 * uno a uno con su propio saldo y arriba va el total sumado — que es la cifra
 * que de verdad le interesa: cuánto debe en total.
 *
 * Devuelve null salvo que la RPC confirme que hay planes. Eso permite desplegar
 * sin haber ejecutado el SQL y evita dibujarle una tarjeta de deuda a quien no
 * tiene ninguno.
 */
export const MemberPlanCard: React.FC<{
  plan: MemberPlanStatus | null | undefined;
  accent?: string;
}> = ({ plan, accent = '#ff6b35' }) => {
  if (!plan?.found || !plan.has_plan) return null;

  const lines: MemberPlanLine[] = Array.isArray(plan.plans) ? plan.plans : [];
  if (lines.length === 0) return null;

  const due = Number(plan.amount_due) || 0;
  const total = Number(plan.plan_total) || 0;
  const paid = Number(plan.plan_paid) || 0;
  const alDia = plan.settled || due <= 0;
  const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;

  return (
    <div className="rounded-2xl border p-4 space-y-3.5 min-w-0"
      style={{ background: 'rgba(0,0,0,0.32)', borderColor: alDia ? 'rgba(16,185,129,0.3)' : `${accent}33` }}>

      {/* Resumen: lo primero que quiere saber es cuánto debe en total */}
      <div className="flex items-start justify-between gap-3 min-w-0">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: accent }}>
            {lines.length === 1 ? 'Tu plan' : `Tus ${lines.length} planes`}
          </p>
          <p className={`text-2xl font-black leading-tight mt-0.5 ${alDia ? 'text-emerald-400' : 'text-white'}`}>
            {alDia ? 'Al día' : money(due)}
          </p>
          {!alDia && <p className="text-[11px] text-white/40">pendiente de {money(total)}</p>}
        </div>
        <span className={`text-[9px] font-black uppercase tracking-widest rounded-full px-2.5 py-1 border shrink-0 ${
          alDia ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'
                : 'text-white/70 bg-white/5 border-white/15'}`}>
          {alDia ? 'Sin deuda' : 'Activo'}
        </span>
      </div>

      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: alDia ? '#10b981' : accent }} />
      </div>

      {/* Detalle plan por plan */}
      <div className="space-y-2">
        {lines.map(l => {
          const dias = daysUntil(l.next_due_date);
          const vencido = dias !== null && dias < 0 && l.due > 0;
          return (
            <div key={l.id} className="rounded-xl px-3 py-2.5 min-w-0"
              style={{ background: 'rgba(255,255,255,0.04)' }}>
              <div className="flex items-start justify-between gap-2.5 min-w-0">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white break-words">{l.name}</p>
                  <p className="text-[10px] text-white/40 mt-0.5">
                    {PERIOD_LABEL[l.period]}
                    {l.installments_total > 0 && ` · cuota ${l.installments_paid} de ${l.installments_total}`}
                  </p>
                </div>
                <p className={`text-sm font-black shrink-0 ${
                  l.due > 0 ? (vencido ? 'text-red-400' : 'text-white') : 'text-emerald-400'}`}>
                  {l.due > 0 ? money(l.due) : 'Pagado'}
                </p>
              </div>
              {l.next_due_date && l.due > 0 && (
                <p className={`text-[10px] mt-1 ${vencido ? 'text-red-300' : 'text-white/35'}`}>
                  {vencido ? `Venció el ${formatDue(l.next_due_date)}` : `Vence el ${formatDue(l.next_due_date)}`}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { l: 'Total',  v: money(total), c: 'text-white/85' },
          { l: 'Pagado', v: money(paid),  c: 'text-emerald-400' },
          { l: 'Debes',  v: money(due),   c: due > 0 ? 'text-white' : 'text-emerald-400' },
        ].map(x => (
          <div key={x.l} className="rounded-xl px-2.5 py-2 min-w-0" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <p className="text-[9px] font-bold uppercase tracking-wider text-white/35">{x.l}</p>
            <p className={`text-sm font-black break-words ${x.c}`}>{x.v}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Versión autocontenida: consulta los planes ella misma.
 *
 * Así enchufarla en las plantillas es **una sola línea** de JSX y no hubo que
 * añadir un hook al cuerpo de siete componentes distintos — meter hooks a mano
 * en siete sitios es como se rompe el orden de hooks entre renders (familia del
 * fallo de la pantalla negra de v0.43.2).
 */
export const MemberPlanBadge: React.FC<{
  ownerId: string | null | undefined;
  identifier: string | null | undefined;
  system: MemberPlanSystem;
  accent?: string;
  enabled?: boolean;
}> = ({ ownerId, identifier, system, accent, enabled = true }) => {
  const plan = useMemberPlan(ownerId, identifier, system, enabled);
  return <MemberPlanCard plan={plan} accent={accent} />;
};
