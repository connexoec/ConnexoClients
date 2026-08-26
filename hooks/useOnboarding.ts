import { useCallback, useEffect, useState } from 'react';

/**
 * Estado del tour guiado del panel (onboarding interactivo).
 *
 * Sólo se ocupa de tres cosas: si el tour está abierto, arrancarlo la primera
 * vez que el cliente entra, y recordar que ya lo vio. Los pasos y su dibujo
 * viven en <OnboardingTour />, que es quien conoce el DOM.
 *
 * La marca de "ya visto" es por usuario (no global del navegador): si dos
 * clientes usan el mismo equipo, cada uno recibe su propio tour la primera vez.
 */

const KEY_PREFIX = 'cnx_onboarding_v1_';

const storageKey = (userId?: string) => `${KEY_PREFIX}${userId || 'anon'}`;

export const hasSeenOnboarding = (userId?: string): boolean => {
    try {
        return localStorage.getItem(storageKey(userId)) === 'done';
    } catch {
        // Navegador sin storage (modo privado, permisos): damos el tour por
        // visto para no relanzarlo en cada carga, que sería peor experiencia.
        return true;
    }
};

export const markOnboardingSeen = (userId?: string): void => {
    try {
        localStorage.setItem(storageKey(userId), 'done');
    } catch { /* noop */ }
};

interface OnboardingState {
    isActive: boolean;
    /** Relanzar el tour a voluntad (botón de ayuda del encabezado). */
    start: () => void;
    /** Cerrar y marcar como visto. */
    stop: () => void;
}

/**
 * @param userId  usuario autenticado; la marca de visto se guarda contra él.
 * @param ready   el panel ya cargó el perfil (las pestañas ya existen en el DOM).
 */
export function useOnboarding(userId: string | undefined, ready: boolean): OnboardingState {
    const [isActive, setIsActive] = useState(false);

    // Arranque automático la primera vez. Se espera a que el perfil cargue
    // porque las pestañas dependen del plan y de la plantilla: lanzarlo antes
    // apuntaría a botones que todavía no están montados.
    useEffect(() => {
        if (!ready || !userId) return;
        if (hasSeenOnboarding(userId)) return;
        const id = window.setTimeout(() => setIsActive(true), 700);
        return () => window.clearTimeout(id);
    }, [ready, userId]);

    const start = useCallback(() => setIsActive(true), []);

    const stop = useCallback(() => {
        setIsActive(false);
        markOnboardingSeen(userId);
    }, [userId]);

    return { isActive, start, stop };
}
