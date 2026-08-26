import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, BellRing, Check, Smartphone, X } from 'lucide-react';
import { supabase } from '../src/lib/supabase';
import {
  enablePush, ensurePushSubscription, listDeviceAccounts, pushPermission, pushSupported,
  releaseDeviceAccount, repairPushSubscription, sendLocalTest, type DeviceAccount,
} from '../src/lib/push';

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  url?: string | null;
  read: boolean;
  created_at: string;
}

interface NotificationCenterProps {
  userId: string;
  /** Navega a una pestaña del dashboard (recibe el id de tab, ej. 'ecom_orders'). */
  onNavigate?: (tab: string) => void;
}

const typeEmoji: Record<string, string> = {
  order: '🛍️', reservation: '📅', lead: '🤝', testimonial: '⭐', message: '💬', fan: '🎤',
  // Recordatorio del día de la cita (setup_appointment_reminders.sql).
  reminder: '⏰',
};

const timeAgo = (iso: string): string => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'ahora';
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} d`;
};

const tabFromUrl = (url?: string | null): string | null => {
  if (!url) return null;
  const m = url.match(/[?&]tab=([a-z_]+)/i);
  return m ? m[1] : null;
};

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ userId, onNavigate }) => {
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<NotificationRow | null>(null);
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>(() => pushPermission());
  const [enabling, setEnabling] = useState(false);
  // null = comprobando | true = suscripción guardada | string = error al guardar
  const [pushStatus, setPushStatus] = useState<true | string | null>(null);
  // Negocios que reciben avisos en ESTE aparato. Sólo se muestra si hay más de
  // uno: con una sola cuenta no hay nada que aclarar y sería ruido.
  const [devices, setDevices] = useState<DeviceAccount[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Carga inicial + suscripción en tiempo real
  useEffect(() => {
    if (!userId) return;
    let active = true;

    supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(40)
      .then(({ data }) => {
        if (!active || !data) return;
        setItems(data as NotificationRow[]);
        setUnread((data as NotificationRow[]).filter(n => !n.read).length);
      });

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const n = payload.new as NotificationRow;
          setItems(prev => [n, ...prev.filter(p => p.id !== n.id)].slice(0, 40));
          setUnread(u => u + 1);
          setToast(n);
          if (toastTimer.current) clearTimeout(toastTimer.current);
          toastTimer.current = setTimeout(() => setToast(null), 6000);
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [userId]);

  // Auto-reparación: si el permiso YA está concedido, garantiza que la
  // suscripción push de este dispositivo exista en la BD (sin pedir nada).
  // Esto evita el caso "permiso concedido pero suscripción nunca guardada".
  useEffect(() => {
    if (!userId) return;
    if (!pushSupported() || Notification.permission !== 'granted') return;
    let cancelled = false;
    ensurePushSubscription(userId).then((res) => {
      if (cancelled) return;
      setPushStatus(res.ok ? true : (res.reason || 'error'));
      setPerm(pushPermission());
      // Se consulta DESPUÉS de registrar: si se hiciera antes, esta cuenta aún
      // no estaría en la lista y el aparato parecería ajeno.
      listDeviceAccounts().then(list => { if (!cancelled) setDevices(list); });
    });
    return () => { cancelled = true; };
  }, [userId]);

  // Cerrar el dropdown al hacer clic fuera
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return; // panel móvil (portal)
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const markAllRead = async () => {
    if (unread === 0) return;
    setItems(prev => prev.map(n => ({ ...n, read: true })));
    setUnread(0);
    await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
  };

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next) markAllRead();
  };

  const handleClick = (n: NotificationRow) => {
    const tab = tabFromUrl(n.url);
    if (tab && onNavigate) onNavigate(tab);
    setOpen(false);
    setToast(null);
  };

  const explainError = (reason?: string) => {
    if (reason === 'denied') {
      alert(
        'El navegador tiene las notificaciones BLOQUEADAS para este sitio.\n\n' +
        'Android/Chrome — para desbloquear:\n' +
        '• Toca el candado 🔒 (o ⓘ) junto a la dirección web\n' +
        '• "Permisos" → "Notificaciones" → Permitir\n' +
        '• (o Chrome → ⋮ → Configuración → Configuración del sitio → Notificaciones)\n' +
        '• Recarga la página y vuelve a intentar\n\n' +
        'Revisa también que Android permita notificaciones a Chrome/la app en Ajustes del teléfono.'
      );
    } else if (reason === 'dismissed') {
      alert('No se concedió el permiso. Vuelve a tocar el botón y pulsa "Permitir" en el aviso del navegador.');
    } else if (reason === 'unsupported') {
      alert('Este navegador no soporta notificaciones push.\n\nEn iPhone: Compartir → "Añadir a pantalla de inicio" y abre la app desde ese ícono (requiere iOS 16.4+).');
    } else if (reason && reason.startsWith('db:')) {
      alert('El permiso está bien, pero falta preparar la base de datos.\nEjecuta setup_notifications.sql en Supabase.\n\nDetalle: ' + reason);
    } else {
      alert('No se pudo completar.\nDetalle: ' + (reason || 'error desconocido'));
    }
  };

  const handleEnablePush = async () => {
    setEnabling(true);
    const res = await enablePush(userId);
    setEnabling(false);
    setPerm(pushPermission());
    setPushStatus(res.ok ? true : (res.reason || 'error'));
    if (res.ok) {
      alert('✅ Avisos activados en este dispositivo. Ahora prueba con "Probar notificación".');
    } else {
      explainError(res.reason);
    }
  };

  // "Están verdes pero no llegan": la suscripción guardada puede haber quedado
  // atada a una llave VAPID anterior. Esto la tira y crea una nueva.
  const handleRepair = async () => {
    setEnabling(true);
    const res = await repairPushSubscription(userId);
    setEnabling(false);
    setPerm(pushPermission());
    setPushStatus(res.ok ? true : (res.reason || 'error'));
    if (res.ok) {
      alert('🔄 Suscripción renovada en este dispositivo.\n\nHaz que llegue un pedido/reserva de prueba para confirmar que ya entran los avisos.');
    } else {
      explainError(res.reason);
    }
  };

  // Quitar un negocio de este aparato. Si es el propio, se avisa de que dejará
  // de recibir sus avisos aquí: es reversible (basta recargar el panel, que
  // vuelve a registrar el dispositivo), pero conviene que no sea un descuido.
  const handleRemoveDevice = async (acc: DeviceAccount) => {
    const aviso = acc.isMe
      ? `Este dispositivo dejará de recibir los avisos de "${acc.name}" (tu cuenta actual).\n\nPuedes volver a activarlos recargando el panel.`
      : `Este dispositivo dejará de recibir los avisos de "${acc.name}".`;
    if (!confirm(aviso + '\n\n¿Continuar?')) return;
    const ok = await releaseDeviceAccount(acc.userId);
    if (!ok) { alert('No se pudo quitar. Vuelve a intentarlo.'); return; }
    setDevices(prev => prev.filter(d => d.userId !== acc.userId));
  };

  const handleTest = async () => {
    const res = await sendLocalTest();
    setPerm(pushPermission());
    if (!res.ok) explainError(res.reason);
  };

  const showEnable = pushSupported() && perm !== 'granted';

  const panelBody = (
    <>
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <h3 className="text-sm font-black uppercase tracking-wider text-white">Notificaciones</h3>
        {unread > 0 && (
          <button onClick={markAllRead} className="text-[11px] text-[var(--primary-orange)] font-bold flex items-center gap-1 hover:opacity-80">
            <Check className="w-3 h-3" /> Marcar leídas
          </button>
        )}
      </div>

      {showEnable && (
        <button
          onClick={handleEnablePush}
          disabled={enabling}
          className="flex items-center gap-2 px-4 py-3 border-b border-white/10 text-left bg-[var(--primary-orange)]/10 hover:bg-[var(--primary-orange)]/20 transition disabled:opacity-60"
        >
          <Smartphone className="w-4 h-4 text-[var(--primary-orange)] shrink-0" />
          <span className="text-xs text-white/90">
            {enabling ? 'Activando…' : 'Activar avisos en este teléfono/dispositivo'}
          </span>
        </button>
      )}

      {/* Estado real del push cuando el permiso ya está concedido */}
      {!showEnable && perm === 'granted' && (
        pushStatus === true ? (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-white/10 bg-emerald-500/5">
            <Smartphone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="text-[11px] text-emerald-300/90 flex-1">Avisos push activos en este dispositivo</span>
            <button
              onClick={handleRepair}
              disabled={enabling}
              title="Renovar la suscripción de este dispositivo"
              className="text-[10px] text-white/45 hover:text-white underline underline-offset-2 shrink-0 disabled:opacity-50"
            >
              {enabling ? 'Renovando…' : '¿No llegan?'}
            </button>
          </div>
        ) : pushStatus !== null ? (
          <button
            onClick={handleEnablePush}
            disabled={enabling}
            className="flex items-center gap-2 px-4 py-2.5 border-b border-white/10 text-left bg-red-500/10 hover:bg-red-500/20 transition disabled:opacity-60"
          >
            <Smartphone className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <span className="text-[11px] text-red-300/90">
              {enabling ? 'Reintentando…' : `Push sin registrar (${pushStatus}). Toca para reintentar`}
            </span>
          </button>
        ) : null
      )}

      {/* Varios negocios usan este aparato: se dice cuáles y se pueden quitar.
          Con uno solo no se dibuja nada — no habría nada que aclarar. */}
      {devices.length > 1 && (
        <div className="px-4 py-2.5 border-b border-white/10 bg-white/[0.02]">
          <p className="text-[10px] uppercase tracking-wider text-white/40 font-bold mb-1.5">
            Este dispositivo recibe avisos de {devices.length} negocios
          </p>
          <ul className="space-y-1">
            {devices.map(d => (
              <li key={d.userId} className="flex items-center gap-2">
                <span className="text-[11px] text-white/70 truncate flex-1 min-w-0">
                  {d.name}
                  {d.isMe && <span className="text-white/35"> · esta cuenta</span>}
                </span>
                <button
                  onClick={() => handleRemoveDevice(d)}
                  title={`Dejar de recibir los avisos de ${d.name} en este dispositivo`}
                  className="shrink-0 text-[10px] text-white/40 hover:text-red-400 underline underline-offset-2"
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-white/30 mt-1.5 leading-snug">
            Cada aviso llega con el nombre del negocio delante.
          </p>
        </div>
      )}

      <div className="overflow-y-auto flex-1">
        {items.length === 0 ? (
          <p className="text-center text-white/40 text-xs py-10 px-4">No tienes notificaciones todavía.</p>
        ) : (
          items.map(n => (
            <button
              key={n.id}
              onClick={() => handleClick(n)}
              className={`w-full text-left flex gap-3 px-4 py-3 border-b border-white/5 hover:bg-white/5 transition ${!n.read ? 'bg-[var(--primary-orange)]/5' : ''}`}
            >
              <span className="text-lg leading-none shrink-0">{typeEmoji[n.type] || '🔔'}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-xs font-bold text-white truncate">{n.title}</span>
                {n.body && <span className="block text-[11px] text-white/60 line-clamp-2">{n.body}</span>}
                <span className="block text-[10px] text-white/35 mt-0.5">{timeAgo(n.created_at)}</span>
              </span>
              {!n.read && <span className="w-2 h-2 rounded-full bg-[var(--primary-orange)] shrink-0 mt-1.5" />}
            </button>
          ))
        )}
      </div>

      <div className="px-4 py-2 border-t border-white/10 shrink-0">
        <button onClick={handleTest} className="w-full text-[11px] text-white/55 hover:text-white transition py-1.5">
          🔔 Probar notificación en este dispositivo
        </button>
      </div>
    </>
  );

  return (
    <>
      <div className="relative" ref={rootRef}>
        <button
          onClick={toggleOpen}
          title="Notificaciones"
          className="relative flex items-center justify-center w-8 h-8 md:w-9 md:h-9 rounded-lg text-white border border-white/10 bg-white/5 hover:bg-white/10 active:scale-95 transition-all"
        >
          {unread > 0 ? <BellRing className="w-4 h-4 text-[var(--primary-orange)]" /> : <Bell className="w-4 h-4" />}
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[var(--primary-orange)] text-white text-[10px] font-black flex items-center justify-center">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>

        {/* Escritorio: dropdown anclado bajo la campana */}
        {open && (
          <div className="hidden md:flex absolute right-0 top-full mt-2 w-[320px] max-w-[86vw] max-h-[75vh] overflow-hidden rounded-2xl border border-white/10 bg-[#160800]/95 backdrop-blur-xl shadow-2xl z-[70] flex-col">
            {panelBody}
          </div>
        )}
      </div>

      {/* Móvil: modal centrado por portal (escapa del header con backdrop-filter) */}
      {open && createPortal(
        <div className="md:hidden">
          <div className="fixed inset-0 bg-black/60 z-[120]" onClick={() => setOpen(false)} />
          <div
            ref={panelRef}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-[360px] max-h-[80vh] overflow-hidden rounded-2xl border border-white/10 bg-[#160800] shadow-2xl z-[121] flex flex-col"
          >
            {panelBody}
          </div>
        </div>,
        document.body,
      )}

      {/* Toast in-app cuando llega una notificación con la app abierta */}
      {toast && (
        <div className="fixed top-16 md:top-20 right-3 md:right-6 z-[80] w-[300px] max-w-[86vw] animate-fade-in-up">
          <div
            className="flex gap-3 p-3 rounded-2xl border border-white/10 bg-[#160800]/95 backdrop-blur-xl shadow-2xl cursor-pointer"
            onClick={() => handleClick(toast)}
          >
            <span className="text-xl leading-none shrink-0">{typeEmoji[toast.type] || '🔔'}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black text-white truncate">{toast.title}</p>
              {toast.body && <p className="text-[11px] text-white/70 line-clamp-2">{toast.body}</p>}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setToast(null); }}
              className="shrink-0 text-white/40 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default NotificationCenter;
