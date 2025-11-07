import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, Beaker, Loader2 } from 'lucide-react';
import SimulationControls from '@/components/SimulationControls';
import SimulationCharts from '@/components/SimulationCharts';
import SummaryMetrics from '@/components/SummaryMetrics';
import MarkovChainVisualization from '@/components/MarkovChainVisualization';
import { findConfigName, loadVisualizationData } from '@/utils/configFinder';
import { transformVizDataToSimulationData, calculateSummaryMetrics } from '@/utils/dataTransformer';

interface SimulationParams {
  xenoGraftFailureRate: number;
  postTransplantDeathRate: number;
  simulationHorizon: number;
  xeno_proportion: number;
  highCPRAThreshold: number;
}

interface SimulationData {
  waitlistData: Array<{ year: number; total: number; lowCPRA: number; highCPRA: number }>;
  waitlistDeathsData: Array<{ year: number; waitlistDeaths: number }>;
  postTransplantDeathsData: Array<{ year: number; xenoPostTransplantDeaths: number; humanPostTransplantDeaths: number }>;
  netDeathsPreventedData: Array<{ year: number; netDeathsPrevented: number }>;
  graftFailuresData: Array<{ year: number; xenoGraftFailures: number; humanGraftFailures: number }>;
  transplantsData: Array<{ year: number; human: number; xeno: number }>;
  penetrationData: Array<{ year: number; proportion: number }>;
  waitingTimeData: Array<{ year: number; averageWaitingTime: number }>;
  recipientsData: Array<{ year: number; lowHuman: number; highHuman: number; highXeno: number }>;
  cumulativeDeathsData: Array<{ year: number; lowWaitlist: number; highWaitlist: number; lowPostTx: number; highPostTx: number; total: number }>;
  deathsPerYearData: Array<{ year: number; low: number; high: number; total: number }>;
  deathsPerDayData: Array<{ year: number; low: number; high: number; total: number }>;
  netDeathsPreventedPerYearData: Array<{ year: number; low: number; high: number; total: number }>;
}

const Index = () => {
  const [params, setParams] = useState<SimulationParams>({
    xenoGraftFailureRate: 1,
    postTransplantDeathRate: 1,
    simulationHorizon: 10,
    xeno_proportion: 1,
    highCPRAThreshold: 85,
  });

  const [simulationData, setSimulationData] = useState<SimulationData | null>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load visualization data whenever parameters change
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);
      
      try {
        // Find config name from user inputs
        const configName = await findConfigName({
          xeno_proportion: params.xeno_proportion,
          xenoGraftFailureRate: params.xenoGraftFailureRate,
          postTransplantDeathRate: params.postTransplantDeathRate,
        });

        if (!configName) {
          throw new Error('Configuration not found. This combination of parameters may not exist in the database.');
        }

        // Load visualization data
        const vizData = await loadVisualizationData(configName);

        // Transform to simulation data format
        const transformed = transformVizDataToSimulationData({
          ...vizData,
          highCPRAThreshold: params.highCPRAThreshold,
        });

        setSimulationData(transformed);
        setMetrics(calculateSummaryMetrics(transformed, params.simulationHorizon));
      } catch (err) {
        console.error('Error loading visualization data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load visualization data');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [params.xeno_proportion, params.xenoGraftFailureRate, params.postTransplantDeathRate, params.simulationHorizon, params.highCPRAThreshold]);

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
                  Exploring xenotransplantation outcomes for high-CPRA ({params.highCPRAThreshold}%+) patients
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
              <Activity className="w-4 h-4" />
              <span>Pre-computed simulation data</span>
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
            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <span className="ml-3 text-muted-foreground">Loading visualization data...</span>
              </div>
            )}

            {error && (
              <Card className="bg-destructive/10 border-destructive">
                <CardContent className="p-6">
                  <p className="text-destructive font-medium">Error loading data</p>
                  <p className="text-sm text-muted-foreground mt-2">{error}</p>
                </CardContent>
              </Card>
            )}

            {!loading && !error && simulationData && metrics && (
              <>
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
                    metrics={metrics} 
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
                      Visualization of waitlist trends, transplant volumes, and mortality impacts
                    </p>
                  </div>
                  <SimulationCharts data={simulationData} highCPRAThreshold={params.highCPRAThreshold} />
                </div>
              </>
            )}

            {/* Markov Chain Visualization */}
            <div>
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-primary mb-2">
                  Model Structure
                </h2>
                <p className="text-sm text-muted-foreground">
                  Patient states and transition pathways in the xenotransplantation model
                </p>
              </div>
              <MarkovChainVisualization highCPRAThreshold={params.highCPRAThreshold} />
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
                      <li>• Initial High CPRA ({params.highCPRAThreshold}%+) waitlist: 1,500 patients</li>
                      <li>• Annual arrivals: 1,200 low CPRA, 400 high CPRA ({params.highCPRAThreshold}%+)</li>
                      <li>• Baseline waitlist mortality: 8%/year</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium text-foreground mb-2">Transplant Parameters</h4>
                    <ul className="space-y-1 text-muted-foreground">
                      <li>• Human transplant rate: 30%/year (low CPRA)</li>
                      <li>• Human transplant rate: 9%/year (high CPRA {params.highCPRAThreshold}%+)</li>
                      <li>• Xeno kidneys available: {Math.round(400 * params.xeno_proportion)}/year ({params.xeno_proportion}x baseline)</li>
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
