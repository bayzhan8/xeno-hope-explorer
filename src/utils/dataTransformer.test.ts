/**
 * Unit tests for the analytic wait-time helpers in dataTransformer.ts.
 *
 * The CTMC simulator doesn't emit per-patient wait times, so we estimate
 * them via Little's Law (W = L / λ_out). These tests pin the math to
 * known-good inputs so any regression in the helper or in
 * `transformVizDataToSimulationData`'s glue layer fails loudly.
 */
import { describe, expect, it } from 'vitest';
import {
  computeWaitTimeByYear,
  transformVizDataToSimulationData,
  calculateSummaryMetrics,
} from './dataTransformer';

// Build a synthetic viz JSON over `years` years (we sample monthly: 12
// points per year + an initial 0). Useful constants make the math
// trivially checkable.
function makeViz(opts: {
  years: number;
  /** Constant waitlist size per (cPRA × age) cell. */
  Lcell: Record<'low' | 'high', Record<string, number>>;
  /** Transplants per year per cell (split between xeno and std as below). */
  txPerYearCell: Record<'low' | 'high', Record<string, number>>;
  /** Waitlist deaths per year per cell. */
  deathsPerYearCell: Record<'low' | 'high', Record<string, number>>;
  /** Fraction of tx that comes from xeno (0..1). Default 0.5. */
  xenoShare?: number;
}) {
  const { years, Lcell, txPerYearCell, deathsPerYearCell, xenoShare = 0.5 } = opts;
  const ageKeys: Array<{ key: string; label: string }> = [
    { key: 'age0_18', label: 'Age 0-18' },
    { key: 'age18_45', label: 'Age 18-45' },
    { key: 'age45_60', label: 'Age 45-60' },
    { key: 'age60plus', label: 'Age 60+' },
  ];
  const cpras: Array<{ key: 'low' | 'high'; label: string }> = [
    { key: 'low', label: 'Low cPRA' },
    { key: 'high', label: 'High cPRA' },
  ];

  // Monthly x-axis in days. Index 0 = day 0; index 12 = day 365; etc.
  // We use 365 days/year to match the production code's daysToYears().
  const monthsTotal = years * 12;
  const x: number[] = [];
  for (let i = 0; i <= monthsTotal; i++) {
    x.push((i / 12) * 365);
  }

  const waitlistSeries: Array<{ label: string; y: number[] }> = [];
  const cumXenoSeries: Array<{ label: string; y: number[] }> = [];
  const cumStdSeries: Array<{ label: string; y: number[] }> = [];
  const deathsSeries: Array<{ label: string; y: number[] }> = [];

  let totalCumXeno = 0;
  let totalCumStd = 0;
  const totalLPerStep: number[] = [];

  for (const cpra of cpras) {
    for (const age of ageKeys) {
      const L = Lcell[cpra.key]?.[age.key] ?? 0;
      const txY = txPerYearCell[cpra.key]?.[age.key] ?? 0;
      const txXenoY = txY * xenoShare;
      const txStdY = txY * (1 - xenoShare);

      // Constant L over time, linear cumulative tx.
      const Larr: number[] = [];
      const xenoArr: number[] = [];
      const stdArr: number[] = [];
      for (let i = 0; i <= monthsTotal; i++) {
        const t = i / 12;
        Larr.push(L);
        xenoArr.push(txXenoY * t);
        stdArr.push(txStdY * t);
      }

      waitlistSeries.push({ label: `${cpra.label} - ${age.label}`, y: Larr });
      cumXenoSeries.push({
        label: `${cpra.label} - ${age.label} - Xeno Tx`,
        y: xenoArr,
      });
      cumStdSeries.push({
        label: `${cpra.label} - ${age.label} - Human Tx`,
        y: stdArr,
      });
      deathsSeries.push({
        label: `${cpra.label} - ${age.label}`,
        y: new Array(years).fill(deathsPerYearCell[cpra.key]?.[age.key] ?? 0),
      });
    }
  }

  // Synthetic totals so findSeries('total') hits.
  for (let i = 0; i <= monthsTotal; i++) {
    let total = 0;
    for (const s of waitlistSeries) total += s.y[i];
    totalLPerStep.push(total);
  }
  waitlistSeries.push({ label: 'Total Waitlist', y: totalLPerStep });

  const xenoTotal: number[] = [];
  const stdTotal: number[] = [];
  for (let i = 0; i <= monthsTotal; i++) {
    let xs = 0,
      sts = 0;
    for (const s of cumXenoSeries) xs += s.y[i];
    for (const s of cumStdSeries) sts += s.y[i];
    xenoTotal.push(xs);
    stdTotal.push(sts);
  }
  cumXenoSeries.push({ label: 'Total Xeno Transplants', y: xenoTotal });
  cumStdSeries.push({ label: 'Total Human Transplants', y: stdTotal });

  const totalDeathsPerYear = new Array(years).fill(0);
  for (let y = 0; y < years; y++) {
    for (const s of deathsSeries) totalDeathsPerYear[y] += s.y[y];
  }
  deathsSeries.push({ label: 'Total Waitlist Deaths/Year', y: totalDeathsPerYear });

  return {
    config_name: 'synthetic',
    waitlist_sizes: { x, series: waitlistSeries },
    cumulative_xeno_transplants: { x, series: cumXenoSeries },
    cumulative_std_transplants: { x, series: cumStdSeries },
    waitlist_deaths_per_year: {
      x: Array.from({ length: years }, (_, i) => i),
      series: deathsSeries,
    },
    // Required for the transformer to not bail on missing optional fields.
    highCPRAThreshold: 95,
  };
}

describe('computeWaitTimeByYear (Little\'s Law)', () => {
  it('returns null on missing inputs', () => {
    expect(computeWaitTimeByYear({ config_name: 'x', highCPRAThreshold: 95 } as any)).toBeNull();
  });

  it('known-input sanity: L=1000, transplants=100/yr, deaths=0 → W=120 mo', () => {
    // Single cell only (others = 0). Outflow = 100 tx/yr. W = 1000/100 = 10 yrs = 120 mo.
    const viz = makeViz({
      years: 5,
      Lcell: { low: { age18_45: 1000 }, high: {} },
      txPerYearCell: { low: { age18_45: 100 }, high: {} },
      deathsPerYearCell: { low: { age18_45: 0 }, high: {} },
    });
    const rows = computeWaitTimeByYear(viz as any);
    expect(rows).not.toBeNull();
    // Year 2 (middle, away from boundary effects) — Little's Law should
    // give exactly 120 months for the aggregate total since only one
    // cell contributes.
    const y2 = rows!.find((r) => r.year === 2)!;
    expect(y2.totalMonths).toBeCloseTo(120, 1);
    expect(y2.lowCPRAMonths).toBeCloseTo(120, 1);
    expect(y2.lowCPRAByAge.age18_45).toBeCloseTo(120, 1);
  });

  it('counts deaths as outflow: L=1000, tx=50/yr, deaths=50/yr → W=120 mo', () => {
    const viz = makeViz({
      years: 5,
      Lcell: { low: { age18_45: 1000 }, high: {} },
      txPerYearCell: { low: { age18_45: 50 }, high: {} },
      deathsPerYearCell: { low: { age18_45: 50 }, high: {} },
    });
    const rows = computeWaitTimeByYear(viz as any);
    const y3 = rows!.find((r) => r.year === 3)!;
    // Outflow per year = 100 (50 tx + 50 deaths). W = 1000/100 * 12 = 120 mo.
    expect(y3.totalMonths).toBeCloseTo(120, 1);
  });

  it('aggregates flow-weighted (sum-then-divide), not arithmetic mean of W', () => {
    // Two subgroups in low cPRA:
    //   A: L=1000, tx=100/yr  → W_A = 120 mo
    //   B: L=400,  tx=100/yr  → W_B = 48 mo
    // Arithmetic mean would be (120+48)/2 = 84 mo. WRONG.
    // Flow-weighted aggregate: L_tot/outflow_tot = 1400/200 * 12 = 84 mo.
    // In this case both happen to give 84, so pick different outflows
    // to actually distinguish.
    //
    //   A: L=1000, tx=200/yr  → W_A = 60 mo
    //   B: L=400,  tx=100/yr  → W_B = 48 mo
    // Arithmetic mean: 54 mo.
    // Flow-weighted: 1400/300 * 12 = 56 mo.
    const viz = makeViz({
      years: 5,
      Lcell: { low: { age18_45: 1000, age45_60: 400 }, high: {} },
      txPerYearCell: { low: { age18_45: 200, age45_60: 100 }, high: {} },
      deathsPerYearCell: { low: { age18_45: 0, age45_60: 0 }, high: {} },
    });
    const rows = computeWaitTimeByYear(viz as any);
    const y3 = rows!.find((r) => r.year === 3)!;
    expect(y3.lowCPRAByAge.age18_45).toBeCloseTo(60, 1);
    expect(y3.lowCPRAByAge.age45_60).toBeCloseTo(48, 1);
    // The aggregate must be the flow-weighted value, NOT the simple mean.
    expect(y3.lowCPRAMonths).toBeCloseTo(56, 1);
    expect(y3.lowCPRAMonths).not.toBeCloseTo(54, 0); // confirm wrong path rejected
  });

  it('div-by-zero guard: subgroup with zero outflow → NaN (not Infinity)', () => {
    const viz = makeViz({
      years: 3,
      Lcell: { low: { age18_45: 500 }, high: { age60plus: 200 } },
      txPerYearCell: { low: { age18_45: 100 }, high: { age60plus: 0 } },
      deathsPerYearCell: { low: { age18_45: 0 }, high: { age60plus: 0 } },
    });
    const rows = computeWaitTimeByYear(viz as any);
    const y2 = rows!.find((r) => r.year === 2)!;
    // High cPRA with zero outflow → must NOT be Infinity (which would
    // explode the chart). Also must NOT be 0 (which would be a silent
    // lie). NaN is correct: "we don't know, omit from display".
    expect(y2.highCPRAMonths).toBeNaN();
    expect(y2.highCPRAByAge.age60plus).toBeNaN();
    // Low cPRA cell is fine.
    expect(y2.lowCPRAMonths).toBeCloseTo(60, 1);
    // Total aggregate: only low contributes positive outflow, so the
    // grand total should equal the low-cPRA value (high contributes 0
    // L and 0 outflow to the sum).
    expect(y2.totalMonths).toBeCloseTo(60, 1);
  });
});

describe('transformVizDataToSimulationData wait-time integration', () => {
  // Production calls the transformer without `opts`, so it auto-picks
  // wl_removal rates from the threshold (which is correct). These
  // integration tests pass `{wlRemovalRates: {0,0}}` to isolate the
  // transplant + death components — there's a separate `describe` block
  // below that exercises the wl_removal-included path end-to-end.
  const NO_REMOVALS = { wlRemovalRates: { low: 0, high: 0 } };

  it('populates waitingTimeData with months + base comparison + reduction', () => {
    const xenoViz = makeViz({
      years: 4,
      Lcell: { low: { age18_45: 500 }, high: { age60plus: 300 } },
      txPerYearCell: { low: { age18_45: 200 }, high: { age60plus: 150 } },
      deathsPerYearCell: { low: { age18_45: 0 }, high: { age60plus: 0 } },
    });
    const baseViz = makeViz({
      // Same L, lower throughput → longer wait (base case = no xeno).
      years: 4,
      Lcell: { low: { age18_45: 500 }, high: { age60plus: 300 } },
      txPerYearCell: { low: { age18_45: 100 }, high: { age60plus: 50 } },
      deathsPerYearCell: { low: { age18_45: 0 }, high: { age60plus: 0 } },
    });
    const result = transformVizDataToSimulationData(
      xenoViz as any,
      baseViz as any,
      NO_REMOVALS,
    );
    expect(result.waitingTimeData.length).toBeGreaterThan(0);
    const y3 = result.waitingTimeData.find((r) => r.year === 3)!;
    expect(y3).toBeDefined();
    // Xeno: total L = 800, total tx/yr = 350 → W = 800/350 * 12 ≈ 27.43 mo.
    expect(y3.averageWaitingTimeMonths).toBeCloseTo((800 / 350) * 12, 1);
    // Base: total L = 800, total tx/yr = 150 → W = 800/150 * 12 = 64 mo.
    expect(y3.baseAverageWaitingTimeMonths!).toBeCloseTo(64, 1);
    // Reduction = base − xeno > 0 (xeno reduces wait).
    expect(y3.reductionMonths!).toBeGreaterThan(0);
    expect(y3.reductionMonths!).toBeCloseTo(64 - (800 / 350) * 12, 1);
    // Legacy alias mirrors the months field for back-compat.
    expect(y3.averageWaitingTime).toBe(y3.averageWaitingTimeMonths);
  });

  it('builds waitingTimeDataByAge when per-age cells exist', () => {
    const viz = makeViz({
      years: 3,
      Lcell: { low: { age0_18: 100, age18_45: 200 }, high: {} },
      txPerYearCell: { low: { age0_18: 50, age18_45: 50 }, high: {} },
      deathsPerYearCell: { low: { age0_18: 0, age18_45: 0 }, high: {} },
    });
    const result = transformVizDataToSimulationData(viz as any, null, NO_REMOVALS);
    expect(result.waitingTimeDataByAge).toBeDefined();
    const y2 = result.waitingTimeDataByAge!.find((r) => r.year === 2)!;
    // age0_18:  W = 100/50 * 12 = 24 mo
    // age18_45: W = 200/50 * 12 = 48 mo
    expect(y2.lowCPRA.age0_18).toBeCloseTo(24, 1);
    expect(y2.lowCPRA.age18_45).toBeCloseTo(48, 1);
  });
});

describe('wl_removal inclusion in outflow (the bias fix)', () => {
  // Concrete fact this test pins down: the wl_removal hazard is the
  // **second-largest** waitlist outflow channel in the default model
  // (~9.9%/yr vs ~5.1%/yr for waitlist death). Forgetting it inflates
  // Ŵ by ~25-35%. We assert both the magnitude of the correction and
  // that the reduction story (base − xeno) stays directionally intact.
  it('shortens Ŵ when removals are added (matches L/(tx + deaths + rate·L·365)·12)', () => {
    const viz = makeViz({
      years: 4,
      Lcell: { low: { age18_45: 1000 }, high: {} },
      txPerYearCell: { low: { age18_45: 100 }, high: {} },
      deathsPerYearCell: { low: { age18_45: 50 }, high: {} },
    });
    const rate = 0.0003; // per-person-day → 0.0003*365 = 10.95%/yr of L
    const rows = computeWaitTimeByYear(viz as any, {
      wlRemovalRates: { low: rate, high: rate },
    });
    const y2 = rows!.find((r) => r.year === 2)!;
    // outflow = 100 tx + 50 deaths + 0.0003 * 1000 * 365 = 259.5 / yr
    //   W = 1000 / 259.5 * 12 ≈ 46.24 mo (vs 80 mo without removals).
    const expected = (1000 / (100 + 50 + 0.0003 * 1000 * 365)) * 12;
    expect(y2.totalMonths).toBeCloseTo(expected, 1);
    expect(y2.totalMonths).toBeLessThan(80); // would be 80 without removals
    // Also pin the cPRA-level row (single cell in low) to the same value
    // so the flow-weighted aggregation path is exercised.
    expect(y2.lowCPRAMonths).toBeCloseTo(expected, 1);
  });

  it('production transformer auto-resolves rates from highCPRAThreshold (no override needed)', () => {
    // makeViz pins highCPRAThreshold=95 → getWlRemovalRates(95) ≈
    // {low: 2.7206e-4, high: 2.886e-4} per person-day. We don't hard-
    // code those rates in the assertion (they live in configFinder and
    // we want the test to follow if the pickle is regenerated). Instead
    // we verify the *bound*: Ŵ with removals must be strictly less than
    // Ŵ without removals (same numerator, larger denominator), and the
    // delta must be material (≥10% drop).
    const viz = makeViz({
      years: 3,
      Lcell: { low: { age18_45: 5000 }, high: {} },
      txPerYearCell: { low: { age18_45: 500 }, high: {} },
      deathsPerYearCell: { low: { age18_45: 0 }, high: {} },
    });
    const withRemovals = transformVizDataToSimulationData(viz as any);
    const withoutRemovals = transformVizDataToSimulationData(viz as any, null, {
      wlRemovalRates: { low: 0, high: 0 },
    });
    const y2With = withRemovals.waitingTimeData.find((r) => r.year === 2)!;
    const y2Without = withoutRemovals.waitingTimeData.find((r) => r.year === 2)!;
    expect(y2Without.averageWaitingTimeMonths).toBeCloseTo(120, 1); // 5000/500*12
    expect(y2With.averageWaitingTimeMonths).toBeLessThan(
      y2Without.averageWaitingTimeMonths,
    );
    // Bias was claimed at ~25-35%; expect at least a 15% drop here (the
    // exact rate depends on threshold but is comfortably above floor).
    const dropPct =
      (y2Without.averageWaitingTimeMonths -
        y2With.averageWaitingTimeMonths) /
      y2Without.averageWaitingTimeMonths;
    expect(dropPct).toBeGreaterThan(0.15);
  });

  it('reduction (base − xeno) stays positive after removal correction', () => {
    const xenoViz = makeViz({
      years: 4,
      Lcell: { low: { age18_45: 1500 }, high: {} },
      txPerYearCell: { low: { age18_45: 1000 }, high: {} },
      deathsPerYearCell: { low: { age18_45: 0 }, high: {} },
    });
    const baseViz = makeViz({
      years: 4,
      Lcell: { low: { age18_45: 1500 }, high: {} },
      txPerYearCell: { low: { age18_45: 750 }, high: {} },
      deathsPerYearCell: { low: { age18_45: 0 }, high: {} },
    });
    const result = transformVizDataToSimulationData(xenoViz as any, baseViz as any);
    const y3 = result.waitingTimeData.find((r) => r.year === 3)!;
    expect(y3.averageWaitingTimeMonths).toBeLessThan(
      y3.baseAverageWaitingTimeMonths!,
    );
    expect(y3.reductionMonths!).toBeGreaterThan(0);
  });
});

describe('calculateSummaryMetrics wait-time fields', () => {
  it('returns NaN-safe defaults when no wait-time data is present', () => {
    // Synthesize an empty SimulationData shell that calculateSummaryMetrics
    // can still chew on (it only requires waitlistData to be non-empty).
    const data = {
      waitlistData: [{ year: 1, total: 100, lowCPRA: 50, highCPRA: 50 }],
      waitlistDeathsData: [],
      postTransplantDeathsData: [],
      netDeathsPreventedData: [],
      graftFailuresData: [],
      transplantsData: [],
      penetrationData: [],
      waitingTimeData: [],     // <- the key bit being tested
      recipientsData: [],
      cumulativeDeathsData: [],
      deathsPerYearData: [],
      deathsPerDayData: [],
      netDeathsPreventedPerYearData: [],
      waitlistDeathsPerYearData: [],
      cumulativeXenoTransplants: 0,
      cumulativeStdTransplants: 0,
    } as any;
    const m = calculateSummaryMetrics(data, 5);
    expect(m.averageWaitTimeMonths).toBeNaN();
    expect(m.waitTimeReductionMonths).toBeNaN();
    expect(m.waitTimeReductionPct).toBeNaN();
  });

  it('reduction math: base=24mo, xeno=18mo → reduction=6mo, pct=25% (no removals)', () => {
    const xenoViz = makeViz({
      years: 4,
      // L=1500, tx=1000/yr → W = 1500/1000 * 12 = 18 mo.
      Lcell: { low: { age18_45: 1500 }, high: {} },
      txPerYearCell: { low: { age18_45: 1000 }, high: {} },
      deathsPerYearCell: { low: { age18_45: 0 }, high: {} },
    });
    const baseViz = makeViz({
      years: 4,
      // L=1500, tx=750/yr → W = 1500/750 * 12 = 24 mo.
      Lcell: { low: { age18_45: 1500 }, high: {} },
      txPerYearCell: { low: { age18_45: 750 }, high: {} },
      deathsPerYearCell: { low: { age18_45: 0 }, high: {} },
    });
    // Pass {0,0} removals so the assertion math stays simple. The
    // production path (with removals) is exercised in the dedicated
    // "wl_removal inclusion" describe block above.
    const result = transformVizDataToSimulationData(xenoViz as any, baseViz as any, {
      wlRemovalRates: { low: 0, high: 0 },
    });
    const m = calculateSummaryMetrics(result, 3);
    expect(m.averageWaitTimeMonths).toBeCloseTo(18, 1);
    expect(m.baseAverageWaitTimeMonths).toBeCloseTo(24, 1);
    expect(m.waitTimeReductionMonths).toBeCloseTo(6, 1);
    expect(m.waitTimeReductionPct).toBeCloseTo(25, 0);
  });
});
