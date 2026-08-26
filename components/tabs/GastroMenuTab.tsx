import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../src/lib/supabase';
import type { Product, RecipeIngredient, InventoryItem, PaymentGatewaysConfig } from '../../types';
import {
  FaPlus, FaTrash, FaPen, FaImage, FaTimes, FaSave, FaWarehouse,
  FaPaw, FaHeartbeat, FaListUl, FaStethoscope, FaChair, FaAllergies, FaUtensils,
  FaToggleOn, FaToggleOff, FaLink, FaMobileAlt, FaUniversity, FaWhatsapp, FaChevronDown,
  FaSearch, FaFlask, FaTag,
} from 'react-icons/fa';
import { ProductSubscriptionField } from '../ProductSubscriptionField';
import { BulkProductImport } from './BulkProductImport';
import {
  useDebouncedValue, matchesQuery, CLINIC_CATEGORY_PRESETS,
  MEDICAL_CATEGORY_PRESETS, GASTRO_CATEGORY_PRESETS,
} from '../../hooks/useCatalogSearch';

interface GastroMenuTabProps {
  user: any;
  profileData: any;
  setProfileData: React.Dispatch<React.SetStateAction<any>>;
  showNotification: (message: string, type: 'success' | 'error') => void;
  isPetcare?: boolean;
  isMedical?: boolean;
}

const emptyDish: Partial<Product> = {
  name: '', category: '', price: '', shortDescription: '', allergens: '', imageURL: '',
};

const inputCls = "w-full bg-black/40 border border-[#ff6b35]/20 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#ff6b35] placeholder-gray-600";

export const GastroMenuTab: React.FC<GastroMenuTabProps> = ({
  user, profileData, setProfileData, showNotification, isPetcare = false, isMedical = false,
}) => {
  const isClinic = isPetcare || isMedical;
  const products: Product[] = Array.isArray(profileData?.products) ? profileData.products : [];

  // ── Salas / Mesas ────────────────────────────────────────────
  const [tables, setTables] = useState<number>(parseInt(String(profileData?.tableCount ?? 0), 10) || 0);
  const [savingTables, setSavingTables] = useState(false);

  const saveTables = async () => {
    if (!user?.id) return;
    setSavingTables(true);
    try {
      const value = Math.max(0, Math.min(500, tables || 0));
      const { error } = await supabase.from('profiles').update({ tableCount: value }).eq('id', user.id);
      if (error) throw error;
      setProfileData((prev: any) => ({ ...prev, tableCount: value }));
      showNotification(isClinic ? 'Salas actualizadas' : 'Mesas actualizadas', 'success');
    } catch (err: any) {
      showNotification(`Error al guardar: ${err?.message ?? err}`, 'error');
    } finally {
      setSavingTables(false);
    }
  };

  // ── Pasarelas de pago (config estructurada, 4 métodos) ───────
  const [gwConfig, setGwConfig] = useState<PaymentGatewaysConfig>(
    (profileData?.payment_gateways && !Array.isArray(profileData.payment_gateways))
      ? profileData.payment_gateways
      : {}
  );
  const [savingGateways, setSavingGateways] = useState(false);
  const [showGateways, setShowGateways] = useState(false);

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
    if (!user?.id) return;
    setSavingGateways(true);
    try {
      const { error } = await supabase.from('profiles').update({ payment_gateways: gwConfig }).eq('id', user.id);
      if (error) throw error;
      setProfileData((prev: any) => ({ ...prev, payment_gateways: gwConfig }));
      showNotification('Pasarelas de pago guardadas', 'success');
    } catch (err: any) {
      showNotification(`Error al guardar: ${err?.message ?? err}`, 'error');
    } finally {
      setSavingGateways(false);
    }
  };

  // ── Club de fidelidad ────────────────────────────────────────
  const [clubName, setClubName] = useState<string>(profileData?.clubName ?? '');
  const [clubTagline, setClubTagline] = useState<string>(profileData?.clubTagline ?? '');
  const [stampsReward, setStampsReward] = useState<string>(profileData?.stampsReward ?? '');
  const [savingClub, setSavingClub] = useState(false);

  const saveClub = async () => {
    if (!user?.id) return;
    setSavingClub(true);
    try {
      const payload: any = {
        clubName: clubName.trim() || null,
        clubTagline: clubTagline.trim() || null,
      };
      if (isClinic) payload.stampsReward = stampsReward.trim() || null;
      const { error } = await supabase.from('profiles').update(payload).eq('id', user.id);
      if (error) throw error;
      setProfileData((prev: any) => ({ ...prev, ...payload }));
      showNotification('Club actualizado', 'success');
    } catch (err: any) {
      showNotification(`Error al guardar el club: ${err?.message ?? err}`, 'error');
    } finally {
      setSavingClub(false);
    }
  };

  // ── Config clínica (solo petcare) ────────────────────────────
  const [specialty, setSpecialty] = useState<string>(profileData?.specialty ?? '');
  const [socialProof, setSocialProof] = useState<string>(profileData?.socialProof ?? '');
  const [emergencyPhone, setEmergencyPhone] = useState<string>(profileData?.emergencyPhone ?? '');
  const [clinicServicesRaw, setClinicServicesRaw] = useState<string>(
    Array.isArray(profileData?.clinicServices) ? profileData.clinicServices.join('\n') : ''
  );
  const [savingClinic, setSavingClinic] = useState(false);
  const [allowRecordDownload, setAllowRecordDownload] = useState<boolean>(!!profileData?.allowRecordDownload);

  const saveClinicConfig = async () => {
    if (!user?.id) return;
    setSavingClinic(true);
    try {
      const services = clinicServicesRaw.split('\n').map(s => s.trim()).filter(Boolean);
      const payload: any = {
        specialty: specialty.trim() || null,
        socialProof: socialProof.trim() || null,
        emergencyPhone: emergencyPhone.trim() || null,
        clinicServices: services.length > 0 ? services : null,
      };
      if (isMedical) payload.allowRecordDownload = allowRecordDownload;
      const { error } = await supabase.from('profiles').update(payload).eq('id', user.id);
      if (error) throw error;
      setProfileData((prev: any) => ({ ...prev, ...payload }));
      showNotification('Configuración de clínica guardada', 'success');
    } catch (err: any) {
      showNotification(`Error al guardar: ${err?.message ?? err}`, 'error');
    } finally {
      setSavingClinic(false);
    }
  };

  // ── Inventario (ULTRA) ───────────────────────────────────────
  const isUltra = (profileData?.plan ?? '').toLowerCase() === 'ultra';
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  useEffect(() => {
    if (!isUltra || !user?.id) return;
    let active = true;
    (async () => {
      const { data } = await supabase.from('gastro_inventory').select('*').eq('restaurant_id', user.id).order('name');
      if (active) setInventory((data as InventoryItem[]) || []);
    })();
    return () => { active = false; };
  }, [isUltra, user?.id]);

  // ── Productos ────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Product>>(emptyDish);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const recipe: RecipeIngredient[] = Array.isArray(form.recipe) ? form.recipe : [];
  const addIngredient = () => {
    const first = inventory[0];
    if (!first) return;
    setForm(p => ({ ...p, recipe: [...recipe, { itemId: first.id, itemName: first.name, unit: first.unit, qty: 1 }] }));
  };
  const updateIngredient = (idx: number, patch: Partial<RecipeIngredient>) => {
    const next = recipe.map((r, i) => {
      if (i !== idx) return r;
      const merged = { ...r, ...patch };
      if (patch.itemId) {
        const inv = inventory.find(x => x.id === patch.itemId);
        if (inv) { merged.itemName = inv.name; merged.unit = inv.unit; }
      }
      return merged;
    });
    setForm(p => ({ ...p, recipe: next }));
  };
  const removeIngredient = (idx: number) => {
    setForm(p => ({ ...p, recipe: recipe.filter((_, i) => i !== idx) }));
  };

  // ── Buscador del catálogo (debounce: no refiltra en cada tecla) ──
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 220);
  const visibleProducts = useMemo(
    () => (debouncedSearch.trim() ? products.filter(p => matchesQuery(p, debouncedSearch)) : products),
    [products, debouncedSearch],
  );

  const grouped = useMemo(() => {
    const map: Record<string, Product[]> = {};
    visibleProducts.forEach(p => {
      const cat = (p.category && p.category.trim()) || 'Sin categoría';
      if (!map[cat]) map[cat] = [];
      map[cat].push(p);
    });
    return map;
  }, [visibleProducts]);

  const categoryPresets = isMedical
    ? MEDICAL_CATEGORY_PRESETS
    : isPetcare ? CLINIC_CATEGORY_PRESETS : GASTRO_CATEGORY_PRESETS;

  // Categorías que el dueño ya usa + las sugeridas, sin repetir.
  const categoryOptions = useMemo(() => {
    const used = products.map(p => (p.category || '').trim()).filter(Boolean);
    return Array.from(new Set([...used, ...categoryPresets]));
  }, [products, categoryPresets]);

  const persistProducts = async (next: Product[]) => {
    const { error } = await supabase.from('profiles').update({ products: next }).eq('id', user.id);
    if (error) throw error;
    setProfileData((prev: any) => ({ ...prev, products: next }));
  };

  const openNew = () => { setForm(emptyDish); setEditingId(null); setShowForm(true); };
  const openEdit = (p: Product) => { setForm({ ...p }); setEditingId(p.id); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setForm(emptyDish); setEditingId(null); };

  const handleImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;
    setUploading(true);
    try {
      const fileName = `${Date.now()}_${file.name}`;
      const path = `products/${user.id}/${fileName}`;
      const { error } = await supabase.storage.from('assets').upload(path, file);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(path);
      setForm(prev => ({ ...prev, imageURL: publicUrl }));
    } catch (err: any) {
      showNotification(`Error al subir imagen: ${err?.message ?? err}`, 'error');
    } finally {
      setUploading(false);
    }
  };

  const noun = isClinic ? 'producto' : 'plato';

  const handleSaveDish = async () => {
    if (!form.name?.trim()) { showNotification(`El ${noun} necesita un nombre`, 'error'); return; }
    setSaving(true);
    try {
      let next: Product[];
      if (editingId) {
        next = products.map(p => p.id === editingId ? { ...(form as Product), id: editingId } : p);
      } else {
        const dish: Product = { ...(form as Product), id: `dish_${Date.now()}` };
        next = [...products, dish];
      }
      await persistProducts(next);
      showNotification(editingId ? 'Guardado' : 'Agregado', 'success');
      closeForm();
    } catch (err: any) {
      showNotification(`Error al guardar: ${err?.message ?? err}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(`¿Eliminar este ${noun}?`)) return;
    try {
      await persistProducts(products.filter(p => p.id !== id));
      showNotification('Eliminado', 'success');
    } catch (err: any) {
      showNotification(`Error al eliminar: ${err?.message ?? err}`, 'error');
    }
  };

  // Activar / desactivar un plato (available=false lo oculta del menú público)
  const toggleAvailable = async (p: Product) => {
    const currentlyActive = p.available !== false;
    const next = products.map(x => x.id === p.id ? { ...x, available: !currentlyActive } : x);
    try {
      await persistProducts(next);
      showNotification(currentlyActive ? `${noun.charAt(0).toUpperCase() + noun.slice(1)} desactivado` : `${noun.charAt(0).toUpperCase() + noun.slice(1)} activado`, 'success');
    } catch (err: any) {
      showNotification(`Error al actualizar: ${err?.message ?? err}`, 'error');
    }
  };

  return (
    <div className="animate-fade-in-up space-y-8 max-w-4xl mx-auto px-4 md:px-6 pb-32"
         style={{ fontFamily: "'Space Grotesk', sans-serif" }}>

      {/* Header */}
      <div className="border-b border-[#ff6b35]/15 pb-5">
        <h2 className="text-2xl font-black text-white flex items-center gap-2">
          {isMedical
            ? <FaHeartbeat className="text-[#ff6b35]" />
            : isPetcare
            ? <FaPaw className="text-[#ff6b35]" />
            : <FaUtensils className="text-[#ff6b35]" />}
          {isClinic ? 'Catálogo de Productos' : 'Menú y Mesas'}
        </h2>
        <p className="text-sm text-white/40 mt-1">
          {isMedical
            ? 'Gestiona los productos y servicios de la clínica, los consultorios y el Club de Pacientes.'
            : isPetcare
            ? 'Gestiona los productos y servicios de la clínica, las salas de consulta y el Club Pet VIP.'
            : 'Carga tus platos y postres y configura las mesas de tu local.'}
        </p>
      </div>

      {/* ── CONFIG CLÍNICA (solo petcare) ─────────────────────── */}
      {isClinic && (
        <div className="bg-white/[0.03] border border-[#ff6b35]/15 rounded-2xl p-5">
          <h3 className="text-sm font-black uppercase tracking-widest text-[#ff6b35] flex items-center gap-2 mb-4">
            <FaStethoscope size={13} /> Datos de la Clínica
          </h3>
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] text-white/50 uppercase tracking-widest font-bold mb-1">
                Especialidad (aparece en el hero del perfil)
              </label>
              <input type="text" value={specialty} onChange={e => setSpecialty(e.target.value)} maxLength={60}
                placeholder="Ej: Clínica Veterinaria & Trauma 24/7"
                className={inputCls} />
            </div>
            <div>
              <label className="block text-[11px] text-white/50 uppercase tracking-widest font-bold mb-1">
                Prueba social (ej: "+5,000 pacientes atendidos")
              </label>
              <input type="text" value={socialProof} onChange={e => setSocialProof(e.target.value)} maxLength={60}
                placeholder="Ej: +5,000 pacientes atendidos"
                className={inputCls} />
            </div>
            <div>
              <label className="block text-[11px] text-white/50 uppercase tracking-widest font-bold mb-1 flex items-center gap-1.5">
                <FaHeartbeat size={10} /> Teléfono de emergencias 24/7 (botón SOS rojo)
              </label>
              <input type="tel" value={emergencyPhone} onChange={e => setEmergencyPhone(e.target.value)}
                placeholder="Ej: 0963038666"
                className={inputCls} />
            </div>
            <div>
              <label className="block text-[11px] text-white/50 uppercase tracking-widest font-bold mb-1 flex items-center gap-1.5">
                <FaListUl size={10} /> Servicios para agendar (uno por línea)
              </label>
              <textarea value={clinicServicesRaw} onChange={e => setClinicServicesRaw(e.target.value)} rows={5}
                placeholder={'Consulta general\nVacunación\nDesparasitación\nPeluquería Canina / Felina\nEvaluación Quirúrgica'}
                className={`${inputCls} resize-none`} />
            </div>
            {isMedical && (
              <label className="flex items-start gap-3 p-3 rounded-xl bg-black/20 border border-[#ff6b35]/10 cursor-pointer">
                <input type="checkbox" checked={allowRecordDownload} onChange={e => setAllowRecordDownload(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-[#ff6b35]" />
                <span className="text-xs text-white/70 leading-snug">
                  <b className="text-white/90">Permitir que el paciente descargue su historia clínica</b> en PDF desde el Expediente de Salud del perfil público (al ingresar su código de miembro).
                </span>
              </label>
            )}
            <button onClick={saveClinicConfig} disabled={savingClinic}
              className="px-5 py-2.5 rounded-xl bg-[#ff6b35] hover:bg-[#e85a25] text-white text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50 flex items-center gap-2">
              <FaSave size={11} /> {savingClinic ? 'Guardando...' : 'Guardar datos de clínica'}
            </button>
          </div>
        </div>
      )}

      {/* ── SALAS / MESAS ─────────────────────────────────────── */}
      <div className="bg-white/[0.03] border border-[#ff6b35]/15 rounded-2xl p-5">
        <h3 className="text-sm font-black uppercase tracking-widest text-[#ff6b35] flex items-center gap-2 mb-4">
          <FaChair size={13} /> {isClinic ? 'Salas de Consulta' : 'Mesas del Local'}
        </h3>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[11px] text-white/50 uppercase tracking-widest font-bold mb-1">
              {isClinic ? 'Número de salas / boxes' : 'Número de mesas'}
            </label>
            <input type="number" min={0} max={500} value={tables}
              onChange={e => setTables(parseInt(e.target.value, 10) || 0)}
              className="w-32 bg-black/40 border border-[#ff6b35]/20 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#ff6b35]" />
          </div>
          <button onClick={saveTables} disabled={savingTables}
            className="px-5 py-2.5 rounded-xl bg-[#ff6b35] hover:bg-[#e85a25] text-white text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50 flex items-center gap-2">
            <FaSave size={11} /> {savingTables ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
        {tables > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {Array.from({ length: Math.min(tables, 60) }, (_, i) => i + 1).map(n => (
              <div key={n} className="w-10 h-10 rounded-lg bg-[#ff6b35]/10 border border-[#ff6b35]/25 flex items-center justify-center text-xs font-black text-[#ff6b35]">
                {n}
              </div>
            ))}
            {tables > 60 && <span className="text-xs text-white/40 self-center">+{tables - 60} más</span>}
          </div>
        )}
        <p className="text-[11px] text-white/40 mt-3">
          {isClinic
            ? 'El cliente seleccionará la sala/consultorio al solicitar atención. Verás cuál atendió cada caso en la pestaña Atenciones.'
            : 'El cliente elegirá su mesa de esta cantidad al pedir, y verás en qué mesa se hizo cada pedido (pestaña Comandas).'}
        </p>
      </div>

      {/* ── PASARELAS DE PAGO ─────────────────────────────────── */}
      <div className="bg-white/[0.03] border border-[#ff6b35]/15 rounded-2xl p-5">
        <button type="button" onClick={() => setShowGateways(v => !v)}
          className="w-full flex items-center justify-between gap-2 text-left">
          <h3 className="text-sm font-black uppercase tracking-widest text-[#ff6b35] flex items-center gap-2">
            💳 Pasarelas de pago
            {gwActiveCount > 0 && (
              <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-[#ff6b35]/15 text-[#ff6b35] font-bold">
                {gwActiveCount} activa{gwActiveCount > 1 ? 's' : ''}
              </span>
            )}
          </h3>
          <FaChevronDown size={14} className={`text-[#ff6b35] shrink-0 transition-transform ${showGateways ? 'rotate-180' : ''}`} />
        </button>

        {showGateways && (
        <div className="mt-4">
        <p className="text-[11px] text-white/45 mb-4 leading-snug">
          Activa los métodos de pago que quieras ofrecer. El cliente verá únicamente los activos al confirmar su
          {isClinic ? ' cita o pedido.' : ' pedido.'}
        </p>

        {(() => {
          const gwInput = "w-full bg-black/40 border border-[#ff6b35]/20 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#ff6b35] placeholder-gray-600";
          const card = (gwKey: GwKey, icon: React.ReactNode, title: string, desc: string, fields: React.ReactNode) => {
            const on = !!(gwConfig[gwKey] as any)?.enabled;
            return (
              <div className={`rounded-2xl border p-3.5 transition-colors ${on ? 'bg-[#ff6b35]/[0.05] border-[#ff6b35]/30' : 'bg-black/20 border-white/8'}`}>
                <button type="button" onClick={() => toggleGw(gwKey)} className="w-full flex items-center gap-3 text-left">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${on ? 'bg-[#ff6b35]/15 text-[#ff6b35]' : 'bg-white/5 text-white/40'}`}>{icon}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-white">{title}</p>
                    <p className="text-[11px] text-white/40 mt-0.5 truncate">{desc}</p>
                  </div>
                  {on ? <FaToggleOn className="text-[#ff6b35] text-2xl shrink-0" /> : <FaToggleOff className="text-white/25 text-2xl shrink-0" />}
                </button>
                {on && <div className="mt-3 space-y-2">{fields}</div>}
              </div>
            );
          };

          return (
            <div className="space-y-2.5">
              {card('directLink', <FaLink size={13} />, 'Link Directo / Botón de Pago', 'URL pública de cobro de tu banco o pasarela', (
                <>
                  <input className={gwInput} placeholder='Etiqueta (ej. "Pagar con tarjeta")'
                    value={gwConfig.directLink?.name ?? ''} onChange={e => updateGw('directLink', 'name', e.target.value)} />
                  <input className={gwInput} placeholder="https://link-de-pago..."
                    value={gwConfig.directLink?.url ?? ''} onChange={e => updateGw('directLink', 'url', e.target.value)} />
                </>
              ))}

              {card('payphone', <FaMobileAlt size={13} />, 'PayPhone / Pasarela API', 'Credenciales del comercio (token + Store ID)', (
                <>
                  <input className={gwInput} placeholder="Token del comercio"
                    value={gwConfig.payphone?.token ?? ''} onChange={e => updateGw('payphone', 'token', e.target.value)} />
                  <input className={gwInput} placeholder="Store ID"
                    value={gwConfig.payphone?.storeId ?? ''} onChange={e => updateGw('payphone', 'storeId', e.target.value)} />
                </>
              ))}

              {card('bankTransfer', <FaUniversity size={13} />, 'Transferencia Bancaria', 'Datos de la cuenta para depósito/transferencia', (
                <>
                  <input className={gwInput} placeholder="Banco"
                    value={gwConfig.bankTransfer?.bank ?? ''} onChange={e => updateGw('bankTransfer', 'bank', e.target.value)} />
                  <div className="grid grid-cols-2 gap-2">
                    <input className={gwInput} placeholder="Tipo de cuenta"
                      value={gwConfig.bankTransfer?.accountType ?? ''} onChange={e => updateGw('bankTransfer', 'accountType', e.target.value)} />
                    <input className={gwInput} placeholder="N° de cuenta"
                      value={gwConfig.bankTransfer?.accountNumber ?? ''} onChange={e => updateGw('bankTransfer', 'accountNumber', e.target.value)} />
                  </div>
                  <input className={gwInput} placeholder="Titular de la cuenta"
                    value={gwConfig.bankTransfer?.holder ?? ''} onChange={e => updateGw('bankTransfer', 'holder', e.target.value)} />
                  <div className="grid grid-cols-2 gap-2">
                    <input className={gwInput} placeholder="Cédula / RUC"
                      value={gwConfig.bankTransfer?.idNumber ?? ''} onChange={e => updateGw('bankTransfer', 'idNumber', e.target.value)} />
                    <input className={gwInput} placeholder="Email"
                      value={gwConfig.bankTransfer?.email ?? ''} onChange={e => updateGw('bankTransfer', 'email', e.target.value)} />
                  </div>
                </>
              ))}

              {card('whatsapp', <FaWhatsapp size={13} />, 'WhatsApp / Pago Manual', 'Número que recibe los comprobantes de pago', (
                <input className={gwInput} placeholder="Ej. 0963038666"
                  value={gwConfig.whatsapp?.phone ?? ''} onChange={e => updateGw('whatsapp', 'phone', e.target.value)} />
              ))}
            </div>
          );
        })()}

        <button onClick={handleSaveGateways} disabled={savingGateways}
          className="mt-4 w-full py-2.5 rounded-xl bg-[#ff6b35] hover:bg-[#e85a25] text-white text-xs font-black uppercase tracking-wider disabled:opacity-50 transition-all active:scale-95 flex items-center justify-center gap-2">
          <FaSave size={11} /> {savingGateways ? 'Guardando...' : 'Guardar pasarelas'}
        </button>
        </div>
        )}
      </div>

      {/* ── CLUB ─────────────────────────────────────────────── */}
      <div className="bg-white/[0.03] border border-[#ff6b35]/15 rounded-2xl p-5">
        <h3 className="text-sm font-black uppercase tracking-widest text-[#ff6b35] flex items-center gap-2 mb-2">
          {isMedical ? '🩺 Club de Pacientes' : isClinic ? '🐾 Club Pet VIP' : '🎁 Club de Fidelidad'}
        </h3>
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] text-white/50 uppercase tracking-widest font-bold mb-1">Nombre del club</label>
            <input type="text" value={clubName} onChange={e => setClubName(e.target.value)} maxLength={40}
              placeholder={isMedical ? 'Ej. Club de Pacientes, Salud+…' : isClinic ? 'Ej. Club Pet VIP, Familia Peluda…' : 'Ej. Club VIP, Familia [tu marca]…'}
              className={inputCls} />
          </div>
          <div>
            <label className="block text-[11px] text-white/50 uppercase tracking-widest font-bold mb-1">Eslogan (opcional)</label>
            <input type="text" value={clubTagline} onChange={e => setClubTagline(e.target.value)} maxLength={90}
              placeholder={isMedical ? 'Ej. Acumula puntos y desbloquea un chequeo gratis' : isClinic ? 'Ej. Acumula sellos y desbloquea baños gratis' : 'Ej. Beneficios exclusivos para clientes frecuentes'}
              className={inputCls} />
          </div>
          {isClinic && (
            <div>
              <label className="block text-[11px] text-white/50 uppercase tracking-widest font-bold mb-1">
                Premio al completar 6 sellos
              </label>
              <input type="text" value={stampsReward} onChange={e => setStampsReward(e.target.value)} maxLength={80}
                placeholder="Ej. Baño gratis, Profilaxis dental gratis…"
                className={inputCls} />
            </div>
          )}
          <button onClick={saveClub} disabled={savingClub}
            className="px-5 py-2.5 rounded-xl bg-[#ff6b35] hover:bg-[#e85a25] text-white text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50 flex items-center gap-2">
            <FaSave size={11} /> {savingClub ? 'Guardando...' : 'Guardar club'}
          </button>
        </div>
      </div>

      {/* ── IMPORTACIÓN MASIVA (ULTRA) ────────────────────────── */}
      <BulkProductImport
        products={products}
        onImport={persistProducts}
        showNotification={showNotification}
        isUltra={isUltra}
        exportName={isClinic ? 'catalogo_clinica' : 'menu'}
        templateRows={isClinic ? undefined : [
          ['Lomo Saltado', 'Platos Fuertes', '', '', '12.50', '', 'PF-001', 'Con arroz y papas fritas', '', 'Si'],
          ['Cheesecake de Maracuya', 'Postres', '', '', '5.00', '', 'PS-004', 'Porcion individual', '', 'Si'],
        ]}
      />

      {/* ── PRODUCTOS / MENÚ ──────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h3 className="text-sm font-black uppercase tracking-widest text-[#ff6b35] flex items-center gap-2">
            {isMedical ? <FaHeartbeat size={13} /> : isClinic ? <FaPaw size={13} /> : <FaUtensils size={13} />}
            {isClinic ? 'Productos y Servicios' : 'Platos y Postres'}
            <span className="text-white/30 font-bold">
              ({debouncedSearch.trim() ? `${visibleProducts.length} de ${products.length}` : products.length})
            </span>
          </h3>
          <button onClick={openNew}
            className="flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white bg-[#ff6b35] hover:bg-[#e85a25] rounded-xl transition-all shadow-lg shadow-[#ff6b35]/15">
            <FaPlus /> {isClinic ? 'Agregar producto' : 'Agregar plato'}
          </button>
        </div>

        {/* Buscador: nombre, marca, principio activo, categoría o SKU */}
        {products.length > 5 && (
          <div className="relative mb-4">
            <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-white/25 w-3.5 h-3.5" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder={isClinic ? 'Buscar por nombre, marca o principio activo…' : 'Buscar por nombre, categoría o marca…'}
              className="w-full bg-white/5 border border-white/10 text-white text-sm rounded-xl pl-10 pr-10 py-3 focus:outline-none focus:border-[#ff6b35]/40 placeholder-white/25" />
            {search && (
              <button onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition p-1">
                <FaTimes size={12} />
              </button>
            )}
          </div>
        )}

        {products.length > 0 && visibleProducts.length === 0 ? (
          <div className="text-center py-14 text-white/30 bg-white/[0.02] rounded-2xl border border-white/5">
            <FaSearch className="mx-auto text-3xl mb-3 opacity-40" />
            <p className="text-sm">Ningún producto coincide con “{debouncedSearch}”.</p>
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-14 text-white/30 bg-white/[0.02] rounded-2xl border border-white/5">
            {isMedical ? <FaHeartbeat className="mx-auto text-3xl mb-3 opacity-40" /> : isClinic ? <FaPaw className="mx-auto text-3xl mb-3 opacity-40" /> : <FaUtensils className="mx-auto text-3xl mb-3 opacity-40" />}
            <p className="text-sm">
              {isMedical ? 'Sin productos cargados aún. Agrega servicios, exámenes, tratamientos o productos.' : isClinic ? 'Sin productos cargados aún. Agrega alimentos, antipulgas, vacunas o servicios.' : 'Aún no has cargado platos. Agrega tu primer plato estrella.'}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.keys(grouped).map(cat => (
              <div key={cat}>
                <h4 className="text-[11px] font-black uppercase tracking-widest text-white/40 mb-2">{cat}</h4>
                <div className="space-y-2">
                  {grouped[cat].map(p => {
                    const active = p.available !== false;
                    return (
                    <div key={p.id} className={`flex items-center gap-3 bg-white/[0.03] border rounded-xl p-3 transition-opacity ${active ? 'border-white/8' : 'border-white/8 opacity-55'}`}>
                      {p.imageURL
                        ? <img src={p.imageURL} alt={p.name} className={`w-14 h-14 rounded-lg object-cover shrink-0 border border-[#ff6b35]/15 ${active ? '' : 'grayscale'}`} />
                        : <div className="w-14 h-14 rounded-lg bg-black/40 border border-white/5 flex items-center justify-center text-white/20 shrink-0"><FaImage /></div>}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">{p.name}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {p.price && <span className="text-[#ff6b35] font-mono font-bold text-xs">{p.price}</span>}
                          {p.brand && <span className="text-[9px] text-white/45 flex items-center gap-1"><FaTag size={8} /> {p.brand}</span>}
                          {p.activeIngredient && <span className="text-[9px] text-sky-300/70 flex items-center gap-1"><FaFlask size={8} /> {p.activeIngredient}</span>}
                          {!active && <span className="text-[9px] font-black uppercase tracking-widest text-red-400 bg-red-500/10 border border-red-500/30 rounded px-1.5 py-0.5">Desactivado</span>}
                          {!isClinic && p.allergens && <span className="text-[9px] text-amber-400/70 flex items-center gap-1"><FaAllergies size={9} /> {p.allergens}</span>}
                        </div>
                      </div>
                      <button onClick={() => toggleAvailable(p)}
                        className={`flex items-center justify-center transition shrink-0 ${active ? 'text-[#ff6b35] hover:text-[#e85a25]' : 'text-white/30 hover:text-white/60'}`}
                        title={active ? `Desactivar (ocultar del menú)` : `Activar (mostrar en el menú)`}>
                        {active ? <FaToggleOn size={26} /> : <FaToggleOff size={26} />}
                      </button>
                      <button onClick={() => openEdit(p)}
                        className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 text-white/50 hover:text-[#ff6b35] flex items-center justify-center transition" title="Editar">
                        <FaPen size={11} />
                      </button>
                      <button onClick={() => handleDelete(p.id)}
                        className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 flex items-center justify-center transition" title="Eliminar">
                        <FaTrash size={11} />
                      </button>
                    </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── FORM MODAL ────────────────────────────────────────── */}
      {showForm && createPortal(
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm" onClick={closeForm}>
          <div className="w-full max-w-lg bg-[#0f0702] border border-[#ff6b35]/25 rounded-2xl shadow-2xl max-h-[88vh] flex flex-col overflow-hidden"
               onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#ff6b35]/15 shrink-0">
              <h3 className="text-base font-black text-white">
                {editingId
                  ? (isClinic ? 'Editar producto' : 'Editar plato')
                  : (isClinic ? 'Nuevo producto' : 'Nuevo plato')}
              </h3>
              <button onClick={closeForm} className="text-gray-400 hover:text-white transition"><FaTimes size={16} /></button>
            </div>
            <div className="p-5 overflow-y-auto flex-1 space-y-3">
              <div className="flex items-center gap-4">
                {form.imageURL
                  ? <img src={form.imageURL} alt="" className="w-20 h-20 rounded-xl object-cover border border-[#ff6b35]/20" />
                  : <div className="w-20 h-20 rounded-xl bg-black/40 border border-white/5 flex items-center justify-center text-white/20"><FaImage /></div>}
                <label className="cursor-pointer px-4 py-2.5 rounded-xl bg-white/5 border border-[#ff6b35]/20 text-white text-xs font-bold hover:bg-white/10 transition">
                  {uploading ? 'Subiendo...' : 'Subir foto'}
                  <input type="file" accept="image/*" onChange={handleImage} className="hidden" />
                </label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input value={form.name || ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder={isClinic ? 'Nombre del producto *' : 'Nombre del plato *'}
                  className={inputCls} />
                <div>
                  <input list="cnx-category-presets" value={form.category || ''}
                    onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                    placeholder={isMedical ? 'Categoría (Farmacia, Exámenes…)' : isClinic ? 'Categoría (Farmacia, Alimento Canino…)' : 'Categoría (Platos Fuertes, Postres…)'}
                    className={inputCls} />
                  <datalist id="cnx-category-presets">
                    {categoryOptions.map(option => <option key={option} value={option} />)}
                  </datalist>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input value={form.price || ''} onChange={e => setForm(p => ({ ...p, price: e.target.value }))}
                  placeholder="Precio (ej. $12.00)" className={inputCls} />
                <input value={form.sku || ''} onChange={e => setForm(p => ({ ...p, sku: e.target.value }))}
                  placeholder="SKU / código interno (opcional)" className={inputCls} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input value={form.brand || ''} onChange={e => setForm(p => ({ ...p, brand: e.target.value }))}
                  placeholder={isClinic ? 'Marca / laboratorio (Royal Canin, MSD…)' : 'Marca (opcional)'}
                  className={inputCls} />
                {isClinic && (
                  <input value={form.activeIngredient || ''} onChange={e => setForm(p => ({ ...p, activeIngredient: e.target.value }))}
                    placeholder="Principio activo (Amoxicilina…)" className={inputCls} />
                )}
              </div>
              <p className="text-[10px] text-white/35 -mt-1">
                {isClinic
                  ? 'Marca y principio activo hacen que el cliente encuentre el producto buscando “Royal Canin” o “Amoxicilina”.'
                  : 'La marca se suma al buscador del perfil público.'}
              </p>
              <textarea value={form.shortDescription || ''} onChange={e => setForm(p => ({ ...p, shortDescription: e.target.value }))}
                placeholder="Descripción" rows={2} className={`${inputCls} resize-none`} />
              <ProductSubscriptionField accent="#ff6b35"
                value={form.subscription} onChange={v => setForm(p => ({ ...p, subscription: v }))} />
              {!isClinic && (
                <input value={form.allergens || ''} onChange={e => setForm(p => ({ ...p, allergens: e.target.value }))}
                  placeholder="Alérgenos (Gluten, lácteos…)" className={inputCls} />
              )}

              {isUltra && (
                <div className="pt-3 border-t border-[#ff6b35]/15">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-[11px] font-black uppercase tracking-widest text-[#ff6b35] flex items-center gap-1.5">
                      <FaWarehouse size={11} /> {isClinic ? 'Insumos (descuenta inventario)' : 'Receta (descuenta inventario)'}
                    </h4>
                    {inventory.length > 0 && (
                      <button type="button" onClick={addIngredient}
                        className="text-[10px] font-black uppercase tracking-wider text-[#ff6b35] hover:text-[#ff8f61] flex items-center gap-1">
                        <FaPlus size={9} /> {isClinic ? 'Insumo' : 'Ingrediente'}
                      </button>
                    )}
                  </div>
                  {inventory.length === 0 ? (
                    <p className="text-[11px] text-white/40">Agrega insumos en <b>Inventario</b> para enlazarlos aquí.</p>
                  ) : recipe.length === 0 ? (
                    <p className="text-[11px] text-white/40">
                      Sin insumos enlazados — este {noun} siempre estará disponible.
                      Agrega ingredientes para que se descuenten al vender y se marque <span className="text-[#ff6b35]">agotado</span> si falta stock.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {recipe.map((ing, idx) => {
                        const inv = inventory.find(x => x.id === ing.itemId);
                        return (
                          <div key={idx} className="flex items-center gap-2">
                            <select value={ing.itemId} onChange={e => updateIngredient(idx, { itemId: e.target.value })}
                              className="flex-1 min-w-0 bg-black/40 border border-[#ff6b35]/20 text-white text-xs rounded-lg px-2 py-2 focus:outline-none focus:border-[#ff6b35]">
                              {inventory.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                            </select>
                            <input type="number" step="any" min={0} value={ing.qty}
                              onChange={e => updateIngredient(idx, { qty: parseFloat(e.target.value) || 0 })}
                              className="w-20 bg-black/40 border border-[#ff6b35]/20 text-white text-xs rounded-lg px-2 py-2 focus:outline-none focus:border-[#ff6b35]" />
                            <span className="text-[10px] text-white/40 w-12 shrink-0">{inv?.unit || ing.unit || ''}</span>
                            <button type="button" onClick={() => removeIngredient(idx)}
                              className="w-7 h-7 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 flex items-center justify-center shrink-0"><FaTrash size={10} /></button>
                          </div>
                        );
                      })}
                      <p className="text-[10px] text-white/35 mt-1">Cantidad consumida por cada {noun} vendido.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-[#ff6b35]/15 shrink-0">
              <button onClick={handleSaveDish} disabled={saving || uploading}
                className="w-full py-3.5 rounded-xl bg-[#ff6b35] hover:bg-[#e85a25] text-white font-black text-xs uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                <FaSave size={12} />
                {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : (isClinic ? 'Agregar al catálogo' : 'Agregar al menú')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default GastroMenuTab;
