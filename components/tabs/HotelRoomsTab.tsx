import React, { useState } from 'react';
import { supabase } from '../../src/lib/supabase';
import type { HotelRoom, HotelService, HotelServiceMode, HotelSettings } from '../../types';
import { FaPlus, FaPen, FaTrash, FaBed, FaConciergeBell, FaImage, FaUsers, FaToggleOn, FaToggleOff, FaTimes, FaStar, FaCog } from 'react-icons/fa';
import {
  useOwnerTable, useJsonSettings, AdminModal, Field, adminInput, Spinner, MissingSqlNotice, PlanLock, Pill, uploadAsset, money, isMissingSql,
} from '../AdminKit';

interface Props {
  user: any;
  profileData: any;
  setProfileData: React.Dispatch<React.SetStateAction<any>>;
  showNotification: (message: string, type: 'success' | 'error') => void;
  plan: 'conecta' | 'pro' | 'ultra';
}

const ACCENT = '#d9958b';
const ON_ACCENT = '#1a0d10';
const TITLE_FONT = "'Merriweather', serif";

const AMENITIES = ['Wi-Fi', 'Aire acondicionado', 'TV por cable', 'Desayuno incluido', 'Minibar', 'Baño privado', 'Agua caliente', 'Balcón', 'Vista al mar', 'Jacuzzi', 'Escritorio', 'Caja fuerte', 'Secador de pelo', 'Parqueadero', 'Piscina', 'Cocina equipada'];
const MODES: { val: HotelServiceMode; label: string }[] = [
  { val: 'por_reserva', label: 'Por reserva (una vez)' }, { val: 'por_noche', label: 'Por noche' },
  { val: 'por_persona', label: 'Por persona' }, { val: 'por_persona_noche', label: 'Por persona y noche' },
];
const TIMEZONES = [
  ['America/Guayaquil', 'Ecuador'], ['America/Caracas', 'Venezuela'], ['America/Bogota', 'Colombia'], ['America/Lima', 'Perú'],
  ['America/Mexico_City', 'México'], ['America/Santiago', 'Chile'], ['America/Argentina/Buenos_Aires', 'Argentina'],
  ['America/Panama', 'Panamá'], ['America/New_York', 'EE. UU. (Este)'], ['Europe/Madrid', 'España'],
];

export const HotelRoomsTab: React.FC<Props> = ({ user, profileData, setProfileData, showNotification, plan }) => {
  const isPro = plan !== 'conecta';
  const [view, setView] = useState<'habitaciones' | 'servicios' | 'politicas'>('habitaciones');
  const roomsT = useOwnerTable<HotelRoom>({ table: 'hotel_rooms', ownerColumn: 'hotel_profile_id', ownerId: user?.id, realtime: false, order: [{ column: 'sort_order' }, { column: 'base_price' }] });
  const servicesT = useOwnerTable<HotelService>({ table: 'hotel_services', ownerColumn: 'hotel_profile_id', ownerId: user?.id, realtime: false, order: [{ column: 'sort_order' }, { column: 'created_at' }] });
  const rooms = roomsT.rows; const services = servicesT.rows;

  const [roomModal, setRoomModal] = useState<{ open: boolean; editing: HotelRoom | null }>({ open: false, editing: null });
  const [svcModal, setSvcModal] = useState<{ open: boolean; editing: HotelService | null }>({ open: false, editing: null });

  const toggle = async (table: 'hotel_rooms' | 'hotel_services', id: string, value: boolean, reload: () => void) => {
    const { error } = await supabase.from(table).update({ is_available: value }).eq('id', id);
    if (error) return showNotification(error.message, 'error');
    reload();
  };
  const remove = async (table: 'hotel_rooms' | 'hotel_services', id: string, label: string, reload: () => void) => {
    if (!window.confirm(`¿Eliminar "${label}"?${table === 'hotel_rooms' ? ' Las reservas ya hechas se conservan con su nombre.' : ''}`)) return;
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) return showNotification(error.message, 'error');
    reload();
  };

  if (roomsT.loading) return <Spinner accent={ACCENT} />;

  return (
    <div className="animate-fade-in-up space-y-6 max-w-4xl mx-auto px-4 md:px-6 pb-32" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5" style={{ borderColor: `${ACCENT}26` }}>
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2" style={{ fontFamily: TITLE_FONT }}><FaBed style={{ color: ACCENT }} /> Alojamiento</h2>
          <p className="text-sm text-white/40 mt-1">Tus habitaciones, servicios adicionales y las políticas del hotel.</p>
        </div>
        {view === 'habitaciones' && <button onClick={() => setRoomModal({ open: true, editing: null })} className="flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl" style={{ background: ACCENT, color: ON_ACCENT }}><FaPlus /> Nueva habitación</button>}
        {view === 'servicios' && isPro && <button onClick={() => setSvcModal({ open: true, editing: null })} className="flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl" style={{ background: ACCENT, color: ON_ACCENT }}><FaPlus /> Nuevo servicio</button>}
      </div>

      <div className="flex flex-wrap gap-2">
        <Pill active={view === 'habitaciones'} onClick={() => setView('habitaciones')} accent={ACCENT} onAccent={ON_ACCENT}>Habitaciones</Pill>
        <Pill active={view === 'servicios'} onClick={() => setView('servicios')} accent={ACCENT} onAccent={ON_ACCENT}>Servicios {!isPro && '🔒'}</Pill>
        <Pill active={view === 'politicas'} onClick={() => setView('politicas')} accent={ACCENT} onAccent={ON_ACCENT}>Políticas y tarifas</Pill>
      </div>

      {roomsT.missingSql && <MissingSqlNotice file="setup_hotel.sql" accent={ACCENT} />}

      {view === 'habitaciones' && !roomsT.missingSql && (
        rooms.length === 0 ? (
          <div className="text-center py-16 text-white/30"><p className="text-4xl mb-3">🛏️</p><p className="text-sm">Crea tu primer tipo de habitación (por ejemplo «Suite» o «Doble estándar») con su tarifa por noche y cuántas unidades tienes.</p></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rooms.map(r => (
              <div key={r.id} className="rounded-2xl border overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)', opacity: r.is_available ? 1 : 0.55 }}>
                <div className="aspect-[16/8] bg-black/30 relative">
                  {r.images?.[0] ? <img src={r.images[0]} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><FaBed className="text-3xl text-white/15" /></div>}
                  {r.images?.length > 1 && <span className="absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-md bg-black/55 text-white">{r.images.length} fotos</span>}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><h3 className="text-white font-bold truncate" style={{ fontFamily: TITLE_FONT }}>{r.name}</h3><p className="text-[11px] text-white/45 mt-0.5">{[r.category, r.beds].filter(Boolean).join(' · ') || 'Sin detalle'}</p></div>
                    <p className="text-lg font-bold shrink-0" style={{ color: ACCENT, fontFamily: TITLE_FONT }}>{money(r.base_price)}</p>
                  </div>
                  <p className="text-[11px] text-white/40 mt-2 flex items-center gap-3"><span className="flex items-center gap-1"><FaUsers size={10} /> {r.max_adults}{r.max_children ? `+${r.max_children}` : ''}</span><span>{r.units} unidad{r.units === 1 ? '' : 'es'}</span>{r.min_nights > 1 && <span>mín. {r.min_nights} noches</span>}</p>
                  <div className="flex items-center gap-1.5 mt-3">
                    <button onClick={() => toggle('hotel_rooms', r.id, !r.is_available, roomsT.reload)} title={r.is_available ? 'Ocultar' : 'Mostrar'} className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">{r.is_available ? <FaToggleOn size={15} style={{ color: ACCENT }} /> : <FaToggleOff size={15} className="text-white/40" />}</button>
                    <button onClick={() => setRoomModal({ open: true, editing: r })} className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 text-white/60 flex items-center justify-center hover:text-white"><FaPen size={11} /></button>
                    <button onClick={() => remove('hotel_rooms', r.id, r.name, roomsT.reload)} className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center hover:bg-red-500/20"><FaTrash size={11} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {view === 'servicios' && (isPro ? (
        services.length === 0 ? (
          <div className="text-center py-16 text-white/30"><p className="text-4xl mb-3">🛎️</p><p className="text-sm">Ofrece desayuno, spa, traslados o tours: el huésped los añade al reservar y el total se calcula solo.</p></div>
        ) : (
          <div className="space-y-2.5">
            {services.map(s => (
              <div key={s.id} className="flex items-center gap-3 rounded-xl border px-3.5 py-3" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)', opacity: s.is_available ? 1 : 0.5 }}>
                <div className="w-12 h-12 rounded-lg overflow-hidden bg-white/5 shrink-0 flex items-center justify-center">{s.image_url ? <img src={s.image_url} alt="" className="w-full h-full object-cover" /> : <FaConciergeBell className="text-white/20" />}</div>
                <div className="min-w-0 flex-1"><p className="text-white font-bold truncate">{s.name}</p><p className="text-[11px] text-white/45 truncate">{[s.category, s.price > 0 ? `${money(s.price)} ${MODES.find(m => m.val === s.price_mode)?.label.toLowerCase()}` : 'Incluido'].filter(Boolean).join(' · ')}</p></div>
                <button onClick={() => toggle('hotel_services', s.id, !s.is_available, servicesT.reload)} className="text-white/50">{s.is_available ? <FaToggleOn size={18} style={{ color: ACCENT }} /> : <FaToggleOff size={18} />}</button>
                <button onClick={() => setSvcModal({ open: true, editing: s })} className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 text-white/60 flex items-center justify-center hover:text-white"><FaPen size={11} /></button>
                <button onClick={() => remove('hotel_services', s.id, s.name, servicesT.reload)} className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center hover:bg-red-500/20"><FaTrash size={11} /></button>
              </div>
            ))}
          </div>
        )
      ) : <PlanLock plan="PRO" what="Servicios adicionales que el huésped suma a su reserva" accent={ACCENT} />)}

      {view === 'politicas' && <PoliciesForm userId={user?.id} profileData={profileData} setProfileData={setProfileData} showNotification={showNotification} />}

      {roomModal.open && <RoomModal userId={user.id} editing={roomModal.editing} count={rooms.length} showNotification={showNotification} onClose={() => setRoomModal({ open: false, editing: null })} onSaved={() => { setRoomModal({ open: false, editing: null }); roomsT.reload(); }} />}
      {svcModal.open && <ServiceModal userId={user.id} editing={svcModal.editing} count={services.length} showNotification={showNotification} onClose={() => setSvcModal({ open: false, editing: null })} onSaved={() => { setSvcModal({ open: false, editing: null }); servicesT.reload(); }} />}
    </div>
  );
};

/* ── Habitación ───────────────────────────────────────────────────────────── */
const RoomModal: React.FC<{ userId: string; editing: HotelRoom | null; count: number; showNotification: Props['showNotification']; onClose: () => void; onSaved: () => void }> = ({ userId, editing, count, showNotification, onClose, onSaved }) => {
  const [f, setF] = useState({
    name: editing?.name || '', category: editing?.category || '', description: editing?.description || '',
    base_price: editing ? String(editing.base_price) : '', units: String(editing?.units ?? 1), max_adults: String(editing?.max_adults ?? 2),
    max_children: String(editing?.max_children ?? 0), beds: editing?.beds || '', size_m2: editing?.size_m2 != null ? String(editing.size_m2) : '',
    min_nights: String(editing?.min_nights ?? 1), sort_order: String(editing?.sort_order ?? count), is_available: editing?.is_available ?? true,
  });
  const [amenities, setAmenities] = useState<string[]>(editing?.amenities || ['Wi-Fi', 'Baño privado']);
  const [custom, setCustom] = useState('');
  const [images, setImages] = useState<string[]>(editing?.images || []);
  const [uploading, setUploading] = useState(false); const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f, v: any) => setF(p => ({ ...p, [k]: v }));

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = 8 - images.length;
    if (room <= 0) return showNotification('Máximo 8 fotos por habitación.', 'error');
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files).slice(0, room)) urls.push(await uploadAsset(userId, 'hotel_rooms', file));
      setImages(p => [...p, ...urls]);
    } catch (err: any) { showNotification(`Error al subir: ${err?.message}`, 'error'); }
    finally { setUploading(false); }
  };
  const toggleAmenity = (a: string) => setAmenities(p => p.includes(a) ? p.filter(x => x !== a) : [...p, a]);
  const addCustom = () => { const v = custom.trim(); if (v && !amenities.includes(v)) setAmenities(p => [...p, v]); setCustom(''); };

  const save = async () => {
    if (!f.name.trim()) return showNotification('El nombre es obligatorio.', 'error');
    const price = Number(f.base_price); if (!isFinite(price) || price < 0 || f.base_price === '') return showNotification('Escribe la tarifa por noche.', 'error');
    const payload = {
      hotel_profile_id: userId, name: f.name.trim(), category: f.category.trim() || null, description: f.description.trim() || null,
      base_price: price, units: Math.min(Math.max(Math.round(Number(f.units)) || 1, 1), 500), max_adults: Math.min(Math.max(Math.round(Number(f.max_adults)) || 1, 1), 20),
      max_children: Math.min(Math.max(Math.round(Number(f.max_children)) || 0, 0), 20), beds: f.beds.trim() || null,
      size_m2: f.size_m2 !== '' ? Number(f.size_m2) : null, min_nights: Math.min(Math.max(Math.round(Number(f.min_nights)) || 1, 1), 60),
      amenities, images, sort_order: Math.round(Number(f.sort_order)) || 0, is_available: f.is_available,
    };
    setSaving(true);
    const { error } = editing ? await supabase.from('hotel_rooms').update(payload).eq('id', editing.id) : await supabase.from('hotel_rooms').insert(payload);
    setSaving(false);
    if (error) return showNotification(isMissingSql(error) ? 'Falta ejecutar setup_hotel.sql en Supabase.' : `No se pudo guardar: ${error.message}`, 'error');
    showNotification(editing ? 'Habitación actualizada.' : 'Habitación creada.', 'success');
    onSaved();
  };

  return (
    <AdminModal title={editing ? 'Editar habitación' : 'Nueva habitación'} accent={ACCENT} onClose={onClose} wide>
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Nombre *"><input className={adminInput} value={f.name} onChange={e => set('name', e.target.value)} placeholder="Suite junior" /></Field>
          <Field label="Categoría"><input className={adminInput} list="hotel-cats" value={f.category} onChange={e => set('category', e.target.value)} placeholder="Suite" /><datalist id="hotel-cats">{['Estándar', 'Superior', 'Suite', 'Familiar', 'Cabaña', 'Dormitorio compartido'].map(c => <option key={c} value={c} />)}</datalist></Field>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Tarifa / noche *"><input className={adminInput} type="number" min={0} step="0.01" value={f.base_price} onChange={e => set('base_price', e.target.value)} /></Field>
          <Field label="Unidades" hint="Cuántas hay"><input className={adminInput} type="number" min={1} value={f.units} onChange={e => set('units', e.target.value)} /></Field>
          <Field label="Adultos"><input className={adminInput} type="number" min={1} value={f.max_adults} onChange={e => set('max_adults', e.target.value)} /></Field>
          <Field label="Niños"><input className={adminInput} type="number" min={0} value={f.max_children} onChange={e => set('max_children', e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Camas"><input className={adminInput} value={f.beds} onChange={e => set('beds', e.target.value)} placeholder="1 cama king" /></Field>
          <Field label="Tamaño m²"><input className={adminInput} type="number" min={0} value={f.size_m2} onChange={e => set('size_m2', e.target.value)} /></Field>
          <Field label="Noches mín."><input className={adminInput} type="number" min={1} value={f.min_nights} onChange={e => set('min_nights', e.target.value)} /></Field>
        </div>
        <Field label="Descripción"><textarea className={adminInput} rows={3} value={f.description} onChange={e => set('description', e.target.value)} /></Field>

        <Field label="Comodidades">
          <div className="flex flex-wrap gap-1.5">
            {[...AMENITIES, ...amenities.filter(a => !AMENITIES.includes(a))].map(a => (
              <button key={a} type="button" onClick={() => toggleAmenity(a)} className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition"
                style={amenities.includes(a) ? { background: ACCENT, color: ON_ACCENT, borderColor: ACCENT } : { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.55)', borderColor: 'rgba(255,255,255,0.1)' }}>{a}</button>
            ))}
          </div>
          <div className="flex gap-2 mt-2"><input className={adminInput} value={custom} onChange={e => setCustom(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }} placeholder="Otra comodidad…" /><button type="button" onClick={addCustom} className="shrink-0 px-4 rounded-xl text-xs font-bold border" style={{ borderColor: `${ACCENT}55`, color: ACCENT }}>Añadir</button></div>
        </Field>

        <Field label={`Fotos (${images.length}/8)`} hint="La primera es la portada de la habitación">
          <div className="grid grid-cols-4 gap-2">
            {images.map((src, i) => (
              <div key={src + i} className="relative aspect-square rounded-lg overflow-hidden bg-black/30 group">
                <img src={src} alt="" className="w-full h-full object-cover" />
                {i === 0 && <span className="absolute bottom-1 left-1 text-[9px] font-black px-1.5 py-0.5 rounded" style={{ background: ACCENT, color: ON_ACCENT }}>PORTADA</span>}
                <button type="button" aria-label="Quitar foto" onClick={() => setImages(p => p.filter((_, j) => j !== i))} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center"><FaTimes size={8} /></button>
                {i > 0 && <button type="button" title="Usar como portada" onClick={() => setImages(p => [p[i], ...p.filter((_, j) => j !== i)])} className="absolute top-1 left-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center"><FaStar size={8} /></button>}
              </div>
            ))}
            {images.length < 8 && (
              <label className="aspect-square rounded-lg border border-dashed flex flex-col items-center justify-center gap-1 text-white/40 hover:text-white cursor-pointer text-[10px]" style={{ borderColor: `${ACCENT}55` }}>
                <FaImage />{uploading ? 'Subiendo…' : 'Añadir'}
                <input type="file" accept="image/*" multiple className="hidden" onChange={e => { upload(e.target.files); e.target.value = ''; }} />
              </label>
            )}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3 items-end">
          <Field label="Orden"><input className={adminInput} type="number" value={f.sort_order} onChange={e => set('sort_order', e.target.value)} /></Field>
          <label className="flex items-center gap-2 text-sm text-white/70 pb-2.5"><input type="checkbox" checked={f.is_available} onChange={e => set('is_available', e.target.checked)} /> Visible y reservable</label>
        </div>
        <button onClick={save} disabled={saving || uploading} className="w-full py-3 rounded-xl text-sm font-black uppercase tracking-wider disabled:opacity-50" style={{ background: ACCENT, color: ON_ACCENT }}>{saving ? 'Guardando…' : 'Guardar habitación'}</button>
      </div>
    </AdminModal>
  );
};

/* ── Servicio adicional ───────────────────────────────────────────────────── */
const ServiceModal: React.FC<{ userId: string; editing: HotelService | null; count: number; showNotification: Props['showNotification']; onClose: () => void; onSaved: () => void }> = ({ userId, editing, count, showNotification, onClose, onSaved }) => {
  const [f, setF] = useState({ name: editing?.name || '', category: editing?.category || '', description: editing?.description || '', price: editing ? String(editing.price) : '', price_mode: (editing?.price_mode || 'por_reserva') as HotelServiceMode, is_available: editing?.is_available ?? true, sort_order: String(editing?.sort_order ?? count) });
  const [image, setImage] = useState(editing?.image_url || '');
  const [uploading, setUploading] = useState(false); const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f, v: any) => setF(p => ({ ...p, [k]: v }));
  const upload = async (file?: File) => { if (!file) return; setUploading(true); try { setImage(await uploadAsset(userId, 'hotel_services', file)); } catch (e: any) { showNotification(`Error al subir: ${e?.message}`, 'error'); } finally { setUploading(false); } };
  const save = async () => {
    if (!f.name.trim()) return showNotification('El nombre es obligatorio.', 'error');
    const price = f.price === '' ? 0 : Number(f.price); if (!isFinite(price) || price < 0) return showNotification('Precio no válido.', 'error');
    const payload = { hotel_profile_id: userId, name: f.name.trim(), category: f.category.trim() || null, description: f.description.trim() || null, image_url: image || null, price, price_mode: f.price_mode, is_available: f.is_available, sort_order: Math.round(Number(f.sort_order)) || 0 };
    setSaving(true);
    const { error } = editing ? await supabase.from('hotel_services').update(payload).eq('id', editing.id) : await supabase.from('hotel_services').insert(payload);
    setSaving(false);
    if (error) return showNotification(`No se pudo guardar: ${error.message}`, 'error');
    onSaved();
  };
  return (
    <AdminModal title={editing ? 'Editar servicio' : 'Nuevo servicio'} accent={ACCENT} onClose={onClose}>
      <div className="space-y-3">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-xl overflow-hidden bg-white/5 flex items-center justify-center shrink-0">{image ? <img src={image} alt="" className="w-full h-full object-cover" /> : <FaConciergeBell className="text-white/20 text-2xl" />}</div>
          <label className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider border cursor-pointer text-white/70 hover:text-white" style={{ borderColor: `${ACCENT}44` }}><FaImage className="inline mr-2" />{uploading ? 'Subiendo…' : 'Subir foto'}<input type="file" accept="image/*" className="hidden" onChange={e => upload(e.target.files?.[0])} /></label>
        </div>
        <Field label="Nombre *"><input className={adminInput} value={f.name} onChange={e => set('name', e.target.value)} placeholder="Desayuno buffet" /></Field>
        <Field label="Categoría"><input className={adminInput} list="hotel-svc-cats" value={f.category} onChange={e => set('category', e.target.value)} /><datalist id="hotel-svc-cats">{['Desayuno', 'Spa', 'Transporte', 'Tour', 'Restaurante', 'Lavandería', 'Eventos'].map(c => <option key={c} value={c} />)}</datalist></Field>
        <Field label="Descripción"><textarea className={adminInput} rows={2} value={f.description} onChange={e => set('description', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Precio" hint="0 = incluido"><input className={adminInput} type="number" min={0} step="0.01" value={f.price} onChange={e => set('price', e.target.value)} /></Field>
          <Field label="Se cobra"><select className={adminInput} value={f.price_mode} onChange={e => set('price_mode', e.target.value)}>{MODES.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}</select></Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-white/70"><input type="checkbox" checked={f.is_available} onChange={e => set('is_available', e.target.checked)} /> Disponible para reservar</label>
        <button onClick={save} disabled={saving || uploading} className="w-full py-3 rounded-xl text-sm font-black uppercase tracking-wider disabled:opacity-50" style={{ background: ACCENT, color: ON_ACCENT }}>{saving ? 'Guardando…' : 'Guardar servicio'}</button>
      </div>
    </AdminModal>
  );
};

/* ── Políticas y tarifas generales ────────────────────────────────────────── */
const PoliciesForm: React.FC<{ userId: string; profileData: any; setProfileData: Props['setProfileData']; showNotification: Props['showNotification'] }> = ({ userId, profileData, setProfileData, showNotification }) => {
  const { settings, save, saving } = useJsonSettings<HotelSettings>('hotel_settings', userId, profileData, setProfileData, showNotification);
  const [draft, setDraft] = useState<HotelSettings>({});
  const v = { ...settings, ...draft };
  const set = (patch: HotelSettings) => setDraft(d => ({ ...d, ...patch }));
  return (
    <div className="rounded-2xl border p-5 space-y-4" style={{ background: `${ACCENT}0a`, borderColor: `${ACCENT}2b` }}>
      <p className="text-xs font-black uppercase tracking-widest text-white flex items-center gap-2"><FaCog style={{ color: ACCENT }} /> Políticas del hotel</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Field label="Estrellas"><select className={adminInput} value={v.stars ?? 0} onChange={e => set({ stars: Number(e.target.value) })}>{[0, 1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n === 0 ? 'Sin mostrar' : '★'.repeat(n)}</option>)}</select></Field>
        <Field label="Check-in"><input type="time" className={adminInput} value={v.checkInTime ?? ''} onChange={e => set({ checkInTime: e.target.value })} /></Field>
        <Field label="Check-out"><input type="time" className={adminInput} value={v.checkOutTime ?? ''} onChange={e => set({ checkOutTime: e.target.value })} /></Field>
        <Field label="Zona horaria"><select className={adminInput} value={v.timezone ?? 'America/Guayaquil'} onChange={e => set({ timezone: e.target.value })}>{TIMEZONES.map(([z, l]) => <option key={z} value={z}>{l}</option>)}</select></Field>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Field label="Impuesto (%)" hint="Se suma al total. 0 = precios con impuesto incluido"><input type="number" min={0} max={100} step="0.01" className={adminInput} value={v.taxPercent ?? 0} onChange={e => set({ taxPercent: Number(e.target.value) })} /></Field>
        <Field label="Depósito (%)" hint="Para garantizar la reserva"><input type="number" min={0} max={100} className={adminInput} value={v.depositPercent ?? 0} onChange={e => set({ depositPercent: Number(e.target.value) })} /></Field>
        <Field label="Cancelar hasta (días antes)"><input type="number" min={0} max={60} className={adminInput} value={v.cancelDaysBefore ?? 1} onChange={e => set({ cancelDaysBefore: Number(e.target.value) })} /></Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
        <Field label="Mascotas"><select className={adminInput} value={v.petsAllowed == null ? '' : v.petsAllowed ? 'si' : 'no'} onChange={e => set({ petsAllowed: e.target.value === '' ? undefined : e.target.value === 'si' })}><option value="">No mencionar</option><option value="si">Se aceptan</option><option value="no">No se aceptan</option></select></Field>
        <label className="flex items-center gap-2 text-sm text-white/70 pb-2.5"><input type="checkbox" checked={v.bookingEnabled !== false} onChange={e => set({ bookingEnabled: e.target.checked })} /> Recibir reservas en línea</label>
      </div>
      <Field label="Política de cancelación y notas"><textarea className={adminInput} rows={3} value={v.cancellationPolicy ?? ''} onChange={e => set({ cancellationPolicy: e.target.value })} placeholder="Ej. Cancelación gratuita hasta 48 h antes. Después se cobra la primera noche." /></Field>
      <button disabled={saving || Object.keys(draft).length === 0} onClick={async () => { if (await save(draft, 'Políticas guardadas.')) setDraft({}); }} className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider disabled:opacity-40" style={{ background: ACCENT, color: ON_ACCENT }}>{saving ? 'Guardando…' : 'Guardar políticas'}</button>
    </div>
  );
};

export default HotelRoomsTab;
