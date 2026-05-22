/**
 * Shared overlay configuration for the Pareto multi-curve mode.
 *
 * Exposes:
 *   - `OverlayMode` — the toolbar's tri-state (off | thresholds | strategies)
 *   - Palettes keyed by threshold and by strategy — picking a stable color
 *     per subgroup so the same threshold/strategy gets the same color
 *     across all 3 cards on a page (visual continuity matters when the
 *     user is comparing curves between cards).
 *   - Display labels for each subgroup, kept in one place so future
 *     "rename strategy" tweaks only have to edit this file.
 *   - `THRESHOLDS` and `STRATEGIES` constants — the canonical list of
 *     subgroups the overlay sweeps over. Adding a new threshold (e.g.
 *     90%+) only needs an entry here plus the matching backend run.
 */

export type OverlayMode = 'off' | 'thresholds' | 'strategies';
export type ParetoView = 'cumulative' | 'marginal';

// Threshold palette: lighter → darker as the cohort gets stricter
// (more sensitised → higher cPRA). Picked so the colors read in the
// "more difficult cohort" direction at a glance.
export const THRESHOLDS = [85, 95, 99] as const;
export type ThresholdValue = (typeof THRESHOLDS)[number];

export const THRESHOLD_PALETTE: Record<ThresholdValue, string> = {
  85: '#60a5fa', // sky-400 — easiest pool (broadest)
  95: '#2563eb', // blue-600 — current production default
  99: '#1e40af', // blue-800 — strictest pool (smallest)
};

export const THRESHOLD_LABEL: Record<ThresholdValue, string> = {
  85: '85%+ cPRA',
  95: '95%+ cPRA',
  99: '99%+ cPRA',
};

// Strategy palette: 5 visually distinct hues so the curves stay
// distinguishable even on small screens. The "standard" strategy gets
// the same blue as the 95%+ threshold so users who toggle between
// overlays can mentally anchor on it.
export const STRATEGIES = [
  'standard',
  'age60_cpraHigh',
  'age45_cpraHigh',
  'age60_cpraAll',
  'age45_cpraAll',
] as const;
export type StrategyValue = (typeof STRATEGIES)[number];

export const STRATEGY_PALETTE: Record<StrategyValue, string> = {
  standard: '#2563eb',        // blue
  age60_cpraHigh: '#8b5cf6',  // violet
  age45_cpraHigh: '#ec4899',  // pink
  age60_cpraAll: '#f59e0b',   // amber
  age45_cpraAll: '#10b981',   // emerald
};

export const STRATEGY_LABEL: Record<StrategyValue, string> = {
  standard: 'Standard',
  age60_cpraHigh: '60+ high cPRA',
  age45_cpraHigh: '45+ high cPRA',
  age60_cpraAll: '60+ any cPRA',
  age45_cpraAll: '45+ any cPRA',
};
