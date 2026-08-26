import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../../src/lib/supabase';
import type { RealtyLead, RealtyAgent, RealtyProperty } from '../../types';
import {
  FaUsers, FaTrash, FaWhatsapp, FaEnvelope, FaSearch, FaDownload,
  FaUserTie, FaBuilding, FaMoneyBillWave, FaBullhorn,
} from 'react-icons/fa';
import { ExportRangePanel, fetchOwnerRange, type ExportColumn } from '../ExportRangePanel';
import type { DateRange } from '../../src/lib/exportRange';
import { DailyAgendaPanel } from '../DailyAgendaPanel';
import type { AgendaRow } from '../../src/lib/reminders';

interface Props { user: any; }

const ACCENT = '#ff6600';
const ACCENT_LIGHT = '#ffa35d';
const TITLE_FONT = "'Tomorrow', sans-serif";

const STATUSES = ['recibido', 'contactado', 'en_proceso', 'cerrado', 'cancelado'];
const STATUS_COLOR: Record<string, string> = {
  recibido: ACCENT_LIGHT, contactado: '#38bdf8', en_proceso: '#fbbf24',
  cerrado: '#4ade80', cancelado: '#f87171',
};
const STATUS_LABEL: Record<string, string> = {
  recibido: 'recibido', contactado: 'contactado', en_proceso: 'en proceso', cerrado: 'cerrado', cancelado: 'cancelado',
};
const REQUEST_META: Record<string, { label: string; color: string }> = {
  cotizacion: { label: 'Cotización', color: '#38bdf8' },
  visita:     { label: 'Visita',     color: '#a78bfa' },
  compra:     { label: 'Compra',     color: '#4ade80' },
};

let leadAudioCtx: AudioContext | null = null;
const playLeadPing = () => {
  if (typeof window === 'undefined') return;
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  if (!AC) return;
  if (!leadAudioCtx) { try { leadAudioCtx = new AC(); } catch { return; } }
  const ctx = leadAudioCtx;
  const doPlay = () => {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(820, ctx.currentTime);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      osc.start(); osc.stop(ctx.currentTime + 0.25);
    } catch {}
  };
  if (ctx.state === 'suspended') ctx.resume().then(doPlay).catch(() => {}); else doPlay();
};

export const RealtyLeadsTab: React.FC<Props> = ({ user }) => {
  const [leads, setLeads] = useState<RealtyLead[]>([]);
  const [agents, setAgents] = useState<Record<string, RealtyAgent>>({});
  const [properties, setProperties] = useState<Record<string, RealtyProperty>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [agentFilter, setAgentFilter] = useState('all');
  const [alertMsg, setAlertMsg] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [savingNote, setSavingNote] = useState<string | null>(null);

  const knownIdsRef = useRef<Set<string>>(new Set());
  const initialisedRef = useRef(false);

  const fetchAll = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [leadsRes, agentsRes, propsRes] = await Promise.all([
        supabase.from('realty_leads').select('*').eq('agency_profile_id', user.id).order('created_at', { ascending: false }),
        supabase.from('realty_agents').select('*').eq('agency_profile_id', user.id),
        supabase.from('realty_properties').select('*').eq('agency_profile_id', user.id),
      ]);
      if (leadsRes.error) throw leadsRes.error;
      const list = (leadsRes.data ?? []) as RealtyLead[];

      const aMap: Record<string, RealtyAgent> = {};
      (agentsRes.data ?? []).forEach((a: any) => { aMap[a.id] = a; });
      const pMap: Record<string, RealtyProperty> = {};
      (propsRes.data ?? []).forEach((p: any) => { pMap[p.id] = p; });
      setAgents(aMap);
      setProperties(pMap);

      if (initialisedRef.current) {
        const fresh = list.filter(l => !knownIdsRef.current.has(l.id));
        if (fresh.length > 0) {
          const n = fresh[0];
          playLeadPing();
          const who = n.agent_id && aMap[n.agent_id] ? ` (agente: ${aMap[n.agent_id].name || aMap[n.agent_id].agent_username})` : '';
          setAlertMsg(`🔥 Nuevo lead: ${n.client_name || n.client_phone || n.client_email || 'cliente'}${who}`);
          setTimeout(() => setAlertMsg(null), 8000);
        }
      }
      knownIdsRef.current = new Set(list.map(l => l.id));
      initialisedRef.current = true;
      setLeads(list);
    } catch (err: any) {
      console.error('RealtyLeadsTab fetch error:', err?.message ?? err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    const onGesture = () => { if (leadAudioCtx?.state === 'suspended') leadAudioCtx.resume().catch(() => {}); };
    window.addEventListener('pointerdown', onGesture);
    window.addEventListener('keydown', onGesture);
    return () => {
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    fetchAll();
    const channel = supabase
      .channel(`realty_leads_${user.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'realty_leads', filter: `agency_profile_id=eq.${user.id}` },
        () => fetchAll())
      .subscribe();
    const poll = setInterval(fetchAll, 12000);
    const onFocus = () => { if (document.visibilityState !== 'hidden') fetchAll(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [user?.id, fetchAll]);

  const updateStatus = async (id: string, status: string) => {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l));
    try {
      const { error } = await supabase.from('realty_leads').update({ status }).eq('id', id);
      if (error) throw error;
    } catch (err: any) { console.error(err); }
  };

  const saveNote = async (id: string) => {
    const note = (noteDrafts[id] ?? '').trim();
    setSavingNote(id);
    try {
      const { error } = await supabase.from('realty_leads').update({ admin_note: note || null }).eq('id', id);
      if (error) throw error;
      setLeads(prev => prev.map(l => l.id === id ? { ...l, admin_note: note || null } : l));
      setNoteDrafts(prev => { const n = { ...prev }; delete n[id]; return n; });
    } catch (err: any) { alert(`Error: ${err?.message ?? err}`); }
    finally { setSavingNote(null); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Eliminar este lead?')) return;
    try {
      const { error } = await supabase.from('realty_leads').delete().eq('id', id);
      if (error) throw error;
      setLeads(prev => prev.filter(l => l.id !== id));
    } catch (err: any) { alert(`Error al eliminar: ${err?.message ?? err}`); }
  };

  const agentName = (id?: string | null) => (id && agents[id] ? (agents[id].name || agents[id].agent_username) : null);

  const filtered = leads.filter(l => {
    if (agentFilter !== 'all') {
      if (agentFilter === '__none__' ? !!l.agent_id : l.agent_id !== agentFilter) return false;
    }
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [l.client_name, l.client_phone, l.client_email, l.payment_method, l.budget_range].some(v => (v || '').toLowerCase().includes(q));
  });

  const exportCSV = () => {
    const rows = [['Cliente', 'Teléfono', 'Email', 'Presupuesto', 'Pago', 'Propiedad', 'Agente', 'Campaña', 'Estado', 'Fecha']];
    filtered.forEach(l => rows.push([
      l.client_name || '', l.client_phone || '', l.client_email || '', l.budget_range || '', l.payment_method || '',
      l.property_id && properties[l.property_id] ? properties[l.property_id].title : '',
      agentName(l.agent_id) || '', l.source_campaign || '', l.status,
      new Date(l.created_at || '').toLocaleString(),
    ]));
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `leads_inmobiliaria_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const agentList = useMemo(() => Object.values(agents), [agents]);

  // Agenda de visitas. Sólo entran las solicitudes con una fecha deseada
  // legible: `preferred_date` es texto libre (setup_realty.sql:271) y una
  // cotización sin fecha no es una visita que recordar.
  const agendaRows = useMemo<AgendaRow[]>(() => leads
    .filter(l => /^\d{4}-\d{2}-\d{2}$/.test(String(l.preferred_date || '')))
    .map(l => ({
      id: l.id,
      date: String(l.preferred_date),
      time: '',
      name: l.client_name || 'Cliente',
      phone: l.client_phone || '',
      status: l.status,
      detail: l.tracking_code ? `Código ${l.tracking_code}` : undefined,
    })), [leads]);

  // ── Descarga en Excel por rango de fechas ────────────────────────────
  // Aquí el rango es sobre `created_at`, que es un timestamp: los límites del
  // día se toman en la hora local del dueño (ver `rangeToTimestamps`), para que
  // una solicitud de las 20:00 en Ecuador no se cuente en el día siguiente.
  const exportColumns = useMemo<ExportColumn<RealtyLead>[]>(() => [
    { header: 'Fecha de solicitud', get: l => (l.created_at ? new Date(l.created_at).toLocaleString('es-EC') : '') },
    { header: 'Tipo', get: l => REQUEST_META[String(l.request_type || '')]?.label || String(l.request_type || '') },
    { header: 'Cliente', get: l => l.client_name || '' },
    { header: 'Teléfono', get: l => l.client_phone || '' },
    { header: 'Email', get: l => l.client_email || '' },
    { header: 'Presupuesto', get: l => l.budget_range || '' },
    { header: 'Forma de pago', get: l => l.payment_method || '' },
    { header: 'Propiedad', get: l => (l.property_id && properties[l.property_id] ? properties[l.property_id].title : '') },
    { header: 'Agente', get: l => agentName(l.agent_id) || '' },
    { header: 'Campaña', get: l => l.source_campaign || '' },
    { header: 'Fecha solicitada', get: l => l.preferred_date || '' },
    { header: 'Código de rastreo', get: l => l.tracking_code || '' },
    { header: 'Código de miembro', get: l => l.member_code || '' },
    { header: 'Estado', get: l => STATUS_LABEL[l.status] || l.status },
    { header: 'Mensaje al cliente', get: l => l.admin_note || '' },
  ], [agents, properties]);

  const fetchLeadRange = useCallback((range: DateRange) => fetchOwnerRange<RealtyLead>({
    table: 'realty_leads',
    ownerColumn: 'agency_profile_id',
    ownerId: user.id,
    dateColumn: 'created_at',
    isTimestamp: true,
    range,
    orderBy: [{ column: 'created_at', ascending: true }],
  }), [user?.id]);

  // Esta pestaña no recibe `showNotification`: se reutiliza su propia franja de
  // aviso en vez de cambiarle las props (y con ellas su punto de montaje).
  const notify = useCallback((message: string, _type: 'success' | 'error') => {
    setAlertMsg(message);
    setTimeout(() => setAlertMsg(null), 8000);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2" style={{ borderColor: ACCENT }} />
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up space-y-6 max-w-4xl mx-auto px-4 md:px-6 pb-32" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5" style={{ borderColor: `${ACCENT}26` }}>
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2 italic" style={{ fontFamily: TITLE_FONT }}>
            <FaUsers style={{ color: ACCENT }} /> CRM de Inversionistas
          </h2>
          <p className="text-sm text-white/40 mt-1">Leads calificados con atribución limpia por agente.</p>
        </div>
        <button onClick={exportCSV} disabled={filtered.length === 0}
          className="flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white rounded-xl disabled:opacity-30 italic" style={{ background: ACCENT, fontFamily: TITLE_FONT }}>
          <FaDownload /> Exportar CSV
        </button>
      </div>

      {alertMsg && (
        <div className="p-4 text-sm font-bold rounded-xl flex items-center justify-between animate-bounce"
          style={{ background: `${ACCENT}1a`, border: `1px solid ${ACCENT}4d`, color: ACCENT_LIGHT }}>
          <span>{alertMsg}</span>
          <button onClick={() => setAlertMsg(null)} className="opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Leads', value: leads.length, icon: <FaUsers /> },
          { label: 'Cerrados', value: leads.filter(l => l.status === 'cerrado').length, icon: <FaMoneyBillWave /> },
          { label: 'Con agente', value: leads.filter(l => l.agent_id).length, icon: <FaUserTie /> },
        ].map(k => (
          <div key={k.label} className="bg-white/5 border border-white/5 rounded-xl p-4">
            <div className="text-lg" style={{ color: ACCENT_LIGHT }}>{k.icon}</div>
            <p className="text-2xl font-black text-white mt-1">{k.value}</p>
            <p className="text-[11px] text-white/40 uppercase tracking-widest font-bold mt-0.5">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Buscar + filtro por agente */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 flex-1">
          <FaSearch className="text-white/30" size={12} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar lead…"
            className="bg-transparent text-white text-sm focus:outline-none w-full placeholder-white/30" />
        </div>
        <select value={agentFilter} onChange={e => setAgentFilter(e.target.value)}
          className="bg-black/40 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none">
          <option value="all">Todos los agentes</option>
          <option value="__none__">Sin agente (agencia)</option>
          {agentList.map(a => <option key={a.id} value={a.id}>{a.name || a.agent_username}</option>)}
        </select>
      </div>

      {/* Agenda de visitas de hoy + recordatorio al cliente por WhatsApp */}
      <DailyAgendaPanel
        accent={ACCENT}
        noun="visita"
        rows={agendaRows}
        table="realty_leads"
      />

      {/* Descarga en Excel por rango de fechas */}
      <ExportRangePanel<RealtyLead>
        accent={ACCENT}
        noun="solicitudes"
        dateLabel="Fecha de solicitud"
        fileBase="solicitudes_inmobiliaria"
        sheetName="Solicitudes"
        localRows={leads}
        getDate={l => (l.created_at || '').slice(0, 10)}
        fetchRange={fetchLeadRange}
        columns={exportColumns}
        showNotification={notify}
        hint="Cotizaciones, visitas y compras con su cliente, presupuesto, forma de pago, propiedad y agente."
      />

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-white/30">
          <p className="text-4xl mb-3">🔥</p>
          <p className="text-sm">Aún no hay leads{search || agentFilter !== 'all' ? ' con este filtro' : ''}. Cuando alguien cotice, agende o compre desde tu perfil, aparecerá aquí.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map(l => {
            const prop = l.property_id ? properties[l.property_id] : null;
            const aName = agentName(l.agent_id);
            return (
              <div key={l.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-white font-bold text-base truncate">{l.client_name || 'Lead sin nombre'}</h3>
                      {(() => { const rm = REQUEST_META[l.request_type || 'cotizacion'] || REQUEST_META.cotizacion; return (
                        <span className="text-[10px] font-black uppercase tracking-widest rounded-full px-2 py-0.5" style={{ color: rm.color, background: `${rm.color}1f`, border: `1px solid ${rm.color}44` }}>{rm.label}</span>
                      ); })()}
                      {l.tracking_code && (
                        <span className="text-[10px] font-mono font-black tracking-widest rounded-md px-2 py-0.5 text-white/70 bg-black/40 border border-white/10">{l.tracking_code}</span>
                      )}
                      {aName ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest rounded-full px-2 py-0.5"
                          style={{ color: ACCENT_LIGHT, background: `${ACCENT}26`, border: `1px solid ${ACCENT}4d` }}>
                          <FaUserTie size={8} /> {aName}
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold uppercase tracking-widest rounded-full px-2 py-0.5 text-white/40 bg-white/5">Agencia</span>
                      )}
                      {l.member_code && (
                        <span className="text-[10px] font-mono font-bold rounded-md px-2 py-0.5" style={{ color: ACCENT_LIGHT, background: `${ACCENT}14` }}>{l.member_code}</span>
                      )}
                      {l.source_campaign && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-0.5 text-white/50 bg-white/5">
                          <FaBullhorn size={8} /> {l.source_campaign}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-white/50">
                      {l.client_phone && <span>{l.client_phone}</span>}
                      {l.client_email && <span>{l.client_email}</span>}
                      <span className="text-white/30">{new Date(l.created_at || '').toLocaleDateString()}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      {l.payment_method && (
                        <span className="text-[10px] font-bold rounded-lg px-2 py-1 flex items-center gap-1" style={{ color: '#4ade80', background: 'rgba(74,222,128,0.1)' }}>
                          <FaMoneyBillWave size={9} /> {l.payment_method}
                        </span>
                      )}
                      {l.budget_range && <span className="text-[10px] font-bold rounded-lg px-2 py-1 text-white/60 bg-white/5">{l.budget_range}</span>}
                      {prop && (
                        <span className="text-[10px] font-bold rounded-lg px-2 py-1 flex items-center gap-1" style={{ color: ACCENT_LIGHT, background: `${ACCENT}14` }}>
                          <FaBuilding size={9} /> {prop.title}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {l.client_phone && (
                      <a href={`https://wa.me/${l.client_phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
                        className="w-8 h-8 rounded-lg bg-[#25D366]/10 border border-[#25D366]/20 text-[#25D366] flex items-center justify-center hover:bg-[#25D366]/20 transition" title="WhatsApp">
                        <FaWhatsapp size={13} />
                      </a>
                    )}
                    {l.client_email && (
                      <a href={`mailto:${l.client_email}`}
                        className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 text-white/50 flex items-center justify-center hover:text-white transition" title="Email">
                        <FaEnvelope size={12} />
                      </a>
                    )}
                    <button onClick={() => handleDelete(l.id)}
                      className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center hover:bg-red-500/20 transition" title="Eliminar">
                      <FaTrash size={11} />
                    </button>
                  </div>
                </div>
                {l.preferred_date && (
                  <p className="text-[11px] text-white/50 mt-2">📅 Fecha solicitada: <span className="text-white/80 font-bold">{l.preferred_date}</span></p>
                )}
                {/* Pipeline de estado */}
                <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-white/5">
                  {STATUSES.map(s => (
                    <button key={s} onClick={() => updateStatus(l.id, s)}
                      className="text-[10px] font-bold uppercase tracking-wider rounded-lg px-2.5 py-1 transition border"
                      style={l.status === s
                        ? { background: STATUS_COLOR[s], color: '#160600', borderColor: STATUS_COLOR[s] }
                        : { background: 'transparent', color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.1)' }}>
                      {STATUS_LABEL[s] || s}
                    </button>
                  ))}
                </div>
                {/* Mensaje al cliente (visible en su rastreador) */}
                <div className="mt-3">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-white/40">Mensaje al cliente (lo ve al rastrear)</label>
                  <div className="flex gap-2 mt-1">
                    <input
                      value={noteDrafts[l.id] ?? l.admin_note ?? ''}
                      onChange={e => setNoteDrafts(prev => ({ ...prev, [l.id]: e.target.value }))}
                      placeholder="Ej. Te contactaremos hoy para coordinar la visita."
                      className="flex-1 text-white text-sm rounded-lg px-3 py-2 focus:outline-none placeholder-gray-600 border" style={{ background: `${ACCENT}0d`, borderColor: `${ACCENT}26` }} />
                    <button onClick={() => saveNote(l.id)}
                      disabled={savingNote === l.id || (noteDrafts[l.id] ?? l.admin_note ?? '') === (l.admin_note ?? '')}
                      className="shrink-0 px-3 rounded-lg text-white text-xs font-black uppercase disabled:opacity-30" style={{ background: ACCENT }}>
                      {savingNote === l.id ? '…' : 'Enviar'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default RealtyLeadsTab;
