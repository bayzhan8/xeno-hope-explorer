/**
 * Unit tests for the Bridge Therapy Pareto utilities.
 *
 * Covers:
 *   - kneedle() across canonical curve shapes (concave, convex, linear,
 *     non-monotonic, degenerate)
 *   - totalDeathsAtYear / livesSavedFromViz / waitlistAtYearFromViz
 *   - loadParetoDataset happy path + partial-miss path
 *
 * Network calls are stubbed via `vi.fn` on global.fetch so tests run
 * deterministically and offline.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  kneedle,
  totalDeathsAtYear,
  livesSavedFromViz,
  waitlistAtYearFromViz,
  waitlistReductionFromViz,
  waitTimeAtYearFromViz,
  waitTimeReductionFromViz,
  classifyCurveShape,
  toMarginalDataset,
  loadParetoDataset,
  type ParetoPointSpec,
  type ParetoDataset,
} from './pareto';

describe('kneedle', () => {
  it('returns null for empty / mismatched / too-short inputs', () => {
    expect(kneedle([], [])).toBeNull();
    expect(kneedle([1, 2], [1, 2])).toBeNull(); // 2 points → no interior knee
    expect(kneedle([1, 2, 3], [1, 2])).toBeNull(); // length mismatch
  });

  it('finds the knee on a clear concave-down increasing curve', () => {
    // Diminishing-returns shape: y rises fast then plateaus.
    const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const y = [10, 30, 55, 75, 88, 95, 98, 99, 99.5, 100];
    const knee = kneedle(x, y);
    expect(knee).not.toBeNull();
    // Knee should sit somewhere in the early-middle of the curve where the
    // slope is steepest relative to its eventual plateau.
    expect(knee).toBeGreaterThanOrEqual(2);
    expect(knee).toBeLessThanOrEqual(5);
  });

  it('returns null on a perfectly linear curve (no knee)', () => {
    const x = [1, 2, 3, 4, 5];
    const y = [10, 20, 30, 40, 50];
    expect(kneedle(x, y)).toBeNull();
  });

  it('returns null on a non-monotonic zig-zag curve', () => {
    const x = [1, 2, 3, 4, 5];
    const y = [10, 50, 5, 60, 8];
    expect(kneedle(x, y)).toBeNull();
  });

  it('handles a decreasing-then-plateau curve (waitlist-vs-supply shape)', () => {
    // Waitlist drops fast as supply ramps, then plateaus. Adding more
    // supply past the knee yields diminishing reduction. After the
    // sign-flip this becomes an increasing concave-down curve, which is
    // exactly the shape kneedle is designed to handle.
    const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const y = [100, 60, 40, 30, 24, 20, 17, 15, 13, 12];
    const knee = kneedle(x, y);
    expect(knee).not.toBeNull();
    // The big drop happens between idx 0 and 2; knee should sit early.
    expect(knee).toBeGreaterThanOrEqual(1);
    expect(knee).toBeLessThanOrEqual(4);
  });

  it('returns null on a flat / degenerate curve (yrange = 0)', () => {
    expect(kneedle([1, 2, 3, 4], [5, 5, 5, 5])).toBeNull();
  });

  it('returns null on a curve that is still rising linearly (no diminishing returns)', () => {
    // Real-world bridge data: 95 % xeno_age 12 mo @ x = supply (kidneys/yr),
    // y = lives saved by year 10. Increments per +0.5x supply step are
    // 175 → 248 → 169 → 268 → 467 (the 1.5→2 drop is MC noise, the 2→3
    // jump is +1.0x covering double the x-span). The curve is essentially
    // straight / mildly convex, so labelling 1,723/yr as a "diminishing
    // returns inflection" is misleading. Pin: kneedle returns null.
    const x = [862, 1723, 2585, 3446, 5169];
    const y = [175, 423, 592, 860, 1327];
    expect(kneedle(x, y)).toBeNull();
  });

  it('returns null on a mild-noise concave curve with high post-knee slope ratio', () => {
    // 4-point curve where the kink is mathematically present but the
    // marginal returns barely slow down. Pre-knee slope ≈ post-knee slope.
    const x = [0, 1, 2, 3];
    const y = [0, 50, 95, 140];
    // slopes: 50, 45, 45 → tiny concavity, post/pre ≈ 0.95 → no real knee
    expect(kneedle(x, y)).toBeNull();
  });

  it('still finds the knee on a strong concave curve (post-knee slope < 70 % of pre-knee)', () => {
    // Pre-knee slope (idx 0→2) is 50/unit; post-knee slope (idx 2→4) is
    // 5/unit → ratio 0.1 ≪ 0.7 → knee accepted.
    const x = [0, 1, 2, 3, 4];
    const y = [0, 50, 100, 105, 110];
    const knee = kneedle(x, y);
    expect(knee).not.toBeNull();
    expect(knee).toBe(2);
  });
});

describe('viz extractors (totalDeathsAtYear / livesSavedFromViz / waitlistAtYearFromViz)', () => {
  // Synthetic 10-year viz: deaths grow linearly, waitlist grows linearly.
  // x axis is in DAYS to match the production format.
  const buildViz = (overrides: Partial<{ wl: number[]; wlDeaths: number[]; txDeaths: number[]; total: number[] }>) => {
    const xDays = [0, 365, 730, 1095, 1460, 1825, 2190, 2555, 2920, 3285, 3650];
    return {
      total_days: 3650,
      waitlist_sizes: {
        x: xDays,
        series: [{ label: 'Total waitlist', y: overrides.wl ?? xDays.map((_, i) => 1000 - 10 * i) }],
      },
      cumulative_waitlist_deaths: overrides.wlDeaths
        ? { x: xDays, series: [{ label: 'Total waitlist deaths', y: overrides.wlDeaths }] }
        : undefined,
      cumulative_post_tx_deaths: overrides.txDeaths
        ? { x: xDays, series: [{ label: 'Total post-tx deaths', y: overrides.txDeaths }] }
        : undefined,
      cumulative_deaths: overrides.total
        ? { x: xDays, series: [{ label: 'Total deaths', y: overrides.total }] }
        : undefined,
    };
  };

  it('totalDeathsAtYear sums waitlist + post-tx splits when present', () => {
    const v = buildViz({
      wlDeaths: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
      txDeaths: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50],
    });
    // At year 10 (index 10), total = 100 + 50 = 150.
    expect(totalDeathsAtYear(v, 10)).toBe(150);
  });

  it('totalDeathsAtYear falls back to legacy cumulative_deaths when M6 splits absent', () => {
    const v = buildViz({ total: [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300] });
    expect(totalDeathsAtYear(v, 5)).toBe(150);
  });

  it('totalDeathsAtYear interpolates between sample points', () => {
    const v = buildViz({
      wlDeaths: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
      txDeaths: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    });
    // Year 4.5 — half-way between samples 4 (40) and 5 (50) → 45.
    expect(totalDeathsAtYear(v, 4.5)).toBeCloseTo(45, 6);
  });

  it('livesSavedFromViz returns base − scenario at the target year', () => {
    const base = buildViz({ wlDeaths: Array.from({ length: 11 }, (_, i) => 100 * i), txDeaths: Array(11).fill(0) });
    const scen = buildViz({ wlDeaths: Array.from({ length: 11 }, (_, i) => 60 * i), txDeaths: Array(11).fill(0) });
    expect(livesSavedFromViz(scen, base, 10)).toBe(400);
  });

  it('livesSavedFromViz uses WAITLIST deaths only — bridge-mode regression', () => {
    // Bridge therapy with prop>0 reliably reduces waitlist deaths but
    // increases post-tx deaths (more transplant recipients = more
    // exposure to the post-tx hazard during the bridge window). If we
    // used total = waitlist + post-tx, the small reduction is washed
    // out and even sometimes negated by MC noise — exactly the bug
    // that produced negative Pareto points before this fix. Pin the
    // semantics: lives saved == waitlist-deaths reduction, IGNORE
    // post-tx death deltas.
    //
    // Numbers below mirror the 95 %+, 12-mo, prop=1 production data:
    //   base wl=43636, scen wl=43216, base tx=112854, scen tx=113297.
    //   waitlist-only diff: 43636 − 43216 = +420  (positive — correct)
    //   total diff:        156490 − 156513 = −23  (negative — wrong)
    const base = buildViz({
      wlDeaths: [0, 4364, 8727, 13091, 17454, 21818, 26181, 30545, 34908, 39272, 43636],
      txDeaths: [0, 11285, 22571, 33856, 45142, 56427, 67712, 78998, 90283, 101569, 112854],
    });
    const scen = buildViz({
      wlDeaths: [0, 4322, 8643, 12965, 17286, 21608, 25930, 30251, 34573, 38894, 43216],
      txDeaths: [0, 11330, 22659, 33989, 45319, 56649, 67978, 79308, 90638, 101967, 113297],
    });
    expect(livesSavedFromViz(scen, base, 10)).toBe(420);
  });

  it('livesSavedFromViz falls back to total when waitlist split absent', () => {
    const base = buildViz({ total: [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000] });
    const scen = buildViz({ total: [0, 60, 120, 180, 240, 300, 360, 420, 480, 540, 600] });
    expect(livesSavedFromViz(scen, base, 10)).toBe(400);
  });

  it('waitlistAtYearFromViz returns the Total waitlist value at the requested year', () => {
    const v = buildViz({});
    // Default wl = [1000, 990, 980, ..., 900]
    expect(waitlistAtYearFromViz(v, 0)).toBe(1000);
    expect(waitlistAtYearFromViz(v, 10)).toBe(900);
    expect(waitlistAtYearFromViz(v, 5)).toBe(950);
  });

  it('waitlistReductionFromViz returns base − scenario waitlist (positive = good)', () => {
    const base = buildViz({ wl: Array.from({ length: 11 }, (_, i) => 1000 + 50 * i) });
    const scen = buildViz({ wl: Array.from({ length: 11 }, (_, i) => 1000 + 30 * i) });
    expect(waitlistReductionFromViz(scen, base, 10)).toBe(200);
  });
});

describe('wait-time extractors (Little\'s Law)', () => {
  // Build a viz that satisfies computeWaitTimeByYear's input contract:
  //   - waitlist_sizes (cPRA × age cells, daily x grid)
  //   - cumulative_xeno_transplants + cumulative_std_transplants (same shape)
  //   - waitlist_deaths_per_year (yearly)
  //
  // Single-cell shape: low-cPRA × age 18-45, with constant L, linear cum
  // tx, and zero waitlist deaths. With L=1000, dTx=200 per year, and
  // wl_removal=0, Ŵ = 1000 / 200 * 12 = 60 mo. With wl_removal active
  // the yearly removals at low-95 (≈0.0003/d) add ~110/yr and Ŵ drops
  // accordingly.
  const xDays = [0, 365, 730, 1095, 1460, 1825];
  const buildWtViz = (overrides: {
    L?: number;
    txPerYear?: number;
    deathsPerYear?: number;
  } = {}) => {
    const L = overrides.L ?? 1000;
    const tx = overrides.txPerYear ?? 200;
    const deaths = overrides.deathsPerYear ?? 0;
    const cumTx = xDays.map((d) => (d / 365) * tx);
    return {
      total_days: 1825,
      waitlist_sizes: {
        x: xDays,
        series: [{ label: 'Low cPRA Age 18-45', y: xDays.map(() => L) }],
      },
      cumulative_xeno_transplants: {
        x: xDays,
        series: [{ label: 'Low cPRA Age 18-45 (xeno)', y: cumTx.map(() => 0) }],
      },
      cumulative_std_transplants: {
        x: xDays,
        series: [{ label: 'Low cPRA Age 18-45 (human)', y: cumTx }],
      },
      waitlist_deaths_per_year: {
        x: [0, 1, 2, 3, 4],
        series: [{ label: 'Low cPRA Age 18-45', y: [deaths, deaths, deaths, deaths, deaths] }],
      },
    };
  };

  it('waitTimeAtYearFromViz returns L / outflow * 12 in months at the target year', () => {
    // L=1000, tx=200/yr, deaths=0, wl_removal=0 (we override at 95%
    // because that threshold's wl_removal is small enough that the
    // expected Ŵ is dominated by tx — easier to assert exactly).
    // At the 95% threshold low-cPRA wl_removal ≈ 0.000272/d → 0.0993/yr
    // → 99.3 removals/yr against L=1000 → outflow = 200+0+99.3 = 299.3
    // → Ŵ = 1000/299.3*12 ≈ 40.1 mo.
    const v = buildWtViz();
    const w = waitTimeAtYearFromViz(v as any, 3, 95);
    expect(w).not.toBeNull();
    expect(w!).toBeCloseTo(40.1, 0);
  });

  it('waitTimeAtYearFromViz returns null when the viz lacks waitlist_deaths_per_year (missing essential input)', () => {
    // computeWaitTimeByYear bails on missing waitlist_sizes OR
    // waitlist_deaths_per_year — both are essential for the per-year
    // outflow calculation. Missing cumulative tx series, by contrast,
    // is gracefully degraded (treated as zero throughput) because
    // deaths + removals alone can still describe a queue's outflow.
    const v: any = {
      total_days: 1825,
      waitlist_sizes: { x: xDays, series: [{ label: 'Low cPRA Age 18-45', y: xDays.map(() => 1000) }] },
      // No waitlist_deaths_per_year → computeWaitTimeByYear bails.
    };
    expect(waitTimeAtYearFromViz(v, 3, 95)).toBeNull();
  });

  it('waitTimeReductionFromViz: positive when scenario has higher throughput (faster outflow → shorter wait)', () => {
    // Base case: 100 tx/yr → high Ŵ. Scenario: 300 tx/yr → low Ŵ.
    // Reduction = base − scenario should be POSITIVE.
    const base = buildWtViz({ txPerYear: 100 });
    const scen = buildWtViz({ txPerYear: 300 });
    const reduction = waitTimeReductionFromViz(scen as any, base as any, 3, 95);
    expect(reduction).not.toBeNull();
    expect(reduction!).toBeGreaterThan(0);
  });

  it('waitTimeReductionFromViz: zero when scenario and base are identical', () => {
    const v = buildWtViz({ txPerYear: 200 });
    const reduction = waitTimeReductionFromViz(v as any, v as any, 3, 95);
    expect(reduction).not.toBeNull();
    expect(reduction!).toBeCloseTo(0, 6);
  });

  it('threshold parameter actually flows through to wl_removal lookup (95 vs 99 give different Ŵ)', () => {
    // Same viz, two different thresholds → different wl_removal rates →
    // different outflow → different Ŵ. The 99% high-cPRA wl_removal
    // (~0.000280/d) is fractionally larger than 95% (~0.000272/d), so Ŵ
    // shrinks slightly when we pass 99 instead of 95.
    const v = buildWtViz();
    const w95 = waitTimeAtYearFromViz(v as any, 3, 95);
    const w99 = waitTimeAtYearFromViz(v as any, 3, 99);
    expect(w95).not.toBeNull();
    expect(w99).not.toBeNull();
    // Values are close but distinct — pin that the threshold actually
    // routes to a different rate table rather than being silently
    // ignored.
    expect(Math.abs(w95! - w99!)).toBeGreaterThan(0);
    expect(Math.abs(w95! - w99!)).toBeLessThan(2);
  });
});

describe('classifyCurveShape', () => {
  it('returns "unknown" for fewer than 3 points', () => {
    expect(classifyCurveShape([1, 2], [3, 4])).toBe('unknown');
    expect(classifyCurveShape([], [])).toBe('unknown');
  });

  it('returns "unknown" for length-mismatched inputs', () => {
    expect(classifyCurveShape([1, 2, 3], [1, 2])).toBe('unknown');
  });

  it('returns "unknown" for a flat curve (yRange = 0)', () => {
    expect(classifyCurveShape([1, 2, 3, 4], [5, 5, 5, 5])).toBe('unknown');
  });

  it('classifies a strictly linear curve as "linear"', () => {
    const x = [0, 1, 2, 3, 4, 5];
    const y = [0, 10, 20, 30, 40, 50];
    expect(classifyCurveShape(x, y)).toBe('linear');
  });

  it('classifies a clear concave-down increasing curve as "saturating"', () => {
    // Diminishing returns: each step adds less.
    const x = [0, 1, 2, 3, 4, 5];
    const y = [0, 50, 80, 95, 99, 100];
    expect(classifyCurveShape(x, y)).toBe('saturating');
  });

  it('classifies a decreasing-with-diminishing-returns curve as "saturating"', () => {
    // The waitlist-vs-supply shape: drops fast then plateaus. After
    // canonicalisation (flip y) it's a clear saturating curve.
    const x = [1, 2, 3, 4, 5, 6];
    const y = [100, 60, 40, 30, 25, 22];
    expect(classifyCurveShape(x, y)).toBe('saturating');
  });

  it('classifies a strictly convex increasing curve as "accelerating"', () => {
    // Each step adds MORE than the previous one.
    const x = [0, 1, 2, 3, 4, 5];
    const y = [0, 1, 4, 9, 16, 25]; // y = x²
    expect(classifyCurveShape(x, y)).toBe('accelerating');
  });

  it('classifies a sigmoid (decel→accel→decel) as "s-shape"', () => {
    // Mildly s-shaped 5-point curve: slopes go small, large, large,
    // small. Mixed signs in second difference → s-shape.
    const x = [0, 1, 2, 3, 4];
    const y = [0, 5, 50, 95, 100];
    expect(classifyCurveShape(x, y)).toBe('s-shape');
  });

  it('classifies a zig-zag curve as "non-monotonic"', () => {
    const x = [0, 1, 2, 3, 4];
    const y = [0, 100, 20, 90, 30];
    expect(classifyCurveShape(x, y)).toBe('non-monotonic');
  });

  it('classifies a real-world bridge supply sweep (essentially linear) as "linear"', () => {
    // The data that broke the kneedle test earlier: an essentially
    // straight line should NOT be flagged as saturating.
    const x = [862, 1723, 2585, 3446, 5169];
    const y = [175, 423, 592, 860, 1327];
    expect(classifyCurveShape(x, y)).toBe('linear');
  });
});

describe('toMarginalDataset', () => {
  const makeDataset = (xs: number[], ys: number[]): ParetoDataset => ({
    points: xs.map((x, i) => ({
      x,
      y: ys[i],
      label: `${x}`,
      configName: `cfg_${i}`,
      inflection: false,
    })),
    inflectionIndex: null,
  });

  it('returns null for fewer than 2 points', () => {
    expect(toMarginalDataset(makeDataset([0], [0]))).toBeNull();
    expect(
      toMarginalDataset({ points: [], inflectionIndex: null }),
    ).toBeNull();
  });

  it('produces N-1 points each at Δy/Δx of the corresponding segment', () => {
    // y = x² → marginal at index i (between x[i] and x[i+1]) =
    // (x[i+1]² − x[i]²) / Δx = x[i+1] + x[i] when Δx = 1.
    const ds = makeDataset([0, 1, 2, 3, 4], [0, 1, 4, 9, 16]);
    const marg = toMarginalDataset(ds);
    expect(marg).not.toBeNull();
    expect(marg!.points).toHaveLength(4);
    expect(marg!.points.map((p) => p.y)).toEqual([1, 3, 5, 7]);
    // Marginal x values live at the upper x of each segment so the
    // chart can read "the marginal return when we went from x[i] to
    // x[i+1]" at x[i+1].
    expect(marg!.points.map((p) => p.x)).toEqual([1, 2, 3, 4]);
  });

  it('skips zero-Δx segments instead of producing NaN/Infinity', () => {
    const ds = makeDataset([0, 1, 1, 2], [0, 5, 5, 10]);
    const marg = toMarginalDataset(ds);
    expect(marg).not.toBeNull();
    // Expect 2 points (the two real segments); the duplicate-x segment is dropped.
    expect(marg!.points).toHaveLength(2);
    for (const p of marg!.points) expect(Number.isFinite(p.y)).toBe(true);
  });

  it('runs Kneedle on the marginal series so the marginal chart can highlight a knee', () => {
    // Cumulative curve with a sharp diminishing-returns shape →
    // marginal slopes drop sharply then plateau → marginal Kneedle
    // should detect a knee.
    const xs = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const ys = [0, 100, 180, 230, 260, 280, 295, 305, 312, 315];
    const ds = makeDataset(xs, ys);
    const marg = toMarginalDataset(ds);
    expect(marg).not.toBeNull();
    // The marginal series is [100, 80, 50, 30, 20, 15, 10, 7, 3] — a
    // clear concave-decreasing curve. After Kneedle's sign flip it
    // becomes increasing-saturating, which is the canonical shape.
    expect(marg!.inflectionIndex).not.toBeNull();
  });
});

describe('loadParetoDataset', () => {
  // Stub fetch with a synthetic viz JSON keyed by config name + folder.
  // Each call inspects the URL to figure out which point we're loading
  // and returns a deterministic curve.
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Minimal viz: deaths_per_year + waitlist_sizes built from a per-prop
    // scaling factor extracted from the URL.
    fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      // Default: viz with linear deaths & waitlist
      const buildResp = (deathsAtYear10: number, waitlistAtYear10: number) => {
        const xDays = [0, 1825, 3650]; // 0, 5y, 10y
        return new Response(
          JSON.stringify({
            total_days: 3650,
            waitlist_sizes: {
              x: xDays,
              series: [{ label: 'Total waitlist', y: [waitlistAtYear10 + 100, waitlistAtYear10 + 50, waitlistAtYear10] }],
            },
            cumulative_waitlist_deaths: {
              x: xDays,
              series: [{ label: 'Total wl deaths', y: [0, deathsAtYear10 / 2, deathsAtYear10] }],
            },
            cumulative_post_tx_deaths: {
              x: xDays,
              series: [{ label: 'Total tx deaths', y: [0, 0, 0] }],
            },
          }),
          { status: 200 },
        );
      };

      // Parse "prop{p}p{...}" out of the URL to vary the response per point.
      // prop0 → base case (deaths=1000), prop>0 → fewer deaths (concave up):
      //   prop=0.5 → 800, prop=1 → 700, prop=1.5 → 650, prop=2 → 625
      // (knee around prop=1)
      const m = url.match(/prop(\d+)(?:p(\d+))?_/);
      const propStr = m ? `${m[1]}${m[2] ? '.' + m[2] : ''}` : '0';
      const prop = parseFloat(propStr);
      const propToDeaths: Record<string, number> = {
        '0': 1000, '0.5': 800, '1': 700, '1.5': 650, '2': 625,
      };
      const propToWaitlist: Record<string, number> = {
        '0': 5000, '0.5': 4500, '1': 4200, '1.5': 4050, '2': 3975,
      };
      const deaths = propToDeaths[propStr] ?? propToDeaths[String(prop)] ?? 1000;
      const wl = propToWaitlist[propStr] ?? propToWaitlist[String(prop)] ?? 5000;
      return buildResp(deaths, wl);
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('loads all 4 points and detects the inflection (lives saved curve)', async () => {
    const points: ParetoPointSpec[] = [
      { label: '0.5x', x: 1000, xeno_proportion: 0.5, surv: 12 },
      { label: '1x', x: 2000, xeno_proportion: 1, surv: 12 },
      { label: '1.5x', x: 3000, xeno_proportion: 1.5, surv: 12 },
      { label: '2x', x: 4000, xeno_proportion: 2, surv: 12 },
    ];
    const ds = await loadParetoDataset({
      mode: 'bridge',
      highCPRAThreshold: 95,
      strategy: 'standard',
      targetYear: 10,
      metric: livesSavedFromViz,
      points,
    });
    expect(ds.points).toHaveLength(4);
    // Diminishing-returns curve → knee detected.
    expect(ds.inflectionIndex).not.toBeNull();
    // Each point's y = base - scenario = 1000 - {200, 300, 350, 375} = {200, 300, 350, 375}.
    expect(ds.points.map((p) => p.y)).toEqual([200, 300, 350, 375]);
  });

  it('drops failed-to-load points and still returns the rest', async () => {
    fetchSpy.mockImplementationOnce(async () => new Response('', { status: 500 }));
    const points: ParetoPointSpec[] = [
      { label: '0.5x', x: 1000, xeno_proportion: 0.5, surv: 12 },
      { label: '1x', x: 2000, xeno_proportion: 1, surv: 12 },
      { label: '1.5x', x: 3000, xeno_proportion: 1.5, surv: 12 },
    ];
    const ds = await loadParetoDataset({
      mode: 'bridge',
      highCPRAThreshold: 95,
      strategy: 'standard',
      targetYear: 10,
      metric: livesSavedFromViz,
      points,
    });
    // The first scenario fetch (or its base) blew up — point dropped, others OK.
    expect(ds.points.length).toBeGreaterThanOrEqual(1);
    expect(ds.points.length).toBeLessThanOrEqual(2);
  });

  it('returns empty dataset (no inflection) when fewer than 2 points succeed', async () => {
    fetchSpy.mockImplementation(async () => new Response('', { status: 500 }));
    const ds = await loadParetoDataset({
      mode: 'bridge',
      highCPRAThreshold: 95,
      strategy: 'standard',
      targetYear: 10,
      metric: livesSavedFromViz,
      points: [{ label: '1x', x: 2000, xeno_proportion: 1, surv: 12 }],
    });
    expect(ds.points).toHaveLength(0);
    expect(ds.inflectionIndex).toBeNull();
  });

  it('threads replacement-mode multipliers (relist/death) through to config names', async () => {
    // Capture every URL the loader fetches so we can assert the per-point
    // multiplier overrides reach composeConfigName.
    const urls: string[] = [];
    fetchSpy.mockImplementation(async (input) => {
      const url = String(input);
      urls.push(url);
      const xDays = [0, 1825, 3650];
      return new Response(
        JSON.stringify({
          total_days: 3650,
          waitlist_sizes: { x: xDays, series: [{ label: 'wl', y: [200, 150, 100] }] },
          cumulative_waitlist_deaths: { x: xDays, series: [{ label: 'd', y: [0, 50, 100] }] },
          cumulative_post_tx_deaths: { x: xDays, series: [{ label: 't', y: [0, 0, 0] }] },
        }),
        { status: 200 },
      );
    });

    await loadParetoDataset({
      mode: 'replacement',
      highCPRAThreshold: 95,
      strategy: 'standard',
      targetYear: 10,
      metric: livesSavedFromViz,
      // Sweep relist multiplier ∈ {0.5, 1, 2} at fixed prop=1 and death=1
      points: [
        { label: '0.5x', x: 0.5, xeno_proportion: 1, xenoGraftFailureRate: 0.5, postTransplantDeathRate: 1 },
        { label: '1x',   x: 1,   xeno_proportion: 1, xenoGraftFailureRate: 1,   postTransplantDeathRate: 1 },
        { label: '2x',   x: 2,   xeno_proportion: 1, xenoGraftFailureRate: 2,   postTransplantDeathRate: 1 },
      ],
    });

    // Each scenario name encodes the per-point relist multiplier:
    //   prop1_relist0p5_death1, prop1_relist1_death1, prop1_relist2_death1
    expect(urls.some((u) => u.includes('xeno_age_prop1_relist0p5_death1.json'))).toBe(true);
    expect(urls.some((u) => u.includes('xeno_age_prop1_relist1_death1.json'))).toBe(true);
    expect(urls.some((u) => u.includes('xeno_age_prop1_relist2_death1.json'))).toBe(true);
    // Base case is always prop0_relist1_death1 regardless of per-point overrides.
    expect(urls.some((u) => u.includes('xeno_age_prop0_relist1_death1.json'))).toBe(true);
  });
});
