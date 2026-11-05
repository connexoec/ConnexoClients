/**
 * Guarda de legibilidad del «color de texto de botones» (Apariencia).
 *
 * La regla global `.cnx-btn-text` (index.html) pinta TODOS los botones y píldoras del perfil con un solo
 * color de texto. Eso está bien en los botones rellenos con el acento (para eso se eligió), pero deja el
 * texto ilegible en los botones «de vidrio» (fondo casi transparente sobre una página oscura) cuando el
 * color elegido es oscuro: oscuro sobre oscuro.
 *
 * Esta guarda mira, botón por botón, el fondo REAL sobre el que quedaría el texto y, si el color forzado no
 * se leería (razón < 3:1), marca el botón con `data-cnx-keep`; la regla CSS lo respeta y el botón conserva
 * el color que le puso su plantilla.
 *
 * Fallo seguro: si algo no se puede medir (foto de fondo, color en un formato desconocido, error) el botón
 * NO se marca y se comporta exactamente como antes de existir esta guarda.
 */

const SELECTOR = '.cnx-btn-text button, .cnx-btn-text a[class*="rounded"], .cnx-btn-text a[class*="px-"]';
const MIN_RAZON = 3;

type RGBA = [number, number, number, number];

const parseColor = (s: string): RGBA | null => {
    s = s.trim();
    let m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
    if (m) {
        let h = m[1];
        if (h.length === 3) h = h.split('').map((c) => c + c).join('');
        const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), a];
    }
    m = s.match(/^rgba?\(([^)]+)\)$/i);
    if (m) {
        const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
        if (p.length >= 3 && p.every((n) => Number.isFinite(n))) return [p[0], p[1], p[2], p[3] ?? 1];
        return null;
    }
    m = s.match(/^color\(srgb ([^)]+)\)$/i);
    if (m) {
        const p = m[1].split(/[ /]+/).filter(Boolean).map(Number);
        if (p.length >= 3 && p.every((n) => Number.isFinite(n))) return [p[0] * 255, p[1] * 255, p[2] * 255, p[3] ?? 1];
    }
    return null;
};

const over = (f: RGBA, b: RGBA): RGBA => [
    f[0] * f[3] + b[0] * (1 - f[3]),
    f[1] * f[3] + b[1] * (1 - f[3]),
    f[2] * f[3] + b[2] * (1 - f[3]),
    1,
];

const luminance = (c: RGBA) => {
    const [r, g, b] = c.slice(0, 3).map((v) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const ratio = (a: RGBA, b: RGBA) => {
    const x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/** Fondos posibles bajo el texto del elemento (varios si hay degradado). `null` = no medible (foto). */
const backgroundsUnder = (el: Element): RGBA[] | null => {
    const chain: Element[] = [];
    for (let e: Element | null = el; e; e = e.parentElement) chain.unshift(e);
    let bases: RGBA[] = [[255, 255, 255, 1]]; // lienzo por defecto del navegador
    for (const e of chain) {
        const cs = getComputedStyle(e);
        const bg = parseColor(cs.backgroundColor);
        if (bg && bg[3] > 0) bases = bases.map((b) => over(bg, b));
        const bi = cs.backgroundImage;
        if (bi && bi !== 'none') {
            if (!/gradient/.test(bi)) return null; // foto: no se mide
            const stops = [...bi.matchAll(/rgba?\([^)]+\)|color\(srgb [^)]+\)/g)].map((x) => parseColor(x[0])).filter(Boolean) as RGBA[];
            if (stops.length) bases = stops.flatMap((s) => bases.map((b) => over(s, b)));
        }
    }
    return bases;
};

const evaluate = (el: HTMLElement) => {
    try {
        const root = el.closest('.cnx-btn-text') as HTMLElement | null;
        if (!root) return;
        const forced = parseColor(getComputedStyle(root).getPropertyValue('--cnx-btn-text'));
        if (!forced) return; // formato desconocido: comportamiento de siempre
        const fondos = backgroundsUnder(el);
        if (!fondos) { el.removeAttribute('data-cnx-keep'); return; }
        const legible = fondos.every((b) => ratio(over(forced, b), b) >= MIN_RAZON);
        if (legible) el.removeAttribute('data-cnx-keep');
        else el.setAttribute('data-cnx-keep', '1');
    } catch {
        el.removeAttribute('data-cnx-keep');
    }
};

const scan = () => {
    document.querySelectorAll<HTMLElement>(SELECTOR).forEach(evaluate);
};

let installed = false;
let pending = false;

/** Se instala una sola vez, al primer perfil que usa `buttonTextColor`. Seguro de llamar durante el render. */
export const installButtonTextGuard = () => {
    if (installed || typeof window === 'undefined' || typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
    installed = true;
    const schedule = () => {
        if (pending) return;
        pending = true;
        const run = () => { pending = false; scan(); };
        // Microtarea: corre antes del siguiente pintado, así el botón nunca se ve con el color malo.
        if (typeof queueMicrotask === 'function') queueMicrotask(run); else Promise.resolve().then(run);
    };
    const start = () => {
        new MutationObserver(schedule).observe(document.body, {
            childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'],
        });
        schedule();
    };
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start, { once: true });
};
