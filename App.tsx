import React, { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { supabase } from './src/lib/supabase';

// Code-splitting por ruta: cada página se descarga solo cuando se visita
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const PublicProfile = lazy(() => import('./pages/PublicProfile'));
const Auth = lazy(() => import('./pages/Auth'));
const SuperAdmin = lazy(() => import('./pages/SuperAdmin'));

const PageSpinner = () => (
  <div className="flex items-center justify-center min-h-screen bg-[var(--background-dark)]">
    <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-[var(--primary-orange)]"></div>
  </div>
);

const SUPER_ADMIN_EMAILS = ['connexoec@gmail.com', 'connexotech@gmail.com'];

/**
 * ¿Hay una sesión guardada en el navegador?
 *
 * Sirve para distinguir «todavía no sé si hay sesión» de «no hay sesión», que es
 * justo lo que la app confundía al expulsar al usuario. Supabase guarda el token
 * bajo `sb-<ref>-auth-token`; se busca por prefijo para no depender del nombre
 * exacto si cambiara la librería.
 */
const haySesionGuardada = (): boolean => {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('sb-') && k.endsWith('-auth-token') && localStorage.getItem(k)) return true;
    }
  } catch { /* modo privado o storage bloqueado */ }
  return false;
};

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    let vivo = true;

    // ⚠️ ESTE BLOQUE DECIDE SI EL USUARIO SIGUE DENTRO. La única redirección
    // automática al login de toda la app es la ruta /dashboard de abajo, que
    // dispara en cuanto `session` es null. Por eso aquí "todavía no lo sé"
    // NUNCA puede tratarse como "no hay sesión".
    //
    // Qué pasaba antes: un temporizador de 5 s hacía `setIsLoading(false)` sin
    // resolver la sesión. Si `getSession()` tardaba más —red lenta, o el token
    // había caducado y había que renovarlo primero— las rutas se dibujaban con
    // `session` todavía en null, leían "no hay usuario" y mandaban al login.
    // La sesión seguía guardada: por eso "se cerraba sola" y al recargar volvía.
    const timeout = setTimeout(() => {
      if (!vivo) return;
      // Si hay sesión guardada, se sigue esperando: preferimos un spinner un
      // poco más largo antes que expulsar a alguien que sí estaba dentro.
      if (haySesionGuardada()) {
        console.warn('getSession tarda; hay sesión guardada, se sigue esperando.');
        return;
      }
      console.warn('getSession no respondió en 5 s y no hay sesión guardada.');
      setIsLoading(false);
    }, 5000);

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!vivo) return;
      clearTimeout(timeout);
      setSession(session);
      setIsLoading(false);
    }).catch((err) => {
      if (!vivo) return;
      clearTimeout(timeout);
      console.error('Error connecting to Supabase:', err);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, next) => {
      if (!vivo) return;

      // Un fallo puntual renovando el token puede emitir eventos sin sesión.
      // Sólo un cierre explícito debe sacar al usuario; para lo demás, se
      // conserva la sesión que ya teníamos.
      if (!next && event !== 'SIGNED_OUT') return;

      clearTimeout(timeout);
      setSession(next);
      setIsLoading(false);
    });

    return () => { vivo = false; clearTimeout(timeout); subscription.unsubscribe(); };
  }, []);

  if (isLoading) {
    return <PageSpinner />;
  }

  const user = session?.user || null;
  const userEmail = user?.email?.toLowerCase() || '';
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(userEmail);

  return (
    <ThemeProvider>
      <LanguageProvider>
        <div className="bg-[var(--background-dark)] min-h-screen">
          <BrowserRouter>
            <Suspense fallback={<PageSpinner />}>
            <Routes>
              {/* Auth: Super admins van directo a /admin, usuarios normales a /dashboard */}
              <Route path="/auth" element={
                isSuperAdmin
                  ? <Navigate to="/admin" />
                  : user
                    ? <Navigate to="/dashboard" />
                    : <Auth />
              } />

              {/* Dashboard: Solo para clientes normales. Super admins son redirigidos a /admin */}
              <Route path="/dashboard" element={
                isSuperAdmin
                  ? <Navigate to="/admin" />
                  : user
                    ? <AdminDashboard user={user} />
                    : <Navigate to="/auth" />
              } />

              {/* Raíz: Super admins a /admin, resto según estado de sesión */}
              <Route path="/" element={
                <Navigate to={isSuperAdmin ? '/admin' : user ? '/dashboard' : '/auth'} />
              } />

              {/* Panel Super Admin: gestiona su propia autenticación internamente */}
              <Route path="/admin" element={<SuperAdmin />} />

              {/* Perfiles públicos de clientes */}
              <Route path="/:username" element={<PublicProfile />} />

              {/* ⚠️ Rutas de varios segmentos. Hacen falta por dos motivos:
                  1) Hay perfiles cuyo nombre de usuario contiene una BARRA
                     (p. ej. "marcelo/mariapaz"). Su URL tiene dos segmentos y
                     no encajaba en NINGUNA ruta; como tampoco había comodín,
                     React no dibujaba nada y el visitante veía una PANTALLA EN
                     BLANCO. PublicProfile resuelve el perfil con la ruta
                     completa, así que ahora sí lo encuentra.
                  2) Cualquier otra dirección equivocada deja de ser una página
                     en blanco y muestra el aviso de "perfil no encontrado". */}
              <Route path="/:username/*" element={<PublicProfile />} />
            </Routes>
            </Suspense>
          </BrowserRouter>
        </div>
      </LanguageProvider>
    </ThemeProvider>
  );
}

export default App;