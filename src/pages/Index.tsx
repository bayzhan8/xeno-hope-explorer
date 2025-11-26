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
                  <div className="text-sm text-muted-foreground space-y-5">
                    {/* Introduction */}
                    <div>
                      <p>
                        To understand how xenotransplantation might reshape kidney transplant outcomes, we need a way to model the complex dynamics of the transplant waiting list. Patients arrive, receive transplants, experience graft failures, and unfortunately, some die—all while the system continuously evolves. This simulation uses a <strong className="text-foreground">continuous-time Markov chain</strong> to capture these dynamics, treating each patient transition as a probabilistic event that occurs at rates determined by real-world data.
                      </p>
                    </div>

                    {/* The Problem We're Solving */}
                    <div>
                      <h4 className="text-foreground font-semibold mb-2">The Challenge</h4>
                      <p>
                        The kidney transplant system is a complex network of patient flows. Each day, new patients join the waiting list, some receive transplants (from human donors or potentially xenotransplants), others experience graft failures and return to the list, and tragically, some die while waiting or after transplantation. The question we're asking is: <em>What happens if we introduce xenotransplantation as an option for high-cPRA patients?</em>
                      </p>
                      <p className="mt-2">
                        To answer this, we need to track how patients move between different states over time. We partition patients by their calculated panel reactive antibody (cPRA) level—a measure of how difficult it is to find a compatible donor. Patients with cPRA ≥ {params.highCPRAThreshold}% face significantly longer wait times and higher mortality rates, making them ideal candidates for xenotransplantation.
                      </p>
                    </div>

                    {/* Patient States */}
                    <div>
                      <h4 className="text-foreground font-semibold mb-2">Tracking Patient States</h4>
                      <p>
                        At any moment, each patient exists in one of six possible states:
                      </p>
                      <ul className="list-disc list-inside space-y-1 ml-4 mt-2">
                        <li><strong className="text-foreground">C<sub>L</sub></strong> and <strong className="text-foreground">C<sub>H</sub></strong> — Low and high-cPRA candidates waiting on the list</li>
                        <li><strong className="text-foreground">H<sub>low</sub></strong> — Low-cPRA recipients with human donor kidneys</li>
                        <li><strong className="text-foreground">H<sub>high</sub></strong> — High-cPRA recipients with standard human donor kidneys</li>
                        <li><strong className="text-foreground">H<sub>xeno</sub></strong> — High-cPRA recipients with xenotransplanted kidneys</li>
                        <li><strong className="text-foreground">D</strong> — Deceased (an absorbing state, tracked cumulatively)</li>
                      </ul>
                      <p className="mt-2">
                        The model tracks how many patients are in each state at any given time, and how these numbers change as events occur.
                      </p>
                    </div>

                    {/* How Events Work */}
                    <div>
                      <h4 className="text-foreground font-semibold mb-2">How Events Drive the System</h4>
                      <p>
                        The simulation works by generating events—transplants, deaths, arrivals, and so on—that occur at rates determined by the current state of the system. Think of it like this: if there are 1,000 patients on the waiting list and the death rate is 0.1% per day, we expect about 1 death per day. But these events are probabilistic, not deterministic.
                      </p>
                      <p className="mt-2">
                        We distinguish between two types of rates:
                      </p>
                      <ul className="list-disc list-inside space-y-1 ml-4 mt-1">
                        <li><strong className="text-foreground">Absolute rates</strong> (α<sub>L</sub>, α<sub>H</sub>, τ<sub>L</sub>, τ<sub>H</sub>) — These are fixed numbers, like "91 new patients join the high-cPRA waitlist per day," regardless of how many patients are currently waiting.</li>
                        <li><strong className="text-foreground">Population-dependent rates</strong> (δ<sub>wl</sub>, δ<sub>h</sub>, δ<sub>x</sub>, ρ, ρ<sub>x</sub>, θ) — These scale with the current population. If 1,000 patients are waiting and the death rate is 0.1% per day, we expect 1 death. If 2,000 are waiting, we expect 2 deaths. For example, waitlist deaths scale as δ<sub>wl</sub> × C, post-transplant deaths as δ<sub>h</sub> × H<sub>high</sub> or δ<sub>x</sub> × H<sub>xeno</sub>, and relisting as ρ × H<sub>low</sub>, ρ × H<sub>high</sub>, or ρ<sub>x</sub> × H<sub>xeno</sub>.</li>
                      </ul>
                    </div>

                    {/* Transplant Allocation Logic */}
                    <div>
                      <h4 className="text-foreground font-semibold mb-2">Transplant Allocation: A Key Design Choice</h4>
                      <p>
                        One of the model's most important features is how it handles transplant allocation. When high-cPRA candidates are available, they receive priority for transplants. But what happens when we run out of high-cPRA candidates? In reality, those transplant opportunities don't disappear—they get reallocated to low-cPRA patients. This is captured by the rule:
                      </p>
                      <p className="mt-2 ml-4 italic">
                        τ<sub>L</sub> = τ<sub>L_base</sub> + τ<sub>H_base</sub> when C<sub>H</sub> = 0
                      </p>
                      <p className="mt-2">
                        This ensures that transplant opportunities are never wasted, reflecting real-world allocation practices.
                      </p>
                    </div>

                    {/* Xenotransplantation */}
                    <div>
                      <h4 className="text-foreground font-semibold mb-2">Modeling Xenotransplantation</h4>
                      <p>
                        Xenotransplantation enters the model through the proportion parameter π. When π = 1.0, all high-cPRA transplants are xenotransplants. When π = 0.5, half are xenotransplants and half are standard human donor transplants. This allows us to explore scenarios ranging from "no xenotransplantation" (π = 0) to "xenotransplantation replaces all high-cPRA transplants" (π = 1.0 or higher).
                      </p>
                      <p className="mt-2">
                        Crucially, we assume that xenotransplant recipients may have different outcomes than standard transplant recipients. Their graft failure rate (ρ<sub>x</sub>) and post-transplant death rate (δ<sub>x</sub>) are modeled as multipliers of the high-cPRA base rates:
                      </p>
                      <p className="mt-2 ml-4">
                        ρ<sub>x</sub> = ρ × <em>m</em><sub>ρ</sub> &nbsp;&nbsp;&nbsp; δ<sub>x</sub> = δ<sub>h</sub> × <em>m</em><sub>d</sub>
                      </p>
                      <p className="mt-2">
                        When the multiplier is 1.0, xenotransplants perform identically to standard transplants. When it's 0.5, they perform twice as well. When it's 2.0, they perform twice as poorly. This flexibility lets us explore a wide range of "what if" scenarios about xeno kidney efficacy.
                      </p>
                    </div>

                    {/* Simulation Process */}
                    <div>
                      <h4 className="text-foreground font-semibold mb-2">The Simulation Process</h4>
                      <p>
                        The simulation proceeds in discrete steps, but time flows continuously. Here's how it works:
                      </p>
                      <ol className="list-decimal list-inside space-y-2 ml-4 mt-2">
                        <li>
                          <strong className="text-foreground">Start</strong> — Initialize the system with real 2022 data: how many patients were waiting, how many had received transplants, and so on. No xenotransplants exist yet.
                        </li>
                        <li>
                          <strong className="text-foreground">Calculate rates</strong> — At the current time <em>t</em>, compute all possible event rates. The total rate Λ(<em>t</em>) is the sum of all individual rates.
                        </li>
                        <li>
                          <strong className="text-foreground">Wait for next event</strong> — The time until the next event is exponentially distributed with rate Λ(<em>t</em>). On average, events occur more frequently when rates are higher.
                        </li>
                        <li>
                          <strong className="text-foreground">Choose event type</strong> — Which event happens? The probability of event type <em>i</em> is proportional to its rate: <em>p</em><sub><em>i</em></sub> = λ<sub><em>i</em></sub>(<em>t</em>) / Λ(<em>t</em>). Faster events are more likely.
                        </li>
                        <li>
                          <strong className="text-foreground">Update states</strong> — Apply the event. A transplant moves a patient from C to H. A death removes a patient. A graft failure moves a patient from H back to C.
                        </li>
                        <li>
                          <strong className="text-foreground">Repeat</strong> — Continue until we reach the time horizon ({params.simulationHorizon} years) or until all rates become zero.
                        </li>
                      </ol>
                    </div>

                    {/* Data Sources */}
                    <div className="pt-3 border-t border-medical-border">
                      <h4 className="text-foreground font-semibold mb-2">Grounding in Real Data</h4>
                      <p>
                        Every rate in this model comes from the 2022 Scientific Registry of Transplant Recipients (SRTR) database. We estimate arrival rates from new listings, transplant rates from actual transplant counts, and death rates from mortality data. These rates are calculated separately for low and high-cPRA populations, reflecting the reality that high-cPRA patients face different challenges.
                      </p>
                      <p className="mt-2">
                        The model uses fixed random seeds for reproducibility, meaning that identical parameter settings will produce identical results. This allows for fair comparisons between different scenarios while still capturing the inherent randomness of the system.
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
