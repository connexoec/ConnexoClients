import React, { useEffect, useRef, useState } from 'react';
import { FaTimes, FaBarcode } from 'react-icons/fa';
import { AdminModal } from '../AdminKit';
import { ACCENT } from './BooksAdminUi';
import { isValidIsbn, normalizeIsbn } from '../../src/lib/booksCommon';

/**
 * Escáner de código de barras (ISBN/EAN-13) con la cámara del teléfono usando
 * la API nativa BarcodeDetector. Solo existe en algunos navegadores (Chrome en
 * Android, Edge, Safari reciente), así que NADA depende de ella: si no está,
 * `canScanBarcodes()` es falso, el botón no se dibuja y el dueño teclea el ISBN.
 */
export const canScanBarcodes = (): boolean =>
  typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;

export const IsbnScanner: React.FC<{ onDetected: (isbn: string) => void; onClose: () => void }> = ({ onDetected, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cb = useRef(onDetected);
  cb.current = onDetected;      // el efecto no debe reabrir la cámara si el padre cambia de función
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let alive = true;
    (async () => {
      try {
        const Detector = (window as any).BarcodeDetector;
        const detector = new Detector({ formats: ['ean_13', 'ean_8', 'upc_a'] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (!alive) { stream.getTracks().forEach(t => t.stop()); return; }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play().catch(() => {});
        timer = setInterval(async () => {
          try {
            const found = await detector.detect(video);
            const code = found?.map((f: any) => normalizeIsbn(f.rawValue)).find((c: string) => isValidIsbn(c));
            if (code && alive) { alive = false; cb.current(code); }
          } catch { /* frame sin código */ }
        }, 350);
      } catch (e: any) {
        setError(e?.name === 'NotAllowedError' ? 'Permite el acceso a la cámara para escanear.' : 'No se pudo abrir la cámara en este dispositivo.');
      }
    })();
    return () => { alive = false; if (timer) clearInterval(timer); stream?.getTracks().forEach(t => t.stop()); };
  }, []);

  return (
    <AdminModal title="Escanear código de barras" accent={ACCENT} onClose={onClose}>
      {error ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : (
        <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3]">
          <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
          <div aria-hidden className="absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2" style={{ background: ACCENT, boxShadow: `0 0 12px ${ACCENT}` }} />
        </div>
      )}
      <p className="text-[12px] text-white/50 flex items-center gap-2"><FaBarcode /> Apunta al código de barras de la contraportada (el que empieza con 978).</p>
      <button type="button" onClick={onClose} className="w-full py-2.5 rounded-xl text-xs font-bold uppercase border border-white/10 text-white/60 hover:text-white flex items-center justify-center gap-2"><FaTimes /> Cerrar</button>
    </AdminModal>
  );
};
