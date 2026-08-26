import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../contexts/LanguageContext';

/**
 * Tour guiado del panel: foco recortado sobre el elemento real + tarjeta HUD
 * con la explicación, al estilo de un "feature walkthrough" de videojuego.
 *
 * Reglas que respeta por diseño:
 *  - No conoce planes ni plantillas. Recibe los pasos ya armados desde el
 *    panel, que los deriva del mismo array `tabs` que dibuja la navegación.
 *    Si una pestaña no existe para ese cliente, tampoco existe su paso: el
 *    plan-gating no se duplica aquí, así que no puede desincronizarse.
 *  - No mueve al usuario de pestaña ni toca sus datos. Sólo resalta y explica.
 *  - Se dibuja con createPortal sobre <body>: cualquier ancestro con
 *    `transform` o `filter` rompería el posicionamiento fijo del foco.
 *  - Nada puede sobresalir del viewport. En móvil los extremos de la barra
 *    inferior quedan pegados al borde y el recorte del foco se salía de la
 *    pantalla, así que todo se acota contra el ancho y alto reales.
 */

export interface TourStep {
    /** Valor de `data-tour` del elemento a resaltar. Sin él, la tarjeta va centrada. */
    anchor?: string;
    titleKey: any;
    bodyKey: any;
}

interface OnboardingTourProps {
    isActive: boolean;
    steps: TourStep[];
    /** Cierra el tour y lo marca como visto (terminado o saltado). */
    onClose: () => void;
}

const ACCENT = '#ff6b35';
const GAP = 14;
const PADDING = 7;
/** Esquinas cortadas de la tarjeta: el detalle que da el aire de interfaz táctica. */
const CLIP = 'polygon(15px 0, 100% 0, 100% calc(100% - 15px), calc(100% - 15px) 100%, 0 100%, 0 15px)';

const KEYFRAMES = `
@keyframes cnxTourFade { from { opacity: 0 } to { opacity: 1 } }
@keyframes cnxTourPulse { 0%, 100% { opacity: .45 } 50% { opacity: 1 } }
@keyframes cnxTourScan { 0% { transform: translateY(-8px) } 100% { transform: translateY(var(--cnx-scan-h, 60px)) } }
@keyframes cnxTourSweep { 0% { transform: translateX(-100%) } 100% { transform: translateX(220%) } }
@media (prefers-reduced-motion: reduce) {
  .cnx-tour-anim { animation: none !important }
}
`;

/**
 * Un mismo `data-tour` existe dos veces: en la barra lateral de escritorio y
 * en la navegación inferior móvil. Sólo una de las dos está dibujada, así que
 * elegimos la que realmente ocupa espacio (`display:none` mide 0x0).
 */
const findTarget = (anchor?: string): HTMLElement | null => {
    if (!anchor) return null;
    try {
        const nodes = Array.from(
            document.querySelectorAll<HTMLElement>(`[data-tour="${anchor}"]`)
        );
        return nodes.find(el => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
        }) || null;
    } catch {
        return null;
    }
};

export const OnboardingTour: React.FC<OnboardingTourProps> = ({ isActive, steps, onClose }) => {
    const { t } = useLanguage();
    const [index, setIndex] = useState(0);
    const [rect, setRect] = useState<DOMRect | null>(null);
    // Pasos realmente visibles en esta pantalla: algunos botones del encabezado
    // se ocultan en móvil, y no se explica lo que no se ve.
    const [visibleSteps, setVisibleSteps] = useState<TourStep[]>([]);

    const total = visibleSteps.length;
    const step = visibleSteps[index];
    const isLast = index >= total - 1;

    // ── Pasos disponibles ────────────────────────────────────────────────────
    useEffect(() => {
        if (!isActive) return;
        const compute = () => {
            setVisibleSteps(steps.filter(s => !s.anchor || !!findTarget(s.anchor)));
        };
        compute();
        window.addEventListener('resize', compute);
        return () => window.removeEventListener('resize', compute);
    }, [isActive, steps]);

    // Cada vez que se abre, empieza de cero.
    useEffect(() => {
        if (isActive) setIndex(0);
    }, [isActive]);

    // Si la lista se acorta (giro de pantalla), el índice no puede quedar fuera.
    useEffect(() => {
        setIndex(i => (total > 0 ? Math.min(i, total - 1) : 0));
    }, [total]);

    // ── Posición del foco ────────────────────────────────────────────────────
    useLayoutEffect(() => {
        if (!isActive || !step) return;

        const update = () => {
            const el = findTarget(step.anchor);
            setRect(el ? el.getBoundingClientRect() : null);
        };

        const el = findTarget(step.anchor);
        // La barra lateral tiene scroll propio cuando hay muchas pestañas.
        el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
        update();
        // Volvemos a medir cuando el desplazamiento suave ya terminó.
        const settle = window.setTimeout(update, 340);

        window.addEventListener('resize', update);
        window.addEventListener('scroll', update, true);
        return () => {
            window.clearTimeout(settle);
            window.removeEventListener('resize', update);
            window.removeEventListener('scroll', update, true);
        };
    }, [isActive, step, index]);

    // ── Navegación ───────────────────────────────────────────────────────────
    // `onClose` cambia el estado del panel, así que NO puede vivir dentro del
    // actualizador de setIndex: los actualizadores corren en fase de render y
    // React avisa ("Cannot update a component while rendering a different
    // component"). Se decide antes y se actualiza después.
    const goNext = useCallback(() => {
        if (index + 1 >= total) { onClose(); return; }
        setIndex(i => i + 1);
    }, [index, total, onClose]);

    const goPrev = useCallback(() => setIndex(i => Math.max(0, i - 1)), []);

    useEffect(() => {
        if (!isActive) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.preventDefault(); onClose(); }
            else if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goNext(); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isActive, goNext, goPrev, onClose]);

    if (!isActive || !step || total === 0) return null;

    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = window.innerHeight;

    // ── Foco, acotado al viewport ────────────────────────────────────────────
    // Sin este recorte, un botón pegado al borde (los extremos de la barra
    // inferior en móvil) empujaba el marco fuera de la pantalla.
    let focus: { x: number; y: number; w: number; h: number } | null = null;
    if (rect) {
        const x = Math.max(0, rect.left - PADDING);
        const y = Math.max(0, rect.top - PADDING);
        focus = {
            x, y,
            w: Math.max(0, Math.min(rect.right + PADDING, vw) - x),
            h: Math.max(0, Math.min(rect.bottom + PADDING, vh) - y),
        };
    }

    // ── Colocación de la tarjeta ─────────────────────────────────────────────
    const cardW = Math.min(340, vw - 2 * GAP);
    const cardStyle: React.CSSProperties = { width: `${cardW}px` };
    let maxH = vh - 2 * GAP;

    if (!focus) {
        cardStyle.left = '50%';
        cardStyle.top = '50%';
        cardStyle.transform = 'translate(-50%, -50%)';
        maxH = vh - 4 * GAP;
    } else {
        const below = vh - (focus.y + focus.h) - 2 * GAP;
        const above = focus.y - 2 * GAP;
        // Anclamos por `bottom` cuando va arriba: así no hace falta medir la
        // altura de la tarjeta antes de pintarla.
        if (below >= 200 || below >= above) {
            cardStyle.top = `${focus.y + focus.h + GAP}px`;
            maxH = below;
        } else {
            cardStyle.bottom = `${vh - focus.y + GAP}px`;
            maxH = above;
        }
        const centered = focus.x + focus.w / 2 - cardW / 2;
        cardStyle.left = `${Math.max(GAP, Math.min(centered, vw - cardW - GAP))}px`;
    }
    maxH = Math.max(150, Math.min(maxH, vh - 2 * GAP));

    const pad = (n: number) => String(n).padStart(2, '0');
    const mono = '"SF Mono", "Roboto Mono", Menlo, Consolas, monospace';

    // Escuadras de esquina del foco.
    const bracket = (pos: 'tl' | 'tr' | 'bl' | 'br'): React.CSSProperties => {
        const size = Math.min(15, Math.max(7, (focus ? Math.min(focus.w, focus.h) : 20) / 2.4));
        const on = `2px solid ${ACCENT}`;
        const base: React.CSSProperties = {
            position: 'absolute', width: `${size}px`, height: `${size}px`, pointerEvents: 'none',
        };
        if (pos === 'tl') return { ...base, top: -2, left: -2, borderTop: on, borderLeft: on };
        if (pos === 'tr') return { ...base, top: -2, right: -2, borderTop: on, borderRight: on };
        if (pos === 'bl') return { ...base, bottom: -2, left: -2, borderBottom: on, borderLeft: on };
        return { ...base, bottom: -2, right: -2, borderBottom: on, borderRight: on };
    };

    const hudButton = (label: string, onClick: () => void, primary: boolean): React.ReactNode => (
        <button
            onClick={onClick}
            style={{
                flex: primary ? 1 : undefined,
                padding: primary ? '11px 18px' : '11px 14px',
                cursor: 'pointer', border: 'none',
                clipPath: 'polygon(9px 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%, 0 9px)',
                fontSize: '10.5px', fontWeight: 900, letterSpacing: '1.4px',
                textTransform: 'uppercase', fontFamily: mono,
                color: primary ? '#150a03' : 'rgba(255,255,255,.62)',
                background: primary
                    ? `linear-gradient(135deg, ${ACCENT} 0%, #ff9356 100%)`
                    : 'rgba(255,255,255,.05)',
                boxShadow: primary ? `0 0 18px ${ACCENT}55` : 'inset 0 0 0 1px rgba(255,255,255,.09)',
            }}
        >
            {label}
        </button>
    );

    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-label={t('tour_restart')}
            onClick={goNext}
            style={{
                position: 'fixed', inset: 0, zIndex: 9999,
                // Nada puede sobresalir: en móvil el marco de un botón del borde
                // provocaba desplazamiento horizontal de la página.
                overflow: 'hidden',
                // Sin foco el velo lo pone este contenedor; con foco lo pone la
                // sombra expandida del recorte, para dejar el hueco transparente.
                background: focus ? 'transparent' : 'rgba(4,2,0,0.88)',
                cursor: 'pointer',
                animation: 'cnxTourFade .18s ease-out',
            }}
        >
            <style>{KEYFRAMES}</style>

            {focus && (
                <>
                    {/* Halo exterior que respira */}
                    <div
                        className="cnx-tour-anim"
                        style={{
                            position: 'fixed',
                            top: focus.y - 5, left: focus.x - 5,
                            width: focus.w + 10, height: focus.h + 10,
                            borderRadius: '15px',
                            border: `1px solid ${ACCENT}`,
                            opacity: .5, pointerEvents: 'none', zIndex: 1,
                            animation: 'cnxTourPulse 1.9s ease-in-out infinite',
                        }}
                    />
                    {/* Recorte: la sombra expandida es la que oscurece todo lo demás */}
                    <div
                        style={{
                            position: 'fixed',
                            top: focus.y, left: focus.x, width: focus.w, height: focus.h,
                            borderRadius: '11px',
                            border: `1.5px solid ${ACCENT}`,
                            boxShadow: `0 0 0 9999px rgba(4,2,0,0.88), 0 0 26px ${ACCENT}70, inset 0 0 20px ${ACCENT}1f`,
                            pointerEvents: 'none', zIndex: 2,
                            transition: 'top .22s ease, left .22s ease, width .22s ease, height .22s ease',
                        }}
                    >
                        {/* Línea de barrido dentro del foco */}
                        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: '10px' }}>
                            <div
                                className="cnx-tour-anim"
                                style={{
                                    ['--cnx-scan-h' as any]: `${focus.h}px`,
                                    position: 'absolute', left: 0, right: 0, height: '2px',
                                    background: `linear-gradient(90deg, transparent, ${ACCENT}, transparent)`,
                                    opacity: .65,
                                    animation: 'cnxTourScan 2.4s linear infinite',
                                }}
                            />
                        </div>
                        <span style={bracket('tl')} />
                        <span style={bracket('tr')} />
                        <span style={bracket('bl')} />
                        <span style={bracket('br')} />
                    </div>
                </>
            )}

            {/* ── Tarjeta HUD ── */}
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    position: 'fixed', zIndex: 3, cursor: 'default',
                    filter: `drop-shadow(0 20px 45px rgba(0,0,0,.8)) drop-shadow(0 0 22px ${ACCENT}33)`,
                    animation: 'cnxTourFade .22s ease-out',
                    ...cardStyle,
                }}
            >
                {/* Capa de borde: el corte angular impide usar `border` normal */}
                <div style={{
                    clipPath: CLIP,
                    background: `linear-gradient(150deg, ${ACCENT}cc 0%, ${ACCENT}33 40%, rgba(255,255,255,.07) 100%)`,
                    padding: '1px',
                }}>
                    <div style={{
                        clipPath: CLIP,
                        background: 'linear-gradient(155deg, #1c1206 0%, #0d0703 55%, #120a04 100%)',
                        position: 'relative',
                        maxHeight: `${maxH}px`,
                        overflowY: 'auto',
                    }}>
                        {/* Rejilla de líneas: textura de pantalla técnica */}
                        <div style={{
                            position: 'absolute', inset: 0, pointerEvents: 'none', opacity: .5,
                            background: 'repeating-linear-gradient(0deg, rgba(255,255,255,.028) 0 1px, transparent 1px 4px)',
                        }} />
                        {/* Destello que recorre el borde superior */}
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1.5px', overflow: 'hidden' }}>
                            <div
                                className="cnx-tour-anim"
                                style={{
                                    width: '45%', height: '100%',
                                    background: `linear-gradient(90deg, transparent, ${ACCENT}, transparent)`,
                                    animation: 'cnxTourSweep 3.2s ease-in-out infinite',
                                }}
                            />
                        </div>

                        <div style={{ position: 'relative', padding: '15px 17px 16px' }}>
                            {/* Cabecera técnica */}
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                gap: '10px', paddingBottom: '9px', marginBottom: '11px',
                                borderBottom: '1px solid rgba(255,255,255,.07)',
                            }}>
                                <span style={{
                                    display: 'flex', alignItems: 'center', gap: '7px',
                                    fontSize: '9.5px', fontWeight: 900, letterSpacing: '2.2px',
                                    color: ACCENT, fontFamily: mono,
                                }}>
                                    <span style={{
                                        width: '5px', height: '5px', background: ACCENT,
                                        transform: 'rotate(45deg)', boxShadow: `0 0 7px ${ACCENT}`,
                                    }} />
                                    {pad(index + 1)}<span style={{ opacity: .35 }}>/{pad(total)}</span>
                                </span>
                                <button
                                    onClick={onClose}
                                    style={{
                                        background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0',
                                        fontSize: '9.5px', fontWeight: 800, letterSpacing: '1.5px',
                                        textTransform: 'uppercase', color: 'rgba(255,255,255,.3)', fontFamily: mono,
                                    }}
                                >
                                    {t('tour_skip')} ✕
                                </button>
                            </div>

                            <h3 className="font-tomorrow" style={{
                                fontStyle: 'italic', fontWeight: 900, fontSize: '17px', lineHeight: 1.15,
                                textTransform: 'uppercase', color: '#fff', margin: '0 0 9px',
                                textShadow: `0 0 18px ${ACCENT}4d`,
                            }}>
                                {t(step.titleKey)}
                            </h3>

                            <p style={{
                                fontSize: '12.5px', lineHeight: 1.6, color: 'rgba(255,255,255,.6)', margin: '0 0 15px',
                            }}>
                                {t(step.bodyKey)}
                            </p>

                            {/* Progreso por muescas */}
                            <div style={{ display: 'flex', gap: '2px', marginBottom: '14px' }}>
                                {visibleSteps.map((_, i) => (
                                    <span key={i} style={{
                                        flex: 1, height: '3px',
                                        transform: 'skewX(-24deg)',
                                        background: i < index ? `${ACCENT}80` : i === index ? ACCENT : 'rgba(255,255,255,.09)',
                                        boxShadow: i === index ? `0 0 8px ${ACCENT}` : 'none',
                                        transition: 'background .2s ease',
                                    }} />
                                ))}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                                {index > 0 && hudButton(t('tour_back'), goPrev, false)}
                                {hudButton(isLast ? t('tour_finish') : t('tour_next'), goNext, true)}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default OnboardingTour;
