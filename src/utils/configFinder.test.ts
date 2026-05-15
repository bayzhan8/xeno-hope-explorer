/**
 * Unit tests for `composeConfigName` and `resolveVizUrls`.
 *
 * These names/URLs are the contract between the website and the Python
 * runner — drift in either direction silently breaks the data fetch
 * layer. Tests lock down the exact strings the runner emits.
 */
import { describe, expect, it } from 'vitest';
import { composeConfigName, resolveVizUrls } from './configFinder';

describe('composeConfigName — bridge mode', () => {
  it('standard: hard-codes _relist1p0_death1p0 and uses targeting-style float fmt', () => {
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

  it('targeted: prefixes with the strategy name, same multiplier hard-coding', () => {
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

  it('ignores xenoGraftFailureRate / postTransplantDeathRate when in bridge mode', () => {
    expect(
      composeConfigName(
        'bridge',
        { xeno_proportion: 1, xenoGraftFailureRate: 5, postTransplantDeathRate: 0.5 },
        'standard',
      ),
    ).toBe('xeno_age_prop1p0_relist1p0_death1p0');
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
