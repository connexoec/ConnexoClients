import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MemberPlanSection } from '../MemberPlanSection';
import { useSubscriptionOptions } from '../../hooks/useSubscriptionOptions';
import { supabase } from '../../src/lib/supabase';
import {
  FaCrown, FaUserPlus, FaTrash, FaStar, FaPhone, FaEnvelope,
  FaWhatsapp, FaUsers, FaPercent, FaSave, FaCut,
} from 'react-icons/fa';

interface BarberClient {
  id: string;
  barber_id: string;
  name?: string;
  email?: string;
  phone?: string;
  is_vip: boolean;
  discount_percent: number;
  notes?: string;
  benefits?: string;
  source: 'club_barber' | 'manual';
  visits: number;
  stamps: number;
  member_code?: string;
  created_at: string;
}

const SOURCE_BADGE: Record<string, { label: string; color: string }> = {
  club_barber: { label: '💈 Club Barber', color: 'text-[#ffa35d] bg-[#ffa35d]/10 border-[#ffa35d]/25' },
  manual:      { label: '✍️ Manual',      color: 'text-blue-400 bg-blue-500/10 border-blue-500/25' },
};

let barberAudioCtx: AudioContext | null = null;
const playClientPing = () => {
  if (typeof window === 'undefined') return;
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  if (!AC) return;
  if (!barberAudioCtx) { try { barberAudioCtx = new AC(); } catch { return; } }
  const ctx = barberAudioCtx;
  const doPlay = () => {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
      osc.start(); osc.stop(ctx.currentTime + 0.22);
    } catch {}
  };
  if (ctx.state === 'suspended') ctx.resume().then(doPlay).catch(() => {}); else doPlay();
};

export const BarberLoyaltyTab: React.FC<{ user: any }> = ({ user }) => {
  const planOptions = useSubscriptionOptions(user?.id, "barber");
  const [clients, setClients] = useState<BarberClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'vip' | 'club_barber'>('all');
  const [adding, setAdding] = useState(false);
  const [newClient, setNewClient] = useState({ name: '', phone: '', email: '', notes: '' });
  const [alertMsg, setAlertMsg] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { discount_percent: number; notes: string; benefits: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [stampingId, setStampingId] = useState<string | null>(null);
  const [stampsReward, setStampsReward] = useState('');
  const [savingReward, setSavingReward] = useState(false);

  const knownIdsRef = useRef<Set<string>>(new Set());
  const initialisedRef = useRef(false);

  useEffect(() => {
    if (!user?.id) return;
    supabase.from('profiles').select('stampsReward').eq('id', user.id).single()
      .then(({ data }) => { if (data?.stampsReward) setStampsReward(data.stampsReward); });
  }, [user?.id]);

  const saveReward = async () => {
    if (!user?.id) return;
    setSavingReward(true);
    await supabase.from('profiles').update({ stampsReward: stampsReward.trim() || null }).eq('id', user.id);
    setSavingReward(false);
  };

  const giveStamp = async (c: BarberClient) => {
    if (stampingId) return;
    setStampingId(c.id);
    const newStamps = Math.min((c.stamps || 0) + 1, 10);
    try {
      const { error } = await supabase.from('barber_clients').update({ stamps: newStamps }).eq('id', c.id);
      if (error) throw error;
      setClients(prev => prev.map(x => x.id === c.id ? { ...x, stamps: newStamps } : x));
    } catch (err: any) {
      alert(`Error: ${err?.message}`);
    } finally {
      setStampingId(null);
    }
  };

  const resetStamps = async (c: BarberClient) => {
    if (!window.confirm(`¿Reiniciar los sellos de ${c.name || 'este cliente'} a 0?`)) return;
    await supabase.from('barber_clients').update({ stamps: 0 }).eq('id', c.id);
    setClients(prev => prev.map(x => x.id === c.id ? { ...x, stamps: 0 } : x));
  };

  const fetchClients = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('barber_clients')
        .select('*')
        .eq('barber_id', user.id)
        .order('is_vip', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      const list = (data ?? []) as BarberClient[];

      if (initialisedRef.current) {
        const fresh = list.filter(c => !knownIdsRef.current.has(c.id));
        if (fresh.length > 0) {
          const n = fresh[0];
          playClientPing();
          setAlertMsg(`💈 Nuevo cliente: ${n.name || n.phone || n.email || 'cliente'}${n.source === 'club_barber' ? ' (Club Barber)' : ''}`);
          setTimeout(() => setAlertMsg(null), 7000);
        }
      }
      knownIdsRef.current = new Set(list.map(c => c.id));
      initialisedRef.current = true;
      setClients(list);
    } catch (err: any) {
      console.error('BarberLoyaltyTab fetch error:', err?.message ?? err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    const onGesture = () => { if (barberAudioCtx?.state === 'suspended') barberAudioCtx.resume().catch(() => {}); };
    window.addEventListener('pointerdown', onGesture);
    window.addEventListener('keydown', onGesture);
    return () => {
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    fetchClients();
    const channel = supabase
      .channel(`barber_clients_${user.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'barber_clients', filter: `barber_id=eq.${user.id}` },
        () => fetchClients())
      .subscribe();
    const poll = setInterval(fetchClients, 12000);
    const onFocus = () => { if (document.visibilityState !== 'hidden') fetchClients(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [user?.id, fetchClients]);

  const handleAdd = async () => {
    if (!newClient.name.trim() && !newClient.phone.trim()) {
      alert('Indica al menos el nombre o el teléfono.');
      return;
    }
    try {
      const { error } = await supabase.from('barber_clients').insert({
        barber_id: user.id,
        name: newClient.name.trim() || null,
        phone: newClient.phone.trim() || null,
        email: newClient.email.trim() || null,
        notes: newClient.notes.trim() || null,
        source: 'manual',
      });
      if (error) throw error;
      setNewClient({ name: '', phone: '', email: '', notes: '' });
      setAdding(false);
      fetchClients();
    } catch (err: any) {
      alert(`No se pudo agregar: ${err?.message ?? err}`);
    }
  };

  const toggleVip = async (c: BarberClient) => {
    try {
      const { error } = await supabase.from('barber_clients')
        .update({ is_vip: !c.is_vip }).eq('id', c.id);
      if (error) throw error;
      setClients(prev => prev.map(x => x.id === c.id ? { ...x, is_vip: !c.is_vip } : x));
    } catch (err: any) {
      alert(`Error: ${err?.message ?? err}`);
    }
  };

  const saveDraft = async (c: BarberClient) => {
    const draft = drafts[c.id] ?? { discount_percent: c.discount_percent, notes: c.notes ?? '', benefits: c.benefits ?? '' };
    setSavingId(c.id);
    try {
      const { error } = await supabase.from('barber_clients')
        .update({
          discount_percent: Math.max(0, Math.min(100, Number(draft.discount_percent) || 0)),
          notes: draft.notes.trim() || null,
          benefits: draft.benefits.trim() || null,
        })
        .eq('id', c.id);
      if (error) throw error;
      setClients(prev => prev.map(x => x.id === c.id
        ? { ...x, discount_percent: Number(draft.discount_percent) || 0, notes: draft.notes, benefits: draft.benefits } : x));
      setDrafts(prev => { const n = { ...prev }; delete n[c.id]; return n; });
    } catch (err: any) {
      alert(`Error al guardar: ${err?.message ?? err}`);
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Eliminar este cliente de tu lista?')) return;
    try {
      const { error } = await supabase.from('barber_clients').delete().eq('id', id);
      if (error) throw error;
      setClients(prev => prev.filter(x => x.id !== id));
    } catch (err: any) {
      alert(`Error al eliminar: ${err?.message ?? err}`);
    }
  };

  const setDraft = (id: string, patch: Partial<{ discount_percent: number; notes: string; benefits: string }>, base: BarberClient) => {
    setDrafts(prev => ({
      ...prev,
      [id]: { discount_percent: base.discount_percent, notes: base.notes ?? '', benefits: base.benefits ?? '', ...prev[id], ...patch },
    }));
  };

  const filtered = clients.filter(c =>
    filter === 'all' ? true : filter === 'vip' ? c.is_vip : c.source === 'club_barber');

  const vipCount = clients.filter(c => c.is_vip).length;
  const clubCount = clients.filter(c => c.source === 'club_barber').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#ffa35d]" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up space-y-6 max-w-4xl mx-auto px-4 md:px-6 pb-32"
         style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#ffa35d]/15 pb-5">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2">
            <FaCut className="text-[#ffa35d] rotate-90" /> Clientes Fieles
          </h2>
          <p className="text-sm text-white/40 mt-1">
            Tus clientes VIP, recurrentes y del Club Barber — en un solo lugar.
          </p>
        </div>
        <button
          onClick={() => setAdding(a => !a)}
          className="flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white bg-[#ffa35d] hover:bg-[#e8902a] rounded-xl transition-all shadow-lg shadow-[#ffa35d]/15">
          <FaUserPlus /> {adding ? 'Cerrar' : 'Agregar cliente'}
        </button>
      </div>

      {/* Aviso de cliente nuevo */}
      {alertMsg && (
        <div className="p-4 bg-[#ffa35d]/10 border border-[#ffa35d]/30 text-[#ffa35d] text-sm font-bold rounded-xl flex items-center justify-between animate-bounce">
          <span>{alertMsg}</span>
          <button onClick={() => setAlertMsg(null)} className="text-[#ffa35d]/60 hover:text-[#ffa35d]">✕</button>
        </div>
      )}

      {/* Add form */}
      {adding && (
        <div className="bg-white/5 border border-[#ffa35d]/20 rounded-2xl p-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input value={newClient.name} onChange={e => setNewClient(p => ({ ...p, name: e.target.value }))}
              placeholder="Nombre" className="bg-black/40 border border-[#ffa35d]/20 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#ffa35d] placeholder-gray-600" />
            <input value={newClient.phone} onChange={e => setNewClient(p => ({ ...p, phone: e.target.value }))}
              placeholder="Teléfono / WhatsApp" className="bg-black/40 border border-[#ffa35d]/20 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#ffa35d] placeholder-gray-600" />
            <input value={newClient.email} onChange={e => setNewClient(p => ({ ...p, email: e.target.value }))}
              placeholder="Email" className="bg-black/40 border border-[#ffa35d]/20 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#ffa35d] placeholder-gray-600" />
            <input value={newClient.notes} onChange={e => setNewClient(p => ({ ...p, notes: e.target.value }))}
              placeholder="Notas (ej. corte favorito, turno habitual)" className="bg-black/40 border border-[#ffa35d]/20 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#ffa35d] placeholder-gray-600" />
          </div>
          <button onClick={handleAdd}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#ffa35d] hover:bg-[#e8902a] text-white text-xs font-black uppercase tracking-wider transition-all">
            Guardar cliente
          </button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Clientes', value: clients.length, icon: <FaUsers /> },
          { label: 'VIP', value: vipCount, icon: <FaCrown /> },
          { label: 'Club Barber', value: clubCount, icon: <FaCut className="rotate-90" /> },
        ].map(k => (
          <div key={k.label} className="bg-white/5 border border-white/5 rounded-xl p-4">
            <div className="text-[#ffa35d] text-lg">{k.icon}</div>
            <p className="text-2xl font-black text-white mt-1">{k.value}</p>
            <p className="text-[11px] text-white/40 uppercase tracking-widest font-bold mt-0.5">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Recompensa de sellos */}
      <div className="bg-[#ffa35d]/5 border border-[#ffa35d]/20 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <FaStar className="text-[#ffa35d]" />
          <p className="text-sm font-black text-[#ffa35d] uppercase tracking-wider font-tomorrow">Recompensa al completar 10 sellos</p>
        </div>
        <p className="text-[11px] text-white/40 mb-3 leading-relaxed">
          Define qué obtiene el cliente cuando llega a 10 sellos. Tus clientes verán este texto en su tarjeta.
        </p>
        <div className="flex gap-3">
          <input
            value={stampsReward}
            onChange={e => setStampsReward(e.target.value)}
            placeholder="Ej: Un corte gratis, 50% de descuento en tu próxima visita…"
            className="flex-1 bg-black/40 border border-[#ffa35d]/20 text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#ffa35d]/50 placeholder-white/20"
          />
          <button onClick={saveReward} disabled={savingReward}
            className="px-4 py-2.5 rounded-xl bg-[#ffa35d] text-black text-xs font-black uppercase tracking-wider disabled:opacity-50 transition-all">
            {savingReward ? '...' : 'Guardar'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {([['all', 'Todos'], ['vip', 'VIP'], ['club_barber', 'Club Barber']] as const).map(([f, label]) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
              filter === f ? 'bg-[#ffa35d] text-white' : 'bg-white/5 text-white/50 hover:text-white border border-white/10'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-white/30">
          <p className="text-4xl mb-3">💈</p>
          <p className="text-sm">Aún no hay clientes{filter !== 'all' ? ' en este filtro' : ''}. Cuando alguien se una al Club Barber, aparecerá aquí.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(c => {
            const draft = drafts[c.id];
            const badge = SOURCE_BADGE[c.source] ?? SOURCE_BADGE.manual;
            const dirty = !!draft && (draft.discount_percent !== c.discount_percent || (draft.notes ?? '') !== (c.notes ?? '') || (draft.benefits ?? '') !== (c.benefits ?? ''));
            return (
              <div key={c.id}
                className={`rounded-2xl border p-4 transition-all ${c.is_vip ? 'bg-gradient-to-br from-[#ffa35d]/10 to-transparent border-[#ffa35d]/30' : 'bg-white/[0.03] border-white/8'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-white font-bold text-base truncate">{c.name || 'Cliente sin nombre'}</h3>
                      {c.is_vip && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-[#ffa35d] bg-[#ffa35d]/15 border border-[#ffa35d]/30 rounded-full px-2 py-0.5">
                          <FaCrown size={9} /> VIP
                        </span>
                      )}
                      {c.member_code && (
                        <span className="text-[10px] font-mono font-black tracking-widest text-[#ffa35d] bg-black/40 border border-[#ffa35d]/20 rounded-md px-2 py-0.5" title="Código de miembro">
                          {c.member_code}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-white/50">
                      {c.phone && <span className="flex items-center gap-1"><FaPhone size={9} /> {c.phone}</span>}
                      {c.email && <span className="flex items-center gap-1"><FaEnvelope size={9} /> {c.email}</span>}
                      <span className="flex items-center gap-1"><FaStar size={9} className="text-[#ffa35d]/60" /> {c.visits} visita{c.visits !== 1 ? 's' : ''}</span>
                    </div>
                    {/* Stamps progress */}
                    <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                      <div className="flex gap-0.5">
                        {Array.from({ length: 10 }, (_, i) => (
                          <span key={i} className={`text-sm leading-none ${i < (c.stamps || 0) ? 'text-[#ffa35d]' : 'text-white/15'}`}>★</span>
                        ))}
                      </div>
                      <span className="text-[10px] text-white/40 font-mono">{c.stamps || 0}/10</span>
                      {(c.stamps || 0) >= 10 && (
                        <span className="text-[10px] bg-[#ffa35d]/20 text-[#ffa35d] px-2 py-0.5 rounded-full font-black uppercase tracking-wider">¡Recompensa lista!</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                    {c.phone && (
                      <a href={`https://wa.me/${c.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
                        className="w-8 h-8 rounded-lg bg-[#25D366]/10 border border-[#25D366]/20 text-[#25D366] flex items-center justify-center hover:bg-[#25D366]/20 transition" title="WhatsApp">
                        <FaWhatsapp size={13} />
                      </a>
                    )}
                    <button onClick={() => toggleVip(c)}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition border ${c.is_vip ? 'bg-[#ffa35d]/20 border-[#ffa35d]/40 text-[#ffa35d]' : 'bg-white/5 border-white/10 text-white/40 hover:text-[#ffa35d]'}`}
                      title={c.is_vip ? 'Quitar VIP' : 'Marcar VIP'}>
                      <FaCrown size={12} />
                    </button>
                    <button
                      onClick={() => (c.stamps || 0) >= 10 ? resetStamps(c) : giveStamp(c)}
                      disabled={stampingId === c.id}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition border ${
                        (c.stamps || 0) >= 10
                          ? 'bg-[#ffa35d]/20 border-[#ffa35d]/40 text-[#ffa35d] hover:bg-[#ffa35d]/30'
                          : 'bg-white/5 border-white/10 text-white/60 hover:bg-[#ffa35d]/15 hover:text-[#ffa35d] hover:border-[#ffa35d]/30'
                      } disabled:opacity-40`}
                      title={(c.stamps || 0) >= 10 ? 'Reiniciar sellos' : 'Dar un sello'}
                    >
                      <FaStar size={9} />
                      {(c.stamps || 0) >= 10 ? 'Reiniciar' : stampingId === c.id ? '...' : '+Sello'}
                    </button>
                    <button onClick={() => handleDelete(c.id)}
                      className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center hover:bg-red-500/20 transition" title="Eliminar">
                      <FaTrash size={11} />
                    </button>
                  </div>
                </div>

                {/* Descuento + notas */}
                <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr_auto] gap-2 mt-3 pt-3 border-t border-white/5 items-center">
                  <div className="flex items-center gap-2 bg-black/30 rounded-lg px-3 py-2 border border-white/5">
                    <FaPercent size={10} className="text-[#ffa35d]" />
                    <input type="number" min={0} max={100}
                      value={draft ? draft.discount_percent : c.discount_percent}
                      onChange={e => setDraft(c.id, { discount_percent: Number(e.target.value) }, c)}
                      className="w-full bg-transparent text-white text-sm focus:outline-none" />
                    <span className="text-[10px] text-white/40 uppercase">desc.</span>
                  </div>
                  <input
                    value={draft ? draft.notes : (c.notes ?? '')}
                    onChange={e => setDraft(c.id, { notes: e.target.value }, c)}
                    placeholder="Notas internas (ej. corte favorito, viene los sábados…)"
                    className="bg-black/30 border border-white/5 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#ffa35d]/40 placeholder-gray-600" />
                  <button onClick={() => saveDraft(c)} disabled={!dirty || savingId === c.id}
                    className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-[#ffa35d] hover:bg-[#e8902a] disabled:opacity-30 text-white text-xs font-black uppercase tracking-wider transition-all">
                    <FaSave size={11} /> {savingId === c.id ? '...' : 'Guardar'}
                  </button>
                </div>

                {/* Beneficios visibles para el cliente */}
                <div className="mt-2">
                  <input
                    value={draft ? draft.benefits : (c.benefits ?? '')}
                    onChange={e => setDraft(c.id, { benefits: e.target.value }, c)}
                    placeholder="🎁 Beneficios que ve el cliente (ej. 10% en cera premium, servicio express los lunes…)"
                    className="w-full bg-[#ffa35d]/5 border border-[#ffa35d]/15 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#ffa35d]/40 placeholder-gray-500" />
                </div>

                <MemberPlanSection client={c as any} system="barber" ownerId={user?.id}
                  options={planOptions} accent="#ffa35d" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default BarberLoyaltyTab;
