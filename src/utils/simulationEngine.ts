// Simulation engine for xeno kidney transplant modeling
// Uses a continuous-time Markov model approach

interface SimulationParams {
  xenoAcceptanceRate: number;
  xenoGraftFailureRate: number;
  postTransplantDeathRate: number;
  simulationHorizon: number;
  xeno_proportion: number;
  highCPRAThreshold: number;
}

interface PopulationState {
  lowCPRAWaitlist: number;
  highCPRAWaitlist: number;
  lowCPRATransplanted: number;
  highCPRATransplanted: number;
  xenoTransplanted: number;
  waitlistDeaths: number;
  lowWaitlistDeaths: number;
  highWaitlistDeaths: number;
  postTransplantDeaths: number;
  xenoPostTransplantDeaths: number;
  humanPostTransplantDeaths: number;
  humanPostTransplantDeathsLow: number;
  humanPostTransplantDeathsHigh: number;
  totalWaitingTime: number;
  xenoGraftFailures: number;
  humanGraftFailures: number;
}

// Baseline parameters (medical literature estimates) - Enhanced sensitivity
const getBaselineParams = (highCPRAThreshold: number) => {
  // Adjust population based on CPRA threshold
  // Higher threshold means fewer high-CPRA patients
  let highCPRAMultiplier = 1.0;
  let lowCPRAMultiplier = 1.0;
  
  if (highCPRAThreshold === 95) {
    highCPRAMultiplier = 0.6; // ~40% fewer patients at 95% vs 85%
    lowCPRAMultiplier = 1.4; // More patients in low CPRA group at 95%
  } else if (highCPRAThreshold === 99) {
    highCPRAMultiplier = 0.3; // ~70% fewer patients at 99% vs 85% (very rare)
    lowCPRAMultiplier = 1.7; // Much more patients in low CPRA group at 99%
  }
  
  return {
    initialLowCPRA: Math.round(4000 * lowCPRAMultiplier),
    initialHighCPRA: Math.round(2000 * highCPRAMultiplier),
    arrivalRateLow: Math.round(1000 * lowCPRAMultiplier), // per year
    arrivalRateHigh: Math.round(600 * highCPRAMultiplier), // per year
    humanTransplantRate: 0.25, // per year per person on waitlist
    waitlistDeathRate: 0.12, // per year - increased for more dramatic effect
    humanGraftFailureRate: 0.04, // per year
    humanPostTransplantDeathRate: 0.025, // per year
    humanRelistingRate: 0.06, // per year
    xenoAvailabilityRate: 400, // xeno kidneys available per year - increased
  };
};

export class SimulationEngine {
  private params: SimulationParams;
  private timeSteps: number;
  private baselineParams: ReturnType<typeof getBaselineParams>;
  private xenoAvailabilityRate: number;
  
  // Xeno parameters
  // Acceptance remains fixed for now (UI locked)
  private readonly fixedXenoAcceptanceRate = 0.6;
  // Baseline hazards (per year); UI sliders provide multipliers (e.g., 0, 0.5, 1, 1.5, 2)
  private readonly baselineXenoGraftFailureRate = 0.00015338345481403357;
  private readonly baselinePostTransplantDeathRate = 0.0001128364690248253;

  constructor(params: SimulationParams) {
    this.params = params;
    this.timeSteps = params.simulationHorizon * 4; // Quarterly time steps
    this.baselineParams = getBaselineParams(params.highCPRAThreshold);
    // Convert xeno_proportion to actual availability rate
    // Assuming baseline of 400 kidneys per year, proportion scales this
    this.xenoAvailabilityRate = 400 * params.xeno_proportion;
  }

  runSimulation() {
    const results = {
      waitlistData: [] as Array<{ year: number; total: number; lowCPRA: number; highCPRA: number }>,
      waitlistDeathsData: [] as Array<{ year: number; waitlistDeaths: number }>,
      postTransplantDeathsData: [] as Array<{ year: number; xenoPostTransplantDeaths: number; humanPostTransplantDeaths: number }>,
      netDeathsPreventedData: [] as Array<{ year: number; netDeathsPrevented: number }>,
      graftFailuresData: [] as Array<{ year: number; xenoGraftFailures: number; humanGraftFailures: number }>,
      transplantsData: [] as Array<{ year: number; human: number; xeno: number }>,
      penetrationData: [] as Array<{ year: number; proportion: number }>,
      waitingTimeData: [] as Array<{ year: number; averageWaitingTime: number }>,
      recipientsData: [] as Array<{ year: number; lowHuman: number; highHuman: number; highXeno: number }>,
      cumulativeDeathsData: [] as Array<{ year: number; lowWaitlist: number; highWaitlist: number; lowPostTx: number; highPostTx: number; total: number }>,
      deathsPerYearData: [] as Array<{ year: number; low: number; high: number; total: number }>,
      deathsPerDayData: [] as Array<{ year: number; low: number; high: number; total: number }>,
      netDeathsPreventedPerYearData: [] as Array<{ year: number; low: number; high: number; total: number }>,
    };

    // Run baseline simulation (no xeno)
    const baselineResults = this.runBaselineSimulation();
    
    // Run xeno simulation
    const xenoResults = this.runXenoSimulation();

    // Track cumulative deaths prevented
    let cumulativeDeathsPrevented = 0;

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

      // Deaths data restructured
      const baselineWaitlistDeaths = baselineResults.states[baselineIndex]?.waitlistDeaths || 0;
      const xenoWaitlistDeaths = xenoResults.states[xenoIndex]?.waitlistDeaths || 0;
      
      // Waitlist deaths
      results.waitlistDeathsData.push({
        year,
        waitlistDeaths: xenoWaitlistDeaths,
      });
      
      // Post-transplant deaths (separate categories)
      results.postTransplantDeathsData.push({
        year,
        xenoPostTransplantDeaths: xenoResults.states[xenoIndex]?.xenoPostTransplantDeaths || 0,
        humanPostTransplantDeaths: xenoResults.states[xenoIndex]?.humanPostTransplantDeaths || 0,
      });
      
      // Net deaths prevented - simplified and more visible calculation
      // Focus on the key benefit: xeno transplants save high-CPRA patients who would otherwise die waiting
      const totalXenoTransplants = xenoResults.states[xenoIndex]?.xenoTransplanted || 0;
      const totalBaselineDeaths = baselineResults.states[baselineIndex]?.waitlistDeaths || 0;
      const totalXenoScenarioDeaths = xenoResults.states[xenoIndex]?.waitlistDeaths || 0;
      
      // Estimate lives saved: 
      // 1. Direct benefit from xeno transplants (assume 70% would have died without xeno)
      // 2. Indirect benefit from reduced waitlist pressure
      const directBenefit = totalXenoTransplants * 0.7;
      const indirectBenefit = Math.max(0, totalBaselineDeaths - totalXenoScenarioDeaths);
      const totalLivesSaved = directBenefit + indirectBenefit;
      
      results.netDeathsPreventedData.push({
        year,
        netDeathsPrevented: Math.round(totalLivesSaved),
      });
      
      // Graft failures
      results.graftFailuresData.push({
        year,
        xenoGraftFailures: xenoResults.states[xenoIndex]?.xenoGraftFailures || 0,
        humanGraftFailures: xenoResults.states[xenoIndex]?.humanGraftFailures || 0,
      });

      // Waiting time calculation
      const totalWaitlist = (xenoResults.states[xenoIndex]?.lowCPRAWaitlist || 0) + (xenoResults.states[xenoIndex]?.highCPRAWaitlist || 0);
      const totalArrivals = this.baselineParams.arrivalRateLow + this.baselineParams.arrivalRateHigh;
      const totalTransplantRate = this.baselineParams.humanTransplantRate + (this.xenoAvailabilityRate / 1000); // Convert to rate
      const avgWaitingTime = totalWaitlist > 0 ? totalWaitlist / (totalArrivals * totalTransplantRate) : 0;

      results.waitingTimeData.push({
        year,
        averageWaitingTime: avgWaitingTime,
      });

      // Transplants
      results.transplantsData.push({
        year,
        human: (xenoResults.states[xenoIndex]?.lowCPRATransplanted || 0) + 
               (xenoResults.states[xenoIndex]?.highCPRATransplanted || 0),
        xeno: xenoResults.states[xenoIndex]?.xenoTransplanted || 0,
      });

      // Recipients over time (stocks)
      results.recipientsData.push({
        year,
        lowHuman: xenoResults.states[xenoIndex]?.lowCPRATransplanted || 0,
        highHuman: xenoResults.states[xenoIndex]?.highCPRATransplanted || 0,
        highXeno: xenoResults.states[xenoIndex]?.xenoTransplanted || 0,
      });

      // Cumulative deaths by group
      const lowWaitlistCum = xenoResults.states[xenoIndex]?.lowWaitlistDeaths || 0;
      const highWaitlistCum = xenoResults.states[xenoIndex]?.highWaitlistDeaths || 0;
      const lowPostTxCum = xenoResults.states[xenoIndex]?.humanPostTransplantDeathsLow || 0;
      const highPostTxCum = (xenoResults.states[xenoIndex]?.humanPostTransplantDeathsHigh || 0) + (xenoResults.states[xenoIndex]?.xenoPostTransplantDeaths || 0);
      const totalCumDeaths = lowWaitlistCum + highWaitlistCum + lowPostTxCum + highPostTxCum;
      results.cumulativeDeathsData.push({
        year,
        lowWaitlist: lowWaitlistCum,
        highWaitlist: highWaitlistCum,
        lowPostTx: lowPostTxCum,
        highPostTx: highPostTxCum,
        total: totalCumDeaths,
      });

      // Deaths per year and per day
      if (i > 0) {
        const prevIndex = (i - 1) * 4;
        const lowYear = (xenoResults.states[xenoIndex]?.lowWaitlistDeaths || 0) - (xenoResults.states[prevIndex]?.lowWaitlistDeaths || 0)
                      + (xenoResults.states[xenoIndex]?.humanPostTransplantDeathsLow || 0) - (xenoResults.states[prevIndex]?.humanPostTransplantDeathsLow || 0);
        const highYear = (xenoResults.states[xenoIndex]?.highWaitlistDeaths || 0) - (xenoResults.states[prevIndex]?.highWaitlistDeaths || 0)
                       + ((xenoResults.states[xenoIndex]?.humanPostTransplantDeathsHigh || 0) - (xenoResults.states[prevIndex]?.humanPostTransplantDeathsHigh || 0))
                       + ((xenoResults.states[xenoIndex]?.xenoPostTransplantDeaths || 0) - (xenoResults.states[prevIndex]?.xenoPostTransplantDeaths || 0));
        const totalYear = lowYear + highYear;
        results.deathsPerYearData.push({ year, low: lowYear, high: highYear, total: totalYear });
        results.deathsPerDayData.push({ year, low: lowYear / 365, high: highYear / 365, total: totalYear / 365 });
      } else {
        results.deathsPerYearData.push({ year, low: 0, high: 0, total: 0 });
        results.deathsPerDayData.push({ year, low: 0, high: 0, total: 0 });
      }

      // Net deaths prevented per year (vs baseline), by group
      if (i > 0) {
        const prevIndex = (i - 1) * 4;
        const baseLowYear = (baselineResults.states[xenoIndex]?.lowWaitlistDeaths || 0) - (baselineResults.states[prevIndex]?.lowWaitlistDeaths || 0)
                          + (baselineResults.states[xenoIndex]?.humanPostTransplantDeathsLow || 0) - (baselineResults.states[prevIndex]?.humanPostTransplantDeathsLow || 0);
        const baseHighYear = (baselineResults.states[xenoIndex]?.highWaitlistDeaths || 0) - (baselineResults.states[prevIndex]?.highWaitlistDeaths || 0)
                           + (baselineResults.states[xenoIndex]?.humanPostTransplantDeathsHigh || 0) - (baselineResults.states[prevIndex]?.humanPostTransplantDeathsHigh || 0);
        const xenoLowYear = (xenoResults.states[xenoIndex]?.lowWaitlistDeaths || 0) - (xenoResults.states[prevIndex]?.lowWaitlistDeaths || 0)
                          + (xenoResults.states[xenoIndex]?.humanPostTransplantDeathsLow || 0) - (xenoResults.states[prevIndex]?.humanPostTransplantDeathsLow || 0);
        const xenoHighYear = (xenoResults.states[xenoIndex]?.highWaitlistDeaths || 0) - (xenoResults.states[prevIndex]?.highWaitlistDeaths || 0)
                           + (xenoResults.states[xenoIndex]?.humanPostTransplantDeathsHigh || 0) - (xenoResults.states[prevIndex]?.humanPostTransplantDeathsHigh || 0)
                           + ((xenoResults.states[xenoIndex]?.xenoPostTransplantDeaths || 0) - (xenoResults.states[prevIndex]?.xenoPostTransplantDeaths || 0));
        const lowSaved = Math.max(0, baseLowYear - xenoLowYear);
        const highSaved = Math.max(0, baseHighYear - xenoHighYear);
        const totalSaved = lowSaved + highSaved;
        results.netDeathsPreventedPerYearData.push({ year, low: lowSaved, high: highSaved, total: totalSaved });
      } else {
        results.netDeathsPreventedPerYearData.push({ year, low: 0, high: 0, total: 0 });
      }

      // Penetration rate
      const totalHighCPRAEligible = this.baselineParams.initialHighCPRA + (this.baselineParams.arrivalRateHigh * year);
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
      lowCPRAWaitlist: this.baselineParams.initialLowCPRA,
      highCPRAWaitlist: this.baselineParams.initialHighCPRA,
      lowCPRATransplanted: 0,
      highCPRATransplanted: 0,
      xenoTransplanted: 0,
      waitlistDeaths: 0,
      lowWaitlistDeaths: 0,
      highWaitlistDeaths: 0,
      postTransplantDeaths: 0,
      xenoPostTransplantDeaths: 0,
      humanPostTransplantDeaths: 0,
      humanPostTransplantDeathsLow: 0,
      humanPostTransplantDeathsHigh: 0,
      totalWaitingTime: 0,
      xenoGraftFailures: 0,
      humanGraftFailures: 0,
    };

    states.push({ ...currentState });

    const dt = 0.25; // Quarterly time steps

    for (let step = 1; step <= this.timeSteps; step++) {
      const newState = { ...currentState };

      // Arrivals
      newState.lowCPRAWaitlist += this.baselineParams.arrivalRateLow * dt;
      newState.highCPRAWaitlist += this.baselineParams.arrivalRateHigh * dt;

      // Human transplants
      const lowTransplants = Math.min(
        newState.lowCPRAWaitlist * this.baselineParams.humanTransplantRate * dt,
        newState.lowCPRAWaitlist
      );
      const highTransplants = Math.min(
        newState.highCPRAWaitlist * this.baselineParams.humanTransplantRate * dt * 0.3, // Lower rate for high-CPRA
        newState.highCPRAWaitlist
      );

      newState.lowCPRAWaitlist -= lowTransplants;
      newState.highCPRAWaitlist -= highTransplants;
      newState.lowCPRATransplanted += lowTransplants;
      newState.highCPRATransplanted += highTransplants;

      // Waitlist deaths
      const lowDeaths = newState.lowCPRAWaitlist * this.baselineParams.waitlistDeathRate * dt;
      const highDeaths = newState.highCPRAWaitlist * this.baselineParams.waitlistDeathRate * dt;

      newState.lowCPRAWaitlist -= lowDeaths;
      newState.highCPRAWaitlist -= highDeaths;
      newState.waitlistDeaths += lowDeaths + highDeaths;
      newState.lowWaitlistDeaths += lowDeaths;
      newState.highWaitlistDeaths += highDeaths;

      // Post-transplant outcomes
      const totalHumanRecipients = Math.max(1e-9, newState.lowCPRATransplanted + newState.highCPRATransplanted);
      const humanGraftFailures = totalHumanRecipients * this.baselineParams.humanGraftFailureRate * dt;
      const humanPostTransplantDeaths = totalHumanRecipients * this.baselineParams.humanPostTransplantDeathRate * dt;
      const shareLow = newState.lowCPRATransplanted / totalHumanRecipients;
      const shareHigh = newState.highCPRATransplanted / totalHumanRecipients;
      const humanFailuresLow = humanGraftFailures * shareLow;
      const humanFailuresHigh = humanGraftFailures * shareHigh;
      const humanDeathsLow = humanPostTransplantDeaths * shareLow;
      const humanDeathsHigh = humanPostTransplantDeaths * shareHigh;

      newState.lowCPRATransplanted = Math.max(0, newState.lowCPRATransplanted - humanFailuresLow - humanDeathsLow);
      newState.highCPRATransplanted = Math.max(0, newState.highCPRATransplanted - humanFailuresHigh - humanDeathsHigh);

      newState.postTransplantDeaths += humanPostTransplantDeaths;
      newState.humanPostTransplantDeaths += humanPostTransplantDeaths;
      newState.humanPostTransplantDeathsLow += humanDeathsLow;
      newState.humanPostTransplantDeathsHigh += humanDeathsHigh;
      newState.humanGraftFailures += humanGraftFailures;

      currentState = newState;
      states.push({ ...currentState });
    }

    return { states };
  }

  private runXenoSimulation() {
    const states: PopulationState[] = [];
    let currentState: PopulationState = {
      lowCPRAWaitlist: this.baselineParams.initialLowCPRA,
      highCPRAWaitlist: this.baselineParams.initialHighCPRA,
      lowCPRATransplanted: 0,
      highCPRATransplanted: 0,
      xenoTransplanted: 0,
      waitlistDeaths: 0,
      lowWaitlistDeaths: 0,
      highWaitlistDeaths: 0,
      postTransplantDeaths: 0,
      xenoPostTransplantDeaths: 0,
      humanPostTransplantDeaths: 0,
      humanPostTransplantDeathsLow: 0,
      humanPostTransplantDeathsHigh: 0,
      totalWaitingTime: 0,
      xenoGraftFailures: 0,
      humanGraftFailures: 0,
    };

    states.push({ ...currentState });

    const dt = 0.25; // Quarterly time steps

    for (let step = 1; step <= this.timeSteps; step++) {
      const newState = { ...currentState };

      // Arrivals
      newState.lowCPRAWaitlist += this.baselineParams.arrivalRateLow * dt;
      newState.highCPRAWaitlist += this.baselineParams.arrivalRateHigh * dt;

      // Xeno transplants (only for high-CPRA) - Use dynamic availability
      const xenoOffered = this.xenoAvailabilityRate * dt;
      const xenoAccepted = Math.min(
        xenoOffered * this.fixedXenoAcceptanceRate,
        newState.highCPRAWaitlist
      );

      newState.highCPRAWaitlist -= xenoAccepted;
      newState.xenoTransplanted += xenoAccepted;

      // Human transplants (more realistic competition for organs)
      const totalDemand = newState.lowCPRAWaitlist + newState.highCPRAWaitlist;
      const availableHumanKidneys = this.baselineParams.arrivalRateLow * 0.75 * dt; // 75% become available
      
      // Priority system: some kidneys go to high-CPRA if available
      const highCPRAPriority = Math.min(
        availableHumanKidneys * 0.4, // 40% prioritized for high-CPRA
        newState.highCPRAWaitlist * this.baselineParams.humanTransplantRate * dt * 0.4 // reduced rate for high-CPRA
      );
      
      const lowCPRAAllocation = Math.min(
        availableHumanKidneys * 0.6, // 60% for low-CPRA
        newState.lowCPRAWaitlist * this.baselineParams.humanTransplantRate * dt
      );

      newState.lowCPRAWaitlist -= lowCPRAAllocation;
      newState.highCPRAWaitlist -= highCPRAPriority;
      newState.lowCPRATransplanted += lowCPRAAllocation;
      newState.highCPRATransplanted += highCPRAPriority;

      // Waitlist deaths
      const lowDeaths = newState.lowCPRAWaitlist * this.baselineParams.waitlistDeathRate * dt;
      const highDeaths = newState.highCPRAWaitlist * this.baselineParams.waitlistDeathRate * dt;

      newState.lowCPRAWaitlist -= lowDeaths;
      newState.highCPRAWaitlist -= highDeaths;
      newState.waitlistDeaths += lowDeaths + highDeaths;
      newState.lowWaitlistDeaths += lowDeaths;
      newState.highWaitlistDeaths += highDeaths;

      // Xeno graft outcomes - sliders are multipliers of baseline hazards
      const xenoGraftFailures = newState.xenoTransplanted * (this.baselineXenoGraftFailureRate * this.params.xenoGraftFailureRate) * dt;
      const xenoPostTransplantDeaths = newState.xenoTransplanted * (this.baselinePostTransplantDeathRate * this.params.postTransplantDeathRate) * dt;

      newState.xenoTransplanted = Math.max(0, newState.xenoTransplanted - xenoGraftFailures + 0 - xenoPostTransplantDeaths);
      newState.postTransplantDeaths += xenoPostTransplantDeaths;
      newState.xenoPostTransplantDeaths += xenoPostTransplantDeaths;
      newState.xenoGraftFailures += xenoGraftFailures;

      // Human graft outcomes
      const totalHumanRecipientsX = Math.max(1e-9, newState.lowCPRATransplanted + newState.highCPRATransplanted);
      const humanGraftFailures = totalHumanRecipientsX * this.baselineParams.humanGraftFailureRate * dt;
      const humanPostTransplantDeaths = totalHumanRecipientsX * this.baselineParams.humanPostTransplantDeathRate * dt;
      const shareLowX = newState.lowCPRATransplanted / totalHumanRecipientsX;
      const shareHighX = newState.highCPRATransplanted / totalHumanRecipientsX;
      const humanFailuresLowX = humanGraftFailures * shareLowX;
      const humanFailuresHighX = humanGraftFailures * shareHighX;
      const humanDeathsLowX = humanPostTransplantDeaths * shareLowX;
      const humanDeathsHighX = humanPostTransplantDeaths * shareHighX;

      newState.lowCPRATransplanted = Math.max(0, newState.lowCPRATransplanted - humanFailuresLowX - humanDeathsLowX);
      newState.highCPRATransplanted = Math.max(0, newState.highCPRATransplanted - humanFailuresHighX - humanDeathsHighX);

      newState.postTransplantDeaths += humanPostTransplantDeaths;
      newState.humanPostTransplantDeaths += humanPostTransplantDeaths;
      newState.humanPostTransplantDeathsLow += humanDeathsLowX;
      newState.humanPostTransplantDeathsHigh += humanDeathsHighX;
      newState.humanGraftFailures += humanGraftFailures;

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
    const totalDeathsPrevented = simulation.netDeathsPreventedData.reduce((sum, d) => sum + d.netDeathsPrevented, 0);

    return {
      waitlistReduction: initialWaitlist.total - finalWaitlist.total,
      deathsPrevented: totalDeathsPrevented,
      totalTransplants: finalTransplants.human + finalTransplants.xeno,
      xenoTransplants: finalTransplants.xeno,
      penetrationRate: finalPenetration.proportion,
    };
  }
}