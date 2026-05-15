import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Info, ChevronDown, ChevronUp, Target, Hourglass, Lock } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getXenoBaseRate } from '@/utils/dataTransformer';
import { BRIDGE_SURVIVAL_MONTHS, type BridgeSurvivalMonths } from '@/utils/configFinder';
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
  /** Multiplier on the human post-tx death rate. Hard-locked to 1.0 in
   *  bridge mode for now (the baked input pickle uses 1.0). The slot
   *  exists so we can flip it on later without touching every consumer. */
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
                  Bridge mode treats xenografts as a temporary transplant: each
                  one keeps a high-cPRA patient alive for a known mean duration,
                  then they return to the waiting list for a permanent human
                  transplant.
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

          {/* Xeno Kidneys Per Year */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Xeno Kidneys Per Year</Label>
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
            <div className="flex justify-between text-xs text-muted-foreground">
              {[0, 0.5, 1, 1.5, 2, 3, 4].map((m) => (
                <span key={m}>{Math.round(xenoBaseRate * m).toLocaleString()}</span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {xenoKidneysPerYear.toLocaleString()} bridging xeno kidneys added per year
              ({params.xeno_proportion}x of {xenoBaseRate.toLocaleString()} base)
            </p>
          </div>

          {/* Mean Graft Survival — the bridge-defining parameter */}
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
                Mean time the xenograft keeps the recipient transplanted before
                rejection (re-listing) or death-with-functioning-graft.
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
                  Bridge Therapy assumes each xenograft has a known average
                  useful lifetime in the recipient — a clinical "bridge" that
                  buys the patient time while they wait for a permanent human
                  kidney. We bake exactly your selected duration into a
                  per-age combined hazard (relisting + death-with-tx), so a
                  6-month bridge means an average of 6 months of useful
                  function regardless of the recipient's age bin.
                </p>
                <p>
                  At the end of that period the patient typically returns to
                  the waitlist (most cases) or dies with a functioning graft
                  (less common). Both outcomes are captured by the same
                  combined-hazard target.
                </p>
              </div>
            )}
          </div>

          {/* Post-tx death — locked at 1.0 in bridge mode for now */}
          <div className="space-y-3 pt-4 border-t border-medical-border">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium flex items-center gap-2">
                Post-Transplant Death Rate
                <Lock className="w-3.5 h-3.5 text-muted-foreground" />
              </Label>
              <span className="text-sm text-muted-foreground">1.00x (locked)</span>
            </div>
            <p className="text-xs text-muted-foreground">
              In Bridge Therapy mode the post-transplant death rate is held at
              the human-kidney baseline (1.0×). Future versions may enable a
              1.2× / 1.5× / 2.0× sensitivity slider here.
            </p>
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
