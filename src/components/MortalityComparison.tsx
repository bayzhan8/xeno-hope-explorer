/**
 * MortalityComparison — Bridge-page panel for the central Task-Group-2
 * scientific question: how does mortality on a functioning xenograft
 * compare with the alternatives (dialysis on the waitlist; post-
 * allotransplant)?
 *
 * The panel is intentionally low-info-per-pixel: three annual hazard
 * numbers and one ratio. It updates live as the user moves the
 * Mortality While Bridged slider, before the underlying viz JSON has
 * finished refetching, so the user gets immediate causal feedback
 * ("this slider is the bridge's central justification").
 *
 * Conventions:
 *   - All hazards are per-person-day. We display them as annualized %
 *     using a simple `× 365 × 100` (the bridge sweep horizon is short
 *     enough that the exponentialization correction is < 0.1pp; not
 *     worth the cognitive overhead).
 *   - The bridge baseline equals the human-kidney `death with tx`
 *     hazard at the same cPRA bin (see `getBridgeMortalityRates`).
 *     Scaling by the mortality multiplier gives the achieved bridge
 *     mortality.
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HeartPulse, ArrowDown, ArrowUp, Minus } from 'lucide-react';
import {
  getBridgeMortalityRates,
  BRIDGE_DEATH_MULTIPLIERS,
} from '@/utils/configFinder';

interface MortalityComparisonProps {
  highCPRAThreshold: number;
  bridgeMultiplier: number;
  /**
   * If true, also show the "low cPRA" row of the input pickle so the
   * user can put the high-cPRA mortality in context. Defaults to false
   * (panel stays compact for the main column).
   */
  showLowCpra?: boolean;
}

const annualPct = (perDay: number): number => perDay * 365 * 100;

const fmtAnnual = (perDay: number): string =>
  `${annualPct(perDay).toFixed(1)}% / yr`;

const RATIO_TOLERANCE = 0.05;

interface ComparisonRowProps {
  label: string;
  perDay: number;
  emphasize?: boolean;
  description: string;
  /** Color band for the rate pill. */
  tone: 'neutral' | 'good' | 'bad';
}

const toneClasses: Record<ComparisonRowProps['tone'], string> = {
  neutral: 'bg-muted text-foreground',
  good: 'bg-emerald-100 text-emerald-900 border-emerald-200',
  bad: 'bg-rose-100 text-rose-900 border-rose-200',
};

const ComparisonRow: React.FC<ComparisonRowProps> = ({
  label,
  perDay,
  emphasize,
  description,
  tone,
}) => (
  <div
    className={`flex items-center justify-between gap-3 py-2 ${
      emphasize ? 'rounded-md bg-primary/5 px-2' : ''
    }`}
  >
    <div className="min-w-0">
      <div className="text-sm font-medium text-foreground">{label}</div>
      <div className="text-[11px] text-muted-foreground leading-snug">
        {description}
      </div>
    </div>
    <div
      className={`flex-shrink-0 px-2.5 py-1 rounded-md text-sm font-semibold tabular-nums border ${toneClasses[tone]}`}
    >
      {fmtAnnual(perDay)}
    </div>
  </div>
);

const MortalityComparison: React.FC<MortalityComparisonProps> = ({
  highCPRAThreshold,
  bridgeMultiplier,
  showLowCpra = false,
}) => {
  const rates = getBridgeMortalityRates(highCPRAThreshold, 'high');
  const dialysis = rates.dialysisPerDay;
  const postAllo = rates.postAlloPerDay;
  const bridge = rates.bridgeBaselinePerDay * bridgeMultiplier;

  // "Bridge vs dialysis" is the headline causal claim of the page.
  // We express it as the percent reduction (positive = bridge saves
  // lives; negative = bridge is worse than dialysis).
  const dialysisVsBridgeReductionPct =
    dialysis > 0 ? ((dialysis - bridge) / dialysis) * 100 : 0;

  let verdict: { icon: React.ReactNode; text: string; tone: 'good' | 'bad' | 'neutral' };
  if (Math.abs(dialysisVsBridgeReductionPct) < RATIO_TOLERANCE * 100) {
    verdict = {
      icon: <Minus className="w-4 h-4" />,
      text: 'Bridge mortality is essentially equal to dialysis at this multiplier.',
      tone: 'neutral',
    };
  } else if (dialysisVsBridgeReductionPct > 0) {
    verdict = {
      icon: <ArrowDown className="w-4 h-4" />,
      text: `Bridging cuts mortality by ${dialysisVsBridgeReductionPct.toFixed(1)}% vs. dialysis.`,
      tone: 'good',
    };
  } else {
    verdict = {
      icon: <ArrowUp className="w-4 h-4" />,
      text: `Bridging RAISES mortality by ${Math.abs(dialysisVsBridgeReductionPct).toFixed(1)}% vs. dialysis.`,
      tone: 'bad',
    };
  }

  const verdictTone = {
    good: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    bad: 'bg-rose-50 border-rose-200 text-rose-900',
    neutral: 'bg-muted border-medical-border text-foreground',
  }[verdict.tone];

  // Bridge tone is "good" when below post-allo (i.e. better than a real
  // human kidney — unlikely but interesting), "bad" when above dialysis
  // (worse than the no-bridge counterfactual), and "neutral" in between.
  let bridgeTone: ComparisonRowProps['tone'] = 'neutral';
  if (bridge < postAllo * (1 - RATIO_TOLERANCE)) bridgeTone = 'good';
  else if (bridge > dialysis * (1 + RATIO_TOLERANCE)) bridgeTone = 'bad';

  const lowRates = showLowCpra
    ? getBridgeMortalityRates(highCPRAThreshold, 'low')
    : null;

  return (
    <Card className="border-medical-border shadow-md">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
          <HeartPulse className="w-5 h-5 text-primary" />
          Mortality Comparison &nbsp;
          <span className="text-xs font-normal text-muted-foreground">
            (high cPRA ≥ {highCPRAThreshold}%)
          </span>
        </CardTitle>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Annualized per-person death hazard for the high-cPRA bucket the
          bridge targets. Numbers are model assumptions (SRTR 2022, per-day
          hazard × 365), not Monte-Carlo outputs — so they react to the
          mortality slider <em>instantly</em>. Use this to anchor what the
          bridge is buying vs. dialysis at your selected multiplier.
        </p>
      </CardHeader>
      <CardContent className="pt-0 space-y-1">
        <ComparisonRow
          label="Dialysis (on waitlist)"
          perDay={dialysis}
          description="Waitlist-death hazard while the candidate is on dialysis (state C)."
          tone="neutral"
        />
        <ComparisonRow
          label={`On bridge xenograft (${bridgeMultiplier.toFixed(1)}×)`}
          perDay={bridge}
          description="Post-tx mortality scaled by your Mortality-While-Bridged setting."
          emphasize
          tone={bridgeTone}
        />
        <ComparisonRow
          label="Post human transplant"
          perDay={postAllo}
          description="Post-tx mortality after a definitive allokidney (state H_std)."
          tone="neutral"
        />

        <div
          className={`mt-3 px-3 py-2 rounded-md border text-sm flex items-start gap-2 ${verdictTone}`}
        >
          <span className="mt-0.5 flex-shrink-0">{verdict.icon}</span>
          <div className="leading-snug">
            <div className="font-medium">{verdict.text}</div>
            <div className="text-xs opacity-80 mt-0.5">
              Compare: dialysis {fmtAnnual(dialysis)} → bridge{' '}
              {fmtAnnual(bridge)} (× {bridgeMultiplier.toFixed(1)} multiplier).
              Other available multipliers:{' '}
              {BRIDGE_DEATH_MULTIPLIERS.filter((m) => m !== bridgeMultiplier)
                .map((m) => `${m.toFixed(1)}×`)
                .join(' · ')}.
            </div>
          </div>
        </div>

        {showLowCpra && lowRates && (
          <div className="mt-3 pt-3 border-t border-medical-border text-xs text-muted-foreground space-y-1">
            <div className="font-medium text-foreground">
              For reference: low cPRA (&lt; {highCPRAThreshold}%) bucket
            </div>
            <div className="flex justify-between">
              <span>Dialysis</span>
              <span className="tabular-nums">
                {fmtAnnual(lowRates.dialysisPerDay)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Post-allo</span>
              <span className="tabular-nums">
                {fmtAnnual(lowRates.postAlloPerDay)}
              </span>
            </div>
            <p className="pt-1 leading-snug">
              The low-cPRA bucket isn't bridged in any of the included
              allocation strategies — shown here only to put the high-cPRA
              numbers in context.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MortalityComparison;
