import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, BarChart, Bar, Legend, Tooltip, ScatterChart, Scatter } from 'recharts';
import { ChartSeriesToggle } from './ChartSeriesToggle';
import { AgeGroupToggle, AGE_GROUPS } from './AgeGroupToggle';

interface SimulationData {
  waitlistData: Array<{ year: number; total: number; lowCPRA: number; highCPRA: number; baseHighCPRA?: number; baseLowCPRA?: number; baseTotal?: number }>;
  waitlistDeathsData: Array<{ year: number; waitlistDeaths: number }>;
  postTransplantDeathsData: Array<{ year: number; xenoPostTransplantDeaths: number; humanPostTransplantDeaths: number }>;
  netDeathsPreventedData: Array<{ year: number; netDeathsPrevented: number }>;
  graftFailuresData: Array<{ year: number; xenoGraftFailures: number; humanGraftFailures: number }>;
  transplantsData: Array<{ year: number; human: number; xeno: number }>;
  penetrationData: Array<{ year: number; proportion: number }>;
  waitingTimeData: Array<{ year: number; averageWaitingTime: number }>;
  recipientsData: Array<{ year: number; lowHuman: number; highHuman: number; highXeno: number }>;
  cumulativeDeathsData: Array<{ year: number; lowWaitlist: number; highWaitlist: number; lowPostTx: number; highPostTx: number; total: number }>;
  deathsPerYearData: Array<{ year: number; low: number; high: number; total: number }>;
  deathsPerDayData: Array<{ year: number; low: number; high: number; total: number }>;
  netDeathsPreventedPerYearData: Array<{ year: number; low: number; high: number; total: number }>;
  waitlistDeathsPerYearData: Array<{ year: number; waitlistDeaths: number; baseWaitlistDeaths?: number }>;
  // Age-specific data (optional)
  waitlistDataByAge?: Array<{ year: number; lowCPRA: Record<string, number>; highCPRA: Record<string, number> }>;
  netDeathsPreventedByAge?: Array<{ year: number; lowCPRA: Record<string, number>; highCPRA: Record<string, number>; total: Record<string, number> }>;
  recipientsDataByAge?: Array<{ year: number; lowCPRA: Record<string, number>; highCPRA: Record<string, number> }>;
  cumulativeDeathsDataByAge?: Array<{ year: number; lowCPRA: Record<string, number>; highCPRA: Record<string, number> }>;
  deathsPerYearDataByAge?: Array<{ year: number; lowCPRA: Record<string, number>; highCPRA: Record<string, number> }>;
  waitlistDeathsPerYearDataByAge?: Array<{ year: number; total: Record<string, number> }>;
}

interface SimulationChartsProps {
  data: SimulationData;
  highCPRAThreshold: number;
  simulationHorizon: number;
}

const SimulationCharts: React.FC<SimulationChartsProps> = ({ data, highCPRAThreshold, simulationHorizon }) => {
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

  // Age group visibility state
  const [ageGroupsVisible, setAgeGroupsVisible] = useState<Record<string, boolean>>({
    age0_18: true,
    age18_45: true,
    age45_60: true,
    age60plus: true,
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

  const toggleAgeGroup = (key: string, visible: boolean) => {
    setAgeGroupsVisible(prev => ({ ...prev, [key]: visible }));
  };

  // Helper: Prepare age-specific data for charts
  const prepareAgeDataForChart = (ageData: Array<{ year: number; lowCPRA: Record<string, number>; highCPRA: Record<string, number>; total?: Record<string, number> }> | undefined) => {
    if (!ageData || ageData.length === 0) return [];

    try {
      return ageData.map(yearData => {
        const chartPoint: any = { year: yearData.year };

        // Add low cPRA age groups with prefix
        if (yearData.lowCPRA && typeof yearData.lowCPRA === 'object') {
          for (const [ageKey, value] of Object.entries(yearData.lowCPRA)) {
            chartPoint[`lowCPRA_${ageKey}`] = value;
          }
        }

        // Add high cPRA age groups with prefix
        if (yearData.highCPRA && typeof yearData.highCPRA === 'object') {
          for (const [ageKey, value] of Object.entries(yearData.highCPRA)) {
            chartPoint[`highCPRA_${ageKey}`] = value;
          }
        }

        // Add total age groups if available
        if (yearData.total && typeof yearData.total === 'object') {
          for (const [ageKey, value] of Object.entries(yearData.total)) {
            chartPoint[`total_${ageKey}`] = value;
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

  // Dynamic x-axis configuration based on horizon
  const xAxisDomain = [0.5, simulationHorizon + 0.5];
  const xAxisTicks = Array.from({ length: simulationHorizon }, (_, i) => i + 1);
  const COLORS = {
    primary: 'hsl(var(--chart-primary))',
    secondary: 'hsl(var(--chart-secondary))',
    tertiary: 'hsl(var(--chart-tertiary))',
    quaternary: 'hsl(var(--chart-quaternary))',
  };

  // Custom tooltip component
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-medical-border rounded-lg p-3 shadow-[var(--shadow-medium)]">
          <p className="text-sm font-medium text-foreground mb-1">{`Year: ${label}`}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {`${entry.name}: ${typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}`}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // Custom percentage tooltip
  const PercentageTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-medical-border rounded-lg p-3 shadow-[var(--shadow-medium)]">
          <p className="text-sm font-medium text-foreground mb-1">{`Year: ${label}`}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {`${entry.name}: ${(entry.value * 100).toFixed(1)}%`}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* 1. Waitlist Sizes Over Time */}
      <Card className="col-span-1 bg-card shadow-lg border-medical-border hover:shadow-xl transition-shadow duration-300">
        <CardHeader className="border-b border-medical-border bg-gradient-to-br from-medical-surface to-medical-surface/50 pb-4">
          <CardTitle className="text-lg font-semibold text-primary">Waitlist Size Over Time</CardTitle>
          <p className="text-xs text-muted-foreground mt-1.5">Total patients waiting, stratified by cPRA level</p>
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
                  label={{ value: 'Years', position: 'insideBottom', offset: -5, style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 12 }}
                  label={{ value: 'Count', angle: -90, position: 'left', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }}
                />
                <Tooltip content={<CustomTooltip />} />
                {/* Low cPRA age groups */}
                {waitlistSeriesVisible.lowCPRA && AGE_GROUPS.filter(group => ageGroupsVisible[group.key]).map(group => (
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
                {waitlistSeriesVisible.highCPRA && AGE_GROUPS.filter(group => ageGroupsVisible[group.key]).map(group => (
                  <Line
                    key={`highCPRA_${group.key}`}
                    type="monotone"
                    dataKey={`highCPRA_${group.key}`}
                    stroke={group.color}
                    strokeWidth={2.5}
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
                  label={{ value: 'Years', position: 'insideBottom', offset: -5, style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 12 }}
                  label={{ value: 'Count', angle: -90, position: 'left', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }}
                />
                <Tooltip content={<CustomTooltip />} />
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
          />

          {/* Age Group Toggle */}
          {filteredData.waitlistDataByAge && (
            <AgeGroupToggle
              visible={ageGroupsVisible}
              onChange={toggleAgeGroup}
              expanded={ageBreakdownExpanded.waitlist}
              onToggleExpand={() => setAgeBreakdownExpanded(prev => ({ ...prev, waitlist: !prev.waitlist }))}
            />
          )}
        </CardContent>
      </Card>


      {/* 2. Transplant Recipients Over Time */}
      <Card className="bg-card shadow-lg border-medical-border hover:shadow-xl transition-shadow duration-300">
        <CardHeader className="border-b border-medical-border bg-gradient-to-br from-medical-surface to-medical-surface/50 pb-4">
          <CardTitle className="text-lg font-semibold text-primary">Transplant Recipients Over Time</CardTitle>
          <p className="text-xs text-muted-foreground mt-1.5">Living recipients with functioning grafts</p>
        </CardHeader>
        <CardContent className="px-4 pt-4 pb-1">
          <ResponsiveContainer width="100%" height={325}>
            {ageBreakdownExpanded.recipients && filteredData.recipientsDataByAge ? (
              <LineChart data={prepareAgeDataForChart(filteredData.recipientsDataByAge)} margin={{ top: 10, right: 10, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" />
                <XAxis
                  type="number"
                  dataKey="year"
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 12 }}
                  domain={xAxisDomain}
                  ticks={xAxisTicks}
                />
                <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 12 }} tickFormatter={(value) => value.toLocaleString()} label={{ value: 'Count', angle: -90, position: 'left', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }} />
                <Tooltip content={<CustomTooltip />} />
                {/* Low cPRA age groups */}
                {recipientsSeriesVisible.lowHuman && AGE_GROUPS.filter(group => ageGroupsVisible[group.key]).map(group => (
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
                {/* High cPRA age groups */}
                {(recipientsSeriesVisible.highHuman || recipientsSeriesVisible.highXeno) && AGE_GROUPS.filter(group => ageGroupsVisible[group.key]).map(group => (
                  <Line
                    key={`highCPRA_${group.key}`}
                    type="monotone"
                    dataKey={`highCPRA_${group.key}`}
                    stroke={group.color}
                    strokeWidth={2.5}
                    name={`High cPRA ${group.label}y`}
                    dot={{ r: 0.3 }}
                  />
                ))}
              </LineChart>
            ) : (
              <LineChart data={filteredData.recipientsData} margin={{ top: 10, right: 10, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" />
                <XAxis
                  type="number"
                  dataKey="year"
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 12 }}
                  domain={xAxisDomain}
                  ticks={xAxisTicks}
                />
                <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 12 }} tickFormatter={(value) => value.toLocaleString()} label={{ value: 'Count', angle: -90, position: 'left', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }} />
                <Tooltip content={<CustomTooltip />} />
                {recipientsSeriesVisible.lowHuman && (
                  <Line type="monotone" dataKey="lowHuman" stroke={COLORS.secondary} name="Low cPRA (human)" strokeWidth={2} dot={{ r: 0.2 }} />
                )}
                {recipientsSeriesVisible.highHuman && (
                  <Line type="monotone" dataKey="highHuman" stroke={COLORS.primary} name="High cPRA (human)" strokeWidth={2} dot={{ r: 0.2 }} />
                )}
                {recipientsSeriesVisible.highXeno && (
                  <Line type="monotone" dataKey="highXeno" stroke={COLORS.quaternary} name="High cPRA (xeno)" strokeWidth={3} dot={{ r: 0.3 }} />
                )}
              </LineChart>
            )}
          </ResponsiveContainer>

          {/* Series Toggle */}
          <ChartSeriesToggle
            series={
              ageBreakdownExpanded.recipients
                ? [
                    { key: 'lowHuman', label: 'Low cPRA', color: COLORS.secondary },
                    { key: 'highHuman', label: 'High cPRA (human)', color: COLORS.primary },
                    { key: 'highXeno', label: 'High cPRA (xeno)', color: COLORS.quaternary },
                  ]
                : [
                    { key: 'lowHuman', label: 'Low cPRA (human)', color: COLORS.secondary },
                    { key: 'highHuman', label: 'High cPRA (human)', color: COLORS.primary },
                    { key: 'highXeno', label: 'High cPRA (xeno)', color: COLORS.quaternary },
                  ]
            }
            visible={recipientsSeriesVisible}
            onChange={toggleRecipientsSeries}
          />

          {/* Age Group Toggle */}
          {filteredData.recipientsDataByAge && (
            <AgeGroupToggle
              visible={ageGroupsVisible}
              onChange={toggleAgeGroup}
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
          <p className="text-xs text-muted-foreground mt-1.5">Total deaths on waitlist and post-transplant</p>
        </CardHeader>
        <CardContent className="px-4 pt-4 pb-1">
          <ResponsiveContainer width="100%" height={325}>
            {ageBreakdownExpanded.cumulativeDeaths && filteredData.cumulativeDeathsDataByAge ? (
              <LineChart data={prepareAgeDataForChart(filteredData.cumulativeDeathsDataByAge)} margin={{ top: 10, right: 10, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" />
                <XAxis
                  type="number"
                  dataKey="year"
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 12 }}
                  domain={xAxisDomain}
                  ticks={xAxisTicks}
                />
                <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 12 }} tickFormatter={(value) => value.toLocaleString()} label={{ value: 'Deaths', angle: -90, position: 'left', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }} />
                <Tooltip content={<CustomTooltip />} />
                {/* Low cPRA age groups */}
                {AGE_GROUPS.filter(group => ageGroupsVisible[group.key]).map(group => (
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
                {/* High cPRA age groups */}
                {AGE_GROUPS.filter(group => ageGroupsVisible[group.key]).map(group => (
                  <Line
                    key={`highCPRA_${group.key}`}
                    type="monotone"
                    dataKey={`highCPRA_${group.key}`}
                    stroke={group.color}
                    strokeWidth={2.5}
                    name={`High cPRA ${group.label}y`}
                    dot={{ r: 0.3 }}
                  />
                ))}
              </LineChart>
            ) : (
              <LineChart data={filteredData.cumulativeDeathsData} margin={{ top: 10, right: 10, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" />
                <XAxis
                  type="number"
                  dataKey="year"
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 12 }}
                  domain={xAxisDomain}
                  ticks={xAxisTicks}
                />
                <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 12 }} tickFormatter={(value) => value.toLocaleString()} label={{ value: 'Deaths', angle: -90, position: 'left', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }} />
                <Tooltip content={<CustomTooltip />} />
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
          {!ageBreakdownExpanded.cumulativeDeaths && (
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
            />
          )}

          {/* Age Group Toggle */}
          {filteredData.cumulativeDeathsDataByAge && (
            <AgeGroupToggle
              visible={ageGroupsVisible}
              onChange={toggleAgeGroup}
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
          <p className="text-xs text-muted-foreground mt-1.5">Annual mortality while waiting for transplant</p>
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
                  label={{ value: 'Years', position: 'insideBottom', offset: -5, style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => value.toLocaleString()}
                  label={{ value: 'Deaths', angle: -90, position: 'left', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }}
                />
                <Tooltip content={<CustomTooltip />} />
                {/* Total age groups */}
                {AGE_GROUPS.filter(group => ageGroupsVisible[group.key]).map(group => (
                  <Line
                    key={`total_${group.key}`}
                    type="monotone"
                    dataKey={`total_${group.key}`}
                    stroke={group.color}
                    strokeWidth={2.5}
                    name={`${group.label}y`}
                    dot={{ r: 2 }}
                  />
                ))}
              </LineChart>
            ) : (
              <ScatterChart
                margin={{ top: 10, right: 10, bottom: 20, left: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" />
                <XAxis
                  type="number"
                  dataKey="x"
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 12 }}
                  domain={xAxisDomain}
                  ticks={xAxisTicks}
                  label={{ value: 'Years', position: 'insideBottom', offset: -5, style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 12 }}
                  domain={[0, 6000]}
                  label={{ value: 'Deaths', angle: -90, position: 'left', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }}
                />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const point = payload[0].payload;
                      return (
                        <div className="bg-card border border-medical-border rounded-lg p-3 shadow-[var(--shadow-medium)]">
                          <p className="text-sm font-medium text-foreground mb-1">{`Year: ${point.year?.toFixed(1) || point.x?.toFixed(1) || 'N/A'}`}</p>
                          <p className="text-sm" style={{ color: payload[0].color }}>
                            {`Waitlist Deaths: ${typeof point.y === 'number' ? point.y.toLocaleString(undefined, { maximumFractionDigits: 0 }) : point.waitlistDeaths?.toLocaleString(undefined, { maximumFractionDigits: 0 }) || 'N/A'}`}
                          </p>
                          {(point.baseWaitlistDeaths !== undefined || (payload.length > 1 && payload[1]?.payload?.y !== undefined)) && (
                            <p className="text-sm" style={{ color: '#3b82f6' }}>
                              {`Base Case: ${point.baseWaitlistDeaths?.toLocaleString(undefined, { maximumFractionDigits: 0 }) || (payload.length > 1 ? payload[1].payload.y?.toLocaleString(undefined, { maximumFractionDigits: 0 }) : 'N/A')}`}
                            </p>
                          )}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Scatter
                  data={filteredData.waitlistDeathsPerYearData.map(d => ({ x: d.year, y: d.waitlistDeaths, year: d.year, waitlistDeaths: d.waitlistDeaths, baseWaitlistDeaths: d.baseWaitlistDeaths }))}
                  fill="#8b0000"
                  name="Waitlist Deaths/Year (Xeno)"
                  shape={(props: any) => {
                    const { cx, cy } = props;
                    return <circle cx={cx} cy={cy} r={3.5} fill="#8b0000" />;
                  }}
                />
                <Scatter
                  data={filteredData.waitlistDeathsPerYearData
                    .filter(d => d.baseWaitlistDeaths !== undefined)
                    .map(d => ({ x: d.year, y: d.baseWaitlistDeaths!, year: d.year, waitlistDeaths: d.waitlistDeaths, baseWaitlistDeaths: d.baseWaitlistDeaths }))}
                  fill="#3b82f6"
                  name="Waitlist Deaths/Year (Base Case)"
                  shape={(props: any) => {
                    const { cx, cy } = props;
                    return <circle cx={cx} cy={cy} r={3.5} fill="#3b82f6" />;
                  }}
                />
              </ScatterChart>
            )}
          </ResponsiveContainer>

          {/* Age Group Toggle */}
          {filteredData.waitlistDeathsPerYearDataByAge && (
            <AgeGroupToggle
              visible={ageGroupsVisible}
              onChange={toggleAgeGroup}
              expanded={ageBreakdownExpanded.waitlistDeathsPerYear}
              onToggleExpand={() => setAgeBreakdownExpanded(prev => ({ ...prev, waitlistDeathsPerYear: !prev.waitlistDeathsPerYear }))}
            />
          )}
        </CardContent>
      </Card>

      {/* 5. Deaths per Year */}
      <Card className="bg-card shadow-lg border-medical-border hover:shadow-xl transition-shadow duration-300">
        <CardHeader className="border-b border-medical-border bg-gradient-to-br from-medical-surface to-medical-surface/50 pb-4">
          <CardTitle className="text-lg font-semibold text-primary">Deaths per Year</CardTitle>
          <p className="text-xs text-muted-foreground mt-1.5">Total annual mortality (waitlist + post-transplant)</p>
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
                  label={{ value: 'Years', position: 'insideBottom', offset: -8, style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))', fontSize: 11 } }}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(value) => value.toLocaleString()}
                  domain={[0, 'auto']}
                  label={{ value: 'Deaths', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))', fontSize: 11 } }}
                />
                <Tooltip content={<CustomTooltip />} />
                {/* Low cPRA age groups - stacked */}
                {AGE_GROUPS.filter(group => ageGroupsVisible[group.key]).map(group => (
                  <Bar
                    key={`lowCPRA_${group.key}`}
                    dataKey={`lowCPRA_${group.key}`}
                    stackId="lowCPRA"
                    fill={group.color}
                    fillOpacity={0.6}
                    name={`Low cPRA ${group.label}y`}
                  />
                ))}
                {/* High cPRA age groups - stacked */}
                {AGE_GROUPS.filter(group => ageGroupsVisible[group.key]).map(group => (
                  <Bar
                    key={`highCPRA_${group.key}`}
                    dataKey={`highCPRA_${group.key}`}
                    stackId="highCPRA"
                    fill={group.color}
                    fillOpacity={0.9}
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
                  label={{ value: 'Years', position: 'insideBottom', offset: -8, style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))', fontSize: 11 } }}
                  padding={{ left: 10, right: 10 }}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(value) => value.toLocaleString()}
                  domain={[0, 'auto']}
                  label={{ value: 'Deaths', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))', fontSize: 11 } }}
                />
                <Tooltip content={<CustomTooltip />} />
                {deathsPerYearSeriesVisible.low && <Bar dataKey="low" fill={COLORS.secondary} name="Low cPRA" radius={[2, 2, 0, 0]} />}
                {deathsPerYearSeriesVisible.high && <Bar dataKey="high" fill={COLORS.primary} name="High cPRA" radius={[2, 2, 0, 0]} />}
                {deathsPerYearSeriesVisible.total && <Bar dataKey="total" fill={COLORS.quaternary} name="Total" radius={[2, 2, 0, 0]} />}
              </BarChart>
            )}
          </ResponsiveContainer>

          {/* Series Toggle */}
          {!ageBreakdownExpanded.deathsPerYear && (
            <ChartSeriesToggle
              series={[
                { key: 'low', label: 'Low cPRA', color: COLORS.secondary },
                { key: 'high', label: 'High cPRA', color: COLORS.primary },
                { key: 'total', label: 'Total', color: COLORS.quaternary },
              ]}
              visible={deathsPerYearSeriesVisible}
              onChange={toggleDeathsPerYearSeries}
            />
          )}

          {/* Age Group Toggle */}
          {filteredData.deathsPerYearDataByAge && (
            <AgeGroupToggle
              visible={ageGroupsVisible}
              onChange={toggleAgeGroup}
              expanded={ageBreakdownExpanded.deathsPerYear}
              onToggleExpand={() => setAgeBreakdownExpanded(prev => ({ ...prev, deathsPerYear: !prev.deathsPerYear }))}
            />
          )}
        </CardContent>
      </Card>

      {/* 6. Net Waitlist Deaths Prevented per Year */}
      <Card className="bg-card shadow-lg border-medical-border hover:shadow-xl transition-shadow duration-300">
        <CardHeader className="border-b border-medical-border bg-gradient-to-br from-medical-surface to-medical-surface/50 pb-4">
          <CardTitle className="text-lg font-semibold text-primary">Net Waitlist Deaths Prevented per Year</CardTitle>
          <p className="text-xs text-muted-foreground mt-1.5">Lives saved annually vs. base case (positive = fewer deaths)</p>
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
                  label={{ value: 'Years', position: 'insideBottom', offset: -8, style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))', fontSize: 11 } }}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(value) => value.toLocaleString()}
                  domain={[0, 'dataMax']}
                  label={{ value: 'Deaths Prevented', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))', fontSize: 11 } }}
                />
                <Tooltip content={<CustomTooltip />} />
                {/* High cPRA age groups - stacked */}
                {AGE_GROUPS.filter(group => ageGroupsVisible[group.key]).map(group => (
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
                  label={{ value: 'Years', position: 'insideBottom', offset: -8, style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))', fontSize: 11 } }}
                  padding={{ left: 10, right: 10 }}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(value) => value.toLocaleString()}
                  domain={[0, 'dataMax']}
                  label={{ value: 'Deaths Prevented', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))', fontSize: 11 } }}
                />
                <Tooltip content={<CustomTooltip />} />
                {netDeathsSeriesVisible.low && <Bar dataKey="low" fill="#86efac" name="Low cPRA" radius={[2, 2, 0, 0]} />}
                {netDeathsSeriesVisible.high && <Bar dataKey="high" fill="#22c55e" name="High cPRA" radius={[2, 2, 0, 0]} />}
                {netDeathsSeriesVisible.total && <Bar dataKey="total" fill="#15803d" name="Total" radius={[2, 2, 0, 0]} />}
              </BarChart>
            )}
          </ResponsiveContainer>

          {/* Series Toggle */}
          {!ageBreakdownExpanded.netDeathsPrevented && (
            <ChartSeriesToggle
              series={[
                { key: 'low', label: 'Low cPRA', color: '#86efac' },
                { key: 'high', label: 'High cPRA', color: '#22c55e' },
                { key: 'total', label: 'Total', color: '#15803d' },
              ]}
              visible={netDeathsSeriesVisible}
              onChange={toggleNetDeathsSeries}
            />
          )}

          {/* Age Group Toggle */}
          {filteredData.netDeathsPreventedByAge && (
            <AgeGroupToggle
              visible={ageGroupsVisible}
              onChange={toggleAgeGroup}
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
 