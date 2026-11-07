import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../src/lib/supabase';
import type { BookRequest, BookRequestStatus, BookTitle, BookWaitlistEntry } from '../../types';
import { FaFeatherAlt, FaWhatsapp, FaTrash, FaBell, FaCheck } from 'react-icons/fa';
import { useOwnerTable, Field, adminInput, Spinner, MissingSqlNotice, Kpi, ping, waLink, money } from '../AdminKit';
import { ACCENT, ON_ACCENT, TITLE_FONT, TabHeader, Empty, Pills, iconBtn, dangerBtn, ago } from '../books/BooksAdminUi';
import { REQUEST_STATUS_LABEL } from '../../src/lib/booksCommon';

interface Props {
  user: any;
  showNotification: (message: string, type: 'success' | 'error') => void;
}

type View = 'encargos' | 'espera';
type Filter = 'abiertos' | 'cerrados' | 'todos';
const OPEN: BookRequestStatus[] = ['recibido', 'buscando', 'cotizado', 'conseguido'];
const COLOR: Record<BookRequestStatus, string> = {
  recibido: '#60a5fa', buscando: '#fbbf24', cotizado: '#a78bfa', conseguido: '#34d399', entregado: '#94a3b8', no_disponible: '#f87171', cancelado: '#f87171',
};

const reqText = (r: BookRequest) => {
  const n = r.customer_name.split(' ')[0];
  if (r.status === 'cotizado' && r.quoted_price != null) return `Hola ${n}, sobre tu encargo ${r.tracking_code} («${r.title_wanted}»): lo conseguimos en ${money(r.quoted_price)}${r.eta_text ? `, plazo ${r.eta_text}` : ''}. ¿Lo confirmamos?`;
  if (r.status === 'conseguido') return `Hola ${n}, ¡ya llegó «${r.title_wanted}»! Tu encargo ${r.tracking_code} está listo.`;
  if (r.status === 'no_disponible') return `Hola ${n}, lamentamos avisarte que «${r.title_wanted}» no está disponible por ahora (encargo ${r.tracking_code}).`;
  return `Hola ${n}, sobre tu encargo ${r.tracking_code} («${r.title_wanted}»): `;
};

export const BooksRequestsTab: React.FC<Props> = ({ user, showNotification }) => {
  const [view, setView] = useState<View>('encargos');
  const reqT = useOwnerTable<BookRequest>({ table: 'books_requests', ownerColumn: 'shop_profile_id', ownerId: user?.id, realtime: true, pollMs: 20000, order: [{ column: 'created_at', ascending: false }], onNew: () => ping() });
  const waitT = useOwnerTable<BookWaitlistEntry>({ table: 'books_waitlist', ownerColumn: 'shop_profile_id', ownerId: user?.id, realtime: true, pollMs: 30000, order: [{ column: 'created_at', ascending: false }] });
  const open = reqT.rows.filter(r => OPEN.includes(r.status)).length;
  const waiting = waitT.rows.filter(w => !w.notified).length;

  if (reqT.loading) return <Spinner accent={ACCENT} />;

  return (
    <div className="animate-fade-in-up space-y-6 max-w-4xl mx-auto px-4 md:px-6 pb-32" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      <TabHeader icon={<FaFeatherAlt />} title="Encargos" subtitle="Libros que te piden y no tienes, y lectores esperando que lleguen." />
      <Pills<View> value={view} onChange={setView} items={[['encargos', `Encargos (${open})`], ['espera', `Lista de espera (${waiting})`]]} />
      {reqT.missingSql && <MissingSqlNotice file="setup_books.sql" accent={ACCENT} />}
      {view === 'encargos' && !reqT.missingSql && <RequestsList t={reqT} showNotification={showNotification} />}
      {view === 'espera' && !reqT.missingSql && <WaitlistList userId={user.id} t={waitT} showNotification={showNotification} />}
    </div>
  );
};

/* ── Encargos ──────────────────────────────────────────────────────────────── */
const RequestsList: React.FC<{ t: ReturnType<typeof useOwnerTable<BookRequest>>; showNotification: Props['showNotification'] }> = ({ t, showNotification }) => {
  const [filter, setFilter] = useState<Filter>('abiertos');
  const shown = useMemo(() => t.rows.filter(r => filter === 'todos' || (filter === 'abiertos') === OPEN.includes(r.status)), [t.rows, filter]);
  const remove = async (r: BookRequest) => {
    if (!window.confirm(`¿Eliminar el encargo ${r.tracking_code}?`)) return;
    const { error } = await supabase.from('books_requests').delete().eq('id', r.id);
    if (error) return showNotification(error.message, 'error');
    t.setRows(rs => rs.filter(x => x.id !== r.id));
  };
  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Por buscar" value={t.rows.filter(r => r.status === 'recibido' || r.status === 'buscando').length} accent={ACCENT} tone="warn" />
        <Kpi label="Cotizados" value={t.rows.filter(r => r.status === 'cotizado').length} accent={ACCENT} />
        <Kpi label="Conseguidos" value={t.rows.filter(r => r.status === 'conseguido').length} accent={ACCENT} tone="good" />
      </div>
      <Pills<Filter> value={filter} onChange={setFilter} items={[['abiertos', 'Abiertos'], ['cerrados', 'Cerrados'], ['todos', 'Todos']]} />
      {shown.length === 0 ? <Empty emoji="🔎">{t.rows.length === 0 ? 'Cuando un lector encargue un libro desde tu perfil aparecerá aquí con una alerta.' : 'Nada por aquí con ese filtro.'}</Empty> : (
        <div className="space-y-3">{shown.map(r => <RequestCard key={r.id} r={r} onRemove={() => remove(r)} showNotification={showNotification} onSaved={t.reload} />)}</div>
      )}
    </>
  );
};

const RequestCard: React.FC<{ r: BookRequest; onRemove: () => void; onSaved: () => void; showNotification: Props['showNotification'] }> = ({ r, onRemove, onSaved, showNotification }) => {
  const [status, setStatus] = useState<BookRequestStatus>(r.status);
  const [price, setPrice] = useState(r.quoted_price != null ? String(r.quoted_price) : '');
  const [eta, setEta] = useState(r.eta_text || ''); const [note, setNote] = useState(r.admin_note || '');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setStatus(r.status); setPrice(r.quoted_price != null ? String(r.quoted_price) : ''); setEta(r.eta_text || ''); setNote(r.admin_note || ''); }, [r.status, r.quoted_price, r.eta_text, r.admin_note]);
  const dirty = status !== r.status || price !== (r.quoted_price != null ? String(r.quoted_price) : '') || eta !== (r.eta_text || '') || note !== (r.admin_note || '');
  const save = async () => {
    const p = price.trim() === '' ? null : Number(price.replace(',', '.'));
    if (p !== null && (!isFinite(p) || p < 0)) return showNotification('El precio cotizado no es válido.', 'error');
    setSaving(true);
    const { error } = await supabase.from('books_requests').update({ status, quoted_price: p, eta_text: eta.trim() || null, admin_note: note.trim() || null }).eq('id', r.id);
    setSaving(false);
    if (error) return showNotification(error.message, 'error');
    showNotification('Encargo actualizado.', 'success'); onSaved();
  };
  const preview: BookRequest = { ...r, status, quoted_price: price.trim() === '' ? null : Number(price.replace(',', '.')), eta_text: eta || null };
  return (
    <div className="rounded-2xl border p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.03)', borderColor: r.status === 'recibido' ? `${ACCENT}66` : 'rgba(255,255,255,0.08)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 flex-wrap"><span className="font-mono font-black text-white tracking-widest">{r.tracking_code}</span>
            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md" style={{ background: `${COLOR[r.status]}22`, color: COLOR[r.status] }}>{REQUEST_STATUS_LABEL[r.status]}</span></p>
          <p className="text-white font-bold mt-1 text-lg leading-snug" style={{ fontFamily: TITLE_FONT }}>{r.title_wanted}{r.qty > 1 ? ` × ${r.qty}` : ''}</p>
          <p className="text-[12px] text-white/55">{[r.author, r.isbn].filter(Boolean).join(' · ')}</p>
        </div>
        <p className="text-[11px] text-white/40 shrink-0">{ago(r.created_at)}</p>
      </div>
      <p className="text-[12px] text-white/70">{r.customer_name} · {[r.customer_phone, r.customer_email].filter(Boolean).join(' · ')}{r.member_code ? ` · Lector ${r.member_code}` : ''}</p>
      {r.notes && <p className="text-[12px] italic text-white/55">“{r.notes}”</p>}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Field label="Estado"><select className={adminInput} value={status} onChange={e => setStatus(e.target.value as BookRequestStatus)}>{(Object.keys(REQUEST_STATUS_LABEL) as BookRequestStatus[]).map(s => <option key={s} value={s}>{REQUEST_STATUS_LABEL[s]}</option>)}</select></Field>
        <Field label="Precio cotizado ($)"><input className={adminInput} inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} /></Field>
        <Field label="Plazo" className="col-span-2"><input className={adminInput} value={eta} onChange={e => setEta(e.target.value)} placeholder="10 a 15 días" /></Field>
      </div>
      <Field label="Mensaje para el cliente (lo ve al rastrear)"><input className={adminInput} value={note} onChange={e => setNote(e.target.value)} /></Field>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={save} disabled={!dirty || saving} className="px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider disabled:opacity-30" style={{ background: ACCENT, color: ON_ACCENT }}>{saving ? 'Guardando…' : 'Guardar'}</button>
        {r.customer_phone && <a href={waLink(r.customer_phone, reqText(preview))} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp al cliente" className={iconBtn}><FaWhatsapp size={13} style={{ color: '#25D366' }} /></a>}
        <button type="button" onClick={onRemove} aria-label="Eliminar encargo" className={`${dangerBtn} ml-auto`}><FaTrash size={11} /></button>
      </div>
    </div>
  );
};

/* ── Lista de espera ──────────────────────────────────────────────────────── */
const WaitlistList: React.FC<{ userId: string; t: ReturnType<typeof useOwnerTable<BookWaitlistEntry>>; showNotification: Props['showNotification'] }> = ({ userId, t, showNotification }) => {
  const [titles, setTitles] = useState<Map<string, Pick<BookTitle, 'id' | 'title' | 'author' | 'stock' | 'cover_url'>>>(new Map());
  const [openId, setOpenId] = useState<string | null>(null);
  const ids = useMemo(() => Array.from(new Set(t.rows.map(w => w.title_id))).sort().join(','), [t.rows]);

  useEffect(() => {
    if (!ids) { setTitles(new Map()); return; }
    let alive = true;
    (async () => {
      const { data } = await supabase.from('books_titles').select('id,title,author,stock,cover_url').eq('shop_profile_id', userId).in('id', ids.split(','));
      if (alive) setTitles(new Map(((data ?? []) as any[]).map(x => [x.id, x])));
    })();
    return () => { alive = false; };
  }, [ids, userId]);

  const groups = useMemo(() => {
    const m = new Map<string, BookWaitlistEntry[]>();
    t.rows.forEach(w => { const a = m.get(w.title_id) || []; a.push(w); m.set(w.title_id, a); });
    return Array.from(m.entries()).map(([id, list]) => ({ id, list, pending: list.filter(w => !w.notified), title: titles.get(id) }))
      .filter(g => g.pending.length > 0 || openId === g.id)
      .sort((a, b) => Number((b.title?.stock || 0) > 0) - Number((a.title?.stock || 0) > 0) || b.pending.length - a.pending.length);
  }, [t.rows, titles, openId]);

  const mark = async (ids2: string[], notified: boolean) => {
    const { error } = await supabase.from('books_waitlist').update({ notified, notified_at: notified ? new Date().toISOString() : null }).in('id', ids2);
    if (error) return showNotification(error.message, 'error');
    t.reload();
  };

  return groups.length === 0 ? (
    <Empty emoji="🔔">Nadie espera ningún libro. Cuando un título se agote, tus lectores podrán dejar su contacto para que les avises al reponerlo.</Empty>
  ) : (
    <div className="space-y-3">
      {groups.map(g => {
        const restocked = (g.title?.stock ?? 0) > 0;
        return (
          <div key={g.id} className="rounded-2xl border overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', borderColor: restocked && g.pending.length ? `${ACCENT}88` : 'rgba(255,255,255,0.08)' }}>
            <button type="button" onClick={() => setOpenId(openId === g.id ? null : g.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
              <div className="w-9 h-[54px] rounded overflow-hidden bg-white/5 shrink-0">{g.title?.cover_url && <img src={g.title.cover_url} alt="" className="w-full h-full object-cover" />}</div>
              <div className="min-w-0 flex-1">
                <p className="text-white font-bold truncate" style={{ fontFamily: TITLE_FONT }}>{g.title?.title || 'Libro eliminado'}</p>
                <p className="text-[11px] text-white/45 truncate">{g.title?.author || ''}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-black" style={{ color: ACCENT }}>{g.pending.length} esperando</p>
                <p className="text-[10px] font-bold uppercase" style={{ color: restocked ? '#34d399' : '#f87171' }}>{restocked ? `¡Ya hay stock (${g.title?.stock})!` : 'Sigue agotado'}</p>
              </div>
            </button>
            {openId === g.id && (
              <div className="border-t border-white/8 px-4 py-3 space-y-2">
                {g.list.map(w => (
                  <div key={w.id} className="flex items-center gap-3 text-sm" style={{ opacity: w.notified ? 0.45 : 1 }}>
                    <div className="min-w-0 flex-1"><p className="text-white truncate">{w.customer_name || 'Sin nombre'}</p><p className="text-[11px] text-white/45 truncate">{[w.customer_phone, w.customer_email].filter(Boolean).join(' · ')} · {ago(w.created_at)}</p></div>
                    {w.customer_phone && <a href={waLink(w.customer_phone, `Hola${w.customer_name ? ` ${w.customer_name.split(' ')[0]}` : ''}, ¡ya llegó «${g.title?.title || 'el libro'}»! Te lo apartamos si quieres.`)} target="_blank" rel="noopener noreferrer" onClick={() => !w.notified && mark([w.id], true)} aria-label="Avisar por WhatsApp" className={iconBtn}><FaWhatsapp size={13} style={{ color: '#25D366' }} /></a>}
                    <button type="button" onClick={() => mark([w.id], !w.notified)} aria-label={w.notified ? 'Marcar como pendiente' : 'Marcar como avisado'} title={w.notified ? 'Avisado' : 'Marcar avisado'} className={iconBtn}>{w.notified ? <FaCheck size={11} style={{ color: '#34d399' }} /> : <FaBell size={11} />}</button>
                  </div>
                ))}
                {g.pending.length > 1 && <button type="button" onClick={() => mark(g.pending.map(w => w.id), true)} className="text-[11px] underline underline-offset-2 text-white/50 hover:text-white">Marcar a los {g.pending.length} como avisados</button>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default BooksRequestsTab;
