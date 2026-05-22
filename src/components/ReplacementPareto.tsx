/**
 * Replacement Therapy Pareto / tradeoff curves.
 *
 * Mirrors the two charts on the Bridge page but uses Replacement-mode
 * config naming (multipliers ARE part of the name, no graft-survival
 * dimension). Two charts:
 *
 *   1. Xeno supply ↔ Lives saved
 *      Sweep `xeno_proportion ∈ {0.5, 1, 1.5, 2}` while holding the
 *      user's currently-selected relist & death multipliers fixed.
 *
 *   2. Xeno graft failure rate ↔ Waitlist reduction
 *      Sweep `xenoGraftFailureRate ∈ {0.5, 1, 1.5, 2}` while holding the
 *      user's xeno_proportion & death multiplier fixed. Lower multiplier
 *      = grafts last longer = bigger waitlist reduction (decreasing curve;
 *      kneedle handles either direction).
 *
 * Both charts compare against the same canonical "no xeno" base
 * (`xeno_age_prop0_relist1_death1`) so y values are self-consistent
 * across each curve.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingDown } from 'lucide-react';

import ParetoChart from '@/components/ParetoChart';
import {
  loadParetoDataset,
  livesSavedFromViz,
  waitlistReductionFromViz,
  type ParetoDataset,
} from '@/utils/pareto';
import { getXenoBaseRate } from '@/utils/dataTransformer';

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
const SUPPLY_PROPS = [0.5, 1, 1.5, 2] as const;
const GRAFT_FAILURE_MULTIPLIERS = [0.5, 1, 1.5, 2] as const;

const ReplacementPareto: React.FC<ReplacementParetoProps> = ({
  xeno_proportion,
  xenoGraftFailureRate,
  postTransplantDeathRate,
  highCPRAThreshold,
  targetingStrategy,
  simulationHorizon,
}) => {
  const strategy = targetingStrategy || 'standard';

  const xenoBaseRate = useMemo(
    () => getXenoBaseRate(strategy, highCPRAThreshold),
    [strategy, highCPRAThreshold],
  );

  const [supplyCurve, setSupplyCurve] = useState<ParetoDataset | null>(null);
  const [supplyLoading, setSupplyLoading] = useState(true);
  const [supplyError, setSupplyError] = useState<string | null>(null);

  const [graftCurve, setGraftCurve] = useState<ParetoDataset | null>(null);
  const [graftLoading, setGraftLoading] = useState(true);
  const [graftError, setGraftError] = useState<string | null>(null);

  // ── Supply Pareto ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setSupplyCurve(null);
    async function load() {
      setSupplyLoading(true);
      setSupplyError(null);
      try {
        const ds = await loadParetoDataset({
          mode: 'replacement',
          highCPRAThreshold,
          strategy,
          targetYear: simulationHorizon,
          metric: livesSavedFromViz,
          points: SUPPLY_PROPS.map((p) => ({
            label: `${Math.round(xenoBaseRate * p).toLocaleString()}/yr`,
            x: Math.round(xenoBaseRate * p),
            xeno_proportion: p,
            xenoGraftFailureRate,
            postTransplantDeathRate,
          })),
        });
        if (!cancelled) setSupplyCurve(ds);
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
    highCPRAThreshold,
    strategy,
    simulationHorizon,
    xenoGraftFailureRate,
    postTransplantDeathRate,
    xenoBaseRate,
  ]);

  // ── Graft-failure Pareto ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setGraftCurve(null);
    async function load() {
      setGraftLoading(true);
      setGraftError(null);
      // At xeno_proportion=0 there are no xenografts and the multiplier
      // sweep is meaningless; surface a friendly empty state instead.
      if (xeno_proportion === 0) {
        if (!cancelled) {
          setGraftCurve({ points: [], inflectionIndex: null });
          setGraftLoading(false);
        }
        return;
      }
      try {
        const ds = await loadParetoDataset({
          mode: 'replacement',
          highCPRAThreshold,
          strategy,
          targetYear: simulationHorizon,
          metric: waitlistReductionFromViz,
          points: GRAFT_FAILURE_MULTIPLIERS.map((m) => ({
            label: `${m.toFixed(1)}×`,
            x: m,
            xeno_proportion,
            xenoGraftFailureRate: m,
            postTransplantDeathRate,
          })),
        });
        if (!cancelled) setGraftCurve(ds);
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
  }, [
    highCPRAThreshold,
    strategy,
    simulationHorizon,
    xeno_proportion,
    postTransplantDeathRate,
  ]);

  return (
    <div>
      <div className="mb-6 pb-4 border-b border-medical-border">
        <h2 className="text-2xl font-bold text-primary mb-2 tracking-tight flex items-center gap-2">
          <TrendingDown className="w-6 h-6" />
          Tradeoff Curves
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          How additional xeno supply and better xeno graft survival convert
          to lives saved and waitlist reduction at year {simulationHorizon}.
          Both sweeps hold your other multipliers fixed at the values
          selected on the left.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-medical-border shadow-md">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-foreground">
              Xeno supply &nbsp;↔&nbsp; Lives saved
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Sweeps{' '}
              {SUPPLY_PROPS
                .map((m) => `${Math.round(xenoBaseRate * m).toLocaleString()}/yr`)
                .join(' · ')}{' '}
              at relist = {xenoGraftFailureRate.toFixed(1)}×, death ={' '}
              {postTransplantDeathRate.toFixed(1)}×, {highCPRAThreshold}%+
              cPRA, strategy = {strategy}
            </p>
          </CardHeader>
          <CardContent>
            <ParetoChart
              dataset={supplyCurve}
              loading={supplyLoading}
              error={supplyError}
              xLabel="Xeno supply rate (procedures / yr, intended)"
              yLabel={`Lives saved by year ${simulationHorizon}`}
              formatX={(v) => v.toLocaleString()}
              formatY={(v) => v.toLocaleString(undefined, { maximumFractionDigits: 0 })}
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
              {postTransplantDeathRate.toFixed(1)}×, {highCPRAThreshold}%+
              cPRA, strategy = {strategy}. Lower multiplier = grafts fail
              less often = bigger waitlist reduction.
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
                dataset={graftCurve}
                loading={graftLoading}
                error={graftError}
                xLabel="Xeno graft failure rate (× human)"
                yLabel={`Waitlist reduction at year ${simulationHorizon}`}
                formatX={(v) => `${v.toFixed(1)}×`}
                formatY={(v) =>
                  v.toLocaleString(undefined, { maximumFractionDigits: 0 })
                }
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ReplacementPareto;
