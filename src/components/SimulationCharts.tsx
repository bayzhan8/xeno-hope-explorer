import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, BarChart, Bar, Legend, Tooltip } from 'recharts';

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
}

interface SimulationChartsProps {
  data: SimulationData;
  highCPRAThreshold: number;
}

const SimulationCharts: React.FC<SimulationChartsProps> = ({ data, highCPRAThreshold }) => {
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
      <Card className="col-span-1 lg:col-span-2 bg-card shadow-[var(--shadow-medium)] border-medical-border">
        <CardHeader className="border-b border-medical-border bg-medical-surface">
          <CardTitle className="text-lg font-semibold text-primary">Waitlist Size Over Time</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data.waitlistData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" />
              <XAxis 
                dataKey="year" 
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 12 }}
                label={{ value: 'Years', position: 'insideBottom', offset: -5, style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }}
              />
              <YAxis 
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 12 }}
                label={{ value: 'Patients on Waitlist', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }}
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
                dot={{ fill: COLORS.primary, strokeWidth: 2, r: 4 }}
              />
              <Line 
                type="monotone" 
                dataKey="lowCPRA" 
                stroke={COLORS.secondary} 
                strokeWidth={2}
                name={`Low CPRA (0-${highCPRAThreshold}%)`}
                dot={{ fill: COLORS.secondary, strokeWidth: 2, r: 3 }}
              />
              <Line 
                type="monotone" 
                dataKey="highCPRA" 
                stroke={COLORS.tertiary} 
                strokeWidth={2}
                name={`High CPRA (${highCPRAThreshold}-100%)`}
                dot={{ fill: COLORS.tertiary, strokeWidth: 2, r: 3 }}
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
        <CardContent className="p-6">
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={data.recipientsData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" />
              <XAxis dataKey="year" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 12 }} />
              <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 12 }} label={{ value: 'Recipients', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              <Line type="monotone" dataKey="lowHuman" stroke={COLORS.secondary} name="Low cPRA (human)" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="highHuman" stroke={COLORS.primary} name="High cPRA (human)" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="highXeno" stroke={COLORS.quaternary} name="High cPRA (xeno)" strokeWidth={3} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 3. Cumulative Deaths Over Time */}
      <Card className="bg-card shadow-[var(--shadow-medium)] border-medical-border">
        <CardHeader className="border-b border-medical-border bg-medical-surface">
          <CardTitle className="text-lg font-semibold text-primary">Cumulative Deaths Over Time</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={data.cumulativeDeathsData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" />
              <XAxis dataKey="year" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 12 }} />
              <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 12 }} label={{ value: 'Cumulative Deaths', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              <Line type="monotone" dataKey="lowWaitlist" stroke={COLORS.secondary} name="Low cPRA waitlist" strokeWidth={2} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="highWaitlist" stroke={COLORS.primary} name="High cPRA waitlist" strokeWidth={2} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="lowPostTx" stroke={COLORS.tertiary} name="Low cPRA post-tx" strokeWidth={2} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="highPostTx" stroke={COLORS.quaternary} name="High cPRA post-tx" strokeWidth={2} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="total" stroke={COLORS.primary} name="Total" strokeWidth={3} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 4. Deaths per Day */}
      <Card className="bg-card shadow-[var(--shadow-medium)] border-medical-border">
        <CardHeader className="border-b border-medical-border bg-medical-surface">
          <CardTitle className="text-lg font-semibold text-primary">Deaths per Day</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={data.deathsPerDayData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" />
              <XAxis 
                dataKey="year" 
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 12 }}
              />
              <YAxis 
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 12 }}
                label={{ value: 'Deaths per day', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              <Line type="monotone" dataKey="low" stroke={COLORS.secondary} name="Low cPRA" strokeWidth={2} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="high" stroke={COLORS.primary} name="High cPRA" strokeWidth={2} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="total" stroke={COLORS.quaternary} name="Total" strokeWidth={3} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 5. Deaths per Year */}
      <Card className="bg-card shadow-[var(--shadow-medium)] border-medical-border">
        <CardHeader className="border-b border-medical-border bg-medical-surface">
          <CardTitle className="text-lg font-semibold text-primary">Deaths per Year</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.deathsPerYearData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" />
              <XAxis 
                dataKey="year" 
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 12 }}
              />
              <YAxis 
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 12 }}
                label={{ value: 'Deaths per year', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }}
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

      {/* 6. Net Deaths Prevented per Year (xeno only) */}
      <Card className="bg-card shadow-[var(--shadow-medium)] border-medical-border">
        <CardHeader className="border-b border-medical-border bg-medical-surface">
          <CardTitle className="text-lg font-semibold text-primary">Net Deaths Prevented</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.netDeathsPreventedPerYearData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" />
              <XAxis 
                dataKey="year" 
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 12 }}
                label={{ value: 'Years', position: 'insideBottom', offset: -5, style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }}
              />
              <YAxis 
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 12 }}
                label={{ value: 'Net deaths prevented (vs base)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }}
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

      {/* Average Waiting Time (Coming Soon) */}
      <Card className="bg-card border-medical-border opacity-60 grayscale">
        <CardHeader className="border-b border-medical-border bg-medical-surface">
          <CardTitle className="text-lg font-semibold text-muted-foreground">Average Waiting Time (Coming Soon)</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={data.waitingTimeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" />
              <XAxis dataKey="year" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 12 }} />
              <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 12 }} label={{ value: 'Years on waitlist', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              <Line type="monotone" dataKey="averageWaitingTime" stroke={COLORS.quaternary} strokeWidth={3} name="Average Wait Time" dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
          <p className="mt-3 text-xs text-muted-foreground">Not available yet. Will be enabled in a future update.</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default SimulationCharts;
 