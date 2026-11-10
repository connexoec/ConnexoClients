import React from 'react';
import { FaSearch } from 'react-icons/fa';
import { Pill } from '../AdminKit';

/** Identidad del panel de Fotografía (misma paleta que el perfil público). */
export const ACCENT = '#ff6a56';
export const ON_ACCENT = '#1a0805';
export const TITLE_FONT = "'Cormorant Garamond', Georgia, serif";

export const btnPrimary = 'flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl transition hover:brightness-110 disabled:opacity-50';
export const btnGhost = 'px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider border border-white/10 text-white/60 hover:text-white hover:bg-white/5 transition disabled:opacity-40';
export const iconBtn = 'w-8 h-8 rounded-lg bg-white/5 border border-white/10 text-white/60 flex items-center justify-center hover:text-white transition disabled:opacity-40';
export const dangerBtn = 'w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center hover:bg-red-500/20 transition';

export const TabHeader: React.FC<{ icon: React.ReactNode; title: string; subtitle: string; action?: React.ReactNode }> = ({ icon, title, subtitle, action }) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5" style={{ borderColor: `${ACCENT}26` }}>
    <div>
      <h2 className="text-3xl font-semibold text-white flex items-center gap-2" style={{ fontFamily: TITLE_FONT }}><span style={{ color: ACCENT }}>{icon}</span> {title}</h2>
      <p className="text-sm text-white/40 mt-1">{subtitle}</p>
    </div>
    {action}
  </div>
);

export const Empty: React.FC<{ emoji: string; children: React.ReactNode }> = ({ emoji, children }) => (
  <div className="text-center py-14 text-white/30"><p className="text-4xl mb-3">{emoji}</p><p className="text-sm max-w-md mx-auto">{children}</p></div>
);

export const SearchBox: React.FC<{ value: string; onChange: (v: string) => void; placeholder: string }> = ({ value, onChange, placeholder }) => (
  <div className="relative flex-1 min-w-[200px]">
    <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={12} />
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder}
      className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30" />
  </div>
);

export const Pills = <T extends string>({ items, value, onChange }: { items: [T, string][]; value: T; onChange: (v: any) => void }) => (
  <div className="flex flex-wrap gap-2">
    {items.map(([k, label]) => <Pill key={k} active={value === k} onClick={() => onChange(k)} accent={ACCENT} onAccent={ON_ACCENT}>{label}</Pill>)}
  </div>
);

export const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void; label: string }> = ({ on, onChange, label }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
    className="w-11 h-6 rounded-full relative transition shrink-0" style={{ background: on ? ACCENT : 'rgba(255,255,255,0.12)' }}>
    <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: on ? 22 : 2 }} />
  </button>
);

/** «hace 5 min», «hace 2 h», «ayer», o la fecha. */
export const ago = (iso?: string | null) => {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return 'ayer';
  if (d < 7) return `hace ${d} días`;
  return new Date(iso).toLocaleDateString('es-EC', { day: '2-digit', month: 'short' });
};

/** Tope de series/paquetes/galerías por plan (el mismo que impone el servidor). */
export const capFor = (plan: string, what: 'works' | 'packages'): number | null => {
  if (plan === 'ultra') return null;
  if (what === 'works') return plan === 'pro' ? 60 : 12;
  return plan === 'pro' ? 12 : 3;
};

export const CapNote: React.FC<{ count: number; cap: number | null; label: string }> = ({ count, cap, label }) => (
  <p className="text-[11px] text-white/40">
    {count}{cap ? ` de ${cap}` : ''} {label}{cap && count >= cap ? ' · límite de tu plan' : ''}
  </p>
);
