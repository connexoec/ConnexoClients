import React, { useState } from 'react';
import { supabase } from '../../src/lib/supabase';
import type { GymPlan, GymBillingPeriod } from '../../types';
import { FaPlus, FaPen, FaTrash, FaStar, FaToggleOn, FaToggleOff, FaDumbbell } from 'react-icons/fa';
import { useOwnerTable, AdminModal, Field, adminInput, Spinner, MissingSqlNotice, money, isMissingSql } from '../AdminKit';

interface Props {
  user: any;
  showNotification: (message: string, type: 'success' | 'error') => void;
}

const ACCENT = '#c6f432';
const ON_ACCENT = '#0a0c09';
const TITLE_FONT = "'Tomorrow', sans-serif";

const PERIODS: { val: GymBillingPeriod; label: string; days: number }[] = [
  { val: 'dia', label: 'Pase diario', days: 1 },
  { val: 'semana', label: 'Semanal', days: 7 },
  { val: 'mes', label: 'Mensual', days: 30 },
  { val: 'trimestre', label: 'Trimestral', days: 90 },
  { val: 'semestre', label: 'Semestral', days: 180 },
  { val: 'anio', label: 'Anual', days: 365 },
];

interface Form {
  name: string; description: string; price: string; compare_price: string; billing_period: GymBillingPeriod;
  duration_days: string; enrollment_fee: string; sessions_limit: string; features: string;
  is_popular: boolean; is_available: boolean; sort_order: string;
}
const emptyForm = (): Form => ({
  name: '', description: '', price: '', compare_price: '', billing_period: 'mes', duration_days: '30',
  enrollment_fee: '', sessions_limit: '', features: '', is_popular: false, is_available: true, sort_order: '0',
});

export const GymPlansTab: React.FC<Props> = ({ user, showNotification }) => {
  const { rows: plans, loading, reload, missingSql } = useOwnerTable<GymPlan>({
    table: 'gym_plans', ownerColumn: 'gym_profile_id', ownerId: user?.id, realtime: false,
    order: [{ column: 'sort_order' }, { column: 'price' }],
  });
  const [editing, setEditing] = useState<GymPlan | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(emptyForm());
  const [saving, setSaving] = useState(false);

  const openNew = () => { setEditing(null); setForm({ ...emptyForm(), sort_order: String(plans.length) }); setOpen(true); };
  const openEdit = (p: GymPlan) => {
    setEditing(p);
    setForm({
      name: p.name, description: p.description || '', price: String(p.price ?? ''), compare_price: p.compare_price != null ? String(p.compare_price) : '',
      billing_period: p.billing_period, duration_days: String(p.duration_days), enrollment_fee: p.enrollment_fee ? String(p.enrollment_fee) : '',
      sessions_limit: p.sessions_limit != null ? String(p.sessions_limit) : '', features: (p.features || []).join('\n'),
      is_popular: p.is_popular, is_available: p.is_available, sort_order: String(p.sort_order ?? 0),
    });
    setOpen(true);
  };
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm(f => ({ ...f, [k]: v }));
  const changePeriod = (val: GymBillingPeriod) => setForm(f => ({ ...f, billing_period: val, duration_days: String(PERIODS.find(p => p.val === val)!.days) }));

  const save = async () => {
    if (!form.name.trim()) return showNotification('El nombre del plan es obligatorio.', 'error');
    const price = Number(form.price); const days = Math.round(Number(form.duration_days));
    if (!isFinite(price) || price < 0) return showNotification('Escribe un precio válido.', 'error');
    if (!days || days < 1) return showNotification('La duración debe ser de al menos 1 día.', 'error');
    const payload = {
      gym_profile_id: user.id, name: form.name.trim(), description: form.description.trim() || null, price,
      compare_price: form.compare_price !== '' ? Number(form.compare_price) : null, billing_period: form.billing_period,
      duration_days: days, enrollment_fee: Number(form.enrollment_fee) || 0,
      sessions_limit: form.sessions_limit !== '' ? Math.max(1, Math.round(Number(form.sessions_limit))) : null,
      features: form.features.split('\n').map(s => s.trim()).filter(Boolean),
      is_popular: form.is_popular, is_available: form.is_available, sort_order: Math.round(Number(form.sort_order)) || 0,
    };
    setSaving(true);
    const { error } = editing
      ? await supabase.from('gym_plans').update(payload).eq('id', editing.id)
      : await supabase.from('gym_plans').insert(payload);
    setSaving(false);
    if (error) return showNotification(isMissingSql(error) ? 'Falta ejecutar setup_gym.sql en Supabase.' : `No se pudo guardar: ${error.message}`, 'error');
    showNotification(editing ? 'Plan actualizado.' : 'Plan creado.', 'success');
    setOpen(false); reload();
  };

  const patch = async (p: GymPlan, values: Partial<GymPlan>) => {
    const { error } = await supabase.from('gym_plans').update(values).eq('id', p.id);
    if (error) return showNotification(`Error: ${error.message}`, 'error');
    reload();
  };
  const remove = async (p: GymPlan) => {
    if (!window.confirm(`¿Eliminar el plan "${p.name}"? Los socios que ya lo tienen conservan su nombre de plan.`)) return;
    const { error } = await supabase.from('gym_plans').delete().eq('id', p.id);
    if (error) return showNotification(`Error: ${error.message}`, 'error');
    reload();
  };

  if (loading) return <Spinner accent={ACCENT} />;

  return (
    <div className="animate-fade-in-up space-y-6 max-w-4xl mx-auto px-4 md:px-6 pb-32" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5" style={{ borderColor: `${ACCENT}26` }}>
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2" style={{ fontFamily: TITLE_FONT }}><FaDumbbell style={{ color: ACCENT }} /> Planes de membresía</h2>
          <p className="text-sm text-white/40 mt-1">Lo que ve el visitante al elegir su plan. La duración define cuándo vence el carnet del socio.</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl" style={{ background: ACCENT, color: ON_ACCENT, fontFamily: TITLE_FONT }}>
          <FaPlus /> Nuevo plan
        </button>
      </div>

      {missingSql && <MissingSqlNotice file="setup_gym.sql" accent={ACCENT} />}

      {!missingSql && plans.length === 0 ? (
        <div className="text-center py-16 text-white/30"><p className="text-4xl mb-3">🏋️</p><p className="text-sm">Aún no tienes planes. Crea el primero (por ejemplo, «Mensual» o «Pase libre»).</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {plans.map(p => (
            <div key={p.id} className="rounded-2xl border p-4 transition" style={{ background: p.is_popular ? `${ACCENT}0f` : 'rgba(255,255,255,0.03)', borderColor: p.is_popular ? `${ACCENT}55` : 'rgba(255,255,255,0.08)', opacity: p.is_available ? 1 : 0.55 }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-white font-bold truncate">{p.name}</h3>
                    {p.is_popular && <span className="text-[9px] font-black uppercase tracking-widest rounded-full px-2 py-0.5" style={{ background: `${ACCENT}26`, color: ACCENT }}>Popular</span>}
                    {!p.is_available && <span className="text-[9px] font-black uppercase tracking-widest rounded-full px-2 py-0.5 bg-white/10 text-white/50">Oculto</span>}
                  </div>
                  <p className="text-2xl font-black text-white mt-1" style={{ fontFamily: TITLE_FONT }}>
                    {money(p.price)} <span className="text-xs font-normal text-white/40">/ {PERIODS.find(x => x.val === p.billing_period)?.label.toLowerCase()} · {p.duration_days} días</span>
                  </p>
                  {p.compare_price ? <p className="text-xs text-white/35 line-through">{money(p.compare_price)}</p> : null}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button title={p.is_popular ? 'Quitar de popular' : 'Marcar como popular'} onClick={() => patch(p, { is_popular: !p.is_popular })} className="w-8 h-8 rounded-lg border flex items-center justify-center transition"
                    style={p.is_popular ? { background: `${ACCENT}33`, borderColor: `${ACCENT}66`, color: ACCENT } : { background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}><FaStar size={12} /></button>
                  <button title={p.is_available ? 'Ocultar del perfil' : 'Mostrar en el perfil'} onClick={() => patch(p, { is_available: !p.is_available })} className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 text-white/60 flex items-center justify-center hover:text-white transition">
                    {p.is_available ? <FaToggleOn size={15} style={{ color: ACCENT }} /> : <FaToggleOff size={15} />}</button>
                  <button title="Editar" onClick={() => openEdit(p)} className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 text-white/60 flex items-center justify-center hover:text-white transition"><FaPen size={11} /></button>
                  <button title="Eliminar" onClick={() => remove(p)} className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center hover:bg-red-500/20 transition"><FaTrash size={11} /></button>
                </div>
              </div>
              {(p.features?.length > 0 || p.sessions_limit) && (
                <ul className="mt-3 space-y-1 text-[12px] text-white/55">
                  {p.sessions_limit ? <li>· {p.sessions_limit} clases por ciclo</li> : null}
                  {p.features.slice(0, 4).map((f, i) => <li key={i} className="truncate">· {f}</li>)}
                  {p.features.length > 4 && <li className="text-white/30">+ {p.features.length - 4} más…</li>}
                </ul>
              )}
              {p.enrollment_fee > 0 && <p className="text-[11px] text-white/35 mt-2">Matrícula: {money(p.enrollment_fee)}</p>}
            </div>
          ))}
        </div>
      )}

      {open && (
        <AdminModal title={editing ? 'Editar plan' : 'Nuevo plan'} accent={ACCENT} onClose={() => setOpen(false)}>
          <div className="space-y-3">
            <Field label="Nombre *"><input className={adminInput} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ej. Mensual Full" /></Field>
            <Field label="Descripción corta"><input className={adminInput} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Ej. Acceso a sala y todas las clases" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Precio *"><input className={adminInput} type="number" min={0} step="0.01" value={form.price} onChange={e => set('price', e.target.value)} placeholder="30" /></Field>
              <Field label="Precio tachado" hint="Opcional: muestra el ahorro"><input className={adminInput} type="number" min={0} step="0.01" value={form.compare_price} onChange={e => set('compare_price', e.target.value)} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Periodo"><select className={adminInput} value={form.billing_period} onChange={e => changePeriod(e.target.value as GymBillingPeriod)}>{PERIODS.map(p => <option key={p.val} value={p.val}>{p.label}</option>)}</select></Field>
              <Field label="Duración (días)" hint="Define el vencimiento del carnet"><input className={adminInput} type="number" min={1} value={form.duration_days} onChange={e => set('duration_days', e.target.value)} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Matrícula"><input className={adminInput} type="number" min={0} step="0.01" value={form.enrollment_fee} onChange={e => set('enrollment_fee', e.target.value)} placeholder="0" /></Field>
              <Field label="Clases por ciclo" hint="Vacío = ilimitadas"><input className={adminInput} type="number" min={1} value={form.sessions_limit} onChange={e => set('sessions_limit', e.target.value)} /></Field>
            </div>
            <Field label="Qué incluye" hint="Una línea por beneficio"><textarea className={adminInput} rows={4} value={form.features} onChange={e => set('features', e.target.value)} placeholder={'Acceso a sala de máquinas\nClases grupales ilimitadas\nEvaluación física inicial'} /></Field>
            <div className="grid grid-cols-3 gap-3 items-end">
              <Field label="Orden"><input className={adminInput} type="number" value={form.sort_order} onChange={e => set('sort_order', e.target.value)} /></Field>
              <label className="flex items-center gap-2 text-sm text-white/70 pb-2.5"><input type="checkbox" checked={form.is_popular} onChange={e => set('is_popular', e.target.checked)} /> Popular</label>
              <label className="flex items-center gap-2 text-sm text-white/70 pb-2.5"><input type="checkbox" checked={form.is_available} onChange={e => set('is_available', e.target.checked)} /> Visible</label>
            </div>
            <button onClick={save} disabled={saving} className="w-full py-3 rounded-xl text-sm font-black uppercase tracking-wider disabled:opacity-50" style={{ background: ACCENT, color: ON_ACCENT, fontFamily: TITLE_FONT }}>{saving ? 'Guardando…' : 'Guardar plan'}</button>
          </div>
        </AdminModal>
      )}
    </div>
  );
};

export default GymPlansTab;
