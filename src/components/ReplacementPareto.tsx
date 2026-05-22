/**
 * Replacement Therapy Pareto / tradeoff curves.
 *
 * Three charts:
 *
 *   1. Xeno supply ↔ Lives saved
 *      Sweep `xeno_proportion ∈ {0.5, 1, 1.5, 2}` while holding the
 *      user's currently-selected relist & death multipliers fixed.
 *
 *   2. Xeno supply ↔ Wait-time reduction
 *      Same supply sweep, y = months saved per list-spell at year H
 *      (Little's Law).
 *
 *   3. Xeno graft failure rate ↔ Waitlist reduction
 *      Sweep `xenoGraftFailureRate ∈ {0.5, 1, 1.5, 2}` while holding the
 *      user's xeno_proportion & death multiplier fixed. Lower multiplier
 *      = grafts last longer = bigger waitlist reduction (decreasing curve;
 *      kneedle handles either direction).
 *
 * NEW (Problem 6.1 / 6.4): a toolbar above the cards exposes a tri-state
 * overlay selector ("off | thresholds | strategies") and a binary view
 * selector ("cumulative | marginal"). When overlay is on, each card
 * renders one curve per subgroup on the same axes (with shared color
 * coding across cards). When marginal view is on, each curve is
 * transformed to its per-step Δy/Δx so the user can spot
 * acceleration/deceleration patterns the cumulative shape hides.
 *
 * All charts compare against the same canonical "no xeno" base
 * (`xeno_age_prop0_relist1_death1`) so y values are self-consistent
 * across each curve.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingDown } from 'lucide-react';

import ParetoChart, { type ParetoSeries } from '@/components/ParetoChart';
import SegmentedControl from '@/components/SegmentedControl';
import {
  loadParetoDataset,
  livesSavedFromViz,
  waitlistReductionFromViz,
  waitTimeReductionFromViz,
} from '@/utils/pareto';
import { getXenoBaseRate } from '@/utils/dataTransformer';
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

export interface ReplacementParetoProps {
  xeno_proportion: number;
  xenoGraftFailureRate: number;
  postTransplantDeathRate: number;
  highCPRAThreshold: number;
  targetingStrategy?: string;
  simulationHorizon: number;
}

// Sweep ranges — match the slider snap points in `SimulationControls.tsx`.
// We omit 0 from both because the answer at 0 supply or 0 multiplier is
// either trivial (0 lives saved at prop=0) or non-physical (0× failure
// rate means grafts never fail, which is degenerate).
//
// Note: the standard replacement folder on Supabase only has data for
// these 4 supply points; densifying to 6 (0.5/1/1.5/2/3/4) is gated on
// new MC runs and will land in a follow-up.
const SUPPLY_PROPS = [0.5, 1, 1.5, 2] as const;
const GRAFT_FAILURE_MULTIPLIERS = [0.5, 1, 1.5, 2] as const;

/**
 * Resolve which subgroup list to sweep over for a given overlay mode.
 * "off" returns a single dummy entry that pins to the user's
 * currently-selected (threshold, strategy); the loader treats it
 * uniformly with the multi-subgroup case.
 */
type Subgroup =
  | { kind: 'fixed'; threshold: number; strategy: string; label: string; color: string }
  | { kind: 'threshold'; threshold: ThresholdValue; strategy: string; label: string; color: string }
  | { kind: 'strategy'; threshold: number; strategy: StrategyValue; label: string; color: string };

function buildSubgroups(
  overlay: OverlayMode,
  highCPRAThreshold: number,
  strategy: string,
): Subgroup[] {
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
      threshold: highCPRAThreshold,
      strategy: s,
      label: STRATEGY_LABEL[s],
      color: STRATEGY_PALETTE[s],
    }));
  }
  // overlay === 'off' — single curve at the user's current selection.
  // Color reuses the threshold palette so it visually anchors with the
  // multi-curve mode (95%+ blue, 99%+ deep blue, etc.).
  const color =
    THRESHOLD_PALETTE[highCPRAThreshold as ThresholdValue] ?? '#2563eb';
  return [
    {
      kind: 'fixed',
      threshold: highCPRAThreshold,
      strategy,
      label: 'Curve',
      color,
    },
  ];
}

const ReplacementPareto: React.FC<ReplacementParetoProps> = ({
  xeno_proportion,
  xenoGraftFailureRate,
  postTransplantDeathRate,
  highCPRAThreshold,
  targetingStrategy,
  simulationHorizon,
}) => {
  const strategy = targetingStrategy || 'standard';

  // Toolbar state. Defaults: overlay off (matches the previous UI),
  // cumulative view (the headline, easy-to-read direction).
  const [overlay, setOverlay] = useState<OverlayMode>('off');
  const [view, setView] = useState<ParetoView>('cumulative');

  const subgroups = useMemo(
    () => buildSubgroups(overlay, highCPRAThreshold, strategy),
    [overlay, highCPRAThreshold, strategy],
  );

  // Per-card series state. Each entry corresponds 1:1 with the
  // subgroups array above (preserving order for stable color/legend).
  const [supplySeries, setSupplySeries] = useState<ParetoSeries[] | null>(null);
  const [supplyLoading, setSupplyLoading] = useState(true);
  const [supplyError, setSupplyError] = useState<string | null>(null);

  const [waitTimeSeries, setWaitTimeSeries] = useState<ParetoSeries[] | null>(null);
  const [waitTimeLoading, setWaitTimeLoading] = useState(true);
  const [waitTimeError, setWaitTimeError] = useState<string | null>(null);

  const [graftSeries, setGraftSeries] = useState<ParetoSeries[] | null>(null);
  const [graftLoading, setGraftLoading] = useState(true);
  const [graftError, setGraftError] = useState<string | null>(null);

  // Display rate for the current (threshold, strategy) pair — used in
  // captions only. When overlay is on, this is the "anchor" subgroup
  // (the user's selection) since per-curve rates differ.
  const xenoBaseRate = useMemo(
    () => getXenoBaseRate(strategy, highCPRAThreshold),
    [strategy, highCPRAThreshold],
  );

  // ── Helper: load all subgroups for a given (sweep, metric) and
  // return them as a ParetoSeries[] in subgroup order. Failures are
  // captured but don't poison the array — we drop the failed curve
  // and keep the rest, mirroring the existing single-curve graceful
  // degradation behaviour.
  // ───────────────────────────────────────────────────────────────────
  type LoadOpts = {
    metric: Parameters<typeof loadParetoDataset>[0]['metric'] |
      ((thresholdForCurry: number) => Parameters<typeof loadParetoDataset>[0]['metric']);
    /** Build the per-point sweep for one subgroup. */
    sweep: (sg: Subgroup) => Parameters<typeof loadParetoDataset>[0]['points'];
  };

  // ── Supply Pareto (lives saved) ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setSupplySeries(null);
    async function load() {
      setSupplyLoading(true);
      setSupplyError(null);
      try {
        const tasks = subgroups.map(async (sg) => {
          const baseRate = getXenoBaseRate(sg.strategy, sg.threshold);
          const ds = await loadParetoDataset({
            mode: 'replacement',
            highCPRAThreshold: sg.threshold,
            strategy: sg.strategy,
            targetYear: simulationHorizon,
            metric: livesSavedFromViz,
            // When overlay is OFF, x = kidneys/yr (raw rate, what the
            // user selected on the slider). When overlay is ON, x =
            // multiplier so curves with different baseRate align on
            // the same axis.
            points: SUPPLY_PROPS.map((p) => ({
              label: overlay === 'off'
                ? `${Math.round(baseRate * p).toLocaleString()}/yr`
                : `${p}×`,
              x: overlay === 'off' ? Math.round(baseRate * p) : p,
              xeno_proportion: p,
              xenoGraftFailureRate,
              postTransplantDeathRate,
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
          console.error('[Replacement:supply Pareto] failed:', err);
          setSupplyError(
            err instanceof Error ? err.message : 'Could not build supply curve',
          );
        }
      } finally {
        if (!cancelled) setSupplyLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [
    subgroups,
    overlay,
    simulationHorizon,
    xenoGraftFailureRate,
    postTransplantDeathRate,
  ]);

  // ── Wait-time-vs-supply Pareto ───────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setWaitTimeSeries(null);
    async function load() {
      setWaitTimeLoading(true);
      setWaitTimeError(null);
      try {
        const tasks = subgroups.map(async (sg) => {
          const baseRate = getXenoBaseRate(sg.strategy, sg.threshold);
          const ds = await loadParetoDataset({
            mode: 'replacement',
            highCPRAThreshold: sg.threshold,
            strategy: sg.strategy,
            targetYear: simulationHorizon,
            metric: (scen, base, target) =>
              waitTimeReductionFromViz(scen, base, target, sg.threshold),
            points: SUPPLY_PROPS.map((p) => ({
              label: overlay === 'off'
                ? `${Math.round(baseRate * p).toLocaleString()}/yr`
                : `${p}×`,
              x: overlay === 'off' ? Math.round(baseRate * p) : p,
              xeno_proportion: p,
              xenoGraftFailureRate,
              postTransplantDeathRate,
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
          console.error('[Replacement:waitTime Pareto] failed:', err);
          setWaitTimeError(
            err instanceof Error ? err.message : 'Could not build wait-time curve',
          );
        }
      } finally {
        if (!cancelled) setWaitTimeLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [
    subgroups,
    overlay,
    simulationHorizon,
    xenoGraftFailureRate,
    postTransplantDeathRate,
  ]);

  // ── Graft-failure Pareto (waitlist reduction) ────────────────────────
  useEffect(() => {
    let cancelled = false;
    setGraftSeries(null);
    async function load() {
      setGraftLoading(true);
      setGraftError(null);
      // At xeno_proportion=0 there are no xenografts and the multiplier
      // sweep is meaningless across every subgroup; surface a friendly
      // empty state instead of triggering a wave of empty fetches.
      if (xeno_proportion === 0) {
        if (!cancelled) {
          setGraftSeries([]);
          setGraftLoading(false);
        }
        return;
      }
      try {
        const tasks = subgroups.map(async (sg) => {
          const ds = await loadParetoDataset({
            mode: 'replacement',
            highCPRAThreshold: sg.threshold,
            strategy: sg.strategy,
            targetYear: simulationHorizon,
            metric: waitlistReductionFromViz,
            // Graft-failure x is already a multiplier in BOTH overlay
            // modes — no axis switch needed.
            points: GRAFT_FAILURE_MULTIPLIERS.map((m) => ({
              label: `${m.toFixed(1)}×`,
              x: m,
              xeno_proportion,
              xenoGraftFailureRate: m,
              postTransplantDeathRate,
            })),
          });
          if (ds.points.length === 0) return null;
          return { dataset: ds, label: sg.label, color: sg.color };
        });
        const settled = (await Promise.all(tasks)).filter(
          (s): s is ParetoSeries => s !== null,
        );
        if (!cancelled) setGraftSeries(settled);
      } catch (err) {
        if (!cancelled) {
          console.error('[Replacement:graft Pareto] failed:', err);
          setGraftError(
            err instanceof Error ? err.message : 'Could not build graft-failure curve',
          );
        }
      } finally {
        if (!cancelled) setGraftLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [subgroups, simulationHorizon, xeno_proportion, postTransplantDeathRate]);

  // ── Computed: chart axis labels / formatters that depend on overlay ──
  const supplyXLabel =
    overlay === 'off'
      ? 'Xeno supply rate (procedures / yr, intended)'
      : 'Xeno supply (× base, comparable across subgroups)';
  const supplyFormatX =
    overlay === 'off'
      ? (v: number) => v.toLocaleString()
      : (v: number) => `${v}×`;

  const yLivesLabel =
    view === 'marginal'
      ? `Δ Lives saved per Δ supply`
      : `Lives saved by year ${simulationHorizon}`;
  const yWaitLabel =
    view === 'marginal'
      ? `Δ Wait-time reduction per Δ supply (mo)`
      : `Wait time reduction at year ${simulationHorizon} (mo)`;
  const yGraftLabel =
    view === 'marginal'
      ? `Δ Waitlist reduction per Δ failure×`
      : `Waitlist reduction at year ${simulationHorizon}`;

  return (
    <div>
      <div className="mb-6 pb-4 border-b border-medical-border">
        <h2 className="text-2xl font-bold text-primary mb-2 tracking-tight flex items-center gap-2">
          <TrendingDown className="w-6 h-6" />
          Tradeoff Curves
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          How additional xeno supply and better xeno graft survival convert
          to lives saved, waitlist reduction, and wait-time reduction at
          year {simulationHorizon}. Each sweep holds your other multipliers
          fixed at the values selected on the left. Use the toolbar to
          overlay subgroups (cPRA thresholds or allocation strategies) on
          the same axes, and to switch between cumulative and per-step
          marginal views.
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
              hint: 'Compare the same sweep across all five allocation strategies (Standard, 60+ high cPRA, 45+ high cPRA, 60+ any, 45+ any).',
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
              hint: 'Plot total y at each x (default: lives saved by year H).',
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
                  Sweeps{' '}
                  {SUPPLY_PROPS
                    .map((m) => `${Math.round(xenoBaseRate * m).toLocaleString()}/yr`)
                    .join(' · ')}{' '}
                  at relist = {xenoGraftFailureRate.toFixed(1)}×, death ={' '}
                  {postTransplantDeathRate.toFixed(1)}×, {highCPRAThreshold}%+
                  cPRA, strategy = {strategy}
                </>
              ) : (
                <>
                  Sweeps {SUPPLY_PROPS.map((m) => `${m}×`).join(' · ')} supply at
                  relist = {xenoGraftFailureRate.toFixed(1)}×, death ={' '}
                  {postTransplantDeathRate.toFixed(1)}×.
                  {' '}{overlay === 'thresholds'
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
              xLabel={supplyXLabel}
              yLabel={yLivesLabel}
              formatX={supplyFormatX}
              formatY={(v) => v.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              view={view}
            />
          </CardContent>
        </Card>

        <Card className="border-medical-border shadow-md">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-foreground">
              Xeno supply &nbsp;↔&nbsp; Wait-time reduction
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Same supply sweep as the Lives-saved card. y = base −
              scenario wait time per list-spell at year{' '}
              {simulationHorizon} (months saved), via Little's Law on the
              same viz JSONs that drive the Wait-Time chart above.
            </p>
          </CardHeader>
          <CardContent>
            <ParetoChart
              datasets={waitTimeSeries}
              loading={waitTimeLoading}
              error={waitTimeError}
              xLabel={supplyXLabel}
              yLabel={yWaitLabel}
              formatX={supplyFormatX}
              formatY={(v) => `${v.toFixed(1)} mo`}
              view={view}
            />
          </CardContent>
        </Card>

        <Card className="border-medical-border shadow-md">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-foreground">
              Xeno graft failure rate &nbsp;↔&nbsp; Waitlist reduction
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Sweeps {GRAFT_FAILURE_MULTIPLIERS.map((m) => `${m.toFixed(1)}×`).join(' · ')}{' '}
              at {Math.round(xenoBaseRate * xeno_proportion).toLocaleString()}/yr
              ({xeno_proportion}× supply), death ={' '}
              {postTransplantDeathRate.toFixed(1)}×.{' '}
              {overlay === 'off'
                ? `${highCPRAThreshold}%+ cPRA, strategy = ${strategy}.`
                : overlay === 'thresholds'
                  ? 'One curve per cPRA threshold.'
                  : 'One curve per allocation strategy.'}{' '}
              Lower multiplier = grafts fail less often = bigger waitlist reduction.
            </p>
          </CardHeader>
          <CardContent>
            {xeno_proportion === 0 ? (
              <div
                className="flex items-center justify-center text-sm text-muted-foreground italic"
                style={{ height: 320 }}
              >
                Set xeno proportion &gt; 0 to see how graft failure rate
                affects the waitlist.
              </div>
            ) : (
              <ParetoChart
                datasets={graftSeries}
                loading={graftLoading}
                error={graftError}
                xLabel="Xeno graft failure rate (× human)"
                yLabel={yGraftLabel}
                formatX={(v) => `${v.toFixed(1)}×`}
                formatY={(v) =>
                  v.toLocaleString(undefined, { maximumFractionDigits: 0 })
                }
                view={view}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ReplacementPareto;
