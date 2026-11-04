import React, { useMemo, useState } from 'react';
import { supabase } from '../../src/lib/supabase';
import type { HotelGuest } from '../../types';
import { FaCrown, FaUserPlus, FaTrash, FaWhatsapp, FaPhone, FaEnvelope, FaPercent, FaSave, FaBed, FaUsers, FaMoon, FaCoins, FaSearch } from 'react-icons/fa';
import { useOwnerTable, AdminModal, Field, adminInput, Spinner, MissingSqlNotice, Kpi, Pill, ping, waLink, money, isMissingSql } from '../AdminKit';

interface Props {
  user: any;
  showNotification: (message: string, type: 'success' | 'error') => void;
}

const ACCENT = '#d9958b';
const ON_ACCENT = '#1a0d10';
const TITLE_FONT = "'Merriweather', serif";
const CODE_CHARS = 'ABCDEFGHJKLMNPRSTUVWXYZ23456789';
const newCode = () => 'H-' + Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

export const HotelGuestsTab: React.FC<Props> = ({ user, showNotification }) => {
  const [alertMsg, setAlertMsg] = useState<string | null>(null);
  const guestsT = useOwnerTable<HotelGuest>({
    table: 'hotel_guests', ownerColumn: 'hotel_profile_id', ownerId: user?.id, pollMs: 15000,
    order: [{ column: 'created_at', ascending: false }],
    onNew: fresh => { ping(); setAlertMsg(`🎉 Nuevo huésped: ${fresh[0].name || fresh[0].phone || fresh[0].email || 'huésped'}${fresh[0].source === 'club' ? ' (Club)' : ''}`); setTimeout(() => setAlertMsg(null), 7000); },
  });
  const guests = guestsT.rows;
  const [filter, setFilter] = useState<'all' | 'vip' | 'recurrentes'>('all');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, { discount_percent: number; notes: string; benefits: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return guests.filter(g => {
      if (filter === 'vip' && !g.is_vip) return false;
      if (filter === 'recurrentes' && g.stays_count < 2) return false;
      return !q || `${g.name || ''} ${g.member_code} ${g.phone || ''} ${g.email || ''}`.toLowerCase().includes(q);
    }).sort((a, b) => Number(b.is_vip) - Number(a.is_vip));
  }, [guests, filter, query]);

  const draftOf = (g: HotelGuest) => drafts[g.id] ?? { discount_percent: g.discount_percent, notes: g.notes ?? '', benefits: g.benefits ?? '' };
  const setDraft = (g: HotelGuest, patch: Partial<{ discount_percent: number; notes: string; benefits: string }>) => setDrafts(p => ({ ...p, [g.id]: { ...draftOf(g), ...patch } }));
  const saveDraft = async (g: HotelGuest) => {
    const d = draftOf(g); setSavingId(g.id);
    const values = { discount_percent: Math.max(0, Math.min(100, Number(d.discount_percent) || 0)), notes: d.notes.trim() || null, benefits: d.benefits.trim() || null };
    const { error } = await supabase.from('hotel_guests').update(values).eq('id', g.id);
    setSavingId(null);
    if (error) return showNotification(error.message, 'error');
    guestsT.setRows(p => p.map(x => x.id === g.id ? { ...x, ...values } : x));
    setDrafts(p => { const n = { ...p }; delete n[g.id]; return n; });
  };
  const toggleVip = async (g: HotelGuest) => {
    const { error } = await supabase.from('hotel_guests').update({ is_vip: !g.is_vip }).eq('id', g.id);
    if (error) return showNotification(error.message, 'error');
    guestsT.setRows(p => p.map(x => x.id === g.id ? { ...x, is_vip: !g.is_vip } : x));
  };
  const remove = async (g: HotelGuest) => {
    if (!window.confirm(`¿Eliminar a ${g.name || 'este huésped'} del club?`)) return;
    const { error } = await supabase.from('hotel_guests').delete().eq('id', g.id);
    if (error) return showNotification(error.message, 'error');
    guestsT.setRows(p => p.filter(x => x.id !== g.id));
  };

  if (guestsT.loading) return <Spinner accent={ACCENT} />;

  const spent = guests.reduce((a, g) => a + Number(g.total_spent || 0), 0);

  return (
    <div className="animate-fade-in-up space-y-6 max-w-4xl mx-auto px-4 md:px-6 pb-32" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5" style={{ borderColor: `${ACCENT}26` }}>
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2" style={{ fontFamily: TITLE_FONT }}><FaCrown style={{ color: ACCENT }} /> Club de huéspedes</h2>
          <p className="text-sm text-white/40 mt-1">Cada reserva suma a tu base. Dales descuento y beneficios: lo aplican con su código al reservar.</p>
        </div>
        <button onClick={() => setAdding(true)} className="flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl" style={{ background: ACCENT, color: ON_ACCENT }}><FaUserPlus /> Agregar huésped</button>
      </div>

      {guestsT.missingSql && <MissingSqlNotice file="setup_hotel.sql" accent={ACCENT} />}
      {alertMsg && <div className="p-4 text-sm font-bold rounded-xl flex items-center justify-between" style={{ background: `${ACCENT}1a`, border: `1px solid ${ACCENT}4d`, color: ACCENT }}><span>{alertMsg}</span><button onClick={() => setAlertMsg(null)} className="opacity-60 hover:opacity-100">✕</button></div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Huéspedes" value={guests.length} icon={<FaUsers />} accent={ACCENT} />
        <Kpi label="VIP" value={guests.filter(g => g.is_vip).length} icon={<FaCrown />} accent={ACCENT} />
        <Kpi label="Recurrentes" value={guests.filter(g => g.stays_count >= 2).length} icon={<FaBed />} accent={ACCENT} />
        <Kpi label="Gastado en total" value={money(spent)} icon={<FaCoins />} accent={ACCENT} />
      </div>

      <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-3"><FaSearch className="text-white/30" size={12} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por nombre, código o contacto…" className="bg-transparent w-full py-2.5 text-sm text-white focus:outline-none placeholder-white/30" /></div>
      <div className="flex flex-wrap gap-2">
        {([['all', 'Todos'], ['vip', 'VIP'], ['recurrentes', 'Recurrentes']] as const).map(([f, l]) => <Pill key={f} active={filter === f} onClick={() => setFilter(f)} accent={ACCENT} onAccent={ON_ACCENT}>{l}</Pill>)}
      </div>

      {list.length === 0 ? (
        <div className="text-center py-16 text-white/30"><p className="text-4xl mb-3">🗝️</p><p className="text-sm">{guests.length === 0 ? 'Aún no hay huéspedes. Se registran solos al reservar o al unirse al club desde tu perfil.' : 'Ningún huésped coincide con el filtro.'}</p></div>
      ) : (
        <div className="space-y-3">
          {list.map(g => {
            const d = draftOf(g); const dirty = !!drafts[g.id];
            return (
              <div key={g.id} className="rounded-2xl border p-4" style={g.is_vip ? { background: `linear-gradient(135deg, ${ACCENT}14, transparent)`, borderColor: `${ACCENT}40` } : { background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-white font-bold truncate">{g.name || 'Huésped sin nombre'}</h3>
                      <span className="text-[10px] font-mono font-black tracking-widest rounded-md px-2 py-0.5" style={{ color: ACCENT, background: 'rgba(0,0,0,0.4)', border: `1px solid ${ACCENT}33` }}>{g.member_code}</span>
                      {g.is_vip && <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest rounded-full px-2 py-0.5" style={{ color: ACCENT, background: `${ACCENT}22`, border: `1px solid ${ACCENT}44` }}><FaCrown size={9} /> VIP</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-white/50">
                      {g.phone && <span className="flex items-center gap-1"><FaPhone size={9} /> {g.phone}</span>}
                      {g.email && <span className="flex items-center gap-1"><FaEnvelope size={9} /> {g.email}</span>}
                      <span className="flex items-center gap-1"><FaBed size={9} /> {g.stays_count} estancia{g.stays_count === 1 ? '' : 's'}</span>
                      <span className="flex items-center gap-1"><FaMoon size={9} /> {g.nights_total} noche{g.nights_total === 1 ? '' : 's'}</span>
                      {Number(g.total_spent) > 0 && <span>{money(Number(g.total_spent))}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {g.phone && <a href={waLink(g.phone, `Hola ${(g.name || '').split(' ')[0]}, gracias por ser parte de nuestro club. Tu código es ${g.member_code}${g.discount_percent > 0 ? ` y tienes ${g.discount_percent}% de descuento en tu próxima reserva` : ''}. ¡Te esperamos!`)} target="_blank" rel="noopener noreferrer" title="WhatsApp" className="w-8 h-8 rounded-lg bg-[#25D366]/10 border border-[#25D366]/20 text-[#25D366] flex items-center justify-center hover:bg-[#25D366]/20 transition"><FaWhatsapp size={13} /></a>}
                    <button title={g.is_vip ? 'Quitar VIP' : 'Marcar VIP'} onClick={() => toggleVip(g)} className="w-8 h-8 rounded-lg flex items-center justify-center border transition" style={g.is_vip ? { background: `${ACCENT}33`, borderColor: `${ACCENT}66`, color: ACCENT } : { background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}><FaCrown size={12} /></button>
                    <button title="Eliminar" onClick={() => remove(g)} className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center hover:bg-red-500/20 transition"><FaTrash size={11} /></button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr_auto] gap-2 mt-3 pt-3 border-t border-white/5 items-center">
                  <div className="flex items-center gap-2 bg-black/30 rounded-lg px-3 py-2 border border-white/5"><FaPercent size={10} style={{ color: ACCENT }} /><input type="number" min={0} max={100} value={d.discount_percent} onChange={e => setDraft(g, { discount_percent: Number(e.target.value) })} className="w-full bg-transparent text-white text-sm focus:outline-none" /><span className="text-[10px] text-white/40 uppercase">desc.</span></div>
                  <input value={d.notes} onChange={e => setDraft(g, { notes: e.target.value })} placeholder="Notas internas (preferencias, alergias, aniversarios…)" className="bg-black/30 border border-white/5 text-white text-sm rounded-lg px-3 py-2 focus:outline-none placeholder-gray-600" />
                  <button onClick={() => saveDraft(g)} disabled={!dirty || savingId === g.id} className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg disabled:opacity-30 text-xs font-black uppercase tracking-wider" style={{ background: ACCENT, color: ON_ACCENT }}><FaSave size={11} /> {savingId === g.id ? '…' : 'Guardar'}</button>
                </div>
                <input value={d.benefits} onChange={e => setDraft(g, { benefits: e.target.value })} placeholder="🎁 Beneficios que ve el huésped (ej. Late check-out gratis, bienvenida con vino)" className="w-full mt-2 text-white text-sm rounded-lg px-3 py-2 focus:outline-none placeholder-gray-500 border" style={{ background: `${ACCENT}0d`, borderColor: `${ACCENT}26` }} />
              </div>
            );
          })}
        </div>
      )}

      {adding && <AddModal userId={user.id} showNotification={showNotification} onClose={() => setAdding(false)} onDone={() => { setAdding(false); guestsT.reload(); }} />}
    </div>
  );
};

const AddModal: React.FC<{ userId: string; showNotification: Props['showNotification']; onClose: () => void; onDone: () => void }> = ({ userId, showNotification, onClose, onDone }) => {
  const [f, setF] = useState({ name: '', phone: '', email: '', country: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!f.name.trim() && !f.phone.trim() && !f.email.trim()) return showNotification('Indica al menos el nombre, el teléfono o el email.', 'error');
    setBusy(true);
    let lastErr: any = null;
    // El código es único por hotel: si choca (muy improbable), se reintenta con otro.
    for (let i = 0; i < 4; i++) {
      const { error } = await supabase.from('hotel_guests').insert({
        hotel_profile_id: userId, name: f.name.trim() || null, phone: f.phone.trim() || null, email: f.email.trim().toLowerCase() || null,
        country: f.country.trim() || null, notes: f.notes.trim() || null, member_code: newCode(), source: 'manual',
      });
      if (!error) { setBusy(false); return onDone(); }
      lastErr = error; if (error.code !== '23505') break;
    }
    setBusy(false);
    showNotification(isMissingSql(lastErr) ? 'Falta ejecutar setup_hotel.sql en Supabase.' : `No se pudo agregar: ${lastErr?.message}`, 'error');
  };
  return (
    <AdminModal title="Agregar huésped" accent={ACCENT} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Nombre"><input className={adminInput} value={f.name} onChange={e => setF(p => ({ ...p, name: e.target.value }))} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Teléfono"><input className={adminInput} value={f.phone} onChange={e => setF(p => ({ ...p, phone: e.target.value }))} /></Field>
          <Field label="Email"><input className={adminInput} value={f.email} onChange={e => setF(p => ({ ...p, email: e.target.value }))} /></Field>
        </div>
        <Field label="País / ciudad"><input className={adminInput} value={f.country} onChange={e => setF(p => ({ ...p, country: e.target.value }))} /></Field>
        <Field label="Notas"><input className={adminInput} value={f.notes} onChange={e => setF(p => ({ ...p, notes: e.target.value }))} /></Field>
        <button onClick={submit} disabled={busy} className="w-full py-3 rounded-xl text-sm font-black uppercase tracking-wider disabled:opacity-50" style={{ background: ACCENT, color: ON_ACCENT }}>{busy ? 'Guardando…' : 'Guardar huésped'}</button>
      </div>
    </AdminModal>
  );
};

export default HotelGuestsTab;
