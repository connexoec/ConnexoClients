/**
 * Qué controles de Apariencia honra REALMENTE cada plantilla.
 *
 * Hasta ahora el panel ofrecía la paleta completa a los 9 temas por igual,
 * pero cada plantilla aplica un subconjunto distinto: el cliente cambiaba
 * "color de texto" en gastronomía, o el "modo oscuro" en cualquiera, y no
 * pasaba nada. Este mapa es la única fuente de verdad de esa correspondencia:
 * Apariencia esconde lo que la plantilla no va a aplicar.
 *
 * ⚠️ Regla para mantenerlo: un campo sólo se marca aquí si la plantilla LEE
 * `profile.<campo>` y lo pinta. Si añades soporte en una plantilla, añádelo
 * aquí; si lo quitas, quítalo. Un mapa mentiroso reintroduce justo el
 * problema que este archivo existe para eliminar.
 */

export type StyleField =
    | 'backgroundColor'
    | 'buttonColor'
    | 'buttonTextColor'
    | 'textColor'
    | 'productsTextColor'
    | 'testimonialsTextColor'
    | 'fontFamily'
    | 'buttonStyle'
    | 'borderColor'
    | 'borderWidth'
    | 'shadow'
    | 'darkMode'
    | 'showSchedule'
    | 'bookingLink';

/** Todos los campos de estilo, para poder limpiarlos de una sola pasada. */
export const ALL_STYLE_FIELDS: StyleField[] = [
    'backgroundColor', 'buttonColor', 'buttonTextColor', 'textColor',
    'productsTextColor', 'testimonialsTextColor', 'fontFamily',
    'buttonStyle', 'borderColor', 'borderWidth', 'shadow', 'darkMode',
];

type Theme = 'default' | 'barber' | 'gastro' | 'ecom' | 'stage'
    | 'petcare' | 'medical' | 'realty' | 'sublima';

const normalize = (theme?: string): Theme => {
    const t = (theme || 'default') as Theme;
    return ([
        'default', 'barber', 'gastro', 'ecom', 'stage',
        'petcare', 'medical', 'realty', 'sublima',
    ] as Theme[]).includes(t) ? t : 'default';
};

/**
 * Campos que cada plantilla aplica de verdad, verificado contra su render.
 *
 * Notas de las que no son obvias:
 *  - `darkMode` no aparece en ninguna: ninguna plantilla lo lee, así que el
 *    interruptor no se muestra en ningún caso.
 *  - En `stage` el acento sale de `borderColor`, no de `buttonColor`
 *    (ProfileStageTemplate.tsx: `const accent = profile?.borderColor || ...`).
 *  - `realty` y `sublima` tienen identidad de marca fija (champagne gold),
 *    así que sólo dejan configurar el fondo.
 */
/** Paleta, tipografía y ajustes de botón: funcionan en las 9 plantillas. */
const COMUNES: StyleField[] = [
    'backgroundColor', 'buttonColor', 'buttonTextColor', 'textColor', 'fontFamily',
    'buttonStyle', 'shadow', 'borderColor', 'borderWidth',
    'productsTextColor',
];

/** Testimonios: sólo donde la plantilla dibuja esa sección. */
const CON_TESTIMONIOS: StyleField[] = ['testimonialsTextColor'];

const CAPABILITIES: Record<Theme, StyleField[]> = {
    default: [...COMUNES, ...CON_TESTIMONIOS, 'showSchedule', 'bookingLink'],
    barber: [...COMUNES, ...CON_TESTIMONIOS, 'showSchedule', 'bookingLink'],
    gastro: [...COMUNES, ...CON_TESTIMONIOS, 'showSchedule', 'bookingLink'],
    ecom: [...COMUNES, ...CON_TESTIMONIOS, 'showSchedule'],
    // En stage el neón sale de `borderColor` (así fue desde v0.26.0);
    // `buttonColor` actúa de respaldo para quien no lo tenga configurado.
    stage: [...COMUNES, 'bookingLink'],
    petcare: [...COMUNES, ...CON_TESTIMONIOS, 'showSchedule', 'bookingLink'],
    medical: [...COMUNES, ...CON_TESTIMONIOS, 'showSchedule', 'bookingLink'],
    // realty y sublima no dibujan sección de testimonios.
    realty: [...COMUNES],
    sublima: [...COMUNES],
};

/** ¿Esta plantilla aplica este control? */
export const supportsStyle = (theme: string | undefined, field: StyleField): boolean =>
    CAPABILITIES[normalize(theme)].includes(field);

/** Lista completa de controles que la plantilla honra (para contar/avisar). */
export const supportedStyles = (theme?: string): StyleField[] => CAPABILITIES[normalize(theme)];

/**
 * Colores con los que se ve cada plantilla cuando el cliente no ha tocado nada.
 *
 * ⚠️ Son sólo para MOSTRAR en los selectores: al restaurar no se escriben
 * estos valores, se **vacían** los campos, y así la plantilla vuelve a usar
 * sus propios respaldos. Escribir un hex a mano correría el riesgo de que se
 * desviara del respaldo real y el "restaurar" dejara un color distinto al
 * de fábrica. Aquí sólo se refleja lo que ya usa cada plantilla.
 */
export const THEME_DEFAULT_COLORS: Record<Theme, Partial<Record<StyleField, string>>> = {
    default: {
        backgroundColor: '#080604',   // PublicProfile.tsx: contenedor raíz
        buttonColor: '#ff6b35',
        buttonTextColor: '#ffffff',
        textColor: '#ffffff',
        productsTextColor: '#ffffff',
        testimonialsTextColor: '#ffffff',
        borderColor: '#ff6b35',
        fontFamily: "'Space Grotesk', sans-serif",
    },
    barber: {
        backgroundColor: '#050505', buttonColor: '#ff6600',
        buttonTextColor: '#ffffff', textColor: '#ffefe5',
        fontFamily: "'Space Grotesk', sans-serif",
    },
    gastro: {
        backgroundColor: '#060200', buttonColor: '#ff6b35', textColor: '#ffffff',
        fontFamily: "'Space Grotesk', sans-serif",
    },
    ecom: {
        backgroundColor: '#090e14', buttonColor: '#00e5a0', textColor: '#f0f4f8',
        fontFamily: "'Space Grotesk', sans-serif",
    },
    stage: {
        backgroundColor: '#06060c',
        borderColor: '#22d3ee',       // acento neón de la plantilla
        buttonColor: '#22d3ee',
        textColor: '#ffffff',
        fontFamily: "'Space Grotesk', sans-serif",
    },
    petcare: {
        backgroundColor: '#02100f', buttonColor: '#0ea5a4', textColor: '#ffffff',
        fontFamily: "'Space Grotesk', sans-serif",
    },
    medical: {
        backgroundColor: '#020813', buttonColor: '#2563eb', textColor: '#ffffff',
        fontFamily: "'Space Grotesk', sans-serif",
    },
    realty: {
        backgroundColor: '#141210', buttonColor: '#c9a86a', textColor: '#f2ece1',
        fontFamily: "'Space Grotesk', sans-serif",
    },
    sublima: {
        backgroundColor: '#141210', buttonColor: '#c9a86a', textColor: '#f2ece1',
        buttonTextColor: '#141210',
        fontFamily: "'Space Grotesk', sans-serif",
    },
};

/** Color por defecto de un campo en esa plantilla (para pintar el selector). */
export const defaultStyleValue = (theme: string | undefined, field: StyleField): string =>
    THEME_DEFAULT_COLORS[normalize(theme)][field] || '';

/**
 * Objeto a mezclar en el perfil para volver al aspecto de fábrica.
 * Vacía TODOS los campos de estilo (no sólo los que la plantilla usa hoy):
 * así, si el perfil cambia de plantilla más adelante, no reaparece un color
 * viejo que el cliente ya había descartado.
 */
export const resetStylesPatch = (): Record<string, null> => {
    const patch: Record<string, null> = {};
    for (const f of ALL_STYLE_FIELDS) patch[f] = null;
    return patch;
};
