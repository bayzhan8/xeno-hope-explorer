import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus, Heart, Users, Activity } from 'lucide-react';

interface MetricSummary {
  waitlistReduction: number;
  deathsPrevented: number;
  totalTransplants: number;
  xenoTransplants: number;
  penetrationRate: number;
}

interface SummaryMetricsProps {
  metrics: MetricSummary;
  horizon: number;
}

const SummaryMetrics: React.FC<SummaryMetricsProps> = ({ metrics, horizon }) => {
  const formatNumber = (num: number): string => {
    return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
  };

  const formatPercentage = (num: number): string => {
    return `${(num * 100).toFixed(1)}%`;
  };

  const getTrendIcon = (value: number) => {
    if (value > 0) return <TrendingUp className="w-4 h-4 text-success" />;
    if (value < 0) return <TrendingDown className="w-4 h-4 text-destructive" />;
    return <Minus className="w-4 h-4 text-muted-foreground" />;
  };

  const metrics_data = [
    {
      title: 'Xeno Transplants',
      value: `${formatNumber(Math.round(metrics.xenoTransplants / horizon))} / year`,
      icon: <Activity className="w-5 h-5 text-chart-quaternary" />,
      trend: getTrendIcon(metrics.xenoTransplants),
      subtitle: `Average per year over ${horizon} years`,
      color: 'text-chart-quaternary'
    },
    {
      title: 'Waitlist Reduction',
      value: formatNumber(Math.abs(metrics.waitlistReduction)),
      icon: <Users className="w-5 h-5 text-primary" />,
      trend: getTrendIcon(-metrics.waitlistReduction),
      subtitle: `Fewer patients waiting after ${horizon} years`,
      color: 'text-primary'
    },
    {
      title: 'Lives Saved',
      value: formatNumber(metrics.deathsPrevented),
      icon: <Heart className="w-5 h-5 text-success" />,
      trend: getTrendIcon(metrics.deathsPrevented),
      subtitle: 'Waitlist deaths prevented vs. base case',
      color: 'text-success'
    },
    {
      title: 'Total Transplants',
      value: formatNumber(metrics.totalTransplants),
      icon: <Activity className="w-5 h-5 text-chart-secondary" />,
      trend: getTrendIcon(metrics.totalTransplants),
      subtitle: `Cumulative transplants over ${horizon} years`,
      color: 'text-chart-secondary'
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {metrics_data.map((metric, index) => (
        <Card key={index} className="bg-card shadow-[var(--shadow-soft)] border-medical-border hover:shadow-[var(--shadow-medium)] transition-shadow duration-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              {metric.icon}
              {metric.trend}
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {metric.title}
              </p>
              <p className={`text-xl font-bold ${metric.color}`}>
                {metric.value}
              </p>
              <p className="text-xs text-muted-foreground">
                {metric.subtitle}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default SummaryMetrics;