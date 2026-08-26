import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../src/lib/supabase';

const EyeIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
);
const ClickIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M9 9l5 12 1.774-5.226L21 14 9 9z"/><path d="M16.071 16.071l4.243 4.243"/>
    </svg>
);
const ChartIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
);
const LinkIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
        <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
    </svg>
);
const FireIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 01-7 7 7 7 0 01-7-7c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z"/>
    </svg>
);
const LockIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
    </svg>
);

const DAYS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
const HOURS = [0,2,4,6,8,10,12,14,16,18,20,22];

/**
 * Agrupa los eventos reales en la cuadrícula 7 días × 12 franjas de 2 horas.
 *
 * Antes esto era `heatVal()`, una función seno sembrada con el id del perfil:
 * dibujaba un mapa convincente para CUALQUIER perfil, sin ninguna relación con
 * el tráfico real. Ahora cada celda es el conteo verdadero de visitas y clics
 * en esa franja, ya convertido a la zona horaria del dueño por la RPC.
 */
function buildHeatGrid(heatmap: { d: number; h: number; n: number }[]) {
    // grid[día][índice de franja de 2h]
    const grid: number[][] = Array.from({ length: 7 }, () => Array(HOURS.length).fill(0));
    for (const cell of heatmap || []) {
        const d = Number(cell?.d), h = Number(cell?.h), n = Number(cell?.n) || 0;
        if (!Number.isInteger(d) || d < 0 || d > 6) continue;
        if (!Number.isInteger(h) || h < 0 || h > 23) continue;
        grid[d][Math.floor(h / 2)] += n;   // 0-1h → franja 0, 2-3h → franja 1, …
    }
    const max = Math.max(0, ...grid.flat());
    return { grid, max };
}

const HOUR_LABEL = (h: number) => (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`);

/** Día más activo, franja pico y mejor momento — calculados, no escritos a mano. */
function buildInsights(grid: number[][], max: number) {
    if (max === 0) return null;

    const perDay = grid.map(row => row.reduce((a, b) => a + b, 0));
    const bestDay = perDay.indexOf(Math.max(...perDay));

    const perSlot = HOURS.map((_, i) => grid.reduce((a, row) => a + row[i], 0));
    const bestSlot = perSlot.indexOf(Math.max(...perSlot));

    let peakD = 0, peakS = 0, peakV = -1;
    grid.forEach((row, d) => row.forEach((v, s) => { if (v > peakV) { peakV = v; peakD = d; peakS = s; } }));

    const total = perDay.reduce((a, b) => a + b, 0);
    return {
        bestDay: DAYS[bestDay],
        bestDayShare: total > 0 ? Math.round((perDay[bestDay] / total) * 100) : 0,
        peakRange: `${HOUR_LABEL(HOURS[bestSlot])} — ${HOUR_LABEL((HOURS[bestSlot] + 2) % 24)}`,
        peakSlotEvents: perSlot[bestSlot],
        bestMoment: `${DAYS[peakD]} ${HOUR_LABEL(HOURS[peakS])}`,
        peakV,
    };
}

export const AnalyticsTab: React.FC<{
    profileData: any;
    user: any;
    analyticsData: any;
    userPlan: string;
}> = ({ profileData, user, analyticsData, userPlan }) => {
    const { t } = useLanguage();
    const [hoveredCell, setHoveredCell] = useState<{d:number,h:number} | null>(null);
    const isGastro = profileData?.theme === 'gastro' || profileData?.theme === 'petcare' || profileData?.theme === 'medical';

    const totalViews  = analyticsData?.totalViews  || 0;
    const totalClicks = analyticsData?.totalClicks || 0;
    const ctr = totalViews > 0 ? ((totalClicks / totalViews) * 100).toFixed(1) : '0.0';

    const isPro   = userPlan === 'pro'   || userPlan === 'ultra';
    const isUltra = userPlan === 'ultra';

    const accent = '#ff6b35';

    const { grid: heatGrid, max: heatMax } = useMemo(
        () => buildHeatGrid(analyticsData?.heatmap || []),
        [analyticsData?.heatmap]
    );
    const insights = useMemo(() => buildInsights(heatGrid, heatMax), [heatGrid, heatMax]);

    const kpis = [
        { label: t('total_views'),      value: totalViews.toLocaleString(),  sub: t('profile_visits'),   icon: <EyeIcon />,   color: '#3b82f6', glow: '59,130,246' },
        { label: t('total_clicks'),     value: totalClicks.toLocaleString(), sub: t('link_clicks'),      icon: <ClickIcon />, color: accent,    glow: '255,107,53' },
        { label: t('conversion_rate'),  value: `${ctr}%`,                    sub: t('ctr_rate'),         icon: <ChartIcon />, color: '#10b981', glow: '16,185,129' },
    ];

    const maxLinkClicks = Math.max(1, ...(analyticsData?.linkDetails || []).map((l: any) => l.clickCount || 0));

    return (
        <div className="w-full flex flex-col items-center justify-start px-4 overflow-x-clip pb-28 animate-fade-in-up"
             style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif" }}>
            <div className="w-full max-w-md md:max-w-3xl flex flex-col gap-5">

                {/* ── HERO ── */}
                <div style={{
                    position: 'relative', overflow: 'hidden',
                    background: 'linear-gradient(135deg, rgba(255,107,53,0.08) 0%, rgba(0,0,0,0) 60%, rgba(59,130,246,0.05) 100%)',
                    border: '1px solid rgba(255,107,53,0.15)',
                    borderRadius: '24px', padding: '28px 28px 22px',
                }}>
                    {/* grid lines */}
                    <div style={{
                        position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: '24px',
                        backgroundImage: 'linear-gradient(rgba(255,107,53,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,107,53,0.04) 1px, transparent 1px)',
                        backgroundSize: '32px 32px',
                    }} />
                    {/* glow orb */}
                    <div style={{
                        position: 'absolute', top: '-60px', right: '-60px',
                        width: '200px', height: '200px', borderRadius: '50%',
                        background: 'radial-gradient(circle, rgba(255,107,53,0.12) 0%, transparent 70%)',
                        pointerEvents: 'none',
                    }} />
                    <div style={{ position: 'relative' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: accent, display: 'inline-block', boxShadow: `0 0 8px ${accent}` }} className="animate-pulse" />
                            <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.22em', color: accent, textTransform: 'uppercase' }}>
                                {isUltra ? 'Ultra Analytics' : isPro ? 'Pro Analytics' : 'Analytics · Connexo'}
                            </span>
                        </div>
                        <h2 style={{ fontSize: '26px', fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-0.5px' }}>
                            {t('analytics_tab_title')}
                        </h2>
                        <p style={{ fontSize: '13px', color: 'rgba(255,239,229,0.5)', marginTop: '6px' }}>
                            {t('analytics_tab_desc')}
                        </p>
                    </div>
                </div>

                {/* Aviso si la RPC no existe todavía: sin esto la pestaña
                    mostraría ceros sin explicar por qué (que es exactamente lo
                    que venía pasando desde siempre). */}
                {analyticsData?.missingSetup && (
                    <div style={{
                        background: 'rgba(255,180,0,0.06)', border: '1px solid rgba(255,180,0,0.25)',
                        borderRadius: '14px', padding: '14px 16px', fontSize: '12px', color: 'rgba(255,220,150,0.9)',
                    }}>
                        <strong style={{ fontWeight: 800 }}>Falta activar las analíticas.</strong>{' '}
                        Ejecuta <code style={{ background: 'rgba(0,0,0,0.35)', padding: '1px 6px', borderRadius: '4px' }}>setup_analytics.sql</code> en el editor SQL de Supabase. Hasta entonces no se registran visitas ni clics.
                    </div>
                )}

                {/* ── KPI CARDS ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px' }}>
                    {kpis.map((k, i) => (
                        <div key={i} style={{
                            position: 'relative', overflow: 'hidden',
                            background: `rgba(${k.glow},0.06)`,
                            border: `1px solid rgba(${k.glow},0.18)`,
                            borderRadius: '18px', padding: '18px 14px',
                            transition: 'transform 0.2s, border-color 0.2s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
                        onMouseLeave={e => (e.currentTarget.style.transform = '')}>
                            <div style={{
                                position: 'absolute', top: '-30px', right: '-30px', width: '80px', height: '80px',
                                borderRadius: '50%',
                                background: `radial-gradient(circle, rgba(${k.glow},0.15) 0%, transparent 70%)`,
                                pointerEvents: 'none',
                            }} />
                            <div style={{
                                width: '34px', height: '34px', borderRadius: '10px',
                                background: `rgba(${k.glow},0.12)`,
                                border: `1px solid rgba(${k.glow},0.25)`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: k.color, marginBottom: '14px',
                            }}>
                                {k.icon}
                            </div>
                            <div style={{ fontSize: '28px', fontWeight: 900, color: '#fff', lineHeight: 1, letterSpacing: '-1px' }}>
                                {k.value}
                            </div>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.7)', marginTop: '4px' }}>{k.label}</div>
                            <div style={{ fontSize: '9px', fontWeight: 800, color: k.color, textTransform: 'uppercase', letterSpacing: '0.15em', marginTop: '2px' }}>{k.sub}</div>
                        </div>
                    ))}
                </div>

                {/* ── VENTAS (solo gastronomía) ── */}
                {isGastro && <GastroSalesPanel user={user} accent={accent} restaurantName={profileData?.displayName} isPetcare={profileData?.theme === 'petcare' || profileData?.theme === 'medical'} />}

                {/* ── LINK PERFORMANCE ── */}
                <div style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,107,53,0.1)',
                    borderRadius: '20px', overflow: 'hidden',
                }}>
                    <div style={{
                        padding: '18px 20px 14px',
                        borderBottom: '1px solid rgba(255,107,53,0.08)',
                        display: 'flex', alignItems: 'center', gap: '10px',
                    }}>
                        <div style={{
                            width: '32px', height: '32px', borderRadius: '9px',
                            background: 'rgba(255,107,53,0.1)', border: '1px solid rgba(255,107,53,0.2)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent,
                        }}>
                            <LinkIcon />
                        </div>
                        <span style={{ fontSize: '13px', fontWeight: 800, color: '#fff', letterSpacing: '0.02em' }}>
                            {t('link_performance')}
                        </span>
                    </div>
                    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {Array.isArray(analyticsData?.linkDetails) && analyticsData.linkDetails.length > 0 ? (
                            analyticsData.linkDetails.map((link: any, idx: number) => {
                                const pct = Math.round((link.clickCount / maxLinkClicks) * 100);
                                return (
                                    <div key={link.id} style={{
                                        display: 'flex', alignItems: 'center', gap: '12px',
                                        padding: '10px 12px', borderRadius: '12px',
                                        background: 'rgba(255,255,255,0.02)',
                                        border: '1px solid rgba(255,255,255,0.04)',
                                    }}>
                                        <div style={{
                                            width: '24px', height: '24px', borderRadius: '7px', flexShrink: 0,
                                            background: 'rgba(255,107,53,0.1)', border: '1px solid rgba(255,107,53,0.2)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '10px', fontWeight: 900, color: accent,
                                        }}>{idx + 1}</div>
                                        <span style={{ flex: 1, fontSize: '13px', color: 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {link.title}
                                        </span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                            <div style={{ width: '60px', height: '4px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                                                <div style={{ height: '100%', width: `${pct}%`, background: accent, borderRadius: '4px', transition: 'width 0.5s' }} />
                                            </div>
                                            <span style={{ fontSize: '12px', fontWeight: 800, color: accent, minWidth: '28px', textAlign: 'right' }}>
                                                {link.clickCount}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div style={{ padding: '32px', textAlign: 'center', color: 'rgba(255,255,255,0.2)' }}>
                                <div style={{ marginBottom: '10px', color: 'rgba(255,107,53,0.3)' }}><LinkIcon /></div>
                                <p style={{ fontSize: '13px' }}>{t('no_click_data')}</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── PRO: Dispositivos + Referrers ── */}
                {isPro && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        {/* Dispositivos */}
                        <div style={{
                            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,107,53,0.1)',
                            borderRadius: '18px', padding: '18px',
                        }}>
                            <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.18em', color: 'rgba(255,107,53,0.6)', textTransform: 'uppercase', marginBottom: '14px' }}>
                                {t('devices')}
                            </div>
                            {analyticsData?.deviceBreakdown ? (
                                ['mobile','desktop'].map((d) => {
                                    const val = analyticsData.deviceBreakdown[d] || 0;
                                    const pct = totalViews > 0 ? Math.round((val / totalViews) * 100) : 0;
                                    return (
                                        <div key={d} style={{ marginBottom: '10px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', textTransform: 'capitalize' }}>{t(d as any)}</span>
                                                <span style={{ fontSize: '12px', fontWeight: 800, color: '#fff' }}>{val}</span>
                                            </div>
                                            <div style={{ height: '3px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                                                <div style={{ height: '100%', width: `${pct}%`, background: accent, borderRadius: '3px' }} />
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.25)' }}>{t('no_data_available')}</p>
                            )}
                        </div>

                        {/* Referrers */}
                        <div style={{
                            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,107,53,0.1)',
                            borderRadius: '18px', padding: '18px',
                        }}>
                            <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.18em', color: 'rgba(255,107,53,0.6)', textTransform: 'uppercase', marginBottom: '14px' }}>
                                {t('traffic_sources')}
                            </div>
                            {analyticsData?.topReferrers?.length > 0 ? (
                                analyticsData.topReferrers.slice(0, 4).map((ref: any, i: number) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{ref.source}</span>
                                        <span style={{ fontSize: '12px', fontWeight: 800, color: accent }}>{ref.count}</span>
                                    </div>
                                ))
                            ) : (
                                <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.25)' }}>{t('no_data_available')}</p>
                            )}
                        </div>
                    </div>
                )}

                {/* ── ULTRA: Heatmap HUD ── */}
                {isUltra && (
                    <div style={{
                        position: 'relative', overflow: 'hidden',
                        background: 'rgba(0,0,0,0.4)',
                        border: '1px solid rgba(255,107,53,0.15)',
                        borderRadius: '20px',
                    }}>
                        {/* scanlines */}
                        <div style={{
                            position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: '20px',
                            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,107,53,0.015) 3px, rgba(255,107,53,0.015) 4px)',
                        }} />

                        <div style={{ position: 'relative', padding: '20px' }}>
                            {/* Header */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                                <div style={{
                                    width: '32px', height: '32px', borderRadius: '9px',
                                    background: 'rgba(255,107,53,0.1)', border: '1px solid rgba(255,107,53,0.25)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent,
                                }}>
                                    <FireIcon />
                                </div>
                                <div>
                                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#fff' }}>{t('heat_map_title')}</div>
                                    <div style={{ fontSize: '10px', color: 'rgba(255,107,53,0.5)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{t('heat_map_description')}</div>
                                </div>
                            </div>

                            {/* Grid */}
                            <div style={{ overflowX: 'auto' }}>
                                <div style={{ minWidth: '420px' }}>
                                    {/* Hour labels */}
                                    <div style={{ display: 'flex', marginBottom: '6px', marginLeft: '36px' }}>
                                        {HOURS.map(h => (
                                            <div key={h} style={{ flex: 1, textAlign: 'center', fontSize: '9px', color: 'rgba(255,255,255,0.25)', fontWeight: 700 }}>
                                                {h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h-12}p`}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Rows */}
                                    {DAYS.map((day, dIdx) => (
                                        <div key={day} style={{ display: 'flex', alignItems: 'center', gap: '0', marginBottom: '4px' }}>
                                            <div style={{ width: '32px', flexShrink: 0, fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.05em' }}>
                                                {day}
                                            </div>
                                            {HOURS.map((h, hIdx) => {
                                                const events = heatGrid[dIdx][hIdx];
                                                // Escala relativa al pico del propio perfil: si no,
                                                // un perfil con poco tráfico se vería siempre apagado.
                                                const v = heatMax > 0 ? events / heatMax : 0;
                                                const isHov = hoveredCell?.d === dIdx && hoveredCell?.h === hIdx;
                                                const alpha = 0.05 + v * 0.9;
                                                return (
                                                    <div key={h} style={{ flex: 1, margin: '0 2px', position: 'relative' }}
                                                        onMouseEnter={() => setHoveredCell({d: dIdx, h: hIdx})}
                                                        onMouseLeave={() => setHoveredCell(null)}>
                                                        <div style={{
                                                            height: '22px', borderRadius: '4px',
                                                            background: `rgba(255,107,53,${alpha.toFixed(2)})`,
                                                            border: `1px solid rgba(255,107,53,${Math.min(1, alpha + 0.1).toFixed(2)})`,
                                                            boxShadow: isHov ? `0 0 8px rgba(255,107,53,${alpha})` : 'none',
                                                            transform: isHov ? 'scaleY(1.15)' : 'scaleY(1)',
                                                            transition: 'transform 0.15s, box-shadow 0.15s',
                                                            cursor: 'pointer',
                                                        }} />
                                                        {isHov && (
                                                            <div style={{
                                                                position: 'absolute', bottom: '28px', left: '50%', transform: 'translateX(-50%)',
                                                                background: 'rgba(15,4,0,0.95)', border: '1px solid rgba(255,107,53,0.3)',
                                                                borderRadius: '8px', padding: '6px 10px', zIndex: 10, whiteSpace: 'nowrap', pointerEvents: 'none',
                                                            }}>
                                                                <div style={{ fontSize: '10px', fontWeight: 800, color: accent }}>{day} {HOUR_LABEL(h)}–{HOUR_LABEL((h + 2) % 24)}</div>
                                                                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', marginTop: '1px' }}>
                                                                    {events === 0 ? 'Sin actividad' : `${events} ${events === 1 ? 'evento' : 'eventos'}`}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ))}

                                    {/* Legend */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', marginTop: '12px' }}>
                                        <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)', fontWeight: 700 }}>{t('low')}</span>
                                        {[0.07,0.28,0.49,0.70,0.91].map((a,i) => (
                                            <div key={i} style={{ width: '16px', height: '10px', borderRadius: '3px', background: `rgba(255,107,53,${a})`, border: `1px solid rgba(255,107,53,${Math.min(1,a+0.1)})` }} />
                                        ))}
                                        <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)', fontWeight: 700 }}>{t('high')}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Conclusiones — calculadas de los eventos, no fijas */}
                            {!insights ? (
                                <div style={{
                                    marginTop: '16px', padding: '18px', textAlign: 'center',
                                    background: 'rgba(255,107,53,0.04)', border: '1px solid rgba(255,107,53,0.1)', borderRadius: '12px',
                                    fontSize: '12px', color: 'rgba(255,255,255,0.35)',
                                }}>
                                    Aún no hay suficiente actividad para calcular tendencias. El mapa se irá llenando con las visitas y clics reales de tu perfil.
                                </div>
                            ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px', marginTop: '16px' }}>
                                {[
                                    { label: t('most_active_day'), value: insights.bestDay,    sub: `${insights.bestDayShare}% del total` },
                                    { label: t('peak_hour'),       value: insights.peakRange,  sub: `${insights.peakSlotEvents} eventos` },
                                    { label: t('best_time'),       value: insights.bestMoment, sub: 'Tu franja más fuerte' },
                                ].map((ins, i) => (
                                    <div key={i} style={{
                                        background: 'rgba(255,107,53,0.05)', border: '1px solid rgba(255,107,53,0.1)',
                                        borderRadius: '12px', padding: '12px',
                                    }}>
                                        <div style={{ fontSize: '9px', color: 'rgba(255,107,53,0.5)', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '4px' }}>{ins.label}</div>
                                        <div style={{ fontSize: '14px', fontWeight: 900, color: '#fff' }}>{ins.value}</div>
                                        <div style={{ fontSize: '9px', color: accent, marginTop: '2px', fontWeight: 700 }}>{ins.sub}</div>
                                    </div>
                                ))}
                            </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ── Upgrade prompt para plan free ── */}
                {!isPro && (
                    <div style={{
                        background: 'rgba(255,107,53,0.04)', border: '1px solid rgba(255,107,53,0.12)',
                        borderRadius: '18px', padding: '24px', textAlign: 'center',
                    }}>
                        <div style={{ color: 'rgba(255,107,53,0.4)', marginBottom: '10px', display: 'flex', justifyContent: 'center' }}><LockIcon /></div>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: 'rgba(255,255,255,0.6)', marginBottom: '4px' }}>Analíticas Avanzadas</div>
                        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>Dispositivos, fuentes de tráfico y mapa de calor disponibles en PRO y ULTRA</div>
                    </div>
                )}

            </div>
        </div>
    );
};

// ════════════════════════════════════════════════════════════════════════════
// Panel de Ventas (gastronomía) — conteo de todo lo vendido por período
// ════════════════════════════════════════════════════════════════════════════
type Gran = 'dia' | 'semana' | 'mes' | 'ano';

const GRAN_META: { key: Gran; label: string; count: number }[] = [
    { key: 'dia',    label: 'Días',    count: 14 },
    { key: 'semana', label: 'Semanas', count: 12 },
    { key: 'mes',    label: 'Meses',   count: 12 },
    { key: 'ano',    label: 'Años',    count: 5  },
];

const BagIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 01-8 0" />
    </svg>
);

const pad2 = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const mondayOf = (d: Date) => { const c = new Date(d); const off = (c.getDay() + 6) % 7; c.setDate(c.getDate() - off); c.setHours(0, 0, 0, 0); return c; };

const GastroSalesPanel: React.FC<{ user: any; accent: string; restaurantName?: string; isPetcare?: boolean }> = ({ user, accent, restaurantName, isPetcare = false }) => {
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [gran, setGran] = useState<Gran>('dia');
    const [hovered, setHovered] = useState<number | null>(null);

    const fetchOrders = useCallback(async () => {
        if (!user?.id) return;
        try {
            const { data, error } = await supabase
                .from('orders')
                .select('created_at, total_price, status, items')
                .eq('restaurant_id', user.id)
                .order('created_at', { ascending: false })
                .limit(5000);
            if (error) throw error;
            // "Vendido" = todo pedido que no fue cancelado.
            setOrders((data || []).filter((o: any) => o.status !== 'cancelado'));
        } catch (e) {
            console.error('sales fetch error:', e);
        } finally {
            setLoading(false);
        }
    }, [user?.id]);

    useEffect(() => { fetchOrders(); }, [fetchOrders]);

    // Construye los buckets vacíos del período + asigna cada pedido al suyo.
    const { buckets, totals } = useMemo(() => {
        const meta = GRAN_META.find(g => g.key === gran)!;
        const now = new Date();
        const list: { key: string; label: string; revenue: number; orders: number; dishes: number }[] = [];

        const keyFor = (d: Date): string => {
            if (gran === 'dia') return ymd(d);
            if (gran === 'semana') return ymd(mondayOf(d));
            if (gran === 'mes') return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
            return String(d.getFullYear());
        };

        for (let i = meta.count - 1; i >= 0; i--) {
            let anchor: Date; let label: string;
            if (gran === 'dia') {
                anchor = new Date(now); anchor.setDate(now.getDate() - i);
                label = anchor.toLocaleDateString('es-EC', { day: '2-digit', month: 'short' });
            } else if (gran === 'semana') {
                anchor = mondayOf(now); anchor.setDate(anchor.getDate() - i * 7);
                label = anchor.toLocaleDateString('es-EC', { day: '2-digit', month: 'short' });
            } else if (gran === 'mes') {
                anchor = new Date(now.getFullYear(), now.getMonth() - i, 1);
                label = anchor.toLocaleDateString('es-EC', { month: 'short' });
            } else {
                anchor = new Date(now.getFullYear() - i, 0, 1);
                label = String(anchor.getFullYear());
            }
            list.push({ key: keyFor(anchor), label, revenue: 0, orders: 0, dishes: 0 });
        }

        const idx = new Map(list.map((b, i) => [b.key, i]));
        for (const o of orders) {
            if (!o.created_at) continue;
            const k = keyFor(new Date(o.created_at));
            const i = idx.get(k);
            if (i === undefined) continue;
            list[i].revenue += parseFloat(o.total_price || 0) || 0;
            list[i].orders += 1;
            list[i].dishes += Array.isArray(o.items) ? o.items.reduce((s: number, it: any) => s + (Number(it.qty) || 0), 0) : 0;
        }

        const totals = list.reduce((acc, b) => ({
            revenue: acc.revenue + b.revenue, orders: acc.orders + b.orders, dishes: acc.dishes + b.dishes,
        }), { revenue: 0, orders: 0, dishes: 0 });

        return { buckets: list, totals };
    }, [orders, gran]);

    const maxRev = Math.max(1, ...buckets.map(b => b.revenue));
    const avgTicket = totals.orders > 0 ? totals.revenue / totals.orders : 0;
    const periodLabel = GRAN_META.find(g => g.key === gran)!.label;
    const rangeLabel = periodLabel.toLowerCase();

    // Descarga un PDF con el detalle del período seleccionado.
    // jsPDF se carga dinámicamente (no infla el bundle inicial).
    const [pdfBusy, setPdfBusy] = useState(false);
    const downloadPDF = async () => {
        if (pdfBusy) return;
        setPdfBusy(true);
        try {
        const { default: jsPDF } = await import('jspdf');
        const { default: autoTable } = await import('jspdf-autotable');
        const doc = new jsPDF();
        const accentRGB: [number, number, number] = [255, 107, 53];
        doc.setFontSize(18); doc.setTextColor(20, 20, 20);
        doc.text(restaurantName || 'Reporte de Ventas', 14, 18);
        doc.setFontSize(11); doc.setTextColor(120, 120, 120);
        doc.text(`Reporte de ventas por ${rangeLabel}`, 14, 25);
        doc.text(`Generado: ${new Date().toLocaleString('es-EC')}`, 14, 31);
        doc.setDrawColor(accentRGB[0], accentRGB[1], accentRGB[2]);
        doc.setLineWidth(0.6); doc.line(14, 35, 196, 35);
        doc.setFontSize(10); doc.setTextColor(40, 40, 40);
        doc.text(`Total vendido: $${totals.revenue.toFixed(2)}`, 14, 43);
        doc.text(`Pedidos: ${totals.orders}`, 80, 43);
        doc.text(`${isPetcare ? 'Productos' : 'Platos'}: ${totals.dishes}`, 120, 43);
        doc.text(`Ticket prom.: $${avgTicket.toFixed(2)}`, 150, 43);
        autoTable(doc, {
            startY: 50,
            head: [['Período', 'Pedidos', isPetcare ? 'Productos' : 'Platos', 'Total ($)']],
            body: buckets.map(b => [b.label, String(b.orders), String(b.dishes), b.revenue.toFixed(2)]),
            foot: [['Total', String(totals.orders), String(totals.dishes), totals.revenue.toFixed(2)]],
            theme: 'striped',
            headStyles: { fillColor: accentRGB, textColor: 255, fontStyle: 'bold' },
            footStyles: { fillColor: [40, 40, 40], textColor: 255, fontStyle: 'bold' },
            styles: { fontSize: 9, cellPadding: 3 },
            columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
        });
        doc.save(`ventas-${gran}-${ymd(new Date())}.pdf`);
        } catch (e) {
            console.error('PDF export error:', e);
        } finally {
            setPdfBusy(false);
        }
    };

    const kpis = [
        { label: 'Total vendido', value: `$${totals.revenue.toFixed(2)}` },
        { label: 'Pedidos',       value: totals.orders.toLocaleString() },
        { label: isPetcare ? 'Productos' : 'Platos', value: totals.dishes.toLocaleString() },
        { label: 'Ticket prom.',  value: `$${avgTicket.toFixed(2)}` },
    ];

    return (
        <div style={{
            position: 'relative', overflow: 'hidden',
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,107,53,0.1)',
            borderRadius: '20px',
        }}>
            {/* Header + selector de período */}
            <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid rgba(255,107,53,0.08)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                    <div style={{
                        width: '32px', height: '32px', borderRadius: '9px',
                        background: 'rgba(255,107,53,0.1)', border: '1px solid rgba(255,107,53,0.2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent,
                    }}>
                        <BagIcon />
                    </div>
                    <div>
                        <span style={{ fontSize: '13px', fontWeight: 800, color: '#fff', letterSpacing: '0.02em' }}>Ventas</span>
                        <div style={{ fontSize: '10px', color: 'rgba(255,107,53,0.5)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                            Conteo de todo lo vendido
                        </div>
                    </div>
                    <button onClick={downloadPDF} disabled={loading || pdfBusy}
                        style={{
                            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', cursor: (loading || pdfBusy) ? 'default' : 'pointer',
                            padding: '8px 14px', borderRadius: '10px', fontSize: '11px', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase',
                            background: 'rgba(255,107,53,0.12)', color: accent, border: '1px solid rgba(255,107,53,0.3)',
                            opacity: (loading || pdfBusy) ? 0.5 : 1, transition: 'all 0.2s',
                        }}
                        title={`Descargar PDF (${rangeLabel})`}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        {pdfBusy ? '...' : 'PDF'}
                    </button>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {GRAN_META.map(g => (
                        <button key={g.key} onClick={() => setGran(g.key)}
                            style={{
                                padding: '6px 14px', borderRadius: '999px', cursor: 'pointer',
                                fontSize: '11px', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase',
                                transition: 'all 0.2s',
                                background: gran === g.key ? accent : 'rgba(255,107,53,0.06)',
                                color: gran === g.key ? '#fff' : 'rgba(255,255,255,0.5)',
                                border: `1px solid ${gran === g.key ? 'transparent' : 'rgba(255,107,53,0.12)'}`,
                                boxShadow: gran === g.key ? `0 4px 14px rgba(255,107,53,0.25)` : 'none',
                            }}>
                            {g.label}
                        </button>
                    ))}
                </div>
            </div>

            <div style={{ padding: '16px 20px 20px' }}>
                {loading ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: '13px' }}>Cargando ventas…</div>
                ) : (
                    <>
                        {/* KPIs del período */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px', marginBottom: '18px' }}>
                            {kpis.map((k, i) => (
                                <div key={i} style={{
                                    background: 'rgba(255,107,53,0.05)', border: '1px solid rgba(255,107,53,0.12)',
                                    borderRadius: '12px', padding: '12px 10px',
                                }}>
                                    <div style={{ fontSize: '17px', fontWeight: 900, color: '#fff', lineHeight: 1, letterSpacing: '-0.5px' }}>{k.value}</div>
                                    <div style={{ fontSize: '9px', fontWeight: 800, color: 'rgba(255,107,53,0.7)', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '5px' }}>{k.label}</div>
                                </div>
                            ))}
                        </div>

                        {/* Gráfico de barras por período */}
                        {totals.orders === 0 ? (
                            <div style={{ padding: '28px', textAlign: 'center', color: 'rgba(255,255,255,0.2)' }}>
                                <div style={{ marginBottom: '8px', color: 'rgba(255,107,53,0.3)', display: 'flex', justifyContent: 'center' }}><BagIcon /></div>
                                <p style={{ fontSize: '13px' }}>Sin ventas registradas en este rango ({rangeLabel}).</p>
                            </div>
                        ) : (
                            <div style={{ position: 'relative' }}>
                                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '130px' }}>
                                    {buckets.map((b, i) => {
                                        const h = Math.max(b.revenue > 0 ? 6 : 2, Math.round((b.revenue / maxRev) * 120));
                                        const isHov = hovered === i;
                                        return (
                                            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', position: 'relative' }}
                                                onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
                                                {isHov && (
                                                    <div style={{
                                                        position: 'absolute', bottom: `${h + 8}px`, left: '50%', transform: 'translateX(-50%)',
                                                        background: 'rgba(15,4,0,0.96)', border: '1px solid rgba(255,107,53,0.3)',
                                                        borderRadius: '8px', padding: '6px 10px', zIndex: 10, whiteSpace: 'nowrap', pointerEvents: 'none',
                                                    }}>
                                                        <div style={{ fontSize: '11px', fontWeight: 900, color: accent }}>${b.revenue.toFixed(2)}</div>
                                                        <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.6)', marginTop: '1px' }}>{b.orders} ped · {b.dishes} {isPetcare ? 'productos' : 'platos'}</div>
                                                    </div>
                                                )}
                                                <div style={{
                                                    width: '100%', maxWidth: '34px', height: `${h}px`, borderRadius: '5px 5px 2px 2px',
                                                    background: b.revenue > 0
                                                        ? `linear-gradient(180deg, ${accent} 0%, rgba(255,107,53,0.35) 100%)`
                                                        : 'rgba(255,255,255,0.05)',
                                                    border: b.revenue > 0 ? '1px solid rgba(255,107,53,0.4)' : '1px solid rgba(255,255,255,0.05)',
                                                    boxShadow: isHov && b.revenue > 0 ? `0 0 12px rgba(255,107,53,0.5)` : 'none',
                                                    transition: 'box-shadow 0.15s, transform 0.15s',
                                                    transform: isHov ? 'scaleY(1.03)' : 'scaleY(1)', transformOrigin: 'bottom',
                                                }} />
                                            </div>
                                        );
                                    })}
                                </div>
                                {/* Etiquetas del eje X */}
                                <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
                                    {buckets.map((b, i) => (
                                        <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: '8px', fontWeight: 700, color: 'rgba(255,255,255,0.3)', overflow: 'hidden', whiteSpace: 'nowrap', textTransform: 'capitalize' }}>
                                            {buckets.length > 12 && i % 2 !== 0 ? '' : b.label}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};
