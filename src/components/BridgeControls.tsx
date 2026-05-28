import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Info, ChevronDown, ChevronUp, Target, Hourglass, HeartPulse } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getXenoBaseRate } from '@/utils/dataTransformer';
import {
  BRIDGE_SURVIVAL_MONTHS,
  BRIDGE_DEATH_MULTIPLIERS,
  type BridgeSurvivalMonths,
} from '@/utils/configFinder';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface BridgeParams {
  /** Mean useful graft survival (months). One of {6, 12, 18, 24, 36}. */
  survivalMonths: BridgeSurvivalMonths;
  /**
   * Multiplier on the per-day mortality hazard for patients living with a
   * functioning xenograft (the `H_xeno` state). This is the central
   * Task-Group-2 lever: shifting this away from 1.0 lets us ask "does
   * bridging reduce or increase mortality vs. the human-kidney baseline".
   * One of `BRIDGE_DEATH_MULTIPLIERS` ({0.5, 1.0, 1.5, 2.0}); other
   * values won't have a precomputed Supabase config.
   */
  postTransplantDeathRate: number;
  /** Display horizon — 5 or 10 years (data goes 10y on disk). */
  simulationHorizon: number;
  /** Xeno proportion (multiplier on baseline yearly transplant volume). */
  xeno_proportion: number;
  /** 85, 95, 99 (% cPRA) — defines who counts as "high cPRA". */
  highCPRAThreshold: number;
  /** "standard" | "age60_cpraHigh" | "age45_cpraHigh" | "age60_cpraAll" | "age45_cpraAll". */
  targetingStrategy?: string;
}

interface BridgeControlsProps {
  params: BridgeParams;
  onParamsChange: (params: BridgeParams) => void;
}

const BridgeControls: React.FC<BridgeControlsProps> = ({ params, onParamsChange }) => {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  const toggleSection = (section: string) =>
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));

  const updateParam = <K extends keyof BridgeParams>(key: K, value: BridgeParams[K]) =>
    onParamsChange({ ...params, [key]: value });

  const snapTo = (value: number, allowedValues: number[]) =>
    allowedValues.reduce(
      (prev, curr) => (Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev),
      allowedValues[0],
    );

  const toggleHorizon = () =>
    updateParam('simulationHorizon', params.simulationHorizon === 5 ? 10 : 5);

  const strategy = params.targetingStrategy || 'standard';
  const xenoBaseRate = getXenoBaseRate(strategy, params.highCPRAThreshold);
  const xenoKidneysPerYear = Math.round(xenoBaseRate * params.xeno_proportion);

  // Helpers for the survival button-group: friendly label + duration label.
  const survivalLabel = (m: number): string => (m % 12 === 0 ? `${m / 12} yr` : `${m} mo`);

  // Compact number formatter for the slider tick labels. The any-cPRA
  // allocation strategies push the max value into the tens of thousands,
  // and seven 5-digit comma-formatted labels collide under a ~280px slider.
  // Render thousands as "k" so all seven ticks fit without overlapping.
  const formatCompact = (n: number): string => {
    if (n < 1000) return n.toLocaleString();
    if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
    return `${Math.round(n / 1000)}k`;
  };

  return (
    <TooltipProvider>
      <Card className="w-full bg-card shadow-[var(--shadow-medium)] border-medical-border flex flex-col max-h-[calc(100vh-4rem)]">
        <CardHeader className="border-b border-medical-border bg-medical-surface flex-shrink-0">
          <CardTitle className="text-lg font-semibold text-primary flex items-center gap-2">
            Bridge Therapy Parameters
            <Tooltip>
              <TooltipTrigger>
                <Info className="w-4 h-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs text-xs">
                  Bridge Therapy treats the xenograft as a <em>temporary</em>
                  organ: the recipient remains a transplant candidate and stays
                  eligible for a definitive human allokidney. Both bridged and
                  un-bridged candidates draw from the same fixed human supply —
                  this simulation does not manufacture extra organs, it changes
                  who can receive them and when.
                </p>
              </TooltipContent>
            </Tooltip>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 p-4 overflow-y-auto flex-1">
          {/* Allocation Strategy */}
          <div className="space-y-3 pb-4 border-b border-medical-border">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              <Label className="text-sm font-medium">Allocation Strategy</Label>
            </div>
            <Select
              value={params.targetingStrategy || 'standard'}
              onValueChange={(value) =>
                onParamsChange({ ...params, targetingStrategy: value })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select allocation strategy" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard (High cPRA, All Ages)</SelectItem>
                <SelectItem value="age60_cpraHigh">Elderly 60+ (High cPRA Only)</SelectItem>
                <SelectItem value="age45_cpraHigh">Older Adults 45+ (High cPRA Only)</SelectItem>
                <SelectItem value="age60_cpraAll">Age-Based 60+ (Any cPRA)</SelectItem>
                <SelectItem value="age45_cpraAll">Age-Based 45+ (Any cPRA)</SelectItem>
              </SelectContent>
            </Select>
            <div className="text-xs text-muted-foreground space-y-1">
              <div className="flex items-start gap-2">
                <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <span>Choose which patient populations receive the bridging xenotransplants.</span>
              </div>
            </div>
          </div>

          {/* High CPRA Definition */}
          <div className="space-y-3 pb-4 border-b border-medical-border">
            <Label className="text-sm font-medium">High cPRA Definition</Label>
            <div className="flex gap-2">
              {[85, 95, 99].map((threshold) => {
                const isActive = params.highCPRAThreshold === threshold;
                return (
                  <button
                    key={threshold}
                    type="button"
                    onClick={() => updateParam('highCPRAThreshold', threshold)}
                    className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                      isActive
                        ? 'border-2 border-primary bg-primary text-primary-foreground'
                        : 'border border-input bg-background text-foreground hover:bg-muted'
                    }`}
                  >
                    {threshold}%+
                  </button>
                );
              })}
            </div>
            <div className="text-xs text-muted-foreground flex items-start gap-2">
              <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span>Defines who counts as "high cPRA" in this simulation.</span>
            </div>
          </div>

          {/* Xeno Supply Rate */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Xeno Supply Rate (intended, per year)</Label>
              <span className="text-sm font-semibold text-primary">
                {xenoKidneysPerYear.toLocaleString()}
              </span>
            </div>
            <Slider
              value={[params.xeno_proportion]}
              onValueChange={(value) =>
                updateParam(
                  'xeno_proportion',
                  snapTo(value[0], [0, 0.5, 1, 1.5, 2, 3, 4]),
                )
              }
              max={4}
              min={0}
              step={0.5}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums">
              {[0, 0.5, 1, 1.5, 2, 3, 4].map((m) => (
                <span key={m} className="whitespace-nowrap">
                  {formatCompact(Math.round(xenoBaseRate * m))}
                </span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {xenoKidneysPerYear.toLocaleString()} bridge xenografts/year offered
              ({params.xeno_proportion}× of {xenoBaseRate.toLocaleString()} base).
              The human allokidney supply is unchanged; a bridged recipient
              competes for the same allokidneys as every other candidate.
              Actual delivered counts (bridge xenos placed, bridge → allo
              transitions) are on the Throughput card.
            </p>
          </div>

          {/* Mortality While Bridged — the *central* Task-Group-2 lever */}
          <div className="space-y-3 pt-4 border-t border-medical-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HeartPulse className="w-4 h-4 text-primary" />
                <Label className="text-sm font-medium">Mortality While Bridged</Label>
              </div>
              <span className="text-sm font-semibold text-primary">
                {params.postTransplantDeathRate.toFixed(1)}× post-tx baseline
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {BRIDGE_DEATH_MULTIPLIERS.map((mult) => {
                const isActive = params.postTransplantDeathRate === mult;
                return (
                  <button
                    key={mult}
                    type="button"
                    onClick={() => updateParam('postTransplantDeathRate', mult)}
                    className={`px-2 py-2 text-xs font-medium rounded-md transition-colors ${
                      isActive
                        ? 'border-2 border-primary bg-primary text-primary-foreground'
                        : 'border border-input bg-background text-foreground hover:bg-muted'
                    }`}
                    aria-pressed={isActive}
                  >
                    {mult.toFixed(1)}×
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Per-day mortality hazard for patients on a functioning
                xenograft, as a multiple of the human-kidney post-tx baseline
                (1.0×). This is the bridge's reason for existing — set it
                relative to dialysis mortality (see panel above).
              </p>
              <button
                type="button"
                onClick={() => toggleSection('mortality')}
                className="text-xs text-primary hover:underline flex items-center gap-1 flex-shrink-0 ml-2"
              >
                Read more
                {expandedSections.mortality ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </button>
            </div>
            {expandedSections.mortality && (
              <div className="text-xs text-muted-foreground space-y-2 p-3 bg-muted rounded-md border border-medical-border">
                <p className="font-medium text-foreground">
                  Why mortality is the central knob
                </p>
                <p>
                  The bridge competes with dialysis, not with a definitive
                  human transplant. The headline question is whether keeping a
                  high-cPRA patient on a xenograft instead of dialysis reduces
                  their day-to-day mortality enough to be worth the supply
                  cost and the rejection cycle. Everything else (waitlist
                  size, lives saved, throughput) is downstream of that
                  comparison.
                </p>
                <p>
                  <strong>1.0×</strong> means a bridged patient's death rate
                  matches a standard human-kidney recipient in the same cPRA
                  bin (~4 %/yr at the 95% threshold). <strong>0.5×</strong>
                  models a bridge that's clearly better than a human kidney
                  on this axis. <strong>2.0×</strong> stress-tests the
                  scenario where xeno support is real but the patient still
                  dies faster than a human-kidney recipient would — useful
                  to see at what point the bridge stops outperforming
                  dialysis.
                </p>
                <p>
                  Because the bridge pickle bakes the M target as a combined
                  hazard (rejection + baseline death), moving this multiplier
                  drifts the achieved mean bridge duration by at most ~3% at
                  the 0.5×/2× extremes — negligible compared with Monte-Carlo
                  noise.
                </p>
              </div>
            )}
          </div>

          {/* Mean Graft Survival — the bridge-defining duration */}
          <div className="space-y-3 pt-4 border-t border-medical-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Hourglass className="w-4 h-4 text-primary" />
                <Label className="text-sm font-medium">Mean Useful Graft Survival</Label>
              </div>
              <span className="text-sm font-semibold text-primary">
                {survivalLabel(params.survivalMonths)}
              </span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {BRIDGE_SURVIVAL_MONTHS.map((months) => {
                const isActive = params.survivalMonths === months;
                return (
                  <button
                    key={months}
                    type="button"
                    onClick={() => updateParam('survivalMonths', months)}
                    className={`px-2 py-2 text-xs font-medium rounded-md transition-colors ${
                      isActive
                        ? 'border-2 border-primary bg-primary text-primary-foreground'
                        : 'border border-input bg-background text-foreground hover:bg-muted'
                    }`}
                    aria-pressed={isActive}
                  >
                    {survivalLabel(months)}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Intrinsic mean lifetime of the xenograft — time until rejection
                (re-listing) or death-with-functioning-graft, at the canonical
                1.0× mortality multiplier.
              </p>
              <button
                type="button"
                onClick={() => toggleSection('survival')}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                Read more
                {expandedSections.survival ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </button>
            </div>
            {expandedSections.survival && (
              <div className="text-xs text-muted-foreground space-y-2 p-3 bg-muted rounded-md border border-medical-border">
                <p className="font-medium text-foreground">How "graft survival" is modeled</p>
                <p>
                  The selected duration is the <em>intrinsic</em> mean useful
                  lifetime of the xenograft — the time until graft failure (re-
                  listing) or death-with-functioning-graft if nothing else
                  intervenes. We bake exactly your selected duration into a
                  per-age combined hazard, so a 6-month bridge means an
                  intrinsic mean of 6 useful months regardless of the recipient
                  age bin (at the canonical 1.0× mortality multiplier).
                </p>
                <p>
                  A bridged recipient now has a <em>third</em> exit channel
                  besides re-listing and death-with-graft: a definitive human
                  allokidney can become available while their bridge is still
                  intact. When that happens the bridge ends early — the patient
                  becomes a permanent human-kidney recipient (counted in
                  Bridge → Allo on the Throughput card) and the bridge organ is
                  considered consumed. So the <em>observed</em> mean residence
                  time on the bridge can be shorter than your selected M when
                  the allo supply is plentiful relative to demand.
                </p>
              </div>
            )}
          </div>

          {/* Simulation Horizon */}
          <div className="space-y-3 pt-4 border-t border-medical-border">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Simulation Horizon</Label>
              <div className="flex items-center space-x-2">
                <span
                  className={`text-sm ${
                    params.simulationHorizon === 5
                      ? 'text-primary font-medium'
                      : 'text-muted-foreground'
                  }`}
                >
                  5 years
                </span>
                <Switch
                  checked={params.simulationHorizon === 10}
                  onCheckedChange={toggleHorizon}
                />
                <span
                  className={`text-sm ${
                    params.simulationHorizon === 10
                      ? 'text-primary font-medium'
                      : 'text-muted-foreground'
                  }`}
                >
                  10 years
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
};

export default BridgeControls;
