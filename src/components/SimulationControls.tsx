import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface SimulationParams {
  xenoAcceptanceRate: number;
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

  return (
    <TooltipProvider>
      <Card className="w-full bg-card shadow-[var(--shadow-medium)] border-medical-border">
        <CardHeader className="border-b border-medical-border bg-medical-surface">
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
        <CardContent className="space-y-6 p-6">


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
            <p className="text-xs text-muted-foreground">
              Scaling factor for xeno kidney availability (baseline: 400/year)
            </p>
          </div>

          
          

          {/* Xeno Graft Failure Rate (Relisting) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Xeno Graft Failure Rate (Relisting)</Label>
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
            <p className="text-xs text-muted-foreground">
              Discrete multiplier for xeno graft failure (for UI only)
            </p>
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
            <p className="text-xs text-muted-foreground">
              Discrete multiplier for xeno post-transplant death (for UI only)
            </p>
          </div>

          {/* Xeno Acceptance Rate (Locked) */}
          <div className="space-y-3 opacity-60">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Xeno Acceptance Rate</Label>
              <span className="text-sm text-muted-foreground">100%</span>
            </div>
            <Slider
              value={[100]}
              max={100}
              min={0}
              step={20}
              className="w-full"
              disabled
            />
            <p className="text-xs text-muted-foreground">
              Not available yet. Will be configurable in a future update.
            </p>
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