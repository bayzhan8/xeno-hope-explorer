/**
 * Reusable Pareto / tradeoff chart shared by the Replacement and Bridge
 * Therapy pages.
 *
 * Renders one or more (x, y) curves produced by `loadParetoDataset`.
 *
 *  - Single-curve mode (back-compat): pass `dataset`. The chart joins
 *    the points with a smooth line and plots a marker at each.
 *  - Multi-curve overlay: pass `datasets: ParetoSeries[]`. Each series
 *    gets its own color and line, and the tooltip lists every series' y
 *    at the hovered x. The legend shows a per-curve color swatch + label.
 *
 * Designed to drop into a `<Card>` so the parent owns the framing/title.
 */
import React from 'react';
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Label,
  Dot,
} from 'recharts';
import { Loader2, AlertTriangle } from 'lucide-react';

import { type ParetoDataset } from '@/utils/pareto';

export interface ParetoSeries {
  dataset: ParetoDataset;
  /** Display label for legend / tooltip (e.g. "85% cPRA"). */
  label: string;
  /** CSS color (e.g. "hsl(var(--chart-primary))" or "#7c3aed"). */
  color: string;
  /**
   * Optional per-curve base transplant rate (kidneys/yr at prop=1.0)
   * for the subgroup this series represents. When provided AND the
   * chart's x-axis is the multiplier, the tooltip annotates each
   * point with the equivalent absolute kidneys/yr (= x × baseRate).
   * When the chart's x-axis is already kidneys/yr, the tooltip can
   * back out the multiplier (= x / baseRate). Either direction makes
   * the supply scale concrete for cross-subgroup comparison
   * (Task Group 6.1).
   */
  baseRate?: number;
}

/**
 * What the x-axis represents on the supply Pareto cards. The chart
 * uses this to (a) pick the right tooltip annotation direction and
 * (b) decide which units to show in the per-row tooltip label. The
 * caller is still responsible for passing the right `xLabel` and
 * `formatX` — `supplyAxis` is purely a tooltip-side hint.
 */
export type SupplyAxisKind = 'multiplier' | 'kidneysPerYear';

interface ParetoChartProps {
  /** Single dataset (single-curve mode). */
  dataset?: ParetoDataset | null;
  /** Multiple datasets to overlay (multi-curve mode). Wins over `dataset` if both are passed. */
  datasets?: ParetoSeries[] | null;
  /** True while data is being loaded. */
  loading?: boolean;
  /** Optional error message to render in place of the chart. */
  error?: string | null;
  /** Axis labels. */
  xLabel: string;
  yLabel: string;
  /** Optional formatter for tooltip / axis values. */
  formatX?: (v: number) => string;
  formatY?: (v: number) => string;
  /** Card height in pixels. Defaults to a reasonable size. */
  height?: number;
  /**
   * Optional: what the x-axis represents on supply Pareto cards.
   * When set, and a series carries a `baseRate`, the tooltip adds
   * a second-unit annotation per row (e.g. "1.5× = 2,585/yr").
   * Leave undefined for charts whose x-axis isn't a supply axis
   * (e.g. graft-survival in months, graft-failure multiplier).
   */
  supplyAxis?: SupplyAxisKind;
}

const defaultFmt = (v: number): string => {
  if (!Number.isFinite(v)) return '—';
  if (Math.abs(v) >= 10000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (Math.abs(v) >= 100) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(1);
  return v.toFixed(2);
};

const ParetoChart: React.FC<ParetoChartProps> = ({
  dataset,
  datasets,
  loading,
  error,
  xLabel,
  yLabel,
  formatX = defaultFmt,
  formatY = defaultFmt,
  height = 320,
  supplyAxis,
}) => {
  if (loading) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 text-muted-foreground"
        style={{ height }}
      >
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="text-sm">Loading tradeoff curve…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 text-destructive"
        style={{ height }}
      >
        <AlertTriangle className="w-7 h-7" />
        <span className="text-sm text-center max-w-md">{error}</span>
      </div>
    );
  }

  // Normalise to a series array. Single-dataset mode wraps in a one-element
  // array with a default color so the rest of the rendering pipeline only
  // ever has to handle the multi-series case.
  const rawSeries: ParetoSeries[] | null = datasets && datasets.length > 0
    ? datasets
    : dataset
      ? [{ dataset, label: 'Curve', color: 'hsl(var(--primary))' }]
      : null;

  if (!rawSeries || rawSeries.every((s) => !s.dataset || s.dataset.points.length === 0)) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 text-muted-foreground"
        style={{ height }}
      >
        <AlertTriangle className="w-7 h-7" />
        <span className="text-sm">No data points available for this view.</span>
      </div>
    );
  }

  const series: ParetoSeries[] = rawSeries.filter(
    (s) => s.dataset.points.length > 0,
  );

  // Merge into a single recharts-friendly row-per-x dataset. Series with
  // missing x values render as gaps (recharts treats undefined values as
  // line breaks), which is exactly what we want for partial loads.
  const allXs = new Set<number>();
  for (const s of series) {
    for (const p of s.dataset.points) allXs.add(p.x);
  }
  const xsSorted = [...allXs].sort((a, b) => a - b);
  const chartData = xsSorted.map((x) => {
    const row: Record<string, number | [number, number] | undefined> = { x };
    for (const s of series) {
      const p = s.dataset.points.find((pt) => pt.x === x);
      if (p) {
        row[s.label] = p.y;
        // Range-area datum: recharts renders a band when the value is a
        // [low, high] tuple. Only emitted when this point has a CI.
        if (p.yCI !== undefined && Number.isFinite(p.yCI)) {
          row[`${s.label}__band`] = [p.y - p.yCI, p.y + p.yCI];
        }
      }
    }
    return row;
  });
  // Whether ANY series carries a CI → controls band rendering + legend note.
  const hasBand = series.some((s) =>
    s.dataset.points.some((p) => p.yCI !== undefined && Number.isFinite(p.yCI)),
  );

  // Per-series lookup helper (used by the tooltip for CI values).
  const seriesMeta = series.map((s) => ({ series: s }));

  const isMulti = series.length > 1;

  return (
    <div className="space-y-2">
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={chartData} margin={{ top: 24, right: 24, left: 16, bottom: 28 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--medical-border))" />
          <XAxis
            type="number"
            dataKey="x"
            domain={['dataMin', 'dataMax']}
            tickFormatter={formatX}
            stroke="hsl(var(--muted-foreground))"
            tick={{ fontSize: 12 }}
          >
            <Label
              value={xLabel}
              position="insideBottom"
              offset={-12}
              style={{ fontSize: 12, fill: 'hsl(var(--foreground))' }}
            />
          </XAxis>
          <YAxis
            type="number"
            tickFormatter={formatY}
            stroke="hsl(var(--muted-foreground))"
            tick={{ fontSize: 12 }}
          >
            <Label
              value={yLabel}
              angle={-90}
              position="insideLeft"
              offset={5}
              style={{ fontSize: 12, fill: 'hsl(var(--foreground))', textAnchor: 'middle' }}
            />
          </YAxis>
          <Tooltip
            cursor={{ stroke: 'hsl(var(--primary))', strokeDasharray: '4 4' }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const xVal = typeof label === 'number' ? label : Number(label);
              return (
                <div className="rounded-md border border-medical-border bg-card/95 px-3 py-2 text-xs shadow-lg">
                  <div className="font-medium text-foreground mb-1">
                    {xLabel}: {formatX(xVal)}
                  </div>
                  {payload
                    // Drop the band's range-area entry; the CI is shown
                    // inline on the matching line entry below.
                    .filter((entry) => !String(entry.dataKey).endsWith('__band'))
                    .map((entry) => {
                    const sLabel = entry.dataKey as string;
                    const meta = seriesMeta.find((m) => m.series.label === sLabel);
                    const ciPoint = meta?.series.dataset.points.find(
                      (pt) => Math.abs(pt.x - xVal) < 1e-9,
                    );
                    const ci = ciPoint?.yCI;
                    // When a supply axis is in play AND we know this
                    // series' base rate, annotate with the equivalent
                    // value in the OTHER unit so the user can read
                    // both directly off the tooltip.
                    const baseRate = meta?.series.baseRate;
                    let supplyNote: string | null = null;
                    if (supplyAxis && baseRate && baseRate > 0) {
                      if (supplyAxis === 'multiplier') {
                        const k = Math.round(xVal * baseRate);
                        supplyNote = `= ${k.toLocaleString()}/yr`;
                      } else {
                        // x is kidneys/yr → back out the multiplier
                        const m = xVal / baseRate;
                        supplyNote = `= ${m.toFixed(2)}×`;
                      }
                    }
                    return (
                      <div
                        key={sLabel}
                        className="flex items-center gap-2"
                        style={{ color: entry.color as string }}
                      >
                        <span
                          className="inline-block w-2 h-2 rounded-full"
                          style={{ background: entry.color as string }}
                        />
                        <span className="text-foreground">
                          {isMulti ? `${sLabel}: ` : ''}
                          {formatY(entry.value as number)}
                          {ci !== undefined && Number.isFinite(ci) && (
                            <span className="text-muted-foreground">
                              {' '}± {formatY(ci)}
                            </span>
                          )}
                        </span>
                        {supplyNote && (
                          <span className="text-[10px] text-muted-foreground">
                            {supplyNote}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            }}
          />
          {hasBand && series.map((s) => (
            <Area
              key={`${s.label}__band`}
              type="monotone"
              dataKey={`${s.label}__band`}
              stroke="none"
              fill={s.color}
              fillOpacity={0.14}
              connectNulls
              isAnimationActive={false}
              activeDot={false}
              legendType="none"
            />
          ))}
          {series.map((s) => (
            <Line
              key={s.label}
              type="monotone"
              dataKey={s.label}
              stroke={s.color}
              strokeWidth={2}
              connectNulls
              isAnimationActive={false}
              dot={(props: { cx?: number; cy?: number }) => (
                <Dot
                  cx={props.cx}
                  cy={props.cy}
                  r={4}
                  fill="hsl(var(--background))"
                  stroke={s.color}
                  strokeWidth={2}
                />
              )}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
      {hasBand && (
        <p className="text-[10px] text-muted-foreground text-center -mt-1">
          Shaded band = 95% confidence interval (Monte-Carlo trial error).
        </p>
      )}

      {/* Color/label legend (multi-curve overlay only). */}
      {isMulti && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-2 pt-1">
          {seriesMeta.map(({ series: s }) => (
            <div key={s.label} className="flex items-center gap-2 text-xs">
              <span
                className="inline-block w-3 h-3 rounded-full"
                style={{ background: s.color }}
              />
              <span className="font-medium text-foreground">{s.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ParetoChart;
