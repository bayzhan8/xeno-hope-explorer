import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus, Heart, Users, Activity, Info, AlertTriangle } from 'lucide-react';

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
  // Use a 2% tolerance so Monte Carlo noise around the linear regime doesn't
  // accidentally flag "saturation" or "recycling" when actual ≈ intended.
  const SATURATION_TOLERANCE = 0.02;
  const actualExceedsIntended =
    xenoIntendedPerYear > 0 &&
    xenoActualPerYear > xenoIntendedPerYear * (1 + SATURATION_TOLERANCE);
  const supplyExceedsActual =
    xenoIntendedPerYear > 0 &&
    xenoActualPerYear < xenoIntendedPerYear * (1 - SATURATION_TOLERANCE);
  const unusedPerYear = supplyExceedsActual
    ? Math.max(0, xenoIntendedPerYear - xenoActualPerYear)
    : 0;
  const unusedTotal = unusedPerYear * horizon;
  const unusedPct =
    xenoIntendedPerYear > 0 ? (unusedPerYear / xenoIntendedPerYear) * 100 : 0;
  const allocatedTotal = xenoActualPerYear * horizon;
  const intendedTotal = xenoIntendedPerYear * horizon;

  const standardMetrics = [
    {
      title: 'Waitlist Reduction',
      value: formatNumber(metrics.waitlistReduction),
      icon: <Users className="w-5 h-5 text-primary" />,
      trend: getTrendIcon(metrics.waitlistReduction),
      subtitle: `Fewer patients waiting vs. base case at year ${horizon}`,
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
      <Card className="bg-card shadow-[var(--shadow-soft)] border-medical-border hover:shadow-[var(--shadow-medium)] transition-shadow duration-200">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-chart-quaternary" />
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Xeno Kidney Allocation
              </p>
            </div>
            {getTrendIcon(metrics.xenoTransplants)}
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Xeno Supply Rate</p>
              <p className="text-xl font-bold text-chart-quaternary">
                {formatNumber(xenoIntendedPerYear)}
                <span className="text-sm font-normal text-muted-foreground"> kidneys / year</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {xenoIntendedPerYear > 0
                  ? `${formatNumber(intendedTotal)} kidneys offered over ${horizon} years`
                  : 'Added on top of existing human transplants'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                {supplyExceedsActual ? 'Xeno Kidneys Allocated' : 'Xeno Procedures Performed'}
              </p>
              <p className="text-xl font-bold text-chart-quaternary">
                {formatNumber(xenoActualPerYear)}
                <span className="text-sm font-normal text-muted-foreground"> / year avg</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {formatNumber(allocatedTotal)} procedures over {horizon} years
                {actualExceedsIntended ? ' (includes re-transplants from graft failures)' : ''}
              </p>
            </div>
          </div>

          {supplyExceedsActual && (
            <div className="mt-3 pt-3 border-t border-medical-border">
              <div className="flex items-start gap-3 p-3 rounded-md bg-warning/10 border border-warning/30">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-warning" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">
                    {formatNumber(unusedPerYear)} kidneys / year unused
                    <span className="text-xs font-normal text-muted-foreground"> ({unusedPct.toFixed(1)}% of supply)</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatNumber(unusedTotal)} kidneys go unused over {horizon} years because the
                    target population is exhausted faster than additional supply can be absorbed.
                    The eligible waitlist has hit its arrival-driven floor — additional kidneys
                    have no one left to transplant into.
                  </p>
                </div>
              </div>
            </div>
          )}

          {actualExceedsIntended && (
            <div className="mt-3 pt-3 border-t border-medical-border">
              <div className="flex items-start gap-2 text-xs text-muted-foreground leading-relaxed">
                <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-primary" />
                <span>
                  Procedures exceed supply because xeno graft failures cause patients to relist
                  and receive repeat transplants. A higher supply rate drains the eligible
                  waitlist faster, reaching the same steady-state floor sooner — but the floor is
                  set by how quickly new patients arrive, not by supply.
                </span>
              </div>
            </div>
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