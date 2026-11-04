import React, { useEffect, useMemo, useState } from 'react';
import { FaToggleOn, FaToggleOff, FaLink, FaMobileAlt, FaUniversity, FaWhatsapp, FaLock, FaSave } from 'react-icons/fa';
import { supabase } from '../src/lib/supabase';
import type { PaymentGatewaysConfig } from '../types';
import { Field, adminInput, isMissingSql } from './AdminKit';

/**
 * Pasarelas de pago de Gimnasio y Hotel: las MISMAS cuatro modalidades que ya
 * tienen e-commerce, gastronomía y barbería (enlace de pago, PayPhone,
 * transferencia bancaria y WhatsApp), todas opcionales.
 *
 * ⚠️ Separación de datos (por qué hay dos destinos al guardar):
 *  - profiles.payment_gateways → SOLO lo que el visitante debe ver. La columna
 *    la lee cualquiera que abra el perfil, así que aquí PayPhone guarda solo
 *    `enabled`, nunca el token.
 *  - payment_secrets → token y Store ID de PayPhone. Sin acceso anónimo; los
 *    lee únicamente la Edge Function payphone-process con la llave de servicio.
 */

interface Props {
  userId: string;
  profileData: any;
  setProfileData?: React.Dispatch<React.SetStateAction<any>>;
  showNotification: (message: string, type: 'success' | 'error') => void;
  accent: string;
  onAccent: string;
  titleFont?: string;
}

type GwKey = 'directLink' | 'payphone' | 'bankTransfer' | 'whatsapp';

const normalize = (raw: any): PaymentGatewaysConfig => (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {});
const isHttp = (u?: string) => { try { const p = new URL(String(u)); return p.protocol === 'https:' || p.protocol === 'http:'; } catch { return false; } };

export const PaymentGatewaysPanel: React.FC<Props> = ({ userId, profileData, setProfileData, showNotification, accent, onAccent, titleFont }) => {
  const saved = useMemo(() => normalize(profileData?.payment_gateways), [profileData?.payment_gateways]);
  const [cfg, setCfg] = useState<PaymentGatewaysConfig>(saved);
  const [token, setToken] = useState('');
  const [storeId, setStoreId] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [secretsMissing, setSecretsMissing] = useState(false);

  // Lo ya guardado de PayPhone (solo el dueño puede leer su fila).
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase.from('payment_secrets').select('payphone_token, payphone_client_id').eq('profile_id', userId).maybeSingle();
      if (!alive) return;
      if (error) { if (isMissingSql(error)) setSecretsMissing(true); return; }
      if (data) { setToken(data.payphone_token || ''); setStoreId(data.payphone_client_id || ''); }
    })();
    return () => { alive = false; };
  }, [userId]);
  useEffect(() => { setCfg(saved); setDirty(false); }, [saved]);

  const on = (k: GwKey) => !!(cfg[k] as any)?.enabled;
  const toggle = (k: GwKey) => { setCfg(c => ({ ...c, [k]: { ...(c[k] as any), enabled: !(c[k] as any)?.enabled } })); setDirty(true); };
  const set = (k: GwKey, field: string, value: string) => { setCfg(c => ({ ...c, [k]: { ...(c[k] as any), [field]: value } })); setDirty(true); };

  const save = async () => {
    // Un método encendido a medias dejaría un botón roto en el perfil público: se exige completo.
    if (on('directLink') && !isHttp(cfg.directLink?.url)) return showNotification('El enlace de pago debe empezar con https://', 'error');
    if (on('payphone') && (!token.trim() || !storeId.trim())) return showNotification('Para activar PayPhone completa el token y el Store ID.', 'error');
    if (on('bankTransfer') && !(cfg.bankTransfer?.accountNumber || '').trim()) return showNotification('Escribe el número de cuenta para la transferencia.', 'error');
    if (on('whatsapp') && !(cfg.whatsapp?.phone || '').replace(/\D/g, '')) return showNotification('Escribe el número de WhatsApp que recibirá los comprobantes.', 'error');

    const publicCfg: PaymentGatewaysConfig = { ...cfg, payphone: { enabled: on('payphone') } };   // sin token ni Store ID
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ payment_gateways: publicCfg }).eq('id', userId);
    if (error) { setSaving(false); return showNotification(isMissingSql(error) ? 'Falta ejecutar el SQL de la plantilla en Supabase.' : `No se pudo guardar: ${error.message}`, 'error'); }

    if (token.trim() || storeId.trim() || on('payphone')) {
      const { error: sErr } = await supabase.from('payment_secrets').upsert({ profile_id: userId, payphone_token: token.trim() || null, payphone_client_id: storeId.trim() || null, updated_at: new Date().toISOString() }, { onConflict: 'profile_id' });
      if (sErr) { setSaving(false); return showNotification(isMissingSql(sErr) ? 'Falta ejecutar el SQL de la plantilla para guardar las credenciales de PayPhone.' : `No se pudieron guardar las credenciales: ${sErr.message}`, 'error'); }
    }
    setSaving(false);
    setProfileData?.((p: any) => ({ ...p, payment_gateways: publicCfg }));
    setDirty(false);
    showNotification('Pasarelas de pago guardadas.', 'success');
  };

  const card = (k: GwKey, icon: React.ReactNode, title: string, desc: string, fields: React.ReactNode) => (
    <div className="rounded-2xl border p-4 transition" style={{ background: on(k) ? `${accent}0d` : 'rgba(255,255,255,0.03)', borderColor: on(k) ? `${accent}55` : 'rgba(255,255,255,0.08)' }}>
      <button type="button" onClick={() => toggle(k)} className="w-full flex items-center gap-3 text-left" aria-pressed={on(k)}>
        <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${accent}1a`, color: accent }}>{icon}</span>
        <span className="min-w-0 flex-1"><span className="block text-white font-bold text-sm">{title}</span><span className="block text-[11px] text-white/45">{desc}</span></span>
        {on(k) ? <FaToggleOn size={22} style={{ color: accent }} /> : <FaToggleOff size={22} className="text-white/30" />}
      </button>
      {on(k) && <div className="mt-3 pt-3 border-t border-white/5 space-y-2.5">{fields}</div>}
    </div>
  );

  const activeCount = (['directLink', 'payphone', 'bankTransfer', 'whatsapp'] as GwKey[]).filter(on).length;

  return (
    <div className="rounded-2xl border p-5 space-y-4" style={{ background: `${accent}0a`, borderColor: `${accent}2b` }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-white flex items-center gap-2" style={titleFont ? { fontFamily: titleFont } : undefined}>💳 Pasarelas de pago</p>
          <p className="text-[12px] text-white/45 mt-1">Opcional. Activa las formas de cobro que quieras ofrecer: tus clientes las verán justo al reservar o inscribirse.</p>
        </div>
        <span className="text-[10px] font-black uppercase tracking-widest rounded-full px-2.5 py-1 shrink-0" style={{ background: `${accent}26`, color: accent }}>{activeCount} activa{activeCount === 1 ? '' : 's'}</span>
      </div>

      {card('directLink', <FaLink />, 'Enlace de pago', 'Un botón que lleva a tu página de cobro (banco, Datafast, etc.).', <>
        <Field label="Texto del botón"><input className={adminInput} value={cfg.directLink?.name ?? ''} onChange={e => set('directLink', 'name', e.target.value)} placeholder="Pagar con tarjeta" /></Field>
        <Field label="Enlace *" hint="Se le añade el monto y la referencia como parámetros."><input className={adminInput} value={cfg.directLink?.url ?? ''} onChange={e => set('directLink', 'url', e.target.value)} placeholder="https://pagos.mibanco.com/mi-negocio" /></Field>
      </>)}

      {card('payphone', <FaMobileAlt />, 'PayPhone', 'Cobro con tarjeta o PayPhone dentro de la pasarela.', <>
        <p className="text-[11px] flex items-center gap-1.5 text-white/50"><FaLock size={10} style={{ color: accent }} /> El token se guarda cifrado aparte y nunca viaja al perfil público.</p>
        {secretsMissing && <p className="text-[11px] text-amber-400">Falta ejecutar el SQL de la plantilla para guardar las credenciales.</p>}
        <Field label="Token de PayPhone *"><input type="password" autoComplete="off" className={adminInput} value={token} onChange={e => { setToken(e.target.value); setDirty(true); }} placeholder="Token del comercio" /></Field>
        <Field label="Store ID *"><input className={adminInput} value={storeId} onChange={e => { setStoreId(e.target.value); setDirty(true); }} placeholder="ID de tu tienda en PayPhone" /></Field>
      </>)}

      {card('bankTransfer', <FaUniversity />, 'Transferencia bancaria', 'Muestra tus datos de cuenta; el cliente envía el comprobante por WhatsApp.', <>
        <Field label="Banco"><input className={adminInput} value={cfg.bankTransfer?.bank ?? ''} onChange={e => set('bankTransfer', 'bank', e.target.value)} placeholder="Banco Pichincha" /></Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Tipo de cuenta"><input className={adminInput} value={cfg.bankTransfer?.accountType ?? ''} onChange={e => set('bankTransfer', 'accountType', e.target.value)} placeholder="Ahorros" /></Field>
          <Field label="N.º de cuenta *"><input className={adminInput} value={cfg.bankTransfer?.accountNumber ?? ''} onChange={e => set('bankTransfer', 'accountNumber', e.target.value)} /></Field>
        </div>
        <Field label="Titular"><input className={adminInput} value={cfg.bankTransfer?.holder ?? ''} onChange={e => set('bankTransfer', 'holder', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Cédula / RUC"><input className={adminInput} value={cfg.bankTransfer?.idNumber ?? ''} onChange={e => set('bankTransfer', 'idNumber', e.target.value)} /></Field>
          <Field label="Email del comprobante"><input className={adminInput} value={cfg.bankTransfer?.email ?? ''} onChange={e => set('bankTransfer', 'email', e.target.value)} /></Field>
        </div>
      </>)}

      {card('whatsapp', <FaWhatsapp />, 'WhatsApp', 'El cliente te escribe con el monto y la referencia ya redactados.', <>
        <Field label="Número que recibe los comprobantes *"><input className={adminInput} value={cfg.whatsapp?.phone ?? ''} onChange={e => set('whatsapp', 'phone', e.target.value)} placeholder="0991234567" /></Field>
      </>)}

      <button type="button" onClick={save} disabled={!dirty || saving} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider disabled:opacity-40" style={{ background: accent, color: onAccent }}>
        <FaSave size={11} /> {saving ? 'Guardando…' : 'Guardar pasarelas'}
      </button>
    </div>
  );
};

export default PaymentGatewaysPanel;
