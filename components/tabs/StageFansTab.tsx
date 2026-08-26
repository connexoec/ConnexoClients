import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { MemberPlanSection } from '../MemberPlanSection';
import { useSubscriptionOptions } from '../../hooks/useSubscriptionOptions';
import { supabase } from '../../src/lib/supabase';
import {
  FaHeart, FaTrash, FaPhone, FaEnvelope, FaWhatsapp, FaUsers,
  FaBullhorn, FaDownload, FaSearch,
} from 'react-icons/fa';

interface Fan {
  id: string;
  profile_id: string;
  name?: string;
  email?: string;
  phone?: string;
  source_campaign?: string;
  created_at: string;
}

const ACCENT = '#22d3ee';

let fanAudioCtx: AudioContext | null = null;
const playFanPing = () => {
  if (typeof window === 'undefined') return;
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  if (!AC) return;
  if (!fanAudioCtx) { try { fanAudioCtx = new AC(); } catch { return; } }
  const ctx = fanAudioCtx;
  const doPlay = () => {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      osc.start(); osc.stop(ctx.currentTime + 0.25);
    } catch {}
  };
  if (ctx.state === 'suspended') ctx.resume().then(doPlay).catch(() => {}); else doPlay();
};

export const StageFansTab: React.FC<{ user: any }> = ({ user }) => {
  const planOptions = useSubscriptionOptions(user?.id, "products");
  const [fans, setFans] = useState<Fan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [campaignFilter, setCampaignFilter] = useState<string>('all');
  const [alertMsg, setAlertMsg] = useState<string | null>(null);

  const knownIdsRef = useRef<Set<string>>(new Set());
  const initialisedRef = useRef(false);

  const fetchFans = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('stage_fans')
        .select('*')
        .eq('profile_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const list = (data ?? []) as Fan[];

      if (initialisedRef.current) {
        const fresh = list.filter(f => !knownIdsRef.current.has(f.id));
        if (fresh.length > 0) {
          const n = fresh[0];
          playFanPing();
          setAlertMsg(`💜 Nuevo fan: ${n.name || n.email || n.phone || 'fan'}${n.source_campaign ? ` (campaña: ${n.source_campaign})` : ''}`);
          setTimeout(() => setAlertMsg(null), 7000);
        }
      }
      knownIdsRef.current = new Set(list.map(f => f.id));
      initialisedRef.current = true;
      setFans(list);
    } catch (err: any) {
      console.error('StageFansTab fetch error:', err?.message ?? err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    const onGesture = () => { if (fanAudioCtx?.state === 'suspended') fanAudioCtx.resume().catch(() => {}); };
    window.addEventListener('pointerdown', onGesture);
    window.addEventListener('keydown', onGesture);
    return () => {
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    fetchFans();
    const channel = supabase
      .channel(`stage_fans_${user.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'stage_fans', filter: `profile_id=eq.${user.id}` },
        () => fetchFans())
      .subscribe();
    const poll = setInterval(fetchFans, 12000);
    const onFocus = () => { if (document.visibilityState !== 'hidden') fetchFans(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [user?.id, fetchFans]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Eliminar este fan de tu base?')) return;
    try {
      const { error } = await supabase.from('stage_fans').delete().eq('id', id);
      if (error) throw error;
      setFans(prev => prev.filter(f => f.id !== id));
    } catch (err: any) {
      alert(`Error al eliminar: ${err?.message ?? err}`);
    }
  };

  const campaigns = useMemo(() => {
    const set = new Set<string>();
    fans.forEach(f => { if (f.source_campaign) set.add(f.source_campaign); });
    return Array.from(set);
  }, [fans]);

  const filtered = fans.filter(f => {
    if (campaignFilter !== 'all') {
      if (campaignFilter === '__none__' ? !!f.source_campaign : f.source_campaign !== campaignFilter) return false;
    }
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [f.name, f.email, f.phone, f.source_campaign].some(v => (v || '').toLowerCase().includes(q));
  });

  const exportCSV = () => {
    const rows = [['Nombre', 'Email', 'Teléfono', 'Campaña', 'Fecha']];
    filtered.forEach(f => rows.push([
      f.name || '', f.email || '', f.phone || '', f.source_campaign || '',
      new Date(f.created_at).toLocaleString(),
    ]));
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `fanbase_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2" style={{ borderColor: ACCENT }} />
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up space-y-6 max-w-4xl mx-auto px-4 md:px-6 pb-32"
         style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5" style={{ borderColor: `${ACCENT}26` }}>
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2">
            <FaHeart style={{ color: ACCENT }} /> Fan Base
          </h2>
          <p className="text-sm text-white/40 mt-1">
            Tu audiencia capturada desde el perfil. Exporta y conecta con tus fans.
          </p>
        </div>
        <button onClick={exportCSV} disabled={filtered.length === 0}
          className="flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-black rounded-xl transition-all disabled:opacity-30"
          style={{ background: ACCENT }}>
          <FaDownload /> Exportar CSV
        </button>
      </div>

      {alertMsg && (
        <div className="p-4 text-sm font-bold rounded-xl flex items-center justify-between animate-bounce"
          style={{ background: `${ACCENT}1a`, border: `1px solid ${ACCENT}4d`, color: ACCENT }}>
          <span>{alertMsg}</span>
          <button onClick={() => setAlertMsg(null)} className="opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Fans', value: fans.length, icon: <FaUsers /> },
          { label: 'Campañas', value: campaigns.length, icon: <FaBullhorn /> },
          { label: 'Con email', value: fans.filter(f => f.email).length, icon: <FaEnvelope /> },
        ].map(k => (
          <div key={k.label} className="bg-white/5 border border-white/5 rounded-xl p-4">
            <div className="text-lg" style={{ color: ACCENT }}>{k.icon}</div>
            <p className="text-2xl font-black text-white mt-1">{k.value}</p>
            <p className="text-[11px] text-white/40 uppercase tracking-widest font-bold mt-0.5">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Buscar + filtro campaña */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 flex-1">
          <FaSearch className="text-white/30" size={12} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar fan…"
            className="bg-transparent text-white text-sm focus:outline-none w-full placeholder-white/30" />
        </div>
        <select value={campaignFilter} onChange={e => setCampaignFilter(e.target.value)}
          className="bg-black/40 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none">
          <option value="all">Todas las campañas</option>
          <option value="__none__">Sin campaña</option>
          {campaigns.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-white/30">
          <p className="text-4xl mb-3">💜</p>
          <p className="text-sm">Aún no hay fans{search || campaignFilter !== 'all' ? ' con este filtro' : ''}. Cuando alguien se una al Fan Club desde tu perfil, aparecerá aquí.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map(f => (
            /* Se pasa de una fila a columna para que el plan de pago quepa
               debajo sin apretar los datos del fan ni los botones. */
            <div key={f.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-white font-bold text-base truncate">{f.name || 'Fan sin nombre'}</h3>
                  {(f as any).member_code && (
                    <span className="text-[10px] font-black uppercase tracking-widest rounded px-1.5 py-0.5"
                      style={{ color: ACCENT, background: `${ACCENT}1a`, border: `1px solid ${ACCENT}40` }}>
                      {(f as any).member_code}
                    </span>
                  )}
                  {f.source_campaign && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest rounded-full px-2 py-0.5"
                      style={{ color: ACCENT, background: `${ACCENT}26`, border: `1px solid ${ACCENT}4d` }}>
                      <FaBullhorn size={8} /> {f.source_campaign}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-white/50">
                  {f.phone && <span className="flex items-center gap-1"><FaPhone size={9} /> {f.phone}</span>}
                  {f.email && <span className="flex items-center gap-1"><FaEnvelope size={9} /> {f.email}</span>}
                  <span className="text-white/30">{new Date(f.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {f.phone && (
                  <a href={`https://wa.me/${f.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
                    className="w-8 h-8 rounded-lg bg-[#25D366]/10 border border-[#25D366]/20 text-[#25D366] flex items-center justify-center hover:bg-[#25D366]/20 transition" title="WhatsApp">
                    <FaWhatsapp size={13} />
                  </a>
                )}
                {f.email && (
                  <a href={`mailto:${f.email}`}
                    className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 text-white/50 flex items-center justify-center hover:text-white transition" title="Email">
                    <FaEnvelope size={12} />
                  </a>
                )}
                <button onClick={() => handleDelete(f.id)}
                  className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center hover:bg-red-500/20 transition" title="Eliminar">
                  <FaTrash size={11} />
                </button>
              </div>
            </div>

            <MemberPlanSection client={f as any} system="stage" ownerId={user?.id}
              options={planOptions} accent="#22d3ee" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default StageFansTab;
