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
  Droplets,
  ArrowRightLeft,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface MetricSummary {
  waitlistReduction: number;
  deathsPrevented: number;
  // Honest lives-saved decomposition (base − scenario at the horizon).
  // `livesSavedTotal` nets the waitlist-death drop against the post-transplant
  // deaths a transplant introduces — the unbiased headline. The two parts let
  // the card show where the number comes from. All undefined when no base
  // scenario is loaded (then we fall back to the waitlist-only figure).
  livesSavedTotal?: number;
  livesSavedWaitlist?: number;
  postTxDeathsAdded?: number; // positive = extra deaths after transplant
  // Fewer patients leaving the waitlist via removal (a non-death exit: the
  // reason isn't tracked in the data — could be too sick, declined, moved,
  // condition improved, transferred). A separate exit from death (removal is
  // NOT a death); it explains why counted total deaths can look flat even
  // when xeno helps.
  removalsAvoided?: number;
  totalTransplants: number;
  xenoTransplants: number;
  penetrationRate: number;
  // Bridge Therapy: allokidneys delivered to bridged candidates over the
  // horizon. Zero / missing in Replacement mode. The therapyMode tag
  // tells the UI whether to surface this as a separate row.
  bridgeAlloTransplants?: number;
  therapyMode?: 'replacement' | 'bridge_v2';
  // Wait time (Little's Law estimate from waitlist size and outflows).
  // All in months. NaN signals "not available" (e.g. base case not loaded,
  // or no outflow in the horizon year).
  averageWaitTimeMonths?: number;
  baseAverageWaitTimeMonths?: number;
  waitTimeReductionMonths?: number;
  waitTimeReductionPct?: number;
  // Dialysis-only wait (W_C). In replacement mode equals the overall
  // wait by construction; in bridge mode it's the headline value.
  // Always emitted by calculateSummaryMetrics so paradigm-aware UI can
  // swap labels without branching its math.
  dialysisWaitMonths?: number;
  baseDialysisWaitMonths?: number;
  dialysisWaitReductionMonths?: number;
  dialysisWaitReductionPct?: number;
  // Cumulative person-years of dialysis avoided vs base case, plus the
  // per-bridge-recipient amortization (months) and a wall-clock HD-
  // session count. All undefined when there's no base scenario.
  dialysisYearsAvoided?: number;
  dialysisPerRecipientMonthsAvoided?: number;
  sessionsAvoided?: number;
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
  // Paradigm switch: in bridge mode the headline wait metric is "time
  // on dialysis" (W_C), not "wait until any transplant" (W). Both are
  // computed by the transformer; we just pick the paradigm-appropriate
  // one to surface in the summary. Replacement mode keeps the legacy
  // labels because W_C ≡ W there by construction.
  const isBridge = metrics.therapyMode === 'bridge_v2';
  const avgWait = isBridge
    ? metrics.dialysisWaitMonths
    : metrics.averageWaitTimeMonths;
  const baseAvgWait = isBridge
    ? metrics.baseDialysisWaitMonths
    : metrics.baseAverageWaitTimeMonths;
  const waitReduction = isBridge
    ? metrics.dialysisWaitReductionMonths
    : metrics.waitTimeReductionMonths;
  const waitReductionPct = isBridge
    ? metrics.dialysisWaitReductionPct
    : metrics.waitTimeReductionPct;
  const hasWaitData = avgWait !== undefined && Number.isFinite(avgWait);
  const hasReductionData = waitReduction !== undefined && Number.isFinite(waitReduction);
  // The displayed reduction must NOT be unconditionally green: under
  // saturation/recycling xeno can lengthen the wait (waitReduction < 0),
  // which the trend arrow already shows in red. Match the value color to the
  // direction so a worsening isn't painted as a win.
  const waitReductionColor = !hasReductionData
    ? 'text-muted-foreground'
    : (waitReduction as number) > 0
      ? 'text-success'
      : (waitReduction as number) < 0
        ? 'text-destructive'
        : 'text-muted-foreground';
  const waitLabel = isBridge ? 'Time on Dialysis' : 'Average Wait Time';
  const waitReductionLabel = isBridge ? 'Dialysis Time Saved' : 'Wait Time Reduction';
  const waitTooltip = isBridge
    ? `Typical time a patient spends on dialysis before a transplant (year ${horizon}). A bridge can lower this even when the total wait for a human kidney is unchanged.`
    : `Typical time a patient waits for a transplant (year ${horizon}).`;

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

  // Standard-metrics grid is paradigm-aware. Replacement leads with
  // queue-side metrics (waitlist reduction, throughput, lives); Bridge
  // leads with the treated-population channel (lives saved, dialysis-
  // years avoided, waitlist reduction). Total Transplants moves out of
  // the headline grid in bridge mode because the dedicated throughput
  // card already covers it — bridge therapy doesn't claim throughput
  // gains as its primary value.
  const fmtYears = (years: number): string => {
    if (!Number.isFinite(years)) return '—';
    if (Math.abs(years) >= 1000) return `${(years / 1000).toFixed(1)}k yr`;
    if (Math.abs(years) >= 10) return `${years.toFixed(0)} yr`;
    return `${years.toFixed(1)} yr`;
  };
  const dialysisYears = metrics.dialysisYearsAvoided;
  const hasDialysisBurden =
    dialysisYears !== undefined && Number.isFinite(dialysisYears);

  // ── Lives Saved (honest, total) ───────────────────────────────────────────
  // Headline = NET deaths avoided across every death type, not the
  // waitlist-only number (which always looks good because a transplant just
  // moves a patient from the waitlist bucket into the post-transplant bucket).
  // When no base case is loaded we can't net the buckets, so we fall back to
  // the waitlist-only figure and say so plainly.
  const fmtSignedCount = (n: number): string =>
    `${n >= 0 ? '+' : '−'}${formatNumber(Math.abs(n))}`;
  const hasLivesBreakdown =
    metrics.livesSavedTotal !== undefined && Number.isFinite(metrics.livesSavedTotal);
  const hasRemovals =
    metrics.removalsAvoided !== undefined && Number.isFinite(metrics.removalsAvoided);
  // Pure NET COUNTED deaths avoided (waitlist + post-tx). This hovers near 0
  // over long horizons — NOT because xeno fails, but because a transplant
  // DEFERS death (it empties the waitlist-death bucket but the recipient can
  // still die a post-tx death), and because the base case loses more patients
  // to waitlist REMOVAL (a non-death exit whose reason we don't track). We
  // keep this number visible in the subtitle for full transparency.
  const netDeathsAverted = hasLivesBreakdown ? metrics.livesSavedTotal! : undefined;
  // Headline = removal-adjusted outcomes avoided:
  //   (baseDeaths + baseRemovals) − (scenDeaths + scenRemovals)
  //   = netDeathsAverted + removalsAvoided.
  // By conservation (arrivals identical) this is the count of EXTRA patients
  // still alive and on the list (transplanted or still waiting) rather than
  // dead-or-removed. It strips the base-case removal bias that makes
  // net-deaths-alone read as ~0/negative. Falls back to the waitlist-only
  // figure when no base case is loaded (no breakdown).
  const livesSavedValue = hasLivesBreakdown
    ? netDeathsAverted! + (hasRemovals ? (metrics.removalsAvoided ?? 0) : 0)
    : metrics.deathsPrevented;
  const livesSavedColor =
    livesSavedValue > 0
      ? 'text-success'
      : livesSavedValue < 0
        ? 'text-destructive'
        : 'text-muted-foreground';
  const removalsClause = hasRemovals
    ? `, ${fmtSignedCount(metrics.removalsAvoided ?? 0)} fewer waitlist removals`
    : '';
  const livesSavedSubtitle = hasLivesBreakdown
    ? `Extra patients alive & on the list vs. base over ${horizon} yrs: ${fmtSignedCount(metrics.livesSavedWaitlist ?? 0)} waitlist deaths, ${fmtSignedCount(-(metrics.postTxDeathsAdded ?? 0))} post-transplant deaths${removalsClause}. Net deaths alone ≈ ${fmtSignedCount(netDeathsAverted ?? 0)} (a transplant defers death over this horizon); avoided waitlist removals (patients who left the list without a transplant) are also counted.`
    : 'Fewer deaths on the waitlist vs. base case (load a base case for the full deaths + removals netting)';
  const livesSavedMetric = {
    title: 'Lives Saved',
    value: formatNumber(livesSavedValue),
    icon: <Heart className={`w-5 h-5 ${livesSavedColor}`} />,
    trend: getTrendIcon(livesSavedValue),
    subtitle: livesSavedSubtitle,
    color: livesSavedColor,
  };

  const replacementStandardMetrics = [
    {
      title: 'Waitlist Reduction',
      value: formatNumber(metrics.waitlistReduction),
      icon: <Users className="w-5 h-5 text-primary" />,
      trend: getTrendIcon(metrics.waitlistReduction),
      subtitle: `Fewer patients waiting vs. base case at year ${horizon}`,
      color: 'text-primary',
    },
    livesSavedMetric,
    {
      title: 'Total Transplants',
      value: formatNumber(metrics.totalTransplants),
      icon: <Activity className="w-5 h-5 text-chart-secondary" />,
      trend: getTrendIcon(metrics.totalTransplants),
      subtitle: `Cumulative procedures (human + xeno) over ${horizon} years`,
      color: 'text-chart-secondary',
    },
  ];
  const bridgeStandardMetrics = [
    livesSavedMetric,
    {
      title: 'Dialysis-Years Avoided',
      value: hasDialysisBurden ? fmtYears(dialysisYears!) : '—',
      icon: <Droplets className="w-5 h-5 text-primary" />,
      trend: getTrendIcon(hasDialysisBurden && dialysisYears! > 0 ? 1 : 0),
      subtitle: hasDialysisBurden
        ? `Cumulative person-years off dialysis vs. base case`
        : 'Requires a base-case scenario for comparison',
      color: 'text-primary',
    },
    {
      title: 'Waitlist Reduction',
      value: formatNumber(metrics.waitlistReduction),
      icon: <Users className="w-5 h-5 text-chart-secondary" />,
      trend: getTrendIcon(metrics.waitlistReduction),
      subtitle: `Net change vs. base case at year ${horizon}`,
      color: 'text-chart-secondary',
    },
  ];
  const standardMetrics = isBridge
    ? bridgeStandardMetrics
    : replacementStandardMetrics;

  return (
    <div className="space-y-4">
      {/* Paradigm tagline — makes the conceptual framing visible at the
          top of the metrics so each number reads against the right
          backdrop (Task Group 7). */}
      <div
        className={`flex items-start gap-3 px-4 py-3 rounded-lg border text-xs leading-relaxed ${
          isBridge
            ? 'bg-amber-50 border-amber-200 text-amber-900'
            : 'bg-sky-50 border-sky-200 text-sky-900'
        }`}
      >
        {isBridge ? (
          <Hourglass className="w-4 h-4 mt-0.5 flex-shrink-0" />
        ) : (
          <ArrowRightLeft className="w-4 h-4 mt-0.5 flex-shrink-0" />
        )}
        <div>
          <span className="font-semibold">
            {isBridge ? 'Bridge Therapy paradigm.' : 'Replacement Therapy paradigm.'}
          </span>{' '}
          {isBridge
            ? 'Xenografts keep high-cPRA patients alive while they wait. Headline metrics: waitlist mortality, dialysis burden, survival to a definitive allokidney. Throughput is a side-effect, not the goal.'
            : 'Xenografts function as definitive transplants for high-cPRA patients. Headline metrics: throughput, waitlist size, total transplants. Wait time and mortality follow from queue dynamics.'}
        </div>
      </div>

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
                    xenokidney and is one procedure. They are the same
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

          {/* Bridge → Allo row. Only relevant in Bridge Therapy (v2)
              runs, where the simulator tracks how many bridged patients
              received a definitive human allokidney over the horizon.
              In Replacement Therapy this is always zero (the bridge
              isn't a candidate anymore once xenotransplanted), so the
              row is hidden to keep the card tight. */}
          {metrics.therapyMode === 'bridge_v2' && (
            <div className="mt-3 pt-3 border-t border-medical-border">
              <div className="flex items-start gap-3">
                <Activity className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">
                    Bridge → Allo · {formatNumber(Math.round(metrics.bridgeAlloTransplants ?? 0))}
                    <span className="text-xs font-normal text-muted-foreground">
                      {' '}· bridged candidates who reached a definitive human allokidney
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    These are a subset of the total human transplants performed
                    over {horizon} years. The bridge organ kept the candidate
                    alive on a functioning kidney long enough to receive a
                    permanent human allokidney from the shared supply.
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Wait-time row — promoted to a primary metric per clinical
          feedback. Xeno's value-add is largely as a bridge / waitlist-
          pressure relief mechanism, so "how long do patients wait?" is
          the most intuitive outcome.

          What we report: a single-year snapshot estimator of mean
          per-list-spell waiting via Little's Law, evaluated at the
          horizon year. Outflow includes transplants + waitlist deaths +
          waitlist removals (all four channels in the model). The
          metric is exact in steady state and approximate during
          transients; by the 20-yr horizon most configs have
          re-equilibrated. Per-spell, not lifetime — a patient with a
          short xeno graft who relists is counted as multiple spells. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-card shadow-[var(--shadow-soft)] border-medical-border hover:shadow-[var(--shadow-medium)] transition-shadow duration-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Hourglass className="w-5 h-5 text-primary" />
              <div className="flex items-center gap-1">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs leading-relaxed">
                      {waitTooltip}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                {getTrendIcon(hasReductionData && waitReduction! > 0 ? 1 : hasReductionData && waitReduction! < 0 ? -1 : 0)}
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {waitLabel}
              </p>
              <p className="text-xl font-bold text-primary">
                {fmtDuration(avgWait)}
              </p>
              <p className="text-xs text-muted-foreground">
                {hasWaitData
                  ? isBridge
                    ? `Typical time a patient spends on dialysis before a transplant (year ${horizon})`
                    : `Typical time a patient waits for a transplant (year ${horizon})`
                  : 'Not enough transplants at this point to estimate a wait'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card shadow-[var(--shadow-soft)] border-medical-border hover:shadow-[var(--shadow-medium)] transition-shadow duration-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Clock className="w-5 h-5 text-success" />
              <div className="flex items-center gap-1">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs leading-relaxed">
                      {isBridge
                        ? `Difference between base-case and xeno-scenario time-on-dialysis (W_C) at year ${horizon}, both estimated via Little's Law. Bridging shifts residence time off dialysis, so this drops even when the total wait (W = C + H_xeno) is conserved.`
                        : `Difference between base-case (no xeno) and xeno-scenario wait time at year ${horizon}, both estimated via Little's Law from the same outflow channels. The percentage is robust because both numerator and denominator move together.`}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                {getTrendIcon(hasReductionData && waitReduction! > 0 ? 1 : hasReductionData && waitReduction! < 0 ? -1 : 0)}
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {waitReductionLabel}
              </p>
              <p className={`text-xl font-bold ${waitReductionColor}`}>
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