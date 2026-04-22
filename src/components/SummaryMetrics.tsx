import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus, Heart, Users, Activity, AlertTriangle } from 'lucide-react';

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
  xenoIntendedPerYear: number;
}

const SummaryMetrics: React.FC<SummaryMetricsProps> = ({ metrics, horizon, xenoIntendedPerYear }) => {
  const formatNumber = (num: number): string => {
    return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
  };

  const getTrendIcon = (value: number) => {
    if (value > 0) return <TrendingUp className="w-4 h-4 text-success" />;
    if (value < 0) return <TrendingDown className="w-4 h-4 text-destructive" />;
    return <Minus className="w-4 h-4 text-muted-foreground" />;
  };

  const xenoActualPerYear = Math.round(metrics.xenoTransplants / horizon);
  const xenoUnusedPerYear = Math.max(0, xenoIntendedPerYear - xenoActualPerYear);
  const hasExhaustion = xenoIntendedPerYear > 0 && xenoUnusedPerYear > xenoIntendedPerYear * 0.05;

  const standardMetrics = [
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
    <div className="space-y-4">
      {/* Xeno Kidney Allocation Card - full width */}
      <Card className={`bg-card shadow-[var(--shadow-soft)] border-medical-border hover:shadow-[var(--shadow-medium)] transition-shadow duration-200 ${hasExhaustion ? 'border-amber-300' : ''}`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-chart-quaternary" />
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Xeno Kidney Allocation
              </p>
            </div>
            {hasExhaustion
              ? <AlertTriangle className="w-4 h-4 text-amber-500" />
              : getTrendIcon(metrics.xenoTransplants)
            }
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Intended</p>
              <p className="text-xl font-bold text-chart-quaternary">{formatNumber(xenoIntendedPerYear)}<span className="text-sm font-normal text-muted-foreground"> / year</span></p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Actually Transplanted</p>
              <p className={`text-xl font-bold ${hasExhaustion ? 'text-amber-600' : 'text-chart-quaternary'}`}>{formatNumber(xenoActualPerYear)}<span className="text-sm font-normal text-muted-foreground"> / year</span></p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Unused</p>
              <p className={`text-xl font-bold ${hasExhaustion ? 'text-amber-500' : 'text-muted-foreground'}`}>{formatNumber(xenoUnusedPerYear)}<span className="text-sm font-normal text-muted-foreground"> / year</span></p>
            </div>
          </div>
          {hasExhaustion && (
            <p className="text-xs text-amber-600 mt-3 flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
              Target population exhausted — {formatNumber(xenoUnusedPerYear)} xeno kidneys/year go unused because there aren't enough eligible patients
            </p>
          )}
          {!hasExhaustion && xenoIntendedPerYear > 0 && (
            <p className="text-xs text-muted-foreground mt-3">
              Average per year over {horizon} years
            </p>
          )}
        </CardContent>
      </Card>

      {/* Other Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {standardMetrics.map((metric, index) => (
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
    </div>
  );
};

export default SummaryMetrics;