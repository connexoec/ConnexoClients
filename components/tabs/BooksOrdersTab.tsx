import React, { useMemo, useState } from 'react';
import { supabase } from '../../src/lib/supabase';
import type { BookOrder, BookOrderStatus, BooksSettings } from '../../types';
import { FaShoppingBag, FaWhatsapp, FaStore, FaTruck, FaGift, FaTrash, FaCheck, FaBan, FaCog, FaCreditCard } from 'react-icons/fa';
import {
  useOwnerTable, useJsonSettings, Field, adminInput, Spinner, MissingSqlNotice, Kpi, ping, waLink, money, isMissingSql, todayLocal,
} from '../AdminKit';
import { PaymentGatewaysPanel } from '../PaymentGatewaysPanel';
import { ExportRangePanel, fetchOwnerRange, type ExportColumn } from '../ExportRangePanel';
import { ACCENT, ON_ACCENT, TITLE_FONT, TabHeader, Empty, SearchBox, Pills, iconBtn, dangerBtn, ago } from '../books/BooksAdminUi';
import { BookCover } from '../books/BooksUi';
import { KitProvider, type KitTheme } from '../PublicKit';
import { ORDER_STATUS_LABEL, readyLabel } from '../../src/lib/booksCommon';

interface Props {
  user: any;
  profileData: any;
  setProfileData: React.Dispatch<React.SetStateAction<any>>;
  showNotification: (message: string, type: 'success' | 'error') => void;
  plan: 'conecta' | 'pro' | 'ultra';
}

type View = 'pedidos' | 'tienda' | 'cobros';
type Filter = 'activos' | 'listos' | 'historial' | 'todos';

const NEXT: Partial<Record<BookOrderStatus, { to: BookOrderStatus; label: string }>> = {
  recibido: { to: 'preparando', label: 'Empezar a preparar' },
  preparando: { to: 'listo', label: 'Marcar listo' },
  listo: { to: 'entregado', label: 'Marcar entregado' },
};
const STATUS_COLOR: Record<BookOrderStatus, string> = { recibido: '#60a5fa', preparando: '#fbbf24', listo: '#34d399', entregado: '#94a3b8', cancelado: '#f87171' };
const TIMEZONES = [
  ['America/Guayaquil', 'Ecuador'], ['America/Caracas', 'Venezuela'], ['America/Bogota', 'Colombia'], ['America/Lima', 'Perú'],
  ['America/Mexico_City', 'México'], ['America/Santiago', 'Chile'], ['America/Argentina/Buenos_Aires', 'Argentina'],
  ['America/Panama', 'Panamá'], ['America/New_York', 'EE. UU. (Este)'], ['Europe/Madrid', 'España'],
];

const ORDER_COLUMNS: ExportColumn<BookOrder>[] = [
  { header: 'Código', get: r => r.tracking_code },
  { header: 'Fecha', get: r => String(r.created_at || '').slice(0, 16).replace('T', ' ') },
  { header: 'Cliente', get: r => r.customer_name },
  { header: 'Teléfono', get: r => r.customer_phone || '' },
  { header: 'Email', get: r => r.customer_email || '' },
  { header: 'Entrega', get: r => (r.delivery_type === 'envio' ? 'Envío' : 'Retiro en tienda') },
  { header: 'Dirección', get: r => r.delivery_address || '' },
  { header: 'Libros', get: r => (r.items || []).map(i => `${i.title} ×${i.qty}`).join('; ') },
  { header: 'Unidades', get: r => r.items_count },
  { header: 'Subtotal', get: r => Number(r.subtotal) },
  { header: 'Descuento', get: r => Number(r.discount_amount) },
  { header: 'Envío', get: r => Number(r.delivery_fee) },
  { header: 'Regalo', get: r => Number(r.gift_wrap_fee) },
  { header: 'Total', get: r => Number(r.total) },
  { header: 'Pago', get: r => (r.payment_status === 'pagado' ? 'Pagado' : 'Pendiente') },
  { header: 'Estado', get: r => ORDER_STATUS_LABEL[r.status] || r.status },
  { header: 'Código de lector', get: r => r.member_code || '' },
  { header: 'Lista', get: r => r.list_name || '' },
];

const waText = (o: BookOrder) => {
  const n = o.customer_name.split(' ')[0];
  if (o.status === 'recibido') return `Hola ${n}, recibimos tu pedido ${o.tracking_code} (${o.items_count} libro${o.items_count === 1 ? '' : 's'}, ${money(o.total)}). Ya apartamos tus libros.`;
  if (o.status === 'preparando') return `Hola ${n}, estamos preparando tu pedido ${o.tracking_code}.`;
  if (o.status === 'listo') return o.delivery_type === 'envio'
    ? `Hola ${n}, tu pedido ${o.tracking_code} ya está listo y sale hacia tu dirección.`
    : `Hola ${n}, tu pedido ${o.tracking_code} ya está listo para retirar. Total: ${money(o.total)}.`;
  if (o.status === 'entregado') return `Hola ${n}, gracias por tu compra (pedido ${o.tracking_code}). ¡Que disfrutes tus libros!`;
  return `Hola ${n}, sobre tu pedido ${o.tracking_code}:`;
};

export const BooksOrdersTab: React.FC<Props> = ({ user, profileData, setProfileData, showNotification, plan }) => {
  const isUltra = plan === 'ultra';
  const [view, setView] = useState<View>('pedidos');
  const [filter, setFilter] = useState<Filter>('activos');
  const [query, setQuery] = useState('');
  const t = useOwnerTable<BookOrder>({
    table: 'books_orders', ownerColumn: 'shop_profile_id', ownerId: user?.id, realtime: true, pollMs: 15000,
    order: [{ column: 'created_at', ascending: false }], onNew: () => ping(),
  });
  const orders = t.rows;

  const today = todayLocal();
  const kpis = useMemo(() => {
    const live = orders.filter(o => o.status !== 'cancelado');
    return {
      hoy: orders.filter(o => o.created_at.slice(0, 10) === today).length,
      porPreparar: orders.filter(o => o.status === 'recibido' || o.status === 'preparando').length,
      porCobrar: live.filter(o => o.payment_status === 'pendiente').reduce((a, o) => a + o.total, 0),
      mes: live.filter(o => o.created_at.slice(0, 7) === today.slice(0, 7)).reduce((a, o) => a + o.total, 0),
    };
  }, [orders, today]);

  const counts = useMemo(() => ({
    activos: orders.filter(o => o.status === 'recibido' || o.status === 'preparando').length,
    listos: orders.filter(o => o.status === 'listo').length,
    historial: orders.filter(o => o.status === 'entregado' || o.status === 'cancelado').length,
    todos: orders.length,
  }), [orders]);

  const shown = useMemo(() => {
    let list = orders;
    if (filter === 'activos') list = list.filter(o => o.status === 'recibido' || o.status === 'preparando');
    else if (filter === 'listos') list = list.filter(o => o.status === 'listo');
    else if (filter === 'historial') list = list.filter(o => o.status === 'entregado' || o.status === 'cancelado');
    const q = query.trim().toLowerCase();
    return q ? list.filter(o => [o.tracking_code, o.customer_name, o.customer_phone, o.customer_email, o.member_code].some(v => String(v || '').toLowerCase().includes(q))) : list;
  }, [orders, filter, query]);

  const update = async (o: BookOrder, patch: Partial<BookOrder>): Promise<boolean> => {
    t.setRows(rs => rs.map(x => (x.id === o.id ? { ...x, ...patch } : x)));          // optimista
    const { error } = await supabase.from('books_orders').update(patch).eq('id', o.id);
    if (error) {
      showNotification(/order_cancelled_final/.test(error.message) ? 'Un pedido cancelado no se puede reabrir.' : error.message, 'error');
      t.reload();
      return false;
    }
    return true;
  };
  const advance = async (o: BookOrder) => {
    const next = NEXT[o.status];
    if (!next) return;
    const patch: Partial<BookOrder> = { status: next.to };
    if (next.to === 'entregado' && o.payment_status === 'pendiente' && window.confirm('Este pedido no está marcado como pagado. ¿Marcarlo como pagado al entregarlo?')) patch.payment_status = 'pagado';
    await update(o, patch);
  };
  const cancel = async (o: BookOrder) => {
    if (!window.confirm(`¿Cancelar el pedido ${o.tracking_code}? Los libros vuelven al stock y esto no se puede deshacer.`)) return;
    await update(o, { status: 'cancelado' });
  };
  const remove = async (o: BookOrder) => {
    if (!window.confirm(`¿Eliminar el pedido ${o.tracking_code} del historial?`)) return;
    const { error } = await supabase.from('books_orders').delete().eq('id', o.id);
    if (error) return showNotification(error.message, 'error');
    t.setRows(rs => rs.filter(x => x.id !== o.id));
  };

  if (t.loading) return <Spinner accent={ACCENT} />;

  return (
    <div className="animate-fade-in-up space-y-6 max-w-4xl mx-auto px-4 md:px-6 pb-32" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      <TabHeader icon={<FaShoppingBag />} title="Pedidos" subtitle="Pedidos de tus lectores: prepara, avisa y cobra. Las copias se apartan solas al pedir." />
      <Pills<View> value={view} onChange={setView} items={[['pedidos', 'Pedidos'], ['tienda', 'Ajustes de la tienda'], ['cobros', 'Cobros']]} />

      {t.missingSql && <MissingSqlNotice file="setup_books.sql" accent={ACCENT} />}

      {view === 'pedidos' && !t.missingSql && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Pedidos hoy" value={kpis.hoy} accent={ACCENT} />
            <Kpi label="Por preparar" value={kpis.porPreparar} accent={ACCENT} tone={kpis.porPreparar > 0 ? 'warn' : undefined} />
            <Kpi label="Por cobrar" value={money(kpis.porCobrar)} accent={ACCENT} tone={kpis.porCobrar > 0 ? 'warn' : undefined} />
            <Kpi label="Ventas del mes" value={money(kpis.mes)} accent={ACCENT} tone="good" />
          </div>
          <SearchBox value={query} onChange={setQuery} placeholder="Buscar por código, nombre o teléfono" />
          <Pills<Filter> value={filter} onChange={setFilter} items={[['activos', `Por atender (${counts.activos})`], ['listos', `Listos (${counts.listos})`], ['historial', `Historial (${counts.historial})`], ['todos', `Todos (${counts.todos})`]]} />

          {shown.length === 0 ? (
            <Empty emoji="📦">{orders.length === 0 ? 'Aún no hay pedidos. Cuando un lector pida libros desde tu perfil, aparecerá aquí con una alerta.' : 'Nada por aquí con ese filtro.'}</Empty>
          ) : (
            <div className="space-y-3">
              {shown.map(o => <OrderCard key={o.id} o={o} isUltra={isUltra} onAdvance={() => advance(o)} onCancel={() => cancel(o)} onRemove={() => remove(o)}
                onPay={() => update(o, { payment_status: o.payment_status === 'pagado' ? 'pendiente' : 'pagado' })}
                onNote={note => update(o, { admin_note: note.trim() || null }).then(ok => ok && showNotification('Mensaje guardado.', 'success'))}
                showNotification={showNotification} onGiftPaid={note => update(o, { payment_status: 'pagado', admin_note: note })} />)}
            </div>
          )}

          <ExportRangePanel<BookOrder>
            accent={ACCENT} noun="pedidos" dateLabel="la fecha del pedido" fileBase="pedidos-libreria" sheetName="Pedidos"
            localRows={orders} getDate={r => r.created_at?.slice(0, 10)}
            fetchRange={range => fetchOwnerRange<BookOrder>({ table: 'books_orders', ownerColumn: 'shop_profile_id', ownerId: user.id, dateColumn: 'created_at', isTimestamp: true, range, orderBy: [{ column: 'created_at' }] })}
            columns={ORDER_COLUMNS} showNotification={showNotification} />
        </>
      )}

      {view === 'tienda' && <StoreSettings userId={user.id} plan={plan} profileData={profileData} setProfileData={setProfileData} showNotification={showNotification} />}
      {view === 'cobros' && <PaymentGatewaysPanel userId={user.id} profileData={profileData} setProfileData={setProfileData} showNotification={showNotification} accent={ACCENT} onAccent={ON_ACCENT} titleFont={TITLE_FONT} />}
    </div>
  );
};

/* ── Tarjeta de pedido ─────────────────────────────────────────────────────── */
const OrderCard: React.FC<{
  o: BookOrder; isUltra: boolean; onAdvance: () => void; onCancel: () => void; onRemove: () => void; onPay: () => void;
  onNote: (note: string) => void; onGiftPaid: (note: string) => Promise<boolean>; showNotification: Props['showNotification'];
}> = ({ o, isUltra, onAdvance, onCancel, onRemove, onPay, onNote, onGiftPaid, showNotification }) => {
  const [note, setNote] = useState(o.admin_note || '');
  const [gift, setGift] = useState<{ open: boolean; code: string; amount: string; busy: boolean }>({ open: false, code: '', amount: '', busy: false });
  const next = NEXT[o.status];
  const done = o.status === 'entregado' || o.status === 'cancelado';
  const label = o.status === 'listo' ? readyLabel(o.delivery_type) : ORDER_STATUS_LABEL[o.status];

  const redeem = async () => {
    const amount = Number(gift.amount.replace(',', '.'));
    if (!gift.code.trim() || !isFinite(amount) || amount <= 0) return showNotification('Escribe el código y el monto a canjear.', 'error');
    setGift(g => ({ ...g, busy: true }));
    const { data, error } = await supabase.rpc('books_redeem_giftcard', { p_code: gift.code.trim(), p_amount: amount, p_note: `Pedido ${o.tracking_code}` });
    if (error) { setGift(g => ({ ...g, busy: false })); return showNotification(isMissingSql(error) ? 'Falta ejecutar setup_books.sql.' : error.message, 'error'); }
    if (!data?.ok) {
      setGift(g => ({ ...g, busy: false }));
      const m: Record<string, string> = { not_found: 'No existe esa tarjeta.', not_active: 'La tarjeta no está activa.', insufficient: `Saldo insuficiente (${money(data.balance)}).`, bad_amount: 'Monto inválido.' };
      return showNotification(m[data.error] || 'No se pudo canjear.', 'error');
    }
    const covers = amount >= o.total - 0.001;
    showNotification(`Canjeado ${money(amount)}. Saldo de la tarjeta: ${money(data.balance)}.`, 'success');
    if (covers) await onGiftPaid(`Pagado con tarjeta de regalo ${data.code}`);
    setGift({ open: false, code: '', amount: '', busy: false });
  };

  return (
    <div className="rounded-2xl border p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.03)', borderColor: o.status === 'recibido' ? `${ACCENT}66` : 'rgba(255,255,255,0.08)', opacity: o.status === 'cancelado' ? 0.6 : 1 }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-black text-white tracking-widest">{o.tracking_code}</span>
            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md" style={{ background: `${STATUS_COLOR[o.status]}22`, color: STATUS_COLOR[o.status] }}>{label}</span>
            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md" style={o.payment_status === 'pagado' ? { background: 'rgba(52,211,153,0.15)', color: '#34d399' } : { background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}>{o.payment_status === 'pagado' ? 'Pagado' : 'Sin cobrar'}</span>
          </div>
          <p className="text-white font-bold mt-1" style={{ fontFamily: TITLE_FONT }}>{o.customer_name}</p>
          <p className="text-[11px] text-white/45">{[o.customer_phone, o.customer_email].filter(Boolean).join(' · ')} · {ago(o.created_at)}</p>
        </div>
        <p className="text-xl font-bold text-white shrink-0" style={{ fontFamily: TITLE_FONT }}>{money(o.total)}</p>
      </div>

      <div className="space-y-1.5">
        {(o.items || []).map((it, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <div className="w-7 h-10 rounded overflow-hidden shrink-0 bg-black/30">
              <KitProvider theme={MINI_THEME}><BookCover t={{ title: it.title, author: it.author, cover_url: it.cover }} /></KitProvider>
            </div>
            <p className="flex-1 min-w-0 text-[13px] text-white truncate">{it.title}</p>
            <span className="text-xs text-white/50">× {it.qty}</span>
            <span className="text-xs text-white/70 w-16 text-right">{money(it.total)}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-white/55">
        <span className="flex items-center gap-1.5">{o.delivery_type === 'envio' ? <FaTruck size={10} /> : <FaStore size={10} />} {o.delivery_type === 'envio' ? 'Envío' : 'Retiro en tienda'}</span>
        {o.discount_amount > 0 && <span>Descuento de lector −{money(o.discount_amount)} ({o.member_code})</span>}
        {o.delivery_fee > 0 && <span>Envío {money(o.delivery_fee)}</span>}
        {o.list_name && <span>Lista: {o.list_name}</span>}
        {o.member_code && o.discount_amount === 0 && <span>Lector {o.member_code}</span>}
      </div>
      {o.delivery_type === 'envio' && o.delivery_address && <p className="text-[12px] text-white/70 rounded-lg bg-white/[0.04] px-3 py-2">📍 {o.delivery_address}</p>}
      {o.gift_wrap && (
        <div className="rounded-lg px-3 py-2 text-[12px]" style={{ background: `${ACCENT}14`, border: `1px solid ${ACCENT}44` }}>
          <b className="flex items-center gap-1.5 text-white"><FaGift size={11} style={{ color: ACCENT }} /> Para regalo{o.gift_wrap_fee > 0 ? ` (+${money(o.gift_wrap_fee)})` : ''}</b>
          {o.gift_message && <p className="text-white/70 italic mt-1 whitespace-pre-wrap">“{o.gift_message}”</p>}
        </div>
      )}
      {o.notes && <p className="text-[12px] text-white/60 italic">Nota del cliente: {o.notes}</p>}

      {!done && (
        <div className="flex gap-2">
          <input className={adminInput} value={note} onChange={e => setNote(e.target.value)} placeholder="Mensaje para el cliente (lo ve al rastrear)" aria-label="Mensaje para el cliente" />
          <button type="button" onClick={() => onNote(note)} disabled={note.trim() === (o.admin_note || '')} className="shrink-0 px-4 rounded-xl text-[11px] font-bold uppercase border border-white/15 text-white/70 hover:text-white disabled:opacity-30">Guardar</button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {next && <button type="button" onClick={onAdvance} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider" style={{ background: ACCENT, color: ON_ACCENT }}><FaCheck size={10} /> {next.label}</button>}
        {o.status !== 'cancelado' && <button type="button" onClick={onPay} className="px-3 py-2.5 rounded-xl text-[11px] font-bold uppercase border border-white/15 text-white/70 hover:text-white">{o.payment_status === 'pagado' ? 'Quitar pago' : 'Marcar pagado'}</button>}
        {isUltra && o.payment_status === 'pendiente' && o.status !== 'cancelado' && <button type="button" onClick={() => setGift(g => ({ ...g, open: !g.open, amount: g.amount || String(o.total) }))} className="px-3 py-2.5 rounded-xl text-[11px] font-bold uppercase border border-white/15 text-white/70 hover:text-white flex items-center gap-1.5"><FaCreditCard size={10} /> Tarjeta de regalo</button>}
        {o.customer_phone && <a href={waLink(o.customer_phone, waText(o))} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp al cliente" className={iconBtn}><FaWhatsapp size={13} style={{ color: '#25D366' }} /></a>}
        {o.status !== 'cancelado' && o.status !== 'entregado' && <button type="button" onClick={onCancel} aria-label="Cancelar pedido" title="Cancelar pedido" className={dangerBtn}><FaBan size={11} /></button>}
        {done && <button type="button" onClick={onRemove} aria-label="Eliminar del historial" className={dangerBtn}><FaTrash size={11} /></button>}
      </div>

      {gift.open && (
        <div className="rounded-xl border border-white/10 p-3 flex flex-wrap gap-2 items-end bg-black/20">
          <Field label="Código" className="flex-1 min-w-[130px]"><input className={adminInput} value={gift.code} onChange={e => setGift(g => ({ ...g, code: e.target.value.toUpperCase() }))} placeholder="G-XXXXXX" /></Field>
          <Field label="Monto" className="w-28"><input className={adminInput} inputMode="decimal" value={gift.amount} onChange={e => setGift(g => ({ ...g, amount: e.target.value }))} /></Field>
          <button type="button" onClick={redeem} disabled={gift.busy} className="px-4 py-2.5 rounded-xl text-[11px] font-black uppercase disabled:opacity-50" style={{ background: ACCENT, color: ON_ACCENT }}>{gift.busy ? '…' : 'Canjear'}</button>
        </div>
      )}
    </div>
  );
};

// Las portadas del panel reutilizan BookCover, que lee el tema del perfil público.
const MINI_THEME: KitTheme = {
  accent: ACCENT, accentLight: '#f6cf86', accentDark: '#9c6a1c', bg: '#0b1512', surface: '#12211c', text: '#f1e8d6', onAccent: ON_ACCENT,
  titleFont: TITLE_FONT, bodyFont: "'Space Grotesk', sans-serif", heading: 'fleuron', logo: 'arch',
};

/* ── Ajustes de la tienda ─────────────────────────────────────────────────── */
const StoreSettings: React.FC<{ userId: string; plan: Props['plan']; profileData: any; setProfileData: Props['setProfileData']; showNotification: Props['showNotification'] }> = ({ userId, plan, profileData, setProfileData, showNotification }) => {
  const { settings, save, saving } = useJsonSettings<BooksSettings>('books_settings', userId, profileData, setProfileData, showNotification);
  const [draft, setDraft] = useState<BooksSettings>({});
  const v = { ...settings, ...draft };
  const set = (patch: BooksSettings) => setDraft(d => ({ ...d, ...patch }));
  const n = (raw: string) => (raw === '' ? 0 : Math.max(Number(raw.replace(',', '.')) || 0, 0));
  return (
    <div className="rounded-2xl border p-5 space-y-4" style={{ background: `${ACCENT}0a`, borderColor: `${ACCENT}2b` }}>
      <p className="text-xs font-black uppercase tracking-widest text-white flex items-center gap-2"><FaCog style={{ color: ACCENT }} /> Cómo vendes y entregas</p>
      <label className="flex items-center gap-2 text-sm text-white/70"><input type="checkbox" checked={v.ordersEnabled !== false} onChange={e => set({ ordersEnabled: e.target.checked })} /> Recibir pedidos en línea</label>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-white/80 font-semibold"><input type="checkbox" checked={v.pickupEnabled !== false} onChange={e => set({ pickupEnabled: e.target.checked })} /> <FaStore size={12} style={{ color: ACCENT }} /> Retiro en tienda</label>
          <Field label="Indicaciones para retirar" hint="Dirección exacta, horario, a quién preguntar…"><textarea className={adminInput} rows={2} value={v.pickupNote ?? ''} onChange={e => set({ pickupNote: e.target.value })} /></Field>
        </div>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-white/80 font-semibold"><input type="checkbox" checked={v.deliveryEnabled === true} onChange={e => set({ deliveryEnabled: e.target.checked })} /> <FaTruck size={12} style={{ color: ACCENT }} /> Envío a domicilio</label>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Costo de envío ($)"><input className={adminInput} inputMode="decimal" value={v.deliveryFee ?? 0} onChange={e => set({ deliveryFee: n(e.target.value) })} /></Field>
            <Field label="Gratis desde ($)" hint="0 = nunca"><input className={adminInput} inputMode="decimal" value={v.freeShippingFrom ?? 0} onChange={e => set({ freeShippingFrom: n(e.target.value) })} /></Field>
          </div>
          <Field label="Nota de envío" hint="Zonas, tiempos, empresa de mensajería…"><textarea className={adminInput} rows={2} value={v.deliveryNote ?? ''} onChange={e => set({ deliveryNote: e.target.value })} /></Field>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Field label={`Envoltorio de regalo ($)${plan === 'conecta' ? ' · PRO' : ''}`} hint="0 = sin costo"><input className={adminInput} inputMode="decimal" disabled={plan === 'conecta'} value={v.giftWrapFee ?? 0} onChange={e => set({ giftWrapFee: n(e.target.value) })} /></Field>
        <Field label="Días de apartado" hint="Cuánto guardas un pedido"><input className={adminInput} inputMode="numeric" value={v.holdDays ?? ''} onChange={e => set({ holdDays: e.target.value === '' ? undefined : Math.min(Math.round(n(e.target.value)), 90) })} /></Field>
        <Field label="Zona horaria"><select className={adminInput} value={v.timezone ?? 'America/Guayaquil'} onChange={e => set({ timezone: e.target.value })}>{TIMEZONES.map(([z, l]) => <option key={z} value={z}>{l}</option>)}</select></Field>
      </div>

      <button disabled={saving || Object.keys(draft).length === 0} onClick={async () => { if (await save(draft, 'Ajustes guardados.')) setDraft({}); }}
        className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider disabled:opacity-40" style={{ background: ACCENT, color: ON_ACCENT }}>{saving ? 'Guardando…' : 'Guardar ajustes'}</button>
    </div>
  );
};

export default BooksOrdersTab;
