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
  waitlistDeathsPerYearData: Array<{ year: number; waitlistDeaths: number; baseWaitlistDeaths?: number }>;
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
          highCPRAThreshold: params.highCPRAThreshold,
        });

        if (!configName) {
          throw new Error('Configuration not found. This combination of parameters may not exist in the database.');
        }

        // Load visualization data
        const vizData = await loadVisualizationData(configName);

        // Load base case data if comparison is available
        let baseVizData = null;
        let baseConfigName = vizData.base_config_name;
        
        // If base_config_name is not set, determine it automatically based on CPRA threshold
        // Use consistent naming pattern: xeno_cpra{threshold}_prop0_relist0_death0
        if (!baseConfigName) {
          const cpraThreshold = params.highCPRAThreshold;
          baseConfigName = `xeno_cpra${cpraThreshold}_prop0_relist0_death0`;
        }
        
        // Try to load base case - always attempt if we have a config name
        if (baseConfigName) {
          try {
            baseVizData = await loadVisualizationData(baseConfigName);
          } catch (err) {
            console.warn(`Could not load base case data (${baseConfigName}) for comparison:`, err);
          }
        }

        // Transform to simulation data format
        const transformed = transformVizDataToSimulationData({
          ...vizData,
          highCPRAThreshold: params.highCPRAThreshold,
        }, baseVizData);

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
        <div className="container mx-auto px-3 py-4">
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
      <main className="container mx-auto px-0 py-8">
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
          {/* Controls Sidebar - Sticky */}
          <div className="xl:col-span-1">
            <div className="xl:sticky xl:top-8">
              <SimulationControls params={params} onParamsChange={setParams} />
            </div>
          </div>

          {/* Charts and Metrics */}
          <div className="xl:col-span-4 space-y-8 px-2">
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
                  <SimulationCharts data={simulationData} highCPRAThreshold={params.highCPRAThreshold} simulationHorizon={params.simulationHorizon} />
                </div>
              </>
            )}

            {/* Model Structure & Assumptions */}
            <div>
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-primary mb-2">
                  Model Structure & Assumptions
                </h2>
                <p className="text-sm text-muted-foreground">
                  Markov Chain model showing patient states and transition pathways
                </p>
              </div>
              <MarkovChainVisualization highCPRAThreshold={params.highCPRAThreshold} />
              <Card className="bg-medical-surface border-medical-border mt-6">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-primary">How the Model Works</CardTitle>
                </CardHeader>
                <CardContent className="prose prose-sm max-w-none">
                  <div className="text-sm text-muted-foreground space-y-3">
                    <p>
                      This simulation uses a <strong className="text-foreground">Markov Chain model</strong> where each patient exists in one of four states:
                    </p>
                    <ul className="list-disc list-inside space-y-2 ml-4">
                      <li><strong className="text-foreground">C</strong> - Candidate on the waiting list</li>
                      <li><strong className="text-foreground">H</strong> - Human donor kidney recipient</li>
                      <li><strong className="text-foreground">X</strong> - Xeno kidney recipient</li>
                      <li><strong className="text-foreground">D</strong> - Deceased</li>
                    </ul>
                    <p>
                      The model uses <strong className="text-foreground">transition rates</strong> based on 2022 data for annual transplant, listing, relisting, and death rates. 
                      Xenotransplantation rates are varied based on assumptions about xeno kidney availability and efficacy.
                    </p>
                    <p>
                      The simulation starts with initial state sizes matching the number of candidates and recipients from early 2022. 
                      At each time point, events (like transplants or deaths) are generated with probabilities proportional to the corresponding rates. 
                      When an event occurs, the state sizes update accordingly. For example, a human donor transplant decreases the candidate count (C) by one and increases the human recipient count (H) by one.
                    </p>
                    <p>
                      The simulation continues until reaching the specified time horizon ({params.simulationHorizon} years).
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
