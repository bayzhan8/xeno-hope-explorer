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
import WaitTimeChart from '@/components/WaitTimeChart';
import ParetoChart from '@/components/ParetoChart';
import ModeNav from '@/components/ModeNav';

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
  type ParetoDataset,
} from '@/utils/pareto';

const Bridge: React.FC = () => {
  const [params, setParams] = useState<BridgeParams>({
    survivalMonths: 12,
    postTransplantDeathRate: 1.0, // locked
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

  // Pareto state — separate so the main chart load doesn't block them and
  // vice-versa. Both charts depend on (mode, threshold, strategy, horizon)
  // but DO NOT depend on the user's xeno_proportion / survivalMonths
  // selection (the chart's whole purpose is to show the full sweep).
  const [supplyCurve, setSupplyCurve] = useState<ParetoDataset | null>(null);
  const [supplyLoading, setSupplyLoading] = useState(true);
  const [supplyError, setSupplyError] = useState<string | null>(null);

  const [survivalCurve, setSurvivalCurve] = useState<ParetoDataset | null>(null);
  const [survivalLoading, setSurvivalLoading] = useState(true);
  const [survivalError, setSurvivalError] = useState<string | null>(null);

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
          { xeno_proportion: params.xeno_proportion },
          strategy,
        );
        const baseConfigName = composeConfigName(
          'bridge',
          { xeno_proportion: 0 },
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
    // Drop the previous dataset *atomically* with the param change so the
    // chart can't render a stale "Inflection at 1,723/yr" caption while the
    // new threshold's data is still in flight (the new sweeps caption
    // updates synchronously from `params.*`, so the Inflection label has
    // to follow it).
    setSupplyCurve(null);
    async function loadSupply() {
      setSupplyLoading(true);
      setSupplyError(null);
      try {
        const strategy = params.targetingStrategy || 'standard';
        const ds = await loadParetoDataset({
          mode: 'bridge',
          highCPRAThreshold: params.highCPRAThreshold,
          strategy,
          targetYear: params.simulationHorizon,
          metric: livesSavedFromViz,
          // 0.5 → 4× span the supply Pareto over an order of magnitude:
          //   * 0.5/1/1.5/2× covers the realistic-now → realistic-soon range
          //   * 3× and 4× push past the saturation point so the curve's
          //     asymptote becomes visible (especially for tighter pools
          //     like 99 %+ where 2× already consumes ~99.6 % of supply).
          points: [0.5, 1, 1.5, 2, 3, 4].map((p) => ({
            label: `${Math.round(xenoBaseRate * p).toLocaleString()}/yr`,
            x: Math.round(xenoBaseRate * p),
            xeno_proportion: p,
            surv: params.survivalMonths,
          })),
        });
        if (!cancelled) setSupplyCurve(ds);
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
    params.highCPRAThreshold,
    params.targetingStrategy,
    params.survivalMonths,
    params.simulationHorizon,
    xenoBaseRate,
  ]);

  // ── Pareto: graft survival (months) vs waitlist reduction ────────────
  // Sweep survivalMonths ∈ {6, 12, 18, 24, 36} at the user's currently-
  // selected proportion/threshold/strategy. If proportion is 0 there's
  // nothing to plot so we surface a friendly message instead.
  useEffect(() => {
    let cancelled = false;
    // See note in the supply-curve effect above: clear the prior dataset
    // synchronously so the inflection caption can't out-live the params it
    // was computed from.
    setSurvivalCurve(null);
    async function loadSurvival() {
      setSurvivalLoading(true);
      setSurvivalError(null);
      if (params.xeno_proportion === 0) {
        if (!cancelled) {
          setSurvivalCurve({ points: [], inflectionIndex: null });
          setSurvivalLoading(false);
        }
        return;
      }
      try {
        const strategy = params.targetingStrategy || 'standard';
        const ds = await loadParetoDataset({
          mode: 'bridge',
          highCPRAThreshold: params.highCPRAThreshold,
          strategy,
          targetYear: params.simulationHorizon,
          metric: waitlistReductionFromViz,
          points: BRIDGE_SURVIVAL_MONTHS.map((m): {
            label: string;
            x: number;
            xeno_proportion: number;
            surv: BridgeSurvivalMonths;
          } => ({
            label: m % 12 === 0 ? `${m / 12} yr` : `${m} mo`,
            x: m,
            xeno_proportion: params.xeno_proportion,
            surv: m,
          })),
        });
        if (!cancelled) setSurvivalCurve(ds);
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
    params.highCPRAThreshold,
    params.targetingStrategy,
    params.xeno_proportion,
    params.simulationHorizon,
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
                  {params.survivalMonths} mo mean graft survival
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
                  In Bridge Therapy, xenotransplants are temporary — each one keeps a
                  high-cPRA patient alive for a known mean duration (your choice from
                  6&nbsp;mo to 3&nbsp;yr), after which the patient typically returns
                  to the waitlist for a permanent human transplant. Post-transplant
                  death stays at the human-kidney baseline (1.0×). The two Pareto
                  curves below show how supply and graft survival trade off against
                  lives saved and waitlist reduction — including the inflection
                  point past which more supply (or longer survival) yields
                  diminishing returns.
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

                {/* Wait Time — clinically the most intuitive bridge-therapy
                    outcome (xeno's primary value-add is buying time on the
                    waitlist), so it sits above the broader population
                    dynamics block. */}
                <div>
                  <div className="mb-6 pb-4 border-b border-medical-border">
                    <h2 className="text-2xl font-bold text-primary mb-2 tracking-tight">
                      Wait Time
                    </h2>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      How long patients wait from listing to (any) transplant under your
                      selected bridge configuration
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
                  How additional xeno supply and longer graft survival convert to
                  lives saved and waitlist reduction at year {params.simulationHorizon}
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="border-medical-border shadow-md">
                  <CardHeader>
                    <CardTitle className="text-base font-semibold text-foreground">
                      Xeno supply &nbsp;↔&nbsp; Lives saved
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Sweeps {[0.5, 1, 1.5, 2, 3, 4]
                        .map((m) => `${Math.round(xenoBaseRate * m).toLocaleString()}/yr`)
                        .join(' · ')}{' '}
                      at {params.survivalMonths}-mo bridge, {params.highCPRAThreshold}%+
                      cPRA, strategy = {params.targetingStrategy ?? 'standard'}
                    </p>
                  </CardHeader>
                  <CardContent>
                    <ParetoChart
                      dataset={supplyCurve}
                      loading={supplyLoading}
                      error={supplyError}
                      xLabel="Xeno kidneys per year"
                      yLabel={`Lives saved by year ${params.simulationHorizon}`}
                      formatX={(v) => v.toLocaleString()}
                      formatY={(v) => v.toLocaleString(undefined, { maximumFractionDigits: 0 })}
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
                      ({params.xeno_proportion}× supply), {params.highCPRAThreshold}%+ cPRA,
                      strategy = {params.targetingStrategy ?? 'standard'}
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
                        dataset={survivalCurve}
                        loading={survivalLoading}
                        error={survivalError}
                        xLabel="Mean graft survival (months)"
                        yLabel={`Waitlist reduction at year ${params.simulationHorizon}`}
                        formatX={(v) => `${v} mo`}
                        formatY={(v) =>
                          v.toLocaleString(undefined, { maximumFractionDigits: 0 })
                        }
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
