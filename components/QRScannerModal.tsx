import React, { useRef, useEffect, useState } from 'react';
import { Card } from './ui';
import { useLanguage } from '../contexts/LanguageContext';

// Add jsQR to the window type to avoid TypeScript errors
declare global {
  interface Window {
    jsQR: (data: Uint8ClampedArray, width: number, height: number, options?: object) => { data: string } | null;
  }
}

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onQRScanned: (data: string) => void;
}

export const QRScannerModal: React.FC<QRScannerModalProps> = ({ isOpen, onClose, onQRScanned }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameId = useRef<number | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { t } = useLanguage();

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }

    const startCamera = async () => {
      setIsLoading(true);
      setError(null);
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }
          });
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.setAttribute("playsinline", "true"); // Required for iOS
            videoRef.current.play();
            scanQRCode();
          }
          setIsLoading(false);
        } catch (err) {
          console.error("Error accessing camera:", err);
          if (err instanceof Error) {
              if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                setError(t('qr_scanner_permission_denied'));
              } else {
                setError(t('qr_scanner_not_found'));
              }
          } else {
             setError(t('qr_scanner_generic_error'));
          }
          setIsLoading(false);
        }
      } else {
        setError(t('qr_scanner_unsupported_browser'));
        setIsLoading(false);
      }
    };

    startCamera();

    return () => {
      stopCamera();
    };
  }, [isOpen, t]);

  const stopCamera = () => {
    if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const scanQRCode = () => {
    if (
      videoRef.current &&
      canvasRef.current &&
      videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA
    ) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        canvas.height = video.videoHeight;
        canvas.width = video.videoWidth;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = window.jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert",
        });

        if (code) {
          onQRScanned(code.data);
          onClose();
          return;
        }
      }
    }
    animationFrameId.current = requestAnimationFrame(scanQRCode);
  };
  
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const file = event.target.files[0];
      console.log('File selected:', file.name);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md relative"
        onClick={e => e.stopPropagation()}
      >
        <Card className="animate-fade-in-up">
            <div className="flex justify-between items-start">
                 <div className="flex-grow">
                    <h2 className="text-xl font-bold mb-2">{t('qr_scanner_title')}</h2>
                    <p className="text-sm text-[var(--text-secondary)] mb-6">{t('qr_scanner_prompt')}</p>
                 </div>
                 <button onClick={onClose} className="p-1 rounded-full hover:bg-white/10 -mt-2 -mr-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                 </button>
            </div>
          
            <div className="aspect-square bg-black rounded-lg flex items-center justify-center border-2 border-dashed border-[var(--dark-orange)] relative overflow-hidden">
                <video ref={videoRef} className={`w-full h-full object-cover ${isLoading || error ? 'hidden' : ''}`} />
                <canvas ref={canvasRef} className="hidden" />
                
                {isLoading && (
                     <div className="text-center text-[var(--text-secondary)]">
                        <svg className="animate-spin h-10 w-10 mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                           <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                           <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <p>{t('qr_scanner_starting_camera')}</p>
                    </div>
                )}
                
                {error && (
                    <div className="text-center text-red-400 p-4">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-12 h-12 mx-auto mb-2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                        <p className="font-semibold">{t('qr_scanner_camera_error_title')}</p>
                        <p className="text-xs">{error}</p>
                    </div>
                )}
            </div>
            
            <div className="mt-4 text-center">
                 <input
                    type="file"
                    id="qr-file-input"
                    className="hidden"
                    accept="image/*"
                    onChange={handleFileSelect}
                />
                <label
                    htmlFor="qr-file-input"
                    className="font-semibold text-[var(--primary-orange)] hover:underline cursor-pointer text-sm"
                >
                    {t('qr_scanner_upload_from_gallery')}
                </label>
            </div>

        </Card>
      </div>
    </div>
  );
};