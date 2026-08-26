import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MemberPlanSection } from '../MemberPlanSection';
import { useSubscriptionOptions } from '../../hooks/useSubscriptionOptions';
import { createPortal } from 'react-dom';
import { supabase } from '../../src/lib/supabase';
import {
  FaCrown, FaUserPlus, FaTrash, FaStar, FaPhone, FaEnvelope,
  FaWhatsapp, FaUsers, FaPercent, FaSave, FaPaw, FaBookMedical,
  FaTimes, FaPlus, FaStethoscope,
} from 'react-icons/fa';

interface GastroClient {
  id: string;
  restaurant_id: string;
  name?: string;
  email?: string;
  phone?: string;
  is_vip: boolean;
  discount_percent: number;
  notes?: string;
  source: 'club_secreto' | 'pedido' | 'manual';
  visits: number;
  member_code?: string;
  benefits?: string;
  billing_name?: string;
  billing_full_name?: string;
  billing_tax_id?: string;
  billing_phone?: string;
  billing_email?: string;
  billing_address?: string;
  created_at: string;
}

interface PetcareRecord {
  id?: string;
  member_code: string;
  pet_name?: string;
  record_date: string;
  record_type: string;
  diagnosis?: string;
  treatment?: string;
  medications?: string;
  next_visit_date?: string;
  vet_notes?: string;
  created_at?: string;
}

const RECORD_TYPES = ['Consulta general', 'Vacunación', 'Desparasitación', 'Cirugía', 'Control', 'Peluquería', 'Dental', 'Urgencia', 'Otro'];
const RECORD_TYPES_MEDICAL = ['Consulta general', 'Control', 'Exámenes de laboratorio', 'Imagenología', 'Procedimiento', 'Vacunación', 'Receta / Medicación', 'Terapia', 'Urgencia', 'Otro'];

const emptyRecord = (): Omit<PetcareRecord, 'member_code'> => ({
  pet_name: '', record_date: new Date().toISOString().slice(0, 10), record_type: 'Consulta general',
  diagnosis: '', treatment: '', medications: '', next_visit_date: '', vet_notes: '',
});

// Beep corto reutilizando un AudioContext compartido (desbloqueado al primer gesto).
let loyaltyAudioCtx: AudioContext | null = null;
const playClientPing = () => {
  if (typeof window === 'undefined') return;
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  if (!AC) return;
  if (!loyaltyAudioCtx) { try { loyaltyAudioCtx = new AC(); } catch { return; } }
  const ctx = loyaltyAudioCtx;
  const doPlay = () => {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
    } catch { /* ignore */ }
  };
  if (ctx.state === 'suspended') ctx.resume().then(doPlay).catch(() => {}); else doPlay();
};

export const LoyaltyTab: React.FC<{ user: any; isPetcare?: boolean; isMedical?: boolean }> = ({ user, isPetcare = false, isMedical = false }) => {
  const planOptions = useSubscriptionOptions(user?.id, "products");
  const isClinic = isPetcare || isMedical;
  const recordTypes = isMedical ? RECORD_TYPES_MEDICAL : RECORD_TYPES;
  const recordsTable = isMedical ? 'medical_records' : 'petcare_records';
  const L = {
    title: isMedical ? 'Pacientes' : isPetcare ? 'Propietarios y Mascotas' : 'Clientes Fieles',
    subtitle: isMedical ? 'Miembros del Club de Pacientes y sus historias clínicas.' : isPetcare ? 'Miembros del Club Pet VIP, sus mascotas y expedientes médicos.' : 'Tus clientes VIP, recurrentes y del Club Secreto — en un solo lugar.',
    addBtn: isMedical ? 'Agregar paciente' : isPetcare ? 'Agregar propietario' : 'Agregar cliente',
    namePlaceholder: isMedical ? 'Nombre del paciente' : isPetcare ? 'Nombre del propietario' : 'Nombre',
    notesPlaceholder: isMedical ? 'Cédula, edad, alergias…' : isPetcare ? 'Nombre de mascota, raza…' : 'Notas (ej. cliente frecuente)',
    kpiClients: isMedical ? 'Pacientes' : isPetcare ? 'Propietarios' : 'Clientes',
    clubLabel: isMedical ? 'Club de Pacientes' : isPetcare ? 'Club Pet VIP' : 'Club Secreto',
    emptyIcon: isMedical ? '🩺' : isPetcare ? '🐾' : '👥',
    emptyMsg: isMedical ? 'Aún no hay pacientes registrados. Cuando alguien se una al Club de Pacientes o agende una cita, aparecerá aquí.' : isPetcare ? 'Aún no hay propietarios registrados. Cuando alguien se una al Club Pet VIP o haga una compra, aparecerá aquí.' : 'Aún no hay clientes. Cuando alguien se una al Club Secreto o haga un pedido, aparecerá aquí.',
    deleteConfirm: isMedical ? '¿Eliminar este paciente?' : isPetcare ? '¿Eliminar este paciente/propietario?' : '¿Eliminar este cliente de tu lista?',
    newMemberAlert: isMedical ? '🩺 Nuevo paciente' : '🐾 Nuevo miembro',
    clinicalNotes: isMedical ? 'Notas clínicas (alergias, antecedentes…)' : 'Notas clínicas (alérgico a amoxicilina, raza sensible…)',
    benefitsPlaceholder: isMedical ? '🎁 Beneficios del miembro (ej. Chequeo anual gratis…)' : '🎁 Beneficios del miembro (ej. Baño gratis en la 6ta visita…)',
    recordPersonName: isMedical ? 'Nombre del paciente / dependiente (si aplica)' : 'Nombre de la mascota (si hay varios)',
    vetNotes: isMedical ? 'Notas del médico…' : 'Notas del veterinario…',
  };
  const [clients, setClients] = useState<GastroClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'vip' | 'club_secreto'>('all');
  const [adding, setAdding] = useState(false);
  const [newClient, setNewClient] = useState({ name: '', phone: '', email: '', notes: '' });
  const [alertMsg, setAlertMsg] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { discount_percent: number; notes: string; benefits: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  // Historia médica (solo petcare)
  const [recordsClient, setRecordsClient] = useState<GastroClient | null>(null);
  const [records, setRecords] = useState<PetcareRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [addingRecord, setAddingRecord] = useState(false);
  const [newRecord, setNewRecord] = useState<Omit<PetcareRecord, 'member_code'>>(emptyRecord());
  const [savingRecord, setSavingRecord] = useState(false);

  const knownIdsRef = useRef<Set<string>>(new Set());
  const initialisedRef = useRef(false);

  const fetchClients = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('gastro_clients')
        .select('*')
        .eq('restaurant_id', user.id)
        .order('is_vip', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      const list = (data ?? []) as GastroClient[];
      if (initialisedRef.current) {
        const fresh = list.filter(c => !knownIdsRef.current.has(c.id));
        if (fresh.length > 0) {
          const n = fresh[0];
          playClientPing();
          setAlertMsg(isClinic
            ? `${L.newMemberAlert}: ${n.name || n.phone || n.email || 'cliente'}`
            : `🎉 Nuevo cliente: ${n.name || n.phone || n.email || 'cliente'}${n.source === 'club_secreto' ? ' (Club Secreto)' : ''}`
          );
          setTimeout(() => setAlertMsg(null), 7000);
        }
      }
      knownIdsRef.current = new Set(list.map(c => c.id));
      initialisedRef.current = true;
      setClients(list);
    } catch (err: any) {
      console.error('LoyaltyTab fetch error:', err?.message ?? err);
    } finally {
      setLoading(false);
    }
  }, [user?.id, isClinic]);

  useEffect(() => {
    const onGesture = () => { if (loyaltyAudioCtx?.state === 'suspended') loyaltyAudioCtx.resume().catch(() => {}); };
    window.addEventListener('pointerdown', onGesture);
    window.addEventListener('keydown', onGesture);
    return () => {
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    fetchClients();
    const channel = supabase
      .channel(`gastro_clients_${user.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'gastro_clients', filter: `restaurant_id=eq.${user.id}` },
        () => fetchClients())
      .subscribe();
    const poll = setInterval(fetchClients, 12000);
    const onFocus = () => { if (document.visibilityState !== 'hidden') fetchClients(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [user?.id, fetchClients]);

  // ── Historia médica ──────────────────────────────────────────────────
  const openRecords = async (client: GastroClient) => {
    setRecordsClient(client);
    setRecords([]);
    setAddingRecord(false);
    setNewRecord(emptyRecord());
    if (!client.member_code) return;
    setRecordsLoading(true);
    try {
      const { data, error } = await supabase
        .from(recordsTable)
        .select('*')
        .eq('profile_id', user.id)
        .eq('member_code', client.member_code.toUpperCase())
        .order('record_date', { ascending: false });
      if (error) throw error;
      setRecords((data ?? []) as PetcareRecord[]);
    } catch (e: any) {
      console.error('fetchRecords error:', e?.message ?? e);
    } finally { setRecordsLoading(false); }
  };

  const saveRecord = async () => {
    if (!recordsClient?.member_code || savingRecord) return;
    if (!newRecord.record_date || !newRecord.record_type) { alert('Fecha y tipo son obligatorios.'); return; }
    setSavingRecord(true);
    try {
      const payload = {
        profile_id: user.id,
        member_code: recordsClient.member_code.toUpperCase(),
        pet_name: newRecord.pet_name?.trim() || null,
        record_date: newRecord.record_date,
        record_type: newRecord.record_type,
        diagnosis: newRecord.diagnosis?.trim() || null,
        treatment: newRecord.treatment?.trim() || null,
        medications: newRecord.medications?.trim() || null,
        next_visit_date: newRecord.next_visit_date || null,
        vet_notes: newRecord.vet_notes?.trim() || null,
      };
      const { data, error } = await supabase.from(recordsTable).insert(payload).select().single();
      if (error) throw error;
      setRecords(prev => [data as PetcareRecord, ...prev]);
      setNewRecord(emptyRecord());
      setAddingRecord(false);
    } catch (e: any) {
      alert(`Error al guardar: ${e?.message ?? e}`);
    } finally { setSavingRecord(false); }
  };

  const deleteRecord = async (id: string) => {
    if (!window.confirm('¿Eliminar este registro médico?')) return;
    try {
      const { error } = await supabase.from(recordsTable).delete().eq('id', id);
      if (error) throw error;
      setRecords(prev => prev.filter(r => r.id !== id));
    } catch (e: any) { alert(`Error: ${e?.message ?? e}`); }
  };

  const [recordsPdfBusy, setRecordsPdfBusy] = useState(false);
  const downloadRecordsPDF = async () => {
    if (recordsPdfBusy || !recordsClient || records.length === 0) return;
    setRecordsPdfBusy(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;
      const doc = new jsPDF();
      const patientName = recordsClient.name?.includes('(')
        ? `${recordsClient.name.split('(')[0].trim()} · ${recordsClient.name.slice(recordsClient.name.indexOf('(') + 1, recordsClient.name.lastIndexOf(')'))}`
        : (recordsClient.name || 'Paciente');
      doc.setFontSize(18); doc.setTextColor(20, 20, 20);
      doc.text(isMedical ? 'Historia Clínica' : 'Historia Médica', 14, 18);
      doc.setFontSize(11); doc.setTextColor(120, 120, 120);
      doc.text(`Paciente: ${patientName}${recordsClient.member_code ? ` · ${recordsClient.member_code}` : ''}`, 14, 25);
      doc.text(`Generado: ${new Date().toLocaleString('es-EC')}`, 14, 31);
      doc.setDrawColor(255, 107, 53); doc.setLineWidth(0.6); doc.line(14, 35, 196, 35);
      autoTable(doc, {
        startY: 42,
        head: [[isMedical ? 'Fecha' : 'Fecha', 'Tipo', isMedical ? 'Paciente' : 'Mascota', 'Diagnóstico', 'Tratamiento', 'Medicación', 'Próx.', 'Notas']],
        body: records.map(r => [
          r.record_date || '', r.record_type || '', r.pet_name || '', r.diagnosis || '', r.treatment || '', r.medications || '', r.next_visit_date || '', r.vet_notes || '',
        ]),
        theme: 'striped',
        headStyles: { fillColor: [255, 107, 53], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 7.5, cellPadding: 2, valign: 'top' },
      });
      doc.save(`historia-${(recordsClient.member_code || 'paciente')}.pdf`);
    } catch (e: any) { alert(`No se pudo generar el PDF: ${e?.message ?? e}`); }
    finally { setRecordsPdfBusy(false); }
  };

  // ── Clients CRUD ────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!newClient.name.trim() && !newClient.phone.trim()) {
      alert('Indica al menos el nombre o el teléfono.'); return;
    }
    try {
      const { error } = await supabase.from('gastro_clients').insert({
        restaurant_id: user.id,
        name: newClient.name.trim() || null, phone: newClient.phone.trim() || null,
        email: newClient.email.trim() || null, notes: newClient.notes.trim() || null,
        source: 'manual',
      });
      if (error) throw error;
      setNewClient({ name: '', phone: '', email: '', notes: '' });
      setAdding(false); fetchClients();
    } catch (err: any) { alert(`No se pudo agregar: ${err?.message ?? err}`); }
  };

  const toggleVip = async (c: GastroClient) => {
    try {
      const { error } = await supabase.from('gastro_clients').update({ is_vip: !c.is_vip }).eq('id', c.id);
      if (error) throw error;
      setClients(prev => prev.map(x => x.id === c.id ? { ...x, is_vip: !c.is_vip } : x));
    } catch (err: any) { alert(`Error: ${err?.message ?? err}`); }
  };

  const saveDraft = async (c: GastroClient) => {
    const draft = drafts[c.id] ?? { discount_percent: c.discount_percent, notes: c.notes ?? '', benefits: c.benefits ?? '' };
    setSavingId(c.id);
    try {
      const { error } = await supabase.from('gastro_clients').update({
        discount_percent: Math.max(0, Math.min(100, Number(draft.discount_percent) || 0)),
        notes: draft.notes.trim() || null,
        benefits: draft.benefits.trim() || null,
      }).eq('id', c.id);
      if (error) throw error;
      setClients(prev => prev.map(x => x.id === c.id
        ? { ...x, discount_percent: Number(draft.discount_percent) || 0, notes: draft.notes, benefits: draft.benefits } : x));
      setDrafts(prev => { const n = { ...prev }; delete n[c.id]; return n; });
    } catch (err: any) { alert(`Error al guardar: ${err?.message ?? err}`); }
    finally { setSavingId(null); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(L.deleteConfirm)) return;
    try {
      const { error } = await supabase.from('gastro_clients').delete().eq('id', id);
      if (error) throw error;
      setClients(prev => prev.filter(x => x.id !== id));
    } catch (err: any) { alert(`Error al eliminar: ${err?.message ?? err}`); }
  };

  const setDraft = (id: string, patch: Partial<{ discount_percent: number; notes: string; benefits: string }>, base: GastroClient) => {
    setDrafts(prev => ({
      ...prev,
      [id]: { discount_percent: base.discount_percent, notes: base.notes ?? '', benefits: base.benefits ?? '', ...prev[id], ...patch },
    }));
  };

  const filtered = clients.filter(c =>
    filter === 'all' ? true : filter === 'vip' ? c.is_vip : c.source === 'club_secreto');
  const vipCount = clients.filter(c => c.is_vip).length;
  const clubCount = clients.filter(c => c.source === 'club_secreto').length;

  const inpCls = "bg-black/40 border border-[#ff6b35]/20 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#ff6b35] placeholder-gray-600 w-full";

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#ff6b35]" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up space-y-6 max-w-4xl mx-auto px-4 md:px-6 pb-32"
         style={{ fontFamily: "'Space Grotesk', sans-serif" }}>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#ff6b35]/15 pb-5">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2">
            {isMedical ? <FaStethoscope className="text-[#ff6b35]" /> : isPetcare ? <FaPaw className="text-[#ff6b35]" /> : <FaCrown className="text-[#ff6b35]" />}
            {L.title}
          </h2>
          <p className="text-sm text-white/40 mt-1">
            {L.subtitle}
          </p>
        </div>
        <button
          onClick={() => setAdding(a => !a)}
          className="flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white bg-[#ff6b35] hover:bg-[#e85a25] rounded-xl transition-all shadow-lg shadow-[#ff6b35]/15">
          <FaUserPlus /> {adding ? 'Cerrar' : L.addBtn}
        </button>
      </div>

      {/* Aviso en vivo */}
      {alertMsg && (
        <div className="p-4 bg-[#ff6b35]/10 border border-[#ff6b35]/30 text-[#ff6b35] text-sm font-bold rounded-xl flex items-center justify-between animate-bounce">
          <span>{alertMsg}</span>
          <button onClick={() => setAlertMsg(null)} className="text-[#ff6b35]/60 hover:text-[#ff6b35]">✕</button>
        </div>
      )}

      {/* Add form */}
      {adding && (
        <div className="bg-white/5 border border-[#ff6b35]/20 rounded-2xl p-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input value={newClient.name} onChange={e => setNewClient(p => ({ ...p, name: e.target.value }))}
              placeholder={L.namePlaceholder} className={inpCls} />
            <input value={newClient.phone} onChange={e => setNewClient(p => ({ ...p, phone: e.target.value }))}
              placeholder="Teléfono / WhatsApp" className={inpCls} />
            <input value={newClient.email} onChange={e => setNewClient(p => ({ ...p, email: e.target.value }))}
              placeholder="Email" className={inpCls} />
            <input value={newClient.notes} onChange={e => setNewClient(p => ({ ...p, notes: e.target.value }))}
              placeholder={L.notesPlaceholder} className={inpCls} />
          </div>
          <button onClick={handleAdd}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#ff6b35] hover:bg-[#e85a25] text-white text-xs font-black uppercase tracking-wider transition-all">
            Guardar
          </button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: L.kpiClients, value: clients.length, icon: isPetcare ? <FaPaw /> : <FaUsers /> },
          { label: 'VIP', value: vipCount, icon: <FaCrown /> },
          { label: L.clubLabel, value: clubCount, icon: isPetcare ? <FaPaw /> : <FaStar /> },
        ].map(k => (
          <div key={k.label} className="bg-white/5 border border-white/5 rounded-xl p-4">
            <div className="text-[#ff6b35] text-lg">{k.icon}</div>
            <p className="text-2xl font-black text-white mt-1">{k.value}</p>
            <p className="text-[11px] text-white/40 uppercase tracking-widest font-bold mt-0.5">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {([['all', 'Todos'], ['vip', 'VIP'], ['club_secreto', L.clubLabel]] as const).map(([f, label]) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
              filter === f ? 'bg-[#ff6b35] text-white' : 'bg-white/5 text-white/50 hover:text-white border border-white/10'
            }`}>{label}
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-white/30">
          <p className="text-4xl mb-3">{L.emptyIcon}</p>
          <p className="text-sm">
            {L.emptyMsg}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(c => {
            const draft = drafts[c.id];
            const dirty = !!draft && (draft.discount_percent !== c.discount_percent || (draft.notes ?? '') !== (c.notes ?? '') || (draft.benefits ?? '') !== (c.benefits ?? ''));
            // Extraer nombre de mascota del campo 'name' (guardado como "Propietario (Mascota)")
            const petName = (() => {
              if (!isClinic || !c.name) return null;
              const match = c.name.match(/\((.+)\)$/);
              return match ? match[1] : null;
            })();
            return (
              <div key={c.id}
                className={`rounded-2xl border p-4 transition-all ${c.is_vip ? 'bg-gradient-to-br from-[#ff6b35]/10 to-transparent border-[#ff6b35]/30' : 'bg-white/[0.03] border-white/8'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-white font-bold text-base truncate">
                        {isClinic
                          ? (c.name?.includes('(') ? c.name.split('(')[0].trim() : (c.name || (isMedical ? 'Paciente' : 'Propietario')))
                          : (c.name || 'Cliente sin nombre')}
                      </h3>
                      {isClinic && petName && (
                        <span className="text-[10px] font-bold text-[#2563eb]/90 bg-[#2563eb]/10 border border-[#2563eb]/20 rounded-full px-2 py-0.5 flex items-center gap-1">
                          {isMedical ? <FaUsers size={8} /> : <FaPaw size={8} />} {petName}
                        </span>
                      )}
                      {c.is_vip && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-[#ff6b35] bg-[#ff6b35]/15 border border-[#ff6b35]/30 rounded-full px-2 py-0.5">
                          <FaCrown size={9} /> VIP
                        </span>
                      )}
                      {c.member_code && (
                        <span className="text-[10px] font-mono font-black tracking-widest text-[#ff6b35] bg-black/40 border border-[#ff6b35]/20 rounded-md px-2 py-0.5">
                          {c.member_code}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-white/50">
                      {c.phone && <span className="flex items-center gap-1"><FaPhone size={9} /> {c.phone}</span>}
                      {c.email && <span className="flex items-center gap-1"><FaEnvelope size={9} /> {c.email}</span>}
                      <span className="flex items-center gap-1"><FaStar size={9} className="text-[#ff6b35]/60" /> {c.visits} visita{c.visits !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isClinic && c.member_code && (
                      <button onClick={() => openRecords(c)}
                        className="w-8 h-8 rounded-lg bg-[#2563eb]/10 border border-[#2563eb]/20 text-[#2563eb] flex items-center justify-center hover:bg-[#2563eb]/20 transition" title="Historia médica">
                        <FaBookMedical size={12} />
                      </button>
                    )}
                    {c.phone && (
                      <a href={`https://wa.me/${c.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
                        className="w-8 h-8 rounded-lg bg-[#25D366]/10 border border-[#25D366]/20 text-[#25D366] flex items-center justify-center hover:bg-[#25D366]/20 transition" title="WhatsApp">
                        <FaWhatsapp size={13} />
                      </a>
                    )}
                    <button onClick={() => toggleVip(c)}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition border ${c.is_vip ? 'bg-[#ff6b35]/20 border-[#ff6b35]/40 text-[#ff6b35]' : 'bg-white/5 border-white/10 text-white/40 hover:text-[#ff6b35]'}`}
                      title={c.is_vip ? 'Quitar VIP' : 'Marcar VIP'}>
                      <FaCrown size={12} />
                    </button>
                    <button onClick={() => handleDelete(c.id)}
                      className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center hover:bg-red-500/20 transition" title="Eliminar">
                      <FaTrash size={11} />
                    </button>
                  </div>
                </div>

                {/* Descuento + notas */}
                <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr_auto] gap-2 mt-3 pt-3 border-t border-white/5 items-center">
                  <div className="flex items-center gap-2 bg-black/30 rounded-lg px-3 py-2 border border-white/5">
                    <FaPercent size={10} className="text-[#ff6b35]" />
                    <input type="number" min={0} max={100}
                      value={draft ? draft.discount_percent : c.discount_percent}
                      onChange={e => setDraft(c.id, { discount_percent: Number(e.target.value) }, c)}
                      className="w-full bg-transparent text-white text-sm focus:outline-none" />
                    <span className="text-[10px] text-white/40 uppercase">desc.</span>
                  </div>
                  <input
                    value={draft ? draft.notes : (c.notes ?? '')}
                    onChange={e => setDraft(c.id, { notes: e.target.value }, c)}
                    placeholder={isClinic ? L.clinicalNotes : 'Notas internas (ej. mesa preferida…)'}
                    className="bg-black/30 border border-white/5 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#ff6b35]/40 placeholder-gray-600" />
                  <button onClick={() => saveDraft(c)} disabled={!dirty || savingId === c.id}
                    className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-[#ff6b35] hover:bg-[#e85a25] disabled:opacity-30 text-white text-xs font-black uppercase tracking-wider transition-all">
                    <FaSave size={11} /> {savingId === c.id ? '...' : 'Guardar'}
                  </button>
                </div>

                {/* Beneficios */}
                <div className="mt-2">
                  <input
                    value={draft ? draft.benefits : (c.benefits ?? '')}
                    onChange={e => setDraft(c.id, { benefits: e.target.value }, c)}
                    placeholder={isClinic ? L.benefitsPlaceholder : '🎁 Beneficios que ve el cliente (ej. Postre gratis los viernes…)'}
                    className="w-full bg-[#ff6b35]/5 border border-[#ff6b35]/15 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#ff6b35]/40 placeholder-gray-500" />
                </div>

                <MemberPlanSection client={c as any} system="gastro" ownerId={user?.id}
                  options={planOptions} accent="#ff6b35" />

                {/* Facturación */}
                {(c.billing_name || c.billing_tax_id) && (
                  <div className="mt-2 p-2.5 rounded-lg bg-black/30 border border-white/5 text-[11px] text-white/60">
                    <span className="text-[9px] uppercase tracking-widest font-black text-white/30">🧾 Factura: </span>
                    {c.billing_name}{c.billing_full_name && c.billing_full_name !== c.billing_name ? ` (${c.billing_full_name})` : ''}{c.billing_tax_id ? ` · ${c.billing_tax_id}` : ''}{c.billing_phone ? ` · 📞 ${c.billing_phone}` : ''}{c.billing_email ? ` · ${c.billing_email}` : ''}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── MODAL: HISTORIA MÉDICA ── */}
      {isClinic && recordsClient && createPortal(
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4 bg-black/90 backdrop-blur-sm"
             onClick={() => setRecordsClient(null)}>
          <div className="w-full max-w-lg bg-[#06201d] border border-[#0ea5a4]/30 rounded-2xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden"
               onClick={e => e.stopPropagation()} style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {/* Header modal */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#0ea5a4]/15 shrink-0">
              <div>
                <h3 className="text-base font-black text-white flex items-center gap-2">
                  <FaBookMedical className="text-[#0ea5a4]" /> {isMedical ? 'Historia Clínica' : 'Historia Médica'}
                </h3>
                <p className="text-[11px] text-white/40 mt-0.5">
                  {recordsClient.name?.includes('(')
                    ? `${recordsClient.name.split('(')[0].trim()} · ${recordsClient.name.slice(recordsClient.name.indexOf('(')+1, recordsClient.name.lastIndexOf(')'))}`
                    : recordsClient.name || 'Paciente'}
                  {recordsClient.member_code && <span className="ml-2 font-mono text-[#0ea5a4]">{recordsClient.member_code}</span>}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {records.length > 0 && (
                  <button onClick={downloadRecordsPDF} disabled={recordsPdfBusy}
                    className="px-3 py-1.5 rounded-lg bg-[#0ea5a4]/10 border border-[#0ea5a4]/25 text-[#0ea5a4] text-[10px] font-black uppercase tracking-wider hover:bg-[#0ea5a4]/20 transition disabled:opacity-50 flex items-center gap-1.5"
                    title="Descargar historia en PDF">
                    📄 {recordsPdfBusy ? '...' : 'PDF'}
                  </button>
                )}
                <button onClick={() => setRecordsClient(null)} className="text-gray-400 hover:text-white transition"><FaTimes size={16} /></button>
              </div>
            </div>

            {/* Content */}
            <div className="p-4 overflow-y-auto flex-1 space-y-4">
              {/* Botón agregar */}
              <button onClick={() => setAddingRecord(a => !a)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#0ea5a4]/10 border border-[#0ea5a4]/25 text-[#0ea5a4] text-xs font-black uppercase tracking-wider hover:bg-[#0ea5a4]/20 transition">
                <FaPlus size={11} /> {addingRecord ? 'Cancelar' : 'Agregar consulta / registro'}
              </button>

              {/* Form nueva consulta */}
              {addingRecord && (
                <div className="bg-black/30 border border-[#0ea5a4]/15 rounded-2xl p-4 space-y-3">
                  <h4 className="text-[11px] font-black uppercase tracking-widest text-[#0ea5a4] flex items-center gap-1.5">
                    <FaStethoscope size={10} /> Nuevo registro
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">Fecha *</label>
                      <input type="date" value={newRecord.record_date} onChange={e => setNewRecord(p => ({ ...p, record_date: e.target.value }))}
                        className="w-full bg-black/40 border border-[#0ea5a4]/20 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-[#0ea5a4]" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">Tipo *</label>
                      <select value={newRecord.record_type} onChange={e => setNewRecord(p => ({ ...p, record_type: e.target.value }))}
                        className="w-full bg-black/40 border border-[#0ea5a4]/20 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-[#0ea5a4]">
                        {recordTypes.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                  <input value={newRecord.pet_name || ''} onChange={e => setNewRecord(p => ({ ...p, pet_name: e.target.value }))}
                    placeholder={L.recordPersonName} className="w-full bg-black/40 border border-[#0ea5a4]/20 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-[#0ea5a4] placeholder-gray-600" />
                  <input value={newRecord.diagnosis || ''} onChange={e => setNewRecord(p => ({ ...p, diagnosis: e.target.value }))}
                    placeholder="Diagnóstico" className="w-full bg-black/40 border border-[#0ea5a4]/20 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-[#0ea5a4] placeholder-gray-600" />
                  <input value={newRecord.treatment || ''} onChange={e => setNewRecord(p => ({ ...p, treatment: e.target.value }))}
                    placeholder="Tratamiento aplicado" className="w-full bg-black/40 border border-[#0ea5a4]/20 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-[#0ea5a4] placeholder-gray-600" />
                  <input value={newRecord.medications || ''} onChange={e => setNewRecord(p => ({ ...p, medications: e.target.value }))}
                    placeholder="Medicamentos / dosis" className="w-full bg-black/40 border border-[#0ea5a4]/20 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-[#0ea5a4] placeholder-gray-600" />
                  <div>
                    <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">Próxima visita</label>
                    <input type="date" value={newRecord.next_visit_date || ''} onChange={e => setNewRecord(p => ({ ...p, next_visit_date: e.target.value }))}
                      className="w-full bg-black/40 border border-[#0ea5a4]/20 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-[#0ea5a4]" />
                  </div>
                  <textarea value={newRecord.vet_notes || ''} onChange={e => setNewRecord(p => ({ ...p, vet_notes: e.target.value }))}
                    placeholder={L.vetNotes} rows={3}
                    className="w-full bg-black/40 border border-[#0ea5a4]/20 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-[#0ea5a4] placeholder-gray-600 resize-none" />
                  <button onClick={saveRecord} disabled={savingRecord || !newRecord.record_date || !newRecord.record_type}
                    className="w-full py-3 rounded-xl bg-[#0ea5a4] hover:bg-[#0c8a89] text-white font-black text-xs uppercase tracking-wider disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                    <FaSave size={11} /> {savingRecord ? 'Guardando...' : 'Guardar registro'}
                  </button>
                </div>
              )}

              {/* Lista de registros */}
              {recordsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#0ea5a4]" />
                </div>
              ) : records.length === 0 ? (
                <div className="text-center py-10 text-gray-500">
                  <FaBookMedical className="mx-auto text-3xl mb-2 opacity-40" />
                  <p className="text-sm">Sin registros médicos aún.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {records.map((rec, idx) => (
                    <div key={rec.id ?? idx} className="bg-black/30 border border-[#0ea5a4]/10 rounded-2xl p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-black uppercase tracking-widest text-[#0ea5a4] bg-[#0ea5a4]/10 border border-[#0ea5a4]/20 rounded-full px-2 py-0.5">{rec.record_type}</span>
                            {rec.pet_name && <span className="text-[10px] text-[#e8f1ff]/60 flex items-center gap-1">{isMedical ? <FaUsers size={8} /> : <FaPaw size={8} />} {rec.pet_name}</span>}
                          </div>
                          <p className="text-xs font-bold text-white mt-1">
                            {new Date(rec.record_date + 'T00:00:00').toLocaleDateString('es-EC', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' })}
                          </p>
                        </div>
                        <button onClick={() => rec.id && deleteRecord(rec.id)}
                          className="w-7 h-7 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center shrink-0 hover:bg-red-500/20 transition">
                          <FaTrash size={10} />
                        </button>
                      </div>
                      <div className="space-y-1 text-xs">
                        {rec.diagnosis && <div><span className="text-gray-500 font-bold">Diagnóstico: </span><span className="text-white/85">{rec.diagnosis}</span></div>}
                        {rec.treatment && <div><span className="text-gray-500 font-bold">Tratamiento: </span><span className="text-white/85">{rec.treatment}</span></div>}
                        {rec.medications && <div><span className="text-gray-500 font-bold">Medicamentos: </span><span className="text-white/85">{rec.medications}</span></div>}
                        {rec.vet_notes && <div className="mt-1.5 p-2 rounded-lg bg-white/[0.02] border border-white/5 text-white/70 italic text-[11px] leading-snug">{rec.vet_notes}</div>}
                        {rec.next_visit_date && (
                          <div className="mt-1.5 inline-flex items-center gap-1.5 text-[10px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2 py-1">
                            📅 Próxima visita: {new Date(rec.next_visit_date + 'T00:00:00').toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default LoyaltyTab;
