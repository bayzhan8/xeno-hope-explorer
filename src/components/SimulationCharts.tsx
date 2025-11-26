import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, BarChart, Bar, Legend, Tooltip, ScatterChart, Scatter } from 'recharts';

interface SimulationData {
  waitlistData: Array<{ year: number; total: number; lowCPRA: number; highCPRA: number }>;
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
}

interface SimulationChartsProps {
  data: SimulationData;
  highCPRAThreshold: number;
  simulationHorizon: number;
}

const SimulationCharts: React.FC<SimulationChartsProps> = ({ data, highCPRAThreshold, simulationHorizon }) => {
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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* 1. Waitlist Sizes Over Time */}
      <Card className="col-span-1 lg:col-span-2 bg-card shadow-[var(--shadow-medium)] border-medical-border">
        <CardHeader className="border-b border-medical-border bg-medical-surface">
          <CardTitle className="text-lg font-semibold text-primary">Waitlist Size Over Time</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <ResponsiveContainer width="100%" height={390}>
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
              <Legend 
                wrapperStyle={{ paddingTop: '20px' }}
                iconType="line"
              />
              <Line 
                type="monotone" 
                dataKey="total" 
                stroke={COLORS.primary} 
                strokeWidth={3}
                name="Total Waitlist"
                dot={{ fill: COLORS.primary, strokeWidth: 1, r: 1.5 }}
              />
              <Line 
                type="monotone" 
                dataKey="lowCPRA" 
                stroke={COLORS.secondary} 
                strokeWidth={2}
                name={`Low CPRA (0-${highCPRAThreshold}%)`}
                dot={{ fill: COLORS.secondary, strokeWidth: 1, r: 1 }}
              />
              <Line 
                type="monotone" 
                dataKey="highCPRA" 
                stroke={COLORS.tertiary} 
                strokeWidth={2}
                name={`High CPRA (${highCPRAThreshold}-100%)`}
                dot={{ fill: COLORS.tertiary, strokeWidth: 1, r: 1 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 2. Transplant Recipients Over Time */}
      <Card className="bg-card shadow-[var(--shadow-medium)] border-medical-border">
        <CardHeader className="border-b border-medical-border bg-medical-surface">
          <CardTitle className="text-lg font-semibold text-primary">Transplant Recipients Over Time</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <ResponsiveContainer width="100%" height={325}>
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
              <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 12 }} label={{ value: 'Count', angle: -90, position: 'left', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              <Line type="monotone" dataKey="lowHuman" stroke={COLORS.secondary} name="Low cPRA (human)" strokeWidth={2} dot={{ r: 0.2 }} />
              <Line type="monotone" dataKey="highHuman" stroke={COLORS.primary} name="High cPRA (human)" strokeWidth={2} dot={{ r: 0.2 }} />
              <Line type="monotone" dataKey="highXeno" stroke={COLORS.quaternary} name="High cPRA (xeno)" strokeWidth={3} dot={{ r: 0.3 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 3. Cumulative Deaths Over Time */}
      <Card className="bg-card shadow-[var(--shadow-medium)] border-medical-border">
        <CardHeader className="border-b border-medical-border bg-medical-surface">
          <CardTitle className="text-lg font-semibold text-primary">Cumulative Deaths Over Time</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <ResponsiveContainer width="100%" height={325}>
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
              <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 12 }} label={{ value: 'Deaths', angle: -90, position: 'left', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              <Line type="monotone" dataKey="lowWaitlist" stroke={COLORS.secondary} name="Low cPRA waitlist" strokeWidth={2} dot={{ r: 0.15 }} />
              <Line type="monotone" dataKey="highWaitlist" stroke={COLORS.primary} name="High cPRA waitlist" strokeWidth={2} dot={{ r: 0.15 }} />
              <Line type="monotone" dataKey="lowPostTx" stroke={COLORS.tertiary} name="Low cPRA post-tx" strokeWidth={2} dot={{ r: 0.15 }} />
              <Line type="monotone" dataKey="highPostTx" stroke={COLORS.quaternary} name="High cPRA post-tx" strokeWidth={2} dot={{ r: 0.15 }} />
              <Line type="monotone" dataKey="total" stroke={COLORS.primary} name="Total" strokeWidth={3} dot={{ r: 0.3 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 4. Waitlist Deaths per Year (Scatter Plot) */}
      <Card className="bg-card shadow-[var(--shadow-medium)] border-medical-border">
        <CardHeader className="border-b border-medical-border bg-medical-surface">
          <CardTitle className="text-lg font-semibold text-primary">Waitlist Deaths per Year</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <ResponsiveContainer width="100%" height={325}>
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
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
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
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 5. Deaths per Year */}
      <Card className="bg-card shadow-[var(--shadow-medium)] border-medical-border">
        <CardHeader className="border-b border-medical-border bg-medical-surface">
          <CardTitle className="text-lg font-semibold text-primary">Deaths per Year</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <ResponsiveContainer width="100%" height={325}>
            <BarChart data={filteredData.deathsPerYearData} margin={{ top: 10, right: 10, bottom: 20, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" />
              <XAxis 
                type="number"
                dataKey="year" 
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 12 }}
                domain={xAxisDomain}
                ticks={xAxisTicks}
              />
              <YAxis 
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 12 }}
                label={{ value: 'Deaths', angle: -90, position: 'left', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              <Bar dataKey="low" fill={COLORS.secondary} name="Low cPRA" radius={[2, 2, 0, 0]} />
              <Bar dataKey="high" fill={COLORS.primary} name="High cPRA" radius={[2, 2, 0, 0]} />
              <Bar dataKey="total" fill={COLORS.quaternary} name="Total" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 6. Net Waitlist Deaths Prevented per Year */}
      <Card className="bg-card shadow-[var(--shadow-medium)] border-medical-border">
        <CardHeader className="border-b border-medical-border bg-medical-surface">
          <CardTitle className="text-lg font-semibold text-primary">Net Waitlist Deaths Prevented per Year</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">(Base Case - Xenotransplantation)</p>
        </CardHeader>
        <CardContent className="p-4">
          <ResponsiveContainer width="100%" height={325}>
            <BarChart data={filteredData.netDeathsPreventedPerYearData} margin={{ top: 10, right: 10, bottom: 20, left: 20 }}>
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
                label={{ value: 'Deaths Prevented', angle: -90, position: 'left', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              <Bar dataKey="low" fill="#86efac" name="Low cPRA Net Waitlist Deaths Prevented" radius={[2, 2, 0, 0]} />
              <Bar dataKey="high" fill="#22c55e" name="High cPRA Net Waitlist Deaths Prevented" radius={[2, 2, 0, 0]} />
              <Bar dataKey="total" fill="#15803d" name="Total Net Waitlist Deaths Prevented" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Average Waiting Time (Coming Soon) */}
      <Card className="bg-card border-medical-border opacity-60 grayscale">
        <CardHeader className="border-b border-medical-border bg-medical-surface">
          <CardTitle className="text-lg font-semibold text-muted-foreground">Average Waiting Time (Coming Soon)</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <ResponsiveContainer width="100%" height={325}>
            <LineChart data={filteredData.waitingTimeData} margin={{ top: 10, right: 10, bottom: 20, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" />
              <XAxis 
                type="number"
                dataKey="year" 
                stroke="hsl(var(--muted-foreground))" 
                tick={{ fontSize: 12 }}
                domain={xAxisDomain}
                ticks={xAxisTicks}
              />
              <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 12 }} label={{ value: 'Years', angle: -90, position: 'left', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              <Line type="monotone" dataKey="averageWaitingTime" stroke={COLORS.quaternary} strokeWidth={3} name="Average Wait Time" dot={{ r: 1.5 }} />
            </LineChart>
          </ResponsiveContainer>
          <p className="mt-3 text-xs text-muted-foreground">Not available yet. Will be enabled in a future update.</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default SimulationCharts;
 