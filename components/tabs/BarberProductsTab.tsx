import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../src/lib/supabase';
import type { BarberRetailProduct, BarberPaymentGatewaysConfig } from '../../types';
import {
  FaPlus, FaTrash, FaPen, FaImage, FaTimes, FaSave,
  FaToggleOn, FaToggleOff, FaCreditCard, FaChevronDown, FaChevronUp,
  FaLink, FaMobileAlt, FaUniversity, FaWhatsapp, FaBoxOpen,
} from 'react-icons/fa';
import { ProductSubscriptionField } from '../ProductSubscriptionField';
import { cleanSubscription } from '../../src/lib/memberPlans';

const PRODUCT_CATEGORIES = ['Cuidado de barba', 'Cuidado de cabello', 'Pomadas & Ceras', 'Afeitado', 'Accesorios', 'Kits & Combos', 'Otros'];

type GwKey = 'direct_link' | 'payphone' | 'bank_transfer' | 'whatsapp_manual';

const emptyForm = (): Partial<BarberRetailProduct> => ({
  name: '', category: '', price: '', shortDescription: '', imageURL: '', available: true, stock: undefined,
});

/** La columna puede venir null, {} o (por error) un array: normaliza a objeto. */
const normalizeGw = (raw: any): BarberPaymentGatewaysConfig =>
  raw && !Array.isArray(raw) && typeof raw === 'object' ? raw : {};

interface Props {
  user: any;
  profileData: any;
  setProfileData: React.Dispatch<React.SetStateAction<any>>;
  showNotification: (message: string, type: 'success' | 'error') => void;
}

export const BarberProductsTab: React.FC<Props> = ({ user, profileData, setProfileData, showNotification }) => {
  const products: BarberRetailProduct[] = Array.isArray(profileData?.barber_products) ? profileData.barber_products : [];

  const [editing, setEditing] = useState<BarberRetailProduct | null>(null);
  const [form, setForm] = useState<Partial<BarberRetailProduct>>(emptyForm());
  const [isOpen, setIsOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // --- Pasarelas de pago (profiles.barber_gateways) ---
  const [showGateways, setShowGateways] = useState(false);
  const [gwConfig, setGwConfig] = useState<BarberPaymentGatewaysConfig>(normalizeGw(profileData?.barber_gateways));
  const [savingGateways, setSavingGateways] = useState(false);

  // Credenciales de PayPhone: viven en `barber_payment_secrets`, NO en
  // `barber_gateways` (esa columna la lee cualquier visitante del perfil público).
  const [ppToken, setPpToken] = useState('');
  const [ppClientId, setPpClientId] = useState('');

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('barber_payment_secrets')
        .select('payphone_token, payphone_client_id')
        .eq('profile_id', user.id)
        .maybeSingle();
      if (cancelled || !data) return;
      setPpToken(data.payphone_token || '');
      setPpClientId(data.payphone_client_id || '');
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const openNew = () => { setEditing(null); setForm(emptyForm()); setIsOpen(true); };
  const openEdit = (p: BarberRetailProduct) => { setEditing(p); setForm({ ...p }); setIsOpen(true); };
  const closeModal = () => { setEditing(null); setForm(emptyForm()); setIsOpen(false); };

  const persistProducts = async (list: BarberRetailProduct[]) => {
    const { error } = await supabase.from('profiles').update({ barber_products: list }).eq('id', user.id);
    if (error) throw error;
    setProfileData((prev: any) => ({ ...prev, barber_products: list }));
  };

  const handleImageUpload = async (file: File) => {
    if (!user?.id) return;
    const slotId = editing?.id || `tmp_${Date.now()}`;
    setUploading(true);
    try {
      await supabase.storage.from('assets').upload(`barber_products/${user.id}/${slotId}`, file, { upsert: true });
      const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(`barber_products/${user.id}/${slotId}`);
      setForm(prev => ({ ...prev, imageURL: `${publicUrl}?v=${Date.now()}` }));
    } catch (err: any) {
      showNotification(`Error al subir imagen: ${err?.message}`, 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!form.name?.trim()) { showNotification('El nombre del producto es requerido.', 'error'); return; }
    setSaving(true);
    try {
      const id = editing?.id || Date.now().toString();
      const updated: BarberRetailProduct = {
        id,
        name: form.name.trim(),
        category: form.category?.trim() || '',
        price: form.price?.trim() || '',
        shortDescription: form.shortDescription?.trim() || '',
        imageURL: form.imageURL || '',
        available: form.available !== false,
        stock: form.stock != null && (form.stock as any) !== '' ? Number(form.stock) : undefined,
        // Faltaba: sin esta linea el interruptor de suscripcion se activaba
        // en pantalla y el campo se descartaba al guardar.
        subscription: cleanSubscription(form.subscription),
      };
      const list = editing
        ? products.map(p => p.id === editing.id ? updated : p)
        : [...products, updated];
      await persistProducts(list);
      showNotification(editing ? 'Producto actualizado' : 'Producto agregado', 'success');
      closeModal();
    } catch (err: any) {
      showNotification(`Error: ${err?.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleAvailable = async (p: BarberRetailProduct) => {
    const list = products.map(x => x.id === p.id ? { ...x, available: !(x.available !== false) } : x);
    setProfileData((prev: any) => ({ ...prev, barber_products: list }));
    await supabase.from('profiles').update({ barber_products: list }).eq('id', user.id);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Eliminar este producto?')) return;
    try {
      await persistProducts(products.filter(p => p.id !== id));
      showNotification('Producto eliminado', 'success');
    } catch (err: any) {
      showNotification(`Error: ${err?.message}`, 'error');
    }
  };

  const toggleGw = (key: GwKey) => {
    setGwConfig(prev => ({ ...prev, [key]: { ...(prev as any)[key], enabled: !(prev as any)[key]?.enabled } } as BarberPaymentGatewaysConfig));
  };
  const updateGw = (key: GwKey, field: string, value: string) => {
    setGwConfig(prev => ({ ...prev, [key]: { ...(prev as any)[key], [field]: value } } as BarberPaymentGatewaysConfig));
  };
  const gwActiveCount = (['direct_link', 'payphone', 'bank_transfer', 'whatsapp_manual'] as GwKey[])
    .filter(k => (gwConfig as any)[k]?.enabled).length;

  const handleSaveGateways = async () => {
    setSavingGateways(true);
    try {
      // Blindaje: aunque la UI ya no los escribe, nunca dejamos que un secreto
      // se cuele en la columna pública.
      const safeConfig: BarberPaymentGatewaysConfig = {
        ...gwConfig,
        payphone: gwConfig.payphone?.enabled ? { enabled: true } : undefined,
      };
      const { error } = await supabase.from('profiles').update({ barber_gateways: safeConfig }).eq('id', user.id);
      if (error) throw error;

      if (safeConfig.payphone?.enabled) {
        const { error: secretError } = await supabase
          .from('barber_payment_secrets')
          .upsert({
            profile_id: user.id,
            payphone_token: ppToken.trim(),
            payphone_client_id: ppClientId.trim(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'profile_id' });
        if (secretError) throw secretError;
      }

      setGwConfig(safeConfig);
      setProfileData((prev: any) => ({ ...prev, barber_gateways: safeConfig }));
      showNotification('Pasarelas de pago guardadas', 'success');
    } catch (err: any) {
      showNotification(`Error: ${err?.message}`, 'error');
    } finally {
      setSavingGateways(false);
    }
  };

  const categories = [...new Set(products.map(p => p.category?.trim() || 'Sin categoría').filter(Boolean))];

  const modal = isOpen && createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={closeModal}
    >
      <div
        className="bg-[#0f0702] border border-[#ffa35d]/20 rounded-2xl w-full max-w-lg shadow-2xl max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-white/5 sticky top-0 bg-[#0f0702] z-10">
          <h3 className="font-black font-tomorrow text-[#ffa35d] uppercase tracking-wider text-sm">
            {editing ? 'Editar producto' : 'Nuevo producto'}
          </h3>
          <button onClick={closeModal} className="text-white/40 hover:text-white transition"><FaTimes /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Imagen */}
          <div className="flex items-center gap-4">
            {form.imageURL ? (
              <img src={form.imageURL} className="w-20 h-20 rounded-xl object-cover border border-[#ffa35d]/20 shrink-0" alt="preview" />
            ) : (
              <div className="w-20 h-20 rounded-xl bg-white/5 border border-dashed border-white/20 flex items-center justify-center text-white/30 shrink-0">
                <FaImage className="text-2xl" />
              </div>
            )}
            <label className="flex-1 cursor-pointer">
              <input type="file" accept="image/*" className="hidden"
                onChange={e => e.target.files?.[0] && handleImageUpload(e.target.files[0])} />
              <span className="block text-center text-xs py-2.5 px-4 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white hover:border-[#ffa35d]/40 transition select-none">
                {uploading ? 'Subiendo...' : form.imageURL ? 'Cambiar foto' : 'Subir foto'}
              </span>
            </label>
          </div>

          <input
            value={form.name || ''}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            placeholder="Nombre del producto *"
            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#ffa35d]/50"
          />

          <div>
            <input
              list="barber-prod-cats"
              value={form.category || ''}
              onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
              placeholder="Categoría (ej. Pomadas & Ceras...)"
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#ffa35d]/50"
            />
            <datalist id="barber-prod-cats">
              {PRODUCT_CATEGORIES.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <input
              value={form.price || ''}
              onChange={e => setForm(p => ({ ...p, price: e.target.value }))}
              placeholder="Precio (ej. $12)"
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#ffa35d]/50"
            />
            <input
              type="number" min="0"
              value={form.stock ?? ''}
              onChange={e => setForm(p => ({ ...p, stock: e.target.value === '' ? undefined : Number(e.target.value) }))}
              placeholder="Stock (opcional)"
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#ffa35d]/50"
            />
          </div>

          <textarea
            value={form.shortDescription || ''}
            onChange={e => setForm(p => ({ ...p, shortDescription: e.target.value }))}
            placeholder="Descripción corta (opcional)"
            rows={2}
            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#ffa35d]/50 resize-none"
          />

          <ProductSubscriptionField accent="#ffa35d"
            value={form.subscription} onChange={v => setForm(p => ({ ...p, subscription: v }))} />

          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-sm text-white/70 font-medium">Disponible para clientes</p>
              <p className="text-[11px] text-white/30 mt-0.5">Los clientes verán este producto en tu perfil</p>
            </div>
            <button
              type="button"
              onClick={() => setForm(p => ({ ...p, available: p.available === false ? true : false }))}
              className={`text-3xl transition-colors ${form.available !== false ? 'text-green-400' : 'text-white/20'}`}
            >
              {form.available !== false ? <FaToggleOn /> : <FaToggleOff />}
            </button>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={closeModal}
              className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-bold uppercase tracking-wider active:scale-95 transition-all">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving || uploading}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[#ff6b35] to-[#ffa35d] text-black text-xs font-black uppercase tracking-wider disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95 transition-all">
              <FaSave /> {saving ? 'Guardando...' : editing ? 'Actualizar' : 'Agregar'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );

  const inputCls = "w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#ffa35d]/50";
  const gwCard = (gwKey: GwKey, icon: React.ReactNode, title: string, desc: string, fields: React.ReactNode) => {
    const on = !!(gwConfig as any)[gwKey]?.enabled;
    return (
      <div className={`rounded-2xl border p-3.5 transition-colors ${on ? 'bg-[#ffa35d]/[0.04] border-[#ffa35d]/25' : 'bg-black/20 border-white/[0.08]'}`}>
        <button type="button" onClick={() => toggleGw(gwKey)} className="w-full flex items-center gap-3 text-left">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${on ? 'bg-[#ffa35d]/15 text-[#ffa35d]' : 'bg-white/5 text-white/40'}`}>{icon}</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-white">{title}</p>
            <p className="text-[11px] text-white/40 mt-0.5 truncate">{desc}</p>
          </div>
          {on ? <FaToggleOn className="text-[#ffa35d] text-2xl shrink-0" /> : <FaToggleOff className="text-white/25 text-2xl shrink-0" />}
        </button>
        {on && <div className="mt-3 space-y-2">{fields}</div>}
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto px-4 md:px-6 pb-32" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      {modal}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#ffa35d]/15 pb-5">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2">
            🧴 Productos
          </h2>
          <p className="text-sm text-white/40 mt-1">
            Tu tienda: productos de venta, precios y stock. Independiente de tus servicios.
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white bg-[#ffa35d] hover:bg-[#e8902a] rounded-xl transition-all shadow-lg shadow-[#ffa35d]/15">
          <FaPlus /> Agregar producto
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Productos', value: products.length, color: 'text-white' },
          { label: 'Disponibles', value: products.filter(p => p.available !== false).length, color: 'text-green-400' },
          { label: 'No disponibles', value: products.filter(p => p.available === false).length, color: 'text-red-400' },
        ].map(k => (
          <div key={k.label} className="bg-white/5 border border-white/5 rounded-xl p-4">
            <p className={`text-2xl font-black ${k.color}`}>{k.value}</p>
            <p className="text-[11px] text-white/40 uppercase tracking-widest font-bold mt-0.5">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Pasarelas de pago */}
      <div className="bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden">
        <button
          onClick={() => setShowGateways(v => !v)}
          className="w-full flex items-center justify-between p-4 text-left"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#ffa35d]/10 flex items-center justify-center">
              <FaCreditCard className="text-[#ffa35d] text-sm" />
            </div>
            <div>
              <p className="text-sm font-black text-white">Pasarelas de pago</p>
              <p className="text-[11px] text-white/40 mt-0.5">
                {gwActiveCount > 0
                  ? `${gwActiveCount} método${gwActiveCount !== 1 ? 's' : ''} de pago activo${gwActiveCount !== 1 ? 's' : ''}`
                  : 'Sin métodos de pago activos'}
              </p>
            </div>
          </div>
          <span className="text-white/30">{showGateways ? <FaChevronUp size={12} /> : <FaChevronDown size={12} />}</span>
        </button>

        {showGateways && (
          <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
            <p className="text-xs text-white/50 leading-relaxed">
              Activa los métodos que quieras ofrecer. El cliente verá únicamente los activos al pedir un producto o servicio.
            </p>

            <div className="space-y-2.5">
              {gwCard('direct_link', <FaLink size={13} />, 'Link Directo / Botón de Pago', 'URL pública de cobro de tu banco o pasarela', (
                <>
                  <input className={inputCls} placeholder='Etiqueta (ej. "Pagar con tarjeta")'
                    value={(gwConfig.direct_link as any)?.label ?? ''} onChange={e => updateGw('direct_link', 'label', e.target.value)} />
                  <input className={inputCls} placeholder="https://pagos.tubanco.com/..."
                    value={(gwConfig.direct_link as any)?.url ?? ''} onChange={e => updateGw('direct_link', 'url', e.target.value)} />
                </>
              ))}

              {gwCard('payphone', <FaMobileAlt size={13} />, 'PayPhone / Pasarela API', 'Credenciales del comercio (token + Client ID)', (
                <>
                  <input className={inputCls} type="password" autoComplete="off" placeholder="Token del comercio"
                    value={ppToken} onChange={e => setPpToken(e.target.value)} />
                  <input className={inputCls} placeholder="Client ID (Store ID)"
                    value={ppClientId} onChange={e => setPpClientId(e.target.value)} />
                  <p className="text-[10px] text-white/40 leading-relaxed">
                    🔒 Tus credenciales se guardan aparte del perfil público: nunca se envían al navegador de tus clientes.
                  </p>
                  <p className="text-[10px] text-amber-400/70 leading-relaxed">
                    Requiere la Edge Function <span className="font-mono">payphone-process</span> desplegada en Supabase. Sin ella, el botón avisa al cliente y no cobra.
                  </p>
                </>
              ))}

              {gwCard('bank_transfer', <FaUniversity size={13} />, 'Transferencia Bancaria', 'Datos de la cuenta para depósito/transferencia', (
                <>
                  <input className={inputCls} placeholder="Banco (ej. Pichincha)"
                    value={(gwConfig.bank_transfer as any)?.bank_name ?? ''} onChange={e => updateGw('bank_transfer', 'bank_name', e.target.value)} />
                  <div className="grid grid-cols-2 gap-2">
                    <input className={inputCls} placeholder="Tipo (Ahorros)"
                      value={(gwConfig.bank_transfer as any)?.account_type ?? ''} onChange={e => updateGw('bank_transfer', 'account_type', e.target.value)} />
                    <input className={inputCls} placeholder="N° de cuenta"
                      value={(gwConfig.bank_transfer as any)?.account_number ?? ''} onChange={e => updateGw('bank_transfer', 'account_number', e.target.value)} />
                  </div>
                  <input className={inputCls} placeholder="Titular de la cuenta"
                    value={(gwConfig.bank_transfer as any)?.holder ?? ''} onChange={e => updateGw('bank_transfer', 'holder', e.target.value)} />
                  <div className="grid grid-cols-2 gap-2">
                    <input className={inputCls} placeholder="Cédula / RUC"
                      value={(gwConfig.bank_transfer as any)?.id_number ?? ''} onChange={e => updateGw('bank_transfer', 'id_number', e.target.value)} />
                    <input className={inputCls} placeholder="Email"
                      value={(gwConfig.bank_transfer as any)?.email ?? ''} onChange={e => updateGw('bank_transfer', 'email', e.target.value)} />
                  </div>
                </>
              ))}

              {gwCard('whatsapp_manual', <FaWhatsapp size={13} />, 'WhatsApp / Pago Manual', 'Número que recibe los pedidos y comprobantes', (
                <input className={inputCls} placeholder="0963038666"
                  value={(gwConfig.whatsapp_manual as any)?.phone ?? ''} onChange={e => updateGw('whatsapp_manual', 'phone', e.target.value)} />
              ))}
            </div>

            <button onClick={handleSaveGateways} disabled={savingGateways}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#ff6b35] to-[#ffa35d] text-black text-xs font-black uppercase tracking-wider disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95 transition-all">
              <FaSave /> {savingGateways ? 'Guardando...' : 'Guardar pasarelas'}
            </button>
          </div>
        )}
      </div>

      {/* Lista de productos por categoría */}
      {products.length === 0 ? (
        <div className="text-center py-20 text-white/30">
          <p className="text-5xl mb-4">🧴</p>
          <p className="text-sm font-medium">Aún no tienes productos.</p>
          <p className="text-xs mt-1">Agrega tu primer producto para venderlo desde tu perfil.</p>
          <button onClick={openNew}
            className="mt-6 px-6 py-3 rounded-xl bg-[#ffa35d] text-black font-black text-xs uppercase tracking-wider">
            Agregar producto
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {categories.map(cat => (
            <div key={cat}>
              <p className="text-[11px] text-[#ffa35d]/70 font-black font-tomorrow uppercase tracking-widest mb-3 flex items-center gap-2">
                <span className="h-px flex-1 bg-[#ffa35d]/10" />
                {cat}
                <span className="h-px flex-1 bg-[#ffa35d]/10" />
              </p>
              <div className="space-y-2">
                {products.filter(p => (p.category?.trim() || 'Sin categoría') === cat).map(p => (
                  <div
                    key={p.id}
                    className={`flex items-center gap-4 border rounded-xl p-4 transition-all group ${
                      p.available === false
                        ? 'border-white/5 bg-white/[0.02] opacity-60'
                        : 'border-[#ffa35d]/10 bg-white/5 hover:border-[#ffa35d]/30'
                    }`}
                  >
                    {p.imageURL ? (
                      <img src={p.imageURL} className="w-14 h-14 rounded-xl object-cover shrink-0 border border-white/10" alt={p.name} />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-[#ffa35d]/10 flex items-center justify-center text-lg text-[#ffa35d] shrink-0">
                        <FaBoxOpen />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-black text-white text-sm font-tomorrow">{p.name}</p>
                        {p.available === false && (
                          <span className="text-[9px] text-red-400/70 bg-red-500/10 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">No disponible</span>
                        )}
                      </div>
                      {p.shortDescription && (
                        <p className="text-[11px] text-white/40 mt-0.5 line-clamp-1">{p.shortDescription}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        {p.price && <span className="text-xs font-black text-[#ffa35d]">{p.price}</span>}
                        {p.stock != null && (
                          <span className="text-[10px] text-white/40 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
                            Stock: {p.stock}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => toggleAvailable(p)}
                        title={p.available !== false ? 'Marcar como no disponible' : 'Marcar como disponible'}
                        className={`text-2xl transition-colors ${p.available !== false ? 'text-green-400 hover:text-green-300' : 'text-white/20 hover:text-white/40'}`}
                      >
                        {p.available !== false ? <FaToggleOn /> : <FaToggleOff />}
                      </button>
                      <button
                        onClick={() => openEdit(p)}
                        className="w-9 h-9 rounded-lg bg-white/5 hover:bg-[#ffa35d]/20 flex items-center justify-center text-white/40 hover:text-[#ffa35d] transition"
                      >
                        <FaPen className="text-xs" />
                      </button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="w-9 h-9 rounded-lg bg-white/5 hover:bg-red-500/20 flex items-center justify-center text-white/30 hover:text-red-400 transition"
                      >
                        <FaTrash className="text-xs" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
