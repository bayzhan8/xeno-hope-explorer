/**
 * Unit tests for `composeConfigName` and `resolveVizUrls`.
 *
 * These names/URLs are the contract between the website and the Python
 * runner — drift in either direction silently breaks the data fetch
 * layer. Tests lock down the exact strings the runner emits.
 */
import { describe, expect, it } from 'vitest';
import {
  composeConfigName,
  resolveVizUrls,
  getBridgeMortalityRates,
  BRIDGE_DEATH_MULTIPLIERS,
} from './configFinder';

describe('composeConfigName — bridge mode', () => {
  it('standard: defaults death multiplier to 1.0 with targeting-style float fmt', () => {
    expect(
      composeConfigName('bridge', { xeno_proportion: 1.0 }, 'standard'),
    ).toBe('xeno_age_prop1p0_relist1p0_death1p0');
    expect(
      composeConfigName('bridge', { xeno_proportion: 0 }, 'standard'),
    ).toBe('xeno_age_prop0p0_relist1p0_death1p0');
    expect(
      composeConfigName('bridge', { xeno_proportion: 1.5 }, 'standard'),
    ).toBe('xeno_age_prop1p5_relist1p0_death1p0');
  });

  it('targeted: prefixes with the strategy name, same default death=1.0', () => {
    expect(
      composeConfigName('bridge', { xeno_proportion: 0.5 }, 'age60_cpraHigh'),
    ).toBe('age60_cpraHigh_prop0p5_relist1p0_death1p0');
    expect(
      composeConfigName('bridge', { xeno_proportion: 2 }, 'age45_cpraAll'),
    ).toBe('age45_cpraAll_prop2p0_relist1p0_death1p0');
  });

  it('handles extended supply proportions (3×, 4×) added for asymptote visibility', () => {
    // Backend's str(3.0)="3.0" → "3p0" must match the frontend's
    // formatTargeting(3) = (3).toFixed(1).replace('.', 'p') = "3p0".
    expect(
      composeConfigName('bridge', { xeno_proportion: 3 }, 'standard'),
    ).toBe('xeno_age_prop3p0_relist1p0_death1p0');
    expect(
      composeConfigName('bridge', { xeno_proportion: 4 }, 'standard'),
    ).toBe('xeno_age_prop4p0_relist1p0_death1p0');
    expect(
      composeConfigName('bridge', { xeno_proportion: 3 }, 'age60_cpraHigh'),
    ).toBe('age60_cpraHigh_prop3p0_relist1p0_death1p0');
    expect(
      composeConfigName('bridge', { xeno_proportion: 4 }, 'age45_cpraAll'),
    ).toBe('age45_cpraAll_prop4p0_relist1p0_death1p0');
  });

  it('ignores xenoGraftFailureRate (bridge pickle bakes per-age survival)', () => {
    // Even if a caller passes a non-1.0 graft-failure multiplier, the
    // bridge config name HAS to keep _relist1p0_ because the bridge
    // runner doesn't honour `relisting_xeno_multiplier`.
    expect(
      composeConfigName(
        'bridge',
        { xeno_proportion: 1, xenoGraftFailureRate: 5 },
        'standard',
      ),
    ).toBe('xeno_age_prop1p0_relist1p0_death1p0');
  });

  it('honours postTransplantDeathRate for the canonical {1.0, 1.2} grid', () => {
    // Contract the backend sweep relies on: composing a config name for
    // each XENO_DEATH_MULTIPLIERS value MUST match
    // `run_bridge_experiments.py::config_name_for(strategy, prop, k)`.
    // If this drifts the Bridge page silently 404s on the mortality
    // picker.
    expect(
      composeConfigName(
        'bridge',
        { xeno_proportion: 1, postTransplantDeathRate: 1.0 },
        'standard',
      ),
    ).toBe('xeno_age_prop1p0_relist1p0_death1p0');
    expect(
      composeConfigName(
        'bridge',
        { xeno_proportion: 1, postTransplantDeathRate: 1.2 },
        'standard',
      ),
    ).toBe('xeno_age_prop1p0_relist1p0_death1p2');
    expect(
      composeConfigName(
        'bridge',
        { xeno_proportion: 0.5, postTransplantDeathRate: 1.2 },
        'age45_cpraHigh',
      ),
    ).toBe('age45_cpraHigh_prop0p5_relist1p0_death1p2');
  });

  it('formatter still handles historical multipliers (env-var override path)', () => {
    // The 4-point sweep {0.5, 1.0, 1.5, 2.0} is still reachable via the
    // `BRIDGE_DEATH_MULTIPLIERS` env var on the backend; the frontend
    // formatter must keep producing the matching names so an operator
    // can hand-build a URL to those historical configs.
    expect(
      composeConfigName(
        'bridge',
        { xeno_proportion: 1, postTransplantDeathRate: 0.5 },
        'standard',
      ),
    ).toBe('xeno_age_prop1p0_relist1p0_death0p5');
    expect(
      composeConfigName(
        'bridge',
        { xeno_proportion: 1, postTransplantDeathRate: 2 },
        'standard',
      ),
    ).toBe('xeno_age_prop1p0_relist1p0_death2p0');
  });

  it('every BRIDGE_DEATH_MULTIPLIERS value round-trips into a death_<k>p<...> suffix', () => {
    // Sanity-check the picker/sweep contract for every supported
    // multiplier so we don't ship a picker option that can't address
    // an uploaded Supabase config.
    expect(BRIDGE_DEATH_MULTIPLIERS).toEqual([1.0, 1.2]);
    for (const m of BRIDGE_DEATH_MULTIPLIERS) {
      const name = composeConfigName(
        'bridge',
        { xeno_proportion: 1, postTransplantDeathRate: m },
        'standard',
      );
      const suffix = m.toFixed(1).replace('.', 'p');
      expect(name).toBe(`xeno_age_prop1p0_relist1p0_death${suffix}`);
    }
  });
});

describe('composeConfigName — replacement mode (regression guard)', () => {
  it('standard mode preserves the historical "1" not "1p0" formatting', () => {
    expect(
      composeConfigName(
        'replacement',
        { xeno_proportion: 1, xenoGraftFailureRate: 1, postTransplantDeathRate: 1 },
        'standard',
      ),
    ).toBe('xeno_age_prop1_relist1_death1');
    expect(
      composeConfigName(
        'replacement',
        { xeno_proportion: 0.5, xenoGraftFailureRate: 1.5, postTransplantDeathRate: 2 },
        'standard',
      ),
    ).toBe('xeno_age_prop0p5_relist1p5_death2');
  });

  it('targeted mode uses targeting-style float formatting', () => {
    expect(
      composeConfigName(
        'replacement',
        { xeno_proportion: 1, xenoGraftFailureRate: 1, postTransplantDeathRate: 1 },
        'age60_cpraHigh',
      ),
    ).toBe('age60_cpraHigh_prop1p0_relist1p0_death1p0');
  });

  it('formats the new canonical death=1.2 multiplier in both modes', () => {
    // Replacement and Bridge now share XENO_DEATH_MULTIPLIERS = {1.0, 1.2}.
    // Standard replacement mode uses str() → "1.2" → "1p2"; targeted
    // mode uses toFixed(1) → "1.2" → "1p2"; bridge mode uses targeting-
    // style. Lock down all three so the new picker option can address
    // the upcoming Supabase configs.
    expect(
      composeConfigName(
        'replacement',
        { xeno_proportion: 1, xenoGraftFailureRate: 1, postTransplantDeathRate: 1.2 },
        'standard',
      ),
    ).toBe('xeno_age_prop1_relist1_death1p2');
    expect(
      composeConfigName(
        'replacement',
        { xeno_proportion: 1, xenoGraftFailureRate: 1, postTransplantDeathRate: 1.2 },
        'age60_cpraHigh',
      ),
    ).toBe('age60_cpraHigh_prop1p0_relist1p0_death1p2');
    expect(
      composeConfigName(
        'bridge',
        { xeno_proportion: 1, postTransplantDeathRate: 1.2 },
        'standard',
      ),
    ).toBe('xeno_age_prop1p0_relist1p0_death1p2');
  });
});

describe('resolveVizUrls', () => {
  it('bridge standard: viz_data_age_bridge_<thr>_surv<M>mo prefix', () => {
    const { primaryUrl, backupUrl, vizFolder } = resolveVizUrls(
      'xeno_age_prop1p0_relist1p0_death1p0',
      'bridge',
      95,
      'standard',
      12,
    );
    expect(vizFolder).toBe('viz_data_age_bridge_95_surv12mo');
    expect(primaryUrl).toContain('/viz_data_age_bridge_95_surv12mo/xeno_age_prop1p0_relist1p0_death1p0.json');
    expect(backupUrl).toBeNull();
  });

  it('bridge targeted: viz_data_age_bridge_targeting_<thr>_surv<M>mo prefix', () => {
    const { primaryUrl, vizFolder } = resolveVizUrls(
      'age60_cpraHigh_prop1p0_relist1p0_death1p0',
      'bridge',
      99,
      'age60_cpraHigh',
      6,
    );
    expect(vizFolder).toBe('viz_data_age_bridge_targeting_99_surv6mo');
    expect(primaryUrl).toContain('/viz_data_age_bridge_targeting_99_surv6mo/');
  });

  it('throws if mode=bridge without surv', () => {
    expect(() =>
      resolveVizUrls('xeno_age_prop1p0_relist1p0_death1p0', 'bridge', 95, 'standard'),
    ).toThrow(/surv/);
  });

  it('replacement standard: existing folder names preserved (regression guard)', () => {
    expect(
      resolveVizUrls('xeno_age_prop1_relist1_death1', 'replacement', 85, 'standard').vizFolder,
    ).toBe('viz_data_age_85');
    expect(
      resolveVizUrls('xeno_age_prop1_relist1_death1', 'replacement', 95, 'standard').vizFolder,
    ).toBe('viz_data_age');
    expect(
      resolveVizUrls('xeno_age_prop1_relist1_death1', 'replacement', 99, 'standard').vizFolder,
    ).toBe('viz_data_age_99');
  });

  it('replacement: backup URL is provided (legacy fallback path)', () => {
    const { backupUrl } = resolveVizUrls(
      'xeno_age_prop1_relist1_death1',
      'replacement',
      95,
      'standard',
    );
    expect(backupUrl).toContain('_backup_pre_rerun_2026_05_14');
  });
});

describe('getBridgeMortalityRates — for the mortality-comparison panel', () => {
  it('returns positive per-day hazards for every supported threshold + group', () => {
    for (const thr of [85, 95, 99]) {
      for (const grp of ['high', 'low'] as const) {
        const r = getBridgeMortalityRates(thr, grp);
        expect(r.dialysisPerDay).toBeGreaterThan(0);
        expect(r.postAlloPerDay).toBeGreaterThan(0);
        // Per-day hazards are in the 10⁻⁴ ballpark; sanity-check the
        // order of magnitude so a units-error (e.g. accidentally pulling
        // an annual rate) gets caught here.
        expect(r.dialysisPerDay).toBeLessThan(0.01);
        expect(r.postAlloPerDay).toBeLessThan(0.01);
      }
    }
  });

  it('bridge baseline matches the post-allo "death with tx" hazard at 1.0×', () => {
    // The bridge pickle (make_bridge_inputs.py) writes
    // death_with_tx_xeno := death_with_tx_human for the high-cPRA row.
    // The panel relies on that equality so a 1.0× multiplier displays
    // EXACTLY the post-allo hazard. If make_bridge_inputs ever changes,
    // this test catches the drift.
    for (const thr of [85, 95, 99]) {
      const r = getBridgeMortalityRates(thr, 'high');
      expect(r.bridgeBaselinePerDay).toBeCloseTo(r.postAlloPerDay, 12);
    }
  });

  it('dialysis hazard is higher than post-allo at every threshold (sanity)', () => {
    // SRTR 2022 baseline: high-cPRA dialysis mortality > high-cPRA
    // post-allo mortality. The bridge's headline claim ("bridging cuts
    // mortality") relies on this ordering. If a future pickle reverses
    // it, the panel verdict would be wrong — fail loudly here.
    for (const thr of [85, 95, 99]) {
      const r = getBridgeMortalityRates(thr, 'high');
      expect(r.dialysisPerDay).toBeGreaterThan(r.postAlloPerDay);
    }
  });

  it('falls back to the 85% table for unknown thresholds', () => {
    const fallback = getBridgeMortalityRates(80, 'high');
    const eightyFive = getBridgeMortalityRates(85, 'high');
    expect(fallback).toStrictEqual(eightyFive);
  });
});
