import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../src/lib/supabase';
import {
  FaUtensils, FaClipboardList, FaUser, FaClock, FaCheckCircle,
  FaTimesCircle, FaBan, FaDollarSign, FaVolumeUp
} from 'react-icons/fa';

interface OrdersTabProps {
  user: any;
  isPetcare?: boolean;
  isMedical?: boolean;
}

// AudioContext compartido (los navegadores lo crean "suspended" hasta que hay
// un gesto del usuario; lo desbloqueamos al primer toque y hacemos resume()).
let sharedAudioCtx: AudioContext | null = null;
const getAudioCtx = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  if (!sharedAudioCtx) { try { sharedAudioCtx = new AC(); } catch { return null; } }
  return sharedAudioCtx;
};
const unlockAudio = () => {
  const ctx = getAudioCtx();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
};
const playAlertSound = () => {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const doPlay = () => {
    try {
      const beep = (time: number, freq: number, dur: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(freq, time);
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(0.2, time + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
        osc.start(time); osc.stop(time + dur);
      };
      const now = ctx.currentTime;
      beep(now, 587.33, 0.16);        // D5
      beep(now + 0.18, 880.00, 0.32); // A5
    } catch (e) { console.warn('No se pudo reproducir la alarma:', e); }
  };
  if (ctx.state === 'suspended') ctx.resume().then(doPlay).catch(() => {}); else doPlay();
};

// Pipeline de estados del pedido (lo que ve el cliente en vivo).
type GStatus = 'pendiente' | 'preparando' | 'listo' | 'en_camino' | 'entregado' | 'completado' | 'cancelado';
const STATUS_META: Record<GStatus, { label: string; color: string }> = {
  pendiente:  { label: 'Pendiente',     color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  preparando: { label: 'Preparando',    color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
  listo:      { label: 'Listo',         color: 'text-purple-400 bg-purple-500/10 border-purple-500/30' },
  en_camino:  { label: 'En Camino',     color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30' },
  entregado:  { label: 'Entregado',     color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  completado: { label: 'Completado',    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  cancelado:  { label: 'Cancelado',     color: 'text-red-400 bg-red-500/10 border-red-500/30' },
};
const FLOW_MESA: GStatus[] = ['pendiente', 'preparando', 'listo', 'entregado'];
const FLOW_DELIVERY: GStatus[] = ['pendiente', 'preparando', 'listo', 'en_camino', 'entregado'];
const nextStatusFor = (order: any): GStatus | null => {
  const flow = order.order_type === 'delivery' ? FLOW_DELIVERY : FLOW_MESA;
  const idx = flow.indexOf(order.status);
  if (idx === -1) return order.status === 'pendiente' ? flow[1] : null;
  return idx < flow.length - 1 ? flow[idx + 1] : null;
};
const isClosed = (s: string) => s === 'entregado' || s === 'completado' || s === 'cancelado';

export const OrdersTab: React.FC<OrdersTabProps> = ({ user, isPetcare = false, isMedical = false }) => {
  const isClinic = isPetcare || isMedical;
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [alertMsg, setAlertMsg] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<'connecting' | 'live' | 'polling'>('connecting');
  const [timeDraft, setTimeDraft] = useState<Record<string, string>>({});

  const knownIdsRef = useRef<Set<string>>(new Set());
  const paidNotifiedRef = useRef<Set<string>>(new Set());
  const initialisedRef = useRef(false);

  const fetchOrders = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('restaurant_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const list = data || [];

      // Detecta pedidos nuevos (venga el aviso por realtime o por polling).
      if (initialisedRef.current) {
        const fresh = list.filter((o: any) => !knownIdsRef.current.has(o.id));
        if (fresh.length > 0) {
          const n = fresh[0];
          playAlertSound();
          const where = n.order_type === 'mesa' ? `${isClinic ? 'Box' : 'Mesa'} ${n.mesa_number}` : n.order_type === 'delivery' ? 'Delivery' : 'Para Llevar';
          setAlertMsg(`🔔 ${isClinic ? 'Nueva atención' : 'Nuevo pedido'} · ${where} · Código ${n.verification_code}`);
          setTimeout(() => setAlertMsg(null), 8000);
        }
        // Alerta de pago: cliente envió comprobante.
        const paidNotif = list.filter((o: any) => o.payment_status === 'comprobante' && !paidNotifiedRef.current.has(o.id));
        if (paidNotif.length > 0) {
          const p = paidNotif[0];
          playAlertSound();
          setAlertMsg(`💸 Pago notificado · Código ${p.verification_code} · revisa el comprobante en WhatsApp`);
          setTimeout(() => setAlertMsg(null), 9000);
        }
      }
      knownIdsRef.current = new Set(list.map((o: any) => o.id));
      paidNotifiedRef.current = new Set(list.filter((o: any) => o.payment_status === 'comprobante').map((o: any) => o.id));
      initialisedRef.current = true;
      setOrders(list);
    } catch (err: any) {
      console.error("Error fetching orders:", err.message || err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Desbloqueo de audio al primer gesto.
  useEffect(() => {
    const onGesture = () => unlockAudio();
    window.addEventListener('pointerdown', onGesture);
    window.addEventListener('keydown', onGesture);
    return () => {
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    fetchOrders();

    const channel = supabase.channel(`restaurant_orders_${user.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${user.id}` },
        () => { fetchOrders(); }
      )
      .subscribe(status => {
        if (status === 'SUBSCRIBED') setLiveStatus('live');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setLiveStatus('polling');
      });

    // Respaldo: refresca cada 12s aunque realtime no esté disponible.
    const poll = setInterval(fetchOrders, 12000);
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

  const handleUpdateStatus = async (orderId: string, nextStatus: GStatus, visitorId?: string | null) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: nextStatus })
        .eq('id', orderId);

      if (error) throw error;

      // Al entregar/completar, si el pedido era de un visitante registrado, dale un sello.
      if ((nextStatus === 'entregado' || nextStatus === 'completado') && visitorId) {
        // Fetch visitor's profile stamps
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('stamps')
          .eq('id', visitorId)
          .single();

        if (!profileError && profileData) {
          const currentStamps = profileData.stamps || 0;
          await supabase
            .from('profiles')
            .update({ stamps: currentStamps + 1 })
            .eq('id', visitorId);
          console.log(`Credited 1 stamp to visitor ${visitorId}. New total: ${currentStamps + 1}`);
        }
      }

      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: nextStatus } : o));
    } catch (err: any) {
      alert(`Error al actualizar la orden: ${err.message || err}`);
    }
  };

  const handleSetTime = async (orderId: string) => {
    const raw = timeDraft[orderId];
    const minutes = raw === '' || raw === undefined ? null : Math.max(0, parseInt(raw, 10) || 0);
    try {
      const { error } = await supabase.from('orders').update({ estimated_minutes: minutes }).eq('id', orderId);
      if (error) throw error;
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, estimated_minutes: minutes } : o));
      setTimeDraft(prev => { const n = { ...prev }; delete n[orderId]; return n; });
    } catch (err: any) {
      alert(`Error al guardar el tiempo: ${err.message || err}`);
    }
  };

  const handleTogglePayment = async (orderId: string, currentPaymentStatus: string) => {
    const nextPaymentStatus = currentPaymentStatus === 'pagado' ? 'pendiente' : 'pagado';
    try {
      const { error } = await supabase
        .from('orders')
        .update({ payment_status: nextPaymentStatus })
        .eq('id', orderId);

      if (error) throw error;
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, payment_status: nextPaymentStatus } : o));
    } catch (err: any) {
      alert(`Error al cambiar estado de pago: ${err.message || err}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#ff6b35]"></div>
      </div>
    );
  }

  const activeOrders = orders.filter(o => !isClosed(o.status));
  const finishedOrders = orders.filter(o => isClosed(o.status));

  return (
    <div className="animate-fade-in-up space-y-6 max-w-4xl mx-auto px-5 md:px-0 pb-32"
         style={{ fontFamily: "'Inter', -apple-system, sans-serif" }}>
      
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#ff6b35]/20 pb-4">
        <div>
          <h2 className="text-2xl font-bold font-sans text-white flex items-center gap-2">
            {isClinic ? <FaClipboardList className="text-[#ff6b35]" /> : <FaUtensils className="text-[#ff6b35]" />} {isClinic ? 'Atenciones y Despachos' : 'Comandas y Pedidos'}
          </h2>
          <div className="flex items-center gap-2 mt-1">
            <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold ${liveStatus === 'live' ? 'text-[#ff6b35]' : 'text-amber-400'}`}>
              <span className={`w-2 h-2 rounded-full ${liveStatus === 'live' ? 'bg-[#ff6b35] animate-pulse' : 'bg-amber-400'}`} />
              {liveStatus === 'live' ? 'En vivo' : liveStatus === 'connecting' ? 'Conectando…' : 'Sincronizando'}
            </span>
            <span className="text-white/30">·</span>
            <p className="text-xs text-gray-400">Órdenes en tiempo real</p>
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
            className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#ff6b35] hover:text-[#ff8f61] bg-[#ff6b35]/15 hover:bg-[#ff6b35]/25 border border-[#ff6b35]/20 rounded-xl transition-all"
          >
            <FaVolumeUp /> Probar Alarma
          </button>
        </div>
      </div>

      {/* Real-Time Flash Banner Alert */}
      {alertMsg && (
        <div className="p-4 bg-green-500/10 border border-green-500/30 text-green-400 text-sm font-bold rounded-xl flex items-center justify-between animate-bounce">
          <span>🔔 {alertMsg}</span>
          <button onClick={() => setAlertMsg(null)} className="text-green-400/60 hover:text-green-400">✕</button>
        </div>
      )}

      {/* Grid of Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Column 1: Active/Pending Orders */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#ff6b35]/10 pb-2">
            <h3 className="text-sm font-bold tracking-widest text-[#ff6b35] uppercase">{isClinic ? 'Pendientes / En Atención' : 'Pendientes / En Cocina'}</h3>
            <span className="bg-[#ff6b35]/15 border border-[#ff6b35]/20 text-[#ff6b35] text-xs font-bold px-2 py-0.5 rounded-full">
              {activeOrders.length} activa{activeOrders.length !== 1 ? 's' : ''}
            </span>
          </div>

          {activeOrders.length === 0 ? (
            <div className="p-8 text-center bg-white/2 rounded-2xl border border-white/5 text-gray-500 text-sm">
              No hay órdenes pendientes en este momento.
            </div>
          ) : (
            <div className="space-y-3">
              {activeOrders.map((order) => (
                <div
                  key={order.id}
                  className="bg-gradient-to-r from-[#170902] to-[#0f0400] border border-[#ff6b35]/25 rounded-2xl p-5 shadow-lg relative overflow-hidden"
                >
                  {/* Glowing Top Indicator */}
                  <div className="absolute top-0 left-0 w-full h-[2px] bg-[#ff6b35]"></div>

                  {/* Header info */}
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Código Validación</span>
                      <div className="text-2xl font-mono font-black tracking-widest text-[#ff6b35] leading-none mt-1">
                        {order.verification_code}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Logística</span>
                      <div className="text-sm font-bold text-white mt-1">
                        {order.order_type === 'mesa'
                          ? `${isClinic ? 'Box' : 'Mesa'} #${order.mesa_number}`
                          : order.order_type === 'delivery'
                            ? '🛵 Delivery'
                            : `Para Llevar${order.pickup_time ? ` · ${order.pickup_time}` : ''}`}
                      </div>
                      <span className={`inline-flex items-center mt-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${(STATUS_META[order.status as GStatus] || STATUS_META.pendiente).color}`}>
                        {(STATUS_META[order.status as GStatus] || STATUS_META.pendiente).label}
                        {order.estimated_minutes ? ` · ${order.estimated_minutes} min` : ''}
                      </span>
                    </div>
                  </div>

                  {/* Datos de delivery / cliente */}
                  {order.order_type === 'delivery' && (order.customer_name || order.delivery_address || order.customer_phone) && (
                    <div className="bg-black/20 border border-[#ff6b35]/10 rounded-xl p-3 mb-3 text-xs space-y-1">
                      {order.customer_name && <div className="text-white font-bold">{order.customer_name}</div>}
                      {order.delivery_address && <div className="text-gray-400">📍 {order.delivery_address}</div>}
                      {order.customer_phone && (
                        <a href={`https://wa.me/${String(order.customer_phone).replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
                           className="text-[#25D366] font-bold inline-flex items-center gap-1">📞 {order.customer_phone}</a>
                      )}
                    </div>
                  )}

                  {/* Código de miembro VIP usado */}
                  {order.member_code && (
                    <div className="mb-3 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-[#ff6b35] bg-[#ff6b35]/10 border border-[#ff6b35]/25 rounded-lg px-2.5 py-1">
                      ⭐ Miembro {order.member_code}
                    </div>
                  )}

                  {/* Nombre de mascota (solo petcare, extraído de notes "🐾 PetName · ...") */}
                  {isPetcare && order.notes && order.notes.includes('🐾') && (
                    <div className="mb-3 inline-flex items-center gap-1.5 text-[11px] font-bold text-[#0ea5a4] bg-[#0ea5a4]/10 border border-[#0ea5a4]/20 rounded-lg px-2.5 py-1">
                      {order.notes.split(' · ')[0]}
                    </div>
                  )}

                  {/* Datos de facturación solicitados */}
                  {order.needs_invoice && (order.billing_name || order.billing_tax_id) && (
                    <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 mb-3 text-xs">
                      <div className="text-[9px] uppercase tracking-widest font-black text-blue-400 mb-1">🧾 Factura solicitada</div>
                      <div className="text-white font-bold">{order.billing_name}</div>
                      {order.billing_full_name && order.billing_full_name !== order.billing_name && (
                        <div className="text-gray-300">{order.billing_full_name}</div>
                      )}
                      <div className="text-gray-400">{order.billing_tax_id}{order.billing_phone ? ` · 📞 ${order.billing_phone}` : ''}</div>
                      {order.billing_email && <div className="text-gray-400">{order.billing_email}</div>}
                      {order.billing_address && <div className="text-gray-400">{order.billing_address}</div>}
                    </div>
                  )}

                  {/* Ordered Items */}
                  <div className="bg-black/30 p-3.5 rounded-xl border border-white/5 space-y-2 my-4">
                    {Array.isArray(order.items) && order.items.map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center text-sm">
                        <span className="text-gray-300 font-bold">{item.qty}x <span className="text-white">{item.name}</span></span>
                        <span className="text-gray-400 font-mono text-xs">{item.price}</span>
                      </div>
                    ))}
                    <div className="border-t border-white/5 pt-2 flex justify-between items-center text-sm font-bold">
                      <span className="text-gray-400 uppercase tracking-widest text-[9px]">Total</span>
                      <span className="text-[#ffefe5] font-mono">${parseFloat(order.total_price || 0).toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Tiempo estimado */}
                  <div className="flex items-center gap-2 mb-3 bg-black/20 border border-[#ff6b35]/10 rounded-xl p-2.5">
                    <FaClock className="text-[#ff6b35] shrink-0" size={12} />
                    <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">Tiempo est.</span>
                    <input
                      type="number" min={0} placeholder={order.estimated_minutes ?? '—'}
                      value={timeDraft[order.id] ?? (order.estimated_minutes != null ? String(order.estimated_minutes) : '')}
                      onChange={(e) => setTimeDraft(prev => ({ ...prev, [order.id]: e.target.value }))}
                      className="w-16 bg-black/40 border border-[#ff6b35]/20 text-white text-sm rounded-lg px-2 py-1 focus:outline-none focus:border-[#ff6b35]" />
                    <span className="text-[10px] text-gray-500">min</span>
                    <button onClick={() => handleSetTime(order.id)}
                      className="ml-auto px-3 py-1 rounded-lg bg-[#ff6b35]/15 border border-[#ff6b35]/25 text-[#ff6b35] text-[10px] font-black uppercase tracking-wider hover:bg-[#ff6b35]/25 transition">
                      Guardar
                    </button>
                  </div>

                  {/* Actions & Status pipeline */}
                  <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
                    <button
                      onClick={() => handleTogglePayment(order.id, order.payment_status)}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border flex items-center gap-1 ${
                        order.payment_status === 'pagado'
                          ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                          : order.payment_status === 'comprobante'
                            ? 'bg-orange-500/10 border-orange-500/40 text-orange-400 animate-pulse'
                            : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
                      }`}
                      title="Clic para marcar como pagado / pendiente"
                    >
                      <FaDollarSign /> {order.payment_status === 'pagado' ? 'Pagado' : order.payment_status === 'comprobante' ? '💸 Comprobante · confirmar' : 'Pendiente Pago'}
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleUpdateStatus(order.id, 'cancelado')}
                        className="px-3.5 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold hover:bg-red-500/20 active:scale-95 transition-all"
                      >
                        Cancelar
                      </button>
                      {(() => {
                        const next = nextStatusFor(order);
                        if (!next) return null;
                        // No se puede pasar de "pendiente" a preparando sin pago confirmado.
                        const paymentGate = order.status === 'pendiente' && order.payment_status !== 'pagado';
                        if (paymentGate) {
                          return (
                            <span className="px-4 py-2 rounded-xl bg-white/5 border border-yellow-500/20 text-yellow-400/80 text-[11px] font-bold flex items-center gap-1.5">
                              <FaDollarSign size={11} /> Confirma el pago para preparar
                            </span>
                          );
                        }
                        return (
                          <button
                            onClick={() => handleUpdateStatus(order.id, next, order.visitor_id)}
                            className="px-4 py-2 rounded-xl bg-[#ff6b35] hover:bg-[#e85a25] border border-transparent text-white text-xs font-black uppercase tracking-widest hover:shadow-lg hover:shadow-[#ff6b35]/15 active:scale-95 transition-all flex items-center gap-1.5"
                          >
                            <FaCheckCircle /> {next === 'entregado' ? 'Marcar entregado' : `→ ${STATUS_META[next].label}`}
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Column 2: History/Finished Orders */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <h3 className="text-sm font-bold tracking-widest text-gray-500 uppercase">Historial / Cerrados</h3>
            <span className="bg-white/5 text-gray-400 text-xs font-bold px-2 py-0.5 rounded-full">
              {finishedOrders.length}
            </span>
          </div>

          {finishedOrders.length === 0 ? (
            <div className="p-8 text-center bg-white/2 rounded-2xl border border-white/5 text-gray-500 text-sm">
              No hay comandas registradas en el historial.
            </div>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {finishedOrders.map((order) => (
                <div
                  key={order.id}
                  className="bg-white/[0.01] border border-white/5 rounded-xl p-4 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-white text-sm tracking-wider">{order.verification_code}</span>
                      <span className="text-[10px] text-gray-500">·</span>
                      <span className="text-xs text-gray-400 font-bold">
                        {order.order_type === 'mesa' ? `${isClinic ? 'Box' : 'Mesa'} ${order.mesa_number}` : order.order_type === 'delivery' ? 'Delivery' : 'Para Llevar'}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-500 truncate mt-1">
                      {Array.isArray(order.items) ? order.items.map((i: any) => `${i.qty}x ${i.name}`).join(', ') : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono text-xs text-gray-400 mr-2">${parseFloat(order.total_price || 0).toFixed(2)}</span>
                    {order.status === 'completado' ? (
                      <span className="px-2 py-0.5 rounded-md bg-green-500/10 border border-green-500/20 text-green-400 text-[9px] font-bold uppercase tracking-wider">
                        Completado
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 text-[9px] font-bold uppercase tracking-wider">
                        Cancelado
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
export default OrdersTab;
