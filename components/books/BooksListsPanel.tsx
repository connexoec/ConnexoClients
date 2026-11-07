import React, { useMemo, useState } from 'react';
import { supabase } from '../../src/lib/supabase';
import type { BookList, BookTitle } from '../../types';
import { FaPlus, FaPen, FaTrash, FaToggleOn, FaToggleOff, FaMinus, FaTimes } from 'react-icons/fa';
import { useOwnerTable, AdminModal, Field, adminInput, Spinner, MissingSqlNotice, money, isMissingSql } from '../AdminKit';
import { ACCENT, ON_ACCENT, TITLE_FONT, btnPrimary, iconBtn, dangerBtn, Empty } from './BooksAdminUi';
import { matchesBookQuery } from '../../src/lib/booksCommon';

interface Props {
  userId: string;
  titles: BookTitle[];
  showNotification: (message: string, type: 'success' | 'error') => void;
}

export const BooksListsPanel: React.FC<Props> = ({ userId, titles, showNotification }) => {
  const t = useOwnerTable<BookList>({ table: 'books_lists', ownerColumn: 'shop_profile_id', ownerId: userId, realtime: false, order: [{ column: 'sort_order' }, { column: 'name' }] });
  const [modal, setModal] = useState<{ open: boolean; editing: BookList | null }>({ open: false, editing: null });
  const byId = useMemo(() => new Map(titles.map(x => [x.id, x])), [titles]);

  const total = (l: BookList) => (l.items || []).reduce((a, i) => a + (byId.get(i.title_id)?.price || 0) * (i.qty || 1), 0);
  const toggle = async (l: BookList) => {
    const { error } = await supabase.from('books_lists').update({ is_active: !l.is_active }).eq('id', l.id);
    if (error) return showNotification(error.message, 'error');
    t.reload();
  };
  const remove = async (l: BookList) => {
    if (!window.confirm(`¿Eliminar la lista «${l.name}»?`)) return;
    const { error } = await supabase.from('books_lists').delete().eq('id', l.id);
    if (error) return showNotification(error.message, 'error');
    t.reload();
  };

  if (t.loading) return <Spinner accent={ACCENT} />;
  if (t.missingSql) return <MissingSqlNotice file="setup_books.sql" accent={ACCENT} />;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-white/45 max-w-xl">Arma paquetes de libros (la lista de útiles de un colegio, un plan lector, «para regalar»). Tu cliente la ve en el perfil y la pide completa de un toque.</p>
        <button onClick={() => setModal({ open: true, editing: null })} className={`${btnPrimary} shrink-0`} style={{ background: ACCENT, color: ON_ACCENT }}><FaPlus /> Nueva lista</button>
      </div>

      {t.rows.length === 0 ? (
        <Empty emoji="🎒">Aún no tienes listas. Crea la primera con los libros que un colegio pide cada año.</Empty>
      ) : (
        <div className="space-y-2.5">
          {t.rows.map(l => (
            <div key={l.id} className="flex items-center gap-3 rounded-xl border px-4 py-3" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)', opacity: l.is_active ? 1 : 0.5 }}>
              <div className="min-w-0 flex-1">
                <p className="text-white font-bold truncate" style={{ fontFamily: TITLE_FONT }}>{l.name}</p>
                <p className="text-[11px] text-white/45 truncate">{[l.school, l.grade].filter(Boolean).join(' · ') || 'Sin colegio'} · {(l.items || []).length} libro{(l.items || []).length === 1 ? '' : 's'} · {money(total(l))}</p>
              </div>
              <button aria-label={l.is_active ? 'Ocultar lista' : 'Mostrar lista'} onClick={() => toggle(l)} className="text-white/50">{l.is_active ? <FaToggleOn size={20} style={{ color: ACCENT }} /> : <FaToggleOff size={20} />}</button>
              <button aria-label="Editar lista" onClick={() => setModal({ open: true, editing: l })} className={iconBtn}><FaPen size={11} /></button>
              <button aria-label="Eliminar lista" onClick={() => remove(l)} className={dangerBtn}><FaTrash size={11} /></button>
            </div>
          ))}
        </div>
      )}

      {modal.open && (
        <ListModal userId={userId} editing={modal.editing} titles={titles} count={t.rows.length} showNotification={showNotification}
          onClose={() => setModal({ open: false, editing: null })} onSaved={() => { setModal({ open: false, editing: null }); t.reload(); }} />
      )}
    </div>
  );
};

const ListModal: React.FC<{
  userId: string; editing: BookList | null; titles: BookTitle[]; count: number; showNotification: Props['showNotification']; onClose: () => void; onSaved: () => void;
}> = ({ userId, editing, titles, count, showNotification, onClose, onSaved }) => {
  const [f, setF] = useState({ name: editing?.name || '', school: editing?.school || '', grade: editing?.grade || '', description: editing?.description || '', is_active: editing?.is_active ?? true });
  const [items, setItems] = useState<{ title_id: string; qty: number }[]>(editing?.items || []);
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);
  const byId = useMemo(() => new Map(titles.map(x => [x.id, x])), [titles]);
  const found = useMemo(() => (q.trim().length >= 2 ? titles.filter(t => !items.some(i => i.title_id === t.id) && matchesBookQuery(t, q)).slice(0, 6) : []), [q, titles, items]);
  const total = items.reduce((a, i) => a + (byId.get(i.title_id)?.price || 0) * i.qty, 0);
  const setQty = (id: string, qty: number) => setItems(p => p.map(i => (i.title_id === id ? { ...i, qty: Math.min(Math.max(qty, 1), 20) } : i)));

  const save = async () => {
    if (!f.name.trim()) return showNotification('Ponle un nombre a la lista.', 'error');
    if (items.length === 0) return showNotification('Agrega al menos un libro.', 'error');
    const payload = {
      shop_profile_id: userId, name: f.name.trim(), school: f.school.trim() || null, grade: f.grade.trim() || null,
      description: f.description.trim() || null, items, is_active: f.is_active, sort_order: editing?.sort_order ?? count,
    };
    setSaving(true);
    const { error } = editing ? await supabase.from('books_lists').update(payload).eq('id', editing.id) : await supabase.from('books_lists').insert(payload);
    setSaving(false);
    if (error) return showNotification(isMissingSql(error) ? 'Falta ejecutar setup_books.sql en Supabase.' : `No se pudo guardar: ${error.message}`, 'error');
    showNotification('Lista guardada.', 'success');
    onSaved();
  };

  return (
    <AdminModal title={editing ? 'Editar lista' : 'Nueva lista'} accent={ACCENT} onClose={onClose} wide>
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Nombre *" className="sm:col-span-3"><input className={adminInput} value={f.name} onChange={e => setF(p => ({ ...p, name: e.target.value }))} placeholder="Lista de útiles 5.º EGB 2026" /></Field>
          <Field label="Colegio / institución" className="sm:col-span-2"><input className={adminInput} value={f.school} onChange={e => setF(p => ({ ...p, school: e.target.value }))} /></Field>
          <Field label="Curso"><input className={adminInput} value={f.grade} onChange={e => setF(p => ({ ...p, grade: e.target.value }))} placeholder="5.º grado" /></Field>
        </div>
        <Field label="Descripción"><textarea className={adminInput} rows={2} value={f.description} onChange={e => setF(p => ({ ...p, description: e.target.value }))} /></Field>

        <Field label={`Libros de la lista (${items.length})`}>
          <input className={adminInput} value={q} onChange={e => setQ(e.target.value)} placeholder="Busca un libro de tu catálogo para agregarlo…" aria-label="Buscar libro para la lista" />
          {found.length > 0 && (
            <div className="mt-1.5 rounded-lg border border-white/10 divide-y divide-white/5 overflow-hidden">
              {found.map(t => (
                <button key={t.id} type="button" onClick={() => { setItems(p => [...p, { title_id: t.id, qty: 1 }]); setQ(''); }} className="w-full text-left px-3 py-2 hover:bg-white/5 flex items-center justify-between gap-3">
                  <span className="min-w-0"><span className="block text-sm text-white font-semibold truncate">{t.title}</span><span className="block text-[11px] text-white/45 truncate">{[t.author, t.isbn].filter(Boolean).join(' · ')}</span></span>
                  <span className="text-xs text-white/60 shrink-0">{money(t.price)}</span>
                </button>
              ))}
            </div>
          )}
          {q.trim().length >= 2 && found.length === 0 && <p className="text-[11px] text-white/35 mt-1.5">No hay coincidencias (o ya está en la lista).</p>}
          <div className="mt-2 space-y-1.5">
            {items.map(i => {
              const t = byId.get(i.title_id);
              return (
                <div key={i.title_id} className="flex items-center gap-2.5 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2">
                  <p className="flex-1 min-w-0 text-sm text-white truncate">{t ? t.title : <span className="text-red-400">Libro eliminado del catálogo</span>}</p>
                  <div className="flex items-center gap-1.5">
                    <button type="button" aria-label="Menos" onClick={() => setQty(i.title_id, i.qty - 1)} className={iconBtn}><FaMinus size={9} /></button>
                    <span className="w-6 text-center text-sm font-bold text-white">{i.qty}</span>
                    <button type="button" aria-label="Más" onClick={() => setQty(i.title_id, i.qty + 1)} className={iconBtn}><FaPlus size={9} /></button>
                  </div>
                  <span className="w-16 text-right text-xs text-white/60">{money((t?.price || 0) * i.qty)}</span>
                  <button type="button" aria-label="Quitar de la lista" onClick={() => setItems(p => p.filter(x => x.title_id !== i.title_id))} className="text-white/40 hover:text-red-400"><FaTimes /></button>
                </div>
              );
            })}
          </div>
          {items.length > 0 && <p className="text-right text-sm font-bold text-white mt-2">Total de la lista: {money(total)}</p>}
        </Field>

        <label className="flex items-center gap-2 text-sm text-white/70"><input type="checkbox" checked={f.is_active} onChange={e => setF(p => ({ ...p, is_active: e.target.checked }))} /> Visible en el perfil</label>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl text-xs font-bold uppercase border border-white/10 text-white/60 hover:text-white">Cancelar</button>
          <button onClick={save} disabled={saving} className="flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-wider disabled:opacity-50" style={{ background: ACCENT, color: ON_ACCENT }}>{saving ? 'Guardando…' : 'Guardar lista'}</button>
        </div>
      </div>
    </AdminModal>
  );
};
