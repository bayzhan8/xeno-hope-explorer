// Simulation engine for xeno kidney transplant modeling
// Uses a continuous-time Markov model approach

interface SimulationParams {
  xenoAcceptanceRate: number;
  xenoGraftFailureRate: number;
  postTransplantDeathRate: number;
  relistingRate: number;
  simulationHorizon: number;
}

interface PopulationState {
  lowCPRAWaitlist: number;
  highCPRAWaitlist: number;
  lowCPRATransplanted: number;
  highCPRATransplanted: number;
  xenoTransplanted: number;
  deaths: number;
  relistings: number;
}

// Baseline parameters (medical literature estimates)
const BASELINE_PARAMS = {
  initialLowCPRA: 5000,
  initialHighCPRA: 1500,
  arrivalRateLow: 1200, // per year
  arrivalRateHigh: 400, // per year
  humanTransplantRate: 0.3, // per year per person on waitlist
  waitlistDeathRate: 0.08, // per year
  humanGraftFailureRate: 0.05, // per year
  humanPostTransplantDeathRate: 0.03, // per year
  humanRelistingRate: 0.08, // per year
  xenoAvailabilityRate: 200, // xeno kidneys available per year
};

export class SimulationEngine {
  private params: SimulationParams;
  private timeSteps: number;

  constructor(params: SimulationParams) {
    this.params = params;
    this.timeSteps = params.simulationHorizon * 4; // Quarterly time steps
  }

  runSimulation() {
    const results = {
      waitlistData: [] as Array<{ year: number; total: number; lowCPRA: number; highCPRA: number }>,
      deathsData: [] as Array<{ year: number; totalPrevented: number; lowCPRA: number; highCPRA: number }>,
      transplantsData: [] as Array<{ year: number; human: number; xeno: number }>,
      penetrationData: [] as Array<{ year: number; proportion: number }>,
    };

    // Run baseline simulation (no xeno)
    const baselineResults = this.runBaselineSimulation();
    
    // Run xeno simulation
    const xenoResults = this.runXenoSimulation();

    // Calculate differences and populate results
    for (let i = 0; i <= this.params.simulationHorizon; i++) {
      const year = i;
      const baselineIndex = i * 4; // Convert to quarterly index
      const xenoIndex = i * 4;

      // Waitlist data
      results.waitlistData.push({
        year,
        total: xenoResults.states[xenoIndex]?.lowCPRAWaitlist + xenoResults.states[xenoIndex]?.highCPRAWaitlist || 0,
        lowCPRA: xenoResults.states[xenoIndex]?.lowCPRAWaitlist || 0,
        highCPRA: xenoResults.states[xenoIndex]?.highCPRAWaitlist || 0,
      });

      // Deaths prevented
      const baselineDeaths = baselineResults.states[baselineIndex]?.deaths || 0;
      const xenoDeaths = xenoResults.states[xenoIndex]?.deaths || 0;
      const deathsPrevented = Math.max(0, baselineDeaths - xenoDeaths);

      results.deathsData.push({
        year,
        totalPrevented: deathsPrevented,
        lowCPRA: deathsPrevented * 0.3, // Approximate distribution
        highCPRA: deathsPrevented * 0.7,
      });

      // Transplants
      results.transplantsData.push({
        year,
        human: (xenoResults.states[xenoIndex]?.lowCPRATransplanted || 0) + 
               (xenoResults.states[xenoIndex]?.highCPRATransplanted || 0),
        xeno: xenoResults.states[xenoIndex]?.xenoTransplanted || 0,
      });

      // Penetration rate
      const totalHighCPRAEligible = BASELINE_PARAMS.initialHighCPRA + (BASELINE_PARAMS.arrivalRateHigh * year);
      const highCPRATreated = (xenoResults.states[xenoIndex]?.highCPRATransplanted || 0) + 
                              (xenoResults.states[xenoIndex]?.xenoTransplanted || 0);
      
      results.penetrationData.push({
        year,
        proportion: totalHighCPRAEligible > 0 ? highCPRATreated / totalHighCPRAEligible : 0,
      });
    }

    return results;
  }

  private runBaselineSimulation() {
    const states: PopulationState[] = [];
    let currentState: PopulationState = {
      lowCPRAWaitlist: BASELINE_PARAMS.initialLowCPRA,
      highCPRAWaitlist: BASELINE_PARAMS.initialHighCPRA,
      lowCPRATransplanted: 0,
      highCPRATransplanted: 0,
      xenoTransplanted: 0,
      deaths: 0,
      relistings: 0,
    };

    states.push({ ...currentState });

    const dt = 0.25; // Quarterly time steps

    for (let step = 1; step <= this.timeSteps; step++) {
      const newState = { ...currentState };

      // Arrivals
      newState.lowCPRAWaitlist += BASELINE_PARAMS.arrivalRateLow * dt;
      newState.highCPRAWaitlist += BASELINE_PARAMS.arrivalRateHigh * dt;

      // Human transplants
      const lowTransplants = Math.min(
        newState.lowCPRAWaitlist * BASELINE_PARAMS.humanTransplantRate * dt,
        newState.lowCPRAWaitlist
      );
      const highTransplants = Math.min(
        newState.highCPRAWaitlist * BASELINE_PARAMS.humanTransplantRate * dt * 0.3, // Lower rate for high-CPRA
        newState.highCPRAWaitlist
      );

      newState.lowCPRAWaitlist -= lowTransplants;
      newState.highCPRAWaitlist -= highTransplants;
      newState.lowCPRATransplanted += lowTransplants;
      newState.highCPRATransplanted += highTransplants;

      // Waitlist deaths
      const lowDeaths = newState.lowCPRAWaitlist * BASELINE_PARAMS.waitlistDeathRate * dt;
      const highDeaths = newState.highCPRAWaitlist * BASELINE_PARAMS.waitlistDeathRate * dt;

      newState.lowCPRAWaitlist -= lowDeaths;
      newState.highCPRAWaitlist -= highDeaths;
      newState.deaths += lowDeaths + highDeaths;

      // Post-transplant outcomes
      const graftFailures = (newState.lowCPRATransplanted + newState.highCPRATransplanted) * 
                           BASELINE_PARAMS.humanGraftFailureRate * dt;
      const postTransplantDeaths = (newState.lowCPRATransplanted + newState.highCPRATransplanted) * 
                                  BASELINE_PARAMS.humanPostTransplantDeathRate * dt;

      newState.relistings += graftFailures * BASELINE_PARAMS.humanRelistingRate;
      newState.deaths += postTransplantDeaths;

      currentState = newState;
      states.push({ ...currentState });
    }

    return { states };
  }

  private runXenoSimulation() {
    const states: PopulationState[] = [];
    let currentState: PopulationState = {
      lowCPRAWaitlist: BASELINE_PARAMS.initialLowCPRA,
      highCPRAWaitlist: BASELINE_PARAMS.initialHighCPRA,
      lowCPRATransplanted: 0,
      highCPRATransplanted: 0,
      xenoTransplanted: 0,
      deaths: 0,
      relistings: 0,
    };

    states.push({ ...currentState });

    const dt = 0.25; // Quarterly time steps

    for (let step = 1; step <= this.timeSteps; step++) {
      const newState = { ...currentState };

      // Arrivals
      newState.lowCPRAWaitlist += BASELINE_PARAMS.arrivalRateLow * dt;
      newState.highCPRAWaitlist += BASELINE_PARAMS.arrivalRateHigh * dt;

      // Xeno transplants (only for high-CPRA)
      const xenoOffered = BASELINE_PARAMS.xenoAvailabilityRate * dt;
      const xenoAccepted = Math.min(
        xenoOffered * this.params.xenoAcceptanceRate,
        newState.highCPRAWaitlist
      );

      newState.highCPRAWaitlist -= xenoAccepted;
      newState.xenoTransplanted += xenoAccepted;

      // Human transplants (reduced availability due to xeno)
      const availableHumanKidneys = BASELINE_PARAMS.arrivalRateLow * 0.8 * dt; // Assume 80% of arrivals donate
      const lowTransplants = Math.min(
        newState.lowCPRAWaitlist * BASELINE_PARAMS.humanTransplantRate * dt,
        availableHumanKidneys * 0.7 // 70% go to low-CPRA
      );
      const highTransplants = Math.min(
        newState.highCPRAWaitlist * BASELINE_PARAMS.humanTransplantRate * dt * 0.3,
        availableHumanKidneys * 0.3 // 30% go to high-CPRA
      );

      newState.lowCPRAWaitlist -= lowTransplants;
      newState.highCPRAWaitlist -= highTransplants;
      newState.lowCPRATransplanted += lowTransplants;
      newState.highCPRATransplanted += highTransplants;

      // Waitlist deaths
      const lowDeaths = newState.lowCPRAWaitlist * BASELINE_PARAMS.waitlistDeathRate * dt;
      const highDeaths = newState.highCPRAWaitlist * BASELINE_PARAMS.waitlistDeathRate * dt;

      newState.lowCPRAWaitlist -= lowDeaths;
      newState.highCPRAWaitlist -= highDeaths;
      newState.deaths += lowDeaths + highDeaths;

      // Xeno graft outcomes
      const xenoGraftFailures = newState.xenoTransplanted * this.params.xenoGraftFailureRate * dt;
      const xenoPostTransplantDeaths = newState.xenoTransplanted * this.params.postTransplantDeathRate * dt;
      const xenoRelistings = xenoGraftFailures * this.params.relistingRate;

      newState.xenoTransplanted -= xenoGraftFailures + xenoPostTransplantDeaths;
      newState.highCPRAWaitlist += xenoRelistings;
      newState.deaths += xenoPostTransplantDeaths;
      newState.relistings += xenoRelistings;

      // Human graft outcomes
      const humanGraftFailures = (newState.lowCPRATransplanted + newState.highCPRATransplanted) * 
                                BASELINE_PARAMS.humanGraftFailureRate * dt;
      const humanPostTransplantDeaths = (newState.lowCPRATransplanted + newState.highCPRATransplanted) * 
                                       BASELINE_PARAMS.humanPostTransplantDeathRate * dt;

      newState.relistings += humanGraftFailures * BASELINE_PARAMS.humanRelistingRate;
      newState.deaths += humanPostTransplantDeaths;

      currentState = newState;
      states.push({ ...currentState });
    }

    return { states };
  }

  // Calculate summary metrics
  calculateSummaryMetrics() {
    const simulation = this.runSimulation();
    const finalYear = this.params.simulationHorizon;
    
    const finalWaitlist = simulation.waitlistData[finalYear];
    const initialWaitlist = simulation.waitlistData[0];
    const finalTransplants = simulation.transplantsData[finalYear];
    const finalPenetration = simulation.penetrationData[finalYear];
    const totalDeathsPrevented = simulation.deathsData.reduce((sum, d) => sum + d.totalPrevented, 0);

    return {
      waitlistReduction: initialWaitlist.total - finalWaitlist.total,
      deathsPrevented: totalDeathsPrevented,
      totalTransplants: finalTransplants.human + finalTransplants.xeno,
      xenoTransplants: finalTransplants.xeno,
      penetrationRate: finalPenetration.proportion,
      relistingImpact: finalTransplants.xeno * this.params.relistingRate * 0.5, // Approximate impact
    };
  }
}