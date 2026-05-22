/**
 * Reusable Pareto / tradeoff chart shared by the Replacement and Bridge
 * Therapy pages.
 *
 * Renders one or more (x, y) curves produced by `loadParetoDataset`.
 *
 *  - Single-curve mode (back-compat): pass `dataset`. The chart joins
 *    the points with a smooth line, plots a marker at each, and circles
 *    the knee (if any) with a dashed `ReferenceDot`.
 *  - Multi-curve overlay (NEW — closes 6.1's "subgroup strictness"
 *    sub-task): pass `datasets: ParetoSeries[]`. Each series gets its
 *    own color, its own line, and its own knee marker. Tooltip lists
 *    every series' y at the hovered x. The legend shows a per-curve
 *    color swatch and (optional) a curve-shape classification chip
 *    (Problem 6.4 deliverable: surfaces saturating / accelerating /
 *    s-shape behaviour at a glance, no eyeballing required).
 *  - Marginal-return view (NEW): set `view='marginal'`. Each underlying
 *    dataset is transformed to Δy/Δx per segment via
 *    `toMarginalDataset` from pareto.ts, and the chart re-renders with
 *    the per-step rate of return on the y-axis. Useful for spotting
 *    "is each additional step still worth it?" patterns that the
 *    cumulative curve hides.
 *
 * Designed to drop into a `<Card>` so the parent owns the framing/title.
 */
import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
  Label,
  Dot,
} from 'recharts';
import { Loader2, AlertTriangle } from 'lucide-react';

import {
  type ParetoDataset,
  type ParetoPoint,
  classifyCurveShape,
  toMarginalDataset,
  type CurveShape,
} from '@/utils/pareto';
import { cn } from '@/lib/utils';

export interface ParetoSeries {
  dataset: ParetoDataset;
  /** Display label for legend / tooltip (e.g. "85% cPRA"). */
  label: string;
  /** CSS color (e.g. "hsl(var(--chart-primary))" or "#7c3aed"). */
  color: string;
}

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
   * Cumulative (default) or marginal-return view. In marginal mode each
   * underlying dataset is transformed to Δy/Δx per segment and yLabel
   * should be set accordingly by the caller (e.g. "Lives saved per
   * additional kidney/yr").
   */
  view?: 'cumulative' | 'marginal';
  /**
   * Render a small classification chip on each curve's legend
   * (saturating / accelerating / linear / s-shape / non-monotonic).
   * Defaults to true; set false to hide for very short curves.
   */
  showShapeChips?: boolean;
}

const defaultFmt = (v: number): string => {
  if (!Number.isFinite(v)) return '—';
  if (Math.abs(v) >= 10000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (Math.abs(v) >= 100) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(1);
  return v.toFixed(2);
};

// Human-readable + color hint for each curve-shape category. The
// dictionary keys mirror the union in pareto.ts/`CurveShape`.
const SHAPE_META: Record<CurveShape, { label: string; tone: string; explainer: string }> = {
  linear: {
    label: 'linear',
    tone: 'bg-muted text-muted-foreground border-medical-border',
    explainer: 'Each additional step adds about the same return — no diminishing or accelerating effect detected.',
  },
  saturating: {
    label: 'saturating',
    tone: 'bg-primary/10 text-primary border-primary/30',
    explainer: 'Diminishing returns — every additional step adds less than the previous one. Past the inflection, marginal benefit is small.',
  },
  accelerating: {
    label: 'accelerating',
    tone: 'bg-success/10 text-success border-success/30',
    explainer: 'Convex curve — each additional step adds MORE than the previous one. Pushing further along this axis pays off disproportionately.',
  },
  's-shape': {
    label: 's-shape',
    tone: 'bg-warning/10 text-warning border-warning/30',
    explainer: 'Curve changes regime: accelerates then saturates (or vice versa). One inflection in the slope.',
  },
  'non-monotonic': {
    label: 'noisy',
    tone: 'bg-destructive/10 text-destructive border-destructive/30',
    explainer: 'y zig-zags up and down — likely Monte-Carlo noise dominates any underlying trend. Add more trials per config to tighten the curve.',
  },
  unknown: {
    label: '—',
    tone: 'bg-muted text-muted-foreground border-medical-border',
    explainer: 'Too few points (< 3) to classify the curve shape.',
  },
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
  view = 'cumulative',
  showShapeChips = true,
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

  // Apply view transform (marginal converts each cumulative curve to Δy/Δx
  // per segment). Drop any series whose marginal version has < 2 points
  // because there's nothing to draw.
  const series: ParetoSeries[] = rawSeries
    .map((s) => {
      if (view !== 'marginal') return s;
      const m = toMarginalDataset(s.dataset);
      if (!m) return null;
      return { ...s, dataset: m };
    })
    .filter((s): s is ParetoSeries => s !== null && s.dataset.points.length > 0);

  if (series.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 text-muted-foreground"
        style={{ height }}
      >
        <AlertTriangle className="w-7 h-7" />
        <span className="text-sm">
          Not enough data for the {view} view. Try cumulative.
        </span>
      </div>
    );
  }

  // Merge into a single recharts-friendly row-per-x dataset. Series with
  // missing x values render as gaps (recharts treats undefined values as
  // line breaks), which is exactly what we want for partial loads.
  const allXs = new Set<number>();
  for (const s of series) {
    for (const p of s.dataset.points) allXs.add(p.x);
  }
  const xsSorted = [...allXs].sort((a, b) => a - b);
  const chartData = xsSorted.map((x) => {
    const row: Record<string, number | undefined> = { x };
    for (const s of series) {
      const p = s.dataset.points.find((pt) => pt.x === x);
      if (p) row[s.label] = p.y;
    }
    return row;
  });

  // Each series's classification + knee, computed once.
  const seriesMeta = series.map((s) => {
    const xs = s.dataset.points.map((p) => p.x);
    const ys = s.dataset.points.map((p) => p.y);
    const shape = classifyCurveShape(xs, ys);
    const knee: ParetoPoint | null =
      s.dataset.inflectionIndex !== null
        ? s.dataset.points[s.dataset.inflectionIndex]
        : null;
    return { series: s, shape, knee };
  });

  const isMulti = series.length > 1;

  return (
    <div className="space-y-2">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={{ top: 24, right: 24, left: 16, bottom: 28 }}>
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
                  {payload.map((entry) => {
                    const sLabel = entry.dataKey as string;
                    const meta = seriesMeta.find((m) => m.series.label === sLabel);
                    const isKnee =
                      meta?.knee && Math.abs(meta.knee.x - xVal) < 1e-9;
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
                        </span>
                        {isKnee && (
                          <span className="text-[10px] uppercase tracking-wide text-primary">
                            inflection
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            }}
          />
          {series.map((s) => (
            <Line
              key={s.label}
              type="monotone"
              dataKey={s.label}
              stroke={s.color}
              strokeWidth={2}
              connectNulls
              isAnimationActive={false}
              dot={(props: { cx?: number; cy?: number; payload?: { x: number } }) => {
                const x = props.payload?.x;
                const meta = seriesMeta.find((m) => m.series.label === s.label);
                const isKnee = meta?.knee && x !== undefined && Math.abs(meta.knee.x - x) < 1e-9;
                return (
                  <Dot
                    cx={props.cx}
                    cy={props.cy}
                    r={isKnee ? 6 : 4}
                    fill={isKnee ? s.color : 'hsl(var(--background))'}
                    stroke={s.color}
                    strokeWidth={2}
                  />
                );
              }}
            />
          ))}
          {seriesMeta.map(({ series: s, knee }) =>
            knee ? (
              <ReferenceDot
                key={`knee-${s.label}`}
                x={knee.x}
                y={knee.y}
                r={9}
                fill="transparent"
                stroke={s.color}
                strokeWidth={2}
                strokeDasharray="3 3"
                ifOverflow="extendDomain"
              />
            ) : null,
          )}
        </LineChart>
      </ResponsiveContainer>

      {/* Legend with per-curve color swatch + (optional) shape chip. In
          single-curve mode we show only the shape chip + caption; in
          multi-curve mode we show the full color/label legend. */}
      {(isMulti || showShapeChips) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-2 pt-1">
          {seriesMeta.map(({ series: s, shape, knee }) => {
            const meta = SHAPE_META[shape];
            return (
              <div key={s.label} className="flex items-center gap-2 text-xs">
                {isMulti && (
                  <>
                    <span
                      className="inline-block w-3 h-3 rounded-full"
                      style={{ background: s.color }}
                    />
                    <span className="font-medium text-foreground">{s.label}</span>
                  </>
                )}
                {showShapeChips && (
                  <span
                    title={meta.explainer}
                    className={cn(
                      'inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-medium uppercase tracking-wide',
                      meta.tone,
                    )}
                  >
                    {meta.label}
                  </span>
                )}
                {knee && (
                  <span className="text-[10px] text-muted-foreground">
                    inflection at <span className="font-medium text-foreground">{knee.label}</span>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Single-curve diagnostic caption (preserved from the old chart so
          users who were used to the explainer line don't lose it). In
          multi-curve mode the per-curve chips do this job. */}
      {!isMulti && seriesMeta[0] && (() => {
        const { knee, shape } = seriesMeta[0];
        const meta = SHAPE_META[shape];
        if (knee) {
          return (
            <p className="text-xs text-muted-foreground px-2">
              Inflection at <span className="font-medium text-foreground">{knee.label}</span>.
              Past this point, increasing {xLabel.toLowerCase()} yields diminishing
              returns on {yLabel.toLowerCase()}.
            </p>
          );
        }
        return (
          <p className="text-xs text-muted-foreground italic px-2">
            {meta.explainer}
          </p>
        );
      })()}
    </div>
  );
};

export default ParetoChart;
