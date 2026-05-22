/**
 * Pareto / tradeoff utilities, shared by the Replacement and Bridge pages.
 *
 * Three metrics are exposed for use as a Pareto y-axis:
 *
 *   1. `livesSavedFromViz`           — base − scenario waitlist deaths
 *      at year H (the headline "did the intervention save lives" number).
 *   2. `waitlistReductionFromViz`    — base − scenario waitlist size at
 *      year H (does the intervention shrink the queue).
 *   3. `waitTimeReductionFromViz`    — base − scenario wait time per
 *      list-spell (months) at year H, derived via Little's Law from the
 *      same viz JSONs the WaitTimeChart uses (NEW — closes Problem 6.3).
 *
 * For each, we compute the metric from every viz JSON the runner produced
 * and surface the inflection point ("knee") so the user sees where
 * additional supply / longer survival yields diminishing returns.
 */
import {
  type BridgeSurvivalMonths,
  type TherapyMode,
  composeConfigName,
  loadVisualizationData,
  getWlRemovalRates,
} from './configFinder';
import { computeWaitTimeByYear } from './dataTransformer';

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
  // `computeWaitTimeByYear` reads these for the Little's-Law wait-time
  // metric. They're optional because the existing lives-saved /
  // waitlist-reduction extractors don't need them.
  cumulative_xeno_transplants?: ChartLike;
  cumulative_std_transplants?: ChartLike;
  waitlist_deaths_per_year?: ChartLike;
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

// ─── Wait-time extractor (Little's Law) ────────────────────────────────────
//
// Re-uses `computeWaitTimeByYear` from dataTransformer so the Pareto curve
// is computed from EXACTLY the same numbers the WaitTimeChart shows for
// any individual point. That coupling matters: if a user clicks a point on
// the curve, drills into the "Wait Time on the List" chart, and reads off
// the year-H value, it MUST match the y-coordinate they just clicked. The
// only way to guarantee that is for both surfaces to call the same
// transformer with the same wlRemovalRates.

/**
 * Wait time at the requested year (months), computed from the viz JSON via
 * Little's Law (W = L / outflow), with `outflow = transplants + waitlist
 * deaths + waitlist removals`. Returns `null` if the underlying transformer
 * has no row for the target year — this happens when the frozen-tail
 * defense in `computeWaitTimeByYear` drops the boundary year (the backend's
 * `common_times` grid sometimes runs past the simulator's actual stop
 * time, which would otherwise inflate Ŵ at year H). When the requested
 * year is dropped we fall back to the largest emitted year ≤ targetYear so
 * the Pareto chart still gets a y-value.
 *
 * Threshold is required because per-(threshold, cPRA) waitlist-removal
 * hazards are looked up from the simulator input pickle's tables — the
 * SAME tables that drive the WaitTimeChart, via the shared
 * `getWlRemovalRates` helper.
 */
export function waitTimeAtYearFromViz(
  viz: VizLike,
  targetYear: number,
  highCPRAThreshold: number,
): number | null {
  // computeWaitTimeByYear's signature requires a `highCPRAThreshold` field
  // on the viz, but only uses it for the wlRemovalRates lookup which we
  // do explicitly here. Fill it in defensively so a future signature
  // tightening doesn't silently break this caller.
  const wlRemovalRates = getWlRemovalRates(highCPRAThreshold);
  const enriched = { ...viz, highCPRAThreshold } as Parameters<
    typeof computeWaitTimeByYear
  >[0];
  const rows = computeWaitTimeByYear(enriched, { wlRemovalRates });
  if (!rows || rows.length === 0) return null;

  // Prefer the exact year if present; otherwise the largest emitted year
  // ≤ targetYear (handles the frozen-tail case where year H got dropped).
  const targetInt = Math.floor(targetYear);
  let best: { year: number; totalMonths: number } | null = null;
  for (const r of rows) {
    if (!Number.isFinite(r.totalMonths)) continue;
    if (r.year <= targetInt && (best === null || r.year > best.year)) {
      best = { year: r.year, totalMonths: r.totalMonths };
    }
  }
  if (best === null) return null;
  return best.totalMonths;
}

/**
 * Wait-time reduction = baseWaitTime − scenarioWaitTime (months, positive
 * = xeno helps). Returns `null` if EITHER side is undefined at the target
 * year, so the Pareto loader's null-filter drops the point gracefully.
 *
 * Curried at the call site so the existing `metric` signature in
 * `LoadParetoOptions` (3 args, no context) doesn't have to change:
 *
 *     metric: (scen, base, target) =>
 *       waitTimeReductionFromViz(scen, base, target, params.highCPRAThreshold)
 */
export function waitTimeReductionFromViz(
  scenarioViz: VizLike,
  baseViz: VizLike,
  targetYear: number,
  highCPRAThreshold: number,
): number | null {
  const scen = waitTimeAtYearFromViz(scenarioViz, targetYear, highCPRAThreshold);
  const base = waitTimeAtYearFromViz(baseViz, targetYear, highCPRAThreshold);
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

  // Two-stage strictness filter — the original 1e-6 threshold accepted any
  // tiny mathematical kink (e.g. 175 → 423 → 592 → 860 returns a "knee" at
  // index 1 even though every subsequent point keeps adding lives at the
  // same rate, so the chart caption claims diminishing returns where none
  // exist). We now require BOTH:
  //
  //   (a) the chord deviation is at least 5 % of the normalised y-range —
  //       i.e. the knee actually pokes meaningfully above the straight line
  //       between the endpoints; and
  //   (b) the average per-x-unit slope AFTER the knee is at most 70 % of
  //       the average per-x-unit slope BEFORE the knee — i.e. real
  //       diminishing returns, not "the curve is still rising at the same
  //       pace and we just happened to pick a slightly above-chord point".
  //
  // Together (a)+(b) reject the near-linear / convex / supply-still-paying
  // -off cases that previously got mislabelled as inflections.
  const DEV_MIN = 0.05;
  const SLOPE_RATIO_MAX = 0.7;
  if (bestDev < DEV_MIN) return null;

  // Slope check uses the ORIGINAL (un-flipped, un-normalised) y values so
  // the ratio reflects real "lives saved per kidney/year" units. We need
  // at least one slope on each side of the knee, hence the index guard
  // (already enforced by the i ∈ {1, …, n-2} loop above).
  let preNum = 0, preDen = 0;
  for (let i = 1; i <= bestIdx; i += 1) {
    preNum += y[i] - y[i - 1];
    preDen += x[i] - x[i - 1];
  }
  let postNum = 0, postDen = 0;
  for (let i = bestIdx + 1; i < n; i += 1) {
    postNum += y[i] - y[i - 1];
    postDen += x[i] - x[i - 1];
  }
  if (preDen === 0 || postDen === 0) return null;
  const preSlope = preNum / preDen;
  const postSlope = postNum / postDen;
  // For decreasing curves the slope ratio test still holds because we
  // compare absolute magnitudes — flipping signs in both terms cancels.
  const ratio = Math.abs(postSlope) / Math.abs(preSlope);
  if (!Number.isFinite(ratio) || ratio > SLOPE_RATIO_MAX) return null;

  return bestIdx;
}

// ─── Curve-shape classification ────────────────────────────────────────────
//
// Closes the explicit Problem 6.4 ask ("systematic analysis of curve
// morphology under different assumptions"). Each Pareto curve gets
// classified into one of five shape categories that the chart card
// surfaces as a small chip on the legend, so the user can see at a
// glance whether a subgroup's response is saturating, still
// accelerating, etc., without having to eyeball the line.
//
// Categories (see `CurveShape`):
//   linear         — slope ≈ constant, no meaningful concavity
//   saturating     — slope decreases monotonically (concave-down on
//                    increasing curves; this is the diminishing-returns
//                    shape kneedle is designed for)
//   accelerating   — slope increases monotonically (convex on
//                    increasing curves; "the more we add, the more we
//                    save per unit added" — uncommon but appears in
//                    bridge mode at low survival)
//   s-shape        — slope changes sign once (acceleration then
//                    deceleration, or vice versa); produces an
//                    inflection point in the *first* derivative
//   non-monotonic  — y itself zig-zags; "the concept of curvature is
//                    undefined here, MC noise probably dominates"
//   unknown        — too few points (< 3) or degenerate input
//
// Implementation note: this is intentionally a small heuristic, not a
// full statistical model. We canonicalise decreasing curves to
// increasing (by flipping y), compute first differences (slopes) and
// second differences (accelerations), and bucket on the *signs* of
// those differences with a small tolerance derived from the slope
// magnitude. The thresholds here are tuned for the 4-7 point Pareto
// curves the dashboard actually produces — for longer time series a
// proper Loess + curvature integral would be more robust.

export type CurveShape =
  | 'linear'
  | 'saturating'
  | 'accelerating'
  | 's-shape'
  | 'non-monotonic'
  | 'unknown';

export function classifyCurveShape(xs: number[], ys: number[]): CurveShape {
  if (!xs || !ys || xs.length !== ys.length || xs.length < 3) return 'unknown';
  const n = xs.length;

  // Step 1 — overall monotonicity on y.
  const yRange = Math.max(...ys) - Math.min(...ys);
  if (yRange === 0) return 'unknown';
  const yTol = 0.05 * yRange;
  let nUp = 0;
  let nDown = 0;
  for (let i = 1; i < n; i++) {
    const d = ys[i] - ys[i - 1];
    if (d > yTol) nUp += 1;
    else if (d < -yTol) nDown += 1;
  }
  if (nUp > 0 && nDown > 0) return 'non-monotonic';

  // Step 2 — slopes. Bail on duplicate x (degenerate).
  const slopes: number[] = [];
  for (let i = 1; i < n; i++) {
    if (xs[i] === xs[i - 1]) return 'unknown';
    slopes.push((ys[i] - ys[i - 1]) / (xs[i] - xs[i - 1]));
  }
  // Canonicalise to "increasing" so the rest of the logic doesn't have
  // to special-case decreasing curves. Flipping y → flipping every
  // slope's sign, which preserves all curvature relationships.
  const flipped = nDown > 0;
  const canonSlopes = flipped ? slopes.map((s) => -s) : slopes;

  // Step 3 — "essentially linear" pre-filter. If the curve's max slope
  // is less than 1.7× its min slope (in absolute value), the line is
  // straight enough that the per-segment fluctuations are almost
  // certainly Monte-Carlo noise rather than real curvature. Without
  // this filter, real bridge data — e.g. supply ∈ {0.5, 1, 1.5, 2, 3}
  // with slopes ≈ {0.29, 0.20, 0.31, 0.27} — gets mis-labelled as
  // s-shape because two of its acceleration wobbles squeak past the
  // 10 %-of-mean-slope threshold below. 1.7 was chosen empirically:
  // it forgives ±25 % per-segment noise but still distinguishes a
  // genuine concave curve (saturating shapes have slope ratio ≥ 3).
  const absSlopes = canonSlopes.map(Math.abs).filter((s) => s > 0);
  if (absSlopes.length > 0) {
    const sMin = Math.min(...absSlopes);
    const sMax = Math.max(...absSlopes);
    if (sMin > 0 && sMax / sMin < 1.7) return 'linear';
  }

  // Step 4 — accelerations (second differences of y, scaled by Δx).
  // For uniform x-spacing these are exactly the second differences;
  // for non-uniform spacing they're a reasonable proxy.
  const accel: number[] = [];
  for (let i = 1; i < canonSlopes.length; i++) {
    accel.push(canonSlopes[i] - canonSlopes[i - 1]);
  }
  if (accel.length === 0) return 'linear';

  // Step 5 — bucket. Tolerance for "this acceleration is meaningful"
  // is 10 % of the average absolute slope — i.e. the curvature has to
  // be at least 10 % of the magnitude of the curve's overall climb to
  // count as a real shape change vs. measurement noise.
  const meanAbsSlope =
    canonSlopes.reduce((a, b) => a + Math.abs(b), 0) / canonSlopes.length;
  const accTol = 0.1 * meanAbsSlope;
  let nAcc = 0;
  let nDec = 0;
  for (const a of accel) {
    if (a > accTol) nAcc += 1;
    else if (a < -accTol) nDec += 1;
  }
  if (nAcc === 0 && nDec === 0) return 'linear';
  if (nDec > 0 && nAcc === 0) return 'saturating';
  if (nAcc > 0 && nDec === 0) return 'accelerating';
  // Mixed signs in the second difference → s-shape (one regime change)
  // OR noisy. We don't try to distinguish further; the user can see
  // both possibilities visually once the chip flags it as an s-shape.
  return 's-shape';
}

/**
 * Convert a (cumulative) Pareto dataset into a "marginal" version where
 * each y is the per-x-unit slope of the original curve at that step.
 * Length goes from N points → N-1 points; the marginal y at index i
 * lives at the original x[i+1] ("the marginal return when we went from
 * x[i] to x[i+1]"). Inflection annotation is recomputed against the
 * marginal series — the marginal-curve's "knee" is where the curve's
 * acceleration peaks (often a more clinically useful inflection than
 * the cumulative knee).
 *
 * Returns null if the input has fewer than 2 points (no segments).
 */
export function toMarginalDataset(ds: ParetoDataset): ParetoDataset | null {
  if (!ds || ds.points.length < 2) return null;
  const out: ParetoPoint[] = [];
  for (let i = 1; i < ds.points.length; i++) {
    const a = ds.points[i - 1];
    const b = ds.points[i];
    const dx = b.x - a.x;
    if (dx === 0) continue;
    out.push({
      x: b.x,
      y: (b.y - a.y) / dx,
      label: `${a.label} → ${b.label}`,
      configName: b.configName,
      inflection: false,
    });
  }
  if (out.length < 2) return { points: out, inflectionIndex: null };
  const xs = out.map((p) => p.x);
  const ys = out.map((p) => p.y);
  const knee = kneedle(xs, ys);
  if (knee !== null) out[knee].inflection = true;
  return { points: out, inflectionIndex: knee };
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
 *
 * For BRIDGE mode the relist/death multipliers are always 1.0 (baked into
 * the input pickle) so the only varying axes are `xeno_proportion` and
 * `surv`.
 *
 * For REPLACEMENT mode the relist/death multipliers ARE part of the config
 * name, so a Pareto sweep over e.g. graft-failure multiplier needs to vary
 * `xenoGraftFailureRate` per point while holding the others fixed at the
 * user's currently-selected values. The optional fields default to 1.0
 * when omitted (matching the canonical "no-multiplier" baseline).
 */
export interface ParetoPointSpec {
  /** Display label (e.g. "0.5x" or "12 mo"). */
  label: string;
  /** Numeric x-axis value associated with this point. */
  x: number;
  xeno_proportion: number;
  /** Bridge-only: graft survival in months. Required when mode='bridge'. */
  surv?: BridgeSurvivalMonths;
  /** Replacement-only: relisting/graft-failure multiplier. Defaults to 1. */
  xenoGraftFailureRate?: number;
  /** Replacement-only: post-transplant death multiplier. Defaults to 1. */
  postTransplantDeathRate?: number;
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
      // Per-point relist/death multipliers (replacement-only). Bridge
      // mode ignores these because composeConfigName hard-codes them.
      const xrate = spec.xenoGraftFailureRate ?? 1;
      const drate = spec.postTransplantDeathRate ?? 1;
      const scenarioName = composeConfigName(
        mode,
        {
          xeno_proportion: spec.xeno_proportion,
          xenoGraftFailureRate: xrate,
          postTransplantDeathRate: drate,
        },
        effectiveStrategy,
      );
      // Base case is always prop=0 with the canonical "no-multiplier"
      // baseline (1.0/1.0). At prop=0 there are no xeno transplants so
      // the xeno multipliers don't affect the simulation, which means
      // every point in the sweep can compare against the same base —
      // important for keeping "lives saved" / "waitlist reduction"
      // self-consistent across the curve.
      const baseName = composeConfigName(
        mode,
        { xeno_proportion: 0, xenoGraftFailureRate: 1, postTransplantDeathRate: 1 },
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
