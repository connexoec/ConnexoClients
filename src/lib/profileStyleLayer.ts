/**
 * Capa de estilos configurables que se aplica sobre CUALQUIER plantilla.
 *
 * Los ajustes estructurales de Apariencia (estilo de botón, sombra, borde)
 * viven en clases de Tailwind repartidas por cada plantilla, así que no se
 * pueden cablear campo por campo sin reescribir cientos de `className`. En su
 * lugar, el contenedor raíz recibe unas clases marcadoras y unas variables
 * CSS, y unas pocas reglas globales (en index.html) las aplican a los botones
 * y enlaces del perfil.
 *
 * ⚠️ Propiedad de seguridad: **si el cliente no eligió nada, no se emite
 * ninguna clase ni variable**. Un perfil que nunca tocó Apariencia se dibuja
 * exactamente igual que antes de existir esta capa. Todo lo que cambia el
 * aspecto es una elección explícita del dueño del perfil.
 */

export interface ProfileStyleLayer {
    className: string;
    style: Record<string, string>;
}

const RADIUS_CLASS: Record<string, string> = {
    sharp: 'cnx-btn-sharp',
    pills: 'cnx-btn-pills',
    // 'rounded' es el valor por defecto: no emite nada, cada plantilla
    // conserva sus propios redondeos.
};

const SHADOW_CLASS: Record<string, string> = {
    soft: 'cnx-shadow-soft',
    hard: 'cnx-shadow-hard',
    // 'none' tampoco emite nada, por el mismo motivo.
};

export const profileStyleLayer = (profile: any): ProfileStyleLayer => {
    const classes: string[] = [];
    const style: Record<string, string> = {};

    const radius = RADIUS_CLASS[String(profile?.buttonStyle || '')];
    if (radius) classes.push(radius);

    const shadow = SHADOW_CLASS[String(profile?.shadow || '')];
    if (shadow) classes.push(shadow);

    const width = Number(profile?.borderWidth) || 0;
    if (width > 0) {
        classes.push('cnx-bordered');
        style['--cnx-border-width'] = `${Math.min(width, 10)}px`;
        // Sin color elegido se usa el acento del propio perfil, y si tampoco
        // hay, el color de texto heredado: nunca un color inventado.
        style['--cnx-border-color'] = profile?.borderColor || profile?.buttonColor || 'currentColor';
    }

    // Color del texto de los botones. Alcance: los mismos botones y enlaces
    // que el resto de la capa, para que el conjunto quede coherente.
    if (profile?.buttonTextColor) {
        classes.push('cnx-btn-text');
        style['--cnx-btn-text'] = profile.buttonTextColor;
    }

    // Colores de texto de productos y testimonios (plan PRO). Se aplican por
    // variable para que cada plantilla los use donde le corresponda, sin
    // tocar el resto de sus textos.
    if (profile?.productsTextColor) {
        classes.push('cnx-products-text');
        style['--cnx-products-text'] = profile.productsTextColor;
    }
    if (profile?.testimonialsTextColor) {
        classes.push('cnx-testimonials-text');
        style['--cnx-testimonials-text'] = profile.testimonialsTextColor;
    }

    return { className: classes.join(' '), style };
};
