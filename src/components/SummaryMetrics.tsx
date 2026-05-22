import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Heart,
  Users,
  Activity,
  Info,
  AlertTriangle,
  Hourglass,
  Clock,
  CheckCircle2,
  Repeat,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface MetricSummary {
  waitlistReduction: number;
  deathsPrevented: number;
  totalTransplants: number;
  xenoTransplants: number;
  penetrationRate: number;
  // Wait time (Little's Law estimate from waitlist size and outflows).
  // All in months. NaN signals "not available" (e.g. base case not loaded,
  // or no outflow in the horizon year).
  averageWaitTimeMonths?: number;
  baseAverageWaitTimeMonths?: number;
  waitTimeReductionMonths?: number;
  waitTimeReductionPct?: number;
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

  // Wait-time formatters. Display months when < 24, otherwise years (it's
  // easier to read "5.4 yrs" than "65 months"). NaN renders as "—".
  const fmtDuration = (months: number | undefined): string => {
    if (months === undefined || !Number.isFinite(months)) return '—';
    if (Math.abs(months) >= 24) return `${(months / 12).toFixed(1)} yrs`;
    return `${months.toFixed(1)} mo`;
  };
  const fmtSignedDuration = (months: number | undefined): string => {
    if (months === undefined || !Number.isFinite(months)) return '—';
    const sign = months > 0 ? '−' : months < 0 ? '+' : '';
    const abs = Math.abs(months);
    if (abs >= 24) return `${sign}${(abs / 12).toFixed(1)} yrs`;
    return `${sign}${abs.toFixed(1)} mo`;
  };
  const fmtSignedPct = (pct: number | undefined): string => {
    if (pct === undefined || !Number.isFinite(pct)) return '';
    const sign = pct > 0 ? '−' : pct < 0 ? '+' : '';
    return ` (${sign}${Math.abs(pct).toFixed(0)}%)`;
  };
  const avgWait = metrics.averageWaitTimeMonths;
  const baseAvgWait = metrics.baseAverageWaitTimeMonths;
  const waitReduction = metrics.waitTimeReductionMonths;
  const waitReductionPct = metrics.waitTimeReductionPct;
  const hasWaitData = avgWait !== undefined && Number.isFinite(avgWait);
  const hasReductionData = waitReduction !== undefined && Number.isFinite(waitReduction);

  // Throughput math. metrics.xenoTransplants is already horizon-sliced by
  // calculateSummaryMetrics (it interpolates the cumulative procedure
  // series at horizon*365 days), so dividing by horizon gives the average
  // realized procedure rate. We keep the raw fractional value for ratio
  // arithmetic and only round on display.
  //
  // TERMINOLOGY: in the simulator a `transplant_xeno` event simultaneously
  // (a) consumes one xenokidney and (b) is one procedure. There is no
  // separate "kidney inventory" stock. We therefore use a single noun
  // ("procedures") on both sides of the card to avoid the prior
  // "kidneys vs procedures" mismatch.
  const xenoActualPerYearRaw = horizon > 0 ? metrics.xenoTransplants / horizon : 0;
  const xenoActualPerYear = Math.round(xenoActualPerYearRaw);
  const intendedTotal = xenoIntendedPerYear * horizon;
  // Use the un-rounded series total directly (horizon-sliced upstream) so
  // the cumulative subtitle matches the cumulative procedure-count series
  // exactly, not a re-multiplied-out approximation.
  const allocatedTotal = Math.round(metrics.xenoTransplants);
  // Use a 2% tolerance so Monte Carlo noise around the linear regime doesn't
  // accidentally flag "saturation" or "recycling" when actual ≈ intended.
  const SATURATION_TOLERANCE = 0.02;
  const actualExceedsIntended =
    xenoIntendedPerYear > 0 &&
    xenoActualPerYearRaw > xenoIntendedPerYear * (1 + SATURATION_TOLERANCE);
  const supplyExceedsActual =
    xenoIntendedPerYear > 0 &&
    xenoActualPerYearRaw < xenoIntendedPerYear * (1 - SATURATION_TOLERANCE);
  const unusedPerYear = supplyExceedsActual
    ? Math.max(0, xenoIntendedPerYear - xenoActualPerYearRaw)
    : 0;
  const unusedTotal = Math.round(unusedPerYear * horizon);
  const recyclingExtraPerYear = actualExceedsIntended
    ? Math.max(0, xenoActualPerYearRaw - xenoIntendedPerYear)
    : 0;
  const recyclingExtraTotal = Math.round(recyclingExtraPerYear * horizon);
  // Utilization = realized / intended. 100% = supply fully absorbed,
  // <100% = saturation (eligible pool drained), >100% = recycling (graft
  // failure → relist → re-transplant inflates throughput above intended).
  const utilizationPct =
    xenoIntendedPerYear > 0
      ? (xenoActualPerYearRaw / xenoIntendedPerYear) * 100
      : 0;

  // Regime-aware status badge for the card header. Replaces the prior
  // unconditional green-up arrow that fired for any non-zero procedure
  // count, even when saturation meant the model was under-delivering vs
  // intended supply.
  const statusBadge = (() => {
    if (xenoIntendedPerYear <= 0) {
      return {
        icon: <Minus className="w-4 h-4 text-muted-foreground" />,
        label: 'No xeno supply',
      };
    }
    if (supplyExceedsActual) {
      return {
        icon: <AlertTriangle className="w-4 h-4 text-warning" />,
        label: `Saturated · ${utilizationPct.toFixed(0)}% utilization`,
      };
    }
    if (actualExceedsIntended) {
      return {
        icon: <Repeat className="w-4 h-4 text-primary" />,
        label: `Recycling · ${utilizationPct.toFixed(0)}% throughput`,
      };
    }
    return {
      icon: <CheckCircle2 className="w-4 h-4 text-success" />,
      label: 'Supply matched',
    };
  })();

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
      subtitle: `Cumulative procedures (human + xeno) over ${horizon} years`,
      color: 'text-chart-secondary'
    },
  ];

  return (
    <div className="space-y-4">
      {/* Xeno Throughput Card - full width.
          Option B redesign: both columns use the SAME noun ("procedures")
          and the SAME time base (per-year + cumulative subtitle) so they
          can be compared at a glance. The header status badge reflects the
          three saturation regimes (matched / saturated / recycling) rather
          than a generic up-arrow that was misleading under saturation. */}
      <Card className="bg-card shadow-[var(--shadow-soft)] border-medical-border hover:shadow-[var(--shadow-medium)] transition-shadow duration-200">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-chart-quaternary" />
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Xeno Throughput
              </p>
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="About xeno throughput metrics"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Info className="w-3.5 h-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
                    In this model, one xenotransplant event consumes one
                    xenokidney and is one procedure — they are the same
                    physical thing. "Intended" is the supply rate the
                    scenario would produce if the eligible waitlist were
                    always populated; "Delivered" is the procedures the
                    simulator actually performed. The two differ when the
                    eligible pool drains (saturation) or when graft failure
                    causes repeat transplants (recycling).
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex items-center gap-1.5">
              {statusBadge.icon}
              <span className="text-xs text-muted-foreground">{statusBadge.label}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Intended supply</p>
              <p className="text-xl font-bold text-chart-quaternary">
                {formatNumber(xenoIntendedPerYear)}
                <span className="text-sm font-normal text-muted-foreground"> procedures / yr</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {xenoIntendedPerYear > 0
                  ? `${formatNumber(intendedTotal)} offered over ${horizon} years`
                  : 'No xeno supply in this scenario'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Delivered (simulated)</p>
              <p className="text-xl font-bold text-chart-quaternary">
                {formatNumber(xenoActualPerYear)}
                <span className="text-sm font-normal text-muted-foreground"> procedures / yr avg</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {formatNumber(allocatedTotal)} performed over {horizon} years
              </p>
            </div>
          </div>

          {/* Single status row covering all three regimes. Always shown
              when there's any xeno supply so the supply↔delivery ratio is
              never ambiguous. */}
          {xenoIntendedPerYear > 0 && (
            <div className="mt-3 pt-3 border-t border-medical-border">
              {supplyExceedsActual && (
                <div className="flex items-start gap-3 p-3 rounded-md bg-warning/10 border border-warning/30">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-warning" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      Utilization {utilizationPct.toFixed(0)}%
                      <span className="text-xs font-normal text-muted-foreground">
                        {' '}· {formatNumber(unusedTotal)} procedures unused over {horizon} years
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      The eligible waitlist drained faster than supply could be absorbed,
                      so {formatNumber(Math.round(unusedPerYear))} procedures/year of intended
                      supply had no candidate to transplant into. The realized count is
                      bounded by patient arrivals, not by supply.
                    </p>
                  </div>
                </div>
              )}

              {actualExceedsIntended && (
                <div className="flex items-start gap-3 p-3 rounded-md bg-primary/10 border border-primary/30">
                  <Repeat className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      Recycling +{(utilizationPct - 100).toFixed(0)}%
                      <span className="text-xs font-normal text-muted-foreground">
                        {' '}· {formatNumber(recyclingExtraTotal)} extra procedures over {horizon} years
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Delivered exceeds intended because xeno graft failures send patients
                      back to the waitlist, where they receive repeat xenotransplants.
                      Each repeat consumes another xenokidney in the model.
                    </p>
                  </div>
                </div>
              )}

              {!supplyExceedsActual && !actualExceedsIntended && (
                <div className="flex items-start gap-2 text-xs text-muted-foreground leading-relaxed">
                  <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-success" />
                  <span>
                    Supply is fully absorbed (utilization ≈ {utilizationPct.toFixed(0)}%):
                    the eligible waitlist sustains the intended supply rate without
                    significant saturation or recycling.
                  </span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Wait-time row — promoted to a primary metric per clinical feedback.
          Xeno's value-add is largely as a bridge / waitlist-pressure relief
          mechanism, so "how long do patients wait?" is the most intuitive
          outcome. Numbers are an analytic estimate from Little's Law
          (W = L / outflow) computed at year {horizon}. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-card shadow-[var(--shadow-soft)] border-medical-border hover:shadow-[var(--shadow-medium)] transition-shadow duration-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Hourglass className="w-5 h-5 text-primary" />
              {getTrendIcon(hasReductionData && waitReduction! > 0 ? 1 : hasReductionData && waitReduction! < 0 ? -1 : 0)}
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Average Wait Time
              </p>
              <p className="text-xl font-bold text-primary">
                {fmtDuration(avgWait)}
              </p>
              <p className="text-xs text-muted-foreground">
                {hasWaitData
                  ? `At year ${horizon} in the xeno scenario (Little's Law estimate)`
                  : 'Insufficient outflow at horizon — wait time undefined'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card shadow-[var(--shadow-soft)] border-medical-border hover:shadow-[var(--shadow-medium)] transition-shadow duration-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Clock className="w-5 h-5 text-success" />
              {getTrendIcon(hasReductionData && waitReduction! > 0 ? 1 : hasReductionData && waitReduction! < 0 ? -1 : 0)}
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Wait Time Reduction
              </p>
              <p className="text-xl font-bold text-success">
                {fmtSignedDuration(waitReduction)}
                <span className="text-sm font-normal text-muted-foreground">
                  {hasReductionData ? fmtSignedPct(waitReductionPct) : ''}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                {hasReductionData
                  ? `vs. base case ${fmtDuration(baseAvgWait)} at year ${horizon}`
                  : 'Base case unavailable for comparison'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

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