import { getWlRemovalRates } from './configFinder';

// Yearly transplant rates for targeted populations (SRTR 2022 data).
// Used to compute how many xeno kidneys are "intended" for a given scenario.
export const STANDARD_BASE_RATES: Record<number, number> = {
  85: 2841,
  95: 1723,
  99: 974,
};

export const TARGETING_BASE_RATES: Record<string, number> = {
  age60_cpraHigh: 192,
  age45_cpraHigh: 593,
  age60_cpraAll: 8728,
  age45_cpraAll: 17705,
};

export function getXenoBaseRate(strategy: string, threshold: number): number {
  if (strategy === 'standard') {
    return STANDARD_BASE_RATES[threshold] || STANDARD_BASE_RATES[95];
  }
  return TARGETING_BASE_RATES[strategy] || 0;
}

// Transform JSON visualization data to format expected by SimulationCharts

// Therapy regime tag emitted by the backend (workflow_age_cpra.create_viz_data).
// 'replacement' — xenokidney is a definitive transplant; xeno recipients leave
//                  the candidate pool until/unless their graft fails.
// 'bridge_v2'   — xenokidney is a temporary bridge; xeno recipients remain
//                  candidates and compete with C for the same allokidney supply
//                  (simulator's share_allo_with_xeno=True). The 'v2' suffix
//                  distinguishes the new shared-supply model from the legacy
//                  "Bridge Therapy" runs that were mathematically just
//                  replacement-with-short-graft-life (no `mode` field).
// missing       — legacy JSON; treated as 'replacement' semantics.
export type TherapyMode = 'replacement' | 'bridge_v2';

interface VizData {
  config_name: string;
  total_days?: number;
  mode?: TherapyMode;
  share_allo_with_xeno?: boolean;
  waitlist_sizes?: {
    x: number[];
    series: Array<{ label: string; y: number[]; color?: string; linestyle?: string }>;
  };
  recipients?: {
    x: number[];
    series: Array<{ label: string; y: number[]; color?: string }>;
  };
  cumulative_deaths?: {
    x: number[];
    series: Array<{ label: string; y: number[]; color?: string; linestyle?: string }>;
  };
  deaths_per_day?: {
    x: number[];
    series: Array<{ label: string; y: number[]; color?: string }>;
  };
  deaths_per_year?: {
    year_labels: string[];
    series: Array<{ label: string; values: number[]; color?: string }>;
  };
  net_deaths_prevented?: {
    year_labels: string[];
    series: Array<{ label: string; values: number[]; color?: string }>;
    total_net_deaths_prevented?: number;
    average_net_deaths_prevented?: number;
  };
  cumulative_xeno_transplants?: {
    x: number[];
    series: Array<{ label: string; y: number[]; color?: string }>;
  };
  cumulative_std_transplants?: {
    x: number[];
    series: Array<{ label: string; y: number[]; color?: string }>;
  };
  // Bridge Therapy (mode='bridge_v2'): cumulative allokidneys whose
  // recipient was drawn from H_xeno (a bridged candidate transitioning
  // to a definitive human transplant). Always zero in Replacement
  // Therapy; missing on legacy JSONs.
  cumulative_bridge_allo?: {
    x: number[];
    series: Array<{ label: string; y: number[]; color?: string }>;
  };
  cumulative_waitlist_deaths?: {
    x: number[];
    series: Array<{ label: string; y: number[]; color?: string }>;
  };
  cumulative_post_tx_deaths?: {
    x: number[];
    series: Array<{ label: string; y: number[]; color?: string }>;
  };
  // Per-cell post-tx death splits. Bridge mode uses the xeno split as
  // the death-while-bridged outflow channel in Little's-Law. Missing
  // on legacy JSONs.
  cumulative_post_tx_deaths_std?: {
    x: number[];
    series: Array<{ label: string; y: number[]; color?: string }>;
  };
  cumulative_post_tx_deaths_xeno?: {
    x: number[];
    series: Array<{ label: string; y: number[]; color?: string }>;
  };
  recipients_xeno?: {
    x: number[];
    series: Array<{ label: string; y: number[]; color?: string }>;
  };
  recipients_std?: {
    x: number[];
    series: Array<{ label: string; y: number[]; color?: string }>;
  };
  has_comparison?: boolean;
  base_config_name?: string;
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
  // Wait time (analytic estimate via Little's Law from waitlist size and
  // transplant/death outflows; see computeWaitTimeByYear below). Units: months.
  // `averageWaitingTime` is retained as a legacy alias for back-compat with
  // older readers; all real values live in `*Months` fields.
  waitingTimeData: Array<{
    year: number;
    averageWaitingTime: number;             // legacy alias = averageWaitingTimeMonths
    averageWaitingTimeMonths: number;       // overall (all subgroups, this scenario)
    baseAverageWaitingTimeMonths?: number;  // same year, base case (xeno_proportion = 0)
    reductionMonths?: number;               // base − xeno (positive = xeno reduces wait)
    lowCPRA: number;
    highCPRA: number;
    baseLowCPRA?: number;
    baseHighCPRA?: number;
    // ─── Dialysis-only wait (W_C) — Task 3 ─────────────────────────────
    // Time on dialysis per list-spell. In replacement mode this equals
    // the overall wait; in bridge mode it drops as bridging absorbs C
    // residence time. Always present (NaN if outflow=0).
    dialysisMonths: number;
    baseDialysisMonths?: number;
    dialysisReductionMonths?: number;       // base_W_C − W_C
    dialysisLowCPRA: number;
    dialysisHighCPRA: number;
    baseDialysisLowCPRA?: number;
    baseDialysisHighCPRA?: number;
    // ─── Time on bridge (W_X) — bridge mode only ───────────────────────
    // Mean time on a functioning xenograft per spell (flow-balance
    // residence time). NaN in replacement scenarios where no patient
    // ever entered H_xeno, and NaN cell-by-cell during heavy transient
    // build-up of H_xeno.
    bridgeMonths?: number;
    bridgeLowCPRA?: number;
    bridgeHighCPRA?: number;
  }>;
  waitingTimeDataByAge?: Array<{
    year: number;
    lowCPRA: Record<string, number>;        // age key ("age0_18" | "age18_45" | ...) → months
    highCPRA: Record<string, number>;
    baseLowCPRA?: Record<string, number>;
    baseHighCPRA?: Record<string, number>;
    // Dialysis-only and bridge-only views, mirroring the aggregate
    // additions above.
    dialysisLowCPRA?: Record<string, number>;
    dialysisHighCPRA?: Record<string, number>;
    baseDialysisLowCPRA?: Record<string, number>;
    baseDialysisHighCPRA?: Record<string, number>;
    bridgeLowCPRA?: Record<string, number>;
    bridgeHighCPRA?: Record<string, number>;
  }>;
  recipientsData: Array<{ year: number; lowHuman: number; highHuman: number; highXeno: number; lowXeno: number }>;
  cumulativeDeathsData: Array<{ year: number; lowWaitlist: number; highWaitlist: number; lowPostTx: number; highPostTx: number; total: number }>;
  deathsPerYearData: Array<{ year: number; low: number; high: number; total: number }>;
  deathsPerDayData: Array<{ year: number; low: number; high: number; total: number }>;
  netDeathsPreventedPerYearData: Array<{ year: number; low: number; high: number; total: number }>;
  waitlistDeathsPerYearData: Array<{
    year: number;
    waitlistDeaths: number;
    lowWaitlistDeaths?: number;
    highWaitlistDeaths?: number;
    baseWaitlistDeaths?: number;
    baseLowWaitlistDeaths?: number;
    baseHighWaitlistDeaths?: number;
  }>;
  // Honest "lives saved" decomposition (cumulative, per year). Every death
  // in the model is one of: a waitlist death (died waiting / on dialysis) or
  // a post-transplant death (died with a human or xeno graft). "Lives saved"
  // measured on WAITLIST deaths alone overstates the benefit — a transplant
  // just moves a patient from the waitlist bucket into the post-tx bucket, so
  // it must be netted against post-tx deaths to give the true number. We carry
  // both the scenario and base totals so the summary can report the honest net
  // (total) figure plus the breakdown. Only populated when a base scenario is
  // loaded and the viz JSON carries the cumulative *Total* death series.
  deathsBreakdownByYear?: Array<{
    year: number;
    scenarioTotal: number;
    scenarioWaitlist: number;
    scenarioPostTx: number;
    baseTotal: number;
    baseWaitlist: number;
    basePostTx: number;
    // Waitlist REMOVALS (too sick / declined / moved). A DISTINCT exit from
    // death, never counted in any death bucket. Sourced from the backend
    // `cumulative_waitlist_removals` series when present, else estimated as
    // ∫ wl_removal_rate · C(t) dt from the waitlist trajectory. Surfacing
    // this is what makes "total deaths" interpretable: a transplant removes
    // the removal escape-hatch, so flat total deaths is a censoring effect,
    // not xeno causing harm.
    scenarioRemovals?: number;
    baseRemovals?: number;
  }>;
  // Legacy scalar fields: end-of-series cumulative procedure count for
  // backwards compatibility. Prefer the *Series fields below + horizon
  // slicing via interpolateCumulative; these legacy values can over-report
  // for shorter horizons.
  cumulativeXenoTransplants: number;
  cumulativeStdTransplants: number;
  // Bridge Therapy: cumulative allokidneys whose recipient was a
  // bridged candidate (subset of cumulativeStdTransplants). Always 0
  // in Replacement Therapy.
  cumulativeBridgeAllo?: number;
  // Full cumulative procedure timeseries (x in DAYS, y monotone non-decreasing).
  // Use interpolateCumulative(xDays, y, horizon*365) to slice at any horizon.
  cumulativeXenoTransplantsSeries?: { xDays: number[]; y: number[] };
  cumulativeStdTransplantsSeries?: { xDays: number[]; y: number[] };
  cumulativeBridgeAlloSeries?: { xDays: number[]; y: number[] };
  // Therapy regime tag (defaults to 'replacement' on legacy JSONs).
  // Components use this to enable Bridge-Therapy-only UI affordances
  // (e.g. the bridge throughput rows, the "bridged candidates" overlay
  // on the waitlist chart).
  therapyMode?: TherapyMode;
  // Dialysis-burden summary (Task Group 5). Always computed when a base
  // scenario is available, regardless of therapy mode (replacement mode
  // also avoids dialysis by substituting xeno for waitlist time). UI
  // components render this most prominently on the Bridge page.
  dialysisBurden?: DialysisBurdenMetrics;
  // Age-specific data (optional)
  waitlistDataByAge?: Array<{ year: number; lowCPRA: Record<string, number>; highCPRA: Record<string, number> }>;
  netDeathsPreventedByAge?: Array<{ year: number; lowCPRA: Record<string, number>; highCPRA: Record<string, number>; total: Record<string, number> }>;
  recipientsDataByAge?: Array<{
    year: number;
    lowCPRA: Record<string, number>;  // human + xeno combined (back-compat)
    highCPRA: Record<string, number>;
    lowHuman?: Record<string, number>;
    highHuman?: Record<string, number>;
    lowXeno?: Record<string, number>;
    highXeno?: Record<string, number>;
  }>;
  cumulativeDeathsDataByAge?: Array<{
    year: number;
    lowCPRA: Record<string, number>;  // total deaths (waitlist + post-tx) by age
    highCPRA: Record<string, number>;
    lowWaitlist?: Record<string, number>;
    highWaitlist?: Record<string, number>;
    lowPostTx?: Record<string, number>;
    highPostTx?: Record<string, number>;
  }>;
  deathsPerYearDataByAge?: Array<{ year: number; lowCPRA: Record<string, number>; highCPRA: Record<string, number> }>;
  waitlistDeathsPerYearDataByAge?: Array<{
    year: number;
    total: Record<string, number>;
    lowCPRA?: Record<string, number>;
    highCPRA?: Record<string, number>;
  }>;
}

// Convert days to years (assuming 365 days per year)
function daysToYears(days: number): number {
  return days / 365;
}

// Sample data at regular intervals to reduce size
function sampleData<T>(array: T[], targetPoints: number): T[] {
  if (array.length <= targetPoints) return array;
  const step = array.length / targetPoints;
  const sampled: T[] = [];
  for (let i = 0; i < array.length; i += step) {
    sampled.push(array[Math.floor(i)]);
  }
  // Always include the last point
  if (sampled[sampled.length - 1] !== array[array.length - 1]) {
    sampled.push(array[array.length - 1]);
  }
  return sampled;
}

// Convert days array to years array, sampling appropriately
function convertTimeAxis(daysArray: number[], targetResolution: 'yearly' | 'monthly' = 'monthly'): number[] {
  if (targetResolution === 'yearly') {
    // Extract yearly points (every 365 days)
    const yearly: number[] = [];
    let lastYear = -1;
    for (let i = 0; i < daysArray.length; i++) {
      const years = daysToYears(daysArray[i]);
      const currentYear = Math.floor(years);
      if (currentYear > lastYear) {
        yearly.push(years);
        lastYear = currentYear;
      }
    }
    return yearly;
  }
  // For monthly, sample to approximately 120 points per 10 years (monthly-ish)
  const maxDays = Math.max(...daysArray);
  const maxYears = daysToYears(maxDays);
  const targetMonthlyPoints = Math.ceil(maxYears * 12); // 12 points per year
  const sampledDays = sampleData(daysArray, targetMonthlyPoints);
  return sampledDays.map(daysToYears);
}

// Find series by label pattern (case-insensitive)
function findSeries(series: Array<{ label: string; y: number[] }>, patterns: string[]): number[] | null {
  if (!series || !Array.isArray(series)) return null;

  for (const pattern of patterns) {
    const found = series.find(s =>
      s && s.label && typeof s.label === 'string' && s.label.toLowerCase().includes(pattern.toLowerCase())
    );
    if (found && found.y && Array.isArray(found.y)) return found.y;
  }
  return null;
}

// Extract individual age group series for a cPRA group
// Returns object with age groups or null if no age data found
function extractAgeGroupSeries(series: Array<{ label: string; y: number[] }>, cpraPattern: string): Record<string, number[]> | null {
  if (!series || !Array.isArray(series)) return null;

  const ageGroups: Record<string, number[]> = {};
  const agePatterns = [
    { key: 'age0_18', pattern: 'age 0-18' },
    { key: 'age18_45', pattern: 'age 18-45' },
    { key: 'age45_60', pattern: 'age 45-60' },
    { key: 'age60plus', pattern: 'age 60+' }
  ];

  for (const { key, pattern } of agePatterns) {
    const found = series.find(s => {
      if (!s || !s.label || typeof s.label !== 'string') return false;
      const label = s.label.toLowerCase();
      return label.includes(cpraPattern.toLowerCase()) && label.includes(pattern);
    });

    if (found && found.y && Array.isArray(found.y)) {
      ageGroups[key] = found.y;
    }
  }

  // Return null if no age data found
  return Object.keys(ageGroups).length > 0 ? ageGroups : null;
}

// Find and aggregate all age-stratified series for a cPRA group
// Returns null if no age-stratified data found (falls back to non-age)
function aggregateAgeSeries(series: Array<{ label: string; y: number[] }>, cpraPattern: string): number[] | null {
  if (!series || !Array.isArray(series)) return null;

  // Look for age-stratified series (e.g., "Low cPRA - Age 0-18")
  const ageSeries = series.filter(s => {
    if (!s || !s.label || typeof s.label !== 'string') return false;
    const label = s.label.toLowerCase();
    return label.includes(cpraPattern.toLowerCase()) && label.includes('age');
  });

  if (ageSeries.length === 0) {
    // No age-stratified data, return null to fall back to non-age search
    return null;
  }

  // Check if first series has valid y data
  if (!ageSeries[0] || !ageSeries[0].y || ageSeries[0].y.length === 0) {
    return null;
  }

  // Sum across all age groups for each time point
  const length = ageSeries[0].y.length;
  const aggregated: number[] = new Array(length).fill(0);

  for (const ageSeriesData of ageSeries) {
    if (!ageSeriesData || !ageSeriesData.y || !Array.isArray(ageSeriesData.y)) continue;
    for (let i = 0; i < length; i++) {
      aggregated[i] += ageSeriesData.y[i] || 0;
    }
  }

  return aggregated;
}

// Find first index in array where predicate returns true
function findFirstIndex<T>(array: T[], predicate: (item: T) => boolean): number {
  for (let i = 0; i < array.length; i++) {
    if (predicate(array[i])) return i;
  }
  return array.length;
}

// ─── Wait time computation (Little's Law) ──────────────────────────────
//
// The CTMC simulator tracks compartment counts, not per-patient timestamps,
// so we don't have an empirical wait-time time-series in the viz JSON.
// What we report is the *rate-form* (snapshot) estimator from Little's Law:
//
//   Ŵ(y) = L̄(y) / λ_out(y)
//
// where L̄(y) is the mean waitlist size over year y and λ_out(y) is the
// total outflow during that year. This estimator is **exact** in steady
// state and is otherwise an approximation: boundary terms (residual
// inventory at year start/end) and composition shifts (who exits vs who
// just arrived) bias it during transients. Treat year-1 of any new
// scenario as a transient snapshot, not a cohort wait time; by year 5–10
// the system has typically re-equilibrated and Ŵ becomes a reliable
// estimate of mean wait per list-spell.
//
// Outflow channels in this model (must include ALL of them or Ŵ is
// systematically inflated):
//
// Replacement Therapy (default, mode='replacement' or missing):
//   L̄  = mean of C (un-bridged candidates) in the year
//   outflow channels:
//     - Standard (human) transplants            (Δ cumulative_std_transplants)
//     - Xeno transplants                        (Δ cumulative_xeno_transplants)
//     - Waitlist deaths                         (waitlist_deaths_per_year[y-1])
//     - Waitlist removals (too sick / dropped)  (wl_removal_rate × L̄_C × 365)
//
// Bridge Therapy (mode='bridge_v2'):
//   L̄  = mean of (C + H_xeno), because a patient holding a bridge
//        xenograft is still a candidate for a definitive allokidney
//   outflow channels:
//     - Standard (human) transplants            (Δ cumulative_std_transplants)
//         — counts allokidneys routed to BOTH un-bridged and bridged
//         recipients (sum of "allo → C" and "allo → bridged"); the latter
//         is what the new `cumulative_bridge_allo` series reports as a
//         subset of tx_std.
//     - Waitlist deaths                         (waitlist_deaths_per_year[y-1])
//     - Bridge deaths                           (Δ cumulative_post_tx_deaths_xeno)
//     - Waitlist removals                       (wl_removal_rate × L̄_C × 365)
//   INTERNAL transitions (NOT counted as outflow):
//     - Xeno transplants  C → H_xeno            (still in candidate pool)
//     - Relisting         H_xeno → C            (still in candidate pool)
//
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// We also emit two related per-state estimates so the Bridge page can
// answer the Task-3 reframe ("the queue is conserved; only the
// composition of the wait changes"):
//
//   W_C   — dialysis-only wait. L = C, outflow = (transplants that drain
//           C) + waitlist deaths + waitlist removals. Strictly equals W
//           in replacement mode (cum_bridge_allo = 0); drops under
//           bridging.
//   W_X   — time-on-bridge per spell. L = H_xeno, outflow derived from
//           flow balance:  outflow_X = inflow_X − ΔH_xeno  where
//           inflow_X = Δ cum_xeno_transplants. Reaches the steady-state
//           formula L_X / Δcum_xeno when H_xeno stops growing. Always
//           computed; charts typically only render it in bridge mode.
//
// The waitlist-removal channel is not in the viz JSON, so we reconstruct it
// analytically from the per-(cPRA) `wl_removal` rate baked into the
// simulator's input rates and the year's mean L. In the default 85%
// threshold config, removals are ~9.9%/yr of L — the **second-largest**
// outflow channel after transplants — so omitting them would overstate Ŵ
// by ~25-35%.
//
// CRITICAL: For per-cPRA and overall aggregates we sum the flows first and
// then divide ("flow-weighted aggregation"). Averaging per-subgroup wait
// times directly would be wrong — small subgroups with very long waits
// would distort the aggregate (a Simpson's-paradox flavor).
//
// Per-(cPRA × age) cell, for year y ∈ [1..max_years]:
//
//   t_start          = (y - 1) · 365
//   t_end            = y · 365
//   mean_L_y         = mean of waitlist_size samples in [t_start, t_end]
//   Δ_cum_tx_y       = interp(cum_tx, t_end) − interp(cum_tx, t_start)
//                        (cum_xeno + cum_std combined)
//   deaths_y         = waitlist_deaths_per_year[y - 1]   (x is 0-indexed)
//   removals_y       = wl_removal_rate(cpra) · mean_L_y · 365
//   outflow_y        = Δ_cum_tx_y + deaths_y + removals_y
//   Ŵ_y_months       = (mean_L_y / outflow_y) · 12
//
// Returns null when the viz lacks the required series so callers can
// gracefully no-op without polluting downstream consumers.

const WT_AGE_PATTERNS: Array<{ key: string; pattern: string }> = [
  { key: 'age0_18', pattern: 'age 0-18' },
  { key: 'age18_45', pattern: 'age 18-45' },
  { key: 'age45_60', pattern: 'age 45-60' },
  { key: 'age60plus', pattern: 'age 60+' },
];

interface WaitTimeYear {
  year: number;                 // 1-indexed
  // ─── Combined "wait until permanent exit" (legacy W) ───────────────────
  //   Replacement: L = C (un-bridged candidates only)
  //   Bridge:      L = C + H_xeno (a bridged patient still counts as
  //                a candidate for a definitive allokidney). Approximately
  //                conserved under bridging because the human-kidney
  //                supply is unchanged — only the *composition* of the
  //                wait shifts (Task-3 reframing).
  totalMonths: number;          // NaN if outflow=0
  lowCPRAMonths: number;
  highCPRAMonths: number;
  lowCPRAByAge: Record<string, number>;
  highCPRAByAge: Record<string, number>;
  // ─── Dialysis-only wait (W_C — Task 3 headline) ────────────────────────
  // L = C only (un-bridged candidates). Outflows drain C specifically:
  //   - tx_std going to C candidates  ( = cum_std - cum_bridge_allo )
  //   - tx_xeno (C → H_xeno; leaves dialysis even if not yet "done waiting")
  //   - waitlist deaths (deaths in C)
  //   - waitlist removals (rate × meanL_C × 365)
  // Bridge-deaths are NOT outflow from C (they happen in H_xeno).
  //
  // In replacement mode this metric is mathematically identical to
  // totalMonths (cum_bridge_allo is zero by construction); a downstream
  // chart can either dedupe or just always display this as the
  // headline.
  //
  // In bridge mode it's the clinically meaningful number — drops as
  // bridging absorbs C residence time.
  dialysisTotalMonths: number;
  dialysisLowCPRAMonths: number;
  dialysisHighCPRAMonths: number;
  dialysisLowCPRAByAge: Record<string, number>;
  dialysisHighCPRAByAge: Record<string, number>;
  // ─── Time-on-bridge wait (W_X — bridge mode only) ──────────────────────
  // L = H_xeno population. Outflow derived via flow balance — over a
  // window, outflow = inflow - ΔH_xeno where inflow = Δ cum_xeno_tx.
  // In steady state this collapses to L_X / Δcum_xeno = mean residence
  // time on a functioning xenograft per spell. NaN when outflow ≤ 0
  // (heavy transient build-up of H_xeno).
  //
  // Always computed (replacement-mode H_xeno still has a residence
  // time — it's the post-xeno-tx lifetime there); chart components
  // typically only render it in bridge mode where it's clinically
  // meaningful as "time on bridge per spell."
  bridgeTotalMonths: number;
  bridgeLowCPRAMonths: number;
  bridgeHighCPRAMonths: number;
  bridgeLowCPRAByAge: Record<string, number>;
  bridgeHighCPRAByAge: Record<string, number>;
}

// Linear-interpolate cumulative series y at time t (days). Cumulative
// series are monotone non-decreasing so this is well-defined and accurate.
function interpolateCumulative(x: number[], y: number[], t: number): number {
  if (!x.length || !y.length) return 0;
  if (t <= x[0]) return y[0];
  if (t >= x[x.length - 1]) return y[y.length - 1];
  // Binary search would be marginally faster but x has ~123 points so
  // linear scan is plenty.
  for (let i = 1; i < x.length; i++) {
    if (x[i] >= t) {
      const x0 = x[i - 1];
      const x1 = x[i];
      if (x1 === x0) return y[i];
      const frac = (t - x0) / (x1 - x0);
      return y[i - 1] + frac * (y[i] - y[i - 1]);
    }
  }
  return y[y.length - 1];
}

// Mean of y[i] for x[i] ∈ [tStart, tEnd] (inclusive). Returns NaN if no
// samples fall in the window.
function meanInWindow(x: number[], y: number[], tStart: number, tEnd: number): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < x.length; i++) {
    if (x[i] >= tStart && x[i] <= tEnd) {
      sum += y[i] || 0;
      n += 1;
    }
  }
  return n > 0 ? sum / n : NaN;
}

// Compute months = L / outflow * 12, returning NaN on div-by-zero or
// any non-finite input so downstream consumers can hide the value.
function waitTimeMonths(meanL: number, outflow: number): number {
  if (!Number.isFinite(meanL) || !Number.isFinite(outflow) || outflow <= 0) {
    return NaN;
  }
  return (meanL / outflow) * 12;
}

// Detect a "frozen tail" in a cumulative series — trailing samples whose
// per-segment growth is materially smaller than the interior median. This
// is the signature of the backend extending `common_times` past the
// simulator's actual stop time: the cumulative series is then flat from
// the real stop to x[-1], and any interpolation INTO that segment will
// undercount activity (specifically, transplant outflow), inflating
// L/λ_out at the boundary year and putting a spurious upward tick at the
// end of the wait-time chart.
//
// Returns the largest trustworthy index — i.e. data[0..returnedIdx]
// represents real simulation activity. Defaults to "trust everything" if
// the series is too short to estimate, or if the last segment looks
// normal.
//
// Heuristic: median segment growth across the interior (excluding the
// first and last two segments to avoid boundary noise); a segment is
// trustworthy if its growth is >= 0.7 × that median. Walk backward from
// the end and return the first trustworthy index. 0.7 is intentionally
// looser than "definitely an artifact" so we don't falsely flag real
// throughput decay (which is gradual and won't drop a single segment to
// <70% in one step).
function effectiveLastIndex(cumulative: number[]): number {
  const n = cumulative.length;
  if (n < 5) return n - 1;
  const growths: number[] = new Array(n - 1);
  for (let i = 1; i < n; i++) growths[i - 1] = cumulative[i] - cumulative[i - 1];
  // Interior segments only — drop first (cold-start) and last two (the
  // ones we're trying to characterize).
  const interior = growths.slice(1, -2);
  if (interior.length < 3) return n - 1;
  const sorted = [...interior].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (median <= 0) return n - 1; // pathological / never-grew series
  const threshold = 0.7 * median;
  for (let i = n - 1; i >= 1; i--) {
    if (growths[i - 1] >= threshold) return i;
  }
  return n - 1;
}

// Find a series whose label contains the cPRA pattern AND age pattern.
function findCellSeries(
  series: Array<{ label: string; y: number[] }> | undefined,
  cpraPattern: string,
  agePattern: string,
  extraToken?: string,
): number[] | null {
  if (!series || !Array.isArray(series)) return null;
  const cpraLc = cpraPattern.toLowerCase();
  const ageLc = agePattern.toLowerCase();
  const extraLc = extraToken?.toLowerCase();
  const hit = series.find((s) => {
    if (!s || !s.label) return false;
    const lbl = s.label.toLowerCase();
    if (!lbl.includes(cpraLc) || !lbl.includes(ageLc)) return false;
    if (extraLc && !lbl.includes(extraLc)) return false;
    return true;
  });
  return hit?.y && Array.isArray(hit.y) ? hit.y : null;
}

export interface WaitTimeOptions {
  // Per-person-day waitlist-removal hazards (the "wl_removal" channel of
  // the simulator). Omitted → defaults to {low: 0, high: 0}, which
  // reproduces the OLD (biased) behavior and is intentionally exposed for
  // tests that want to isolate the transplant + death components.
  // Production callers (`transformVizDataToSimulationData`) MUST pass real
  // rates from `configFinder.getWlRemovalRates` or Ŵ will be overstated
  // by ~25-35%.
  wlRemovalRates?: { low: number; high: number };
}

// Resolve the therapy regime tag, with a back-compat fallback for
// legacy viz JSONs (no `mode` field) that defaults to 'replacement'.
export function resolveTherapyMode(vizData: VizData | null | undefined): TherapyMode {
  if (!vizData) return 'replacement';
  if (vizData.mode === 'bridge_v2') return 'bridge_v2';
  // Defensive: an explicit share_allo_with_xeno=true with a missing/
  // mismatched `mode` field still routes through bridge semantics.
  if (vizData.share_allo_with_xeno === true) return 'bridge_v2';
  return 'replacement';
}

export function computeWaitTimeByYear(
  vizData: VizData,
  opts: WaitTimeOptions = {},
): WaitTimeYear[] | null {
  const wl = vizData.waitlist_sizes;
  const wlDeaths = (vizData as VizData & {
    waitlist_deaths_per_year?: {
      x: number[];
      series: Array<{ label: string; y: number[] }>;
    };
  }).waitlist_deaths_per_year;
  const cumXeno = vizData.cumulative_xeno_transplants;
  const cumStd = vizData.cumulative_std_transplants;
  const cumPostTxXeno = vizData.cumulative_post_tx_deaths_xeno;
  const recXeno = vizData.recipients_xeno;
  const wlRem = opts.wlRemovalRates ?? { low: 0, high: 0 };
  if (!wl || !wl.x || !wl.series || wl.x.length === 0) return null;
  if (!wlDeaths || !wlDeaths.x || !wlDeaths.series || wlDeaths.x.length === 0) {
    return null;
  }

  const mode = resolveTherapyMode(vizData);
  const isBridge = mode === 'bridge_v2';

  const xDays = wl.x;
  const maxDays = xDays[xDays.length - 1];
  // wlDeaths.x is the 0-indexed year list (e.g. [0..9]); number of years
  // = length of that array, capped by waitlist_sizes horizon.
  const maxYears = Math.min(
    wlDeaths.x.length,
    Math.floor(maxDays / 365),
  );
  if (maxYears <= 0) return null;

  const cpraGroups: Array<{ key: 'low' | 'high'; pattern: string }> = [
    { key: 'low', pattern: 'low cpra' },
    { key: 'high', pattern: 'high cpra' },
  ];

  // For each (cPRA × age) cell, pull the L, tx, deaths series once.
  //
  // Wait-time semantics differ by therapy regime (see resolveTherapyMode):
  //
  //  Replacement Therapy: candidates live in C only. Outflow = standard
  //    transplants + xeno transplants + waitlist deaths + waitlist
  //    removals. (Xeno transplant moves a candidate OUT of C and they
  //    don't return until graft failure, which is a fresh re-listing.)
  //
  //  Bridge Therapy (v2): candidates live in C ∪ H_xeno because bridged
  //    patients are still candidates for a definitive human allokidney.
  //    L counts both. Outflow channels are:
  //      - tx_std (counts both "allo → C" and "allo → bridged patient")
  //      - waitlist deaths (deaths in C)
  //      - bridge deaths (deaths in H_xeno, i.e. post_tx_deaths_xeno)
  //      - waitlist removals (wl_removal × meanL_C × 365)
  //    Xeno transplants (C → H_xeno) and relisting (H_xeno → C) are
  //    INTERNAL to the candidate pool and intentionally omitted.
  const cumBridgeAllo = (vizData as VizData & {
    cumulative_bridge_allo?: { x: number[]; series: Array<{ label: string; y: number[] }> };
  }).cumulative_bridge_allo;

  type Cell = {
    cpra: 'low' | 'high';
    ageKey: string;
    // Combined pool L for legacy W: C in replacement, C+H_xeno in bridge.
    L: number[];
    // Transplant outflow channel for legacy W (matches the L definition).
    cumTx: number[];
    deathsPerYear: number[];          // length = wlDeaths.x.length
    cumBridgeDeaths: number[];        // length matches L; identically zero in repl mode
    LCForRemoval: number[];           // C-only series (also = L_C, the W_C pool)
    // ─── W_C extras ──────────────────────────────────────────────────
    // Cumulative outflow-from-C (transplants only — deaths/removals are
    // handled separately in the per-year loop). In replacement this is
    // cum_xeno + cum_std; in bridge it's cum_xeno + (cum_std −
    // cum_bridge_allo).
    cumTxFromC: number[];
    // ─── W_X extras ──────────────────────────────────────────────────
    // H_xeno population series (= L_X). All-zero if the viz omits
    // recipients_xeno (legacy replacement JSONs).
    LX: number[];
    // Cumulative xeno transplants (= cumulative inflow to H_xeno).
    cumXeno: number[];
  };
  const cells: Cell[] = [];
  for (const { key, pattern } of cpraGroups) {
    for (const { key: ageKey, pattern: agePattern } of WT_AGE_PATTERNS) {
      const Ccell = findCellSeries(wl.series, pattern, agePattern);
      if (!Ccell) continue;
      const xenoTx = findCellSeries(cumXeno?.series, pattern, agePattern, 'xeno');
      const stdTx = findCellSeries(cumStd?.series, pattern, agePattern, 'human');
      const hxCell = findCellSeries(recXeno?.series, pattern, agePattern, 'xeno');
      const postTxXenoCell = findCellSeries(
        cumPostTxXeno?.series, pattern, agePattern, 'xeno',
      );
      const bridgeAllo = findCellSeries(cumBridgeAllo?.series, pattern, agePattern);
      const len = Ccell.length;
      const cumTx = new Array<number>(len).fill(0);
      if (isBridge) {
        // Bridge mode: tx_std already counts allokidneys routed to BOTH
        // un-bridged and bridged recipients. Xeno transplants (C →
        // H_xeno) are internal to the candidate pool, so we deliberately
        // do NOT add them.
        for (let i = 0; i < len; i++) cumTx[i] = stdTx?.[i] || 0;
      } else {
        // Replacement mode (legacy): both flavors of transplant are
        // outflows from C.
        for (let i = 0; i < len; i++) {
          cumTx[i] = (xenoTx?.[i] || 0) + (stdTx?.[i] || 0);
        }
      }
      const L = new Array<number>(len);
      if (isBridge && hxCell && hxCell.length === len) {
        for (let i = 0; i < len; i++) L[i] = (Ccell[i] || 0) + (hxCell[i] || 0);
      } else {
        for (let i = 0; i < len; i++) L[i] = Ccell[i] || 0;
      }
      const cumBridgeDeaths = new Array<number>(len).fill(0);
      if (isBridge && postTxXenoCell && postTxXenoCell.length === len) {
        for (let i = 0; i < len; i++) cumBridgeDeaths[i] = postTxXenoCell[i] || 0;
      }
      // W_C outflow-from-C (transplant channels only — deaths and
      // removals are layered in per-year below). The bridge_allo subset
      // of std transplants targets H_xeno recipients, NOT C, so we
      // remove it from the C-draining count.
      const cumTxFromC = new Array<number>(len).fill(0);
      const xenoArr = xenoTx ?? null;
      const stdArr = stdTx ?? null;
      const bridgeAlloArr = (isBridge && bridgeAllo && bridgeAllo.length === len)
        ? bridgeAllo : null;
      for (let i = 0; i < len; i++) {
        const x = xenoArr?.[i] || 0;
        const s = stdArr?.[i] || 0;
        const ba = bridgeAlloArr?.[i] || 0;
        // Defensive clamp: small Monte-Carlo noise can push the diff
        // slightly negative; keep the cumulative monotone.
        cumTxFromC[i] = x + Math.max(0, s - ba);
      }
      // W_X: H_xeno population + cum_xeno inflow.
      const LX = new Array<number>(len).fill(0);
      if (hxCell && hxCell.length === len) {
        for (let i = 0; i < len; i++) LX[i] = hxCell[i] || 0;
      }
      const cumXenoCell = new Array<number>(len).fill(0);
      if (xenoArr && xenoArr.length === len) {
        for (let i = 0; i < len; i++) cumXenoCell[i] = xenoArr[i] || 0;
      }
      const deathsAge = findCellSeries(wlDeaths.series, pattern, agePattern);
      const deathsPerYear = deathsAge || new Array<number>(wlDeaths.x.length).fill(0);
      cells.push({
        cpra: key,
        ageKey,
        L,
        cumTx,
        deathsPerYear,
        cumBridgeDeaths,
        LCForRemoval: Ccell.slice(),
        cumTxFromC,
        LX,
        cumXeno: cumXenoCell,
      });
    }
  }
  if (cells.length === 0) return null;

  // Frozen-tail defense: the backend `common_times` grid sometimes
  // extends past the simulator's last event time (e.g. T=3650 days but
  // x[-1]=3660), creating a flat segment on every cumulative series.
  // Interpolating tEnd into that segment undercounts transplants in the
  // final year and produces a spurious upward tick on the wait-time
  // chart. Cap maxYears so we only emit Ŵ for windows whose tEnd lies
  // inside the trustworthy range of the data.
  const totalCumTx = new Array<number>(xDays.length).fill(0);
  for (const cell of cells) {
    for (let i = 0; i < cell.cumTx.length; i++) totalCumTx[i] += cell.cumTx[i];
  }
  const trustIdx = effectiveLastIndex(totalCumTx);
  const trustEndDay = xDays[trustIdx] ?? maxDays;
  const trustMaxYear = Math.floor(trustEndDay / 365);
  const cappedMaxYears = Math.min(maxYears, Math.max(1, trustMaxYear));

  const out: WaitTimeYear[] = [];
  for (let y = 1; y <= cappedMaxYears; y++) {
    const tStart = (y - 1) * 365;
    const tEnd = y * 365;
    const deathsIdx = y - 1;

    // Per-cell wait times (used only for the age-stratified view).
    const lowByAge: Record<string, number> = {};
    const highByAge: Record<string, number> = {};
    const lowDialByAge: Record<string, number> = {};
    const highDialByAge: Record<string, number> = {};
    const lowBridgeByAge: Record<string, number> = {};
    const highBridgeByAge: Record<string, number> = {};

    // Sums for flow-weighted aggregation (W combined).
    let sumLLow = 0;
    let sumOutLow = 0;
    let sumLHigh = 0;
    let sumOutHigh = 0;
    // Sums for W_C (dialysis only).
    let sumLCLow = 0;
    let sumOutCLow = 0;
    let sumLCHigh = 0;
    let sumOutCHigh = 0;
    // Sums for W_X (bridge only).
    let sumLXLow = 0;
    let sumOutXLow = 0;
    let sumLXHigh = 0;
    let sumOutXHigh = 0;

    for (const cell of cells) {
      const meanL = meanInWindow(xDays, cell.L, tStart, tEnd);
      // wl_removal hazard operates on the un-bridged candidate pool C
      // only (a bridged patient on a functioning xenograft isn't
      // "removed for being too sick"); we use a dedicated meanL_C for
      // the hazard product to avoid inflating removals in bridge mode.
      const meanLC = meanInWindow(xDays, cell.LCForRemoval, tStart, tEnd);
      const meanLX = meanInWindow(xDays, cell.LX, tStart, tEnd);
      const txStart = interpolateCumulative(xDays, cell.cumTx, tStart);
      const txEnd = interpolateCumulative(xDays, cell.cumTx, tEnd);
      const dTx = Math.max(0, txEnd - txStart);
      const dDeaths = cell.deathsPerYear[deathsIdx] || 0;
      // Bridge-deaths channel: number of deaths-with-functioning-xeno
      // during the year, interpolated from the cumulative series. In
      // Replacement mode this is identically zero (cumBridgeDeaths is
      // an all-zeros vector), so no behavior change there.
      const bdStart = interpolateCumulative(xDays, cell.cumBridgeDeaths, tStart);
      const bdEnd = interpolateCumulative(xDays, cell.cumBridgeDeaths, tEnd);
      const dBridgeDeaths = Math.max(0, bdEnd - bdStart);
      // wl_removal is a per-person-day hazard; over one year and an
      // average un-bridged load of meanL_C, the expected removals are
      // rate × meanL_C × 365. NaN-guard so we don't pollute outflow
      // when meanL is missing.
      const wlRemovalRate = cell.cpra === 'low' ? wlRem.low : wlRem.high;
      const dRemovals =
        Number.isFinite(meanLC) && wlRemovalRate > 0
          ? wlRemovalRate * meanLC * 365
          : 0;
      const outflow = dTx + dDeaths + dBridgeDeaths + dRemovals;
      const months = waitTimeMonths(meanL, outflow);

      // ── W_C: dialysis-only wait per spell ────────────────────────
      //  L = C, outflow = (cum_xeno + cum_std - cum_bridge_allo) +
      //                   wl_deaths + wl_removals
      //  Note: bridge_deaths are NOT outflow from C (they happen in
      //  H_xeno). Xeno transplants ARE outflow from C even in bridge
      //  mode (the patient stops being on dialysis).
      const txFromCStart = interpolateCumulative(xDays, cell.cumTxFromC, tStart);
      const txFromCEnd = interpolateCumulative(xDays, cell.cumTxFromC, tEnd);
      const dTxFromC = Math.max(0, txFromCEnd - txFromCStart);
      const outflowC = dTxFromC + dDeaths + dRemovals;
      const dialysisMonths = waitTimeMonths(meanLC, outflowC);

      // ── W_X: time on bridge per spell ────────────────────────────
      //  L = H_xeno, outflow_X = inflow_X − ΔH_xeno
      //  where inflow_X = Δcum_xeno_transplants.
      //  In steady state ΔH_xeno → 0 and outflow_X → Δcum_xeno.
      const xenoInStart = interpolateCumulative(xDays, cell.cumXeno, tStart);
      const xenoInEnd = interpolateCumulative(xDays, cell.cumXeno, tEnd);
      const dInflowX = Math.max(0, xenoInEnd - xenoInStart);
      const lxStart = interpolateCumulative(xDays, cell.LX, tStart);
      const lxEnd = interpolateCumulative(xDays, cell.LX, tEnd);
      const dHX = lxEnd - lxStart;
      const outflowX = dInflowX - dHX;
      // NaN when meanLX = 0 (no bridge population) or outflow ≤ 0.
      const bridgeMonths = (meanLX > 0 && outflowX > 0)
        ? waitTimeMonths(meanLX, outflowX)
        : NaN;

      if (cell.cpra === 'low') {
        lowByAge[cell.ageKey] = months;
        lowDialByAge[cell.ageKey] = dialysisMonths;
        lowBridgeByAge[cell.ageKey] = bridgeMonths;
        if (Number.isFinite(meanL) && outflow > 0) {
          sumLLow += meanL;
          sumOutLow += outflow;
        }
        if (Number.isFinite(meanLC) && outflowC > 0) {
          sumLCLow += meanLC;
          sumOutCLow += outflowC;
        }
        if (Number.isFinite(meanLX) && meanLX > 0 && outflowX > 0) {
          sumLXLow += meanLX;
          sumOutXLow += outflowX;
        }
      } else {
        highByAge[cell.ageKey] = months;
        highDialByAge[cell.ageKey] = dialysisMonths;
        highBridgeByAge[cell.ageKey] = bridgeMonths;
        if (Number.isFinite(meanL) && outflow > 0) {
          sumLHigh += meanL;
          sumOutHigh += outflow;
        }
        if (Number.isFinite(meanLC) && outflowC > 0) {
          sumLCHigh += meanLC;
          sumOutCHigh += outflowC;
        }
        if (Number.isFinite(meanLX) && meanLX > 0 && outflowX > 0) {
          sumLXHigh += meanLX;
          sumOutXHigh += outflowX;
        }
      }
    }

    const lowMonths = waitTimeMonths(sumLLow, sumOutLow);
    const highMonths = waitTimeMonths(sumLHigh, sumOutHigh);
    const totalMonths = waitTimeMonths(sumLLow + sumLHigh, sumOutLow + sumOutHigh);

    const lowDialysis = waitTimeMonths(sumLCLow, sumOutCLow);
    const highDialysis = waitTimeMonths(sumLCHigh, sumOutCHigh);
    const totalDialysis = waitTimeMonths(sumLCLow + sumLCHigh, sumOutCLow + sumOutCHigh);

    const lowBridge = waitTimeMonths(sumLXLow, sumOutXLow);
    const highBridge = waitTimeMonths(sumLXHigh, sumOutXHigh);
    const totalBridge = waitTimeMonths(sumLXLow + sumLXHigh, sumOutXLow + sumOutXHigh);

    out.push({
      year: y,
      totalMonths,
      lowCPRAMonths: lowMonths,
      highCPRAMonths: highMonths,
      lowCPRAByAge: lowByAge,
      highCPRAByAge: highByAge,
      dialysisTotalMonths: totalDialysis,
      dialysisLowCPRAMonths: lowDialysis,
      dialysisHighCPRAMonths: highDialysis,
      dialysisLowCPRAByAge: lowDialByAge,
      dialysisHighCPRAByAge: highDialByAge,
      bridgeTotalMonths: totalBridge,
      bridgeLowCPRAMonths: lowBridge,
      bridgeHighCPRAMonths: highBridge,
      bridgeLowCPRAByAge: lowBridgeByAge,
      bridgeHighCPRAByAge: highBridgeByAge,
    });
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────
// Dialysis-burden metrics (Task Group 5)
// ────────────────────────────────────────────────────────────────────────
//
// The Bridge page reframes the headline value of xenotransplantation
// around dialysis displacement rather than just throughput or mortality.
// Modelling assumption (codified in MARKOV_CHAIN_SPECIFICATION.md and the
// Bridge intro card): every patient in state C is on active dialysis.
// State H_xeno represents the same patient with a functioning xenograft
// bridge (off dialysis); state H_std represents a definitive allokidney
// recipient (also off dialysis).
//
// Headline metric: cumulative dialysis-years avoided over the horizon
//
//   dialysis_years_avoided(T) = (1/365) · ∫₀ᵀ [ C_base(τ) − C_scen(τ) ] dτ
//
// Approximated trapezoidally on the shared (xDays) grid. In replacement
// mode this reduces to "person-years removed from the waitlist by xeno
// substitution"; in bridge mode it captures the additional channel of
// "patients holding a bridge xenograft instead of being on dialysis."
//
// Derived metrics:
//   per_recipient_months_avoided = 12 · dialysis_years_avoided
//                                       / cum_xeno_transplants(T)
//   sessions_avoided             = dialysis_years_avoided · 365.25/7 · 3
//                                  (3 sessions/week is the modal HD schedule)
//
// Time-share (stacked bar): fraction of horizon person-time spent in
// each state. Computed as
//   share_C = ∫C dt / ∫(C + H_xeno + H_std) dt
//   share_X = ∫H_xeno dt / ∫(...)
//   share_std = ∫H_std dt / ∫(...)
//
// Returns null when prerequisites are missing (e.g. no base scenario).
export interface DialysisBurdenMetrics {
  horizonYears: number;
  // Cumulative person-years on dialysis avoided vs. base case.
  dialysisYearsAvoided: number;
  // = dialysisYearsAvoided × 12 / cumXenoAtHorizon. 0 when no xeno
  // transplants occurred. Reported in months for user familiarity.
  perRecipientMonthsAvoided: number;
  // = dialysisYearsAvoided × 365.25/7 × 3, the count of 3-per-week
  // outpatient hemodialysis sessions displaced over the horizon.
  sessionsAvoided: number;
  // Total cumulative xeno transplants at horizon (used as the denominator
  // of perRecipientMonthsAvoided; surfaced so consumers can sanity-check).
  cumXenoAtHorizon: number;
  // Time-share (scenario): ∫C dt vs ∫H_xeno dt vs ∫H_std dt over the
  // horizon, normalized to fractions of total person-time on the list
  // OR holding a graft.
  timeShare: { dialysis: number; bridge: number; postAllo: number };
  // Same time-share decomposition for the base case (so the UI can show
  // a side-by-side stacked bar). Always present alongside the scenario
  // share since dialysisYearsAvoided requires a base scenario anyway.
  baseTimeShare: { dialysis: number; bridge: number; postAllo: number };
}

// Sum the cell-level series across (cPRA × age) buckets into a single
// per-x trajectory. Tolerates missing input (returns empty array).
function sumAcrossCells(
  series: Array<{ label: string; y: number[] }> | undefined,
): number[] {
  if (!series || series.length === 0) return [];
  // Filter out aggregate rows ("total ...") so we don't double-count.
  const cells = series.filter((s) => {
    const lbl = (s.label || '').toLowerCase();
    return !lbl.startsWith('total') && (lbl.includes('age') || lbl.includes('cpra'));
  });
  const source = cells.length > 0 ? cells : series;
  const len = source[0]?.y?.length ?? 0;
  const out = new Array<number>(len).fill(0);
  for (const s of source) {
    if (!s.y || s.y.length !== len) continue;
    // Skip aggregate rows when we couldn't filter (fallback path).
    const lbl = (s.label || '').toLowerCase();
    if (cells.length === 0 && lbl.startsWith('total')) continue;
    for (let i = 0; i < len; i++) out[i] += s.y[i] || 0;
  }
  return out;
}

// Trapezoidal integral of y(t) over [tStart, tEnd] given the x grid.
// Linear interpolation at the boundaries; assumes x is sorted.
function trapezoidalIntegral(
  x: number[],
  y: number[],
  tStart: number,
  tEnd: number,
): number {
  if (x.length === 0 || y.length === 0 || x.length !== y.length) return 0;
  if (tEnd <= tStart) return 0;
  const interp = (t: number): number => {
    if (t <= x[0]) return y[0] || 0;
    if (t >= x[x.length - 1]) return y[y.length - 1] || 0;
    for (let i = 1; i < x.length; i++) {
      if (x[i] >= t) {
        const x0 = x[i - 1];
        const x1 = x[i];
        if (x1 === x0) return y[i] || 0;
        const frac = (t - x0) / (x1 - x0);
        return (y[i - 1] || 0) + frac * ((y[i] || 0) - (y[i - 1] || 0));
      }
    }
    return y[y.length - 1] || 0;
  };
  let sum = 0;
  let prevX = tStart;
  let prevY = interp(tStart);
  for (let i = 0; i < x.length; i++) {
    if (x[i] <= tStart) continue;
    if (x[i] >= tEnd) break;
    const curX = x[i];
    const curY = y[i] || 0;
    sum += 0.5 * (prevY + curY) * (curX - prevX);
    prevX = curX;
    prevY = curY;
  }
  const endY = interp(tEnd);
  sum += 0.5 * (prevY + endY) * (tEnd - prevX);
  return sum;
}

// Sum H_xeno cells from the recipients_xeno series, or fall back to the
// (legacy / non-bridge) recipients series when recipients_xeno is
// absent. For replacement-mode JSONs without H_xeno semantics this
// returns 0-filled.
function sumRecipientsXeno(vizData: VizData): { x: number[]; y: number[] } {
  if (vizData.recipients_xeno && vizData.recipients_xeno.x && vizData.recipients_xeno.x.length > 0) {
    return {
      x: vizData.recipients_xeno.x,
      y: sumAcrossCells(vizData.recipients_xeno.series),
    };
  }
  return { x: vizData.waitlist_sizes?.x ?? [], y: [] };
}

function sumRecipientsStd(vizData: VizData): { x: number[]; y: number[] } {
  if (vizData.recipients_std && vizData.recipients_std.x && vizData.recipients_std.x.length > 0) {
    return {
      x: vizData.recipients_std.x,
      y: sumAcrossCells(vizData.recipients_std.series),
    };
  }
  return { x: vizData.waitlist_sizes?.x ?? [], y: [] };
}

function sumWaitlist(vizData: VizData): { x: number[]; y: number[] } {
  if (!vizData.waitlist_sizes || !vizData.waitlist_sizes.x) return { x: [], y: [] };
  return {
    x: vizData.waitlist_sizes.x,
    y: sumAcrossCells(vizData.waitlist_sizes.series),
  };
}

function sumCumXeno(vizData: VizData): { x: number[]; y: number[] } {
  const src = vizData.cumulative_xeno_transplants;
  if (!src || !src.x || src.x.length === 0) return { x: [], y: [] };
  return { x: src.x, y: sumAcrossCells(src.series) };
}

export function computeDialysisBurden(
  vizData: VizData,
  baseVizData: VizData | null,
  horizonYears?: number,
): DialysisBurdenMetrics | null {
  if (!baseVizData) return null;
  const wlScen = sumWaitlist(vizData);
  const wlBase = sumWaitlist(baseVizData);
  if (wlScen.x.length === 0 || wlBase.x.length === 0) return null;
  const horizonDays = horizonYears
    ? horizonYears * 365
    : Math.min(
        wlScen.x[wlScen.x.length - 1],
        wlBase.x[wlBase.x.length - 1],
      );
  if (!Number.isFinite(horizonDays) || horizonDays <= 0) return null;

  const intCScen = trapezoidalIntegral(wlScen.x, wlScen.y, 0, horizonDays);
  const intCBase = trapezoidalIntegral(wlBase.x, wlBase.y, 0, horizonDays);
  const dialysisDaysAvoided = Math.max(0, intCBase - intCScen);
  const dialysisYearsAvoided = dialysisDaysAvoided / 365;

  const hxScen = sumRecipientsXeno(vizData);
  const stdScen = sumRecipientsStd(vizData);
  const hxBase = sumRecipientsXeno(baseVizData);
  const stdBase = sumRecipientsStd(baseVizData);

  const intHxScen = hxScen.y.length > 0
    ? trapezoidalIntegral(hxScen.x, hxScen.y, 0, horizonDays)
    : 0;
  const intStdScen = stdScen.y.length > 0
    ? trapezoidalIntegral(stdScen.x, stdScen.y, 0, horizonDays)
    : 0;
  const intHxBase = hxBase.y.length > 0
    ? trapezoidalIntegral(hxBase.x, hxBase.y, 0, horizonDays)
    : 0;
  const intStdBase = stdBase.y.length > 0
    ? trapezoidalIntegral(stdBase.x, stdBase.y, 0, horizonDays)
    : 0;

  const totalScen = intCScen + intHxScen + intStdScen;
  const totalBase = intCBase + intHxBase + intStdBase;
  const safe = (num: number, denom: number): number =>
    denom > 0 ? num / denom : 0;
  const timeShare = {
    dialysis: safe(intCScen, totalScen),
    bridge: safe(intHxScen, totalScen),
    postAllo: safe(intStdScen, totalScen),
  };
  const baseTimeShare = {
    dialysis: safe(intCBase, totalBase),
    bridge: safe(intHxBase, totalBase),
    postAllo: safe(intStdBase, totalBase),
  };

  // Per-recipient months avoided uses CUMULATIVE xeno transplants at
  // horizon as the denominator (each C → H_xeno transition is a "bridge
  // event" — the unit we want to amortize the dialysis-time savings
  // over). Falls back to 0 if no xeno transplants occurred.
  const cumXeno = sumCumXeno(vizData);
  const cumXenoAtHorizon = cumXeno.x.length > 0
    ? interpolateCumulative(cumXeno.x, cumXeno.y, horizonDays)
    : 0;
  const perRecipientMonthsAvoided = cumXenoAtHorizon > 0
    ? (dialysisYearsAvoided * 12) / cumXenoAtHorizon
    : 0;

  // 3 sessions/week × 365.25/7 weeks/year (calendar weeks, not 52,
  // matches Medicare's HD billing convention).
  const SESSIONS_PER_YEAR = (365.25 / 7) * 3;
  const sessionsAvoided = dialysisYearsAvoided * SESSIONS_PER_YEAR;

  return {
    horizonYears: horizonDays / 365,
    dialysisYearsAvoided,
    perRecipientMonthsAvoided,
    sessionsAvoided,
    cumXenoAtHorizon,
    timeShare,
    baseTimeShare,
  };
}

export interface TransformOptions {
  // Override the waitlist-removal hazards used in the Little's-Law
  // outflow correction. Defaults to lookup from `vizData.highCPRAThreshold`
  // via `configFinder.getWlRemovalRates`. Tests use this to inject {0,0}
  // and isolate the transplant + death components when verifying core
  // math. Production callers should leave this unset.
  wlRemovalRates?: { low: number; high: number };
  // Horizon (years) for the dialysis-burden integral. Defaults to the
  // shorter of the two scenarios' x[-1]/365.
  dialysisBurdenHorizonYears?: number;
}

export function transformVizDataToSimulationData(
  vizData: VizData,
  baseVizData: VizData | null = null,
  opts: TransformOptions = {},
): SimulationData {
  const result: SimulationData = {
    waitlistData: [],
    waitlistDeathsData: [],
    postTransplantDeathsData: [],
    netDeathsPreventedData: [],
    graftFailuresData: [],
    transplantsData: [],
    penetrationData: [],
    waitingTimeData: [],
    recipientsData: [],
    cumulativeDeathsData: [],
    deathsPerYearData: [],
    deathsPerDayData: [],
    netDeathsPreventedPerYearData: [],
    waitlistDeathsPerYearData: [],
    cumulativeXenoTransplants: 0,
    cumulativeStdTransplants: 0,
  };

  // 1. Waitlist sizes
  if (vizData.waitlist_sizes && vizData.waitlist_sizes.series && vizData.waitlist_sizes.x && vizData.waitlist_sizes.x.length > 0) {
    // Try to aggregate age-stratified data first
    let lowSeries = aggregateAgeSeries(vizData.waitlist_sizes.series, 'low cpra');
    let highSeries = aggregateAgeSeries(vizData.waitlist_sizes.series, 'high cpra');

    // Fall back to non-age search if no age data found
    if (!lowSeries) {
      lowSeries = findSeries(vizData.waitlist_sizes.series, ['low cpra waitlist', 'low cpra']);
    }
    if (!highSeries) {
      highSeries = findSeries(vizData.waitlist_sizes.series, ['high cpra waitlist', 'high cpra']);
    }

    const totalSeries = findSeries(vizData.waitlist_sizes.series, ['total waitlist', 'total']);

    // Sample data to monthly resolution
    const maxDays = Math.max(...vizData.waitlist_sizes.x);
    const maxYears = daysToYears(maxDays);
    const targetPoints = Math.ceil(maxYears * 12); // Monthly sampling
    const sampledDays = sampleData(vizData.waitlist_sizes.x, targetPoints);
    const sampledLow = lowSeries ? sampleData(lowSeries, targetPoints) : [];
    const sampledHigh = highSeries ? sampleData(highSeries, targetPoints) : [];
    const sampledTotal = totalSeries ? sampleData(totalSeries, targetPoints) : [];
    const years = sampledDays.map(daysToYears);
    
    // Process base case waitlist data if available
    let baseHighCPRASeries: number[] | null = null;
    let baseLowCPRASeries: number[] | null = null;
    let baseTotalSeries: number[] | null = null;
    let baseYears: number[] = [];

    if (baseVizData && baseVizData.waitlist_sizes && baseVizData.waitlist_sizes.series && baseVizData.waitlist_sizes.x && baseVizData.waitlist_sizes.x.length > 0) {
      // Get all base case series
      let baseHighSeries = aggregateAgeSeries(baseVizData.waitlist_sizes.series, 'high cpra');
      if (!baseHighSeries) {
        baseHighSeries = findSeries(baseVizData.waitlist_sizes.series, ['high cpra waitlist', 'high cpra']);
      }

      let baseLowSeries = aggregateAgeSeries(baseVizData.waitlist_sizes.series, 'low cpra');
      if (!baseLowSeries) {
        baseLowSeries = findSeries(baseVizData.waitlist_sizes.series, ['low cpra waitlist', 'low cpra']);
      }

      const baseTotalSeriesData = findSeries(baseVizData.waitlist_sizes.series, ['total waitlist', 'total']);

      if (baseHighSeries || baseLowSeries || baseTotalSeriesData) {
        const baseMaxDays = Math.max(...baseVizData.waitlist_sizes.x);
        const baseMaxYears = daysToYears(baseMaxDays);
        const baseTargetPoints = Math.ceil(baseMaxYears * 12);
        const baseSampledDays = sampleData(baseVizData.waitlist_sizes.x, baseTargetPoints);
        baseHighCPRASeries = baseHighSeries ? sampleData(baseHighSeries, baseTargetPoints) : null;
        baseLowCPRASeries = baseLowSeries ? sampleData(baseLowSeries, baseTargetPoints) : null;
        baseTotalSeries = baseTotalSeriesData ? sampleData(baseTotalSeriesData, baseTargetPoints) : null;
        baseYears = baseSampledDays.map(daysToYears);
      }
    }
    
    for (let i = 0; i < years.length; i++) {
      const low = sampledLow[i] || 0;
      const high = sampledHigh[i] || 0;
      const total = sampledTotal[i] || (low + high);

      // Find matching base case data points (closest year)
      let baseHighCPRA: number | undefined = undefined;
      let baseLowCPRA: number | undefined = undefined;
      let baseTotal: number | undefined = undefined;

      if (baseYears.length > 0) {
        const currentYear = years[i];
        let closestIdx = 0;
        let minDiff = Math.abs(baseYears[0] - currentYear);
        for (let j = 1; j < baseYears.length; j++) {
          const diff = Math.abs(baseYears[j] - currentYear);
          if (diff < minDiff) {
            minDiff = diff;
            closestIdx = j;
          }
        }
        // Only use if within 0.1 years
        if (minDiff < 0.1) {
          if (baseHighCPRASeries) baseHighCPRA = baseHighCPRASeries[closestIdx];
          if (baseLowCPRASeries) baseLowCPRA = baseLowCPRASeries[closestIdx];
          if (baseTotalSeries) baseTotal = baseTotalSeries[closestIdx];
        }
      }

      result.waitlistData.push({
        year: Math.round(years[i] * 100) / 100,
        total,
        lowCPRA: low,
        highCPRA: high,
        baseHighCPRA,
        baseLowCPRA,
        baseTotal,
      });
    }

    // Extract age-specific waitlist data (optional)
    const lowAgeGroups = extractAgeGroupSeries(vizData.waitlist_sizes.series, 'low cpra');
    const highAgeGroups = extractAgeGroupSeries(vizData.waitlist_sizes.series, 'high cpra');

    if (lowAgeGroups || highAgeGroups) {
      result.waitlistDataByAge = [];
      for (let i = 0; i < years.length; i++) {
        const lowCPRAByAge: Record<string, number> = {};
        const highCPRAByAge: Record<string, number> = {};

        if (lowAgeGroups) {
          for (const [ageKey, ageData] of Object.entries(lowAgeGroups)) {
            lowCPRAByAge[ageKey] = sampleData(ageData, targetPoints)[i] || 0;
          }
        }

        if (highAgeGroups) {
          for (const [ageKey, ageData] of Object.entries(highAgeGroups)) {
            highCPRAByAge[ageKey] = sampleData(ageData, targetPoints)[i] || 0;
          }
        }

        result.waitlistDataByAge.push({
          year: Math.round(years[i] * 100) / 100,
          lowCPRA: lowCPRAByAge,
          highCPRA: highCPRAByAge,
        });
      }
    }
  }

  // 2. Recipients
  if (vizData.recipients && vizData.recipients.series && vizData.recipients.x && vizData.recipients.x.length > 0) {
    // Check if we have separate human and xeno series (new format)
    let lowHuman, highHuman, highXeno, lowXeno;

    if (vizData.recipients_std && vizData.recipients_xeno) {
      lowHuman = aggregateAgeSeries(vizData.recipients_std.series, 'low cpra');
      const highStd = aggregateAgeSeries(vizData.recipients_std.series, 'high cpra');
      highXeno = aggregateAgeSeries(vizData.recipients_xeno.series, 'high cpra');
      lowXeno = aggregateAgeSeries(vizData.recipients_xeno.series, 'low cpra');

      highHuman = highStd;
    } else {
      // Old format: try to find in combined recipients series
      lowHuman = aggregateAgeSeries(vizData.recipients.series, 'low cpra');
      // For high cPRA, we might have separate standard and xeno, so search more specifically
      highHuman = findSeries(vizData.recipients.series, ['high cpra standard', 'high cpra recipients']);
      highXeno = findSeries(vizData.recipients.series, ['high cpra xeno']);

      // Fall back to non-age search if needed
      if (!lowHuman) {
        lowHuman = findSeries(vizData.recipients.series, ['low cpra recipients', 'low cpra']);
      }
      if (!highHuman) {
        highHuman = findSeries(vizData.recipients.series, ['high cpra recipients']);
      }
    }
    
    // Sample to monthly resolution
    const maxDays = Math.max(...vizData.recipients.x);
    const maxYears = daysToYears(maxDays);
    const targetPoints = Math.ceil(maxYears * 12);
    const sampledDays = sampleData(vizData.recipients.x, targetPoints);
    const sampledLowHuman = lowHuman ? sampleData(lowHuman, targetPoints) : [];
    const sampledHighHuman = highHuman ? sampleData(highHuman, targetPoints) : [];
    const sampledHighXeno = highXeno ? sampleData(highXeno, targetPoints) : [];
    const sampledLowXeno = lowXeno ? sampleData(lowXeno, targetPoints) : [];
    const years = sampledDays.map(daysToYears);
    
    for (let i = 0; i < years.length; i++) {
      result.recipientsData.push({
        year: Math.round(years[i] * 100) / 100,
        lowHuman: sampledLowHuman[i] || 0,
        highHuman: sampledHighHuman[i] || 0,
        highXeno: sampledHighXeno[i] || 0,
        lowXeno: sampledLowXeno[i] || 0,
      });
    }

    // Extract age-specific recipients data (optional)
    const lowAgeGroupsStd = vizData.recipients_std ? extractAgeGroupSeries(vizData.recipients_std.series, 'low cpra') : null;
    const highAgeGroupsStd = vizData.recipients_std ? extractAgeGroupSeries(vizData.recipients_std.series, 'high cpra') : null;
    const lowAgeGroupsXeno = vizData.recipients_xeno ? extractAgeGroupSeries(vizData.recipients_xeno.series, 'low cpra') : null;
    const highAgeGroupsXeno = vizData.recipients_xeno ? extractAgeGroupSeries(vizData.recipients_xeno.series, 'high cpra') : null;

    if (lowAgeGroupsStd || highAgeGroupsStd || lowAgeGroupsXeno || highAgeGroupsXeno) {
      result.recipientsDataByAge = [];

      const sampleAgeGroups = (
        groups: Record<string, number[]> | null,
        idx: number
      ): Record<string, number> => {
        if (!groups) return {};
        const out: Record<string, number> = {};
        for (const [ageKey, ageData] of Object.entries(groups)) {
          out[ageKey] = sampleData(ageData, targetPoints)[idx] || 0;
        }
        return out;
      };

      for (let i = 0; i < years.length; i++) {
        const lowHumanByAge = sampleAgeGroups(lowAgeGroupsStd, i);
        const highHumanByAge = sampleAgeGroups(highAgeGroupsStd, i);
        const lowXenoByAge = sampleAgeGroups(lowAgeGroupsXeno, i);
        const highXenoByAge = sampleAgeGroups(highAgeGroupsXeno, i);

        // Combined (human + xeno) per age group preserves the legacy
        // lowCPRA/highCPRA shape that older readers expect.
        const lowCombined: Record<string, number> = {};
        const highCombined: Record<string, number> = {};
        const lowKeys = new Set([
          ...Object.keys(lowHumanByAge),
          ...Object.keys(lowXenoByAge),
        ]);
        const highKeys = new Set([
          ...Object.keys(highHumanByAge),
          ...Object.keys(highXenoByAge),
        ]);
        for (const ageKey of lowKeys) {
          lowCombined[ageKey] = (lowHumanByAge[ageKey] || 0) + (lowXenoByAge[ageKey] || 0);
        }
        for (const ageKey of highKeys) {
          highCombined[ageKey] = (highHumanByAge[ageKey] || 0) + (highXenoByAge[ageKey] || 0);
        }

        result.recipientsDataByAge.push({
          year: Math.round(years[i] * 100) / 100,
          lowCPRA: lowCombined,
          highCPRA: highCombined,
          lowHuman: lowAgeGroupsStd ? lowHumanByAge : undefined,
          highHuman: highAgeGroupsStd ? highHumanByAge : undefined,
          lowXeno: lowAgeGroupsXeno ? lowXenoByAge : undefined,
          highXeno: highAgeGroupsXeno ? highXenoByAge : undefined,
        });
      }
    }
  }

  // 2b. Cumulative xeno transplants (actual procedures, not living recipients).
  // Store BOTH the legacy end-of-series scalar (back-compat) and the full
  // (x_days, y) timeseries so callers can slice at any horizon. The scalar
  // is the 10y final value and silently over-reports on shorter horizons —
  // prefer the series.
  if (vizData.cumulative_xeno_transplants && vizData.cumulative_xeno_transplants.series && vizData.cumulative_xeno_transplants.x && vizData.cumulative_xeno_transplants.x.length > 0) {
    const totalSeries = findSeries(vizData.cumulative_xeno_transplants.series, ['total xeno transplants', 'total']);
    if (totalSeries && totalSeries.length > 0) {
      result.cumulativeXenoTransplants = totalSeries[totalSeries.length - 1] || 0;
      result.cumulativeXenoTransplantsSeries = {
        xDays: [...vizData.cumulative_xeno_transplants.x],
        y: [...totalSeries],
      };
    }
  }

  // 2c. Cumulative human transplants (actual procedures, not living recipients)
  if (vizData.cumulative_std_transplants && vizData.cumulative_std_transplants.series && vizData.cumulative_std_transplants.x && vizData.cumulative_std_transplants.x.length > 0) {
    const totalSeries = findSeries(vizData.cumulative_std_transplants.series, ['total human transplants', 'total']);
    if (totalSeries && totalSeries.length > 0) {
      result.cumulativeStdTransplants = totalSeries[totalSeries.length - 1] || 0;
      result.cumulativeStdTransplantsSeries = {
        xDays: [...vizData.cumulative_std_transplants.x],
        y: [...totalSeries],
      };
    }
  }

  // 2d. Bridge Therapy: cumulative allokidneys whose recipient was a
  // bridged candidate (drawn from H_xeno instead of C). Subset of
  // cumulativeStdTransplants. Identically zero / missing in
  // Replacement Therapy runs.
  if (vizData.cumulative_bridge_allo && vizData.cumulative_bridge_allo.series && vizData.cumulative_bridge_allo.x && vizData.cumulative_bridge_allo.x.length > 0) {
    const totalSeries = findSeries(
      vizData.cumulative_bridge_allo.series,
      ['total bridge allokidneys', 'total bridge allo', 'total'],
    );
    if (totalSeries && totalSeries.length > 0) {
      result.cumulativeBridgeAllo = totalSeries[totalSeries.length - 1] || 0;
      result.cumulativeBridgeAlloSeries = {
        xDays: [...vizData.cumulative_bridge_allo.x],
        y: [...totalSeries],
      };
    }
  }
  // Therapy regime tag (read directly from the JSON so the rest of the
  // app can branch on it without re-deriving).
  result.therapyMode = resolveTherapyMode(vizData);

  // 3. Cumulative deaths
  if (vizData.cumulative_deaths && vizData.cumulative_deaths.series && vizData.cumulative_deaths.x && vizData.cumulative_deaths.x.length > 0) {
    // For age-stratified data, deaths are aggregated across ages (not separated by waitlist/post-tx in age version)
    // Try to aggregate age-stratified data first
    let lowWaitlist = null;
    let highWaitlist = null;
    let lowPostTx = null;
    let highPostTx = null;

    // Check if we have age-stratified death data (simpler format)
    const lowAgeTotal = aggregateAgeSeries(vizData.cumulative_deaths.series, 'low cpra');
    const highAgeTotal = aggregateAgeSeries(vizData.cumulative_deaths.series, 'high cpra');

    if (lowAgeTotal && highAgeTotal) {
      // Age-stratified data: use totals for both waitlist and post-tx
      // (age version doesn't separate these in cumulative_deaths)
      lowWaitlist = lowAgeTotal;
      highWaitlist = highAgeTotal;
      lowPostTx = new Array(lowAgeTotal.length).fill(0);
      highPostTx = new Array(highAgeTotal.length).fill(0);
    } else {
      // Non-age data: search for specific waitlist/post-tx breakdowns
      lowWaitlist = findSeries(vizData.cumulative_deaths.series, ['low cpra waitlist deaths']);
      highWaitlist = findSeries(vizData.cumulative_deaths.series, ['high cpra waitlist deaths']);
      lowPostTx = findSeries(vizData.cumulative_deaths.series, ['low cpra post-tx deaths', 'low cpra post tx deaths']);
      highPostTx = findSeries(vizData.cumulative_deaths.series, ['high cpra post-tx deaths', 'high cpra post tx deaths']);
    }

    const total = findSeries(vizData.cumulative_deaths.series, ['total deaths', 'total']);
    
    // Sample to monthly resolution
    const maxDays = Math.max(...vizData.cumulative_deaths.x);
    const maxYears = daysToYears(maxDays);
    const targetPoints = Math.ceil(maxYears * 12);
    const sampledDays = sampleData(vizData.cumulative_deaths.x, targetPoints);
    const sampledLowWl = lowWaitlist ? sampleData(lowWaitlist, targetPoints) : [];
    const sampledHighWl = highWaitlist ? sampleData(highWaitlist, targetPoints) : [];
    const sampledLowPt = lowPostTx ? sampleData(lowPostTx, targetPoints) : [];
    const sampledHighPt = highPostTx ? sampleData(highPostTx, targetPoints) : [];
    const sampledTotal = total ? sampleData(total, targetPoints) : [];
    const years = sampledDays.map(daysToYears);
    
    for (let i = 0; i < years.length; i++) {
      const lowWl = sampledLowWl[i] || 0;
      const highWl = sampledHighWl[i] || 0;
      const lowPt = sampledLowPt[i] || 0;
      const highPt = sampledHighPt[i] || 0;
      const tot = sampledTotal[i] || (lowWl + highWl + lowPt + highPt);
      
      result.cumulativeDeathsData.push({
        year: Math.round(years[i] * 100) / 100,
        lowWaitlist: lowWl,
        highWaitlist: highWl,
        lowPostTx: lowPt,
        highPostTx: highPt,
        total: tot,
      });
    }

    // Extract age-specific cumulative deaths data (optional)
    const lowAgeGroupsDeaths = extractAgeGroupSeries(vizData.cumulative_deaths.series, 'low cpra');
    const highAgeGroupsDeaths = extractAgeGroupSeries(vizData.cumulative_deaths.series, 'high cpra');

    // M6: split waitlist vs post-tx by age when the backend provides them
    const lowAgeWaitlist = vizData.cumulative_waitlist_deaths?.series
      ? extractAgeGroupSeries(vizData.cumulative_waitlist_deaths.series, 'low cpra')
      : null;
    const highAgeWaitlist = vizData.cumulative_waitlist_deaths?.series
      ? extractAgeGroupSeries(vizData.cumulative_waitlist_deaths.series, 'high cpra')
      : null;
    const lowAgePostTx = vizData.cumulative_post_tx_deaths?.series
      ? extractAgeGroupSeries(vizData.cumulative_post_tx_deaths.series, 'low cpra')
      : null;
    const highAgePostTx = vizData.cumulative_post_tx_deaths?.series
      ? extractAgeGroupSeries(vizData.cumulative_post_tx_deaths.series, 'high cpra')
      : null;

    if (lowAgeGroupsDeaths || highAgeGroupsDeaths) {
      result.cumulativeDeathsDataByAge = [];
      const targetPoints = Math.ceil(daysToYears(maxDays) * 12);

      const sampleAgeGroups = (
        groups: Record<string, number[]> | null,
        idx: number
      ): Record<string, number> | undefined => {
        if (!groups) return undefined;
        const out: Record<string, number> = {};
        for (const [ageKey, ageData] of Object.entries(groups)) {
          out[ageKey] = sampleData(ageData, targetPoints)[idx] || 0;
        }
        return out;
      };

      for (let i = 0; i < years.length; i++) {
        const lowByAge: Record<string, number> = {};
        const highByAge: Record<string, number> = {};

        if (lowAgeGroupsDeaths) {
          for (const [ageKey, ageData] of Object.entries(lowAgeGroupsDeaths)) {
            lowByAge[ageKey] = sampleData(ageData, targetPoints)[i] || 0;
          }
        }

        if (highAgeGroupsDeaths) {
          for (const [ageKey, ageData] of Object.entries(highAgeGroupsDeaths)) {
            highByAge[ageKey] = sampleData(ageData, targetPoints)[i] || 0;
          }
        }

        result.cumulativeDeathsDataByAge.push({
          year: Math.round(years[i] * 100) / 100,
          lowCPRA: lowByAge,
          highCPRA: highByAge,
          lowWaitlist: sampleAgeGroups(lowAgeWaitlist, i),
          highWaitlist: sampleAgeGroups(highAgeWaitlist, i),
          lowPostTx: sampleAgeGroups(lowAgePostTx, i),
          highPostTx: sampleAgeGroups(highAgePostTx, i),
        });
      }
    }

    // Calculate waitlist deaths per year (for scatter plot)
    // Following Python logic: monthly downsampling, then aggregate to yearly periods
    if (lowWaitlist && highWaitlist && vizData.cumulative_deaths.x.length > 0) {
      const monthDays = 30;
      const maxTime = Math.max(...vizData.cumulative_deaths.x);
      const numMonths = Math.floor(maxTime / monthDays) + 1;
      
      // Create monthly time points
      const monthlyTimes: number[] = [];
      for (let i = 0; i <= numMonths; i++) {
        monthlyTimes.push(i * monthDays);
      }
      
      // Interpolate cumulative waitlist deaths to monthly intervals
      const interpolate = (x: number[], y: number[], xNew: number[]): number[] => {
        const result: number[] = [];
        for (const xVal of xNew) {
          if (xVal <= x[0]) {
            result.push(y[0]);
          } else if (xVal >= x[x.length - 1]) {
            result.push(y[y.length - 1]);
          } else {
            // Linear interpolation
            let idx = 0;
            while (idx < x.length - 1 && x[idx + 1] < xVal) idx++;
            const x0 = x[idx];
            const x1 = x[idx + 1];
            const y0 = y[idx];
            const y1 = y[idx + 1];
            const interpolated = y0 + ((y1 - y0) * (xVal - x0)) / (x1 - x0);
            result.push(interpolated);
          }
        }
        return result;
      };
      
      const monthlyWaitlistDeathsLow = interpolate(
        vizData.cumulative_deaths.x,
        lowWaitlist,
        monthlyTimes
      );
      const monthlyWaitlistDeathsHigh = interpolate(
        vizData.cumulative_deaths.x,
        highWaitlist,
        monthlyTimes
      );
      
      // Calculate monthly waitlist deaths (difference between consecutive months)
      const monthlyWaitlistDeaths: number[] = [];
      for (let i = 1; i < monthlyWaitlistDeathsLow.length; i++) {
        const monthLow = monthlyWaitlistDeathsLow[i] - monthlyWaitlistDeathsLow[i - 1];
        const monthHigh = monthlyWaitlistDeathsHigh[i] - monthlyWaitlistDeathsHigh[i - 1];
        monthlyWaitlistDeaths.push(Math.max(0, monthLow + monthHigh));
      }
      
      // Aggregate into yearly periods (12 months per year)
      const monthsPerYear = 12;
      const numCompleteYears = Math.floor(monthlyWaitlistDeaths.length / monthsPerYear);
      
      // Calculate base case waitlist deaths per year if available
      let baseYearWaitlistDeaths: number[] = [];
      let baseNumCompleteYears = 0;
      
      if (baseVizData && baseVizData.cumulative_deaths && baseVizData.cumulative_deaths.series && baseVizData.cumulative_deaths.x && baseVizData.cumulative_deaths.x.length > 0) {
        const baseLowWaitlist = findSeries(baseVizData.cumulative_deaths.series, ['low cpra waitlist deaths']);
        const baseHighWaitlist = findSeries(baseVizData.cumulative_deaths.series, ['high cpra waitlist deaths']);
        
        if (baseLowWaitlist && baseHighWaitlist && baseVizData.cumulative_deaths.x.length > 0) {
          const baseMaxTime = Math.max(...baseVizData.cumulative_deaths.x);
          const baseNumMonths = Math.floor(baseMaxTime / monthDays) + 1;
          
          const baseMonthlyTimes: number[] = [];
          for (let i = 0; i <= baseNumMonths; i++) {
            baseMonthlyTimes.push(i * monthDays);
          }
          
          const baseMonthlyWaitlistDeathsLow = interpolate(
            baseVizData.cumulative_deaths.x,
            baseLowWaitlist,
            baseMonthlyTimes
          );
          const baseMonthlyWaitlistDeathsHigh = interpolate(
            baseVizData.cumulative_deaths.x,
            baseHighWaitlist,
            baseMonthlyTimes
          );
          
          const baseMonthlyWaitlistDeaths: number[] = [];
          for (let i = 1; i < baseMonthlyWaitlistDeathsLow.length; i++) {
            const monthLow = baseMonthlyWaitlistDeathsLow[i] - baseMonthlyWaitlistDeathsLow[i - 1];
            const monthHigh = baseMonthlyWaitlistDeathsHigh[i] - baseMonthlyWaitlistDeathsHigh[i - 1];
            baseMonthlyWaitlistDeaths.push(Math.max(0, monthLow + monthHigh));
          }
          
          baseNumCompleteYears = Math.floor(baseMonthlyWaitlistDeaths.length / monthsPerYear);
          
          for (let year = 0; year < baseNumCompleteYears; year++) {
            const startMonthIdx = year * monthsPerYear;
            const endMonthIdx = (year + 1) * monthsPerYear;
            const yearWaitlistDeaths = baseMonthlyWaitlistDeaths
              .slice(startMonthIdx, endMonthIdx)
              .reduce((sum, val) => sum + val, 0);
            baseYearWaitlistDeaths.push(yearWaitlistDeaths);
          }
        }
      }
      
      // Use minimum number of complete years to ensure fair comparison
      const finalNumCompleteYears = baseVizData && baseYearWaitlistDeaths.length > 0
        ? Math.min(numCompleteYears, baseNumCompleteYears)
        : numCompleteYears;
      
      for (let year = 0; year < finalNumCompleteYears; year++) {
        const startMonthIdx = year * monthsPerYear;
        const endMonthIdx = (year + 1) * monthsPerYear;
        const yearWaitlistDeaths = monthlyWaitlistDeaths
          .slice(startMonthIdx, endMonthIdx)
          .reduce((sum, val) => sum + val, 0);
        
        result.waitlistDeathsPerYearData.push({
          year: year * 1.0,
          waitlistDeaths: yearWaitlistDeaths,
          baseWaitlistDeaths: baseVizData && baseYearWaitlistDeaths.length > year 
            ? baseYearWaitlistDeaths[year] 
            : undefined,
        });
      }
    }
  }

  // 4. Deaths per day
  if (vizData.deaths_per_day && vizData.deaths_per_day.series && vizData.deaths_per_day.x && vizData.deaths_per_day.x.length > 0) {
    // Try age-aggregated first (for age-stratified data)
    let lowSeries = aggregateAgeSeries(vizData.deaths_per_day.series, 'low cpra');
    let highSeries = aggregateAgeSeries(vizData.deaths_per_day.series, 'high cpra');

    // Fall back to non-age search if no age data
    if (!lowSeries) {
      lowSeries = findSeries(vizData.deaths_per_day.series, ['low cpra deaths/day', 'low cpra deaths']);
    }
    if (!highSeries) {
      highSeries = findSeries(vizData.deaths_per_day.series, ['high cpra deaths/day', 'high cpra deaths']);
    }

    const totalSeries = findSeries(vizData.deaths_per_day.series, ['total deaths/day', 'total deaths', 'total']);

    // Sample to monthly resolution
    const maxDays = Math.max(...vizData.deaths_per_day.x);
    const maxYears = daysToYears(maxDays);
    const targetPoints = Math.ceil(maxYears * 12);
    const sampledDays = sampleData(vizData.deaths_per_day.x, targetPoints);
    const sampledLow = lowSeries ? sampleData(lowSeries, targetPoints) : [];
    const sampledHigh = highSeries ? sampleData(highSeries, targetPoints) : [];
    const sampledTotal = totalSeries ? sampleData(totalSeries, targetPoints) : [];
    const years = sampledDays.map(daysToYears);

    for (let i = 0; i < years.length; i++) {
      const low = sampledLow[i] || 0;
      const high = sampledHigh[i] || 0;
      const total = sampledTotal[i] || (low + high);

      result.deathsPerDayData.push({
        year: Math.round(years[i] * 100) / 100,
        low,
        high,
        total,
      });
    }
  }

  // 5. Deaths per year
  if (vizData.deaths_per_year && vizData.deaths_per_year.series) {
    // Age-stratified format uses x array, non-age uses year_labels
    if (vizData.deaths_per_year.x && vizData.deaths_per_year.x.length > 0) {
      // Age-stratified format: aggregate across age groups
      const lowSeries = aggregateAgeSeries(vizData.deaths_per_year.series, 'low cpra');
      const highSeries = aggregateAgeSeries(vizData.deaths_per_year.series, 'high cpra');
      const totalSeries = findSeries(vizData.deaths_per_year.series, ['total']);

      const xData = vizData.deaths_per_year.x;

      for (let i = 0; i < xData.length; i++) {
        result.deathsPerYearData.push({
          year: xData[i] + 1, // Convert 0-based to 1-based (yearly_deltas[0] = Year 1 deaths)
          low: lowSeries ? lowSeries[i] || 0 : 0,
          high: highSeries ? highSeries[i] || 0 : 0,
          total: totalSeries ? totalSeries[i] || 0 : 0,
        });
      }

      // Extract age-specific deaths per year data (optional)
      const lowAgeGroupsDeathsPerYear = extractAgeGroupSeries(vizData.deaths_per_year.series, 'low cpra');
      const highAgeGroupsDeathsPerYear = extractAgeGroupSeries(vizData.deaths_per_year.series, 'high cpra');

      if (lowAgeGroupsDeathsPerYear || highAgeGroupsDeathsPerYear) {
        result.deathsPerYearDataByAge = [];
        for (let i = 0; i < xData.length; i++) {
          const lowByAge: Record<string, number> = {};
          const highByAge: Record<string, number> = {};

          if (lowAgeGroupsDeathsPerYear) {
            for (const [ageKey, ageData] of Object.entries(lowAgeGroupsDeathsPerYear)) {
              lowByAge[ageKey] = ageData[i] || 0;
            }
          }

          if (highAgeGroupsDeathsPerYear) {
            for (const [ageKey, ageData] of Object.entries(highAgeGroupsDeathsPerYear)) {
              highByAge[ageKey] = ageData[i] || 0;
            }
          }

          result.deathsPerYearDataByAge.push({
            year: xData[i] + 1, // Convert 0-based to 1-based
            lowCPRA: lowByAge,
            highCPRA: highByAge,
          });
        }
      }
    } else if (vizData.deaths_per_year.year_labels && vizData.deaths_per_year.year_labels.length > 0) {
      // Non-age format: use year_labels
      const { year_labels, series } = vizData.deaths_per_year;
      const lowSeries = series.find(s => s && s.label && s.label.toLowerCase().includes('low cpra deaths'));
      const highSeries = series.find(s => s && s.label && s.label.toLowerCase().includes('high cpra deaths'));
      const totalSeries = series.find(s => s && s.label && s.label.toLowerCase().includes('total deaths'));

      for (let i = 0; i < year_labels.length; i++) {
        const year = parseInt(year_labels[i].replace('Y', '')) || i + 1;
        result.deathsPerYearData.push({
          year,
          low: lowSeries && lowSeries.values ? lowSeries.values[i] || 0 : 0,
          high: highSeries && highSeries.values ? highSeries.values[i] || 0 : 0,
          total: totalSeries && totalSeries.values ? totalSeries.values[i] || 0 : 0,
        });
      }
    }
  }

  // 6. Net deaths prevented per year
  // PRIORITY: Use backend-generated data if available (age-stratified format)
  console.log('[dataTransformer] Checking for net_deaths_prevented_per_year...');
  console.log('  exists:', !!vizData.net_deaths_prevented_per_year);
  if (vizData.net_deaths_prevented_per_year) {
    console.log('  has x:', !!vizData.net_deaths_prevented_per_year.x);
    console.log('  has series:', !!vizData.net_deaths_prevented_per_year.series);
    console.log('  x length:', vizData.net_deaths_prevented_per_year.x?.length);
    console.log('  series length:', vizData.net_deaths_prevented_per_year.series?.length);
    if (vizData.net_deaths_prevented_per_year.series && vizData.net_deaths_prevented_per_year.series.length > 0) {
      console.log('  First 3 series labels:');
      vizData.net_deaths_prevented_per_year.series.slice(0, 3).forEach((s: any, i: number) => {
        console.log(`    [${i}] ${s.label}`);
      });
      console.log('  Last series label:', vizData.net_deaths_prevented_per_year.series[vizData.net_deaths_prevented_per_year.series.length - 1].label);
    }
  }

  if (vizData.net_deaths_prevented_per_year && vizData.net_deaths_prevented_per_year.x && vizData.net_deaths_prevented_per_year.series && vizData.net_deaths_prevented_per_year.x.length > 0) {
    console.log('[dataTransformer] ✓ Using backend-generated net_deaths_prevented_per_year');
    const lowSeries = aggregateAgeSeries(vizData.net_deaths_prevented_per_year.series, 'low cpra');
    const highSeries = aggregateAgeSeries(vizData.net_deaths_prevented_per_year.series, 'high cpra');
    const totalSeries = findSeries(vizData.net_deaths_prevented_per_year.series, ['total']);
    const xData = vizData.net_deaths_prevented_per_year.x;

    console.log('  lowSeries:', lowSeries ? `found (length: ${lowSeries.length})` : 'NOT FOUND');
    console.log('  highSeries:', highSeries ? `found (length: ${highSeries.length})` : 'NOT FOUND');
    console.log('  totalSeries:', totalSeries ? `found (length: ${totalSeries.length})` : 'NOT FOUND');
    if (totalSeries) {
      console.log('  totalSeries sample values:', totalSeries.slice(0, 3));
    }

    if (totalSeries && totalSeries.length > 0) {
      for (let i = 0; i < xData.length; i++) {
        result.netDeathsPreventedPerYearData.push({
          year: xData[i] + 1, // Convert 0-based to 1-based
          low: lowSeries ? lowSeries[i] || 0 : 0,
          high: highSeries ? highSeries[i] || 0 : 0,
          total: totalSeries[i] || 0,
        });
      }
      console.log('  ✓✓✓ SUCCESS! Parsed', result.netDeathsPreventedPerYearData.length, 'years of data');
      console.log('  Sample data:', result.netDeathsPreventedPerYearData[0]);

      // Extract age-specific net deaths prevented data (optional)
      const lowAgeGroups = extractAgeGroupSeries(vizData.net_deaths_prevented_per_year.series, 'low cpra');
      const highAgeGroups = extractAgeGroupSeries(vizData.net_deaths_prevented_per_year.series, 'high cpra');
      const totalAgeGroups = extractAgeGroupSeries(vizData.net_deaths_prevented_per_year.series, 'total');

      if (lowAgeGroups || highAgeGroups || totalAgeGroups) {
        result.netDeathsPreventedByAge = [];
        for (let i = 0; i < xData.length; i++) {
          const lowByAge: Record<string, number> = {};
          const highByAge: Record<string, number> = {};
          const totalByAge: Record<string, number> = {};

          if (lowAgeGroups) {
            for (const [ageKey, ageData] of Object.entries(lowAgeGroups)) {
              lowByAge[ageKey] = ageData[i] || 0;
            }
          }

          if (highAgeGroups) {
            for (const [ageKey, ageData] of Object.entries(highAgeGroups)) {
              highByAge[ageKey] = ageData[i] || 0;
            }
          }

          if (totalAgeGroups) {
            for (const [ageKey, ageData] of Object.entries(totalAgeGroups)) {
              totalByAge[ageKey] = ageData[i] || 0;
            }
          }

          result.netDeathsPreventedByAge.push({
            year: xData[i] + 1,
            lowCPRA: lowByAge,
            highCPRA: highByAge,
            total: totalByAge,
          });
        }
        console.log('  ✓ Age-specific data parsed:', result.netDeathsPreventedByAge.length, 'years');
      }
    } else {
      console.log('  ✗✗✗ FAILED - totalSeries is empty or not found');
    }
  }
  // FALLBACK (age-stratified): compute net deaths prevented client-side from
  // the scenario's and base case's `waitlist_deaths_per_year` series.
  //
  // The backend's create_viz_data only populates `net_deaths_prevented_per_year`
  // for configs whose name matches its `xeno_age_prop...` regex — targeting
  // configs (e.g. `age60_cpraHigh_prop1p0_relist1p0_death1p0`) never match, so
  // their viz JSONs ship without the field. Both viz JSONs DO carry
  // `waitlist_deaths_per_year` though, and net = base - scenario per year is
  // the same computation the backend would do, so we just do it here.
  else if (
    !result.netDeathsPreventedPerYearData.length &&
    baseVizData?.waitlist_deaths_per_year?.series &&
    vizData.waitlist_deaths_per_year?.series &&
    Array.isArray(vizData.waitlist_deaths_per_year.series) &&
    vizData.waitlist_deaths_per_year.series.length > 0
  ) {
    console.log('[dataTransformer] Using client-side fallback: base.waitlist_deaths_per_year − scenario.waitlist_deaths_per_year');

    const scenSeries = vizData.waitlist_deaths_per_year.series;
    const baseSeries = baseVizData.waitlist_deaths_per_year.series;

    // Try age-stratified aggregation first (the actual format on disk).
    const scenLow   = aggregateAgeSeries(scenSeries, 'low cpra');
    const scenHigh  = aggregateAgeSeries(scenSeries, 'high cpra');
    const baseLow   = aggregateAgeSeries(baseSeries, 'low cpra');
    const baseHigh  = aggregateAgeSeries(baseSeries, 'high cpra');
    const scenTotal = findSeries(scenSeries, ['total waitlist deaths', 'total']);
    const baseTotal = findSeries(baseSeries, ['total waitlist deaths', 'total']);

    if (scenTotal && baseTotal) {
      const n = Math.min(scenTotal.length, baseTotal.length);
      for (let i = 0; i < n; i++) {
        result.netDeathsPreventedPerYearData.push({
          year: i + 1,
          low:   (baseLow?.[i]  ?? 0) - (scenLow?.[i]  ?? 0),
          high:  (baseHigh?.[i] ?? 0) - (scenHigh?.[i] ?? 0),
          total: (baseTotal[i]  ?? 0) - (scenTotal[i] ?? 0),
        });
      }
      console.log(`  ✓ client-side fallback emitted ${result.netDeathsPreventedPerYearData.length} years`);

      // Age-stratified breakdown — same idea, per (cPRA, age) cell.
      const scenLowAge   = extractAgeGroupSeries(scenSeries, 'low cpra');
      const scenHighAge  = extractAgeGroupSeries(scenSeries, 'high cpra');
      const baseLowAge   = extractAgeGroupSeries(baseSeries, 'low cpra');
      const baseHighAge  = extractAgeGroupSeries(baseSeries, 'high cpra');

      if (scenLowAge || scenHighAge) {
        result.netDeathsPreventedByAge = [];
        for (let i = 0; i < n; i++) {
          const lowByAge:   Record<string, number> = {};
          const highByAge:  Record<string, number> = {};
          const totalByAge: Record<string, number> = {};
          if (baseLowAge && scenLowAge) {
            for (const k of Object.keys(scenLowAge)) {
              lowByAge[k] = (baseLowAge[k]?.[i] ?? 0) - (scenLowAge[k]?.[i] ?? 0);
            }
          }
          if (baseHighAge && scenHighAge) {
            for (const k of Object.keys(scenHighAge)) {
              highByAge[k] = (baseHighAge[k]?.[i] ?? 0) - (scenHighAge[k]?.[i] ?? 0);
            }
          }
          // total per age = low_age + high_age (per cell)
          const keys = new Set([...Object.keys(lowByAge), ...Object.keys(highByAge)]);
          for (const k of keys) {
            totalByAge[k] = (lowByAge[k] ?? 0) + (highByAge[k] ?? 0);
          }
          result.netDeathsPreventedByAge.push({
            year: i + 1,
            lowCPRA: lowByAge,
            highCPRA: highByAge,
            total: totalByAge,
          });
        }
      }
    } else {
      console.warn('  ✗ client-side fallback skipped — missing total series in waitlist_deaths_per_year');
    }
  }
  // LEGACY FALLBACK: Calculate from cumulative waitlist deaths (old non-age format)
  else if (baseVizData && vizData.cumulative_deaths && vizData.cumulative_deaths.series && baseVizData.cumulative_deaths && baseVizData.cumulative_deaths.series) {
    console.log('[dataTransformer] Using fallback calculation from cumulative_deaths');

    const yearDays = 365;

    // Get total days for comparison
    const xenoMaxTime = vizData.total_days || Math.max(...vizData.cumulative_deaths.x);
    const baseMaxTime = baseVizData.total_days || Math.max(...baseVizData.cumulative_deaths.x);
    const comparisonMaxTime = Math.min(xenoMaxTime, baseMaxTime);
    const numYears = Math.floor(comparisonMaxTime / yearDays);

    // Get cumulative waitlist deaths arrays from xeno data
    const xenoWaitlistDeathsLow = findSeries(vizData.cumulative_deaths.series, ['low cpra waitlist deaths']);
    const xenoWaitlistDeathsHigh = findSeries(vizData.cumulative_deaths.series, ['high cpra waitlist deaths']);
    const xenoTimes = vizData.cumulative_deaths.x;

    // Get cumulative waitlist deaths arrays from base data
    const baseWaitlistDeathsLow = findSeries(baseVizData.cumulative_deaths.series, ['low cpra waitlist deaths']);
    const baseWaitlistDeathsHigh = findSeries(baseVizData.cumulative_deaths.series, ['high cpra waitlist deaths']);
    const baseTimes = baseVizData.cumulative_deaths.x;
    
    if (xenoWaitlistDeathsLow && xenoWaitlistDeathsHigh && baseWaitlistDeathsLow && baseWaitlistDeathsHigh) {
      // Calculate xeno waitlist deaths per year
      const xenoWaitlistDeathsPerYearLow: number[] = [];
      const xenoWaitlistDeathsPerYearHigh: number[] = [];
      const xenoWaitlistDeathsPerYearTotal: number[] = [];
      
      for (let i = 0; i < numYears; i++) {
        const startTime = i * yearDays;
        const endTime = Math.min((i + 1) * yearDays, comparisonMaxTime);
        
        const startIdx = findFirstIndex(xenoTimes, t => t >= startTime);
        const endIdx = findFirstIndex(xenoTimes, t => t >= endTime);
        
        if (startIdx < xenoTimes.length && endIdx > startIdx) {
          const actualEndIdx = endIdx - 1;
          if (actualEndIdx >= startIdx) {
            const waitlistDeathsLow = xenoWaitlistDeathsLow[actualEndIdx] - xenoWaitlistDeathsLow[startIdx];
            const waitlistDeathsHigh = xenoWaitlistDeathsHigh[actualEndIdx] - xenoWaitlistDeathsHigh[startIdx];
            const waitlistDeathsTotal = waitlistDeathsLow + waitlistDeathsHigh;
            xenoWaitlistDeathsPerYearLow.push(Math.max(0, waitlistDeathsLow));
            xenoWaitlistDeathsPerYearHigh.push(Math.max(0, waitlistDeathsHigh));
            xenoWaitlistDeathsPerYearTotal.push(Math.max(0, waitlistDeathsTotal));
          } else {
            xenoWaitlistDeathsPerYearLow.push(0);
            xenoWaitlistDeathsPerYearHigh.push(0);
            xenoWaitlistDeathsPerYearTotal.push(0);
          }
        } else {
          xenoWaitlistDeathsPerYearLow.push(0);
          xenoWaitlistDeathsPerYearHigh.push(0);
          xenoWaitlistDeathsPerYearTotal.push(0);
        }
      }
      
      // Calculate base waitlist deaths per year
      const baseWaitlistDeathsPerYearLow: number[] = [];
      const baseWaitlistDeathsPerYearHigh: number[] = [];
      const baseWaitlistDeathsPerYearTotal: number[] = [];
      
      for (let i = 0; i < numYears; i++) {
        const startTime = i * yearDays;
        const endTime = Math.min((i + 1) * yearDays, comparisonMaxTime);
        
        const startIdx = findFirstIndex(baseTimes, t => t >= startTime);
        const endIdx = findFirstIndex(baseTimes, t => t >= endTime);
        
        if (startIdx < baseTimes.length && endIdx > startIdx) {
          const actualEndIdx = endIdx - 1;
          if (actualEndIdx >= startIdx) {
            const waitlistDeathsLow = baseWaitlistDeathsLow[actualEndIdx] - baseWaitlistDeathsLow[startIdx];
            const waitlistDeathsHigh = baseWaitlistDeathsHigh[actualEndIdx] - baseWaitlistDeathsHigh[startIdx];
            const waitlistDeathsTotal = waitlistDeathsLow + waitlistDeathsHigh;
            baseWaitlistDeathsPerYearLow.push(Math.max(0, waitlistDeathsLow));
            baseWaitlistDeathsPerYearHigh.push(Math.max(0, waitlistDeathsHigh));
            baseWaitlistDeathsPerYearTotal.push(Math.max(0, waitlistDeathsTotal));
          } else {
            baseWaitlistDeathsPerYearLow.push(0);
            baseWaitlistDeathsPerYearHigh.push(0);
            baseWaitlistDeathsPerYearTotal.push(0);
          }
        } else {
          baseWaitlistDeathsPerYearLow.push(0);
          baseWaitlistDeathsPerYearHigh.push(0);
          baseWaitlistDeathsPerYearTotal.push(0);
        }
      }
      
      // Ensure same length
      const minLength = Math.min(
        xenoWaitlistDeathsPerYearTotal.length,
        baseWaitlistDeathsPerYearTotal.length
      );
      const xenoTrimmedLow = xenoWaitlistDeathsPerYearLow.slice(0, minLength);
      const xenoTrimmedHigh = xenoWaitlistDeathsPerYearHigh.slice(0, minLength);
      const xenoTrimmedTotal = xenoWaitlistDeathsPerYearTotal.slice(0, minLength);
      const baseTrimmedLow = baseWaitlistDeathsPerYearLow.slice(0, minLength);
      const baseTrimmedHigh = baseWaitlistDeathsPerYearHigh.slice(0, minLength);
      const baseTrimmedTotal = baseWaitlistDeathsPerYearTotal.slice(0, minLength);
      
      // Calculate net deaths prevented (base - xeno)
      const netDeathsPreventedLow = baseTrimmedLow.map((base, i) => base - xenoTrimmedLow[i]);
      const netDeathsPreventedHigh = baseTrimmedHigh.map((base, i) => base - xenoTrimmedHigh[i]);
      const netDeathsPreventedTotal = baseTrimmedTotal.map((base, i) => base - xenoTrimmedTotal[i]);
      
      // Populate result
      for (let i = 0; i < minLength; i++) {
        result.netDeathsPreventedPerYearData.push({
          year: i + 1,
          low: netDeathsPreventedLow[i] || 0,
          high: netDeathsPreventedHigh[i] || 0,
          total: netDeathsPreventedTotal[i] || 0,
        });
      }
    }
  } else if (vizData.net_deaths_prevented && vizData.net_deaths_prevented.series) {
    // Fallback to JSON data if base case not available
    // Check for year_labels format (non-age only has this)
    if (vizData.net_deaths_prevented.year_labels && vizData.net_deaths_prevented.year_labels.length > 0) {
      const { year_labels, series } = vizData.net_deaths_prevented;
      const lowSeries = series.find(s => s && s.label && (s.label.toLowerCase().includes('low cpra net waitlist deaths prevented') || s.label.toLowerCase().includes('low cpra net deaths prevented')));
      const highSeries = series.find(s => s && s.label && (s.label.toLowerCase().includes('high cpra net waitlist deaths prevented') || s.label.toLowerCase().includes('high cpra net deaths prevented')));
      const totalSeries = series.find(s => s && s.label && (s.label.toLowerCase().includes('total net waitlist deaths prevented') || s.label.toLowerCase().includes('total net deaths prevented')));

      for (let i = 0; i < year_labels.length; i++) {
        const year = parseInt(year_labels[i].replace('Y', '')) || i + 1;
        result.netDeathsPreventedPerYearData.push({
          year,
          low: lowSeries && lowSeries.values ? lowSeries.values[i] || 0 : 0,
          high: highSeries && highSeries.values ? highSeries.values[i] || 0 : 0,
          total: totalSeries && totalSeries.values ? totalSeries.values[i] || 0 : 0,
        });
      }
    }
  }

  // Fill in other required fields with empty/default data
  // These might not be directly available in the JSON
  const maxYear = Math.max(
    ...result.waitlistData.map(d => d.year),
    ...result.recipientsData.map(d => d.year),
    ...result.cumulativeDeathsData.map(d => d.year),
    10
  );

  for (let year = 0; year <= maxYear; year++) {
    // Waitlist deaths (extract from cumulative if needed)
    if (!result.waitlistDeathsData.find(d => d.year === year)) {
      const cumData = result.cumulativeDeathsData.find(d => d.year === year);
      result.waitlistDeathsData.push({
        year,
        waitlistDeaths: cumData ? cumData.lowWaitlist + cumData.highWaitlist : 0,
      });
    }

    // Post-transplant deaths
    if (!result.postTransplantDeathsData.find(d => d.year === year)) {
      const cumData = result.cumulativeDeathsData.find(d => d.year === year);
      result.postTransplantDeathsData.push({
        year,
        xenoPostTransplantDeaths: 0, // Will need to extract from data if available
        humanPostTransplantDeaths: cumData ? cumData.lowPostTx + cumData.highPostTx : 0,
      });
    }

    // Net deaths prevented
    if (!result.netDeathsPreventedData.find(d => d.year === year)) {
      const netData = result.netDeathsPreventedPerYearData.find(d => d.year === year);
      result.netDeathsPreventedData.push({
        year,
        netDeathsPrevented: netData ? netData.total : 0,
      });
    }

    // Graft failures (not directly in JSON, set to 0)
    if (!result.graftFailuresData.find(d => d.year === year)) {
      result.graftFailuresData.push({
        year,
        xenoGraftFailures: 0,
        humanGraftFailures: 0,
      });
    }

    // Transplants per year = cumulative_*_transplants(year) − cumulative_*_transplants(year-1).
    // These are true procedure counts. (The previous implementation diffed
    // living-recipient stocks, which subtracts out post-tx deaths and
    // relistings — that is "Δ stock", NOT "procedures performed". Bug fix.)
    if (!result.transplantsData.find(d => d.year === year)) {
      const xenoSeries = result.cumulativeXenoTransplantsSeries;
      const stdSeries = result.cumulativeStdTransplantsSeries;
      if (xenoSeries && stdSeries) {
        const tEnd = year * 365;
        const tStart = Math.max(0, (year - 1) * 365);
        const xenoEnd = interpolateCumulative(xenoSeries.xDays, xenoSeries.y, tEnd);
        const xenoStart = interpolateCumulative(xenoSeries.xDays, xenoSeries.y, tStart);
        const stdEnd = interpolateCumulative(stdSeries.xDays, stdSeries.y, tEnd);
        const stdStart = interpolateCumulative(stdSeries.xDays, stdSeries.y, tStart);
        result.transplantsData.push({
          year,
          human: Math.max(0, stdEnd - stdStart),
          xeno: Math.max(0, xenoEnd - xenoStart),
        });
      } else {
        result.transplantsData.push({ year, human: 0, xeno: 0 });
      }
    }

    // Penetration rate
    if (!result.penetrationData.find(d => d.year === year)) {
      result.penetrationData.push({ year, proportion: 0 });
    }

    // Waiting time - populated in a dedicated pass below from
    // computeWaitTimeByYear; we still ensure a row exists per year here
    // so other consumers that iterate by year don't trip over gaps.
    if (!result.waitingTimeData.find(d => d.year === year)) {
      result.waitingTimeData.push({
        year,
        averageWaitingTime: NaN,
        averageWaitingTimeMonths: NaN,
        lowCPRA: NaN,
        highCPRA: NaN,
        dialysisMonths: NaN,
        dialysisLowCPRA: NaN,
        dialysisHighCPRA: NaN,
      });
    }
  }

  // 8. Waitlist deaths per year (from backend - age-stratified format)
  if (vizData.waitlist_deaths_per_year && vizData.waitlist_deaths_per_year.x && vizData.waitlist_deaths_per_year.series && vizData.waitlist_deaths_per_year.x.length > 0) {
    const totalSeries = findSeries(vizData.waitlist_deaths_per_year.series, ['total waitlist deaths']);
    const xData = vizData.waitlist_deaths_per_year.x;

    if (totalSeries && totalSeries.length > 0) {
      // Helpers: sum any series whose label includes the cPRA prefix and
      // an age token. The backend ships per-age series only (no aggregate
      // "Low cPRA Total" row), so we build the cPRA-level totals here.
      const sumCpraSeries = (
        series: Array<{ label: string; y: number[] }>,
        cpraPattern: string
      ): number[] | null => {
        const matches = series.filter(s => {
          const lbl = s.label.toLowerCase();
          return lbl.includes(cpraPattern.toLowerCase()) && lbl.includes('age');
        });
        if (matches.length === 0) return null;
        const len = matches[0].y?.length || 0;
        const sum = new Array(len).fill(0);
        for (const s of matches) {
          for (let i = 0; i < len; i++) sum[i] += s.y?.[i] || 0;
        }
        return sum;
      };

      const lowSumSeries = sumCpraSeries(vizData.waitlist_deaths_per_year.series, 'low cpra');
      const highSumSeries = sumCpraSeries(vizData.waitlist_deaths_per_year.series, 'high cpra');

      // Base case (optional)
      let baseTotalSeries: number[] | null = null;
      let baseLowSumSeries: number[] | null = null;
      let baseHighSumSeries: number[] | null = null;
      if (baseVizData && baseVizData.waitlist_deaths_per_year && baseVizData.waitlist_deaths_per_year.series) {
        baseTotalSeries = findSeries(baseVizData.waitlist_deaths_per_year.series, ['total waitlist deaths']);
        baseLowSumSeries = sumCpraSeries(baseVizData.waitlist_deaths_per_year.series, 'low cpra');
        baseHighSumSeries = sumCpraSeries(baseVizData.waitlist_deaths_per_year.series, 'high cpra');
      }

      result.waitlistDeathsPerYearData = [];
      for (let i = 0; i < xData.length; i++) {
        result.waitlistDeathsPerYearData.push({
          year: xData[i] + 1, // Convert 0-based to 1-based
          waitlistDeaths: totalSeries[i] || 0,
          lowWaitlistDeaths: lowSumSeries ? (lowSumSeries[i] || 0) : undefined,
          highWaitlistDeaths: highSumSeries ? (highSumSeries[i] || 0) : undefined,
          baseWaitlistDeaths: baseTotalSeries ? (baseTotalSeries[i] || 0) : undefined,
          baseLowWaitlistDeaths: baseLowSumSeries ? (baseLowSumSeries[i] || 0) : undefined,
          baseHighWaitlistDeaths: baseHighSumSeries ? (baseHighSumSeries[i] || 0) : undefined,
        });
      }

      // Extract age-specific waitlist deaths per year data (optional)
      const agePatterns = [
        { key: 'age0_18', pattern: 'age 0-18' },
        { key: 'age18_45', pattern: 'age 18-45' },
        { key: 'age45_60', pattern: 'age 45-60' },
        { key: 'age60plus', pattern: 'age 60+' },
      ];

      const lowByAge: Record<string, number[]> = {};
      const highByAge: Record<string, number[]> = {};
      const totalByAge: Record<string, number[]> = {};
      for (const { key, pattern } of agePatterns) {
        const lowAge = vizData.waitlist_deaths_per_year.series.find(s =>
          s.label.toLowerCase().includes('low cpra') && s.label.toLowerCase().includes(pattern)
        );
        const highAge = vizData.waitlist_deaths_per_year.series.find(s =>
          s.label.toLowerCase().includes('high cpra') && s.label.toLowerCase().includes(pattern)
        );
        if (lowAge?.y) lowByAge[key] = lowAge.y;
        if (highAge?.y) highByAge[key] = highAge.y;
        if (lowAge?.y && highAge?.y) {
          totalByAge[key] = lowAge.y.map((v, i) => v + (highAge.y[i] || 0));
        }
      }

      if (Object.keys(totalByAge).length > 0) {
        result.waitlistDeathsPerYearDataByAge = [];
        for (let i = 0; i < xData.length; i++) {
          const totalAt: Record<string, number> = {};
          const lowAt: Record<string, number> = {};
          const highAt: Record<string, number> = {};
          for (const ageKey of Object.keys(totalByAge)) {
            totalAt[ageKey] = totalByAge[ageKey][i] || 0;
            if (lowByAge[ageKey]) lowAt[ageKey] = lowByAge[ageKey][i] || 0;
            if (highByAge[ageKey]) highAt[ageKey] = highByAge[ageKey][i] || 0;
          }
          result.waitlistDeathsPerYearDataByAge.push({
            year: xData[i] + 1,
            total: totalAt,
            lowCPRA: Object.keys(lowAt).length > 0 ? lowAt : undefined,
            highCPRA: Object.keys(highAt).length > 0 ? highAt : undefined,
          });
        }
      }
    }
  }

  // 9. Wait time (analytic, via Little's Law). Computed in a single pass
  // from the raw viz JSON (rather than the already-downsampled
  // result.waitlistData) so we don't lose precision to the monthly
  // resampling. Both xeno and base-case scenarios use identical math so
  // the reduction = base − xeno is apples-to-apples.
  //
  // CRITICAL: pass the wl_removal hazards so outflow includes all four
  // waitlist-exit channels. Without this Ŵ is overstated by ~25-35% in
  // the default config because removals are ~9.9%/yr of L vs ~5.1%/yr
  // for waitlist deaths. We resolve the rates from the high-cPRA
  // threshold the page injected into vizData; both xeno and base scenarios
  // use the same threshold (same input pickle) so the reduction stays
  // apples-to-apples.
  const threshold = (vizData as VizData & { highCPRAThreshold?: number })
    .highCPRAThreshold ?? 85;
  const wlRemovalRates = opts.wlRemovalRates ?? getWlRemovalRates(threshold);
  const xenoWT = computeWaitTimeByYear(vizData, { wlRemovalRates });
  const baseWT = baseVizData
    ? computeWaitTimeByYear(baseVizData, { wlRemovalRates })
    : null;
  if (xenoWT && xenoWT.length > 0) {
    // Replace the placeholder year-by-year list built in pass #7 above.
    const therapyMode = resolveTherapyMode(vizData);
    const exposeBridge = therapyMode === 'bridge_v2';
    const burden = computeDialysisBurden(
      vizData,
      baseVizData ?? null,
      opts.dialysisBurdenHorizonYears,
    );
    if (burden) result.dialysisBurden = burden;
    result.waitingTimeData = xenoWT.map((row) => {
      const baseRow = baseWT?.find((b) => b.year === row.year);
      const reduction =
        baseRow && Number.isFinite(baseRow.totalMonths) && Number.isFinite(row.totalMonths)
          ? baseRow.totalMonths - row.totalMonths
          : undefined;
      const dialysisReduction =
        baseRow &&
        Number.isFinite(baseRow.dialysisTotalMonths) &&
        Number.isFinite(row.dialysisTotalMonths)
          ? baseRow.dialysisTotalMonths - row.dialysisTotalMonths
          : undefined;
      return {
        year: row.year,
        averageWaitingTime: row.totalMonths,            // legacy alias
        averageWaitingTimeMonths: row.totalMonths,
        baseAverageWaitingTimeMonths: baseRow?.totalMonths,
        reductionMonths: reduction,
        lowCPRA: row.lowCPRAMonths,
        highCPRA: row.highCPRAMonths,
        baseLowCPRA: baseRow?.lowCPRAMonths,
        baseHighCPRA: baseRow?.highCPRAMonths,
        dialysisMonths: row.dialysisTotalMonths,
        baseDialysisMonths: baseRow?.dialysisTotalMonths,
        dialysisReductionMonths: dialysisReduction,
        dialysisLowCPRA: row.dialysisLowCPRAMonths,
        dialysisHighCPRA: row.dialysisHighCPRAMonths,
        baseDialysisLowCPRA: baseRow?.dialysisLowCPRAMonths,
        baseDialysisHighCPRA: baseRow?.dialysisHighCPRAMonths,
        // Only expose bridge-residence stats in bridge mode to avoid
        // confusing consumers in replacement scenarios.
        bridgeMonths: exposeBridge ? row.bridgeTotalMonths : undefined,
        bridgeLowCPRA: exposeBridge ? row.bridgeLowCPRAMonths : undefined,
        bridgeHighCPRA: exposeBridge ? row.bridgeHighCPRAMonths : undefined,
      };
    });

    // Per-age view (only meaningful if we actually got per-age cells back).
    const hasAnyAgeData = xenoWT.some(
      (r) =>
        Object.keys(r.lowCPRAByAge).length > 0 || Object.keys(r.highCPRAByAge).length > 0,
    );
    if (hasAnyAgeData) {
      result.waitingTimeDataByAge = xenoWT.map((row) => {
        const baseRow = baseWT?.find((b) => b.year === row.year);
        return {
          year: row.year,
          lowCPRA: row.lowCPRAByAge,
          highCPRA: row.highCPRAByAge,
          baseLowCPRA: baseRow?.lowCPRAByAge,
          baseHighCPRA: baseRow?.highCPRAByAge,
          dialysisLowCPRA: row.dialysisLowCPRAByAge,
          dialysisHighCPRA: row.dialysisHighCPRAByAge,
          baseDialysisLowCPRA: baseRow?.dialysisLowCPRAByAge,
          baseDialysisHighCPRA: baseRow?.dialysisHighCPRAByAge,
          bridgeLowCPRA: exposeBridge ? row.bridgeLowCPRAByAge : undefined,
          bridgeHighCPRA: exposeBridge ? row.bridgeHighCPRAByAge : undefined,
        };
      });
    }
  }

  // ── Honest lives-saved decomposition ──────────────────────────────────────
  // Pull the cumulative *Total* series for all three death buckets, for both
  // the scenario and the (N=0) base, and emit per-year values interpolated at
  // each integer year. calculateSummaryMetrics turns these into a net (total)
  // lives-saved figure plus its waitlist / post-tx components, so the headline
  // number isn't the cherry-picked waitlist-only reduction.
  if (baseVizData) {
    const cumTotal = (viz: VizData | null, keys: string[], wanted: string[]) => {
      const chart = (viz as any)?.[keys[0]] ?? (keys[1] ? (viz as any)?.[keys[1]] : undefined);
      if (!chart?.series || !chart?.x) return null;
      const y = findSeries(chart.series, wanted);
      if (!y) return null;
      return { xDays: chart.x as number[], y };
    };
    // Cumulative waitlist removals: prefer the backend series; otherwise
    // estimate ∫ wl_removal_rate · C(t) dt from the waitlist trajectory
    // (same Little's-Law inputs used by the wait-time correction), so the
    // removal exit is visible even on viz JSONs predating the series.
    const estCumRemovals = (viz: VizData | null): { xDays: number[]; y: number[] } | null => {
      const chart = (viz as any)?.waitlist_sizes;
      if (!chart?.series || !chart?.x?.length) return null;
      const low = aggregateAgeSeries(chart.series, 'low cpra');
      const high = aggregateAgeSeries(chart.series, 'high cpra');
      if (!low && !high) return null;
      const thr = (viz as any)?.highCPRAThreshold ?? 85;
      const rr = getWlRemovalRates(thr);
      const xDays = chart.x as number[];
      const y: number[] = new Array(xDays.length).fill(0);
      let acc = 0;
      for (let k = 1; k < xDays.length; k++) {
        const dt = xDays[k] - xDays[k - 1];
        const lowFlux = (((low?.[k - 1] ?? 0) + (low?.[k] ?? 0)) / 2) * rr.low;
        const highFlux = (((high?.[k - 1] ?? 0) + (high?.[k] ?? 0)) / 2) * rr.high;
        acc += (lowFlux + highFlux) * dt;
        y[k] = acc;
      }
      return { xDays, y };
    };

    const sTot = cumTotal(vizData, ['cumulative_deaths'], ['total deaths', 'total']);
    const sWl = cumTotal(vizData, ['cumulative_waitlist_deaths'], ['total waitlist deaths', 'total']);
    const sPt = cumTotal(vizData, ['cumulative_post_tx_deaths'], ['total post-tx deaths', 'total post tx deaths', 'total']);
    const sRem = cumTotal(vizData, ['cumulative_waitlist_removals'], ['total waitlist removals', 'total']) ?? estCumRemovals(vizData);
    const bTot = cumTotal(baseVizData, ['cumulative_deaths'], ['total deaths', 'total']);
    const bWl = cumTotal(baseVizData, ['cumulative_waitlist_deaths'], ['total waitlist deaths', 'total']);
    const bPt = cumTotal(baseVizData, ['cumulative_post_tx_deaths'], ['total post-tx deaths', 'total post tx deaths', 'total']);
    const bRem = cumTotal(baseVizData, ['cumulative_waitlist_removals'], ['total waitlist removals', 'total']) ?? estCumRemovals(baseVizData);
    if (sTot && sWl && bTot && bWl) {
      const maxDays = Math.max(...sTot.xDays);
      const maxYear = Math.floor(daysToYears(maxDays));
      const at = (s: { xDays: number[]; y: number[] } | null, yr: number) =>
        s ? interpolateCumulative(s.xDays, s.y, yr * 365) : 0;
      result.deathsBreakdownByYear = [];
      for (let yr = 1; yr <= maxYear; yr++) {
        result.deathsBreakdownByYear.push({
          year: yr,
          scenarioTotal: at(sTot, yr),
          scenarioWaitlist: at(sWl, yr),
          scenarioPostTx: at(sPt, yr),
          baseTotal: at(bTot, yr),
          baseWaitlist: at(bWl, yr),
          basePostTx: at(bPt, yr),
          scenarioRemovals: sRem ? at(sRem, yr) : undefined,
          baseRemovals: bRem ? at(bRem, yr) : undefined,
        });
      }
    }
  }

  return result;
}

// Calculate summary metrics from transformed data
export function calculateSummaryMetrics(data: SimulationData, horizon: number) {
  // Find data points within the horizon
  const relevantData = data.waitlistData.filter(d => d.year <= horizon);
  if (relevantData.length === 0) {
    return {
      waitlistReduction: 0,
      deathsPrevented: 0,
      livesSavedTotal: undefined as number | undefined,
      livesSavedWaitlist: undefined as number | undefined,
      postTxDeathsAdded: undefined as number | undefined,
      removalsAvoided: undefined as number | undefined,
      totalTransplants: 0,
      xenoTransplants: 0,
      penetrationRate: 0,
      // Bridge Therapy: allokidneys delivered to bridged candidates over
      // the horizon. Zero when the run isn't a bridge_v2 run; undefined-
      // safe consumers can guard on therapyMode.
      bridgeAlloTransplants: 0,
      therapyMode: data.therapyMode ?? 'replacement',
      averageWaitTimeMonths: NaN,
      baseAverageWaitTimeMonths: NaN,
      waitTimeReductionMonths: NaN,
      waitTimeReductionPct: NaN,
      // Dialysis-only (W_C) variants. Equal to the overall wait in
      // replacement mode by construction; in bridge mode they drop as
      // residence shifts off dialysis. Always emitted so paradigm-aware
      // UI can choose the right framing without therapyMode-branching
      // its math.
      dialysisWaitMonths: NaN,
      baseDialysisWaitMonths: NaN,
      dialysisWaitReductionMonths: NaN,
      dialysisWaitReductionPct: NaN,
      // Cumulative person-years of dialysis avoided vs. the base case,
      // plus the per-bridge-recipient amortization and a wall-clock
      // session count. Undefined when no base scenario is loaded.
      dialysisYearsAvoided: undefined as number | undefined,
      dialysisPerRecipientMonthsAvoided: undefined as number | undefined,
      sessionsAvoided: undefined as number | undefined,
    };
  }

  // Waitlist reduction relative to base case (xeno_proportion = 0).
  // Without a counterfactual we cannot attribute any reduction to xeno.
  const finalRow = relevantData[relevantData.length - 1];
  const finalWaitlist = finalRow?.total || 0;
  const baseFinalWaitlist = finalRow?.baseTotal;
  const waitlistReductionVsBase = baseFinalWaitlist !== undefined
    ? baseFinalWaitlist - finalWaitlist
    : 0;

  // Sum net deaths prevented up to horizon
  const totalDeathsPrevented = data.netDeathsPreventedPerYearData
    .filter(d => d.year <= horizon)
    .reduce((sum, d) => sum + d.total, 0);
  
  // Get final cumulative recipients at horizon (recipientsData contains cumulative values)
  const finalRecipients = data.recipientsData
    .filter(d => d.year <= horizon)
    .slice(-1)[0];
  
  // Use actual cumulative procedure counts (a flow) when the backend provides
  // them; otherwise fall back to end-of-horizon living recipients (a stock).
  //
  // C2 fix: prefer the full timeseries sliced at the user's horizon. The
  // legacy scalar fields (cumulativeXenoTransplants / cumulativeStdTransplants)
  // are the full-series final point and silently over-report cumulative
  // procedures whenever horizon < total_days/365 (a ~2x overstatement on a
  // 5y view of a 10y sim). Fall back to those scalars only when the series
  // is unavailable.
  const totalXenoRecipients = (finalRecipients?.highXeno || 0) + (finalRecipients?.lowXeno || 0);
  const totalHumanRecipients = (finalRecipients?.lowHuman || 0) + (finalRecipients?.highHuman || 0);
  const horizonDays = horizon * 365;
  let xenoTransplants: number;
  if (data.cumulativeXenoTransplantsSeries) {
    xenoTransplants = interpolateCumulative(
      data.cumulativeXenoTransplantsSeries.xDays,
      data.cumulativeXenoTransplantsSeries.y,
      horizonDays,
    );
  } else if (data.cumulativeXenoTransplants > 0) {
    xenoTransplants = data.cumulativeXenoTransplants;
  } else {
    xenoTransplants = totalXenoRecipients;
  }
  let humanTransplants: number;
  if (data.cumulativeStdTransplantsSeries) {
    humanTransplants = interpolateCumulative(
      data.cumulativeStdTransplantsSeries.xDays,
      data.cumulativeStdTransplantsSeries.y,
      horizonDays,
    );
  } else if (data.cumulativeStdTransplants > 0) {
    humanTransplants = data.cumulativeStdTransplants;
  } else {
    humanTransplants = totalHumanRecipients;
  }
  const totalTransplants = humanTransplants + xenoTransplants;

  // Penetration rate: xeno share of all transplants performed
  const penetrationRate = totalTransplants > 0
    ? xenoTransplants / totalTransplants
    : 0;

  // Wait time at the horizon year. We prefer an exact-year match but fall
  // back to the closest available year if the simulator's grid happens to
  // skip the requested horizon.
  const waitRows = (data.waitingTimeData || []).filter(
    (d) => d.year <= horizon && Number.isFinite(d.averageWaitingTimeMonths),
  );
  let avgWaitMonths = NaN;
  let baseAvgWaitMonths = NaN;
  let waitReductionMonths = NaN;
  let waitReductionPct = NaN;
  // Dialysis-only wait (W_C) — Task-7 paradigm-aware variant. In
  // replacement mode this equals the overall wait by construction; in
  // bridge mode it's the clinically headline number ("time on dialysis
  // per spell"). We compute both so paradigm-aware UI can choose.
  let dialysisWaitMonths = NaN;
  let baseDialysisWaitMonths = NaN;
  let dialysisWaitReductionMonths = NaN;
  let dialysisWaitReductionPct = NaN;
  if (waitRows.length > 0) {
    const horizonRow =
      waitRows.find((d) => d.year === horizon) ?? waitRows[waitRows.length - 1];
    avgWaitMonths = horizonRow.averageWaitingTimeMonths;
    if (
      horizonRow.baseAverageWaitingTimeMonths !== undefined &&
      Number.isFinite(horizonRow.baseAverageWaitingTimeMonths)
    ) {
      baseAvgWaitMonths = horizonRow.baseAverageWaitingTimeMonths;
      waitReductionMonths = baseAvgWaitMonths - avgWaitMonths;
      waitReductionPct =
        baseAvgWaitMonths > 0 ? (waitReductionMonths / baseAvgWaitMonths) * 100 : NaN;
    }
    if (Number.isFinite(horizonRow.dialysisMonths)) {
      dialysisWaitMonths = horizonRow.dialysisMonths;
    }
    if (
      horizonRow.baseDialysisMonths !== undefined &&
      Number.isFinite(horizonRow.baseDialysisMonths)
    ) {
      baseDialysisWaitMonths = horizonRow.baseDialysisMonths;
      dialysisWaitReductionMonths = baseDialysisWaitMonths - dialysisWaitMonths;
      dialysisWaitReductionPct =
        baseDialysisWaitMonths > 0
          ? (dialysisWaitReductionMonths / baseDialysisWaitMonths) * 100
          : NaN;
    }
  }

  // Bridge Therapy: slice the cumulative_bridge_allo series at the user's
  // horizon (same approach as xeno/std transplants above). Falls back to
  // the legacy end-of-series scalar or zero when missing.
  let bridgeAlloTransplants = 0;
  if (data.cumulativeBridgeAlloSeries) {
    bridgeAlloTransplants = interpolateCumulative(
      data.cumulativeBridgeAlloSeries.xDays,
      data.cumulativeBridgeAlloSeries.y,
      horizonDays,
    );
  } else if (data.cumulativeBridgeAllo && data.cumulativeBridgeAllo > 0) {
    bridgeAlloTransplants = data.cumulativeBridgeAllo;
  }

  // Dialysis burden summary — surfaces the relevant scalars from the
  // burden integral computed in transformVizDataToSimulationData. The
  // burden object itself is also accessible through data.dialysisBurden
  // for downstream consumers that want the time-share breakdown.
  const burden = data.dialysisBurden;
  const dialysisYearsAvoided = burden?.dialysisYearsAvoided;
  const dialysisPerRecipientMonthsAvoided = burden?.perRecipientMonthsAvoided;
  const sessionsAvoided = burden?.sessionsAvoided;

  // Honest lives-saved decomposition at the horizon (base − scenario, all
  // cumulative). `livesSavedTotal` nets the favorable waitlist-death drop
  // against the post-transplant deaths a transplant introduces, so it's the
  // figure that won't bias a policymaker. `undefined` when no base scenario
  // is loaded (then the UI falls back to the waitlist-only number with a
  // clear label).
  let livesSavedTotal: number | undefined;
  let livesSavedWaitlist: number | undefined;
  let postTxDeathsAdded: number | undefined;
  // Removals avoided = fewer patients leaving the list "too sick / declined"
  // because they got a transplant instead. Positive = xeno kept people from
  // the removal exit. Kept SEPARATE from deaths (removal is not death); it's
  // the missing piece that explains why counted total deaths look flat.
  let removalsAvoided: number | undefined;
  const breakdown = data.deathsBreakdownByYear;
  if (breakdown && breakdown.length) {
    const row =
      breakdown.find((d) => d.year === horizon) ??
      breakdown.filter((d) => d.year <= horizon).slice(-1)[0] ??
      breakdown[breakdown.length - 1];
    if (row) {
      livesSavedTotal = row.baseTotal - row.scenarioTotal;
      livesSavedWaitlist = row.baseWaitlist - row.scenarioWaitlist;
      // Positive = MORE post-tx deaths than base (the cost side of the ledger).
      postTxDeathsAdded = row.scenarioPostTx - row.basePostTx;
      if (row.baseRemovals !== undefined && row.scenarioRemovals !== undefined) {
        removalsAvoided = row.baseRemovals - row.scenarioRemovals;
      }
    }
  }

  return {
    waitlistReduction: waitlistReductionVsBase,
    deathsPrevented: totalDeathsPrevented,
    livesSavedTotal,
    livesSavedWaitlist,
    postTxDeathsAdded,
    removalsAvoided,
    totalTransplants,
    xenoTransplants,
    bridgeAlloTransplants,
    therapyMode: data.therapyMode ?? 'replacement',
    penetrationRate,
    averageWaitTimeMonths: avgWaitMonths,
    baseAverageWaitTimeMonths: baseAvgWaitMonths,
    waitTimeReductionMonths: waitReductionMonths,
    waitTimeReductionPct: waitReductionPct,
    dialysisWaitMonths,
    baseDialysisWaitMonths,
    dialysisWaitReductionMonths,
    dialysisWaitReductionPct,
    dialysisYearsAvoided,
    dialysisPerRecipientMonthsAvoided,
    sessionsAvoided,
  };
}

