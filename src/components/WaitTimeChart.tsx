/**
 * WaitTimeChart — primary wait-time visualization.
 *
 * Renders the Little's-Law-derived average wait time over the simulation
 * horizon, with optional cPRA and age-group breakdowns and a base-case
 * comparison. Mirrors the structure of the "Waitlist Size Over Time" card
 * in SimulationCharts.tsx (same toggles, same color palette, same x-axis
 * configuration) so it slots seamlessly into either the Replacement or
 * Bridge therapy page.
 *
 * Numbers are months. NaN values (e.g. a subgroup with zero outflow in a
 * given year) become null in the chart data so Recharts skips them
 * gracefully instead of drawing 0 or extending the line through gaps.
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

interface WaitTimeRow {
  year: number;
  averageWaitingTimeMonths: number;
  baseAverageWaitingTimeMonths?: number;
  reductionMonths?: number;
  lowCPRA: number;
  highCPRA: number;
  baseLowCPRA?: number;
  baseHighCPRA?: number;
}

interface WaitTimeByAgeRow {
  year: number;
  lowCPRA: Record<string, number>;
  highCPRA: Record<string, number>;
  baseLowCPRA?: Record<string, number>;
  baseHighCPRA?: Record<string, number>;
}

interface WaitTimeChartProps {
  data: WaitTimeRow[] | undefined;
  dataByAge?: WaitTimeByAgeRow[];
  highCPRAThreshold: number;
  simulationHorizon: number;
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
}) => {
  // Series visibility — total xeno on by default; base case on so the
  // wait-time reduction story tells itself.
  const [seriesVisible, setSeriesVisible] = useState<Record<string, boolean>>({
    total: true,
    lowCPRA: false,
    highCPRA: false,
    baseTotal: true,
    baseLowCPRA: false,
    baseHighCPRA: false,
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
            Average Wait Time Over Time
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
  const hasBaseAggregate = filtered.some(
    (d) => d.baseAverageWaitingTimeMonths !== undefined && Number.isFinite(d.baseAverageWaitingTimeMonths),
  );

  const xAxisDomain = [0.5, simulationHorizon + 0.5];
  const xAxisTicks = Array.from({ length: simulationHorizon }, (_, i) => i + 1);

  // Per-year flattened rows for the age-stratified view. Mirrors the
  // `prepareAgeDataForChart` helper in SimulationCharts so age-stratified
  // and aggregate views share a consistent shape.
  const ageChartData = (filteredByAge || []).map((row) => {
    const out: Record<string, number | null> = { year: row.year };
    for (const ageKey of Object.keys(row.lowCPRA || {})) {
      out[`lowCPRA_${ageKey}`] = clean(row.lowCPRA[ageKey]);
    }
    for (const ageKey of Object.keys(row.highCPRA || {})) {
      out[`highCPRA_${ageKey}`] = clean(row.highCPRA[ageKey]);
    }
    return out;
  });

  // Aggregate rows with NaN sanitized.
  const aggregateChartData = filtered.map((row) => ({
    year: row.year,
    total: clean(row.averageWaitingTimeMonths),
    lowCPRA: clean(row.lowCPRA),
    highCPRA: clean(row.highCPRA),
    baseTotal: clean(row.baseAverageWaitingTimeMonths),
    baseLowCPRA: clean(row.baseLowCPRA),
    baseHighCPRA: clean(row.baseHighCPRA),
  }));

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
          Average Wait Time Over Time
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1.5">
          Estimated mean wait from listing to transplant (Little's Law: L / outflow), stratified by cPRA and age
        </p>
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
                  value: 'Avg wait time (months)',
                  angle: -90,
                  position: 'left',
                  style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' },
                }}
              />
              <Tooltip content={<CustomTooltip />} />
              {seriesVisible.lowCPRA &&
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
              {seriesVisible.highCPRA &&
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
                  value: 'Avg wait time (months)',
                  angle: -90,
                  position: 'left',
                  style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' },
                }}
              />
              <Tooltip content={<CustomTooltip />} />
              {seriesVisible.total && (
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke={COLORS.primary}
                  strokeWidth={3}
                  name="Total (Xeno)"
                  dot={{ fill: COLORS.primary, strokeWidth: 1, r: 1.5 }}
                  connectNulls={false}
                />
              )}
              {seriesVisible.lowCPRA && (
                <Line
                  type="monotone"
                  dataKey="lowCPRA"
                  stroke={COLORS.secondary}
                  strokeWidth={2}
                  name={`Low cPRA (0-${highCPRAThreshold}%) - Xeno`}
                  dot={{ fill: COLORS.secondary, strokeWidth: 1, r: 1 }}
                  connectNulls={false}
                />
              )}
              {seriesVisible.highCPRA && (
                <Line
                  type="monotone"
                  dataKey="highCPRA"
                  stroke={COLORS.tertiary}
                  strokeWidth={2}
                  name={`High cPRA (${highCPRAThreshold}-100%) - Xeno`}
                  dot={{ fill: COLORS.tertiary, strokeWidth: 1, r: 1 }}
                  connectNulls={false}
                />
              )}
              {seriesVisible.baseTotal && hasBaseAggregate && (
                <Line
                  type="monotone"
                  dataKey="baseTotal"
                  stroke={COLORS.primary}
                  strokeWidth={2.5}
                  strokeDasharray="5 5"
                  name="Total (Base Case)"
                  dot={{ fill: COLORS.primary, strokeWidth: 1, r: 1 }}
                  connectNulls={false}
                />
              )}
              {seriesVisible.baseLowCPRA && (
                <Line
                  type="monotone"
                  dataKey="baseLowCPRA"
                  stroke={COLORS.secondary}
                  strokeWidth={1.5}
                  strokeDasharray="5 5"
                  name={`Low cPRA (0-${highCPRAThreshold}%) - Base`}
                  dot={{ fill: COLORS.secondary, strokeWidth: 1, r: 0.8 }}
                  connectNulls={false}
                />
              )}
              {seriesVisible.baseHighCPRA && (
                <Line
                  type="monotone"
                  dataKey="baseHighCPRA"
                  stroke={COLORS.tertiary}
                  strokeWidth={1.5}
                  strokeDasharray="5 5"
                  name={`High cPRA (${highCPRAThreshold}-100%) - Base`}
                  dot={{ fill: COLORS.tertiary, strokeWidth: 1, r: 0.8 }}
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
                  { key: 'lowCPRA', label: 'Low cPRA', color: COLORS.secondary },
                  { key: 'highCPRA', label: 'High cPRA', color: COLORS.tertiary },
                ]
              : [
                  { key: 'total', label: 'Total (Xeno)', color: COLORS.primary },
                  { key: 'lowCPRA', label: 'Low cPRA (Xeno)', color: COLORS.secondary },
                  { key: 'highCPRA', label: 'High cPRA (Xeno)', color: COLORS.tertiary },
                  ...(hasBaseAggregate
                    ? [{ key: 'baseTotal', label: 'Total (Base)', color: COLORS.primary }]
                    : []),
                  ...(hasBaseAggregate
                    ? [{ key: 'baseLowCPRA', label: 'Low cPRA (Base)', color: COLORS.secondary }]
                    : []),
                  ...(hasBaseAggregate
                    ? [{ key: 'baseHighCPRA', label: 'High cPRA (Base)', color: COLORS.tertiary }]
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
          Estimated via Little's Law (W = L / λ_out) per year using mean waitlist size
          and combined transplant + waitlist-death outflow. Per-subgroup values are
          flow-weighted aggregates of their constituent (cPRA × age) cells. Years
          with zero outflow (typically high-cPRA cells at year&nbsp;1) are omitted.
        </p>
      </CardContent>
    </Card>
  );
};

export default WaitTimeChart;
