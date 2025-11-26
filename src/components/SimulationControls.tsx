import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Info, ChevronDown, ChevronUp } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface SimulationParams {
  xenoGraftFailureRate: number;
  postTransplantDeathRate: number;
  simulationHorizon: number;
  xeno_proportion: number;
  highCPRAThreshold: number;
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

  const snapTo = (value: number, allowedValues: number[]) => {
    return allowedValues.reduce(
      (prev, curr) => (Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev),
      allowedValues[0]
    );
  };

  const toggleHorizon = () => {
    updateParam('simulationHorizon', params.simulationHorizon === 5 ? 10 : 5);
  };

  // Base rates based on CPRA threshold
  const baseRates = {
    85: {
      transplantsPerYear: 2933,
      graftFailureRate: 5.60,
      postTxDeathRate: 4.12
    },
    95: {
      transplantsPerYear: 1812,
      graftFailureRate: 6.81,
      postTxDeathRate: 3.96
    },
    99: {
      transplantsPerYear: 1048,
      graftFailureRate: 8.36,
      postTxDeathRate: 3.96
    }
  };

  const currentRates = baseRates[params.highCPRAThreshold as keyof typeof baseRates] || baseRates[85];
  
  // Calculate actual rates based on multipliers
  const actualGraftFailureRate = (currentRates.graftFailureRate * params.xenoGraftFailureRate).toFixed(2);
  const actualPostTxDeathRate = (currentRates.postTxDeathRate * params.postTransplantDeathRate).toFixed(2);

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


          {/* High CPRA Definition */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">High CPRA Definition</Label>
              <span className="text-sm text-muted-foreground">{params.highCPRAThreshold}%+</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => updateParam('highCPRAThreshold', 85)}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  params.highCPRAThreshold === 85 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                85%+
              </button>
              <button
                onClick={() => updateParam('highCPRAThreshold', 95)}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  params.highCPRAThreshold === 95 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                95%+
              </button>
              <button
                onClick={() => updateParam('highCPRAThreshold', 99)}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  params.highCPRAThreshold === 99 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                99%+
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              CPRA threshold for xeno kidney eligibility
            </p>
          </div>



          {/* Xeno Proportion */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Xeno Proportion</Label>
              <span className="text-sm text-muted-foreground">{params.xeno_proportion}x</span>
            </div>
            <Slider
              value={[params.xeno_proportion]}
              onValueChange={(value) => updateParam('xeno_proportion', snapTo(value[0], [0, 0.5, 1, 1.5, 2]))}
              max={2}
              min={0}
              step={0.5}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0x</span>
              <span>0.5x</span>
              <span>1x</span>
              <span>1.5x</span>
              <span>2x</span>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Coefficient multiplied by high cPRA transplant rate
              </p>
              <button
                onClick={() => toggleSection('xenoProportion')}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                Read more
                {expandedSections.xenoProportion ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>
            {expandedSections.xenoProportion && (
              <div className="text-xs text-muted-foreground space-y-2 p-3 bg-muted rounded-md border border-medical-border">
                <p className="font-medium text-foreground">High cPRA Transplants Per Year</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>85+ cPRA: 2,933 transplants/year</li>
                  <li>95+ cPRA: 1,812 transplants/year</li>
                  <li>99+ cPRA: 1,048 transplants/year</li>
                </ul>
                <p className="mt-2">
                  The xeno proportion multiplies the number of high-cPRA transplants that become xenotransplants. 
                  For example, with 1.0x, all high-cPRA transplants would be xenotransplants. With 0.5x, half would be xenotransplants.
                </p>
              </div>
            )}
          </div>

          
          

          {/* Xeno Graft Failure Rate (Relisting) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Xeno Graft Failure Rate (Kidney Rejection)</Label>
              <span className="text-sm text-muted-foreground">{params.xenoGraftFailureRate.toFixed(2)}x</span>
            </div>
            <Slider
              value={[params.xenoGraftFailureRate]}
              onValueChange={(value) => updateParam('xenoGraftFailureRate', snapTo(value[0], [0, 0.5, 1, 1.5, 2]))}
              max={2}
              min={0}
              step={0.5}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0x</span>
              <span>0.5x</span>
              <span>1x</span>
              <span>1.5x</span>
              <span>2x</span>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Coefficient multiplied by high cPRA graft failure rate
              </p>
              <button
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
                <p>Rate at which xeno kidneys fail and patients return to the waiting list:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>85+ cPRA: 5.60% per year (about 5.6 out of 100 patients)</li>
                  <li>95+ cPRA: 6.81% per year (about 6.8 out of 100 patients)</li>
                  <li>99+ cPRA: 8.36% per year (about 8.4 out of 100 patients)</li>
                </ul>
                <div className="mt-2 pt-2 border-t border-medical-border">
                  <p className="font-medium text-foreground mb-1">Understanding the Multipliers</p>
                  <p>These rates are base rates. The actual xeno rates depend on the multiplier:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2 mt-1">
                    <li>Multiplier 0.5 = half the rate (better than standard)</li>
                    <li>Multiplier 1.0 = same as standard human donor kidney</li>
                    <li>Multiplier 1.5 = 50% worse than standard</li>
                    <li>Multiplier 2.0 = double the rate (twice as bad)</li>
                  </ul>
                  <p className="mt-2">
                    For example, with multiplier = 1.0 (same as standard):<br />
                    {params.highCPRAThreshold}+ cPRA: {currentRates.graftFailureRate}% graft failure per year
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Xeno Post-Transplant Death Rate */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Xeno Post-Transplant Death Rate</Label>
              <span className="text-sm text-muted-foreground">{params.postTransplantDeathRate.toFixed(2)}x</span>
            </div>
            <Slider
              value={[params.postTransplantDeathRate]}
              onValueChange={(value) => updateParam('postTransplantDeathRate', snapTo(value[0], [0, 0.5, 1, 1.5, 2]))}
              max={2}
              min={0}
              step={0.5}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0x</span>
              <span>0.5x</span>
              <span>1x</span>
              <span>1.5x</span>
              <span>2x</span>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Coefficient multiplied by high cPRA post-transplant death rate
              </p>
              <button
                onClick={() => toggleSection('postTxDeath')}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                Read more
                {expandedSections.postTxDeath ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>
            {expandedSections.postTxDeath && (
              <div className="text-xs text-muted-foreground space-y-2 p-3 bg-muted rounded-md border border-medical-border">
                <p className="font-medium text-foreground">Xeno Post-Transplant Death Rate</p>
                <p>Rate at which patients die after receiving a xeno kidney:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>85+ cPRA: 4.12% per year (about 4.1 out of 100 patients)</li>
                  <li>95+ cPRA: 3.96% per year (about 4.0 out of 100 patients)</li>
                  <li>99+ cPRA: 3.96% per year (about 4.0 out of 100 patients)</li>
                </ul>
                <div className="mt-2 pt-2 border-t border-medical-border">
                  <p className="font-medium text-foreground mb-1">Understanding the Multipliers</p>
                  <p>These rates are base rates. The actual xeno rates depend on the multiplier:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2 mt-1">
                    <li>Multiplier 0.5 = half the rate (better than standard)</li>
                    <li>Multiplier 1.0 = same as standard human donor kidney</li>
                    <li>Multiplier 1.5 = 50% worse than standard</li>
                    <li>Multiplier 2.0 = double the rate (twice as bad)</li>
                  </ul>
                  <p className="mt-2">
                    For example, with multiplier = 1.0 (same as standard):<br />
                    {params.highCPRAThreshold}+ cPRA: {currentRates.postTxDeathRate}% death per year
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