/**
 * Frontend mirror of the backend's normalized xenokidney supply grid.
 *
 * Supply is expressed in ABSOLUTE kidneys/yr (clean round numbers), not as a
 * proportion of each strategy's historical transplant volume. This MUST stay
 * in sync with `xenotransplantation/supply_grid.py::SUPPLY_GRID` — the two
 * together form the config-name contract:
 *
 *   replacement-standard:  xeno_age_n{N}_relist{r}_death{d}
 *   replacement-targeted:  {strategy}_n{N}_relist{r}_death{d}
 *   bridge-standard:       xeno_age_n{N}_relist1p0_death{d}   (surv in folder)
 *   bridge-targeted:       {strategy}_n{N}_relist1p0_death{d}
 *
 * Where the supply token is `n{round(N)}` (e.g. `n0`, `n250`, `n1000`).
 *
 * Threshold coverage: `standard` and the two `cpraHigh` strategies depend on
 * the cPRA threshold and are run at 85/95/99. The two `cpraAll` (age-only)
 * strategies are provably threshold-invariant and are only run (and listed)
 * at the 99 pickle — hence the UI forces the threshold to 99 for those.
 */

export const STRATEGIES = [
  'standard',
  'age60_cpraHigh',
  'age45_cpraHigh',
  'age60_cpraAll',
  'age45_cpraAll',
] as const;
export type Strategy = (typeof STRATEGIES)[number];

export const CPRA_THRESHOLDS = [85, 95, 99] as const;

// Per-(strategy, threshold) supply points in kidneys/yr, INCLUDING the N=0
// base case. cpraAll strategies appear at 99 only. Mirror of SUPPLY_GRID in
// supply_grid.py — keep the two identical.
export const SUPPLY_GRID: Record<string, Record<number, number[]>> = {
  standard: {
    85: [0, 250, 500, 750, 1000, 1500, 3000, 5000, 10000],
    95: [0, 250, 500, 750, 1000, 2000, 4000, 7000],
    99: [0, 250, 500, 750, 1000, 2000, 4000],
  },
  age60_cpraHigh: {
    85: [0, 250, 500, 750, 1000, 1500, 2500],
    95: [0, 100, 250, 500, 750, 1000, 1500],
    99: [0, 100, 250, 500, 750, 1000],
  },
  age45_cpraHigh: {
    85: [0, 250, 500, 750, 1000, 2000, 4000, 7000],
    95: [0, 250, 500, 750, 1000, 2000, 4000],
    99: [0, 250, 500, 750, 1000, 2000],
  },
  // cpraAll strategies: threshold-invariant -> 99 only.
  age60_cpraAll: {
    99: [0, 250, 500, 750, 1000, 2000, 5000, 10000, 15000],
  },
  age45_cpraAll: {
    99: [0, 250, 500, 750, 1000, 5000, 10000, 20000],
  },
};

/** True for the age-only (any-cPRA) strategies, which run at 99 only. */
export function isCpraAllStrategy(strategy: string): boolean {
  return strategy === 'age60_cpraAll' || strategy === 'age45_cpraAll';
}

/**
 * cPRA thresholds the UI should offer for a strategy. cpraAll strategies are
 * threshold-invariant, so only 99 is meaningful (and only 99 was run).
 */
export function availableThresholds(strategy: string): number[] {
  return isCpraAllStrategy(strategy) ? [99] : [...CPRA_THRESHOLDS];
}

/**
 * The threshold actually used for a (strategy, requestedThreshold) pair.
 * Snaps cpraAll strategies to 99 regardless of what the UI last had selected.
 */
export function effectiveThreshold(strategy: string, requestedThreshold: number): number {
  if (isCpraAllStrategy(strategy)) return 99;
  return requestedThreshold;
}

/** Target kidneys/yr for this (strategy, threshold) cell, incl. N=0. */
export function supplyPoints(strategy: string, threshold: number): number[] {
  const thr = effectiveThreshold(strategy, threshold);
  return SUPPLY_GRID[strategy]?.[thr] ?? [];
}

/** Supply points with the N=0 base case dropped (for Pareto sweeps). */
export function nonZeroSupplyPoints(strategy: string, threshold: number): number[] {
  return supplyPoints(strategy, threshold).filter((n) => n > 0);
}

/** Config-name token for the supply axis: `n0`, `n250`, `n1000` … */
export function supplyToken(n: number): string {
  return `n${Math.round(n)}`;
}

/**
 * Snap an arbitrary N to the nearest valid grid point for a (strategy,
 * threshold) cell. Used when the strategy/threshold changes and the
 * previously-selected N is no longer on the new cell's grid. Falls back to
 * the cell's largest "shared ladder" value (1000) when present, else the
 * largest available point.
 */
export function nearestSupplyPoint(strategy: string, threshold: number, n: number): number {
  const pts = supplyPoints(strategy, threshold);
  if (pts.length === 0) return 0;
  if (pts.includes(n)) return n;
  return pts.reduce((prev, curr) =>
    Math.abs(curr - n) < Math.abs(prev - n) ? curr : prev,
  );
}

/**
 * Normalize a (strategy, threshold, N) selection so it always points at a
 * config that was actually run: forces cpraAll → 99 and snaps N to the
 * cell's grid. Pages call this from their param-change handlers so the
 * viz-fetch layer never composes a name for a non-existent config.
 */
export function normalizeSelection(
  strategy: string,
  threshold: number,
  xeno_n: number,
): { threshold: number; xeno_n: number } {
  const thr = effectiveThreshold(strategy, threshold);
  return { threshold: thr, xeno_n: nearestSupplyPoint(strategy, thr, xeno_n) };
}
