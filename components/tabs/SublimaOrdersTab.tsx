import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../src/lib/supabase';
import type { SublimaOrder, SublimaOrderItem } from '../../types';
import {
  FaClipboardList, FaTrash, FaWhatsapp, FaEnvelope, FaSearch, FaDownload,
  FaBuilding, FaBullhorn, FaMoneyBillWave, FaFileInvoiceDollar,
} from 'react-icons/fa';

interface Props { user: any; }

const ACCENT = '#a3e635';
const ACCENT_LIGHT = '#d9f99d';
const ON_ACCENT = '#101403';
const TITLE_FONT = "'Tomorrow', sans-serif";

const STATUSES = ['recibido', 'cotizado', 'en_produccion', 'listo', 'entregado', 'cancelado'];
const STATUS_COLOR: Record<string, string> = {
  recibido: ACCENT_LIGHT, cotizado: '#38bdf8', en_produccion: '#fbbf24',
  listo: '#a78bfa', entregado: '#4ade80', cancelado: '#f87171',
};
const STATUS_LABEL: Record<string, string> = {
  recibido: 'recibido', cotizado: 'cotizado', en_produccion: 'en producción',
  listo: 'listo', entregado: 'entregado', cancelado: 'cancelado',
};
const REQUEST_META: Record<string, { label: string; color: string }> = {
  mayorista: { label: 'Mayorista', color: '#38bdf8' },
  muestra:   { label: 'Muestra',   color: '#a78bfa' },
};
const PAYMENTS = ['pendiente', 'anticipo', 'pagado'];
const PAYMENT_COLOR: Record<string, string> = { pendiente: '#f87171', anticipo: '#fbbf24', pagado: '#4ade80' };

const fmt = (p?: number | null) =>
  typeof p === 'number' && !Number.isNaN(p) ? `$${Number(p).toLocaleString('es-EC', { minimumFractionDigits: 2 })}` : '—';

let orderAudioCtx: AudioContext | null = null;
const playOrderPing = () => {
  if (typeof window === 'undefined') return;
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  if (!AC) return;
  if (!orderAudioCtx) { try { orderAudioCtx = new AC(); } catch { return; } }
  const ctx = orderAudioCtx;
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

export const SublimaOrdersTab: React.FC<Props> = ({ user }) => {
  const [orders, setOrders] = useState<SublimaOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [alertMsg, setAlertMsg] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [quoteDrafts, setQuoteDrafts] = useState<Record<string, string>>({});
  const [savingNote, setSavingNote] = useState<string | null>(null);
  const [savingQuote, setSavingQuote] = useState<string | null>(null);

  const knownIdsRef = useRef<Set<string>>(new Set());
  const initialisedRef = useRef(false);

  const fetchAll = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('sublima_orders').select('*').eq('factory_profile_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const list = (data ?? []) as SublimaOrder[];

      if (initialisedRef.current) {
        const fresh = list.filter(o => !knownIdsRef.current.has(o.id));
        if (fresh.length > 0) {
          const n = fresh[0];
          playOrderPing();
          setAlertMsg(`🧵 Nuevo pedido: ${n.client_name || n.client_phone || n.client_email || 'cliente'}${n.client_company ? ` (${n.client_company})` : ''}`);
          setTimeout(() => setAlertMsg(null), 8000);
        }
      }
      knownIdsRef.current = new Set(list.map(o => o.id));
      initialisedRef.current = true;
      setOrders(list);
    } catch (err: any) {
      console.error('SublimaOrdersTab fetch error:', err?.message ?? err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    const onGesture = () => { if (orderAudioCtx?.state === 'suspended') orderAudioCtx.resume().catch(() => {}); };
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
      .channel(`sublima_orders_${user.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'sublima_orders', filter: `factory_profile_id=eq.${user.id}` },
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
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
    try {
      const { error } = await supabase.from('sublima_orders').update({ status }).eq('id', id);
      if (error) throw error;
    } catch (err: any) { console.error(err); }
  };

  const updatePayment = async (id: string, payment_status: string) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, payment_status } : o));
    try {
      const { error } = await supabase.from('sublima_orders').update({ payment_status }).eq('id', id);
      if (error) throw error;
    } catch (err: any) { console.error(err); }
  };

  const saveQuote = async (o: SublimaOrder) => {
    const raw = (quoteDrafts[o.id] ?? '').trim();
    const value = raw === '' ? null : Number(raw);
    if (raw !== '' && Number.isNaN(value)) { alert('Escribe un monto válido.'); return; }
    setSavingQuote(o.id);
    try {
      // Al poner la cotización, si el pedido sigue "recibido" avanza solo a "cotizado".
      const patch: any = { quoted_total: value };
      if (value != null && o.status === 'recibido') patch.status = 'cotizado';
      const { error } = await supabase.from('sublima_orders').update(patch).eq('id', o.id);
      if (error) throw error;
      setOrders(prev => prev.map(x => x.id === o.id ? { ...x, quoted_total: value, status: patch.status || x.status } : x));
      setQuoteDrafts(prev => { const n = { ...prev }; delete n[o.id]; return n; });
    } catch (err: any) { alert(`Error: ${err?.message ?? err}`); }
    finally { setSavingQuote(null); }
  };

  const saveNote = async (id: string) => {
    const note = (noteDrafts[id] ?? '').trim();
    setSavingNote(id);
    try {
      const { error } = await supabase.from('sublima_orders').update({ admin_note: note || null }).eq('id', id);
      if (error) throw error;
      setOrders(prev => prev.map(o => o.id === id ? { ...o, admin_note: note || null } : o));
      setNoteDrafts(prev => { const n = { ...prev }; delete n[id]; return n; });
    } catch (err: any) { alert(`Error: ${err?.message ?? err}`); }
    finally { setSavingNote(null); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Eliminar este pedido?')) return;
    try {
      const { error } = await supabase.from('sublima_orders').delete().eq('id', id);
      if (error) throw error;
      setOrders(prev => prev.filter(o => o.id !== id));
    } catch (err: any) { alert(`Error al eliminar: ${err?.message ?? err}`); }
  };

  const filtered = orders.filter(o => {
    if (statusFilter !== 'all' && o.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [o.client_name, o.client_phone, o.client_email, o.client_company, o.tracking_code, o.technique]
      .some(v => (v || '').toLowerCase().includes(q));
  });

  const totalUnits = (o: SublimaOrder) =>
    (Array.isArray(o.items) ? o.items : []).reduce((s, it) => s + (Number(it.qty) || 0), 0);

  const exportCSV = () => {
    const rows = [['Código', 'Tipo', 'Cliente', 'Empresa', 'Teléfono', 'Email', 'Unidades', 'Estimado', 'Cotizado', 'Pago', 'Estado', 'Fecha requerida', 'Fecha']];
    filtered.forEach(o => rows.push([
      o.tracking_code || '', o.request_type || '', o.client_name || '', o.client_company || '',
      o.client_phone || '', o.client_email || '', String(totalUnits(o)),
      o.estimated_total != null ? String(o.estimated_total) : '',
      o.quoted_total != null ? String(o.quoted_total) : '',
      o.payment_status || '', o.status, o.needed_date || '',
      new Date(o.created_at || '').toLocaleString(),
    ]));
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `pedidos_sublima_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const waQuoteHref = (o: SublimaOrder) => {
    if (!o.client_phone) return undefined;
    const num = o.client_phone.replace(/\D/g, '');
    const total = o.quoted_total != null ? fmt(Number(o.quoted_total)) : (o.estimated_total != null ? `${fmt(Number(o.estimated_total))} (estimado)` : 'por confirmar');
    const text = `Hola ${o.client_name || ''}! Sobre tu pedido ${o.tracking_code || ''}: la cotización es ${total}. Puedes rastrearlo con tu código en nuestro perfil.`;
    return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2" style={{ borderColor: ACCENT }} />
      </div>
    );
  }

  const inProduction = orders.filter(o => o.status === 'en_produccion').length;
  const toQuote = orders.filter(o => o.status === 'recibido').length;

  return (
    <div className="animate-fade-in-up space-y-6 max-w-4xl mx-auto px-4 md:px-6 pb-32" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5" style={{ borderColor: `${ACCENT}26` }}>
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2" style={{ fontFamily: TITLE_FONT }}>
            <FaClipboardList style={{ color: ACCENT }} /> Pedidos Mayoristas
          </h2>
          <p className="text-sm text-white/40 mt-1">Cotiza, produce y entrega — el cliente lo ve todo en su rastreador.</p>
        </div>
        <button onClick={exportCSV} disabled={filtered.length === 0}
          className="flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl disabled:opacity-30" style={{ background: ACCENT, color: ON_ACCENT, fontFamily: TITLE_FONT }}>
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
          { label: 'Pedidos', value: orders.length, icon: <FaClipboardList /> },
          { label: 'Por cotizar', value: toQuote, icon: <FaFileInvoiceDollar /> },
          { label: 'En producción', value: inProduction, icon: <FaMoneyBillWave /> },
        ].map(k => (
          <div key={k.label} className="bg-white/5 border border-white/5 rounded-xl p-4">
            <div className="text-lg" style={{ color: ACCENT_LIGHT }}>{k.icon}</div>
            <p className="text-2xl font-black text-white mt-1">{k.value}</p>
            <p className="text-[11px] text-white/40 uppercase tracking-widest font-bold mt-0.5">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Buscar + filtro por estado */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 flex-1">
          <FaSearch className="text-white/30" size={12} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar pedido (cliente, código, empresa…)"
            className="bg-transparent text-white text-sm focus:outline-none w-full placeholder-white/30" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-black/40 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none">
          <option value="all">Todos los estados</option>
          {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-white/30">
          <p className="text-4xl mb-3">🧵</p>
          <p className="text-sm">Aún no hay pedidos{search || statusFilter !== 'all' ? ' con este filtro' : ''}. Cuando alguien cotice desde tu perfil, aparecerá aquí.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map(o => {
            const items: SublimaOrderItem[] = Array.isArray(o.items) ? o.items : [];
            const rm = REQUEST_META[o.request_type || 'mayorista'] || REQUEST_META.mayorista;
            const units = totalUnits(o);
            const quoteDraft = quoteDrafts[o.id] ?? (o.quoted_total != null ? String(o.quoted_total) : '');
            return (
              <div key={o.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-white font-bold text-base truncate">{o.client_name || 'Pedido sin nombre'}</h3>
                      <span className="text-[10px] font-black uppercase tracking-widest rounded-full px-2 py-0.5" style={{ color: rm.color, background: `${rm.color}1f`, border: `1px solid ${rm.color}44` }}>{rm.label}</span>
                      {o.tracking_code && (
                        <span className="text-[10px] font-mono font-black tracking-widest rounded-md px-2 py-0.5 text-white/70 bg-black/40 border border-white/10">{o.tracking_code}</span>
                      )}
                      {o.client_company && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest rounded-full px-2 py-0.5"
                          style={{ color: ACCENT_LIGHT, background: `${ACCENT}1f`, border: `1px solid ${ACCENT}44` }}>
                          <FaBuilding size={8} /> {o.client_company}
                        </span>
                      )}
                      {o.member_code && (
                        <span className="text-[10px] font-mono font-bold rounded-md px-2 py-0.5" style={{ color: ACCENT_LIGHT, background: `${ACCENT}14` }}>{o.member_code}</span>
                      )}
                      {o.source_campaign && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-0.5 text-white/50 bg-white/5">
                          <FaBullhorn size={8} /> {o.source_campaign}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-white/50">
                      {o.client_phone && <span>{o.client_phone}</span>}
                      {o.client_email && <span>{o.client_email}</span>}
                      <span className="text-white/30">{new Date(o.created_at || '').toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {o.client_phone && (
                      <a href={waQuoteHref(o)} target="_blank" rel="noopener noreferrer"
                        className="w-8 h-8 rounded-lg bg-[#25D366]/10 border border-[#25D366]/20 text-[#25D366] flex items-center justify-center hover:bg-[#25D366]/20 transition" title="WhatsApp (enviar cotización)">
                        <FaWhatsapp size={13} />
                      </a>
                    )}
                    {o.client_email && (
                      <a href={`mailto:${o.client_email}`}
                        className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 text-white/50 flex items-center justify-center hover:text-white transition" title="Email">
                        <FaEnvelope size={12} />
                      </a>
                    )}
                    <button onClick={() => handleDelete(o.id)}
                      className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center hover:bg-red-500/20 transition" title="Eliminar">
                      <FaTrash size={11} />
                    </button>
                  </div>
                </div>

                {/* Artículos */}
                {(items.length > 0 || o.other_items) && (
                  <div className="mt-3 rounded-xl border border-white/5 bg-black/25 p-3 text-sm space-y-1">
                    {items.map((it, i) => (
                      <div key={i} className="flex items-center justify-between gap-2">
                        <span className="text-white/80 truncate">{it.qty} × {it.name}</span>
                        {typeof it.unit_price === 'number' && (
                          <span className="text-[11px] text-white/40 shrink-0">{fmt(it.unit_price)} c/u · {fmt(it.unit_price * it.qty)}</span>
                        )}
                      </div>
                    ))}
                    {o.other_items && <p className="text-xs text-white/60 whitespace-pre-wrap">+ {o.other_items}</p>}
                    <div className="flex flex-wrap items-center gap-2 pt-1.5 mt-1 border-t border-white/5 text-[11px]">
                      {units > 0 && <span className="font-bold text-white/70">{units} unidades</span>}
                      {o.technique && <span className="font-bold" style={{ color: ACCENT_LIGHT }}>Técnica: {o.technique}</span>}
                      {o.needed_date && <span className="text-white/50">📅 Para: {o.needed_date}</span>}
                      {o.estimated_total != null && <span className="text-white/50">Estimado: {fmt(Number(o.estimated_total))}</span>}
                    </div>
                    {o.notes && <p className="text-xs text-white/50 whitespace-pre-wrap pt-1">📝 {o.notes}</p>}
                  </div>
                )}

                {/* Cotización oficial + pago */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                  <div>
                    <label className="text-[10px] uppercase tracking-widest font-bold text-white/40">Cotización oficial (la ve el cliente)</label>
                    <div className="flex gap-2 mt-1">
                      <div className="flex items-center gap-1.5 flex-1 bg-black/30 rounded-lg px-3 border border-white/5">
                        <span className="text-white/40 text-sm">$</span>
                        <input type="number" step="0.01" min={0} value={quoteDraft}
                          onChange={e => setQuoteDrafts(prev => ({ ...prev, [o.id]: e.target.value }))}
                          placeholder="0.00"
                          className="w-full bg-transparent text-white text-sm py-2 focus:outline-none" />
                      </div>
                      <button onClick={() => saveQuote(o)}
                        disabled={savingQuote === o.id || quoteDraft === (o.quoted_total != null ? String(o.quoted_total) : '')}
                        className="shrink-0 px-3 rounded-lg text-xs font-black uppercase disabled:opacity-30" style={{ background: ACCENT, color: ON_ACCENT }}>
                        {savingQuote === o.id ? '…' : 'Cotizar'}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-widest font-bold text-white/40">Pago</label>
                    <div className="flex gap-1.5 mt-1">
                      {PAYMENTS.map(p => (
                        <button key={p} onClick={() => updatePayment(o.id, p)}
                          className="flex-1 text-[10px] font-bold uppercase tracking-wider rounded-lg px-2 py-2 transition border"
                          style={(o.payment_status || 'pendiente') === p
                            ? { background: PAYMENT_COLOR[p], color: '#0c0f08', borderColor: PAYMENT_COLOR[p] }
                            : { background: 'transparent', color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.1)' }}>
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Pipeline de estado */}
                <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-white/5">
                  {STATUSES.map(s => (
                    <button key={s} onClick={() => updateStatus(o.id, s)}
                      className="text-[10px] font-bold uppercase tracking-wider rounded-lg px-2.5 py-1 transition border"
                      style={o.status === s
                        ? { background: STATUS_COLOR[s], color: '#0c0f08', borderColor: STATUS_COLOR[s] }
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
                      value={noteDrafts[o.id] ?? o.admin_note ?? ''}
                      onChange={e => setNoteDrafts(prev => ({ ...prev, [o.id]: e.target.value }))}
                      placeholder="Ej. Cotización enviada. Con el 50% de anticipo entramos a producción."
                      className="flex-1 text-white text-sm rounded-lg px-3 py-2 focus:outline-none placeholder-gray-600 border" style={{ background: `${ACCENT}0d`, borderColor: `${ACCENT}26` }} />
                    <button onClick={() => saveNote(o.id)}
                      disabled={savingNote === o.id || (noteDrafts[o.id] ?? o.admin_note ?? '') === (o.admin_note ?? '')}
                      className="shrink-0 px-3 rounded-lg text-xs font-black uppercase disabled:opacity-30" style={{ background: ACCENT, color: ON_ACCENT }}>
                      {savingNote === o.id ? '…' : 'Enviar'}
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

export default SublimaOrdersTab;
