import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../src/lib/supabase';
import { FaChartLine, FaBoxes, FaBell, FaFeatherAlt, FaExclamationTriangle, FaMoon } from 'react-icons/fa';
import { Spinner, MissingSqlNotice, Kpi, money, isMissingSql } from '../AdminKit';
import { ACCENT, TITLE_FONT, TabHeader, Empty, Pills } from '../books/BooksAdminUi';

interface Props {
  user: any;
  showNotification: (message: string, type: 'success' | 'error') => void;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const monthLabel = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1] || ym;

/** Barras sencillas (sin librería de gráficos: el panel solo necesita ver la forma). */
const Bars: React.FC<{ data: { label: string; value: number; sub?: string }[]; format?: (n: number) => string }> = ({ data, format = String }) => {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-2 h-36" role="img" aria-label="Gráfico de barras">
      {data.map(d => (
        <div key={d.label} className="flex-1 min-w-0 flex flex-col items-center justify-end h-full gap-1.5" title={`${d.label}: ${format(d.value)}${d.sub ? ` · ${d.sub}` : ''}`}>
          <span className="text-[10px] text-white/50 tabular-nums truncate max-w-full">{d.value > 0 ? format(d.value) : ''}</span>
          <div className="w-full rounded-t-md min-h-[3px]" style={{ height: `${Math.max((d.value / max) * 100, d.value > 0 ? 6 : 2)}%`, background: d.value > 0 ? `linear-gradient(to top, ${ACCENT}99, ${ACCENT})` : 'rgba(255,255,255,0.08)' }} />
          <span className="text-[10px] text-white/45 uppercase">{d.label}</span>
        </div>
      ))}
    </div>
  );
};

const Card: React.FC<{ icon: React.ReactNode; title: string; hint?: string; children: React.ReactNode }> = ({ icon, title, hint, children }) => (
  <div className="rounded-2xl border p-5" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}>
    <p className="text-xs font-black uppercase tracking-widest text-white flex items-center gap-2"><span style={{ color: ACCENT }}>{icon}</span> {title}</p>
    {hint && <p className="text-[11px] text-white/35 mt-1">{hint}</p>}
    <div className="mt-4">{children}</div>
  </div>
);

export const BooksInsightsTab: React.FC<Props> = ({ showNotification }) => {
  const [days, setDays] = useState<'30' | '90' | '365'>('90');
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: res, error } = await supabase.rpc('get_books_insights', { p_days: Number(days) });
    if (error) { if (isMissingSql(error)) setMissing(true); else showNotification(error.message, 'error'); setLoading(false); return; }
    setMissing(false); setData(res); setLoading(false);
  }, [days, showNotification]);
  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <Spinner accent={ACCENT} />;

  const t = data?.totals;
  return (
    <div className="animate-fade-in-up space-y-6 max-w-4xl mx-auto px-4 md:px-6 pb-32" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      <TabHeader icon={<FaChartLine />} title="Resumen" subtitle="Qué se vende, qué falta y qué se queda en el estante." />
      {missing && <MissingSqlNotice file="setup_books.sql" accent={ACCENT} />}
      {data && !data.ok && <p className="text-sm text-white/60">Este resumen es parte del plan ULTRA.</p>}
      {data?.ok && (
        <>
          <Pills<'30' | '90' | '365'> value={days} onChange={setDays} items={[['30', 'Últimos 30 días'], ['90', '90 días'], ['365', 'Último año']]} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Ventas" value={money(t.revenue)} accent={ACCENT} tone="good" />
            <Kpi label="Pedidos" value={t.orders} accent={ACCENT} />
            <Kpi label="Libros vendidos" value={t.units} accent={ACCENT} />
            <Kpi label="Ticket promedio" value={money(t.avg_ticket)} accent={ACCENT} />
          </div>
          {(t.unpaid > 0 || t.cancelled > 0) && (
            <p className="text-xs text-white/50 flex flex-wrap gap-x-5 gap-y-1">
              {t.unpaid > 0 && <span><FaExclamationTriangle className="inline mr-1.5 text-amber-400" size={10} />{money(t.unpaid)} por cobrar</span>}
              {t.cancelled > 0 && <span>{t.cancelled} pedido(s) cancelado(s) en el periodo</span>}
            </p>
          )}

          <Card icon={<FaChartLine />} title="Ventas por mes" hint="Últimos 6 meses (pedidos no cancelados)">
            <Bars data={(data.monthly as any[]).map(m => ({ label: monthLabel(m.month), value: Number(m.revenue), sub: `${m.orders} pedidos` }))} format={n => `$${Math.round(n)}`} />
          </Card>
          <Card icon={<FaChartLine />} title="Últimos 14 días" hint="Pedidos por día">
            <Bars data={(data.daily as any[]).map(d => ({ label: d.day.slice(8), value: Number(d.orders) }))} />
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card icon={<FaBoxes />} title="Más vendidos">
              {data.top_titles.length === 0 ? <Empty emoji="📚">Aún no hay ventas en este periodo.</Empty> : (
                <ol className="space-y-2.5">{(data.top_titles as any[]).map((x, i) => (
                  <li key={x.title_id || i} className="flex items-center gap-3 text-sm"><span className="w-5 text-white/30 font-black">{i + 1}</span>
                    <span className="min-w-0 flex-1"><span className="block text-white truncate" style={{ fontFamily: TITLE_FONT }}>{x.title}</span><span className="block text-[11px] text-white/40 truncate">{x.author}</span></span>
                    <span className="text-right"><b className="block text-white">{x.units}</b><span className="text-[10px] text-white/40">{money(x.revenue)}</span></span></li>
                ))}</ol>
              )}
            </Card>
            <Card icon={<FaBoxes />} title="Por género" hint="Ingresos del periodo">
              {data.top_categories.length === 0 ? <Empty emoji="🗂️">Sin datos todavía.</Empty> : (() => {
                const max = Math.max(...(data.top_categories as any[]).map(c => Number(c.revenue)), 1);
                return <ul className="space-y-2.5">{(data.top_categories as any[]).map(c => (
                  <li key={c.category} className="text-sm"><div className="flex justify-between text-white"><span className="truncate">{c.category}</span><span className="text-white/60 text-xs">{money(c.revenue)}</span></div>
                    <div className="h-1.5 rounded-full bg-white/10 mt-1 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(Number(c.revenue) / max) * 100}%`, background: ACCENT }} /></div></li>
                ))}</ul>;
              })()}
            </Card>
          </div>

          <Card icon={<FaBell />} title="Demanda sin atender" hint="Lectores esperando un libro agotado y títulos que te piden y no tienes. Es lo primero que conviene reponer o pedir.">
            {data.waiting.length === 0 && data.requested.length === 0 ? <Empty emoji="🙌">Nadie está esperando nada. ¡Buen trabajo!</Empty> : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div><p className="text-[10px] uppercase tracking-widest text-white/40 mb-2">Esperando reposición</p>
                  {data.waiting.length === 0 ? <p className="text-xs text-white/30">Ninguno.</p> : <ul className="space-y-2">{(data.waiting as any[]).map(w => (
                    <li key={w.title_id} className="flex items-center gap-3 text-sm"><span className="min-w-0 flex-1 text-white truncate">{w.title}</span><b style={{ color: ACCENT }}>{w.waiting}</b><span className="text-[10px] text-white/35 w-14 text-right">{w.stock === 0 ? 'agotado' : `stock ${w.stock ?? '∞'}`}</span></li>
                  ))}</ul>}</div>
                <div><p className="text-[10px] uppercase tracking-widest text-white/40 mb-2 flex items-center gap-1.5"><FaFeatherAlt size={9} /> Encargos abiertos ({data.open_requests})</p>
                  {data.requested.length === 0 ? <p className="text-xs text-white/30">Ninguno.</p> : <ul className="space-y-2">{(data.requested as any[]).map((r, i) => (
                    <li key={i} className="flex items-center gap-3 text-sm"><span className="min-w-0 flex-1 text-white truncate">{r.title}</span><b style={{ color: ACCENT }}>×{r.times}</b></li>
                  ))}</ul>}</div>
              </div>
            )}
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card icon={<FaExclamationTriangle />} title="Repón pronto" hint="Se venden y quedan pocas copias">
              {data.low_stock.length === 0 ? <p className="text-xs text-white/35">Nada urgente.</p> : <ul className="space-y-2">{(data.low_stock as any[]).map(l => (
                <li key={l.title_id} className="flex items-center gap-3 text-sm"><span className="min-w-0 flex-1 text-white truncate">{l.title}</span><span className="text-[11px] text-white/40">{l.sold} vendidos</span><b className={l.stock === 0 ? 'text-red-400' : 'text-amber-400'}>{l.stock}</b></li>
              ))}</ul>}
            </Card>
            <Card icon={<FaMoon />} title="Dormidos" hint="Con stock, sin ventas y más de 90 días en el catálogo">
              {data.slow_stock.length === 0 ? <p className="text-xs text-white/35">Todo se mueve.</p> : <ul className="space-y-2">{(data.slow_stock as any[]).map(l => (
                <li key={l.title_id} className="flex items-center gap-3 text-sm"><span className="min-w-0 flex-1 text-white truncate">{l.title}</span><span className="text-[11px] text-white/40">{l.stock} u.</span><b className="text-white/70">{money(l.value)}</b></li>
              ))}</ul>}
            </Card>
          </div>

          <Card icon={<FaBoxes />} title="Tu negocio de un vistazo">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi label="Títulos" value={data.inventory.titles} accent={ACCENT} />
              <Kpi label="Copias en stock" value={data.inventory.units} accent={ACCENT} />
              <Kpi label="Valor del inventario" value={money(data.inventory.value)} accent={ACCENT} />
              <Kpi label="Agotados" value={data.inventory.out_of_stock} accent={ACCENT} tone={data.inventory.out_of_stock > 0 ? 'bad' : undefined} />
              <Kpi label="Lectores del club" value={data.readers.total} accent={ACCENT} />
              <Kpi label="Nuevos en el periodo" value={data.readers.new} accent={ACCENT} tone="good" />
              <Kpi label="Eventos próximos" value={data.events.upcoming} accent={ACCENT} />
              <Kpi label="Saldo en tarjetas" value={money(data.giftcards.outstanding)} accent={ACCENT} />
            </div>
          </Card>
        </>
      )}
    </div>
  );
};

export default BooksInsightsTab;
