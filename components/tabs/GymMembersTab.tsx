import React, { useCallback, useMemo, useState } from 'react';
import { supabase } from '../../src/lib/supabase';
import type { GymMember, GymPlan, GymMemberState } from '../../types';
import {
  FaUserPlus, FaTrash, FaWhatsapp, FaCrown, FaUsers, FaSnowflake, FaSyncAlt, FaPercent, FaSave, FaQrcode,
  FaSearch, FaChartBar, FaExclamationTriangle,
} from 'react-icons/fa';
import {
  useOwnerTable, AdminModal, Field, adminInput, Spinner, MissingSqlNotice, Kpi, Pill, ping, waLink, todayLocal, addDaysLocal,
  diffDays, fmtDate, isMissingSql,
} from '../AdminKit';

interface Props {
  user: any;
  showNotification: (message: string, type: 'success' | 'error') => void;
  plan: 'conecta' | 'pro' | 'ultra';
}

const ACCENT = '#c6f432';
const ON_ACCENT = '#0a0c09';
const TITLE_FONT = "'Tomorrow', sans-serif";

const STATE: Record<GymMemberState, { label: string; color: string }> = {
  activo: { label: 'Activo', color: '#34d399' }, por_vencer: { label: 'Por vencer', color: '#fbbf24' },
  vencido: { label: 'Vencido', color: '#f87171' }, congelado: { label: 'Congelado', color: '#60a5fa' },
  baja: { label: 'Baja', color: '#9ca3af' }, sin_plan: { label: 'Sin plan', color: '#9ca3af' },
};
const RPC_ERRORS: Record<string, string> = {
  member_not_found: 'No encontramos ese carnet.', plan_required: 'Elige un plan.', plan_not_found: 'Ese plan ya no existe.',
  frozen: 'El socio está congelado: descongélalo antes de renovar.', not_active: 'Solo se puede congelar a un socio con membresía vigente.',
  not_frozen: 'El socio no está congelado.', name_required: 'Escribe el nombre.',
  baja: 'El socio está dado de baja.', congelado: 'Membresía congelada.', vencido: 'Membresía vencida.', sin_plan: 'El socio no tiene un plan asignado.',
};

/** Mismo criterio que _gym_member_state en SQL (el servidor decide al reservar/check-in; esto solo pinta). */
const memberState = (m: GymMember, today: string): GymMemberState => {
  if (m.status === 'baja') return 'baja';
  if (m.status === 'congelado') return 'congelado';
  if (!m.end_date) return 'sin_plan';
  if (m.end_date < today) return 'vencido';
  if (diffDays(today, m.end_date) <= 7) return 'por_vencer';
  return 'activo';
};

type Filter = 'all' | 'por_vencer' | 'vencido' | 'activo' | 'congelado' | 'vip';

export const GymMembersTab: React.FC<Props> = ({ user, showNotification, plan }) => {
  const isUltra = plan === 'ultra';
  const [alertMsg, setAlertMsg] = useState<string | null>(null);
  const membersT = useOwnerTable<GymMember>({
    table: 'gym_members', ownerColumn: 'gym_profile_id', ownerId: user?.id, pollMs: 15000,
    order: [{ column: 'created_at', ascending: false }],
    onNew: fresh => { ping(); setAlertMsg(`🎉 Nuevo socio: ${fresh[0].name}`); setTimeout(() => setAlertMsg(null), 7000); },
  });
  const plansT = useOwnerTable<GymPlan>({ table: 'gym_plans', ownerColumn: 'gym_profile_id', ownerId: user?.id, realtime: false, order: [{ column: 'sort_order' }] });
  const members = membersT.rows; const plans = plansT.rows;
  const today = todayLocal();

  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [renewing, setRenewing] = useState<GymMember | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { discount_percent: number; notes: string; benefits: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  // Check-in en recepción
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [checkRes, setCheckRes] = useState<any | null>(null);

  const withState = useMemo(() => members.map(m => ({ m, st: memberState(m, today) })), [members, today]);
  const counts = useMemo(() => {
    const c = { activos: 0, por_vencer: 0, vencidos: 0, congelados: 0 };
    withState.forEach(({ st }) => {
      if (st === 'activo' || st === 'por_vencer') c.activos++;
      if (st === 'por_vencer') c.por_vencer++;
      if (st === 'vencido') c.vencidos++;
      if (st === 'congelado') c.congelados++;
    });
    return c;
  }, [withState]);

  const list = withState.filter(({ m, st }) => {
    if (filter === 'vip' && !m.is_vip) return false;
    if (filter !== 'all' && filter !== 'vip' && st !== filter) return false;
    const q = query.trim().toLowerCase();
    return !q || `${m.name} ${m.member_code} ${m.phone || ''} ${m.email || ''}`.toLowerCase().includes(q);
  });

  const rpcFail = (res: any) => showNotification(RPC_ERRORS[res?.error] || res?.message || 'No se pudo completar.', 'error');

  const doCheckin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setChecking(true); setCheckRes(null);
    const { data, error } = await supabase.rpc('gym_register_checkin', { p_member_code: code.trim() });
    setChecking(false);
    if (error) return showNotification(isMissingSql(error) ? 'Falta ejecutar setup_gym.sql en Supabase.' : error.message, 'error');
    setCheckRes(data);
    if (data?.ok) { setCode(''); membersT.reload(); }
  };

  const toggleVip = async (m: GymMember) => {
    const { error } = await supabase.from('gym_members').update({ is_vip: !m.is_vip }).eq('id', m.id);
    if (error) return showNotification(error.message, 'error');
    membersT.setRows(p => p.map(x => x.id === m.id ? { ...x, is_vip: !m.is_vip } : x));
  };
  const toggleFreeze = async (m: GymMember) => {
    const { data, error } = await supabase.rpc('gym_set_member_freeze', { p_member_id: m.id, p_freeze: m.status !== 'congelado' });
    if (error) return showNotification(error.message, 'error');
    if (!data?.ok) return rpcFail(data);
    showNotification(data.status === 'congelado' ? 'Membresía congelada.' : 'Membresía reactivada: el vencimiento se corrió los días de pausa.', 'success');
    membersT.reload();
  };
  const remove = async (m: GymMember) => {
    if (!window.confirm(`¿Eliminar a ${m.name}? Se borra también su historial de asistencias.`)) return;
    const { error } = await supabase.from('gym_members').delete().eq('id', m.id);
    if (error) return showNotification(error.message, 'error');
    membersT.setRows(p => p.filter(x => x.id !== m.id));
  };

  const draftOf = (m: GymMember) => drafts[m.id] ?? { discount_percent: m.discount_percent, notes: m.notes ?? '', benefits: m.benefits ?? '' };
  const setDraft = (m: GymMember, patch: Partial<{ discount_percent: number; notes: string; benefits: string }>) => setDrafts(p => ({ ...p, [m.id]: { ...draftOf(m), ...patch } }));
  const saveDraft = async (m: GymMember) => {
    const d = draftOf(m); setSavingId(m.id);
    const values = { discount_percent: Math.max(0, Math.min(100, Number(d.discount_percent) || 0)), notes: d.notes.trim() || null, benefits: d.benefits.trim() || null };
    const { error } = await supabase.from('gym_members').update(values).eq('id', m.id);
    setSavingId(null);
    if (error) return showNotification(error.message, 'error');
    membersT.setRows(p => p.map(x => x.id === m.id ? { ...x, ...values } : x));
    setDrafts(p => { const n = { ...p }; delete n[m.id]; return n; });
  };

  const reminder = (m: GymMember, st: GymMemberState) => {
    const first = m.name.split(' ')[0];
    if (st === 'por_vencer' || st === 'vencido') {
      const when = st === 'vencido' ? `venció el ${fmtDate(m.end_date, { day: 'numeric', month: 'long' })}` : `vence el ${fmtDate(m.end_date, { day: 'numeric', month: 'long' })}`;
      return `Hola ${first}, tu membresía${m.plan_name ? ` ${m.plan_name}` : ''} ${when}. ¿Quieres renovarla? Tu carnet es ${m.member_code}. ¡Te esperamos! 💪`;
    }
    return `Hola ${first}, ¡gracias por entrenar con nosotros! 💪`;
  };

  if (membersT.loading) return <Spinner accent={ACCENT} />;

  return (
    <div className="animate-fade-in-up space-y-6 max-w-4xl mx-auto px-4 md:px-6 pb-32" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5" style={{ borderColor: `${ACCENT}26` }}>
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2" style={{ fontFamily: TITLE_FONT }}><FaUsers style={{ color: ACCENT }} /> Socios</h2>
          <p className="text-sm text-white/40 mt-1">Carnets, vencimientos, renovaciones y asistencias de tu gimnasio.</p>
        </div>
        <button onClick={() => setAddOpen(true)} className="flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl" style={{ background: ACCENT, color: ON_ACCENT, fontFamily: TITLE_FONT }}><FaUserPlus /> Nuevo socio</button>
      </div>

      {membersT.missingSql && <MissingSqlNotice file="setup_gym.sql" accent={ACCENT} />}
      {alertMsg && <div className="p-4 text-sm font-bold rounded-xl flex items-center justify-between" style={{ background: `${ACCENT}1a`, border: `1px solid ${ACCENT}4d`, color: ACCENT }}><span>{alertMsg}</span><button onClick={() => setAlertMsg(null)} className="opacity-60 hover:opacity-100">✕</button></div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Activos" value={counts.activos} icon={<FaUsers />} accent={ACCENT} />
        <Kpi label="Por vencer (7 d)" value={counts.por_vencer} icon={<FaExclamationTriangle />} accent={ACCENT} tone={counts.por_vencer ? 'warn' : undefined} />
        <Kpi label="Vencidos" value={counts.vencidos} icon={<FaSyncAlt />} accent={ACCENT} tone={counts.vencidos ? 'bad' : undefined} />
        <Kpi label="Congelados" value={counts.congelados} icon={<FaSnowflake />} accent={ACCENT} />
      </div>

      {/* Check-in en recepción */}
      <form onSubmit={doCheckin} className="rounded-2xl border p-4 space-y-3" style={{ background: `${ACCENT}0a`, borderColor: `${ACCENT}2b` }}>
        <p className="text-xs font-black uppercase tracking-widest text-white flex items-center gap-2"><FaQrcode style={{ color: ACCENT }} /> Check-in en recepción</p>
        <div className="flex gap-2">
          <input className={adminInput} value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Código del carnet (G-XXXX)" />
          <button type="submit" disabled={checking || !code.trim()} className="shrink-0 px-5 rounded-xl text-xs font-black uppercase tracking-wider disabled:opacity-40" style={{ background: ACCENT, color: ON_ACCENT }}>{checking ? '…' : 'Registrar'}</button>
        </div>
        {checkRes && (
          <div className="rounded-xl p-3.5 border text-sm flex items-center gap-3"
            style={checkRes.ok ? { background: 'rgba(52,211,153,0.1)', borderColor: 'rgba(52,211,153,0.35)', color: '#34d399' } : { background: 'rgba(248,113,113,0.1)', borderColor: 'rgba(248,113,113,0.35)', color: '#f87171' }}>
            <span className="text-2xl">{checkRes.ok ? '✅' : '⛔'}</span>
            <div className="min-w-0">
              {checkRes.name && <p className="font-bold text-white truncate">{checkRes.name} <span className="font-mono text-xs opacity-70">{checkRes.member_code}</span></p>}
              {checkRes.ok
                ? <p>{checkRes.already ? 'Ya se registró hace unos minutos.' : 'Acceso permitido.'} {checkRes.days_left} día(s) restantes · {checkRes.visits} asistencias.</p>
                : <p>{RPC_ERRORS[checkRes.error] || 'Acceso denegado.'}{checkRes.end_date ? ` (venció ${fmtDate(checkRes.end_date)})` : ''}</p>}
            </div>
          </div>
        )}
      </form>

      {isUltra && <AttendancePanel userId={user.id} />}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-3 flex-1"><FaSearch className="text-white/30" size={12} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por nombre, código o teléfono…" className="bg-transparent w-full py-2.5 text-sm text-white focus:outline-none placeholder-white/30" /></div>
      </div>
      <div className="flex flex-wrap gap-2">
        {([['all', 'Todos'], ['por_vencer', 'Por vencer'], ['vencido', 'Vencidos'], ['activo', 'Activos'], ['congelado', 'Congelados'], ['vip', 'VIP']] as const).map(([f, l]) => (
          <Pill key={f} active={filter === f} onClick={() => setFilter(f)} accent={ACCENT} onAccent={ON_ACCENT}>{l}</Pill>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="text-center py-16 text-white/30"><p className="text-4xl mb-3">🪪</p><p className="text-sm">{members.length === 0 ? 'Aún no tienes socios. Inscribe al primero o convierte una solicitud en socio.' : 'Ningún socio coincide con el filtro.'}</p></div>
      ) : (
        <div className="space-y-3">
          {list.map(({ m, st }) => {
            const d = draftOf(m); const dirty = !!drafts[m.id];
            const meta = STATE[st]; const left = m.end_date ? diffDays(today, m.end_date) : null;
            return (
              <div key={m.id} className="rounded-2xl border p-4 transition" style={m.is_vip ? { background: `linear-gradient(135deg, ${ACCENT}12, transparent)`, borderColor: `${ACCENT}40` } : { background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-white font-bold truncate">{m.name}</h3>
                      <span className="text-[10px] font-mono font-black tracking-widest rounded-md px-2 py-0.5" style={{ color: ACCENT, background: 'rgba(0,0,0,0.4)', border: `1px solid ${ACCENT}33` }}>{m.member_code}</span>
                      <span className="text-[10px] font-black uppercase tracking-widest rounded-full px-2 py-0.5" style={{ color: meta.color, background: `${meta.color}1f`, border: `1px solid ${meta.color}55` }}>{meta.label}</span>
                      {m.is_vip && <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest rounded-full px-2 py-0.5" style={{ color: ACCENT, background: `${ACCENT}22`, border: `1px solid ${ACCENT}44` }}><FaCrown size={9} /> VIP</span>}
                    </div>
                    <p className="text-[12px] text-white/55 mt-1">{m.plan_name || 'Sin plan'}{m.end_date ? <> · vence <span style={{ color: meta.color }} className="font-semibold">{fmtDate(m.end_date, { day: 'numeric', month: 'short', year: 'numeric' })}</span>{left != null && st !== 'congelado' ? ` (${left >= 0 ? `${left} d` : `hace ${-left} d`})` : ''}</> : null}</p>
                    <p className="text-[11px] text-white/35 mt-0.5">{[m.phone, m.email].filter(Boolean).join(' · ')}{(m.phone || m.email) ? ' · ' : ''}{m.visits} asistencia{m.visits === 1 ? '' : 's'}{m.last_visit_at ? ` · última ${fmtDate(m.last_visit_at)}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {m.phone && <a href={waLink(m.phone, reminder(m, st))} target="_blank" rel="noopener noreferrer" title={st === 'por_vencer' || st === 'vencido' ? 'Enviar recordatorio de renovación' : 'WhatsApp'} className="w-8 h-8 rounded-lg bg-[#25D366]/10 border border-[#25D366]/20 text-[#25D366] flex items-center justify-center hover:bg-[#25D366]/20 transition"><FaWhatsapp size={13} /></a>}
                    <button title="Renovar" onClick={() => setRenewing(m)} className="w-8 h-8 rounded-lg flex items-center justify-center border transition" style={{ background: `${ACCENT}1a`, borderColor: `${ACCENT}44`, color: ACCENT }}><FaSyncAlt size={11} /></button>
                    <button title={m.status === 'congelado' ? 'Descongelar' : 'Congelar'} onClick={() => toggleFreeze(m)} className="w-8 h-8 rounded-lg flex items-center justify-center border transition" style={m.status === 'congelado' ? { background: 'rgba(96,165,250,0.2)', borderColor: 'rgba(96,165,250,0.5)', color: '#60a5fa' } : { background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}><FaSnowflake size={12} /></button>
                    <button title={m.is_vip ? 'Quitar VIP' : 'Marcar VIP'} onClick={() => toggleVip(m)} className="w-8 h-8 rounded-lg flex items-center justify-center border transition" style={m.is_vip ? { background: `${ACCENT}33`, borderColor: `${ACCENT}66`, color: ACCENT } : { background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}><FaCrown size={12} /></button>
                    <button title="Eliminar" onClick={() => remove(m)} className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center hover:bg-red-500/20 transition"><FaTrash size={11} /></button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr_auto] gap-2 mt-3 pt-3 border-t border-white/5 items-center">
                  <div className="flex items-center gap-2 bg-black/30 rounded-lg px-3 py-2 border border-white/5"><FaPercent size={10} style={{ color: ACCENT }} /><input type="number" min={0} max={100} value={d.discount_percent} onChange={e => setDraft(m, { discount_percent: Number(e.target.value) })} className="w-full bg-transparent text-white text-sm focus:outline-none" /><span className="text-[10px] text-white/40 uppercase">desc.</span></div>
                  <input value={d.notes} onChange={e => setDraft(m, { notes: e.target.value })} placeholder="Notas internas (lesiones, objetivos…)" className="bg-black/30 border border-white/5 text-white text-sm rounded-lg px-3 py-2 focus:outline-none placeholder-gray-600" />
                  <button onClick={() => saveDraft(m)} disabled={!dirty || savingId === m.id} className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg disabled:opacity-30 text-xs font-black uppercase tracking-wider" style={{ background: ACCENT, color: ON_ACCENT }}><FaSave size={11} /> {savingId === m.id ? '…' : 'Guardar'}</button>
                </div>
                <input value={d.benefits} onChange={e => setDraft(m, { benefits: e.target.value })} placeholder="🎁 Beneficios que ve el socio en su carnet (ej. 1 invitado gratis al mes)" className="w-full mt-2 text-white text-sm rounded-lg px-3 py-2 focus:outline-none placeholder-gray-500 border" style={{ background: `${ACCENT}0d`, borderColor: `${ACCENT}26` }} />
              </div>
            );
          })}
        </div>
      )}

      {addOpen && <EnrollModal plans={plans} showNotification={showNotification} onClose={() => setAddOpen(false)} onDone={() => { setAddOpen(false); membersT.reload(); }} />}
      {renewing && <RenewModal member={renewing} plans={plans} today={today} showNotification={showNotification} onClose={() => setRenewing(null)} onDone={() => { setRenewing(null); membersT.reload(); }} />}
    </div>
  );
};

/* ── Alta de socio ────────────────────────────────────────────────────────── */
const EnrollModal: React.FC<{ plans: GymPlan[]; showNotification: Props['showNotification']; onClose: () => void; onDone: () => void }> = ({ plans, showNotification, onClose, onDone }) => {
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [email, setEmail] = useState('');
  const [planId, setPlanId] = useState(plans[0]?.id || ''); const [start, setStart] = useState(todayLocal());
  const [busy, setBusy] = useState(false); const [created, setCreated] = useState<any | null>(null);
  const submit = async () => {
    if (!name.trim()) return showNotification(RPC_ERRORS.name_required, 'error');
    if (!planId) return showNotification('Primero crea un plan en la pestaña Planes.', 'error');
    setBusy(true);
    const { data, error } = await supabase.rpc('gym_enroll_member', { p_name: name.trim(), p_phone: phone.trim() || null, p_email: email.trim() || null, p_plan_id: planId, p_start_date: start, p_lead_id: null, p_source: 'manual', p_goal: null });
    setBusy(false);
    if (error) return showNotification(isMissingSql(error) ? 'Falta ejecutar setup_gym.sql en Supabase.' : error.message, 'error');
    if (!data?.ok) return showNotification(RPC_ERRORS[data?.error] || 'No se pudo inscribir.', 'error');
    setCreated(data);
  };
  return (
    <AdminModal title={created ? '¡Socio inscrito!' : 'Nuevo socio'} accent={ACCENT} onClose={created ? onDone : onClose}>
      {created ? (
        <div className="text-center space-y-3">
          <p className="text-white/60 text-sm">Carnet de {name}:</p>
          <p className="inline-block font-mono text-3xl font-black tracking-[0.25em] px-5 py-3 rounded-xl border" style={{ color: ACCENT, borderColor: `${ACCENT}44`, background: 'rgba(255,255,255,0.04)' }}>{created.member_code}</p>
          <p className="text-xs text-white/40">Vence el {fmtDate(created.end_date, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          <div className="flex gap-2 justify-center">
            {phone && <a href={waLink(phone, `¡Bienvenido/a ${name.split(' ')[0]}! Tu carnet de socio es ${created.member_code}. Vence el ${fmtDate(created.end_date, { day: 'numeric', month: 'long' })}. 💪`)} target="_blank" rel="noopener noreferrer" className="px-4 py-2.5 rounded-xl text-xs font-bold border text-[#25D366] border-[#25D366]/30"><FaWhatsapp className="inline mr-1.5" />Enviar carnet</a>}
            <button onClick={onDone} className="px-5 py-2.5 rounded-xl text-xs font-black uppercase" style={{ background: ACCENT, color: ON_ACCENT }}>Listo</button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="Nombre *"><input className={adminInput} value={name} onChange={e => setName(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Teléfono"><input className={adminInput} value={phone} onChange={e => setPhone(e.target.value)} /></Field>
            <Field label="Email"><input className={adminInput} value={email} onChange={e => setEmail(e.target.value)} /></Field>
          </div>
          <Field label="Plan *">
            <select className={adminInput} value={planId} onChange={e => setPlanId(e.target.value)}>
              {plans.length === 0 && <option value="">— Crea un plan primero —</option>}
              {plans.map(p => <option key={p.id} value={p.id}>{p.name} · {p.duration_days} días</option>)}
            </select>
          </Field>
          <Field label="Inicia el" hint="El vencimiento se calcula con la duración del plan"><input type="date" className={adminInput} value={start} onChange={e => setStart(e.target.value)} /></Field>
          <button onClick={submit} disabled={busy} className="w-full py-3 rounded-xl text-sm font-black uppercase tracking-wider disabled:opacity-50" style={{ background: ACCENT, color: ON_ACCENT, fontFamily: TITLE_FONT }}>{busy ? 'Inscribiendo…' : 'Inscribir socio'}</button>
        </div>
      )}
    </AdminModal>
  );
};

/* ── Renovación ───────────────────────────────────────────────────────────── */
const RenewModal: React.FC<{ member: GymMember; plans: GymPlan[]; today: string; showNotification: Props['showNotification']; onClose: () => void; onDone: () => void }> = ({ member, plans, today, showNotification, onClose, onDone }) => {
  const [planId, setPlanId] = useState(member.plan_id || plans[0]?.id || '');
  const [busy, setBusy] = useState(false);
  const plan = plans.find(p => p.id === planId);
  // Misma regla que gym_renew_member: vigente → desde el día siguiente al vencimiento; vencido → desde hoy.
  const start = member.end_date && member.end_date >= today && member.status === 'activo' ? addDaysLocal(member.end_date, 1) : today;
  const newEnd = plan ? addDaysLocal(start, plan.duration_days - 1) : null;
  const submit = async () => {
    if (!planId) return showNotification(RPC_ERRORS.plan_required, 'error');
    setBusy(true);
    const { data, error } = await supabase.rpc('gym_renew_member', { p_member_id: member.id, p_plan_id: planId });
    setBusy(false);
    if (error) return showNotification(error.message, 'error');
    if (!data?.ok) return showNotification(RPC_ERRORS[data?.error] || 'No se pudo renovar.', 'error');
    showNotification(`Renovado hasta el ${fmtDate(data.end_date, { day: 'numeric', month: 'long', year: 'numeric' })}.`, 'success');
    onDone();
  };
  return (
    <AdminModal title={`Renovar · ${member.name}`} accent={ACCENT} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Plan">
          <select className={adminInput} value={planId} onChange={e => setPlanId(e.target.value)}>
            {plans.length === 0 && <option value="">— Sin planes —</option>}
            {plans.map(p => <option key={p.id} value={p.id}>{p.name} · {p.duration_days} días</option>)}
          </select>
        </Field>
        {newEnd && <p className="text-sm text-white/60 rounded-xl p-3 border border-white/10 bg-white/[0.03]">El nuevo ciclo va del <b className="text-white">{fmtDate(start, { day: 'numeric', month: 'short' })}</b> al <b style={{ color: ACCENT }}>{fmtDate(newEnd, { day: 'numeric', month: 'long', year: 'numeric' })}</b>.{member.end_date && member.end_date >= today ? ' Se suma a los días que ya tenía pagados.' : ''}</p>}
        <button onClick={submit} disabled={busy || !planId} className="w-full py-3 rounded-xl text-sm font-black uppercase tracking-wider disabled:opacity-50" style={{ background: ACCENT, color: ON_ACCENT, fontFamily: TITLE_FONT }}>{busy ? 'Renovando…' : 'Confirmar renovación'}</button>
      </div>
    </AdminModal>
  );
};

/* ── Afluencia (ULTRA): asistencias por día de la semana y por hora ────────── */
const AttendancePanel: React.FC<{ userId: string }> = ({ userId }) => {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<{ checked_at: string }[] | null>(null);
  const load = useCallback(async () => {
    const since = new Date(Date.now() - 60 * 86400000).toISOString();
    const { data } = await supabase.from('gym_checkins').select('checked_at').eq('gym_profile_id', userId).gte('checked_at', since).limit(20000);
    setRows((data ?? []) as any[]);
  }, [userId]);

  const stats = useMemo(() => {
    const byDay = Array(7).fill(0); const byHour = Array(24).fill(0);
    (rows || []).forEach(r => { const d = new Date(r.checked_at); byDay[d.getDay()]++; byHour[d.getHours()]++; });
    return { byDay, byHour, total: (rows || []).length, maxDay: Math.max(...byDay, 1), maxHour: Math.max(...byHour, 1) };
  }, [rows]);
  const NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const peakHour = stats.byHour.indexOf(Math.max(...stats.byHour));

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}>
      <button type="button" onClick={() => { setOpen(o => !o); if (!rows) load(); }} className="w-full flex items-center justify-between gap-3 p-4 text-left">
        <span className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white"><FaChartBar style={{ color: ACCENT }} /> Afluencia · últimos 60 días</span>
        <span className="text-white/40 text-xs">{open ? 'Ocultar' : 'Ver'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-5">
          {!rows ? <p className="text-white/30 text-sm">Cargando…</p> : stats.total === 0 ? <p className="text-white/30 text-sm">Aún no hay asistencias registradas. Usa el check-in de arriba y aquí verás tus horas pico.</p> : (
            <>
              <p className="text-sm text-white/60">{stats.total} asistencias · hora pico <b style={{ color: ACCENT }}>{String(peakHour).padStart(2, '0')}:00</b></p>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-white/40 mb-2">Por día</p>
                <div className="flex items-end gap-2 h-24">
                  {stats.byDay.map((n, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
                      <span className="text-[10px] text-white/50">{n}</span>
                      <div className="w-full rounded-t-md" style={{ height: `${Math.max((n / stats.maxDay) * 100, 4)}%`, background: ACCENT, opacity: 0.35 + 0.65 * (n / stats.maxDay) }} />
                      <span className="text-[10px] text-white/40">{NAMES[i]}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-white/40 mb-2">Por hora</p>
                <div className="flex items-end gap-[3px] h-20">
                  {stats.byHour.map((n, h) => (
                    <div key={h} title={`${h}:00 · ${n}`} className="flex-1 rounded-t-sm" style={{ height: `${Math.max((n / stats.maxHour) * 100, 3)}%`, background: ACCENT, opacity: n === 0 ? 0.12 : 0.35 + 0.65 * (n / stats.maxHour) }} />
                  ))}
                </div>
                <div className="flex justify-between text-[9px] text-white/30 mt-1"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span></div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default GymMembersTab;
