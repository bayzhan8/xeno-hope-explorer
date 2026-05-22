/**
 * Shared formatting helpers for charts, tooltips, and summary cards.
 *
 * Centralized so every surface in the app uses the same clinical
 * rounding conventions. The May 2026 design review flagged
 * "excessive decimal precision" and inconsistent rounding across
 * surfaces as a comprehension problem, so the rule is:
 *
 *   - Head counts (patients, kidneys, deaths): integer with thousands separator
 *   - Annual rates (% / yr):                   one decimal max
 *   - Share / proportion:                      one decimal max
 *   - Signed delta vs. baseline:               integer with explicit sign
 *
 * No surface should hand-roll its own number formatting; import from here.
 */

/** Integer head count with thousands separators ("12,345"). */
export function fmtCount(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return Math.round(value).toLocaleString();
}

/**
 * Signed delta vs. baseline. Uses real Unicode minus so the sign is
 * unambiguous (and not confused with hyphens in compound labels).
 *   +1,234   /   −1,234   /   0
 */
export function fmtDelta(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  const rounded = Math.round(value);
  if (rounded === 0) return '0';
  return rounded > 0
    ? `+${rounded.toLocaleString()}`
    : `−${Math.abs(rounded).toLocaleString()}`;
}

/**
 * Signed percent change vs. baseline ("+12.3%", "−4.1%").
 * Returns '—' if denominator is 0 or NaN (avoids the misleading
 * "Infinity%" / "NaN%" strings clinicians have stumbled over).
 */
export function fmtDeltaPct(value: number, base: number): string {
  if (!Number.isFinite(value) || !Number.isFinite(base) || base === 0) return '—';
  const pct = ((value - base) / base) * 100;
  if (Math.abs(pct) < 0.05) return '0.0%';
  const sign = pct > 0 ? '+' : '−';
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

/** Single-decimal percent ("12.3%"). */
export function fmtPct(value: unknown, decimals: number = 1): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `${value.toFixed(decimals)}%`;
}

/**
 * Annual hazard rate display ("5.6 % / yr"). One decimal — anything more is
 * pseudo-precision given the Monte Carlo noise in the underlying estimates.
 */
export function fmtAnnualRate(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `${value.toFixed(1)} % / yr`;
}

/**
 * Convert an annual hazard rate (% / yr) into a clinically readable mean
 * time-to-event. Mirrors the formatter previously inlined in SimulationControls.
 */
export function fmtMeanTime(annualPctRate: number): string {
  if (!Number.isFinite(annualPctRate) || annualPctRate <= 0) return 'never (no failures)';
  const years = 100 / annualPctRate;
  if (years >= 2) return `~${years.toFixed(1)} years on avg`;
  const months = years * 12;
  return `~${Math.round(months)} months on avg`;
}

/**
 * The "supply assumptions" tag rendered in chart tooltips and context
 * headers. The meeting explicitly called out that every chart needs to
 * carry the supply context so a reader can't conflate scenarios.
 */
export interface SupplyContext {
  xenoIntendedPerYear: number;
  xenoBaseRate: number;
  proportion: number;
  strategy: string;
  highCPRAThreshold: number;
  horizon: number;
}

const STRATEGY_LABEL: Record<string, string> = {
  standard: 'Standard (high cPRA, all ages)',
  age60_cpraHigh: 'Age 60+ · high cPRA',
  age45_cpraHigh: 'Age 45+ · high cPRA',
  age60_cpraAll: 'Age 60+ · any cPRA',
  age45_cpraAll: 'Age 45+ · any cPRA',
};

export function strategyLabel(strategy: string): string {
  return STRATEGY_LABEL[strategy] ?? strategy;
}

/**
 * Build a one-line supply description like:
 *   "1,723 xeno/yr · Strategy: Standard · cPRA 95%+ · Horizon: 10y"
 *
 * When `xeno_proportion=0` (the baseline counterfactual), substitute
 * "No xeno (baseline)" so users don't read "0 xeno/yr" as a bug.
 */
export function fmtSupplyTag(ctx: SupplyContext): string {
  const parts: string[] = [];
  if (ctx.xenoIntendedPerYear > 0) {
    parts.push(`${ctx.xenoIntendedPerYear.toLocaleString()} xeno kidneys / yr`);
  } else {
    parts.push('No xeno (baseline)');
  }
  parts.push(`Strategy: ${strategyLabel(ctx.strategy)}`);
  parts.push(`cPRA ${ctx.highCPRAThreshold}%+`);
  parts.push(`Horizon: ${ctx.horizon}y`);
  return parts.join(' · ');
}
