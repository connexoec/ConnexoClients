import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../../src/lib/supabase';
import type { GastroReservation } from '../../types';
import {
  FaCalendarCheck, FaUsers, FaClock, FaWhatsapp, FaCheck, FaChair,
  FaTimes, FaSave, FaCog, FaVolumeUp, FaUtensils, FaPaw,
} from 'react-icons/fa';
import { ExportRangePanel, fetchOwnerRange, type ExportColumn } from '../ExportRangePanel';
import type { DateRange } from '../../src/lib/exportRange';
import { DailyAgendaPanel } from '../DailyAgendaPanel';
import type { AgendaRow } from '../../src/lib/reminders';

interface GastroReservationsTabProps {
  user: any;
  profileData: any;
  setProfileData: React.Dispatch<React.SetStateAction<any>>;
  showNotification: (message: string, type: 'success' | 'error') => void;
  isPetcare?: boolean;
  isMedical?: boolean;
}

const STATUS_META_GASTRO: Record<string, { label: string; color: string }> = {
  pendiente:  { label: 'Pendiente',  color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  confirmada: { label: 'Confirmada', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  sentada:    { label: 'Sentada',    color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
  cancelada:  { label: 'Cancelada',  color: 'text-red-400 bg-red-500/10 border-red-500/30' },
  no_show:    { label: 'No-show',    color: 'text-gray-400 bg-white/5 border-white/10' },
};
const STATUS_META_PETCARE: Record<string, { label: string; color: string }> = {
  pendiente:  { label: 'Pendiente',   color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  confirmada: { label: 'Confirmada',  color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  sentada:    { label: 'En consulta', color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
  cancelada:  { label: 'Cancelada',   color: 'text-red-400 bg-red-500/10 border-red-500/30' },
  no_show:    { label: 'No-show',     color: 'text-gray-400 bg-white/5 border-white/10' },
};

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

const inputCls = "w-full bg-black/40 border border-[#ff6b35]/20 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#ff6b35] placeholder-gray-600";
const waLink = (phone?: string | null, msg = '') => {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '593' + d.slice(1);
  return `https://wa.me/${d}?text=${encodeURIComponent(msg)}`;
};
const todayStr = () => new Date().toISOString().slice(0, 10);

export const GastroReservationsTab: React.FC<GastroReservationsTabProps> = ({
  user, profileData, setProfileData, showNotification, isPetcare = false, isMedical = false,
}) => {
  const isClinic = isPetcare || isMedical;
  const STATUS_META = isClinic ? STATUS_META_PETCARE : STATUS_META_GASTRO;

  const [reservations, setReservations] = useState<GastroReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<string>(todayStr());
  const [tableDraft, setTableDraft] = useState<Record<string, string>>({});
  const knownIds = useRef<Set<string>>(new Set());
  const inited = useRef(false);

  const fetchReservations = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase.from('gastro_reservations')
        .select('*').eq('restaurant_id', user.id)
        .order('reservation_date', { ascending: true })
        .order('reservation_time', { ascending: true });
      if (error) throw error;
      const list = (data as GastroReservation[]) || [];
      if (inited.current) {
        const fresh = list.filter(r => !knownIds.current.has(r.id));
        if (fresh.length > 0) {
          ping();
          showNotification(`${isClinic ? 'Nueva cita' : 'Nueva reserva'} · ${fresh[0].customer_name}`, 'success');
        }
      }
      knownIds.current = new Set(list.map(r => r.id));
      inited.current = true;
      setReservations(list);
    } catch (err: any) {
      console.error('reservations fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id, showNotification, isPetcare]);

  useEffect(() => {
    if (!user?.id) return;
    fetchReservations();
    const channel = supabase.channel(`gastro_reservations_${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gastro_reservations', filter: `restaurant_id=eq.${user.id}` }, () => fetchReservations())
      .subscribe();
    const poll = setInterval(fetchReservations, 15000);
    return () => { supabase.removeChannel(channel); clearInterval(poll); };
  }, [user?.id, fetchReservations]);

  const setStatus = async (id: string, status: string) => {
    try {
      const { error } = await supabase.from('gastro_reservations').update({ status }).eq('id', id);
      if (error) throw error;
      setReservations(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    } catch (err: any) {
      showNotification(`Error: ${err?.message ?? err}`, 'error');
    }
  };

  const togglePaid = async (id: string, current?: string) => {
    const next = current === 'pagado' ? 'pendiente' : 'pagado';
    try {
      const { error } = await supabase.from('gastro_reservations').update({ payment_status: next }).eq('id', id);
      if (error) throw error;
      setReservations(prev => prev.map(r => r.id === id ? { ...r, payment_status: next } : r));
    } catch (err: any) {
      showNotification(`Error: ${err?.message ?? err}`, 'error');
    }
  };

  const saveBox = async (id: string) => {
    const t = tableDraft[id]?.trim() || null;
    try {
      const { error } = await supabase.from('gastro_reservations').update({ table_number: t }).eq('id', id);
      if (error) throw error;
      setReservations(prev => prev.map(r => r.id === id ? { ...r, table_number: t } : r));
      setTableDraft(prev => { const n = { ...prev }; delete n[id]; return n; });
      showNotification(isClinic ? 'Box/Sala asignado' : 'Mesa asignada', 'success');
    } catch (err: any) {
      showNotification(`Error: ${err?.message ?? err}`, 'error');
    }
  };

  const deleteReservation = async (id: string) => {
    if (!window.confirm(isClinic ? '¿Eliminar esta cita?' : '¿Eliminar esta reserva?')) return;
    try {
      const { error } = await supabase.from('gastro_reservations').delete().eq('id', id);
      if (error) throw error;
      setReservations(prev => prev.filter(r => r.id !== id));
    } catch (err: any) {
      showNotification(`Error: ${err?.message ?? err}`, 'error');
    }
  };

  // ── Asignar punto al carnet del paciente (solo medical) ──────────────
  const awardPoint = async (r: GastroReservation) => {
    if (!r.member_code) { showNotification('Esta cita no tiene un paciente con carnet (código de miembro).', 'error'); return; }
    if (r.points_awarded) return;
    try {
      const { data: cli, error: e1 } = await supabase
        .from('gastro_clients').select('id, visits')
        .eq('restaurant_id', user.id).eq('member_code', r.member_code).maybeSingle();
      if (e1) throw e1;
      if (!cli) { showNotification('No se encontró el carnet de este paciente.', 'error'); return; }
      const { error: e2 } = await supabase.from('gastro_clients').update({ visits: (cli.visits || 0) + 1 }).eq('id', cli.id);
      if (e2) throw e2;
      const { error: e3 } = await supabase.from('gastro_reservations').update({ points_awarded: true }).eq('id', r.id);
      if (e3) throw e3;
      setReservations(prev => prev.map(x => x.id === r.id ? { ...x, points_awarded: true } : x));
      showNotification('✅ Punto asignado al carnet del paciente', 'success');
    } catch (err: any) {
      showNotification(`Error: ${err?.message ?? err}`, 'error');
    }
  };

  // ── PDF de citas del período (semana / mes) ──────────────────────────
  const [pdfBusy, setPdfBusy] = useState(false);
  const downloadPeriodPDF = async (range: 'week' | 'month') => {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      const now = new Date();
      const start = range === 'week'
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
        : new Date(now.getFullYear(), now.getMonth(), 1);
      const startStr = start.toISOString().slice(0, 10);
      const endStr = todayStr();
      const rows = reservations
        .filter(r => r.reservation_date >= startStr && r.reservation_date <= endStr)
        .sort((a, b) => (a.reservation_date + a.reservation_time).localeCompare(b.reservation_date + b.reservation_time));
      const { default: jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;
      const doc = new jsPDF();
      doc.setFontSize(18); doc.setTextColor(20, 20, 20);
      doc.text(profileData?.displayName || 'Agenda de Citas', 14, 18);
      doc.setFontSize(11); doc.setTextColor(120, 120, 120);
      doc.text(`Citas ${range === 'week' ? 'de la semana' : 'del mes'} (${startStr} → ${endStr})`, 14, 25);
      doc.text(`Generado: ${new Date().toLocaleString('es-EC')}`, 14, 31);
      doc.setDrawColor(255, 107, 53); doc.setLineWidth(0.6); doc.line(14, 35, 196, 35);
      autoTable(doc, {
        startY: 42,
        head: [['Fecha', 'Hora', 'Paciente', 'Pers.', 'Estado', 'Pago', 'Código']],
        body: rows.map(r => [
          r.reservation_date, r.reservation_time, r.customer_name, String(r.party_size),
          (STATUS_META[r.status]?.label || r.status), (r.payment_status === 'pagado' ? 'Pagado' : 'Pendiente'), r.confirmation_code || '',
        ]),
        foot: [['Total', '', `${rows.length} cita(s)`, '', '', '', '']],
        theme: 'striped',
        headStyles: { fillColor: [255, 107, 53], textColor: 255, fontStyle: 'bold' },
        footStyles: { fillColor: [40, 40, 40], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 2.5 },
      });
      doc.save(`citas-${range}-${endStr}.pdf`);
    } catch (e: any) {
      showNotification(`No se pudo generar el PDF: ${e?.message ?? e}`, 'error');
    } finally { setPdfBusy(false); }
  };

  // ── Settings ─────────────────────────────────────────────────
  const [showSettings, setShowSettings] = useState(false);
  const settings = profileData?.reservationSettings || {};
  const [enabled, setEnabled] = useState<boolean>(!!profileData?.reservationsEnabled);
  const [maxParty, setMaxParty] = useState<number>(settings.maxPartySize ?? 12);
  const [openTime, setOpenTime] = useState<string>(settings.openTime ?? '08:00');
  const [closeTime, setCloseTime] = useState<string>(settings.closeTime ?? '18:00');
  const [daysAhead, setDaysAhead] = useState<number>(settings.daysAhead ?? 30);
  const [autoConfirm, setAutoConfirm] = useState<boolean>(!!settings.autoConfirm);
  const [savingSettings, setSavingSettings] = useState(false);

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const newSettings = { maxPartySize: maxParty, openTime, closeTime, daysAhead, autoConfirm };
      const { error } = await supabase.from('profiles')
        .update({ reservationsEnabled: enabled, reservationSettings: newSettings }).eq('id', user.id);
      if (error) throw error;
      setProfileData((prev: any) => ({ ...prev, reservationsEnabled: enabled, reservationSettings: newSettings }));
      showNotification(isClinic ? 'Configuración de citas guardada' : 'Configuración de reservas guardada', 'success');
      setShowSettings(false);
    } catch (err: any) {
      showNotification(`Error al guardar: ${err?.message ?? err}`, 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  // ── Descarga en Excel por rango de fechas ────────────────────────────
  // Las etiquetas cambian con la plantilla: el restaurante habla de mesas y
  // personas, la clínica de boxes y pacientes.
  const exportColumns = useMemo<ExportColumn<GastroReservation>[]>(() => [
    { header: 'Fecha', get: r => r.reservation_date },
    { header: 'Hora', get: r => r.reservation_time },
    { header: isClinic ? 'Paciente' : 'Cliente', get: r => r.customer_name },
    { header: 'Teléfono', get: r => r.customer_phone || '' },
    { header: 'Email', get: r => r.customer_email || '' },
    { header: isClinic ? 'Pacientes' : 'Personas', get: r => Number(r.party_size) || 0 },
    { header: 'Estado', get: r => STATUS_META[r.status]?.label || r.status },
    { header: 'Pago', get: r => (r.payment_status === 'pagado' ? 'Pagado' : 'Pendiente') },
    { header: isClinic ? 'Box / Sala' : 'Mesa', get: r => r.table_number || '' },
    { header: isClinic ? 'Código de cita' : 'Código de reserva', get: r => r.confirmation_code || '' },
    { header: 'Código de cliente', get: r => r.member_code || '' },
    {
      header: 'Pre-pedido',
      get: r => (Array.isArray(r.preorder_items) ? r.preorder_items : [])
        .map((it: any) => `${it?.qty ?? 1}x ${it?.name ?? ''}`.trim())
        .filter(Boolean).join(' | '),
    },
    { header: 'Notas', get: r => r.notes || '' },
    { header: 'Registrada el', get: r => (r.created_at ? new Date(r.created_at).toLocaleString('es-EC') : '') },
  ], [isClinic, STATUS_META]);

  const fetchReservationRange = useCallback((range: DateRange) => fetchOwnerRange<GastroReservation>({
    table: 'gastro_reservations',
    ownerColumn: 'restaurant_id',
    ownerId: user.id,
    dateColumn: 'reservation_date',
    range,
    orderBy: [{ column: 'reservation_date' }, { column: 'reservation_time' }],
  }), [user?.id]);

  const filtered = useMemo(() => {
    if (!dateFilter) return reservations;
    return reservations.filter(r => r.reservation_date === dateFilter);
  }, [reservations, dateFilter]);

  // Agenda del día. Se arma con las reservas YA cargadas: no añade ninguna
  // consulta y el panel funciona aunque todavía no se haya ejecutado el SQL.
  const agendaRows = useMemo<AgendaRow[]>(() => reservations.map(r => ({
    id: r.id,
    date: r.reservation_date,
    time: r.reservation_time || '',
    name: r.customer_name,
    phone: r.customer_phone || '',
    status: r.status,
    detail: isClinic
      ? (r.table_number ? `Box ${r.table_number}` : undefined)
      : `${r.party_size || 1} personas${r.table_number ? ` · Mesa ${r.table_number}` : ''}`,
  })), [reservations, isClinic]);

  const upcoming = filtered.filter(r => r.status === 'pendiente' || r.status === 'confirmada');
  const past = filtered.filter(r => r.status === 'sentada' || r.status === 'cancelada' || r.status === 'no_show');
  const todaysCovers = useMemo(
    () => reservations.filter(r => r.reservation_date === todayStr() && r.status !== 'cancelada' && r.status !== 'no_show')
      .reduce((s, r) => s + Number(r.party_size || 0), 0),
    [reservations]
  );
  const pendingCount = reservations.filter(r => r.status === 'pendiente').length;

  if (loading) {
    return <div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#ff6b35]" /></div>;
  }

  return (
    <div className="animate-fade-in-up space-y-6 max-w-4xl mx-auto px-4 md:px-6 pb-32"
         style={{ fontFamily: "'Space Grotesk', sans-serif" }}>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#ff6b35]/15 pb-5">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2">
            {isPetcare ? <FaPaw className="text-[#ff6b35]" /> : <FaCalendarCheck className="text-[#ff6b35]" />}
            {isClinic ? 'Citas y Agendamiento' : 'Reservas'}
          </h2>
          <p className="text-sm text-white/40 mt-1">
            {isPetcare
              ? 'Gestiona las citas de tu clínica en tiempo real. Confirma solo las que tengan pago adelantado.'
              : 'Gestiona las reservas de mesa de tu restaurante en tiempo real.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => ping()} title="Probar alarma"
            className="flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wider text-[#ff6b35] bg-[#ff6b35]/15 border border-[#ff6b35]/20 rounded-xl hover:bg-[#ff6b35]/25 transition-all">
            <FaVolumeUp />
          </button>
          <button onClick={() => setShowSettings(s => !s)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-black uppercase tracking-wider text-white bg-white/5 border border-[#ff6b35]/20 rounded-xl hover:bg-white/10 transition-all">
            <FaCog /> Configurar
          </button>
        </div>
      </div>

      {/* Aviso si desactivado */}
      {!profileData?.reservationsEnabled && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-xs text-amber-200/90">
          {isPetcare
            ? 'El agendamiento está <b>desactivado</b> en tu perfil público. Actívalo en <b>Configurar</b> para que tus clientes puedan agendar citas.'
            : 'Las reservas están <b>desactivadas</b> en tu perfil público. Actívalas en <b>Configurar</b> para que tus clientes puedan reservar.'}
        </div>
      )}

      {/* Settings panel */}
      {showSettings && (
        <div className="bg-white/[0.03] border border-[#ff6b35]/15 rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-black uppercase tracking-widest text-[#ff6b35] flex items-center gap-2"><FaCog size={12} /> Configuración</h3>
          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <span className="text-sm text-white/80">
              {isClinic ? 'Aceptar citas en el perfil público' : 'Aceptar reservas en el perfil público'}
            </span>
            <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="w-5 h-5 accent-[#ff6b35]" />
          </label>
          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <span className="text-sm text-white/80">
              {isClinic ? 'Confirmar citas automáticamente' : 'Confirmar reservas automáticamente'}
            </span>
            <input type="checkbox" checked={autoConfirm} onChange={e => setAutoConfirm(e.target.checked)} className="w-5 h-5 accent-[#ff6b35]" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-white/50 uppercase tracking-widest font-bold mb-1">
                {isClinic ? 'Máx. pacientes/cita' : 'Máx. personas/reserva'}
              </label>
              <input type="number" min={1} max={50} value={maxParty} onChange={e => setMaxParty(parseInt(e.target.value, 10) || 1)} className={inputCls} />
            </div>
            <div>
              <label className="block text-[10px] text-white/50 uppercase tracking-widest font-bold mb-1">Días a futuro</label>
              <input type="number" min={1} max={365} value={daysAhead} onChange={e => setDaysAhead(parseInt(e.target.value, 10) || 1)} className={inputCls} />
            </div>
            <div>
              <label className="block text-[10px] text-white/50 uppercase tracking-widest font-bold mb-1">Apertura</label>
              <input type="time" value={openTime} onChange={e => setOpenTime(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-[10px] text-white/50 uppercase tracking-widest font-bold mb-1">Cierre</label>
              <input type="time" value={closeTime} onChange={e => setCloseTime(e.target.value)} className={inputCls} />
            </div>
          </div>
          <button onClick={saveSettings} disabled={savingSettings}
            className="w-full py-3 rounded-xl bg-[#ff6b35] hover:bg-[#e85a25] text-white font-black text-xs uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2">
            <FaSave size={12} /> {savingSettings ? 'Guardando...' : 'Guardar configuración'}
          </button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white/[0.03] border border-[#ff6b35]/15 rounded-2xl p-4">
          <div className="text-[10px] uppercase tracking-widest text-white/40 font-bold">
            {isClinic ? 'Hoy (pacientes)' : 'Hoy (cubiertos)'}
          </div>
          <div className="text-2xl font-black text-white mt-1">{todaysCovers}</div>
        </div>
        <div className={`rounded-2xl p-4 border ${pendingCount > 0 ? 'bg-amber-500/10 border-amber-500/30' : 'bg-white/[0.03] border-[#ff6b35]/15'}`}>
          <div className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Pendientes</div>
          <div className={`text-2xl font-black mt-1 ${pendingCount > 0 ? 'text-amber-400' : 'text-white'}`}>{pendingCount}</div>
        </div>
        <div className="bg-white/[0.03] border border-[#ff6b35]/15 rounded-2xl p-4">
          <div className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Total</div>
          <div className="text-2xl font-black text-white mt-1">{reservations.length}</div>
        </div>
      </div>

      {/* Filtro por fecha */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-xs text-white/50 uppercase tracking-widest font-bold">Fecha</label>
        <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
          className="bg-black/40 border border-[#ff6b35]/20 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-[#ff6b35]" />
        <button onClick={() => setDateFilter('')} className="text-xs text-white/50 hover:text-white underline">Ver todas</button>
        <button onClick={() => setDateFilter(todayStr())} className="text-xs text-[#ff6b35] hover:text-[#ff8f61] underline">Hoy</button>
        {isClinic && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Reporte PDF:</span>
            <button onClick={() => downloadPeriodPDF('week')} disabled={pdfBusy}
              className="px-3 py-1.5 rounded-lg bg-[#ff6b35]/10 border border-[#ff6b35]/25 text-[#ff6b35] text-[10px] font-black uppercase tracking-wider hover:bg-[#ff6b35]/20 disabled:opacity-50 transition">📄 Semana</button>
            <button onClick={() => downloadPeriodPDF('month')} disabled={pdfBusy}
              className="px-3 py-1.5 rounded-lg bg-[#ff6b35]/10 border border-[#ff6b35]/25 text-[#ff6b35] text-[10px] font-black uppercase tracking-wider hover:bg-[#ff6b35]/20 disabled:opacity-50 transition">📄 Mes</button>
          </div>
        )}
      </div>

      {/* Agenda de hoy + recordatorio al cliente por WhatsApp */}
      <DailyAgendaPanel
        accent="#ff6b35"
        noun={isClinic ? 'cita' : 'reserva'}
        businessName={profileData?.displayName || profileData?.username}
        rows={agendaRows}
        table="gastro_reservations"
      />

      {/* Descarga en Excel por rango de fechas */}
      <ExportRangePanel<GastroReservation>
        accent="#ff6b35"
        noun={isClinic ? 'citas' : 'reservas'}
        dateLabel={isClinic ? 'Fecha de la cita' : 'Fecha de la reserva'}
        fileBase={`${isClinic ? 'citas' : 'reservas'}_${profileData?.username || 'negocio'}`}
        sheetName={isClinic ? 'Citas' : 'Reservas'}
        localRows={reservations}
        getDate={r => r.reservation_date}
        fetchRange={fetchReservationRange}
        columns={exportColumns}
        showNotification={showNotification}
        hint={isClinic
          ? 'Incluye paciente, contacto, box asignado, estado, pago y notas de cada cita.'
          : 'Incluye cliente, contacto, personas, mesa, estado, pago y pre-pedido de cada reserva.'}
      />

      {/* Próximas / Activas */}
      <div>
        <h3 className="text-sm font-bold tracking-widest text-[#ff6b35] uppercase mb-3">
          {isClinic ? 'Citas Próximas / Activas' : 'Próximas / Activas'} ({upcoming.length})
        </h3>
        {upcoming.length === 0 ? (
          <div className="p-8 text-center bg-white/[0.02] rounded-2xl border border-white/5 text-gray-500 text-sm">
            {isClinic ? 'No hay citas activas para esta fecha.' : 'No hay reservas activas para esta fecha.'}
          </div>
        ) : (
          <div className="space-y-3">
            {upcoming.map(r => {
              const sm = STATUS_META[r.status] || STATUS_META.pendiente;
              return (
                <div key={r.id} className="bg-gradient-to-r from-[#170902] to-[#0f0400] border border-[#ff6b35]/25 rounded-2xl p-5">
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-base font-bold text-white truncate">{r.customer_name}</h4>
                        <span className={`text-[9px] font-black uppercase tracking-widest rounded px-1.5 py-0.5 border ${sm.color}`}>{sm.label}</span>
                        {r.member_code && <span className="text-[9px] font-black uppercase tracking-widest text-[#ff6b35] bg-[#ff6b35]/10 border border-[#ff6b35]/25 rounded px-1.5 py-0.5">⭐ {r.member_code}</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-xs text-white/60 flex-wrap">
                        <span className="inline-flex items-center gap-1"><FaCalendarCheck className="text-[#ff6b35]" size={11} /> {new Date(r.reservation_date + 'T00:00:00').toLocaleDateString('es-EC', { weekday: 'short', day: '2-digit', month: 'short' })}</span>
                        <span className="inline-flex items-center gap-1"><FaClock className="text-[#ff6b35]" size={11} /> {r.reservation_time}</span>
                        <span className="inline-flex items-center gap-1"><FaUsers className="text-[#ff6b35]" size={11} /> {r.party_size} {isClinic ? 'paciente(s)' : 'pers.'}</span>
                      </div>
                      {r.notes && <p className="text-xs text-white/40 mt-2 italic">"{r.notes}"</p>}
                      {Array.isArray(r.preorder_items) && r.preorder_items.length > 0 && (
                        <div className="mt-2 p-2.5 rounded-lg bg-[#ff6b35]/8 border border-[#ff6b35]/20">
                          <p className="text-[9px] font-black uppercase tracking-widest text-[#ff6b35] mb-1 flex items-center gap-1">
                            {isPetcare ? <FaPaw size={9} /> : <FaUtensils size={9} />}
                            {isClinic ? 'Pre-pedido de productos' : 'Pre-pedido'}
                          </p>
                          <div className="space-y-0.5">
                            {r.preorder_items.map((it: any, i: number) => (
                              <div key={i} className="flex justify-between text-[11px] text-white/70">
                                <span>{it.qty}x {it.name}</span>
                                {it.price && <span className="font-mono text-white/50">{it.price}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="text-[11px] text-white/40 mt-1 font-mono">Cód. {r.confirmation_code}</div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {r.customer_phone && (
                        <a href={waLink(r.customer_phone, isPetcare
                          ? `Hola ${r.customer_name}, sobre la cita del ${r.reservation_date} a las ${r.reservation_time}.`
                          : `Hola ${r.customer_name}, sobre tu reserva del ${r.reservation_date} a las ${r.reservation_time}.`)}
                          target="_blank" rel="noopener noreferrer"
                          className="w-9 h-9 rounded-lg bg-[#25D366]/10 border border-[#25D366]/25 text-[#25D366] flex items-center justify-center"><FaWhatsapp size={15} /></a>
                      )}
                    </div>
                  </div>

                  {/* Asignar box / mesa */}
                  <div className="flex items-center gap-2 mt-3 bg-black/20 border border-[#ff6b35]/10 rounded-xl p-2.5">
                    <FaChair className="text-[#ff6b35] shrink-0" size={12} />
                    <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">
                      {isClinic ? 'Box / Sala' : 'Mesa'}
                    </span>
                    <input value={tableDraft[r.id] ?? (r.table_number || '')}
                      onChange={e => setTableDraft(prev => ({ ...prev, [r.id]: e.target.value }))}
                      placeholder="—"
                      className="w-20 bg-black/40 border border-[#ff6b35]/20 text-white text-sm rounded-lg px-2 py-1 focus:outline-none focus:border-[#ff6b35]" />
                    <button onClick={() => saveBox(r.id)}
                      className="ml-auto px-3 py-1 rounded-lg bg-[#ff6b35]/15 border border-[#ff6b35]/25 text-[#ff6b35] text-[10px] font-black uppercase tracking-wider hover:bg-[#ff6b35]/25">
                      Asignar
                    </button>
                  </div>

                  {/* Acciones de estado */}
                  <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-white/5">
                    <button onClick={() => togglePaid(r.id, r.payment_status)}
                      className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider border flex items-center gap-1.5 transition ${
                        r.payment_status === 'pagado'
                          ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                          : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300'
                      }`}>
                      💳 {r.payment_status === 'pagado' ? 'Pagado' : 'Sin pago'}
                    </button>
                    {r.status === 'pendiente' && (
                      <button onClick={() => setStatus(r.id, 'confirmada')}
                        className="px-3.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-black uppercase tracking-wider hover:bg-emerald-500/25 flex items-center gap-1.5">
                        <FaCheck size={11} /> {isClinic ? 'Confirmar cita' : 'Confirmar'}
                      </button>
                    )}
                    {(r.status === 'pendiente' || r.status === 'confirmada') && (
                      <button onClick={() => setStatus(r.id, 'sentada')}
                        className="px-3.5 py-2 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-300 text-xs font-black uppercase tracking-wider hover:bg-blue-500/25 flex items-center gap-1.5">
                        <FaChair size={11} /> {isClinic ? 'En consulta' : 'Sentar'}
                      </button>
                    )}
                    <button onClick={() => setStatus(r.id, 'no_show')}
                      className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/50 text-xs font-bold hover:text-amber-400 transition">
                      No-show
                    </button>
                    <button onClick={() => setStatus(r.id, 'cancelada')}
                      className="px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold hover:bg-red-500/20">
                      Cancelar
                    </button>
                    {/* Asignar punto al carnet: solo medical, con carnet, el día de la cita o después */}
                    {isMedical && r.member_code && r.reservation_date <= todayStr() && (
                      r.points_awarded ? (
                        <span className="px-3 py-2 rounded-xl bg-blue-500/10 border border-blue-500/25 text-blue-300 text-xs font-black uppercase tracking-wider flex items-center gap-1.5">⭐ Punto asignado</span>
                      ) : (
                        <button onClick={() => awardPoint(r)}
                          className="px-3.5 py-2 rounded-xl bg-[#2563eb]/15 border border-[#2563eb]/40 text-[#93c5fd] text-xs font-black uppercase tracking-wider hover:bg-[#2563eb]/25 flex items-center gap-1.5">
                          ⭐ + Punto al carnet
                        </button>
                      )
                    )}
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
                      {new Date(r.reservation_date + 'T00:00:00').toLocaleDateString('es-EC', { day: '2-digit', month: 'short' })} · {r.reservation_time} · {r.party_size} {isClinic ? 'pac.' : 'pers.'}{r.table_number ? ` · ${isClinic ? 'Box' : 'Mesa'} ${r.table_number}` : ''}
                    </p>
                  </div>
                  <button onClick={() => deleteReservation(r.id)} className="text-white/30 hover:text-red-400 text-xs shrink-0"><FaTimes /></button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default GastroReservationsTab;
