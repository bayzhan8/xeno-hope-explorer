/**
 * Pareto / tradeoff utilities for the Bridge Therapy mode.
 *
 * Two charts are powered by these helpers:
 *
 *   1. Xeno supply (kidneys/year) vs lives saved (cumulative deaths
 *      prevented at end of horizon)
 *   2. Graft survival (months) vs waitlist reduction (Δ waitlist size at
 *      end of horizon, scenario − base)
 *
 * For both, we compute the relevant metric from each viz JSON the runner
 * produced and surface the inflection point ("knee") so the user sees where
 * additional supply / longer survival yields diminishing returns.
 */
import {
  type BridgeSurvivalMonths,
  type TherapyMode,
  composeConfigName,
  loadVisualizationData,
} from './configFinder';

// ─── Shape helpers ──────────────────────────────────────────────────────────

interface Series<T> {
  label: string;
  y?: T[];
  values?: T[];
}

interface ChartLike {
  x?: number[];
  year_labels?: string[];
  series?: Series<number>[];
}

interface VizLike {
  total_days?: number;
  waitlist_sizes?: ChartLike;
  cumulative_waitlist_deaths?: ChartLike;
  cumulative_post_tx_deaths?: ChartLike;
  cumulative_deaths?: ChartLike;
}

/**
 * Find the "Total *" series in a chart (case-insensitive). Falls back to the
 * last series if no Total* label is present (the workflow's create_viz_data
 * always emits a Total series, but we keep the fallback so a future viz
 * format change doesn't crash the chart).
 */
function totalSeries(chart: ChartLike | undefined): { y: number[] } | null {
  if (!chart?.series?.length) return null;
  const totalCandidate =
    chart.series.find(
      (s) => typeof s.label === 'string' && /^total/i.test(s.label),
    ) ?? chart.series[chart.series.length - 1];

  // Some series use `y`, others `values` (e.g. deaths_per_year). Both are
  // already in chronological order matching `chart.x` / `chart.year_labels`.
  const y = totalCandidate.y ?? totalCandidate.values ?? [];
  return { y: [...y] };
}

/**
 * Linear-interpolate to a target year. We never need to extrapolate because
 * every viz JSON is generated against the same time horizon as the user
 * requested; if `targetYear` exceeds the available range we clamp to the
 * last sample (with a console.debug for visibility).
 */
function valueAtYear(chart: ChartLike | undefined, targetYear: number): number | null {
  if (!chart) return null;
  const xs: number[] | undefined = chart.x ??
    (chart.year_labels?.map((l) => Number(l)) as number[] | undefined);
  if (!xs?.length) return null;
  const totals = totalSeries(chart);
  if (!totals) return null;

  // The waitlist / cumulative-deaths charts have x in DAYS; deaths_per_year
  // / net_deaths_prevented have year_labels in YEARS. Detect which by max:
  // anything > 50 is days (10y horizon = 3650).
  const maxX = xs[xs.length - 1];
  const xsYears = maxX > 50 ? xs.map((d) => d / 365) : xs;
  const yArr = totals.y;
  if (yArr.length !== xsYears.length) {
    // Mismatched lengths shouldn't happen but bail safely if they do.
    return yArr[yArr.length - 1] ?? null;
  }

  if (targetYear <= xsYears[0]) return yArr[0];
  if (targetYear >= xsYears[xsYears.length - 1]) return yArr[yArr.length - 1];

  // Linear search is fine for ≤ ~3650 points. Could binary-search but
  // YAGNI.
  for (let i = 1; i < xsYears.length; i += 1) {
    if (xsYears[i] >= targetYear) {
      const x0 = xsYears[i - 1];
      const x1 = xsYears[i];
      const y0 = yArr[i - 1];
      const y1 = yArr[i];
      if (x1 === x0) return y1;
      const t = (targetYear - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return yArr[yArr.length - 1];
}

// ─── Public metric extractors ───────────────────────────────────────────────

/**
 * Total deaths (waitlist + post-transplant) at `targetYear`. Returns null
 * if the viz JSON is missing the relevant chart.
 *
 * Prefers the explicit M6-split charts (`cumulative_waitlist_deaths` +
 * `cumulative_post_tx_deaths`) and falls back to the legacy
 * `cumulative_deaths` Total series if those aren't present.
 */
export function totalDeathsAtYear(viz: VizLike, targetYear: number): number | null {
  const wl = valueAtYear(viz.cumulative_waitlist_deaths, targetYear);
  const tx = valueAtYear(viz.cumulative_post_tx_deaths, targetYear);
  if (wl !== null && tx !== null) return wl + tx;
  return valueAtYear(viz.cumulative_deaths, targetYear);
}

/** Cumulative waitlist deaths at `targetYear`. */
export function waitlistDeathsAtYear(
  viz: VizLike,
  targetYear: number,
): number | null {
  return valueAtYear(viz.cumulative_waitlist_deaths, targetYear);
}

/**
 * Lives saved = WAITLIST deaths reduction (base − scenario) at `targetYear`.
 *
 * IMPORTANT: We deliberately use waitlist deaths only, NOT total
 * (waitlist + post-tx) deaths. Reason: a bridge xenograft moves a patient
 * off the waitlist for ~1 year, exposing them to ~1 yr of post-tx
 * mortality risk in exchange. For high-cPRA recipients those two hazards
 * roughly cancel at the simulation horizon, so total-death reduction is
 * dominated by Monte-Carlo noise (often slightly negative). The
 * clinically interesting signal is "deaths AVOIDED on the waitlist", which
 * matches the definition the existing landing-page summary card uses
 * (see `calculateSummaryMetrics` in dataTransformer.ts: it sums
 * `netDeathsPreventedPerYearData`, which for bridge configs is
 * client-side derived from `waitlist_deaths_per_year` diffs).
 *
 * Falls back to the legacy `cumulative_deaths` Total series only if
 * `cumulative_waitlist_deaths` isn't present in EITHER viz JSON.
 */
export function livesSavedFromViz(
  scenarioViz: VizLike,
  baseViz: VizLike,
  targetYear: number,
): number | null {
  const scen = waitlistDeathsAtYear(scenarioViz, targetYear);
  const base = waitlistDeathsAtYear(baseViz, targetYear);
  if (scen !== null && base !== null) return base - scen;

  const scenT = totalDeathsAtYear(scenarioViz, targetYear);
  const baseT = totalDeathsAtYear(baseViz, targetYear);
  if (scenT === null || baseT === null) return null;
  return baseT - scenT;
}

/** Total waitlist size at `targetYear`. */
export function waitlistAtYearFromViz(viz: VizLike, targetYear: number): number | null {
  return valueAtYear(viz.waitlist_sizes, targetYear);
}

/** Waitlist reduction = baseWaitlist − scenarioWaitlist (positive = good). */
export function waitlistReductionFromViz(
  scenarioViz: VizLike,
  baseViz: VizLike,
  targetYear: number,
): number | null {
  const scen = waitlistAtYearFromViz(scenarioViz, targetYear);
  const base = waitlistAtYearFromViz(baseViz, targetYear);
  if (scen === null || base === null) return null;
  return base - scen;
}

// ─── Knee detection (Kneedle) ───────────────────────────────────────────────

/**
 * Returns the index of the "knee" (elbow / point of diminishing returns) in
 * the (x, y) curve, or `null` if the curve isn't monotonic enough for the
 * concept to be meaningful.
 *
 * This is a pragmatic Kneedle implementation tuned for very small datasets
 * (5–10 points) where the original Kneedle paper's smoothing step adds
 * noise rather than removing it. The algorithm:
 *
 *   1. Verify monotonic-ish: if y has both significant ups AND downs the
 *      "knee" concept is undefined; return null.
 *   2. Min-max normalise both x and y to [0, 1].
 *   3. The knee is the point with maximum *signed* deviation from the
 *      straight line connecting the first and last data points. For an
 *      increasing-concave curve (typical "diminishing returns" shape) this
 *      is the point furthest above the chord; for an increasing-convex
 *      curve the maximum is at the endpoints (no interior knee → null).
 *
 * Inputs with < 3 points get null because a knee requires at least one
 * interior point.
 */
export function kneedle(x: number[], y: number[]): number | null {
  if (!x || !y || x.length !== y.length || x.length < 3) return null;

  const n = x.length;

  // Step 1 — monotonic sanity check. We tolerate small reversals (≤ 5% of
  // the total y-range) but bail on bigger zig-zags because then the knee
  // is genuinely undefined.
  const ymin = Math.min(...y);
  const ymax = Math.max(...y);
  const yrange = ymax - ymin;
  if (yrange === 0) return null;
  const tol = 0.05 * yrange;

  let nUp = 0;
  let nDown = 0;
  for (let i = 1; i < n; i += 1) {
    const d = y[i] - y[i - 1];
    if (d > tol) nUp += 1;
    else if (d < -tol) nDown += 1;
  }
  if (nUp > 0 && nDown > 0) {
    // Curve genuinely zig-zags → no defined knee.
    return null;
  }
  // Increasing curve (concave-down knee at maximum-above-chord) or
  // decreasing curve (concave-up knee at maximum-below-chord). We
  // canonicalise to "increasing" by flipping a decreasing curve.
  const yFlipped = nDown > 0 ? y.map((v) => -v) : y;

  // Step 2 — normalise.
  const xmin = x[0];
  const xmax = x[n - 1];
  const xrange = xmax - xmin;
  if (xrange === 0) return null;
  const xn = x.map((v) => (v - xmin) / xrange);
  const yfMin = Math.min(...yFlipped);
  const yfMax = Math.max(...yFlipped);
  const yfRange = yfMax - yfMin;
  if (yfRange === 0) return null;
  const yn = yFlipped.map((v) => (v - yfMin) / yfRange);

  // Step 3 — distance-above-chord. The chord from (0, yn[0]) to (1, yn[n-1])
  // has equation y = yn[0] + (yn[n-1] − yn[0]) * x. The knee is the index
  // i ∈ {1, …, n-2} maximising (yn[i] − chord(xn[i])).
  let bestIdx = -1;
  let bestDev = -Infinity;
  for (let i = 1; i < n - 1; i += 1) {
    const chord = yn[0] + (yn[n - 1] - yn[0]) * xn[i];
    const dev = yn[i] - chord;
    if (dev > bestDev) {
      bestDev = dev;
      bestIdx = i;
    }
  }
  if (bestIdx === -1) return null;
  // Demand at least a small positive deviation — otherwise the curve is
  // basically a straight line and there's no knee to highlight.
  if (bestDev <= 1e-6) return null;
  return bestIdx;
}

// ─── Pareto dataset loader ──────────────────────────────────────────────────

/**
 * One point in a Pareto dataset (used by both Pareto charts). `inflection`
 * is true for the single point identified by Kneedle (or false everywhere
 * if no inflection was found).
 */
export interface ParetoPoint {
  x: number;
  y: number;
  label: string;
  configName: string;
  inflection: boolean;
}

export interface ParetoDataset {
  points: ParetoPoint[];
  inflectionIndex: number | null;
}

/**
 * Spec for a single point in the Pareto sweep. The `(strategy, mode, surv)`
 * triple lets the same loader compose names for both the standard and
 * targeted strategies.
 */
export interface ParetoPointSpec {
  /** Display label (e.g. "0.5x" or "12 mo"). */
  label: string;
  /** Numeric x-axis value associated with this point. */
  x: number;
  xeno_proportion: number;
  surv?: BridgeSurvivalMonths; // omit for replacement-mode datasets
  /** Optional override for the strategy used in name composition. */
  strategy?: string;
}

export interface LoadParetoOptions {
  mode: TherapyMode;
  highCPRAThreshold: number;
  strategy: string;
  /** Year at which the metric is evaluated (defaults to viz horizon). */
  targetYear: number;
  /**
   * Function that computes the y value for one point. Receives the loaded
   * scenario viz, the loaded base viz (prop=0 with same survival/strategy),
   * and the target year. Return `null` to drop the point.
   */
  metric: (scenarioViz: VizLike, baseViz: VizLike, targetYear: number) => number | null;
  points: ParetoPointSpec[];
}

/**
 * Helper used by both bridge Pareto charts.
 *
 * Behaviour:
 *   - Composes the canonical config name for each point.
 *   - Loads each (scenario, base) pair in parallel via `Promise.all` so the
 *     UI doesn't wait sequentially through 5+ HTTP round-trips.
 *   - Evaluates the metric and returns successful points only, in input
 *     order.
 *   - Runs Kneedle on the resulting (x, y) sequence; the returned dataset
 *     marks the knee point so `<ParetoChart>` can render a `ReferenceDot`.
 *
 * Error handling: if ANY point fails to load we still return whatever did,
 * letting the chart degrade gracefully (e.g. show 4/5 points + a warning).
 */
export async function loadParetoDataset(opts: LoadParetoOptions): Promise<ParetoDataset> {
  const { mode, highCPRAThreshold, strategy, targetYear, metric, points } = opts;

  const tasks = points.map(async (spec): Promise<ParetoPoint | null> => {
    const effectiveStrategy = spec.strategy ?? strategy;
    try {
      const scenarioName = composeConfigName(
        mode,
        { xeno_proportion: spec.xeno_proportion },
        effectiveStrategy,
      );
      const baseName = composeConfigName(
        mode,
        { xeno_proportion: 0 },
        effectiveStrategy,
      );

      const [scenarioViz, baseViz] = await Promise.all([
        loadVisualizationData(scenarioName, highCPRAThreshold, effectiveStrategy, {
          mode,
          surv: spec.surv,
        }),
        loadVisualizationData(baseName, highCPRAThreshold, effectiveStrategy, {
          mode,
          surv: spec.surv,
        }),
      ]);

      const y = metric(scenarioViz as VizLike, baseViz as VizLike, targetYear);
      if (y === null || !Number.isFinite(y)) return null;
      return {
        x: spec.x,
        y,
        label: spec.label,
        configName: scenarioName,
        inflection: false,
      };
    } catch (err) {
      console.warn(
        `[Pareto] failed to load point label="${spec.label}" x=${spec.x} ` +
        `surv=${spec.surv} prop=${spec.xeno_proportion}:`,
        err,
      );
      return null;
    }
  });

  const settled = (await Promise.all(tasks)).filter(
    (p): p is ParetoPoint => p !== null,
  );

  if (settled.length < 2) {
    return { points: settled, inflectionIndex: null };
  }

  const xs = settled.map((p) => p.x);
  const ys = settled.map((p) => p.y);
  const knee = kneedle(xs, ys);
  if (knee !== null) {
    settled[knee].inflection = true;
  }
  return { points: settled, inflectionIndex: knee };
}
