import React, { useCallback, useEffect, useState } from 'react';
import { FaRegCreditCard, FaChevronDown, FaPlus, FaTrash, FaBell, FaSave, FaTimes } from 'react-icons/fa';
import { supabase } from '../src/lib/supabase';
import type { MemberPlan, MemberPlanSystem, SubscriptionPeriod } from '../types';
import {
  PERIOD_LABEL, amountDue, sumPlans, money, formatDue, daysUntil,
  planFromOption, reminderMessage, reminderLink, type PlanOption,
} from '../src/lib/memberPlans';

/**
 * Planes de pago de un cliente, en la pestaña de Clientes Fieles / VIP.
 *
 * ⚠️ Un cliente puede estar pagando VARIOS productos a la vez, así que esto es
 * una LISTA, no un plan suelto: al añadir uno nuevo se suma a los que ya tenía y
 * el saldo total del cliente sube. Los planes viven en la tabla `member_plans`,
 * una fila por plan (ver setup_member_plans.sql).
 *
 * Compartido por las SEIS pestañas de clientes; lo único que cambia entre
 * plantillas es el `system`.
 */

const OTRO = '__otro__';

export const MemberPlanSection: React.FC<{
  client: { id: string; name?: string | null; phone?: string | null; member_code?: string | null };
  system: MemberPlanSystem;
  ownerId: string;
  options: PlanOption[];
  businessName?: string | null;
  accent?: string;
  showNotification?: (msg: string, type: 'success' | 'error') => void;
}> = ({ client, system, ownerId, options, businessName, accent = '#ff6b35', showNotification }) => {
  const [open, setOpen] = useState(false);
  const [plans, setPlans] = useState<MemberPlan[]>([]);
  const [cargando, setCargando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [faltaSQL, setFaltaSQL] = useState(false);

  const fetchPlans = useCallback(async () => {
    if (!ownerId || !client.id) return;
    setCargando(true);
    try {
      const { data, error } = await supabase
        .from('member_plans').select('*')
        .eq('owner_id', ownerId).eq('system', system).eq('client_id', client.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setPlans((data as MemberPlan[]) || []);
      setFaltaSQL(false);
    } catch (e: any) {
      // Sin SQL ejecutado la tabla no existe: se avisa de cuál falta en vez de
      // soltar el mensaje críptico de Supabase.
      if (/member_plans|does not exist|42P01|PGRST205/i.test(String(e?.message || ''))) setFaltaSQL(true);
      setPlans([]);
    } finally {
      setCargando(false);
    }
  }, [ownerId, client.id, system]);

  // Se cargan al desplegar, no antes: la lista de clientes puede ser larga y no
  // vale la pena una consulta por cada uno para algo que casi nunca se abre.
  useEffect(() => { if (open) fetchPlans(); }, [open, fetchPlans]);

  const total = sumPlans(plans);

  const addPlan = async (draft: Partial<MemberPlan>) => {
    try {
      const { data, error } = await supabase.from('member_plans').insert({
        owner_id: ownerId, system, client_id: client.id,
        member_code: client.member_code ?? null,
        product_id: draft.product_id ?? null,
        plan_name: draft.plan_name || 'Plan',
        plan_period: draft.plan_period || 'mensual',
        plan_total: draft.plan_total ?? 0,
        plan_paid: draft.plan_paid ?? 0,
        installments_total: draft.installments_total ?? 0,
        installments_paid: draft.installments_paid ?? 0,
        next_due_date: draft.next_due_date ?? null,
      }).select().single();
      if (error) throw error;
      setPlans(p => [...p, data as MemberPlan]);
      setCreando(false);
      showNotification?.('Plan añadido', 'success');
    } catch (e: any) {
      showNotification?.(`No se pudo añadir: ${e?.message || 'error'}`, 'error');
    }
  };

  const updatePlan = async (id: string, patch: Partial<MemberPlan>) => {
    try {
      const { error } = await supabase.from('member_plans')
        .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      setPlans(p => p.map(x => x.id === id ? { ...x, ...patch } : x));
      showNotification?.('Plan actualizado', 'success');
    } catch (e: any) {
      showNotification?.(`No se pudo guardar: ${e?.message || 'error'}`, 'error');
    }
  };

  const removePlan = async (id: string, nombre: string) => {
    if (!window.confirm(`¿Quitar el plan «${nombre}» de este cliente?`)) return;
    try {
      const { error } = await supabase.from('member_plans').delete().eq('id', id);
      if (error) throw error;
      setPlans(p => p.filter(x => x.id !== id));
    } catch (e: any) {
      showNotification?.(`No se pudo quitar: ${e?.message || 'error'}`, 'error');
    }
  };

  return (
    <div className="mt-3 min-w-0">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="flex items-center gap-2 w-full text-left text-[11px] font-bold uppercase tracking-wider text-white/45 hover:text-white/70 transition">
        <FaRegCreditCard size={11} style={{ color: plans.length ? accent : undefined }} />
        <span>Planes de pago</span>
        {plans.length > 0 && (
          <span className={`text-[10px] font-black rounded px-1.5 py-0.5 border normal-case tracking-normal ${
            total.due > 0 ? 'text-amber-300 bg-amber-500/10 border-amber-500/25'
                          : 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25'}`}>
            {plans.length} · {total.due > 0 ? `debe ${money(total.due)}` : 'al día'}
          </span>
        )}
        <FaChevronDown size={9} className={`ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-2.5 rounded-2xl border border-white/10 bg-black/30 p-3.5 space-y-3 min-w-0">
          {faltaSQL && (
            <p className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2">
              Falta ejecutar <strong>setup_member_plans.sql</strong> en Supabase.
            </p>
          )}

          {cargando && <p className="text-[11px] text-white/35">Cargando planes…</p>}

          {!cargando && plans.length === 0 && !faltaSQL && (
            <p className="text-[11px] text-white/35">Este cliente todavía no tiene ningún plan.</p>
          )}

          {plans.map(p => (
            <PlanRow key={p.id} plan={p} accent={accent}
              onSave={patch => updatePlan(p.id!, patch)}
              onRemove={() => removePlan(p.id!, p.plan_name)} />
          ))}

          {/* Totales del cliente: la suma de TODOS sus planes */}
          {plans.length > 1 && (
            <div className="rounded-xl px-3.5 py-3 border flex items-center justify-between gap-3"
              style={{ background: `${accent}0f`, borderColor: `${accent}33` }}>
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">
                Total del cliente · {plans.length} planes
              </span>
              <span className="text-right shrink-0">
                <span className="block text-lg font-black text-white leading-none">{money(total.due)}</span>
                <span className="block text-[10px] text-white/40 mt-0.5">de {money(total.total)}</span>
              </span>
            </div>
          )}

          {creando ? (
            <NewPlanForm options={options} accent={accent}
              onCancel={() => setCreando(false)} onCreate={addPlan} />
          ) : !faltaSQL && (
            <button type="button" onClick={() => setCreando(true)}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-dashed text-xs font-bold uppercase tracking-wider transition"
              style={{ borderColor: `${accent}44`, color: accent }}>
              <FaPlus size={10} /> Añadir plan
            </button>
          )}

          {plans.some(p => amountDue(p) > 0) && client.phone && (
            <a href={reminderLink(client.phone, reminderMessage({ clientName: client.name, businessName, plans }))}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-[#25D366] bg-[#25D366]/10 border border-[#25D366]/25">
              <FaBell size={11} /> Recordatorio de todo lo pendiente
            </a>
          )}
        </div>
      )}
    </div>
  );
};

// ── Fila editable de un plan ────────────────────────────────────────────────

const inp = 'w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none focus:border-white/30';
const lbl = 'block text-[9px] font-bold uppercase tracking-wider text-white/35 mb-1';

const PlanRow: React.FC<{
  plan: MemberPlan; accent: string;
  onSave: (patch: Partial<MemberPlan>) => void;
  onRemove: () => void;
}> = ({ plan, accent, onSave, onRemove }) => {
  const [edit, setEdit] = useState(false);
  const [d, setD] = useState<MemberPlan>(plan);
  useEffect(() => { setD(plan); }, [plan]);

  const debe = amountDue(d);
  const dias = daysUntil(d.next_due_date);
  const vencido = dias !== null && dias < 0 && debe > 0;

  return (
    <div className="rounded-xl border p-3 min-w-0"
      style={{ background: 'rgba(255,255,255,0.02)', borderColor: vencido ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.08)' }}>
      <div className="flex items-start justify-between gap-2 min-w-0">
        <button type="button" onClick={() => setEdit(e => !e)} className="min-w-0 flex-1 text-left">
          <p className="text-sm font-bold text-white break-words">{d.plan_name}</p>
          <p className="text-[11px] text-white/40 mt-0.5">
            {PERIOD_LABEL[d.plan_period]}
            {d.installments_total > 0 && ` · cuota ${d.installments_paid} de ${d.installments_total}`}
          </p>
        </button>
        <div className="text-right shrink-0">
          <p className={`text-sm font-black ${debe > 0 ? (vencido ? 'text-red-400' : 'text-white') : 'text-emerald-400'}`}>
            {debe > 0 ? money(debe) : 'Al día'}
          </p>
          <p className="text-[10px] text-white/35">de {money(d.plan_total)}</p>
        </div>
        <button type="button" onClick={onRemove} className="text-white/25 hover:text-red-400 shrink-0 mt-0.5" title="Quitar plan">
          <FaTrash size={11} />
        </button>
      </div>

      {d.next_due_date && debe > 0 && (
        <p className={`text-[10px] mt-1.5 ${vencido ? 'text-red-300' : 'text-white/35'}`}>
          {vencido ? `Vencido · ${formatDue(d.next_due_date)}` : `Vence el ${formatDue(d.next_due_date)}`}
        </p>
      )}

      {edit && (
        <div className="mt-3 space-y-2.5 border-t border-white/8 pt-3">
          <div className="grid grid-cols-2 gap-2">
            <div><label className={lbl}>Cuotas pagadas</label>
              <input type="number" min={0} className={inp} value={d.installments_paid}
                onChange={e => setD({ ...d, installments_paid: Math.max(0, Number(e.target.value) || 0) })} /></div>
            <div><label className={lbl}>Cuotas totales</label>
              <input type="number" min={0} className={inp} value={d.installments_total}
                onChange={e => setD({ ...d, installments_total: Math.max(0, Number(e.target.value) || 0) })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={lbl}>Total</label>
              <input type="number" min={0} step="0.01" className={inp} value={d.plan_total}
                onChange={e => setD({ ...d, plan_total: Number(e.target.value) || 0 })} /></div>
            <div><label className={lbl}>Pagado</label>
              <input type="number" min={0} step="0.01" className={inp} value={d.plan_paid}
                onChange={e => setD({ ...d, plan_paid: Number(e.target.value) || 0 })} /></div>
          </div>
          <div><label className={lbl}>Próximo vencimiento</label>
            <input type="date" className={inp} value={d.next_due_date ?? ''}
              onChange={e => setD({ ...d, next_due_date: e.target.value || null })} /></div>
          <div className="flex gap-2">
            <button type="button" onClick={() => { onSave(d); setEdit(false); }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[11px] font-black uppercase tracking-wider text-black"
              style={{ background: accent }}>
              <FaSave size={10} /> Guardar
            </button>
            <button type="button" onClick={() => { setD(plan); setEdit(false); }}
              className="px-3 py-2 rounded-lg text-[11px] font-bold text-white/50 border border-white/10">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Alta de un plan nuevo ───────────────────────────────────────────────────

const NewPlanForm: React.FC<{
  options: PlanOption[]; accent: string;
  onCancel: () => void; onCreate: (d: Partial<MemberPlan>) => void;
}> = ({ options, accent, onCancel, onCreate }) => {
  const [sel, setSel] = useState('');
  const [d, setD] = useState<Partial<MemberPlan>>({ plan_period: 'mensual', plan_paid: 0, installments_paid: 0 });

  const pick = (key: string) => {
    setSel(key);
    if (key === OTRO || key === '') { setD(p => ({ ...p, product_id: null })); return; }
    const [productId, period] = key.split('::');
    const opt = options.find(o => o.productId === productId && o.period === period);
    if (opt) setD(p => ({ ...p, ...planFromOption(opt) }));
  };

  return (
    <div className="rounded-xl border p-3 space-y-2.5" style={{ borderColor: `${accent}44`, background: 'rgba(255,255,255,0.02)' }}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-wider text-white/50">Nuevo plan</p>
        <button type="button" onClick={onCancel} className="text-white/30 hover:text-white/70"><FaTimes size={12} /></button>
      </div>

      <div>
        <label className={lbl}>Producto</label>
        <select className={inp} value={sel} onChange={e => pick(e.target.value)}>
          <option value="">— Elige —</option>
          {options.map(o => (
            <option key={`${o.productId}::${o.period}`} value={`${o.productId}::${o.period}`}>
              {o.name} · {PERIOD_LABEL[o.period]} · {money(o.cycleTotal)}
            </option>
          ))}
          <option value={OTRO}>Otro concepto…</option>
        </select>
        {options.length === 0 && (
          <p className="text-[10px] text-white/35 mt-1.5">
            No hay productos marcados como suscripción. Usa «Otro concepto».
          </p>
        )}
      </div>

      {sel === OTRO && (
        <div><label className={lbl}>Concepto</label>
          <input className={inp} value={d.plan_name ?? ''} placeholder="Ej. Membresía anual"
            onChange={e => setD({ ...d, plan_name: e.target.value })} /></div>
      )}

      {sel !== '' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={lbl}>Periodo</label>
              <select className={inp} value={d.plan_period ?? 'mensual'}
                onChange={e => setD({ ...d, plan_period: e.target.value as SubscriptionPeriod })}>
                <option value="mensual">Mensual</option>
                <option value="anual">Anual</option>
              </select></div>
            <div><label className={lbl}>Cuotas totales</label>
              <input type="number" min={0} className={inp} value={d.installments_total ?? ''}
                onChange={e => setD({ ...d, installments_total: Math.max(0, Number(e.target.value) || 0) })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={lbl}>Total</label>
              <input type="number" min={0} step="0.01" className={inp} value={d.plan_total ?? ''}
                onChange={e => setD({ ...d, plan_total: Number(e.target.value) || 0 })} /></div>
            <div><label className={lbl}>Próximo vencimiento</label>
              <input type="date" className={inp} value={d.next_due_date ?? ''}
                onChange={e => setD({ ...d, next_due_date: e.target.value || null })} /></div>
          </div>
          <button type="button" onClick={() => onCreate(d)} disabled={!d.plan_name}
            className="w-full py-2.5 rounded-lg text-[11px] font-black uppercase tracking-wider text-black disabled:opacity-40"
            style={{ background: accent }}>
            Añadir a este cliente
          </button>
        </>
      )}
    </div>
  );
};
