/**
 * DialysisBurden — Bridge-page panel for the Task-Group-5 reframe.
 *
 * The model's natural language argues for xenotransplantation in terms of
 * waitlist throughput and lives saved, but the clinically loudest
 * outcome for bridged patients is often dialysis displacement: time
 * spent off the machine, regardless of whether the human-kidney supply
 * changes.
 *
 * Modelling assumption (documented in MARKOV_CHAIN_SPECIFICATION.md and
 * the Bridge intro card): every patient in state C is assumed to be on
 * active dialysis. Bridged patients (state H_xeno) are off dialysis.
 * Post-allo recipients (state H_std) are off dialysis.
 *
 * This panel displays:
 *
 *   1. Cumulative dialysis-years avoided — headline scalar metric over
 *      the simulation horizon.
 *   2. Per bridge recipient months avoided — dialysis-years-avoided
 *      amortized over the cumulative number of bridge events
 *      (C → H_xeno transitions). Reads like "every bridge spell delays
 *      X months of dialysis."
 *   3. Hemodialysis sessions avoided — for the lay-audience footer.
 *      Assumes the standard 3-sessions/week outpatient HD schedule.
 *   4. Stacked time-share bar — for each scenario (scenario vs. base),
 *      shows what fraction of total person-time was spent on dialysis
 *      vs. on a bridge xenograft vs. post-allotransplant. Makes the
 *      composition shift visible at a glance.
 *
 * The component is purely presentational; all integrals are computed in
 * `dataTransformer.computeDialysisBurden`.
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Droplets, Info } from 'lucide-react';
import type { DialysisBurdenMetrics } from '@/utils/dataTransformer';

interface DialysisBurdenProps {
  metrics: DialysisBurdenMetrics | null | undefined;
  // Horizon (years) the user picked, used only to label the headline.
  // Falls back to `metrics.horizonYears` if omitted.
  horizonYears?: number;
}

const fmtYears = (years: number): string => {
  if (!Number.isFinite(years)) return '—';
  if (Math.abs(years) >= 1000) {
    return `${(years / 1000).toFixed(2)}k yr`;
  }
  if (Math.abs(years) >= 10) {
    return `${years.toFixed(0)} yr`;
  }
  return `${years.toFixed(1)} yr`;
};

const fmtMonths = (months: number): string => {
  if (!Number.isFinite(months)) return '—';
  if (Math.abs(months) < 10) return `${months.toFixed(1)} mo`;
  return `${months.toFixed(0)} mo`;
};

const fmtCountInt = (v: number): string => {
  if (!Number.isFinite(v)) return '—';
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return Math.round(v).toLocaleString();
};

const fmtPct = (frac: number): string => {
  if (!Number.isFinite(frac)) return '—';
  return `${(frac * 100).toFixed(1)}%`;
};

interface StackBarProps {
  label: string;
  share: { dialysis: number; bridge: number; postAllo: number };
  // When true, dim out the bar (used for the base-case strip).
  muted?: boolean;
}

const StackBar: React.FC<StackBarProps> = ({ label, share, muted }) => {
  const opacity = muted ? 0.7 : 1;
  // Pixel-rounding for tiny slivers so they remain visible.
  const segments: Array<{ key: string; pct: number; bg: string; text: string }> = [
    { key: 'dialysis', pct: share.dialysis * 100, bg: 'bg-rose-500', text: 'Dialysis' },
    { key: 'bridge', pct: share.bridge * 100, bg: 'bg-amber-400', text: 'Bridge' },
    { key: 'postAllo', pct: share.postAllo * 100, bg: 'bg-emerald-500', text: 'Post-allo' },
  ];
  return (
    <div className="w-full" style={{ opacity }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {fmtPct(share.dialysis)} dialysis
        </span>
      </div>
      <div className="flex h-6 w-full rounded-md overflow-hidden border border-medical-border bg-medical-surface">
        {segments.map((seg) =>
          seg.pct > 0.01 ? (
            <div
              key={seg.key}
              className={`${seg.bg} flex items-center justify-center text-[10px] font-medium text-white/95`}
              style={{ width: `${seg.pct}%`, minWidth: seg.pct > 1 ? 'auto' : 0 }}
              title={`${seg.text}: ${fmtPct(seg.pct / 100)}`}
            >
              {seg.pct >= 8 ? `${seg.pct.toFixed(0)}%` : ''}
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
};

const DialysisBurden: React.FC<DialysisBurdenProps> = ({ metrics, horizonYears }) => {
  if (!metrics) {
    return (
      <Card className="border-medical-border shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <Droplets className="w-5 h-5 text-primary" />
            Dialysis Burden Avoided
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground">
            Dialysis-burden metrics require a base-case scenario for
            comparison. Set Xeno Proportion &gt; 0 (or load a comparison
            run) to enable this panel.
          </p>
        </CardContent>
      </Card>
    );
  }

  const horizon = horizonYears ?? metrics.horizonYears;
  const years = metrics.dialysisYearsAvoided;
  const perRecipMonths = metrics.perRecipientMonthsAvoided;
  const sessions = metrics.sessionsAvoided;
  const hasBridgeEvents = metrics.cumXenoAtHorizon > 0;

  return (
    <Card className="border-medical-border shadow-md">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
          <Droplets className="w-5 h-5 text-primary" />
          Dialysis Burden Avoided
          <span className="text-xs font-normal text-muted-foreground">
            over {fmtYears(horizon)}
          </span>
        </CardTitle>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Person-years of dialysis avoided vs. the no-xeno base case,
          assuming every waitlisted candidate (state <em>C</em>) is on
          active dialysis. Independent of whether the human-kidney supply
          changes, since even a queue-neutral bridge displaces dialysis time.
        </p>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {/* Headline metric: cumulative dialysis-years avoided */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-lg border border-medical-border bg-medical-surface/40 px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Dialysis-years avoided
            </div>
            <div className="text-2xl font-bold text-primary tabular-nums mt-1">
              {fmtYears(years)}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1 leading-snug">
              ∫₀ᵀ (C<sub>base</sub> − C<sub>scenario</sub>) dτ / 365
            </div>
          </div>
          <div className="rounded-lg border border-medical-border bg-medical-surface/40 px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Per bridge recipient
            </div>
            <div className="text-2xl font-bold text-primary tabular-nums mt-1">
              {hasBridgeEvents ? fmtMonths(perRecipMonths) : '—'}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1 leading-snug">
              {hasBridgeEvents
                ? `${fmtCountInt(metrics.cumXenoAtHorizon)} bridge spells at horizon`
                : 'No bridge events under current scenario.'}
            </div>
          </div>
        </div>

        {/* Time-share stacked bars */}
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-medium text-foreground">
                Where the person-time goes
              </div>
              <div className="text-[11px] text-muted-foreground leading-snug">
                Fraction of total list + bridge + post-allo person-time
                in each state, over the horizon.
              </div>
            </div>
          </div>
          <StackBar label="Scenario" share={metrics.timeShare} />
          <StackBar label="Base case (no xeno)" share={metrics.baseTimeShare} muted />
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground pt-1">
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-rose-500" />
              Dialysis (state C)
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-400" />
              Bridge (state H<sub>xeno</sub>)
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500" />
              Post-allo (state H<sub>std</sub>)
            </span>
          </div>
        </div>

        {/* Sessions-avoided footer */}
        <div className="flex items-start gap-2 pt-2 border-t border-medical-border text-xs text-muted-foreground leading-snug">
          <Info className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary/70" />
          <p>
            That works out to roughly{' '}
            <span className="font-semibold tabular-nums text-foreground">
              {fmtCountInt(sessions)}
            </span>{' '}
            in-center hemodialysis sessions avoided over the horizon
            (3 sessions/week × 365.25/7 weeks/yr). Includes both bridged
            and non-bridged patients who avoid dialysis because the queue
            cleared faster.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default DialysisBurden;
