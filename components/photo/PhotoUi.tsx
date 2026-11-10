import React from 'react';
import { FaCamera, FaClock, FaImages, FaInstagram, FaCheck, FaStar, FaArrowRight } from 'react-icons/fa';
import type { PhotoPackage, PhotoWork, PhotoTeamMember, PhotoPackageMode } from '../../types';
import { useKit, fmtMoney } from '../PublicKit';
import { KIND_LABEL, durationText, depositOf, packageTotal } from '../../src/lib/photoCommon';

/** Portada de una serie: la elegida o, si no hay, la primera foto. */
export const workCover = (w: Pick<PhotoWork, 'cover_url' | 'images'>) => w.cover_url || w.images?.[0] || '';

/** Foto de una serie del portafolio. La destacada ocupa dos columnas y se ve apaisada. */
export const WorkCard: React.FC<{ w: PhotoWork; wide?: boolean; onOpen: () => void }> = ({ w, wide, onOpen }) => {
  const k = useKit();
  const cover = workCover(w);
  const n = w.images?.length || 0;
  return (
    <button type="button" onClick={onOpen} aria-label={`${w.title}: ver fotos`}
      className={`group relative overflow-hidden rounded-md text-left ${wide ? 'col-span-2' : ''}`}
      style={{ aspectRatio: wide ? '16 / 10' : '4 / 5', background: k.surface, border: `1px solid ${k.text}12` }}>
      {cover
        ? <img src={cover} alt={w.title} loading="lazy" className="absolute inset-0 w-full h-full object-cover transition duration-700 group-hover:scale-[1.04]" />
        : <div className="absolute inset-0 flex items-center justify-center" style={{ background: `linear-gradient(150deg, ${k.accentDark}55, ${k.bg})` }}><FaCamera className="text-3xl" style={{ color: `${k.text}33` }} /></div>}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.82) 4%, rgba(0,0,0,0.05) 58%)' }} />
      {w.is_featured && (
        <span className="absolute top-2.5 left-2.5 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.18em] px-2 py-1 rounded-full" style={{ background: k.accent, color: k.onAccent }}>
          <FaStar size={8} /> Destacada
        </span>
      )}
      {n > 1 && (
        <span className="absolute top-2.5 right-2.5 flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full bg-black/55 backdrop-blur text-white">
          <FaImages size={9} /> {n}
        </span>
      )}
      <div className="absolute inset-x-0 bottom-0 p-3.5">
        <p className="text-[9px] uppercase tracking-[0.28em] font-semibold" style={{ color: k.accentLight }}>{w.category}</p>
        <p className={`text-white font-semibold leading-tight mt-0.5 ${wide ? 'text-[24px]' : 'text-[18px]'}`} style={{ fontFamily: k.titleFont }}>{w.title}</p>
      </div>
    </button>
  );
};

export const priceLine = (p: Pick<PhotoPackage, 'price' | 'price_prefix' | 'hourly' | 'mode'>) => {
  if (!(Number(p.price) > 0)) return p.mode === 'cotizacion' ? 'A cotizar' : 'Consultar';
  return `${p.price_prefix ? `${p.price_prefix} ` : ''}${fmtMoney(Number(p.price))}${p.hourly ? ' / hora' : ''}`;
};

/** CTA del paquete según cómo se pide (y según lo que el plan permite). */
export const CTA_LABEL: Record<PhotoPackageMode, string> = { reserva: 'Reservar', cotizacion: 'Pedir cotización', consulta: 'Consultar' };

export const PackageCard: React.FC<{ p: PhotoPackage; mode: PhotoPackageMode; onOpen: () => void; onAction: () => void }> = ({ p, mode, onOpen, onAction }) => {
  const k = useKit();
  const shown = (p.includes || []).slice(0, 3);
  const dep = depositOf(packageTotal(p), p.deposit_percent);
  return (
    <div className="rounded-2xl border overflow-hidden" style={{ background: k.surface, borderColor: p.is_featured ? `${k.accent}77` : `${k.text}14` }}>
      {p.image_url && (
        <button type="button" onClick={onOpen} className="block w-full relative" aria-label={`${p.name}: ver detalle`}>
          <img src={p.image_url} alt={p.name} loading="lazy" className="w-full h-40 object-cover" />
          <div className="absolute inset-0" style={{ background: `linear-gradient(to top, ${k.surface} 2%, transparent 60%)` }} />
        </button>
      )}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[9px] uppercase tracking-[0.28em] font-semibold flex items-center gap-1.5" style={{ color: k.accentLight }}>
              {KIND_LABEL[p.kind]}{p.is_featured && <span className="px-1.5 py-0.5 rounded-full text-[8px] tracking-[0.14em]" style={{ background: k.accent, color: k.onAccent }}>Popular</span>}
            </p>
            <button type="button" onClick={onOpen} className="text-left">
              <h3 className="text-white font-semibold text-[20px] leading-tight mt-0.5" style={{ fontFamily: k.titleFont }}>{p.name}</h3>
            </button>
          </div>
          <p className="text-right shrink-0 text-white font-semibold text-[19px] leading-tight" style={{ fontFamily: k.titleFont }}>{priceLine(p)}</p>
        </div>
        <p className="text-[11px] mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1" style={{ color: `${k.text}99` }}>
          {p.mode !== 'consulta' && <span className="flex items-center gap-1"><FaClock size={9} /> {durationText(p)}</span>}
          {p.delivery_note && <span className="flex items-center gap-1"><FaImages size={9} /> {p.delivery_note}</span>}
        </p>
        {p.description && <p className="text-[12.5px] leading-relaxed mt-2.5 line-clamp-3" style={{ color: `${k.text}c0` }}>{p.description}</p>}
        {shown.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {shown.map((x, i) => (
              <li key={i} className="flex gap-2 text-[12px]" style={{ color: `${k.text}d0` }}>
                <FaCheck size={9} className="mt-1 shrink-0" style={{ color: k.accent }} /> <span>{x}</span>
              </li>
            ))}
            {(p.includes?.length || 0) > shown.length && (
              <li><button type="button" onClick={onOpen} className="text-[11px] font-semibold" style={{ color: k.accentLight }}>+ {p.includes.length - shown.length} más</button></li>
            )}
          </ul>
        )}
        <div className="mt-4 flex items-center gap-3">
          <button type="button" onClick={onAction}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[11px] font-bold uppercase tracking-[0.16em] transition hover:brightness-110"
            style={{ background: k.accent, color: k.onAccent }}>
            {CTA_LABEL[mode]} <FaArrowRight size={10} />
          </button>
          {mode === 'reserva' && p.deposit_percent > 0 && Number(p.price) > 0 && !p.hourly && (
            <p className="text-[10px] leading-tight shrink-0 text-right" style={{ color: `${k.text}99` }}>Anticipo<br /><b className="text-white text-[12px]">{fmtMoney(dep)}</b></p>
          )}
        </div>
      </div>
    </div>
  );
};

export const TeamCard: React.FC<{ m: PhotoTeamMember }> = ({ m }) => {
  const k = useKit();
  const ig = m.instagram ? (/^https?:/i.test(m.instagram) ? m.instagram : `https://instagram.com/${m.instagram.replace(/^@/, '')}`) : '';
  return (
    <div className="rounded-2xl border p-4 text-center" style={{ background: k.surface, borderColor: `${k.text}12` }}>
      <div className="w-20 h-20 mx-auto rounded-full overflow-hidden border-2" style={{ borderColor: `${k.accent}66`, background: `${k.text}0d` }}>
        {m.photo_url ? <img src={m.photo_url} alt={m.name} loading="lazy" className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center"><FaCamera style={{ color: `${k.text}44` }} /></div>}
      </div>
      <p className="text-white font-semibold text-[17px] mt-3 leading-tight" style={{ fontFamily: k.titleFont }}>{m.name}</p>
      {m.role && <p className="text-[10px] uppercase tracking-[0.22em] font-semibold mt-1" style={{ color: k.accentLight }}>{m.role}</p>}
      {m.bio && <p className="text-[12px] leading-relaxed mt-2" style={{ color: `${k.text}b0` }}>{m.bio}</p>}
      {ig && <a href={ig} target="_blank" rel="noopener noreferrer" aria-label={`Instagram de ${m.name}`} className="inline-flex items-center justify-center w-8 h-8 rounded-full mt-3 border" style={{ borderColor: `${k.accent}55`, color: k.accentLight }}><FaInstagram size={13} /></a>}
    </div>
  );
};
