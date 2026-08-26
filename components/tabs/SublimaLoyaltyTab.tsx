import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MemberPlanSection } from '../MemberPlanSection';
import { useSubscriptionOptions } from '../../hooks/useSubscriptionOptions';
import { supabase } from '../../src/lib/supabase';
import type { SublimaClient } from '../../types';
import {
  FaCrown, FaUserPlus, FaTrash, FaStar, FaPhone, FaEnvelope,
  FaWhatsapp, FaUsers, FaPercent, FaSave, FaBuilding,
} from 'react-icons/fa';

interface Props { user: any; }

const ACCENT = '#a3e635';
const ACCENT_LIGHT = '#d9f99d';
const ON_ACCENT = '#101403';
const TITLE_FONT = "'Tomorrow', sans-serif";

const TYPE_LABEL: Record<string, string> = { persona: 'Persona', empresa: 'Empresa', institucion: 'Institución' };

let clubAudioCtx: AudioContext | null = null;
const playPing = () => {
  if (typeof window === 'undefined') return;
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  if (!AC) return;
  if (!clubAudioCtx) { try { clubAudioCtx = new AC(); } catch { return; } }
  const ctx = clubAudioCtx;
  const doPlay = () => {
    try {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.13, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
      osc.start(); osc.stop(ctx.currentTime + 0.3);
    } catch {}
  };
  if (ctx.state === 'suspended') ctx.resume().then(doPlay).catch(() => {}); else doPlay();
};

export const SublimaLoyaltyTab: React.FC<Props> = ({ user }) => {
  const planOptions = useSubscriptionOptions(user?.id, "sublima");
  const [clients, setClients] = useState<SublimaClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'vip' | 'empresa'>('all');
  const [adding, setAdding] = useState(false);
  const [newClient, setNewClient] = useState({ name: '', company: '', phone: '', email: '', notes: '' });
  const [alertMsg, setAlertMsg] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { discount_percent: number; notes: string; benefits: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const knownIdsRef = useRef<Set<string>>(new Set());
  const initialisedRef = useRef(false);

  const fetchClients = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('sublima_clients').select('*').eq('factory_profile_id', user.id)
        .order('is_vip', { ascending: false }).order('created_at', { ascending: false });
      if (error) throw error;
      const list = (data ?? []) as SublimaClient[];
      if (initialisedRef.current) {
        const fresh = list.filter(c => !knownIdsRef.current.has(c.id));
        if (fresh.length > 0) {
          const n = fresh[0]; playPing();
          setAlertMsg(`🎉 Nuevo miembro: ${n.name || n.company || n.phone || n.email || 'cliente'}${n.source === 'club' ? ' (Club)' : ''}`);
          setTimeout(() => setAlertMsg(null), 7000);
        }
      }
      knownIdsRef.current = new Set(list.map(c => c.id));
      initialisedRef.current = true;
      setClients(list);
    } catch (err: any) {
      console.error('SublimaLoyaltyTab fetch error:', err?.message ?? err);
    } finally { setLoading(false); }
  }, [user?.id]);

  useEffect(() => {
    const onGesture = () => { if (clubAudioCtx?.state === 'suspended') clubAudioCtx.resume().catch(() => {}); };
    window.addEventListener('pointerdown', onGesture);
    window.addEventListener('keydown', onGesture);
    return () => { window.removeEventListener('pointerdown', onGesture); window.removeEventListener('keydown', onGesture); };
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    fetchClients();
    const channel = supabase.channel(`sublima_clients_${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sublima_clients', filter: `factory_profile_id=eq.${user.id}` }, () => fetchClients())
      .subscribe();
    const poll = setInterval(fetchClients, 12000);
    const onFocus = () => { if (document.visibilityState !== 'hidden') fetchClients(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => { supabase.removeChannel(channel); clearInterval(poll); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
  }, [user?.id, fetchClients]);

  const handleAdd = async () => {
    if (!newClient.name.trim() && !newClient.company.trim() && !newClient.phone.trim()) { alert('Indica al menos el nombre, la empresa o el teléfono.'); return; }
    try {
      const { error } = await supabase.from('sublima_clients').insert({
        factory_profile_id: user.id,
        name: newClient.name.trim() || null,
        company: newClient.company.trim() || null,
        client_type: newClient.company.trim() ? 'empresa' : 'persona',
        phone: newClient.phone.trim() || null,
        email: newClient.email.trim() || null,
        notes: newClient.notes.trim() || null,
        source: 'manual', member_code: `S-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      });
      if (error) throw error;
      setNewClient({ name: '', company: '', phone: '', email: '', notes: '' });
      setAdding(false); fetchClients();
    } catch (err: any) { alert(`No se pudo agregar: ${err?.message ?? err}`); }
  };

  const toggleVip = async (c: SublimaClient) => {
    try {
      const { error } = await supabase.from('sublima_clients').update({ is_vip: !c.is_vip }).eq('id', c.id);
      if (error) throw error;
      setClients(prev => prev.map(x => x.id === c.id ? { ...x, is_vip: !c.is_vip } : x));
    } catch (err: any) { alert(`Error: ${err?.message ?? err}`); }
  };

  const setDraft = (id: string, patch: Partial<{ discount_percent: number; notes: string; benefits: string }>, base: SublimaClient) => {
    setDrafts(prev => ({ ...prev, [id]: { discount_percent: base.discount_percent, notes: base.notes ?? '', benefits: base.benefits ?? '', ...prev[id], ...patch } }));
  };

  const saveDraft = async (c: SublimaClient) => {
    const draft = drafts[c.id] ?? { discount_percent: c.discount_percent, notes: c.notes ?? '', benefits: c.benefits ?? '' };
    setSavingId(c.id);
    try {
      const { error } = await supabase.from('sublima_clients').update({
        discount_percent: Math.max(0, Math.min(100, Number(draft.discount_percent) || 0)),
        notes: draft.notes.trim() || null, benefits: draft.benefits.trim() || null,
      }).eq('id', c.id);
      if (error) throw error;
      setClients(prev => prev.map(x => x.id === c.id ? { ...x, discount_percent: Number(draft.discount_percent) || 0, notes: draft.notes, benefits: draft.benefits } : x));
      setDrafts(prev => { const n = { ...prev }; delete n[c.id]; return n; });
    } catch (err: any) { alert(`Error al guardar: ${err?.message ?? err}`); }
    finally { setSavingId(null); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Eliminar este miembro del club?')) return;
    try {
      const { error } = await supabase.from('sublima_clients').delete().eq('id', id);
      if (error) throw error;
      setClients(prev => prev.filter(x => x.id !== id));
    } catch (err: any) { alert(`Error al eliminar: ${err?.message ?? err}`); }
  };

  const filtered = clients.filter(c => filter === 'all' ? true : filter === 'vip' ? c.is_vip : (c.client_type === 'empresa' || c.client_type === 'institucion'));
  const vipCount = clients.filter(c => c.is_vip).length;
  const bizCount = clients.filter(c => c.client_type === 'empresa' || c.client_type === 'institucion').length;
  const inpCls = "bg-black/40 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none placeholder-gray-600 w-full";

  if (loading) {
    return <div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2" style={{ borderColor: ACCENT }} /></div>;
  }

  return (
    <div className="animate-fade-in-up space-y-6 max-w-4xl mx-auto px-4 md:px-6 pb-32" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5" style={{ borderColor: `${ACCENT}26` }}>
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2" style={{ fontFamily: TITLE_FONT }}>
            <FaCrown style={{ color: ACCENT }} /> Club Mayorista
          </h2>
          <p className="text-sm text-white/40 mt-1">Tus clientes frecuentes, empresas e instituciones — con VIP, descuento y beneficios.</p>
        </div>
        <button onClick={() => setAdding(a => !a)} className="flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl" style={{ background: ACCENT, color: ON_ACCENT, fontFamily: TITLE_FONT }}>
          <FaUserPlus /> {adding ? 'Cerrar' : 'Agregar cliente'}
        </button>
      </div>

      {alertMsg && (
        <div className="p-4 text-sm font-bold rounded-xl flex items-center justify-between animate-bounce" style={{ background: `${ACCENT}1a`, border: `1px solid ${ACCENT}4d`, color: ACCENT_LIGHT }}>
          <span>{alertMsg}</span>
          <button onClick={() => setAlertMsg(null)} className="opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {adding && (
        <div className="bg-white/5 border rounded-2xl p-5 space-y-3" style={{ borderColor: `${ACCENT}33` }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input value={newClient.name} onChange={e => setNewClient(p => ({ ...p, name: e.target.value }))} placeholder="Nombre" className={inpCls} />
            <input value={newClient.company} onChange={e => setNewClient(p => ({ ...p, company: e.target.value }))} placeholder="Empresa / Institución" className={inpCls} />
            <input value={newClient.phone} onChange={e => setNewClient(p => ({ ...p, phone: e.target.value }))} placeholder="Teléfono / WhatsApp" className={inpCls} />
            <input value={newClient.email} onChange={e => setNewClient(p => ({ ...p, email: e.target.value }))} placeholder="Email" className={inpCls} />
            <input value={newClient.notes} onChange={e => setNewClient(p => ({ ...p, notes: e.target.value }))} placeholder="Notas (ej. uniformes cada semestre)" className={`${inpCls} sm:col-span-2`} />
          </div>
          <button onClick={handleAdd} className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider" style={{ background: ACCENT, color: ON_ACCENT }}>Guardar</button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Clientes', value: clients.length, icon: <FaUsers /> },
          { label: 'VIP', value: vipCount, icon: <FaCrown /> },
          { label: 'Empresas', value: bizCount, icon: <FaBuilding /> },
        ].map(k => (
          <div key={k.label} className="bg-white/5 border border-white/5 rounded-xl p-4">
            <div className="text-lg" style={{ color: ACCENT_LIGHT }}>{k.icon}</div>
            <p className="text-2xl font-black text-white mt-1">{k.value}</p>
            <p className="text-[11px] text-white/40 uppercase tracking-widest font-bold mt-0.5">{k.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {([['all', 'Todos'], ['vip', 'VIP'], ['empresa', 'Empresas']] as const).map(([f, label]) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${filter === f ? '' : 'bg-white/5 text-white/50 hover:text-white border border-white/10'}`}
            style={filter === f ? { background: ACCENT, color: ON_ACCENT } : undefined}>{label}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-white/30"><p className="text-4xl mb-3">👥</p><p className="text-sm">Aún no hay clientes. Cuando alguien se una al club o haga un pedido desde tu perfil, aparecerá aquí.</p></div>
      ) : (
        <div className="space-y-3">
          {filtered.map(c => {
            const draft = drafts[c.id];
            const dirty = !!draft && (draft.discount_percent !== c.discount_percent || (draft.notes ?? '') !== (c.notes ?? '') || (draft.benefits ?? '') !== (c.benefits ?? ''));
            return (
              <div key={c.id} className="rounded-2xl border p-4 transition-all"
                style={c.is_vip
                  ? { background: `linear-gradient(135deg, ${ACCENT}14, transparent)`, borderColor: `${ACCENT}4d` }
                  : { background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-white font-bold text-base truncate">{c.name || c.company || 'Cliente sin nombre'}</h3>
                      {c.is_vip && <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest rounded-full px-2 py-0.5" style={{ color: ACCENT_LIGHT, background: `${ACCENT}26`, border: `1px solid ${ACCENT}4d` }}><FaCrown size={9} /> VIP</span>}
                      {c.member_code && <span className="text-[10px] font-mono font-black tracking-widest rounded-md px-2 py-0.5" style={{ color: ACCENT_LIGHT, background: 'rgba(0,0,0,0.4)', border: `1px solid ${ACCENT}33` }}>{c.member_code}</span>}
                      {(c.client_type === 'empresa' || c.client_type === 'institucion') && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest rounded-full px-2 py-0.5 text-white/60 bg-white/5 border border-white/10">
                          <FaBuilding size={8} /> {TYPE_LABEL[c.client_type] || c.client_type}
                        </span>
                      )}
                    </div>
                    {c.company && c.name && <p className="text-[12px] text-white/50 mt-0.5 truncate">{c.company}</p>}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-white/50">
                      {c.phone && <span className="flex items-center gap-1"><FaPhone size={9} /> {c.phone}</span>}
                      {c.email && <span className="flex items-center gap-1"><FaEnvelope size={9} /> {c.email}</span>}
                      <span className="flex items-center gap-1"><FaStar size={9} style={{ color: `${ACCENT}99` }} /> {c.orders_count} pedido{c.orders_count !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {c.phone && (
                      <a href={`https://wa.me/${c.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-lg bg-[#25D366]/10 border border-[#25D366]/20 text-[#25D366] flex items-center justify-center hover:bg-[#25D366]/20 transition" title="WhatsApp"><FaWhatsapp size={13} /></a>
                    )}
                    <button onClick={() => toggleVip(c)} className="w-8 h-8 rounded-lg flex items-center justify-center transition border"
                      style={c.is_vip ? { background: `${ACCENT}33`, borderColor: `${ACCENT}66`, color: ACCENT_LIGHT } : { background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}
                      title={c.is_vip ? 'Quitar VIP' : 'Marcar VIP'}><FaCrown size={12} /></button>
                    <button onClick={() => handleDelete(c.id)} className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center hover:bg-red-500/20 transition" title="Eliminar"><FaTrash size={11} /></button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr_auto] gap-2 mt-3 pt-3 border-t border-white/5 items-center">
                  <div className="flex items-center gap-2 bg-black/30 rounded-lg px-3 py-2 border border-white/5">
                    <FaPercent size={10} style={{ color: ACCENT }} />
                    <input type="number" min={0} max={100} value={draft ? draft.discount_percent : c.discount_percent}
                      onChange={e => setDraft(c.id, { discount_percent: Number(e.target.value) }, c)} className="w-full bg-transparent text-white text-sm focus:outline-none" />
                    <span className="text-[10px] text-white/40 uppercase">desc.</span>
                  </div>
                  <input value={draft ? draft.notes : (c.notes ?? '')} onChange={e => setDraft(c.id, { notes: e.target.value }, c)}
                    placeholder="Notas internas (ej. pide 300 camisetas por temporada…)" className="bg-black/30 border border-white/5 text-white text-sm rounded-lg px-3 py-2 focus:outline-none placeholder-gray-600" />
                  <button onClick={() => saveDraft(c)} disabled={!dirty || savingId === c.id}
                    className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg disabled:opacity-30 text-xs font-black uppercase tracking-wider transition-all" style={{ background: ACCENT, color: ON_ACCENT }}>
                    <FaSave size={11} /> {savingId === c.id ? '...' : 'Guardar'}
                  </button>
                </div>

                <div className="mt-2">
                  <input value={draft ? draft.benefits : (c.benefits ?? '')} onChange={e => setDraft(c.id, { benefits: e.target.value }, c)}
                    placeholder="🎁 Beneficios que ve el cliente (ej. Envío gratis desde 100 uds., prioridad en producción…)"
                    className="w-full text-white text-sm rounded-lg px-3 py-2 focus:outline-none placeholder-gray-500 border" style={{ background: `${ACCENT}0d`, borderColor: `${ACCENT}26` }} />
                </div>

                <MemberPlanSection client={c as any} system="sublima" ownerId={user?.id}
                  options={planOptions} accent="#c9a86a" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SublimaLoyaltyTab;
