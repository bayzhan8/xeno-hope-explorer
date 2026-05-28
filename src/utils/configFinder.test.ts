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

  it('honours postTransplantDeathRate (the Task-Group-2 mortality slider)', () => {
    // This is the contract the backend sweep relies on: composing a
    // config name for death=0.5 MUST match
    // `run_bridge_experiments.py::config_name_for(strategy, prop, 0.5)`,
    // which produces `_death0p5`. If this drifts the Bridge page silently
    // 404s for every non-1.0 mortality slider position.
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
    expect(
      composeConfigName(
        'bridge',
        { xeno_proportion: 0.5, postTransplantDeathRate: 1.5 },
        'age45_cpraHigh',
      ),
    ).toBe('age45_cpraHigh_prop0p5_relist1p0_death1p5');
  });

  it('every BRIDGE_DEATH_MULTIPLIERS value round-trips into a death_<k>p<...> suffix', () => {
    // Sanity-check the slider/sweep contract for every supported
    // multiplier so we don't ship a slider position that can't address
    // an uploaded Supabase config.
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
