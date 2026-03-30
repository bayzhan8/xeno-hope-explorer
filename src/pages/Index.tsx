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
  waitlistData: Array<{ year: number; total: number; lowCPRA: number; highCPRA: number; baseHighCPRA?: number; baseLowCPRA?: number; baseTotal?: number }>;
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
    highCPRAThreshold: 95, // Age-stratified data uses 95% threshold
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

        // For age-stratified data, base case is simply xeno_age_prop0
        if (!baseConfigName) {
          baseConfigName = 'xeno_age_prop0';
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
        console.log('[Index] About to transform vizData:', {
          hasWaitlistSizes: !!vizData.waitlist_sizes,
          hasWaitlistSeries: !!vizData.waitlist_sizes?.series,
          waitlistSeriesLength: vizData.waitlist_sizes?.series?.length,
          hasWaitlistX: !!vizData.waitlist_sizes?.x,
          waitlistXLength: vizData.waitlist_sizes?.x?.length,
        });

        const transformed = transformVizDataToSimulationData({
          ...vizData,
          highCPRAThreshold: params.highCPRAThreshold,
        }, baseVizData);

        console.log('[Index] Transformation successful');
        setSimulationData(transformed);
        setMetrics(calculateSummaryMetrics(transformed, params.simulationHorizon));
      } catch (err) {
        console.error('Error loading visualization data:', err);
        console.error('Full error:', err);
        if (err instanceof Error) {
          console.error('Error stack:', err.stack);
        }
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
      <header className="sticky top-0 z-50 border-b border-medical-border bg-card/95 backdrop-blur-sm shadow-sm transition-shadow">
        <div className="container mx-auto px-4 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center justify-center w-12 h-12 bg-gradient-to-br from-primary to-primary/80 rounded-xl shadow-md">
                <Beaker className="w-7 h-7 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-primary tracking-tight">Xeno Kidney Impact Simulator</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Age-stratified analysis of xenotransplantation outcomes • cPRA {params.highCPRAThreshold}%+ threshold
                </p>
              </div>
            </div>
            <div className="hidden md:flex items-center space-x-2 px-3 py-2 bg-muted/50 rounded-lg border border-medical-border">
              <Activity className="w-4 h-4 text-primary" />
              <span className="text-xs font-medium text-muted-foreground">CTMC Simulation Data</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-0 py-8">
        {/* Birds Eye Summary */}
        <Card className="bg-gradient-to-br from-medical-surface to-medical-surface/30 border-medical-border mb-8 shadow-md">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Activity className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-foreground mb-2">About This Simulator</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  This simulator explores how xenotransplantation might impact kidney transplant outcomes for high-cPRA patients.
                  Using a continuous-time Markov chain model based on 2022 SRTR data, it projects waitlist dynamics, transplant volumes,
                  and mortality outcomes over a {params.simulationHorizon}-year horizon. Adjust the parameters below to explore different
                  scenarios for xeno availability, graft failure rates, and post-transplant mortality.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

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
              <Card className="shadow-lg border-medical-border">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <div className="relative">
                    <Loader2 className="w-12 h-12 animate-spin text-primary" />
                    <div className="absolute inset-0 w-12 h-12 animate-ping rounded-full bg-primary/20"></div>
                  </div>
                  <p className="mt-6 text-base font-medium text-foreground">Loading Simulation Data</p>
                  <p className="mt-2 text-sm text-muted-foreground">Fetching visualization data from the database...</p>
                </CardContent>
              </Card>
            )}

            {error && (
              <Card className="bg-destructive/10 border-destructive shadow-lg">
                <CardContent className="p-8">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-12 h-12 rounded-full bg-destructive/20 flex items-center justify-center">
                      <Activity className="w-6 h-6 text-destructive" />
                    </div>
                    <div className="flex-1">
                      <p className="text-lg font-semibold text-destructive">Error Loading Data</p>
                      <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{error}</p>
                      <p className="text-xs text-muted-foreground mt-4">Try adjusting the parameters or refreshing the page.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {!loading && !error && simulationData && metrics && (
              <>
                {/* Summary Metrics */}
                <div>
                  <div className="mb-6 pb-4 border-b border-medical-border">
                    <h2 className="text-2xl font-bold text-primary mb-2 tracking-tight">
                      Key Outcomes Summary
                    </h2>
                    <p className="text-sm text-muted-foreground leading-relaxed">
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
                  <div className="mb-6 pb-4 border-b border-medical-border">
                    <h2 className="text-2xl font-bold text-primary mb-2 tracking-tight">
                      Population Dynamics & Outcomes
                    </h2>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Visualization of waitlist trends, transplant volumes, and mortality impacts
                    </p>
                  </div>
                  <SimulationCharts data={simulationData} highCPRAThreshold={params.highCPRAThreshold} simulationHorizon={params.simulationHorizon} />
                </div>
              </>
            )}

            {/* Model Structure & Assumptions */}
            <div>
              <div className="mb-6 pb-4 border-b border-medical-border">
                <h2 className="text-2xl font-bold text-primary mb-2 tracking-tight">
                  Model Structure & Assumptions
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Markov Chain model showing patient states and transition pathways
                </p>
              </div>
              <MarkovChainVisualization highCPRAThreshold={params.highCPRAThreshold} />
              <Card className="bg-gradient-to-br from-medical-surface to-medical-surface/30 border-medical-border mt-6 shadow-lg">
                <CardHeader className="border-b border-medical-border pb-4">
                  <CardTitle className="text-xl font-bold text-primary tracking-tight">How the Model Works</CardTitle>
                  <p className="text-sm text-muted-foreground mt-2">Continuous-time Markov chain simulation explained</p>
                </CardHeader>
                <CardContent className="prose prose-sm max-w-none">
                  <div className="text-sm text-muted-foreground space-y-5">
                    {/* Summary */}
                    <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                      <h4 className="text-foreground font-bold mb-2">In Brief</h4>
                      <p className="text-xs leading-relaxed">
                        We simulate the U.S. kidney transplant system using a <strong>Markov chain model</strong> with real 2022 SRTR data. Patients flow between states (waiting, transplanted, deceased) based on probabilistic rates. Xenotransplants are added for high-cPRA patients (those with antibodies making donor matching difficult). We measure how many lives could be saved.
                      </p>
                    </div>

                    {/* Introduction - Shorter */}
                    <div>
                      <p>
                        The transplant system is complex: patients arrive, get transplants, experience graft failures, or die. This simulation tracks these dynamics using a <strong className="text-foreground">continuous-time Markov chain</strong>—treating each transition as a probabilistic event based on real-world data.
                      </p>
                    </div>

                    {/* The Problem We're Solving */}
                    <div className="border-l-2 border-primary/30 pl-4">
                      <h4 className="text-foreground font-semibold mb-2 text-base">The Question</h4>
                      <p className="mb-2">
                        <em className="text-foreground">What happens if we add xenotransplantation for high-cPRA patients?</em>
                      </p>
                      <p className="text-xs">
                        <strong className="text-foreground">cPRA (calculated Panel Reactive Antibody)</strong> measures how difficult it is to find a compatible donor. High-cPRA patients (≥{params.highCPRAThreshold}%) wait longer and face higher death rates—making them ideal xenotransplant candidates.
                      </p>
                    </div>

                    {/* Patient States - Simplified */}
                    <div className="bg-muted/30 rounded-lg p-4">
                      <h4 className="text-foreground font-semibold mb-3 text-base">Six Patient States</h4>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="flex items-start gap-2">
                          <span className="text-blue-500 font-mono mt-0.5">C<sub>L</sub></span>
                          <span>Low-cPRA waiting</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-red-500 font-mono mt-0.5">C<sub>H</sub></span>
                          <span>High-cPRA waiting</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-green-500 font-mono mt-0.5">H<sub>L</sub></span>
                          <span>Low-cPRA transplanted (human)</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-green-600 font-mono mt-0.5">H<sub>std</sub></span>
                          <span>High-cPRA transplanted (human)</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-purple-500 font-mono mt-0.5">H<sub>xeno</sub></span>
                          <span>High-cPRA transplanted (xeno)</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-gray-500 font-mono mt-0.5">D</span>
                          <span>Deceased</span>
                        </div>
                      </div>
                    </div>

                    {/* How Events Work - Condensed */}
                    <details className="group">
                      <summary className="cursor-pointer list-none">
                        <h4 className="text-foreground font-semibold mb-2 text-base inline-flex items-center gap-2">
                          How Events Work
                          <span className="text-xs text-muted-foreground font-normal">(click to expand)</span>
                        </h4>
                      </summary>
                      <div className="mt-3 pl-4 border-l-2 border-muted space-y-2 text-xs">
                        <p>Events (transplants, deaths, arrivals) occur at <strong className="text-foreground">probabilistic rates</strong>. Example: 1,000 patients + 0.1% daily death rate = ~1 death/day.</p>
                        <div className="space-y-2">
                          <div>
                            <strong className="text-foreground">Fixed rates</strong> — New arrivals, transplant supply (constant regardless of list size)
                          </div>
                          <div>
                            <strong className="text-foreground">Population-dependent rates</strong> — Deaths, graft failures (scale with population size)
                          </div>
                        </div>
                      </div>
                    </details>

                    {/* Transplant Allocation Logic - Condensed */}
                    <details className="group">
                      <summary className="cursor-pointer list-none">
                        <h4 className="text-foreground font-semibold mb-2 text-base inline-flex items-center gap-2">
                          Transplant Reallocation
                          <span className="text-xs text-muted-foreground font-normal">(click to expand)</span>
                        </h4>
                      </summary>
                      <div className="mt-3 pl-4 border-l-2 border-muted text-xs space-y-2">
                        <p>High-cPRA patients get priority. But if no high-cPRA patients are waiting, those organs go to low-cPRA patients instead—nothing is wasted.</p>
                        <p className="font-mono text-xs bg-muted/50 p-2 rounded">
                          τ<sub>L</sub> = τ<sub>L_base</sub> + τ<sub>H_base</sub> when C<sub>H</sub> = 0
                        </p>
                      </div>
                    </details>

                    {/* Xenotransplantation - Clearer */}
                    <div className="border-l-2 border-purple-500/30 pl-4">
                      <h4 className="text-foreground font-semibold mb-2 text-base">Xenotransplant Parameters</h4>
                      <div className="space-y-2 text-xs">
                        <p>
                          <strong className="text-foreground">Proportion (π):</strong> π=1 means all high-cPRA transplants are xeno. π=0.5 means half xeno, half human.
                        </p>
                        <p>
                          <strong className="text-foreground">Outcome multipliers:</strong> We model xeno kidneys as potentially performing differently than human kidneys.
                        </p>
                        <div className="bg-muted/50 p-2 rounded font-mono text-xs space-y-1">
                          <div>Graft failure: ρ<sub>x</sub> = ρ × <em>m</em><sub>ρ</sub></div>
                          <div>Death rate: δ<sub>x</sub> = δ<sub>h</sub> × <em>m</em><sub>d</sub></div>
                        </div>
                        <p className="text-xs italic">
                          Multiplier 1.0 = same as human. 0.5 = twice as good. 2.0 = twice as bad.
                        </p>
                      </div>
                    </div>

                    {/* Simulation Process - Collapsible */}
                    <details className="group">
                      <summary className="cursor-pointer list-none">
                        <h4 className="text-foreground font-semibold mb-2 text-base inline-flex items-center gap-2">
                          The Simulation Algorithm
                          <span className="text-xs text-muted-foreground font-normal">(click to expand)</span>
                        </h4>
                      </summary>
                      <div className="mt-3 pl-4 border-l-2 border-muted text-xs space-y-2">
                        <ol className="list-decimal list-inside space-y-2 ml-2">
                          <li><strong className="text-foreground">Initialize</strong> with 2022 SRTR data (baseline: no xenotransplants)</li>
                          <li><strong className="text-foreground">Calculate rates</strong> for all possible events</li>
                          <li><strong className="text-foreground">Sample next event time</strong> (exponentially distributed)</li>
                          <li><strong className="text-foreground">Choose event type</strong> (probability ∝ rate)</li>
                          <li><strong className="text-foreground">Update populations</strong> (move patients between states)</li>
                          <li><strong className="text-foreground">Repeat</strong> until {params.simulationHorizon} years</li>
                        </ol>
                      </div>
                    </details>

                    {/* Data Sources - Condensed */}
                    <div className="pt-3 border-t border-medical-border">
                      <h4 className="text-foreground font-semibold mb-2 text-base">Data Source</h4>
                      <p className="text-xs">
                        All rates derived from the <strong className="text-foreground">2022 SRTR database</strong> (Scientific Registry of Transplant Recipients). Low and high-cPRA populations modeled separately. Fixed random seeds ensure reproducibility.
                      </p>
                    </div>
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
