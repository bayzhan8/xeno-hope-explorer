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
  loadParetoDataset,
  type ParetoPointSpec,
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
});
