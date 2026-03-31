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
            <div className="xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto xl:self-start">
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
                  <div className="text-sm text-muted-foreground space-y-5 pt-5">
                    {/* Summary */}
                    <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                      <h4 className="text-foreground font-bold mb-2">In Brief</h4>
                      <p className="text-xs leading-relaxed">
                        We simulate the U.S. kidney transplant system using a <strong>continuous-time Markov chain model</strong> with real 2022 SRTR data. Patients flow between states (waiting, transplanted, deceased) based on probabilistic rates. Xenotransplants are added for high-cPRA patients (those with antibodies making donor matching difficult). We measure how many lives could be saved.
                      </p>
                    </div>

                    {/* Introduction - Full */}
                    <div>
                      <p>
                        To understand how xenotransplantation might reshape kidney transplant outcomes, we need a way to model the complex dynamics of the transplant waiting list. Patients arrive, receive transplants, experience graft failures, and unfortunately, some die—all while the system continuously evolves. This simulation uses a <strong className="text-foreground">continuous-time Markov chain</strong> to capture these dynamics, treating each patient transition as a probabilistic event that occurs at rates determined by real-world data.
                      </p>
                    </div>

                    {/* The Problem We're Solving - Full */}
                    <div className="border-l-2 border-primary/30 pl-4">
                      <h4 className="text-foreground font-semibold mb-2 text-base">The Challenge</h4>
                      <p>
                        The kidney transplant system is a complex network of patient flows. Each day, new patients join the waiting list, some receive transplants (from human donors or potentially xenotransplants), others experience graft failures and return to the list, and tragically, some die while waiting or after transplantation. The question we're asking is: <em className="text-foreground">What happens if we introduce xenotransplantation as an option for high-cPRA patients?</em>
                      </p>
                      <p className="mt-2">
                        To answer this, we need to track how patients move between different states over time. We partition patients by their calculated panel reactive antibody (cPRA) level—a measure of how difficult it is to find a compatible donor. Patients with cPRA ≥ {params.highCPRAThreshold}% face significantly longer wait times and higher mortality rates, making them ideal candidates for xenotransplantation.
                      </p>
                    </div>

                    {/* Patient States - Full with better formatting */}
                    <div className="bg-muted/30 rounded-lg p-4">
                      <h4 className="text-foreground font-semibold mb-3 text-base">Tracking Patient States</h4>
                      <p className="mb-3 text-xs">
                        At any moment, each patient exists in one of six possible states:
                      </p>
                      <ul className="list-disc list-inside space-y-1.5 ml-4 text-xs">
                        <li><strong className="text-foreground">C<sub>L</sub></strong> and <strong className="text-foreground">C<sub>H</sub></strong> — Low and high-cPRA candidates waiting on the list</li>
                        <li><strong className="text-foreground">H<sub>L</sub></strong> — Low-cPRA recipients with human donor kidneys</li>
                        <li><strong className="text-foreground">H<sub>H_std</sub></strong> — High-cPRA recipients with standard human donor kidneys</li>
                        <li><strong className="text-foreground">H<sub>H_xeno</sub></strong> — High-cPRA recipients with xenotransplanted kidneys</li>
                        <li><strong className="text-foreground">D</strong> — Deceased (an absorbing state, tracked cumulatively)</li>
                      </ul>
                      <p className="mt-3 text-xs">
                        The model tracks how many patients are in each state at any given time, and how these numbers change as events occur.
                      </p>
                    </div>

                    {/* How Events Work - Full */}
                    <details className="group">
                      <summary className="cursor-pointer list-none">
                        <h4 className="text-foreground font-semibold mb-2 text-base inline-flex items-center gap-2">
                          How Events Drive the System
                          <span className="text-xs text-muted-foreground font-normal">(click to expand)</span>
                        </h4>
                      </summary>
                      <div className="mt-3 pl-4 border-l-2 border-muted space-y-2 text-xs">
                        <p>
                          The simulation works by generating events—transplants, deaths, arrivals, and so on—that occur at rates determined by the current state of the system. Think of it like this: if there are 1,000 patients on the waiting list and the death rate is 0.1% per day, we expect about 1 death per day. But these events are probabilistic, not deterministic.
                        </p>
                        <p className="mt-2">
                          We distinguish between two types of rates:
                        </p>
                        <ul className="list-disc list-inside space-y-1.5 ml-4 mt-1">
                          <li><strong className="text-foreground">Absolute rates</strong> (α<sub>L</sub>, α<sub>H</sub>, τ<sub>L</sub>, τ<sub>H</sub>) — These are fixed numbers, like "91 new patients join the high-cPRA waitlist per day," regardless of how many patients are currently waiting.</li>
                          <li><strong className="text-foreground">Population-dependent rates</strong> (δ<sub>wl</sub>, δ<sub>h</sub>, δ<sub>x</sub>, ρ, ρ<sub>x</sub>, θ) — These scale with the current population. If 1,000 patients are waiting and the death rate is 0.1% per day, we expect 1 death. If 2,000 are waiting, we expect 2 deaths.</li>
                        </ul>
                      </div>
                    </details>

                    {/* Transplant Allocation Logic - Full */}
                    <details className="group">
                      <summary className="cursor-pointer list-none">
                        <h4 className="text-foreground font-semibold mb-2 text-base inline-flex items-center gap-2">
                          Transplant Allocation: A Key Design Choice
                          <span className="text-xs text-muted-foreground font-normal">(click to expand)</span>
                        </h4>
                      </summary>
                      <div className="mt-3 pl-4 border-l-2 border-muted text-xs space-y-2">
                        <p>
                          One of the model's most important features is how it handles transplant allocation. When high-cPRA candidates are available, they receive priority for transplants. But what happens when we run out of high-cPRA candidates? In reality, those transplant opportunities don't disappear—they get reallocated to low-cPRA patients. This is captured by the rule:
                        </p>
                        <p className="mt-2 ml-4 italic font-mono bg-muted/50 p-2 rounded">
                          τ<sub>L</sub> = τ<sub>L_base</sub> + τ<sub>H_base</sub> when C<sub>H</sub> = 0
                        </p>
                        <p className="mt-2">
                          This ensures that transplant opportunities are never wasted, reflecting real-world allocation practices.
                        </p>
                      </div>
                    </details>

                    {/* Xenotransplantation - Full */}
                    <div className="border-l-2 border-purple-500/30 pl-4">
                      <h4 className="text-foreground font-semibold mb-2 text-base">Modeling Xenotransplantation</h4>
                      <div className="space-y-2 text-xs">
                        <p>
                          Xenotransplantation enters the model through the proportion parameter π. When π = 1.0, all high-cPRA transplants are xenotransplants. When π = 0.5, half are xenotransplants and half are standard human donor transplants. This allows us to explore scenarios ranging from "no xenotransplantation" (π = 0) to "xenotransplantation replaces all high-cPRA transplants" (π = 1.0 or higher).
                        </p>
                        <p className="mt-2">
                          Crucially, we assume that xenotransplant recipients may have different outcomes than standard transplant recipients. Their graft failure rate (ρ<sub>x</sub>) and post-transplant death rate (δ<sub>x</sub>) are modeled as multipliers of the high-cPRA base rates:
                        </p>
                        <div className="bg-muted/50 p-2 rounded font-mono text-xs space-y-1 mt-2">
                          <div>ρ<sub>x</sub> = ρ × <em>m</em><sub>ρ</sub></div>
                          <div>δ<sub>x</sub> = δ<sub>h</sub> × <em>m</em><sub>d</sub></div>
                        </div>
                        <p className="mt-2">
                          When the multiplier is 1.0, xenotransplants perform identically to standard transplants. When it's 0.5, they perform twice as well. When it's 2.0, they perform twice as poorly. This flexibility lets us explore a wide range of "what if" scenarios about xeno kidney efficacy.
                        </p>
                      </div>
                    </div>

                    {/* Simulation Process - Full */}
                    <details className="group">
                      <summary className="cursor-pointer list-none">
                        <h4 className="text-foreground font-semibold mb-2 text-base inline-flex items-center gap-2">
                          The Simulation Process
                          <span className="text-xs text-muted-foreground font-normal">(click to expand)</span>
                        </h4>
                      </summary>
                      <div className="mt-3 pl-4 border-l-2 border-muted text-xs space-y-2">
                        <p>
                          The simulation proceeds in discrete steps, but time flows continuously. Here's how it works:
                        </p>
                        <ol className="list-decimal list-inside space-y-2 ml-2 mt-2">
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
                    </details>

                    {/* Data Sources - Full */}
                    <div className="pt-3 border-t border-medical-border">
                      <h4 className="text-foreground font-semibold mb-2 text-base">Grounding in Real Data</h4>
                      <p className="text-xs">
                        Every rate in this model comes from the 2022 Scientific Registry of Transplant Recipients (SRTR) database. We estimate arrival rates from new listings, transplant rates from actual transplant counts, and death rates from mortality data. These rates are calculated separately for low and high-cPRA populations, reflecting the reality that high-cPRA patients face different challenges.
                      </p>
                      <p className="mt-2 text-xs">
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
