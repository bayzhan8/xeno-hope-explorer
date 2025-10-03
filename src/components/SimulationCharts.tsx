import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Legend, Tooltip } from 'recharts';

interface SimulationData {
  waitlistData: Array<{ year: number; total: number; lowCPRA: number; highCPRA: number }>;
  waitlistDeathsData: Array<{ year: number; waitlistDeaths: number }>;
  postTransplantDeathsData: Array<{ year: number; xenoPostTransplantDeaths: number; humanPostTransplantDeaths: number }>;
  netDeathsPreventedData: Array<{ year: number; netDeathsPrevented: number }>;
  graftFailuresData: Array<{ year: number; xenoGraftFailures: number; humanGraftFailures: number }>;
  transplantsData: Array<{ year: number; human: number; xeno: number }>;
  penetrationData: Array<{ year: number; proportion: number }>;
  waitingTimeData: Array<{ year: number; averageWaitingTime: number }>;
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
      {/* Waitlist Size Over Time */}
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

      {/* Graft Failures */}
      <Card className="bg-card shadow-[var(--shadow-medium)] border-medical-border">
        <CardHeader className="border-b border-medical-border bg-medical-surface">
          <CardTitle className="text-lg font-semibold text-primary">Graft Failures</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.graftFailuresData}>
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
                label={{ value: 'Graft Failures', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                wrapperStyle={{ paddingTop: '20px' }}
              />
              <Bar 
                dataKey="humanGraftFailures" 
                stackId="graft"
                fill={COLORS.secondary}
                name="Human Graft Failures"
                radius={[0, 0, 0, 0]}
              />
              <Bar 
                dataKey="xenoGraftFailures" 
                stackId="graft"
                fill={COLORS.tertiary}
                name="Xeno Graft Failures"
                radius={[2, 2, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Waitlist & Post-Transplant Deaths */}
      <Card className="bg-card shadow-[var(--shadow-medium)] border-medical-border">
        <CardHeader className="border-b border-medical-border bg-medical-surface">
          <CardTitle className="text-lg font-semibold text-primary">Deaths Analysis</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.postTransplantDeathsData.map((item, index) => ({
              ...item,
              waitlistDeaths: data.waitlistDeathsData[index]?.waitlistDeaths || 0
            }))}>
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
                label={{ value: 'Deaths', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                wrapperStyle={{ paddingTop: '20px' }}
              />
              <Bar 
                dataKey="waitlistDeaths" 
                fill={COLORS.primary}
                name="Waitlist Deaths"
                radius={[2, 2, 0, 0]}
              />
              <Bar 
                dataKey="xenoPostTransplantDeaths" 
                fill={COLORS.tertiary}
                name="Xeno Post-Transplant Deaths"
                radius={[2, 2, 0, 0]}
              />
              <Bar 
                dataKey="humanPostTransplantDeaths" 
                fill={COLORS.secondary}
                name="Human Post-Transplant Deaths"
                radius={[2, 2, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Average Waiting Time */}
      <Card className="bg-card shadow-[var(--shadow-medium)] border-medical-border">
        <CardHeader className="border-b border-medical-border bg-medical-surface">
          <CardTitle className="text-lg font-semibold text-primary">Average Waiting Time</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={data.waitingTimeData}>
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
                label={{ value: 'Years on Waitlist', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                wrapperStyle={{ paddingTop: '20px' }}
              />
              <Line 
                type="monotone" 
                dataKey="averageWaitingTime" 
                stroke={COLORS.quaternary} 
                strokeWidth={3}
                name="Average Wait Time"
                dot={{ fill: COLORS.quaternary, strokeWidth: 2, r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Total Transplants */}
      <Card className="bg-card shadow-[var(--shadow-medium)] border-medical-border">
        <CardHeader className="border-b border-medical-border bg-medical-surface">
          <CardTitle className="text-lg font-semibold text-primary">Cumulative Transplants</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.transplantsData}>
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
                label={{ value: 'Cumulative Transplants', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                wrapperStyle={{ paddingTop: '20px' }}
              />
              <Bar 
                dataKey="human" 
                fill={COLORS.primary}
                name="Human Kidney Transplants"
                radius={[2, 2, 0, 0]}
              />
              <Bar 
                dataKey="xeno" 
                fill={COLORS.quaternary}
                name="Xeno Kidney Transplants"
                radius={[2, 2, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Net Deaths Prevented */}
      <Card className="bg-card shadow-[var(--shadow-medium)] border-medical-border">
        <CardHeader className="border-b border-medical-border bg-medical-surface">
          <CardTitle className="text-lg font-semibold text-primary">Net Deaths Prevented</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.netDeathsPreventedData}>
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
                label={{ value: 'Net Deaths Prevented', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                wrapperStyle={{ paddingTop: '20px' }}
              />
              <Bar 
                dataKey="netDeathsPrevented" 
                fill={COLORS.quaternary}
                name="Net Deaths Prevented"
                radius={[2, 2, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* High CPRA Penetration */}
      <Card className="bg-card shadow-[var(--shadow-medium)] border-medical-border">
        <CardHeader className="border-b border-medical-border bg-medical-surface">
          <CardTitle className="text-lg font-semibold text-primary">{`High CPRA (${highCPRAThreshold}%+) Transplant Penetration`}</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={data.penetrationData}>
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
                domain={[0, 1]}
                tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
                label={{ value: 'High CPRA Treated (%)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }}
              />
              <Tooltip content={<PercentageTooltip />} />
              <Legend 
                wrapperStyle={{ paddingTop: '20px' }}
              />
              <Line 
                type="monotone" 
                dataKey="proportion" 
                stroke={COLORS.quaternary} 
                strokeWidth={3}
                name={`High CPRA (${highCPRAThreshold}%+) Transplant Rate`}
                dot={{ fill: COLORS.quaternary, strokeWidth: 2, r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
};

export default SimulationCharts;