import React, { useMemo, useState } from 'react';
import {
  FaTimes, FaChevronLeft, FaChevronRight, FaShoppingBag, FaBell, FaCheck, FaStore, FaTruck, FaGift, FaTrashAlt,
  FaWhatsapp, FaRegStickyNote, FaClipboardCheck,
} from 'react-icons/fa';
import { supabase } from '../../src/lib/supabase';
import type { BookTitle, BooksSettings } from '../../types';
import {
  useKit, useInputStyle, inputCls, fmtMoney, waDigits, prettyDate, ModalShell, FieldLabel, PrimaryButton, GhostButton, CodeBox,
} from '../PublicKit';
import { PaymentOptions } from '../PaymentOptions';
import { BookCover, BookBadges, PriceTag, QtyStepper, BookCard, Shelf, errMsg, ERRORS } from './BooksUi';
import {
  FORMAT_LABEL, CONDITION_LABEL, stockState, canOrder, maxQty, discountPercent, isPreorder, estimateOrder,
} from '../../src/lib/booksCommon';

export interface ShopCtx {
  profile: any;
  userId?: string | null;
  settings: BooksSettings;
  isPro: boolean;
  isUltra: boolean;
  isMobilePreview?: boolean;
  campaign: string | null;
}

/* ── Ficha del libro ─────────────────────────────────────────────────────── */
export const BookDetailModal: React.FC<{
  t: BookTitle; titles: BookTitle[]; today: string; ctx: ShopCtx; inCart: number;
  onAdd: (qty: number) => void; onClose: () => void; onOpenOther: (t: BookTitle) => void; onWait: (t: BookTitle) => void;
}> = ({ t, titles, today, ctx, inCart, onAdd, onClose, onOpenOther, onWait }) => {
  const k = useKit();
  const images = useMemo(() => Array.from(new Set([t.cover_url, ...(t.images || [])].filter(Boolean) as string[])), [t]);
  const [img, setImg] = useState(0);
  const orderable = canOrder(t) && ctx.settings.ordersEnabled !== false;
  const limit = Math.max(maxQty(t) - inCart, 0);
  const [qty, setQty] = useState(1);
  const st = stockState(t.stock);
  const pre = isPreorder(t, today);
  const wa = waDigits(ctx.profile?.whatsapp);
  const sameAuthor = useMemo(
    () => (t.author ? titles.filter(x => x.id !== t.id && x.author && x.author.toLowerCase() === t.author!.toLowerCase()).slice(0, 8) : []),
    [titles, t],
  );
  const go = (d: number) => setImg(i => (images.length ? (i + d + images.length) % images.length : 0));
  const meta: [string, string | number | null | undefined][] = [
    ['Editorial', t.publisher], ['ISBN', t.isbn], ['Páginas', t.pages], ['Año', t.pub_year],
    ['Idioma', t.lang], ['Formato', FORMAT_LABEL[t.book_format] || t.book_format],
    ['Estado', t.book_condition && t.book_condition !== 'nuevo' ? CONDITION_LABEL[t.book_condition] : null],
    ['Sale el', pre ? prettyDate(t.release_date, { day: 'numeric', month: 'long', year: 'numeric' }) : null],
  ];
  const stColor = st.kind === 'agotado' ? '#f87171' : st.kind === 'ultimas' ? '#fbbf24' : '#4ade80';

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl relative flex flex-col overflow-hidden border"
        style={{ background: k.surface, borderColor: `${k.accent}33`, maxHeight: '94svh', fontFamily: k.bodyFont }} onClick={e => e.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label="Cerrar" className="absolute top-3 right-3 z-20 w-9 h-9 rounded-full bg-black/55 text-white flex items-center justify-center"><FaTimes /></button>

        <div className="overflow-y-auto">
          <div className="relative pt-7 pb-5 px-6 flex justify-center" style={{ background: `radial-gradient(70% 90% at 50% 20%, ${k.accent}1f, transparent 70%), ${k.bg}` }}>
            <div className="relative w-[46%] max-w-[190px] aspect-[2/3] rounded-md overflow-hidden" style={{ boxShadow: '0 28px 50px -18px rgba(0,0,0,0.9), 0 4px 10px rgba(0,0,0,0.6)' }}>
              {images.length > 0
                ? <img src={images[img]} alt={`${t.title} ${img + 1}`} className="w-full h-full object-cover" />
                : <BookCover t={t} />}
              <span aria-hidden className="absolute inset-y-0 left-0 w-[8px]" style={{ background: 'linear-gradient(90deg, rgba(0,0,0,0.4), rgba(255,255,255,0.1) 55%, transparent)' }} />
              <BookBadges t={t} today={today} />
            </div>
            {images.length > 1 && (
              <>
                <button type="button" aria-label="Anterior" onClick={() => go(-1)} className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/45 text-white flex items-center justify-center"><FaChevronLeft /></button>
                <button type="button" aria-label="Siguiente" onClick={() => go(1)} className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/45 text-white flex items-center justify-center"><FaChevronRight /></button>
                <span className="absolute bottom-2 right-4 text-[10px] font-semibold px-2 py-1 rounded-md" style={{ background: 'rgba(0,0,0,0.5)', color: '#fff' }}>{img + 1} / {images.length}</span>
              </>
            )}
          </div>

          <div className="p-6 pt-4">
            {t.category && <p className="text-[10px] uppercase tracking-[0.3em] font-semibold" style={{ color: k.accentLight }}>{t.category}</p>}
            <h3 className="text-[22px] leading-tight font-bold text-white mt-1" style={{ fontFamily: k.titleFont }}>{t.title}</h3>
            {t.subtitle && <p className="text-[13px] italic mt-0.5" style={{ color: `${k.text}aa`, fontFamily: k.titleFont }}>{t.subtitle}</p>}
            {t.author && <p className="text-[13px] mt-1.5" style={{ color: k.text }}>de <span className="font-semibold">{t.author}</span></p>}

            <div className="flex items-end justify-between gap-3 mt-4">
              <PriceTag t={t} size="lg" />
              <span className="text-[11px] font-semibold flex items-center gap-1.5" style={{ color: stColor }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: stColor }} />{pre ? 'Preventa' : st.label}
              </span>
            </div>
            {discountPercent(t.price, t.original_price) > 0 && t.original_price ? (
              <p className="text-[11px] mt-1" style={{ color: '#fda4af' }}>Ahorras {fmtMoney(t.original_price - t.price)} ({discountPercent(t.price, t.original_price)}%)</p>
            ) : null}

            {t.staff_note && (
              <div className="mt-4 rounded-xl p-4 border relative" style={{ background: `${k.accent}10`, borderColor: `${k.accent}40` }}>
                <p className="text-[9px] uppercase tracking-[0.28em] font-semibold flex items-center gap-1.5" style={{ color: k.accentLight }}><FaRegStickyNote size={10} /> El librero dice</p>
                <p className="text-[13px] italic leading-relaxed mt-1.5 whitespace-pre-wrap" style={{ color: `${k.text}dd`, fontFamily: k.titleFont }}>“{t.staff_note}”</p>
              </div>
            )}

            {t.description && (
              <div className="mt-4">
                <FieldLabel>Sinopsis</FieldLabel>
                <p className="text-[13.5px] leading-[1.65] whitespace-pre-wrap" style={{ color: `${k.text}cc`, fontFamily: k.titleFont }}>{t.description}</p>
              </div>
            )}

            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
              {meta.filter(([, v]) => v !== null && v !== undefined && v !== '').map(([label, v]) => (
                <div key={label} className="min-w-0 border-b pb-1.5" style={{ borderColor: `${k.text}10` }}>
                  <dt className="text-[9px] uppercase tracking-[0.18em]" style={{ color: `${k.text}77` }}>{label}</dt>
                  <dd className="font-semibold text-white truncate" title={String(v)}>{v}</dd>
                </div>
              ))}
            </dl>

            {sameAuthor.length > 0 && (
              <div className="mt-5">
                <FieldLabel>Más de {t.author}</FieldLabel>
                <Shelf>{sameAuthor.map(x => <BookCard key={x.id} t={x} today={today} shelf onOpen={() => onOpenOther(x)} />)}</Shelf>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t shrink-0" style={{ borderColor: `${k.accent}22`, background: k.surface }}>
          {orderable ? (
            limit > 0 ? (
              <div className="flex items-center gap-3">
                <QtyStepper value={qty} max={limit} onChange={setQty} />
                <PrimaryButton type="button" className="flex-1 flex items-center justify-center gap-2" onClick={() => { onAdd(qty); onClose(); }}>
                  <FaShoppingBag size={12} /> {pre ? 'Reservar' : 'Agregar'} · {fmtMoney(t.price * qty)}
                </PrimaryButton>
              </div>
            ) : (
              <p className="text-center text-[12px]" style={{ color: `${k.text}aa` }}>Ya tienes todas las copias disponibles en tu pedido.</p>
            )
          ) : (
            <div className="space-y-2">
              {st.kind === 'agotado' && ctx.isPro && <PrimaryButton type="button" onClick={() => onWait(t)} className="flex items-center justify-center gap-2"><FaBell size={12} /> Avísame cuando llegue</PrimaryButton>}
              {wa && (
                <a href={`https://wa.me/${wa}?text=${encodeURIComponent(`Hola, ¿tienen disponible «${t.title}»${t.author ? ` de ${t.author}` : ''}?`)}`} target="_blank" rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[12px] font-bold border text-[#25D366] border-[#25D366]/30 hover:bg-[#25D366]/10 transition">
                  <FaWhatsapp /> Consultar disponibilidad
                </a>
              )}
              {ctx.settings.ordersEnabled === false && <p className="text-center text-[11px]" style={{ color: `${k.text}99` }}>Los pedidos en línea están pausados por ahora.</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ── Avísame cuando llegue ───────────────────────────────────────────────── */
export const WaitlistModal: React.FC<{ t: BookTitle; ctx: ShopCtx; onClose: () => void }> = ({ t, ctx, onClose }) => {
  const k = useKit(); const inp = useInputStyle();
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [done, setDone] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (ctx.isMobilePreview) return;
    if (!phone.trim() && !email.trim()) return setError(ERRORS.contact_required);
    if (!ctx.userId) return setError(ERRORS.shop_not_found);
    setError(null); setBusy(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('join_books_waitlist', { p_shop_id: ctx.userId, p_title_id: t.id, p_name: name.trim() || null, p_phone: phone.trim() || null, p_email: email.trim() || null });
      if (rpcError) throw rpcError;
      if (!data?.ok) return setError(errMsg(data));
      setDone(true);
    } catch (err: any) { setError(errMsg(err)); } finally { setBusy(false); }
  };
  return (
    <ModalShell title={done ? '¡Te avisaremos!' : 'Avísame cuando llegue'} onClose={onClose} z={10010}>
      {done ? (
        <div className="py-3 text-center">
          <FaBell className="mx-auto text-4xl mb-3" style={{ color: k.accentLight }} />
          <p className="text-white font-bold" style={{ fontFamily: k.titleFont }}>{t.title}</p>
          <p className="text-sm mt-2" style={{ color: `${k.text}b3` }}>Apenas tengamos nuevas copias, te escribiremos.</p>
          <PrimaryButton type="button" onClick={onClose} className="mt-4">Listo</PrimaryButton>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <p className="text-sm" style={{ color: `${k.text}99` }}>«{t.title}» está agotado. Déjanos cómo avisarte y no lo pierdas.</p>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Tu nombre (opcional)" className={inputCls} style={inp} />
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Teléfono / WhatsApp" className={inputCls} style={inp} />
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email" className={inputCls} style={inp} />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <PrimaryButton type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Avísenme'}</PrimaryButton>
        </form>
      )}
    </ModalShell>
  );
};

/* ── Encargo: «lo conseguimos por ti» ────────────────────────────────────── */
export const RequestModal: React.FC<{ ctx: ShopCtx; initialTitle?: string; onTrack: (code: string) => void; onClose: () => void }> = ({ ctx, initialTitle = '', onTrack, onClose }) => {
  const k = useKit(); const inp = useInputStyle();
  const [title, setTitle] = useState(initialTitle); const [author, setAuthor] = useState(''); const [isbn, setIsbn] = useState('');
  const [qty, setQty] = useState(1); const [notes, setNotes] = useState('');
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [email, setEmail] = useState(''); const [member, setMember] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [code, setCode] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (ctx.isMobilePreview) return;
    if (!title.trim()) return setError(ERRORS.title_required);
    if (!name.trim()) return setError(ERRORS.name_required);
    if (!phone.trim() && !email.trim()) return setError(ERRORS.contact_required);
    if (!ctx.userId) return setError(ERRORS.shop_not_found);
    setError(null); setBusy(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('place_books_request', {
        p_shop_id: ctx.userId, p_name: name.trim(), p_phone: phone.trim() || null, p_email: email.trim() || null,
        p_title: title.trim(), p_author: author.trim() || null, p_isbn: isbn.trim() || null, p_qty: qty,
        p_notes: notes.trim() || null, p_member_code: member.trim() || null,
      });
      if (rpcError) throw rpcError;
      if (!data?.ok) return setError(errMsg(data));
      setCode(data.tracking_code);
    } catch (err: any) { setError(errMsg(err)); } finally { setBusy(false); }
  };
  return (
    <ModalShell title={code ? '¡Encargo recibido!' : 'Encárgalo'} onClose={onClose} wide>
      {code ? (
        <div className="py-3 text-center">
          <FaClipboardCheck className="mx-auto text-4xl mb-3" style={{ color: k.accentLight }} />
          <p className="text-white font-bold" style={{ fontFamily: k.titleFont }}>{title}</p>
          <p className="text-sm mt-2" style={{ color: `${k.text}b3` }}>Tu código de encargo:</p>
          <CodeBox code={code} />
          <p className="text-[12px] mb-4" style={{ color: `${k.text}b3` }}>Lo buscamos y te escribimos con el precio y el plazo. Guarda tu código para ver cómo va.</p>
          <PrimaryButton type="button" onClick={() => onTrack(code)}>Ver mi encargo</PrimaryButton>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <p className="text-sm" style={{ color: `${k.text}99` }}>¿No lo ves en el catálogo? Dinos qué libro buscas y lo conseguimos por ti.</p>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título del libro *" className={inputCls} style={inp} />
          <div className="grid grid-cols-2 gap-2.5">
            <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="Autor" className={inputCls} style={inp} />
            <input value={isbn} onChange={e => setIsbn(e.target.value)} placeholder="ISBN (opcional)" className={inputCls} style={inp} />
          </div>
          <div className="flex items-center justify-between rounded-xl border px-4 py-2.5" style={{ background: 'rgba(0,0,0,0.4)', borderColor: `${k.accent}33` }}>
            <span className="text-[12px]" style={{ color: `${k.text}cc` }}>¿Cuántos ejemplares?</span>
            <QtyStepper value={qty} max={50} onChange={setQty} label="ejemplares" />
          </div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Edición, idioma, editorial… (opcional)" className={inputCls} style={inp} />
          <div className="space-y-2.5 pt-1">
            <FieldLabel>Tus datos</FieldLabel>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre completo *" className={inputCls} style={inp} />
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Teléfono / WhatsApp" className={inputCls} style={inp} />
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email" className={inputCls} style={inp} />
            <input value={member} onChange={e => setMember(e.target.value)} placeholder="Código de lector (opcional)" className={inputCls} style={inp} />
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <PrimaryButton type="submit" disabled={busy}>{busy ? 'Enviando…' : 'Enviar encargo'}</PrimaryButton>
          <p className="text-[10px] text-center" style={{ color: `${k.text}b3` }}>Sin compromiso: primero te cotizamos.</p>
        </form>
      )}
    </ModalShell>
  );
};

/* ── Pedido (carrito + datos + confirmación) ─────────────────────────────── */
export const CartModal: React.FC<{
  ctx: ShopCtx; titlesById: Map<string, BookTitle>; cart: Record<string, number>; listName: string | null;
  setQty: (id: string, qty: number) => void; remove: (id: string) => void; clear: () => void;
  onTrack: (code: string) => void; onClose: () => void; onChanged: () => void;
}> = ({ ctx, titlesById, cart, listName, setQty, remove, clear, onTrack, onClose, onChanged }) => {
  const k = useKit(); const inp = useInputStyle();
  const s = ctx.settings;
  const pickupOn = s.pickupEnabled !== false;
  const deliveryOn = s.deliveryEnabled === true;
  const [dtype, setDtype] = useState<'retiro' | 'envio'>(pickupOn ? 'retiro' : 'envio');
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [email, setEmail] = useState('');
  const [address, setAddress] = useState(''); const [notes, setNotes] = useState('');
  const [wrap, setWrap] = useState(false); const [giftMsg, setGiftMsg] = useState('');
  const [member, setMember] = useState(''); const [discountPct, setDiscountPct] = useState(0);
  const [lookingUp, setLookingUp] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<any | null>(null);

  const lines = useMemo(() => Object.entries(cart)
    .map(([id, qty]) => ({ id, qty, t: titlesById.get(id) }))
    .filter(l => l.qty > 0), [cart, titlesById]);
  const valid = lines.filter(l => l.t && canOrder(l.t));
  const gone = lines.filter(l => !l.t || !canOrder(l.t!));
  const est = estimateOrder(valid.map(l => ({ price: l.t!.price, qty: l.qty })), {
    discountPct, deliveryType: dtype, deliveryFee: s.deliveryFee, freeShippingFrom: s.freeShippingFrom,
    giftWrap: wrap && ctx.isPro, giftWrapFee: s.giftWrapFee,
  });
  const units = valid.reduce((a, l) => a + l.qty, 0);
  const freeFrom = Number(s.freeShippingFrom) || 0;
  const missingForFree = freeFrom > 0 && dtype === 'envio' ? Math.max(freeFrom - (est.subtotal - est.discount), 0) : 0;

  const autofill = async () => {
    if (!ctx.userId || !member.trim()) return;
    setLookingUp(true); setError(null);
    try {
      const { data } = await supabase.rpc('get_books_member', { p_shop_id: ctx.userId, p_identifier: member.trim() });
      if (!data?.found) { setDiscountPct(0); return setError(ERRORS.member_not_found); }
      if (data.name && !name) setName(data.name); if (data.phone && !phone) setPhone(data.phone); if (data.email && !email) setEmail(data.email);
      setMember(data.member_code); setDiscountPct(Number(data.discount_percent) || 0);
    } catch { /* noop */ } finally { setLookingUp(false); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (ctx.isMobilePreview) return;
    if (valid.length === 0) return setError(ERRORS.empty_order);
    if (!name.trim()) return setError(ERRORS.name_required);
    if (!phone.trim() && !email.trim()) return setError(ERRORS.contact_required);
    if (dtype === 'envio' && !address.trim()) return setError(ERRORS.address_required);
    if (!ctx.userId) return setError(ERRORS.shop_not_found);
    setError(null); setBusy(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('place_books_order', {
        p_shop_id: ctx.userId, p_items: valid.map(l => ({ id: l.id, qty: l.qty })), p_name: name.trim(),
        p_phone: phone.trim() || null, p_email: email.trim() || null, p_delivery_type: dtype,
        p_address: dtype === 'envio' ? address.trim() : null, p_gift_wrap: wrap && ctx.isPro, p_gift_message: wrap ? giftMsg.trim() || null : null,
        p_notes: notes.trim() || null, p_member_code: member.trim() || null, p_list_name: listName, p_source_campaign: ctx.campaign,
      });
      if (rpcError) throw rpcError;
      if (!data?.ok) { onChanged(); return setError(errMsg(data)); }
      clear(); onChanged(); setDone(data);
    } catch (err: any) { setError(errMsg(err)); } finally { setBusy(false); }
  };

  const row = (label: string, value: string, strong?: boolean, neg?: boolean) => (
    <div key={label} className="flex items-center justify-between text-[13px]" style={{ color: strong ? '#fff' : `${k.text}aa`, fontWeight: strong ? 700 : 400 }}>
      <span>{label}</span><span style={neg ? { color: k.accentLight } : undefined}>{value}</span>
    </div>
  );

  return (
    <ModalShell title={done ? '¡Pedido enviado!' : 'Mi pedido'} onClose={onClose} wide>
      {done ? (
        <div className="py-3 text-center">
          <FaClipboardCheck className="mx-auto text-4xl mb-3" style={{ color: k.accentLight }} />
          <p className="text-white font-bold" style={{ fontFamily: k.titleFont }}>{done.items_count} libro{done.items_count === 1 ? '' : 's'} · {done.delivery_type === 'envio' ? 'Envío a domicilio' : 'Retiro en tienda'}</p>
          <p className="text-sm mt-3" style={{ color: `${k.text}b3` }}>Tu código de pedido:</p>
          <CodeBox code={done.tracking_code} />
          <div className="rounded-xl p-3.5 border text-left space-y-1.5 mb-3" style={{ background: 'rgba(255,255,255,0.03)', borderColor: `${k.accent}33` }}>
            {row('Subtotal', fmtMoney(done.subtotal))}
            {done.discount_amount > 0 && row('Descuento de lector', `− ${fmtMoney(done.discount_amount)}`, false, true)}
            {done.delivery_fee > 0 && row('Envío', fmtMoney(done.delivery_fee))}
            {done.gift_wrap_fee > 0 && row('Envoltorio de regalo', fmtMoney(done.gift_wrap_fee))}
            {row('Total', fmtMoney(done.total), true)}
          </div>
          <p className="text-[12px] mb-3" style={{ color: `${k.text}b3` }}>
            Ya apartamos tus libros. {done.hold_days ? `Los guardamos ${done.hold_days} día${done.hold_days === 1 ? '' : 's'}. ` : ''}Guarda tu código para ver el estado.
          </p>
          <div className="mb-3">
            <PaymentOptions profile={ctx.profile} ownerId={ctx.userId} reference={done.tracking_code} amount={Number(done.total)}
              title="Paga tu pedido" concept="tu pedido de libros" customer={{ name: name.trim(), phone: phone.trim(), email: email.trim() }} isMobilePreview={ctx.isMobilePreview} />
          </div>
          {done.member_code && <p className="text-[12px] mb-3" style={{ color: `${k.text}99` }}>Tu código de lector: <span className="font-mono font-bold" style={{ color: k.accentLight }}>{done.member_code}</span></p>}
          <PrimaryButton type="button" onClick={() => onTrack(done.tracking_code)}>Ver mi pedido</PrimaryButton>
        </div>
      ) : lines.length === 0 ? (
        <div className="py-8 text-center">
          <FaShoppingBag className="mx-auto text-3xl mb-3" style={{ color: `${k.text}33` }} />
          <p className="text-sm" style={{ color: `${k.text}99` }}>Tu pedido está vacío. Toca el «+» de cualquier libro para agregarlo.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {listName && <p className="text-[11px] uppercase tracking-[0.2em] font-semibold" style={{ color: k.accentLight }}>Lista: {listName}</p>}
          <div className="space-y-2.5">
            {lines.map(l => (
              <div key={l.id} className="flex items-center gap-3 rounded-xl border p-2.5" style={{ background: 'rgba(255,255,255,0.03)', borderColor: l.t && canOrder(l.t) ? `${k.text}14` : 'rgba(248,113,113,0.4)' }}>
                <div className="w-11 h-[66px] rounded overflow-hidden shrink-0">{l.t ? <BookCover t={l.t} /> : <div className="w-full h-full" style={{ background: k.bg }} />}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-white text-[13px] font-semibold leading-snug line-clamp-2" style={{ fontFamily: k.titleFont }}>{l.t?.title || 'Libro no disponible'}</p>
                  {l.t?.author && <p className="text-[10.5px] truncate" style={{ color: `${k.text}99` }}>{l.t.author}</p>}
                  {l.t && canOrder(l.t)
                    ? <div className="flex items-center justify-between mt-1.5"><QtyStepper value={Math.min(l.qty, maxQty(l.t))} max={maxQty(l.t)} onChange={v => setQty(l.id, v)} /><span className="text-white font-bold text-[13px]">{fmtMoney(l.t.price * l.qty)}</span></div>
                    : <p className="text-[11px] mt-1" style={{ color: '#f87171' }}>Ya no está disponible. Quítalo para continuar.</p>}
                </div>
                <button type="button" aria-label="Quitar del pedido" onClick={() => remove(l.id)} className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ color: `${k.text}88` }}><FaTrashAlt size={12} /></button>
              </div>
            ))}
          </div>
          {gone.length > 0 && <p className="text-[11px]" style={{ color: '#fca5a5' }}>Quita los libros no disponibles para poder enviar el pedido.</p>}

          <div>
            <FieldLabel>¿Cómo lo recibes?</FieldLabel>
            <div className="grid grid-cols-2 gap-2">
              {([['retiro', 'Retiro en tienda', <FaStore size={13} />, pickupOn], ['envio', 'Envío a domicilio', <FaTruck size={13} />, deliveryOn]] as const).map(([val, label, icon, on]) => (
                <button key={val} type="button" disabled={!on} onClick={() => setDtype(val)} aria-pressed={dtype === val}
                  className="rounded-xl border px-3 py-3 text-[12px] font-semibold flex items-center justify-center gap-2 transition disabled:opacity-35"
                  style={dtype === val ? { background: `${k.accent}22`, borderColor: k.accent, color: '#fff' } : { background: 'rgba(255,255,255,0.03)', borderColor: `${k.text}1a`, color: `${k.text}cc` }}>
                  {icon} {label}
                </button>
              ))}
            </div>
            {dtype === 'retiro' && s.pickupNote && <p className="text-[11px] mt-2" style={{ color: `${k.text}99` }}>{s.pickupNote}</p>}
            {dtype === 'envio' && (
              <div className="mt-2 space-y-1.5">
                <textarea value={address} onChange={e => setAddress(e.target.value)} rows={2} placeholder="Dirección de entrega (calle, número, referencia, ciudad)" className={inputCls} style={inp} />
                {s.deliveryNote && <p className="text-[11px]" style={{ color: `${k.text}99` }}>{s.deliveryNote}</p>}
                {missingForFree > 0 && <p className="text-[11px] font-semibold" style={{ color: k.accentLight }}>Agrega {fmtMoney(missingForFree)} más y el envío es gratis.</p>}
              </div>
            )}
          </div>

          <div className="space-y-2.5">
            <FieldLabel>Tus datos</FieldLabel>
            {ctx.isPro && (
              <div className="flex gap-2">
                <input value={member} onChange={e => { setMember(e.target.value); setDiscountPct(0); }} placeholder="¿Eres del club? Tu código (L-XXXX)" className={inputCls} style={inp} />
                <button type="button" onClick={autofill} disabled={lookingUp || !member.trim()} className="shrink-0 px-4 rounded-xl text-[11px] font-bold uppercase border disabled:opacity-40" style={{ borderColor: `${k.accent}44`, color: k.accentLight }}>{lookingUp ? '…' : 'Aplicar'}</button>
              </div>
            )}
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre completo" className={inputCls} style={inp} />
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Teléfono / WhatsApp" className={inputCls} style={inp} />
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email" className={inputCls} style={inp} />
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Notas para la librería (opcional)" className={inputCls} style={inp} />
          </div>

          {ctx.isPro && (
            <div className="rounded-xl border p-3.5" style={{ background: wrap ? `${k.accent}12` : 'rgba(255,255,255,0.03)', borderColor: wrap ? `${k.accent}66` : `${k.text}14` }}>
              <button type="button" onClick={() => setWrap(w => !w)} aria-pressed={wrap} className="w-full flex items-center gap-3 text-left">
                <span className="w-5 h-5 rounded-md border flex items-center justify-center shrink-0" style={{ borderColor: wrap ? k.accent : `${k.text}44`, background: wrap ? k.accent : 'transparent', color: k.onAccent }}>{wrap && <FaCheck size={9} />}</span>
                <span className="flex-1 min-w-0"><span className="block text-[13px] font-semibold text-white flex items-center gap-1.5"><FaGift size={11} style={{ color: k.accentLight }} /> Envolver para regalo</span>
                  <span className="block text-[10.5px]" style={{ color: `${k.text}99` }}>{(s.giftWrapFee || 0) > 0 ? `+ ${fmtMoney(s.giftWrapFee)}` : 'Sin costo'} · con tarjeta de dedicatoria</span></span>
              </button>
              {wrap && <textarea value={giftMsg} onChange={e => setGiftMsg(e.target.value)} rows={2} maxLength={400} placeholder="Mensaje de la dedicatoria" className={`${inputCls} mt-3`} style={inp} />}
            </div>
          )}

          <div className="rounded-xl p-4 border space-y-1.5" style={{ background: 'rgba(255,255,255,0.03)', borderColor: `${k.accent}33` }}>
            {row(`Libros (${units})`, fmtMoney(est.subtotal))}
            {discountPct > 0 && row(`Descuento de lector (${discountPct}%)`, `− ${fmtMoney(est.discount)}`, false, true)}
            {dtype === 'envio' && row('Envío', est.fee > 0 ? fmtMoney(est.fee) : 'Gratis')}
            {est.wrap > 0 && row('Envoltorio de regalo', fmtMoney(est.wrap))}
            <div className="h-px my-1" style={{ background: `${k.text}14` }} />
            {row('Total', fmtMoney(est.total), true)}
            <p className="text-[10px] pt-1" style={{ color: `${k.text}b3` }}>Apartamos tus libros al enviar. {s.holdDays ? `Los guardamos ${s.holdDays} día(s). ` : ''}El pago lo coordinas después.</p>
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}
          <PrimaryButton type="submit" disabled={busy || valid.length === 0 || gone.length > 0 || ctx.settings.ordersEnabled === false}>
            {busy ? 'Enviando…' : `Enviar pedido · ${fmtMoney(est.total)}`}
          </PrimaryButton>
          <GhostButton type="button" onClick={onClose}>Seguir viendo libros</GhostButton>
        </form>
      )}
    </ModalShell>
  );
};

