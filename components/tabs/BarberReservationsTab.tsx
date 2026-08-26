import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../src/lib/supabase';
import type { BarberStaff, BarberStaffHours, BarberReservation } from '../../types';
import {
  FaCalendarCheck, FaUsers, FaClock, FaWhatsapp, FaCheck, FaTimes,
  FaSave, FaVolumeUp, FaPlus, FaPen, FaTrash, FaImage, FaUserTie,
  FaToggleOn, FaToggleOff, FaCut,
} from 'react-icons/fa';
import { ExportRangePanel, fetchOwnerRange, type ExportColumn } from '../ExportRangePanel';
import type { DateRange } from '../../src/lib/exportRange';
import { DailyAgendaPanel } from '../DailyAgendaPanel';
import type { AgendaRow } from '../../src/lib/reminders';

interface Props {
  user: any;
  profileData: any;
  setProfileData: React.Dispatch<React.SetStateAction<any>>;
  showNotification: (message: string, type: 'success' | 'error') => void;
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  pendiente:  { label: 'Pendiente',  color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  confirmada: { label: 'Confirmada', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  completada: { label: 'Atendida',   color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
  cancelada:  { label: 'Cancelada',  color: 'text-red-400 bg-red-500/10 border-red-500/30' },
  no_show:    { label: 'No-show',    color: 'text-gray-400 bg-white/5 border-white/10' },
};

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const STAFF_ROLES = ['Barbero', 'Estilista', 'Colorista', 'Barbero Senior', 'Aprendiz'];

const defaultHours = (): BarberStaffHours[] =>
  Array.from({ length: 7 }, (_, day) => ({
    day,
    isOpen: day >= 1 && day <= 6,   // Lun–Sáb abierto, Domingo cerrado
    openTime: '09:00',
    closeTime: '18:00',
  }));

let sharedCtx: AudioContext | null = null;
const ping = () => {
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    if (!sharedCtx) sharedCtx = new AC();
    const ctx = sharedCtx;
    const play = () => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      const t = ctx.currentTime;
      osc.frequency.setValueAtTime(660, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      osc.start(t); osc.stop(t + 0.4);
    };
    if (ctx.state === 'suspended') ctx.resume().then(play).catch(() => {}); else play();
  } catch { /* noop */ }
};

const waLink = (phone?: string | null, msg = '') => {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '593' + d.slice(1);
  return `https://wa.me/${d}?text=${encodeURIComponent(msg)}`;
};
const todayStr = () => new Date().toISOString().slice(0, 10);
const inputCls = "w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#ffa35d]/50";

/** Columnas de la descarga en Excel de las citas de la barbería. */
const RESERVATION_COLUMNS: ExportColumn<BarberReservation>[] = [
  { header: 'Fecha', get: r => r.reservation_date },
  { header: 'Hora', get: r => r.reservation_time },
  { header: 'Cliente', get: r => r.customer_name },
  { header: 'Teléfono', get: r => r.customer_phone || '' },
  { header: 'Email', get: r => r.customer_email || '' },
  { header: 'Barbero', get: r => r.staff_name || '' },
  { header: 'Servicio', get: r => r.service_name || '' },
  { header: 'Estado', get: r => STATUS_META[r.status]?.label || r.status },
  { header: 'Código de cita', get: r => r.confirmation_code || '' },
  { header: 'Código de cliente', get: r => r.member_code || '' },
  { header: 'Notas', get: r => r.notes || '' },
  { header: 'Agendada el', get: r => (r.created_at ? new Date(r.created_at).toLocaleString('es-EC') : '') },
];

export const BarberReservationsTab: React.FC<Props> = ({ user, profileData, setProfileData, showNotification }) => {
  const [view, setView] = useState<'citas' | 'equipo'>('citas');

  // ═══════════════════════ EQUIPO (barber_staff) ═══════════════════════
  const [staff, setStaff] = useState<BarberStaff[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(true);

  const fetchStaff = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await supabase.from('barber_staff')
      .select('*').eq('barber_id', user.id)
      .order('sort_order', { ascending: true }).order('created_at', { ascending: true });
    if (!error) setStaff((data as BarberStaff[]) || []);
    setLoadingStaff(false);
  }, [user?.id]);

  useEffect(() => { fetchStaff(); }, [fetchStaff]);

  const [editingStaff, setEditingStaff] = useState<BarberStaff | null>(null);
  const [staffForm, setStaffForm] = useState<Partial<BarberStaff>>({});
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savingStaff, setSavingStaff] = useState(false);

  const openNewStaff = () => {
    setEditingStaff(null);
    setStaffForm({ name: '', role: '', photo_url: '', is_active: true, working_hours: defaultHours() });
    setStaffModalOpen(true);
  };
  const openEditStaff = (s: BarberStaff) => {
    setEditingStaff(s);
    setStaffForm({ ...s, working_hours: Array.isArray(s.working_hours) && s.working_hours.length === 7 ? s.working_hours : defaultHours() });
    setStaffModalOpen(true);
  };
  const closeStaffModal = () => { setStaffModalOpen(false); setEditingStaff(null); setStaffForm({}); };

  const handlePhotoUpload = async (file: File) => {
    if (!user?.id) return;
    const slotId = editingStaff?.id || `tmp_${Date.now()}`;
    setUploading(true);
    try {
      await supabase.storage.from('assets').upload(`barber_staff/${user.id}/${slotId}`, file, { upsert: true });
      const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(`barber_staff/${user.id}/${slotId}`);
      setStaffForm(prev => ({ ...prev, photo_url: `${publicUrl}?v=${Date.now()}` }));
    } catch (err: any) {
      showNotification(`Error al subir foto: ${err?.message}`, 'error');
    } finally {
      setUploading(false);
    }
  };

  const updateHour = (day: number, field: keyof BarberStaffHours, value: any) => {
    setStaffForm(prev => ({
      ...prev,
      working_hours: (prev.working_hours || defaultHours()).map(h => h.day === day ? { ...h, [field]: value } : h),
    }));
  };

  const saveStaff = async () => {
    if (!staffForm.name?.trim()) { showNotification('El nombre del barbero es requerido.', 'error'); return; }
    setSavingStaff(true);
    try {
      const payload = {
        barber_id: user.id,
        name: staffForm.name.trim(),
        role: staffForm.role?.trim() || null,
        photo_url: staffForm.photo_url || null,
        working_hours: staffForm.working_hours || defaultHours(),
        is_active: staffForm.is_active !== false,
        sort_order: editingStaff?.sort_order ?? staff.length,
      };
      if (editingStaff) {
        const { error } = await supabase.from('barber_staff').update(payload).eq('id', editingStaff.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('barber_staff').insert(payload);
        if (error) throw error;
      }
      await fetchStaff();
      showNotification(editingStaff ? 'Barbero actualizado' : 'Barbero agregado', 'success');
      closeStaffModal();
    } catch (err: any) {
      showNotification(`Error: ${err?.message}`, 'error');
    } finally {
      setSavingStaff(false);
    }
  };

  const toggleStaffActive = async (s: BarberStaff) => {
    const next = !(s.is_active !== false);
    setStaff(prev => prev.map(x => x.id === s.id ? { ...x, is_active: next } : x));
    await supabase.from('barber_staff').update({ is_active: next }).eq('id', s.id);
  };

  const deleteStaff = async (id: string) => {
    if (!window.confirm('¿Eliminar este barbero del equipo? Sus citas pasadas se conservan.')) return;
    try {
      const { error } = await supabase.from('barber_staff').delete().eq('id', id);
      if (error) throw error;
      setStaff(prev => prev.filter(s => s.id !== id));
      showNotification('Barbero eliminado', 'success');
    } catch (err: any) {
      showNotification(`Error: ${err?.message}`, 'error');
    }
  };

  // ═══════════════════════ CITAS (barber_reservations) ═══════════════════════
  const [reservations, setReservations] = useState<BarberReservation[]>([]);
  const [loadingRes, setLoadingRes] = useState(true);
  const [dateFilter, setDateFilter] = useState<string>(todayStr());
  const knownIds = useRef<Set<string>>(new Set());
  const inited = useRef(false);

  const fetchReservations = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase.from('barber_reservations')
        .select('*').eq('barber_id', user.id)
        .order('reservation_date', { ascending: true })
        .order('reservation_time', { ascending: true });
      if (error) throw error;
      const list = (data as BarberReservation[]) || [];
      if (inited.current) {
        const fresh = list.filter(r => !knownIds.current.has(r.id));
        if (fresh.length > 0) {
          ping();
          showNotification(`Nueva cita · ${fresh[0].customer_name}`, 'success');
        }
      }
      knownIds.current = new Set(list.map(r => r.id));
      inited.current = true;
      setReservations(list);
    } catch (err: any) {
      console.error('barber reservations fetch error:', err);
    } finally {
      setLoadingRes(false);
    }
  }, [user?.id, showNotification]);

  useEffect(() => {
    if (!user?.id) return;
    fetchReservations();
    const channel = supabase.channel(`barber_reservations_${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'barber_reservations', filter: `barber_id=eq.${user.id}` }, () => fetchReservations())
      .subscribe();
    const poll = setInterval(fetchReservations, 15000);
    return () => { supabase.removeChannel(channel); clearInterval(poll); };
  }, [user?.id, fetchReservations]);

  const setStatus = async (id: string, status: string) => {
    try {
      const { error } = await supabase.from('barber_reservations').update({ status }).eq('id', id);
      if (error) throw error;
      setReservations(prev => prev.map(r => r.id === id ? { ...r, status: status as any } : r));
    } catch (err: any) {
      showNotification(`Error: ${err?.message ?? err}`, 'error');
    }
  };

  const deleteReservation = async (id: string) => {
    if (!window.confirm('¿Eliminar esta cita?')) return;
    try {
      const { error } = await supabase.from('barber_reservations').delete().eq('id', id);
      if (error) throw error;
      setReservations(prev => prev.filter(r => r.id !== id));
    } catch (err: any) {
      showNotification(`Error: ${err?.message ?? err}`, 'error');
    }
  };

  const filtered = useMemo(() => {
    if (!dateFilter) return reservations;
    return reservations.filter(r => r.reservation_date === dateFilter);
  }, [reservations, dateFilter]);

  // Agenda del día. Se arma con las citas YA cargadas: no añade ninguna
  // consulta y el panel funciona aunque todavía no se haya ejecutado el SQL.
  const agendaRows = useMemo<AgendaRow[]>(() => reservations.map(r => ({
    id: r.id,
    date: r.reservation_date,
    time: r.reservation_time || '',
    name: r.customer_name,
    phone: r.customer_phone || '',
    status: r.status,
    detail: [r.service_name, r.staff_name].filter(Boolean).join(' · ') || undefined,
  })), [reservations]);

  // Descarga en Excel: el rango se pide al servidor, sin tocar la lista en
  // pantalla ni su filtro de fecha.
  const fetchReservationRange = useCallback((range: DateRange) => fetchOwnerRange<BarberReservation>({
    table: 'barber_reservations',
    ownerColumn: 'barber_id',
    ownerId: user.id,
    dateColumn: 'reservation_date',
    range,
    orderBy: [{ column: 'reservation_date' }, { column: 'reservation_time' }],
  }), [user?.id]);

  const upcoming = filtered.filter(r => r.status === 'pendiente' || r.status === 'confirmada');
  const past = filtered.filter(r => r.status === 'completada' || r.status === 'cancelada' || r.status === 'no_show');
  const todaysCount = reservations.filter(r => r.reservation_date === todayStr() && r.status !== 'cancelada' && r.status !== 'no_show').length;
  const pendingCount = reservations.filter(r => r.status === 'pendiente').length;

  const activeStaffCount = staff.filter(s => s.is_active !== false).length;

  // ═══════════════════════ Render ═══════════════════════
  const staffModal = staffModalOpen && createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={closeStaffModal}>
      <div className="bg-[#0f0702] border border-[#ffa35d]/20 rounded-2xl w-full max-w-lg shadow-2xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-white/5 sticky top-0 bg-[#0f0702] z-10">
          <h3 className="font-black font-tomorrow text-[#ffa35d] uppercase tracking-wider text-sm">
            {editingStaff ? 'Editar barbero' : 'Nuevo barbero'}
          </h3>
          <button onClick={closeStaffModal} className="text-white/40 hover:text-white transition"><FaTimes /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Foto */}
          <div className="flex items-center gap-4">
            {staffForm.photo_url ? (
              <img src={staffForm.photo_url} className="w-20 h-20 rounded-full object-cover border border-[#ffa35d]/20 shrink-0" alt="preview" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-white/5 border border-dashed border-white/20 flex items-center justify-center text-white/30 shrink-0">
                <FaImage className="text-2xl" />
              </div>
            )}
            <label className="flex-1 cursor-pointer">
              <input type="file" accept="image/*" className="hidden"
                onChange={e => e.target.files?.[0] && handlePhotoUpload(e.target.files[0])} />
              <span className="block text-center text-xs py-2.5 px-4 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white hover:border-[#ffa35d]/40 transition select-none">
                {uploading ? 'Subiendo...' : staffForm.photo_url ? 'Cambiar foto' : 'Subir foto'}
              </span>
            </label>
          </div>

          <input
            value={staffForm.name || ''}
            onChange={e => setStaffForm(p => ({ ...p, name: e.target.value }))}
            placeholder="Nombre del barbero *"
            className={inputCls}
          />
          <div>
            <input
              list="barber-staff-roles"
              value={staffForm.role || ''}
              onChange={e => setStaffForm(p => ({ ...p, role: e.target.value }))}
              placeholder="Especialidad (ej. Estilista, Colorista...)"
              className={inputCls}
            />
            <datalist id="barber-staff-roles">
              {STAFF_ROLES.map(r => <option key={r} value={r} />)}
            </datalist>
          </div>

          {/* Horario propio del barbero */}
          <div className="bg-black/20 border border-white/10 rounded-xl p-3">
            <p className="text-[11px] text-[#ffa35d]/80 font-black uppercase tracking-widest mb-3 flex items-center gap-2">
              <FaClock size={11} /> Horario de atención
            </p>
            <div className="space-y-1.5">
              {(staffForm.working_hours || defaultHours()).map(h => (
                <div key={h.day} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateHour(h.day, 'isOpen', !h.isOpen)}
                    className={`text-xl shrink-0 ${h.isOpen ? 'text-green-400' : 'text-white/20'}`}
                    title={h.isOpen ? 'Trabaja este día' : 'Descansa este día'}
                  >
                    {h.isOpen ? <FaToggleOn /> : <FaToggleOff />}
                  </button>
                  <span className={`w-9 text-xs font-bold uppercase tracking-wider ${h.isOpen ? 'text-white/80' : 'text-white/30'}`}>{DAY_NAMES[h.day]}</span>
                  {h.isOpen ? (
                    <div className="flex items-center gap-1.5 flex-1">
                      <input type="time" value={h.openTime} onChange={e => updateHour(h.day, 'openTime', e.target.value)}
                        className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-[#ffa35d]/50" />
                      <span className="text-white/30 text-xs">a</span>
                      <input type="time" value={h.closeTime} onChange={e => updateHour(h.day, 'closeTime', e.target.value)}
                        className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-[#ffa35d]/50" />
                    </div>
                  ) : (
                    <span className="flex-1 text-xs text-white/30 italic">Descanso</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-sm text-white/70 font-medium">Visible para clientes</p>
              <p className="text-[11px] text-white/30 mt-0.5">Los clientes podrán elegir a este barbero al agendar</p>
            </div>
            <button type="button" onClick={() => setStaffForm(p => ({ ...p, is_active: p.is_active === false ? true : false }))}
              className={`text-3xl transition-colors ${staffForm.is_active !== false ? 'text-green-400' : 'text-white/20'}`}>
              {staffForm.is_active !== false ? <FaToggleOn /> : <FaToggleOff />}
            </button>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={closeStaffModal}
              className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-bold uppercase tracking-wider active:scale-95 transition-all">
              Cancelar
            </button>
            <button onClick={saveStaff} disabled={savingStaff || uploading}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[#ff6b35] to-[#ffa35d] text-black text-xs font-black uppercase tracking-wider disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95 transition-all">
              <FaSave /> {savingStaff ? 'Guardando...' : editingStaff ? 'Actualizar' : 'Agregar'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );

  return (
    <div className="space-y-6 max-w-4xl mx-auto px-4 md:px-6 pb-32" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      {staffModal}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#ffa35d]/15 pb-5">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2">
            <FaCalendarCheck className="text-[#ffa35d]" /> Reservas
          </h2>
          <p className="text-sm text-white/40 mt-1">
            Gestiona las citas y tu equipo de barberos/estilistas.
          </p>
        </div>
        {view === 'citas' && (
          <button onClick={() => ping()} title="Probar alarma"
            className="flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wider text-[#ffa35d] bg-[#ffa35d]/15 border border-[#ffa35d]/20 rounded-xl hover:bg-[#ffa35d]/25 transition-all self-start">
            <FaVolumeUp />
          </button>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2 bg-black/30 border border-white/10 rounded-xl p-1">
        <button onClick={() => setView('citas')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition ${view === 'citas' ? 'bg-[#ffa35d] text-black' : 'text-white/50 hover:text-white'}`}>
          <FaCalendarCheck size={12} /> Citas
        </button>
        <button onClick={() => setView('equipo')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition ${view === 'equipo' ? 'bg-[#ffa35d] text-black' : 'text-white/50 hover:text-white'}`}>
          <FaUsers size={12} /> Equipo ({staff.length})
        </button>
      </div>

      {/* ═══════════════ VISTA: CITAS ═══════════════ */}
      {view === 'citas' && (
        loadingRes ? (
          <div className="flex items-center justify-center min-h-[300px]"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#ffa35d]" /></div>
        ) : (
          <>
            {activeStaffCount === 0 && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-xs text-amber-200/90">
                Aún no tienes barberos activos. Agrega tu equipo en la pestaña <b>Equipo</b> para que los clientes puedan agendar citas eligiendo con quién.
              </div>
            )}

            {/* KPIs */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white/[0.03] border border-[#ffa35d]/15 rounded-2xl p-4">
                <div className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Hoy</div>
                <div className="text-2xl font-black text-white mt-1">{todaysCount}</div>
              </div>
              <div className={`rounded-2xl p-4 border ${pendingCount > 0 ? 'bg-amber-500/10 border-amber-500/30' : 'bg-white/[0.03] border-[#ffa35d]/15'}`}>
                <div className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Pendientes</div>
                <div className={`text-2xl font-black mt-1 ${pendingCount > 0 ? 'text-amber-400' : 'text-white'}`}>{pendingCount}</div>
              </div>
              <div className="bg-white/[0.03] border border-[#ffa35d]/15 rounded-2xl p-4">
                <div className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Total</div>
                <div className="text-2xl font-black text-white mt-1">{reservations.length}</div>
              </div>
            </div>

            {/* Agenda de hoy + recordatorio al cliente por WhatsApp */}
            <DailyAgendaPanel
              accent="#ffa35d"
              noun="cita"
              businessName={profileData?.displayName || profileData?.username}
              rows={agendaRows}
              table="barber_reservations"
            />

            {/* Filtro por fecha */}
            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-xs text-white/50 uppercase tracking-widest font-bold">Fecha</label>
              <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
                className="bg-black/40 border border-[#ffa35d]/20 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-[#ffa35d]" />
              <button onClick={() => setDateFilter('')} className="text-xs text-white/50 hover:text-white underline">Ver todas</button>
              <button onClick={() => setDateFilter(todayStr())} className="text-xs text-[#ffa35d] hover:text-[#ffc48f] underline">Hoy</button>
            </div>

            {/* Descarga en Excel por rango de fechas */}
            <ExportRangePanel<BarberReservation>
              accent="#ffa35d"
              noun="citas"
              dateLabel="Fecha de la cita"
              fileBase={`citas_${profileData?.username || 'barberia'}`}
              sheetName="Citas"
              localRows={reservations}
              getDate={r => r.reservation_date}
              fetchRange={fetchReservationRange}
              columns={RESERVATION_COLUMNS}
              showNotification={showNotification}
              hint="Incluye cliente, contacto, barbero, servicio, estado y código de cada cita."
            />

            {/* Próximas / Activas */}
            <div>
              <h3 className="text-sm font-bold tracking-widest text-[#ffa35d] uppercase mb-3">Próximas / Activas ({upcoming.length})</h3>
              {upcoming.length === 0 ? (
                <div className="p-8 text-center bg-white/[0.02] rounded-2xl border border-white/5 text-gray-500 text-sm">
                  No hay citas activas para esta fecha.
                </div>
              ) : (
                <div className="space-y-3">
                  {upcoming.map(r => {
                    const sm = STATUS_META[r.status] || STATUS_META.pendiente;
                    return (
                      <div key={r.id} className="bg-gradient-to-r from-[#170902] to-[#0f0400] border border-[#ffa35d]/25 rounded-2xl p-5">
                        <div className="flex justify-between items-start gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-base font-bold text-white truncate">{r.customer_name}</h4>
                              <span className={`text-[9px] font-black uppercase tracking-widest rounded px-1.5 py-0.5 border ${sm.color}`}>{sm.label}</span>
                              {r.member_code && <span className="text-[9px] font-black uppercase tracking-widest text-[#ffa35d] bg-[#ffa35d]/10 border border-[#ffa35d]/25 rounded px-1.5 py-0.5">⭐ {r.member_code}</span>}
                            </div>
                            <div className="flex items-center gap-3 mt-2 text-xs text-white/60 flex-wrap">
                              <span className="inline-flex items-center gap-1"><FaCalendarCheck className="text-[#ffa35d]" size={11} /> {new Date(r.reservation_date + 'T00:00:00').toLocaleDateString('es-EC', { weekday: 'short', day: '2-digit', month: 'short' })}</span>
                              <span className="inline-flex items-center gap-1"><FaClock className="text-[#ffa35d]" size={11} /> {r.reservation_time}</span>
                              {r.staff_name && <span className="inline-flex items-center gap-1"><FaUserTie className="text-[#ffa35d]" size={11} /> {r.staff_name}</span>}
                            </div>
                            {r.service_name && (
                              <div className="mt-1.5 text-xs text-white/70 inline-flex items-center gap-1.5">
                                <FaCut className="text-[#ffa35d] rotate-90" size={10} /> {r.service_name}
                              </div>
                            )}
                            {r.notes && <p className="text-xs text-white/40 mt-2 italic">"{r.notes}"</p>}
                            <div className="text-[11px] text-white/40 mt-1 font-mono">Cód. {r.confirmation_code}</div>
                          </div>
                          {r.customer_phone && (
                            <a href={waLink(r.customer_phone, `Hola ${r.customer_name}, sobre tu cita del ${r.reservation_date} a las ${r.reservation_time}${r.staff_name ? ` con ${r.staff_name}` : ''}.`)}
                              target="_blank" rel="noopener noreferrer"
                              className="w-9 h-9 rounded-lg bg-[#25D366]/10 border border-[#25D366]/25 text-[#25D366] flex items-center justify-center shrink-0"><FaWhatsapp size={15} /></a>
                          )}
                        </div>

                        {/* Acciones de estado */}
                        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-white/5">
                          {r.status === 'pendiente' && (
                            <button onClick={() => setStatus(r.id, 'confirmada')}
                              className="px-3.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-black uppercase tracking-wider hover:bg-emerald-500/25 flex items-center gap-1.5">
                              <FaCheck size={11} /> Confirmar
                            </button>
                          )}
                          <button onClick={() => setStatus(r.id, 'completada')}
                            className="px-3.5 py-2 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-300 text-xs font-black uppercase tracking-wider hover:bg-blue-500/25 flex items-center gap-1.5">
                            <FaCut size={11} className="rotate-90" /> Atendida
                          </button>
                          <button onClick={() => setStatus(r.id, 'no_show')}
                            className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/50 text-xs font-bold hover:text-amber-400 transition">
                            No-show
                          </button>
                          <button onClick={() => setStatus(r.id, 'cancelada')}
                            className="px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold hover:bg-red-500/20">
                            Cancelar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Historial */}
            {past.length > 0 && (
              <div>
                <h3 className="text-sm font-bold tracking-widest text-gray-500 uppercase mb-3">Cerradas ({past.length})</h3>
                <div className="space-y-2">
                  {past.map(r => {
                    const sm = STATUS_META[r.status] || STATUS_META.cancelada;
                    return (
                      <div key={r.id} className="bg-white/[0.01] border border-white/5 rounded-xl p-4 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-sm truncate">{r.customer_name}</span>
                            <span className={`text-[9px] font-black uppercase tracking-widest rounded px-1.5 py-0.5 border ${sm.color}`}>{sm.label}</span>
                          </div>
                          <p className="text-[11px] text-gray-500 mt-1">
                            {new Date(r.reservation_date + 'T00:00:00').toLocaleDateString('es-EC', { day: '2-digit', month: 'short' })} · {r.reservation_time}{r.staff_name ? ` · ${r.staff_name}` : ''}{r.service_name ? ` · ${r.service_name}` : ''}
                          </p>
                        </div>
                        <button onClick={() => deleteReservation(r.id)} className="text-white/30 hover:text-red-400 text-xs shrink-0"><FaTimes /></button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )
      )}

      {/* ═══════════════ VISTA: EQUIPO ═══════════════ */}
      {view === 'equipo' && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-white/40">
              {activeStaffCount} barbero{activeStaffCount !== 1 ? 's' : ''} activo{activeStaffCount !== 1 ? 's' : ''} de {staff.length}
            </p>
            <button onClick={openNewStaff}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-black bg-[#ffa35d] hover:bg-[#e8902a] rounded-xl transition-all shadow-lg shadow-[#ffa35d]/15">
              <FaPlus /> Agregar barbero
            </button>
          </div>

          {loadingStaff ? (
            <div className="flex items-center justify-center min-h-[200px]"><div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-[#ffa35d]" /></div>
          ) : staff.length === 0 ? (
            <div className="text-center py-20 text-white/30">
              <p className="text-5xl mb-4">💈</p>
              <p className="text-sm font-medium">Aún no tienes barberos en tu equipo.</p>
              <p className="text-xs mt-1">Agrega a las personas que atienden para habilitar las reservas.</p>
              <button onClick={openNewStaff} className="mt-6 px-6 py-3 rounded-xl bg-[#ffa35d] text-black font-black text-xs uppercase tracking-wider">
                Agregar barbero
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {staff.map(s => {
                const openDays = (Array.isArray(s.working_hours) ? s.working_hours : []).filter(h => h.isOpen).map(h => DAY_NAMES[h.day]);
                return (
                  <div key={s.id}
                    className={`flex items-center gap-4 border rounded-xl p-4 transition-all ${s.is_active === false ? 'border-white/5 bg-white/[0.02] opacity-60' : 'border-[#ffa35d]/10 bg-white/5 hover:border-[#ffa35d]/30'}`}>
                    {s.photo_url ? (
                      <img src={s.photo_url} className="w-14 h-14 rounded-full object-cover shrink-0 border border-white/10" alt={s.name} />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-[#ffa35d]/10 flex items-center justify-center text-lg text-[#ffa35d] shrink-0"><FaUserTie /></div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-black text-white text-sm font-tomorrow">{s.name}</p>
                        {s.is_active === false && <span className="text-[9px] text-red-400/70 bg-red-500/10 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Oculto</span>}
                      </div>
                      {s.role && <p className="text-[11px] text-[#ffa35d]/80 mt-0.5">{s.role}</p>}
                      <p className="text-[10px] text-white/40 mt-1">{openDays.length > 0 ? openDays.join(' · ') : 'Sin horario configurado'}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => toggleStaffActive(s)} title={s.is_active !== false ? 'Ocultar' : 'Mostrar'}
                        className={`text-2xl transition-colors ${s.is_active !== false ? 'text-green-400 hover:text-green-300' : 'text-white/20 hover:text-white/40'}`}>
                        {s.is_active !== false ? <FaToggleOn /> : <FaToggleOff />}
                      </button>
                      <button onClick={() => openEditStaff(s)}
                        className="w-9 h-9 rounded-lg bg-white/5 hover:bg-[#ffa35d]/20 flex items-center justify-center text-white/40 hover:text-[#ffa35d] transition"><FaPen className="text-xs" /></button>
                      <button onClick={() => deleteStaff(s.id)}
                        className="w-9 h-9 rounded-lg bg-white/5 hover:bg-red-500/20 flex items-center justify-center text-white/30 hover:text-red-400 transition"><FaTrash className="text-xs" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default BarberReservationsTab;
