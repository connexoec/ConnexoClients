import React, { useMemo, useState } from 'react';
import { supabase } from '../../src/lib/supabase';
import type { BookReader, BookGiftCard } from '../../types';
import { FaUsers, FaCrown, FaPlus, FaPen, FaTrash, FaWhatsapp, FaGift, FaBan, FaCheck } from 'react-icons/fa';
import { useOwnerTable, AdminModal, Field, adminInput, Spinner, MissingSqlNotice, Kpi, PlanLock, ping, waLink, money, isMissingSql } from '../AdminKit';
import { ACCENT, ON_ACCENT, TITLE_FONT, btnPrimary, iconBtn, dangerBtn, TabHeader, Empty, SearchBox, Pills, ago, randomCode } from '../books/BooksAdminUi';

interface Props {
  user: any;
  showNotification: (message: string, type: 'success' | 'error') => void;
  plan: 'conecta' | 'pro' | 'ultra';
}

type View = 'lectores' | 'regalos';
const DISCOUNTS = [0, 5, 10, 15, 20, 25, 30];

/** Inserta con un código nuevo y reintenta si choca con el índice único (alta manual). */
const insertWithCode = async (table: string, prefix: string, len: number, column: string, row: Record<string, any>) => {
  let last: any = null;
  for (let i = 0; i < 6; i++) {
    const { error } = await supabase.from(table).insert({ ...row, [column]: randomCode(prefix, len) });
    if (!error) return null;
    last = error;
    if (error.code !== '23505') break;
  }
  return last;
};

export const BooksReadersTab: React.FC<Props> = ({ user, showNotification, plan }) => {
  const isUltra = plan === 'ultra';
  const [view, setView] = useState<View>('lectores');
  const readersT = useOwnerTable<BookReader>({ table: 'books_readers', ownerColumn: 'shop_profile_id', ownerId: user?.id, realtime: true, pollMs: 20000, order: [{ column: 'created_at', ascending: false }], onNew: () => ping() });
  const [query, setQuery] = useState('');
  const [onlyVip, setOnlyVip] = useState(false);
  const [modal, setModal] = useState<{ open: boolean; editing: BookReader | null }>({ open: false, editing: null });

  const readers = readersT.rows;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return readers.filter(r => (!onlyVip || r.is_vip) && (!q || [r.name, r.email, r.phone, r.member_code, r.interests].some(v => String(v || '').toLowerCase().includes(q))));
  }, [readers, query, onlyVip]);

  const patch = async (r: BookReader, change: Partial<BookReader>) => {
    readersT.setRows(rs => rs.map(x => (x.id === r.id ? { ...x, ...change } : x)));
    const { error } = await supabase.from('books_readers').update(change).eq('id', r.id);
    if (error) { showNotification(error.message, 'error'); readersT.reload(); }
  };
  const remove = async (r: BookReader) => {
    if (!window.confirm(`¿Eliminar a ${r.name || r.member_code} del club? Sus pedidos se conservan.`)) return;
    const { error } = await supabase.from('books_readers').delete().eq('id', r.id);
    if (error) return showNotification(error.message, 'error');
    readersT.setRows(rs => rs.filter(x => x.id !== r.id));
  };

  if (readersT.loading) return <Spinner accent={ACCENT} />;

  return (
    <div className="animate-fade-in-up space-y-6 max-w-4xl mx-auto px-4 md:px-6 pb-32" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      <TabHeader icon={<FaUsers />} title="Lectores" subtitle="Tu club: descuentos, VIP y beneficios para que vuelvan. Y las tarjetas de regalo."
        action={view === 'lectores' ? <button onClick={() => setModal({ open: true, editing: null })} className={btnPrimary} style={{ background: ACCENT, color: ON_ACCENT }}><FaPlus /> Agregar lector</button> : undefined} />
      <Pills<View> value={view} onChange={setView} items={[['lectores', `Club de lectores (${readers.length})`], ['regalos', `Tarjetas de regalo${isUltra ? '' : ' 🔒'}`]]} />
      {readersT.missingSql && <MissingSqlNotice file="setup_books.sql" accent={ACCENT} />}

      {view === 'lectores' && !readersT.missingSql && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Lectores" value={readers.length} accent={ACCENT} />
            <Kpi label="VIP" value={readers.filter(r => r.is_vip).length} accent={ACCENT} />
            <Kpi label="Compras" value={readers.reduce((a, r) => a + r.orders_count, 0)} accent={ACCENT} />
            <Kpi label="Gastado en libros" value={money(readers.reduce((a, r) => a + r.total_spent, 0))} accent={ACCENT} tone="good" />
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <SearchBox value={query} onChange={setQuery} placeholder="Buscar por nombre, código, teléfono o gustos" />
            <button type="button" onClick={() => setOnlyVip(v => !v)} aria-pressed={onlyVip} className="px-4 rounded-xl text-xs font-bold uppercase border transition" style={onlyVip ? { background: ACCENT, color: ON_ACCENT, borderColor: ACCENT } : { borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}><FaCrown className="inline mr-1.5" size={10} />Solo VIP</button>
          </div>
          {shown.length === 0 ? (
            <Empty emoji="📖">{readers.length === 0 ? 'Aún no hay lectores. Se registran solos al unirse al club o al hacer su primer pedido.' : 'Ningún lector coincide.'}</Empty>
          ) : (
            <div className="space-y-2.5">
              {shown.map(r => (
                <div key={r.id} className="rounded-xl border px-4 py-3 flex flex-wrap items-center gap-3" style={{ background: 'rgba(255,255,255,0.03)', borderColor: r.is_vip ? `${ACCENT}66` : 'rgba(255,255,255,0.08)' }}>
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="text-white font-bold truncate flex items-center gap-2" style={{ fontFamily: TITLE_FONT }}>{r.name || 'Sin nombre'} {r.is_vip && <FaCrown size={11} style={{ color: ACCENT }} />}</p>
                    <p className="text-[11px] text-white/45 truncate"><span className="font-mono font-bold" style={{ color: ACCENT }}>{r.member_code}</span> · {[r.phone, r.email].filter(Boolean).join(' · ') || 'Sin contacto'} · {ago(r.created_at)}</p>
                    {r.interests && <p className="text-[11px] text-white/55 italic truncate">Le gusta: {r.interests}</p>}
                    <p className="text-[11px] text-white/45">{r.orders_count} compra{r.orders_count === 1 ? '' : 's'} · {money(r.total_spent)}</p>
                  </div>
                  <select aria-label="Descuento" value={r.discount_percent} onChange={e => patch(r, { discount_percent: Number(e.target.value) })} className="bg-black/40 border border-white/10 rounded-lg px-2 py-2 text-xs text-white">
                    {DISCOUNTS.concat(DISCOUNTS.includes(r.discount_percent) ? [] : [r.discount_percent]).sort((a, b) => a - b).map(d => <option key={d} value={d}>{d === 0 ? 'Sin descuento' : `${d}% dto.`}</option>)}
                  </select>
                  <button type="button" aria-label={r.is_vip ? 'Quitar VIP' : 'Hacer VIP'} aria-pressed={r.is_vip} onClick={() => patch(r, { is_vip: !r.is_vip })} className={iconBtn}><FaCrown style={{ color: r.is_vip ? ACCENT : undefined }} /></button>
                  {r.phone && <a href={waLink(r.phone, `Hola ${(r.name || '').split(' ')[0]}, `)} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className={iconBtn}><FaWhatsapp size={13} style={{ color: '#25D366' }} /></a>}
                  <button type="button" aria-label="Editar" onClick={() => setModal({ open: true, editing: r })} className={iconBtn}><FaPen size={11} /></button>
                  <button type="button" aria-label="Eliminar" onClick={() => remove(r)} className={dangerBtn}><FaTrash size={11} /></button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {view === 'regalos' && (isUltra
        ? <GiftCardsPanel userId={user.id} showNotification={showNotification} />
        : <PlanLock plan="ULTRA" what="Tarjetas de regalo: tus clientes las piden en línea y tú las canjeas en caja" accent={ACCENT} />)}

      {modal.open && (
        <ReaderModal userId={user.id} editing={modal.editing} showNotification={showNotification}
          onClose={() => setModal({ open: false, editing: null })} onSaved={() => { setModal({ open: false, editing: null }); readersT.reload(); }} />
      )}
    </div>
  );
};

/* ── Lector ────────────────────────────────────────────────────────────────── */
const ReaderModal: React.FC<{ userId: string; editing: BookReader | null; showNotification: Props['showNotification']; onClose: () => void; onSaved: () => void }> = ({ userId, editing, showNotification, onClose, onSaved }) => {
  const [f, setF] = useState({
    name: editing?.name || '', email: editing?.email || '', phone: editing?.phone || '', interests: editing?.interests || '',
    benefits: editing?.benefits || '', notes: editing?.notes || '', discount_percent: String(editing?.discount_percent ?? 0), is_vip: editing?.is_vip ?? false,
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f, v: any) => setF(p => ({ ...p, [k]: v }));
  const save = async () => {
    if (!f.name.trim()) return showNotification('Escribe el nombre del lector.', 'error');
    if (!f.email.trim() && !f.phone.trim()) return showNotification('Agrega un teléfono o un email.', 'error');
    const disc = Math.min(Math.max(Number(f.discount_percent) || 0, 0), 100);
    const row = {
      shop_profile_id: userId, name: f.name.trim(), email: f.email.trim().toLowerCase() || null, phone: f.phone.trim() || null,
      interests: f.interests.trim() || null, benefits: f.benefits.trim() || null, notes: f.notes.trim() || null, discount_percent: disc, is_vip: f.is_vip,
    };
    setSaving(true);
    let error: any;
    if (editing) ({ error } = await supabase.from('books_readers').update(row).eq('id', editing.id));
    else error = await insertWithCode('books_readers', 'L-', 4, 'member_code', { ...row, source: 'manual' });
    setSaving(false);
    if (error) return showNotification(isMissingSql(error) ? 'Falta ejecutar setup_books.sql en Supabase.' : `No se pudo guardar: ${error.message}`, 'error');
    showNotification(editing ? 'Lector actualizado.' : 'Lector agregado.', 'success');
    onSaved();
  };
  return (
    <AdminModal title={editing ? `Lector ${editing.member_code}` : 'Nuevo lector'} accent={ACCENT} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Nombre *"><input className={adminInput} value={f.name} onChange={e => set('name', e.target.value)} /></Field>
          <Field label="Teléfono"><input className={adminInput} value={f.phone} onChange={e => set('phone', e.target.value)} /></Field>
          <Field label="Email" className="sm:col-span-2"><input className={adminInput} type="email" value={f.email} onChange={e => set('email', e.target.value)} /></Field>
          <Field label="Descuento (%)"><input className={adminInput} inputMode="numeric" value={f.discount_percent} onChange={e => set('discount_percent', e.target.value.replace(/[^0-9]/g, ''))} /></Field>
          <label className="flex items-center gap-2 text-sm text-white/70 pb-2.5 self-end"><input type="checkbox" checked={f.is_vip} onChange={e => set('is_vip', e.target.checked)} /> Lector VIP</label>
        </div>
        <Field label="¿Qué le gusta leer?"><input className={adminInput} value={f.interests} onChange={e => set('interests', e.target.value)} placeholder="Novela negra, historia, infantil…" /></Field>
        <Field label="Beneficios (los ve en su carnet)"><textarea className={adminInput} rows={2} value={f.benefits} onChange={e => set('benefits', e.target.value)} placeholder="Envío gratis, preventa anticipada…" /></Field>
        <Field label="Notas internas"><textarea className={adminInput} rows={2} value={f.notes} onChange={e => set('notes', e.target.value)} /></Field>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl text-xs font-bold uppercase border border-white/10 text-white/60 hover:text-white">Cancelar</button>
          <button onClick={save} disabled={saving} className="flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-wider disabled:opacity-50" style={{ background: ACCENT, color: ON_ACCENT }}>{saving ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </div>
    </AdminModal>
  );
};

/* ── Tarjetas de regalo (ULTRA) ───────────────────────────────────────────── */
const GC_STATUS: Record<BookGiftCard['status'], { label: string; color: string }> = {
  pendiente: { label: 'Por activar', color: '#fbbf24' }, activa: { label: 'Activa', color: '#34d399' },
  agotada: { label: 'Agotada', color: '#94a3b8' }, anulada: { label: 'Anulada', color: '#f87171' },
};

const GiftCardsPanel: React.FC<{ userId: string; showNotification: Props['showNotification'] }> = ({ userId, showNotification }) => {
  const t = useOwnerTable<BookGiftCard>({ table: 'books_giftcards', ownerColumn: 'shop_profile_id', ownerId: userId, realtime: true, pollMs: 20000, order: [{ column: 'created_at', ascending: false }], onNew: () => ping() });
  const [redeem, setRedeem] = useState<BookGiftCard | null>(null);
  const [issue, setIssue] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const cards = t.rows;

  const activate = async (g: BookGiftCard) => {
    const { data, error } = await supabase.rpc('books_activate_giftcard', { p_id: g.id });
    if (error || !data?.ok) return showNotification(error?.message || 'No se pudo activar.', 'error');
    showNotification(`Tarjeta ${g.code} activada.`, 'success'); t.reload();
  };
  const annul = async (g: BookGiftCard) => {
    if (!window.confirm(`¿Anular la tarjeta ${g.code}? Perderá su saldo de ${money(g.balance)}.`)) return;
    const { error } = await supabase.from('books_giftcards').update({ status: 'anulada' }).eq('id', g.id);
    if (error) return showNotification(error.message, 'error');
    t.reload();
  };

  if (t.loading) return <Spinner accent={ACCENT} />;
  if (t.missingSql) return <MissingSqlNotice file="setup_books.sql" accent={ACCENT} />;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-white/45 max-w-xl">Tus clientes piden la tarjeta en tu perfil; tú la activas cuando recibes el pago y la canjeas (total o parcial) en caja o al entregar un pedido.</p>
        <button onClick={() => setIssue(true)} className={`${btnPrimary} shrink-0`} style={{ background: ACCENT, color: ON_ACCENT }}><FaPlus /> Emitir tarjeta</button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Por activar" value={cards.filter(c => c.status === 'pendiente').length} accent={ACCENT} tone={cards.some(c => c.status === 'pendiente') ? 'warn' : undefined} />
        <Kpi label="Activas" value={cards.filter(c => c.status === 'activa').length} accent={ACCENT} />
        <Kpi label="Saldo en circulación" value={money(cards.filter(c => c.status === 'activa').reduce((a, c) => a + c.balance, 0))} accent={ACCENT} />
      </div>
      {cards.length === 0 ? <Empty emoji="🎁">Aún no hay tarjetas de regalo.</Empty> : (
        <div className="space-y-2.5">
          {cards.map(g => (
            <div key={g.id} className="rounded-xl border px-4 py-3 space-y-2" style={{ background: 'rgba(255,255,255,0.03)', borderColor: g.status === 'pendiente' ? `${ACCENT}66` : 'rgba(255,255,255,0.08)' }}>
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1 basis-48">
                  <p className="flex items-center gap-2"><span className="font-mono font-black text-white tracking-widest">{g.code}</span>
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md" style={{ background: `${GC_STATUS[g.status].color}22`, color: GC_STATUS[g.status].color }}>{GC_STATUS[g.status].label}</span></p>
                  <p className="text-[11px] text-white/45 truncate">{g.buyer_name ? `De ${g.buyer_name}` : 'Emitida en tienda'}{g.recipient_name ? ` para ${g.recipient_name}` : ''} · {ago(g.created_at)}</p>
                </div>
                <p className="text-lg font-bold text-white" style={{ fontFamily: TITLE_FONT }}>{money(g.balance)} <span className="text-xs font-normal text-white/40">/ {money(g.amount)}</span></p>
                {g.status === 'pendiente' && <button type="button" onClick={() => activate(g)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black uppercase" style={{ background: ACCENT, color: ON_ACCENT }}><FaCheck size={10} /> Activar</button>}
                {g.status === 'activa' && <button type="button" onClick={() => setRedeem(g)} className="px-3 py-2 rounded-xl text-[11px] font-black uppercase" style={{ background: ACCENT, color: ON_ACCENT }}>Canjear</button>}
                {g.buyer_phone && <a href={waLink(g.buyer_phone, `Hola ${(g.buyer_name || '').split(' ')[0]}, sobre tu tarjeta de regalo ${g.code}: `)} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className={iconBtn}><FaWhatsapp size={13} style={{ color: '#25D366' }} /></a>}
                {(g.status === 'pendiente' || g.status === 'activa') && <button type="button" onClick={() => annul(g)} aria-label="Anular tarjeta" title="Anular" className={dangerBtn}><FaBan size={11} /></button>}
              </div>
              {g.message && <p className="text-[12px] italic text-white/55">“{g.message}”</p>}
              {g.uses?.length > 0 && (
                <button type="button" onClick={() => setOpen(open === g.id ? null : g.id)} className="text-[11px] underline underline-offset-2 text-white/50 hover:text-white">{open === g.id ? 'Ocultar canjes' : `Ver ${g.uses.length} canje${g.uses.length === 1 ? '' : 's'}`}</button>
              )}
              {open === g.id && <ul className="text-[11px] text-white/60 space-y-1">{g.uses.map((u, i) => <li key={i}>{new Date(u.at).toLocaleString('es-EC')} · − {money(u.amount)}{u.note ? ` · ${u.note}` : ''}</li>)}</ul>}
            </div>
          ))}
        </div>
      )}
      {redeem && <RedeemModal card={redeem} showNotification={showNotification} onClose={() => setRedeem(null)} onDone={() => { setRedeem(null); t.reload(); }} />}
      {issue && <IssueModal userId={userId} showNotification={showNotification} onClose={() => setIssue(false)} onDone={() => { setIssue(false); t.reload(); }} />}
    </div>
  );
};

const RedeemModal: React.FC<{ card: BookGiftCard; showNotification: Props['showNotification']; onClose: () => void; onDone: () => void }> = ({ card, showNotification, onClose, onDone }) => {
  const [amount, setAmount] = useState(String(card.balance)); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false);
  const go = async () => {
    const v = Number(amount.replace(',', '.'));
    if (!isFinite(v) || v <= 0) return showNotification('Escribe un monto válido.', 'error');
    setBusy(true);
    const { data, error } = await supabase.rpc('books_redeem_giftcard', { p_code: card.code, p_amount: v, p_note: note.trim() || null });
    setBusy(false);
    if (error) return showNotification(error.message, 'error');
    if (!data?.ok) return showNotification(data?.error === 'insufficient' ? `Saldo insuficiente (${money(data.balance)}).` : 'No se pudo canjear.', 'error');
    showNotification(`Canjeado ${money(v)}. Saldo: ${money(data.balance)}.`, 'success');
    onDone();
  };
  return (
    <AdminModal title={`Canjear ${card.code}`} accent={ACCENT} onClose={onClose}>
      <p className="text-sm text-white/60">Saldo disponible: <b className="text-white">{money(card.balance)}</b></p>
      <Field label="Monto a canjear"><input className={adminInput} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></Field>
      <Field label="Nota (opcional)"><input className={adminInput} value={note} onChange={e => setNote(e.target.value)} placeholder="Compra en caja, pedido ABC123…" /></Field>
      <button onClick={go} disabled={busy} className="w-full py-3 rounded-xl text-xs font-black uppercase tracking-wider disabled:opacity-50" style={{ background: ACCENT, color: ON_ACCENT }}>{busy ? 'Canjeando…' : 'Confirmar canje'}</button>
    </AdminModal>
  );
};

const IssueModal: React.FC<{ userId: string; showNotification: Props['showNotification']; onClose: () => void; onDone: () => void }> = ({ userId, showNotification, onClose, onDone }) => {
  const [amount, setAmount] = useState('30'); const [buyer, setBuyer] = useState(''); const [phone, setPhone] = useState(''); const [to, setTo] = useState(''); const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    const v = Number(amount.replace(',', '.'));
    if (!isFinite(v) || v < 1 || v > 5000) return showNotification('El monto debe estar entre $1 y $5000.', 'error');
    setBusy(true);
    const error = await insertWithCode('books_giftcards', 'G-', 6, 'code', {
      shop_profile_id: userId, amount: v, balance: v, status: 'activa', buyer_name: buyer.trim() || null, buyer_phone: phone.trim() || null,
      recipient_name: to.trim() || null, message: msg.trim() || null,
    });
    setBusy(false);
    if (error) return showNotification(isMissingSql(error) ? 'Falta ejecutar setup_books.sql.' : error.message, 'error');
    showNotification('Tarjeta emitida y activa.', 'success'); onDone();
  };
  return (
    <AdminModal title="Emitir tarjeta de regalo" accent={ACCENT} onClose={onClose}>
      <p className="text-sm text-white/55 flex items-center gap-2"><FaGift style={{ color: ACCENT }} /> Para tarjetas vendidas en la tienda: nace activa, lista para canjear.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Monto ($) *"><input className={adminInput} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></Field>
        <Field label="Comprador"><input className={adminInput} value={buyer} onChange={e => setBuyer(e.target.value)} /></Field>
        <Field label="Teléfono"><input className={adminInput} value={phone} onChange={e => setPhone(e.target.value)} /></Field>
        <Field label="Para"><input className={adminInput} value={to} onChange={e => setTo(e.target.value)} /></Field>
      </div>
      <Field label="Mensaje"><textarea className={adminInput} rows={2} value={msg} onChange={e => setMsg(e.target.value)} /></Field>
      <button onClick={go} disabled={busy} className="w-full py-3 rounded-xl text-xs font-black uppercase tracking-wider disabled:opacity-50" style={{ background: ACCENT, color: ON_ACCENT }}>{busy ? 'Emitiendo…' : 'Emitir tarjeta'}</button>
    </AdminModal>
  );
};

export default BooksReadersTab;
