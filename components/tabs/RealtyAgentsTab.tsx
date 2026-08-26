import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../src/lib/supabase';
import type { RealtyAgent } from '../../types';
import {
  FaPlus, FaTrash, FaPen, FaSave, FaTimes, FaUserTie, FaWhatsapp,
  FaIdCard, FaLink, FaCopy, FaToggleOn, FaToggleOff,
} from 'react-icons/fa';

interface Props {
  user: any;
  profileData: any;
  showNotification: (message: string, type: 'success' | 'error') => void;
}

const ACCENT = '#ff6600';
const ACCENT_LIGHT = '#ffa35d';
const TITLE_FONT = "'Tomorrow', sans-serif";

interface Form { agent_username: string; name: string; phone_whatsapp: string; nfc_tag_id: string; }
const emptyForm = (): Form => ({ agent_username: '', name: '', phone_whatsapp: '', nfc_tag_id: '' });

export const RealtyAgentsTab: React.FC<Props> = ({ user, profileData, showNotification }) => {
  const [agents, setAgents] = useState<RealtyAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<RealtyAgent | null>(null);
  const [form, setForm] = useState<Form>(emptyForm());
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const agencyUsername = profileData?.username || '';

  const fetchAgents = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('realty_agents')
        .select('*')
        .eq('agency_profile_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setAgents((data ?? []) as RealtyAgent[]);
    } catch (err: any) {
      console.error('RealtyAgentsTab fetch error:', err?.message ?? err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    fetchAgents();
    const channel = supabase
      .channel(`realty_agents_${user.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'realty_agents', filter: `agency_profile_id=eq.${user.id}` },
        () => fetchAgents())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, fetchAgents]);

  const openNew = () => { setEditing(null); setForm(emptyForm()); setIsOpen(true); };
  const openEdit = (a: RealtyAgent) => {
    setEditing(a);
    setForm({ agent_username: a.agent_username, name: a.name || '', phone_whatsapp: a.phone_whatsapp || '', nfc_tag_id: a.nfc_tag_id || '' });
    setIsOpen(true);
  };
  const close = () => { setEditing(null); setForm(emptyForm()); setIsOpen(false); };

  const save = async () => {
    const uname = form.agent_username.trim().toLowerCase().replace(/\s+/g, '-');
    if (!uname) { showNotification('El usuario del agente es obligatorio.', 'error'); return; }
    setSaving(true);
    try {
      const payload = {
        agency_profile_id: user.id,
        agent_username: uname,
        name: form.name.trim() || null,
        phone_whatsapp: form.phone_whatsapp.trim() || null,
        nfc_tag_id: form.nfc_tag_id.trim() || null,
      };
      if (editing) {
        const { error } = await supabase.from('realty_agents').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('realty_agents').insert({ ...payload, is_active: true });
        if (error) throw error;
      }
      showNotification('Agente guardado', 'success');
      close();
      fetchAgents();
    } catch (err: any) {
      const msg = /duplicate|unique/i.test(err?.message || '') ? 'Ese usuario o NFC ya está en uso.' : err?.message;
      showNotification(`Error: ${msg}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (a: RealtyAgent) => {
    // Optimista: si se desactiva, su NFC/URL cae al perfil general (fuga de leads cero).
    setAgents(prev => prev.map(x => x.id === a.id ? { ...x, is_active: !x.is_active } : x));
    try {
      const { error } = await supabase.from('realty_agents').update({ is_active: !a.is_active }).eq('id', a.id);
      if (error) throw error;
    } catch (err: any) {
      setAgents(prev => prev.map(x => x.id === a.id ? { ...x, is_active: a.is_active } : x));
      showNotification(`Error: ${err?.message}`, 'error');
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('¿Eliminar este agente? Sus leads capturados se conservan (sin atribución).')) return;
    try {
      const { error } = await supabase.from('realty_agents').delete().eq('id', id);
      if (error) throw error;
      setAgents(prev => prev.filter(a => a.id !== id));
    } catch (err: any) {
      showNotification(`Error: ${err?.message}`, 'error');
    }
  };

  const agentLink = (a: RealtyAgent) =>
    `${window.location.origin}/${agencyUsername}?agent=${a.agent_username}`;

  const copyLink = (a: RealtyAgent) => {
    navigator.clipboard.writeText(agentLink(a));
    showNotification('Enlace de atribución copiado', 'success');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2" style={{ borderColor: ACCENT }} />
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up space-y-6 max-w-3xl mx-auto px-4 md:px-6 pb-32" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5" style={{ borderColor: `${ACCENT}26` }}>
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2 italic" style={{ fontFamily: TITLE_FONT }}>
            <FaUserTie style={{ color: ACCENT }} /> Agentes
          </h2>
          <p className="text-sm text-white/40 mt-1">Sub-usuarios con atribución por tarjeta NFC / enlace.</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white rounded-xl italic" style={{ background: ACCENT, fontFamily: TITLE_FONT }}>
          <FaPlus /> Añadir agente
        </button>
      </div>

      {agents.length === 0 ? (
        <div className="text-center py-16 text-white/30"><p className="text-4xl mb-3">👔</p><p className="text-sm">Aún no has registrado agentes.</p></div>
      ) : (
        <div className="space-y-2.5">
          {agents.map(a => (
            <div key={a.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-white font-bold text-base truncate">{a.name || a.agent_username}</h3>
                    <span className="text-[10px] font-bold uppercase tracking-widest rounded-full px-2 py-0.5"
                      style={a.is_active
                        ? { color: '#4ade80', background: 'rgba(34,197,94,0.14)' }
                        : { color: '#f87171', background: 'rgba(248,113,113,0.14)' }}>
                      {a.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-white/50">
                    <span className="flex items-center gap-1" style={{ color: ACCENT_LIGHT }}>@{a.agent_username}</span>
                    {a.phone_whatsapp && <span className="flex items-center gap-1"><FaWhatsapp size={10} /> {a.phone_whatsapp}</span>}
                    {a.nfc_tag_id && <span className="flex items-center gap-1"><FaIdCard size={10} /> {a.nfc_tag_id}</span>}
                  </div>
                </div>
                <button onClick={() => toggleActive(a)} className="shrink-0 text-3xl transition" style={{ color: a.is_active ? ACCENT : '#4b5563' }} title={a.is_active ? 'Desactivar' : 'Activar'}>
                  {a.is_active ? <FaToggleOn /> : <FaToggleOff />}
                </button>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <button onClick={() => copyLink(a)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white/5 border border-white/10 text-white/70 text-xs font-bold hover:text-white transition"><FaLink size={11} /> Copiar enlace</button>
                <button onClick={() => copyLink(a)} className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 text-white/50 flex items-center justify-center hover:text-white transition" title="Copiar"><FaCopy size={11} /></button>
                <button onClick={() => openEdit(a)} className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 text-white/50 flex items-center justify-center hover:text-white transition"><FaPen size={11} /></button>
                <button onClick={() => remove(a.id)} className="w-9 h-9 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center hover:bg-red-500/20 transition"><FaTrash size={11} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={close}>
          <div className="w-full max-w-md rounded-2xl border bg-[#160600] p-6 space-y-3" style={{ borderColor: `${ACCENT}33`, maxHeight: '92svh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-white italic" style={{ fontFamily: TITLE_FONT }}>{editing ? 'Editar' : 'Nuevo'} agente</h3>
              <button onClick={close} className="text-white/40 hover:text-white"><FaTimes /></button>
            </div>
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Nombre del agente"
              className="w-full bg-black/40 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none placeholder-white/30" />
            <div>
              <input value={form.agent_username} onChange={e => setForm(p => ({ ...p, agent_username: e.target.value }))} placeholder="Usuario del agente (ej. juan-perez)"
                className="w-full bg-black/40 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none placeholder-white/30" />
              <p className="text-[10px] text-white/30 mt-1">Se usa en el enlace: /{agencyUsername || 'agencia'}?agent=<b>{(form.agent_username.trim().toLowerCase().replace(/\s+/g, '-')) || 'usuario'}</b></p>
            </div>
            <input value={form.phone_whatsapp} onChange={e => setForm(p => ({ ...p, phone_whatsapp: e.target.value }))} placeholder="WhatsApp del agente (ej. 0991234567)"
              className="w-full bg-black/40 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none placeholder-white/30" />
            <input value={form.nfc_tag_id} onChange={e => setForm(p => ({ ...p, nfc_tag_id: e.target.value }))} placeholder="ID de tarjeta NFC (opcional)"
              className="w-full bg-black/40 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none placeholder-white/30" />
            <button onClick={save} disabled={saving} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-black uppercase tracking-wider text-white disabled:opacity-50 italic" style={{ background: ACCENT, fontFamily: TITLE_FONT }}>
              <FaSave /> {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default RealtyAgentsTab;
