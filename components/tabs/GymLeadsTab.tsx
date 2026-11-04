import React, { useMemo, useState } from 'react';
import { supabase } from '../../src/lib/supabase';
import type { GymLead, GymPlan, GymSettings } from '../../types';
import { FaClipboardList, FaWhatsapp, FaTrash, FaUserCheck, FaSearch, FaPhone, FaEnvelope, FaBullseye, FaCalendarDay, FaSave } from 'react-icons/fa';
import {
  useOwnerTable, useJsonSettings, AdminModal, Field, adminInput, Spinner, MissingSqlNotice, Kpi, Pill, ping, waLink,
  todayLocal, fmtDate, isMissingSql,
} from '../AdminKit';
import { ExportRangePanel, fetchOwnerRange, type ExportColumn } from '../ExportRangePanel';

interface Props {
  user: any;
  profileData: any;
  setProfileData: React.Dispatch<React.SetStateAction<any>>;
  showNotification: (message: string, type: 'success' | 'error') => void;
  plan: 'conecta' | 'pro' | 'ultra';
}

const ACCENT = '#c6f432';
const ON_ACCENT = '#0a0c09';
const TITLE_FONT = "'Tomorrow', sans-serif";

const TYPE: Record<string, { label: string; color: string }> = {
  prueba: { label: 'Clase de prueba', color: '#fbbf24' }, inscripcion: { label: 'Inscripción', color: ACCENT }, consulta: { label: 'Consulta', color: '#60a5fa' },
};
const STATUS: { val: GymLead['status']; label: string }[] = [
  { val: 'recibido', label: 'Recibido' }, { val: 'contactado', label: 'Contactado' }, { val: 'agendado', label: 'Agendado' },
  { val: 'inscrito', label: 'Inscrito' }, { val: 'cancelado', label: 'Cancelado' },
];
const STATUS_COLOR: Record<string, string> = { recibido: '#fbbf24', contactado: '#60a5fa', agendado: '#a78bfa', inscrito: '#34d399', cancelado: '#9ca3af' };

const COLUMNS: ExportColumn<GymLead>[] = [
  { header: 'Recibida el', get: r => (r.created_at ? new Date(r.created_at).toLocaleString('es-EC') : '') },
  { header: 'Tipo', get: r => TYPE[r.request_type]?.label || r.request_type }, { header: 'Nombre', get: r => r.name },
  { header: 'Teléfono', get: r => r.phone || '' }, { header: 'Email', get: r => r.email || '' }, { header: 'Plan', get: r => r.plan_name || '' },
  { header: 'Objetivo', get: r => r.goal || '' }, { header: 'Fecha deseada', get: r => r.preferred_date || '' },
  { header: 'Estado', get: r => STATUS.find(s => s.val === r.status)?.label || r.status }, { header: 'Código', get: r => r.tracking_code },
  { header: 'Carnet', get: r => r.member_code || '' }, { header: 'Campaña', get: r => r.source_campaign || '' }, { header: 'Notas', get: r => r.notes || '' },
];

export const GymLeadsTab: React.FC<Props> = ({ user, profileData, setProfileData, showNotification, plan }) => {
  const [alertMsg, setAlertMsg] = useState<string | null>(null);
  const leadsT = useOwnerTable<GymLead>({
    table: 'gym_leads', ownerColumn: 'gym_profile_id', ownerId: user?.id, pollMs: 12000,
    order: [{ column: 'created_at', ascending: false }],
    onNew: fresh => { ping(); setAlertMsg(`🔔 Nueva solicitud: ${fresh[0].name} (${TYPE[fresh[0].request_type]?.label})`); setTimeout(() => setAlertMsg(null), 7000); },
  });
  const plansT = useOwnerTable<GymPlan>({ table: 'gym_plans', ownerColumn: 'gym_profile_id', ownerId: user?.id, realtime: false, order: [{ column: 'sort_order' }] });
  const { settings, save: saveSettings, saving } = useJsonSettings<GymSettings>('gym_settings', user?.id, profileData, setProfileData, showNotification);
  const leads = leadsT.rows;

  const [typeFilter, setTypeFilter] = useState<'all' | GymLead['request_type']>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | GymLead['status']>('all');
  const [query, setQuery] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [converting, setConverting] = useState<GymLead | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  const canConvert = plan !== 'conecta';   // el carnet de socio es PRO+

  const list = useMemo(() => leads.filter(l => {
    if (typeFilter !== 'all' && l.request_type !== typeFilter) return false;
    if (statusFilter !== 'all' && l.status !== statusFilter) return false;
    const q = query.trim().toLowerCase();
    return !q || `${l.name} ${l.phone || ''} ${l.email || ''} ${l.tracking_code}`.toLowerCase().includes(q);
  }), [leads, typeFilter, statusFilter, query]);

  const setStatus = async (l: GymLead, status: GymLead['status']) => {
    const { error } = await supabase.from('gym_leads').update({ status }).eq('id', l.id);
    if (error) return showNotification(error.message, 'error');
    leadsT.setRows(p => p.map(x => x.id === l.id ? { ...x, status } : x));
  };
  const saveNote = async (l: GymLead) => {
    const note = (notes[l.id] ?? l.admin_note ?? '').trim() || null;
    const { error } = await supabase.from('gym_leads').update({ admin_note: note }).eq('id', l.id);
    if (error) return showNotification(error.message, 'error');
    leadsT.setRows(p => p.map(x => x.id === l.id ? { ...x, admin_note: note } : x));
    setNotes(p => { const n = { ...p }; delete n[l.id]; return n; });
    showNotification('Mensaje guardado: el cliente lo verá al rastrear su solicitud.', 'success');
  };
  const remove = async (l: GymLead) => {
    if (!window.confirm(`¿Eliminar la solicitud de ${l.name}?`)) return;
    const { error } = await supabase.from('gym_leads').delete().eq('id', l.id);
    if (error) return showNotification(error.message, 'error');
    leadsT.setRows(p => p.filter(x => x.id !== l.id));
  };

  const contactMsg = (l: GymLead) => {
    const first = l.name.split(' ')[0];
    if (l.request_type === 'prueba') return `Hola ${first}, recibimos tu solicitud de clase de prueba${l.preferred_date ? ` para el ${l.preferred_date}` : ''}. ¿Te viene bien venir a esa hora? Tu código de seguimiento es ${l.tracking_code}. 💪`;
    if (l.request_type === 'inscripcion') return `Hola ${first}, recibimos tu inscripción${l.plan_name ? ` al plan ${l.plan_name}` : ''}. ¿Cuándo puedes pasar a completar tu registro? Tu código es ${l.tracking_code}.`;
    return `Hola ${first}, recibimos tu consulta. Tu código de seguimiento es ${l.tracking_code}. ¿En qué podemos ayudarte?`;
  };

  if (leadsT.loading) return <Spinner accent={ACCENT} />;

  return (
    <div className="animate-fade-in-up space-y-6 max-w-4xl mx-auto px-4 md:px-6 pb-32" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      <div className="border-b pb-5" style={{ borderColor: `${ACCENT}26` }}>
        <h2 className="text-2xl font-black text-white flex items-center gap-2" style={{ fontFamily: TITLE_FONT }}><FaClipboardList style={{ color: ACCENT }} /> Solicitudes</h2>
        <p className="text-sm text-white/40 mt-1">Clases de prueba, inscripciones y consultas. El cliente las sigue con su código de rastreo.</p>
      </div>

      {leadsT.missingSql && <MissingSqlNotice file="setup_gym.sql" accent={ACCENT} />}
      {alertMsg && <div className="p-4 text-sm font-bold rounded-xl flex items-center justify-between" style={{ background: `${ACCENT}1a`, border: `1px solid ${ACCENT}4d`, color: ACCENT }}><span>{alertMsg}</span><button onClick={() => setAlertMsg(null)} className="opacity-60 hover:opacity-100">✕</button></div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Nuevas" value={leads.filter(l => l.status === 'recibido').length} icon={<FaClipboardList />} accent={ACCENT} tone={leads.some(l => l.status === 'recibido') ? 'warn' : undefined} />
        <Kpi label="Pruebas agendadas" value={leads.filter(l => l.request_type === 'prueba' && l.status === 'agendado').length} icon={<FaCalendarDay />} accent={ACCENT} />
        <Kpi label="Inscritos" value={leads.filter(l => l.status === 'inscrito').length} icon={<FaUserCheck />} accent={ACCENT} tone="good" />
        <Kpi label="Total" value={leads.length} icon={<FaBullseye />} accent={ACCENT} />
      </div>

      <div className="rounded-2xl border p-4 space-y-3" style={{ background: `${ACCENT}0a`, borderColor: `${ACCENT}2b` }}>
        <label className="flex items-center gap-2 text-sm text-white/80"><input type="checkbox" checked={settings.trialEnabled !== false} onChange={e => saveSettings({ trialEnabled: e.target.checked }, e.target.checked ? 'Clase de prueba activada.' : 'Clase de prueba desactivada.')} /> Ofrecer «clase de prueba» en mi perfil</label>
        <div className="flex gap-2">
          <input className={adminInput} value={label ?? settings.trialLabel ?? ''} onChange={e => setLabel(e.target.value)} placeholder="Texto del botón (por defecto: Clase de prueba gratis)" />
          {label !== null && <button disabled={saving} onClick={async () => { if (await saveSettings({ trialLabel: label.trim() || undefined }, 'Texto guardado.')) setLabel(null); }} className="shrink-0 px-4 rounded-xl text-xs font-black uppercase disabled:opacity-40" style={{ background: ACCENT, color: ON_ACCENT }}><FaSave /></button>}
        </div>
      </div>

      <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-3"><FaSearch className="text-white/30" size={12} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por nombre, teléfono o código…" className="bg-transparent w-full py-2.5 text-sm text-white focus:outline-none placeholder-white/30" /></div>
      <div className="flex flex-wrap gap-2">
        <Pill active={typeFilter === 'all'} onClick={() => setTypeFilter('all')} accent={ACCENT} onAccent={ON_ACCENT}>Todas</Pill>
        {Object.entries(TYPE).map(([k, v]) => <Pill key={k} active={typeFilter === k} onClick={() => setTypeFilter(k as any)} accent={ACCENT} onAccent={ON_ACCENT}>{v.label}</Pill>)}
      </div>
      <div className="flex flex-wrap gap-2">
        <Pill active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} accent={ACCENT} onAccent={ON_ACCENT}>Cualquier estado</Pill>
        {STATUS.map(s => <Pill key={s.val} active={statusFilter === s.val} onClick={() => setStatusFilter(s.val)} accent={ACCENT} onAccent={ON_ACCENT}>{s.label}</Pill>)}
      </div>

      {list.length === 0 ? (
        <div className="text-center py-16 text-white/30"><p className="text-4xl mb-3">📥</p><p className="text-sm">{leads.length === 0 ? 'Aquí llegarán las clases de prueba y las inscripciones de tu perfil.' : 'Ninguna solicitud coincide con el filtro.'}</p></div>
      ) : (
        <div className="space-y-3">
          {list.map(l => {
            const t = TYPE[l.request_type]; const noteVal = notes[l.id] ?? l.admin_note ?? '';
            return (
              <div key={l.id} className="rounded-2xl border p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.03)', borderColor: l.status === 'recibido' ? `${ACCENT}40` : 'rgba(255,255,255,0.08)' }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-white font-bold truncate">{l.name}</h3>
                      <span className="text-[10px] font-black uppercase tracking-widest rounded-full px-2 py-0.5" style={{ color: t?.color, background: `${t?.color}1f`, border: `1px solid ${t?.color}55` }}>{t?.label}</span>
                      <span className="text-[10px] font-mono font-black tracking-widest rounded-md px-2 py-0.5 bg-black/40 border border-white/10 text-white/70">{l.tracking_code}</span>
                      {l.member_code && <span className="text-[10px] font-mono font-black tracking-widest rounded-md px-2 py-0.5" style={{ color: ACCENT, border: `1px solid ${ACCENT}44` }}>{l.member_code}</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-white/50">
                      {l.phone && <span className="flex items-center gap-1"><FaPhone size={9} /> {l.phone}</span>}
                      {l.email && <span className="flex items-center gap-1"><FaEnvelope size={9} /> {l.email}</span>}
                      {l.plan_name && <span>📋 {l.plan_name}</span>}
                      {l.goal && <span>🎯 {l.goal}</span>}
                      {l.preferred_date && <span>📅 {l.preferred_date}</span>}
                      {l.created_at && <span className="text-white/30">{fmtDate(l.created_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
                    </div>
                    {l.notes && <p className="text-[12px] text-white/55 mt-1.5 italic">“{l.notes}”</p>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {l.phone && <a href={waLink(l.phone, contactMsg(l))} target="_blank" rel="noopener noreferrer" title="Contactar por WhatsApp" className="w-8 h-8 rounded-lg bg-[#25D366]/10 border border-[#25D366]/20 text-[#25D366] flex items-center justify-center hover:bg-[#25D366]/20 transition"><FaWhatsapp size={13} /></a>}
                    {canConvert && l.status !== 'inscrito' && l.request_type !== 'consulta' && (
                      <button title="Convertir en socio" onClick={() => setConverting(l)} className="h-8 px-3 rounded-lg flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider border" style={{ background: `${ACCENT}1a`, borderColor: `${ACCENT}55`, color: ACCENT }}><FaUserCheck size={11} /> Socio</button>
                    )}
                    <button title="Eliminar" onClick={() => remove(l)} className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center hover:bg-red-500/20 transition"><FaTrash size={11} /></button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {STATUS.map(s => (
                    <button key={s.val} onClick={() => setStatus(l, s.val)} className="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border transition"
                      style={l.status === s.val ? { background: STATUS_COLOR[s.val], color: '#0a0a0a', borderColor: STATUS_COLOR[s.val] } : { background: 'transparent', color: 'rgba(255,255,255,0.45)', borderColor: 'rgba(255,255,255,0.12)' }}>{s.label}</button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input value={noteVal} onChange={e => setNotes(p => ({ ...p, [l.id]: e.target.value }))} placeholder="Mensaje para el cliente (lo ve al rastrear su solicitud)" className="flex-1 bg-black/30 border border-white/5 text-white text-sm rounded-lg px-3 py-2 focus:outline-none placeholder-gray-600" />
                  {notes[l.id] !== undefined && <button onClick={() => saveNote(l)} className="shrink-0 px-3.5 rounded-lg text-xs font-black uppercase" style={{ background: ACCENT, color: ON_ACCENT }}><FaSave /></button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ExportRangePanel<GymLead>
        accent={ACCENT} noun="solicitudes" dateLabel="la fecha en que llegaron" fileBase="solicitudes-gimnasio" sheetName="Solicitudes"
        localRows={leads} getDate={r => (r.created_at ? r.created_at.slice(0, 10) : null)}
        fetchRange={range => fetchOwnerRange<GymLead>({ table: 'gym_leads', ownerColumn: 'gym_profile_id', ownerId: user.id, dateColumn: 'created_at', isTimestamp: true, range, orderBy: [{ column: 'created_at' }] })}
        columns={COLUMNS} showNotification={showNotification} />

      {converting && <ConvertModal lead={converting} plans={plansT.rows} showNotification={showNotification} onClose={() => setConverting(null)} onDone={() => { setConverting(null); leadsT.reload(); }} />}
    </div>
  );
};

/* ── Convertir una solicitud en socio ─────────────────────────────────────── */
const ConvertModal: React.FC<{ lead: GymLead; plans: GymPlan[]; showNotification: Props['showNotification']; onClose: () => void; onDone: () => void }> = ({ lead, plans, showNotification, onClose, onDone }) => {
  const [planId, setPlanId] = useState(lead.plan_id || plans[0]?.id || '');
  const [start, setStart] = useState(todayLocal());
  const [busy, setBusy] = useState(false); const [created, setCreated] = useState<any | null>(null);
  const submit = async () => {
    if (!planId) return showNotification('Primero crea un plan en la pestaña Planes.', 'error');
    setBusy(true);
    const { data, error } = await supabase.rpc('gym_enroll_member', { p_name: lead.name, p_phone: lead.phone, p_email: lead.email, p_plan_id: planId, p_start_date: start, p_lead_id: lead.id, p_source: lead.request_type, p_goal: lead.goal });
    setBusy(false);
    if (error) return showNotification(isMissingSql(error) ? 'Falta ejecutar setup_gym.sql en Supabase.' : error.message, 'error');
    if (!data?.ok) return showNotification('No se pudo inscribir.', 'error');
    setCreated(data);
  };
  return (
    <AdminModal title={created ? '¡Ya es socio!' : `Inscribir a ${lead.name}`} accent={ACCENT} onClose={created ? onDone : onClose}>
      {created ? (
        <div className="text-center space-y-3">
          <p className="inline-block font-mono text-3xl font-black tracking-[0.25em] px-5 py-3 rounded-xl border" style={{ color: ACCENT, borderColor: `${ACCENT}44`, background: 'rgba(255,255,255,0.04)' }}>{created.member_code}</p>
          <p className="text-xs text-white/40">Vence el {fmtDate(created.end_date, { day: 'numeric', month: 'long', year: 'numeric' })}. La solicitud quedó marcada como «Inscrito».</p>
          <div className="flex gap-2 justify-center">
            {lead.phone && <a href={waLink(lead.phone, `¡Bienvenido/a ${lead.name.split(' ')[0]}! Tu carnet de socio es ${created.member_code}. Vence el ${fmtDate(created.end_date, { day: 'numeric', month: 'long' })}. 💪`)} target="_blank" rel="noopener noreferrer" className="px-4 py-2.5 rounded-xl text-xs font-bold border text-[#25D366] border-[#25D366]/30"><FaWhatsapp className="inline mr-1.5" />Enviar carnet</a>}
            <button onClick={onDone} className="px-5 py-2.5 rounded-xl text-xs font-black uppercase" style={{ background: ACCENT, color: ON_ACCENT }}>Listo</button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="Plan contratado">
            <select className={adminInput} value={planId} onChange={e => setPlanId(e.target.value)}>
              {plans.length === 0 && <option value="">— Crea un plan primero —</option>}
              {plans.map(p => <option key={p.id} value={p.id}>{p.name} · {p.duration_days} días</option>)}
            </select>
          </Field>
          <Field label="Inicia el"><input type="date" className={adminInput} value={start} onChange={e => setStart(e.target.value)} /></Field>
          <button onClick={submit} disabled={busy} className="w-full py-3 rounded-xl text-sm font-black uppercase tracking-wider disabled:opacity-50" style={{ background: ACCENT, color: ON_ACCENT, fontFamily: TITLE_FONT }}>{busy ? 'Inscribiendo…' : 'Crear carnet de socio'}</button>
        </div>
      )}
    </AdminModal>
  );
};

export default GymLeadsTab;
