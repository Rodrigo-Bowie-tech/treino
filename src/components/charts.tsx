import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { niceTicks } from '../lib/ticks';

function useWidth(ref: RefObject<HTMLDivElement | null>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

export interface ChartSeries {
  name: string;
  /** Cor CSS, ex.: "var(--series-1)". */
  color: string;
}

export interface LinePoint {
  x: number;
  values: (number | undefined)[];
}

interface LineChartProps {
  data: LinePoint[];
  series: ChartSeries[];
  formatY: (v: number) => string;
  formatX: (x: number) => string;
  ariaLabel: string;
  height?: number;
}

export function Legend({ series, kind = 'line' }: { series: ChartSeries[]; kind?: 'line' | 'bar' }) {
  return (
    <div className="legend">
      {series.map((s) => (
        <span key={s.name}>
          <i
            className="line-key"
            style={{ background: s.color, ...(kind === 'bar' ? { height: 10, width: 10, borderRadius: 2 } : {}) }}
          />
          {s.name}
        </span>
      ))}
    </div>
  );
}

function nearestIndex(xs: number[], px: number): number {
  let best = 0;
  for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - px) < Math.abs(xs[best] - px)) best = i;
  return best;
}

/** Gráfico de linhas com eixo de tempo, cruz de leitura e navegação por teclado. */
export function LineChart({ data, series, formatY, formatX, ariaLabel, height = 200 }: LineChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref);
  const [active, setActive] = useState<number | null>(null);

  const single = series.length === 1;
  const M = { top: 12, right: single ? 48 : 12, bottom: 24, left: 44 };
  const plotW = Math.max(0, width - M.left - M.right);
  const plotH = height - M.top - M.bottom;

  const xsRaw = data.map((d) => d.x);
  const minX = Math.min(...xsRaw);
  const maxX = Math.max(...xsRaw);
  const xScale = (x: number) => (maxX === minX ? M.left + plotW / 2 : M.left + ((x - minX) / (maxX - minX)) * plotW);
  const ys = data.flatMap((d) => d.values.filter((v): v is number => v != null));
  const ticks = ys.length ? niceTicks(Math.min(...ys), Math.max(...ys)) : [0, 1];
  const t0 = ticks[0];
  const tN = ticks[ticks.length - 1];
  const yScale = (y: number) => M.top + (1 - (y - t0) / (tN - t0 || 1)) * plotH;
  const xs = data.map((d) => xScale(d.x));

  const labelIdx =
    data.length <= 1 ? [0] : [...new Set([0, Math.round((data.length - 1) / 3), Math.round((2 * (data.length - 1)) / 3), data.length - 1])];
  const showAllDots = data.length <= 40;

  const onPointer = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setActive(nearestIndex(xs, e.clientX - rect.left));
  };

  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowLeft') setActive((i) => Math.max(0, (i ?? data.length) - 1));
    else if (e.key === 'ArrowRight') setActive((i) => Math.min(data.length - 1, (i ?? -1) + 1));
    else return;
    e.preventDefault();
  };

  const tooltipLeft = active != null ? (xs[active] > width / 2 ? xs[active] - 160 : xs[active] + 12) : 0;

  return (
    <div className="chart-wrap">
      {!single && <Legend series={series} />}
      <div className="chart" ref={ref} style={{ height }}>
        {width > 0 && data.length > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={ariaLabel}
            tabIndex={0}
            onPointerMove={onPointer}
            onPointerDown={onPointer}
            onPointerLeave={(e) => e.pointerType === 'mouse' && setActive(null)}
            onFocus={() => setActive(data.length - 1)}
            onBlur={() => setActive(null)}
            onKeyDown={onKey}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={width - M.right} y1={yScale(t)} y2={yScale(t)} stroke="var(--grid)" strokeWidth={1} />
                <text className="tick" x={M.left - 8} y={yScale(t) + 4} textAnchor="end">
                  {formatY(t)}
                </text>
              </g>
            ))}
            {labelIdx.map((i, n) => (
              <text
                key={i}
                className="tick"
                x={xs[i]}
                y={height - 6}
                textAnchor={labelIdx.length === 1 ? 'middle' : n === 0 ? 'start' : n === labelIdx.length - 1 ? 'end' : 'middle'}
              >
                {formatX(data[i].x)}
              </text>
            ))}
            {active != null && (
              <line x1={xs[active]} x2={xs[active]} y1={M.top} y2={M.top + plotH} stroke="var(--axis)" strokeWidth={1} />
            )}
            {series.map((s, si) => {
              const pts = data
                .map((d, i) => ({ x: xs[i], v: d.values[si] }))
                .filter((p): p is { x: number; v: number } => p.v != null);
              if (pts.length === 0) return null;
              const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${yScale(p.v).toFixed(1)}`).join(' ');
              const last = pts[pts.length - 1];
              return (
                <g key={s.name}>
                  <path d={path} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  {(showAllDots ? pts : [last]).map((p) => (
                    <circle key={p.x} cx={p.x} cy={yScale(p.v)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
                  ))}
                  {single && (
                    <text className="end-label" x={last.x + 8} y={yScale(last.v) + 4}>
                      {formatY(last.v)}
                    </text>
                  )}
                </g>
              );
            })}
            {active != null &&
              series.map((s, si) => {
                const v = data[active].values[si];
                return v == null ? null : (
                  <circle key={s.name} cx={xs[active]} cy={yScale(v)} r={6} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
                );
              })}
          </svg>
        )}
        {active != null && data[active] && (
          <div className="chart-tooltip" style={{ left: Math.max(0, tooltipLeft), top: M.top }}>
            <div className="tt-title">{formatX(data[active].x)}</div>
            {series.map((s, si) => {
              const v = data[active].values[si];
              return v == null ? null : (
                <div key={s.name} className="tt-row">
                  <i className="line-key" style={{ background: s.color }} />
                  <strong>{formatY(v)}</strong>
                  <span>{s.name}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export interface BarDatum {
  key: string;
  label: string;
  /** Rótulo completo para a dica (ex.: data por extenso). */
  title: string;
  value: number;
}

interface BarChartProps {
  data: BarDatum[];
  formatValue: (v: number) => string;
  ariaLabel: string;
  /** Linha de referência (ex.: meta de calorias). */
  goal?: number;
  goalLabel?: string;
  seriesName: string;
  /** Barra que recebe rótulo de valor (ex.: hoje). */
  labelKey?: string;
  height?: number;
}

function roundedTopBar(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  const y0 = y + h;
  return `M${x},${y0} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y0} Z`;
}

/** Colunas com cantos arredondados no topo, linha de meta e dica por coluna. */
export function BarChart({ data, formatValue, ariaLabel, goal, goalLabel, seriesName, labelKey, height = 180 }: BarChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref);
  const [active, setActive] = useState<number | null>(null);

  const M = { top: 20, right: 8, bottom: 24, left: 44 };
  const plotW = Math.max(0, width - M.left - M.right);
  const plotH = height - M.top - M.bottom;
  const maxV = Math.max(1, goal ?? 0, ...data.map((d) => d.value));
  const ticks = niceTicks(0, maxV);
  const top = ticks[ticks.length - 1];
  const yScale = (v: number) => M.top + (1 - v / top) * plotH;
  const band = data.length ? plotW / data.length : 0;
  const barW = Math.min(24, band * 0.6);
  const labelEvery = data.length > 14 ? Math.ceil(data.length / 7) : 1;

  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowLeft') setActive((i) => Math.max(0, (i ?? data.length) - 1));
    else if (e.key === 'ArrowRight') setActive((i) => Math.min(data.length - 1, (i ?? -1) + 1));
    else return;
    e.preventDefault();
  };

  return (
    <div className="chart-wrap">
      <div className="legend">
        <span>
          <i className="line-key" style={{ background: 'var(--series-1)', height: 10, width: 10, borderRadius: 2 }} />
          {seriesName}
        </span>
        {goal != null && (
          <span>
            <i className="line-key" style={{ background: 'var(--ink-2)' }} />
            {goalLabel ?? 'Meta'}
          </span>
        )}
      </div>
      <div className="chart" ref={ref} style={{ height }}>
        {width > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={ariaLabel}
            tabIndex={0}
            onFocus={() => setActive(data.length - 1)}
            onBlur={() => setActive(null)}
            onKeyDown={onKey}
            onPointerLeave={(e) => e.pointerType === 'mouse' && setActive(null)}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={M.left}
                  x2={width - M.right}
                  y1={yScale(t)}
                  y2={yScale(t)}
                  stroke={t === 0 ? 'var(--axis)' : 'var(--grid)'}
                  strokeWidth={1}
                />
                <text className="tick" x={M.left - 8} y={yScale(t) + 4} textAnchor="end">
                  {formatValue(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const x = M.left + i * band + (band - barW) / 2;
              const y = yScale(d.value);
              const h = M.top + plotH - y;
              const dim = active != null && active !== i;
              return (
                <g key={d.key}>
                  {h > 0 && (
                    <path d={roundedTopBar(x, y, barW, h)} fill="var(--series-1)" opacity={dim ? 0.45 : 1} />
                  )}
                  {d.key === labelKey && d.value > 0 && (
                    <text className="end-label" x={x + barW / 2} y={y - 6} textAnchor="middle">
                      {formatValue(d.value)}
                    </text>
                  )}
                  {i % labelEvery === 0 && (
                    <text className="tick" x={x + barW / 2} y={height - 6} textAnchor="middle">
                      {d.label}
                    </text>
                  )}
                  <rect
                    x={M.left + i * band}
                    y={M.top}
                    width={band}
                    height={plotH}
                    fill="transparent"
                    onPointerEnter={() => setActive(i)}
                    onPointerDown={() => setActive(i)}
                  />
                </g>
              );
            })}
            {goal != null && (
              <line
                x1={M.left}
                x2={width - M.right}
                y1={yScale(goal)}
                y2={yScale(goal)}
                stroke="var(--ink-2)"
                strokeWidth={1.5}
                pointerEvents="none"
              />
            )}
          </svg>
        )}
        {active != null && data[active] && (
          <div
            className="chart-tooltip"
            style={{
              left: Math.max(0, Math.min(width - 150, M.left + active * band + band / 2 - 70)),
              top: 0,
            }}
          >
            <div className="tt-title">{data[active].title}</div>
            <div className="tt-row">
              <i className="line-key" style={{ background: 'var(--series-1)' }} />
              <strong>{formatValue(data[active].value)}</strong>
              <span>{seriesName}</span>
            </div>
            {goal != null && (
              <div className="tt-row">
                <i className="line-key" style={{ background: 'var(--ink-2)' }} />
                <strong>{formatValue(goal)}</strong>
                <span>{goalLabel ?? 'Meta'}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
