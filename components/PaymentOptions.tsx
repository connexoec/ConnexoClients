import React, { useState } from 'react';
import { FaLink, FaMobileAlt, FaUniversity, FaWhatsapp, FaCopy, FaCheck } from 'react-icons/fa';
import { supabase } from '../src/lib/supabase';
import type { PaymentGatewaysConfig } from '../types';
import { useKit, fmtMoney, waDigits } from './PublicKit';

/**
 * «Paga ahora» del perfil público de Gimnasio y Hotel: muestra SOLO las
 * modalidades que el dueño activó (enlace de pago, PayPhone, transferencia y
 * WhatsApp). Es el mismo menú de cobro que ya tienen ecom/gastro/barbería.
 *
 * Nada de aquí confirma un pago: son formas de pagar. El dueño valida el cobro
 * (estado de pago de la reserva, renovación del socio) cuando le llega el pago
 * o el comprobante. Si no hay ninguna modalidad activa, se ofrece coordinar el
 * pago por el WhatsApp del perfil (si lo tiene); si tampoco, no se dibuja nada.
 */

interface Props {
  profile: any;
  ownerId?: string | null;
  amount: number;
  /** Código que identifica el cobro (código de reserva, de rastreo o de carnet). */
  reference: string;
  /** Qué se está pagando, en palabras del cliente: «tu depósito», «tu plan Mensual». */
  concept: string;
  title?: string;
  customer?: { name?: string; phone?: string; email?: string };
  isMobilePreview?: boolean;
}

const normalize = (raw: any): PaymentGatewaysConfig => (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {});
const safeUrl = (u?: string) => { try { const p = new URL(String(u)); return p.protocol === 'https:' || p.protocol === 'http:' ? p : null; } catch { return null; } };

export const PaymentOptions: React.FC<Props> = ({ profile, ownerId, amount, reference, concept, title = 'Paga ahora', customer, isMobilePreview }) => {
  const k = useKit();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!(amount > 0)) return null;
  const gw = normalize(profile?.payment_gateways);
  const link = gw.directLink?.enabled ? safeUrl(gw.directLink.url) : null;
  const phoneOn = !!gw.payphone?.enabled && !!ownerId;
  const bank = gw.bankTransfer?.enabled && (gw.bankTransfer.accountNumber || '').trim() ? gw.bankTransfer : null;
  const waOn = gw.whatsapp?.enabled && waDigits(gw.whatsapp.phone) ? gw.whatsapp : null;
  const anyMethod = !!(link || phoneOn || bank || waOn);
  const waNumber = waDigits(waOn?.phone) || waDigits(profile?.whatsapp);
  if (!anyMethod && !waNumber) return null;

  const msg = `Hola, quiero pagar ${concept}. Monto: ${fmtMoney(amount)}. Referencia: ${reference}.${customer?.name ? ` Soy ${customer.name}.` : ''}`;
  const receiptMsg = `Hola, adjunto el comprobante de pago de ${concept}. Monto: ${fmtMoney(amount)}. Referencia: ${reference}.${customer?.name ? ` Soy ${customer.name}.` : ''}`;
  const wa = (text: string) => `https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`;

  const linkHref = () => {
    if (!link) return '#';
    const u = new URL(link.toString());
    u.searchParams.set('amount', String(amount));
    u.searchParams.set('ref', reference);
    return u.toString();
  };

  const payWithPayphone = async () => {
    if (isMobilePreview || busy) return;
    setBusy(true); setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('payphone-process', {
        body: { profile_id: ownerId, amount, orderId: reference, reference: `${concept} · ${reference}`, customer: { email: customer?.email, phone: customer?.phone }, responseUrl: window.location.href, cancellationUrl: window.location.href },
      });
      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.error);
      if (!data?.payUrl) throw new Error('La pasarela no devolvió un enlace de pago.');
      window.location.assign(data.payUrl);
    } catch (e: any) {
      setError(e?.message?.includes('Failed to send') ? 'PayPhone no está disponible por ahora. Prueba otro método.' : (e?.message || 'No pudimos iniciar el pago.'));
    } finally { setBusy(false); }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(String(bank?.accountNumber || '')); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* sin portapapeles: el número sigue visible */ }
  };

  const btn = 'w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-[12px] font-bold uppercase tracking-[0.14em] transition hover:brightness-110 disabled:opacity-50';
  const primary = { background: k.accent, color: k.onAccent, fontFamily: k.titleFont } as React.CSSProperties;
  const ghost = { border: `1px solid ${k.accent}66`, color: k.text, fontFamily: k.titleFont } as React.CSSProperties;

  return (
    <div className="rounded-2xl border p-4 text-left space-y-3" style={{ background: 'rgba(255,255,255,0.03)', borderColor: `${k.accent}44` }}>
      <div className="flex items-end justify-between gap-3">
        <div><p className="text-[10px] uppercase tracking-[0.3em] font-semibold" style={{ color: k.accentLight }}>{title}</p><p className="text-[12px] mt-0.5" style={{ color: `${k.text}99` }}>{concept}</p></div>
        <p className="text-2xl font-bold text-white leading-none" style={{ fontFamily: k.titleFont }}>{fmtMoney(amount)}</p>
      </div>

      {link && (
        <a href={linkHref()} target="_blank" rel="noopener noreferrer" onClick={e => { if (isMobilePreview) e.preventDefault(); }} className={btn} style={primary}>
          <FaLink size={12} /> {gw.directLink?.name?.trim() || 'Pagar en línea'}
        </a>
      )}

      {phoneOn && (
        <button type="button" onClick={payWithPayphone} disabled={busy} className={btn} style={link ? ghost : primary}>
          <FaMobileAlt size={12} /> {busy ? 'Abriendo PayPhone…' : 'Pagar con PayPhone'}
        </button>
      )}
      {error && <p className="text-red-400 text-xs">{error}</p>}

      {bank && (
        <div className="rounded-xl border p-3.5 space-y-2" style={{ background: 'rgba(0,0,0,0.25)', borderColor: `${k.text}14` }}>
          <p className="text-[11px] font-bold uppercase tracking-widest flex items-center gap-1.5" style={{ color: k.accentLight }}><FaUniversity size={11} /> Transferencia bancaria</p>
          <dl className="text-[12px] space-y-1" style={{ color: `${k.text}cc` }}>
            {bank.bank && <div className="flex justify-between gap-3"><dt style={{ color: `${k.text}77` }}>Banco</dt><dd className="font-semibold text-right">{bank.bank}</dd></div>}
            {bank.accountType && <div className="flex justify-between gap-3"><dt style={{ color: `${k.text}77` }}>Tipo</dt><dd className="font-semibold text-right">{bank.accountType}</dd></div>}
            <div className="flex justify-between gap-3 items-center"><dt style={{ color: `${k.text}77` }}>Cuenta</dt>
              <dd className="font-mono font-bold text-right flex items-center gap-2">{bank.accountNumber}
                <button type="button" onClick={copy} aria-label="Copiar número de cuenta" className="w-7 h-7 rounded-md flex items-center justify-center border" style={{ borderColor: `${k.accent}55`, color: k.accentLight }}>{copied ? <FaCheck size={10} /> : <FaCopy size={10} />}</button></dd></div>
            {bank.holder && <div className="flex justify-between gap-3"><dt style={{ color: `${k.text}77` }}>Titular</dt><dd className="font-semibold text-right">{bank.holder}</dd></div>}
            {bank.idNumber && <div className="flex justify-between gap-3"><dt style={{ color: `${k.text}77` }}>Cédula / RUC</dt><dd className="font-semibold text-right">{bank.idNumber}</dd></div>}
            {bank.email && <div className="flex justify-between gap-3"><dt style={{ color: `${k.text}77` }}>Comprobante a</dt><dd className="font-semibold text-right break-all">{bank.email}</dd></div>}
          </dl>
          {waNumber && (
            <a href={wa(receiptMsg)} target="_blank" rel="noopener noreferrer" onClick={e => { if (isMobilePreview) e.preventDefault(); }}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[12px] font-bold border text-[#25D366] border-[#25D366]/30 hover:bg-[#25D366]/10 transition">
              <FaWhatsapp /> Enviar comprobante por WhatsApp
            </a>
          )}
        </div>
      )}

      {(waOn || (!anyMethod && waNumber)) && !bank && (
        <a href={wa(waOn ? receiptMsg : msg)} target="_blank" rel="noopener noreferrer" onClick={e => { if (isMobilePreview) e.preventDefault(); }}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-[12px] font-bold border text-[#25D366] border-[#25D366]/30 hover:bg-[#25D366]/10 transition">
          <FaWhatsapp /> {waOn ? 'Enviar comprobante por WhatsApp' : 'Coordinar el pago por WhatsApp'}
        </a>
      )}
    </div>
  );
};

export default PaymentOptions;
