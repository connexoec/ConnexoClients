import React, { useRef, useState } from 'react';
import { supabase } from '../../src/lib/supabase';
import type { PhotoPackage, PhotoPackageKind, PhotoPackageMode } from '../../types';
import { FaPlus, FaPen, FaTrash, FaToggleOn, FaToggleOff, FaArrowUp, FaArrowDown, FaStar, FaRegStar, FaUpload, FaTimes, FaTags } from 'react-icons/fa';
import { useOwnerTable, AdminModal, Field, adminInput, Spinner, MissingSqlNotice, PlanLock, isMissingSql, money } from '../AdminKit';
import { PaymentGatewaysPanel } from '../PaymentGatewaysPanel';
import { ACCENT, ON_ACCENT, TITLE_FONT, btnPrimary, iconBtn, dangerBtn, TabHeader, Empty, Pills, CapNote, capFor } from '../photo/PhotoAdminUi';
import { KIND_LABEL, KIND_HINT, MODE_LABEL, durationText, uploadPhotoFile } from '../../src/lib/photoCommon';

interface Props {
  user: any;
  profileData: any;
  setProfileData?: React.Dispatch<React.SetStateAction<any>>;
  showNotification: (message: string, type: 'success' | 'error') => void;
  plan: 'conecta' | 'pro' | 'ultra';
}

type Form = {
  name: string; kind: PhotoPackageKind; mode: PhotoPackageMode; description: string; includes: string; delivery_note: string;
  price: string; price_prefix: string; hourly: boolean; min_hours: string; max_hours: string; duration_min: string; full_day: boolean;
  deposit_percent: string; image_url: string; is_featured: boolean; is_active: boolean;
};
const EMPTY: Form = {
  name: '', kind: 'sesion', mode: 'reserva', description: '', includes: '', delivery_note: '', price: '', price_prefix: '', hourly: false,
  min_hours: '1', max_hours: '8', duration_min: '60', full_day: false, deposit_percent: '0', image_url: '', is_featured: false, is_active: true,
};
const DURATIONS = [30, 45, 60, 90, 120, 180, 240];

export const PhotoPackagesTab: React.FC<Props> = ({ user, profileData, setProfileData, showNotification, plan }) => {
  const t = useOwnerTable<PhotoPackage>({ table: 'photo_packages', ownerColumn: 'photo_profile_id', ownerId: user?.id, realtime: false, order: [{ column: 'sort_order' }, { column: 'created_at' }] });
  const [view, setView] = useState<'paquetes' | 'cobros'>('paquetes');
  const [modal, setModal] = useState<{ open: boolean; editing: PhotoPackage | null }>({ open: false, editing: null });
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false); const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cap = capFor(plan, 'packages');
  const num = (s: string, d = 0) => { const n = Number(String(s).replace(',', '.')); return Number.isFinite(n) ? n : d; };

  const openNew = () => {
    if (cap && t.rows.length >= cap) return showNotification(`Tu plan permite ${cap} paquetes.`, 'error');
    setForm(EMPTY); setModal({ open: true, editing: null });
  };
  const openEdit = (p: PhotoPackage) => {
    setForm({
      name: p.name, kind: p.kind, mode: p.mode, description: p.description || '', includes: (p.includes || []).join('\n'), delivery_note: p.delivery_note || '',
      price: String(p.price ?? ''), price_prefix: p.price_prefix || '', hourly: p.hourly, min_hours: String(p.min_hours), max_hours: String(p.max_hours),
      duration_min: String(p.duration_min), full_day: p.full_day, deposit_percent: String(p.deposit_percent), image_url: p.image_url || '',
      is_featured: p.is_featured, is_active: p.is_active,
    });
    setModal({ open: true, editing: p });
  };
  const setKind = (kind: PhotoPackageKind) => setForm(f => ({
    ...f, kind,
    // Atajos sensatos al elegir el tipo; el dueño puede cambiarlos después.
    hourly: kind === 'estudio' ? true : f.hourly && kind === 'evento',
    mode: kind === 'documentos' || kind === 'impresion' ? 'consulta' : kind === 'evento' && f.mode === 'reserva' && f.full_day ? 'reserva' : f.mode,
  }));

  const upload = async (file?: File | null) => {
    if (!file || !user?.id) return;
    setUploading(true);
    try { const url = await uploadPhotoFile(user.id, 'photo_packages', file, 1400, 0.85); setForm(f => ({ ...f, image_url: url })); }
    catch (e: any) { showNotification(`No se pudo subir la imagen: ${e?.message || e}`, 'error'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const save = async () => {
    if (!user?.id) return;
    if (!form.name.trim()) return showNotification('Ponle un nombre al paquete.', 'error');
    const price = num(form.price);
    if (price < 0) return showNotification('El precio no puede ser negativo.', 'error');
    const minH = Math.max(1, Math.round(num(form.min_hours, 1))), maxH = Math.min(24, Math.max(minH, Math.round(num(form.max_hours, 8))));
    const payload = {
      name: form.name.trim(), kind: form.kind, mode: form.mode, description: form.description.trim() || null,
      includes: form.includes.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 20), delivery_note: form.delivery_note.trim() || null,
      price, price_prefix: form.price_prefix.trim() || null, hourly: form.hourly, min_hours: minH, max_hours: maxH,
      duration_min: Math.min(1440, Math.max(15, Math.round(num(form.duration_min, 60)))), full_day: form.full_day && !form.hourly,
      deposit_percent: Math.min(100, Math.max(0, Math.round(num(form.deposit_percent)))), image_url: form.image_url || null,
      is_featured: form.is_featured, is_active: form.is_active,
    };
    setSaving(true);
    const { editing } = modal;
    const { error } = editing
      ? await supabase.from('photo_packages').update(payload).eq('id', editing.id)
      : await supabase.from('photo_packages').insert({ ...payload, photo_profile_id: user.id, sort_order: (t.rows.reduce((m, r) => Math.max(m, r.sort_order), 0) || 0) + 1 });
    setSaving(false);
    if (error) {
      if (/packages_limit/.test(error.message)) return showNotification('Llegaste al límite de paquetes de tu plan.', 'error');
      return showNotification(isMissingSql(error) ? 'Falta ejecutar setup_photo.sql en Supabase.' : `No se pudo guardar: ${error.message}`, 'error');
    }
    showNotification(editing ? 'Paquete actualizado.' : 'Paquete creado.', 'success');
    setModal({ open: false, editing: null });
    t.reload();
  };

  const patch = async (p: PhotoPackage, change: Partial<PhotoPackage>) => {
    t.setRows(rs => rs.map(x => (x.id === p.id ? { ...x, ...change } : x)));
    const { error } = await supabase.from('photo_packages').update(change).eq('id', p.id);
    if (error) { showNotification(error.message, 'error'); t.reload(); }
  };
  const remove = async (p: PhotoPackage) => {
    if (!window.confirm(`¿Eliminar el paquete «${p.name}»? Las reservas ya hechas conservan su nombre.`)) return;
    const { error } = await supabase.from('photo_packages').delete().eq('id', p.id);
    if (error) return showNotification(error.message, 'error');
    t.reload();
  };
  const move = async (p: PhotoPackage, d: number) => {
    const list = [...t.rows].sort((a, b) => a.sort_order - b.sort_order);
    const i = list.findIndex(x => x.id === p.id), j = i + d;
    if (j < 0 || j >= list.length) return;
    const a = list[i], b = list[j];
    const sa = a.sort_order, sb = b.sort_order === a.sort_order ? b.sort_order + d : b.sort_order;
    t.setRows(rs => rs.map(x => (x.id === a.id ? { ...x, sort_order: sb } : x.id === b.id ? { ...x, sort_order: sa } : x)));
    await Promise.all([supabase.from('photo_packages').update({ sort_order: sb }).eq('id', a.id), supabase.from('photo_packages').update({ sort_order: sa }).eq('id', b.id)]);
    t.reload();
  };

  if (t.loading) return <Spinner accent={ACCENT} />;
  if (t.missingSql) return <MissingSqlNotice file="setup_photo.sql" accent={ACCENT} />;

  const total = num(form.price) * (form.hourly ? Math.max(1, Math.round(num(form.min_hours, 1))) : 1);

  return (
    <div className="space-y-6">
      <TabHeader icon={<FaTags />} title="Paquetes" subtitle="Lo que ofreces, con precio, duración y qué incluye. Así tus clientes saben cuánto cuesta antes de escribirte."
        action={view === 'paquetes' ? <button type="button" className={btnPrimary} style={{ background: ACCENT, color: ON_ACCENT }} onClick={openNew}><FaPlus /> Nuevo paquete</button> : undefined} />
      <Pills items={[['paquetes', 'Paquetes'], ['cobros', 'Cobros del anticipo']]} value={view} onChange={setView} />

      {view === 'cobros' && (
        plan === 'ultra'
          ? <PaymentGatewaysPanel userId={user.id} profileData={profileData} setProfileData={setProfileData} showNotification={showNotification} accent={ACCENT} onAccent={ON_ACCENT} titleFont={TITLE_FONT} />
          : <PlanLock plan="ULTRA" what="Cobra el anticipo en línea: enlace de pago, PayPhone, transferencia o WhatsApp" accent={ACCENT} />
      )}

      {view === 'paquetes' && (
        <>
          <CapNote count={t.rows.length} cap={cap} label={t.rows.length === 1 ? 'paquete' : 'paquetes'} />
          {t.rows.length === 0 ? (
            <Empty emoji="🏷️">Crea tu primer paquete: por ejemplo «Sesión de retrato · 1 hora · 15 fotos editadas» con su precio.</Empty>
          ) : (
            <div className="space-y-3">
              {t.rows.map(p => (
                <div key={p.id} className="rounded-2xl border p-3.5 flex items-center gap-3" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)', opacity: p.is_active ? 1 : 0.55 }}>
                  {p.image_url ? <img src={p.image_url} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" /> : <div className="w-16 h-16 rounded-lg bg-white/5 flex items-center justify-center text-white/20 shrink-0"><FaTags /></div>}
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: ACCENT }}>{KIND_LABEL[p.kind]} · {MODE_LABEL[p.mode]}{p.is_featured ? ' · POPULAR' : ''}</p>
                    <p className="text-white font-semibold truncate">{p.name}</p>
                    <p className="text-[11px] text-white/45">{p.price > 0 ? `${p.price_prefix ? p.price_prefix + ' ' : ''}${money(p.price)}${p.hourly ? ' / hora' : ''}` : 'Sin precio'} · {durationText(p)}{p.deposit_percent > 0 ? ` · anticipo ${p.deposit_percent} %` : ''}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button type="button" aria-label={p.is_featured ? 'Quitar popular' : 'Marcar popular'} onClick={() => patch(p, { is_featured: !p.is_featured })} className={iconBtn}>{p.is_featured ? <FaStar size={12} style={{ color: ACCENT }} /> : <FaRegStar size={12} />}</button>
                    <button type="button" aria-label={p.is_active ? 'Ocultar' : 'Mostrar'} onClick={() => patch(p, { is_active: !p.is_active })} className="text-white/50">{p.is_active ? <FaToggleOn size={22} style={{ color: ACCENT }} /> : <FaToggleOff size={22} />}</button>
                    <button type="button" aria-label="Subir" onClick={() => move(p, -1)} className={`${iconBtn} hidden sm:flex`}><FaArrowUp size={10} /></button>
                    <button type="button" aria-label="Bajar" onClick={() => move(p, 1)} className={`${iconBtn} hidden sm:flex`}><FaArrowDown size={10} /></button>
                    <button type="button" aria-label="Editar paquete" onClick={() => openEdit(p)} className={iconBtn}><FaPen size={11} /></button>
                    <button type="button" aria-label="Eliminar paquete" onClick={() => remove(p)} className={dangerBtn}><FaTrash size={11} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {modal.open && (
        <AdminModal title={modal.editing ? 'Editar paquete' : 'Nuevo paquete'} onClose={() => setModal({ open: false, editing: null })} accent={ACCENT} wide>
          <div className="space-y-4">
            <Field label="Nombre"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Sesión de retrato" className={adminInput} /></Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Tipo" hint={KIND_HINT[form.kind]}>
                <select value={form.kind} onChange={e => setKind(e.target.value as PhotoPackageKind)} className={adminInput}>
                  {(Object.keys(KIND_LABEL) as PhotoPackageKind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                </select>
              </Field>
              <Field label="Cómo lo piden" hint={form.mode === 'reserva' ? 'Elige fecha y hora en tu agenda (planes PRO y ULTRA).' : form.mode === 'cotizacion' ? 'Llena un formulario y tú respondes con precio.' : 'Abre tu WhatsApp con un mensaje listo.'}>
                <select value={form.mode} onChange={e => setForm({ ...form, mode: e.target.value as PhotoPackageMode })} className={adminInput}>
                  {(Object.keys(MODE_LABEL) as PhotoPackageMode[]).map(m => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Field label={form.hourly ? 'Precio por hora ($)' : 'Precio ($)'}><input inputMode="decimal" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} placeholder="60" className={adminInput} /></Field>
              <Field label="Texto antes"><input value={form.price_prefix} onChange={e => setForm({ ...form, price_prefix: e.target.value })} placeholder="Desde" className={adminInput} /></Field>
              <Field label="Anticipo (%)" hint="0 = sin anticipo"><input inputMode="numeric" value={form.deposit_percent} onChange={e => setForm({ ...form, deposit_percent: e.target.value })} className={adminInput} /></Field>
            </div>

            <div className="rounded-xl border border-white/10 p-3.5 space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/45">Duración</p>
              <div className="flex flex-wrap gap-5">
                <label className="flex items-center gap-2 text-sm text-white/70"><input type="checkbox" checked={form.hourly} onChange={e => setForm({ ...form, hourly: e.target.checked, full_day: e.target.checked ? false : form.full_day })} /> Se cobra por hora (el cliente elige cuántas)</label>
                <label className="flex items-center gap-2 text-sm text-white/70"><input type="checkbox" checked={form.full_day} disabled={form.hourly} onChange={e => setForm({ ...form, full_day: e.target.checked })} /> Ocupa el día completo</label>
              </div>
              {form.hourly ? (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Mínimo de horas"><input inputMode="numeric" value={form.min_hours} onChange={e => setForm({ ...form, min_hours: e.target.value })} className={adminInput} /></Field>
                  <Field label="Máximo de horas"><input inputMode="numeric" value={form.max_hours} onChange={e => setForm({ ...form, max_hours: e.target.value })} className={adminInput} /></Field>
                </div>
              ) : !form.full_day && (
                <Field label="Minutos de la sesión">
                  <select value={DURATIONS.includes(Number(form.duration_min)) ? form.duration_min : 'otro'} onChange={e => e.target.value !== 'otro' && setForm({ ...form, duration_min: e.target.value })} className={adminInput}>
                    {DURATIONS.map(d => <option key={d} value={d}>{d >= 60 ? `${Math.floor(d / 60)} h${d % 60 ? ` ${d % 60} min` : ''}` : `${d} min`}</option>)}
                    {!DURATIONS.includes(Number(form.duration_min)) && <option value="otro">{form.duration_min} min</option>}
                  </select>
                </Field>
              )}
            </div>

            <Field label="Qué incluye" hint="Una línea por punto: «15 fotos editadas», «Galería privada online»…">
              <textarea rows={4} value={form.includes} onChange={e => setForm({ ...form, includes: e.target.value })} className={adminInput} />
            </Field>
            <Field label="Entrega (opcional)"><input value={form.delivery_note} onChange={e => setForm({ ...form, delivery_note: e.target.value })} placeholder="Fotos editadas en 5 días" className={adminInput} /></Field>
            <Field label="Descripción (opcional)"><textarea rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className={adminInput} /></Field>

            <div>
              <span className="block text-[10px] font-black uppercase tracking-widest text-white/45 mb-1.5">Foto (opcional)</span>
              <div className="flex items-center gap-3">
                {form.image_url && <div className="relative"><img src={form.image_url} alt="" className="w-20 h-20 rounded-lg object-cover" /><button type="button" aria-label="Quitar foto" onClick={() => setForm({ ...form, image_url: '' })} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-black/80 text-white flex items-center justify-center"><FaTimes size={10} /></button></div>}
                <label className={`${btnPrimary} cursor-pointer`} style={{ background: `${ACCENT}22`, color: ACCENT }}><FaUpload size={11} /> {uploading ? 'Subiendo…' : form.image_url ? 'Cambiar' : 'Subir foto'}<input ref={fileRef} type="file" accept="image/*" className="hidden" disabled={uploading} onChange={e => upload(e.target.files?.[0])} /></label>
              </div>
            </div>

            {form.mode === 'reserva' && total > 0 && form.deposit_percent !== '0' && (
              <p className="text-[12px] text-white/50">Con este precio el cliente apartará su fecha con un anticipo de <b className="text-white">{money(Math.round(total * num(form.deposit_percent)) / 100)}</b>.</p>
            )}
            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-sm text-white/70"><input type="checkbox" checked={form.is_featured} onChange={e => setForm({ ...form, is_featured: e.target.checked })} /> Popular</label>
              <label className="flex items-center gap-2 text-sm text-white/70"><input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} /> Visible en mi perfil</label>
            </div>
            <button type="button" disabled={saving || uploading} onClick={save} className={`${btnPrimary} w-full justify-center`} style={{ background: ACCENT, color: ON_ACCENT }}>{saving ? 'Guardando…' : 'Guardar paquete'}</button>
          </div>
        </AdminModal>
      )}
    </div>
  );
};

export default PhotoPackagesTab;
