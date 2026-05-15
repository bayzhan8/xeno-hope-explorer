/**
 * Reusable Pareto / tradeoff chart for the Bridge Therapy page.
 *
 * Renders the set of (x, y) points produced by `loadParetoDataset`, joins
 * them with a smooth line so the user can read the curve shape, and
 * highlights the inflection point (knee) detected by Kneedle. Handles
 * loading / error / no-knee states gracefully.
 *
 * Designed to drop into a `<Card>` so the parent owns the framing/title.
 */
import React from 'react';
import {
  ComposedChart,
  Line,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
  Label,
} from 'recharts';
import { Loader2, AlertTriangle } from 'lucide-react';

import { type ParetoDataset, type ParetoPoint } from '@/utils/pareto';

interface ParetoChartProps {
  /** Dataset returned by `loadParetoDataset`. */
  dataset: ParetoDataset | null;
  /** True while the dataset is being loaded. */
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
  loading,
  error,
  xLabel,
  yLabel,
  formatX = defaultFmt,
  formatY = defaultFmt,
  height = 320,
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

  if (!dataset || dataset.points.length === 0) {
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

  const data = dataset.points;
  const knee: ParetoPoint | null =
    dataset.inflectionIndex !== null ? data[dataset.inflectionIndex] : null;

  return (
    <div className="space-y-2">
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 24, right: 24, left: 16, bottom: 28 }}>
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
            dataKey="y"
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
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as ParetoPoint;
              return (
                <div className="rounded-md border border-medical-border bg-card/95 px-3 py-2 text-xs shadow-lg">
                  <div className="font-medium text-foreground">{p.label}</div>
                  <div className="text-muted-foreground mt-1">
                    {xLabel}: {formatX(p.x)}
                  </div>
                  <div className="text-muted-foreground">
                    {yLabel}: {formatY(p.y)}
                  </div>
                  {p.inflection && (
                    <div className="mt-1 text-primary font-medium">
                      Inflection point — diminishing returns beyond here
                    </div>
                  )}
                </div>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="y"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Scatter
            dataKey="y"
            fill="hsl(var(--primary))"
            shape={({ cx, cy, payload }: { cx?: number; cy?: number; payload: ParetoPoint }) => (
              <circle
                cx={cx}
                cy={cy}
                r={payload.inflection ? 7 : 5}
                fill={payload.inflection ? 'hsl(var(--primary))' : 'hsl(var(--background))'}
                stroke="hsl(var(--primary))"
                strokeWidth={2}
              />
            )}
            isAnimationActive={false}
          />
          {knee && (
            <ReferenceDot
              x={knee.x}
              y={knee.y}
              r={10}
              fill="transparent"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              strokeDasharray="3 3"
              ifOverflow="extendDomain"
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {dataset.inflectionIndex === null ? (
        <p className="text-xs text-muted-foreground italic px-2">
          No clear inflection point detected in this range — curve is approximately
          linear, or non-monotonic.
        </p>
      ) : (
        knee && (
          <p className="text-xs text-muted-foreground px-2">
            Inflection at <span className="font-medium text-foreground">{knee.label}</span>.
            Past this point, increasing {xLabel.toLowerCase()} yields diminishing
            returns on {yLabel.toLowerCase()}.
          </p>
        )
      )}
    </div>
  );
};

export default ParetoChart;
