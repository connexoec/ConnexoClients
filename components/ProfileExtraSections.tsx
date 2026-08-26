import React, { useState } from 'react';
import { ImageLightbox } from './ImageLightbox';

// Secciones genéricas compartidas (galería, archivos digitales, FAQs) para que
// TODAS las plantillas (gastro, ecom, barber, default) las muestren cuando hay
// datos. Es aditivo: si no hay datos o la sección está oculta, no renderiza nada,
// por lo que no altera el diseño de ningún perfil existente.

interface ProfileExtraSectionsProps {
  profile: any;
  accent?: string; // color de acento de la plantilla
  skip?: string[]; // secciones que la plantilla ya renderiza (ej. ['gallery'])
  /**
   * true cuando esto se dibuja dentro de la vista previa del panel del dueño.
   * Ahí el visor de imágenes no se abre: se dibuja por portal sobre <body>, así
   * que taparía el panel entero desde una maqueta que sólo es para mirar.
   * Misma convención que ya usaba la plantilla de e-commerce con sus modales.
   */
  isMobilePreview?: boolean;
}

const isOn = (profile: any, k: string) => profile?.sectionVisibility?.[k] !== false;

const VideoLinkCard: React.FC<{ href: string; thumbnailURL?: string; isVertical: boolean; accent?: string }> = ({ href, thumbnailURL, isVertical, accent = '#fff' }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" style={{
    display: 'block', textDecoration: 'none', position: 'relative',
    borderRadius: '16px', overflow: 'hidden',
    aspectRatio: isVertical ? '9/16' : '16/9',
    background: '#1a1a2e',
    border: '1px solid rgba(255,255,255,0.1)'
  }}>
    {thumbnailURL && (
      <img src={thumbnailURL} alt="Video" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
    )}
    <div style={{
      position: 'absolute', inset: 0,
      background: thumbnailURL
        ? 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 60%)'
        : 'linear-gradient(135deg, #1a1a2e 0%, #0f3460 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{
        width: '60px', height: '60px', borderRadius: '50%',
        background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)',
        border: `2px solid ${accent}99`,
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill={accent} style={{ marginLeft: '3px' }}>
          <path d="M8 5v14l11-7z"/>
        </svg>
      </div>
    </div>
  </a>
);

export const ProfileExtraSections: React.FC<ProfileExtraSectionsProps> = ({ profile, accent = '#ff6b35', skip = [], isMobilePreview = false }) => {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const plan = (profile?.plan ?? 'free').toString().toLowerCase();
  const isUltra = plan === 'ultra';

  // Visor de la galería. Antes las fotos se dibujaban sin ningún manejador de
  // clic, así que al tocarlas no ocurría nada.
  const [visor, setVisor] = useState<{ images: string[]; index: number } | null>(null);

  const galleryImages: string[] = Array.isArray(profile?.galleryImageURLs) ? profile.galleryImageURLs : [];
  const albums: any[] = Array.isArray(profile?.albums) ? profile.albums : [];
  const albumsMode = profile?.galleryMode === 'albums';
  const hasGallery = albumsMode ? albums.length > 0 : galleryImages.length > 0;
  const files: any[] = Array.isArray(profile?.digitalFiles) ? profile.digitalFiles : [];
  const faqs: any[] = Array.isArray(profile?.faqs) ? profile.faqs : [];

  const rawVideos: Array<{ url: string; thumbnailURL?: string }> =
    Array.isArray(profile?.featuredVideos) && profile.featuredVideos.length > 0
      ? profile.featuredVideos.filter((v: any) => v?.url)
      : profile?.featuredVideoURL ? [{ url: profile.featuredVideoURL }] : [];
  const isVertical = profile?.videoOrientation === 'vertical';
  const showVideo = !skip.includes('video') && isOn(profile, 'video') && isUltra && rawVideos.length > 0;

  const showGallery = !skip.includes('gallery') && isOn(profile, 'gallery') && hasGallery;
  const showFiles = !skip.includes('archives') && isOn(profile, 'archives') && isUltra && files.length > 0;
  const showFaqs = !skip.includes('faqs') && isOn(profile, 'faqs') && isUltra && faqs.length > 0;

  if (!showVideo && !showGallery && !showFiles && !showFaqs) return null;

  const heading = (text: string) => (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-1 h-6 rounded-full" style={{ backgroundColor: accent }} />
      <h2 className="text-sm font-black uppercase tracking-widest" style={{ color: accent }}>{text}</h2>
    </div>
  );

  return (
    <div className="w-full max-w-2xl mx-auto px-4 space-y-8 mt-4 mb-10" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      {/* ── Video Destacado (ULTRA) ── */}
      {showVideo && (
        <div>
          {heading('Video Destacado')}
          <div style={{ display: isVertical ? 'grid' : 'flex', gridTemplateColumns: isVertical ? '1fr 1fr' : undefined, flexDirection: isVertical ? undefined : 'column', gap: '12px' }}>
            {rawVideos.map((v, i) => (
              <VideoLinkCard key={i} href={v.url} thumbnailURL={v.thumbnailURL} isVertical={isVertical} accent={accent} />
            ))}
          </div>
        </div>
      )}

      {/* ── Galería ── */}
      {showGallery && (
        <div>
          {heading(profile?.galleryTitle?.trim() || 'Galería')}
          {albumsMode ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {albums.map((a: any, i: number) => {
                const cover = a.coverUrl || a.cover || (Array.isArray(a.images) && a.images[0]);
                // Un álbum se abre con TODAS sus fotos. Si no tuviera ninguna,
                // se usa la portada para que el clic siga mostrando algo en vez
                // de abrir un visor vacío.
                const fotos: string[] = Array.isArray(a.images) && a.images.length > 0
                  ? a.images
                  : (cover ? [cover] : []);
                return (
                  <button
                    key={a.id || i}
                    type="button"
                    onClick={() => { if (!isMobilePreview && fotos.length > 0) setVisor({ images: fotos, index: 0 }); }}
                    disabled={fotos.length === 0}
                    className="text-left rounded-xl overflow-hidden border border-white/10 bg-black/30 hover:border-white/25 transition disabled:cursor-default"
                  >
                    {cover && <img src={cover} alt={a.title || `Álbum ${i + 1}`} className="w-full h-32 object-cover" />}
                    {a.title && <p className="text-[11px] text-white/80 font-bold px-2 py-1.5 truncate">{a.title}</p>}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {galleryImages.map((url, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => { if (!isMobilePreview) setVisor({ images: galleryImages, index: i }); }}
                  aria-label={`Ampliar imagen ${i + 1}`}
                  className="aspect-square rounded-xl overflow-hidden bg-black/30 border border-white/5 cursor-pointer block w-full"
                >
                  <img src={url} alt={`Galería ${i + 1}`} className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Archivos digitales (ULTRA) ── */}
      {showFiles && (
        <div>
          {heading('Archivos')}
          <div className="space-y-2">
            {files.map((f: any, i: number) => (
              <a key={f.id || i} href={f.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl p-3 hover:border-white/20 transition">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center text-[10px] font-black uppercase shrink-0"
                  style={{ backgroundColor: `${accent}1a`, color: accent, border: `1px solid ${accent}40` }}>
                  {(f.fileType || 'file').toString().slice(0, 4)}
                </div>
                <span className="flex-1 min-w-0 text-sm text-white/90 truncate">{f.title || 'Archivo'}</span>
                <span className="text-xs shrink-0" style={{ color: accent }}>Descargar ↓</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* ── Preguntas frecuentes (ULTRA) ── */}
      {showFaqs && (
        <div>
          {heading('Preguntas Frecuentes')}
          <div className="space-y-2">
            {faqs.map((faq: any, i: number) => (
              <div key={i} className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-white/5 transition">
                  <span className="text-sm font-bold text-white">{faq.question}</span>
                  <span className="shrink-0 text-lg leading-none" style={{ color: accent }}>{openFaq === i ? '−' : '+'}</span>
                </button>
                {openFaq === i && faq.answer && (
                  <div className="px-4 pb-4 text-sm text-white/70 leading-relaxed whitespace-pre-wrap">{faq.answer}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Visor a pantalla completa. Se dibuja por portal sobre <body>, así que
          da igual dónde esté colocado aquí dentro. */}
      {visor && (
        <ImageLightbox
          images={visor.images}
          startIndex={visor.index}
          accent={accent}
          onClose={() => setVisor(null)}
        />
      )}
    </div>
  );
};

export default ProfileExtraSections;
