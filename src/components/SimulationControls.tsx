import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Info, ChevronDown, ChevronUp, Target, HeartPulse } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { fmtMeanTime, fmtAnnualRate } from '@/utils/chartFormat';
import { XENO_DEATH_MULTIPLIERS, XENO_RELIST_MULTIPLIERS } from '@/utils/configFinder';
import {
  supplyPoints,
  availableThresholds,
  isCpraAllStrategy,
  normalizeSelection,
} from '@/utils/supplyGrid';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SimulationParams {
  xenoGraftFailureRate: number;
  postTransplantDeathRate: number;
  simulationHorizon: number;
  xeno_n: number; // absolute xeno supply (kidneys/yr) from the supply grid
  highCPRAThreshold: number;
  targetingStrategy?: string;  // "standard", "age60_cpraHigh", "age45_cpraHigh", "age60_cpraAll", "age45_cpraAll"
}

interface SimulationControlsProps {
  params: SimulationParams;
  onParamsChange: (params: SimulationParams) => void;
}

const SimulationControls: React.FC<SimulationControlsProps> = ({ params, onParamsChange }) => {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const updateParam = (key: keyof SimulationParams, value: number) => {
    onParamsChange({ ...params, [key]: value });
  };

  const updateStringParam = (key: keyof SimulationParams, value: string) => {
    onParamsChange({ ...params, [key]: value });
  };

  const toggleHorizon = () => {
    updateParam('simulationHorizon', params.simulationHorizon === 5 ? 10 : 5);
  };

  const strategy = params.targetingStrategy || 'standard';
  const xenoKidneysPerYear = params.xeno_n;

  // Discrete supply grid for the current (strategy, threshold) cell. The
  // slider snaps to these absolute kidneys/yr values (which differ per cell).
  const supplyGridPoints = supplyPoints(strategy, params.highCPRAThreshold);
  const supplyIdx = Math.max(0, supplyGridPoints.indexOf(params.xeno_n));
  const thresholdOptions = availableThresholds(strategy);

  // When the strategy changes, snap the threshold (cpraAll -> 99) and the
  // supply N to the new cell's grid so we never request a config that
  // wasn't run.
  const changeStrategy = (value: string) => {
    const norm = normalizeSelection(value, params.highCPRAThreshold, params.xeno_n);
    onParamsChange({
      ...params,
      targetingStrategy: value,
      highCPRAThreshold: norm.threshold,
      xeno_n: norm.xeno_n,
    });
  };

  const changeThreshold = (threshold: number) => {
    const norm = normalizeSelection(strategy, threshold, params.xeno_n);
    onParamsChange({ ...params, highCPRAThreshold: norm.threshold, xeno_n: norm.xeno_n });
  };

  const formatCompact = (n: number): string => {
    if (n < 1000) return n.toLocaleString();
    if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
    return `${Math.round(n / 1000)}k`;
  };

  // Graft failure / death base rates by cPRA threshold. Stored at the
  // precision they were estimated, but only ever displayed to one
  // decimal — anything beyond that is pseudo-precision given the
  // Monte Carlo noise in the underlying simulator.
  const baseRates = {
    85: { transplantsPerYear: 2841, graftFailureRate: 5.6, postTxDeathRate: 4.1 },
    95: { transplantsPerYear: 1723, graftFailureRate: 6.8, postTxDeathRate: 4.0 },
    99: { transplantsPerYear: 974, graftFailureRate: 8.4, postTxDeathRate: 4.0 },
  };

  const currentRates = baseRates[params.highCPRAThreshold as keyof typeof baseRates] || baseRates[85];

  const actualGraftFailureAnnual = currentRates.graftFailureRate * params.xenoGraftFailureRate;
  const actualPostTxDeathAnnual = currentRates.postTxDeathRate * params.postTransplantDeathRate;
  const meanTimeToGraftFailure = fmtMeanTime(actualGraftFailureAnnual);
  const meanTimeToPostTxDeath = fmtMeanTime(actualPostTxDeathAnnual);

  // Multipliers are user-selected from discrete grids:
  //   - Xeno graft failure: 0.5 grid (0, 0.5, 1, 1.5, 2) — historical slider
  //   - Xeno post-tx death: XENO_DEATH_MULTIPLIERS = {1.0, 1.2} — narrow
  //     canonical set shared with Bridge therapy
  // One decimal place is exact for every supported value.
  const fmtMultiplier = (m: number) => `${m.toFixed(1)}×`;

  return (
    <TooltipProvider>
      <Card className="w-full bg-card shadow-[var(--shadow-medium)] border-medical-border flex flex-col max-h-[calc(100vh-4rem)]">
        <CardHeader className="border-b border-medical-border bg-medical-surface flex-shrink-0">
          <CardTitle className="text-lg font-semibold text-primary flex items-center gap-2">
            Simulation Parameters
            <Tooltip>
              <TooltipTrigger>
                <Info className="w-4 h-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Adjust parameters to explore xeno kidney impact</p>
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
              onValueChange={changeStrategy}
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
                <span>Choose which patient populations receive xenotransplants.</span>
              </div>
              {params.targetingStrategy && params.targetingStrategy !== 'standard' && (
                <div className="pl-5 text-[11px] bg-muted/50 p-2 rounded border border-medical-border">
                  {params.targetingStrategy === 'age60_cpraHigh' && `Targets: Patients age 60+ with high cPRA (≥${params.highCPRAThreshold}%)`}
                  {params.targetingStrategy === 'age45_cpraHigh' && `Targets: Patients age 45+ with high cPRA (≥${params.highCPRAThreshold}%)`}
                  {params.targetingStrategy === 'age60_cpraAll' && 'Targets: All patients age 60+, regardless of cPRA'}
                  {params.targetingStrategy === 'age45_cpraAll' && 'Targets: All patients age 45+, regardless of cPRA'}
                </div>
              )}
            </div>
          </div>

          {/* High CPRA Definition */}
          <div className="space-y-3 pb-4 border-b border-medical-border">
            <Label className="text-sm font-medium">High cPRA Definition</Label>
            <div className="flex gap-2">
              {thresholdOptions.map((threshold) => {
                const isActive = params.highCPRAThreshold === threshold;
                return (
                  <button
                    key={threshold}
                    type="button"
                    onClick={() => changeThreshold(threshold)}
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
              <span>
                {isCpraAllStrategy(strategy)
                  ? 'Age-only (any cPRA) strategies are cPRA-threshold-invariant — fixed at 99%+.'
                  : 'Defines who counts as "high cPRA" in this simulation.'}
              </span>
            </div>
          </div>

          {/* Xeno Supply Rate */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Xeno Supply Rate (intended, per year)</Label>
              <span className="text-sm font-semibold text-primary">{xenoKidneysPerYear.toLocaleString()}</span>
            </div>
            <Slider
              value={[supplyIdx]}
              onValueChange={(value) => {
                const idx = Math.min(supplyGridPoints.length - 1, Math.max(0, Math.round(value[0])));
                updateParam('xeno_n', supplyGridPoints[idx]);
              }}
              max={Math.max(0, supplyGridPoints.length - 1)}
              min={0}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums">
              {supplyGridPoints.map((n) => (
                <span key={n} className="whitespace-nowrap">{formatCompact(n)}</span>
              ))}
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                {xenoKidneysPerYear === 0
                  ? 'No xeno kidneys — baseline scenario.'
                  : `${xenoKidneysPerYear.toLocaleString()} xeno procedures/year offered on top of existing human transplants.`}
                {' '}Supply levels are fixed absolute counts chosen so allocation strategies can be compared head-to-head.
                Actual delivered count may be lower if the eligible waitlist drains (see Throughput card).
              </p>
              <button
                type="button"
                onClick={() => toggleSection('xenoProportion')}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                Read more
                {expandedSections.xenoProportion ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>
            {expandedSections.xenoProportion && (
              <div className="text-xs text-muted-foreground space-y-2 p-3 bg-muted rounded-md border border-medical-border">
                <p className="font-medium text-foreground">How Xeno Kidney Counts Are Calculated</p>
                <p>The number of xeno kidneys equals the multiplier × the targeted population's yearly transplant rate (from SRTR 2022 data):</p>
                <p className="font-medium mt-2">Standard (by cPRA only):</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>85+ cPRA: {(2841).toLocaleString()}/year base</li>
                  <li>95+ cPRA: {(1723).toLocaleString()}/year base</li>
                  <li>99+ cPRA: {(974).toLocaleString()}/year base</li>
                </ul>
                <p className="font-medium mt-2">Targeting (uses 99% cPRA threshold):</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Age 60+, High cPRA: {(192).toLocaleString()}/year base</li>
                  <li>Age 45+, High cPRA: {(593).toLocaleString()}/year base</li>
                  <li>Age 60+, Any cPRA: {(8728).toLocaleString()}/year base</li>
                  <li>Age 45+, Any cPRA: {(17705).toLocaleString()}/year base</li>
                </ul>
                <p className="mt-2">
                  For example, Standard 1x with 85+ cPRA adds {(2841).toLocaleString()} xeno kidneys/year.
                  Age 60+ Any cPRA at 0.5x adds {Math.round(8728 * 0.5).toLocaleString()}/year.
                </p>
              </div>
            )}
          </div>

          
          

          {/* Xeno Graft Failure Rate (Relisting) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Xeno Graft Failure Rate (Kidney Rejection)</Label>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">{fmtMultiplier(params.xenoGraftFailureRate)} standard kidney</div>
                <div className="text-xs text-muted-foreground">{meanTimeToGraftFailure} until rejection</div>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {XENO_RELIST_MULTIPLIERS.map((mult) => {
                const isActive = params.xenoGraftFailureRate === mult;
                return (
                  <button
                    key={mult}
                    type="button"
                    onClick={() => updateParam('xenoGraftFailureRate', mult)}
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
                Modeled as a multiplier on a standard human kidney's graft-failure rate (1.0x = same as standard)
              </p>
              <button
                type="button"
                onClick={() => toggleSection('graftFailure')}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                Read more
                {expandedSections.graftFailure ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>
            {expandedSections.graftFailure && (
              <div className="text-xs text-muted-foreground space-y-2 p-3 bg-muted rounded-md border border-medical-border">
                <p className="font-medium text-foreground">Xeno Graft Failure Rate (Kidney Rejection)</p>
                <p>We model a xeno kidney as a <strong>standard human kidney scaled by a multiplier</strong>. At 1.0x, xeno graft failure matches the SRTR-derived rate for a standard human kidney in the same cPRA bin. Below are those reference (1.0x) rates by cPRA threshold &mdash; with the corresponding mean time until the graft fails and the recipient is re-listed back on the waiting list:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>85+ cPRA: {fmtAnnualRate(5.6)} → {fmtMeanTime(5.6)} until rejection</li>
                  <li>95+ cPRA: {fmtAnnualRate(6.8)} → {fmtMeanTime(6.8)} until rejection</li>
                  <li>99+ cPRA: {fmtAnnualRate(8.4)} → {fmtMeanTime(8.4)} until rejection</li>
                </ul>
                <div className="mt-2 pt-2 border-t border-medical-border">
                  <p className="font-medium text-foreground mb-1">Understanding the Multipliers</p>
                  <p>The slider scales these base rates. Mean time to rejection scales inversely:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2 mt-1">
                    <li>0.5x → half the rate, twice as long until rejection</li>
                    <li>1.0x → same as standard human donor kidney</li>
                    <li>1.5x → 50 % worse, ~⅔ the time</li>
                    <li>2.0x → double the rate, half the time</li>
                    <li>0x → no rejection modeled</li>
                  </ul>
                  <p className="mt-2">
                    Currently selected: <strong>{fmtMultiplier(params.xenoGraftFailureRate)}</strong> on {params.highCPRAThreshold}+ cPRA<br />
                    = {fmtAnnualRate(actualGraftFailureAnnual)} ({meanTimeToGraftFailure})
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Xeno Post-Transplant Death Rate — 2-button picker (canonical
              XENO_DEATH_MULTIPLIERS, shared with Bridge). */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HeartPulse className="w-4 h-4 text-primary" />
                <Label className="text-sm font-medium">Xeno Post-Transplant Death Rate</Label>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-primary">
                  {fmtMultiplier(params.postTransplantDeathRate)} standard kidney
                </div>
                <div className="text-xs text-muted-foreground">{meanTimeToPostTxDeath} until death</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {XENO_DEATH_MULTIPLIERS.map((mult) => {
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
                Modeled as a multiplier on a standard human kidney's post-transplant
                death rate (1.0× = same as standard, 1.2× = 20% higher).
              </p>
              <button
                type="button"
                onClick={() => toggleSection('postTxDeath')}
                className="text-xs text-primary hover:underline flex items-center gap-1 flex-shrink-0 ml-2"
              >
                Read more
                {expandedSections.postTxDeath ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>
            {expandedSections.postTxDeath && (
              <div className="text-xs text-muted-foreground space-y-2 p-3 bg-muted rounded-md border border-medical-border">
                <p className="font-medium text-foreground">Xeno Post-Transplant Death Rate</p>
                <p>
                  A xeno recipient's post-transplant death hazard is modeled
                  as a <strong>standard human kidney recipient's hazard
                  scaled by a multiplier</strong>. At 1.0×, the rate equals
                  the SRTR-derived value for a standard human kidney
                  recipient in the same cPRA bin. Reference (1.0×) rates by
                  cPRA threshold:
                </p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>85+ cPRA: {fmtAnnualRate(4.1)} → {fmtMeanTime(4.1)} until death</li>
                  <li>95+ cPRA: {fmtAnnualRate(4.0)} → {fmtMeanTime(4.0)} until death</li>
                  <li>99+ cPRA: {fmtAnnualRate(4.0)} → {fmtMeanTime(4.0)} until death</li>
                </ul>
                <div className="mt-2 pt-2 border-t border-medical-border">
                  <p className="font-medium text-foreground mb-1">Understanding the Multipliers</p>
                  <ul className="list-disc list-inside space-y-1 ml-2 mt-1">
                    <li><strong>1.0×</strong> — xeno post-tx mortality matches a standard human kidney (optimistic baseline)</li>
                    <li><strong>1.2×</strong> — xeno post-tx mortality is 20% higher than a human kidney (realistic central estimate)</li>
                  </ul>
                  <p className="mt-2">
                    Currently selected: <strong>{fmtMultiplier(params.postTransplantDeathRate)}</strong> on {params.highCPRAThreshold}+ cPRA<br />
                    = {fmtAnnualRate(actualPostTxDeathAnnual)} ({meanTimeToPostTxDeath})
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Simulation Horizon */}
          <div className="space-y-3 pt-4 border-t border-medical-border">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Simulation Horizon</Label>
              <div className="flex items-center space-x-2">
                <span className={`text-sm ${params.simulationHorizon === 5 ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                  5 years
                </span>
                <Switch
                  checked={params.simulationHorizon === 10}
                  onCheckedChange={toggleHorizon}
                />
                <span className={`text-sm ${params.simulationHorizon === 10 ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
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

export default SimulationControls;