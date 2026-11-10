import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../src/lib/supabase';

// Pestaña «KODA» del Super Admin: bandeja de los negocios que llegan del puente KODA → Connexo.
// Cada negocio es un PERFIL BORRADOR (inactivo) que el equipo revisa, aprueba, invita por
// WhatsApp y, si acepta, activa con su prueba de 7 días. La lectura va directa a la tabla
// (política «admin lee»); toda ESCRITURA pasa por las RPC de setup_koda_admin.sql, que validan
// el embudo en el servidor.

export type KodaEstado =
  | 'borrador' | 'aprobado' | 'wa_enviado' | 'aceptado'
  | 'declinado' | 'vencido' | 'descartado' | 'sin_plantilla';

export type KodaProspecto = {
  id: string;
  koda_envio_id: string;
  koda_owner_email: string | null;
  koda_owner_nombre: string | null;
  busqueda_nombre: string | null;
  /** Lote con que KODA envió este negocio (setup_koda_lotes.sql): «Lote 7 · Gimnasios Quito». */
  lote_id?: string | null;
  lote_numero?: number | null;
  lote_nombre?: string | null;
  user_id: string | null;
  username: string | null;
  theme: string | null;
  rubro: string | null;
  estado: KodaEstado;
  detalle: string | null;
  email_real: boolean;
  whatsapp: string | null;
  negocio: Record<string, any>;
  opt_out: boolean;
  wa_enviado_at: string | null;
  aceptado_at: string | null;
  trial_ends_at: string | null;
  created_at: string;
  updated_at: string;
  clave?: string | null;
  relleno?: any;
  nota_admin?: string | null;
  revisado_at?: string | null;
};

type Props = {
  onToast: (msg: string, ok: boolean) => void;
  onOpenClient: (username: string) => void;
  onPendientes?: (n: number) => void;
};

const LIMITE = 500;          // los más recientes; con 50 envíos al día alcanza para semanas
const POR_PAGINA = 40;
const DIAS_INVITACION = 7;

const ESTADOS: { id: KodaEstado; label: string; color: string; hint: string }[] = [
  { id: 'borrador',      label: 'Por revisar',      color: '#f59e0b', hint: 'Perfil borrador listo para que lo revises' },
  { id: 'aprobado',      label: 'Aprobado',         color: '#3b82f6', hint: 'Listo para invitarlo por WhatsApp' },
  { id: 'wa_enviado',    label: 'WhatsApp enviado', color: '#a78bfa', hint: `Esperando respuesta (vence a los ${DIAS_INVITACION} días)` },
  { id: 'aceptado',      label: 'Aceptó',           color: '#22c55e', hint: 'Perfil activo con su prueba de 7 días' },
  { id: 'declinado',     label: 'Declinó',          color: '#ef4444', hint: 'Dijo que no' },
  { id: 'vencido',       label: 'Vencido',          color: '#f97316', hint: 'No respondió a tiempo' },
  { id: 'sin_plantilla', label: 'Sin plantilla',    color: '#94a3b8', hint: 'Su rubro todavía no tiene plantilla en Connexo' },
  { id: 'descartado',    label: 'Descartado',       color: '#6b7280', hint: 'Fuera del embudo' },
];
const ESTADOS_PRINCIPALES: KodaEstado[] = ['borrador', 'aprobado', 'wa_enviado', 'aceptado'];
const ESTADO = Object.fromEntries(ESTADOS.map(e => [e.id, e])) as Record<KodaEstado, typeof ESTADOS[number]>;

const THEME_LABEL: Record<string, string> = {
  default: 'Estándar', barber: 'Barbería', gastro: 'Gastronomía', petcare: 'Petcare', medical: 'Salud',
  ecom: 'E-commerce', stage: 'Artista', realty: 'Inmobiliaria', sublima: 'Sublimados', gym: 'Gimnasio', hotel: 'Hotel',
};
const THEME_COLOR: Record<string, string> = {
  default: '#94a3b8', barber: '#3b82f6', gastro: '#f59e0b', petcare: '#0ea5a4', medical: '#2563eb',
  ecom: '#8b5cf6', stage: '#ec4899', realty: '#ff6600', sublima: '#a3e635', gym: '#c6f432', hotel: '#d9958b',
};

type Accion = { to: KodaEstado; label: string; tono: 'primario' | 'ok' | 'suave' | 'peligro'; aviso?: string };

// Espejo de las transiciones que acepta admin_koda_set_estado (el servidor es quien manda).
const ACCIONES: Record<KodaEstado, Accion[]> = {
  borrador: [
    { to: 'aprobado',   label: 'Aprobar',   tono: 'primario' },
    { to: 'descartado', label: 'Descartar', tono: 'peligro', aviso: 'Sale del embudo. Podrás restaurarlo después.' },
  ],
  aprobado: [
    { to: 'wa_enviado', label: 'Registrar WhatsApp enviado', tono: 'primario', aviso: 'Empieza a contar los 7 días de espera de su respuesta.' },
    { to: 'borrador',   label: 'Volver a revisión', tono: 'suave' },
    { to: 'descartado', label: 'Descartar', tono: 'peligro', aviso: 'Sale del embudo. Podrás restaurarlo después.' },
  ],
  wa_enviado: [
    { to: 'aceptado',   label: 'Aceptó', tono: 'ok', aviso: 'Activa el perfil y arranca su prueba de 7 días desde hoy. No se puede deshacer.' },
    { to: 'declinado',  label: 'Declinó', tono: 'suave', aviso: 'Queda marcado como que dijo que no.' },
    { to: 'vencido',    label: 'Marcar vencido', tono: 'suave', aviso: 'No respondió a tiempo.' },
    { to: 'descartado', label: 'Descartar', tono: 'peligro', aviso: 'Sale del embudo.' },
  ],
  vencido: [
    { to: 'aprobado',   label: 'Volver a invitar', tono: 'primario' },
    { to: 'descartado', label: 'Descartar', tono: 'peligro', aviso: 'Sale del embudo.' },
  ],
  declinado: [
    { to: 'descartado', label: 'Descartar', tono: 'peligro', aviso: 'Sale del embudo.' },
  ],
  descartado: [
    { to: 'borrador',   label: 'Restaurar', tono: 'primario' },
  ],
  sin_plantilla: [
    { to: 'descartado', label: 'Descartar', tono: 'peligro', aviso: 'Sale del embudo.' },
  ],
  aceptado: [],
};

// ─── Utilidades ───────────────────────────────────────────────────────────────
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const nombreDe = (p: KodaProspecto) => String(p.negocio?.nombre || p.username || 'Sin nombre');

const fmtWa = (w: string | null) => {
  const m = /^\+593(9\d)(\d{3})(\d{4})$/.exec(w || '');
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : (w || '—');
};

const hace = (iso: string | null) => {
  if (!iso) return '—';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d < 31) return `hace ${d} d`;
  return new Date(iso).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
};

const diasHasta = (iso: string | null) =>
  iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000) : null;

const diasInvitacion = (p: KodaProspecto) => {
  if (p.estado !== 'wa_enviado' || !p.wa_enviado_at) return null;
  return diasHasta(new Date(new Date(p.wa_enviado_at).getTime() + DIAS_INVITACION * 86400000).toISOString());
};

const urlPerfil = (username: string) =>
  `${window.location.origin}/${username.split('/').map(encodeURIComponent).join('/')}`;

const urlWhatsApp = (w: string | null, texto?: string) =>
  `https://wa.me/${(w || '').replace(/\D/g, '')}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;

const resumenRelleno = (p: KodaProspecto) => {
  const campos: Record<string, string> = p.relleno?.campos || {};
  const vals = Object.values(campos);
  const cuenta = (o: string) => vals.filter(v => v === o).length;
  return {
    hay: vals.length > 0,
    koda: cuenta('koda'), banco: cuenta('banco'), mixto: cuenta('mixto'),
    enlaces: Number(p.relleno?.enlaces ?? 0),
    paquete: (p.relleno?.paquete ?? p.clave ?? null) as string | null,
  };
};

// Sin caracteres que se confunden (0/O, 1/l/I).
const generarClave = () => {
  const alfabeto = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint32Array(10));
  return Array.from(bytes, b => alfabeto[b % alfabeto.length]).join('');
};

const esFuncionFaltante = (err: any) =>
  err?.code === 'PGRST202' || /could not find the function|does not exist/i.test(err?.message || '');

// ─── Estilos (mismo lenguaje visual del resto del Super Admin) ────────────────
const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,107,53,0.1)', borderRadius: '20px',
};
const campo: React.CSSProperties = {
  width: '100%', padding: '12px 14px', boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,107,53,0.15)',
  borderRadius: '12px', color: '#fff', fontSize: '14px', outline: 'none',
  fontFamily: "'Inter', -apple-system, sans-serif", WebkitAppearance: 'none',
};
const etiqueta: React.CSSProperties = {
  fontSize: '10px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.3)', fontFamily: "'Tomorrow', monospace",
};
const TONO: Record<Accion['tono'], React.CSSProperties> = {
  primario: { background: 'linear-gradient(135deg,#ff6b35,#c94000)', color: '#fff', border: '1px solid transparent' },
  ok:       { background: 'rgba(34,197,94,0.16)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.35)' },
  suave:    { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.75)', border: '1px solid rgba(255,255,255,0.1)' },
  peligro:  { background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' },
};
const boton = (tono: Accion['tono'], deshabilitado = false): React.CSSProperties => ({
  ...TONO[tono], padding: '9px 13px', borderRadius: '11px', fontSize: '12px', fontWeight: 800,
  cursor: deshabilitado ? 'not-allowed' : 'pointer', opacity: deshabilitado ? 0.5 : 1,
  fontFamily: "'Inter', -apple-system, sans-serif", whiteSpace: 'nowrap',
});

const Insignia: React.FC<{ color: string; children: React.ReactNode; title?: string }> = ({ color, children, title }) => (
  <span title={title} style={{
    padding: '2px 8px', borderRadius: '20px', background: `${color}22`, color,
    border: `1px solid ${color}44`, fontSize: '9px', fontWeight: 800, letterSpacing: '0.8px', whiteSpace: 'nowrap',
  }}>{children}</span>
);

const Dato: React.FC<{ k: string; v: React.ReactNode }> = ({ k, v }) => (
  <div style={{ minWidth: 0 }}>
    <div style={{ ...etiqueta, fontSize: '9px', letterSpacing: '1.5px', marginBottom: '3px' }}>{k}</div>
    <div style={{ fontSize: '12.5px', color: 'rgba(255,255,255,0.8)', wordBreak: 'break-word' }}>{v}</div>
  </div>
);

// ─── Componente ───────────────────────────────────────────────────────────────
const KodaProspectsTab: React.FC<Props> = ({ onToast, onOpenClient, onPendientes }) => {
  const [items, setItems] = useState<KodaProspecto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [puenteFalta, setPuenteFalta] = useState(false);
  const [adminSqlFalta, setAdminSqlFalta] = useState(false);

  const [fEstado, setFEstado] = useState<'all' | KodaEstado>('all');
  const [fTheme, setFTheme] = useState('all');
  const [fBusqueda, setFBusqueda] = useState('all');
  const [fLote, setFLote] = useState('all');
  const [texto, setTexto] = useState('');
  const [visibles, setVisibles] = useState(POR_PAGINA);

  const [abierto, setAbierto] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<{ id: string; to: KodaEstado } | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [notas, setNotas] = useState<Record<string, string>>({});

  const [verRubros, setVerRubros] = useState(false);
  const [rubros, setRubros] = useState<{ rubro: string; theme: string | null; nota: string | null }[] | null>(null);

  const [confirmandoCred, setConfirmandoCred] = useState<string | null>(null);
  const [cred, setCred] = useState<{ p: KodaProspecto; mensaje: string } | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('koda_prospectos').select('*').order('created_at', { ascending: false }).limit(LIMITE);
    if (err) {
      setPuenteFalta(/koda_prospectos|schema cache|PGRST205|42P01/i.test(`${err.code} ${err.message}`));
      setError(err.message);
      setItems([]);
    } else {
      setPuenteFalta(false);
      setItems((data || []) as KodaProspecto[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const pendientes = useMemo(() => items.filter(i => i.estado === 'borrador').length, [items]);
  useEffect(() => { onPendientes?.(pendientes); }, [pendientes, onPendientes]);

  useEffect(() => {
    if (!verRubros || rubros) return;
    Promise.resolve(supabase.from('koda_rubro_plantilla').select('rubro, theme, nota').order('rubro'))
      .then(({ data }) => setRubros((data || []) as any))
      .catch(() => setRubros([]));
  }, [verRubros, rubros]);

  const conteos = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of items) c[i.estado] = (c[i.estado] || 0) + 1;
    return c;
  }, [items]);

  const themesPresentes = useMemo(
    () => Array.from(new Set(items.map(i => i.theme).filter(Boolean) as string[])).sort(),
    [items],
  );
  const busquedas = useMemo(
    () => Array.from(new Set(items.map(i => i.busqueda_nombre).filter(Boolean) as string[])).sort(),
    [items],
  );

  // Lotes que KODA envió (el más nuevo primero), con cuántos negocios trae cada uno y en qué paso del embudo va.
  const lotes = useMemo(() => {
    const m = new Map<string, { id: string; numero: number; nombre: string | null; n: number; por: Record<string, number> }>();
    for (const i of items) {
      if (!i.lote_id || !i.lote_numero) continue;
      const l = m.get(i.lote_id) ?? { id: i.lote_id, numero: i.lote_numero, nombre: i.lote_nombre ?? null, n: 0, por: {} };
      l.n += 1;
      l.por[i.estado] = (l.por[i.estado] || 0) + 1;
      m.set(i.lote_id, l);
    }
    return Array.from(m.values()).sort((a, b) => b.numero - a.numero);
  }, [items]);
  const etiquetaLote = (l: { numero: number; nombre: string | null }) => (l.nombre ? `Lote ${l.numero} · ${l.nombre}` : `Lote ${l.numero}`);

  const filtrados = useMemo(() => {
    const q = norm(texto.trim());
    return items.filter(p => {
      if (fEstado !== 'all' && p.estado !== fEstado) return false;
      if (fTheme !== 'all' && (fTheme === 'none' ? p.theme : p.theme !== fTheme)) return false;
      if (fBusqueda !== 'all' && p.busqueda_nombre !== fBusqueda) return false;
      if (fLote !== 'all' && (fLote === 'none' ? p.lote_id : p.lote_id !== fLote)) return false;
      if (!q) return true;
      const n = p.negocio || {};
      const pajar = norm([nombreDe(p), n.ciudad, n.categoria, p.whatsapp, p.username, p.koda_owner_nombre, p.busqueda_nombre, p.lote_nombre, p.lote_numero ? `lote ${p.lote_numero}` : ''].filter(Boolean).join(' '));
      return pajar.includes(q);
    });
  }, [items, fEstado, fTheme, fBusqueda, fLote, texto]);

  useEffect(() => { setVisibles(POR_PAGINA); }, [fEstado, fTheme, fBusqueda, fLote, texto]);

  const reemplazar = (fila: Partial<KodaProspecto> & { id: string }) =>
    setItems(prev => prev.map(i => (i.id === fila.id ? { ...i, ...fila } : i)));

  const errorDeFuncion = (err: any) => {
    if (esFuncionFaltante(err)) {
      setAdminSqlFalta(true);
      onToast('Falta ejecutar setup_koda_admin.sql en Supabase', false);
    } else {
      onToast(err?.message || 'No se pudo completar la acción', false);
    }
  };

  const cambiarEstado = async (p: KodaProspecto, to: KodaEstado) => {
    setTrabajando(p.id);
    setConfirmando(null);
    const { data, error: err } = await supabase.rpc('admin_koda_set_estado', { p_id: p.id, p_estado: to });
    setTrabajando(null);
    if (err) { errorDeFuncion(err); return; }
    reemplazar(data as KodaProspecto);
    onToast(
      to === 'aceptado' ? `${nombreDe(p)} aceptó: perfil activo y prueba de 7 días en marcha`
        : `${nombreDe(p)} → ${ESTADO[to].label}`,
      to !== 'descartado' && to !== 'declinado',
    );
  };

  const alternarOptOut = async (p: KodaProspecto) => {
    setTrabajando(p.id);
    const { data, error: err } = await supabase.rpc('admin_koda_set_optout', { p_id: p.id, p_value: !p.opt_out });
    setTrabajando(null);
    if (err) { errorDeFuncion(err); return; }
    reemplazar(data as KodaProspecto);
    onToast(p.opt_out ? 'Ya se le puede contactar' : 'Marcado como «no contactar»', p.opt_out);
  };

  const guardarNota = async (p: KodaProspecto) => {
    const texto = notas[p.id] ?? p.nota_admin ?? '';
    setTrabajando(p.id);
    const { data, error: err } = await supabase.rpc('admin_koda_set_nota', { p_id: p.id, p_nota: texto });
    setTrabajando(null);
    if (err) { errorDeFuncion(err); return; }
    reemplazar(data as KodaProspecto);
    setNotas(prev => { const n = { ...prev }; delete n[p.id]; return n; });
    onToast('Nota guardada', true);
  };

  // Genera una contraseña nueva, la fija en la cuenta y arma el mensaje listo para enviar.
  // Se muestra UNA sola vez: no se guarda en ninguna parte.
  const entregarCredenciales = async (p: KodaProspecto) => {
    if (!p.user_id) return;
    setConfirmandoCred(null);
    setTrabajando(p.id);
    const { data: perfil } = await supabase.from('profiles').select('email, username').eq('id', p.user_id).maybeSingle();
    if (!perfil) { setTrabajando(null); onToast('No se encontró la cuenta de este negocio', false); return; }
    const clave = generarClave();
    const { error: err } = await supabase.rpc('admin_set_user_password', { p_user_id: p.user_id, p_new_password: clave });
    setTrabajando(null);
    if (err) { onToast(err.message || 'No se pudo fijar la contraseña', false); return; }
    const mensaje =
      `Hola ${nombreDe(p)} 👋 Tu perfil de Connexo ya está activo: ${urlPerfil(perfil.username)}\n\n` +
      `Para editarlo entra a ${window.location.origin}/auth con:\n` +
      `Correo: ${perfil.email}\nContraseña: ${clave}\n\n` +
      `Tu prueba gratis dura ${DIAS_INVITACION} días. Cualquier duda, escríbenos por aquí.`;
    setCred({ p, mensaje });
  };

  const copiar = async (texto: string) => {
    try { await navigator.clipboard.writeText(texto); onToast('Copiado', true); }
    catch { onToast('No se pudo copiar: selecciona el texto y cópialo a mano', false); }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  const lista = filtrados.slice(0, visibles);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }} data-testid="koda-tab">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 800 }}>Prospectos de KODA</div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '3px', lineHeight: 1.5 }}>
            Negocios que llegan como perfil borrador. Revísalos, apruébalos e invítalos.
          </div>
        </div>
        <button type="button" onClick={cargar} style={{ background: 'transparent', border: 'none', color: 'rgba(255,107,53,0.7)', cursor: 'pointer', fontSize: '12px', fontWeight: 700, flexShrink: 0 }}>
          ↻ Actualizar
        </button>
      </div>

      {puenteFalta && (
        <div style={{ ...card, padding: '16px', borderColor: 'rgba(245,158,11,0.35)', background: 'rgba(245,158,11,0.06)' }} data-testid="koda-puente-falta">
          <div style={{ fontWeight: 800, fontSize: '13px', color: '#fbbf24' }}>El puente con KODA todavía no está instalado</div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginTop: '6px', lineHeight: 1.6 }}>
            Ejecuta <b>setup_koda_bridge.sql</b> en el SQL Editor de Supabase y vuelve a pulsar Actualizar.
          </div>
        </div>
      )}
      {!puenteFalta && error && (
        <div style={{ ...card, padding: '14px', borderColor: 'rgba(239,68,68,0.3)', fontSize: '12px', color: '#f87171' }}>{error}</div>
      )}
      {adminSqlFalta && (
        <div style={{ ...card, padding: '16px', borderColor: 'rgba(245,158,11,0.35)', background: 'rgba(245,158,11,0.06)' }} data-testid="koda-admin-sql-falta">
          <div style={{ fontWeight: 800, fontSize: '13px', color: '#fbbf24' }}>Faltan las acciones de administración</div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginTop: '6px', lineHeight: 1.6 }}>
            Puedes ver los prospectos, pero para aprobar, descartar o activar hay que ejecutar <b>setup_koda_admin.sql</b> en el SQL Editor de Supabase.
          </div>
        </div>
      )}

      {/* Embudo: contadores por estado */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {[
          { id: 'all' as const, label: 'Todos', color: '#ff6b35', n: items.length },
          // Los estados secundarios en cero no aportan: solo aparecen si tienen casos o están elegidos.
          ...ESTADOS
            .filter(e => ESTADOS_PRINCIPALES.includes(e.id) || (conteos[e.id] || 0) > 0 || fEstado === e.id)
            .map(e => ({ id: e.id, label: e.label, color: e.color, n: conteos[e.id] || 0 })),
        ].map(ch => {
          const activo = fEstado === ch.id;
          return (
            <button
              key={ch.id} type="button" onClick={() => setFEstado(ch.id)} data-testid={`koda-chip-${ch.id}`}
              style={{
                padding: '8px 12px 8px 10px', borderRadius: '12px', cursor: 'pointer', whiteSpace: 'nowrap',
                display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 700,
                background: activo ? `linear-gradient(135deg, ${ch.color}2e, ${ch.color}14)` : 'rgba(255,255,255,0.025)',
                border: `1px solid ${activo ? `${ch.color}88` : 'rgba(255,255,255,0.09)'}`,
                color: activo ? '#fff' : 'rgba(255,255,255,0.6)', fontFamily: "'Inter', -apple-system, sans-serif",
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 999, background: ch.color, opacity: activo ? 1 : 0.55 }} />
              {ch.label}
              <span style={{ fontSize: '11px', fontWeight: 800, padding: '1px 7px', borderRadius: 999, fontFamily: "'Tomorrow', monospace", background: activo ? `${ch.color}33` : 'rgba(255,255,255,0.05)', color: activo ? '#fff' : 'rgba(255,255,255,0.45)' }}>{ch.n}</span>
            </button>
          );
        })}
      </div>

      {/* Lotes que envió KODA: cada tarjeta es una tanda; al pulsarla se filtra la lista a ese lote. */}
      {lotes.length > 0 && (
        <div data-testid="koda-lotes" style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
          {lotes.map(l => {
            const activo = fLote === l.id;
            const tramos = ESTADOS.map(e => ({ e, n: l.por[e.id] || 0 })).filter(t => t.n > 0);
            return (
              <button
                key={l.id} type="button" aria-pressed={activo} data-testid="koda-lote"
                title={`${etiquetaLote(l)} · ${tramos.map(t => `${t.n} ${t.e.label.toLowerCase()}`).join(', ')}`}
                onClick={() => setFLote(activo ? 'all' : l.id)}
                style={{
                  flexShrink: 0, minWidth: '150px', maxWidth: '230px', textAlign: 'left', padding: '10px 12px', borderRadius: '12px', cursor: 'pointer',
                  background: activo ? 'rgba(255,107,53,0.12)' : 'rgba(255,255,255,0.025)',
                  border: `1px solid ${activo ? 'rgba(255,107,53,0.55)' : 'rgba(255,255,255,0.09)'}`,
                  color: '#fff', fontFamily: "'Inter', -apple-system, sans-serif",
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{etiquetaLote(l)}</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>{l.n} {l.n === 1 ? 'negocio' : 'negocios'}</div>
                <div style={{ display: 'flex', height: 5, borderRadius: 999, overflow: 'hidden', background: 'rgba(255,255,255,0.08)', marginTop: 8 }}>
                  {tramos.map(t => <div key={t.e.id} style={{ width: `${(t.n / l.n) * 100}%`, background: t.e.color }} />)}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Búsqueda y filtros */}
      <input
        type="text" value={texto} onChange={e => setTexto(e.target.value)}
        placeholder="Buscar por nombre, ciudad, WhatsApp…" style={campo} data-testid="koda-buscar"
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <select value={fTheme} onChange={e => setFTheme(e.target.value)} style={campo} data-testid="koda-filtro-plantilla">
          <option value="all">Todas las plantillas</option>
          {themesPresentes.map(t => <option key={t} value={t}>{THEME_LABEL[t] || t}</option>)}
          {items.some(i => !i.theme) && <option value="none">Sin plantilla</option>}
        </select>
        <select value={fBusqueda} onChange={e => setFBusqueda(e.target.value)} style={campo} data-testid="koda-filtro-busqueda">
          <option value="all">Todas las búsquedas</option>
          {busquedas.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>

      {(fEstado !== 'all' || fTheme !== 'all' || fBusqueda !== 'all' || fLote !== 'all' || texto.trim()) && (
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
          {filtrados.length} {filtrados.length === 1 ? 'negocio' : 'negocios'}
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div style={{ padding: '50px', textAlign: 'center', color: 'rgba(255,255,255,0.25)' }}>Cargando prospectos…</div>
      ) : filtrados.length === 0 ? (
        <div style={{ padding: '50px 20px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '13px', lineHeight: 1.7 }} data-testid="koda-vacio">
          {items.length === 0 && !puenteFalta
            ? 'Todavía no ha llegado ningún negocio desde KODA.'
            : 'Ningún negocio coincide con el filtro.'}
        </div>
      ) : lista.map(p => {
        const est = ESTADO[p.estado] || ESTADO.borrador;
        const tcolor = THEME_COLOR[p.theme || ''] || '#94a3b8';
        const n = p.negocio || {};
        const dInv = diasInvitacion(p);
        const dPrueba = p.estado === 'aceptado' ? diasHasta(p.trial_ends_at) : null;
        const expandido = abierto === p.id;
        const ocupado = trabajando === p.id;
        // A quien ya recibió el saludo NO se le vuelve a ofrecer (la base tampoco lo enviaría): «Volver a invitar» solo aplica
        // a invitaciones que nunca salieron.
        // Sin cuenta borrador (p. ej. un duplicado por celular) nada puede avanzar en el embudo: solo se descarta o se deja así.
        const acciones = (ACCIONES[p.estado] || [])
          .filter(a => !(p.estado === 'vencido' && a.to === 'aprobado' && p.wa_enviado_at))
          .filter(a => p.user_id || !['borrador', 'aprobado', 'wa_enviado', 'aceptado'].includes(a.to));
        const conf = confirmando?.id === p.id ? acciones.find(a => a.to === confirmando.to) : null;
        const rel = resumenRelleno(p);
        return (
          <div key={p.id} data-testid="koda-card" data-estado={p.estado} style={{ ...card, padding: '16px', borderColor: expandido ? `${est.color}44` : 'rgba(255,107,53,0.1)' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <div style={{
                width: 44, height: 44, borderRadius: 13, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: `${tcolor}1f`, border: `1px solid ${tcolor}55`, color: tcolor, fontWeight: 900, fontSize: 16, fontFamily: "'Tomorrow', monospace",
              }}>{nombreDe(p)[0]?.toUpperCase() || '?'}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '15px', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombreDe(p)}</div>
                <div style={{ fontSize: '11.5px', color: 'rgba(255,255,255,0.4)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {[n.ciudad, n.categoria].filter(Boolean).join(' · ') || 'Sin ciudad'}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 7 }}>
                  <Insignia color={est.color} title={est.hint}>{est.label.toUpperCase()}</Insignia>
                  {p.theme
                    ? <Insignia color={tcolor}>{(THEME_LABEL[p.theme] || p.theme).toUpperCase()}</Insignia>
                    : <Insignia color="#94a3b8">SIN PLANTILLA</Insignia>}
                  {p.lote_numero ? <Insignia color="#ff6b35" title={etiquetaLote({ numero: p.lote_numero, nombre: p.lote_nombre ?? null })}>LOTE {p.lote_numero}</Insignia> : null}
                  {p.opt_out && <Insignia color="#ef4444">NO CONTACTAR</Insignia>}
                  {p.user_id && !p.email_real && <Insignia color="#94a3b8" title="El negocio no tenía correo: la cuenta usa uno interno">CORREO INTERNO</Insignia>}
                  {dInv !== null && (dInv <= 0
                    ? <Insignia color="#f97316">INVITACIÓN VENCIDA</Insignia>
                    : <Insignia color="#a78bfa">VENCE EN {dInv}d</Insignia>)}
                  {dPrueba !== null && (dPrueba <= 0
                    ? <Insignia color="#ef4444">PRUEBA TERMINADA</Insignia>
                    : <Insignia color="#22c55e">PRUEBA · {dPrueba}d</Insignia>)}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 12, fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
              <span>📱 {fmtWa(p.whatsapp)}</span>
              <span>De {p.koda_owner_nombre || p.koda_owner_email || 'KODA'}{p.busqueda_nombre ? ` · ${p.busqueda_nombre}` : ''}</span>
              <span>{hace(p.created_at)}</span>
            </div>

            {p.detalle && (
              <div style={{ marginTop: 10, padding: '9px 11px', borderRadius: 10, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', fontSize: '11.5px', color: '#fbbf24', lineHeight: 1.5 }} data-testid="koda-detalle">
                {p.detalle}
              </div>
            )}

            {/* Acciones del embudo */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              {p.user_id && p.username && (
                <button type="button" style={boton('suave')} onClick={() => window.open(urlPerfil(p.username!), '_blank', 'noopener')} data-testid="koda-ver-borrador">
                  👁 Ver perfil
                </button>
              )}
              {acciones.map(a => (
                <button
                  key={a.to} type="button" disabled={ocupado} style={boton(a.tono, ocupado)} data-testid={`koda-accion-${a.to}`}
                  onClick={() => (a.aviso ? setConfirmando({ id: p.id, to: a.to }) : cambiarEstado(p, a.to))}
                >
                  {a.label}
                </button>
              ))}
              <button type="button" style={boton('suave')} onClick={() => setAbierto(expandido ? null : p.id)} data-testid="koda-detalles">
                {expandido ? 'Ocultar ▴' : 'Detalles ▾'}
              </button>
            </div>

            {conf && (
              <div style={{ marginTop: 10, padding: '12px', borderRadius: 12, background: `${est.color}12`, border: `1px solid ${est.color}44` }} data-testid="koda-confirmar">
                <div style={{ fontSize: '12.5px', fontWeight: 700 }}>¿{conf.label}?</div>
                <div style={{ fontSize: '11.5px', color: 'rgba(255,255,255,0.55)', marginTop: 4, lineHeight: 1.5 }}>{conf.aviso}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button type="button" style={boton(conf.tono === 'peligro' ? 'peligro' : 'primario')} onClick={() => cambiarEstado(p, conf.to)} data-testid="koda-confirmar-si">Sí, confirmar</button>
                  <button type="button" style={boton('suave')} onClick={() => setConfirmando(null)}>Cancelar</button>
                </div>
              </div>
            )}

            {/* Detalle */}
            {expandido && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', gap: 14 }} data-testid="koda-detalle-abierto">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 14px' }}>
                  <Dato k="Dirección" v={n.direccion || '—'} />
                  <Dato k="Teléfono" v={n.telefono || '—'} />
                  <Dato k="Calificación" v={n.rating ? `⭐ ${Number(n.rating).toFixed(1)}${n.reviews_count ? ` (${n.reviews_count} reseñas)` : ''}` : '—'} />
                  <Dato k="Rubro" v={p.rubro || '—'} />
                  <Dato k="Correo" v={n.email || '—'} />
                  <Dato k="Web" v={n.website ? <a href={/^https?:/i.test(n.website) ? n.website : `https://${n.website}`} target="_blank" rel="noopener noreferrer" style={{ color: '#ff8a5c' }}>{n.website}</a> : '—'} />
                  <Dato k="Instagram" v={n.instagram || '—'} />
                  <Dato k="Facebook" v={n.facebook || '—'} />
                  {n.google_maps_url && /^https?:\/\//i.test(n.google_maps_url) && (
                    <Dato k="Mapa" v={<a href={n.google_maps_url} target="_blank" rel="noopener noreferrer" style={{ color: '#ff8a5c' }}>Ver en Google Maps</a>} />
                  )}
                </div>

                <div>
                  <div style={{ ...etiqueta, marginBottom: 6 }}>Relleno del perfil</div>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }} data-testid="koda-relleno">
                    {rel.hay
                      ? <>Se llenaron {rel.koda + rel.banco + rel.mixto} campos ({rel.koda} de KODA, {rel.banco} del banco de recursos{rel.mixto ? `, ${rel.mixto} mixtos` : ''}) y {rel.enlaces} enlaces{rel.paquete ? ` · nicho «${rel.paquete}»` : ''}.</>
                      : 'Este borrador no tiene relleno registrado.'}
                  </div>
                </div>

                <div>
                  <div style={{ ...etiqueta, marginBottom: 6 }}>Nota interna</div>
                  <textarea
                    value={notas[p.id] ?? p.nota_admin ?? ''} onChange={e => setNotas(prev => ({ ...prev, [p.id]: e.target.value }))}
                    rows={2} placeholder="Ej. Hablé con el dueño, le interesa el plan anual" style={{ ...campo, resize: 'vertical' }} data-testid="koda-nota"
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    <button type="button" style={boton('suave', ocupado)} disabled={ocupado || (notas[p.id] ?? p.nota_admin ?? '') === (p.nota_admin ?? '')} onClick={() => guardarNota(p)} data-testid="koda-guardar-nota">Guardar nota</button>
                    <button type="button" style={boton(p.opt_out ? 'ok' : 'peligro', ocupado)} disabled={ocupado} onClick={() => alternarOptOut(p)} data-testid="koda-optout">
                      {p.opt_out ? 'Permitir contacto' : 'No contactar'}
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {p.whatsapp && !p.opt_out && (
                    <a href={urlWhatsApp(p.whatsapp)} target="_blank" rel="noopener noreferrer" style={{ ...boton('suave'), textDecoration: 'none', display: 'inline-block' }} data-testid="koda-abrir-wa">Abrir WhatsApp</a>
                  )}
                  {p.username && (
                    <button type="button" style={boton('suave')} onClick={() => onOpenClient(p.username!)} data-testid="koda-abrir-cliente">Abrir en Clientes</button>
                  )}
                  {p.estado === 'aceptado' && p.user_id && (
                    confirmandoCred === p.id ? (
                      <div style={{ flexBasis: '100%', padding: 12, borderRadius: 12, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)' }} data-testid="koda-cred-confirmar">
                        <div style={{ fontSize: '12px', color: '#fbbf24', lineHeight: 1.5 }}>
                          Esto fija una contraseña NUEVA en la cuenta. Si el negocio ya entró y la cambió, dejará de funcionar.
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                          <button type="button" style={boton('primario')} onClick={() => entregarCredenciales(p)} data-testid="koda-cred-si">Sí, generar</button>
                          <button type="button" style={boton('suave')} onClick={() => setConfirmandoCred(null)}>Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" style={boton('ok', ocupado)} disabled={ocupado} onClick={() => setConfirmandoCred(p.id)} data-testid="koda-credenciales">Entregar credenciales</button>
                    )
                  )}
                </div>

                {p.revisado_at && (
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>Último cambio del equipo {hace(p.revisado_at)}</div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {filtrados.length > visibles && (
        <button type="button" onClick={() => setVisibles(v => v + POR_PAGINA)} style={{ ...boton('suave'), width: '100%', padding: '13px' }} data-testid="koda-mas">
          Mostrar más ({filtrados.length - visibles} restantes)
        </button>
      )}
      {items.length >= LIMITE && (
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>Mostrando los {LIMITE} más recientes.</div>
      )}

      {/* Rubros → plantillas (solo lectura) */}
      <div style={{ ...card, padding: '14px 16px' }}>
        <button type="button" onClick={() => setVerRubros(v => !v)} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: '12.5px', fontWeight: 700, width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between' }} data-testid="koda-rubros-toggle">
          <span>Rubros de KODA y su plantilla</span><span>{verRubros ? '▴' : '▾'}</span>
        </button>
        {verRubros && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="koda-rubros">
            {!rubros ? <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Cargando…</div> : rubros.map(r => (
              <div key={r.rubro} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, fontSize: '12.5px' }}>
                <span style={{ color: 'rgba(255,255,255,0.75)' }}>{r.rubro}</span>
                {r.theme
                  ? <Insignia color={THEME_COLOR[r.theme] || '#94a3b8'}>{(THEME_LABEL[r.theme] || r.theme).toUpperCase()}</Insignia>
                  : <Insignia color="#94a3b8">SIN PLANTILLA</Insignia>}
              </div>
            ))}
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', lineHeight: 1.6, marginTop: 4 }}>
              Se cambia por SQL en la tabla koda_rubro_plantilla. Las veterinarias salen como Petcare y las inmobiliarias como Inmobiliaria, según su categoría.
            </div>
          </div>
        )}
      </div>

      {/* Credenciales recién generadas */}
      {cred && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} data-testid="koda-cred-modal">
          <div style={{ ...card, background: '#160700', width: '100%', maxWidth: 440, padding: 20, borderColor: 'rgba(34,197,94,0.35)' }}>
            <div style={{ fontSize: '15px', fontWeight: 800 }}>Credenciales de {nombreDe(cred.p)}</div>
            <div style={{ fontSize: '11.5px', color: '#fbbf24', marginTop: 6, lineHeight: 1.5 }}>
              La contraseña se muestra solo ahora y no queda guardada. Cópiala o envíala antes de cerrar.
            </div>
            <textarea readOnly value={cred.mensaje} rows={9} style={{ ...campo, marginTop: 12, fontSize: '12.5px', lineHeight: 1.5, resize: 'none' }} data-testid="koda-cred-mensaje" onFocus={e => e.currentTarget.select()} />
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button type="button" style={boton('primario')} onClick={() => copiar(cred.mensaje)} data-testid="koda-cred-copiar">Copiar mensaje</button>
              {cred.p.whatsapp && (
                <a href={urlWhatsApp(cred.p.whatsapp, cred.mensaje)} target="_blank" rel="noopener noreferrer" style={{ ...boton('ok'), textDecoration: 'none', display: 'inline-block' }} data-testid="koda-cred-wa">Enviar por WhatsApp</a>
              )}
              <button type="button" style={boton('suave')} onClick={() => setCred(null)} data-testid="koda-cred-cerrar">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KodaProspectsTab;
