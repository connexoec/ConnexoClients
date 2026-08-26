import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../src/lib/supabase';
import type { InventoryItem, InventoryPurchase } from '../../types';
import {
  FaBoxes, FaPlus, FaTrash, FaPen, FaTimes, FaSave, FaTruck,
  FaExclamationTriangle, FaWhatsapp, FaCheckCircle, FaWarehouse,
} from 'react-icons/fa';

interface GastroInventoryTabProps {
  user: any;
  showNotification: (message: string, type: 'success' | 'error') => void;
}

const UNITS = ['unidad', 'g', 'kg', 'ml', 'l', 'oz', 'lb', 'porción', 'caja', 'paquete'];
const SUPPLIER_STATUS: Record<string, { label: string; color: string }> = {
  ninguno:    { label: 'Sin proveedor', color: 'text-gray-400 bg-white/5 border-white/10' },
  contactado: { label: 'Contactado',    color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  cotizado:   { label: 'Cotizado',      color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
  pedido:     { label: 'Pedido',        color: 'text-purple-400 bg-purple-500/10 border-purple-500/30' },
  recibido:   { label: 'Recibido',      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
};
const PURCHASE_STATUS: Record<string, { label: string; color: string }> = {
  contactado: { label: 'Contactado',  color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  pedido:     { label: 'Pedido',      color: 'text-purple-400 bg-purple-500/10 border-purple-500/30' },
  recibido:   { label: 'Recibido',    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  cancelado:  { label: 'Cancelado',   color: 'text-red-400 bg-red-500/10 border-red-500/30' },
};

const emptyItem: Partial<InventoryItem> = {
  name: '', unit: 'unidad', stock_qty: 0, low_stock_threshold: 0, cost_per_unit: 0,
  supplier_name: '', supplier_phone: '', supplier_email: '', supplier_status: 'ninguno', notes: '',
};

const inputCls = "w-full bg-black/40 border border-[#ff6b35]/20 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#ff6b35] placeholder-gray-600";
const waLink = (phone?: string | null, msg = '') =>
  `https://wa.me/${String(phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;

export const GastroInventoryTab: React.FC<GastroInventoryTabProps> = ({ user, showNotification }) => {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [purchases, setPurchases] = useState<InventoryPurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'stock' | 'compras'>('stock');

  const fetchAll = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [{ data: inv }, { data: pur }] = await Promise.all([
        supabase.from('gastro_inventory').select('*').eq('restaurant_id', user.id).order('name'),
        supabase.from('gastro_purchases').select('*').eq('restaurant_id', user.id).order('created_at', { ascending: false }),
      ]);
      setItems((inv as InventoryItem[]) || []);
      setPurchases((pur as InventoryPurchase[]) || []);
    } catch (err: any) {
      console.error('inventory fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    fetchAll();
    const channel = supabase.channel(`gastro_inventory_${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gastro_inventory', filter: `restaurant_id=eq.${user.id}` }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gastro_purchases', filter: `restaurant_id=eq.${user.id}` }, () => fetchAll())
      .subscribe();
    const poll = setInterval(fetchAll, 15000);
    return () => { supabase.removeChannel(channel); clearInterval(poll); };
  }, [user?.id, fetchAll]);

  // ── Item modal ──────────────────────────────────────────────
  const [showItemForm, setShowItemForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [itemForm, setItemForm] = useState<Partial<InventoryItem>>(emptyItem);
  const [savingItem, setSavingItem] = useState(false);

  const openNewItem = () => { setItemForm(emptyItem); setEditingId(null); setShowItemForm(true); };
  const openEditItem = (it: InventoryItem) => { setItemForm({ ...it }); setEditingId(it.id); setShowItemForm(true); };
  const closeItemForm = () => { setShowItemForm(false); setItemForm(emptyItem); setEditingId(null); };

  const saveItem = async () => {
    if (!itemForm.name?.trim()) { showNotification('El insumo necesita un nombre', 'error'); return; }
    setSavingItem(true);
    try {
      const payload = {
        restaurant_id: user.id,
        name: itemForm.name!.trim(),
        unit: itemForm.unit || 'unidad',
        stock_qty: Number(itemForm.stock_qty) || 0,
        low_stock_threshold: Number(itemForm.low_stock_threshold) || 0,
        cost_per_unit: Number(itemForm.cost_per_unit) || 0,
        supplier_name: itemForm.supplier_name?.trim() || null,
        supplier_phone: itemForm.supplier_phone?.trim() || null,
        supplier_email: itemForm.supplier_email?.trim() || null,
        supplier_status: itemForm.supplier_status || 'ninguno',
        notes: itemForm.notes?.trim() || null,
        updated_at: new Date().toISOString(),
      };
      if (editingId) {
        const { error } = await supabase.from('gastro_inventory').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('gastro_inventory').insert(payload);
        if (error) throw error;
      }
      showNotification(editingId ? 'Insumo actualizado' : 'Insumo agregado', 'success');
      closeItemForm();
      fetchAll();
    } catch (err: any) {
      showNotification(`Error al guardar: ${err?.message ?? err}`, 'error');
    } finally {
      setSavingItem(false);
    }
  };

  const deleteItem = async (id: string) => {
    if (!window.confirm('¿Eliminar este insumo del inventario? Los platos que lo usen quedarán sin ese ingrediente.')) return;
    try {
      const { error } = await supabase.from('gastro_inventory').delete().eq('id', id);
      if (error) throw error;
      showNotification('Insumo eliminado', 'success');
      fetchAll();
    } catch (err: any) {
      showNotification(`Error al eliminar: ${err?.message ?? err}`, 'error');
    }
  };

  // Ajuste rápido de stock (+/- y "rellenar")
  const adjustStock = async (it: InventoryItem, delta: number) => {
    const next = Math.max(0, Number(it.stock_qty) + delta);
    try {
      const { error } = await supabase.from('gastro_inventory')
        .update({ stock_qty: next, updated_at: new Date().toISOString() }).eq('id', it.id);
      if (error) throw error;
      setItems(prev => prev.map(x => x.id === it.id ? { ...x, stock_qty: next } : x));
    } catch (err: any) {
      showNotification(`Error: ${err?.message ?? err}`, 'error');
    }
  };

  // ── Purchase modal ──────────────────────────────────────────
  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const emptyPurchase: Partial<InventoryPurchase> = { item_id: '', qty: 0, unit_cost: 0, status: 'contactado', notes: '' };
  const [purForm, setPurForm] = useState<Partial<InventoryPurchase>>(emptyPurchase);
  const [savingPur, setSavingPur] = useState(false);

  const openNewPurchase = () => { setPurForm(emptyPurchase); setShowPurchaseForm(true); };
  const closePurchaseForm = () => { setShowPurchaseForm(false); setPurForm(emptyPurchase); };

  const savePurchase = async () => {
    if (!purForm.item_id) { showNotification('Elige el insumo a comprar', 'error'); return; }
    const item = items.find(i => i.id === purForm.item_id);
    setSavingPur(true);
    try {
      const qty = Number(purForm.qty) || 0;
      const unitCost = Number(purForm.unit_cost) || 0;
      const payload = {
        restaurant_id: user.id,
        item_id: purForm.item_id,
        item_name: item?.name || null,
        supplier_name: item?.supplier_name || null,
        supplier_phone: item?.supplier_phone || null,
        qty,
        unit: item?.unit || null,
        unit_cost: unitCost,
        total_cost: +(qty * unitCost).toFixed(2),
        status: purForm.status || 'contactado',
        notes: purForm.notes?.trim() || null,
      };
      const { error } = await supabase.from('gastro_purchases').insert(payload);
      if (error) throw error;
      // Refleja el estado de contacto en el insumo.
      if (item && payload.status !== 'cancelado') {
        await supabase.from('gastro_inventory')
          .update({ supplier_status: payload.status, updated_at: new Date().toISOString() })
          .eq('id', item.id);
      }
      showNotification('Compra registrada', 'success');
      closePurchaseForm();
      fetchAll();
    } catch (err: any) {
      showNotification(`Error al registrar: ${err?.message ?? err}`, 'error');
    } finally {
      setSavingPur(false);
    }
  };

  const advancePurchase = async (p: InventoryPurchase, status: string) => {
    try {
      const { error } = await supabase.from('gastro_purchases').update({ status }).eq('id', p.id);
      if (error) throw error;
      if (p.item_id && status !== 'cancelado') {
        await supabase.from('gastro_inventory')
          .update({ supplier_status: status, updated_at: new Date().toISOString() }).eq('id', p.item_id);
      }
      fetchAll();
    } catch (err: any) {
      showNotification(`Error: ${err?.message ?? err}`, 'error');
    }
  };

  const receivePurchase = async (p: InventoryPurchase) => {
    if (!window.confirm(`¿Marcar como recibido? Se sumarán ${p.qty} ${p.unit || ''} de "${p.item_name}" al stock.`)) return;
    try {
      const { data, error } = await supabase.rpc('receive_gastro_purchase', { p_purchase_id: p.id });
      if (error) throw error;
      if (!data?.ok) { showNotification('No se pudo recibir la compra', 'error'); return; }
      showNotification('Compra recibida · stock actualizado', 'success');
      fetchAll();
    } catch (err: any) {
      showNotification(`Error: ${err?.message ?? err}`, 'error');
    }
  };

  const deletePurchase = async (id: string) => {
    if (!window.confirm('¿Eliminar este registro de compra?')) return;
    try {
      const { error } = await supabase.from('gastro_purchases').delete().eq('id', id);
      if (error) throw error;
      fetchAll();
    } catch (err: any) {
      showNotification(`Error: ${err?.message ?? err}`, 'error');
    }
  };

  const lowStock = useMemo(
    () => items.filter(i => Number(i.stock_qty) <= Number(i.low_stock_threshold) && Number(i.low_stock_threshold) > 0),
    [items]
  );
  const inventoryValue = useMemo(
    () => items.reduce((s, i) => s + Number(i.stock_qty) * Number(i.cost_per_unit), 0),
    [items]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#ff6b35]" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up space-y-6 max-w-4xl mx-auto px-4 md:px-6 pb-32"
         style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      {/* Header */}
      <div className="border-b border-[#ff6b35]/15 pb-5">
        <h2 className="text-2xl font-black text-white flex items-center gap-2">
          <FaWarehouse className="text-[#ff6b35]" /> Inventario
        </h2>
        <p className="text-sm text-white/40 mt-1">
          Controla tus insumos, proveedores y compras. Los platos con receta se descuentan solos al venderse y se marcan
          <span className="text-[#ff6b35] font-bold"> agotados</span> cuando falta un ingrediente.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white/[0.03] border border-[#ff6b35]/15 rounded-2xl p-4">
          <div className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Insumos</div>
          <div className="text-2xl font-black text-white mt-1">{items.length}</div>
        </div>
        <div className={`rounded-2xl p-4 border ${lowStock.length > 0 ? 'bg-amber-500/10 border-amber-500/30' : 'bg-white/[0.03] border-[#ff6b35]/15'}`}>
          <div className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Stock bajo</div>
          <div className={`text-2xl font-black mt-1 ${lowStock.length > 0 ? 'text-amber-400' : 'text-white'}`}>{lowStock.length}</div>
        </div>
        <div className="bg-white/[0.03] border border-[#ff6b35]/15 rounded-2xl p-4">
          <div className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Valor stock</div>
          <div className="text-2xl font-black text-white mt-1">${inventoryValue.toFixed(0)}</div>
        </div>
      </div>

      {/* Alerta de stock bajo */}
      {lowStock.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3">
          <FaExclamationTriangle className="text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-200/90">
            <b>{lowStock.length} insumo(s) en stock bajo:</b> {lowStock.map(i => i.name).join(', ')}. Repón antes de que se agoten los platos.
          </div>
        </div>
      )}

      {/* Tabs internos */}
      <div className="flex gap-2">
        {(['stock', 'compras'] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider border transition-all ${
              view === v ? 'bg-[#ff6b35] border-transparent text-white' : 'bg-[#ff6b35]/5 border-[#ff6b35]/15 text-gray-400 hover:text-white'
            }`}>
            {v === 'stock' ? '📦 Insumos' : '🚚 Compras / Proveedores'}
          </button>
        ))}
      </div>

      {/* ── STOCK ─────────────────────────────────────────── */}
      {view === 'stock' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={openNewItem}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white bg-[#ff6b35] hover:bg-[#e85a25] rounded-xl transition-all shadow-lg shadow-[#ff6b35]/15">
              <FaPlus /> Agregar insumo
            </button>
          </div>

          {items.length === 0 ? (
            <div className="text-center py-14 text-white/30 bg-white/[0.02] rounded-2xl border border-white/5">
              <FaBoxes className="mx-auto text-3xl mb-3 opacity-40" />
              <p className="text-sm">Aún no tienes insumos. Agrega tu primer ingrediente.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map(it => {
                const low = Number(it.stock_qty) <= Number(it.low_stock_threshold) && Number(it.low_stock_threshold) > 0;
                const out = Number(it.stock_qty) <= 0;
                const ss = SUPPLIER_STATUS[it.supplier_status || 'ninguno'] || SUPPLIER_STATUS.ninguno;
                return (
                  <div key={it.id} className={`bg-white/[0.03] border rounded-xl p-4 ${out ? 'border-red-500/30' : low ? 'border-amber-500/30' : 'border-white/8'}`}>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-white truncate">{it.name}</p>
                          {out ? <span className="text-[9px] font-black uppercase tracking-widest text-red-400 bg-red-500/10 border border-red-500/30 rounded px-1.5 py-0.5">Agotado</span>
                            : low ? <span className="text-[9px] font-black uppercase tracking-widest text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5">Bajo</span> : null}
                          <span className={`text-[9px] font-black uppercase tracking-widest rounded px-1.5 py-0.5 border ${ss.color}`}>{ss.label}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[11px] text-white/50">
                          <span>Stock: <b className={`font-mono ${out ? 'text-red-400' : low ? 'text-amber-400' : 'text-[#ff6b35]'}`}>{Number(it.stock_qty)}</b> {it.unit}</span>
                          {Number(it.cost_per_unit) > 0 && <span>· ${Number(it.cost_per_unit).toFixed(2)}/{it.unit}</span>}
                          {it.supplier_name && <span>· {it.supplier_name}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => adjustStock(it, -1)} className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white flex items-center justify-center font-black">−</button>
                        <button onClick={() => adjustStock(it, 1)} className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white flex items-center justify-center font-black">+</button>
                        {it.supplier_phone && (
                          <a href={waLink(it.supplier_phone, `Hola ${it.supplier_name || ''}, quiero pedir ${it.name}.`)} target="_blank" rel="noopener noreferrer"
                            className="w-8 h-8 rounded-lg bg-[#25D366]/10 border border-[#25D366]/25 text-[#25D366] flex items-center justify-center" title="Contactar proveedor">
                            <FaWhatsapp size={13} />
                          </a>
                        )}
                        <button onClick={() => openEditItem(it)} className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 text-white/50 hover:text-[#ff6b35] flex items-center justify-center" title="Editar"><FaPen size={11} /></button>
                        <button onClick={() => deleteItem(it.id)} className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 flex items-center justify-center" title="Eliminar"><FaTrash size={11} /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── COMPRAS ───────────────────────────────────────── */}
      {view === 'compras' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={openNewPurchase} disabled={items.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white bg-[#ff6b35] hover:bg-[#e85a25] rounded-xl transition-all shadow-lg shadow-[#ff6b35]/15 disabled:opacity-40">
              <FaTruck /> Nueva compra
            </button>
          </div>

          {items.length === 0 && (
            <p className="text-xs text-white/40 text-center py-4">Primero agrega insumos en la pestaña "Insumos".</p>
          )}

          {purchases.length === 0 ? (
            items.length > 0 && (
              <div className="text-center py-14 text-white/30 bg-white/[0.02] rounded-2xl border border-white/5">
                <FaTruck className="mx-auto text-3xl mb-3 opacity-40" />
                <p className="text-sm">Sin compras registradas. Registra desde el primer contacto con tu proveedor.</p>
              </div>
            )
          ) : (
            <div className="space-y-2">
              {purchases.map(p => {
                const ps = PURCHASE_STATUS[p.status] || PURCHASE_STATUS.contactado;
                return (
                  <div key={p.id} className="bg-white/[0.03] border border-white/8 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-white truncate">{p.item_name || 'Insumo'}</p>
                          <span className={`text-[9px] font-black uppercase tracking-widest rounded px-1.5 py-0.5 border ${ps.color}`}>{ps.label}</span>
                        </div>
                        <div className="text-[11px] text-white/50 mt-1">
                          {Number(p.qty)} {p.unit || ''} · ${Number(p.unit_cost).toFixed(2)}/u · Total <b className="text-[#ff6b35] font-mono">${Number(p.total_cost).toFixed(2)}</b>
                        </div>
                        {p.supplier_name && (
                          <div className="text-[11px] text-white/40 mt-0.5">
                            Proveedor: {p.supplier_name}
                            {p.supplier_phone && (
                              <a href={waLink(p.supplier_phone, `Hola ${p.supplier_name}, sobre el pedido de ${p.item_name}.`)} target="_blank" rel="noopener noreferrer" className="text-[#25D366] ml-2 inline-flex items-center gap-1"><FaWhatsapp size={10} /> WhatsApp</a>
                            )}
                          </div>
                        )}
                        {p.notes && <div className="text-[11px] text-white/40 mt-0.5 italic">"{p.notes}"</div>}
                      </div>
                      <button onClick={() => deletePurchase(p.id)} className="w-7 h-7 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 flex items-center justify-center shrink-0"><FaTrash size={10} /></button>
                    </div>
                    {p.status !== 'recibido' && p.status !== 'cancelado' && (
                      <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-white/5">
                        {p.status === 'contactado' && (
                          <button onClick={() => advancePurchase(p, 'pedido')} className="px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-300 text-[10px] font-black uppercase tracking-wider hover:bg-purple-500/20">→ Marcar pedido</button>
                        )}
                        <button onClick={() => receivePurchase(p)} className="px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-black uppercase tracking-wider hover:bg-emerald-500/25 flex items-center gap-1"><FaCheckCircle size={10} /> Recibido (+stock)</button>
                        <button onClick={() => advancePurchase(p, 'cancelado')} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/50 text-[10px] font-black uppercase tracking-wider hover:text-red-400">Cancelar</button>
                      </div>
                    )}
                    {p.status === 'recibido' && p.received_at && (
                      <div className="text-[10px] text-emerald-400/70 mt-2">Recibido el {new Date(p.received_at).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── ITEM FORM MODAL ───────────────────────────────── */}
      {showItemForm && createPortal(
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm" onClick={closeItemForm}>
          <div className="w-full max-w-lg bg-[#0f0702] border border-[#ff6b35]/25 rounded-2xl shadow-2xl max-h-[88vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#ff6b35]/15 shrink-0">
              <h3 className="text-base font-black text-white">{editingId ? 'Editar insumo' : 'Nuevo insumo'}</h3>
              <button onClick={closeItemForm} className="text-gray-400 hover:text-white"><FaTimes size={16} /></button>
            </div>
            <div className="p-5 overflow-y-auto flex-1 space-y-3">
              <input value={itemForm.name || ''} onChange={e => setItemForm(p => ({ ...p, name: e.target.value }))} placeholder="Nombre del insumo *" className={inputCls} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-white/50 uppercase tracking-widest font-bold mb-1">Unidad</label>
                  <select value={itemForm.unit || 'unidad'} onChange={e => setItemForm(p => ({ ...p, unit: e.target.value }))} className={inputCls}>
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-white/50 uppercase tracking-widest font-bold mb-1">Stock actual</label>
                  <input type="number" step="any" min={0} value={itemForm.stock_qty ?? 0} onChange={e => setItemForm(p => ({ ...p, stock_qty: parseFloat(e.target.value) || 0 }))} className={inputCls} />
                </div>
                <div>
                  <label className="block text-[10px] text-white/50 uppercase tracking-widest font-bold mb-1">Alerta stock bajo</label>
                  <input type="number" step="any" min={0} value={itemForm.low_stock_threshold ?? 0} onChange={e => setItemForm(p => ({ ...p, low_stock_threshold: parseFloat(e.target.value) || 0 }))} className={inputCls} />
                </div>
                <div>
                  <label className="block text-[10px] text-white/50 uppercase tracking-widest font-bold mb-1">Costo por unidad ($)</label>
                  <input type="number" step="any" min={0} value={itemForm.cost_per_unit ?? 0} onChange={e => setItemForm(p => ({ ...p, cost_per_unit: parseFloat(e.target.value) || 0 }))} className={inputCls} />
                </div>
              </div>
              <div className="pt-3 border-t border-white/5">
                <h4 className="text-[11px] font-black uppercase tracking-widest text-[#ff6b35] mb-2 flex items-center gap-1.5"><FaTruck size={11} /> Proveedor</h4>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <input value={itemForm.supplier_name || ''} onChange={e => setItemForm(p => ({ ...p, supplier_name: e.target.value }))} placeholder="Nombre del proveedor" className={inputCls} />
                    <input value={itemForm.supplier_phone || ''} onChange={e => setItemForm(p => ({ ...p, supplier_phone: e.target.value }))} placeholder="WhatsApp / teléfono" className={inputCls} />
                  </div>
                  <input value={itemForm.supplier_email || ''} onChange={e => setItemForm(p => ({ ...p, supplier_email: e.target.value }))} placeholder="Email del proveedor" className={inputCls} />
                  <div>
                    <label className="block text-[10px] text-white/50 uppercase tracking-widest font-bold mb-1">Estado del contacto</label>
                    <select value={itemForm.supplier_status || 'ninguno'} onChange={e => setItemForm(p => ({ ...p, supplier_status: e.target.value }))} className={inputCls}>
                      {Object.keys(SUPPLIER_STATUS).map(k => <option key={k} value={k}>{SUPPLIER_STATUS[k].label}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <textarea value={itemForm.notes || ''} onChange={e => setItemForm(p => ({ ...p, notes: e.target.value }))} placeholder="Notas (marca, presentación, etc.)" rows={2} className={`${inputCls} resize-none`} />
            </div>
            <div className="p-4 border-t border-[#ff6b35]/15 shrink-0">
              <button onClick={saveItem} disabled={savingItem}
                className="w-full py-3.5 rounded-xl bg-[#ff6b35] hover:bg-[#e85a25] text-white font-black text-xs uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                <FaSave size={12} /> {savingItem ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Agregar insumo'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── PURCHASE FORM MODAL ───────────────────────────── */}
      {showPurchaseForm && createPortal(
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm" onClick={closePurchaseForm}>
          <div className="w-full max-w-md bg-[#0f0702] border border-[#ff6b35]/25 rounded-2xl shadow-2xl max-h-[88vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#ff6b35]/15 shrink-0">
              <h3 className="text-base font-black text-white">Nueva compra</h3>
              <button onClick={closePurchaseForm} className="text-gray-400 hover:text-white"><FaTimes size={16} /></button>
            </div>
            <div className="p-5 overflow-y-auto flex-1 space-y-3">
              <div>
                <label className="block text-[10px] text-white/50 uppercase tracking-widest font-bold mb-1">Insumo *</label>
                <select value={purForm.item_id || ''} onChange={e => setPurForm(p => ({ ...p, item_id: e.target.value }))} className={inputCls}>
                  <option value="">Elige el insumo…</option>
                  {items.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-white/50 uppercase tracking-widest font-bold mb-1">Cantidad</label>
                  <input type="number" step="any" min={0} value={purForm.qty ?? 0} onChange={e => setPurForm(p => ({ ...p, qty: parseFloat(e.target.value) || 0 }))} className={inputCls} />
                </div>
                <div>
                  <label className="block text-[10px] text-white/50 uppercase tracking-widest font-bold mb-1">Costo unidad ($)</label>
                  <input type="number" step="any" min={0} value={purForm.unit_cost ?? 0} onChange={e => setPurForm(p => ({ ...p, unit_cost: parseFloat(e.target.value) || 0 }))} className={inputCls} />
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-white/50 uppercase tracking-widest font-bold mb-1">Estado</label>
                <select value={purForm.status || 'contactado'} onChange={e => setPurForm(p => ({ ...p, status: e.target.value }))} className={inputCls}>
                  <option value="contactado">Contactado al proveedor</option>
                  <option value="pedido">Pedido realizado</option>
                </select>
              </div>
              <textarea value={purForm.notes || ''} onChange={e => setPurForm(p => ({ ...p, notes: e.target.value }))} placeholder="Notas (fecha de entrega, condiciones…)" rows={2} className={`${inputCls} resize-none`} />
              <p className="text-[11px] text-white/40">Cuando marques la compra como <b className="text-emerald-400">Recibido</b>, la cantidad se sumará automáticamente al stock.</p>
            </div>
            <div className="p-4 border-t border-[#ff6b35]/15 shrink-0">
              <button onClick={savePurchase} disabled={savingPur}
                className="w-full py-3.5 rounded-xl bg-[#ff6b35] hover:bg-[#e85a25] text-white font-black text-xs uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                <FaSave size={12} /> {savingPur ? 'Guardando...' : 'Registrar compra'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default GastroInventoryTab;
