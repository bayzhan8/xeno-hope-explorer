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
                <h1 className="text-2xl font-bold text-primary">Xeno Kidney Impact Simulator</h1>
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
                  <div className="text-sm text-muted-foreground space-y-4">
                    {/* State Space */}
                    <div>
                      <h4 className="text-foreground font-semibold mb-2">State Space</h4>
                      <p>
                        The model partitions patients into two cPRA groups (low and high) with the following states:
                      </p>
                      <ul className="list-disc list-inside space-y-1 ml-4 mt-2">
                        <li><strong className="text-foreground">C<sub>L</sub></strong> - Low-cPRA candidates on the waiting list</li>
                        <li><strong className="text-foreground">C<sub>H</sub></strong> - High-cPRA candidates on the waiting list</li>
                        <li><strong className="text-foreground">H<sub>L</sub></strong> - Low-cPRA recipients with human donor kidneys</li>
                        <li><strong className="text-foreground">H<sub>H_std</sub></strong> - High-cPRA recipients with human donor kidneys</li>
                        <li><strong className="text-foreground">H<sub>H_xeno</sub></strong> - High-cPRA recipients with xeno kidneys</li>
                        <li><strong className="text-foreground">D</strong> - Deceased (tracked as cumulative counts), absorbing state</li>
                      </ul>
                    </div>

                    {/* Transition Rates */}
                    <div>
                      <h4 className="text-foreground font-semibold mb-2">Transition Rates</h4>
                      <p>
                        The model uses a <strong className="text-foreground">continuous-time Markov chain</strong> with event rates calculated as follows:
                      </p>
                      <p className="mt-2">
                        <strong className="text-foreground">Arrival rates</strong> (constant, independent of state):
                      </p>
                      <ul className="list-disc list-inside space-y-1 ml-4 mt-1">
                        <li>α<sub>L</sub> = arrival rate for low-cPRA candidates</li>
                        <li>α<sub>H</sub> = arrival rate for high-cPRA candidates</li>
                      </ul>
                      <p className="mt-2">
                        <strong className="text-foreground">Transplant rates</strong> (state-dependent):
                      </p>
                      <ul className="list-disc list-inside space-y-1 ml-4 mt-1">
                        <li>Low-cPRA transplants: τ<sub>L</sub> = τ<sub>L_base</sub> + τ<sub>H_base</sub> if C<sub>H</sub> = 0 (high-cPRA exhausted), else τ<sub>L_base</sub></li>
                        <li>High-cPRA standard transplants: τ<sub>H</sub> = τ<sub>H_base</sub> if C<sub>H</sub> &gt; 0, else 0</li>
                        <li>High-cPRA xeno transplants: τ<sub>H_x</sub> = τ<sub>H</sub> × π if C<sub>H</sub> &gt; 0, else 0</li>
                      </ul>
                      <p className="mt-2">
                        <strong className="text-foreground">Death and failure rates</strong> (proportional to current population):
                      </p>
                      <ul className="list-disc list-inside space-y-1 ml-4 mt-1">
                        <li>Waitlist deaths: δ<sub>wlL</sub> × C<sub>L</sub>, δ<sub>wlH</sub> × C<sub>H</sub></li>
                        <li>Post-transplant deaths: δ<sub>hL</sub> × H<sub>L</sub>, δ<sub>h</sub> × H<sub>H_std</sub>, δ<sub>x</sub> × H<sub>H_xeno</sub></li>
                        <li>Relisting (graft failure): ρ × H<sub>L</sub>, ρ × H<sub>H_std</sub>, ρ<sub>x</sub> × H<sub>H_xeno</sub></li>
                        <li>Waitlist removals: θ<sub>L</sub> × C<sub>L</sub>, θ<sub>H</sub> × C<sub>H</sub></li>
                      </ul>
                    </div>

                    {/* Simulation Algorithm */}
                    <div>
                      <h4 className="text-foreground font-semibold mb-2">Simulation Algorithm</h4>
                      <ol className="list-decimal list-inside space-y-2 ml-4 mt-2">
                        <li>
                          <strong className="text-foreground">Initialization</strong>: Set C<sub>L</sub>(0) = C<sub>L_start</sub>, C<sub>H</sub>(0) = C<sub>H_start</sub>, H<sub>L</sub>(0) = H<sub>L_start</sub>, H<sub>H_std</sub>(0) = H<sub>H_std_start</sub>, H<sub>H_xeno</sub>(0) = 0
                        </li>
                        <li>
                          <strong className="text-foreground">Event generation</strong>: At time <em>t</em>, compute total rate Λ(<em>t</em>) = Σ<sub><em>i</em></sub> λ<sub><em>i</em></sub>(<em>t</em>). The time to next event is exponentially distributed: Δ<em>t</em> ~ Exp(Λ(<em>t</em>))
                        </li>
                        <li>
                          <strong className="text-foreground">Event selection</strong>: Select event type <em>i</em> with probability <em>p</em><sub><em>i</em></sub> = λ<sub><em>i</em></sub>(<em>t</em>) / Λ(<em>t</em>)
                        </li>
                        <li>
                          <strong className="text-foreground">State update</strong>: Apply the selected event:
                          <ul className="list-disc list-inside space-y-1 ml-6 mt-1">
                            <li>Arrival: C<sub>L</sub> or C<sub>H</sub> increases by 1</li>
                            <li>Transplant: C decreases by 1, corresponding H increases by 1</li>
                            <li>Death: C or H decreases by 1, D increases by 1</li>
                            <li>Relisting: H decreases by 1, C increases by 1</li>
                            <li>Removal: C decreases by 1</li>
                          </ul>
                        </li>
                        <li>
                          <strong className="text-foreground">Iteration</strong>: Repeat until <em>t</em> ≥ <em>T</em> (time horizon, typically {params.simulationHorizon} years)
                        </li>
                      </ol>
                    </div>

                    {/* Key Assumptions */}
                    <div>
                      <h4 className="text-foreground font-semibold mb-2">Key Assumptions</h4>
                      <ul className="list-disc list-inside space-y-2 ml-4 mt-2">
                        <li>
                          <strong className="text-foreground">Rate estimation</strong>: All base rates are estimated from 2022 SRTR data as annual rates per person-day
                        </li>
                        <li>
                          <strong className="text-foreground">Xeno efficacy</strong>: Xeno relisting and death rates are multipliers of high-cPRA base rates: ρ<sub>x</sub> = ρ × <em>m</em><sub>ρ</sub>, δ<sub>x</sub> = δ<sub>h</sub> × <em>m</em><sub>d</sub>
                        </li>
                        <li>
                          <strong className="text-foreground">Xeno availability</strong>: When xeno_proportion = π, high-cPRA transplants are split: π fraction receive xeno, (1 − π) receive standard
                        </li>
                        <li>
                          <strong className="text-foreground">Organ allocation</strong>: When high-cPRA candidates are exhausted (C<sub>H</sub> = 0), their transplant rate is reallocated to low-cPRA candidates
                        </li>
                        <li>
                          <strong className="text-foreground">Independence</strong>: Events occur independently with rates proportional to current state sizes
                        </li>
                        <li>
                          <strong className="text-foreground">No capacity constraints</strong>: Transplant rates are not limited by donor availability beyond the estimated rates
                        </li>
                      </ul>
                    </div>

                    {/* Rate Sources */}
                    <div className="pt-2 border-t border-medical-border">
                      <h4 className="text-foreground font-semibold mb-2">Rate Sources</h4>
                      <p className="text-xs">
                        All rates are derived from 2022 SRTR data:
                      </p>
                      <ul className="list-disc list-inside space-y-1 ml-4 mt-1 text-xs">
                        <li><strong className="text-foreground">Arrival rates</strong>: New listings per day</li>
                        <li><strong className="text-foreground">Transplant rates</strong>: Transplants per day (estimated from annual counts)</li>
                        <li><strong className="text-foreground">Death rates</strong>: Deaths per person-day on waitlist or post-transplant</li>
                        <li><strong className="text-foreground">Relisting rates</strong>: Graft failures per person-day post-transplant</li>
                        <li><strong className="text-foreground">Removal rates</strong>: Other removals per person-day on waitlist</li>
                      </ul>
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
