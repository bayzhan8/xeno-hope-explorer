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
  computeDialysisBurden,
  resolveTherapyMode,
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

describe('frozen-tail defense (the year-10 uptick fix)', () => {
  // When the backend's `common_times` grid extends past the simulator's
  // actual stop time, the cumulative transplant series goes flat for
  // the last segment(s). Linear interpolation at the year-H boundary
  // then under-counts transplants and inflates Ŵ for the final year —
  // exactly the spurious upward tick observed on a real dashboard
  // screenshot. computeWaitTimeByYear should detect this and drop the
  // affected year(s).
  //
  // To simulate the artifact we monkey-patch the synthetic viz to clamp
  // the LAST sample of every cumulative tx series to its second-to-last
  // value (zero growth in the last segment).
  function freezeLastCumSegment(viz: any) {
    for (const s of viz.cumulative_xeno_transplants.series) {
      if (s.y.length >= 2) s.y[s.y.length - 1] = s.y[s.y.length - 2];
    }
    for (const s of viz.cumulative_std_transplants.series) {
      if (s.y.length >= 2) s.y[s.y.length - 1] = s.y[s.y.length - 2];
    }
  }

  it('drops the final year when the cumulative series has a frozen tail', () => {
    const viz = makeViz({
      years: 5,
      Lcell: { low: { age18_45: 1000 }, high: {} },
      txPerYearCell: { low: { age18_45: 200 }, high: {} },
      deathsPerYearCell: { low: { age18_45: 0 }, high: {} },
    });
    // Sanity: without the freeze, all 5 years emit.
    const rowsClean = computeWaitTimeByYear(viz as any);
    expect(rowsClean!.map((r) => r.year)).toEqual([1, 2, 3, 4, 5]);

    // Now corrupt the tail and re-run.
    freezeLastCumSegment(viz);
    const rowsFrozen = computeWaitTimeByYear(viz as any);
    // Year 5 should be omitted because its tEnd interpolates into the
    // frozen segment.
    expect(rowsFrozen!.map((r) => r.year)).not.toContain(5);
    // Earlier years should still emit and match the clean values.
    expect(rowsFrozen!.length).toBeGreaterThan(0);
    const cleanY3 = rowsClean!.find((r) => r.year === 3)!;
    const frozenY3 = rowsFrozen!.find((r) => r.year === 3)!;
    expect(frozenY3.totalMonths).toBeCloseTo(cleanY3.totalMonths, 1);
  });

  it('does NOT drop the last year when growth is healthy through to x[-1]', () => {
    const viz = makeViz({
      years: 4,
      Lcell: { low: { age18_45: 500 }, high: {} },
      txPerYearCell: { low: { age18_45: 100 }, high: {} },
      deathsPerYearCell: { low: { age18_45: 0 }, high: {} },
    });
    const rows = computeWaitTimeByYear(viz as any);
    expect(rows!.map((r) => r.year)).toEqual([1, 2, 3, 4]);
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

// ─── Bridge Therapy (model v2) ──────────────────────────────────────────
//
// Pins the semantic difference between Replacement and Bridge wait-time
// computations. Specifically:
//
//   * mode='bridge_v2' makes the candidate pool L = C + H_xeno
//   * mode='bridge_v2' switches the transplant outflow to tx_std ONLY
//     (xeno transplants are internal C → H_xeno; not outflow)
//   * mode='bridge_v2' adds bridge-deaths (post_tx_deaths_xeno) as an
//     outflow channel
//   * Missing `mode` field defaults to 'replacement' (back-compat).

// Augment the synthetic viz with bridge-mode fields. Caller supplies the
// H_xeno population (constant) and per-year bridge-deaths per cell; this
// helper builds the cumulative_post_tx_deaths_xeno + recipients_xeno
// series and tags the viz with mode='bridge_v2'.
function withBridgeFields(viz: any, opts: {
  hxCell: Record<'low' | 'high', Record<string, number>>;
  bridgeDeathsPerYearCell?: Record<'low' | 'high', Record<string, number>>;
  bridgeAlloPerYearCell?: Record<'low' | 'high', Record<string, number>>;
}) {
  const x = viz.waitlist_sizes.x as number[];
  const monthsTotal = x.length - 1;
  const cpras: Array<{ key: 'low' | 'high'; label: string }> = [
    { key: 'low', label: 'Low cPRA' },
    { key: 'high', label: 'High cPRA' },
  ];
  const ageKeys: Array<{ key: string; label: string }> = [
    { key: 'age0_18', label: 'Age 0-18' },
    { key: 'age18_45', label: 'Age 18-45' },
    { key: 'age45_60', label: 'Age 45-60' },
    { key: 'age60plus', label: 'Age 60+' },
  ];

  const recXenoSeries: Array<{ label: string; y: number[] }> = [];
  const postTxXenoSeries: Array<{ label: string; y: number[] }> = [];
  const bridgeAlloSeries: Array<{ label: string; y: number[] }> = [];
  for (const cpra of cpras) {
    for (const age of ageKeys) {
      const hx = opts.hxCell[cpra.key]?.[age.key] ?? 0;
      const bdY = opts.bridgeDeathsPerYearCell?.[cpra.key]?.[age.key] ?? 0;
      const baY = opts.bridgeAlloPerYearCell?.[cpra.key]?.[age.key] ?? 0;
      const hxArr: number[] = [];
      const bdArr: number[] = [];
      const baArr: number[] = [];
      for (let i = 0; i <= monthsTotal; i++) {
        const t = i / 12;
        hxArr.push(hx);
        bdArr.push(bdY * t);
        baArr.push(baY * t);
      }
      recXenoSeries.push({ label: `${cpra.label} - ${age.label} - Xeno`, y: hxArr });
      postTxXenoSeries.push({ label: `${cpra.label} - ${age.label} - Xeno`, y: bdArr });
      bridgeAlloSeries.push({ label: `${cpra.label} - ${age.label} - Bridge Allo`, y: baArr });
    }
  }
  // Synthetic totals so findSeries('total ...') hits.
  const totals = (series: Array<{ y: number[] }>) => {
    const out: number[] = new Array(recXenoSeries[0].y.length).fill(0);
    for (let i = 0; i < out.length; i++) {
      for (const s of series) out[i] += s.y[i] || 0;
    }
    return out;
  };
  recXenoSeries.push({ label: 'Total Recipients - Xeno', y: totals(recXenoSeries) });
  postTxXenoSeries.push({ label: 'Total Post-Tx Deaths - Xeno', y: totals(postTxXenoSeries) });
  bridgeAlloSeries.push({ label: 'Total Bridge Allokidneys', y: totals(bridgeAlloSeries) });

  return {
    ...viz,
    mode: 'bridge_v2',
    share_allo_with_xeno: true,
    recipients_xeno: { x, series: recXenoSeries },
    cumulative_post_tx_deaths_xeno: { x, series: postTxXenoSeries },
    cumulative_bridge_allo: { x, series: bridgeAlloSeries },
  };
}

describe('resolveTherapyMode', () => {
  it("returns 'replacement' for legacy viz with no mode field", () => {
    expect(resolveTherapyMode({ config_name: 'legacy' } as any)).toBe('replacement');
  });
  it("returns 'replacement' for null/undefined", () => {
    expect(resolveTherapyMode(null)).toBe('replacement');
    expect(resolveTherapyMode(undefined)).toBe('replacement');
  });
  it("returns 'bridge_v2' on explicit mode", () => {
    expect(resolveTherapyMode({ mode: 'bridge_v2' } as any)).toBe('bridge_v2');
  });
  it("returns 'bridge_v2' on share_allo_with_xeno even if mode is missing", () => {
    expect(resolveTherapyMode({ share_allo_with_xeno: true } as any)).toBe('bridge_v2');
  });
});

describe('Bridge Therapy wait time (mode=bridge_v2)', () => {
  it('L includes H_xeno (bridged candidates still count toward the pool)', () => {
    // Single cell, C=600, H_xeno=400 → pool L = 1000.
    // In bridge mode, tx_std is the only transplant outflow channel.
    // Set txPerYearCell with xenoShare=0 (no xeno transplants) so cum_std
    // == 200/yr and cum_xeno == 0.
    const base = makeViz({
      years: 5,
      Lcell: { low: { age18_45: 600 }, high: {} },
      txPerYearCell: { low: { age18_45: 200 }, high: {} },
      deathsPerYearCell: { low: { age18_45: 0 }, high: {} },
      xenoShare: 0,
    });
    const viz = withBridgeFields(base, {
      hxCell: { low: { age18_45: 400 }, high: {} },
    });
    const rows = computeWaitTimeByYear(viz as any, {
      wlRemovalRates: { low: 0, high: 0 },
    });
    const y3 = rows!.find((r) => r.year === 3)!;
    // L = 600 + 400 = 1000; outflow_per_year = 200; W = 1000/200*12 = 60 mo.
    expect(y3.totalMonths).toBeCloseTo(60, 1);
    expect(y3.lowCPRAMonths).toBeCloseTo(60, 1);
    expect(y3.lowCPRAByAge.age18_45).toBeCloseTo(60, 1);
  });

  it('xeno transplants are INTERNAL in bridge mode (not counted as outflow)', () => {
    // Same C and H_xeno as above, but now half the txs are "xeno" (in
    // bridge mode that's a C → H_xeno transition, NOT an outflow).
    //   Replacement-mode reading: 200 tx/yr outflow → 60 mo
    //   Bridge-mode reading: only tx_std (100/yr) is outflow → 120 mo
    // The difference verifies xeno transplants stop counting in bridge.
    const base = makeViz({
      years: 5,
      Lcell: { low: { age18_45: 600 }, high: {} },
      txPerYearCell: { low: { age18_45: 200 }, high: {} },
      deathsPerYearCell: { low: { age18_45: 0 }, high: {} },
      xenoShare: 0.5,
    });
    const viz = withBridgeFields(base, {
      hxCell: { low: { age18_45: 400 }, high: {} },
    });
    const rows = computeWaitTimeByYear(viz as any, {
      wlRemovalRates: { low: 0, high: 0 },
    });
    const y3 = rows!.find((r) => r.year === 3)!;
    // L = 1000, outflow = 100/yr tx_std only → 120 mo.
    expect(y3.totalMonths).toBeCloseTo(120, 1);
  });

  it('bridge-deaths are counted as outflow', () => {
    // Pool L = 1000. tx_std = 100/yr. waitlist_deaths = 0. bridge_deaths
    // = 50/yr. Expected outflow = 150 → W = 1000/150 * 12 = 80 mo.
    const base = makeViz({
      years: 5,
      Lcell: { low: { age18_45: 600 }, high: {} },
      txPerYearCell: { low: { age18_45: 100 }, high: {} },
      deathsPerYearCell: { low: { age18_45: 0 }, high: {} },
      xenoShare: 0,
    });
    const viz = withBridgeFields(base, {
      hxCell: { low: { age18_45: 400 }, high: {} },
      bridgeDeathsPerYearCell: { low: { age18_45: 50 }, high: {} },
    });
    const rows = computeWaitTimeByYear(viz as any, {
      wlRemovalRates: { low: 0, high: 0 },
    });
    const y3 = rows!.find((r) => r.year === 3)!;
    expect(y3.totalMonths).toBeCloseTo((1000 / 150) * 12, 1);
  });

  it('replacement vs bridge: same scenario, different L → different Ŵ', () => {
    // Identical underlying numbers, but mode flips. This pins the
    // contract that the mode tag is what flips semantics, nothing else.
    const base = makeViz({
      years: 5,
      Lcell: { low: { age18_45: 600 }, high: {} },
      txPerYearCell: { low: { age18_45: 200 }, high: {} },
      deathsPerYearCell: { low: { age18_45: 0 }, high: {} },
      xenoShare: 0,
    });
    const replRows = computeWaitTimeByYear(base as any, {
      wlRemovalRates: { low: 0, high: 0 },
    });
    // Make a bridge variant (adds H_xeno=400, mode tag, etc.).
    const viz = withBridgeFields(base, {
      hxCell: { low: { age18_45: 400 }, high: {} },
    });
    const brdgRows = computeWaitTimeByYear(viz as any, {
      wlRemovalRates: { low: 0, high: 0 },
    });
    const replY3 = replRows!.find((r) => r.year === 3)!;
    const brdgY3 = brdgRows!.find((r) => r.year === 3)!;
    // Replacement: L=C=600, outflow=200 → 36 mo
    // Bridge:      L=C+H_xeno=1000, outflow=200 → 60 mo
    expect(replY3.totalMonths).toBeCloseTo(36, 1);
    expect(brdgY3.totalMonths).toBeCloseTo(60, 1);
  });

  it('wl_removal hazard operates on C only, not on H_xeno', () => {
    // If wl_removal applied to the full pool (C + H_xeno) we'd inflate
    // the removal channel and shorten Ŵ further. Pin that the hazard
    // only acts on un-bridged candidates.
    const base = makeViz({
      years: 4,
      Lcell: { low: { age18_45: 600 }, high: {} },
      txPerYearCell: { low: { age18_45: 100 }, high: {} },
      deathsPerYearCell: { low: { age18_45: 0 }, high: {} },
      xenoShare: 0,
    });
    const viz = withBridgeFields(base, {
      hxCell: { low: { age18_45: 400 }, high: {} },
    });
    const rate = 0.0003;
    const rows = computeWaitTimeByYear(viz as any, {
      wlRemovalRates: { low: rate, high: rate },
    });
    const y3 = rows!.find((r) => r.year === 3)!;
    // pool L = 1000, but wl_removal acts on meanLC = 600 only.
    // outflow = 100 tx + 0 deaths + 0.0003 * 600 * 365 = 165.7 / yr
    // W = 1000 / 165.7 * 12 ≈ 72.4 mo
    const expected = (1000 / (100 + rate * 600 * 365)) * 12;
    expect(y3.totalMonths).toBeCloseTo(expected, 1);
  });

  it('transformer surfaces therapyMode and cumulative_bridge_allo', () => {
    const base = makeViz({
      years: 3,
      Lcell: { low: { age18_45: 600 }, high: {} },
      txPerYearCell: { low: { age18_45: 100 }, high: {} },
      deathsPerYearCell: { low: { age18_45: 0 }, high: {} },
      xenoShare: 0,
    });
    const viz = withBridgeFields(base, {
      hxCell: { low: { age18_45: 400 }, high: {} },
      bridgeAlloPerYearCell: { low: { age18_45: 30 }, high: {} },
    });
    const result = transformVizDataToSimulationData(viz as any, null, {
      wlRemovalRates: { low: 0, high: 0 },
    });
    expect(result.therapyMode).toBe('bridge_v2');
    // At t=3yr we accumulate 30*3 = 90 bridge allos in this single cell;
    // the transformer surfaces the end-of-series scalar.
    expect(result.cumulativeBridgeAllo).toBeCloseTo(90, 0);
  });

  it('replacement-mode JSON keeps cumulativeBridgeAllo unset', () => {
    const viz = makeViz({
      years: 3,
      Lcell: { low: { age18_45: 600 }, high: {} },
      txPerYearCell: { low: { age18_45: 100 }, high: {} },
      deathsPerYearCell: { low: { age18_45: 0 }, high: {} },
    });
    const result = transformVizDataToSimulationData(viz as any, null, {
      wlRemovalRates: { low: 0, high: 0 },
    });
    expect(result.therapyMode).toBe('replacement');
    expect(result.cumulativeBridgeAllo).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// W_C and W_X split (Task Group 3 + 4)
// ─────────────────────────────────────────────────────────────────────────

describe('Wait-time split (W_C dialysis-only + W_X bridge-only)', () => {
  it('replacement: W_C ≡ W exactly (no H_xeno, no bridge_allo)', () => {
    // Pure replacement scenario — every outflow channel that drains C in
    // the new W_C math is already counted in legacy W. Pin the equality.
    const viz = makeViz({
      years: 5,
      Lcell: { low: { age18_45: 1000 }, high: {} },
      txPerYearCell: { low: { age18_45: 100 }, high: {} },
      deathsPerYearCell: { low: { age18_45: 0 }, high: {} },
    });
    const rows = computeWaitTimeByYear(viz as any);
    const y3 = rows!.find((r) => r.year === 3)!;
    expect(y3.dialysisTotalMonths).toBeCloseTo(y3.totalMonths, 5);
    expect(y3.dialysisLowCPRAMonths).toBeCloseTo(y3.lowCPRAMonths, 5);
    expect(y3.dialysisLowCPRAByAge.age18_45).toBeCloseTo(
      y3.lowCPRAByAge.age18_45,
      5,
    );
  });

  it('bridge: W_C uses L=C only (drops vs combined W)', () => {
    // C=600, H_xeno=400, tx_std=100/yr (no xeno-tx, no bridge_allo,
    // no deaths). Combined W = (600+400)/100 = 10 yr = 120 mo.
    // W_C: L=600, outflow_from_C = 0 (no xeno-tx) + (cum_std - 0) +
    // 0 deaths = 100/yr → 600/100 = 6 yr = 72 mo.
    const base = makeViz({
      years: 5,
      Lcell: { low: { age18_45: 600 }, high: {} },
      txPerYearCell: { low: { age18_45: 100 }, high: {} },
      deathsPerYearCell: { low: { age18_45: 0 }, high: {} },
      xenoShare: 0,
    });
    const viz = withBridgeFields(base, {
      hxCell: { low: { age18_45: 400 }, high: {} },
    });
    const rows = computeWaitTimeByYear(viz as any, {
      wlRemovalRates: { low: 0, high: 0 },
    });
    const y3 = rows!.find((r) => r.year === 3)!;
    expect(y3.totalMonths).toBeCloseTo(120, 1);
    expect(y3.dialysisTotalMonths).toBeCloseTo(72, 1);
  });

  it('bridge: xeno transplants count as outflow from C (off dialysis)', () => {
    // Same as above but half of all tx are xeno (50/yr each).
    // W_C outflow from C = 50 (tx_xeno) + 50 (tx_std − bridge_allo)
    //                    = 100/yr → 600/100 * 12 = 72 mo. UNCHANGED.
    // Combined W: tx_std only counts in bridge, so 50/yr → 1000/50 = 240 mo.
    const base = makeViz({
      years: 5,
      Lcell: { low: { age18_45: 600 }, high: {} },
      txPerYearCell: { low: { age18_45: 100 }, high: {} },
      deathsPerYearCell: { low: { age18_45: 0 }, high: {} },
      xenoShare: 0.5,
    });
    const viz = withBridgeFields(base, {
      hxCell: { low: { age18_45: 400 }, high: {} },
    });
    const rows = computeWaitTimeByYear(viz as any, {
      wlRemovalRates: { low: 0, high: 0 },
    });
    const y3 = rows!.find((r) => r.year === 3)!;
    expect(y3.dialysisTotalMonths).toBeCloseTo(72, 1);
    expect(y3.totalMonths).toBeCloseTo(240, 1);
  });

  it('bridge: bridge_allo is subtracted from tx_std for W_C outflow', () => {
    // tx_std = 100/yr, of which 30/yr routes through H_xeno (bridge_allo).
    // → only 70/yr drains C via tx_std. Plus 0 xeno-tx (xenoShare=0).
    // W_C outflow = 0 + (100-30) + 0 = 70/yr → 600/70 * 12 ≈ 102.86 mo.
    const base = makeViz({
      years: 5,
      Lcell: { low: { age18_45: 600 }, high: {} },
      txPerYearCell: { low: { age18_45: 100 }, high: {} },
      deathsPerYearCell: { low: { age18_45: 0 }, high: {} },
      xenoShare: 0,
    });
    const viz = withBridgeFields(base, {
      hxCell: { low: { age18_45: 400 }, high: {} },
      bridgeAlloPerYearCell: { low: { age18_45: 30 }, high: {} },
    });
    const rows = computeWaitTimeByYear(viz as any, {
      wlRemovalRates: { low: 0, high: 0 },
    });
    const y3 = rows!.find((r) => r.year === 3)!;
    expect(y3.dialysisTotalMonths).toBeCloseTo((600 / 70) * 12, 1);
  });

  it('bridge: bridge_deaths are NOT outflow from C (only from H_xeno)', () => {
    // Pin that 50 bridge-deaths/yr don't show up in W_C outflow.
    // Outflow from C = tx_xeno (0) + tx_std (100) + 0 wl_deaths = 100/yr.
    // Expected W_C = 72 mo. (Combined W differs because bridge_deaths
    // DO count there; we just want to be sure they don't leak into W_C.)
    const base = makeViz({
      years: 5,
      Lcell: { low: { age18_45: 600 }, high: {} },
      txPerYearCell: { low: { age18_45: 100 }, high: {} },
      deathsPerYearCell: { low: { age18_45: 0 }, high: {} },
      xenoShare: 0,
    });
    const viz = withBridgeFields(base, {
      hxCell: { low: { age18_45: 400 }, high: {} },
      bridgeDeathsPerYearCell: { low: { age18_45: 50 }, high: {} },
    });
    const rows = computeWaitTimeByYear(viz as any, {
      wlRemovalRates: { low: 0, high: 0 },
    });
    const y3 = rows!.find((r) => r.year === 3)!;
    expect(y3.dialysisTotalMonths).toBeCloseTo(72, 1);
  });

  it('W_X: steady-state H_xeno = L_X / Δcum_xeno', () => {
    // tx_xeno = 100/yr (xenoShare=1.0, tx_total=100). H_xeno is
    // constant 200 (steady state ⇒ ΔH_xeno=0 ⇒ outflow_X = 100/yr).
    // W_X = 200/100 * 12 = 24 mo per spell.
    const base = makeViz({
      years: 5,
      Lcell: { low: { age18_45: 600 }, high: {} },
      txPerYearCell: { low: { age18_45: 100 }, high: {} },
      deathsPerYearCell: { low: { age18_45: 0 }, high: {} },
      xenoShare: 1.0,
    });
    const viz = withBridgeFields(base, {
      hxCell: { low: { age18_45: 200 }, high: {} },
    });
    const rows = computeWaitTimeByYear(viz as any, {
      wlRemovalRates: { low: 0, high: 0 },
    });
    const y3 = rows!.find((r) => r.year === 3)!;
    expect(y3.bridgeTotalMonths).toBeCloseTo(24, 1);
    expect(y3.bridgeLowCPRAByAge.age18_45).toBeCloseTo(24, 1);
  });

  it('W_X: NaN when no bridge population (replacement-style replay)', () => {
    // Bridge mode, but H_xeno=0 everywhere. Mean L_X = 0 ⇒ NaN.
    const base = makeViz({
      years: 3,
      Lcell: { low: { age18_45: 600 }, high: {} },
      txPerYearCell: { low: { age18_45: 100 }, high: {} },
      deathsPerYearCell: { low: { age18_45: 0 }, high: {} },
      xenoShare: 0,
    });
    const viz = withBridgeFields(base, {
      hxCell: { low: { age18_45: 0 }, high: {} },
    });
    const rows = computeWaitTimeByYear(viz as any, {
      wlRemovalRates: { low: 0, high: 0 },
    });
    const y2 = rows!.find((r) => r.year === 2)!;
    expect(Number.isNaN(y2.bridgeTotalMonths)).toBe(true);
    expect(Number.isNaN(y2.bridgeLowCPRAByAge.age18_45)).toBe(true);
  });

  it('transformer: bridge-mode surfaces bridgeMonths + dialysisMonths', () => {
    const base = makeViz({
      years: 3,
      Lcell: { low: { age18_45: 600 }, high: {} },
      txPerYearCell: { low: { age18_45: 100 }, high: {} },
      deathsPerYearCell: { low: { age18_45: 0 }, high: {} },
      xenoShare: 1.0,
    });
    const viz = withBridgeFields(base, {
      hxCell: { low: { age18_45: 200 }, high: {} },
    });
    const result = transformVizDataToSimulationData(viz as any, null, {
      wlRemovalRates: { low: 0, high: 0 },
    });
    const y2 = result.waitingTimeData.find((d) => d.year === 2)!;
    expect(Number.isFinite(y2.dialysisMonths)).toBe(true);
    expect(Number.isFinite(y2.bridgeMonths ?? NaN)).toBe(true);
  });

  it('transformer: replacement-mode surfaces dialysisMonths but not bridgeMonths', () => {
    const viz = makeViz({
      years: 3,
      Lcell: { low: { age18_45: 600 }, high: {} },
      txPerYearCell: { low: { age18_45: 100 }, high: {} },
      deathsPerYearCell: { low: { age18_45: 0 }, high: {} },
    });
    const result = transformVizDataToSimulationData(viz as any, null, {
      wlRemovalRates: { low: 0, high: 0 },
    });
    const y2 = result.waitingTimeData.find((d) => d.year === 2)!;
    expect(Number.isFinite(y2.dialysisMonths)).toBe(true);
    expect(y2.bridgeMonths).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Dialysis burden (Task Group 5)
// ─────────────────────────────────────────────────────────────────────────

describe('computeDialysisBurden', () => {
  it('null without a base scenario', () => {
    const viz = makeViz({
      years: 3,
      Lcell: { low: { age18_45: 1000 }, high: {} },
      txPerYearCell: { low: { age18_45: 100 }, high: {} },
      deathsPerYearCell: { low: { age18_45: 0 }, high: {} },
    });
    expect(computeDialysisBurden(viz as any, null)).toBeNull();
  });

  it('zero dialysis-years-avoided when scenarios are identical', () => {
    const a = makeViz({
      years: 3,
      Lcell: { low: { age18_45: 1000 }, high: {} },
      txPerYearCell: { low: { age18_45: 100 }, high: {} },
      deathsPerYearCell: { low: { age18_45: 0 }, high: {} },
    });
    const b = makeViz({
      years: 3,
      Lcell: { low: { age18_45: 1000 }, high: {} },
      txPerYearCell: { low: { age18_45: 100 }, high: {} },
      deathsPerYearCell: { low: { age18_45: 0 }, high: {} },
    });
    const burden = computeDialysisBurden(a as any, b as any);
    expect(burden).not.toBeNull();
    expect(burden!.dialysisYearsAvoided).toBeCloseTo(0, 6);
    expect(burden!.sessionsAvoided).toBeCloseTo(0, 6);
  });

  it('integrates the C(t) gap over horizon (constant 100 patients × 3 yr)', () => {
    // scenario keeps C=900, base has C=1000. Δ = 100 patients
    // continuously over 3 years → 300 person-years on dialysis avoided.
    const base = makeViz({
      years: 3,
      Lcell: { low: { age18_45: 1000 }, high: {} },
      txPerYearCell: { low: { age18_45: 100 }, high: {} },
      deathsPerYearCell: { low: { age18_45: 0 }, high: {} },
    });
    const scen = makeViz({
      years: 3,
      Lcell: { low: { age18_45: 900 }, high: {} },
      txPerYearCell: { low: { age18_45: 100 }, high: {} },
      deathsPerYearCell: { low: { age18_45: 0 }, high: {} },
    });
    const burden = computeDialysisBurden(scen as any, base as any);
    expect(burden).not.toBeNull();
    expect(burden!.dialysisYearsAvoided).toBeCloseTo(300, 0);
    // Sessions: 300 yr × (365.25/7 × 3) ≈ 300 × 156.5357 ≈ 46961.
    expect(burden!.sessionsAvoided).toBeCloseTo(300 * (365.25 / 7) * 3, 0);
  });

  it('per-recipient months avoided uses cum_xeno at horizon', () => {
    // 300 dialysis-years avoided; 300 cumulative xeno transplants
    // (100/yr × 3 yr) → 12 months avoided per bridge recipient.
    const base = makeViz({
      years: 3,
      Lcell: { low: { age18_45: 1000 }, high: {} },
      txPerYearCell: { low: { age18_45: 0 }, high: {} },
      deathsPerYearCell: { low: { age18_45: 0 }, high: {} },
    });
    const scen = makeViz({
      years: 3,
      Lcell: { low: { age18_45: 900 }, high: {} },
      txPerYearCell: { low: { age18_45: 100 }, high: {} },
      deathsPerYearCell: { low: { age18_45: 0 }, high: {} },
      xenoShare: 1.0,
    });
    const burden = computeDialysisBurden(scen as any, base as any);
    expect(burden).not.toBeNull();
    expect(burden!.cumXenoAtHorizon).toBeCloseTo(300, 0);
    // (300 yr × 12 mo/yr) / 300 recipients = 12 mo/recipient.
    expect(burden!.perRecipientMonthsAvoided).toBeCloseTo(12, 1);
  });

  it('time-share fractions are non-negative and sum to ~1 in each scenario', () => {
    const base = makeViz({
      years: 3,
      Lcell: { low: { age18_45: 1000 }, high: {} },
      txPerYearCell: { low: { age18_45: 100 }, high: {} },
      deathsPerYearCell: { low: { age18_45: 0 }, high: {} },
    });
    const scen = withBridgeFields(
      makeViz({
        years: 3,
        Lcell: { low: { age18_45: 700 }, high: {} },
        txPerYearCell: { low: { age18_45: 100 }, high: {} },
        deathsPerYearCell: { low: { age18_45: 0 }, high: {} },
        xenoShare: 0.5,
      }),
      { hxCell: { low: { age18_45: 200 }, high: {} } },
    );
    const burden = computeDialysisBurden(scen as any, base as any);
    expect(burden).not.toBeNull();
    const sumScen =
      burden!.timeShare.dialysis +
      burden!.timeShare.bridge +
      burden!.timeShare.postAllo;
    const sumBase =
      burden!.baseTimeShare.dialysis +
      burden!.baseTimeShare.bridge +
      burden!.baseTimeShare.postAllo;
    expect(sumScen).toBeCloseTo(1, 3);
    expect(sumBase).toBeCloseTo(1, 3);
    expect(burden!.timeShare.bridge).toBeGreaterThan(0);
    expect(burden!.baseTimeShare.bridge).toBeCloseTo(0, 5);
  });

  it('transformer surfaces dialysisBurden when a base case is supplied', () => {
    const base = makeViz({
      years: 3,
      Lcell: { low: { age18_45: 1000 }, high: {} },
      txPerYearCell: { low: { age18_45: 100 }, high: {} },
      deathsPerYearCell: { low: { age18_45: 0 }, high: {} },
    });
    const scen = makeViz({
      years: 3,
      Lcell: { low: { age18_45: 900 }, high: {} },
      txPerYearCell: { low: { age18_45: 100 }, high: {} },
      deathsPerYearCell: { low: { age18_45: 0 }, high: {} },
      xenoShare: 1.0,
    });
    const result = transformVizDataToSimulationData(scen as any, base as any, {
      wlRemovalRates: { low: 0, high: 0 },
    });
    expect(result.dialysisBurden).toBeDefined();
    expect(result.dialysisBurden!.dialysisYearsAvoided).toBeCloseTo(300, 0);
  });

  it('transformer omits dialysisBurden without a base case', () => {
    const viz = makeViz({
      years: 3,
      Lcell: { low: { age18_45: 1000 }, high: {} },
      txPerYearCell: { low: { age18_45: 100 }, high: {} },
      deathsPerYearCell: { low: { age18_45: 0 }, high: {} },
    });
    const result = transformVizDataToSimulationData(viz as any, null, {
      wlRemovalRates: { low: 0, high: 0 },
    });
    expect(result.dialysisBurden).toBeUndefined();
  });
});
