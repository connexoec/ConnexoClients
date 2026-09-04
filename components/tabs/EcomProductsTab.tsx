import React, { useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { BulkProductImport } from './BulkProductImport';
import { PhotoCatalogImport } from './PhotoCatalogImport';
import { useDebouncedValue, matchesQuery } from '../../hooks/useCatalogSearch';
import { downscaleImageBlob } from '../../src/lib/catalogVision';
import { supabase } from '../../src/lib/supabase';
import type { Product, ProductExtra, ProductExtraOption, EcomPriceTier, PaymentGatewaysConfig } from '../../types';
import {
  FaPlus, FaTrash, FaPen, FaImage, FaTimes, FaSave,
  FaToggleOn, FaToggleOff, FaSearch, FaChevronDown, FaChevronUp,
  FaMotorcycle, FaCreditCard, FaLayerGroup, FaLink,
  FaUniversity, FaWhatsapp, FaMobileAlt, FaCamera,
} from 'react-icons/fa';

const MAX_PRODUCT_IMAGES = 4;
import { ProductSubscriptionField } from '../ProductSubscriptionField';
import { cleanSubscription } from '../../src/lib/memberPlans';

const ECOM_CATEGORIES = [
  'Ropa', 'Calzado', 'Electrónica', 'Hogar & Deco', 'Belleza & Cuidado',
  'Deportes', 'Alimentación', 'Accesorios', 'Libros', 'Juguetes', 'Otros',
];

type EcomProduct = Product & { available?: boolean };

const emptyForm = (): Partial<EcomProduct> => ({
  name: '', category: '', price: '', shortDescription: '', imageURL: '', imageURLs: [],
  available: true, stock: undefined, extras: [], minQty: undefined, priceTiers: [],
});

/** Reúne las imágenes de un producto (nuevo esquema `imageURLs`, con respaldo al `imageURL` viejo). */
const productImages = (p?: Partial<EcomProduct> | null): string[] => {
  const list = Array.isArray(p?.imageURLs) ? p!.imageURLs!.filter(Boolean) : [];
  if (list.length) return list.slice(0, MAX_PRODUCT_IMAGES);
  return p?.imageURL ? [p.imageURL] : [];
};

interface Props {
  user: any;
  profileData: any;
  setProfileData: React.Dispatch<React.SetStateAction<any>>;
  showNotification: (message: string, type: 'success' | 'error') => void;
}

export const EcomProductsTab: React.FC<Props> = ({ user, profileData, setProfileData, showNotification }) => {
  const products: EcomProduct[] = Array.isArray(profileData?.products) ? profileData.products : [];
  const isUltra = (profileData?.plan ?? '').toString().toLowerCase() === 'ultra';

  const [editing, setEditing] = useState<EcomProduct | null>(null);
  const [form, setForm] = useState<Partial<EcomProduct>>(emptyForm());
  const [isOpen, setIsOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const imgCamRef = useRef<HTMLInputElement>(null);
  const imgFileRef = useRef<HTMLInputElement>(null);

  // Delivery fee setting
  const [deliveryFeeInput, setDeliveryFeeInput] = useState(String(profileData?.delivery_fee ?? ''));
  const [savingFee, setSavingFee] = useState(false);
  const [showDelivery, setShowDelivery] = useState(false);

  // Payment gateways (config estructurada). Los datos legados (array) se ignoran → objeto vacío.
  const [showGateways, setShowGateways] = useState(false);
  const [gwConfig, setGwConfig] = useState<PaymentGatewaysConfig>(
    (profileData?.payment_gateways && !Array.isArray(profileData.payment_gateways))
      ? profileData.payment_gateways
      : {}
  );
  const [savingGateways, setSavingGateways] = useState(false);

  const openNew = () => { setEditing(null); setForm(emptyForm()); setIsOpen(true); };
  const openEdit = (p: EcomProduct) => {
    setEditing(p);
    setForm({ ...p, imageURLs: productImages(p), extras: p.extras ? JSON.parse(JSON.stringify(p.extras)) : [] });
    setIsOpen(true);
  };
  const closeModal = () => { setEditing(null); setForm(emptyForm()); setIsOpen(false); };

  const persistProducts = async (list: EcomProduct[]) => {
    const { error } = await supabase.from('profiles').update({ products: list }).eq('id', user.id);
    if (error) throw error;
    setProfileData((prev: any) => ({ ...prev, products: list }));
  };

  const handleSaveDeliveryFee = async () => {
    const fee = parseFloat(deliveryFeeInput) || 0;
    setSavingFee(true);
    try {
      const { error } = await supabase.from('profiles').update({ delivery_fee: fee }).eq('id', user.id);
      if (error) throw error;
      setProfileData((prev: any) => ({ ...prev, delivery_fee: fee }));
      showNotification('Costo de domicilio guardado', 'success');
    } catch (err: any) {
      showNotification(`Error: ${err?.message}`, 'error');
    } finally {
      setSavingFee(false);
    }
  };

  // Sube hasta MAX_PRODUCT_IMAGES fotos. Cada una se reescala (o se mejora si el
  // dueño activó el toggle) antes de subir. La primera imagen es la principal.
  const handleAddImages = async (files: FileList | null) => {
    if (!files || files.length === 0 || !user?.id) return;
    const current = form.imageURLs ?? [];
    const room = MAX_PRODUCT_IMAGES - current.length;
    if (room <= 0) { showNotification(`Máximo ${MAX_PRODUCT_IMAGES} imágenes por producto.`, 'error'); return; }
    const chosen = Array.from(files).slice(0, room);
    const slotId = editing?.id || `tmp_${Date.now()}`;
    setUploading(true);
    try {
      const added: string[] = [];
      for (const file of chosen) {
        const blob = await downscaleImageBlob(file);
        const key = `products/${user.id}/${slotId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const { error } = await supabase.storage.from('assets')
          .upload(key, blob, { upsert: true, contentType: 'image/jpeg' });
        if (error) throw error;
        const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(key);
        added.push(publicUrl);
      }
      setForm(prev => ({
        ...prev,
        imageURLs: [...(prev.imageURLs ?? []), ...added].slice(0, MAX_PRODUCT_IMAGES),
      }));
    } catch (err: any) {
      showNotification(`Error al subir imagen: ${err?.message}`, 'error');
    } finally {
      setUploading(false);
    }
  };

  const removeImageAt = (i: number) =>
    setForm(prev => ({ ...prev, imageURLs: (prev.imageURLs ?? []).filter((_, idx) => idx !== i) }));

  // ── Extras helpers ───────────────────────────────────────────────────────────

  const addExtraGroup = () => {
    const newGroup: ProductExtra = {
      id: Date.now().toString(),
      name: '',
      required: false,
      multiSelect: false,
      options: [],
    };
    setForm(prev => ({ ...prev, extras: [...(prev.extras ?? []), newGroup] }));
  };

  const removeGroup = (gi: number) => {
    setForm(prev => ({
      ...prev,
      extras: (prev.extras ?? []).filter((_, i) => i !== gi),
    }));
  };

  const updateGroup = (gi: number, field: keyof ProductExtra, value: any) => {
    setForm(prev => ({
      ...prev,
      extras: (prev.extras ?? []).map((g, i) => i === gi ? { ...g, [field]: value } : g),
    }));
  };

  const addOption = (gi: number) => {
    const newOpt: ProductExtraOption = { id: Date.now().toString(), label: '', price: 0 };
    setForm(prev => ({
      ...prev,
      extras: (prev.extras ?? []).map((g, i) =>
        i === gi ? { ...g, options: [...g.options, newOpt] } : g
      ),
    }));
  };

  const removeOption = (gi: number, oi: number) => {
    setForm(prev => ({
      ...prev,
      extras: (prev.extras ?? []).map((g, i) =>
        i === gi ? { ...g, options: g.options.filter((_, j) => j !== oi) } : g
      ),
    }));
  };

  const updateOption = (gi: number, oi: number, field: keyof ProductExtraOption, value: any) => {
    setForm(prev => ({
      ...prev,
      extras: (prev.extras ?? []).map((g, i) =>
        i === gi ? {
          ...g,
          options: g.options.map((o, j) => j === oi ? { ...o, [field]: value } : o),
        } : g
      ),
    }));
  };

  // ── Price tier helpers ────────────────────────────────────────────────────────

  const addTier = () => {
    const newTier: EcomPriceTier = { minQty: 1, price: '' };
    setForm(prev => ({ ...prev, priceTiers: [...(prev.priceTiers ?? []), newTier] }));
  };

  const removeTier = (ti: number) => {
    setForm(prev => ({ ...prev, priceTiers: (prev.priceTiers ?? []).filter((_, i) => i !== ti) }));
  };

  const updateTier = (ti: number, field: keyof EcomPriceTier, value: any) => {
    setForm(prev => ({
      ...prev,
      priceTiers: (prev.priceTiers ?? []).map((t, i) => i === ti ? { ...t, [field]: value } : t),
    }));
  };

  // ── Payment gateway handlers ──────────────────────────────────────────────────

  type GwKey = keyof PaymentGatewaysConfig;
  const toggleGw = (key: GwKey) => {
    setGwConfig(prev => ({ ...prev, [key]: { ...(prev[key] as any), enabled: !((prev[key] as any)?.enabled) } }));
  };
  const updateGw = (key: GwKey, field: string, value: string) => {
    setGwConfig(prev => ({ ...prev, [key]: { ...(prev[key] as any), [field]: value } }));
  };

  const gwActiveCount = (['directLink', 'payphone', 'bankTransfer', 'whatsapp'] as GwKey[])
    .filter(k => (gwConfig[k] as any)?.enabled).length;

  const handleSaveGateways = async () => {
    setSavingGateways(true);
    try {
      const { error } = await supabase.from('profiles').update({ payment_gateways: gwConfig }).eq('id', user.id);
      if (error) throw error;
      setProfileData((prev: any) => ({ ...prev, payment_gateways: gwConfig }));
      showNotification('Pasarelas de pago guardadas', 'success');
    } catch (err: any) {
      showNotification(`Error: ${err?.message}`, 'error');
    } finally {
      setSavingGateways(false);
    }
  };

  // ── Save ─────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!form.name?.trim()) { showNotification('El nombre del producto es requerido.', 'error'); return; }
    setSaving(true);
    try {
      const id = editing?.id || Date.now().toString();
      const cleanExtras = (form.extras ?? [])
        .filter(g => g.name.trim())
        .map(g => ({
          ...g,
          name: g.name.trim(),
          options: g.options.filter(o => o.label.trim()).map(o => ({ ...o, label: o.label.trim() })),
        }));
      const cleanTiers = (form.priceTiers ?? [])
        .filter(t => t.minQty > 0 && t.price.trim())
        .sort((a, b) => a.minQty - b.minQty);
      const imgs = (form.imageURLs ?? []).filter(Boolean).slice(0, MAX_PRODUCT_IMAGES);
      const updated: EcomProduct = {
        id,
        name: form.name.trim(),
        category: form.category?.trim() || '',
        price: form.price?.trim() || '',
        shortDescription: form.shortDescription?.trim() || '',
        imageURL: imgs[0] || '',              // principal (compatibilidad con lo que lee imageURL)
        imageURLs: imgs.length ? imgs : undefined,
        available: form.available !== false,
        stock: form.stock != null && form.stock !== ('' as any) ? Number(form.stock) : undefined,
        extras: cleanExtras.length > 0 ? cleanExtras : undefined,
        minQty: form.minQty && form.minQty > 1 ? Number(form.minQty) : undefined,
        priceTiers: cleanTiers.length > 0 ? cleanTiers : undefined,
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

  const toggleAvailable = async (p: EcomProduct) => {
    const list = products.map(x => x.id === p.id ? { ...x, available: !(x.available !== false) } : x);
    setProfileData((prev: any) => ({ ...prev, products: list }));
    await supabase.from('profiles').update({ products: list }).eq('id', user.id);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Eliminar este producto?')) return;
    try {
      const list = products.filter(p => p.id !== id);
      await persistProducts(list);
      showNotification('Producto eliminado', 'success');
    } catch (err: any) {
      showNotification(`Error: ${err?.message}`, 'error');
    }
  };

  // Buscador con debounce sobre nombre, marca, principio activo, categoría y SKU.
  const debouncedSearch = useDebouncedValue(searchTerm, 220);
  const filtered = useMemo(
    () => (debouncedSearch.trim() ? products.filter(p => matchesQuery(p, debouncedSearch)) : products),
    [products, debouncedSearch],
  );

  const inp = "w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#00e5a0]/50";
  const inpSm = "bg-black/30 border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/20 focus:outline-none focus:border-[#00e5a0]/40 w-full";

  const modal = isOpen && createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={closeModal}
    >
      <div
        className="bg-[#0b1219] border border-[#00e5a0]/20 rounded-2xl w-full max-w-lg shadow-2xl max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
      >
        <div className="flex items-center justify-between p-5 border-b border-white/5 sticky top-0 bg-[#0b1219] z-10">
          <h3 className="font-black text-[#00e5a0] uppercase tracking-wider text-sm">
            {editing ? 'Editar producto' : 'Nuevo producto'}
          </h3>
          <button onClick={closeModal} className="text-white/40 hover:text-white transition">
            <FaTimes />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Fotos del producto (hasta 4). La primera es la principal. */}
          <div className="space-y-2.5">
            <p className="text-[11px] text-white/50 uppercase tracking-widest font-bold">
              Fotos del producto ({(form.imageURLs ?? []).length}/{MAX_PRODUCT_IMAGES})
            </p>

            <div className="grid grid-cols-4 gap-2">
              {(form.imageURLs ?? []).map((u, i) => (
                <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-[#00e5a0]/20 bg-black/30">
                  <img src={u} className="w-full h-full object-contain" alt={`foto ${i + 1}`} />
                  <button type="button" onClick={() => removeImageAt(i)}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center">
                    <FaTimes size={9} />
                  </button>
                  {i === 0 && (
                    <span className="absolute bottom-0 inset-x-0 text-[8px] font-black uppercase tracking-wider text-center bg-black/60 text-white/80 py-0.5">
                      Principal
                    </span>
                  )}
                </div>
              ))}

              {(form.imageURLs ?? []).length < MAX_PRODUCT_IMAGES && !uploading && (
                <>
                  <label className="aspect-square rounded-xl border border-dashed border-white/15 bg-black/20 flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-[#00e5a0]/40 text-white/40 transition">
                    <FaCamera size={14} className="text-[#00e5a0]" />
                    <span className="text-[9px] font-bold">Tomar</span>
                    <input ref={imgCamRef} type="file" accept="image/*" capture="environment" className="hidden"
                      onChange={e => { const el = e.currentTarget; handleAddImages(el.files).finally(() => { el.value = ''; }); }} />
                  </label>
                  <label className="aspect-square rounded-xl border border-dashed border-white/15 bg-black/20 flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-[#00e5a0]/40 text-white/40 transition">
                    <FaImage size={14} className="text-[#00e5a0]" />
                    <span className="text-[9px] font-bold">Subir</span>
                    <input ref={imgFileRef} type="file" accept="image/*" multiple className="hidden"
                      onChange={e => { const el = e.currentTarget; handleAddImages(el.files).finally(() => { el.value = ''; }); }} />
                  </label>
                </>
              )}

              {uploading && (
                <div className="aspect-square rounded-xl border border-dashed border-white/15 bg-black/20 flex items-center justify-center text-[10px] text-white/40">
                  Procesando…
                </div>
              )}
            </div>
            <p className="text-[10px] text-white/25">
              La primera imagen es la principal. Puedes agregar hasta {MAX_PRODUCT_IMAGES}.
            </p>
          </div>

          <input value={form.name || ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            placeholder="Nombre del producto *" className={inp} />

          <div>
            <input list="ecom-cats" value={form.category || ''}
              onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
              placeholder="Categoría (ej. Ropa, Electrónica...)" className={inp} />
            <datalist id="ecom-cats">
              {ECOM_CATEGORIES.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>

          {/* Precio y Stock — grid para evitar desfase */}
          <div className="grid grid-cols-2 gap-3">
            <input value={form.price || ''} onChange={e => setForm(p => ({ ...p, price: e.target.value }))}
              placeholder="Precio (ej. $25)" className={inp} />
            <input type="number" min="0" value={form.stock ?? ''}
              onChange={e => setForm(p => ({ ...p, stock: e.target.value === '' ? undefined : Number(e.target.value) }))}
              placeholder="Stock (opcional)" className={inp} />
          </div>

          {/* Marca / principio activo / SKU — alimentan el buscador público */}
          <div className="grid grid-cols-2 gap-3">
            <input value={form.brand || ''} onChange={e => setForm(p => ({ ...p, brand: e.target.value }))}
              placeholder="Marca (opcional)" className={inp} />
            <input value={form.sku || ''} onChange={e => setForm(p => ({ ...p, sku: e.target.value }))}
              placeholder="SKU / código (opcional)" className={inp} />
          </div>
          <input value={form.activeIngredient || ''}
            onChange={e => setForm(p => ({ ...p, activeIngredient: e.target.value }))}
            placeholder="Principio activo / componente (opcional)" className={inp} />
          <p className="text-[10px] text-white/25 -mt-1">
            Marca, principio activo y SKU se suman al buscador del catálogo público.
          </p>

          <textarea value={form.shortDescription || ''}
            onChange={e => setForm(p => ({ ...p, shortDescription: e.target.value }))}
            placeholder="Descripción corta (opcional)" rows={2}
            className={inp + ' resize-none'} />

          <ProductSubscriptionField accent="#00e5a0"
            value={form.subscription} onChange={v => setForm(p => ({ ...p, subscription: v }))} />

          {/* Toggle disponible */}
          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-sm text-white/70 font-medium">Disponible para clientes</p>
              <p className="text-[11px] text-white/30 mt-0.5">Los clientes verán este producto en tu tienda</p>
            </div>
            <button type="button"
              onClick={() => setForm(p => ({ ...p, available: p.available === false ? true : false }))}
              className={`text-3xl transition-colors ${form.available !== false ? 'text-[#00e5a0]' : 'text-white/20'}`}>
              {form.available !== false ? <FaToggleOn /> : <FaToggleOff />}
            </button>
          </div>

          {/* ── Extras y Complementos ──────────────────────────────── */}
          <div className="border-t border-white/8 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-white/50 uppercase tracking-widest font-bold">Extras y Complementos</p>
                <p className="text-[10px] text-white/25 mt-0.5">El cliente elige al hacer el pedido</p>
              </div>
              <button type="button" onClick={addExtraGroup}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#00e5a0]/10 border border-[#00e5a0]/25 text-[#00e5a0] text-[11px] font-black uppercase tracking-wider hover:bg-[#00e5a0]/15 transition">
                <FaPlus size={9} /> Añadir grupo
              </button>
            </div>

            {(form.extras ?? []).map((group, gi) => (
              <div key={group.id} className="bg-black/20 border border-white/8 rounded-xl p-3 space-y-2.5">
                {/* Group header */}
                <div className="flex items-center gap-2">
                  <input value={group.name} onChange={e => updateGroup(gi, 'name', e.target.value)}
                    placeholder='Nombre del grupo (ej. "Tamaño")' className={inpSm} />
                  <button type="button" onClick={() => removeGroup(gi)}
                    className="text-red-400/50 hover:text-red-400 transition p-1 shrink-0">
                    <FaTrash size={11} />
                  </button>
                </div>

                {/* Toggles */}
                <div className="flex gap-4">
                  <label className="flex items-center gap-1.5 text-[11px] text-white/50 cursor-pointer select-none">
                    <input type="checkbox" checked={!!group.multiSelect}
                      onChange={e => updateGroup(gi, 'multiSelect', e.target.checked)}
                      className="w-3 h-3 accent-[#00e5a0] cursor-pointer" />
                    Selección múltiple
                  </label>
                  <label className="flex items-center gap-1.5 text-[11px] text-white/50 cursor-pointer select-none">
                    <input type="checkbox" checked={!!group.required}
                      onChange={e => updateGroup(gi, 'required', e.target.checked)}
                      className="w-3 h-3 accent-[#00e5a0] cursor-pointer" />
                    Requerido
                  </label>
                </div>

                {/* Options */}
                <div className="space-y-1.5">
                  {group.options.map((opt, oi) => (
                    <div key={opt.id} className="flex gap-1.5 items-center">
                      <input value={opt.label} onChange={e => updateOption(gi, oi, 'label', e.target.value)}
                        placeholder='Opción (ej. "Grande")' className="flex-1 bg-black/30 border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/20 focus:outline-none focus:border-[#00e5a0]/40" />
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[10px] text-white/30">+$</span>
                        <input type="number" min="0" step="0.5"
                          value={opt.price === 0 ? '' : opt.price}
                          onChange={e => updateOption(gi, oi, 'price', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-12 bg-black/30 border border-white/5 rounded-lg px-2 py-1.5 text-xs text-white placeholder-white/25 focus:outline-none focus:border-[#00e5a0]/40 text-center" />
                      </div>
                      <button type="button" onClick={() => removeOption(gi, oi)}
                        className="text-red-400/40 hover:text-red-400 transition p-0.5 shrink-0">
                        <FaTimes size={10} />
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => addOption(gi)}
                    className="text-[11px] text-[#00e5a0]/50 hover:text-[#00e5a0] flex items-center gap-1 transition-colors mt-1">
                    <FaPlus size={9} /> Añadir opción
                  </button>
                </div>
              </div>
            ))}

            {(form.extras ?? []).length === 0 && (
              <p className="text-[11px] text-white/20 italic">Sin extras configurados. Úsalos para personalizar el pedido (talla, color, adicionales...).</p>
            )}
          </div>

          {/* ── Pedido mayorista / Precio por volumen ─────────────── */}
          <div className="border-t border-white/8 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-white/50 uppercase tracking-widest font-bold flex items-center gap-1.5">
                  <FaLayerGroup size={10} /> Pedido mayorista
                </p>
                <p className="text-[10px] text-white/25 mt-0.5">Precio por volumen según cantidad</p>
              </div>
              <button type="button" onClick={addTier}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#00e5a0]/10 border border-[#00e5a0]/25 text-[#00e5a0] text-[11px] font-black uppercase tracking-wider hover:bg-[#00e5a0]/15 transition">
                <FaPlus size={9} /> Añadir tramo
              </button>
            </div>

            {/* Pedido mínimo */}
            <div className="flex items-center gap-3">
              <label className="text-[11px] text-white/50 shrink-0 w-32">Pedido mínimo (uds):</label>
              <input
                type="number" min="1"
                value={form.minQty ?? ''}
                onChange={e => setForm(p => ({ ...p, minQty: e.target.value === '' ? undefined : Number(e.target.value) }))}
                placeholder="Sin mínimo"
                className="flex-1 bg-black/30 border border-white/5 rounded-lg px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-[#00e5a0]/40"
              />
            </div>

            {/* Tramos de precio */}
            {(form.priceTiers ?? []).length > 0 && (
              <div className="bg-black/20 border border-white/8 rounded-xl p-3 space-y-2">
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2 mb-1">
                  <span className="text-[10px] text-white/30 font-bold uppercase tracking-widest">Desde (uds)</span>
                  <span className="text-[10px] text-white/30 font-bold uppercase tracking-widest">Precio unit.</span>
                  <span className="w-6" />
                </div>
                {(form.priceTiers ?? []).map((tier, ti) => (
                  <div key={ti} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                    <input
                      type="number" min="1"
                      value={tier.minQty || ''}
                      onChange={e => updateTier(ti, 'minQty', Number(e.target.value) || 1)}
                      placeholder="1"
                      className={inpSm}
                    />
                    <input
                      value={tier.price}
                      onChange={e => updateTier(ti, 'price', e.target.value)}
                      placeholder="$0.00"
                      className={inpSm}
                    />
                    <button type="button" onClick={() => removeTier(ti)}
                      className="text-red-400/40 hover:text-red-400 transition p-1">
                      <FaTimes size={10} />
                    </button>
                  </div>
                ))}
                <p className="text-[10px] text-white/25 mt-1">El cliente verá la tabla y el precio se actualiza según la cantidad elegida.</p>
              </div>
            )}

            {(form.priceTiers ?? []).length === 0 && (
              <p className="text-[11px] text-white/20 italic">Sin tramos. Activa precios por volumen para pedidos grandes.</p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={closeModal}
              className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-bold uppercase tracking-wider active:scale-95 transition-all">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving || !form.name?.trim()}
              className="flex-1 py-3 rounded-xl bg-[#00e5a0] hover:bg-[#00cfa0] text-black text-xs font-black uppercase tracking-wider disabled:opacity-50 active:scale-95 transition-all flex items-center justify-center gap-2">
              <FaSave /> {saving ? 'Guardando...' : editing ? 'Actualizar' : 'Agregar'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );

  return (
    <div
      className="animate-fade-in-up space-y-6 max-w-4xl mx-auto px-4 md:px-6 pb-32"
      style={{ fontFamily: "'Space Grotesk', sans-serif" }}
    >
      {modal}

      {/* ── Header ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#00e5a0]/15 pb-5">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2">
            🛍️ Catálogo de Productos
          </h2>
          <p className="text-sm text-white/40 mt-1">
            {products.length} producto{products.length !== 1 ? 's' : ''} cargado{products.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-black bg-[#00e5a0] hover:bg-[#00cfa0] rounded-xl transition-all shadow-lg shadow-[#00e5a0]/15 active:scale-95">
          <FaPlus /> Agregar producto
        </button>
      </div>

      {/* ── Configuración de entrega ───────────────────────────── */}
      <div className="bg-white/[0.03] border border-white/8 rounded-2xl overflow-hidden">
        <button
          onClick={() => setShowDelivery(v => !v)}
          className="w-full flex items-center justify-between p-4 text-left"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#00e5a0]/10 flex items-center justify-center">
              <FaMotorcycle className="text-[#00e5a0] text-sm" />
            </div>
            <div>
              <p className="text-sm font-black text-white">Configuración de entrega</p>
              <p className="text-[11px] text-white/40 mt-0.5">
                Costo de domicilio actual: {profileData?.delivery_fee > 0 ? `$${Number(profileData.delivery_fee).toFixed(2)}` : 'Gratis'}
              </p>
            </div>
          </div>
          <span className="text-white/30">{showDelivery ? <FaChevronUp size={12} /> : <FaChevronDown size={12} />}</span>
        </button>

        {showDelivery && (
          <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
            <p className="text-xs text-white/50 leading-relaxed">
              El cliente verá este costo cuando seleccione <strong className="text-white/70">Domicilio</strong> en el checkout.
              Si es <strong className="text-white/70">0</strong> o vacío, el envío se muestra como <em>Gratis</em>.
            </p>
            <div className="flex gap-3 items-center">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm font-bold">$</span>
                <input
                  type="number" min="0" step="0.5"
                  value={deliveryFeeInput}
                  onChange={e => setDeliveryFeeInput(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-black/40 border border-white/10 rounded-xl pl-7 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#00e5a0]/50 placeholder-white/20"
                />
              </div>
              <button
                onClick={handleSaveDeliveryFee}
                disabled={savingFee}
                className="px-4 py-2.5 rounded-xl bg-[#00e5a0] hover:bg-[#00cfa0] text-black text-xs font-black uppercase tracking-wider disabled:opacity-50 transition-all active:scale-95"
              >
                {savingFee ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Pasarelas de pago ─────────────────────────────────── */}
      <div className="bg-white/[0.03] border border-white/8 rounded-2xl overflow-hidden">
        <button
          onClick={() => setShowGateways(v => !v)}
          className="w-full flex items-center justify-between p-4 text-left"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#00e5a0]/10 flex items-center justify-center">
              <FaCreditCard className="text-[#00e5a0] text-sm" />
            </div>
            <div>
              <p className="text-sm font-black text-white">Pasarelas de pago</p>
              <p className="text-[11px] text-white/40 mt-0.5">
                {gwActiveCount > 0 ? `${gwActiveCount} método${gwActiveCount !== 1 ? 's' : ''} de pago activo${gwActiveCount !== 1 ? 's' : ''}` : 'Sin métodos de pago activos'}
              </p>
            </div>
          </div>
          <span className="text-white/30">{showGateways ? <FaChevronUp size={12} /> : <FaChevronDown size={12} />}</span>
        </button>

        {showGateways && (
          <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
            <p className="text-xs text-white/50 leading-relaxed">
              Activa los métodos de pago que quieras ofrecer. El cliente verá únicamente los activos al finalizar su pedido.
            </p>

            {(() => {
              const inputCls = "w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#00e5a0]/50";
              const card = (gwKey: GwKey, icon: React.ReactNode, title: string, desc: string, fields: React.ReactNode) => {
                const on = !!(gwConfig[gwKey] as any)?.enabled;
                return (
                  <div className={`rounded-2xl border p-3.5 transition-colors ${on ? 'bg-[#00e5a0]/[0.04] border-[#00e5a0]/25' : 'bg-black/20 border-white/8'}`}>
                    <button type="button" onClick={() => toggleGw(gwKey)} className="w-full flex items-center gap-3 text-left">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${on ? 'bg-[#00e5a0]/15 text-[#00e5a0]' : 'bg-white/5 text-white/40'}`}>{icon}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-white">{title}</p>
                        <p className="text-[11px] text-white/40 mt-0.5 truncate">{desc}</p>
                      </div>
                      {on ? <FaToggleOn className="text-[#00e5a0] text-2xl shrink-0" /> : <FaToggleOff className="text-white/25 text-2xl shrink-0" />}
                    </button>
                    {on && <div className="mt-3 space-y-2">{fields}</div>}
                  </div>
                );
              };

              return (
                <div className="space-y-2.5">
                  {card('directLink', <FaLink size={13} />, 'Link Directo / Botón de Pago', 'URL pública de cobro de tu banco o pasarela', (
                    <>
                      <input className={inputCls} placeholder='Etiqueta (ej. "Pagar con tarjeta")'
                        value={gwConfig.directLink?.name ?? ''} onChange={e => updateGw('directLink', 'name', e.target.value)} />
                      <input className={inputCls} placeholder="https://link-de-pago..."
                        value={gwConfig.directLink?.url ?? ''} onChange={e => updateGw('directLink', 'url', e.target.value)} />
                    </>
                  ))}

                  {card('payphone', <FaMobileAlt size={13} />, 'PayPhone / Pasarela API', 'Credenciales del comercio (token + Store ID)', (
                    <>
                      <input className={inputCls} placeholder="Token del comercio"
                        value={gwConfig.payphone?.token ?? ''} onChange={e => updateGw('payphone', 'token', e.target.value)} />
                      <input className={inputCls} placeholder="Store ID"
                        value={gwConfig.payphone?.storeId ?? ''} onChange={e => updateGw('payphone', 'storeId', e.target.value)} />
                    </>
                  ))}

                  {card('bankTransfer', <FaUniversity size={13} />, 'Transferencia Bancaria', 'Datos de la cuenta para depósito/transferencia', (
                    <>
                      <input className={inputCls} placeholder="Banco"
                        value={gwConfig.bankTransfer?.bank ?? ''} onChange={e => updateGw('bankTransfer', 'bank', e.target.value)} />
                      <div className="grid grid-cols-2 gap-2">
                        <input className={inputCls} placeholder="Tipo de cuenta"
                          value={gwConfig.bankTransfer?.accountType ?? ''} onChange={e => updateGw('bankTransfer', 'accountType', e.target.value)} />
                        <input className={inputCls} placeholder="N° de cuenta"
                          value={gwConfig.bankTransfer?.accountNumber ?? ''} onChange={e => updateGw('bankTransfer', 'accountNumber', e.target.value)} />
                      </div>
                      <input className={inputCls} placeholder="Titular de la cuenta"
                        value={gwConfig.bankTransfer?.holder ?? ''} onChange={e => updateGw('bankTransfer', 'holder', e.target.value)} />
                      <div className="grid grid-cols-2 gap-2">
                        <input className={inputCls} placeholder="Cédula / RUC"
                          value={gwConfig.bankTransfer?.idNumber ?? ''} onChange={e => updateGw('bankTransfer', 'idNumber', e.target.value)} />
                        <input className={inputCls} placeholder="Email"
                          value={gwConfig.bankTransfer?.email ?? ''} onChange={e => updateGw('bankTransfer', 'email', e.target.value)} />
                      </div>
                    </>
                  ))}

                  {card('whatsapp', <FaWhatsapp size={13} />, 'WhatsApp / Pago Manual', 'Número que recibe los comprobantes de pago', (
                    <input className={inputCls} placeholder="Ej. 0963038666"
                      value={gwConfig.whatsapp?.phone ?? ''} onChange={e => updateGw('whatsapp', 'phone', e.target.value)} />
                  ))}
                </div>
              );
            })()}

            <button onClick={handleSaveGateways} disabled={savingGateways}
              className="w-full py-2.5 rounded-xl bg-[#00e5a0] hover:bg-[#00cfa0] text-black text-xs font-black uppercase tracking-wider disabled:opacity-50 transition-all active:scale-95 flex items-center justify-center gap-1.5">
              <FaSave size={11} /> {savingGateways ? 'Guardando...' : 'Guardar pasarelas'}
            </button>
          </div>
        )}
      </div>

      {/* ── Cargar desde una foto (ULTRA) ─────────────────────── */}
      <PhotoCatalogImport
        products={products}
        onImport={persistProducts}
        showNotification={showNotification}
        isUltra={isUltra}
        userId={user.id}
        accent="#00e5a0"
      />

      {/* ── Importación masiva (ULTRA) ────────────────────────── */}
      <BulkProductImport
        products={products}
        onImport={persistProducts}
        showNotification={showNotification}
        isUltra={isUltra}
        accent="#00e5a0"
        exportName="catalogo_tienda"
        templateRows={[
          ['Camiseta Oversize Negra', 'Ropa', 'Urban Co', '', '18.90', '40', 'ROP-001', 'Algodon 100%', '', 'Si'],
          ['Audifonos Bluetooth X2', 'Electronica', 'SoundMax', '', '32.00', '12', 'ELE-014', 'Bateria 20h', '', 'Si'],
        ]}
      />

      {/* ── Search ────────────────────────────────────────────── */}
      {products.length > 5 && (
        <div className="relative">
          <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-white/25 w-3.5 h-3.5" />
          <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar por nombre, marca, categoría o SKU..."
            className="w-full bg-white/5 border border-white/10 text-white text-sm rounded-xl pl-10 pr-10 py-3 focus:outline-none focus:border-[#00e5a0]/40 placeholder-white/25" />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition p-1">
              <FaTimes size={12} />
            </button>
          )}
        </div>
      )}

      {/* ── Product grid ──────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-white/30">
          <p className="text-4xl mb-3">📦</p>
          <p className="text-sm">
            {products.length === 0
              ? 'Aún no has agregado productos. ¡Agrega el primero!'
              : 'No hay resultados para tu búsqueda.'}
          </p>
          {products.length === 0 && (
            <button onClick={openNew}
              className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#00e5a0]/10 border border-[#00e5a0]/25 text-[#00e5a0] text-xs font-black uppercase tracking-wider hover:bg-[#00e5a0]/15 transition-all">
              <FaPlus /> Agregar mi primer producto
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map(product => (
            <div key={product.id}
              className={`bg-white/[0.03] border rounded-2xl p-4 flex gap-4 transition-all ${
                product.available !== false ? 'border-white/8' : 'border-white/4 opacity-55'
              }`}>
              {product.imageURL ? (
                <img src={product.imageURL} alt={product.name}
                  className="w-16 h-16 rounded-xl object-cover shrink-0 border border-white/5" />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-black/30 border border-white/5 flex items-center justify-center text-white/20 text-2xl shrink-0">
                  🛍️
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-white truncate">{product.name}</p>
                    {product.category && (
                      <p className="text-[10px] text-[#00e5a0]/70 uppercase tracking-widest font-bold mt-0.5">{product.category}</p>
                    )}
                    {product.price && (
                      <p className="text-base font-black text-[#00e5a0] mt-1">{product.price}</p>
                    )}
                    {product.stock != null && (
                      <p className="text-[10px] text-white/35 mt-0.5">Stock: {product.stock}</p>
                    )}
                    {product.extras && product.extras.length > 0 && (
                      <p className="text-[10px] text-white/30 mt-0.5">
                        {product.extras.length} grupo{product.extras.length !== 1 ? 's' : ''} de extras
                      </p>
                    )}
                    {product.priceTiers && product.priceTiers.length > 0 && (
                      <p className="text-[10px] text-[#00e5a0]/50 mt-0.5">
                        {product.priceTiers.length} tramo{product.priceTiers.length !== 1 ? 's' : ''} de precio
                        {product.minQty ? ` · Mín. ${product.minQty} uds` : ''}
                      </p>
                    )}
                    {product.available === false && (
                      <span className="inline-block mt-1 text-[9px] font-black uppercase tracking-widest text-red-400/70 bg-red-500/10 border border-red-500/20 rounded-md px-1.5 py-0.5">
                        No disponible
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => toggleAvailable(product)}
                      title={product.available !== false ? 'Disponible' : 'No disponible'}
                      className={`text-xl transition-colors ${product.available !== false ? 'text-[#00e5a0]' : 'text-white/20'}`}>
                      {product.available !== false ? <FaToggleOn /> : <FaToggleOff />}
                    </button>
                    <button onClick={() => openEdit(product)}
                      className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 text-white/50 hover:text-white hover:border-[#00e5a0]/30 flex items-center justify-center transition">
                      <FaPen size={11} />
                    </button>
                    <button onClick={() => handleDelete(product.id)}
                      className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 text-white/30 hover:text-red-400 hover:border-red-400/30 flex items-center justify-center transition">
                      <FaTrash size={11} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default EcomProductsTab;
