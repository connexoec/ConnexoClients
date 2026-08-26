import React, { useState, useEffect, useRef } from 'react';
import { Button, Input, Card } from '../components/ui';
import { useLanguage } from '../contexts/LanguageContext';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { supabase } from '../src/lib/supabase';

const Auth: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const { t } = useLanguage();

  // ── PWA Install ──────────────────────────────────────────────────────────────
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const installPromptRef = useRef<any>(null);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;

    if (isStandalone) return; // ya está instalada

    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(ios);
    setShowInstallBanner(true);

    const handlePrompt = (e: Event) => {
      e.preventDefault();
      installPromptRef.current = e;
    };
    window.addEventListener('beforeinstallprompt', handlePrompt);
    return () => window.removeEventListener('beforeinstallprompt', handlePrompt);
  }, []);

  const handleInstall = async () => {
    if (!installPromptRef.current) return;
    installPromptRef.current.prompt();
    const { outcome } = await installPromptRef.current.userChoice;
    if (outcome === 'accepted') {
      setShowInstallBanner(false);
      installPromptRef.current = null;
    }
  };

  useEffect(() => {
    // Reset fields and errors when switching forms
    setEmail('');
    setPassword('');
    setErrors({});
    setResetMessage('');
  }, [mode]);

  const validate = () => {
    const newErrors: { email?: string; password?: string } = {};
    if (!email) {
        newErrors.email = t('auth_email_required');
    } else if (!/\S+@\S+\.\S+/.test(email)) {
        newErrors.email = t('auth_email_invalid');
    }
    if (mode !== 'reset' && !password) {
        newErrors.password = t('auth_password_required');
    } else if (mode !== 'reset' && password.length < 6) {
        newErrors.password = t('auth_password_min_length');
    }
    return newErrors;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); 
    
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        return;
    }
    setErrors({});
    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      if (error) throw error;
      console.log('¡Inicio de sesión exitoso!', data.user);
    } catch (error: any) {
      console.error('Error al iniciar sesión:', error?.message || error);
      // Mostrar el error real de Supabase para diagnóstico
      const msg = error?.message || error?.error_description || 'Error desconocido';
      setErrors({ form: msg });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
     const validationErrors = validate();
    if (validationErrors.email) {
        setErrors(validationErrors);
        return;
    }
    setErrors({});
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      setResetMessage(t('auth_reset_success_message'));
    } catch (error: any) {
      console.error('Error al enviar email de recuperación:', error?.message || error);
      setErrors({ form: 'Error al enviar email de recuperación. Verifica tu email e intenta de nuevo.' });
    } finally {
      setIsLoading(false);
    }
  };

  const getSubmitHandler = () => {
    switch(mode) {
        case 'login': return handleLogin;
        case 'reset': return handleResetPassword;
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      <div className="absolute top-4 right-4 z-10">
          <LanguageSwitcher />
      </div>
      <div className="w-full max-w-md flex flex-col gap-4">
        <img src="/connexo-iso-word-o.png" alt="Connexo Logo" className="w-48 mx-auto mb-8" />
        <Card>
            {mode === 'login' && (
                <>
                    <h2 className="text-2xl font-bold text-center mb-2" style={{ fontFamily: 'var(--font-heading)', fontStyle: 'italic' }}>
                        {t('auth_welcome_back')}
                    </h2>
                    <p className="text-center text-[var(--text-secondary)] mb-6">
                        {t('auth_login_prompt')}
                    </p>
                </>
            )}
            {mode === 'reset' && (
                 <>
                    <h2 className="text-2xl font-bold text-center mb-2" style={{ fontFamily: 'var(--font-heading)', fontStyle: 'italic' }}>
                        {t('auth_reset_password')}
                    </h2>
                    <p className="text-center text-[var(--text-secondary)] mb-6">
                        {t('auth_reset_password_prompt')}
                    </p>
                </>
            )}
          
          {resetMessage ? (
            <div className="text-center p-4 bg-green-900/50 border border-green-500 rounded-lg">
                <p>{resetMessage}</p>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={getSubmitHandler()}>
                {mode !== 'reset' || !resetMessage ? (
                    <div>
                        <Input id="email" label={t('auth_email_label')} type="email" placeholder={t('auth_email_placeholder')} value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email} />
                        {errors.email && <p className="text-red-400 text-xs mt-1 px-1">{errors.email}</p>}
                    </div>
                ) : null}

                {mode !== 'reset' && (
                    <div>
                        <Input id="password" label={t('auth_password_label')} type="password" placeholder={t('auth_password_placeholder')} value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!errors.password} />
                        {errors.password && <p className="text-red-400 text-xs mt-1 px-1">{errors.password}</p>}
                    </div>
                )}
                
                {mode === 'login' && (
                    <div className="flex items-center justify-end -mt-2">
                        <button type="button" onClick={() => setMode('reset')} className="text-xs font-medium text-[var(--primary-orange)] hover:underline">
                            {t('auth_forgot_password')}
                        </button>
                    </div>
                )}

                {errors.form && <p className="text-red-400 text-sm text-center py-2">{errors.form}</p>}
                
                <Button type="submit" className="w-full !mt-6" disabled={isLoading}>
                    {isLoading ? (
                        <span className="flex items-center justify-center">
                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            {t('auth_processing')}
                        </span>
                    ) : (
                        mode === 'login' ? t('auth_login_button') : t('auth_send_link_button')
                    )}
                </Button>
            </form>
          )}

          {mode === 'login' && (
            <>
                <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-[var(--dark-orange)]"></span>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-transparent px-2 text-[var(--text-secondary)] backdrop-blur-sm" style={{backgroundColor: 'hsl(20 100% 6% / 0.7)'}}>{t('auth_continue_with')}</span>
                </div>
                </div>

                <Button variant="secondary" className="w-full flex items-center justify-center gap-2">
                <svg className="w-5 h-5" viewBox="0 0 48 48">
                    <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"></path><path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"></path><path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.222,0-9.612-3.311-11.284-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"></path><path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.574l6.19,5.238C39.986,36.681,44,31.016,44,24C44,22.659,43.862,21.35,43.611,20.083z"></path>
                </svg>
                {t('auth_google_button')}
                </Button>

                {/* --- INICIO DEL FOOTER AGREGADO --- */}
                <div className="mt-8 pt-6 border-t border-gray-800 flex flex-col gap-4 text-center">
                  <p className="text-sm text-gray-500">¿Aún no tienes tu tarjeta?</p>
                  
                  <div className="flex flex-col sm:flex-row justify-center gap-4 text-sm font-medium">
                    <a 
                      href="https://www.connexo.tech/" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-gray-400 hover:text-white transition-colors flex items-center justify-center gap-2"
                    >
                      🌐 Visitar Sitio Web
                    </a>

                    <a 
                      href="https://wa.me/584226469177?text=%C2%A1Hola%20Connexo!%20Me%20gustar%C3%ADa%20adquirir%20mi%20Connexo%20Card%20con%20el%20Plan%20ULTRA" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-gray-400 hover:text-green-400 transition-colors flex items-center justify-center gap-2"
                    >
                      💬 Adquirir Connexo Card
                    </a>
                  </div>
                </div>
                {/* --- FIN DEL FOOTER AGREGADO --- */}
            </>
          )}
          {mode === 'reset' && !resetMessage && (
            <p className="mt-2 text-center text-sm">
                <button onClick={() => setMode('login')} className="font-semibold text-[var(--primary-orange)] hover:underline">
                    {t('auth_back_to_login')}
                </button>
            </p>
          )}
        </Card>

        {/* ── Banner de instalación PWA ── */}
        {showInstallBanner && (
          <div className="rounded-2xl border border-[#ff6600]/30 bg-[#210900]/80 backdrop-blur-sm overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[#ff6600]/15">
              <div className="w-8 h-8 rounded-xl bg-[#ff6600] flex items-center justify-center shrink-0">
                <img src="/connexo-iso-o.png" alt="" className="w-5 h-5 object-contain" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[#ffefe5] text-sm font-bold leading-none">Instala Connexo</p>
                <p className="text-[#ff6600]/70 text-[11px] mt-0.5">Accede más rápido desde tu pantalla de inicio</p>
              </div>
              <button
                onClick={() => setShowInstallBanner(false)}
                className="text-[#ffefe5]/30 hover:text-[#ffefe5]/60 transition-colors shrink-0 p-1"
                aria-label="Cerrar"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {isIOS ? (
              /* iOS: no hay API, instrucciones manuales */
              <div className="px-4 py-3 space-y-2">
                <p className="text-[#ffefe5]/60 text-xs">Sigue estos pasos en Safari:</p>
                <div className="flex flex-col gap-2">
                  {[
                    { n: '1', icon: (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                      ), label: 'Toca el botón Compartir' },
                    { n: '2', icon: (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                      ), label: 'Selecciona "Agregar a inicio"' },
                    { n: '3', icon: (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                      ), label: 'Toca "Agregar" para confirmar' },
                  ].map(({ n, icon, label }) => (
                    <div key={n} className="flex items-center gap-2.5">
                      <div className="w-5 h-5 rounded-full bg-[#ff6600]/20 flex items-center justify-center text-[#ff6600] shrink-0">
                        {icon}
                      </div>
                      <span className="text-[#ffefe5]/70 text-xs">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* Android / Desktop: botón nativo */
              <div className="px-4 py-3 flex items-center justify-between gap-3">
                <p className="text-[#ffefe5]/60 text-xs leading-snug">
                  {installPromptRef.current
                    ? 'Un clic y estará en tu pantalla de inicio.'
                    : 'Abre el menú del navegador → "Instalar aplicación".'}
                </p>
                {installPromptRef.current && (
                  <button
                    onClick={handleInstall}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#ff6600] text-white text-xs font-bold uppercase tracking-wider active:scale-95 transition-all"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Instalar
                  </button>
                )}
              </div>
            )}
          </div>
        )}

      </div>
       <footer className="absolute bottom-4 left-0 right-0 text-center">
        <div className="inline-flex items-center justify-center gap-2 text-xs text-[var(--text-secondary)] opacity-70">
            <img src="/connexo-iso-o.png" alt="Connexo Isotype" className="h-4 w-4" />
            <span>{t('footer_developed_by')}</span>
        </div>
      </footer>
    </div>
  );
};

export default Auth;