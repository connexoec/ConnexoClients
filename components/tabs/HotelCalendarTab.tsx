import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../src/lib/supabase';
import type { HotelRoom, HotelBooking, HotelBlock, HotelRate } from '../../types';
import { FaCalendarAlt, FaChevronLeft, FaChevronRight, FaPlus, FaTrash, FaPen, FaLock, FaTags, FaToggleOn, FaToggleOff } from 'react-icons/fa';
import { useOwnerTable, AdminModal, Field, adminInput, Spinner, MissingSqlNotice, Pill, todayLocal, addDaysLocal, fmtDate, money, isMissingSql } from '../AdminKit';

interface Props {
  user: any;
  showNotification: (message: string, type: 'success' | 'error') => void;
}

const ACCENT = '#d9958b';
const ON_ACCENT = '#1a0d10';
const TITLE_FONT = "'Merriweather', serif";
const DAYS = 21;
const LIVE = ['pendiente', 'confirmada', 'en_casa'];

export const HotelCalendarTab: React.FC<Props> = ({ user, showNotification }) => {
  const [view, setView] = useState<'ocupacion' | 'bloqueos' | 'tarifas'>('ocupacion');
  const [from, setFrom] = useState(todayLocal());
  const roomsT = useOwnerTable<HotelRoom>({ table: 'hotel_rooms', ownerColumn: 'hotel_profile_id', ownerId: user?.id, realtime: false, order: [{ column: 'sort_order' }, { column: 'base_price' }] });
  const blocksT = useOwnerTable<HotelBlock>({ table: 'hotel_blocks', ownerColumn: 'hotel_profile_id', ownerId: user?.id, realtime: false, order: [{ column: 'date_from' }] });
  const ratesT = useOwnerTable<HotelRate>({ table: 'hotel_rates', ownerColumn: 'hotel_profile_id', ownerId: user?.id, realtime: false, order: [{ column: 'date_from' }] });
  const rooms = roomsT.rows; const blocks = blocksT.rows; const rates = ratesT.rows;

  // Solo las reservas que tocan la ventana visible (no todo el historial).
  const [bookings, setBookings] = useState<HotelBooking[]>([]);
  const to = addDaysLocal(from, DAYS);
  const loadBookings = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('hotel_bookings').select('*').eq('hotel_profile_id', user.id).in('status', LIVE).lte('check_in', to).gt('check_out', from);
    setBookings((data ?? []) as HotelBooking[]);
  }, [user?.id, from, to]);
  useEffect(() => {
    loadBookings();
    const ch = supabase.channel(`hotel_cal_${user?.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'hotel_bookings', filter: `hotel_profile_id=eq.${user?.id}` }, () => loadBookings()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [loadBookings, user?.id]);

  const dates = useMemo(() => Array.from({ length: DAYS }, (_, i) => addDaysLocal(from, i)), [from]);
  const cell = (room: HotelRoom, d: string) => {
    const occupied = bookings.filter(b => b.room_id === room.id && b.check_in <= d && b.check_out > d).reduce((a, b) => a + b.rooms_count, 0);
    const blocked = blocks.filter(b => (b.room_id === room.id || !b.room_id) && b.date_from <= d && b.date_to >= d).reduce((a, b) => a + (b.units_blocked ?? room.units), 0);
    return { occupied, blocked: Math.min(blocked, room.units), free: Math.max(room.units - occupied - blocked, 0) };
  };

  const [blockModal, setBlockModal] = useState<{ open: boolean; editing: HotelBlock | null }>({ open: false, editing: null });
  const [rateModal, setRateModal] = useState<{ open: boolean; editing: HotelRate | null }>({ open: false, editing: null });

  const removeRow = async (table: 'hotel_blocks' | 'hotel_rates', id: string, reload: () => void) => {
    if (!window.confirm('¿Eliminar este registro?')) return;
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) return showNotification(error.message, 'error');
    reload();
  };
  const roomName = (id?: string | null) => (id ? rooms.find(r => r.id === id)?.name || 'Habitación' : 'Todas las habitaciones');

  if (roomsT.loading) return <Spinner accent={ACCENT} />;

  return (
    <div className="animate-fade-in-up space-y-6 max-w-5xl mx-auto px-4 md:px-6 pb-32" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5" style={{ borderColor: `${ACCENT}26` }}>
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2" style={{ fontFamily: TITLE_FONT }}><FaCalendarAlt style={{ color: ACCENT }} /> Disponibilidad</h2>
          <p className="text-sm text-white/40 mt-1">Mira tu ocupación, bloquea fechas y fija tarifas de temporada alta o baja.</p>
        </div>
        {view === 'bloqueos' && <button onClick={() => setBlockModal({ open: true, editing: null })} className="flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl" style={{ background: ACCENT, color: ON_ACCENT }}><FaPlus /> Bloquear fechas</button>}
        {view === 'tarifas' && <button onClick={() => setRateModal({ open: true, editing: null })} className="flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl" style={{ background: ACCENT, color: ON_ACCENT }}><FaPlus /> Nueva tarifa</button>}
      </div>

      {roomsT.missingSql && <MissingSqlNotice file="setup_hotel.sql" accent={ACCENT} />}

      <div className="flex flex-wrap gap-2">
        <Pill active={view === 'ocupacion'} onClick={() => setView('ocupacion')} accent={ACCENT} onAccent={ON_ACCENT}>Ocupación</Pill>
        <Pill active={view === 'bloqueos'} onClick={() => setView('bloqueos')} accent={ACCENT} onAccent={ON_ACCENT}>Bloqueos ({blocks.length})</Pill>
        <Pill active={view === 'tarifas'} onClick={() => setView('tarifas')} accent={ACCENT} onAccent={ON_ACCENT}>Tarifas de temporada ({rates.length})</Pill>
      </div>

      {view === 'ocupacion' && (
        rooms.length === 0 ? <p className="text-center text-white/30 py-12 text-sm">Primero crea tus habitaciones en la pestaña Alojamiento.</p> : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button onClick={() => setFrom(addDaysLocal(from, -7))} aria-label="Semana anterior" className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 text-white/60 flex items-center justify-center"><FaChevronLeft size={11} /></button>
              <input type="date" value={from} onChange={e => e.target.value && setFrom(e.target.value)} className={`${adminInput} !w-auto`} />
              <button onClick={() => setFrom(addDaysLocal(from, 7))} aria-label="Semana siguiente" className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 text-white/60 flex items-center justify-center"><FaChevronRight size={11} /></button>
              <button onClick={() => setFrom(todayLocal())} className="px-3 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider bg-white/5 border border-white/10 text-white/60">Hoy</button>
            </div>
            <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
              <table className="border-collapse text-center" style={{ minWidth: 140 + DAYS * 46 }}>
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-[#0f0f12] text-left text-[10px] uppercase tracking-widest text-white/40 px-3 py-2 w-[140px]">Habitación</th>
                    {dates.map(d => {
                      const dow = new Date(d + 'T00:00:00').getDay();
                      return <th key={d} className="px-0 py-2 w-[46px]" style={{ background: dow === 0 || dow === 6 ? 'rgba(255,255,255,0.03)' : undefined }}>
                        <p className="text-[9px] uppercase text-white/35">{fmtDate(d, { weekday: 'short' })}</p>
                        <p className={`text-[12px] font-bold ${d === todayLocal() ? '' : 'text-white/70'}`} style={d === todayLocal() ? { color: ACCENT } : undefined}>{Number(d.slice(8))}</p>
                      </th>;
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rooms.map(r => (
                    <tr key={r.id} className="border-t border-white/5">
                      <td className="sticky left-0 z-10 bg-[#0f0f12] text-left px-3 py-2"><p className="text-white text-[12px] font-semibold truncate max-w-[130px]">{r.name}</p><p className="text-[10px] text-white/35">{r.units} unid.</p></td>
                      {dates.map(d => {
                        const c = cell(r, d); const full = c.free === 0;
                        return (
                          <td key={d} className="p-[2px]">
                            <div title={`${r.name} · ${fmtDate(d)} · ${c.occupied} ocupadas, ${c.blocked} bloqueadas, ${c.free} libres`}
                              className="h-9 rounded-md flex items-center justify-center text-[10px] font-bold"
                              style={c.blocked >= r.units
                                ? { background: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.06), rgba(255,255,255,0.06) 4px, rgba(255,255,255,0.02) 4px, rgba(255,255,255,0.02) 8px)', color: 'rgba(255,255,255,0.4)' }
                                : full ? { background: 'rgba(248,113,113,0.22)', color: '#f87171' }
                                : c.occupied > 0 ? { background: `${ACCENT}${Math.round(30 + 90 * (c.occupied / r.units)).toString(16).padStart(2, '0')}`, color: '#fff' }
                                : { background: 'rgba(52,211,153,0.08)', color: 'rgba(52,211,153,0.7)' }}>
                              {c.blocked >= r.units ? <FaLock size={9} /> : `${c.occupied + c.blocked}/${r.units}`}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-white/35 flex flex-wrap gap-x-4 gap-y-1"><span><b style={{ color: '#34d399' }}>■</b> libre</span><span><b style={{ color: ACCENT }}>■</b> parcial</span><span><b style={{ color: '#f87171' }}>■</b> completa</span><span><FaLock className="inline" size={9} /> bloqueada</span><span>La cifra es ocupadas + bloqueadas / unidades.</span></p>
          </div>
        )
      )}

      {view === 'bloqueos' && (
        blocks.length === 0 ? <p className="text-center text-white/30 py-12 text-sm">Sin bloqueos. Úsalos para mantenimiento, eventos privados o cierres de temporada: esas noches no se podrán reservar en línea.</p> : (
          <div className="space-y-2.5">
            {blocks.map(b => (
              <div key={b.id} className="flex items-center gap-3 rounded-xl border px-4 py-3" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}>
                <FaLock className="text-white/30 shrink-0" />
                <div className="min-w-0 flex-1"><p className="text-white font-bold text-sm truncate">{fmtDate(b.date_from, { day: 'numeric', month: 'short', year: 'numeric' })} → {fmtDate(b.date_to, { day: 'numeric', month: 'short', year: 'numeric' })}</p><p className="text-[11px] text-white/45 truncate">{roomName(b.room_id)}{b.units_blocked ? ` · ${b.units_blocked} unidad(es)` : ' · todas las unidades'}{b.reason ? ` · ${b.reason}` : ''}</p></div>
                <button onClick={() => setBlockModal({ open: true, editing: b })} className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 text-white/60 flex items-center justify-center hover:text-white"><FaPen size={11} /></button>
                <button onClick={() => removeRow('hotel_blocks', b.id, blocksT.reload)} className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center hover:bg-red-500/20"><FaTrash size={11} /></button>
              </div>
            ))}
          </div>
        )
      )}

      {view === 'tarifas' && (
        rates.length === 0 ? <p className="text-center text-white/30 py-12 text-sm">Sin tarifas de temporada. Crea una regla («Carnaval +30%», «Temporada baja −20%») y el precio por noche se ajusta solo en las fechas indicadas.</p> : (
          <div className="space-y-2.5">
            {rates.map(r => (
              <div key={r.id} className="flex items-center gap-3 rounded-xl border px-4 py-3" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)', opacity: r.is_active ? 1 : 0.5 }}>
                <FaTags className="shrink-0" style={{ color: ACCENT }} />
                <div className="min-w-0 flex-1">
                  <p className="text-white font-bold text-sm truncate">{r.name} <span className="ml-1.5 text-[11px] font-black" style={{ color: ACCENT }}>{r.price_mode === 'fijo' ? `${money(r.value)} / noche` : `${r.value > 0 ? '+' : ''}${r.value}%`}</span></p>
                  <p className="text-[11px] text-white/45 truncate">{fmtDate(r.date_from, { day: 'numeric', month: 'short', year: 'numeric' })} → {fmtDate(r.date_to, { day: 'numeric', month: 'short', year: 'numeric' })} · {roomName(r.room_id)}</p>
                </div>
                <button title={r.is_active ? 'Desactivar' : 'Activar'} onClick={async () => { await supabase.from('hotel_rates').update({ is_active: !r.is_active }).eq('id', r.id); ratesT.reload(); }} className="text-white/50">{r.is_active ? <FaToggleOn size={18} style={{ color: ACCENT }} /> : <FaToggleOff size={18} />}</button>
                <button onClick={() => setRateModal({ open: true, editing: r })} className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 text-white/60 flex items-center justify-center hover:text-white"><FaPen size={11} /></button>
                <button onClick={() => removeRow('hotel_rates', r.id, ratesT.reload)} className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center hover:bg-red-500/20"><FaTrash size={11} /></button>
              </div>
            ))}
            <p className="text-[11px] text-white/35 pt-1">Si varias reglas coinciden en una noche, gana la de una habitación concreta sobre la general; entre iguales, la más reciente.</p>
          </div>
        )
      )}

      {blockModal.open && <BlockModal userId={user.id} rooms={rooms} editing={blockModal.editing} showNotification={showNotification} onClose={() => setBlockModal({ open: false, editing: null })} onSaved={() => { setBlockModal({ open: false, editing: null }); blocksT.reload(); }} />}
      {rateModal.open && <RateModal userId={user.id} rooms={rooms} editing={rateModal.editing} showNotification={showNotification} onClose={() => setRateModal({ open: false, editing: null })} onSaved={() => { setRateModal({ open: false, editing: null }); ratesT.reload(); }} />}
    </div>
  );
};

const BlockModal: React.FC<{ userId: string; rooms: HotelRoom[]; editing: HotelBlock | null; showNotification: Props['showNotification']; onClose: () => void; onSaved: () => void }> = ({ userId, rooms, editing, showNotification, onClose, onSaved }) => {
  const [roomId, setRoomId] = useState(editing?.room_id || ''); const [dFrom, setDFrom] = useState(editing?.date_from || todayLocal());
  const [dTo, setDTo] = useState(editing?.date_to || todayLocal()); const [units, setUnits] = useState(editing?.units_blocked ? String(editing.units_blocked) : '');
  const [reason, setReason] = useState(editing?.reason || ''); const [busy, setBusy] = useState(false);
  const save = async () => {
    if (dTo < dFrom) return showNotification('La última noche no puede ser anterior a la primera.', 'error');
    const payload = { hotel_profile_id: userId, room_id: roomId || null, date_from: dFrom, date_to: dTo, units_blocked: units !== '' ? Math.max(1, Math.round(Number(units))) : null, reason: reason.trim() || null };
    setBusy(true);
    const { error } = editing ? await supabase.from('hotel_blocks').update(payload).eq('id', editing.id) : await supabase.from('hotel_blocks').insert(payload);
    setBusy(false);
    if (error) return showNotification(isMissingSql(error) ? 'Falta ejecutar setup_hotel.sql en Supabase.' : error.message, 'error');
    onSaved();
  };
  return (
    <AdminModal title={editing ? 'Editar bloqueo' : 'Bloquear fechas'} accent={ACCENT} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Habitación"><select className={adminInput} value={roomId} onChange={e => setRoomId(e.target.value)}><option value="">Todas las habitaciones</option>{rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Primera noche"><input type="date" className={adminInput} value={dFrom} onChange={e => { setDFrom(e.target.value); if (dTo < e.target.value) setDTo(e.target.value); }} /></Field>
          <Field label="Última noche"><input type="date" className={adminInput} min={dFrom} value={dTo} onChange={e => setDTo(e.target.value)} /></Field>
        </div>
        <Field label="Unidades a bloquear" hint="Vacío = todas las unidades de ese tipo"><input type="number" min={1} className={adminInput} value={units} onChange={e => setUnits(e.target.value)} /></Field>
        <Field label="Motivo (interno)"><input className={adminInput} value={reason} onChange={e => setReason(e.target.value)} placeholder="Mantenimiento, evento privado…" /></Field>
        <button onClick={save} disabled={busy} className="w-full py-3 rounded-xl text-sm font-black uppercase tracking-wider disabled:opacity-50" style={{ background: ACCENT, color: ON_ACCENT }}>{busy ? 'Guardando…' : 'Guardar bloqueo'}</button>
      </div>
    </AdminModal>
  );
};

const RateModal: React.FC<{ userId: string; rooms: HotelRoom[]; editing: HotelRate | null; showNotification: Props['showNotification']; onClose: () => void; onSaved: () => void }> = ({ userId, rooms, editing, showNotification, onClose, onSaved }) => {
  const [name, setName] = useState(editing?.name || ''); const [roomId, setRoomId] = useState(editing?.room_id || '');
  const [dFrom, setDFrom] = useState(editing?.date_from || todayLocal()); const [dTo, setDTo] = useState(editing?.date_to || todayLocal());
  const [mode, setMode] = useState<'fijo' | 'porcentaje'>(editing?.price_mode || 'porcentaje'); const [value, setValue] = useState(editing ? String(editing.value) : '');
  const [active, setActive] = useState(editing?.is_active ?? true); const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim()) return showNotification('Ponle un nombre a la tarifa (ej. Carnaval).', 'error');
    const v = Number(value); if (value === '' || !isFinite(v)) return showNotification('Escribe el valor.', 'error');
    if (mode === 'fijo' && v < 0) return showNotification('Un precio fijo no puede ser negativo.', 'error');
    if (dTo < dFrom) return showNotification('La última noche no puede ser anterior a la primera.', 'error');
    const payload = { hotel_profile_id: userId, room_id: roomId || null, name: name.trim(), date_from: dFrom, date_to: dTo, price_mode: mode, value: v, is_active: active };
    setBusy(true);
    const { error } = editing ? await supabase.from('hotel_rates').update(payload).eq('id', editing.id) : await supabase.from('hotel_rates').insert(payload);
    setBusy(false);
    if (error) return showNotification(isMissingSql(error) ? 'Falta ejecutar setup_hotel.sql en Supabase.' : error.message, 'error');
    onSaved();
  };
  return (
    <AdminModal title={editing ? 'Editar tarifa' : 'Nueva tarifa de temporada'} accent={ACCENT} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Nombre *"><input className={adminInput} value={name} onChange={e => setName(e.target.value)} placeholder="Carnaval, Temporada baja…" /></Field>
        <Field label="Aplica a"><select className={adminInput} value={roomId} onChange={e => setRoomId(e.target.value)}><option value="">Todas las habitaciones</option>{rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Primera noche"><input type="date" className={adminInput} value={dFrom} onChange={e => { setDFrom(e.target.value); if (dTo < e.target.value) setDTo(e.target.value); }} /></Field>
          <Field label="Última noche"><input type="date" className={adminInput} min={dFrom} value={dTo} onChange={e => setDTo(e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo"><select className={adminInput} value={mode} onChange={e => setMode(e.target.value as any)}><option value="porcentaje">Ajuste en %</option><option value="fijo">Precio fijo por noche</option></select></Field>
          <Field label={mode === 'porcentaje' ? 'Porcentaje' : 'Precio / noche'} hint={mode === 'porcentaje' ? '+30 sube, −20 baja' : undefined}><input type="number" step="0.01" className={adminInput} value={value} onChange={e => setValue(e.target.value)} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-white/70"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Activa</label>
        <button onClick={save} disabled={busy} className="w-full py-3 rounded-xl text-sm font-black uppercase tracking-wider disabled:opacity-50" style={{ background: ACCENT, color: ON_ACCENT }}>{busy ? 'Guardando…' : 'Guardar tarifa'}</button>
      </div>
    </AdminModal>
  );
};

export default HotelCalendarTab;
