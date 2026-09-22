import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * One day of the trend. `hasData` is false when the fact store never received
 * that day, which is a gap in the line rather than a fall to zero.
 */
export interface TrendPoint {
  date: string;
  value: number | null;
  hasData: boolean;
}

/** Runs of consecutive days that actually carry a value. A gap breaks the line. */
function segmentsOf(points: TrendPoint[]): number[][] {
  const runs: number[][] = [];
  let run: number[] = [];
  points.forEach((point, index) => {
    if (point.hasData && point.value !== null && Number.isFinite(point.value)) {
      run.push(index);
    } else if (run.length) {
      runs.push(run);
      run = [];
    }
  });
  if (run.length) runs.push(run);
  return runs;
}

function shortDate(iso: string): string {
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
}

/**
 * A stat-tile trend: a glyph, not a chart. It carries no axes and no hover —
 * the value it summarizes sits beside it, and the expanded chart below the
 * overview is where individual days are readable.
 */
export const Sparkline: React.FC<{
  points: TrendPoint[];
  label: string;
  width?: number;
  height?: number;
}> = ({ points, label, width = 96, height = 24 }) => {
  const values = points
    .filter((point) => point.hasData && point.value !== null)
    .map((point) => point.value as number);
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const y = (value: number) => height - 2 - ((value - min) / span) * (height - 4);

  const paths = segmentsOf(points).map((run) => (
    run.map((index, position) => (
      `${position === 0 ? 'M' : 'L'}${(index * step).toFixed(1)} ${y(points[index].value as number).toFixed(1)}`
    )).join(' ')
  ));
  const last = points.reduce<number | null>(
    (found, point, index) => (point.hasData && point.value !== null ? index : found),
    null,
  );

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${label}: ${points.length}-day trend, from ${formatCompact(values[0])} to ${formatCompact(values[values.length - 1])}`}
      className="overflow-visible"
    >
      {paths.map((definition, index) => (
        <path
          key={index}
          d={definition}
          fill="none"
          stroke="var(--statistics-trend-muted)"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {last !== null && (
        <circle
          cx={last * step}
          cy={y(points[last].value as number)}
          r={2.5}
          fill="var(--statistics-trend-line)"
          stroke="var(--card-bg)"
          strokeWidth={1.5}
        />
      )}
    </svg>
  );
};

function formatCompact(value: number): string {
  return Math.abs(value) >= 1000
    ? new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
    : value.toFixed(2);
}

const PLOT = { top: 14, right: 14, bottom: 28, left: 64, height: 200 } as const;

interface TrendChartProps {
  points: TrendPoint[];
  /** Names the single series, so the chart needs no legend. */
  label: string;
  formatValue: (value: number) => string;
  /** The stored cost target, drawn as a reference line when one exists. */
  target: number | null;
  /** The local day still in progress: its point is not final. */
  openDay: string;
}

/**
 * One metric over time, one axis, one line. It answers a single question —
 * whether a movement is a sustained change or one noisy day — so it carries no
 * second series and no second scale.
 */
export const TrendChart: React.FC<TrendChartProps> = ({
  points,
  label,
  formatValue,
  target,
  openDay,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.width ?? 0;
      if (measured > 0) setWidth(measured);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const readable = useMemo(
    () => points.filter((point) => point.hasData && point.value !== null),
    [points],
  );

  const scale = useMemo(() => {
    const values = readable.map((point) => point.value as number);
    if (target !== null && target > 0) values.push(target);
    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 1;
    const pad = (max - min) * 0.12 || Math.abs(max) * 0.12 || 1;
    const low = Math.max(0, min - pad);
    const high = max + pad;
    const plotWidth = Math.max(width - PLOT.left - PLOT.right, 10);
    return {
      low,
      high,
      x: (index: number) => PLOT.left + (points.length > 1 ? (index * plotWidth) / (points.length - 1) : plotWidth / 2),
      y: (value: number) => PLOT.top + (1 - (value - low) / (high - low || 1)) * PLOT.height,
    };
  }, [points.length, readable, target, width]);

  const totalHeight = PLOT.top + PLOT.height + PLOT.bottom;

  const pointerIndex = useCallback((clientX: number): number | null => {
    const node = containerRef.current;
    if (!node || points.length === 0) return null;
    const box = node.getBoundingClientRect();
    const plotWidth = Math.max(box.width - PLOT.left - PLOT.right, 1);
    const ratio = (clientX - box.left - PLOT.left) / plotWidth;
    const index = Math.round(ratio * (points.length - 1));
    return Math.min(Math.max(index, 0), points.length - 1);
  }, [points.length]);

  const activePoint = active === null ? null : points[active];
  const ticks = [scale.high, (scale.high + scale.low) / 2, scale.low];
  const labelledDates = points.length > 2
    ? [0, Math.floor((points.length - 1) / 2), points.length - 1]
    : points.map((_, index) => index);

  return (
    <div className="min-w-0">
      <div
        ref={containerRef}
        className="relative min-w-0"
        onPointerMove={(event) => setActive(pointerIndex(event.clientX))}
        onPointerLeave={() => setActive(null)}
      >
        <svg
          width={width}
          height={totalHeight}
          viewBox={`0 0 ${width} ${totalHeight}`}
          role="img"
          aria-label={`${label} per day over the last ${points.length} days`}
          tabIndex={0}
          onFocus={() => setActive((current) => current ?? points.length - 1)}
          onBlur={() => setActive(null)}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            setActive((current) => {
              const base = current ?? points.length - 1;
              const next = event.key === 'ArrowLeft' ? base - 1 : base + 1;
              return Math.min(Math.max(next, 0), points.length - 1);
            });
          }}
          className="block focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--focus-ring-color)]"
        >
          {/* Hairline grid, one shade off the surface and never dashed. */}
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={PLOT.left}
                x2={width - PLOT.right}
                y1={scale.y(tick)}
                y2={scale.y(tick)}
                stroke="var(--color-border-primary)"
                strokeWidth={1}
              />
              <text
                x={PLOT.left - 10}
                y={scale.y(tick) + 4}
                textAnchor="end"
                className="fill-[var(--text-muted)] text-[11px] tabular-nums"
              >
                {formatValue(tick)}
              </text>
            </g>
          ))}

          {/* The target is a threshold, so here a dashed rule is the meaning. */}
          {target !== null && target > 0 && (
            <>
              <line
                x1={PLOT.left}
                x2={width - PLOT.right}
                y1={scale.y(target)}
                y2={scale.y(target)}
                stroke="var(--text-muted)"
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <text
                x={width - PLOT.right}
                y={scale.y(target) - 6}
                textAnchor="end"
                className="fill-[var(--text-muted)] text-[11px]"
              >
                Target {formatValue(target)}
              </text>
            </>
          )}

          {segmentsOf(points).map((run, index) => (
            <path
              key={index}
              d={run.map((pointIndex, position) => (
                `${position === 0 ? 'M' : 'L'}${scale.x(pointIndex).toFixed(1)} ${scale.y(points[pointIndex].value as number).toFixed(1)}`
              )).join(' ')}
              fill="none"
              stroke="var(--statistics-trend-line)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {points.map((point, index) => (
            point.hasData && point.value !== null && point.date === openDay ? (
              // The open day is not final, so its marker stays hollow.
              <circle
                key={point.date}
                cx={scale.x(index)}
                cy={scale.y(point.value)}
                r={4}
                fill="var(--bg-canvas)"
                stroke="var(--statistics-trend-line)"
                strokeWidth={2}
              />
            ) : null
          ))}

          {labelledDates.map((index) => (
            <text
              key={points[index]?.date ?? index}
              x={scale.x(index)}
              y={totalHeight - 8}
              textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}
              className="fill-[var(--text-muted)] text-[11px]"
            >
              {shortDate(points[index]?.date ?? '')}
            </text>
          ))}

          {activePoint && (
            <g>
              <line
                x1={scale.x(active as number)}
                x2={scale.x(active as number)}
                y1={PLOT.top}
                y2={PLOT.top + PLOT.height}
                stroke="var(--color-border-tertiary)"
                strokeWidth={1}
              />
              {activePoint.hasData && activePoint.value !== null && (
                <circle
                  cx={scale.x(active as number)}
                  cy={scale.y(activePoint.value)}
                  r={4}
                  fill="var(--statistics-trend-line)"
                  stroke="var(--bg-canvas)"
                  strokeWidth={2}
                />
              )}
            </g>
          )}
        </svg>

        {activePoint && (
          <div
            role="status"
            className="pointer-events-none absolute top-0 rounded-[var(--control-border-radius)] border border-[var(--card-border)] bg-[var(--card-bg)] px-2.5 py-1.5 shadow-[var(--dropdown-shadow)]"
            style={{
              left: Math.min(Math.max(scale.x(active as number) - 60, 0), Math.max(width - 130, 0)),
            }}
          >
            <div className="text-[13px] font-medium text-[var(--text-primary)] tabular-nums">
              {activePoint.hasData && activePoint.value !== null
                ? formatValue(activePoint.value)
                : 'No data for this day'}
            </div>
            <div className="mt-0.5 text-[12px] text-[var(--text-secondary)]">
              {shortDate(activePoint.date)}
              {activePoint.date === openDay ? ' · still open' : ''}
            </div>
          </div>
        )}
      </div>

      {/* The table twin: every value stays readable without the pointer. */}
      <details className="mt-3">
        <summary className="cursor-default text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
          Show values
        </summary>
        <table className="mt-2 w-full text-left text-[12px]">
          <caption className="sr-only">{label} per day</caption>
          <thead>
            <tr className="text-[var(--text-muted)]">
              <th scope="col" className="py-1 font-normal">Day</th>
              <th scope="col" className="py-1 text-right font-normal">{label}</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.date} className="border-t border-[var(--color-border-primary)]">
                <th scope="row" className="py-1 font-normal text-[var(--text-secondary)]">
                  {shortDate(point.date)}
                  {point.date === openDay ? ' · still open' : ''}
                </th>
                <td className="py-1 text-right text-[var(--text-primary)] tabular-nums">
                  {point.hasData && point.value !== null ? formatValue(point.value) : 'No data'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
};
