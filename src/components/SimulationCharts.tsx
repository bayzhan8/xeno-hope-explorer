import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, BarChart, Bar, Legend, Tooltip, ReferenceLine } from 'recharts';
import { ChartSeriesToggle } from './ChartSeriesToggle';
import { AgeGroupToggle, AGE_GROUPS } from './AgeGroupToggle';
import ChartContextHeader from './ChartContextHeader';
import {
  fmtCount,
  fmtDelta,
  fmtDeltaPct,
  fmtSupplyTag,
  strategyLabel,
  type SupplyContext,
} from '@/utils/chartFormat';

interface SimulationData {
  waitlistData: Array<{ year: number; total: number; lowCPRA: number; highCPRA: number; baseHighCPRA?: number; baseLowCPRA?: number; baseTotal?: number }>;
  waitlistDeathsData: Array<{ year: number; waitlistDeaths: number }>;
  postTransplantDeathsData: Array<{ year: number; xenoPostTransplantDeaths: number; humanPostTransplantDeaths: number }>;
  netDeathsPreventedData: Array<{ year: number; netDeathsPrevented: number }>;
  graftFailuresData: Array<{ year: number; xenoGraftFailures: number; humanGraftFailures: number }>;
  transplantsData: Array<{ year: number; human: number; xeno: number }>;
  penetrationData: Array<{ year: number; proportion: number }>;
  waitingTimeData: Array<{ year: number; averageWaitingTime: number }>;
  recipientsData: Array<{ year: number; lowHuman: number; highHuman: number; highXeno: number; lowXeno: number }>;
  cumulativeDeathsData: Array<{ year: number; lowWaitlist: number; highWaitlist: number; lowPostTx: number; highPostTx: number; total: number }>;
  deathsPerYearData: Array<{ year: number; low: number; high: number; total: number }>;
  deathsPerDayData: Array<{ year: number; low: number; high: number; total: number }>;
  netDeathsPreventedPerYearData: Array<{ year: number; low: number; high: number; total: number }>;
  waitlistDeathsPerYearData: Array<{ year: number; waitlistDeaths: number; baseWaitlistDeaths?: number }>;
  // Age-specific data (optional)
  waitlistDataByAge?: Array<{ year: number; lowCPRA: Record<string, number>; highCPRA: Record<string, number> }>;
  netDeathsPreventedByAge?: Array<{ year: number; lowCPRA: Record<string, number>; highCPRA: Record<string, number>; total: Record<string, number> }>;
  recipientsDataByAge?: Array<{
    year: number;
    lowCPRA: Record<string, number>;
    highCPRA: Record<string, number>;
    lowHuman?: Record<string, number>;
    highHuman?: Record<string, number>;
    lowXeno?: Record<string, number>;
    highXeno?: Record<string, number>;
  }>;
  cumulativeDeathsDataByAge?: Array<{
    year: number;
    lowCPRA: Record<string, number>;
    highCPRA: Record<string, number>;
    lowWaitlist?: Record<string, number>;
    highWaitlist?: Record<string, number>;
    lowPostTx?: Record<string, number>;
    highPostTx?: Record<string, number>;
  }>;
  deathsPerYearDataByAge?: Array<{ year: number; lowCPRA: Record<string, number>; highCPRA: Record<string, number> }>;
  waitlistDeathsPerYearDataByAge?: Array<{ year: number; total: Record<string, number> }>;
}

interface SimulationChartsProps {
  data: SimulationData;
  highCPRAThreshold: number;
  simulationHorizon: number;
  /**
   * Supply context threaded from the page (Index / Bridge). Tooltips
   * and chart context headers display these so users can never be
   * confused about which scenario produced the curves.
   */
  xenoIntendedPerYear: number;
  xenoBaseRate: number;
  xenoProportion: number;
  targetingStrategy: string;
}

const SimulationCharts: React.FC<SimulationChartsProps> = ({
  data,
  highCPRAThreshold,
  simulationHorizon,
  xenoIntendedPerYear,
  xenoBaseRate,
  xenoProportion,
  targetingStrategy,
}) => {
  // Supply context, identical across every chart in the page. Wrap in
  // useMemo so the tooltip factories below are stable across rerenders
  // unless something the user changed actually matters.
  const supplyContext = useMemo<SupplyContext>(
    () => ({
      xenoIntendedPerYear,
      xenoBaseRate,
      proportion: xenoProportion,
      strategy: targetingStrategy,
      highCPRAThreshold,
      horizon: simulationHorizon,
    }),
    [xenoIntendedPerYear, xenoBaseRate, xenoProportion, targetingStrategy, highCPRAThreshold, simulationHorizon],
  );
  const supplyTag = useMemo(() => fmtSupplyTag(supplyContext), [supplyContext]);

  // Strategy/threshold-derived labels used throughout the charts.
  const lowCpraLabel = `Low cPRA (0–${highCPRAThreshold}%)`;
  const highCpraLabel = `High cPRA (≥${highCPRAThreshold}%)`;
  // State for toggling chart series visibility
  const [waitlistSeriesVisible, setWaitlistSeriesVisible] = useState<Record<string, boolean>>({
    total: true,
    lowCPRA: false,  // Default OFF per user request
    highCPRA: false, // Default OFF per user request
    baseTotal: false,
    baseLowCPRA: false,
    baseHighCPRA: false,
  });

  const [recipientsSeriesVisible, setRecipientsSeriesVisible] = useState<Record<string, boolean>>({
    lowHuman: true,
    highHuman: true,
    highXeno: true,
    lowXeno: true,
    total: false,
  });

  const [deathsSeriesVisible, setDeathsSeriesVisible] = useState<Record<string, boolean>>({
    lowWaitlist: true,
    highWaitlist: true,
    lowPostTx: true,
    highPostTx: true,
    total: true,
  });

  const [netDeathsSeriesVisible, setNetDeathsSeriesVisible] = useState<Record<string, boolean>>({
    low: true,
    high: true,
    total: true,
  });

  const [deathsPerYearSeriesVisible, setDeathsPerYearSeriesVisible] = useState<Record<string, boolean>>({
    low: true,
    high: true,
    total: true,
  });

  const [waitlistDeathsPerYearSeriesVisible, setWaitlistDeathsPerYearSeriesVisible] = useState<Record<string, boolean>>({
    total: true,
    lowCPRA: false,
    highCPRA: false,
    baseTotal: true,
    baseLowCPRA: false,
    baseHighCPRA: false,
  });

  // Per-chart age group visibility state
  const defaultAgeGroups = { age0_18: true, age18_45: true, age45_60: true, age60plus: true };
  const [ageGroupsPerChart, setAgeGroupsPerChart] = useState<Record<string, Record<string, boolean>>>({
    waitlist: { ...defaultAgeGroups },
    recipients: { ...defaultAgeGroups },
    cumulativeDeaths: { ...defaultAgeGroups },
    deathsPerYear: { ...defaultAgeGroups },
    waitlistDeathsPerYear: { ...defaultAgeGroups },
    netDeathsPrevented: { ...defaultAgeGroups },
  });

  // Independent age breakdown state for each chart
  const [ageBreakdownExpanded, setAgeBreakdownExpanded] = useState<Record<string, boolean>>({
    waitlist: false,
    recipients: false,
    cumulativeDeaths: false,
    deathsPerYear: false,
    waitlistDeathsPerYear: false,
    netDeathsPrevented: false,
  });

  const toggleWaitlistSeries = (key: string, visible: boolean) => {
    setWaitlistSeriesVisible(prev => ({ ...prev, [key]: visible }));
  };

  const toggleRecipientsSeries = (key: string, visible: boolean) => {
    setRecipientsSeriesVisible(prev => ({ ...prev, [key]: visible }));
  };

  const toggleDeathsSeries = (key: string, visible: boolean) => {
    setDeathsSeriesVisible(prev => ({ ...prev, [key]: visible }));
  };

  const toggleNetDeathsSeries = (key: string, visible: boolean) => {
    setNetDeathsSeriesVisible(prev => ({ ...prev, [key]: visible }));
  };

  const toggleDeathsPerYearSeries = (key: string, visible: boolean) => {
    setDeathsPerYearSeriesVisible(prev => ({ ...prev, [key]: visible }));
  };

  const toggleWaitlistDeathsPerYearSeries = (key: string, visible: boolean) => {
    setWaitlistDeathsPerYearSeriesVisible(prev => ({ ...prev, [key]: visible }));
  };

  const toggleAgeGroup = (chartKey: string) => (key: string, visible: boolean) => {
    setAgeGroupsPerChart(prev => ({
      ...prev,
      [chartKey]: { ...prev[chartKey], [key]: visible },
    }));
  };

  // Helper: Prepare age-specific data for charts
  const prepareAgeDataForChart = (
    ageData:
      | Array<{
          year: number;
          lowCPRA: Record<string, number>;
          highCPRA: Record<string, number>;
          total?: Record<string, number>;
          lowWaitlist?: Record<string, number>;
          highWaitlist?: Record<string, number>;
          lowPostTx?: Record<string, number>;
          highPostTx?: Record<string, number>;
          lowHuman?: Record<string, number>;
          highHuman?: Record<string, number>;
          lowXeno?: Record<string, number>;
          highXeno?: Record<string, number>;
        }>
      | undefined
  ) => {
    if (!ageData || ageData.length === 0) return [];

    try {
      return ageData.map(yearData => {
        const chartPoint: any = { year: yearData.year };

        const lowByAge: Record<string, number> = {};
        const highByAge: Record<string, number> = {};

        if (yearData.lowCPRA && typeof yearData.lowCPRA === 'object') {
          for (const [ageKey, value] of Object.entries(yearData.lowCPRA)) {
            chartPoint[`lowCPRA_${ageKey}`] = value;
            lowByAge[ageKey] = value;
          }
        }

        if (yearData.highCPRA && typeof yearData.highCPRA === 'object') {
          for (const [ageKey, value] of Object.entries(yearData.highCPRA)) {
            chartPoint[`highCPRA_${ageKey}`] = value;
            highByAge[ageKey] = value;
          }
        }

        // Optional waitlist / post-tx breakdowns (cumulative deaths chart)
        const flattenInto = (
          source: Record<string, number> | undefined,
          prefix: string
        ) => {
          if (!source || typeof source !== 'object') return;
          for (const [ageKey, value] of Object.entries(source)) {
            chartPoint[`${prefix}_${ageKey}`] = value;
          }
        };
        flattenInto(yearData.lowWaitlist, 'lowWaitlist');
        flattenInto(yearData.highWaitlist, 'highWaitlist');
        flattenInto(yearData.lowPostTx, 'lowPostTx');
        flattenInto(yearData.highPostTx, 'highPostTx');
        flattenInto(yearData.lowHuman, 'lowHuman');
        flattenInto(yearData.highHuman, 'highHuman');
        flattenInto(yearData.lowXeno, 'lowXeno');
        flattenInto(yearData.highXeno, 'highXeno');

        // Use precomputed totals if backend provided them; otherwise sum low + high
        if (yearData.total && typeof yearData.total === 'object') {
          for (const [ageKey, value] of Object.entries(yearData.total)) {
            chartPoint[`total_${ageKey}`] = value;
          }
        } else {
          const ageKeys = new Set([...Object.keys(lowByAge), ...Object.keys(highByAge)]);
          for (const ageKey of ageKeys) {
            chartPoint[`total_${ageKey}`] = (lowByAge[ageKey] || 0) + (highByAge[ageKey] || 0);
          }
        }

        return chartPoint;
      });
    } catch (error) {
      console.error('Error preparing age data for chart:', error);
      return [];
    }
  };

  // Filter data to only include years up to simulationHorizon
  const filterByYear = <T extends { year: number }>(arr: T[]): T[] => {
    return arr.filter(item => item.year <= simulationHorizon);
  };

  // Prepare filtered data
  const filteredData = {
    waitlistData: filterByYear(data.waitlistData),
    waitlistDeathsData: filterByYear(data.waitlistDeathsData),
    postTransplantDeathsData: filterByYear(data.postTransplantDeathsData),
    netDeathsPreventedData: filterByYear(data.netDeathsPreventedData),
    graftFailuresData: filterByYear(data.graftFailuresData),
    transplantsData: filterByYear(data.transplantsData),
    penetrationData: filterByYear(data.penetrationData),
    waitingTimeData: filterByYear(data.waitingTimeData),
    recipientsData: filterByYear(data.recipientsData),
    cumulativeDeathsData: filterByYear(data.cumulativeDeathsData),
    deathsPerYearData: filterByYear(data.deathsPerYearData),
    deathsPerDayData: filterByYear(data.deathsPerDayData),
    netDeathsPreventedPerYearData: filterByYear(data.netDeathsPreventedPerYearData),
    waitlistDeathsPerYearData: data.waitlistDeathsPerYearData.filter(d => d.year <= simulationHorizon),
    // Age-specific data (optional)
    waitlistDataByAge: data.waitlistDataByAge ? filterByYear(data.waitlistDataByAge) : undefined,
    netDeathsPreventedByAge: data.netDeathsPreventedByAge ? filterByYear(data.netDeathsPreventedByAge) : undefined,
    recipientsDataByAge: data.recipientsDataByAge ? filterByYear(data.recipientsDataByAge) : undefined,
    cumulativeDeathsDataByAge: data.cumulativeDeathsDataByAge ? filterByYear(data.cumulativeDeathsDataByAge) : undefined,
    deathsPerYearDataByAge: data.deathsPerYearDataByAge ? filterByYear(data.deathsPerYearDataByAge) : undefined,
    waitlistDeathsPerYearDataByAge: data.waitlistDeathsPerYearDataByAge ? filterByYear(data.waitlistDeathsPerYearDataByAge) : undefined,
  };

  const hasLowXeno = data.recipientsData.some(d => d.lowXeno > 0);

  // Dynamic x-axis configuration based on horizon
  const xAxisDomain = [0.5, simulationHorizon + 0.5];
  const xAxisTicks = Array.from({ length: simulationHorizon }, (_, i) => i + 1);
  const COLORS = {
    primary: 'hsl(var(--chart-primary))',
    secondary: 'hsl(var(--chart-secondary))',
    tertiary: 'hsl(var(--chart-tertiary))',
    quaternary: 'hsl(var(--chart-quaternary))',
  };

  // ───────────────────────────────────────────────────────────────────
  // Cohort-aware chart tooltip
  // ───────────────────────────────────────────────────────────────────
  // Recharts' default tooltip only knows about the series currently
  // rendered on screen. The May 2026 design review explicitly asked for
  // *simultaneous baseline + intervention visibility* in every tooltip,
  // even when the baseline lines are toggled off in the chart. To do
  // that we look the row up by year directly from the underlying
  // dataset (`rows`) instead of relying on Recharts' `payload`.
  //
  // Each chart instantiates its own tooltip via `makeChartTooltip`
  // below, passing in:
  //   - rows:        the dataset the chart is actually plotting
  //   - cohorts:     { key, baseKey?, label, accent? } per series row
  //   - yearLabel:   how to render the x-axis value ("Year 5", "Year 5 (end)")
  //   - measureLabel:short label for the y-axis quantity ("patients",
  //                  "deaths", "lives saved/yr")
  //   - extraNote:   optional one-liner appended above the supply tag
  // ───────────────────────────────────────────────────────────────────
  type TooltipCohort = {
    /** Field name on the row for the intervention value. */
    key: string;
    /** Field name on the row for the matched baseline value (optional). */
    baseKey?: string;
    /** Human-readable cohort name displayed in the tooltip. */
    label: string;
    /** Color swatch used as a left accent stripe. */
    color?: string;
    /** Override formatter (defaults to fmtCount). */
    format?: (v: number | undefined) => string;
  };

  const makeChartTooltip = (
    rows: Array<Record<string, unknown>>,
    cohorts: TooltipCohort[],
    measureLabel: string,
    extraNote?: string,
  ) => {
    // Map year → row so the tooltip can grab every cohort & baseline
    // value for the hovered year, not just the series visible on screen.
    const byYear = new Map<number, Record<string, unknown>>();
    for (const row of rows) {
      const y = (row.year as number);
      if (typeof y === 'number') byYear.set(y, row);
    }

    return ({ active, label }: any) => {
      if (!active || label == null) return null;
      // Recharts gives us `label` as the x value (a number). Use it
      // verbatim — using a different lookup key risks the off-by-one
      // confusion meeting attendees flagged.
      const row = byYear.get(label as number);
      if (!row) return null;

      const yearLabel = `End of year ${typeof label === 'number' ? label : Number(label).toFixed(0)}`;

      return (
        <div className="bg-card border border-medical-border rounded-lg p-3 shadow-[var(--shadow-medium)] min-w-[260px]">
          <p className="text-sm font-semibold text-foreground mb-2 pb-1.5 border-b border-medical-border">
            {yearLabel}
          </p>
          <div className="space-y-2">
            {cohorts.map((c) => {
              const raw = row[c.key];
              const baseRaw = c.baseKey ? row[c.baseKey] : undefined;
              const value = typeof raw === 'number' ? raw : undefined;
              const base = typeof baseRaw === 'number' ? baseRaw : undefined;
              const formatVal = c.format ?? fmtCount;
              const haveBase = base !== undefined;
              const delta = haveBase && value !== undefined ? value - base : undefined;

              return (
                <div key={c.key} className="text-xs leading-snug">
                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                    {c.color && (
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0"
                        style={{ backgroundColor: c.color }}
                        aria-hidden
                      />
                    )}
                    <span>{c.label}</span>
                  </div>
                  <div className="ml-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 mt-0.5">
                    <span className="text-muted-foreground">Intervention</span>
                    <span className="text-foreground tabular-nums text-right">
                      {value !== undefined ? formatVal(value) : '—'}
                    </span>
                    <span className="text-muted-foreground">Baseline</span>
                    <span className="text-foreground tabular-nums text-right">
                      {haveBase ? formatVal(base) : 'n/a'}
                    </span>
                    {haveBase && (
                      <>
                        <span className="text-muted-foreground">Δ vs. baseline</span>
                        <span
                          className={
                            'tabular-nums text-right ' +
                            (delta === undefined || delta === 0
                              ? 'text-muted-foreground'
                              : delta < 0
                                ? 'text-success'
                                : 'text-destructive')
                          }
                        >
                          {delta !== undefined ? `${fmtDelta(delta)} (${fmtDeltaPct(value!, base)})` : '—'}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 pt-1.5 border-t border-medical-border text-[10px] text-muted-foreground leading-snug">
            <p className="mb-0.5"><span className="font-medium text-foreground">Unit:</span> {measureLabel}</p>
            {extraNote && <p className="mb-0.5">{extraNote}</p>}
            <p><span className="font-medium text-foreground">Supply:</span> {supplyTag}</p>
          </div>
        </div>
      );
    };
  };

  /**
   * Helper that derives a "total" delta-color for stacked bar / mixed-sign
   * charts. For "deaths prevented" higher is better, so positive Δ is green.
   * Default convention (lower count = better) is used elsewhere.
   */
  const makeNetPreventedTooltip = (
    rows: Array<Record<string, unknown>>,
    cohorts: TooltipCohort[],
  ) => {
    const byYear = new Map<number, Record<string, unknown>>();
    for (const row of rows) {
      const y = (row.year as number);
      if (typeof y === 'number') byYear.set(y, row);
    }

    return ({ active, label }: any) => {
      if (!active || label == null) return null;
      const row = byYear.get(label as number);
      if (!row) return null;
      const yearLabel = `End of year ${typeof label === 'number' ? label : Number(label).toFixed(0)}`;
      return (
        <div className="bg-card border border-medical-border rounded-lg p-3 shadow-[var(--shadow-medium)] min-w-[240px]">
          <p className="text-sm font-semibold text-foreground mb-2 pb-1.5 border-b border-medical-border">
            {yearLabel}
          </p>
          <div className="space-y-1">
            {cohorts.map((c) => {
              const v = row[c.key];
              const value = typeof v === 'number' ? v : undefined;
              return (
                <div key={c.key} className="flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    {c.color && (
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-sm"
                        style={{ backgroundColor: c.color }}
                        aria-hidden
                      />
                    )}
                    <span className="text-foreground">{c.label}</span>
                  </div>
                  <span
                    className={
                      'tabular-nums ' +
                      (value === undefined || value === 0
                        ? 'text-muted-foreground'
                        : value > 0
                          ? 'text-success font-medium'
                          : 'text-destructive font-medium')
                    }
                  >
                    {value !== undefined ? fmtDelta(value) : '—'}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-2 pt-1.5 border-t border-medical-border text-[10px] text-muted-foreground leading-snug">
            <p className="mb-0.5">
              <span className="font-medium text-foreground">Unit:</span> lives saved per year (positive = fewer deaths vs. baseline)
            </p>
            <p><span className="font-medium text-foreground">Supply:</span> {supplyTag}</p>
          </div>
        </div>
      );
    };
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* 1. Waitlist Sizes Over Time */}
      <Card className="col-span-1 bg-card shadow-lg border-medical-border hover:shadow-xl transition-shadow duration-300">
        <CardHeader className="border-b border-medical-border bg-gradient-to-br from-medical-surface to-medical-surface/50 pb-4">
          <CardTitle className="text-lg font-semibold text-primary">Waitlist Size Over Time</CardTitle>
          <p className="text-xs text-muted-foreground mt-1.5">Patients on the kidney waitlist at year-end, stratified by cPRA level</p>
          <ChartContextHeader
            population={`All candidates on U.S. kidney waitlist (cPRA threshold: ${highCPRAThreshold}%)`}
            measure="Snapshot count (stock) — patients currently waiting"
            timing="Year-end snapshot · years 1–10"
            supplyTag={supplyTag}
          />
        </CardHeader>
        <CardContent className="px-4 pt-4 pb-1">
          <ResponsiveContainer width="100%" height={390}>
            {ageBreakdownExpanded.waitlist && filteredData.waitlistDataByAge ? (
              <LineChart data={prepareAgeDataForChart(filteredData.waitlistDataByAge)} margin={{ top: 10, right: 10, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" />
                <XAxis
                  type="number"
                  dataKey="year"
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 12 }}
                  domain={xAxisDomain}
                  ticks={xAxisTicks}
                  label={{ value: 'Simulation year', position: 'insideBottom', offset: -5, style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 12 }}
                  tickFormatter={fmtCount}
                  label={{ value: 'Patients waiting', angle: -90, position: 'left', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }}
                />
                <Tooltip content={makeChartTooltip(
                  prepareAgeDataForChart(filteredData.waitlistDataByAge),
                  AGE_GROUPS.filter(g => ageGroupsPerChart.waitlist[g.key]).flatMap(g => [
                    { key: `total_${g.key}`, label: `Total · age ${g.label}y`, color: g.color },
                  ]),
                  'patients waiting (head count)',
                  'Age breakdown shown — toggle "Age Group Breakdown" off to see baseline overlays',
                )} />
                {/* Total age groups (low + high cPRA) */}
                {waitlistSeriesVisible.total && AGE_GROUPS.filter(group => ageGroupsPerChart.waitlist[group.key]).map(group => (
                  <Line
                    key={`total_${group.key}`}
                    type="monotone"
                    dataKey={`total_${group.key}`}
                    stroke={group.color}
                    strokeWidth={3}
                    name={`Total ${group.label}y`}
                    dot={{ r: 1.5 }}
                  />
                ))}
                {/* Low cPRA age groups */}
                {waitlistSeriesVisible.lowCPRA && AGE_GROUPS.filter(group => ageGroupsPerChart.waitlist[group.key]).map(group => (
                  <Line
                    key={`lowCPRA_${group.key}`}
                    type="monotone"
                    dataKey={`lowCPRA_${group.key}`}
                    stroke={group.color}
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    name={`Low cPRA ${group.label}y`}
                    dot={{ r: 1 }}
                  />
                ))}
                {/* High cPRA age groups */}
                {waitlistSeriesVisible.highCPRA && AGE_GROUPS.filter(group => ageGroupsPerChart.waitlist[group.key]).map(group => (
                  <Line
                    key={`highCPRA_${group.key}`}
                    type="monotone"
                    dataKey={`highCPRA_${group.key}`}
                    stroke={group.color}
                    strokeWidth={2.5}
                    strokeDasharray="2 2"
                    name={`High cPRA ${group.label}y`}
                    dot={{ r: 1.5 }}
                  />
                ))}
              </LineChart>
            ) : (
              <LineChart data={filteredData.waitlistData} margin={{ top: 10, right: 10, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" />
                <XAxis
                  type="number"
                  dataKey="year"
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 12 }}
                  domain={xAxisDomain}
                  ticks={xAxisTicks}
                  label={{ value: 'Simulation year', position: 'insideBottom', offset: -5, style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 12 }}
                  tickFormatter={fmtCount}
                  label={{ value: 'Patients waiting', angle: -90, position: 'left', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }}
                />
                <Tooltip content={makeChartTooltip(
                  filteredData.waitlistData,
                  [
                    { key: 'total', baseKey: 'baseTotal', label: 'Total waitlist', color: COLORS.primary },
                    { key: 'highCPRA', baseKey: 'baseHighCPRA', label: highCpraLabel, color: COLORS.tertiary },
                    { key: 'lowCPRA', baseKey: 'baseLowCPRA', label: lowCpraLabel, color: COLORS.secondary },
                  ],
                  'patients waiting (head count)',
                )} />
                {waitlistSeriesVisible.total && (
                  <Line
                    type="monotone"
                    dataKey="total"
                    stroke={COLORS.primary}
                    strokeWidth={3}
                    name="Total Waitlist (Xeno)"
                    dot={{ fill: COLORS.primary, strokeWidth: 1, r: 1.5 }}
                  />
                )}
                {waitlistSeriesVisible.lowCPRA && (
                  <Line
                    type="monotone"
                    dataKey="lowCPRA"
                    stroke={COLORS.secondary}
                    strokeWidth={2}
                    name={`Low CPRA (0-${highCPRAThreshold}%) - Xeno`}
                    dot={{ fill: COLORS.secondary, strokeWidth: 1, r: 1 }}
                  />
                )}
                {waitlistSeriesVisible.highCPRA && (
                  <Line
                    type="monotone"
                    dataKey="highCPRA"
                    stroke={COLORS.tertiary}
                    strokeWidth={2}
                    name={`High CPRA (${highCPRAThreshold}-100%) - Xeno`}
                    dot={{ fill: COLORS.tertiary, strokeWidth: 1, r: 1 }}
                  />
                )}
                {/* Base case comparison lines (dashed) */}
                {waitlistSeriesVisible.baseTotal && filteredData.waitlistData.some(d => d.baseTotal !== undefined) && (
                  <Line
                    type="monotone"
                    dataKey="baseTotal"
                    stroke={COLORS.primary}
                    strokeWidth={2.5}
                    strokeDasharray="5 5"
                    name="Total Waitlist (Base Case)"
                    dot={{ fill: COLORS.primary, strokeWidth: 1, r: 1 }}
                  />
                )}
                {waitlistSeriesVisible.baseLowCPRA && filteredData.waitlistData.some(d => d.baseLowCPRA !== undefined) && (
                  <Line
                    type="monotone"
                    dataKey="baseLowCPRA"
                    stroke={COLORS.secondary}
                    strokeWidth={1.5}
                    strokeDasharray="5 5"
                    name={`Low CPRA (0-${highCPRAThreshold}%) - Base`}
                    dot={{ fill: COLORS.secondary, strokeWidth: 1, r: 0.8 }}
                  />
                )}
                {waitlistSeriesVisible.baseHighCPRA && filteredData.waitlistData.some(d => d.baseHighCPRA !== undefined) && (
                  <Line
                    type="monotone"
                    dataKey="baseHighCPRA"
                    stroke={COLORS.tertiary}
                    strokeWidth={1.5}
                    strokeDasharray="5 5"
                    name={`High CPRA (${highCPRAThreshold}-100%) - Base`}
                    dot={{ fill: COLORS.tertiary, strokeWidth: 1, r: 0.8 }}
                  />
                )}
              </LineChart>
            )}
          </ResponsiveContainer>

          {/* Series Toggle */}
          <ChartSeriesToggle
            series={
              ageBreakdownExpanded.waitlist
                ? [
                    { key: 'total', label: `Total`, color: COLORS.primary },
                    { key: 'lowCPRA', label: `Low cPRA`, color: COLORS.secondary },
                    { key: 'highCPRA', label: `High cPRA`, color: COLORS.tertiary },
                  ]
                : [
                    { key: 'total', label: 'Total (Xeno)', color: COLORS.primary },
                    { key: 'lowCPRA', label: `Low CPRA (Xeno)`, color: COLORS.secondary },
                    { key: 'highCPRA', label: `High CPRA (Xeno)`, color: COLORS.tertiary },
                    ...(filteredData.waitlistData.some(d => d.baseTotal !== undefined)
                      ? [{ key: 'baseTotal', label: 'Total (Base)', color: COLORS.primary }]
                      : []),
                    ...(filteredData.waitlistData.some(d => d.baseLowCPRA !== undefined)
                      ? [{ key: 'baseLowCPRA', label: 'Low CPRA (Base)', color: COLORS.secondary }]
                      : []),
                    ...(filteredData.waitlistData.some(d => d.baseHighCPRA !== undefined)
                      ? [{ key: 'baseHighCPRA', label: 'High CPRA (Base)', color: COLORS.tertiary }]
                      : []),
                  ]
            }
            visible={waitlistSeriesVisible}
            onChange={toggleWaitlistSeries}
            chartId="waitlist"
          />

          {/* Age Group Toggle */}
          {filteredData.waitlistDataByAge && (
            <AgeGroupToggle
              chartId="waitlist"
              visible={ageGroupsPerChart.waitlist}
              onChange={toggleAgeGroup('waitlist')}
              expanded={ageBreakdownExpanded.waitlist}
              onToggleExpand={() => setAgeBreakdownExpanded(prev => ({ ...prev, waitlist: !prev.waitlist }))}
            />
          )}
        </CardContent>
      </Card>


      {/* 2. Transplant Recipients Over Time */}
      <Card className="bg-card shadow-lg border-medical-border hover:shadow-xl transition-shadow duration-300">
        <CardHeader className="border-b border-medical-border bg-gradient-to-br from-medical-surface to-medical-surface/50 pb-4">
          <CardTitle className="text-lg font-semibold text-primary">Living Transplant Recipients Over Time</CardTitle>
          <p className="text-xs text-muted-foreground mt-1.5">Patients living with a functioning kidney graft, split by organ source</p>
          <ChartContextHeader
            population={`Recipients of human or xeno kidneys (cPRA threshold: ${highCPRAThreshold}%)`}
            measure="Snapshot count (stock) — patients alive with a working graft"
            timing="Year-end snapshot · years 1–10"
            supplyTag={supplyTag}
            note="This is a stock, not a flow. Recipients leave through death or graft failure — graft failures return them to the waitlist."
          />
        </CardHeader>
        <CardContent className="px-4 pt-4 pb-1">
          <ResponsiveContainer width="100%" height={325}>
            {ageBreakdownExpanded.recipients && filteredData.recipientsDataByAge ? (() => {
              const sample = filteredData.recipientsDataByAge[0];
              const hasSplit = !!(sample && (sample.lowHuman || sample.highHuman || sample.lowXeno || sample.highXeno));
              const visibleAgeGroups = AGE_GROUPS.filter(group => ageGroupsPerChart.recipients[group.key]);
              return (
                <LineChart data={prepareAgeDataForChart(filteredData.recipientsDataByAge)} margin={{ top: 10, right: 10, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" />
                  <XAxis
                    type="number"
                    dataKey="year"
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fontSize: 12 }}
                    domain={xAxisDomain}
                    ticks={xAxisTicks}
                    label={{ value: 'Simulation year', position: 'insideBottom', offset: -5, style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }}
                  />
                  <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 12 }} tickFormatter={fmtCount} label={{ value: 'Living recipients', angle: -90, position: 'left', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }} />
                  <Tooltip content={makeChartTooltip(
                    prepareAgeDataForChart(filteredData.recipientsDataByAge),
                    AGE_GROUPS.filter(g => ageGroupsPerChart.recipients[g.key]).map(g => (
                      { key: `total_${g.key}`, label: `Total · age ${g.label}y`, color: g.color }
                    )),
                    'living recipients (head count)',
                  )} />
                  {/* Total age groups (low + high cPRA, human + xeno) */}
                  {recipientsSeriesVisible.total && visibleAgeGroups.map(group => (
                    <Line
                      key={`total_${group.key}`}
                      type="monotone"
                      dataKey={`total_${group.key}`}
                      stroke={group.color}
                      strokeWidth={3}
                      name={`Total ${group.label}y`}
                      dot={{ r: 0.3 }}
                    />
                  ))}
                  {hasSplit ? (
                    <>
                      {recipientsSeriesVisible.lowHuman && visibleAgeGroups.map(group => (
                        <Line
                          key={`lowHuman_${group.key}`}
                          type="monotone"
                          dataKey={`lowHuman_${group.key}`}
                          stroke={group.color}
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          name={`Low cPRA human ${group.label}y`}
                          dot={{ r: 0.15 }}
                        />
                      ))}
                      {recipientsSeriesVisible.highHuman && visibleAgeGroups.map(group => (
                        <Line
                          key={`highHuman_${group.key}`}
                          type="monotone"
                          dataKey={`highHuman_${group.key}`}
                          stroke={group.color}
                          strokeWidth={2.5}
                          strokeDasharray="5 5"
                          name={`High cPRA human ${group.label}y`}
                          dot={{ r: 0.2 }}
                        />
                      ))}
                      {recipientsSeriesVisible.lowXeno && visibleAgeGroups.map(group => (
                        <Line
                          key={`lowXeno_${group.key}`}
                          type="monotone"
                          dataKey={`lowXeno_${group.key}`}
                          stroke={group.color}
                          strokeWidth={2}
                          name={`Low cPRA xeno ${group.label}y`}
                          dot={{ r: 0.15 }}
                        />
                      ))}
                      {recipientsSeriesVisible.highXeno && visibleAgeGroups.map(group => (
                        <Line
                          key={`highXeno_${group.key}`}
                          type="monotone"
                          dataKey={`highXeno_${group.key}`}
                          stroke={group.color}
                          strokeWidth={2.5}
                          name={`High cPRA xeno ${group.label}y`}
                          dot={{ r: 0.2 }}
                        />
                      ))}
                    </>
                  ) : (
                    <>
                      {/* Older JSONs: only the human-aggregated lowCPRA/highCPRA series exist */}
                      {recipientsSeriesVisible.lowHuman && visibleAgeGroups.map(group => (
                        <Line
                          key={`lowCPRA_${group.key}`}
                          type="monotone"
                          dataKey={`lowCPRA_${group.key}`}
                          stroke={group.color}
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          name={`Low cPRA ${group.label}y`}
                          dot={{ r: 0.2 }}
                        />
                      ))}
                      {(recipientsSeriesVisible.highHuman || recipientsSeriesVisible.highXeno) && visibleAgeGroups.map(group => (
                        <Line
                          key={`highCPRA_${group.key}`}
                          type="monotone"
                          dataKey={`highCPRA_${group.key}`}
                          stroke={group.color}
                          strokeWidth={2.5}
                          strokeDasharray="2 2"
                          name={`High cPRA ${group.label}y`}
                          dot={{ r: 0.3 }}
                        />
                      ))}
                    </>
                  )}
                </LineChart>
              );
            })() : (
              <LineChart data={filteredData.recipientsData} margin={{ top: 10, right: 10, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" />
                <XAxis
                  type="number"
                  dataKey="year"
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 12 }}
                  domain={xAxisDomain}
                  ticks={xAxisTicks}
                  label={{ value: 'Simulation year', position: 'insideBottom', offset: -5, style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }}
                />
                <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 12 }} tickFormatter={fmtCount} label={{ value: 'Living recipients', angle: -90, position: 'left', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }} />
                <Tooltip content={makeChartTooltip(
                  filteredData.recipientsData,
                  [
                    { key: 'highXeno', label: `${highCpraLabel} · xeno`, color: COLORS.quaternary },
                    { key: 'highHuman', label: `${highCpraLabel} · human`, color: COLORS.primary },
                    ...(hasLowXeno ? [{ key: 'lowXeno', label: `${lowCpraLabel} · xeno`, color: COLORS.tertiary }] : []),
                    { key: 'lowHuman', label: `${lowCpraLabel} · human`, color: COLORS.secondary },
                  ],
                  'living recipients (head count)',
                )} />
                {recipientsSeriesVisible.lowHuman && (
                  <Line type="monotone" dataKey="lowHuman" stroke={COLORS.secondary} name="Low cPRA (human)" strokeWidth={2} dot={{ r: 0.2 }} />
                )}
                {recipientsSeriesVisible.highHuman && (
                  <Line type="monotone" dataKey="highHuman" stroke={COLORS.primary} name="High cPRA (human)" strokeWidth={2} dot={{ r: 0.2 }} />
                )}
                {recipientsSeriesVisible.highXeno && (
                  <Line type="monotone" dataKey="highXeno" stroke={COLORS.quaternary} name="High cPRA (xeno)" strokeWidth={3} dot={{ r: 0.3 }} />
                )}
                {recipientsSeriesVisible.lowXeno && hasLowXeno && (
                  <Line type="monotone" dataKey="lowXeno" stroke={COLORS.tertiary} name="Low cPRA (xeno)" strokeWidth={3} dot={{ r: 0.3 }} />
                )}
              </LineChart>
            )}
          </ResponsiveContainer>

          {/* Series Toggle */}
          <ChartSeriesToggle
            series={
              ageBreakdownExpanded.recipients
                ? [
                    { key: 'total', label: 'Total', color: COLORS.primary },
                    { key: 'lowHuman', label: 'Low cPRA (human)', color: COLORS.secondary },
                    { key: 'highHuman', label: 'High cPRA (human)', color: COLORS.primary },
                    { key: 'highXeno', label: 'High cPRA (xeno)', color: COLORS.quaternary },
                    ...(hasLowXeno ? [{ key: 'lowXeno', label: 'Low cPRA (xeno)', color: COLORS.tertiary }] : []),
                  ]
                : [
                    { key: 'lowHuman', label: 'Low cPRA (human)', color: COLORS.secondary },
                    { key: 'highHuman', label: 'High cPRA (human)', color: COLORS.primary },
                    { key: 'highXeno', label: 'High cPRA (xeno)', color: COLORS.quaternary },
                    ...(hasLowXeno ? [{ key: 'lowXeno', label: 'Low cPRA (xeno)', color: COLORS.tertiary }] : []),
                  ]
            }
            visible={recipientsSeriesVisible}
            onChange={toggleRecipientsSeries}
            chartId="recipients"
          />

          {/* Age Group Toggle */}
          {filteredData.recipientsDataByAge && (
            <AgeGroupToggle
              chartId="recipients"
              visible={ageGroupsPerChart.recipients}
              onChange={toggleAgeGroup('recipients')}
              expanded={ageBreakdownExpanded.recipients}
              onToggleExpand={() => setAgeBreakdownExpanded(prev => ({ ...prev, recipients: !prev.recipients }))}
            />
          )}
        </CardContent>
      </Card>

      {/* 3. Cumulative Deaths Over Time */}
      <Card className="bg-card shadow-lg border-medical-border hover:shadow-xl transition-shadow duration-300">
        <CardHeader className="border-b border-medical-border bg-gradient-to-br from-medical-surface to-medical-surface/50 pb-4">
          <CardTitle className="text-lg font-semibold text-primary">Cumulative Deaths Over Time</CardTitle>
          <p className="text-xs text-muted-foreground mt-1.5">Running total of deaths since simulation start, split by waitlist vs. post-transplant</p>
          <ChartContextHeader
            population={`All simulated patients (waitlist + recipients), cPRA threshold ${highCPRAThreshold}%`}
            measure="Cumulative count (flow) — total deaths since year 0"
            timing="Running total · year-end snapshots, years 1–10"
            supplyTag={supplyTag}
            note="Cumulative — curves only ever go up. Year-over-year change equals deaths in that year."
          />
        </CardHeader>
        <CardContent className="px-4 pt-4 pb-1">
          <ResponsiveContainer width="100%" height={325}>
            {ageBreakdownExpanded.cumulativeDeaths && filteredData.cumulativeDeathsDataByAge ? (() => {
              // Detect whether the backend provided the waitlist / post-tx split.
              const sample = filteredData.cumulativeDeathsDataByAge[0];
              const hasSplit = !!(sample && (sample.lowWaitlist || sample.highWaitlist || sample.lowPostTx || sample.highPostTx));
              const visibleAgeGroups = AGE_GROUPS.filter(group => ageGroupsPerChart.cumulativeDeaths[group.key]);
              return (
                <LineChart data={prepareAgeDataForChart(filteredData.cumulativeDeathsDataByAge)} margin={{ top: 10, right: 10, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" />
                  <XAxis
                    type="number"
                    dataKey="year"
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fontSize: 12 }}
                    domain={xAxisDomain}
                    ticks={xAxisTicks}
                    label={{ value: 'Simulation year', position: 'insideBottom', offset: -5, style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }}
                  />
                  <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 12 }} tickFormatter={fmtCount} label={{ value: 'Cumulative deaths', angle: -90, position: 'left', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }} />
                  <Tooltip content={makeChartTooltip(
                    prepareAgeDataForChart(filteredData.cumulativeDeathsDataByAge),
                    AGE_GROUPS.filter(g => ageGroupsPerChart.cumulativeDeaths[g.key]).map(g => (
                      { key: `total_${g.key}`, label: `Total · age ${g.label}y`, color: g.color }
                    )),
                    'cumulative deaths (head count, running total)',
                  )} />
                  {/* Total age groups (low + high cPRA, waitlist + post-tx) */}
                  {deathsSeriesVisible.total && visibleAgeGroups.map(group => (
                    <Line
                      key={`total_${group.key}`}
                      type="monotone"
                      dataKey={`total_${group.key}`}
                      stroke={group.color}
                      strokeWidth={3}
                      name={`Total ${group.label}y`}
                      dot={{ r: 0.3 }}
                    />
                  ))}
                  {hasSplit ? (
                    <>
                      {/* Low cPRA waitlist (per age group) */}
                      {deathsSeriesVisible.lowWaitlist && visibleAgeGroups.map(group => (
                        <Line
                          key={`lowWaitlist_${group.key}`}
                          type="monotone"
                          dataKey={`lowWaitlist_${group.key}`}
                          stroke={group.color}
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          name={`Low cPRA waitlist ${group.label}y`}
                          dot={{ r: 0.15 }}
                        />
                      ))}
                      {/* High cPRA waitlist (per age group) */}
                      {deathsSeriesVisible.highWaitlist && visibleAgeGroups.map(group => (
                        <Line
                          key={`highWaitlist_${group.key}`}
                          type="monotone"
                          dataKey={`highWaitlist_${group.key}`}
                          stroke={group.color}
                          strokeWidth={2.5}
                          strokeDasharray="5 5"
                          name={`High cPRA waitlist ${group.label}y`}
                          dot={{ r: 0.2 }}
                        />
                      ))}
                      {/* Low cPRA post-tx (per age group) */}
                      {deathsSeriesVisible.lowPostTx && visibleAgeGroups.map(group => (
                        <Line
                          key={`lowPostTx_${group.key}`}
                          type="monotone"
                          dataKey={`lowPostTx_${group.key}`}
                          stroke={group.color}
                          strokeWidth={2}
                          strokeDasharray="2 2"
                          name={`Low cPRA post-tx ${group.label}y`}
                          dot={{ r: 0.15 }}
                        />
                      ))}
                      {/* High cPRA post-tx (per age group) */}
                      {deathsSeriesVisible.highPostTx && visibleAgeGroups.map(group => (
                        <Line
                          key={`highPostTx_${group.key}`}
                          type="monotone"
                          dataKey={`highPostTx_${group.key}`}
                          stroke={group.color}
                          strokeWidth={2.5}
                          strokeDasharray="2 2"
                          name={`High cPRA post-tx ${group.label}y`}
                          dot={{ r: 0.2 }}
                        />
                      ))}
                    </>
                  ) : (
                    <>
                      {/* Older JSONs without the split: fall back to lump-sum lines */}
                      {(deathsSeriesVisible.lowWaitlist || deathsSeriesVisible.lowPostTx) && visibleAgeGroups.map(group => (
                        <Line
                          key={`lowCPRA_${group.key}`}
                          type="monotone"
                          dataKey={`lowCPRA_${group.key}`}
                          stroke={group.color}
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          name={`Low cPRA ${group.label}y`}
                          dot={{ r: 0.15 }}
                        />
                      ))}
                      {(deathsSeriesVisible.highWaitlist || deathsSeriesVisible.highPostTx) && visibleAgeGroups.map(group => (
                        <Line
                          key={`highCPRA_${group.key}`}
                          type="monotone"
                          dataKey={`highCPRA_${group.key}`}
                          stroke={group.color}
                          strokeWidth={2.5}
                          strokeDasharray="2 2"
                          name={`High cPRA ${group.label}y`}
                          dot={{ r: 0.3 }}
                        />
                      ))}
                    </>
                  )}
                </LineChart>
              );
            })() : (
              <LineChart data={filteredData.cumulativeDeathsData} margin={{ top: 10, right: 10, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" />
                <XAxis
                  type="number"
                  dataKey="year"
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 12 }}
                  domain={xAxisDomain}
                  ticks={xAxisTicks}
                  label={{ value: 'Simulation year', position: 'insideBottom', offset: -5, style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }}
                />
                <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 12 }} tickFormatter={fmtCount} label={{ value: 'Cumulative deaths', angle: -90, position: 'left', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }} />
                <Tooltip content={makeChartTooltip(
                  filteredData.cumulativeDeathsData,
                  [
                    { key: 'total', label: 'Total deaths', color: COLORS.primary },
                    { key: 'highWaitlist', label: `${highCpraLabel} · waitlist`, color: COLORS.primary },
                    { key: 'lowWaitlist', label: `${lowCpraLabel} · waitlist`, color: COLORS.secondary },
                    { key: 'highPostTx', label: `${highCpraLabel} · post-tx`, color: COLORS.quaternary },
                    { key: 'lowPostTx', label: `${lowCpraLabel} · post-tx`, color: COLORS.tertiary },
                  ],
                  'cumulative deaths (head count, running total)',
                )} />
                {deathsSeriesVisible.lowWaitlist && (
                  <Line type="monotone" dataKey="lowWaitlist" stroke={COLORS.secondary} name="Low cPRA waitlist" strokeWidth={2} dot={{ r: 0.15 }} />
                )}
                {deathsSeriesVisible.highWaitlist && (
                  <Line type="monotone" dataKey="highWaitlist" stroke={COLORS.primary} name="High cPRA waitlist" strokeWidth={2} dot={{ r: 0.15 }} />
                )}
                {deathsSeriesVisible.lowPostTx && (
                  <Line type="monotone" dataKey="lowPostTx" stroke={COLORS.tertiary} name="Low cPRA post-tx" strokeWidth={2} dot={{ r: 0.15 }} />
                )}
                {deathsSeriesVisible.highPostTx && (
                  <Line type="monotone" dataKey="highPostTx" stroke={COLORS.quaternary} name="High cPRA post-tx" strokeWidth={2} dot={{ r: 0.15 }} />
                )}
                {deathsSeriesVisible.total && (
                  <Line type="monotone" dataKey="total" stroke={COLORS.primary} name="Total" strokeWidth={3} dot={{ r: 0.3 }} />
                )}
              </LineChart>
            )}
          </ResponsiveContainer>

          {/* Series Toggle */}
          <ChartSeriesToggle
            series={[
              { key: 'lowWaitlist', label: 'Low cPRA waitlist', color: COLORS.secondary },
              { key: 'highWaitlist', label: 'High cPRA waitlist', color: COLORS.primary },
              { key: 'lowPostTx', label: 'Low cPRA post-tx', color: COLORS.tertiary },
              { key: 'highPostTx', label: 'High cPRA post-tx', color: COLORS.quaternary },
              { key: 'total', label: 'Total', color: COLORS.primary },
            ]}
            visible={deathsSeriesVisible}
            onChange={toggleDeathsSeries}
            chartId="cumulativeDeaths"
          />

          {/* Age Group Toggle */}
          {filteredData.cumulativeDeathsDataByAge && (
            <AgeGroupToggle
              chartId="cumulativeDeaths"
              visible={ageGroupsPerChart.cumulativeDeaths}
              onChange={toggleAgeGroup('cumulativeDeaths')}
              expanded={ageBreakdownExpanded.cumulativeDeaths}
              onToggleExpand={() => setAgeBreakdownExpanded(prev => ({ ...prev, cumulativeDeaths: !prev.cumulativeDeaths }))}
            />
          )}
        </CardContent>
      </Card>

      {/* 4. Waitlist Deaths per Year (Scatter Plot) */}
      <Card className="bg-card shadow-lg border-medical-border hover:shadow-xl transition-shadow duration-300">
        <CardHeader className="border-b border-medical-border bg-gradient-to-br from-medical-surface to-medical-surface/50 pb-4">
          <CardTitle className="text-lg font-semibold text-primary">Waitlist Deaths per Year</CardTitle>
          <p className="text-xs text-muted-foreground mt-1.5">Deaths that happened while patients were still waiting, counted in each year</p>
          <ChartContextHeader
            population={`Patients on the waitlist during each year (cPRA threshold: ${highCPRAThreshold}%)`}
            measure="Annual flow — deaths that occurred during the year"
            timing="One value per simulation year · years 1–10"
            supplyTag={supplyTag}
            note="Post-transplant deaths are NOT counted here — those appear in the Cumulative Deaths chart's post-tx breakdown."
          />
        </CardHeader>
        <CardContent className="px-4 pt-4 pb-1">
          <ResponsiveContainer width="100%" height={325}>
            {ageBreakdownExpanded.waitlistDeathsPerYear && filteredData.waitlistDeathsPerYearDataByAge ? (
              <LineChart data={prepareAgeDataForChart(filteredData.waitlistDeathsPerYearDataByAge)} margin={{ top: 10, right: 10, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" />
                <XAxis
                  type="number"
                  dataKey="year"
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 12 }}
                  domain={xAxisDomain}
                  ticks={xAxisTicks}
                  label={{ value: 'Simulation year', position: 'insideBottom', offset: -5, style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 12 }}
                  tickFormatter={fmtCount}
                  label={{ value: 'Deaths during year', angle: -90, position: 'left', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }}
                />
                <Tooltip content={makeChartTooltip(
                  prepareAgeDataForChart(filteredData.waitlistDeathsPerYearDataByAge),
                  AGE_GROUPS.filter(g => ageGroupsPerChart.waitlistDeathsPerYear[g.key]).map(g => (
                    { key: `total_${g.key}`, label: `Total · age ${g.label}y`, color: g.color }
                  )),
                  'waitlist deaths during year (head count)',
                )} />
                {/* Total per age group (solid, thick) */}
                {waitlistDeathsPerYearSeriesVisible.total && AGE_GROUPS.filter(group => ageGroupsPerChart.waitlistDeathsPerYear[group.key]).map(group => (
                  <Line
                    key={`total_${group.key}`}
                    type="monotone"
                    dataKey={`total_${group.key}`}
                    stroke={group.color}
                    strokeWidth={3}
                    name={`Total ${group.label}y`}
                    dot={{ r: 2 }}
                  />
                ))}
                {/* Low cPRA per age group (long-dashed) */}
                {waitlistDeathsPerYearSeriesVisible.lowCPRA && AGE_GROUPS.filter(group => ageGroupsPerChart.waitlistDeathsPerYear[group.key]).map(group => (
                  <Line
                    key={`lowCPRA_${group.key}`}
                    type="monotone"
                    dataKey={`lowCPRA_${group.key}`}
                    stroke={group.color}
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    name={`Low cPRA ${group.label}y`}
                    dot={{ r: 1.5 }}
                  />
                ))}
                {/* High cPRA per age group (short-dashed) */}
                {waitlistDeathsPerYearSeriesVisible.highCPRA && AGE_GROUPS.filter(group => ageGroupsPerChart.waitlistDeathsPerYear[group.key]).map(group => (
                  <Line
                    key={`highCPRA_${group.key}`}
                    type="monotone"
                    dataKey={`highCPRA_${group.key}`}
                    stroke={group.color}
                    strokeWidth={2}
                    strokeDasharray="2 2"
                    name={`High cPRA ${group.label}y`}
                    dot={{ r: 1.5 }}
                  />
                ))}
              </LineChart>
            ) : (
              // Switched from <ScatterChart> + 6 separate <Scatter> series to
              // a <LineChart> over a unified wide-format dataset (one row per
              // year, one column per series). This is purely so the default
              // vertical-cursor tooltip can list every visible series for the
              // hovered year — ScatterChart's tooltip is single-point because
              // each <Scatter> is its own dataset, which made it impossible
              // to compare e.g. "Total (Xeno)" vs "Total (Base)" at the
              // same year without hovering each dot individually.
              //
              // The visual stays "scatter-like" because each <Line> uses
              // strokeOpacity=0 (no connecting segment) and a custom dot
              // renderer that draws the same circle/square/triangle shapes
              // the ScatterChart was using. A small invisible stroke is
              // needed (instead of strokeWidth=0) so Recharts still tracks
              // the line for hover detection even at years where this
              // particular series happens to be missing.
              (() => {
                const wlPerYearRows = filteredData.waitlistDeathsPerYearData.map(d => ({
                  year: d.year,
                  total: d.waitlistDeaths,
                  lowCPRA: d.lowWaitlistDeaths,
                  highCPRA: d.highWaitlistDeaths,
                  baseTotal: d.baseWaitlistDeaths,
                  baseLowCPRA: d.baseLowWaitlistDeaths,
                  baseHighCPRA: d.baseHighWaitlistDeaths,
                }));
                return (
              <LineChart
                data={wlPerYearRows}
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
                  label={{ value: 'Simulation year', position: 'insideBottom', offset: -5, style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }}
                />
                <YAxis
                  type="number"
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 12 }}
                  tickFormatter={fmtCount}
                  domain={[0, 'auto']}
                  label={{ value: 'Deaths during year', angle: -90, position: 'left', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }}
                />
                <Tooltip content={makeChartTooltip(
                  wlPerYearRows,
                  [
                    { key: 'total', baseKey: 'baseTotal', label: 'Total waitlist deaths', color: '#8b0000' },
                    { key: 'highCPRA', baseKey: 'baseHighCPRA', label: highCpraLabel, color: '#f59e0b' },
                    { key: 'lowCPRA', baseKey: 'baseLowCPRA', label: lowCpraLabel, color: '#ef4444' },
                  ],
                  'waitlist deaths during year (head count)',
                )} />
                {/* Xeno scenario — filled circle, square, triangle */}
                {waitlistDeathsPerYearSeriesVisible.total && (
                  <Line
                    type="monotone"
                    dataKey="total"
                    name="Total (Xeno)"
                    stroke="#8b0000"
                    strokeOpacity={0}
                    isAnimationActive={false}
                    dot={(props: any) => (
                      <circle key={`d-total-${props.index}`} cx={props.cx} cy={props.cy} r={3.5} fill="#8b0000" />
                    )}
                    activeDot={{ r: 6, fill: '#8b0000' }}
                  />
                )}
                {waitlistDeathsPerYearSeriesVisible.lowCPRA && (
                  <Line
                    type="monotone"
                    dataKey="lowCPRA"
                    name="Low cPRA (Xeno)"
                    stroke="#ef4444"
                    strokeOpacity={0}
                    isAnimationActive={false}
                    connectNulls={false}
                    dot={(props: any) => (
                      <rect key={`d-lo-${props.index}`} x={props.cx - 3} y={props.cy - 3} width={6} height={6} fill="#ef4444" />
                    )}
                    activeDot={{ r: 6, fill: '#ef4444' }}
                  />
                )}
                {waitlistDeathsPerYearSeriesVisible.highCPRA && (
                  <Line
                    type="monotone"
                    dataKey="highCPRA"
                    name="High cPRA (Xeno)"
                    stroke="#f59e0b"
                    strokeOpacity={0}
                    isAnimationActive={false}
                    connectNulls={false}
                    dot={(props: any) => (
                      <polygon
                        key={`d-hi-${props.index}`}
                        points={`${props.cx},${props.cy - 4} ${props.cx + 3.5},${props.cy + 2.5} ${props.cx - 3.5},${props.cy + 2.5}`}
                        fill="#f59e0b"
                      />
                    )}
                    activeDot={{ r: 6, fill: '#f59e0b' }}
                  />
                )}
                {/* Base case — hollow circle, square, triangle */}
                {waitlistDeathsPerYearSeriesVisible.baseTotal && (
                  <Line
                    type="monotone"
                    dataKey="baseTotal"
                    name="Total (Base Case)"
                    stroke="#3b82f6"
                    strokeOpacity={0}
                    isAnimationActive={false}
                    connectNulls={false}
                    dot={(props: any) => (
                      <circle key={`d-bt-${props.index}`} cx={props.cx} cy={props.cy} r={3.5} stroke="#3b82f6" strokeWidth={1.5} fill="none" />
                    )}
                    activeDot={{ r: 6, stroke: '#3b82f6', strokeWidth: 2, fill: 'none' }}
                  />
                )}
                {waitlistDeathsPerYearSeriesVisible.baseLowCPRA && (
                  <Line
                    type="monotone"
                    dataKey="baseLowCPRA"
                    name="Low cPRA (Base Case)"
                    stroke="#60a5fa"
                    strokeOpacity={0}
                    isAnimationActive={false}
                    connectNulls={false}
                    dot={(props: any) => (
                      <rect key={`d-blo-${props.index}`} x={props.cx - 3} y={props.cy - 3} width={6} height={6} stroke="#60a5fa" strokeWidth={1.5} fill="none" />
                    )}
                    activeDot={{ r: 6, stroke: '#60a5fa', strokeWidth: 2, fill: 'none' }}
                  />
                )}
                {waitlistDeathsPerYearSeriesVisible.baseHighCPRA && (
                  <Line
                    type="monotone"
                    dataKey="baseHighCPRA"
                    name="High cPRA (Base Case)"
                    stroke="#7dd3fc"
                    strokeOpacity={0}
                    isAnimationActive={false}
                    connectNulls={false}
                    dot={(props: any) => (
                      <polygon
                        key={`d-bhi-${props.index}`}
                        points={`${props.cx},${props.cy - 4} ${props.cx + 3.5},${props.cy + 2.5} ${props.cx - 3.5},${props.cy + 2.5}`}
                        stroke="#7dd3fc"
                        strokeWidth={1.5}
                        fill="none"
                      />
                    )}
                    activeDot={{ r: 6, stroke: '#7dd3fc', strokeWidth: 2, fill: 'none' }}
                  />
                )}
              </LineChart>
                );
              })()
            )}
          </ResponsiveContainer>

          {/* Series Toggle */}
          <ChartSeriesToggle
            series={
              ageBreakdownExpanded.waitlistDeathsPerYear
                ? [
                    { key: 'total', label: 'Total', color: '#8b0000' },
                    { key: 'lowCPRA', label: 'Low cPRA', color: '#ef4444' },
                    { key: 'highCPRA', label: 'High cPRA', color: '#f59e0b' },
                  ]
                : [
                    { key: 'total', label: 'Total (Xeno)', color: '#8b0000' },
                    { key: 'lowCPRA', label: 'Low cPRA (Xeno)', color: '#ef4444' },
                    { key: 'highCPRA', label: 'High cPRA (Xeno)', color: '#f59e0b' },
                    ...(filteredData.waitlistDeathsPerYearData.some(d => d.baseWaitlistDeaths !== undefined)
                      ? [{ key: 'baseTotal', label: 'Total (Base)', color: '#3b82f6' }]
                      : []),
                    ...(filteredData.waitlistDeathsPerYearData.some(d => d.baseLowWaitlistDeaths !== undefined)
                      ? [{ key: 'baseLowCPRA', label: 'Low cPRA (Base)', color: '#60a5fa' }]
                      : []),
                    ...(filteredData.waitlistDeathsPerYearData.some(d => d.baseHighWaitlistDeaths !== undefined)
                      ? [{ key: 'baseHighCPRA', label: 'High cPRA (Base)', color: '#7dd3fc' }]
                      : []),
                  ]
            }
            visible={waitlistDeathsPerYearSeriesVisible}
            onChange={toggleWaitlistDeathsPerYearSeries}
            chartId="waitlistDeathsPerYear"
          />

          {/* Age Group Toggle */}
          {filteredData.waitlistDeathsPerYearDataByAge && (
            <AgeGroupToggle
              chartId="waitlistDeathsPerYear"
              visible={ageGroupsPerChart.waitlistDeathsPerYear}
              onChange={toggleAgeGroup('waitlistDeathsPerYear')}
              expanded={ageBreakdownExpanded.waitlistDeathsPerYear}
              onToggleExpand={() => setAgeBreakdownExpanded(prev => ({ ...prev, waitlistDeathsPerYear: !prev.waitlistDeathsPerYear }))}
            />
          )}
        </CardContent>
      </Card>

      {/* 5. Deaths per Year */}
      <Card className="bg-card shadow-lg border-medical-border hover:shadow-xl transition-shadow duration-300">
        <CardHeader className="border-b border-medical-border bg-gradient-to-br from-medical-surface to-medical-surface/50 pb-4">
          <CardTitle className="text-lg font-semibold text-primary">All Deaths per Year</CardTitle>
          <p className="text-xs text-muted-foreground mt-1.5">All deaths counted in each year, regardless of where the patient was (waitlist or post-transplant)</p>
          <ChartContextHeader
            population={`All simulated patients (waitlist + post-tx recipients), cPRA threshold ${highCPRAThreshold}%`}
            measure="Annual flow — deaths during the year (waitlist + post-tx combined)"
            timing="One value per simulation year · years 1–10"
            supplyTag={supplyTag}
            note="This combines waitlist deaths AND post-transplant deaths. See Waitlist Deaths per Year for the waitlist-only view."
          />
        </CardHeader>
        <CardContent className="px-4 pt-4 pb-1">
          <ResponsiveContainer width="100%" height={325}>
            {ageBreakdownExpanded.deathsPerYear && filteredData.deathsPerYearDataByAge ? (
              <BarChart data={prepareAgeDataForChart(filteredData.deathsPerYearDataByAge)} margin={{ top: 10, right: 10, bottom: 25, left: 20 }} barGap={2} barCategoryGap="15%">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" />
                <XAxis
                  type="number"
                  dataKey="year"
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 11 }}
                  domain={xAxisDomain}
                  ticks={xAxisTicks}
                  label={{ value: 'Simulation year', position: 'insideBottom', offset: -8, style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))', fontSize: 11 } }}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 11 }}
                  tickFormatter={fmtCount}
                  domain={[0, 'auto']}
                  label={{ value: 'Deaths during year', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))', fontSize: 11 } }}
                />
                <Tooltip content={makeChartTooltip(
                  prepareAgeDataForChart(filteredData.deathsPerYearDataByAge),
                  AGE_GROUPS.filter(g => ageGroupsPerChart.deathsPerYear[g.key]).map(g => (
                    { key: `total_${g.key}`, label: `Total · age ${g.label}y`, color: g.color }
                  )),
                  'deaths during year (head count)',
                )} />
                {/* Total age groups (low + high cPRA) - stacked */}
                {deathsPerYearSeriesVisible.total && AGE_GROUPS.filter(group => ageGroupsPerChart.deathsPerYear[group.key]).map(group => (
                  <Bar
                    key={`total_${group.key}`}
                    dataKey={`total_${group.key}`}
                    stackId="total"
                    fill={group.color}
                    fillOpacity={1}
                    name={`Total ${group.label}y`}
                  />
                ))}
                {/* Low cPRA age groups - stacked */}
                {deathsPerYearSeriesVisible.low && AGE_GROUPS.filter(group => ageGroupsPerChart.deathsPerYear[group.key]).map(group => (
                  <Bar
                    key={`lowCPRA_${group.key}`}
                    dataKey={`lowCPRA_${group.key}`}
                    stackId="lowCPRA"
                    fill={group.color}
                    fillOpacity={0.55}
                    name={`Low cPRA ${group.label}y`}
                  />
                ))}
                {/* High cPRA age groups - stacked */}
                {deathsPerYearSeriesVisible.high && AGE_GROUPS.filter(group => ageGroupsPerChart.deathsPerYear[group.key]).map(group => (
                  <Bar
                    key={`highCPRA_${group.key}`}
                    dataKey={`highCPRA_${group.key}`}
                    stackId="highCPRA"
                    fill={group.color}
                    fillOpacity={0.85}
                    name={`High cPRA ${group.label}y`}
                  />
                ))}
              </BarChart>
            ) : (
              <BarChart data={filteredData.deathsPerYearData} margin={{ top: 10, right: 20, bottom: 25, left: 20 }} barCategoryGap="15%">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" />
                <XAxis
                  type="number"
                  dataKey="year"
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 11 }}
                  domain={xAxisDomain}
                  ticks={xAxisTicks}
                  label={{ value: 'Simulation year', position: 'insideBottom', offset: -8, style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))', fontSize: 11 } }}
                  padding={{ left: 10, right: 10 }}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 11 }}
                  tickFormatter={fmtCount}
                  domain={[0, 'auto']}
                  label={{ value: 'Deaths during year', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))', fontSize: 11 } }}
                />
                <Tooltip content={makeChartTooltip(
                  filteredData.deathsPerYearData,
                  [
                    { key: 'total', label: 'Total', color: COLORS.quaternary },
                    { key: 'high', label: highCpraLabel, color: COLORS.primary },
                    { key: 'low', label: lowCpraLabel, color: COLORS.secondary },
                  ],
                  'deaths during year (head count)',
                )} />
                {deathsPerYearSeriesVisible.low && <Bar dataKey="low" fill={COLORS.secondary} name="Low cPRA" radius={[2, 2, 0, 0]} />}
                {deathsPerYearSeriesVisible.high && <Bar dataKey="high" fill={COLORS.primary} name="High cPRA" radius={[2, 2, 0, 0]} />}
                {deathsPerYearSeriesVisible.total && <Bar dataKey="total" fill={COLORS.quaternary} name="Total" radius={[2, 2, 0, 0]} />}
              </BarChart>
            )}
          </ResponsiveContainer>

          {/* Series Toggle */}
          <ChartSeriesToggle
            series={[
              { key: 'total', label: 'Total', color: COLORS.quaternary },
              { key: 'low', label: 'Low cPRA', color: COLORS.secondary },
              { key: 'high', label: 'High cPRA', color: COLORS.primary },
            ]}
            visible={deathsPerYearSeriesVisible}
            onChange={toggleDeathsPerYearSeries}
            chartId="deathsPerYear"
          />

          {/* Age Group Toggle */}
          {filteredData.deathsPerYearDataByAge && (
            <AgeGroupToggle
              chartId="deathsPerYear"
              visible={ageGroupsPerChart.deathsPerYear}
              onChange={toggleAgeGroup('deathsPerYear')}
              expanded={ageBreakdownExpanded.deathsPerYear}
              onToggleExpand={() => setAgeBreakdownExpanded(prev => ({ ...prev, deathsPerYear: !prev.deathsPerYear }))}
            />
          )}
        </CardContent>
      </Card>

      {/* 6. Net Waitlist Deaths Prevented per Year */}
      <Card className="bg-card shadow-lg border-medical-border hover:shadow-xl transition-shadow duration-300">
        <CardHeader className="border-b border-medical-border bg-gradient-to-br from-medical-surface to-medical-surface/50 pb-4">
          <CardTitle className="text-lg font-semibold text-primary">Net Deaths Prevented per Year</CardTitle>
          <p className="text-xs text-muted-foreground mt-1.5">Lives saved annually vs. the matched baseline scenario (positive = fewer deaths than baseline)</p>
          <ChartContextHeader
            population={`All simulated patients, cPRA threshold ${highCPRAThreshold}%`}
            measure="Annual flow — (baseline deaths) minus (intervention deaths)"
            timing="One value per simulation year · years 1–10"
            baseline="Same scenario with xeno_proportion = 0 (no xeno kidneys)"
            supplyTag={supplyTag}
            note="Positive bar = xeno scenario had fewer deaths that year. Negative bar = xeno scenario had more deaths."
          />
        </CardHeader>
        <CardContent className="px-4 pt-4 pb-1">
          <ResponsiveContainer width="100%" height={325}>
            {ageBreakdownExpanded.netDeathsPrevented && filteredData.netDeathsPreventedByAge ? (
              <BarChart data={prepareAgeDataForChart(filteredData.netDeathsPreventedByAge)} margin={{ top: 10, right: 10, bottom: 25, left: 20 }} barCategoryGap="15%">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" />
                <XAxis
                  type="number"
                  dataKey="year"
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 11 }}
                  domain={xAxisDomain}
                  ticks={xAxisTicks}
                  label={{ value: 'Simulation year', position: 'insideBottom', offset: -8, style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))', fontSize: 11 } }}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 11 }}
                  tickFormatter={fmtCount}
                  domain={['dataMin', 'dataMax']}
                  label={{ value: 'Lives saved per year', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))', fontSize: 11 } }}
                />
                <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                <Tooltip content={makeNetPreventedTooltip(
                  prepareAgeDataForChart(filteredData.netDeathsPreventedByAge),
                  AGE_GROUPS.filter(g => ageGroupsPerChart.netDeathsPrevented[g.key]).map(g => (
                    { key: `total_${g.key}`, label: `Age ${g.label}y`, color: g.color }
                  )),
                )} />
                {/* Total age groups (low + high cPRA) - stacked */}
                {netDeathsSeriesVisible.total && AGE_GROUPS.filter(group => ageGroupsPerChart.netDeathsPrevented[group.key]).map(group => (
                  <Bar
                    key={`total_${group.key}`}
                    dataKey={`total_${group.key}`}
                    stackId="total"
                    fill={group.color}
                    fillOpacity={1}
                    name={`Total ${group.label}y`}
                    radius={[2, 2, 0, 0]}
                  />
                ))}
                {/* Low cPRA age groups - stacked */}
                {netDeathsSeriesVisible.low && AGE_GROUPS.filter(group => ageGroupsPerChart.netDeathsPrevented[group.key]).map(group => (
                  <Bar
                    key={`lowCPRA_${group.key}`}
                    dataKey={`lowCPRA_${group.key}`}
                    stackId="lowCPRA"
                    fill={group.color}
                    fillOpacity={0.55}
                    name={`Low cPRA ${group.label}y`}
                    radius={[2, 2, 0, 0]}
                  />
                ))}
                {/* High cPRA age groups - stacked */}
                {netDeathsSeriesVisible.high && AGE_GROUPS.filter(group => ageGroupsPerChart.netDeathsPrevented[group.key]).map(group => (
                  <Bar
                    key={`highCPRA_${group.key}`}
                    dataKey={`highCPRA_${group.key}`}
                    stackId="highCPRA"
                    fill={group.color}
                    fillOpacity={0.85}
                    name={`High cPRA ${group.label}y`}
                    radius={[2, 2, 0, 0]}
                  />
                ))}
              </BarChart>
            ) : (
              <BarChart data={filteredData.netDeathsPreventedPerYearData} margin={{ top: 10, right: 20, bottom: 25, left: 20 }} barCategoryGap="15%">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" />
                <XAxis
                  type="number"
                  dataKey="year"
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 11 }}
                  domain={xAxisDomain}
                  ticks={xAxisTicks}
                  label={{ value: 'Simulation year', position: 'insideBottom', offset: -8, style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))', fontSize: 11 } }}
                  padding={{ left: 10, right: 10 }}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 11 }}
                  tickFormatter={fmtCount}
                  domain={['dataMin', 'dataMax']}
                  label={{ value: 'Lives saved per year', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))', fontSize: 11 } }}
                />
                <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                <Tooltip content={makeNetPreventedTooltip(
                  filteredData.netDeathsPreventedPerYearData,
                  [
                    { key: 'total', label: 'Total', color: '#15803d' },
                    { key: 'high', label: highCpraLabel, color: '#22c55e' },
                    { key: 'low', label: lowCpraLabel, color: '#86efac' },
                  ],
                )} />
                {netDeathsSeriesVisible.low && <Bar dataKey="low" fill="#86efac" name="Low cPRA" radius={[2, 2, 0, 0]} />}
                {netDeathsSeriesVisible.high && <Bar dataKey="high" fill="#22c55e" name="High cPRA" radius={[2, 2, 0, 0]} />}
                {netDeathsSeriesVisible.total && <Bar dataKey="total" fill="#15803d" name="Total" radius={[2, 2, 0, 0]} />}
              </BarChart>
            )}
          </ResponsiveContainer>

          {/* Series Toggle */}
          <ChartSeriesToggle
            series={[
              { key: 'total', label: 'Total', color: '#15803d' },
              { key: 'low', label: 'Low cPRA', color: '#86efac' },
              { key: 'high', label: 'High cPRA', color: '#22c55e' },
            ]}
            visible={netDeathsSeriesVisible}
            onChange={toggleNetDeathsSeries}
            chartId="netDeathsPrevented"
          />

          {/* Age Group Toggle */}
          {filteredData.netDeathsPreventedByAge && (
            <AgeGroupToggle
              chartId="netDeathsPrevented"
              visible={ageGroupsPerChart.netDeathsPrevented}
              onChange={toggleAgeGroup('netDeathsPrevented')}
              expanded={ageBreakdownExpanded.netDeathsPrevented}
              onToggleExpand={() => setAgeBreakdownExpanded(prev => ({ ...prev, netDeathsPrevented: !prev.netDeathsPrevented }))}
            />
          )}
        </CardContent>
      </Card>

    </div>
  );
};

export default SimulationCharts;
 