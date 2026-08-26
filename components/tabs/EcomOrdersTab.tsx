import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../src/lib/supabase';
import {
  FaShoppingBag, FaClock, FaCheckCircle, FaTimesCircle,
  FaTruck, FaBoxOpen, FaVolumeUp, FaWhatsapp, FaMoneyBillWave,
} from 'react-icons/fa';

// ─── Types ────────────────────────────────────────────────────────────────────

type EcomOrderStatus = 'pendiente' | 'empacado' | 'enviado' | 'entregado' | 'cancelado';

interface EcomOrder {
  id: string;
  seller_id: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  items: Array<{ name: string; qty: number; price: string }>;
  total_price: number;
  channel: 'whatsapp' | 'stripe' | 'manual';
  status: EcomOrderStatus;
  city?: string;
  notes?: string;
  estimated_minutes?: number | null;
  created_at: string;
  needs_invoice?: boolean;
  billing_full_name?: string;
  billing_ruc?: string;
  billing_email?: string;
  billing_address?: string;
  billing_phone?: string;
  order_type?: string;
  delivery_address?: string;
  delivery_fee?: number | null;
  payment_status?: string; // pendiente | comprobante | pagado
}

interface EcomOrdersTabProps {
  user: any;
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  EcomOrderStatus,
  { label: string; color: string; icon: React.ReactNode; next?: EcomOrderStatus }
> = {
  pendiente: {
    label: 'Pendiente',
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/25',
    icon: <FaClock className="w-3 h-3" />,
    next: 'empacado',
  },
  empacado: {
    label: 'Empacado',
    color: 'text-blue-400 bg-blue-500/10 border-blue-500/25',
    icon: <FaBoxOpen className="w-3 h-3" />,
    next: 'enviado',
  },
  enviado: {
    label: 'Enviado',
    color: 'text-purple-400 bg-purple-500/10 border-purple-500/25',
    icon: <FaTruck className="w-3 h-3" />,
    next: 'entregado',
  },
  entregado: {
    label: 'Entregado',
    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
    icon: <FaCheckCircle className="w-3 h-3" />,
  },
  cancelado: {
    label: 'Cancelado',
    color: 'text-red-400 bg-red-500/10 border-red-500/25',
    icon: <FaTimesCircle className="w-3 h-3" />,
  },
};

// ─── Alert sound (Web Audio API) ─────────────────────────────────────────────
// Un solo AudioContext compartido. Los navegadores lo crean "suspended" hasta
// que hay un gesto del usuario; por eso lo "desbloqueamos" en el primer toque/
// tecla (ver unlockAudio en el componente) y hacemos resume() antes de sonar.

let sharedAudioCtx: AudioContext | null = null;

const getAudioCtx = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!sharedAudioCtx) {
    try { sharedAudioCtx = new AudioContextClass(); } catch { return null; }
  }
  return sharedAudioCtx;
};

// Desbloquea el audio tras un gesto del usuario (requisito de los navegadores).
const unlockAudio = () => {
  const ctx = getAudioCtx();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
};

const playAlertSound = () => {
  const ctx = getAudioCtx();
  if (!ctx) return;

  const doPlay = () => {
    try {
      const play = (t: number, freq: number, dur: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.start(t);
        osc.stop(t + dur);
      };
      const now = ctx.currentTime;
      play(now, 523.25, 0.14);        // C5
      play(now + 0.16, 659.25, 0.14); // E5
      play(now + 0.32, 783.99, 0.30); // G5
    } catch (e) {
      console.warn('No se pudo reproducir la alarma:', e);
    }
  };

  if (ctx.state === 'suspended') {
    ctx.resume().then(doPlay).catch(() => {});
  } else {
    doPlay();
  }
};

// ─── Component ────────────────────────────────────────────────────────────────

export const EcomOrdersTab: React.FC<EcomOrdersTabProps> = ({ user }) => {
  const [orders, setOrders] = useState<EcomOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [alertMsg, setAlertMsg] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<EcomOrderStatus | 'all'>('all');
  const [liveStatus, setLiveStatus] = useState<'connecting' | 'live' | 'polling'>('connecting');
  const [timeDraft, setTimeDraft] = useState<Record<string, string>>({});

  // IDs ya conocidos — para detectar pedidos nuevos venga el aviso por realtime
  // o por el polling de respaldo (así la alarma suena una sola vez por pedido).
  const knownIdsRef = useRef<Set<string>>(new Set());
  const initialisedRef = useRef(false);

  // ── Fetch (con detección de pedidos nuevos) ────────────────

  const fetchOrders = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('ecom_orders')
        .select('*')
        .eq('seller_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const list = (data ?? []) as EcomOrder[];

      // Tras la carga inicial, cualquier ID no visto antes es un pedido nuevo.
      if (initialisedRef.current) {
        const fresh = list.filter(o => !knownIdsRef.current.has(o.id));
        if (fresh.length > 0) {
          const newest = fresh[0];
          playAlertSound();
          setAlertMsg(
            `🛍️ Nuevo pedido de ${newest.customer_name ?? 'cliente'} · $${parseFloat(String(newest.total_price ?? 0)).toFixed(2)}`
          );
          setTimeout(() => setAlertMsg(null), 8000);
        }
      }

      knownIdsRef.current = new Set(list.map(o => o.id));
      initialisedRef.current = true;
      setOrders(list);
    } catch (err: any) {
      console.error('EcomOrdersTab fetch error:', err?.message ?? err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // ── Desbloqueo de audio al primer gesto del usuario ────────
  useEffect(() => {
    const onGesture = () => unlockAudio();
    window.addEventListener('pointerdown', onGesture);
    window.addEventListener('keydown', onGesture);
    return () => {
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
    };
  }, []);

  // ── Realtime + polling de respaldo + refetch al enfocar ────
  useEffect(() => {
    if (!user?.id) return;
    fetchOrders();

    const channel = supabase
      .channel(`ecom_orders_${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ecom_orders', filter: `seller_id=eq.${user.id}` },
        () => { fetchOrders(); }
      )
      .subscribe(status => {
        // SUBSCRIBED = realtime OK; cualquier otra cosa => seguimos con polling.
        if (status === 'SUBSCRIBED') setLiveStatus('live');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setLiveStatus('polling');
      });

    // Respaldo: refresca cada 12s aunque realtime no esté disponible.
    const poll = setInterval(fetchOrders, 12000);

    // Al volver a la pestaña/ventana, refresca de inmediato.
    const onFocus = () => { if (document.visibilityState !== 'hidden') fetchOrders(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [user?.id, fetchOrders]);

  // ── Status update ──────────────────────────────────────────

  const handleAdvanceStatus = async (orderId: string, nextStatus: EcomOrderStatus) => {
    try {
      const { error } = await supabase
        .from('ecom_orders')
        .update({ status: nextStatus })
        .eq('id', orderId);
      if (error) throw error;
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: nextStatus } : o));
    } catch (err: any) {
      alert(`Error al actualizar: ${err.message ?? err}`);
    }
  };

  const handleCancel = async (orderId: string) => {
    if (!window.confirm('¿Cancelar este pedido?')) return;
    await handleAdvanceStatus(orderId, 'cancelado');
  };

  const handleSetPaymentStatus = async (orderId: string, status: string) => {
    try {
      const { error } = await supabase
        .from('ecom_orders')
        .update({ payment_status: status })
        .eq('id', orderId);
      if (error) throw error;
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, payment_status: status } : o));
    } catch (err: any) {
      alert(`Error al actualizar pago: ${err.message ?? err}`);
    }
  };

  const handleSetTime = async (orderId: string) => {
    const raw = timeDraft[orderId];
    const minutes = raw === '' || raw === undefined ? null : Math.max(0, parseInt(raw, 10) || 0);
    try {
      const { error } = await supabase.from('ecom_orders').update({ estimated_minutes: minutes }).eq('id', orderId);
      if (error) throw error;
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, estimated_minutes: minutes } : o));
      setTimeDraft(prev => { const n = { ...prev }; delete n[orderId]; return n; });
    } catch (err: any) {
      alert(`Error al guardar el tiempo: ${err.message ?? err}`);
    }
  };

  // ── Derived ────────────────────────────────────────────────

  const filtered = activeFilter === 'all'
    ? orders
    : orders.filter(o => o.status === activeFilter);

  const counts = orders.reduce((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalRevenue = orders
    .filter(o => o.status === 'entregado')
    .reduce((acc, o) => acc + parseFloat(String(o.total_price ?? 0)), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#00e5a0]" />
      </div>
    );
  }

  return (
    <div
      className="animate-fade-in-up space-y-6 max-w-4xl mx-auto px-4 md:px-6 pb-32"
      style={{ fontFamily: "'Space Grotesk', sans-serif" }}
    >
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#00e5a0]/15 pb-5">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2">
            <FaShoppingBag className="text-[#00e5a0]" /> Gestión de Pedidos
          </h2>
          <div className="flex items-center gap-2 mt-1">
            <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold ${liveStatus === 'live' ? 'text-[#00e5a0]' : 'text-amber-400'}`}>
              <span className={`w-2 h-2 rounded-full ${liveStatus === 'live' ? 'bg-[#00e5a0] animate-pulse' : 'bg-amber-400'}`} />
              {liveStatus === 'live' ? 'En vivo' : liveStatus === 'connecting' ? 'Conectando…' : 'Sincronizando'}
            </span>
            <span className="text-white/30">·</span>
            <p className="text-xs text-white/40">Pedidos de tu tienda en tiempo real</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchOrders()}
            className="flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wider text-white/70 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all"
          >
            ↻ Actualizar
          </button>
          <button
            onClick={() => { unlockAudio(); playAlertSound(); }}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#00e5a0] bg-[#00e5a0]/10 border border-[#00e5a0]/20 rounded-xl hover:bg-[#00e5a0]/20 transition-all"
          >
            <FaVolumeUp /> Probar alarma
          </button>
        </div>
      </div>

      {/* ── Flash Alert ─────────────────────────────────────── */}
      {alertMsg && (
        <div className="p-4 bg-[#00e5a0]/10 border border-[#00e5a0]/30 text-[#00e5a0] text-sm font-bold rounded-xl flex items-center justify-between animate-bounce">
          <span>{alertMsg}</span>
          <button onClick={() => setAlertMsg(null)} className="text-[#00e5a0]/60 hover:text-[#00e5a0]">✕</button>
        </div>
      )}

      {/* ── KPI Row ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Pedidos', value: orders.length, icon: '📦' },
          { label: 'Pendientes', value: counts['pendiente'] ?? 0, icon: '⏳' },
          { label: 'En Camino', value: (counts['empacado'] ?? 0) + (counts['enviado'] ?? 0), icon: '🚚' },
          { label: 'Ingresos', value: `$${totalRevenue.toFixed(0)}`, icon: '💰' },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white/5 border border-white/5 rounded-xl p-4">
            <p className="text-2xl">{kpi.icon}</p>
            <p className="text-2xl font-black text-white mt-1">{kpi.value}</p>
            <p className="text-[11px] text-white/40 uppercase tracking-widest font-bold mt-0.5">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* ── Filter Tabs ──────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {(['all', 'pendiente', 'empacado', 'enviado', 'entregado', 'cancelado'] as const).map(f => (
          <button
            key={f}
            onClick={() => setActiveFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
              activeFilter === f
                ? 'bg-[#00e5a0] text-black'
                : 'bg-white/5 text-white/50 hover:text-white border border-white/10'
            }`}
          >
            {f === 'all' ? `Todos (${orders.length})` : `${STATUS_CONFIG[f].label} ${counts[f] ? `(${counts[f]})` : ''}`}
          </button>
        ))}
      </div>

      {/* ── Orders List ─────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-white/30">
          <p className="text-4xl mb-3">🛍️</p>
          <p className="text-sm">No hay pedidos{activeFilter !== 'all' ? ` con estado "${STATUS_CONFIG[activeFilter]?.label}"` : ''} aún.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(order => {
            const config = STATUS_CONFIG[order.status];
            const nextStatus = config.next;
            const isActive = order.status !== 'entregado' && order.status !== 'cancelado';

            return (
              <div
                key={order.id}
                className="bg-gradient-to-br from-white/[0.04] to-transparent border border-white/8 rounded-2xl p-5 relative overflow-hidden"
              >
                {/* Top accent bar */}
                {isActive && (
                  <div className="absolute top-0 left-0 w-full h-[2px] bg-[#00e5a0]" />
                )}

                {/* Order header */}
                <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                  <div>
                    <p className="text-[10px] text-white/30 uppercase tracking-widest font-bold">
                      #{order.id.slice(-6).toUpperCase()} · {order.channel === 'whatsapp' ? '🟢 WhatsApp' : order.channel === 'stripe' ? '💳 Stripe' : '📝 Manual'}
                    </p>
                    <p className="text-white font-bold text-base mt-0.5">
                      {order.customer_name ?? 'Cliente sin nombre'}
                    </p>
                    {(order.customer_phone || order.city) && (
                      <p className="text-[11px] text-white/40 mt-0.5">
                        {order.city && `📍 ${order.city}`}
                        {order.city && order.customer_phone && ' · '}
                        {order.customer_phone && `📞 ${order.customer_phone}`}
                      </p>
                    )}
                    {order.order_type && (
                      <p className="text-[11px] mt-0.5 font-bold">
                        {order.order_type === 'local'
                          ? <span className="text-amber-400">🏪 Retiro en local</span>
                          : <span className="text-blue-400">🚚 Domicilio</span>
                        }
                      </p>
                    )}
                    {order.delivery_address && (
                      <p className="text-[11px] text-white/40 mt-0.5">📍 {order.delivery_address}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${config.color}`}>
                      {config.icon} {config.label}
                    </span>
                    <p className="text-[10px] text-white/30 mt-1">
                      {new Date(order.created_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                  </div>
                </div>

                {/* Items */}
                <div className="bg-black/30 rounded-xl p-3.5 space-y-2 border border-white/5 mb-4">
                  {Array.isArray(order.items) && order.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center text-sm">
                      <span className="text-white/80 font-bold">
                        <span className="text-[#00e5a0]">{item.qty}x</span> {item.name}
                      </span>
                      <span className="text-white/50 font-mono text-xs">{item.price}</span>
                    </div>
                  ))}
                  <div className="border-t border-white/5 pt-2 flex justify-between items-center">
                    <span className="text-[10px] text-white/30 uppercase tracking-widest">Total</span>
                    <span className="text-white font-black font-mono">
                      ${parseFloat(String(order.total_price ?? 0)).toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Payment status */}
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  {(() => {
                    const ps = order.payment_status ?? 'pendiente';
                    const payConfig: Record<string, { label: string; color: string }> = {
                      pendiente:    { label: '💳 Pago pendiente',   color: 'text-amber-400 bg-amber-500/10 border-amber-500/25' },
                      comprobante:  { label: '📎 Comprobante recibido', color: 'text-blue-400 bg-blue-500/10 border-blue-500/25' },
                      pagado:       { label: '✅ Pago confirmado',   color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25' },
                    };
                    const pc = payConfig[ps] ?? payConfig['pendiente'];
                    return (
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${pc.color}`}>
                        {pc.label}
                      </span>
                    );
                  })()}
                  {(order.payment_status ?? 'pendiente') !== 'pagado' && (
                    <div className="flex gap-1.5">
                      {(order.payment_status ?? 'pendiente') === 'pendiente' && (
                        <button
                          onClick={() => handleSetPaymentStatus(order.id, 'comprobante')}
                          className="px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-black uppercase tracking-wider hover:bg-blue-500/20 transition"
                        >
                          📎 Recibí comprobante
                        </button>
                      )}
                      <button
                        onClick={() => handleSetPaymentStatus(order.id, 'pagado')}
                        className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-wider hover:bg-emerald-500/20 transition"
                      >
                        ✅ Confirmar pago
                      </button>
                    </div>
                  )}
                </div>

                {/* Notes */}
                {order.notes && (
                  <div className="text-xs text-white/40 italic mb-3">📝 {order.notes}</div>
                )}

                {/* Billing info */}
                {order.needs_invoice && (
                  <div className="bg-[#00e5a0]/5 border border-[#00e5a0]/15 rounded-xl p-3 mb-3 space-y-1">
                    <p className="text-[10px] text-[#00e5a0] font-black uppercase tracking-widest mb-1">🧾 Factura solicitada</p>
                    {order.billing_full_name && <p className="text-xs text-white/70">{order.billing_full_name}</p>}
                    {order.billing_ruc && <p className="text-xs text-white/50">RUC/Cédula: {order.billing_ruc}</p>}
                    {order.billing_phone && <p className="text-xs text-white/50">Tel: {order.billing_phone}</p>}
                    {order.billing_email && <p className="text-xs text-white/50">{order.billing_email}</p>}
                    {order.billing_address && <p className="text-xs text-white/50">📍 {order.billing_address}</p>}
                  </div>
                )}

                {/* Actions */}
                {isActive && (
                  <div className="space-y-2">
                    {/* Primary: advance status */}
                    {nextStatus && (
                      <button
                        onClick={() => handleAdvanceStatus(order.id, nextStatus)}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#00e5a0] hover:bg-[#00cfa0] text-black text-xs font-black uppercase tracking-wider active:scale-95 transition shadow-lg shadow-[#00e5a0]/15"
                      >
                        {STATUS_CONFIG[nextStatus].icon}
                        Marcar como {STATUS_CONFIG[nextStatus].label}
                      </button>
                    )}

                    {/* Secondary: contact + pago + cancel */}
                    <div className="flex gap-2 flex-wrap">
                      {order.customer_phone && (order.payment_status ?? 'pendiente') !== 'pagado' && (
                        <a
                          href={`https://wa.me/${order.customer_phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${order.customer_name ?? ''}! Para confirmar tu pedido #${order.id.slice(-6).toUpperCase()} ($${parseFloat(String(order.total_price ?? 0)).toFixed(2)}), por favor envíanos el comprobante de pago. ¡Gracias! 🙏`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold hover:bg-amber-500/20 transition min-w-[130px]"
                        >
                          <FaMoneyBillWave /> Pedir comprobante
                        </a>
                      )}
                      {order.customer_phone && (
                        <a
                          href={`https://wa.me/${order.customer_phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${order.customer_name ?? ''}, te confirmamos tu pedido #${order.id.slice(-6).toUpperCase()}.`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#25D366]/10 border border-[#25D366]/20 text-[#25D366] text-xs font-bold hover:bg-[#25D366]/20 transition"
                        >
                          <FaWhatsapp /> Contactar
                        </a>
                      )}
                      <button
                        onClick={() => handleCancel(order.id)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold hover:bg-red-500/20 active:scale-95 transition"
                      >
                        <FaTimesCircle /> Cancelar
                      </button>
                    </div>

                    {/* Tiempo estimado */}
                    <div className="flex items-center gap-2 pt-0.5">
                      <FaClock className="text-white/20 shrink-0 w-3 h-3" />
                      <input
                        type="number"
                        min="0"
                        placeholder={order.estimated_minutes != null ? String(order.estimated_minutes) : 'Tiempo estimado (min)'}
                        value={timeDraft[order.id] ?? ''}
                        onChange={e => setTimeDraft(prev => ({ ...prev, [order.id]: e.target.value }))}
                        className="w-28 bg-white/5 border border-white/10 text-white text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:border-[#00e5a0]/40 placeholder-white/20"
                      />
                      {timeDraft[order.id] !== undefined && (
                        <button
                          type="button"
                          onClick={() => handleSetTime(order.id)}
                          className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-white/60 text-xs font-bold hover:bg-white/10 transition"
                        >
                          Guardar
                        </button>
                      )}
                      {order.estimated_minutes != null && timeDraft[order.id] === undefined && (
                        <span className="text-[10px] text-[#00e5a0] font-bold">~{order.estimated_minutes} min</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default EcomOrdersTab;
