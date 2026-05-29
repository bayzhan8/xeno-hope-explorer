/**
 * Bridge Therapy page.
 *
 * Mirrors `Index.tsx` (Replacement Therapy) but:
 *   - Uses `BridgeControls` with the 5-button graft-survival picker.
 *   - Loads viz JSONs from the bridge prefixes (mode='bridge').
 *   - Hardcodes relisting/death multipliers to 1.0 because the bridge
 *     input pickle bakes per-age survival directly into the rates.
 *   - Renders two extra Pareto charts (xeno supply ↔ lives saved, and
 *     graft survival ↔ waitlist reduction at end of horizon).
 */
import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, Beaker, Loader2, Hourglass, TrendingDown } from 'lucide-react';

import BridgeControls, { type BridgeParams } from '@/components/BridgeControls';
import SimulationCharts from '@/components/SimulationCharts';
import SummaryMetrics from '@/components/SummaryMetrics';
import ParetoChart, { type ParetoSeries } from '@/components/ParetoChart';
import SegmentedControl from '@/components/SegmentedControl';
import ModeNav from '@/components/ModeNav';
import WaitTimeChart from '@/components/WaitTimeChart';
import MortalityComparison from '@/components/MortalityComparison';
import DialysisBurden from '@/components/DialysisBurden';

import {
  composeConfigName,
  loadVisualizationData,
  BRIDGE_SURVIVAL_MONTHS,
  type BridgeSurvivalMonths,
} from '@/utils/configFinder';
import {
  transformVizDataToSimulationData,
  calculateSummaryMetrics,
  getXenoBaseRate,
} from '@/utils/dataTransformer';
import {
  loadParetoDataset,
  livesSavedFromViz,
  livesSavedCIHalfWidth,
  waitlistReductionFromViz,
  waitlistReductionCIHalfWidth,
  waitTimeReductionFromViz,
} from '@/utils/pareto';
import { nonZeroSupplyPoints, effectiveThreshold, nearestSupplyPoint } from '@/utils/supplyGrid';
import {
  type OverlayMode,
  type ParetoView,
  THRESHOLDS,
  THRESHOLD_PALETTE,
  THRESHOLD_LABEL,
  STRATEGIES,
  STRATEGY_PALETTE,
  STRATEGY_LABEL,
  type ThresholdValue,
  type StrategyValue,
} from '@/components/paretoOverlay';

const Bridge: React.FC = () => {
  const [params, setParams] = useState<BridgeParams>({
    survivalMonths: 12,
    postTransplantDeathRate: 1.0,
    simulationHorizon: 10,
    xeno_n: 1000, // kidneys/yr — present in every (strategy, threshold) grid cell
    highCPRAThreshold: 95,
    targetingStrategy: 'standard',
  });

  const [simulationData, setSimulationData] = useState<ReturnType<
    typeof transformVizDataToSimulationData
  > | null>(null);
  const [metrics, setMetrics] = useState<ReturnType<typeof calculateSummaryMetrics> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pareto toolbar state. Defaults match the previous UI (overlay off,
  // cumulative view) so the page renders identically until the user
  // opts into the new modes.
  const [overlay, setOverlay] = useState<OverlayMode>('off');
  const [view, setView] = useState<ParetoView>('cumulative');

  // Pareto state — separate so the main chart load doesn't block them
  // and vice-versa. Each card now owns an array of ParetoSeries (one
  // entry per subgroup; length 1 when overlay is off).
  const [supplySeries, setSupplySeries] = useState<ParetoSeries[] | null>(null);
  const [supplyLoading, setSupplyLoading] = useState(true);
  const [supplyError, setSupplyError] = useState<string | null>(null);

  const [survivalSeries, setSurvivalSeries] = useState<ParetoSeries[] | null>(null);
  const [survivalLoading, setSurvivalLoading] = useState(true);
  const [survivalError, setSurvivalError] = useState<string | null>(null);

  const [waitTimeSeries, setWaitTimeSeries] = useState<ParetoSeries[] | null>(null);
  const [waitTimeLoading, setWaitTimeLoading] = useState(true);
  const [waitTimeError, setWaitTimeError] = useState<string | null>(null);

  // Build the subgroup list for the current overlay setting. Each entry
  // becomes one curve on every Pareto card. "off" returns a single
  // pinned-to-current-selection entry so the rest of the loading code
  // can treat all three modes uniformly.
  type Subgroup =
    | { kind: 'fixed'; threshold: number; strategy: string; label: string; color: string }
    | { kind: 'threshold'; threshold: ThresholdValue; strategy: string; label: string; color: string }
    | { kind: 'strategy'; threshold: number; strategy: StrategyValue; label: string; color: string };

  const subgroups: Subgroup[] = useMemo(() => {
    const strategy = params.targetingStrategy || 'standard';
    if (overlay === 'thresholds') {
      return THRESHOLDS.map((t) => ({
        kind: 'threshold' as const,
        threshold: t,
        strategy,
        label: THRESHOLD_LABEL[t],
        color: THRESHOLD_PALETTE[t],
      }));
    }
    if (overlay === 'strategies') {
      return STRATEGIES.map((s) => ({
        kind: 'strategy' as const,
        // cpraAll strategies only have data at 99 — pin them there so their
        // curve loads instead of 404ing against an 85/95 folder.
        threshold: effectiveThreshold(s, params.highCPRAThreshold),
        strategy: s,
        label: STRATEGY_LABEL[s],
        color: STRATEGY_PALETTE[s],
      }));
    }
    const color =
      THRESHOLD_PALETTE[params.highCPRAThreshold as ThresholdValue] ?? '#2563eb';
    return [
      {
        kind: 'fixed' as const,
        threshold: params.highCPRAThreshold,
        strategy,
        label: 'Curve',
        color,
      },
    ];
  }, [overlay, params.highCPRAThreshold, params.targetingStrategy]);

  // ── Main viz load (matches Index.tsx flow) ────────────────────────────
  useEffect(() => {
    let cancelled = false;
    // Clear the previous metrics + simulation data the moment params
    // change so that, while the new viz JSON is in flight, the Key
    // Outcomes Summary doesn't keep flashing the previous threshold's
    // Lives-Saved / Waitlist-Reduction numbers next to a header that
    // already says "99 %+".
    setSimulationData(null);
    setMetrics(null);
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const strategy = params.targetingStrategy || 'standard';
        const configName = composeConfigName(
          'bridge',
          {
            xeno_n: params.xeno_n,
            postTransplantDeathRate: params.postTransplantDeathRate,
          },
          strategy,
        );
        // Base case: prop=0 holds at the canonical 1.0× death so the
        // "lives saved vs. baseline" comparison is anchored at a single
        // counterfactual regardless of which mortality multiplier the
        // user has selected.
        const baseConfigName = composeConfigName(
          'bridge',
          { xeno_n: 0, postTransplantDeathRate: 1.0 },
          strategy,
        );

        const vizData = await loadVisualizationData(
          configName,
          params.highCPRAThreshold,
          strategy,
          { mode: 'bridge', surv: params.survivalMonths },
        );

        let baseVizData = null;
        try {
          baseVizData = await loadVisualizationData(
            baseConfigName,
            params.highCPRAThreshold,
            strategy,
            { mode: 'bridge', surv: params.survivalMonths },
          );
        } catch (err) {
          console.warn(
            `[Bridge] could not load base case (${baseConfigName}) for comparison:`,
            err,
          );
        }

        if (cancelled) return;

        const transformed = transformVizDataToSimulationData(
          { ...vizData, highCPRAThreshold: params.highCPRAThreshold },
          baseVizData,
        );
        setSimulationData(transformed);
        setMetrics(calculateSummaryMetrics(transformed, params.simulationHorizon));
      } catch (err) {
        if (cancelled) return;
        console.error('[Bridge] error loading viz:', err);
        setError(err instanceof Error ? err.message : 'Failed to load visualization data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadData();
    return () => {
      cancelled = true;
    };
  }, [
    params.xeno_n,
    params.survivalMonths,
    params.simulationHorizon,
    params.highCPRAThreshold,
    params.targetingStrategy,
    params.postTransplantDeathRate,
  ]);

  // ── Pareto: xeno supply (kidneys/year) vs lives saved ────────────────
  // Sweep each subgroup's absolute supply grid (from supply_grid) at the
  // user's currently-selected survival/threshold/strategy. N=0 is omitted
  // because the answer there is trivially 0 lives saved. The grid's
  // wide upper points expose the saturation asymptote where extra supply
  // stops adding lives.
  const xenoBaseRate = useMemo(
    () => getXenoBaseRate(params.targetingStrategy || 'standard', params.highCPRAThreshold),
    [params.targetingStrategy, params.highCPRAThreshold],
  );

  useEffect(() => {
    let cancelled = false;
    setSupplySeries(null);
    async function loadSupply() {
      setSupplyLoading(true);
      setSupplyError(null);
      try {
        const tasks = subgroups.map(async (sg) => {
          const baseRate = getXenoBaseRate(sg.strategy, sg.threshold);
          const ds = await loadParetoDataset({
            mode: 'bridge',
            highCPRAThreshold: sg.threshold,
            strategy: sg.strategy,
            targetYear: params.simulationHorizon,
            metric: livesSavedFromViz,
            metricCI: livesSavedCIHalfWidth,
            // Each subgroup sweeps its own absolute kidneys/yr grid.
            // Overlay-off renders kidneys/yr on x; overlay-on switches to
            // N/baseRate so curves with different baseRates align.
            //
            // Pin the current death-multiplier so every point on the
            // curve reflects the user's mortality assumption.
            points: nonZeroSupplyPoints(sg.strategy, sg.threshold).map((n) => ({
              label: overlay === 'off'
                ? `${n.toLocaleString()}/yr`
                : `${(baseRate > 0 ? n / baseRate : 0).toFixed(1)}×`,
              x: overlay === 'off' ? n : (baseRate > 0 ? n / baseRate : 0),
              xeno_n: n,
              surv: params.survivalMonths,
              postTransplantDeathRate: params.postTransplantDeathRate,
            })),
          });
          if (ds.points.length === 0) return null;
          return { dataset: ds, label: sg.label, color: sg.color };
        });
        const settled = (await Promise.all(tasks)).filter(
          (s): s is ParetoSeries => s !== null,
        );
        if (!cancelled) setSupplySeries(settled);
      } catch (err) {
        if (!cancelled) {
          console.error('[Bridge:supply Pareto] failed:', err);
          setSupplyError(err instanceof Error ? err.message : 'Could not build supply curve');
        }
      } finally {
        if (!cancelled) setSupplyLoading(false);
      }
    }
    loadSupply();
    return () => {
      cancelled = true;
    };
  }, [
    subgroups,
    overlay,
    params.survivalMonths,
    params.simulationHorizon,
    params.postTransplantDeathRate,
  ]);

  // ── Pareto: graft survival (months) vs waitlist reduction ────────────
  // Sweep survivalMonths ∈ {6, 12, 18, 24, 36} at the user's currently-
  // selected proportion/threshold/strategy. If proportion is 0 there's
  // nothing to plot so we surface a friendly message instead.
  useEffect(() => {
    let cancelled = false;
    setSurvivalSeries(null);
    async function loadSurvival() {
      setSurvivalLoading(true);
      setSurvivalError(null);
      if (params.xeno_n === 0) {
        if (!cancelled) {
          setSurvivalSeries([]);
          setSurvivalLoading(false);
        }
        return;
      }
      try {
        const tasks = subgroups.map(async (sg) => {
          // Each subgroup's supply grid differs (e.g. 85% has 3,000/5,000 but
          // not 4,000). Snap the user's selected N to this subgroup's nearest
          // valid grid point so the overlaid line actually has data instead of
          // 404ing and silently disappearing.
          const sgN = nearestSupplyPoint(sg.strategy, sg.threshold, params.xeno_n);
          const ds = await loadParetoDataset({
            mode: 'bridge',
            highCPRAThreshold: sg.threshold,
            strategy: sg.strategy,
            targetYear: params.simulationHorizon,
            metric: waitlistReductionFromViz,
            metricCI: waitlistReductionCIHalfWidth,
            // x is months — comparable across all subgroups, no axis switch needed.
            // Pin the current death-multiplier so every point on the
            // curve reflects the user's mortality assumption.
            points: BRIDGE_SURVIVAL_MONTHS.map((m): {
              label: string;
              x: number;
              xeno_n: number;
              surv: BridgeSurvivalMonths;
              postTransplantDeathRate: number;
            } => ({
              label: m % 12 === 0 ? `${m / 12} yr` : `${m} mo`,
              x: m,
              xeno_n: sgN,
              surv: m,
              postTransplantDeathRate: params.postTransplantDeathRate,
            })),
          });
          if (ds.points.length === 0) return null;
          return { dataset: ds, label: sg.label, color: sg.color };
        });
        const settled = (await Promise.all(tasks)).filter(
          (s): s is ParetoSeries => s !== null,
        );
        if (!cancelled) setSurvivalSeries(settled);
      } catch (err) {
        if (!cancelled) {
          console.error('[Bridge:survival Pareto] failed:', err);
          setSurvivalError(err instanceof Error ? err.message : 'Could not build survival curve');
        }
      } finally {
        if (!cancelled) setSurvivalLoading(false);
      }
    }
    loadSurvival();
    return () => {
      cancelled = true;
    };
  }, [
    subgroups,
    params.xeno_n,
    params.simulationHorizon,
    params.postTransplantDeathRate,
  ]);

  // ── Pareto: graft survival ↔ wait-time reduction ─────────────────────
  // Same survival sweep as the waitlist-reduction card so the two
  // x-axes are identical and the curves can be read against each other.
  // y = months saved per list-spell at year H, computed via the shared
  // `waitTimeReductionFromViz` so the value at any point matches the
  // year-H value the user sees in the WaitTimeChart at the same
  // (xeno_proportion, survival, threshold, strategy).
  useEffect(() => {
    let cancelled = false;
    setWaitTimeSeries(null);
    async function loadWaitTime() {
      setWaitTimeLoading(true);
      setWaitTimeError(null);
      if (params.xeno_n === 0) {
        if (!cancelled) {
          setWaitTimeSeries([]);
          setWaitTimeLoading(false);
        }
        return;
      }
      try {
        const tasks = subgroups.map(async (sg) => {
          // Snap to this subgroup's nearest valid grid point (see the
          // waitlist-reduction sweep above) so e.g. the 85% line doesn't
          // vanish when the user picks an N that only exists on other grids.
          const sgN = nearestSupplyPoint(sg.strategy, sg.threshold, params.xeno_n);
          const ds = await loadParetoDataset({
            mode: 'bridge',
            highCPRAThreshold: sg.threshold,
            strategy: sg.strategy,
            targetYear: params.simulationHorizon,
            metric: (scen, base, target) =>
              waitTimeReductionFromViz(scen, base, target, sg.threshold),
            points: BRIDGE_SURVIVAL_MONTHS.map((m): {
              label: string;
              x: number;
              xeno_n: number;
              surv: BridgeSurvivalMonths;
              postTransplantDeathRate: number;
            } => ({
              label: m % 12 === 0 ? `${m / 12} yr` : `${m} mo`,
              x: m,
              xeno_n: sgN,
              surv: m,
              postTransplantDeathRate: params.postTransplantDeathRate,
            })),
          });
          if (ds.points.length === 0) return null;
          return { dataset: ds, label: sg.label, color: sg.color };
        });
        const settled = (await Promise.all(tasks)).filter(
          (s): s is ParetoSeries => s !== null,
        );
        if (!cancelled) setWaitTimeSeries(settled);
      } catch (err) {
        if (!cancelled) {
          console.error('[Bridge:waitTime Pareto] failed:', err);
          setWaitTimeError(
            err instanceof Error ? err.message : 'Could not build wait-time curve',
          );
        }
      } finally {
        if (!cancelled) setWaitTimeLoading(false);
      }
    }
    loadWaitTime();
    return () => {
      cancelled = true;
    };
  }, [
    subgroups,
    params.xeno_n,
    params.simulationHorizon,
    params.postTransplantDeathRate,
  ]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-medical-border bg-card/95 backdrop-blur-sm shadow-sm transition-shadow">
        <div className="container mx-auto px-4 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center justify-center w-12 h-12 bg-gradient-to-br from-primary to-primary/80 rounded-xl shadow-md">
                <Beaker className="w-7 h-7 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-primary tracking-tight">
                  Xeno Kidney Impact Simulator
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Bridge Therapy &middot; cPRA {params.highCPRAThreshold}%+ &middot;{' '}
                  {params.survivalMonths} mo mean graft survival &middot;{' '}
                  {params.postTransplantDeathRate.toFixed(1)}× bridge mortality
                </p>
              </div>
            </div>
            <div className="hidden md:flex items-center space-x-2 px-3 py-2 bg-muted/50 rounded-lg border border-medical-border">
              <Hourglass className="w-4 h-4 text-primary" />
              <span className="text-xs font-medium text-muted-foreground">
                CTMC Simulation Data &middot; Bridge Mode
              </span>
            </div>
          </div>
        </div>
      </header>

      <ModeNav />

      <main className="container mx-auto px-0 py-8">
        {/* Intro */}
        <Card className="bg-gradient-to-br from-medical-surface to-medical-surface/30 border-medical-border mb-8 shadow-md">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Activity className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-foreground mb-2">
                  About Bridge Therapy
                </h3>
                <p className="text-sm text-foreground leading-relaxed font-medium">
                  Bridge Therapy keeps high-cPRA patients alive and off
                  dialysis while they wait for a definitive human
                  allokidney. The xenokidney is <em>temporary support</em>,
                  not a replacement transplant: bridged patients remain
                  candidates for the same scarce human-kidney supply.
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed mt-3">
                  Each bridge graft keeps a patient alive for a known mean
                  duration (your choice from 6&nbsp;mo to 3&nbsp;yr), after
                  which they typically return to the waitlist. The{' '}
                  <em>central</em> lever is &ldquo;mortality while
                  bridged&rdquo;: relative to the post-allo baseline, is xeno
                  support better, equivalent, or worse, and how does that
                  compare with dialysis mortality on the waitlist? The
                  mortality panel shows that comparison directly; the Pareto
                  curves below then show how supply and graft survival
                  convert into lives saved, dialysis-burden reduction, and
                  survival-to-allotransplant at the selected mortality
                  assumption.
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed mt-3 border-t border-medical-border pt-3">
                  <strong>Different paradigm?</strong> If you want to model
                  xeno as a definitive transplant (recipient leaves the
                  waitlist permanently; primary effects are throughput and
                  queue size), switch to the <em>Replacement Therapy</em>{' '}
                  tab above.{' '}
                  <strong>Two reading frames here.</strong> System effects
                  (queue-wide: total wait, throughput, lives saved) vs.
                  treated-population effects (per bridged patient: time on
                  dialysis avoided, time on bridge, mortality while waiting).
                  With a fixed human-kidney supply the system-level wait
                  until a definitive transplant is approximately conserved;
                  the dialysis-time displacement is where bridge therapy
                  delivers most of its clinical value.{' '}
                  <strong>Modelling assumption.</strong> Every waitlisted
                  candidate (state <em>C</em>) is assumed to be on active
                  dialysis. Bridged patients (state H<sub>xeno</sub>) and
                  post-allo recipients (state H<sub>std</sub>) are off
                  dialysis.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
          {/* Controls Sidebar */}
          <div className="xl:col-span-1">
            <div className="xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto">
              <BridgeControls params={params} onParamsChange={setParams} />
            </div>
          </div>

          {/* Charts and Metrics */}
          <div className="xl:col-span-4 space-y-8 px-2">
            {loading && (
              <Card className="shadow-lg border-medical-border">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <div className="relative">
                    <Loader2 className="w-12 h-12 animate-spin text-primary" />
                    <div className="absolute inset-0 w-12 h-12 animate-ping rounded-full bg-primary/20"></div>
                  </div>
                  <p className="mt-6 text-base font-medium text-foreground">
                    Loading Bridge Therapy Data
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Fetching pre-computed scenario from the database…
                  </p>
                </CardContent>
              </Card>
            )}

            {error && (
              <Card className="bg-destructive/10 border-destructive shadow-lg">
                <CardContent className="p-8">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-12 h-12 rounded-full bg-destructive/20 flex items-center justify-center">
                      <Activity className="w-6 h-6 text-destructive" />
                    </div>
                    <div className="flex-1">
                      <p className="text-lg font-semibold text-destructive">Error Loading Data</p>
                      <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{error}</p>
                      <p className="text-xs text-muted-foreground mt-4">
                        Bridge Therapy data must be uploaded before this page renders. If the
                        backend sweep is still in progress, try again in a few minutes.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {!loading && !error && simulationData && metrics && (
              <>
                <div>
                  <div className="mb-6 pb-4 border-b border-medical-border">
                    <h2 className="text-2xl font-bold text-primary mb-2 tracking-tight">
                      Key Outcomes Summary
                    </h2>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Headline metrics over {params.simulationHorizon} years:
                      lives saved, dialysis-years avoided, and time on dialysis.
                      Throughput is shown below for reference, not as the goal.
                    </p>
                  </div>
                  <SummaryMetrics
                    metrics={metrics}
                    horizon={params.simulationHorizon}
                    xenoIntendedPerYear={params.xeno_n}
                  />
                </div>

                <div>
                  <div className="mb-6 pb-4 border-b border-medical-border">
                    <h2 className="text-2xl font-bold text-primary mb-2 tracking-tight">
                      Mortality at a Glance
                    </h2>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      How does mortality on a bridge compare with the
                      alternatives (dialysis, or a definitive human kidney)?
                      This is the bridge's central claim, and every other metric
                      follows from how it resolves at your chosen mortality
                      multiplier.
                    </p>
                  </div>
                  <MortalityComparison
                    highCPRAThreshold={params.highCPRAThreshold}
                    bridgeMultiplier={params.postTransplantDeathRate}
                  />
                </div>

                <div>
                  <div className="mb-6 pb-4 border-b border-medical-border">
                    <h2 className="text-2xl font-bold text-primary mb-2 tracking-tight">
                      Dialysis Burden Avoided
                    </h2>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      A bridge gets patients <em>off dialysis</em> even when the
                      human-kidney supply is unchanged. We total the
                      person-years of dialysis avoided versus the no-xeno base.
                      This is the quality-of-life benefit, separate from how many
                      transplants happen.
                    </p>
                  </div>
                  <DialysisBurden
                    metrics={simulationData.dialysisBurden}
                    horizonYears={params.simulationHorizon}
                  />
                </div>

                <div>
                  <div className="mb-6 pb-4 border-b border-medical-border">
                    <h2 className="text-2xl font-bold text-primary mb-2 tracking-tight">
                      Wait Time: Dialysis vs. Total
                    </h2>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      With human-kidney supply fixed, the <em>total</em> wait for
                      a definitive allokidney barely changes; what changes is its{' '}
                      <em>composition</em>. <strong>Time on dialysis</strong>{' '}
                      (headline) falls as patients spend their wait on a working
                      bridge instead. <strong>Total wait</strong> (dotted overlay)
                      stays roughly flat because bridged patients are still in the
                      queue.
                    </p>
                  </div>
                  <WaitTimeChart
                    data={simulationData.waitingTimeData}
                    dataByAge={simulationData.waitingTimeDataByAge}
                    highCPRAThreshold={params.highCPRAThreshold}
                    simulationHorizon={params.simulationHorizon}
                    therapyMode={simulationData.therapyMode}
                  />
                </div>

                <div>
                  <div className="mb-6 pb-4 border-b border-medical-border">
                    <h2 className="text-2xl font-bold text-primary mb-2 tracking-tight">
                      Population Dynamics & Outcomes
                    </h2>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Visualization of waitlist trends, transplant volumes, and mortality
                      impacts under your selected bridge configuration
                    </p>
                  </div>
                  <SimulationCharts
                    data={simulationData}
                    highCPRAThreshold={params.highCPRAThreshold}
                    simulationHorizon={params.simulationHorizon}
                    xenoBaseRate={xenoBaseRate}
                    xenoProportion={xenoBaseRate > 0 ? params.xeno_n / xenoBaseRate : 0}
                    xenoIntendedPerYear={params.xeno_n}
                    targetingStrategy={params.targetingStrategy || 'standard'}
                  />
                </div>
              </>
            )}

            {/* Pareto curves */}
            <div>
              <div className="mb-6 pb-4 border-b border-medical-border">
                <h2 className="text-2xl font-bold text-primary mb-2 tracking-tight flex items-center gap-2">
                  <TrendingDown className="w-6 h-6" />
                  Tradeoff Curves
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  How more xeno supply and longer graft survival translate into
                  lives saved, waitlist reduction, and wait-time reduction by
                  year {params.simulationHorizon}. Use the toolbar to overlay
                  cPRA groups or strategies on the same axes.
                </p>
              </div>

              {/* Toolbar: overlay + view selectors */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mb-4">
                <SegmentedControl<OverlayMode>
                  label="Overlay:"
                  ariaLabel="Subgroup overlay"
                  value={overlay}
                  onChange={setOverlay}
                  options={[
                    { value: 'off', label: 'Off' },
                    {
                      value: 'thresholds',
                      label: 'cPRA 85 / 95 / 99%+',
                      hint: 'Compare the same sweep across all three cPRA thresholds.',
                    },
                    {
                      value: 'strategies',
                      label: 'All 5 strategies',
                      hint: 'Compare the same sweep across all five allocation strategies.',
                    },
                  ]}
                />
                <SegmentedControl<ParetoView>
                  label="View:"
                  ariaLabel="Pareto view"
                  value={view}
                  onChange={setView}
                  options={[
                    {
                      value: 'cumulative',
                      label: 'Cumulative',
                      hint: 'Plot total y at each x.',
                    },
                    {
                      value: 'marginal',
                      label: 'Marginal',
                      hint: 'Plot per-step rate of return (Δy/Δx) so saturation/acceleration shows up directly.',
                    },
                  ]}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="border-medical-border shadow-md">
                  <CardHeader>
                    <CardTitle className="text-base font-semibold text-foreground">
                      Xeno supply &nbsp;↔&nbsp; Lives saved
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {overlay === 'off' ? (
                        <>
                          Sweeps the supply grid ({nonZeroSupplyPoints(
                            params.targetingStrategy ?? 'standard',
                            params.highCPRAThreshold,
                          )
                            .map((n) => `${n.toLocaleString()}/yr`)
                            .join(' · ')}){' '}
                          at {params.survivalMonths}-mo bridge,{' '}
                          {params.highCPRAThreshold}%+ cPRA, strategy ={' '}
                          {params.targetingStrategy ?? 'standard'}
                        </>
                      ) : (
                        <>
                          Sweeps each subgroup's supply grid at{' '}
                          {params.survivalMonths}-mo bridge.{' '}
                          {overlay === 'thresholds'
                            ? 'One curve per cPRA threshold.'
                            : 'One curve per allocation strategy.'}
                        </>
                      )}
                    </p>
                  </CardHeader>
                  <CardContent>
                    <ParetoChart
                      datasets={supplySeries}
                      loading={supplyLoading}
                      error={supplyError}
                      xLabel={overlay === 'off'
                        ? 'Xeno kidneys per year'
                        : 'Xeno supply (× base, comparable across subgroups)'}
                      yLabel={view === 'marginal'
                        ? 'Δ Lives saved per Δ supply'
                        : `Lives saved by year ${params.simulationHorizon}`}
                      formatX={overlay === 'off'
                        ? (v) => v.toLocaleString()
                        : (v) => `${v.toFixed(1)}×`}
                      formatY={(v) => v.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      view={view}
                    />
                  </CardContent>
                </Card>

                <Card className="border-medical-border shadow-md">
                  <CardHeader>
                    <CardTitle className="text-base font-semibold text-foreground">
                      Graft survival &nbsp;↔&nbsp; Waitlist reduction
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Sweeps 6 · 12 · 18 · 24 · 36 mo at{' '}
                      {params.xeno_n.toLocaleString()}/yr.{' '}
                      {overlay === 'off'
                        ? `${params.highCPRAThreshold}%+ cPRA, strategy = ${params.targetingStrategy ?? 'standard'}`
                        : overlay === 'thresholds'
                          ? 'One curve per cPRA threshold (snapped to each grid\u2019s nearest supply).'
                          : 'One curve per allocation strategy (snapped to each grid\u2019s nearest supply).'}
                    </p>
                  </CardHeader>
                  <CardContent>
                    {params.xeno_n === 0 ? (
                      <div
                        className="flex items-center justify-center text-sm text-muted-foreground italic"
                        style={{ height: 320 }}
                      >
                        Set xeno supply &gt; 0 to see how graft survival affects the waitlist.
                      </div>
                    ) : (
                      <ParetoChart
                        datasets={survivalSeries}
                        loading={survivalLoading}
                        error={survivalError}
                        xLabel="Mean graft survival (months)"
                        yLabel={view === 'marginal'
                          ? 'Δ Waitlist reduction per Δ months'
                          : `Waitlist reduction at year ${params.simulationHorizon}`}
                        formatX={(v) => `${v} mo`}
                        formatY={(v) =>
                          v.toLocaleString(undefined, { maximumFractionDigits: 0 })
                        }
                        view={view}
                      />
                    )}
                  </CardContent>
                </Card>

                <Card className="border-medical-border shadow-md">
                  <CardHeader>
                    <CardTitle className="text-base font-semibold text-foreground">
                      Graft survival &nbsp;↔&nbsp; Wait-time reduction
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Same {[6, 12, 18, 24, 36].map((m) => (m % 12 === 0 ? `${m / 12} yr` : `${m} mo`)).join(' · ')}{' '}
                      survival sweep at {params.xeno_n.toLocaleString()}/yr
                      {overlay === 'off' ? '' : ' (nearest grid point per subgroup)'}. y = months saved per patient at year{' '}
                      {params.simulationHorizon} (Little's Law).
                    </p>
                  </CardHeader>
                  <CardContent>
                    {params.xeno_n === 0 ? (
                      <div
                        className="flex items-center justify-center text-sm text-muted-foreground italic"
                        style={{ height: 320 }}
                      >
                        Set xeno supply &gt; 0 to see how graft survival affects wait time.
                      </div>
                    ) : (
                      <ParetoChart
                        datasets={waitTimeSeries}
                        loading={waitTimeLoading}
                        error={waitTimeError}
                        xLabel="Mean graft survival (months)"
                        yLabel={view === 'marginal'
                          ? 'Δ Wait-time reduction per Δ months (mo)'
                          : `Wait time reduction at year ${params.simulationHorizon} (mo)`}
                        formatX={(v) => `${v} mo`}
                        formatY={(v) => `${v.toFixed(1)} mo`}
                        view={view}
                      />
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Bridge;
