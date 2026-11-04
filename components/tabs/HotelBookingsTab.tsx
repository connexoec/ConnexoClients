import React, { useMemo, useState } from 'react';
import { supabase } from '../../src/lib/supabase';
import type { HotelBooking, HotelRoom, HotelSettings, HotelBookingStatus, HotelPaymentStatus } from '../../types';
import {
  FaConciergeBell, FaWhatsapp, FaTrash, FaSearch, FaPhone, FaEnvelope, FaSignInAlt, FaSignOutAlt, FaBed, FaPlus, FaSave, FaUsers,
} from 'react-icons/fa';
import {
  useOwnerTable, AdminModal, Field, adminInput, Spinner, MissingSqlNotice, Kpi, Pill, ping, waLink, todayLocal, addDaysLocal, fmtDate, money, isMissingSql,
} from '../AdminKit';
import { ExportRangePanel, fetchOwnerRange, type ExportColumn } from '../ExportRangePanel';

interface Props {
  user: any;
  profileData: any;
  showNotification: (message: string, type: 'success' | 'error') => void;
}

const ACCENT = '#d9958b';
const ON_ACCENT = '#1a0d10';
const TITLE_FONT = "'Merriweather', serif";

const STATUS: { val: HotelBookingStatus; label: string; color: string }[] = [
  { val: 'pendiente', label: 'Pendiente', color: '#fbbf24' }, { val: 'confirmada', label: 'Confirmada', color: '#60a5fa' },
  { val: 'en_casa', label: 'En casa', color: '#34d399' }, { val: 'completada', label: 'Completada', color: '#a78bfa' },
  { val: 'cancelada', label: 'Cancelada', color: '#9ca3af' }, { val: 'no_show', label: 'No se presentó', color: '#f87171' },
];
const STATUS_META = Object.fromEntries(STATUS.map(s => [s.val, s])) as Record<string, (typeof STATUS)[number]>;
const PAYMENT: { val: HotelPaymentStatus; label: string }[] = [{ val: 'pendiente', label: 'Sin pago' }, { val: 'deposito', label: 'Depósito' }, { val: 'pagado', label: 'Pagado' }];
const LIVE: HotelBookingStatus[] = ['pendiente', 'confirmada', 'en_casa'];
const RPC_ERRORS: Record<string, string> = {
  no_availability: 'No hay disponibilidad de ese tipo para esas fechas.', capacity_exceeded: 'La habitación no admite tantos huéspedes.',
  min_nights: 'No cumple la estancia mínima de esa habitación.', bad_dates: 'Revisa las fechas.', past_date: 'La llegada no puede ser pasada.',
  name_required: 'Escribe el nombre del huésped.', contact_required: 'Indica teléfono o email.', booking_unavailable: 'Las reservas en línea están desactivadas en Políticas.',
  room_unavailable: 'Esa habitación está oculta o no existe.', too_long: 'Máximo 60 noches por reserva.',
};

const COLUMNS: ExportColumn<HotelBooking>[] = [
  { header: 'Llegada', get: r => r.check_in }, { header: 'Salida', get: r => r.check_out }, { header: 'Noches', get: r => r.nights },
  { header: 'Huésped', get: r => r.guest_name }, { header: 'Teléfono', get: r => r.guest_phone || '' }, { header: 'Email', get: r => r.guest_email || '' },
  { header: 'Habitación', get: r => r.room_name || '' }, { header: 'Unidades', get: r => r.rooms_count }, { header: 'Adultos', get: r => r.adults }, { header: 'Niños', get: r => r.children },
  { header: 'Hospedaje', get: r => Number(r.rooms_subtotal) }, { header: 'Descuento', get: r => Number(r.discount_amount) }, { header: 'Servicios', get: r => Number(r.services_total) },
  { header: 'Impuestos', get: r => Number(r.tax_amount) }, { header: 'Total', get: r => Number(r.total) }, { header: 'Depósito', get: r => Number(r.deposit_required) },
  { header: 'Pago', get: r => PAYMENT.find(p => p.val === r.payment_status)?.label || r.payment_status },
  { header: 'Estado', get: r => STATUS_META[r.status]?.label || r.status }, { header: 'Código', get: r => r.confirmation_code },
  { header: 'Código de huésped', get: r => r.member_code || '' }, { header: 'Hora de llegada', get: r => r.arrival_time || '' },
  { header: 'Peticiones', get: r => r.special_requests || '' }, { header: 'Reservada el', get: r => (r.created_at ? new Date(r.created_at).toLocaleString('es-EC') : '') },
];

type Filter = 'proximas' | HotelBookingStatus | 'historial' | 'todas';

export const HotelBookingsTab: React.FC<Props> = ({ user, profileData, showNotification }) => {
  const [alertMsg, setAlertMsg] = useState<string | null>(null);
  const bookingsT = useOwnerTable<HotelBooking>({
    table: 'hotel_bookings', ownerColumn: 'hotel_profile_id', ownerId: user?.id, pollMs: 12000,
    order: [{ column: 'check_in' }, { column: 'created_at' }],
    onNew: fresh => { ping(); setAlertMsg(`🛎️ Nueva reserva: ${fresh[0].guest_name} · ${fresh[0].room_name || 'Habitación'}`); setTimeout(() => setAlertMsg(null), 7000); },
  });
  const roomsT = useOwnerTable<HotelRoom>({ table: 'hotel_rooms', ownerColumn: 'hotel_profile_id', ownerId: user?.id, realtime: false, order: [{ column: 'sort_order' }] });
  const bookings = bookingsT.rows;
  const settings: HotelSettings = profileData?.hotel_settings || {};
  const hotelName = profileData?.displayName || 'nuestro hotel';
  const today = todayLocal(); const tomorrow = addDaysLocal(today, 1);

  const [filter, setFilter] = useState<Filter>('proximas');
  const [query, setQuery] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [manualOpen, setManualOpen] = useState(false);

  const live = bookings.filter(b => LIVE.includes(b.status));
  const arrivalsToday = live.filter(b => b.status !== 'en_casa' && b.check_in === today);
  const arrivalsTomorrow = live.filter(b => b.status !== 'en_casa' && b.check_in === tomorrow);
  const departuresToday = live.filter(b => b.status === 'en_casa' && b.check_out <= today);
  const inHouse = bookings.filter(b => b.status === 'en_casa');
  const pending = bookings.filter(b => b.status === 'pendiente');

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = bookings.filter(b => {
      if (filter === 'proximas') return LIVE.includes(b.status) && b.check_out >= today;
      if (filter === 'historial') return !LIVE.includes(b.status);
      if (filter === 'todas') return true;
      return b.status === filter;
    });
    if (q) rows = rows.filter(b => `${b.guest_name} ${b.guest_phone || ''} ${b.guest_email || ''} ${b.confirmation_code} ${b.room_name || ''}`.toLowerCase().includes(q));
    return filter === 'historial' || filter === 'todas' ? [...rows].reverse() : rows;
  }, [bookings, filter, query, today]);

  const patch = async (b: HotelBooking, values: Partial<HotelBooking>) => {
    const { error } = await supabase.from('hotel_bookings').update(values).eq('id', b.id);
    if (error) return showNotification(error.message, 'error');
    bookingsT.setRows(p => p.map(x => x.id === b.id ? { ...x, ...values } : x));
  };
  const remove = async (b: HotelBooking) => {
    if (!window.confirm(`¿Eliminar la reserva de ${b.guest_name}? Esto no se puede deshacer; si solo se canceló, mejor márcala como cancelada.`)) return;
    const { error } = await supabase.from('hotel_bookings').delete().eq('id', b.id);
    if (error) return showNotification(error.message, 'error');
    bookingsT.setRows(p => p.filter(x => x.id !== b.id));
  };
  const saveNote = async (b: HotelBooking) => {
    const note = (notes[b.id] ?? b.admin_note ?? '').trim() || null;
    await patch(b, { admin_note: note });
    setNotes(p => { const n = { ...p }; delete n[b.id]; return n; });
    showNotification('Mensaje guardado: el huésped lo verá al consultar su reserva.', 'success');
  };

  const confirmMsg = (b: HotelBooking) => {
    const first = b.guest_name.split(' ')[0];
    return `Hola ${first}, tu reserva ${b.confirmation_code} en ${hotelName} está ${b.status === 'pendiente' ? 'recibida' : 'confirmada'}: ${b.room_name || 'habitación'}${b.rooms_count > 1 ? ` x${b.rooms_count}` : ''}, del ${fmtDate(b.check_in, { day: 'numeric', month: 'long' })} al ${fmtDate(b.check_out, { day: 'numeric', month: 'long' })} (${b.nights} noche${b.nights === 1 ? '' : 's'}). Total: ${money(Number(b.total))}.${Number(b.deposit_required) > 0 && b.payment_status === 'pendiente' ? ` Para garantizarla necesitamos un depósito de ${money(Number(b.deposit_required))}.` : ''}${settings.checkInTime ? ` Check-in desde las ${settings.checkInTime}.` : ''} ¡Te esperamos!`;
  };
  const arrivalMsg = (b: HotelBooking, when: string) => `Hola ${b.guest_name.split(' ')[0]}, te esperamos ${when} en ${hotelName}${settings.checkInTime ? ` (check-in desde las ${settings.checkInTime})` : ''}. Tu código de reserva es ${b.confirmation_code}. ¿Necesitas algo antes de llegar?`;

  if (bookingsT.loading) return <Spinner accent={ACCENT} />;

  const agendaRow = (b: HotelBooking, msg: string) => (
    <div key={b.id} className="flex items-center gap-3 rounded-lg border px-3 py-2.5 bg-black/20 border-white/5">
      <div className="min-w-0 flex-1"><p className="text-white text-sm font-semibold truncate">{b.guest_name}</p><p className="text-[11px] text-white/40 truncate">{[b.room_name, b.arrival_time, `${b.adults + b.children} pers.`].filter(Boolean).join(' · ')}</p></div>
      {b.guest_phone && <a href={waLink(b.guest_phone, msg)} target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-lg bg-[#25D366]/10 border border-[#25D366]/20 text-[#25D366] flex items-center justify-center"><FaWhatsapp size={13} /></a>}
    </div>
  );

  return (
    <div className="animate-fade-in-up space-y-6 max-w-4xl mx-auto px-4 md:px-6 pb-32" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5" style={{ borderColor: `${ACCENT}26` }}>
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2" style={{ fontFamily: TITLE_FONT }}><FaConciergeBell style={{ color: ACCENT }} /> Reservas</h2>
          <p className="text-sm text-white/40 mt-1">Llegadas, estancias y salidas. Confirma, haz check-in y cobra desde aquí.</p>
        </div>
        <button onClick={() => setManualOpen(true)} className="flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl" style={{ background: ACCENT, color: ON_ACCENT }}><FaPlus /> Reserva manual</button>
      </div>

      {bookingsT.missingSql && <MissingSqlNotice file="setup_hotel.sql" accent={ACCENT} />}
      {alertMsg && <div className="p-4 text-sm font-bold rounded-xl flex items-center justify-between" style={{ background: `${ACCENT}1a`, border: `1px solid ${ACCENT}4d`, color: ACCENT }}><span>{alertMsg}</span><button onClick={() => setAlertMsg(null)} className="opacity-60 hover:opacity-100">✕</button></div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Llegadas hoy" value={arrivalsToday.length} icon={<FaSignInAlt />} accent={ACCENT} />
        <Kpi label="En casa" value={inHouse.length} icon={<FaBed />} accent={ACCENT} tone="good" />
        <Kpi label="Salidas hoy" value={departuresToday.length} icon={<FaSignOutAlt />} accent={ACCENT} />
        <Kpi label="Por confirmar" value={pending.length} icon={<FaConciergeBell />} accent={ACCENT} tone={pending.length ? 'warn' : undefined} />
      </div>

      {(arrivalsToday.length > 0 || arrivalsTomorrow.length > 0 || departuresToday.length > 0) && (
        <div className="rounded-2xl border p-4 space-y-4" style={{ background: `${ACCENT}0a`, borderColor: `${ACCENT}2b` }}>
          <p className="text-xs font-black uppercase tracking-widest text-white">Agenda del día</p>
          {arrivalsToday.length > 0 && <div className="space-y-2"><p className="text-[10px] font-black uppercase tracking-[0.25em]" style={{ color: ACCENT }}>Llegan hoy</p>{arrivalsToday.map(b => agendaRow(b, arrivalMsg(b, 'hoy')))}</div>}
          {departuresToday.length > 0 && <div className="space-y-2"><p className="text-[10px] font-black uppercase tracking-[0.25em]" style={{ color: ACCENT }}>Salen hoy</p>{departuresToday.map(b => agendaRow(b, `Hola ${b.guest_name.split(' ')[0]}, gracias por hospedarte en ${hotelName}. Recuerda que el check-out es${settings.checkOutTime ? ` a las ${settings.checkOutTime}` : ' hoy'}. ¡Esperamos verte pronto!`))}</div>}
          {arrivalsTomorrow.length > 0 && <div className="space-y-2"><p className="text-[10px] font-black uppercase tracking-[0.25em]" style={{ color: ACCENT }}>Llegan mañana</p>{arrivalsTomorrow.map(b => agendaRow(b, arrivalMsg(b, 'mañana')))}</div>}
        </div>
      )}

      <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-3"><FaSearch className="text-white/30" size={12} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por huésped, teléfono o código…" className="bg-transparent w-full py-2.5 text-sm text-white focus:outline-none placeholder-white/30" /></div>
      <div className="flex flex-wrap gap-2">
        {([['proximas', 'Próximas'], ['pendiente', 'Pendientes'], ['confirmada', 'Confirmadas'], ['en_casa', 'En casa'], ['historial', 'Historial'], ['todas', 'Todas']] as const).map(([f, l]) => (
          <Pill key={f} active={filter === f} onClick={() => setFilter(f)} accent={ACCENT} onAccent={ON_ACCENT}>{l}</Pill>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="text-center py-16 text-white/30"><p className="text-4xl mb-3">🛎️</p><p className="text-sm">{bookings.length === 0 ? 'Cuando un huésped reserve desde tu perfil, aparecerá aquí al instante.' : 'No hay reservas en este filtro.'}</p></div>
      ) : (
        <div className="space-y-3">
          {list.map(b => {
            const st = STATUS_META[b.status]; const noteVal = notes[b.id] ?? b.admin_note ?? '';
            return (
              <div key={b.id} className="rounded-2xl border p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.03)', borderColor: b.status === 'pendiente' ? `${ACCENT}55` : 'rgba(255,255,255,0.08)', opacity: b.status === 'cancelada' ? 0.6 : 1 }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-white font-bold truncate">{b.guest_name}</h3>
                      <span className="text-[10px] font-black uppercase tracking-widest rounded-full px-2 py-0.5" style={{ color: st?.color, background: `${st?.color}1f`, border: `1px solid ${st?.color}55` }}>{st?.label}</span>
                      <span className="text-[10px] font-mono font-black tracking-widest rounded-md px-2 py-0.5 bg-black/40 border border-white/10 text-white/70">{b.confirmation_code}</span>
                      {b.member_code && <span className="text-[10px] font-mono font-black tracking-widest rounded-md px-2 py-0.5" style={{ color: ACCENT, border: `1px solid ${ACCENT}44` }}>{b.member_code}</span>}
                    </div>
                    <p className="text-sm text-white/80 mt-1.5"><b>{fmtDate(b.check_in, { weekday: 'short', day: 'numeric', month: 'short' })}</b> → <b>{fmtDate(b.check_out, { weekday: 'short', day: 'numeric', month: 'short' })}</b> · {b.nights} noche{b.nights === 1 ? '' : 's'}</p>
                    <p className="text-[12px] text-white/50 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1"><span className="flex items-center gap-1"><FaBed size={10} /> {b.room_name || 'Habitación'}{b.rooms_count > 1 ? ` × ${b.rooms_count}` : ''}</span><span className="flex items-center gap-1"><FaUsers size={10} /> {b.adults} ad.{b.children ? ` + ${b.children} niñ.` : ''}</span>{b.arrival_time && <span>🕒 {b.arrival_time}</span>}</p>
                    <p className="text-[11px] text-white/40 mt-1 flex flex-wrap items-center gap-x-3">{b.guest_phone && <span className="flex items-center gap-1"><FaPhone size={9} /> {b.guest_phone}</span>}{b.guest_email && <span className="flex items-center gap-1"><FaEnvelope size={9} /> {b.guest_email}</span>}</p>
                    {b.special_requests && <p className="text-[12px] text-white/55 mt-1.5 italic">“{b.special_requests}”</p>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {b.guest_phone && <a href={waLink(b.guest_phone, confirmMsg(b))} target="_blank" rel="noopener noreferrer" title="Enviar detalle por WhatsApp" className="w-8 h-8 rounded-lg bg-[#25D366]/10 border border-[#25D366]/20 text-[#25D366] flex items-center justify-center hover:bg-[#25D366]/20 transition"><FaWhatsapp size={13} /></a>}
                    <button title="Eliminar" onClick={() => remove(b)} className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center hover:bg-red-500/20 transition"><FaTrash size={11} /></button>
                  </div>
                </div>

                <div className="rounded-xl border border-white/5 bg-black/20 p-3 text-[12px] text-white/60 space-y-1">
                  <div className="flex justify-between"><span>Hospedaje</span><span>{money(Number(b.rooms_subtotal))}</span></div>
                  {Number(b.discount_amount) > 0 && <div className="flex justify-between" style={{ color: ACCENT }}><span>Descuento del club ({b.discount_percent}%)</span><span>− {money(Number(b.discount_amount))}</span></div>}
                  {b.services?.map((s, i) => <div key={i} className="flex justify-between"><span>{s.name}{s.qty > 1 ? ` × ${s.qty}` : ''}</span><span>{money(Number(s.total))}</span></div>)}
                  {Number(b.tax_amount) > 0 && <div className="flex justify-between"><span>Impuestos ({b.tax_percent}%)</span><span>{money(Number(b.tax_amount))}</span></div>}
                  <div className="flex justify-between text-white font-bold pt-1 border-t border-white/10"><span>Total</span><span>{money(Number(b.total))}</span></div>
                  {Number(b.deposit_required) > 0 && <div className="flex justify-between text-white/45"><span>Depósito solicitado</span><span>{money(Number(b.deposit_required))}</span></div>}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {PAYMENT.map(p => <button key={p.val} onClick={() => patch(b, { payment_status: p.val })} className="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border transition"
                    style={b.payment_status === p.val ? { background: p.val === 'pagado' ? '#34d399' : p.val === 'deposito' ? '#60a5fa' : '#fbbf24', color: '#0a0a0a', borderColor: 'transparent' } : { background: 'transparent', color: 'rgba(255,255,255,0.45)', borderColor: 'rgba(255,255,255,0.12)' }}>💳 {p.label}</button>)}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {STATUS.map(s => <button key={s.val} onClick={() => patch(b, { status: s.val })} className="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border transition"
                    style={b.status === s.val ? { background: s.color, color: '#0a0a0a', borderColor: s.color } : { background: 'transparent', color: 'rgba(255,255,255,0.45)', borderColor: 'rgba(255,255,255,0.12)' }}>{s.label}</button>)}
                </div>
                <div className="flex gap-2">
                  <input value={noteVal} onChange={e => setNotes(p => ({ ...p, [b.id]: e.target.value }))} placeholder="Mensaje para el huésped (lo ve al consultar su reserva)" className="flex-1 bg-black/30 border border-white/5 text-white text-sm rounded-lg px-3 py-2 focus:outline-none placeholder-gray-600" />
                  {notes[b.id] !== undefined && <button onClick={() => saveNote(b)} className="shrink-0 px-3.5 rounded-lg text-xs font-black uppercase" style={{ background: ACCENT, color: ON_ACCENT }}><FaSave /></button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ExportRangePanel<HotelBooking>
        accent={ACCENT} noun="reservas" dateLabel="la fecha de llegada" fileBase="reservas-hotel" sheetName="Reservas"
        localRows={bookings} getDate={r => r.check_in}
        fetchRange={range => fetchOwnerRange<HotelBooking>({ table: 'hotel_bookings', ownerColumn: 'hotel_profile_id', ownerId: user.id, dateColumn: 'check_in', range, orderBy: [{ column: 'check_in' }] })}
        columns={COLUMNS} showNotification={showNotification} />

      {manualOpen && <ManualModal userId={user.id} rooms={roomsT.rows} showNotification={showNotification} onClose={() => setManualOpen(false)} onDone={() => { setManualOpen(false); bookingsT.reload(); }} />}
    </div>
  );
};

/* ── Reserva por teléfono / mostrador ─────────────────────────────────────── */
const ManualModal: React.FC<{ userId: string; rooms: HotelRoom[]; showNotification: Props['showNotification']; onClose: () => void; onDone: () => void }> = ({ userId, rooms, showNotification, onClose, onDone }) => {
  const [roomId, setRoomId] = useState(rooms[0]?.id || '');
  const [checkIn, setCheckIn] = useState(todayLocal()); const [checkOut, setCheckOut] = useState(addDaysLocal(todayLocal(), 1));
  const [adults, setAdults] = useState('2'); const [children, setChildren] = useState('0'); const [count, setCount] = useState('1');
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [email, setEmail] = useState(''); const [requests, setRequests] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!roomId) return showNotification('Primero crea una habitación.', 'error');
    setBusy(true);
    // Usa el mismo motor que el perfil público: valida disponibilidad, tarifas y calcula el total.
    const { data, error } = await supabase.rpc('place_hotel_booking', {
      p_hotel_id: userId, p_room_id: roomId, p_check_in: checkIn, p_check_out: checkOut, p_adults: Number(adults) || 1, p_children: Number(children) || 0,
      p_rooms_count: Number(count) || 1, p_name: name.trim(), p_phone: phone.trim() || null, p_email: email.trim() || null,
      p_services: [], p_requests: requests.trim() || null, p_arrival_time: null, p_member_code: null, p_source_campaign: 'manual',
    });
    if (error) { setBusy(false); return showNotification(isMissingSql(error) ? 'Falta ejecutar setup_hotel.sql en Supabase.' : error.message, 'error'); }
    if (!data?.ok) { setBusy(false); return showNotification(RPC_ERRORS[data?.error] || 'No se pudo crear la reserva.', 'error'); }
    // Una reserva tomada por el propio hotel nace confirmada.
    await supabase.from('hotel_bookings').update({ status: 'confirmada' }).eq('id', data.id);
    setBusy(false);
    showNotification(`Reserva ${data.confirmation_code} creada y confirmada · ${money(Number(data.total))}.`, 'success');
    onDone();
  };

  return (
    <AdminModal title="Reserva manual" accent={ACCENT} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-white/45">Para reservas por teléfono o en mostrador. Valida la disponibilidad igual que el perfil público y nace confirmada.</p>
        <Field label="Habitación *"><select className={adminInput} value={roomId} onChange={e => setRoomId(e.target.value)}>{rooms.length === 0 && <option value="">— Sin habitaciones —</option>}{rooms.map(r => <option key={r.id} value={r.id}>{r.name} · {money(r.base_price)}/noche</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Llegada"><input type="date" className={adminInput} value={checkIn} onChange={e => { setCheckIn(e.target.value); if (checkOut <= e.target.value) setCheckOut(addDaysLocal(e.target.value, 1)); }} /></Field>
          <Field label="Salida"><input type="date" className={adminInput} min={addDaysLocal(checkIn, 1)} value={checkOut} onChange={e => setCheckOut(e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Adultos"><input type="number" min={1} className={adminInput} value={adults} onChange={e => setAdults(e.target.value)} /></Field>
          <Field label="Niños"><input type="number" min={0} className={adminInput} value={children} onChange={e => setChildren(e.target.value)} /></Field>
          <Field label="Habitaciones"><input type="number" min={1} className={adminInput} value={count} onChange={e => setCount(e.target.value)} /></Field>
        </div>
        <Field label="Huésped *"><input className={adminInput} value={name} onChange={e => setName(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Teléfono"><input className={adminInput} value={phone} onChange={e => setPhone(e.target.value)} /></Field>
          <Field label="Email"><input className={adminInput} value={email} onChange={e => setEmail(e.target.value)} /></Field>
        </div>
        <Field label="Peticiones"><input className={adminInput} value={requests} onChange={e => setRequests(e.target.value)} /></Field>
        <button onClick={submit} disabled={busy} className="w-full py-3 rounded-xl text-sm font-black uppercase tracking-wider disabled:opacity-50" style={{ background: ACCENT, color: ON_ACCENT }}>{busy ? 'Creando…' : 'Crear reserva'}</button>
      </div>
    </AdminModal>
  );
};

export default HotelBookingsTab;
