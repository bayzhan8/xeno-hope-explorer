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
  waitlistReductionFromViz,
  waitTimeReductionFromViz,
} from '@/utils/pareto';
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
    xeno_proportion: 1,
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
        threshold: params.highCPRAThreshold,
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
            xeno_proportion: params.xeno_proportion,
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
          { xeno_proportion: 0, postTransplantDeathRate: 1.0 },
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
    params.xeno_proportion,
    params.survivalMonths,
    params.simulationHorizon,
    params.highCPRAThreshold,
    params.targetingStrategy,
    params.postTransplantDeathRate,
  ]);

  // ── Pareto: xeno supply (kidneys/year) vs lives saved ────────────────
  // Sweep xeno_proportion ∈ {0.5, 1, 1.5, 2, 3, 4} at the user's currently-
  // selected survival/threshold/strategy. We deliberately omit prop=0 from
  // the curve because at prop=0 the answer is trivially 0 lives saved.
  // The 3× and 4× points are extra-wide so the curve's saturation point is
  // visible: at the 99 % threshold the patient pool is small enough that
  // 2× already consumes ~99.6 % of supply, so without 3-4× the chart can
  // never show the asymptote where extra supply stops adding lives.
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
            // 0.5 → 4× spans the supply Pareto over an order of
            // magnitude (the bridge MC sweep uploaded all 6 points).
            // Overlay-off renders kidneys/yr on x; overlay-on switches
            // to multiplier so curves with different baseRates align.
            //
            // Pin the current death-multiplier so every point on the
            // curve reflects the user's mortality assumption.
            points: [0.5, 1, 1.5, 2, 3, 4].map((p) => ({
              label: overlay === 'off'
                ? `${Math.round(baseRate * p).toLocaleString()}/yr`
                : `${p}×`,
              x: overlay === 'off' ? Math.round(baseRate * p) : p,
              xeno_proportion: p,
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
      if (params.xeno_proportion === 0) {
        if (!cancelled) {
          setSurvivalSeries([]);
          setSurvivalLoading(false);
        }
        return;
      }
      try {
        const tasks = subgroups.map(async (sg) => {
          const ds = await loadParetoDataset({
            mode: 'bridge',
            highCPRAThreshold: sg.threshold,
            strategy: sg.strategy,
            targetYear: params.simulationHorizon,
            metric: waitlistReductionFromViz,
            // x is months — comparable across all subgroups, no axis switch needed.
            // Pin the current death-multiplier so every point on the
            // curve reflects the user's mortality assumption.
            points: BRIDGE_SURVIVAL_MONTHS.map((m): {
              label: string;
              x: number;
              xeno_proportion: number;
              surv: BridgeSurvivalMonths;
              postTransplantDeathRate: number;
            } => ({
              label: m % 12 === 0 ? `${m / 12} yr` : `${m} mo`,
              x: m,
              xeno_proportion: params.xeno_proportion,
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
    params.xeno_proportion,
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
      if (params.xeno_proportion === 0) {
        if (!cancelled) {
          setWaitTimeSeries([]);
          setWaitTimeLoading(false);
        }
        return;
      }
      try {
        const tasks = subgroups.map(async (sg) => {
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
              xeno_proportion: number;
              surv: BridgeSurvivalMonths;
              postTransplantDeathRate: number;
            } => ({
              label: m % 12 === 0 ? `${m / 12} yr` : `${m} mo`,
              x: m,
              xeno_proportion: params.xeno_proportion,
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
    params.xeno_proportion,
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
                <p className="text-sm text-muted-foreground leading-relaxed">
                  In Bridge Therapy, xenotransplants are temporary — each one
                  keeps a high-cPRA patient alive for a known mean duration
                  (your choice from 6&nbsp;mo to 3&nbsp;yr), after which the
                  patient typically returns to the waitlist for a permanent
                  human transplant. The <em>central</em> lever is
                  &ldquo;mortality while bridged&rdquo;: relative to the
                  human-kidney post-tx baseline, is xeno support better,
                  equivalent, or worse, and how does that compare with
                  dialysis mortality on the waitlist? The mortality panel
                  shows that comparison directly; the Pareto curves below
                  then show how supply and graft survival convert into lives
                  saved, waitlist reduction, and wait-time reduction at the
                  selected mortality assumption.
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
                      Impact metrics over {params.simulationHorizon}-year simulation horizon
                    </p>
                  </div>
                  <SummaryMetrics
                    metrics={metrics}
                    horizon={params.simulationHorizon}
                    xenoIntendedPerYear={Math.round(xenoBaseRate * params.xeno_proportion)}
                  />
                </div>

                <div>
                  <div className="mb-6 pb-4 border-b border-medical-border">
                    <h2 className="text-2xl font-bold text-primary mb-2 tracking-tight">
                      Mortality at a Glance
                    </h2>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Where does &ldquo;mortality while bridged&rdquo; sit
                      relative to the alternatives (dialysis on the
                      waitlist; living with a definitive human allokidney)?
                      This is the bridge's central scientific claim — every
                      downstream metric (lives saved, waitlist size, wait
                      time) is a consequence of how this comparison resolves
                      at your selected mortality multiplier.
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
                      Wait Time on the List
                    </h2>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Average time a candidate spends on the waitlist <em>per list-spell</em>,
                      estimated each year via Little's Law (W = L / λ_out). Outflow includes
                      transplants, waitlist deaths, and waitlist removals. Bridge patients
                      may have multiple spells if their xenograft fails — this measures each
                      spell, not lifetime waiting. The dip-and-plateau you may see in waitlist
                      size (patients cycling back after graft failure) shows up here as a{' '}
                      <em>sustained</em> reduction in per-spell wait time, because xeno
                      throughput stays elevated. Exact in steady state, approximate during
                      transients (especially years 1–5). Toggle cPRA group or age cohort to
                      see who benefits most.
                    </p>
                  </div>
                  <WaitTimeChart
                    data={simulationData.waitingTimeData}
                    dataByAge={simulationData.waitingTimeDataByAge}
                    highCPRAThreshold={params.highCPRAThreshold}
                    simulationHorizon={params.simulationHorizon}
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
                    xenoProportion={params.xeno_proportion}
                    xenoIntendedPerYear={Math.round(xenoBaseRate * params.xeno_proportion)}
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
                  How additional xeno supply and longer graft survival convert
                  to lives saved, waitlist reduction, and wait-time reduction
                  at year {params.simulationHorizon}. Use the toolbar to
                  overlay subgroups (cPRA thresholds or allocation strategies)
                  on the same axes, and to switch between cumulative and
                  per-step marginal views.
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
                          Sweeps {[0.5, 1, 1.5, 2, 3, 4]
                            .map((m) => `${Math.round(xenoBaseRate * m).toLocaleString()}/yr`)
                            .join(' · ')}{' '}
                          at {params.survivalMonths}-mo bridge,{' '}
                          {params.highCPRAThreshold}%+ cPRA, strategy ={' '}
                          {params.targetingStrategy ?? 'standard'}
                        </>
                      ) : (
                        <>
                          Sweeps {[0.5, 1, 1.5, 2, 3, 4].map((m) => `${m}×`).join(' · ')}{' '}
                          supply at {params.survivalMonths}-mo bridge.{' '}
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
                        : (v) => `${v}×`}
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
                      {Math.round(xenoBaseRate * params.xeno_proportion).toLocaleString()}/yr
                      ({params.xeno_proportion}× supply).{' '}
                      {overlay === 'off'
                        ? `${params.highCPRAThreshold}%+ cPRA, strategy = ${params.targetingStrategy ?? 'standard'}`
                        : overlay === 'thresholds'
                          ? 'One curve per cPRA threshold.'
                          : 'One curve per allocation strategy.'}
                    </p>
                  </CardHeader>
                  <CardContent>
                    {params.xeno_proportion === 0 ? (
                      <div
                        className="flex items-center justify-center text-sm text-muted-foreground italic"
                        style={{ height: 320 }}
                      >
                        Set xeno proportion &gt; 0 to see how graft survival affects the waitlist.
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
                      survival sweep at {Math.round(xenoBaseRate * params.xeno_proportion).toLocaleString()}/yr
                      ({params.xeno_proportion}× supply). y = months saved per list-spell at year{' '}
                      {params.simulationHorizon} (Little's Law).
                    </p>
                  </CardHeader>
                  <CardContent>
                    {params.xeno_proportion === 0 ? (
                      <div
                        className="flex items-center justify-center text-sm text-muted-foreground italic"
                        style={{ height: 320 }}
                      >
                        Set xeno proportion &gt; 0 to see how graft survival affects wait time.
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
