/**
 * WaitTimeChart — primary wait-time visualization.
 *
 * Renders Little's-Law-derived per-list-spell wait times. There are two
 * complementary estimates the chart can surface (Task Group 3/4):
 *
 *   Time on dialysis (W_C)   — L = C (un-bridged candidates), outflow =
 *                              tx_xeno + (tx_std − bridge_allo) +
 *                              waitlist deaths + removals. This is the
 *                              **headline** number: it drops when bridge
 *                              therapy moves residence time off
 *                              dialysis, regardless of whether the
 *                              human-kidney supply changes.
 *
 *   Total wait (W)           — L = C ∪ H_xeno in bridge mode (so a
 *                              bridged patient still counts toward the
 *                              candidate pool until they receive a
 *                              definitive allokidney). In replacement
 *                              mode W ≡ W_C by construction.
 *
 *   Time on bridge (W_X)     — bridge mode only; mean residence time on
 *                              a functioning xenograft per spell.
 *                              Surfaced through the series-toggle UI for
 *                              completeness; off by default.
 *
 * The chart prominently plots W_C (solid bold) and W (solid lighter,
 * bridge mode only). Base-case lines for both follow the same pattern
 * but dashed. cPRA / age toggles still apply.
 */
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { Hourglass } from 'lucide-react';
import { ChartSeriesToggle } from './ChartSeriesToggle';
import { AgeGroupToggle, AGE_GROUPS } from './AgeGroupToggle';
import type { TherapyMode } from '@/utils/dataTransformer';

interface WaitTimeRow {
  year: number;
  averageWaitingTimeMonths: number;
  baseAverageWaitingTimeMonths?: number;
  reductionMonths?: number;
  lowCPRA: number;
  highCPRA: number;
  baseLowCPRA?: number;
  baseHighCPRA?: number;
  dialysisMonths: number;
  baseDialysisMonths?: number;
  dialysisReductionMonths?: number;
  dialysisLowCPRA: number;
  dialysisHighCPRA: number;
  baseDialysisLowCPRA?: number;
  baseDialysisHighCPRA?: number;
  bridgeMonths?: number;
  bridgeLowCPRA?: number;
  bridgeHighCPRA?: number;
}

interface WaitTimeByAgeRow {
  year: number;
  lowCPRA: Record<string, number>;
  highCPRA: Record<string, number>;
  baseLowCPRA?: Record<string, number>;
  baseHighCPRA?: Record<string, number>;
  dialysisLowCPRA?: Record<string, number>;
  dialysisHighCPRA?: Record<string, number>;
  baseDialysisLowCPRA?: Record<string, number>;
  baseDialysisHighCPRA?: Record<string, number>;
}

interface WaitTimeChartProps {
  data: WaitTimeRow[] | undefined;
  dataByAge?: WaitTimeByAgeRow[];
  highCPRAThreshold: number;
  simulationHorizon: number;
  therapyMode?: TherapyMode;
}

const COLORS = {
  primary: 'hsl(var(--chart-primary))',
  secondary: 'hsl(var(--chart-secondary))',
  tertiary: 'hsl(var(--chart-tertiary))',
};

// Sanitize a number for chart display: NaN/Infinity → null (Recharts treats
// null as "no value" and skips the point, leaving a gap rather than
// connecting a misleading 0).
const clean = (v: number | undefined): number | null =>
  v !== undefined && Number.isFinite(v) ? v : null;

// Months formatter for tooltip + y-axis. Wait time is NOT a head-count, so
// don't use fmtCount; keep one decimal place.
const fmtMonths = (v: unknown): string => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  return `${v.toFixed(1)} mo`;
};

const WaitTimeChart: React.FC<WaitTimeChartProps> = ({
  data,
  dataByAge,
  highCPRAThreshold,
  simulationHorizon,
  therapyMode = 'replacement',
}) => {
  const isBridge = therapyMode === 'bridge_v2';
  // Series visibility — headline is "time on dialysis" (W_C). In bridge
  // mode we also offer "total wait" (W) and "time on bridge" (W_X) as
  // overlays, off by default so the dialysis story leads.
  const [seriesVisible, setSeriesVisible] = useState<Record<string, boolean>>({
    dialysis: true,           // W_C (headline)
    dialysisLow: false,
    dialysisHigh: false,
    baseDialysis: true,       // base-case W_C (so the gap reads as savings)
    baseDialysisLow: false,
    baseDialysisHigh: false,
    totalWait: false,         // W (combined) — only meaningful in bridge
    baseTotalWait: false,
    bridgeOnly: false,        // W_X — bridge mode only
  });
  const [ageGroups, setAgeGroups] = useState<Record<string, boolean>>({
    age0_18: true,
    age18_45: true,
    age45_60: true,
    age60plus: true,
  });
  const [ageExpanded, setAgeExpanded] = useState(false);

  const toggleSeries = (key: string, visible: boolean) =>
    setSeriesVisible((prev) => ({ ...prev, [key]: visible }));
  const toggleAge = (key: string, visible: boolean) =>
    setAgeGroups((prev) => ({ ...prev, [key]: visible }));

  if (!data || data.length === 0) {
    return (
      <Card className="bg-card shadow-lg border-medical-border">
        <CardHeader className="border-b border-medical-border bg-gradient-to-br from-medical-surface to-medical-surface/50 pb-4">
          <CardTitle className="text-lg font-semibold text-primary flex items-center gap-2">
            <Hourglass className="w-5 h-5" />
            {isBridge ? 'Time on Dialysis vs. Total Wait' : 'Average Wait Time Over Time'}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">
            Wait-time data unavailable for this scenario.
          </p>
        </CardContent>
      </Card>
    );
  }

  const filtered = data.filter((d) => d.year <= simulationHorizon);
  const filteredByAge = dataByAge?.filter((d) => d.year <= simulationHorizon);
  const hasBaseDialysis = filtered.some(
    (d) => d.baseDialysisMonths !== undefined && Number.isFinite(d.baseDialysisMonths),
  );
  const hasBaseTotalWait = filtered.some(
    (d) => d.baseAverageWaitingTimeMonths !== undefined && Number.isFinite(d.baseAverageWaitingTimeMonths),
  );

  const xAxisDomain = [0.5, simulationHorizon + 0.5];
  const xAxisTicks = Array.from({ length: simulationHorizon }, (_, i) => i + 1);

  // Per-year flattened rows for the age-stratified view. Uses W_C
  // (dialysis-only) cell-level values when available, matching the
  // chart's headline framing.
  const ageChartData = (filteredByAge || []).map((row) => {
    const out: Record<string, number | null> = { year: row.year };
    const low = row.dialysisLowCPRA ?? row.lowCPRA ?? {};
    const high = row.dialysisHighCPRA ?? row.highCPRA ?? {};
    for (const ageKey of Object.keys(low)) {
      out[`lowCPRA_${ageKey}`] = clean(low[ageKey]);
    }
    for (const ageKey of Object.keys(high)) {
      out[`highCPRA_${ageKey}`] = clean(high[ageKey]);
    }
    return out;
  });

  // Aggregate rows with NaN sanitized.
  const aggregateChartData = filtered.map((row) => ({
    year: row.year,
    dialysis: clean(row.dialysisMonths),
    dialysisLow: clean(row.dialysisLowCPRA),
    dialysisHigh: clean(row.dialysisHighCPRA),
    baseDialysis: clean(row.baseDialysisMonths),
    baseDialysisLow: clean(row.baseDialysisLowCPRA),
    baseDialysisHigh: clean(row.baseDialysisHighCPRA),
    totalWait: clean(row.averageWaitingTimeMonths),
    baseTotalWait: clean(row.baseAverageWaitingTimeMonths),
    bridgeOnly: clean(row.bridgeMonths),
  }));

  // Year-H summary annotation: how many months of dialysis the scenario
  // saved per list-spell at the end of the displayed horizon.
  const horizonRow = filtered.length > 0 ? filtered[filtered.length - 1] : null;
  const savingsMonths =
    horizonRow && Number.isFinite(horizonRow.dialysisReductionMonths)
      ? (horizonRow.dialysisReductionMonths as number)
      : null;
  const horizonDialysis =
    horizonRow && Number.isFinite(horizonRow.dialysisMonths)
      ? horizonRow.dialysisMonths
      : null;
  const horizonTotalWait =
    horizonRow && Number.isFinite(horizonRow.averageWaitingTimeMonths)
      ? horizonRow.averageWaitingTimeMonths
      : null;
  const horizonBaseDialysis =
    horizonRow && Number.isFinite(horizonRow.baseDialysisMonths ?? NaN)
      ? (horizonRow.baseDialysisMonths as number)
      : null;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    return (
      <div className="bg-card border border-medical-border rounded-lg p-3 shadow-[var(--shadow-medium)]">
        <p className="text-sm font-medium text-foreground mb-1">{`Year: ${label}`}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-sm" style={{ color: entry.color }}>
            {`${entry.name}: ${fmtMonths(entry.value)}`}
          </p>
        ))}
      </div>
    );
  };

  const usingAgeView = ageExpanded && filteredByAge && filteredByAge.length > 0;

  return (
    <Card className="bg-card shadow-lg border-medical-border hover:shadow-xl transition-shadow duration-300">
      <CardHeader className="border-b border-medical-border bg-gradient-to-br from-medical-surface to-medical-surface/50 pb-4">
        <CardTitle className="text-lg font-semibold text-primary flex items-center gap-2">
          <Hourglass className="w-5 h-5" />
          {isBridge ? 'Time on Dialysis vs. Total Wait' : 'Average Wait Time Over Time'}
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1.5">
          {isBridge
            ? 'Mean time on dialysis per list-spell (headline) and total wait until a definitive allokidney (overlay) — bridging conserves the queue but shifts who is on dialysis.'
            : "Estimated mean wait per list-spell (Little's Law: L / outflow), stratified by cPRA and age."}
        </p>
        {(savingsMonths !== null || horizonDialysis !== null) && (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            {horizonDialysis !== null && (
              <div className="rounded-md border border-medical-border bg-medical-surface/60 px-3 py-2">
                <div className="text-muted-foreground">Time on dialysis @ year {horizonRow?.year}</div>
                <div className="font-semibold text-primary text-base mt-0.5">
                  {fmtMonths(horizonDialysis)}
                  {horizonBaseDialysis !== null && (
                    <span className="text-muted-foreground text-xs font-normal ml-1">
                      (base {fmtMonths(horizonBaseDialysis)})
                    </span>
                  )}
                </div>
              </div>
            )}
            {savingsMonths !== null && (
              <div className="rounded-md border border-medical-border bg-medical-surface/60 px-3 py-2">
                <div className="text-muted-foreground">Dialysis time saved per spell</div>
                <div
                  className={`font-semibold text-base mt-0.5 ${
                    savingsMonths > 0 ? 'text-emerald-600' : savingsMonths < 0 ? 'text-amber-600' : 'text-foreground'
                  }`}
                >
                  {savingsMonths > 0 ? '−' : savingsMonths < 0 ? '+' : ''}
                  {fmtMonths(Math.abs(savingsMonths))}
                </div>
              </div>
            )}
            {isBridge && horizonTotalWait !== null && (
              <div className="rounded-md border border-medical-border bg-medical-surface/60 px-3 py-2">
                <div className="text-muted-foreground">Total wait (incl. bridge)</div>
                <div className="font-semibold text-base mt-0.5 text-foreground">
                  {fmtMonths(horizonTotalWait)}
                </div>
              </div>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="px-4 pt-4 pb-1">
        <ResponsiveContainer width="100%" height={390}>
          {usingAgeView ? (
            <LineChart
              data={ageChartData}
              margin={{ top: 10, right: 10, bottom: 20, left: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" />
              <XAxis
                type="number"
                dataKey="year"
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 12 }}
                domain={xAxisDomain}
                ticks={xAxisTicks}
                label={{
                  value: 'Years',
                  position: 'insideBottom',
                  offset: -5,
                  style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' },
                }}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 12 }}
                tickFormatter={(v: number) => v.toFixed(0)}
                label={{
                  value: isBridge ? 'Time on dialysis (months)' : 'Avg wait time (months)',
                  angle: -90,
                  position: 'left',
                  style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' },
                }}
              />
              <Tooltip content={<CustomTooltip />} />
              {seriesVisible.dialysisLow &&
                AGE_GROUPS.filter((g) => ageGroups[g.key]).map((group) => (
                  <Line
                    key={`lowCPRA_${group.key}`}
                    type="monotone"
                    dataKey={`lowCPRA_${group.key}`}
                    stroke={group.color}
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    name={`Low cPRA ${group.label}y`}
                    dot={{ r: 1 }}
                    connectNulls={false}
                  />
                ))}
              {seriesVisible.dialysisHigh &&
                AGE_GROUPS.filter((g) => ageGroups[g.key]).map((group) => (
                  <Line
                    key={`highCPRA_${group.key}`}
                    type="monotone"
                    dataKey={`highCPRA_${group.key}`}
                    stroke={group.color}
                    strokeWidth={2.5}
                    strokeDasharray="2 2"
                    name={`High cPRA ${group.label}y`}
                    dot={{ r: 1.5 }}
                    connectNulls={false}
                  />
                ))}
            </LineChart>
          ) : (
            <LineChart
              data={aggregateChartData}
              margin={{ top: 10, right: 10, bottom: 20, left: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" />
              <XAxis
                type="number"
                dataKey="year"
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 12 }}
                domain={xAxisDomain}
                ticks={xAxisTicks}
                label={{
                  value: 'Years',
                  position: 'insideBottom',
                  offset: -5,
                  style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' },
                }}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 12 }}
                tickFormatter={(v: number) => v.toFixed(0)}
                label={{
                  value: 'Months',
                  angle: -90,
                  position: 'left',
                  style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' },
                }}
              />
              <Tooltip content={<CustomTooltip />} />
              {/* Headline: time on dialysis (W_C) */}
              {seriesVisible.dialysis && (
                <Line
                  type="monotone"
                  dataKey="dialysis"
                  stroke={COLORS.primary}
                  strokeWidth={3}
                  name={isBridge ? 'Time on dialysis' : 'Avg wait time'}
                  dot={{ fill: COLORS.primary, strokeWidth: 1, r: 1.5 }}
                  connectNulls={false}
                />
              )}
              {seriesVisible.dialysisLow && (
                <Line
                  type="monotone"
                  dataKey="dialysisLow"
                  stroke={COLORS.secondary}
                  strokeWidth={2}
                  name={`Low cPRA (0-${highCPRAThreshold}%)`}
                  dot={{ fill: COLORS.secondary, strokeWidth: 1, r: 1 }}
                  connectNulls={false}
                />
              )}
              {seriesVisible.dialysisHigh && (
                <Line
                  type="monotone"
                  dataKey="dialysisHigh"
                  stroke={COLORS.tertiary}
                  strokeWidth={2}
                  name={`High cPRA (${highCPRAThreshold}-100%)`}
                  dot={{ fill: COLORS.tertiary, strokeWidth: 1, r: 1 }}
                  connectNulls={false}
                />
              )}
              {seriesVisible.baseDialysis && hasBaseDialysis && (
                <Line
                  type="monotone"
                  dataKey="baseDialysis"
                  stroke={COLORS.primary}
                  strokeWidth={2.5}
                  strokeDasharray="5 5"
                  name={isBridge ? 'Time on dialysis (Base)' : 'Avg wait time (Base)'}
                  dot={{ fill: COLORS.primary, strokeWidth: 1, r: 1 }}
                  connectNulls={false}
                />
              )}
              {seriesVisible.baseDialysisLow && hasBaseDialysis && (
                <Line
                  type="monotone"
                  dataKey="baseDialysisLow"
                  stroke={COLORS.secondary}
                  strokeWidth={1.5}
                  strokeDasharray="5 5"
                  name={`Low cPRA (Base)`}
                  dot={{ fill: COLORS.secondary, strokeWidth: 1, r: 0.8 }}
                  connectNulls={false}
                />
              )}
              {seriesVisible.baseDialysisHigh && hasBaseDialysis && (
                <Line
                  type="monotone"
                  dataKey="baseDialysisHigh"
                  stroke={COLORS.tertiary}
                  strokeWidth={1.5}
                  strokeDasharray="5 5"
                  name={`High cPRA (Base)`}
                  dot={{ fill: COLORS.tertiary, strokeWidth: 1, r: 0.8 }}
                  connectNulls={false}
                />
              )}
              {/* Bridge-only overlays: total-wait (W) + time-on-bridge (W_X) */}
              {isBridge && seriesVisible.totalWait && (
                <Line
                  type="monotone"
                  dataKey="totalWait"
                  stroke={COLORS.primary}
                  strokeWidth={2}
                  strokeDasharray="1 3"
                  name="Total wait (incl. bridge)"
                  dot={{ fill: COLORS.primary, strokeWidth: 1, r: 1 }}
                  connectNulls={false}
                />
              )}
              {isBridge && seriesVisible.baseTotalWait && hasBaseTotalWait && (
                <Line
                  type="monotone"
                  dataKey="baseTotalWait"
                  stroke={COLORS.primary}
                  strokeWidth={1.5}
                  strokeDasharray="1 5"
                  opacity={0.6}
                  name="Total wait (Base)"
                  dot={{ r: 0 }}
                  connectNulls={false}
                />
              )}
              {isBridge && seriesVisible.bridgeOnly && (
                <Line
                  type="monotone"
                  dataKey="bridgeOnly"
                  stroke={COLORS.secondary}
                  strokeWidth={2}
                  strokeDasharray="3 3"
                  name="Time on bridge"
                  dot={{ fill: COLORS.secondary, strokeWidth: 1, r: 1 }}
                  connectNulls={false}
                />
              )}
            </LineChart>
          )}
        </ResponsiveContainer>

        <ChartSeriesToggle
          series={
            usingAgeView
              ? [
                  { key: 'dialysisLow', label: 'Low cPRA', color: COLORS.secondary },
                  { key: 'dialysisHigh', label: 'High cPRA', color: COLORS.tertiary },
                ]
              : [
                  { key: 'dialysis', label: isBridge ? 'Time on dialysis' : 'Avg wait', color: COLORS.primary },
                  { key: 'dialysisLow', label: 'Low cPRA', color: COLORS.secondary },
                  { key: 'dialysisHigh', label: 'High cPRA', color: COLORS.tertiary },
                  ...(hasBaseDialysis
                    ? [{ key: 'baseDialysis', label: isBridge ? 'Dialysis (Base)' : 'Avg wait (Base)', color: COLORS.primary }]
                    : []),
                  ...(hasBaseDialysis
                    ? [{ key: 'baseDialysisLow', label: 'Low cPRA (Base)', color: COLORS.secondary }]
                    : []),
                  ...(hasBaseDialysis
                    ? [{ key: 'baseDialysisHigh', label: 'High cPRA (Base)', color: COLORS.tertiary }]
                    : []),
                  ...(isBridge
                    ? [{ key: 'totalWait', label: 'Total wait', color: COLORS.primary }]
                    : []),
                  ...(isBridge && hasBaseTotalWait
                    ? [{ key: 'baseTotalWait', label: 'Total wait (Base)', color: COLORS.primary }]
                    : []),
                  ...(isBridge
                    ? [{ key: 'bridgeOnly', label: 'Time on bridge', color: COLORS.secondary }]
                    : []),
                ]
          }
          visible={seriesVisible}
          onChange={toggleSeries}
          chartId="waitTime"
        />

        {filteredByAge && filteredByAge.length > 0 && (
          <AgeGroupToggle
            chartId="waitTime"
            visible={ageGroups}
            onChange={toggleAge}
            expanded={ageExpanded}
            onToggleExpand={() => setAgeExpanded((p) => !p)}
          />
        )}

        <p className="text-[10px] text-muted-foreground mt-2 leading-snug">
          Estimated via Little's Law (W = L / λ_out) per year.{' '}
          {isBridge
            ? 'Time on dialysis uses L = C (un-bridged candidates) with outflow = tx_xeno + (tx_std − bridge_allo) + waitlist deaths + removals; total wait uses L = C + H_xeno (bridged patients still count as candidates) with outflow = tx_std + waitlist deaths + bridge deaths + removals.'
            : 'L = candidates on the waitlist; outflow = transplants + waitlist deaths + waitlist removals.'}{' '}
          The estimator is a state-based approximation — it does not track
          individual waiting trajectories, so single-year boundary effects
          (year 1 transient, year-H tail) should not be over-interpreted.
          Per-subgroup values are flow-weighted aggregates of their constituent
          (cPRA × age) cells.
        </p>
      </CardContent>
    </Card>
  );
};

export default WaitTimeChart;
