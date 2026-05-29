/**
 * Replacement Therapy Pareto / tradeoff curves.
 *
 * Three charts:
 *
 *   1. Xeno supply ↔ Lives saved
 *      Sweep the per-(strategy, threshold) absolute supply grid (kidneys/yr,
 *      N=0 dropped) while holding the user's relist & death multipliers fixed.
 *
 *   2. Xeno supply ↔ Wait-time reduction
 *      Same supply sweep, y = months saved per list-spell at year H
 *      (Little's Law).
 *
 *   3. Xeno graft failure rate ↔ Waitlist reduction
 *      Sweep `xenoGraftFailureRate ∈ XENO_RELIST_MULTIPLIERS` while holding
 *      the user's supply (xeno_n) & death multiplier fixed. Lower multiplier
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
  livesSavedCIHalfWidth,
  waitlistReductionFromViz,
  waitlistReductionCIHalfWidth,
  waitTimeReductionFromViz,
} from '@/utils/pareto';
import { getXenoBaseRate } from '@/utils/dataTransformer';
import { nonZeroSupplyPoints, effectiveThreshold } from '@/utils/supplyGrid';
import { XENO_RELIST_MULTIPLIERS } from '@/utils/configFinder';
import {
  type OverlayMode,
  type ParetoView,
  type SupplyAxis,
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
  xeno_n: number;
  xenoGraftFailureRate: number;
  postTransplantDeathRate: number;
  highCPRAThreshold: number;
  targetingStrategy?: string;
  simulationHorizon: number;
}

// The supply sweep is now per-(strategy, threshold): each subgroup sweeps its
// own absolute kidneys/yr grid (from supply_grid), dropping the N=0 base case
// (trivially 0 lives saved). The graft-failure sweep uses the relisting grid.
const GRAFT_FAILURE_MULTIPLIERS = XENO_RELIST_MULTIPLIERS;

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
      // cpraAll strategies only have data at 99 — pin them there so their
      // curve loads instead of 404ing against an 85/95 folder.
      threshold: effectiveThreshold(s, highCPRAThreshold),
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
  xeno_n,
  xenoGraftFailureRate,
  postTransplantDeathRate,
  highCPRAThreshold,
  targetingStrategy,
  simulationHorizon,
}) => {
  const strategy = targetingStrategy || 'standard';

  // Toolbar state. Defaults: overlay off (matches the previous UI),
  // cumulative view (the headline, easy-to-read direction), and
  // supply axis = kidneys/yr (the clinically meaningful unit when
  // looking at a single subgroup; users can flip to × multiplier
  // for cross-subgroup shape comparison).
  const [overlay, setOverlay] = useState<OverlayMode>('off');
  const [view, setView] = useState<ParetoView>('cumulative');
  const [supplyAxis, setSupplyAxis] = useState<SupplyAxis>('kidneysPerYear');

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
            metricCI: livesSavedCIHalfWidth,
            // Each subgroup sweeps its own absolute kidneys/yr grid.
            // `kidneysPerYear` plots N directly (curves land on disjoint x
            // ranges — that's the point: makes the scale disparity visible).
            // `multiplier` plots N/baseRate so curve SHAPES are comparable.
            points: nonZeroSupplyPoints(sg.strategy, sg.threshold).map((n) => ({
              label: supplyAxis === 'kidneysPerYear'
                ? `${n.toLocaleString()}/yr`
                : `${(baseRate > 0 ? n / baseRate : 0).toFixed(1)}×`,
              x: supplyAxis === 'kidneysPerYear' ? n : (baseRate > 0 ? n / baseRate : 0),
              xeno_n: n,
              xenoGraftFailureRate,
              postTransplantDeathRate,
            })),
          });
          if (ds.points.length === 0) return null;
          return { dataset: ds, label: sg.label, color: sg.color, baseRate };
        });
        const settled = (await Promise.all(tasks)).filter(
          (s): s is NonNullable<typeof s> => s !== null,
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
    supplyAxis,
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
            points: nonZeroSupplyPoints(sg.strategy, sg.threshold).map((n) => ({
              label: supplyAxis === 'kidneysPerYear'
                ? `${n.toLocaleString()}/yr`
                : `${(baseRate > 0 ? n / baseRate : 0).toFixed(1)}×`,
              x: supplyAxis === 'kidneysPerYear' ? n : (baseRate > 0 ? n / baseRate : 0),
              xeno_n: n,
              xenoGraftFailureRate,
              postTransplantDeathRate,
            })),
          });
          if (ds.points.length === 0) return null;
          return { dataset: ds, label: sg.label, color: sg.color, baseRate };
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
    supplyAxis,
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
      // At N=0 there are no xenografts and the multiplier sweep is
      // meaningless across every subgroup; surface a friendly empty state
      // instead of triggering a wave of empty fetches.
      if (xeno_n === 0) {
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
            metricCI: waitlistReductionCIHalfWidth,
            // Graft-failure x is already a multiplier in BOTH overlay
            // modes — no axis switch needed.
            points: GRAFT_FAILURE_MULTIPLIERS.map((m) => ({
              label: `${m.toFixed(1)}×`,
              x: m,
              xeno_n,
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
  }, [subgroups, simulationHorizon, xeno_n, postTransplantDeathRate]);

  // ── Computed: chart axis labels / formatters that depend on supplyAxis ─
  // Note: supplyAxis is now independent of overlay. Picking `multiplier`
  // is the natural choice when overlaying multiple subgroups (curves
  // align on the same x-axis); picking `kidneysPerYear` lets you read
  // absolute supply directly off the axis (curves with different base
  // rates land on disjoint x ranges, which surfaces the scale gap
  // between strategies).
  const supplyXLabel =
    supplyAxis === 'kidneysPerYear'
      ? 'Xeno supply rate (kidneys / yr, intended)'
      : 'Xeno supply (× base human-kidney transplant rate)';
  const supplyFormatX =
    supplyAxis === 'kidneysPerYear'
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

      {/* Toolbar: overlay + supply-axis + view selectors */}
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
        <SegmentedControl<SupplyAxis>
          label="Supply x-axis:"
          ariaLabel="Supply x-axis units"
          value={supplyAxis}
          onChange={setSupplyAxis}
          options={[
            {
              value: 'kidneysPerYear',
              label: 'Kidneys / yr',
              hint: 'x = absolute intended xeno kidneys per year (prop × base rate). Reads directly as a policy lever; curves with different base rates sit on disjoint x ranges (this makes the cross-strategy scale gap visible).',
            },
            {
              value: 'multiplier',
              label: '× Multiplier',
              hint: 'x = N ÷ base human-kidney transplant rate. Normalizes each subgroup so curve SHAPES are directly comparable; the tooltip shows the equivalent kidneys/yr per curve.',
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
              How many lives are saved by year {simulationHorizon} as you offer
              more xeno kidneys per year (your current graft-failure and
              mortality settings are held fixed).{' '}
              {overlay === 'off'
                ? `Shown for ${highCPRAThreshold}%+ cPRA (${strategy}).`
                : overlay === 'thresholds'
                  ? 'One line per cPRA group.'
                  : 'One line per allocation strategy.'}
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
              supplyAxis={supplyAxis}
            />
          </CardContent>
        </Card>

        <Card className="border-medical-border shadow-md">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-foreground">
              Xeno supply &nbsp;↔&nbsp; Wait-time reduction
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              How many months of waiting are saved per patient by year{' '}
              {simulationHorizon} as you offer more xeno kidneys per year.
              Higher means patients reach a transplant sooner.
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
              supplyAxis={supplyAxis}
            />
          </CardContent>
        </Card>

        <Card className="border-medical-border shadow-md">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-foreground">
              Xeno graft failure rate &nbsp;↔&nbsp; Waitlist reduction
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              How much smaller the waitlist gets by year {simulationHorizon} as
              the xeno graft-failure rate changes (at {xeno_n.toLocaleString()}/yr).{' '}
              {overlay === 'off'
                ? `Shown for ${highCPRAThreshold}%+ cPRA (${strategy}).`
                : overlay === 'thresholds'
                  ? 'One line per cPRA group.'
                  : 'One line per allocation strategy.'}{' '}
              A lower failure rate means grafts last longer, so the waitlist
              shrinks more.
            </p>
          </CardHeader>
          <CardContent>
            {xeno_n === 0 ? (
              <div
                className="flex items-center justify-center text-sm text-muted-foreground italic"
                style={{ height: 320 }}
              >
                Set xeno supply &gt; 0 to see how graft failure rate
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
