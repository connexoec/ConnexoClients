import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../src/lib/supabase';
import type {
  EcomStaff, EcomStaffHours, EcomAppointment,
  EcomBookingField, EcomBookingFieldType,
  EcomAppointmentItem, EcomAppointmentFormAnswer,
} from '../../types';
import {
  FaCalendarCheck, FaUsers, FaClock, FaWhatsapp, FaCheck, FaTimes,
  FaSave, FaVolumeUp, FaPlus, FaPen, FaTrash, FaImage, FaUserTie,
  FaToggleOn, FaToggleOff, FaShoppingBag, FaWpforms, FaArrowUp, FaArrowDown,
  FaChevronDown,
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
  no_show:    { label: 'No asistió', color: 'text-gray-400 bg-white/5 border-white/10' },
};

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const STAFF_ROLES = ['Asesor comercial', 'Vendedor', 'Técnico', 'Especialista', 'Gerente de cuenta'];
const SLOT_OPTIONS = [15, 20, 30, 45, 60, 90, 120];

const FIELD_TYPES: { value: EcomBookingFieldType; label: string }[] = [
  { value: 'text',     label: 'Texto corto' },
  { value: 'textarea', label: 'Texto largo' },
  { value: 'tel',      label: 'Teléfono' },
  { value: 'email',    label: 'Email' },
  { value: 'number',   label: 'Número' },
  { value: 'date',     label: 'Fecha' },
  { value: 'select',   label: 'Lista de opciones' },
  { value: 'checkbox', label: 'Casilla (sí/no)' },
];

const defaultHours = (): EcomStaffHours[] =>
  Array.from({ length: 7 }, (_, day) => ({
    day,
    isOpen: day >= 1 && day <= 5,   // Lun–Vie abierto por defecto
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
const inputCls = "w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#00e5a0]/50";

/**
 * Respuestas del formulario del negocio.
 *
 * Vive aquí, en un solo sitio, porque lo usan la tarjeta de la cita activa Y el
 * historial. Escribirlo dos veces es exactamente lo que dejó el modal de reseñas
 * duplicado y divergido hasta v0.46.1.
 *
 * La pregunta va ENCIMA de la respuesta a propósito: cuando iban en la misma
 * fila flex con `shrink-0`, una pregunta larga empujaba la fila fuera de la
 * pantalla. `min-w-0` es imprescindible para que `break-words` llegue a actuar
 * dentro de un flex.
 */
const AnswersBlock: React.FC<{ answers: EcomAppointmentFormAnswer[] }> = ({ answers }) => {
  if (!answers.length) return null;
  return (
    <div className="bg-black/30 border border-white/10 rounded-xl p-3 space-y-2.5 min-w-0">
      {answers.map((f, i) => (
        <div key={`${f.id}_${i}`} className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wider text-white/35 break-words">
            {f.label}
          </div>
          {/* whitespace-pre-wrap: los campos de texto largo pueden traer saltos
              de línea, que antes se aplastaban en un solo párrafo. */}
          <div className="text-xs text-white/85 break-words whitespace-pre-wrap mt-0.5">
            {f.value}
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * Columnas de la descarga en Excel.
 *
 * Se calculan a partir de las citas del rango porque **el formulario es de cada
 * negocio**: cada pregunta que el dueño creó se convierte en una columna, en el
 * orden en que aparece. Una lista fija dejaría fuera justamente lo que el dueño
 * preguntó, que suele ser el dato que más le importa.
 *
 * Las respuestas se guardan con su etiqueta (snapshot), así que las preguntas
 * que el dueño borró después siguen apareciendo en las citas antiguas.
 */
const buildAppointmentColumns = (rows: EcomAppointment[]): ExportColumn<EcomAppointment>[] => {
  const base: ExportColumn<EcomAppointment>[] = [
    { header: 'Fecha', get: a => a.appointment_date },
    { header: 'Hora', get: a => a.appointment_time },
    { header: 'Cliente', get: a => a.customer_name },
    { header: 'Teléfono', get: a => a.customer_phone || '' },
    { header: 'Email', get: a => a.customer_email || '' },
    { header: 'Vendedor', get: a => a.staff_name || '' },
    { header: 'Estado', get: a => STATUS_META[a.status]?.label || a.status },
    { header: 'Código de cita', get: a => a.confirmation_code || '' },
    { header: 'Código de cliente', get: a => a.member_code || '' },
    {
      header: 'Productos / servicios',
      get: a => (Array.isArray(a.items) ? a.items : [])
        .map(i => (i?.price ? `${i.name} (${i.price})` : i?.name || ''))
        .filter(Boolean).join(' | '),
    },
    { header: 'Comentario', get: a => a.notes || '' },
    { header: 'Agendada el', get: a => (a.created_at ? new Date(a.created_at).toLocaleString('es-EC') : '') },
  ];

  const labels: string[] = [];
  rows.forEach(a => (Array.isArray(a.form_data) ? a.form_data : []).forEach(f => {
    const label = String(f?.label ?? '').trim();
    if (label && !labels.includes(label)) labels.push(label);
  }));

  return [
    ...base,
    ...labels.map(label => ({
      header: label,
      get: (a: EcomAppointment) => (Array.isArray(a.form_data) ? a.form_data : [])
        .filter(f => String(f?.label ?? '').trim() === label)
        .map(f => String(f?.value ?? ''))
        .filter(Boolean)
        .join(' | '),
    })),
  ];
};

/** Productos o servicios que el cliente marcó al agendar. */
const ItemChips: React.FC<{ items: EcomAppointmentItem[] }> = ({ items }) => {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 min-w-0">
      {items.map((it, i) => (
        <span key={`${it.id}_${i}`} className="inline-flex items-start gap-1.5 max-w-full text-[11px] text-white/75 bg-white/5 border border-white/10 rounded-lg px-2 py-1">
          <FaShoppingBag className="text-[#00e5a0] shrink-0 mt-0.5" size={9} />
          <span className="min-w-0 break-words">{it.name}{it.price ? ` · ${it.price}` : ''}</span>
        </span>
      ))}
    </div>
  );
};

export const EcomAppointmentsTab: React.FC<Props> = ({ user, profileData, setProfileData, showNotification }) => {
  const [view, setView] = useState<'citas' | 'vendedores' | 'formulario'>('citas');

  // ═══════════════════════ VENDEDORES (ecom_staff) ═══════════════════════
  const [staff, setStaff] = useState<EcomStaff[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(true);

  const fetchStaff = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await supabase.from('ecom_staff')
      .select('*').eq('seller_id', user.id)
      .order('sort_order', { ascending: true }).order('created_at', { ascending: true });
    if (!error) setStaff((data as EcomStaff[]) || []);
    setLoadingStaff(false);
  }, [user?.id]);

  useEffect(() => { fetchStaff(); }, [fetchStaff]);

  const [editingStaff, setEditingStaff] = useState<EcomStaff | null>(null);
  const [staffForm, setStaffForm] = useState<Partial<EcomStaff>>({});
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savingStaff, setSavingStaff] = useState(false);

  const openNewStaff = () => {
    setEditingStaff(null);
    setStaffForm({ name: '', role: '', photo_url: '', is_active: true, slot_minutes: 30, working_hours: defaultHours() });
    setStaffModalOpen(true);
  };
  const openEditStaff = (s: EcomStaff) => {
    setEditingStaff(s);
    setStaffForm({
      ...s,
      slot_minutes: s.slot_minutes || 30,
      working_hours: Array.isArray(s.working_hours) && s.working_hours.length === 7 ? s.working_hours : defaultHours(),
    });
    setStaffModalOpen(true);
  };
  const closeStaffModal = () => { setStaffModalOpen(false); setEditingStaff(null); setStaffForm({}); };

  const handlePhotoUpload = async (file: File) => {
    if (!user?.id) return;
    const slotId = editingStaff?.id || `tmp_${Date.now()}`;
    setUploading(true);
    try {
      await supabase.storage.from('assets').upload(`ecom_staff/${user.id}/${slotId}`, file, { upsert: true });
      const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(`ecom_staff/${user.id}/${slotId}`);
      setStaffForm(prev => ({ ...prev, photo_url: `${publicUrl}?v=${Date.now()}` }));
    } catch (err: any) {
      showNotification(`Error al subir foto: ${err?.message}`, 'error');
    } finally {
      setUploading(false);
    }
  };

  const updateHour = (day: number, field: keyof EcomStaffHours, value: any) => {
    setStaffForm(prev => ({
      ...prev,
      working_hours: (prev.working_hours || defaultHours()).map(h => h.day === day ? { ...h, [field]: value } : h),
    }));
  };

  const saveStaff = async () => {
    if (!staffForm.name?.trim()) { showNotification('El nombre del vendedor es requerido.', 'error'); return; }
    setSavingStaff(true);
    try {
      const payload = {
        seller_id: user.id,
        name: staffForm.name.trim(),
        role: staffForm.role?.trim() || null,
        photo_url: staffForm.photo_url || null,
        working_hours: staffForm.working_hours || defaultHours(),
        slot_minutes: staffForm.slot_minutes || 30,
        is_active: staffForm.is_active !== false,
        sort_order: editingStaff?.sort_order ?? staff.length,
      };
      if (editingStaff) {
        const { error } = await supabase.from('ecom_staff').update(payload).eq('id', editingStaff.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('ecom_staff').insert(payload);
        if (error) throw error;
      }
      await fetchStaff();
      showNotification(editingStaff ? 'Vendedor actualizado' : 'Vendedor agregado', 'success');
      closeStaffModal();
    } catch (err: any) {
      showNotification(`Error: ${err?.message}`, 'error');
    } finally {
      setSavingStaff(false);
    }
  };

  const toggleStaffActive = async (s: EcomStaff) => {
    const next = !(s.is_active !== false);
    setStaff(prev => prev.map(x => x.id === s.id ? { ...x, is_active: next } : x));
    await supabase.from('ecom_staff').update({ is_active: next }).eq('id', s.id);
  };

  const deleteStaff = async (id: string) => {
    if (!window.confirm('¿Eliminar este vendedor? Sus citas pasadas se conservan.')) return;
    try {
      const { error } = await supabase.from('ecom_staff').delete().eq('id', id);
      if (error) throw error;
      setStaff(prev => prev.filter(s => s.id !== id));
      showNotification('Vendedor eliminado', 'success');
    } catch (err: any) {
      showNotification(`Error: ${err?.message}`, 'error');
    }
  };

  // ═══════════════════════ CITAS (ecom_appointments) ═══════════════════════
  const [appointments, setAppointments] = useState<EcomAppointment[]>([]);
  const [loadingApp, setLoadingApp] = useState(true);
  const [dateFilter, setDateFilter] = useState<string>(todayStr());
  // Cita cerrada cuyo detalle está desplegado (sólo una a la vez: el historial
  // puede ser largo y abrirlas todas lo volvería ilegible).
  const [expandedPast, setExpandedPast] = useState<string | null>(null);
  const knownIds = useRef<Set<string>>(new Set());
  const inited = useRef(false);

  const fetchAppointments = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase.from('ecom_appointments')
        .select('*').eq('seller_id', user.id)
        .order('appointment_date', { ascending: true })
        .order('appointment_time', { ascending: true });
      if (error) throw error;
      const list = (data as EcomAppointment[]) || [];
      if (inited.current) {
        const fresh = list.filter(a => !knownIds.current.has(a.id));
        if (fresh.length > 0) {
          ping();
          showNotification(`Nueva cita · ${fresh[0].customer_name}`, 'success');
        }
      }
      knownIds.current = new Set(list.map(a => a.id));
      inited.current = true;
      setAppointments(list);
    } catch (err: any) {
      console.error('ecom appointments fetch error:', err);
    } finally {
      setLoadingApp(false);
    }
  }, [user?.id, showNotification]);

  useEffect(() => {
    if (!user?.id) return;
    fetchAppointments();
    const channel = supabase.channel(`ecom_appointments_${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ecom_appointments', filter: `seller_id=eq.${user.id}` }, () => fetchAppointments())
      .subscribe();
    const poll = setInterval(fetchAppointments, 15000);
    return () => { supabase.removeChannel(channel); clearInterval(poll); };
  }, [user?.id, fetchAppointments]);

  const setStatus = async (id: string, status: string) => {
    try {
      const { error } = await supabase.from('ecom_appointments').update({ status }).eq('id', id);
      if (error) throw error;
      setAppointments(prev => prev.map(a => a.id === id ? { ...a, status: status as any } : a));
    } catch (err: any) {
      showNotification(`Error: ${err?.message ?? err}`, 'error');
    }
  };

  const deleteAppointment = async (id: string) => {
    if (!window.confirm('¿Eliminar esta cita?')) return;
    try {
      const { error } = await supabase.from('ecom_appointments').delete().eq('id', id);
      if (error) throw error;
      setAppointments(prev => prev.filter(a => a.id !== id));
    } catch (err: any) {
      showNotification(`Error: ${err?.message ?? err}`, 'error');
    }
  };

  const filtered = useMemo(() => {
    if (!dateFilter) return appointments;
    return appointments.filter(a => a.appointment_date === dateFilter);
  }, [appointments, dateFilter]);

  // Agenda del día. Se arma con las citas YA cargadas: no añade ninguna
  // consulta y el panel funciona aunque todavía no se haya ejecutado el SQL.
  const agendaRows = useMemo<AgendaRow[]>(() => appointments.map(a => ({
    id: a.id,
    date: a.appointment_date,
    time: a.appointment_time || '',
    name: a.customer_name,
    phone: a.customer_phone || '',
    status: a.status,
    detail: a.staff_name || undefined,
  })), [appointments]);

  // Descarga en Excel: se pide al servidor exactamente el rango elegido, sin
  // tocar `appointments` ni el filtro de la pantalla.
  const fetchAppointmentRange = useCallback((range: DateRange) => fetchOwnerRange<EcomAppointment>({
    table: 'ecom_appointments',
    ownerColumn: 'seller_id',
    ownerId: user.id,
    dateColumn: 'appointment_date',
    range,
    orderBy: [{ column: 'appointment_date' }, { column: 'appointment_time' }],
  }), [user?.id]);

  const upcoming = filtered.filter(a => a.status === 'pendiente' || a.status === 'confirmada');
  const past = filtered.filter(a => a.status === 'completada' || a.status === 'cancelada' || a.status === 'no_show');
  const todaysCount = appointments.filter(a => a.appointment_date === todayStr() && a.status !== 'cancelada' && a.status !== 'no_show').length;
  const pendingCount = appointments.filter(a => a.status === 'pendiente').length;
  const activeStaffCount = staff.filter(s => s.is_active !== false).length;

  // ═══════════════════════ FORMULARIO PERSONALIZADO ═══════════════════════
  // Vive en profiles.ecom_booking_form (jsonb) de ESTE perfil: ningún otro
  // usuario ecom ni ninguna otra plantilla se ve afectada.
  const [fields, setFields] = useState<EcomBookingField[]>([]);
  const [savingForm, setSavingForm] = useState(false);
  const [formDirty, setFormDirty] = useState(false);

  useEffect(() => {
    const raw = profileData?.ecom_booking_form;
    setFields(Array.isArray(raw) ? raw : []);
    setFormDirty(false);
  }, [profileData?.ecom_booking_form]);

  const newFieldId = () => `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  const addField = () => {
    setFields(prev => [...prev, { id: newFieldId(), label: '', type: 'text', required: false, placeholder: '' }]);
    setFormDirty(true);
  };
  const updateField = (id: string, patch: Partial<EcomBookingField>) => {
    setFields(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));
    setFormDirty(true);
  };
  const removeField = (id: string) => {
    setFields(prev => prev.filter(f => f.id !== id));
    setFormDirty(true);
  };
  const moveField = (index: number, dir: -1 | 1) => {
    setFields(prev => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setFormDirty(true);
  };
  const updateOption = (fieldId: string, idx: number, value: string) => {
    setFields(prev => prev.map(f => {
      if (f.id !== fieldId) return f;
      const options = [...(f.options || [])];
      options[idx] = value;
      return { ...f, options };
    }));
    setFormDirty(true);
  };
  const addOption = (fieldId: string) => {
    setFields(prev => prev.map(f => f.id === fieldId ? { ...f, options: [...(f.options || []), ''] } : f));
    setFormDirty(true);
  };
  const removeOption = (fieldId: string, idx: number) => {
    setFields(prev => prev.map(f => f.id === fieldId ? { ...f, options: (f.options || []).filter((_, i) => i !== idx) } : f));
    setFormDirty(true);
  };

  const saveForm = async () => {
    // Un campo sin etiqueta no se puede mostrar ni guardar con sentido.
    const blank = fields.find(f => !f.label.trim());
    if (blank) { showNotification('Cada campo necesita un nombre (etiqueta).', 'error'); return; }
    const badSelect = fields.find(f => f.type === 'select' && (f.options || []).filter(o => o.trim()).length === 0);
    if (badSelect) { showNotification(`"${badSelect.label}" es una lista: agrégale al menos una opción.`, 'error'); return; }

    setSavingForm(true);
    try {
      const clean: EcomBookingField[] = fields.map(f => ({
        id: f.id,
        label: f.label.trim(),
        type: f.type,
        required: !!f.required,
        placeholder: f.placeholder?.trim() || undefined,
        options: f.type === 'select' ? (f.options || []).map(o => o.trim()).filter(Boolean) : undefined,
      }));
      const { error } = await supabase.from('profiles')
        .update({ ecom_booking_form: clean })
        .eq('id', user.id);
      if (error) throw error;
      setProfileData((prev: any) => ({ ...prev, ecom_booking_form: clean }));
      setFields(clean);
      setFormDirty(false);
      showNotification('Formulario guardado', 'success');
    } catch (err: any) {
      showNotification(`Error al guardar: ${err?.message ?? err}`, 'error');
    } finally {
      setSavingForm(false);
    }
  };

  // ═══════════════════════ Modal de vendedor ═══════════════════════
  const staffModal = staffModalOpen && createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={closeStaffModal}>
      <div className="bg-[#0b1219] border border-[#00e5a0]/20 rounded-2xl w-full max-w-lg shadow-2xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-white/5 sticky top-0 bg-[#0b1219] z-10">
          <h3 className="font-black text-[#00e5a0] uppercase tracking-wider text-sm">
            {editingStaff ? 'Editar vendedor' : 'Nuevo vendedor'}
          </h3>
          <button onClick={closeStaffModal} className="text-white/40 hover:text-white transition"><FaTimes /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Foto */}
          <div className="flex items-center gap-4">
            {staffForm.photo_url ? (
              <img src={staffForm.photo_url} className="w-20 h-20 rounded-full object-cover border border-[#00e5a0]/20 shrink-0" alt="preview" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-white/5 border border-dashed border-white/20 flex items-center justify-center text-white/30 shrink-0">
                <FaImage className="text-2xl" />
              </div>
            )}
            <label className="flex-1 cursor-pointer">
              <input type="file" accept="image/*" className="hidden"
                onChange={e => e.target.files?.[0] && handlePhotoUpload(e.target.files[0])} />
              <span className="block text-center text-xs py-2.5 px-4 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white hover:border-[#00e5a0]/40 transition select-none">
                {uploading ? 'Subiendo...' : staffForm.photo_url ? 'Cambiar foto' : 'Subir foto'}
              </span>
            </label>
          </div>

          <input
            value={staffForm.name || ''}
            onChange={e => setStaffForm(p => ({ ...p, name: e.target.value }))}
            placeholder="Nombre del vendedor *"
            className={inputCls}
          />
          <div>
            <input
              list="ecom-staff-roles"
              value={staffForm.role || ''}
              onChange={e => setStaffForm(p => ({ ...p, role: e.target.value }))}
              placeholder="Cargo (ej. Asesor comercial, Técnico...)"
              className={inputCls}
            />
            <datalist id="ecom-staff-roles">
              {STAFF_ROLES.map(r => <option key={r} value={r} />)}
            </datalist>
          </div>

          {/* Duración de cada cita */}
          <div>
            <label className="block text-[10px] text-[#00e5a0]/70 uppercase tracking-widest font-bold mb-2">
              Duración de cada cita
            </label>
            <div className="flex flex-wrap gap-2">
              {SLOT_OPTIONS.map(m => (
                <button key={m} type="button"
                  onClick={() => setStaffForm(p => ({ ...p, slot_minutes: m }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                    (staffForm.slot_minutes || 30) === m
                      ? 'bg-[#00e5a0] text-black border-[#00e5a0]'
                      : 'bg-white/5 text-white/60 border-white/10 hover:border-[#00e5a0]/40'
                  }`}>
                  {m} min
                </button>
              ))}
            </div>
            <p className="text-[10px] text-white/30 mt-2">
              Define la grilla de horas. Dos clientes nunca podrán tomar la misma franja de este vendedor.
            </p>
          </div>

          {/* Horario propio del vendedor */}
          <div className="bg-black/20 border border-white/10 rounded-xl p-3">
            <p className="text-[11px] text-[#00e5a0]/80 font-black uppercase tracking-widest mb-3 flex items-center gap-2">
              <FaClock size={11} /> Horario de atención
            </p>
            <div className="space-y-1.5">
              {(staffForm.working_hours || defaultHours()).map(h => (
                <div key={h.day} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateHour(h.day, 'isOpen', !h.isOpen)}
                    className={`text-xl shrink-0 ${h.isOpen ? 'text-[#00e5a0]' : 'text-white/20'}`}
                    title={h.isOpen ? 'Atiende este día' : 'Descansa este día'}
                  >
                    {h.isOpen ? <FaToggleOn /> : <FaToggleOff />}
                  </button>
                  <span className={`w-9 text-xs font-bold uppercase tracking-wider ${h.isOpen ? 'text-white/80' : 'text-white/30'}`}>{DAY_NAMES[h.day]}</span>
                  {h.isOpen ? (
                    <div className="flex items-center gap-1.5 flex-1">
                      <input type="time" value={h.openTime} onChange={e => updateHour(h.day, 'openTime', e.target.value)}
                        className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-[#00e5a0]/50" />
                      <span className="text-white/30 text-xs">a</span>
                      <input type="time" value={h.closeTime} onChange={e => updateHour(h.day, 'closeTime', e.target.value)}
                        className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-[#00e5a0]/50" />
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
              <p className="text-[11px] text-white/30 mt-0.5">Los clientes podrán elegir a este vendedor al agendar</p>
            </div>
            <button type="button" onClick={() => setStaffForm(p => ({ ...p, is_active: p.is_active === false ? true : false }))}
              className={`text-3xl transition-colors ${staffForm.is_active !== false ? 'text-[#00e5a0]' : 'text-white/20'}`}>
              {staffForm.is_active !== false ? <FaToggleOn /> : <FaToggleOff />}
            </button>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={closeStaffModal}
              className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-bold uppercase tracking-wider active:scale-95 transition-all">
              Cancelar
            </button>
            <button onClick={saveStaff} disabled={savingStaff || uploading}
              className="flex-1 py-3 rounded-xl bg-[#00e5a0] hover:bg-[#00cfa0] text-black text-xs font-black uppercase tracking-wider disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95 transition-all">
              <FaSave /> {savingStaff ? 'Guardando...' : editingStaff ? 'Actualizar' : 'Agregar'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );

  // ═══════════════════════ Render ═══════════════════════
  return (
    <div className="space-y-6 max-w-4xl mx-auto px-4 md:px-6 pb-32" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      {staffModal}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#00e5a0]/15 pb-5">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2">
            <FaCalendarCheck className="text-[#00e5a0]" /> Citas
          </h2>
          <p className="text-sm text-white/40 mt-1">
            Agenda de tu tienda: citas, equipo de vendedores y formulario a medida.
          </p>
        </div>
        {view === 'citas' && (
          <button onClick={() => ping()} title="Probar alarma"
            className="flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wider text-[#00e5a0] bg-[#00e5a0]/15 border border-[#00e5a0]/20 rounded-xl hover:bg-[#00e5a0]/25 transition-all self-start">
            <FaVolumeUp />
          </button>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2 bg-black/30 border border-white/10 rounded-xl p-1">
        <button onClick={() => setView('citas')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition ${view === 'citas' ? 'bg-[#00e5a0] text-black' : 'text-white/50 hover:text-white'}`}>
          <FaCalendarCheck size={12} /> Citas
        </button>
        <button onClick={() => setView('vendedores')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition ${view === 'vendedores' ? 'bg-[#00e5a0] text-black' : 'text-white/50 hover:text-white'}`}>
          <FaUsers size={12} /> Vendedores ({staff.length})
        </button>
        <button onClick={() => setView('formulario')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition ${view === 'formulario' ? 'bg-[#00e5a0] text-black' : 'text-white/50 hover:text-white'}`}>
          <FaWpforms size={12} /> Formulario
        </button>
      </div>

      {/* ═══════════════ VISTA: CITAS ═══════════════ */}
      {view === 'citas' && (
        loadingApp ? (
          <div className="flex items-center justify-center min-h-[300px]"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#00e5a0]" /></div>
        ) : (
          <>
            {activeStaffCount === 0 && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-xs text-amber-200/90">
                Aún no tienes vendedores activos. Agrégalos en la pestaña <b>Vendedores</b>: hasta entonces la sección
                de citas <b>no aparece</b> en tu perfil público.
              </div>
            )}

            {/* KPIs */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white/[0.03] border border-[#00e5a0]/15 rounded-2xl p-4">
                <div className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Hoy</div>
                <div className="text-2xl font-black text-white mt-1">{todaysCount}</div>
              </div>
              <div className={`rounded-2xl p-4 border ${pendingCount > 0 ? 'bg-amber-500/10 border-amber-500/30' : 'bg-white/[0.03] border-[#00e5a0]/15'}`}>
                <div className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Pendientes</div>
                <div className={`text-2xl font-black mt-1 ${pendingCount > 0 ? 'text-amber-400' : 'text-white'}`}>{pendingCount}</div>
              </div>
              <div className="bg-white/[0.03] border border-[#00e5a0]/15 rounded-2xl p-4">
                <div className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Total</div>
                <div className="text-2xl font-black text-white mt-1">{appointments.length}</div>
              </div>
            </div>

            {/* Agenda de hoy + recordatorio al cliente por WhatsApp */}
            <DailyAgendaPanel
              accent="#00e5a0"
              noun="cita"
              businessName={profileData?.displayName || profileData?.username}
              rows={agendaRows}
              table="ecom_appointments"
            />

            {/* Filtro por fecha */}
            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-xs text-white/50 uppercase tracking-widest font-bold">Fecha</label>
              <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
                className="bg-black/40 border border-[#00e5a0]/20 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-[#00e5a0]" />
              <button onClick={() => setDateFilter('')} className="text-xs text-white/50 hover:text-white underline">Ver todas</button>
              <button onClick={() => setDateFilter(todayStr())} className="text-xs text-[#00e5a0] hover:text-[#5cffcb] underline">Hoy</button>
            </div>

            {/* Descarga en Excel por rango de fechas */}
            <ExportRangePanel<EcomAppointment>
              accent="#00e5a0"
              noun="citas"
              dateLabel="Fecha de la cita"
              fileBase={`citas_${profileData?.username || 'tienda'}`}
              sheetName="Citas"
              localRows={appointments}
              getDate={a => a.appointment_date}
              fetchRange={fetchAppointmentRange}
              columns={buildAppointmentColumns}
              showNotification={showNotification}
              hint="Incluye los datos del cliente, el vendedor, los productos elegidos y una columna por cada pregunta de tu formulario."
            />

            {/* Próximas / Activas */}
            <div>
              <h3 className="text-sm font-bold tracking-widest text-[#00e5a0] uppercase mb-3">Próximas / Activas ({upcoming.length})</h3>
              {upcoming.length === 0 ? (
                <div className="p-8 text-center bg-white/[0.02] rounded-2xl border border-white/5 text-gray-500 text-sm">
                  No hay citas activas para esta fecha.
                </div>
              ) : (
                <div className="space-y-3">
                  {upcoming.map(a => {
                    const sm = STATUS_META[a.status] || STATUS_META.pendiente;
                    const items = Array.isArray(a.items) ? a.items : [];
                    const answers = Array.isArray(a.form_data) ? a.form_data : [];
                    return (
                      <div key={a.id} className="bg-gradient-to-r from-[#0d1a1f] to-[#080f14] border border-[#00e5a0]/25 rounded-2xl p-5">
                        <div className="flex justify-between items-start gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-base font-bold text-white truncate">{a.customer_name}</h4>
                              <span className={`text-[9px] font-black uppercase tracking-widest rounded px-1.5 py-0.5 border ${sm.color}`}>{sm.label}</span>
                              {a.member_code && <span className="text-[9px] font-black uppercase tracking-widest text-[#00e5a0] bg-[#00e5a0]/10 border border-[#00e5a0]/25 rounded px-1.5 py-0.5">⭐ {a.member_code}</span>}
                            </div>
                            <div className="flex items-center gap-3 mt-2 text-xs text-white/60 flex-wrap">
                              <span className="inline-flex items-center gap-1"><FaCalendarCheck className="text-[#00e5a0]" size={11} /> {new Date(a.appointment_date + 'T00:00:00').toLocaleDateString('es-EC', { weekday: 'short', day: '2-digit', month: 'short' })}</span>
                              <span className="inline-flex items-center gap-1"><FaClock className="text-[#00e5a0]" size={11} /> {a.appointment_time}</span>
                              {a.staff_name && <span className="inline-flex items-center gap-1"><FaUserTie className="text-[#00e5a0]" size={11} /> {a.staff_name}</span>}
                            </div>

                            {/* Productos / servicios elegidos */}
                            {items.length > 0 && <div className="mt-2.5"><ItemChips items={items} /></div>}

                            {/* Respuestas del formulario personalizado */}
                            {answers.length > 0 && <div className="mt-3"><AnswersBlock answers={answers} /></div>}

                            {/* break-words en los tres: un comentario largo o un correo
                                sin espacios también desbordaban la tarjeta. */}
                            {a.notes && <p className="text-xs text-white/40 mt-2 italic break-words whitespace-pre-wrap">"{a.notes}"</p>}
                            {a.customer_email && <p className="text-[11px] text-white/40 mt-1.5 break-words">{a.customer_email}</p>}
                            <div className="text-[11px] text-white/40 mt-1 font-mono break-words">Cód. {a.confirmation_code}</div>
                          </div>
                          {a.customer_phone && (
                            <a href={waLink(a.customer_phone, `Hola ${a.customer_name}, sobre tu cita del ${a.appointment_date} a las ${a.appointment_time}${a.staff_name ? ` con ${a.staff_name}` : ''}.`)}
                              target="_blank" rel="noopener noreferrer"
                              className="w-9 h-9 rounded-lg bg-[#25D366]/10 border border-[#25D366]/25 text-[#25D366] flex items-center justify-center shrink-0"><FaWhatsapp size={15} /></a>
                          )}
                        </div>

                        {/* Acciones de estado */}
                        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-white/5">
                          {a.status === 'pendiente' && (
                            <button onClick={() => setStatus(a.id, 'confirmada')}
                              className="px-3.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-black uppercase tracking-wider hover:bg-emerald-500/25 flex items-center gap-1.5">
                              <FaCheck size={11} /> Confirmar
                            </button>
                          )}
                          <button onClick={() => setStatus(a.id, 'completada')}
                            className="px-3.5 py-2 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-300 text-xs font-black uppercase tracking-wider hover:bg-blue-500/25 flex items-center gap-1.5">
                            <FaCheck size={11} /> Atendida
                          </button>
                          <button onClick={() => setStatus(a.id, 'no_show')}
                            className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/50 text-xs font-bold hover:text-amber-400 transition">
                            No asistió
                          </button>
                          <button onClick={() => setStatus(a.id, 'cancelada')}
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
                  {past.map(a => {
                    const sm = STATUS_META[a.status] || STATUS_META.cancelada;
                    const items = Array.isArray(a.items) ? a.items : [];
                    const answers = Array.isArray(a.form_data) ? a.form_data : [];
                    const hasDetail = items.length > 0 || answers.length > 0 || !!a.notes || !!a.customer_email || !!a.customer_phone;
                    const open = expandedPast === a.id;
                    return (
                      <div key={a.id} className="bg-white/[0.01] border border-white/5 rounded-xl overflow-hidden">
                        <div className="p-4 flex items-center justify-between gap-4">
                          {/* La cabecera es el botón de desplegar. El historial se
                              mantiene compacto —puede acumular muchas citas— pero los
                              datos del cliente dejan de ser inalcanzables al cerrarla. */}
                          <button
                            type="button"
                            onClick={() => hasDetail && setExpandedPast(open ? null : a.id)}
                            disabled={!hasDetail}
                            aria-expanded={open}
                            className={`min-w-0 flex-1 text-left ${hasDetail ? 'cursor-pointer' : 'cursor-default'}`}>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-white text-sm truncate">{a.customer_name}</span>
                              <span className={`text-[9px] font-black uppercase tracking-widest rounded px-1.5 py-0.5 border ${sm.color}`}>{sm.label}</span>
                              {hasDetail && (
                                <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-white/35">
                                  <FaChevronDown className={`transition-transform ${open ? 'rotate-180' : ''}`} size={8} />
                                  {answers.length > 0 ? `${answers.length} respuesta${answers.length !== 1 ? 's' : ''}` : 'Ver detalle'}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-gray-500 mt-1">
                              {new Date(a.appointment_date + 'T00:00:00').toLocaleDateString('es-EC', { day: '2-digit', month: 'short' })} · {a.appointment_time}{a.staff_name ? ` · ${a.staff_name}` : ''}
                            </p>
                          </button>
                          <button onClick={() => deleteAppointment(a.id)} className="text-white/30 hover:text-red-400 text-xs shrink-0"><FaTimes /></button>
                        </div>

                        {open && (
                          <div className="px-4 pb-4 pt-0 space-y-2.5 min-w-0 border-t border-white/5">
                            <div className="pt-3" />
                            <ItemChips items={items} />
                            <AnswersBlock answers={answers} />
                            {a.notes && <p className="text-xs text-white/40 italic break-words whitespace-pre-wrap">"{a.notes}"</p>}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/40 min-w-0">
                              {a.customer_email && <span className="break-words min-w-0">{a.customer_email}</span>}
                              <span className="font-mono break-words">Cód. {a.confirmation_code}</span>
                            </div>
                            {a.customer_phone && (
                              <a href={waLink(a.customer_phone, `Hola ${a.customer_name}, sobre tu cita del ${a.appointment_date}.`)}
                                target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#25D366] bg-[#25D366]/10 border border-[#25D366]/25 rounded-lg px-2.5 py-1.5">
                                <FaWhatsapp size={12} /> Escribir por WhatsApp
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )
      )}

      {/* ═══════════════ VISTA: VENDEDORES ═══════════════ */}
      {view === 'vendedores' && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-white/40">
              {activeStaffCount} vendedor{activeStaffCount !== 1 ? 'es' : ''} activo{activeStaffCount !== 1 ? 's' : ''} de {staff.length}
            </p>
            <button onClick={openNewStaff}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-black bg-[#00e5a0] hover:bg-[#00cfa0] rounded-xl transition-all shadow-lg shadow-[#00e5a0]/15">
              <FaPlus /> Agregar vendedor
            </button>
          </div>

          {loadingStaff ? (
            <div className="flex items-center justify-center min-h-[200px]"><div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-[#00e5a0]" /></div>
          ) : staff.length === 0 ? (
            <div className="text-center py-20 text-white/30">
              <p className="text-5xl mb-4">🧑‍💼</p>
              <p className="text-sm font-medium">Aún no tienes vendedores.</p>
              <p className="text-xs mt-1">Agrega a quienes atienden para habilitar el agendamiento de citas.</p>
              <button onClick={openNewStaff} className="mt-6 px-6 py-3 rounded-xl bg-[#00e5a0] text-black font-black text-xs uppercase tracking-wider">
                Agregar vendedor
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {staff.map(s => {
                const openDays = (Array.isArray(s.working_hours) ? s.working_hours : []).filter(h => h.isOpen).map(h => DAY_NAMES[h.day]);
                return (
                  <div key={s.id}
                    className={`flex items-center gap-4 border rounded-xl p-4 transition-all ${s.is_active === false ? 'border-white/5 bg-white/[0.02] opacity-60' : 'border-[#00e5a0]/10 bg-white/5 hover:border-[#00e5a0]/30'}`}>
                    {s.photo_url ? (
                      <img src={s.photo_url} className="w-14 h-14 rounded-full object-cover shrink-0 border border-white/10" alt={s.name} />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-[#00e5a0]/10 flex items-center justify-center text-lg text-[#00e5a0] shrink-0"><FaUserTie /></div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-black text-white text-sm">{s.name}</p>
                        {s.is_active === false && <span className="text-[9px] text-red-400/70 bg-red-500/10 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Oculto</span>}
                      </div>
                      {s.role && <p className="text-[11px] text-[#00e5a0]/80 mt-0.5">{s.role}</p>}
                      <p className="text-[10px] text-white/40 mt-1">
                        {openDays.length > 0 ? openDays.join(' · ') : 'Sin horario configurado'} · {s.slot_minutes || 30} min
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => toggleStaffActive(s)} title={s.is_active !== false ? 'Ocultar' : 'Mostrar'}
                        className={`text-2xl transition-colors ${s.is_active !== false ? 'text-[#00e5a0] hover:text-[#5cffcb]' : 'text-white/20 hover:text-white/40'}`}>
                        {s.is_active !== false ? <FaToggleOn /> : <FaToggleOff />}
                      </button>
                      <button onClick={() => openEditStaff(s)}
                        className="w-9 h-9 rounded-lg bg-white/5 hover:bg-[#00e5a0]/20 flex items-center justify-center text-white/40 hover:text-[#00e5a0] transition"><FaPen className="text-xs" /></button>
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

      {/* ═══════════════ VISTA: FORMULARIO PERSONALIZADO ═══════════════ */}
      {view === 'formulario' && (
        <>
          <div className="bg-[#00e5a0]/5 border border-[#00e5a0]/20 rounded-2xl p-4">
            <p className="text-xs text-white/60 leading-relaxed">
              Arma aquí las preguntas que tu cliente debe responder al pedir una cita o cotización.
              Estas preguntas son <b className="text-[#00e5a0]">solo de tu perfil</b>: ningún otro negocio las ve.
            </p>
            <p className="text-[11px] text-white/35 mt-2">
              <b className="text-white/50">El orden de aquí es el que ve tu cliente.</b> Usa las flechas para mover un campo de lugar.
            </p>
            <p className="text-[11px] text-white/35 mt-1.5">
              Nada se duplica: si agregas un campo de <b className="text-white/50">nombre, teléfono, correo o fecha</b>,
              reemplaza al que la app pide por defecto (el de fecha se une al calendario que muestra las horas libres).
            </p>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-white/40">{fields.length} campo{fields.length !== 1 ? 's' : ''} personalizado{fields.length !== 1 ? 's' : ''}</p>
            <button onClick={addField}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-black bg-[#00e5a0] hover:bg-[#00cfa0] rounded-xl transition-all shadow-lg shadow-[#00e5a0]/15">
              <FaPlus /> Agregar campo
            </button>
          </div>

          {fields.length === 0 ? (
            <div className="text-center py-16 text-white/30">
              <p className="text-5xl mb-4">📝</p>
              <p className="text-sm font-medium">Tu formulario solo pide los datos básicos.</p>
              <p className="text-xs mt-1">Agrega campos si necesitas más información del cliente.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {fields.map((f, idx) => (
                <div key={f.id} className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    {/* Número de orden: el mismo en que lo verá el cliente */}
                    <div className="shrink-0 w-6 h-6 rounded-lg bg-[#00e5a0]/15 border border-[#00e5a0]/25 flex items-center justify-center text-[11px] font-black text-[#00e5a0] mt-2.5">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0 space-y-3">
                      <input
                        value={f.label}
                        onChange={e => updateField(f.id, { label: e.target.value })}
                        placeholder="Nombre del campo (ej. Placa del vehículo) *"
                        className={inputCls}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={f.type}
                          onChange={e => updateField(f.id, { type: e.target.value as EcomBookingFieldType })}
                          className="bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#00e5a0]/50"
                        >
                          {FIELD_TYPES.map(t => <option key={t.value} value={t.value} className="bg-[#0b1219]">{t.label}</option>)}
                        </select>
                        <button
                          type="button"
                          onClick={() => updateField(f.id, { required: !f.required })}
                          className={`rounded-xl px-3 py-2.5 text-xs font-bold uppercase tracking-wider border transition flex items-center justify-center gap-2 ${
                            f.required
                              ? 'bg-[#00e5a0]/15 border-[#00e5a0]/40 text-[#00e5a0]'
                              : 'bg-white/5 border-white/10 text-white/40'
                          }`}
                        >
                          {f.required ? <FaToggleOn /> : <FaToggleOff />} Obligatorio
                        </button>
                      </div>

                      {f.type !== 'checkbox' && f.type !== 'select' && (
                        <input
                          value={f.placeholder || ''}
                          onChange={e => updateField(f.id, { placeholder: e.target.value })}
                          placeholder="Texto de ayuda (opcional)"
                          className={inputCls}
                        />
                      )}

                      {f.type === 'select' && (
                        <div className="bg-black/20 border border-white/10 rounded-xl p-3 space-y-2">
                          <p className="text-[10px] text-[#00e5a0]/70 uppercase tracking-widest font-bold">Opciones de la lista</p>
                          {(f.options || []).map((opt, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <input
                                value={opt}
                                onChange={e => updateOption(f.id, i, e.target.value)}
                                placeholder={`Opción ${i + 1}`}
                                className="flex-1 bg-black/30 border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/20 focus:outline-none focus:border-[#00e5a0]/40"
                              />
                              <button onClick={() => removeOption(f.id, i)} className="text-white/25 hover:text-red-400 transition shrink-0"><FaTimes size={12} /></button>
                            </div>
                          ))}
                          <button onClick={() => addOption(f.id)}
                            className="text-[11px] text-[#00e5a0]/60 hover:text-[#00e5a0] flex items-center gap-1 transition-colors">
                            <FaPlus size={9} /> Agregar opción
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-1 shrink-0">
                      <button onClick={() => moveField(idx, -1)} disabled={idx === 0}
                        className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition disabled:opacity-20 disabled:hover:bg-white/5">
                        <FaArrowUp size={10} />
                      </button>
                      <button onClick={() => moveField(idx, 1)} disabled={idx === fields.length - 1}
                        className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition disabled:opacity-20 disabled:hover:bg-white/5">
                        <FaArrowDown size={10} />
                      </button>
                      <button onClick={() => removeField(f.id)}
                        className="w-8 h-8 rounded-lg bg-white/5 hover:bg-red-500/20 flex items-center justify-center text-white/30 hover:text-red-400 transition">
                        <FaTrash size={10} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Guardar */}
          <div className="sticky bottom-4 pt-2">
            <button onClick={saveForm} disabled={savingForm || !formDirty}
              className="w-full py-3.5 rounded-xl bg-[#00e5a0] hover:bg-[#00cfa0] text-black text-xs font-black uppercase tracking-wider disabled:opacity-40 flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-[#00e5a0]/20">
              <FaSave /> {savingForm ? 'Guardando...' : formDirty ? 'Guardar formulario' : 'Formulario guardado'}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default EcomAppointmentsTab;
