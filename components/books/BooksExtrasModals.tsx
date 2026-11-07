import React, { useCallback, useEffect, useState } from 'react';
import {
  FaCheck, FaGift, FaCrown, FaTicketAlt, FaWhatsapp, FaMapMarkerAlt, FaClock, FaUserAlt,
} from 'react-icons/fa';
import { supabase } from '../../src/lib/supabase';
import {
  useKit, useInputStyle, inputCls, fmtMoney, prettyDate, waDigits, ModalShell, FieldLabel, PrimaryButton, GhostButton,
  CodeBox, TrackerSteps,
} from '../PublicKit';
import { PaymentOptions } from '../PaymentOptions';
import { BookCover, QtyStepper, errMsg, ERRORS } from './BooksUi';
import type { ShopCtx } from './BooksCommerceModals';
import {
  ORDER_STEPS, ORDER_STATUS_LABEL, readyLabel, REQUEST_STEPS, REQUEST_STATUS_LABEL, EVENT_KIND_LABEL,
} from '../../src/lib/booksCommon';

const PAY_LABEL: Record<string, string> = { pendiente: 'Pago pendiente', pagado: 'Pagado', gratis: 'Gratis' };
const RSVP_LABEL: Record<string, string> = { confirmada: 'Reserva confirmada', asistio: 'Asististe', cancelada: 'Cancelada', no_show: 'No asististe' };

/* ── Rastreador universal: pedido, encargo, reserva de evento o tarjeta ───── */
const RPC_BY_PREFIX = (code: string): [string, string][] => {
  const all: [string, string][] = [
    ['get_books_order_status', 'order'], ['get_books_request_status', 'request'],
    ['get_books_rsvp_status', 'rsvp'], ['get_books_giftcard', 'giftcard'],
  ];
  const c = code.trim().toUpperCase();
  const first = c.startsWith('E-') ? 'request' : c.startsWith('R-') ? 'rsvp' : c.startsWith('G-') ? 'giftcard' : 'order';
  return [...all.filter(([, kind]) => kind === first), ...all.filter(([, kind]) => kind !== first)];
};

export const TrackerModal: React.FC<{ ctx: ShopCtx; initialCode?: string; onClose: () => void }> = ({ ctx, initialCode = '', onClose }) => {
  const k = useKit(); const inp = useInputStyle();
  const [code, setCode] = useState(initialCode);
  const [res, setRes] = useState<any | null>(null);
  const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const check = useCallback(async (silent = false) => {
    if (!ctx.userId || !code.trim()) return;
    if (!silent) { setError(null); setLoading(true); }
    try {
      let found: any = null;
      for (const [fn] of RPC_BY_PREFIX(code)) {
        const { data } = await supabase.rpc(fn, { p_shop_id: ctx.userId, p_code: code.trim() });
        if (data?.found) { found = data; break; }
      }
      if (found) setRes(found); else { setRes(null); if (!silent) setError('No encontramos ese código.'); }
    } catch (err: any) { if (!silent) setError(err?.message || 'Error al consultar.'); }
    finally { if (!silent) setLoading(false); }
  }, [ctx.userId, code]);
  useEffect(() => { if (initialCode) check(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { if (!res) return; const t = setInterval(() => check(true), 8000); return () => clearInterval(t); }, [res, check]);

  const cancel = async () => {
    if (!ctx.userId || ctx.isMobilePreview || !res) return;
    const what = res.kind === 'rsvp' ? 'esta reserva' : 'este pedido';
    if (!window.confirm(`¿Cancelar ${what}?`)) return;
    setCancelling(true); setError(null);
    try {
      const fn = res.kind === 'rsvp' ? 'cancel_books_rsvp' : 'cancel_books_order';
      const { data } = await supabase.rpc(fn, { p_shop_id: ctx.userId, p_code: code.trim() });
      if (!data?.ok) setError(errMsg(data));
      await check(true);
    } finally { setCancelling(false); }
  };

  const wa = waDigits(ctx.profile?.whatsapp);
  const box = { background: 'rgba(255,255,255,0.03)', borderColor: `${k.text}12` } as React.CSSProperties;
  const headCard = { background: `linear-gradient(160deg, ${k.accent}18, rgba(255,255,255,0.02))`, borderColor: `${k.accent}44` } as React.CSSProperties;
  const bad = (txt: string) => <div className="rounded-xl p-4 text-center border" style={{ background: 'rgba(248,113,113,0.1)', borderColor: 'rgba(248,113,113,0.3)', color: '#f87171' }}>{txt}</div>;

  return (
    <ModalShell title="Consultar por código" onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); check(); }} className="flex gap-2">
        <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Código de pedido, encargo o reserva" className={inputCls} style={inp} aria-label="Código" />
        <button type="submit" disabled={loading || !code.trim()} className="shrink-0 px-5 rounded-xl text-sm font-bold uppercase disabled:opacity-40" style={{ background: k.accent, color: k.onAccent, fontFamily: k.titleFont }}>{loading ? '…' : 'Ver'}</button>
      </form>
      {error && <p className="text-red-400 text-xs">{error}</p>}

      {res?.kind === 'order' && (
        <div className="space-y-4 pt-1">
          <div className="rounded-2xl p-4 border" style={headCard}>
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: k.accentLight }}>{res.customer_name}</p>
              <span className="font-mono text-xs" style={{ color: `${k.text}b3` }}>{res.code}</span>
            </div>
            <p className="text-white font-bold text-lg mt-1" style={{ fontFamily: k.titleFont }}>{res.items_count} libro{res.items_count === 1 ? '' : 's'}</p>
            <p className="text-xs mt-0.5" style={{ color: `${k.text}b3` }}>{res.delivery_type === 'envio' ? `Envío a ${res.delivery_address || 'tu dirección'}` : 'Retiro en tienda'}{res.gift_wrap ? ' · Para regalo 🎁' : ''}</p>
          </div>
          {res.status === 'cancelado' ? bad(ORDER_STATUS_LABEL.cancelado)
            : <TrackerSteps steps={ORDER_STEPS} labels={{ ...ORDER_STATUS_LABEL, listo: readyLabel(res.delivery_type) }} current={res.status} />}
          <div className="rounded-xl p-3 border space-y-2" style={box}>
            {(res.items || []).map((it: any, i: number) => (
              <div key={i} className="flex items-center gap-2.5">
                <div className="w-8 h-12 rounded overflow-hidden shrink-0"><BookCover t={{ title: it.title, author: it.author, cover_url: it.cover }} /></div>
                <p className="flex-1 min-w-0 text-[12px] text-white truncate">{it.title}{it.qty > 1 ? ` × ${it.qty}` : ''}</p>
                <span className="text-[12px] font-semibold" style={{ color: `${k.text}cc` }}>{fmtMoney(it.total)}</span>
              </div>
            ))}
            <div className="h-px" style={{ background: `${k.text}14` }} />
            {res.discount_amount > 0 && <div className="flex justify-between text-[12px]" style={{ color: k.accentLight }}><span>Descuento de lector</span><span>− {fmtMoney(res.discount_amount)}</span></div>}
            {res.delivery_fee > 0 && <div className="flex justify-between text-[12px]" style={{ color: `${k.text}aa` }}><span>Envío</span><span>{fmtMoney(res.delivery_fee)}</span></div>}
            {res.gift_wrap_fee > 0 && <div className="flex justify-between text-[12px]" style={{ color: `${k.text}aa` }}><span>Envoltorio de regalo</span><span>{fmtMoney(res.gift_wrap_fee)}</span></div>}
            <div className="flex justify-between text-sm font-bold text-white"><span>Total</span><span>{fmtMoney(res.total)}</span></div>
            <p className="text-[11px]" style={{ color: `${k.text}b3` }}>{PAY_LABEL[res.payment_status] || res.payment_status}</p>
          </div>
          {res.payment_status === 'pendiente' && res.status !== 'cancelado' && res.status !== 'entregado' && (
            <PaymentOptions profile={ctx.profile} ownerId={ctx.userId} reference={res.code} amount={Number(res.total)} title="Paga tu pedido" concept="tu pedido de libros" customer={{ name: res.customer_name }} isMobilePreview={ctx.isMobilePreview} />
          )}
          {res.status === 'listo' && res.delivery_type === 'retiro' && res.pickup_note && (
            <div className="rounded-xl p-3 border text-sm" style={{ background: `${k.accent}0f`, borderColor: `${k.accent}33`, color: `${k.text}dd` }}>
              <span className="font-bold flex items-center gap-1.5" style={{ color: k.accentLight }}><FaMapMarkerAlt size={11} /> Para retirar</span>
              <p className="mt-1 whitespace-pre-wrap">{res.pickup_note}</p>
            </div>
          )}
          {res.admin_note && (
            <div className="rounded-xl p-3 border text-sm" style={{ background: `${k.accent}0f`, borderColor: `${k.accent}33`, color: `${k.text}dd` }}>
              <span className="font-bold" style={{ color: k.accentLight }}>Mensaje de la librería:</span>
              <p className="mt-1 whitespace-pre-wrap">{res.admin_note}</p>
            </div>
          )}
          {res.status === 'recibido' && <GhostButton type="button" onClick={cancel} disabled={cancelling}>{cancelling ? 'Cancelando…' : 'Cancelar mi pedido'}</GhostButton>}
        </div>
      )}

      {res?.kind === 'request' && (
        <div className="space-y-4 pt-1">
          <div className="rounded-2xl p-4 border" style={headCard}>
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: k.accentLight }}>Encargo · {res.customer_name}</p>
              <span className="font-mono text-xs" style={{ color: `${k.text}b3` }}>{res.code}</span>
            </div>
            <p className="text-white font-bold text-lg mt-1" style={{ fontFamily: k.titleFont }}>{res.title_wanted}</p>
            <p className="text-xs mt-0.5" style={{ color: `${k.text}b3` }}>{[res.author, res.qty > 1 ? `${res.qty} ejemplares` : null].filter(Boolean).join(' · ')}</p>
          </div>
          {res.status === 'cancelado' || res.status === 'no_disponible'
            ? bad(REQUEST_STATUS_LABEL[res.status as keyof typeof REQUEST_STATUS_LABEL])
            : <TrackerSteps steps={REQUEST_STEPS} labels={REQUEST_STATUS_LABEL} current={res.status} />}
          {res.quoted_price != null && (
            <div className="rounded-xl p-4 border flex items-end justify-between" style={box}>
              <div><p className="text-[10px] uppercase tracking-widest" style={{ color: `${k.text}99` }}>Precio cotizado</p>{res.eta_text && <p className="text-[12px] mt-0.5" style={{ color: `${k.text}cc` }}><FaClock size={10} className="inline mr-1" />{res.eta_text}</p>}</div>
              <p className="text-2xl font-bold text-white" style={{ fontFamily: k.titleFont }}>{fmtMoney(res.quoted_price)}</p>
            </div>
          )}
          {res.status === 'cotizado' && wa && (
            <a href={`https://wa.me/${wa}?text=${encodeURIComponent(`Hola, quiero confirmar mi encargo ${res.code} («${res.title_wanted}»).`)}`} target="_blank" rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-[12px] font-bold border text-[#25D366] border-[#25D366]/30 hover:bg-[#25D366]/10 transition"><FaWhatsapp /> Confirmar mi encargo por WhatsApp</a>
          )}
          {res.admin_note && (
            <div className="rounded-xl p-3 border text-sm" style={{ background: `${k.accent}0f`, borderColor: `${k.accent}33`, color: `${k.text}dd` }}>
              <span className="font-bold" style={{ color: k.accentLight }}>Mensaje de la librería:</span>
              <p className="mt-1 whitespace-pre-wrap">{res.admin_note}</p>
            </div>
          )}
        </div>
      )}

      {res?.kind === 'rsvp' && (
        <div className="space-y-4 pt-1">
          <div className="rounded-2xl p-4 border" style={headCard}>
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: k.accentLight }}>{res.name}</p>
              <span className="font-mono text-xs" style={{ color: `${k.text}b3` }}>{res.code}</span>
            </div>
            <p className="text-white font-bold text-lg mt-1" style={{ fontFamily: k.titleFont }}>{res.event_title}</p>
            <p className="text-sm mt-1" style={{ color: `${k.text}cc` }}>{prettyDate(res.event_date, { weekday: 'long', day: 'numeric', month: 'long' })}{res.start_time ? ` · ${res.start_time}` : ''}{res.end_time ? ` – ${res.end_time}` : ''}</p>
            {res.location && <p className="text-xs mt-0.5" style={{ color: `${k.text}b3` }}><FaMapMarkerAlt size={10} className="inline mr-1" />{res.location}</p>}
          </div>
          {res.status === 'cancelada' || res.status === 'no_show' ? bad(RSVP_LABEL[res.status]) : (
            <div className="rounded-xl p-4 border flex items-center gap-3" style={box}>
              <FaTicketAlt style={{ color: k.accentLight }} />
              <div className="flex-1"><p className="text-white font-semibold text-sm">{RSVP_LABEL[res.status] || res.status}</p><p className="text-[11px]" style={{ color: `${k.text}b3` }}>{res.seats} lugar{res.seats === 1 ? '' : 'es'} · {PAY_LABEL[res.payment_status]}</p></div>
              {res.total > 0 && <span className="text-white font-bold">{fmtMoney(res.total)}</span>}
            </div>
          )}
          {res.payment_status === 'pendiente' && res.status === 'confirmada' && res.total > 0 && (
            <PaymentOptions profile={ctx.profile} ownerId={ctx.userId} reference={res.code} amount={Number(res.total)} title="Paga tu entrada" concept={`tu lugar en «${res.event_title}»`} customer={{ name: res.name }} isMobilePreview={ctx.isMobilePreview} />
          )}
          {res.status === 'confirmada' && <GhostButton type="button" onClick={cancel} disabled={cancelling}>{cancelling ? 'Cancelando…' : 'Cancelar mi reserva'}</GhostButton>}
        </div>
      )}

      {res?.kind === 'giftcard' && (
        <div className="space-y-3 pt-1">
          <div className="rounded-2xl p-5 border text-center" style={headCard}>
            <FaGift className="mx-auto text-2xl mb-2" style={{ color: k.accentLight }} />
            <p className="text-[10px] uppercase tracking-[0.3em] font-semibold" style={{ color: k.accentLight }}>Tarjeta de regalo</p>
            <CodeBox code={res.code} small />
            <p className="text-3xl font-bold text-white" style={{ fontFamily: k.titleFont }}>{fmtMoney(res.balance)}</p>
            <p className="text-[11px] mt-1" style={{ color: `${k.text}b3` }}>saldo disponible de {fmtMoney(res.amount)}</p>
          </div>
          {res.status === 'pendiente' && <p className="text-[12px] text-center" style={{ color: `${k.text}b3` }}>Se activa cuando confirmemos el pago.</p>}
          {res.status === 'agotada' && bad('Saldo agotado')}
          {res.status === 'anulada' && bad('Tarjeta anulada')}
          {res.message && <p className="text-[13px] italic text-center" style={{ color: `${k.text}cc`, fontFamily: k.titleFont }}>“{res.message}”</p>}
        </div>
      )}
    </ModalShell>
  );
};

/* ── Club de Lectores ────────────────────────────────────────────────────── */
export const ClubModal: React.FC<{ ctx: ShopCtx; clubName: string; clubTagline: string; onClose: () => void }> = ({ ctx, clubName, clubTagline, onClose }) => {
  const k = useKit(); const inp = useInputStyle();
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [phone, setPhone] = useState(''); const [interests, setInterests] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [code, setCode] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (ctx.isMobilePreview) return;
    if (!name.trim()) return setError(ERRORS.name_required);
    if (!email.trim() && !phone.trim()) return setError(ERRORS.contact_required);
    if (!ctx.userId) return setError(ERRORS.shop_not_found);
    setError(null); setBusy(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('join_books_club', { p_shop_id: ctx.userId, p_name: name.trim(), p_email: email.trim() || null, p_phone: phone.trim() || null, p_interests: interests.trim() || null });
      if (rpcError) throw rpcError;
      if (!data?.ok) return setError(errMsg(data));
      setCode(data.member_code);
    } catch (err: any) { setError(errMsg(err)); } finally { setBusy(false); }
  };
  return (
    <ModalShell title={code ? '¡Bienvenido al club!' : clubName} onClose={onClose}>
      {code ? (
        <div className="py-3 text-center">
          <FaCrown className="mx-auto text-4xl mb-3" style={{ color: k.accentLight }} />
          <p className="text-white font-bold">Tu código de lector:</p>
          <CodeBox code={code} />
          <p className="text-sm" style={{ color: `${k.text}b3` }}>Úsalo al pedir para aplicar tus beneficios.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <p className="text-sm" style={{ color: `${k.text}99` }}>{clubTagline}</p>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Tu nombre" className={inputCls} style={inp} />
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email" className={inputCls} style={inp} />
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Teléfono / WhatsApp" className={inputCls} style={inp} />
          <input value={interests} onChange={e => setInterests(e.target.value)} placeholder="¿Qué te gusta leer? (novela, historia, infantil…)" className={inputCls} style={inp} />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <PrimaryButton type="submit" disabled={busy}>{busy ? 'Uniéndote…' : 'Quiero unirme'}</PrimaryButton>
        </form>
      )}
    </ModalShell>
  );
};

export const MemberModal: React.FC<{ ctx: ShopCtx; initialId: string; onClose: () => void }> = ({ ctx, initialId, onClose }) => {
  const k = useKit(); const inp = useInputStyle();
  const [id, setId] = useState(initialId);
  const [member, setMember] = useState<any | null>(null);
  const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  const lookup = useCallback(async (value: string) => {
    if (!ctx.userId || !value.trim()) return;
    setError(null); setLoading(true); setMember(null);
    try {
      const { data } = await supabase.rpc('get_books_member', { p_shop_id: ctx.userId, p_identifier: value.trim() });
      if (data?.found) setMember(data); else setError('No encontramos tu carnet. Verifica el código, email o teléfono.');
    } catch (err: any) { setError(err?.message || 'Error al consultar.'); } finally { setLoading(false); }
  }, [ctx.userId]);
  useEffect(() => { if (initialId.trim()) lookup(initialId); /* eslint-disable-next-line */ }, []);
  return (
    <ModalShell title="Mi carnet de lector" onClose={onClose}>
      {member ? (
        <div className="space-y-3">
          <div className="rounded-2xl p-5 border text-center" style={{ background: `linear-gradient(160deg, ${k.accent}26, ${k.surface})`, borderColor: `${k.accent}55` }}>
            <p className="text-[10px] uppercase tracking-[0.3em] font-semibold" style={{ color: k.accentLight }}>{member.is_vip ? 'Lector VIP' : 'Lector del club'}</p>
            <p className="text-white font-bold text-xl mt-1.5" style={{ fontFamily: k.titleFont }}>{member.name || 'Lector'}</p>
            <CodeBox code={member.member_code} small />
            <div className="grid grid-cols-3 gap-2 mt-1">
              {[{ v: member.orders_count || 0, l: 'Compras' }, { v: fmtMoney(member.total_spent || 0), l: 'En libros' }, { v: member.discount_percent > 0 ? `${member.discount_percent}%` : '—', l: 'Descuento' }].map(x => (
                <div key={x.l} className="rounded-lg py-2" style={{ background: 'rgba(0,0,0,0.25)' }}>
                  <p className="text-white font-bold text-sm" style={{ fontFamily: k.titleFont }}>{x.v}</p><p className="text-[9px] uppercase tracking-widest" style={{ color: `${k.text}b3` }}>{x.l}</p>
                </div>
              ))}
            </div>
            {member.interests && <p className="text-[12px] italic mt-3" style={{ color: `${k.text}aa`, fontFamily: k.titleFont }}>Te gusta: {member.interests}</p>}
          </div>
          {member.benefits && (
            <div className="rounded-xl p-3 border text-sm" style={{ background: `${k.accent}0f`, borderColor: `${k.accent}33`, color: `${k.text}dd` }}>
              <span className="font-bold flex items-center gap-1.5" style={{ color: k.accentLight }}><FaGift size={11} /> Tus beneficios</span>
              <p className="mt-1 whitespace-pre-wrap">{member.benefits}</p>
            </div>
          )}
          <GhostButton type="button" onClick={() => { setMember(null); setId(''); }}>Consultar otro</GhostButton>
        </div>
      ) : (
        <form onSubmit={e => { e.preventDefault(); lookup(id); }} className="space-y-3">
          <p className="text-sm" style={{ color: `${k.text}99` }}>Ingresa tu código de lector, email o teléfono.</p>
          <input value={id} onChange={e => setId(e.target.value)} placeholder="L-XXXX / email / teléfono" className={inputCls} style={inp} />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <PrimaryButton type="submit" disabled={loading}>{loading ? 'Buscando…' : 'Consultar'}</PrimaryButton>
        </form>
      )}
    </ModalShell>
  );
};

/* ── Lista escolar / de lectura ──────────────────────────────────────────── */
export interface ListData {
  id: string; name: string; school?: string | null; grade?: string | null; description?: string | null;
  items: { title_id: string; qty: number; title: string; author?: string | null; cover_url?: string | null; price: number; stock?: number | null; available: boolean }[];
}

export const listTotal = (l: ListData) => l.items.filter(i => i.available).reduce((a, i) => a + i.price * i.qty, 0);

export const ListModal: React.FC<{ list: ListData; onAdd: (items: { id: string; qty: number }[], listName: string) => void; onClose: () => void }> = ({ list, onAdd, onClose }) => {
  const k = useKit();
  const avail = list.items.filter(i => i.available);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(avail.map(i => i.title_id)));
  const sel = avail.filter(i => picked.has(i.title_id));
  const total = sel.reduce((a, i) => a + i.price * i.qty, 0);
  const toggle = (id: string) => setPicked(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <ModalShell title={list.name} onClose={onClose} wide>
      {(list.school || list.grade) && <p className="text-[11px] uppercase tracking-[0.2em] font-semibold" style={{ color: k.accentLight }}>{[list.school, list.grade].filter(Boolean).join(' · ')}</p>}
      {list.description && <p className="text-sm" style={{ color: `${k.text}99` }}>{list.description}</p>}
      <div className="space-y-2">
        {list.items.map(i => {
          const on = i.available && picked.has(i.title_id);
          return (
            <button key={i.title_id} type="button" disabled={!i.available} onClick={() => toggle(i.title_id)} aria-pressed={on}
              className="w-full flex items-center gap-3 rounded-xl border p-2.5 text-left transition disabled:opacity-50"
              style={{ background: on ? `${k.accent}14` : 'rgba(255,255,255,0.03)', borderColor: on ? `${k.accent}77` : `${k.text}14` }}>
              <span className="w-5 h-5 rounded-md border flex items-center justify-center shrink-0" style={{ borderColor: on ? k.accent : `${k.text}44`, background: on ? k.accent : 'transparent', color: k.onAccent }}>{on && <FaCheck size={9} />}</span>
              <div className="w-9 h-[54px] rounded overflow-hidden shrink-0"><BookCover t={{ title: i.title, author: i.author, cover_url: i.cover_url }} /></div>
              <div className="min-w-0 flex-1">
                <p className="text-white text-[13px] font-semibold leading-snug line-clamp-2" style={{ fontFamily: k.titleFont }}>{i.title}</p>
                <p className="text-[10.5px]" style={{ color: i.available ? `${k.text}99` : '#f87171' }}>{i.available ? [i.author, i.qty > 1 ? `× ${i.qty}` : null].filter(Boolean).join(' · ') : 'Agotado por ahora'}</p>
              </div>
              <span className="text-[13px] font-bold text-white shrink-0">{fmtMoney(i.price * i.qty)}</span>
            </button>
          );
        })}
      </div>
      {avail.length < list.items.length && <p className="text-[11px]" style={{ color: `${k.text}99` }}>Los títulos agotados no se pueden agregar ahora. Puedes encargarlos aparte.</p>}
      <PrimaryButton type="button" disabled={sel.length === 0} onClick={() => { onAdd(sel.map(i => ({ id: i.title_id, qty: i.qty })), list.name); onClose(); }}>
        {sel.length === 0 ? 'Elige al menos un libro' : `Agregar ${sel.length} libro${sel.length === 1 ? '' : 's'} al pedido · ${fmtMoney(total)}`}
      </PrimaryButton>
    </ModalShell>
  );
};

/* ── Evento ──────────────────────────────────────────────────────────────── */
export interface EventData {
  id: string; title: string; description?: string | null; kind: string; event_date: string; start_time?: string | null; end_time?: string | null;
  location?: string | null; capacity?: number | null; price: number; image_url?: string | null; host_name?: string | null;
  seats_taken: number; seats_left: number | null;
}

export const EventModal: React.FC<{ ev: EventData; ctx: ShopCtx; onTrack: (code: string) => void; onBooked: () => void; onClose: () => void }> = ({ ev, ctx, onTrack, onBooked, onClose }) => {
  const k = useKit(); const inp = useInputStyle();
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [email, setEmail] = useState(''); const [member, setMember] = useState('');
  const [seats, setSeats] = useState(1);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [done, setDone] = useState<any | null>(null);
  const maxSeats = Math.max(Math.min(10, ev.seats_left === null ? 10 : ev.seats_left), 1);
  const full = ev.seats_left !== null && ev.seats_left <= 0;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (ctx.isMobilePreview) return;
    if (!name.trim()) return setError(ERRORS.name_required);
    if (!phone.trim() && !email.trim()) return setError(ERRORS.contact_required);
    if (!ctx.userId) return setError(ERRORS.shop_not_found);
    setError(null); setBusy(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('book_books_event', { p_shop_id: ctx.userId, p_event_id: ev.id, p_name: name.trim(), p_phone: phone.trim() || null, p_email: email.trim() || null, p_seats: seats, p_member_code: member.trim() || null });
      if (rpcError) throw rpcError;
      if (!data?.ok) { onBooked(); return setError(errMsg(data)); }
      setDone(data); onBooked();
    } catch (err: any) { setError(errMsg(err)); } finally { setBusy(false); }
  };
  return (
    <ModalShell title={done ? '¡Lugar reservado!' : ev.title} onClose={onClose} wide>
      {done ? (
        <div className="py-3 text-center">
          <FaTicketAlt className="mx-auto text-4xl mb-3" style={{ color: k.accentLight }} />
          <p className="text-white font-bold" style={{ fontFamily: k.titleFont }}>{ev.title}</p>
          <p className="text-sm mt-1" style={{ color: `${k.text}99` }}>{prettyDate(ev.event_date, { weekday: 'long', day: 'numeric', month: 'long' })}{ev.start_time ? ` · ${ev.start_time}` : ''} · {done.seats} lugar{done.seats === 1 ? '' : 'es'}</p>
          <p className="text-sm mt-3" style={{ color: `${k.text}b3` }}>Tu código de reserva:</p>
          <CodeBox code={done.code} />
          {done.total > 0 && (
            <div className="mb-3">
              <PaymentOptions profile={ctx.profile} ownerId={ctx.userId} reference={done.code} amount={Number(done.total)} title="Paga tu entrada" concept={`tu lugar en «${ev.title}»`} customer={{ name: name.trim(), phone: phone.trim(), email: email.trim() }} isMobilePreview={ctx.isMobilePreview} />
            </div>
          )}
          <PrimaryButton type="button" onClick={() => onTrack(done.code)}>Ver mi reserva</PrimaryButton>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          {ev.image_url && <img src={ev.image_url} alt="" className="w-full aspect-[16/9] object-cover rounded-xl" />}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]" style={{ color: `${k.text}cc` }}>
            <span className="font-semibold" style={{ color: k.accentLight }}>{EVENT_KIND_LABEL[ev.kind as keyof typeof EVENT_KIND_LABEL] || 'Evento'}</span>
            <span><FaClock size={10} className="inline mr-1" />{prettyDate(ev.event_date, { weekday: 'long', day: 'numeric', month: 'long' })}{ev.start_time ? ` · ${ev.start_time}` : ''}{ev.end_time ? ` – ${ev.end_time}` : ''}</span>
            {ev.location && <span><FaMapMarkerAlt size={10} className="inline mr-1" />{ev.location}</span>}
            {ev.host_name && <span><FaUserAlt size={10} className="inline mr-1" />{ev.host_name}</span>}
          </div>
          {ev.description && <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap" style={{ color: `${k.text}cc`, fontFamily: k.titleFont }}>{ev.description}</p>}
          <div className="flex items-center justify-between rounded-xl border px-4 py-3" style={{ background: 'rgba(255,255,255,0.03)', borderColor: `${k.accent}33` }}>
            <span className="text-white font-bold" style={{ fontFamily: k.titleFont }}>{ev.price > 0 ? `${fmtMoney(ev.price)} por persona` : 'Entrada libre'}</span>
            <span className="text-[11px] font-semibold" style={{ color: full ? '#f87171' : (ev.seats_left !== null && ev.seats_left <= 5 ? '#fbbf24' : '#4ade80') }}>
              {full ? 'Lleno' : ev.seats_left === null ? 'Cupo abierto' : `Quedan ${ev.seats_left} lugares`}
            </span>
          </div>
          {full ? <p className="text-center text-sm" style={{ color: `${k.text}aa` }}>Este evento ya está lleno. Síguenos para el próximo.</p> : (
            <>
              <div className="flex items-center justify-between rounded-xl border px-4 py-2.5" style={{ background: 'rgba(0,0,0,0.4)', borderColor: `${k.accent}33` }}>
                <span className="text-[12px]" style={{ color: `${k.text}cc` }}>Lugares</span>
                <QtyStepper value={seats} max={maxSeats} onChange={setSeats} label="lugares" />
              </div>
              <div className="space-y-2.5">
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre completo" className={inputCls} style={inp} />
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Teléfono / WhatsApp" className={inputCls} style={inp} />
                <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email" className={inputCls} style={inp} />
                <input value={member} onChange={e => setMember(e.target.value)} placeholder="Código de lector (opcional)" className={inputCls} style={inp} />
              </div>
              {error && <p className="text-red-400 text-xs">{error}</p>}
              <PrimaryButton type="submit" disabled={busy}>{busy ? 'Reservando…' : ev.price > 0 ? `Reservar · ${fmtMoney(ev.price * seats)}` : 'Reservar mi lugar'}</PrimaryButton>
            </>
          )}
        </form>
      )}
    </ModalShell>
  );
};

/* ── Tarjeta de regalo ───────────────────────────────────────────────────── */
export const GiftCardModal: React.FC<{ ctx: ShopCtx; onTrack: (code: string) => void; onClose: () => void }> = ({ ctx, onTrack, onClose }) => {
  const k = useKit(); const inp = useInputStyle();
  const presets = [10, 20, 30, 50, 100];
  const [amount, setAmount] = useState<number>(30); const [custom, setCustom] = useState('');
  const [buyer, setBuyer] = useState(''); const [phone, setPhone] = useState(''); const [email, setEmail] = useState('');
  const [to, setTo] = useState(''); const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [done, setDone] = useState<any | null>(null);
  const value = custom.trim() ? Number(custom.replace(',', '.')) : amount;
  const okAmount = isFinite(value) && value >= 5 && value <= 500;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (ctx.isMobilePreview) return;
    if (!okAmount) return setError(ERRORS.bad_amount);
    if (!buyer.trim()) return setError(ERRORS.name_required);
    if (!phone.trim() && !email.trim()) return setError(ERRORS.contact_required);
    if (!ctx.userId) return setError(ERRORS.shop_not_found);
    setError(null); setBusy(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('request_books_giftcard', { p_shop_id: ctx.userId, p_amount: value, p_buyer_name: buyer.trim(), p_buyer_phone: phone.trim() || null, p_buyer_email: email.trim() || null, p_recipient_name: to.trim() || null, p_message: msg.trim() || null });
      if (rpcError) throw rpcError;
      if (!data?.ok) return setError(errMsg(data));
      setDone(data);
    } catch (err: any) { setError(errMsg(err)); } finally { setBusy(false); }
  };
  return (
    <ModalShell title={done ? '¡Tarjeta solicitada!' : 'Tarjeta de regalo'} onClose={onClose}>
      {done ? (
        <div className="py-3 text-center">
          <FaGift className="mx-auto text-4xl mb-3" style={{ color: k.accentLight }} />
          <p className="text-3xl font-bold text-white" style={{ fontFamily: k.titleFont }}>{fmtMoney(done.amount)}</p>
          <CodeBox code={done.code} />
          <p className="text-[12px] mb-3" style={{ color: `${k.text}b3` }}>La tarjeta se activa cuando confirmemos tu pago. Con este código se consulta el saldo y se usa en la librería.</p>
          <div className="mb-3"><PaymentOptions profile={ctx.profile} ownerId={ctx.userId} reference={done.code} amount={Number(done.amount)} title="Paga tu tarjeta" concept="tu tarjeta de regalo" customer={{ name: buyer.trim(), phone: phone.trim(), email: email.trim() }} isMobilePreview={ctx.isMobilePreview} /></div>
          <PrimaryButton type="button" onClick={() => onTrack(done.code)}>Ver mi tarjeta</PrimaryButton>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <p className="text-sm" style={{ color: `${k.text}99` }}>El regalo perfecto para quien ama leer: que elija su próximo libro.</p>
          <div>
            <FieldLabel>Monto</FieldLabel>
            <div className="grid grid-cols-5 gap-2">
              {presets.map(p => (
                <button key={p} type="button" onClick={() => { setAmount(p); setCustom(''); }} aria-pressed={!custom && amount === p}
                  className="py-2.5 rounded-xl border text-[13px] font-bold transition"
                  style={!custom && amount === p ? { background: k.accent, color: k.onAccent, borderColor: k.accent } : { background: 'rgba(255,255,255,0.03)', borderColor: `${k.text}1a`, color: k.text }}>${p}</button>
              ))}
            </div>
            <input value={custom} onChange={e => setCustom(e.target.value.replace(/[^0-9.,]/g, ''))} inputMode="decimal" placeholder="Otro monto ($5 a $500)" className={`${inputCls} mt-2`} style={inp} />
          </div>
          <input value={to} onChange={e => setTo(e.target.value)} placeholder="Para (nombre de quien la recibe)" className={inputCls} style={inp} />
          <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={2} maxLength={400} placeholder="Mensaje (opcional)" className={inputCls} style={inp} />
          <FieldLabel>Tus datos</FieldLabel>
          <input value={buyer} onChange={e => setBuyer(e.target.value)} placeholder="Tu nombre" className={inputCls} style={inp} />
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Teléfono / WhatsApp" className={inputCls} style={inp} />
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email" className={inputCls} style={inp} />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <PrimaryButton type="submit" disabled={busy || !okAmount}>{busy ? 'Enviando…' : `Pedir tarjeta · ${okAmount ? fmtMoney(value) : '—'}`}</PrimaryButton>
        </form>
      )}
    </ModalShell>
  );
};

