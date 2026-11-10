import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../../src/lib/supabase';
import type { PhotoTeamMember } from '../../types';
import { FaPlus, FaPen, FaTrash, FaToggleOn, FaToggleOff, FaUpload, FaCamera, FaInstagram, FaTimes } from 'react-icons/fa';
import { useOwnerTable, AdminModal, Field, adminInput, Spinner, MissingSqlNotice, Kpi, money, isMissingSql } from '../AdminKit';
import { ACCENT, ON_ACCENT, btnPrimary, iconBtn, dangerBtn, TabHeader, Empty, Pills } from '../photo/PhotoAdminUi';
import { KIND_LABEL, uploadPhotoFile } from '../../src/lib/photoCommon';

interface Props {
  user: any;
  profileData: any;
  setProfileData?: React.Dispatch<React.SetStateAction<any>>;
  showNotification: (message: string, type: 'success' | 'error') => void;
}

export const PhotoStudioTab: React.FC<Props> = ({ user, showNotification }) => {
  const [view, setView] = useState<'equipo' | 'resumen'>('equipo');
  return (
    <div className="space-y-6">
      <TabHeader icon={<FaCamera />} title="Estudio" subtitle="Tu equipo de fotógrafos y cómo va tu negocio. Exclusivo del plan ULTRA." />
      <Pills items={[['equipo', 'Equipo'], ['resumen', 'Resumen']]} value={view} onChange={setView} />
      {view === 'equipo' ? <TeamPanel user={user} showNotification={showNotification} /> : <InsightsPanel showNotification={showNotification} />}
    </div>
  );
};

type Form = { name: string; role: string; bio: string; instagram: string; photo_url: string; is_active: boolean };
const EMPTY: Form = { name: '', role: '', bio: '', instagram: '', photo_url: '', is_active: true };

const TeamPanel: React.FC<{ user: any; showNotification: Props['showNotification'] }> = ({ user, showNotification }) => {
  const t = useOwnerTable<PhotoTeamMember>({ table: 'photo_team', ownerColumn: 'photo_profile_id', ownerId: user?.id, realtime: false, order: [{ column: 'sort_order' }, { column: 'name' }] });
  const [modal, setModal] = useState<{ open: boolean; editing: PhotoTeamMember | null }>({ open: false, editing: null });
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false); const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const openNew = () => { setForm(EMPTY); setModal({ open: true, editing: null }); };
  const openEdit = (m: PhotoTeamMember) => { setForm({ name: m.name, role: m.role || '', bio: m.bio || '', instagram: m.instagram || '', photo_url: m.photo_url || '', is_active: m.is_active }); setModal({ open: true, editing: m }); };
  const upload = async (file?: File | null) => {
    if (!file || !user?.id) return;
    setUploading(true);
    try { const url = await uploadPhotoFile(user.id, 'photo_team', file, 700, 0.85); setForm(f => ({ ...f, photo_url: url })); }
    catch (e: any) { showNotification(`No se pudo subir la foto: ${e?.message || e}`, 'error'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  const save = async () => {
    if (!user?.id) return;
    if (!form.name.trim()) return showNotification('Escribe el nombre del fotógrafo.', 'error');
    const payload = { name: form.name.trim(), role: form.role.trim() || null, bio: form.bio.trim() || null, instagram: form.instagram.trim() || null, photo_url: form.photo_url || null, is_active: form.is_active };
    setSaving(true);
    const { editing } = modal;
    const { error } = editing
      ? await supabase.from('photo_team').update(payload).eq('id', editing.id)
      : await supabase.from('photo_team').insert({ ...payload, photo_profile_id: user.id, sort_order: (t.rows.reduce((m, r) => Math.max(m, r.sort_order), 0) || 0) + 1 });
    setSaving(false);
    if (error) {
      if (/team_requires_ultra/.test(error.message)) return showNotification('El equipo de fotógrafos es del plan ULTRA.', 'error');
      return showNotification(isMissingSql(error) ? 'Falta ejecutar setup_photo.sql en Supabase.' : `No se pudo guardar: ${error.message}`, 'error');
    }
    showNotification('Guardado.', 'success'); setModal({ open: false, editing: null }); t.reload();
  };
  const toggle = async (m: PhotoTeamMember) => {
    t.setRows(rs => rs.map(x => (x.id === m.id ? { ...x, is_active: !x.is_active } : x)));
    const { error } = await supabase.from('photo_team').update({ is_active: !m.is_active }).eq('id', m.id);
    if (error) { showNotification(error.message, 'error'); t.reload(); }
  };
  const remove = async (m: PhotoTeamMember) => {
    if (!window.confirm(`¿Quitar a ${m.name} del equipo?`)) return;
    const { error } = await supabase.from('photo_team').delete().eq('id', m.id);
    if (error) return showNotification(error.message, 'error');
    t.reload();
  };

  if (t.loading) return <Spinner accent={ACCENT} />;
  if (t.missingSql) return <MissingSqlNotice file="setup_photo.sql" accent={ACCENT} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] text-white/45 max-w-md">El equipo aparece en tu perfil. Con equipo, tus clientes pueden elegir fotógrafo al reservar y puedes aceptar varias sesiones a la vez (en Sesiones → Horario).</p>
        <button type="button" className={btnPrimary} style={{ background: ACCENT, color: ON_ACCENT }} onClick={openNew}><FaPlus /> Agregar</button>
      </div>
      {t.rows.length === 0 ? <Empty emoji="👥">Aún no hay fotógrafos en el equipo.</Empty> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {t.rows.map(m => (
            <div key={m.id} className="rounded-2xl border p-3.5 flex items-center gap-3" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)', opacity: m.is_active ? 1 : 0.55 }}>
              <div className="w-14 h-14 rounded-full overflow-hidden bg-white/5 shrink-0 flex items-center justify-center text-white/20">{m.photo_url ? <img src={m.photo_url} alt={m.name} className="w-full h-full object-cover" /> : <FaCamera />}</div>
              <div className="min-w-0 flex-1">
                <p className="text-white font-semibold truncate">{m.name}</p>
                <p className="text-[11px] text-white/45 truncate flex items-center gap-1.5">{m.role || 'Fotógrafo'}{m.instagram && <FaInstagram size={10} />}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button type="button" aria-label={m.is_active ? 'Ocultar' : 'Mostrar'} onClick={() => toggle(m)} className="text-white/50">{m.is_active ? <FaToggleOn size={22} style={{ color: ACCENT }} /> : <FaToggleOff size={22} />}</button>
                <button type="button" aria-label="Editar" onClick={() => openEdit(m)} className={iconBtn}><FaPen size={11} /></button>
                <button type="button" aria-label="Quitar" onClick={() => remove(m)} className={dangerBtn}><FaTrash size={11} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      {modal.open && (
        <AdminModal title={modal.editing ? 'Editar fotógrafo' : 'Nuevo fotógrafo'} onClose={() => setModal({ open: false, editing: null })} accent={ACCENT}>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="relative w-20 h-20 rounded-full overflow-hidden bg-white/5 flex items-center justify-center text-white/20 shrink-0">{form.photo_url ? <img src={form.photo_url} alt="" className="w-full h-full object-cover" /> : <FaCamera />}</div>
              <label className={`${btnPrimary} cursor-pointer`} style={{ background: `${ACCENT}22`, color: ACCENT }}><FaUpload size={11} /> {uploading ? 'Subiendo…' : 'Subir foto'}<input ref={fileRef} type="file" accept="image/*" className="hidden" disabled={uploading} onChange={e => upload(e.target.files?.[0])} /></label>
              {form.photo_url && <button type="button" aria-label="Quitar foto" onClick={() => setForm({ ...form, photo_url: '' })} className={iconBtn}><FaTimes size={10} /></button>}
            </div>
            <Field label="Nombre"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={adminInput} /></Field>
            <Field label="Especialidad"><input value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} placeholder="Bodas y eventos" className={adminInput} /></Field>
            <Field label="Una línea sobre él o ella"><textarea rows={2} value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })} className={adminInput} /></Field>
            <Field label="Instagram (opcional)"><input value={form.instagram} onChange={e => setForm({ ...form, instagram: e.target.value })} placeholder="@usuario" className={adminInput} /></Field>
            <label className="flex items-center gap-2 text-sm text-white/70"><input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} /> Visible en mi perfil</label>
            <button type="button" disabled={saving || uploading} onClick={save} className={`${btnPrimary} w-full justify-center`} style={{ background: ACCENT, color: ON_ACCENT }}>{saving ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </AdminModal>
      )}
    </div>
  );
};

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const InsightsPanel: React.FC<{ showNotification: Props['showNotification'] }> = ({ showNotification }) => {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: d, error } = await supabase.rpc('get_photo_insights');
        if (!alive) return;
        if (error) { if (isMissingSql(error)) setMissing(true); else showNotification(error.message, 'error'); }
        else setData(d);
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <Spinner accent={ACCENT} />;
  if (missing) return <MissingSqlNotice file="setup_photo.sql" accent={ACCENT} />;
  if (!data?.ok) return <Empty emoji="🔒">El resumen del negocio es del plan ULTRA.</Empty>;

  const maxRev = Math.max(1, ...data.by_month.map((m: any) => Number(m.revenue)));
  const maxCount = Math.max(1, ...(data.top_packages || []).map((p: any) => Number(p.count)));
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Sesiones este mes" value={data.month_sessions} accent={ACCENT} />
        <Kpi label="Ingresos del mes" value={money(Number(data.month_revenue))} accent={ACCENT} tone="good" />
        <Kpi label="Por confirmar" value={data.pending_bookings} accent={ACCENT} tone={data.pending_bookings > 0 ? 'warn' : undefined} />
        <Kpi label="Anticipos por cobrar" value={money(Number(data.deposits_pending))} accent={ACCENT} tone={Number(data.deposits_pending) > 0 ? 'warn' : undefined} />
        <Kpi label="Próximas sesiones" value={data.upcoming} accent={ACCENT} />
        <Kpi label="Cotizaciones abiertas" value={data.open_quotes} accent={ACCENT} />
        <Kpi label="Galerías activas" value={data.active_galleries} accent={ACCENT} />
        <Kpi label="Selecciones por revisar" value={data.selections_waiting} accent={ACCENT} tone={data.selections_waiting > 0 ? 'warn' : undefined} />
      </div>

      <section className="rounded-2xl border border-white/10 p-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-white/45 mb-3">Ingresos por mes (últimos 6)</p>
        <div className="flex items-end gap-2 h-32">
          {data.by_month.map((m: any) => (
            <div key={m.month} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
              <span className="text-[10px] text-white/50">{Number(m.revenue) > 0 ? money(Number(m.revenue)) : ''}</span>
              <div className="w-full rounded-t" style={{ height: `${Math.max(3, (Number(m.revenue) / maxRev) * 100)}%`, background: ACCENT, opacity: Number(m.revenue) > 0 ? 1 : 0.25 }} />
              <span className="text-[10px] text-white/45 uppercase">{MONTHS[Number(m.month.slice(5, 7)) - 1]}</span>
              <span className="text-[9px] text-white/30">{m.sessions} ses.</span>
            </div>
          ))}
        </div>
      </section>

      <div className="grid sm:grid-cols-2 gap-4">
        <section className="rounded-2xl border border-white/10 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/45 mb-3">Paquetes más reservados (6 meses)</p>
          {(data.top_packages || []).length === 0 ? <p className="text-[12px] text-white/35">Aún no hay reservas.</p> : (
            <ul className="space-y-2.5">
              {data.top_packages.map((p: any) => (
                <li key={p.name}>
                  <div className="flex justify-between text-[12px] text-white/75"><span className="truncate pr-2">{p.name}</span><span className="shrink-0">{p.count} · {money(Number(p.revenue))}</span></div>
                  <div className="h-1.5 rounded-full bg-white/10 mt-1"><div className="h-full rounded-full" style={{ width: `${(Number(p.count) / maxCount) * 100}%`, background: ACCENT }} /></div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-2xl border border-white/10 p-4 space-y-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/45 mb-2">Qué te piden cotizar</p>
            {(data.demand || []).length === 0 ? <p className="text-[12px] text-white/35">Sin solicitudes todavía.</p> : (
              <ul className="space-y-1">{data.demand.map((d: any) => <li key={d.type} className="flex justify-between text-[12px] text-white/75"><span className="capitalize">{d.type}</span><b className="text-white">{d.count}</b></li>)}</ul>
            )}
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/45 mb-2">Reservas por tipo</p>
            {(data.by_kind || []).length === 0 ? <p className="text-[12px] text-white/35">Sin reservas todavía.</p> : (
              <ul className="space-y-1">{data.by_kind.map((d: any) => <li key={d.kind} className="flex justify-between text-[12px] text-white/75"><span>{KIND_LABEL[d.kind as keyof typeof KIND_LABEL] || d.kind}</span><b className="text-white">{d.count}</b></li>)}</ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default PhotoStudioTab;
