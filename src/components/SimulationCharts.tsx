import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';

interface SimulationData {
  waitlistData: Array<{ year: number; total: number; lowCPRA: number; highCPRA: number }>;
  deathsData: Array<{ year: number; totalPrevented: number; lowCPRA: number; highCPRA: number }>;
  transplantsData: Array<{ year: number; human: number; xeno: number }>;
  penetrationData: Array<{ year: number; proportion: number }>;
}

interface SimulationChartsProps {
  data: SimulationData;
}

const SimulationCharts: React.FC<SimulationChartsProps> = ({ data }) => {
  const COLORS = {
    primary: 'hsl(var(--chart-primary))',
    secondary: 'hsl(var(--chart-secondary))',
    tertiary: 'hsl(var(--chart-tertiary))',
    quaternary: 'hsl(var(--chart-quaternary))',
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
              />
              <YAxis 
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 12 }}
              />
              <Line 
                type="monotone" 
                dataKey="total" 
                stroke={COLORS.primary} 
                strokeWidth={3}
                name="Total"
                dot={{ fill: COLORS.primary, strokeWidth: 2, r: 4 }}
              />
              <Line 
                type="monotone" 
                dataKey="lowCPRA" 
                stroke={COLORS.secondary} 
                strokeWidth={2}
                name="Low CPRA (0-85)"
                dot={{ fill: COLORS.secondary, strokeWidth: 2, r: 3 }}
              />
              <Line 
                type="monotone" 
                dataKey="highCPRA" 
                stroke={COLORS.tertiary} 
                strokeWidth={2}
                name="High CPRA (85-100)"
                dot={{ fill: COLORS.tertiary, strokeWidth: 2, r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Annual Deaths Prevented */}
      <Card className="bg-card shadow-[var(--shadow-medium)] border-medical-border">
        <CardHeader className="border-b border-medical-border bg-medical-surface">
          <CardTitle className="text-lg font-semibold text-primary">Annual Deaths Prevented</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.deathsData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" />
              <XAxis 
                dataKey="year" 
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 12 }}
              />
              <YAxis 
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 12 }}
              />
              <Bar 
                dataKey="highCPRA" 
                fill={COLORS.tertiary}
                name="High CPRA"
                radius={[2, 2, 0, 0]}
              />
              <Bar 
                dataKey="lowCPRA" 
                fill={COLORS.secondary}
                name="Low CPRA"
                radius={[2, 2, 0, 0]}
              />
            </BarChart>
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
              />
              <YAxis 
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 12 }}
              />
              <Bar 
                dataKey="human" 
                fill={COLORS.primary}
                name="Human"
                radius={[2, 2, 0, 0]}
              />
              <Bar 
                dataKey="xeno" 
                fill={COLORS.quaternary}
                name="Xeno"
                radius={[2, 2, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* High CPRA Penetration */}
      <Card className="col-span-1 lg:col-span-2 bg-card shadow-[var(--shadow-medium)] border-medical-border">
        <CardHeader className="border-b border-medical-border bg-medical-surface">
          <CardTitle className="text-lg font-semibold text-primary">High CPRA Transplant Penetration</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data.penetrationData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" />
              <XAxis 
                dataKey="year" 
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 12 }}
              />
              <YAxis 
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 12 }}
                domain={[0, 1]}
                tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
              />
              <Line 
                type="monotone" 
                dataKey="proportion" 
                stroke={COLORS.quaternary} 
                strokeWidth={3}
                name="Proportion Transplanted"
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