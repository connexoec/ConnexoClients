import React, { useState, useEffect } from 'react';
import { supabase } from '../src/lib/supabase';

const COUNTRY_KEY = 'connexo_admin_country';
const TAB_KEY = 'connexo_admin_tab';

// ─── Constants ────────────────────────────────────────────────────────────────
const ALLOWED_ADMINS = (import.meta.env.VITE_SUPER_ADMIN_EMAILS || '').split(',').map((e: string) => e.trim().toLowerCase()).filter(Boolean);

type Tab = 'dashboard' | 'clients' | 'create' | 'admins' | 'security';
type Country = 'EC' | 'VE';

// Roles de plataforma. La fuente de verdad es la tabla admin_users en Supabase
// (ver setup_admin_roles.sql); ALLOWED_ADMINS queda solo como salvavidas de
// arranque por si ese SQL todavía no se ejecutó.
type AdminRole = 'super_admin' | 'operator';

type AdminUser = {
  user_id: string;
  email: string | null;
  role: AdminRole;
  is_active: boolean;
  note: string | null;
  created_at: string;
  last_sign_in: string | null;
};

type Subscription = {
  user_id: string;
  account_status: 'trial' | 'active' | 'expired' | 'cancelled';
  plan_type: 'trial_6m' | 'mensual_pago' | 'anual_pago';
  trial_ends_at: string | null;
  source_campaign: string | null;
  converted_at: string | null;
};

type Profile = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  plan: string;
  theme: string;
  location: string;
  created_at: string;
  is_active: boolean;
  subscription?: Subscription | null;
};

const PLANS = [
  { val: 'free',  label: 'CONECTA', color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.25)' },
  { val: 'pro',   label: 'PRO',     color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.25)' },
  { val: 'ultra', label: 'ULTRA',   color: '#ff6b35', bg: 'rgba(255,107,53,0.12)', border: 'rgba(255,107,53,0.25)' },
];

// CONECTA NO es un plan: es el nombre de la prueba gratuita, que siempre corre
// SOBRE un plan real (PRO o ULTRA) — "CONECTA (PRO)" = prueba usando los
// beneficios del PRO. Por eso al crear o editar solo se ofrecen PRO y ULTRA;
// que un perfil esté en CONECTA lo determina su suscripción en prueba (trial),
// no el campo plan. La entrada 'free' se conserva únicamente para pintar bien
// cualquier perfil heredado que aún tenga ese valor; nunca se ofrece de nuevo.
const SELECTABLE_PLANS = PLANS.filter(p => p.val !== 'free');

const TEMPLATES = [
  { val: 'default', label: 'Estándar',  desc: 'Perfil Connexo clásico' },
  { val: 'barber',  label: 'Barbería',  desc: 'Plantilla Premium Barber' },
  { val: 'gastro',  label: 'Gastronomía', desc: 'Menú Digital & Comandas' },
  { val: 'petcare', label: 'Petcare / Veterinaria', desc: 'Clínica o pet shop: catálogo, citas, comandas e inventario' },
  { val: 'medical', label: 'Salud / Médico', desc: 'Clínica, consultorio o servicio de salud: catálogo, citas, atenciones e historia clínica' },
  { val: 'ecom',    label: 'E-commerce',  desc: 'Catálogo de productos y ventas' },
  { val: 'stage',   label: 'Artista / Música', desc: 'Embudo para músicos, artistas y productores' },
  { val: 'realty',  label: 'Inmobiliaria', desc: 'Agencia: propiedades, agentes NFC y CRM con atribución' },
  { val: 'sublima', label: 'Sublimados / Textil', desc: 'Fábrica-tienda: catálogo por volumen, pedidos mayoristas y club' },
];

// Color distintivo por plantilla (para los chips de filtro de CLIENTES)
const THEME_COLORS: Record<string, string> = {
  all:     '#ff6b35',
  default: '#94a3b8',
  barber:  '#3b82f6',
  gastro:  '#f59e0b',
  petcare: '#0ea5a4',
  medical: '#2563eb',
  ecom:    '#8b5cf6',
  stage:   '#ec4899',
  realty:  '#ff6600',
  sublima: '#a3e635',
};

const COUNTRIES = [
  { val: 'EC' as Country, label: 'Ecuador',   code: 'EC' },
  { val: 'VE' as Country, label: 'Venezuela', code: 'VE' },
];

const getPlan = (v: string) => PLANS.find(p => p.val === v) || PLANS[0];

const getSubStatus = (sub: Subscription | null | undefined) => {
  if (!sub) return { label: null, color: '#6b7280', bg: 'transparent', isExpired: false, daysLeft: null };
  if (sub.account_status === 'active') {
    const lbl = sub.plan_type === 'mensual_pago' ? 'MENSUAL ACTIVO' : 'ANUAL ACTIVO';
    return { label: lbl, color: '#22c55e', bg: 'rgba(34,197,94,0.1)', isExpired: false, daysLeft: null };
  }
  if (sub.account_status === 'trial') {
    // La prueba gratuita ES "CONECTA" (encima del plan real PRO/ULTRA del perfil).
    if (!sub.trial_ends_at) return { label: 'CONECTA', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', isExpired: false, daysLeft: null };
    const daysLeft = Math.ceil((new Date(sub.trial_ends_at).getTime() - Date.now()) / 86400000);
    if (daysLeft <= 0) return { label: 'CONECTA EXPIRADO', color: '#ef4444', bg: 'rgba(239,68,68,0.1)', isExpired: true, daysLeft: 0 };
    const urgent = daysLeft <= 14;
    return { label: `CONECTA · ${daysLeft}d`, color: urgent ? '#ef4444' : '#f59e0b', bg: urgent ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)', isExpired: false, daysLeft };
  }
  return { label: sub.account_status.toUpperCase(), color: '#6b7280', bg: 'rgba(107,114,128,0.1)', isExpired: false, daysLeft: null };
};

// ─── SVG Icons (no emojis) ────────────────────────────────────────────────────
const Ico = {
  Bolt: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  ),
  Grid: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
    </svg>
  ),
  Users: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  Plus: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
    </svg>
  ),
  LogOut: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  ),
  Search: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  ),
  Edit: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  ),
  Link: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  ),
  Refresh: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polyline points="23 4 23 10 17 10"/>
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
    </svg>
  ),
  Check: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  X: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
  Globe: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  ),
  Shield: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
  Key: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7.5" cy="15.5" r="4.5"/>
      <path d="M10.7 12.3 21 2m-4 4 3 3m-6-6 3 3"/>
    </svg>
  ),
  UserCog: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="7" r="4"/>
      <path d="M2 21v-2a5 5 0 0 1 5-5h4"/>
      <circle cx="18" cy="17" r="3"/>
      <path d="M18 13v1m0 6v1m4-4h-1m-6 0h-1"/>
    </svg>
  ),
  Trending: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
      <polyline points="17 6 23 6 23 12"/>
    </svg>
  ),
  Scissors: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
      <line x1="20" y1="4" x2="8.12" y2="15.88"/>
      <line x1="14.47" y1="14.48" x2="20" y2="20"/>
      <line x1="8.12" y1="8.12" x2="12" y2="12"/>
    </svg>
  ),
  Star: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  ),
  Tag: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
      <line x1="7" y1="7" x2="7.01" y2="7"/>
    </svg>
  ),
  Power: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
      <line x1="12" y1="2" x2="12" y2="12"/>
    </svg>
  ),
  Trash: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6M14 11v6"/>
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  ),
};

// ─── Shared micro-styles ──────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '14px 16px',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,107,53,0.15)',
  borderRadius: '12px', color: '#fff',
  fontSize: '16px', outline: 'none',
  boxSizing: 'border-box',
  fontFamily: "'Inter', -apple-system, sans-serif",
  WebkitAppearance: 'none',
  transition: 'border-color 0.2s',
};

const labelStyle: React.CSSProperties = {
  display: 'block', marginBottom: '8px',
  fontSize: '10px', fontWeight: 800,
  letterSpacing: '2px', textTransform: 'uppercase',
  color: 'rgba(255,107,53,0.55)',
  fontFamily: "'Inter', -apple-system, sans-serif",
};

const sectionCard: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,107,53,0.1)',
  borderRadius: '20px',
};

// ─── Component ────────────────────────────────────────────────────────────────
const SuperAdmin: React.FC = () => {
  const [unlocked, setUnlocked]         = useState(false);
  const [currentAdmin, setCurrentAdmin] = useState<any>(null);
  const [loginEmail, setLoginEmail]     = useState('');
  const [loginPwd, setLoginPwd]         = useState('');
  const [loginError, setLoginError]     = useState('');
  const [loadingLogin, setLoadingLogin] = useState(false);

  const [activeTab, setActiveTab]     = useState<Tab>(
    () => (localStorage.getItem(TAB_KEY) as Tab) || 'dashboard'
  );
  const [country, setCountry]         = useState<Country>(
    () => (localStorage.getItem(COUNTRY_KEY) as Country) || 'EC'
  );
  const [profiles, setProfiles]       = useState<Profile[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [search, setSearch]           = useState('');
  const [themeFilter, setThemeFilter] = useState<string>('all'); // 'all' | theme | 'plan:free|pro|ultra'

  const [editingId, setEditingId]   = useState<string | null>(null);
  const [editVals, setEditVals]     = useState({ plan: 'free', theme: 'default' });
  const [savingId, setSavingId]     = useState<string | null>(null);

  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const [form, setForm] = useState({
    email: '', password: '', username: '', displayName: '', plan: 'pro', theme: 'default',
  });
  const [creating, setCreating]       = useState(false);
  const [createMsg, setCreateMsg]     = useState<{ ok: boolean; text: string } | null>(null);

  // Conversion state (trial → paid)
  const [convertingId, setConvertingId]           = useState<string | null>(null);
  const [convertPlanType, setConvertPlanType]     = useState<'mensual_pago' | 'anual_pago'>('mensual_pago');
  const [processingConvert, setProcessingConvert] = useState(false);

  // Trial configuration state (set/extend trial on any client)
  const [trialingId, setTrialingId]             = useState<string | null>(null);
  const [trialPanelVals, setTrialPanelVals]     = useState({ campaign: '', days: 180 });
  const [processingTrial, setProcessingTrial]   = useState(false);

  // Delete state
  const [deletingId, setDeletingId]     = useState<string | null>(null);
  const [isDeleting, setIsDeleting]     = useState(false);


  // ── Roles de plataforma ─────────────────────────────────────────────────────
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);

  // Operadores (solo Super Admin)
  const [admins, setAdmins]             = useState<AdminUser[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(false);
  const [opForm, setOpForm]             = useState({ email: '', password: '', note: '' });
  const [creatingOp, setCreatingOp]     = useState(false);
  const [opMsg, setOpMsg]               = useState<{ ok: boolean; text: string } | null>(null);
  const [removingOpId, setRemovingOpId] = useState<string | null>(null);

  // Cambio de mi propia contraseña
  const [pwdForm, setPwdForm]       = useState({ current: '', next: '', confirm: '' });
  const [changingPwd, setChangingPwd] = useState(false);
  const [pwdMsg, setPwdMsg]         = useState<{ ok: boolean; text: string } | null>(null);

  // Create form subscription fields
  const [formSubType, setFormSubType]     = useState<'none' | 'trial' | 'mensual' | 'anual'>('none');
  const [formCampaign, setFormCampaign]   = useState('');
  const [formTrialDays, setFormTrialDays] = useState(30);

  // ── Auth ────────────────────────────────────────────────────────────────────
  const updateCountry = (c: Country) => {
    setCountry(c);
    localStorage.setItem(COUNTRY_KEY, c);
  };

  const updateTab = (t: Tab) => {
    setActiveTab(t);
    localStorage.setItem(TAB_KEY, t);
  };

  // Resuelve el rol contra la base de datos (fuente de verdad).
  // Si la RPC no existe todavía (setup_admin_roles.sql sin ejecutar), cae al
  // allowlist del .env para no dejar al dueño fuera de su propio panel.
  const resolveAdminRole = async (u: any): Promise<AdminRole | null> => {
    const emailIsBootstrapAdmin = ALLOWED_ADMINS.includes(u?.email?.toLowerCase() || '');
    try {
      const { data, error } = await supabase.rpc('get_my_admin_role');
      if (error) throw error;
      const r = data as { is_admin: boolean; role: AdminRole | null };
      if (r?.is_admin && r.role) return r.role;
      // La tabla existe y no estás en ella: acceso denegado, aunque el .env diga lo contrario.
      return null;
    } catch {
      console.warn('[SuperAdmin] get_my_admin_role no disponible — usando el allowlist del .env. Ejecuta setup_admin_roles.sql.');
      return emailIsBootstrapAdmin ? 'super_admin' : null;
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const u = session?.user;
      if (!u) return;
      const role = await resolveAdminRole(u);
      if (!role) return;
      setAdminRole(role);
      setUnlocked(true);
      setCurrentAdmin(u);
      if (!localStorage.getItem(COUNTRY_KEY)) {
        updateCountry('EC');
      }
    });
  }, []);

  useEffect(() => {
    if (unlocked && (activeTab === 'dashboard' || activeTab === 'clients')) fetchProfiles();
  }, [unlocked, activeTab, country]);

  // La pestaña de operadores es exclusiva del Super Admin: si un operador la
  // tuviera guardada en localStorage de una sesión anterior, se le devuelve al
  // dashboard (el servidor igual rechazaría las llamadas).
  useEffect(() => {
    if (!unlocked) return;
    if (activeTab === 'admins' && adminRole !== 'super_admin') {
      updateTab('dashboard');
      return;
    }
    if (activeTab === 'admins') fetchAdmins();
  }, [unlocked, activeTab, adminRole]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = loginEmail.toLowerCase().trim();
    setLoadingLogin(true); setLoginError('');
    try {
      // Ya no se filtra por correo antes de entrar: el rol lo decide la base de
      // datos, que es la que también autoriza cada acción. Si el usuario no es
      // administrador se cierra la sesión de inmediato.
      const { data, error } = await supabase.auth.signInWithPassword({ email: clean, password: loginPwd });
      if (error) throw error;

      const role = await resolveAdminRole(data.user);
      if (!role) {
        await supabase.auth.signOut();
        setLoginError('Acceso denegado. Esta cuenta no tiene permisos de administrador.');
        return;
      }
      setAdminRole(role);
      setUnlocked(true);
      setCurrentAdmin(data.user);
      setCountry('EC');
    } catch (err: any) {
      setLoginError(err.message || 'Error al iniciar sesión');
    } finally { setLoadingLogin(false); }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUnlocked(false); setCurrentAdmin(null); setAdminRole(null);
  };

  // ── Data ────────────────────────────────────────────────────────────────────
  const fetchProfiles = async () => {
    setLoadingData(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, username, displayName, plan, theme, location, created_at, is_active')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('fetchProfiles error:', error);
      setLoadingData(false);
      return;
    }

    const allProfiles = (data || []) as Profile[];

    const filteredByCountry = allProfiles.filter(p => {
      const loc = (p.location || '').toLowerCase().trim();
      const isVenezuela = loc === 've' || loc.includes('venezuela');
      return country === 'VE' ? isVenezuela : !isVenezuela;
    });

    // Fetch subscriptions for these profiles (admin sees all via SQL policy)
    if (filteredByCountry.length > 0) {
      const ids = filteredByCountry.map(p => p.id);
      const { data: subsData } = await supabase
        .from('subscriptions')
        .select('user_id, account_status, plan_type, trial_ends_at, source_campaign, converted_at')
        .in('user_id', ids);

      const merged = filteredByCountry.map(p => ({
        ...p,
        subscription: (subsData || []).find((s: any) => s.user_id === p.id) || null,
      })) as Profile[];

      setProfiles(merged);
    } else {
      setProfiles(filteredByCountry);
    }

    setLoadingData(false);
  };

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  // Auditoría + aviso a Discord de las acciones del panel (crear perfil,
  // activar/desactivar, cambiar plan/plantilla). Dispara-y-olvida: NUNCA
  // interrumpe ni hace fallar la acción principal si la RPC no responde o
  // aún no se ejecutó setup_admin_event_log.sql.
  const logAdminEvent = (
    eventType: 'profile_created' | 'profile_activated' | 'profile_deactivated' | 'plan_theme_changed',
    extra: Record<string, any> = {},
  ) => {
    try {
      Promise.resolve(
        supabase.rpc('log_admin_event', { p_event_type: eventType, p_actor_role: adminRole ?? null, ...extra }),
      )
        .then((res: any) => { if (res?.error) console.warn('log_admin_event:', res.error.message); })
        .catch(() => { /* silencio: la telemetría no rompe la acción */ });
    } catch { /* idem */ }
  };

  const saveEdit = async (id: string) => {
    setSavingId(id);
    const { error } = await supabase.rpc('update_user_plan_theme', {
      p_user_id: id,
      p_plan:    editVals.plan,
      p_theme:   editVals.theme,
    });
    if (error) {
      console.error('saveEdit error:', error);
      showToast('Error al guardar', false);
    } else {
      const tgt = profiles.find(p => p.id === id);
      logAdminEvent('plan_theme_changed', {
        p_target_user_id:  id,
        p_target_email:    tgt?.email ?? null,
        p_target_username: tgt?.username ?? null,
        p_plan:            editVals.plan,
        p_theme:           editVals.theme,
        p_details:         { from: { plan: tgt?.plan, theme: tgt?.theme }, to: editVals },
      });
      setProfiles(prev => prev.map(p => p.id === id ? { ...p, ...editVals } : p));
      showToast('Cambios guardados', true);
      setEditingId(null);
    }
    setSavingId(null);
  };

  const handleToggleActive = async (profileId: string, currentActive: boolean) => {
    const next = !currentActive;
    const { error } = await supabase.rpc('set_profile_active', {
      p_user_id: profileId,
      p_is_active: next,
    });
    if (error) {
      showToast('Error al cambiar estado: ' + error.message, false);
    } else {
      const tgt = profiles.find(p => p.id === profileId);
      setProfiles(prev => prev.map(p => p.id === profileId ? { ...p, is_active: next } : p));
      showToast(next ? 'Perfil activado' : 'Perfil desactivado', next);
      logAdminEvent(next ? 'profile_activated' : 'profile_deactivated', {
        p_target_user_id:  profileId,
        p_target_email:    tgt?.email ?? null,
        p_target_username: tgt?.username ?? null,
        p_plan:            tgt?.plan ?? null,
        p_theme:           tgt?.theme ?? null,
      });
    }
  };

  const handleDeleteUser = async (profileId: string) => {
    setIsDeleting(true);
    try {
      const { error } = await supabase.rpc('delete_user_complete', { p_user_id: profileId });
      if (error) throw error;
      setProfiles(prev => prev.filter(p => p.id !== profileId));
      setDeletingId(null);
      showToast('Cliente eliminado correctamente', true);
    } catch (err: any) {
      showToast('Error al eliminar: ' + err.message, false);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSetTrial = async (profileId: string) => {
    setProcessingTrial(true);
    try {
      const { error } = await supabase.rpc('set_user_trial', {
        p_user_id:         profileId,
        p_trial_days:      trialPanelVals.days,
        p_source_campaign: trialPanelVals.campaign,
      });
      if (error) throw error;

      const endsAt = new Date(Date.now() + trialPanelVals.days * 86400000).toISOString();
      setProfiles(prev => prev.map(p => p.id === profileId ? {
        ...p,
        subscription: {
          user_id: profileId,
          account_status: 'trial' as const,
          plan_type: 'trial_6m' as const,
          trial_ends_at: endsAt,
          source_campaign: trialPanelVals.campaign || p.subscription?.source_campaign || null,
          converted_at: null,
        },
      } : p));
      setTrialingId(null);
      showToast('Trial configurado correctamente', true);
    } catch (err: any) {
      showToast('Error: ' + err.message, false);
    } finally {
      setProcessingTrial(false);
    }
  };

  const handleConvert = async (profileId: string) => {
    setProcessingConvert(true);
    try {
      const { error } = await supabase.rpc('convert_trial_to_paid', {
        p_user_id:   profileId,
        p_plan_type: convertPlanType,
        p_admin_id:  currentAdmin?.id,
      });
      if (error) throw error;

      // Update local state — zero business data touched
      setProfiles(prev => prev.map(p => p.id === profileId ? {
        ...p,
        subscription: {
          ...(p.subscription as Subscription),
          account_status: 'active' as const,
          plan_type: convertPlanType,
          trial_ends_at: null,
          converted_at: new Date().toISOString(),
        },
      } : p));
      setConvertingId(null);
      showToast('Cliente convertido a pago correctamente', true);
    } catch (err: any) {
      showToast('Error: ' + err.message, false);
    } finally {
      setProcessingConvert(false);
    }
  };

  // Crea la cuenta en auth.users SIN perder la sesión del administrador.
  // supabase.auth.signUp() puede dejar la sesión del recién creado si el proyecto
  // tiene desactivada la confirmación por correo; como ahora las RPC exigen rol
  // de admin, esa suplantación silenciosa rompería la creación de clientes.
  const createAuthUser = async (email: string, password: string) => {
    const { data: { session: adminSession } } = await supabase.auth.getSession();
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    if (!data?.user) throw new Error('No se pudo crear el usuario en Auth.');
    if ((data.user.identities?.length ?? 0) === 0) {
      throw new Error('Este correo ya está registrado. Usa otro email o edita el perfil existente.');
    }
    const { data: { session: after } } = await supabase.auth.getSession();
    if (adminSession && after?.user?.id !== adminSession.user.id) {
      await supabase.auth.setSession({
        access_token:  adminSession.access_token,
        refresh_token: adminSession.refresh_token,
      });
    }
    return data.user;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.password || !form.username) {
      setCreateMsg({ ok: false, text: 'Email, contraseña y username son requeridos.' }); return;
    }
    // ⚠️ El username ES la dirección pública del cliente. Una barra parte la URL
    // en dos y el perfil dejaba de abrirse; '?' y '#' cortan la dirección por la
    // mitad. Se avisa aquí en vez de crear un perfil que nace inaccesible.
    const usuarioLimpio = form.username.toLowerCase().trim();
    const invalido = /[\/?#%]/.test(usuarioLimpio);
    if (invalido) {
      setCreateMsg({
        ok: false,
        text: 'El nombre de usuario no puede llevar / ? # ni %.\n' +
              'Es la dirección web del cliente y esos símbolos la rompen.\n' +
              'Usa guiones: por ejemplo "marcelo-mariapaz".',
      });
      return;
    }
    setCreating(true); setCreateMsg(null);
    try {
      const newUser = await createAuthUser(form.email, form.password);
      const data = { user: newUser };
      const { error: pe } = await supabase.rpc('create_user_profile', {
        p_user_id:     data.user.id,
        p_email:       form.email,
        p_username:    usuarioLimpio,
        p_display_name: form.displayName || form.username,
        p_plan:        form.plan,
        p_theme:       form.theme,
        p_location:    country,
      });
      if (pe) throw pe;

      // Auto-confirmar email para que el cliente pueda iniciar sesión de inmediato
      // El email de Supabase ya sale automáticamente como email de bienvenida
      await supabase.rpc('auto_confirm_user_email', { p_user_id: data.user.id });

      // Register subscription according to selected type
      if (formSubType === 'trial') {
        await supabase.rpc('create_trial_subscription', {
          p_user_id:         data.user.id,
          p_source_campaign: formCampaign.trim(),
          p_trial_days:      formTrialDays,
        });
      } else if (formSubType === 'mensual' || formSubType === 'anual') {
        await supabase.rpc('create_trial_subscription', {
          p_user_id:         data.user.id,
          p_source_campaign: '',
          p_trial_days:      1,
        });
        await supabase.rpc('convert_trial_to_paid', {
          p_user_id:   data.user.id,
          p_plan_type: formSubType === 'mensual' ? 'mensual_pago' : 'anual_pago',
          p_admin_id:  currentAdmin?.id,
        });
      }
      // formSubType === 'none' → no subscription record created

      // Auditoría + aviso a Discord con TODOS los datos del formulario. Se hace
      // aquí, antes de reiniciar el formulario, para no perder los valores.
      logAdminEvent('profile_created', {
        p_target_user_id:    data.user.id,
        p_target_email:      form.email,
        p_target_username:   usuarioLimpio,
        p_plan:              form.plan,
        p_theme:             form.theme,
        p_subscription_type: formSubType,
        p_campaign:          formSubType === 'trial' ? formCampaign.trim() : null,
        p_trial_days:        formSubType === 'trial' ? formTrialDays : null,
        p_location:          country,
        p_details:           { displayName: form.displayName || form.username },
      });

      const subNote = formSubType === 'trial'
        ? `CONECTA (prueba): ${formTrialDays}d${formCampaign.trim() ? ` · ${formCampaign.trim()}` : ''}`
        : formSubType === 'mensual' ? 'Mensual activo'
        : formSubType === 'anual' ? 'Anual activo'
        : 'Sin suscripción';
      setCreateMsg({ ok: true, text: `Cliente creado correctamente\n${form.email}\n@${form.username} · ${form.plan.toUpperCase()}\nPaís: ${country}\n${subNote}` });
      setForm({ email: '', password: '', username: '', displayName: '', plan: 'pro', theme: 'default' });
      setFormSubType('none');
      setFormCampaign('');
      setFormTrialDays(30);
    } catch (err: any) {
      setCreateMsg({ ok: false, text: err.message });
    } finally { setCreating(false); }
  };

  // ── Operadores (solo Super Admin) ───────────────────────────────────────────
  const fetchAdmins = async () => {
    setLoadingAdmins(true);
    const { data, error } = await supabase.rpc('admin_list_admins');
    if (error) {
      console.error('admin_list_admins error:', error);
      showToast('No se pudo cargar la lista de accesos', false);
    } else {
      setAdmins((data || []) as AdminUser[]);
    }
    setLoadingAdmins(false);
  };

  const handleCreateOperator = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = opForm.email.toLowerCase().trim();
    if (!email || opForm.password.length < 8) {
      setOpMsg({ ok: false, text: 'Correo y una contraseña de al menos 8 caracteres.' });
      return;
    }
    setCreatingOp(true); setOpMsg(null);
    try {
      const newUser = await createAuthUser(email, opForm.password);
      await supabase.rpc('auto_confirm_user_email', { p_user_id: newUser.id });
      const { error } = await supabase.rpc('admin_register_operator', {
        p_user_id: newUser.id,
        p_email:   email,
        p_note:    opForm.note.trim() || null,
      });
      if (error) throw error;

      // ⚠️ Un operador NO es un cliente. Supabase tiene un trigger (handle_new_user)
      // que crea un perfil por defecto en 'profiles' con CADA alta de auth.users, así
      // que al crear el operador queda un perfil CONECTA fantasma con su correo. Aquí
      // lo retiramos: la RPC solo borra la fila de 'profiles' si el usuario es operador,
      // por lo que nunca puede tocar el perfil de un cliente real. Best-effort: si el
      // SQL nuevo aún no se ejecutó, no rompemos la creación del operador.
      const { error: cleanupErr } = await supabase.rpc('admin_delete_admin_profile', {
        p_user_id: newUser.id,
      });
      if (cleanupErr) console.warn('No se pudo limpiar el perfil fantasma del operador:', cleanupErr.message);

      setOpMsg({ ok: true, text: `Operador creado\n${email}\nYa puede entrar al Control Center con esa clave.` });
      setOpForm({ email: '', password: '', note: '' });
      fetchAdmins();
    } catch (err: any) {
      setOpMsg({ ok: false, text: err.message || 'Error al crear el operador' });
    } finally {
      setCreatingOp(false);
    }
  };

  const handleToggleOperator = async (userId: string, current: boolean) => {
    const { error } = await supabase.rpc('admin_set_operator_active', {
      p_user_id: userId, p_is_active: !current,
    });
    if (error) { showToast('Error: ' + error.message, false); return; }
    setAdmins(prev => prev.map(a => a.user_id === userId ? { ...a, is_active: !current } : a));
    showToast(!current ? 'Acceso reactivado' : 'Acceso revocado', !current);
  };

  const handleRemoveOperator = async (userId: string) => {
    const { error } = await supabase.rpc('admin_remove_operator', { p_user_id: userId });
    if (error) { showToast('Error: ' + error.message, false); return; }
    setAdmins(prev => prev.filter(a => a.user_id !== userId));
    setRemovingOpId(null);
    showToast('Rol de operador retirado', true);
  };

  // ── Mi contraseña ───────────────────────────────────────────────────────────
  const handleChangeMyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const { current, next, confirm } = pwdForm;
    if (!current || !next || !confirm) {
      setPwdMsg({ ok: false, text: 'Completa los tres campos.' }); return;
    }
    if (next !== confirm) {
      setPwdMsg({ ok: false, text: 'La contraseña nueva y su confirmación no coinciden.' }); return;
    }
    if (next.length < 8) {
      setPwdMsg({ ok: false, text: 'Usa al menos 8 caracteres para una cuenta de administrador.' }); return;
    }
    if (next === current) {
      setPwdMsg({ ok: false, text: 'La contraseña nueva debe ser distinta de la actual.' }); return;
    }

    setChangingPwd(true); setPwdMsg(null);
    try {
      // Re-autenticación: exigimos la contraseña actual para que nadie pueda
      // cambiarla aprovechando una sesión abierta en un equipo ajeno.
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: currentAdmin?.email || '',
        password: current,
      });
      if (reauthError) {
        setPwdMsg({ ok: false, text: 'La contraseña actual no es correcta.' });
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) throw error;

      setPwdForm({ current: '', next: '', confirm: '' });
      setPwdMsg({ ok: true, text: 'Contraseña actualizada. Úsala en tu próximo inicio de sesión.' });
    } catch (err: any) {
      setPwdMsg({ ok: false, text: err.message || 'No se pudo actualizar la contraseña.' });
    } finally {
      setChangingPwd(false);
    }
  };

  // ── Stats ────────────────────────────────────────────────────────────────────
  const stats = {
    total:    profiles.length,
    ultra:    profiles.filter(p => p.plan === 'ultra').length,
    pro:      profiles.filter(p => p.plan === 'pro').length,
    free:     profiles.filter(p => p.plan === 'free').length,
    barber:   profiles.filter(p => p.theme === 'barber').length,
    trials:   profiles.filter(p => p.subscription?.account_status === 'trial').length,
    expiring: profiles.filter(p => {
      const s = p.subscription;
      if (!s || s.account_status !== 'trial' || !s.trial_ends_at) return false;
      const d = Math.ceil((new Date(s.trial_ends_at).getTime() - Date.now()) / 86400000);
      return d >= 0 && d <= 14;
    }).length,
  };

  const filtered = profiles.filter(p => {
    const matchSearch = [p.displayName, p.email, p.username].some(v =>
      (v || '').toLowerCase().includes(search.toLowerCase())
    );
    let matchFilter = true;
    if (themeFilter !== 'all') {
      if (themeFilter.startsWith('plan:')) {
        matchFilter = (p.plan || 'free') === themeFilter.slice(5);
      } else {
        matchFilter = (p.theme || 'default') === themeFilter;
      }
    }
    return matchSearch && matchFilter;
  });

  // Conteo por plantilla para mostrar en los chips de filtro
  const themeCounts = profiles.reduce<Record<string, number>>((acc, p) => {
    const key = p.theme || 'default';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const isSuper = adminRole === 'super_admin';
  const isEC = ALLOWED_ADMINS.length > 0 && currentAdmin?.email?.toLowerCase() === ALLOWED_ADMINS[0];
  const countryLabel = COUNTRIES.find(c => c.val === country)?.label || 'Ecuador';

  const CountrySwitcher = () => (
    <div style={{
      display: 'flex', gap: '3px',
      background: 'rgba(0,0,0,0.3)',
      border: '1px solid rgba(255,107,53,0.15)',
      borderRadius: '10px', padding: '3px',
    }}>
      {COUNTRIES.map(c => (
        <button
          key={c.val}
          onClick={() => updateCountry(c.val)}
          style={{
            padding: '6px 12px', borderRadius: '8px',
            background: country === c.val
              ? 'linear-gradient(135deg, #ff6b35, #e8580a)'
              : 'transparent',
            border: 'none',
            color: country === c.val ? '#fff' : 'rgba(255,255,255,0.4)',
            fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px',
            cursor: 'pointer', transition: 'all 0.2s',
            fontFamily: "'Inter', sans-serif",
          }}
        >
          {c.code}
        </button>
      ))}
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════════
  // LOGIN
  // ══════════════════════════════════════════════════════════════════════════════
  if (!unlocked) {
    return (
      <div style={{
        minHeight: '100dvh',
        background: 'linear-gradient(135deg, #0f0400 0%, #1a0800 50%, #0f0400 100%)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Inter', -apple-system, sans-serif",
        padding: '24px',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: '10%', left: '50%', transform: 'translateX(-50%)',
          width: '400px', height: '400px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,107,53,0.12) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'linear-gradient(rgba(255,107,53,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,107,53,0.04) 1px, transparent 1px)',
          backgroundSize: '48px 48px', pointerEvents: 'none',
        }} />

        <div style={{ width: '100%', maxWidth: '380px', position: 'relative', zIndex: 1 }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <div style={{
              width: '72px', height: '72px',
              background: 'linear-gradient(135deg, #ff6b35 0%, #c94000 100%)',
              borderRadius: '20px', margin: '0 auto 20px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 40px rgba(255,107,53,0.3), 0 0 80px rgba(255,107,53,0.1)',
              color: '#fff',
            }}>
              <Ico.Bolt />
            </div>
            <div style={{
              fontSize: '10px', letterSpacing: '6px', color: 'rgba(255,107,53,0.6)',
              fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px',
              fontFamily: "'Tomorrow', monospace",
            }}>CONNEXO</div>
            <h1 style={{
              color: '#fff', fontSize: '26px', fontWeight: 900, margin: 0,
              fontStyle: 'italic',
              fontFamily: "'Tomorrow', monospace",
              letterSpacing: '-0.3px',
            }}>
              Control Center
            </h1>
            <p style={{
              color: 'rgba(255,255,255,0.28)', fontSize: '13px',
              marginTop: '8px', margin: '8px 0 0',
            }}>
              Panel administrativo · Acceso restringido
            </p>
          </div>

          <div style={{ ...sectionCard, padding: '28px' }}>
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={labelStyle}>Correo Electrónico</label>
                <input
                  type="email" value={loginEmail}
                  onChange={e => setLoginEmail(e.target.value)}
                  placeholder="admin@connexo.tech"
                  autoComplete="email"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Contraseña</label>
                <input
                  type="password" value={loginPwd}
                  onChange={e => setLoginPwd(e.target.value)}
                  placeholder="••••••••••"
                  autoComplete="current-password"
                  style={inputStyle}
                />
              </div>
              {loginError && (
                <div style={{
                  padding: '13px 16px', borderRadius: '12px',
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.25)',
                  color: '#fca5a5', fontSize: '13px', textAlign: 'center',
                }}>{loginError}</div>
              )}
              <button type="submit" disabled={loadingLogin} style={{
                padding: '16px', borderRadius: '12px', marginTop: '4px',
                background: loadingLogin
                  ? 'rgba(255,107,53,0.35)'
                  : 'linear-gradient(135deg, #ff6b35 0%, #c94000 100%)',
                border: 'none', color: '#fff', fontSize: '16px',
                fontWeight: 900, cursor: loadingLogin ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 20px rgba(255,107,53,0.25)',
                letterSpacing: '0.5px',
                fontFamily: "'Tomorrow', monospace",
                fontStyle: 'italic',
              }}>
                {loadingLogin ? 'Autenticando...' : 'Ingresar'}
              </button>
            </form>
          </div>
          <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.13)', fontSize: '11px', marginTop: '24px', letterSpacing: '1px' }}>
            SOLO SUPER ADMINS AUTORIZADOS
          </p>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // MAIN APP
  // ══════════════════════════════════════════════════════════════════════════════
  return (
    <div style={{
      minHeight: '100dvh',
      background: '#060200',
      fontFamily: "'Inter', -apple-system, sans-serif",
      color: '#fff',
      display: 'flex', flexDirection: 'column',
      maxWidth: '480px', margin: '0 auto',
    }}>
      <div style={{
        position: 'fixed', top: '-120px', left: '50%', transform: 'translateX(-50%)',
        width: '320px', height: '320px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,107,53,0.05) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 0,
      }} />

      {/* ─── HEADER ─── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: 'rgba(15,4,0,0.9)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderBottom: '1px solid rgba(255,107,53,0.12)',
        padding: '0 20px',
        height: '62px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '9px',
            background: 'linear-gradient(135deg, #ff6b35, #c94000)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff',
            boxShadow: '0 0 12px rgba(255,107,53,0.3)',
          }}>
            <Ico.Bolt />
          </div>
          <div>
            <div style={{
              fontSize: '7px', letterSpacing: '4px',
              color: 'rgba(255,107,53,0.5)', fontWeight: 800,
              textTransform: 'uppercase', lineHeight: 1,
              fontFamily: "'Tomorrow', monospace",
            }}>CONNEXO</div>
            <div style={{
              fontSize: '12px', fontWeight: 900, lineHeight: 1.1,
              fontFamily: "'Tomorrow', monospace",
              fontStyle: 'italic', letterSpacing: '-0.2px',
            }}>Control Center</div>
          </div>
          {!isSuper && (
            <span style={{
              marginLeft: '2px', padding: '3px 8px', borderRadius: '6px',
              background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)',
              color: '#60a5fa', fontSize: '8px', fontWeight: 800, letterSpacing: '1.2px',
              fontFamily: "'Tomorrow', monospace", textTransform: 'uppercase',
            }}>
              Operador
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <CountrySwitcher />
          <button onClick={handleLogout} style={{
            width: '34px', height: '34px', borderRadius: '9px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,107,53,0.12)',
            color: 'rgba(255,255,255,0.4)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Ico.LogOut />
          </button>
        </div>
      </header>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: '72px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 100, padding: '11px 22px', borderRadius: '100px',
          background: toast.ok
            ? 'linear-gradient(135deg, #16a34a, #15803d)'
            : 'linear-gradient(135deg, #dc2626, #b91c1c)',
          color: '#fff', fontSize: '13px', fontWeight: 700,
          boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
          whiteSpace: 'nowrap', letterSpacing: '0.3px',
        }}>{toast.msg}</div>
      )}

      {/* ─── SCROLLABLE BODY ─── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px 110px', position: 'relative', zIndex: 1 }}>

        {/* Country banner */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: '20px',
        }}>
          <div>
            <div style={{
              fontSize: '11px', fontWeight: 800, letterSpacing: '2px',
              color: 'rgba(255,107,53,0.5)', textTransform: 'uppercase', marginBottom: '4px',
            }}>Región activa</div>
            <div style={{
              fontSize: '20px', fontWeight: 900,
              fontFamily: "'Tomorrow', monospace",
              fontStyle: 'italic',
            }}>
              {countryLabel}
            </div>
          </div>
          <div style={{
            padding: '6px 14px', borderRadius: '20px',
            background: 'rgba(255,107,53,0.1)',
            border: '1px solid rgba(255,107,53,0.2)',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e' }} />
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.6)', letterSpacing: '1px' }}>
              TIEMPO REAL
            </span>
          </div>
        </div>

        {/* ──── DASHBOARD ──── */}
        {activeTab === 'dashboard' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {/* Total */}
              <div style={{
                gridColumn: 'span 2', ...sectionCard, padding: '22px',
                background: 'rgba(255,107,53,0.06)',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '2px', color: 'rgba(255,107,53,0.55)', textTransform: 'uppercase', marginBottom: '6px' }}>
                      Total Clientes · {country}
                    </div>
                    <div style={{ fontSize: '48px', fontWeight: 900, color: '#ff6b35', lineHeight: 1, fontFamily: "'Tomorrow', monospace" }}>
                      {stats.total}
                    </div>
                  </div>
                  <div style={{ color: 'rgba(255,107,53,0.3)' }}>
                    <Ico.Users />
                  </div>
                </div>
              </div>

              {/* ULTRA */}
              <div style={{ ...sectionCard, padding: '18px 16px', background: 'rgba(255,107,53,0.05)' }}>
                <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '2px', color: 'rgba(255,107,53,0.5)', textTransform: 'uppercase', marginBottom: '6px' }}>ULTRA</div>
                <div style={{ fontSize: '34px', fontWeight: 900, color: '#ff6b35', fontFamily: "'Tomorrow', monospace" }}>{stats.ultra}</div>
              </div>

              {/* PRO */}
              <div style={{ ...sectionCard, padding: '18px 16px', background: 'rgba(59,130,246,0.05)' }}>
                <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '2px', color: 'rgba(59,130,246,0.5)', textTransform: 'uppercase', marginBottom: '6px' }}>PRO</div>
                <div style={{ fontSize: '34px', fontWeight: 900, color: '#3b82f6', fontFamily: "'Tomorrow', monospace" }}>{stats.pro}</div>
              </div>

              {/* CONECTA = perfiles en prueba gratuita (encima de su plan PRO/ULTRA) */}
              <div style={{ ...sectionCard, padding: '18px 16px', background: 'rgba(34,197,94,0.05)' }}>
                <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '2px', color: 'rgba(34,197,94,0.5)', textTransform: 'uppercase', marginBottom: '6px' }}>CONECTA · prueba</div>
                <div style={{ fontSize: '34px', fontWeight: 900, color: '#22c55e', fontFamily: "'Tomorrow', monospace" }}>{stats.trials}</div>
                {stats.expiring > 0 && (
                  <div style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(239,68,68,0.7)', marginTop: '6px', letterSpacing: '0.5px' }}>
                    {stats.expiring} vence{stats.expiring === 1 ? '' : 'n'} &lt;14d
                  </div>
                )}
              </div>

              {/* BARBERÍA */}
              <div style={{ ...sectionCard, padding: '18px 16px', background: 'rgba(168,85,247,0.05)' }}>
                <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '2px', color: 'rgba(168,85,247,0.5)', textTransform: 'uppercase', marginBottom: '6px' }}>BARBERÍA</div>
                <div style={{ fontSize: '34px', fontWeight: 900, color: '#c084fc', fontFamily: "'Tomorrow', monospace" }}>{stats.barber}</div>
              </div>

            </div>

            {/* Expire trials button — with confirmation. Solo Super Admin: es una acción masiva. */}
            {isSuper && (
            <button
              onClick={async () => {
                const expired = profiles.filter(p => {
                  const s = p.subscription;
                  if (!s || s.account_status !== 'trial' || !s.trial_ends_at) return false;
                  return new Date(s.trial_ends_at) < new Date();
                });
                if (expired.length === 0) {
                  showToast('No hay trials vencidos en este momento', true);
                  return;
                }
                const names = expired.map(p => p.displayName || p.username).join(', ');
                const ok = window.confirm(
                  `¿Expirar y DESACTIVAR ${expired.length} perfil(es)?\n\n${names}\n\nEsta acción desactivará sus perfiles públicos.`
                );
                if (!ok) return;
                const { data, error } = await supabase.rpc('expire_trials');
                if (error) showToast('Error: ' + error.message, false);
                else { showToast(`${data ?? 0} trial(s) expirado(s) y desactivado(s)`, true); fetchProfiles(); }
              }}
              style={{
                width: '100%', padding: '13px', borderRadius: '13px',
                background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)',
                color: 'rgba(245,158,11,0.65)', fontWeight: 700, fontSize: '12px',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                letterSpacing: '0.5px', fontFamily: "'Tomorrow', monospace",
              }}
            >
              <Ico.Refresh /> Verificar y expirar trials vencidos
            </button>
            )}

            {/* Recent clients */}
            <div style={{ ...sectionCard, overflow: 'hidden' }}>
              <div style={{
                padding: '16px 18px',
                borderBottom: '1px solid rgba(255,107,53,0.08)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' }}>
                  Recientes · {countryLabel}
                </span>
                <button onClick={fetchProfiles} style={{
                  background: 'transparent', border: 'none',
                  color: 'rgba(255,107,53,0.6)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '5px',
                  fontSize: '12px', fontWeight: 700,
                }}>
                  <Ico.Refresh /> Actualizar
                </button>
              </div>

              {loadingData ? (
                <div style={{ padding: '30px', textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: '13px' }}>Cargando...</div>
              ) : profiles.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: '13px' }}>
                  Sin clientes en {countryLabel}
                </div>
              ) : profiles.slice(0, 6).map((p, i) => {
                const plan = getPlan(p.plan);
                const subStatus = getSubStatus(p.subscription);
                return (
                  <div key={p.id} style={{
                    padding: '14px 18px',
                    display: 'flex', alignItems: 'center', gap: '12px',
                    borderBottom: i < Math.min(profiles.length, 6) - 1 ? '1px solid rgba(255,107,53,0.05)' : 'none',
                  }}>
                    <div style={{
                      width: '38px', height: '38px', borderRadius: '11px', flexShrink: 0,
                      background: plan.bg, border: `1px solid ${plan.border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '14px', fontWeight: 900, color: plan.color,
                      fontFamily: "'Tomorrow', monospace",
                    }}>
                      {(p.displayName || p.username || '?')[0].toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.displayName || p.username}
                      </div>
                      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.email}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end', flexShrink: 0 }}>
                      <div style={{
                        padding: '3px 9px', borderRadius: '20px',
                        background: plan.bg, color: plan.color,
                        fontSize: '9px', fontWeight: 800, letterSpacing: '1.5px',
                        fontFamily: "'Tomorrow', monospace",
                      }}>{plan.label}</div>
                      {subStatus.label && (
                        <div style={{
                          padding: '2px 8px', borderRadius: '20px',
                          background: subStatus.bg, color: subStatus.color,
                          fontSize: '8px', fontWeight: 800, letterSpacing: '0.8px',
                        }}>{subStatus.label}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ──── CLIENTES ──── */}
        {activeTab === 'clients' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>
                {filtered.length} cliente{filtered.length !== 1 ? 's' : ''} · {countryLabel}
              </div>
              <button onClick={fetchProfiles} style={{
                background: 'transparent', border: 'none',
                color: 'rgba(255,107,53,0.6)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '5px',
                fontSize: '12px', fontWeight: 700,
              }}>
                <Ico.Refresh /> Actualizar
              </button>
            </div>

            {/* Search */}
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,107,53,0.4)', pointerEvents: 'none' }}>
                <Ico.Search />
              </div>
              <input
                type="text" value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar cliente..."
                style={{ ...inputStyle, paddingLeft: '42px' }}
              />
            </div>

            {/* Filtros por plantilla */}
            <div>
              <div style={{
                fontSize: '10px', fontWeight: 800, letterSpacing: '2px',
                color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase',
                marginBottom: '10px', fontFamily: "'Tomorrow', monospace",
              }}>
                Filtrar por plantilla
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '9px' }}>
                {(() => {
                  const chips = [
                    { val: 'all', label: 'Todos', count: profiles.length },
                    ...TEMPLATES.map(t => ({ val: t.val, label: t.label, count: themeCounts[t.val] || 0 })),
                  ];
                  return chips.map(chip => {
                    const active = themeFilter === chip.val;
                    const c = THEME_COLORS[chip.val] || '#ff6b35';
                    return (
                      <button
                        key={chip.val}
                        onClick={() => setThemeFilter(chip.val)}
                        onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = `${c}66`; e.currentTarget.style.color = 'rgba(255,255,255,0.85)'; } }}
                        onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; } }}
                        style={{
                          padding: '9px 15px 9px 12px', borderRadius: '13px',
                          background: active
                            ? `linear-gradient(135deg, ${c}2e 0%, ${c}14 100%)`
                            : 'rgba(255,255,255,0.025)',
                          border: `1px solid ${active ? `${c}88` : 'rgba(255,255,255,0.09)'}`,
                          color: active ? '#fff' : 'rgba(255,255,255,0.6)',
                          fontSize: '12.5px', fontWeight: 700, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: '9px',
                          fontFamily: "'Inter', -apple-system, sans-serif",
                          transition: 'all 0.18s ease', whiteSpace: 'nowrap',
                          boxShadow: active ? `0 4px 18px -6px ${c}80, inset 0 1px 0 ${c}22` : 'none',
                        }}
                      >
                        {/* Punto indicador de color de la categoría */}
                        <span style={{
                          width: '8px', height: '8px', borderRadius: '999px',
                          background: c, flexShrink: 0,
                          boxShadow: active ? `0 0 8px ${c}` : 'none',
                          opacity: active ? 1 : 0.55,
                        }} />
                        {chip.label}
                        <span style={{
                          fontSize: '11px', fontWeight: 800, minWidth: '20px', textAlign: 'center',
                          padding: '2px 7px', borderRadius: '999px',
                          fontFamily: "'Tomorrow', monospace",
                          background: active ? `${c}33` : 'rgba(255,255,255,0.05)',
                          color: active ? '#fff' : 'rgba(255,255,255,0.4)',
                          border: active ? `1px solid ${c}44` : '1px solid transparent',
                        }}>{chip.count}</span>
                      </button>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Contador de resultados cuando hay filtro/búsqueda activos */}
            {(themeFilter !== 'all' || search.trim() !== '') && (
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', fontWeight: 600, marginTop: '-4px' }}>
                {filtered.length} {filtered.length === 1 ? 'cliente' : 'clientes'}
                {themeFilter !== 'all' && ` · ${TEMPLATES.find(t => t.val === themeFilter)?.label || themeFilter}`}
              </div>
            )}

            {/* Client cards */}
            {loadingData ? (
              <div style={{ padding: '50px', textAlign: 'center', color: 'rgba(255,255,255,0.25)' }}>Cargando clientes...</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: '50px', textAlign: 'center', color: 'rgba(255,255,255,0.25)' }}>
                <div style={{ marginBottom: '8px', color: 'rgba(255,107,53,0.4)' }}><Ico.Users /></div>
                {(themeFilter !== 'all' || search.trim() !== '')
                  ? 'Sin clientes que coincidan con el filtro'
                  : `Sin clientes en ${countryLabel}`}
              </div>
            ) : filtered.map(profile => {
              const plan = getPlan(profile.plan);
              const isEditing    = editingId === profile.id;
              const isConverting = convertingId === profile.id;
              const isTrialing   = trialingId === profile.id;
              const isConfirmDelete = deletingId === profile.id;
              const isSaving     = savingId === profile.id;
              const subStatus    = getSubStatus(profile.subscription);
              const isPaid       = profile.subscription?.account_status === 'active';
              const isActive     = profile.is_active !== false;
              const canConvert   = !isPaid;
              const canTrial     = !isPaid;

              return (
                <div key={profile.id} style={{
                  ...sectionCard,
                  border: isEditing
                    ? '1px solid rgba(255,107,53,0.3)'
                    : isConverting
                      ? '1px solid rgba(34,197,94,0.3)'
                      : isTrialing
                        ? '1px solid rgba(245,158,11,0.3)'
                        : '1px solid rgba(255,107,53,0.1)',
                  padding: '18px',
                  transition: 'border-color 0.2s',
                  background: isEditing
                    ? 'rgba(255,107,53,0.04)'
                    : isConverting
                      ? 'rgba(34,197,94,0.03)'
                      : isTrialing
                        ? 'rgba(245,158,11,0.03)'
                        : 'rgba(255,255,255,0.02)',
                }}>
                  {/* Card header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '44px', height: '44px', borderRadius: '13px', flexShrink: 0,
                      background: plan.bg, border: `1px solid ${plan.border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '16px', fontWeight: 900, color: plan.color,
                      fontFamily: "'Tomorrow', monospace",
                    }}>
                      {(profile.displayName || profile.username || '?')[0].toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '15px', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {profile.displayName || profile.username}
                      </div>
                      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {profile.email}
                      </div>
                      {/* Status badges */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '5px', flexWrap: 'wrap' }}>
                        {!isActive && (
                          <span style={{
                            padding: '2px 8px', borderRadius: '20px',
                            background: 'rgba(107,114,128,0.15)', color: '#9ca3af',
                            fontSize: '9px', fontWeight: 800, letterSpacing: '0.8px',
                          }}>INACTIVO</span>
                        )}
                        {subStatus.label && (
                          <span style={{
                            padding: '2px 8px', borderRadius: '20px',
                            background: subStatus.bg, color: subStatus.color,
                            fontSize: '9px', fontWeight: 800, letterSpacing: '0.8px',
                          }}>{subStatus.label}</span>
                        )}
                        {profile.subscription?.source_campaign && (
                          <span style={{
                            display: 'flex', alignItems: 'center', gap: '4px',
                            fontSize: '9px', color: 'rgba(255,107,53,0.4)', fontWeight: 600,
                          }}>
                            <Ico.Tag /> {profile.subscription.source_campaign}
                          </span>
                        )}
                      </div>
                    </div>
                    {!isEditing && !isConverting && !isTrialing && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end', flexShrink: 0 }}>
                        <span style={{
                          padding: '3px 9px', borderRadius: '20px',
                          background: plan.bg, color: plan.color,
                          fontSize: '9px', fontWeight: 800, letterSpacing: '1.5px',
                          fontFamily: "'Tomorrow', monospace",
                        }}>{plan.label}</span>
                        {profile.theme === 'barber' && (
                          <span style={{
                            padding: '3px 9px', borderRadius: '20px',
                            background: 'rgba(168,85,247,0.12)', color: '#c084fc',
                            fontSize: '9px', fontWeight: 800, letterSpacing: '1px',
                            display: 'flex', alignItems: 'center', gap: '4px',
                          }}>
                            <Ico.Scissors /> BARBER
                          </span>
                        )}
                        {profile.theme === 'ecom' && (
                          <span style={{
                            padding: '3px 9px', borderRadius: '20px',
                            background: 'rgba(0,229,160,0.12)', color: '#00e5a0',
                            fontSize: '9px', fontWeight: 800, letterSpacing: '1px',
                          }}>
                            E-COM
                          </span>
                        )}
                        {profile.theme === 'gastro' && (
                          <span style={{
                            padding: '3px 9px', borderRadius: '20px',
                            background: 'rgba(239,68,68,0.12)', color: '#fca5a5',
                            fontSize: '9px', fontWeight: 800, letterSpacing: '1px',
                          }}>
                            GASTRO
                          </span>
                        )}
                        {profile.theme === 'petcare' && (
                          <span style={{
                            padding: '3px 9px', borderRadius: '20px',
                            background: 'rgba(20,184,166,0.14)', color: '#5eead4',
                            fontSize: '9px', fontWeight: 800, letterSpacing: '1px',
                          }}>
                            PETCARE
                          </span>
                        )}
                        {profile.theme === 'medical' && (
                          <span style={{
                            padding: '3px 9px', borderRadius: '20px',
                            background: 'rgba(37,99,235,0.14)', color: '#93c5fd',
                            fontSize: '9px', fontWeight: 800, letterSpacing: '1px',
                          }}>
                            MÉDICO
                          </span>
                        )}
                        {profile.theme === 'stage' && (
                          <span style={{
                            padding: '3px 9px', borderRadius: '20px',
                            background: 'rgba(34,211,238,0.12)', color: '#67e8f9',
                            fontSize: '9px', fontWeight: 800, letterSpacing: '1px',
                          }}>
                            STAGE
                          </span>
                        )}
                        {profile.theme === 'realty' && (
                          <span style={{
                            padding: '3px 9px', borderRadius: '20px',
                            background: 'rgba(255,102,0,0.14)', color: '#ffa35d',
                            fontSize: '9px', fontWeight: 800, letterSpacing: '1px',
                          }}>
                            INMOBILIARIA
                          </span>
                        )}
                        {profile.theme === 'sublima' && (
                          <span style={{
                            padding: '3px 9px', borderRadius: '20px',
                            background: 'rgba(163,230,53,0.14)', color: '#d9f99d',
                            fontSize: '9px', fontWeight: 800, letterSpacing: '1px',
                          }}>
                            SUBLIMA
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ── Edit mode ── */}
                  {isEditing && (
                    <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <div>
                        <label style={labelStyle}>Plan</label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '8px' }}>
                          {SELECTABLE_PLANS.map(p => (
                            <button key={p.val} type="button"
                              onClick={() => setEditVals(prev => ({ ...prev, plan: p.val }))}
                              style={{
                                padding: '12px 6px', borderRadius: '11px', cursor: 'pointer',
                                border: `2px solid ${editVals.plan === p.val ? p.color : 'rgba(255,107,53,0.1)'}`,
                                background: editVals.plan === p.val ? p.bg : 'rgba(255,255,255,0.02)',
                                color: editVals.plan === p.val ? p.color : 'rgba(255,255,255,0.35)',
                                fontSize: '11px', fontWeight: 800, letterSpacing: '0.5px',
                                transition: 'all 0.15s',
                                fontFamily: "'Tomorrow', monospace",
                              }}
                            >{p.label}</button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label style={labelStyle}>Plantilla</label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          {TEMPLATES.map(t => (
                            <button key={t.val} type="button"
                              onClick={() => setEditVals(prev => ({ ...prev, theme: t.val }))}
                              style={{
                                padding: '14px 10px', borderRadius: '11px', cursor: 'pointer',
                                border: `2px solid ${editVals.theme === t.val ? '#ff6b35' : 'rgba(255,107,53,0.1)'}`,
                                background: editVals.theme === t.val ? 'rgba(255,107,53,0.08)' : 'rgba(255,255,255,0.02)',
                                color: editVals.theme === t.val ? '#ff6b35' : 'rgba(255,255,255,0.35)',
                                transition: 'all 0.15s', textAlign: 'center',
                                fontFamily: "'Tomorrow', monospace",
                              }}
                            >
                              <div style={{ marginBottom: '4px', display: 'flex', justifyContent: 'center', color: 'inherit' }}>
                                {t.val === 'barber' ? <Ico.Scissors /> : <Ico.Bolt />}
                              </div>
                              <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.5px' }}>{t.label}</div>
                              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', marginTop: '3px' }}>{t.desc}</div>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={() => saveEdit(profile.id)} disabled={isSaving} style={{
                          flex: 1, padding: '14px', borderRadius: '11px',
                          background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)',
                          color: '#4ade80', fontWeight: 800, fontSize: '14px', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                          fontFamily: "'Tomorrow', monospace",
                        }}>
                          <Ico.Check />
                          {isSaving ? 'Guardando...' : 'Guardar'}
                        </button>
                        <button onClick={() => setEditingId(null)} style={{
                          padding: '14px 16px', borderRadius: '11px',
                          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                          color: 'rgba(255,255,255,0.35)', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Ico.X />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── Conversion panel ── */}
                  {isConverting && (
                    <div style={{ marginTop: '16px', borderTop: '1px solid rgba(34,197,94,0.1)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '2px', color: 'rgba(34,197,94,0.6)', textTransform: 'uppercase' }}>
                        Convertir a Cliente de Pago
                      </div>

                      {/* Source campaign (read-only, never editable) */}
                      {profile.subscription?.source_campaign && (
                        <div style={{
                          padding: '10px 14px', borderRadius: '10px',
                          background: 'rgba(255,107,53,0.05)', border: '1px solid rgba(255,107,53,0.12)',
                          display: 'flex', alignItems: 'center', gap: '8px',
                        }}>
                          <Ico.Tag />
                          <div>
                            <div style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '1.5px', color: 'rgba(255,107,53,0.45)', textTransform: 'uppercase', marginBottom: '2px' }}>
                              Campaña de origen · Preservada
                            </div>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#ff6b35' }}>
                              {profile.subscription.source_campaign}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Plan selector */}
                      <div>
                        <label style={{ ...labelStyle, color: 'rgba(34,197,94,0.5)' }}>Nuevo Plan</label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          {(['mensual_pago', 'anual_pago'] as const).map(pt => (
                            <button key={pt} type="button"
                              onClick={() => setConvertPlanType(pt)}
                              style={{
                                padding: '16px 10px', borderRadius: '11px', cursor: 'pointer',
                                border: `2px solid ${convertPlanType === pt ? '#22c55e' : 'rgba(34,197,94,0.1)'}`,
                                background: convertPlanType === pt ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.02)',
                                color: convertPlanType === pt ? '#4ade80' : 'rgba(255,255,255,0.35)',
                                transition: 'all 0.15s', textAlign: 'center',
                                fontFamily: "'Tomorrow', monospace",
                              }}
                            >
                              <div style={{ fontSize: '13px', fontWeight: 900, letterSpacing: '0.5px' }}>
                                {pt === 'mensual_pago' ? 'MENSUAL' : 'ANUAL'}
                              </div>
                              <div style={{ fontSize: '10px', opacity: 0.5, marginTop: '4px' }}>
                                {pt === 'mensual_pago' ? 'Facturación mensual' : 'Facturación anual'}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Confirm / Cancel */}
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={() => handleConvert(profile.id)} disabled={processingConvert} style={{
                          flex: 1, padding: '15px', borderRadius: '11px',
                          background: processingConvert ? 'rgba(34,197,94,0.12)' : 'rgba(34,197,94,0.15)',
                          border: '1px solid rgba(34,197,94,0.3)',
                          color: '#4ade80', fontWeight: 900, fontSize: '14px',
                          cursor: processingConvert ? 'not-allowed' : 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                          fontFamily: "'Tomorrow', monospace",
                        }}>
                          <Ico.Check />
                          {processingConvert ? 'Procesando...' : 'Confirmar Conversión'}
                        </button>
                        <button onClick={() => setConvertingId(null)} style={{
                          padding: '15px 16px', borderRadius: '11px',
                          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                          color: 'rgba(255,255,255,0.35)', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Ico.X />
                        </button>
                      </div>

                      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.18)', textAlign: 'center' }}>
                        Datos de negocio del cliente no se modifican
                      </div>
                    </div>
                  )}

                  {/* ── Trial configuration panel ── */}
                  {isTrialing && (
                    <div style={{ marginTop: '16px', borderTop: '1px solid rgba(245,158,11,0.12)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '2px', color: 'rgba(245,158,11,0.65)', textTransform: 'uppercase' }}>
                        Configurar Período de Trial
                      </div>

                      {/* Days */}
                      <div>
                        <label style={{ ...labelStyle, color: 'rgba(245,158,11,0.5)' }}>Días de trial</label>
                        <input
                          type="number"
                          value={trialPanelVals.days}
                          onChange={e => setTrialPanelVals(prev => ({ ...prev, days: Math.max(1, parseInt(e.target.value) || 180) }))}
                          min={1} max={730}
                          style={{ ...inputStyle, borderColor: 'rgba(245,158,11,0.3)' }}
                        />
                        <div style={{ marginTop: '6px', fontSize: '11px', color: 'rgba(245,158,11,0.45)', fontWeight: 600 }}>
                          Vence el {new Date(Date.now() + trialPanelVals.days * 86400000).toLocaleDateString('es-EC', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </div>
                      </div>

                      {/* Campaign */}
                      <div>
                        <label style={{ ...labelStyle, color: 'rgba(245,158,11,0.4)' }}>
                          Campaña <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', letterSpacing: 0, textTransform: 'none', fontWeight: 400 }}>(opcional)</span>
                        </label>
                        <input
                          type="text"
                          value={trialPanelVals.campaign}
                          onChange={e => setTrialPanelVals(prev => ({ ...prev, campaign: e.target.value }))}
                          placeholder={profile.subscription?.source_campaign || 'ej: campana-emprendedores-6m'}
                          style={{ ...inputStyle, borderColor: 'rgba(245,158,11,0.2)' }}
                        />
                        {profile.subscription?.source_campaign && !trialPanelVals.campaign && (
                          <div style={{ marginTop: '6px', fontSize: '11px', color: 'rgba(245,158,11,0.35)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <Ico.Tag /> Se mantiene: {profile.subscription.source_campaign}
                          </div>
                        )}
                      </div>

                      {/* Confirm / Cancel */}
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={() => handleSetTrial(profile.id)} disabled={processingTrial} style={{
                          flex: 1, padding: '15px', borderRadius: '11px',
                          background: processingTrial ? 'rgba(245,158,11,0.1)' : 'rgba(245,158,11,0.14)',
                          border: '1px solid rgba(245,158,11,0.3)',
                          color: '#fbbf24', fontWeight: 900, fontSize: '14px',
                          cursor: processingTrial ? 'not-allowed' : 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                          fontFamily: "'Tomorrow', monospace",
                        }}>
                          <Ico.Check />
                          {processingTrial ? 'Guardando...' : 'Aplicar Trial'}
                        </button>
                        <button onClick={() => setTrialingId(null)} style={{
                          padding: '15px 16px', borderRadius: '11px',
                          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                          color: 'rgba(255,255,255,0.35)', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Ico.X />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── Confirmar eliminación ── (solo Super Admin) */}
                  {isSuper && isConfirmDelete && !isEditing && !isConverting && !isTrialing && (
                    <div style={{
                      marginTop: '14px', padding: '18px',
                      background: 'rgba(239,68,68,0.06)',
                      border: '1px solid rgba(239,68,68,0.25)',
                      borderRadius: '14px',
                    }}>
                      <div style={{ marginBottom: '14px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '2px', color: '#ef4444', textTransform: 'uppercase', marginBottom: '6px', fontFamily: "'Tomorrow', monospace" }}>
                          ⚠ Eliminar cliente
                        </div>
                        <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>
                          Se borrarán <strong style={{ color: '#fff' }}>todos los datos</strong> de <strong style={{ color: '#fff' }}>{profile.displayName || profile.username}</strong> (perfil, pedidos, clientes, suscripción y cuenta). Esta acción es irreversible.
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={() => handleDeleteUser(profile.id)} disabled={isDeleting} style={{
                          flex: 1, padding: '13px', borderRadius: '11px',
                          background: isDeleting ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.14)',
                          border: '1px solid rgba(239,68,68,0.35)',
                          color: '#f87171', fontWeight: 900, fontSize: '13px',
                          cursor: isDeleting ? 'not-allowed' : 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                          fontFamily: "'Tomorrow', monospace",
                        }}>
                          <Ico.Trash />
                          {isDeleting ? 'Eliminando...' : 'Sí, eliminar'}
                        </button>
                        <button onClick={() => setDeletingId(null)} disabled={isDeleting} style={{
                          padding: '13px 16px', borderRadius: '11px',
                          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                          color: 'rgba(255,255,255,0.35)', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Ico.X />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── View mode actions ── */}
                  {!isEditing && !isConverting && !isTrialing && !isConfirmDelete && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '14px' }}>
                      {/* Trial — clientes sin suscripción de pago */}
                      {canTrial && (
                        <button
                          onClick={() => {
                            setTrialingId(profile.id);
                            setTrialPanelVals({ campaign: profile.subscription?.source_campaign || '', days: 180 });
                            setEditingId(null); setConvertingId(null);
                          }}
                          style={{
                            flex: 1, padding: '12px', borderRadius: '11px',
                            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
                            color: '#fbbf24', fontWeight: 800, fontSize: '12px', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                            fontFamily: "'Tomorrow', monospace",
                          }}
                        >
                          Trial
                        </button>
                      )}
                      {/* Convertir — solo para trial o sin suscripción */}
                      {canConvert && (
                        <button
                          onClick={() => { setConvertingId(profile.id); setConvertPlanType('mensual_pago'); setEditingId(null); setTrialingId(null); }}
                          style={{
                            flex: 1, padding: '12px', borderRadius: '11px',
                            background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
                            color: '#4ade80', fontWeight: 800, fontSize: '12px', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                            fontFamily: "'Tomorrow', monospace",
                          }}
                        >
                          <Ico.Star /> Convertir
                        </button>
                      )}
                      <button
                        onClick={() => { setEditingId(profile.id); setEditVals({ plan: profile.plan || 'free', theme: profile.theme || 'default' }); setConvertingId(null); setTrialingId(null); }}
                        style={{
                          flex: isPaid ? 2 : 1, padding: '12px', borderRadius: '11px',
                          background: 'rgba(255,107,53,0.08)', border: '1px solid rgba(255,107,53,0.2)',
                          color: '#ff6b35', fontWeight: 800, fontSize: '13px', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
                          fontFamily: "'Tomorrow', monospace",
                        }}
                      >
                        <Ico.Edit /> Editar
                      </button>
                      {/* Activar / Desactivar */}
                      <button
                        onClick={() => handleToggleActive(profile.id, isActive)}
                        title={isActive ? 'Desactivar perfil' : 'Activar perfil'}
                        style={{
                          padding: '12px 14px', borderRadius: '11px',
                          background: isActive ? 'rgba(107,114,128,0.08)' : 'rgba(34,197,94,0.08)',
                          border: isActive ? '1px solid rgba(107,114,128,0.2)' : '1px solid rgba(34,197,94,0.25)',
                          color: isActive ? '#6b7280' : '#4ade80',
                          cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <Ico.Power />
                      </button>

                      {/* ⚠️ Cada segmento se escapa por separado. Los nombres de
                          usuario traen espacios, tildes y hasta barras, y sin
                          escapar un '?' o un '#' cortaría la dirección por la
                          mitad. La barra se conserva como separador: la ruta
                          comodín de App.tsx la sabe resolver. */}
                      <a
                        href={`${window.location.origin}/${String(profile.username || '')
                          .split('/')
                          .map(encodeURIComponent)
                          .join('/')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={isActive
                          ? 'Ver perfil público'
                          : 'Ver perfil público — OJO: está DESACTIVADO, el visitante ve la pantalla de suspendido'}
                        style={{
                        padding: '12px 14px', borderRadius: '11px',
                        // Ámbar si el perfil está desactivado: al pulsarlo no se
                        // verá el perfil sino la pantalla de suspendido, y sin
                        // esta pista parece que el botón está roto.
                        background: isActive ? 'rgba(255,255,255,0.04)' : 'rgba(245,158,11,0.08)',
                        border: `1px solid ${isActive ? 'rgba(255,255,255,0.08)' : 'rgba(245,158,11,0.25)'}`,
                        color: isActive ? 'rgba(255,255,255,0.4)' : '#f59e0b', textDecoration: 'none',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Ico.Globe />
                      </a>
                      {/* Eliminar — solo Super Admin */}
                      {isSuper && (
                      <button
                        onClick={() => { setDeletingId(profile.id); setEditingId(null); setConvertingId(null); setTrialingId(null); }}
                        title="Eliminar cliente"
                        style={{
                          padding: '12px 14px', borderRadius: '11px',
                          background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)',
                          color: '#ef4444', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <Ico.Trash />
                      </button>
                      )}
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        )}

        {/* ──── CREAR CLIENTE ──── */}
        {activeTab === 'create' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Country notice */}
            <div style={{
              ...sectionCard,
              padding: '14px 18px',
              background: 'rgba(255,107,53,0.06)',
              display: 'flex', alignItems: 'center', gap: '10px',
            }}>
              <div style={{ color: 'rgba(255,107,53,0.6)' }}><Ico.Globe /></div>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '2px', color: 'rgba(255,107,53,0.5)', textTransform: 'uppercase' }}>Creando para</div>
                <div style={{ fontSize: '14px', fontWeight: 800, fontFamily: "'Tomorrow', monospace", fontStyle: 'italic' }}>{countryLabel} · {country}</div>
              </div>
            </div>

            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Access Data */}
              <div style={{ ...sectionCard, padding: '20px' }}>
                <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '2px', color: 'rgba(255,107,53,0.5)', textTransform: 'uppercase', marginBottom: '18px', fontFamily: "'Tomorrow', monospace" }}>
                  Datos de Acceso
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {[
                    { key: 'email',       label: 'Email *',               type: 'email', placeholder: 'cliente@email.com' },
                    { key: 'password',    label: 'Contraseña Temporal *', type: 'text',  placeholder: 'Mín. 6 caracteres' },
                    { key: 'username',    label: 'Username / Slug *',     type: 'text',  placeholder: 'ej: juanperez' },
                    { key: 'displayName', label: 'Nombre Completo',       type: 'text',  placeholder: 'ej: Juan Pérez' },
                  ].map(f => (
                    <div key={f.key}>
                      <label style={labelStyle}>{f.label}</label>
                      <input
                        type={f.type}
                        value={(form as any)[f.key]}
                        onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                        placeholder={f.placeholder}
                        style={inputStyle}
                      />
                      {f.key === 'username' && form.username && (
                        <div style={{ marginTop: '6px', fontSize: '11px', color: 'rgba(255,107,53,0.5)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <Ico.Link /> {window.location.host}/{form.username.toLowerCase().replace(/\s+/g, '')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Plan */}
              <div style={{ ...sectionCard, padding: '20px' }}>
                <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '2px', color: 'rgba(255,107,53,0.5)', textTransform: 'uppercase', marginBottom: '16px', fontFamily: "'Tomorrow', monospace" }}>
                  Plan
                </div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginBottom: '14px', lineHeight: 1.5 }}>
                  El plan define los beneficios. La prueba gratuita (CONECTA) se
                  elige abajo, en Suscripción, y corre sobre este plan.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '10px' }}>
                  {SELECTABLE_PLANS.map(p => (
                    <button key={p.val} type="button"
                      onClick={() => setForm(prev => ({ ...prev, plan: p.val }))}
                      style={{
                        padding: '16px 8px', borderRadius: '13px', cursor: 'pointer',
                        border: `2px solid ${form.plan === p.val ? p.color : 'rgba(255,107,53,0.1)'}`,
                        background: form.plan === p.val ? p.bg : 'rgba(255,255,255,0.02)',
                        color: form.plan === p.val ? p.color : 'rgba(255,255,255,0.35)',
                        transition: 'all 0.15s', textAlign: 'center',
                        fontFamily: "'Tomorrow', monospace",
                      }}
                    >
                      <div style={{ fontSize: '11px', fontWeight: 900, letterSpacing: '1px' }}>{p.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Template */}
              <div style={{ ...sectionCard, padding: '20px' }}>
                <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '2px', color: 'rgba(255,107,53,0.5)', textTransform: 'uppercase', marginBottom: '16px', fontFamily: "'Tomorrow', monospace" }}>
                  Plantilla de Perfil
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {TEMPLATES.map(t => (
                    <button key={t.val} type="button"
                      onClick={() => setForm(prev => ({ ...prev, theme: t.val }))}
                      style={{
                        padding: '18px 12px', borderRadius: '13px', cursor: 'pointer',
                        border: `2px solid ${form.theme === t.val ? '#ff6b35' : 'rgba(255,107,53,0.1)'}`,
                        background: form.theme === t.val ? 'rgba(255,107,53,0.08)' : 'rgba(255,255,255,0.02)',
                        color: form.theme === t.val ? '#ff6b35' : 'rgba(255,255,255,0.35)',
                        transition: 'all 0.15s', textAlign: 'center',
                        fontFamily: "'Tomorrow', monospace",
                      }}
                    >
                      <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'center', color: 'inherit' }}>
                        {t.val === 'barber' ? <Ico.Scissors /> : <Ico.Bolt />}
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.5px' }}>{t.label}</div>
                      <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', marginTop: '4px' }}>{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Subscription type */}
              <div style={{ ...sectionCard, padding: '20px' }}>
                <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '2px', color: 'rgba(255,107,53,0.5)', textTransform: 'uppercase', marginBottom: '16px', fontFamily: "'Tomorrow', monospace" }}>
                  Suscripción
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: formSubType === 'trial' ? '16px' : '0' }}>
                  {([
                    { val: 'none',    label: 'Sin suscripción', color: 'rgba(107,114,128,0.8)',  bg: 'rgba(107,114,128,0.12)' },
                    { val: 'trial',   label: 'CONECTA (prueba)', color: 'rgba(245,158,11,0.9)',  bg: 'rgba(245,158,11,0.1)'  },
                    { val: 'mensual', label: 'Mensual',         color: 'rgba(34,197,94,0.9)',    bg: 'rgba(34,197,94,0.1)'   },
                    { val: 'anual',   label: 'Anual',           color: 'rgba(99,102,241,0.9)',   bg: 'rgba(99,102,241,0.1)'  },
                  ] as const).map(opt => (
                    <button key={opt.val} type="button"
                      onClick={() => setFormSubType(opt.val)}
                      style={{
                        padding: '14px 8px', borderRadius: '13px', cursor: 'pointer',
                        border: `2px solid ${formSubType === opt.val ? opt.color : 'rgba(255,107,53,0.1)'}`,
                        background: formSubType === opt.val ? opt.bg : 'rgba(255,255,255,0.02)',
                        color: formSubType === opt.val ? opt.color : 'rgba(255,255,255,0.35)',
                        transition: 'all 0.15s', textAlign: 'center',
                        fontFamily: "'Tomorrow', monospace", fontWeight: 900, fontSize: '12px', letterSpacing: '0.5px',
                      }}
                    >{opt.label}</button>
                  ))}
                </div>

                {/* Trial fields — only when trial is selected */}
                {formSubType === 'trial' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <label style={{ ...labelStyle, color: 'rgba(245,158,11,0.5)' }}>Días de prueba</label>
                      <input
                        type="number"
                        value={formTrialDays}
                        onChange={e => setFormTrialDays(Math.max(1, parseInt(e.target.value) || 30))}
                        min={1} max={730}
                        style={{ ...inputStyle, borderColor: 'rgba(245,158,11,0.3)' }}
                      />
                      <div style={{ marginTop: '6px', fontSize: '11px', color: 'rgba(245,158,11,0.45)', fontWeight: 600 }}>
                        Vence el {new Date(Date.now() + formTrialDays * 86400000).toLocaleDateString('es-EC', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </div>
                    </div>
                    <div>
                      <label style={{ ...labelStyle, color: 'rgba(245,158,11,0.35)' }}>
                        Campaña <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', letterSpacing: 0, textTransform: 'none', fontWeight: 400 }}>(opcional)</span>
                      </label>
                      <input
                        type="text"
                        value={formCampaign}
                        onChange={e => setFormCampaign(e.target.value)}
                        placeholder="ej: campana-emprendedores-6m"
                        style={{ ...inputStyle, borderColor: formCampaign ? 'rgba(245,158,11,0.3)' : 'rgba(255,107,53,0.12)' }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Submit */}
              <button type="submit" disabled={creating} style={{
                padding: '17px', borderRadius: '14px',
                background: creating
                  ? 'rgba(255,107,53,0.35)'
                  : 'linear-gradient(135deg, #ff6b35 0%, #c94000 100%)',
                border: 'none', color: '#fff', fontSize: '16px', fontWeight: 900,
                cursor: creating ? 'not-allowed' : 'pointer',
                boxShadow: creating ? 'none' : '0 4px 24px rgba(255,107,53,0.25)',
                letterSpacing: '1px',
                fontFamily: "'Tomorrow', monospace",
                fontStyle: 'italic',
              }}>
                {creating ? 'Creando...' : 'Crear Cliente'}
              </button>

              {createMsg && (
                <div style={{
                  padding: '18px', borderRadius: '13px',
                  background: createMsg.ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                  border: `1px solid ${createMsg.ok ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
                  color: createMsg.ok ? '#4ade80' : '#fca5a5',
                  fontSize: '13px', whiteSpace: 'pre-line', lineHeight: 1.7, textAlign: 'center',
                }}>
                  {createMsg.text}
                </div>
              )}
            </form>
          </div>
        )}

        {/* ══════════════════════════════ SEGURIDAD / MI CUENTA ══════════════════════════════ */}
        {activeTab === 'security' && (
          <div style={{ padding: '22px 18px 40px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '3px', color: 'rgba(255,107,53,0.5)', textTransform: 'uppercase', fontFamily: "'Tomorrow', monospace" }}>
                Mi cuenta
              </div>
              <div style={{ fontSize: '20px', fontWeight: 900, fontFamily: "'Tomorrow', monospace", fontStyle: 'italic', marginTop: '4px' }}>
                Seguridad
              </div>
            </div>

            {/* Identidad */}
            <div style={{ ...sectionCard, padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '42px', height: '42px', borderRadius: '12px', flexShrink: 0,
                  background: isSuper ? 'linear-gradient(135deg, #ff6b35, #c94000)' : 'rgba(59,130,246,0.15)',
                  border: isSuper ? 'none' : '1px solid rgba(59,130,246,0.3)',
                  color: isSuper ? '#fff' : '#60a5fa',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Ico.Shield />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {currentAdmin?.email}
                  </div>
                  <div style={{
                    fontSize: '10px', fontWeight: 800, letterSpacing: '1.5px', marginTop: '3px',
                    color: isSuper ? '#ff6b35' : '#60a5fa',
                    fontFamily: "'Tomorrow', monospace", textTransform: 'uppercase',
                  }}>
                    {isSuper ? 'Super Admin' : 'Operador'}
                  </div>
                </div>
              </div>
            </div>

            {/* Cambiar contraseña */}
            <form onSubmit={handleChangeMyPassword} style={{ ...sectionCard, padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '2px', color: 'rgba(255,107,53,0.5)', textTransform: 'uppercase', fontFamily: "'Tomorrow', monospace" }}>
                Cambiar mi contraseña
              </div>

              {[
                { key: 'current', label: 'Contraseña actual *', ph: 'La que usas ahora' },
                { key: 'next',    label: 'Contraseña nueva *',  ph: 'Mín. 8 caracteres' },
                { key: 'confirm', label: 'Repetir la nueva *',  ph: 'Escríbela otra vez' },
              ].map(f => (
                <div key={f.key}>
                  <label style={labelStyle}>{f.label}</label>
                  <input
                    type="password"
                    autoComplete={f.key === 'current' ? 'current-password' : 'new-password'}
                    value={(pwdForm as any)[f.key]}
                    onChange={e => setPwdForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={f.ph}
                    style={inputStyle}
                  />
                </div>
              ))}

              <button type="submit" disabled={changingPwd} style={{
                width: '100%', padding: '15px', borderRadius: '13px', marginTop: '4px',
                background: changingPwd ? 'rgba(255,107,53,0.2)' : 'linear-gradient(135deg, #ff6b35, #c94000)',
                border: 'none', color: '#fff', fontWeight: 900, fontSize: '13px',
                cursor: changingPwd ? 'not-allowed' : 'pointer', letterSpacing: '1px',
                fontFamily: "'Tomorrow', monospace", textTransform: 'uppercase',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              }}>
                <Ico.Key /> {changingPwd ? 'Actualizando...' : 'Actualizar contraseña'}
              </button>

              {pwdMsg && (
                <div style={{
                  padding: '15px', borderRadius: '13px',
                  background: pwdMsg.ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                  border: `1px solid ${pwdMsg.ok ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
                  color: pwdMsg.ok ? '#4ade80' : '#fca5a5',
                  fontSize: '13px', whiteSpace: 'pre-line', lineHeight: 1.6, textAlign: 'center',
                }}>
                  {pwdMsg.text}
                </div>
              )}

              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', lineHeight: 1.6 }}>
                Se te pide la contraseña actual a propósito: así, si dejas la sesión abierta en un
                equipo ajeno, nadie puede quedarse con la cuenta cambiándola.
              </div>
            </form>
          </div>
        )}

        {/* ══════════════════════════════ OPERADORES ══════════════════════════════ */}
        {activeTab === 'admins' && isSuper && (
          <div style={{ padding: '22px 18px 40px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '3px', color: 'rgba(255,107,53,0.5)', textTransform: 'uppercase', fontFamily: "'Tomorrow', monospace" }}>
                Control de accesos
              </div>
              <div style={{ fontSize: '20px', fontWeight: 900, fontFamily: "'Tomorrow', monospace", fontStyle: 'italic', marginTop: '4px' }}>
                Operadores
              </div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginTop: '8px' }}>
                Un operador entra a este mismo Control Center y puede <strong style={{ color: 'rgba(255,255,255,0.7)' }}>crear
                clientes, activarlos o desactivarlos, cambiarles el plan y la plantilla, y manejar
                trials</strong>. No puede eliminar clientes, ni expirar trials en masa, ni tocar esta pantalla.
              </div>
            </div>

            {/* Alta de operador */}
            <form onSubmit={handleCreateOperator} style={{ ...sectionCard, padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '2px', color: 'rgba(255,107,53,0.5)', textTransform: 'uppercase', fontFamily: "'Tomorrow', monospace" }}>
                Nuevo operador
              </div>
              <div>
                <label style={labelStyle}>Correo *</label>
                <input type="email" value={opForm.email}
                  onChange={e => setOpForm(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="operador@connexo.com" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Contraseña *</label>
                <input type="text" value={opForm.password}
                  onChange={e => setOpForm(prev => ({ ...prev, password: e.target.value }))}
                  placeholder="Mín. 8 caracteres" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Nota (opcional)</label>
                <input type="text" value={opForm.note}
                  onChange={e => setOpForm(prev => ({ ...prev, note: e.target.value }))}
                  placeholder="ej: ventas Guayaquil" style={inputStyle} />
              </div>

              <button type="submit" disabled={creatingOp} style={{
                width: '100%', padding: '15px', borderRadius: '13px',
                background: creatingOp ? 'rgba(255,107,53,0.2)' : 'linear-gradient(135deg, #ff6b35, #c94000)',
                border: 'none', color: '#fff', fontWeight: 900, fontSize: '13px',
                cursor: creatingOp ? 'not-allowed' : 'pointer', letterSpacing: '1px',
                fontFamily: "'Tomorrow', monospace", textTransform: 'uppercase',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              }}>
                <Ico.Plus /> {creatingOp ? 'Creando...' : 'Crear operador'}
              </button>

              {opMsg && (
                <div style={{
                  padding: '15px', borderRadius: '13px',
                  background: opMsg.ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                  border: `1px solid ${opMsg.ok ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
                  color: opMsg.ok ? '#4ade80' : '#fca5a5',
                  fontSize: '13px', whiteSpace: 'pre-line', lineHeight: 1.6, textAlign: 'center',
                }}>
                  {opMsg.text}
                </div>
              )}
            </form>

            {/* Lista de accesos */}
            <div style={{ ...sectionCard, overflow: 'hidden' }}>
              <div style={{
                padding: '16px 18px', borderBottom: '1px solid rgba(255,107,53,0.08)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' }}>
                  Accesos activos
                </span>
                <button onClick={fetchAdmins} style={{
                  background: 'transparent', border: 'none', color: 'rgba(255,107,53,0.6)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px',
                }}>
                  <Ico.Refresh /> Actualizar
                </button>
              </div>

              {loadingAdmins ? (
                <div style={{ padding: '30px', textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: '13px' }}>
                  Cargando...
                </div>
              ) : admins.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: '13px' }}>
                  Sin accesos registrados. ¿Ejecutaste setup_admin_roles.sql?
                </div>
              ) : admins.map(a => {
                const isTheSuper = a.role === 'super_admin';
                const isMe = a.user_id === currentAdmin?.id;
                const confirming = removingOpId === a.user_id;
                return (
                  <div key={a.user_id} style={{
                    padding: '16px 18px',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    opacity: a.is_active ? 1 : 0.45,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {a.email} {isMe && <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>· tú</span>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '5px', flexWrap: 'wrap' }}>
                          <span style={{
                            fontSize: '9px', fontWeight: 800, letterSpacing: '1.2px',
                            padding: '3px 8px', borderRadius: '6px',
                            background: isTheSuper ? 'rgba(255,107,53,0.12)' : 'rgba(59,130,246,0.12)',
                            border: `1px solid ${isTheSuper ? 'rgba(255,107,53,0.25)' : 'rgba(59,130,246,0.25)'}`,
                            color: isTheSuper ? '#ff6b35' : '#60a5fa',
                            fontFamily: "'Tomorrow', monospace", textTransform: 'uppercase',
                          }}>
                            {isTheSuper ? 'Super Admin' : 'Operador'}
                          </span>
                          {!a.is_active && (
                            <span style={{ fontSize: '10px', color: '#f87171', fontWeight: 700 }}>Revocado</span>
                          )}
                          {a.note && (
                            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>{a.note}</span>
                          )}
                        </div>
                        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.22)', marginTop: '5px' }}>
                          Último ingreso: {a.last_sign_in ? new Date(a.last_sign_in).toLocaleString('es-EC') : 'nunca'}
                        </div>
                      </div>

                      {!isTheSuper && (
                        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                          <button
                            onClick={() => handleToggleOperator(a.user_id, a.is_active)}
                            title={a.is_active ? 'Revocar acceso' : 'Reactivar acceso'}
                            style={{
                              padding: '10px 12px', borderRadius: '10px', cursor: 'pointer',
                              background: a.is_active ? 'rgba(255,255,255,0.04)' : 'rgba(34,197,94,0.1)',
                              border: `1px solid ${a.is_active ? 'rgba(255,255,255,0.08)' : 'rgba(34,197,94,0.25)'}`,
                              color: a.is_active ? 'rgba(255,255,255,0.4)' : '#4ade80',
                              display: 'flex', alignItems: 'center',
                            }}
                          >
                            <Ico.Power />
                          </button>
                          <button
                            onClick={() => setRemovingOpId(confirming ? null : a.user_id)}
                            title="Quitar rol de operador"
                            style={{
                              padding: '10px 12px', borderRadius: '10px', cursor: 'pointer',
                              background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)',
                              color: '#ef4444', display: 'flex', alignItems: 'center',
                            }}
                          >
                            <Ico.Trash />
                          </button>
                        </div>
                      )}
                    </div>

                    {confirming && (
                      <div style={{
                        marginTop: '12px', padding: '14px', borderRadius: '12px',
                        background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)',
                      }}>
                        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5, marginBottom: '12px' }}>
                          Se le retira el acceso al Control Center. <strong style={{ color: '#fff' }}>La cuenta de
                          correo no se borra</strong> y ningún cliente se ve afectado.
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <button onClick={() => handleRemoveOperator(a.user_id)} style={{
                            flex: 1, padding: '12px', borderRadius: '10px',
                            background: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.35)',
                            color: '#f87171', fontWeight: 900, fontSize: '12px', cursor: 'pointer',
                            fontFamily: "'Tomorrow', monospace",
                          }}>
                            Sí, quitar acceso
                          </button>
                          <button onClick={() => setRemovingOpId(null)} style={{
                            padding: '12px 16px', borderRadius: '10px',
                            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                            color: 'rgba(255,255,255,0.35)', cursor: 'pointer',
                            display: 'flex', alignItems: 'center',
                          }}>
                            <Ico.X />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.28)', lineHeight: 1.7 }}>
              El rol de Super Admin no se otorga desde aquí a propósito: sigue siendo uno solo y
              únicamente se puede cambiar por SQL en Supabase.
            </div>
          </div>
        )}

      </div>

      {/* ─── BOTTOM NAV ─── */}
      <nav style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: '480px',
        background: 'rgba(15,4,0,0.95)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderTop: '1px solid rgba(255,107,53,0.12)',
        display: 'flex',
        zIndex: 20,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        {[
          { id: 'dashboard' as Tab, label: 'Dashboard', icon: <Ico.Grid /> },
          { id: 'clients'   as Tab, label: 'Clientes',  icon: <Ico.Users /> },
          { id: 'create'    as Tab, label: 'Nuevo',     icon: <Ico.Plus /> },
          ...(isSuper ? [{ id: 'admins' as Tab, label: 'Accesos', icon: <Ico.UserCog /> }] : []),
          { id: 'security'  as Tab, label: 'Cuenta',    icon: <Ico.Key /> },
        ].map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => updateTab(tab.id)}
              style={{
                flex: 1, padding: '12px 0 10px',
                background: 'transparent', border: 'none',
                color: active ? '#ff6b35' : 'rgba(255,255,255,0.25)',
                cursor: 'pointer',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: '4px',
                transition: 'color 0.15s',
                position: 'relative',
              }}
            >
              {active && (
                <div style={{
                  position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                  width: '24px', height: '2px', borderRadius: '0 0 4px 4px',
                  background: 'linear-gradient(90deg, #ff6b35, #c94000)',
                }} />
              )}
              {tab.icon}
              <span style={{
                fontSize: '10px',
                fontWeight: active ? 800 : 500,
                letterSpacing: '0.5px',
                fontFamily: "'Tomorrow', monospace",
                textTransform: 'uppercase',
              }}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};

export default SuperAdmin;
