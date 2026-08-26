import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Visor de imágenes a pantalla completa.
 *
 * Existe porque la galería de la mayoría de las plantillas dibujaba las fotos
 * como un <img> suelto dentro de un <div>, SIN ningún manejador de clic: al
 * tocarlas no pasaba absolutamente nada. La plantilla por defecto y la de
 * barbería sí tenían visor, cada una el suyo; en vez de copiar el código una
 * tercera y una cuarta vez —que es como el modal de reseñas acabó duplicado y
 * divergido hasta v0.46.1— se escribe una sola vez aquí.
 *
 * ⚠️ Se dibuja con createPortal sobre <body>. NO es un detalle estético: si se
 * renderizara dentro de la galería, cualquier ancestro con `transform` (y las
 * tarjetas de las galerías usan `hover:scale-105`) rompería el `position:fixed`
 * y el visor aparecería desplazado o recortado. Es exactamente el fallo de
 * modales desfasados de v0.12.0.
 */
interface ImageLightboxProps {
  images: string[];
  /** Índice de la imagen por la que se abre. */
  startIndex?: number;
  onClose: () => void;
  /** Color de acento de la plantilla, para el contador y los controles. */
  accent?: string;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({
  images,
  startIndex = 0,
  onClose,
  accent = '#ffffff',
}) => {
  const total = Array.isArray(images) ? images.length : 0;

  // El índice se acota SIEMPRE contra el total: si llegara uno fuera de rango
  // (por ejemplo un álbum vacío) el visor mostraría undefined y se vería un
  // hueco negro sin explicación.
  const clamp = useCallback(
    (i: number) => (total === 0 ? 0 : ((i % total) + total) % total),
    [total],
  );

  const [index, setIndex] = useState(() => clamp(startIndex));

  // Si se abre otra foto sin desmontar el visor, hay que seguirla.
  useEffect(() => { setIndex(clamp(startIndex)); }, [startIndex, clamp]);

  const prev = useCallback(() => setIndex((i) => clamp(i - 1)), [clamp]);
  const next = useCallback(() => setIndex((i) => clamp(i + 1)), [clamp]);

  // Teclado: Esc cierra, flechas navegan.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, prev, next]);

  // Sin imágenes no se dibuja nada: mejor que un rectángulo negro vacío.
  if (total === 0) return null;
  // En SSR o en un entorno sin DOM no hay dónde portalar.
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Visor de imágenes"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 2147483000,
        background: 'rgba(0,0,0,0.94)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
    >
      {/* Cerrar */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Cerrar"
        style={{
          position: 'absolute', top: '16px', right: '16px',
          width: '40px', height: '40px', borderRadius: '50%',
          background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
          color: '#fff', fontSize: '18px', lineHeight: 1, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        ✕
      </button>

      {total > 1 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); prev(); }}
          aria-label="Anterior"
          style={{
            position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
            width: '44px', height: '44px', borderRadius: '50%',
            background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
            color: '#fff', fontSize: '20px', lineHeight: 1, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          ‹
        </button>
      )}

      {total > 1 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); next(); }}
          aria-label="Siguiente"
          style={{
            position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
            width: '44px', height: '44px', borderRadius: '50%',
            background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
            color: '#fff', fontSize: '20px', lineHeight: 1, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          ›
        </button>
      )}

      {/* La imagen no cierra el visor al tocarla: sólo el fondo. */}
      <img
        src={images[index]}
        alt={`Imagen ${index + 1} de ${total}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '92vw', maxHeight: '86vh',
          objectFit: 'contain', borderRadius: '12px',
          boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
        }}
      />

      {total > 1 && (
        <div
          style={{
            position: 'absolute', bottom: '18px', left: '50%', transform: 'translateX(-50%)',
            padding: '6px 14px', borderRadius: '999px',
            background: 'rgba(0,0,0,0.6)', border: `1px solid ${accent}55`,
            color: accent, fontSize: '12px', fontWeight: 800, letterSpacing: '1px',
          }}
        >
          {index + 1} / {total}
        </div>
      )}
    </div>,
    document.body,
  );
};

export default ImageLightbox;
