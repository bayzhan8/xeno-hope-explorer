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
  relistingRate: number;
  simulationHorizon: number;
}

interface SimulationControlsProps {
  params: SimulationParams;
  onParamsChange: (params: SimulationParams) => void;
}

const SimulationControls: React.FC<SimulationControlsProps> = ({ params, onParamsChange }) => {
  const updateParam = (key: keyof SimulationParams, value: number) => {
    onParamsChange({ ...params, [key]: value });
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
          {/* Xeno Acceptance Rate */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Xeno Acceptance Rate</Label>
              <span className="text-sm text-muted-foreground">{(params.xenoAcceptanceRate * 100).toFixed(0)}%</span>
            </div>
            <Slider
              value={[params.xenoAcceptanceRate]}
              onValueChange={(value) => updateParam('xenoAcceptanceRate', value[0])}
              max={1}
              min={0}
              step={0.05}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Fraction of offered xeno kidneys accepted by high-CPRA candidates
            </p>
          </div>

          {/* Xeno Graft Failure Rate */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Xeno Graft Failure Rate</Label>
              <span className="text-sm text-muted-foreground">{(params.xenoGraftFailureRate * 100).toFixed(1)}%/year</span>
            </div>
            <Slider
              value={[params.xenoGraftFailureRate]}
              onValueChange={(value) => updateParam('xenoGraftFailureRate', value[0])}
              max={0.5}
              min={0.02}
              step={0.01}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Annual hazard of xeno graft loss
            </p>
          </div>

          {/* Post-Transplant Death Rate */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Post-Transplant Death Rate</Label>
              <span className="text-sm text-muted-foreground">{(params.postTransplantDeathRate * 100).toFixed(1)}%/year</span>
            </div>
            <Slider
              value={[params.postTransplantDeathRate]}
              onValueChange={(value) => updateParam('postTransplantDeathRate', value[0])}
              max={0.2}
              min={0.01}
              step={0.005}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Annual hazard of death with functioning xeno graft
            </p>
          </div>

          {/* Relisting Rate */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Relisting Rate</Label>
              <span className="text-sm text-muted-foreground">{(params.relistingRate * 100).toFixed(1)}%/year</span>
            </div>
            <Slider
              value={[params.relistingRate]}
              onValueChange={(value) => updateParam('relistingRate', value[0])}
              max={0.3}
              min={0.05}
              step={0.005}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Annual hazard of returning to waitlist after xeno graft failure
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