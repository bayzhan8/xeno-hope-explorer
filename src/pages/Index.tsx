import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, Beaker } from 'lucide-react';
import SimulationControls from '@/components/SimulationControls';
import SimulationCharts from '@/components/SimulationCharts';
import SummaryMetrics from '@/components/SummaryMetrics';
import { SimulationEngine } from '@/utils/simulationEngine';

interface SimulationParams {
  xenoAcceptanceRate: number;
  xenoGraftFailureRate: number;
  postTransplantDeathRate: number;
  relistingRate: number;
  simulationHorizon: number;
  xenoAvailabilityRate: number;
  highCPRAThreshold: number;
}

const Index = () => {
  const [params, setParams] = useState<SimulationParams>({
    xenoAcceptanceRate: 0.6,
    xenoGraftFailureRate: 0.12,
    postTransplantDeathRate: 0.05,
    relistingRate: 0.15,
    simulationHorizon: 5,
    xenoAvailabilityRate: 400,
    highCPRAThreshold: 85,
  });

  // Create simulation engine and run simulation whenever parameters change
  const simulationResults = useMemo(() => {
    const engine = new SimulationEngine(params);
    return {
      data: engine.runSimulation(),
      metrics: engine.calculateSummaryMetrics(),
    };
  }, [params]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-medical-border bg-card shadow-[var(--shadow-soft)]">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="flex items-center justify-center w-10 h-10 bg-primary rounded-lg">
                <Beaker className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-primary">NYU Xeno Kidney Impact Simulator</h1>
                <p className="text-sm text-muted-foreground">
                  Exploring xenotransplantation outcomes for high-CPRA patients
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
              <Activity className="w-4 h-4" />
              <span>Real-time simulation</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
          {/* Controls Sidebar - Sticky */}
          <div className="xl:col-span-1">
            <div className="xl:sticky xl:top-8">
              <SimulationControls params={params} onParamsChange={setParams} />
            </div>
          </div>

          {/* Charts and Metrics */}
          <div className="xl:col-span-3 space-y-8">
            {/* Summary Metrics */}
            <div>
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-primary mb-2">
                  Key Outcomes Summary
                </h2>
                <p className="text-sm text-muted-foreground">
                  Impact metrics over {params.simulationHorizon}-year simulation horizon
                </p>
              </div>
              <SummaryMetrics 
                metrics={simulationResults.metrics} 
                horizon={params.simulationHorizon} 
              />
            </div>

            {/* Charts */}
            <div>
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-primary mb-2">
                  Population Dynamics & Outcomes
                </h2>
                <p className="text-sm text-muted-foreground">
                  Live visualization of waitlist trends, transplant volumes, and mortality impacts
                </p>
              </div>
              <SimulationCharts data={simulationResults.data} />
            </div>

            {/* Model Assumptions */}
            <Card className="bg-medical-surface border-medical-border">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-primary">Model Assumptions</CardTitle>
              </CardHeader>
              <CardContent className="prose prose-sm max-w-none">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <h4 className="font-medium text-foreground mb-2">Population Parameters</h4>
                    <ul className="space-y-1 text-muted-foreground">
                      <li>• Initial Low CPRA waitlist: 5,000 patients</li>
                      <li>• Initial High CPRA waitlist: 1,500 patients</li>
                      <li>• Annual arrivals: 1,200 low, 400 high CPRA</li>
                      <li>• Baseline waitlist mortality: 8%/year</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium text-foreground mb-2">Transplant Parameters</h4>
                    <ul className="space-y-1 text-muted-foreground">
                      <li>• Human transplant rate: 30%/year (low CPRA)</li>
                      <li>• Human transplant rate: 9%/year (high CPRA)</li>
                      <li>• Xeno kidneys available: 200/year</li>
                      <li>• Human graft failure: 5%/year</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
