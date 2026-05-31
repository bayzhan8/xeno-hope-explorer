// ─── Per-(threshold, cPRA) aggregate rates ────────────────────────────────
// REGENERATED from the actual per-age simulator input pickles
// (inputs_age/sim_inputs85.pkl, sim_inputs2.pkl, sim_inputs99.pkl) so they
// match what the simulator actually runs. The pickle is age-stratified
// (4 age bins per cPRA group); these are the cPRA-group rollups used only by
// the front-end display helpers (`getWlRemovalRates`, `getBridgeMortalityRates`)
// and the Little's-Law wl_removal correction. They are NOT fed back into the
// simulator. Aggregation:
//   - waitlist-state hazards (waitlist death, wl_removal): C_start-weighted
//     mean over ages (matches Σ rate·C / Σ C, the group's effective hazard).
//   - recipient-state hazards (death with tx, relisting): H_start-weighted.
//   - C_start / H_start / arrival / transplant: summed over ages.
// The previous hardcoded values were stale (an older non-age-stratified
// vintage) and understated the dialysis-vs-transplant mortality gap.

// Fixed parameters for 85% CPRA threshold
const FIXED_PARAMS_85 = {
  rates_cpra: {
    '0-85': {
      C_start: 79486,
      H_start: 269318,
      wl_removal: 0.00026440691493434196,
      'returned after removal': 0,
      relisting: 2.8629836335793063e-05,
      'death with tx': 8.496502647379132e-05,
      arrival: 92.8986301369863,
      transplant: 62.079452054794515,
      'waitlist death': 0.0001366241274419106
    },
    '85-100': {
      C_start: 8794,
      H_start: 21302,
      wl_removal: 0.0003334157108723134,
      'returned after removal': 0,
      relisting: 4.3015816872412575e-05,
      'death with tx': 9.673256030370093e-05,
      arrival: 2.1671232876712327,
      transplant: 7.7835616438356166,
      'waitlist death': 0.00014871712789626284
    }
  },
  low_key: '0-85',
  high_key: '85-100',
  T: 3650
};

// Fixed parameters for 95% CPRA threshold
const FIXED_PARAMS_95 = {
  rates_cpra: {
    '0-95': {
      C_start: 81835,
      H_start: 277317,
      wl_removal: 0.00026599340281411937,
      'returned after removal': 0,
      relisting: 2.9010124925944272e-05,
      'death with tx': 8.530246691579481e-05,
      arrival: 93.75890410958905,
      transplant: 65.14246575342466,
      'waitlist death': 0.00013741444475902636
    },
    '95-100': {
      C_start: 6445,
      H_start: 13303,
      wl_removal: 0.0003381372842696963,
      'returned after removal': 0,
      relisting: 4.378286389263719e-05,
      'death with tx': 9.713791846490176e-05,
      arrival: 1.3068493150684932,
      transplant: 4.72054794520548,
      'waitlist death': 0.0001428792875915326
    }
  },
  low_key: '0-95',
  high_key: '95-100',
  T: 3650
};

// Fixed parameters for 99% CPRA threshold
const FIXED_PARAMS_99 = {
  rates_cpra: {
    '0-99': {
      C_start: 83878,
      H_start: 283285,
      wl_removal: 0.0002675718158823498,
      'returned after removal': 0,
      relisting: 2.925468116462236e-05,
      'death with tx': 8.547909676516938e-05,
      arrival: 94.37534246575343,
      transplant: 67.1945205479452,
      'waitlist death': 0.00013769207694358412
    },
    '99-100': {
      C_start: 4402,
      H_start: 7335,
      wl_removal: 0.000341182192160926,
      'returned after removal': 0,
      relisting: 4.6382822483912334e-05,
      'death with tx': 0.00010040543411829085,
      arrival: 0.6904109589041096,
      transplant: 2.6684931506849314,
      'waitlist death': 0.00013995027383539301
    }
  },
  low_key: '0-99',
  high_key: '99-100',
  T: 3650
};

interface UserInputs {
  xeno_n: number; // absolute xeno supply in kidneys/yr (from the supply grid)
  xenoGraftFailureRate: number; // relisting multiplier {0.5, 0.8, 1.0, 1.2}
  postTransplantDeathRate: number; // death multiplier {1.0, 1.2}
  highCPRAThreshold: number; // 85, 95, or 99
  targetingStrategy?: string; // "standard", "age60_cpraHigh", etc.
}

interface ExperimentConfigs {
  name_to_config: Record<string, any>;
}



import { supplyToken } from './supplyGrid';

// Supabase Storage base URL. Supplied ONLY at build time via the env var
// VITE_SUPABASE_STORAGE_URL — nothing is hardcoded here. Set it in .env /
// .env.local locally (see .env.example) and in the Vercel project env for
// production. It is a PUBLIC read endpoint (no key) and Vite inlines it into
// the client bundle at build time, so it is not a secret — but keeping it out
// of source means the repo carries no project-specific config at all.
const SUPABASE_STORAGE_URL = import.meta.env.VITE_SUPABASE_STORAGE_URL as
  | string
  | undefined;

if (!SUPABASE_STORAGE_URL) {
  throw new Error(
    'VITE_SUPABASE_STORAGE_URL is not set. Copy .env.example to .env (or set ' +
      'it in the Vercel project env) with the public viz-data bucket base URL.',
  );
}

// All runners now emit relist/death multipliers via Python `str(float)`, e.g.
// str(1.0) = "1.0" → "1p0", str(0.8) = "0.8" → "0p8". Every supported value
// (relist {0.5,0.8,1.0,1.2}, death {1.0,1.2}) is one-decimal, so JS
// `toFixed(1)` reproduces the Python string exactly. This is the single
// formatter for both standard and targeted strategies and both therapy modes.
function fmtMult(val: number): string {
  return val.toFixed(1).replace('.', 'p');
}

// Map (strategy, threshold) -> registry file in Supabase storage.
// Targeting strategies were re-run separately for every cPRA threshold and
// therefore live in their own per-threshold registries. The 99% file keeps
// its original name (`targeting_configs.json`) so any in-flight requests
// from older cached frontends keep resolving.
function targetingConfigsFile(threshold: number): string {
  if (threshold === 85) return 'targeting_configs_85.json';
  if (threshold === 95) return 'targeting_configs_95.json';
  return 'targeting_configs.json'; // default = 99%
}

// Same idea for the per-threshold viz JSON folders.
function targetingVizFolder(threshold: number): string {
  if (threshold === 85) return 'viz_data_age_targeting_85';
  if (threshold === 95) return 'viz_data_age_targeting_95';
  return 'viz_data_age_targeting'; // default = 99%
}

// ─── Bridge Therapy support ────────────────────────────────────────────────
//
// Bridge mode uses pre-baked input pickles (one per (cPRA threshold, target
// graft survival in months)) so the relisting/death-with-tx multipliers are
// always 1.0 in every config name. The graft-survival dimension is encoded
// in the *folder/prefix*, NOT in the config name. This keeps the per-config
// JSON name compatible with all existing safety-net regexes.
//
// Folder layout (mirrors `run_bridge_experiments.py::folders_for`):
//
//   viz_data_age_bridge_<threshold>_surv<M>mo/             (no targeting)
//   viz_data_age_bridge_targeting_<threshold>_surv<M>mo/   (4 strategies)
//
// The Mode union is exported so other modules can pass-through the active
// therapy mode without re-deriving it from URL-state etc.
export type TherapyMode = 'replacement' | 'bridge';

// Allowed graft-survival targets for Bridge Therapy (must mirror the values
// in run_bridge_experiments.py SURVIVALS / make_bridge_inputs.py).
// Per-person-day waitlist-removal hazards, by high-cPRA threshold and cPRA
// group. Mirrors the per-(cPRA × age) rates inside the simulator input
// pickles, aggregated to the cPRA level (per-age variation is ≤5%, so the
// cPRA-level rate is a faithful summary for the front-end Little's-Law
// outflow correction in `computeWaitTimeByYear`).
//
// Source: identical to the FIXED_PARAMS_* tables above (which the backend
// loader exports). Keep these in sync if the pickle is ever regenerated.
export const WL_REMOVAL_RATES_PER_PERSON_DAY: Record<
  number,
  { low: number; high: number }
> = {
  85: {
    low: FIXED_PARAMS_85.rates_cpra['0-85'].wl_removal,
    high: FIXED_PARAMS_85.rates_cpra['85-100'].wl_removal,
  },
  95: {
    low: FIXED_PARAMS_95.rates_cpra['0-95'].wl_removal,
    high: FIXED_PARAMS_95.rates_cpra['95-100'].wl_removal,
  },
  99: {
    low: FIXED_PARAMS_99.rates_cpra['0-99'].wl_removal,
    high: FIXED_PARAMS_99.rates_cpra['99-100'].wl_removal,
  },
};

// Pick the wl_removal rates for a given high-cPRA threshold. Falls back to
// the 85% bin (the most commonly used) if the caller passes a threshold
// we don't have rates for, rather than zeroing out the correction (which
// would silently re-introduce the ~30% upward bias).
export function getWlRemovalRates(
  highCPRAThreshold: number,
): { low: number; high: number } {
  return (
    WL_REMOVAL_RATES_PER_PERSON_DAY[highCPRAThreshold] ??
    WL_REMOVAL_RATES_PER_PERSON_DAY[85]
  );
}

// ─── Mortality rates for the Bridge mortality-comparison panel ────────────
//
// All values are per-person-day hazards taken from the same FIXED_PARAMS_*
// tables the backend uses. The Bridge page reads these to render the
// dialysis-vs-bridge-vs-post-allo comparison without round-tripping
// through the viz JSON (it would be cheaper to read them straight from
// the loaded JSON, but the panel needs to react to slider moves before
// the JSON has finished refetching).
//
// Notes:
//   - "dialysis" mortality is the simulator's `waitlist death` rate on
//     the `C` state — i.e. the per-person-day death hazard for a
//     candidate on the active waitlist (i.e. on dialysis).
//   - "postAllo" mortality is `death with tx` on the `H_std` state.
//   - "bridgeBaseline" is the per-day mortality the bridge pickle bakes
//     into `death_with_tx_xeno` for the high-cPRA row — by design equal
//     to `death with tx` (the human-kidney post-tx hazard) at the
//     canonical 1.0× multiplier. Multiplying by `bridgeMultiplier` gives
//     the achieved bridge mortality.
export interface BridgeMortalityRates {
  /** Per-person-day mortality for the dialysis (active-waitlist) state. */
  dialysisPerDay: number;
  /** Per-person-day mortality for the post-allokidney state (H_std). */
  postAlloPerDay: number;
  /** Per-person-day xenograft-baseline (= postAlloPerDay at 1.0×). */
  bridgeBaselinePerDay: number;
}

const HIGH_KEY_RATES: Record<number, BridgeMortalityRates> = {
  85: {
    dialysisPerDay: FIXED_PARAMS_85.rates_cpra['85-100']['waitlist death'],
    postAlloPerDay: FIXED_PARAMS_85.rates_cpra['85-100']['death with tx'],
    bridgeBaselinePerDay: FIXED_PARAMS_85.rates_cpra['85-100']['death with tx'],
  },
  95: {
    dialysisPerDay: FIXED_PARAMS_95.rates_cpra['95-100']['waitlist death'],
    postAlloPerDay: FIXED_PARAMS_95.rates_cpra['95-100']['death with tx'],
    bridgeBaselinePerDay: FIXED_PARAMS_95.rates_cpra['95-100']['death with tx'],
  },
  99: {
    dialysisPerDay: FIXED_PARAMS_99.rates_cpra['99-100']['waitlist death'],
    postAlloPerDay: FIXED_PARAMS_99.rates_cpra['99-100']['death with tx'],
    bridgeBaselinePerDay: FIXED_PARAMS_99.rates_cpra['99-100']['death with tx'],
  },
};

const LOW_KEY_RATES: Record<number, BridgeMortalityRates> = {
  85: {
    dialysisPerDay: FIXED_PARAMS_85.rates_cpra['0-85']['waitlist death'],
    postAlloPerDay: FIXED_PARAMS_85.rates_cpra['0-85']['death with tx'],
    bridgeBaselinePerDay: FIXED_PARAMS_85.rates_cpra['0-85']['death with tx'],
  },
  95: {
    dialysisPerDay: FIXED_PARAMS_95.rates_cpra['0-95']['waitlist death'],
    postAlloPerDay: FIXED_PARAMS_95.rates_cpra['0-95']['death with tx'],
    bridgeBaselinePerDay: FIXED_PARAMS_95.rates_cpra['0-95']['death with tx'],
  },
  99: {
    dialysisPerDay: FIXED_PARAMS_99.rates_cpra['0-99']['waitlist death'],
    postAlloPerDay: FIXED_PARAMS_99.rates_cpra['0-99']['death with tx'],
    bridgeBaselinePerDay: FIXED_PARAMS_99.rates_cpra['0-99']['death with tx'],
  },
};

/**
 * Per-person-day mortality hazards for the cPRA bucket the bridge
 * actually targets. The `cpraGroup` argument selects which row of the
 * input pickle is used:
 *
 *   - `'high'` (default) — the high-cPRA row, i.e. the row whose
 *     `death_with_tx_xeno` was overwritten by `make_bridge_inputs.py`.
 *     This is the row the Bridge mortality slider actually scales.
 *   - `'low'` — the lower-cPRA row, exposed so the panel can show the
 *     "less sensitized" population as context.
 *
 * Falls back to the 85% bucket (most-commonly-shown default) if the
 * caller passes a threshold we don't have rates for, mirroring
 * `getWlRemovalRates`.
 */
export function getBridgeMortalityRates(
  highCPRAThreshold: number,
  cpraGroup: 'high' | 'low' = 'high',
): BridgeMortalityRates {
  const table = cpraGroup === 'high' ? HIGH_KEY_RATES : LOW_KEY_RATES;
  return table[highCPRAThreshold] ?? table[85];
}

export const BRIDGE_SURVIVAL_MONTHS = [6, 12, 18, 24, 36] as const;
export type BridgeSurvivalMonths = (typeof BRIDGE_SURVIVAL_MONTHS)[number];

function bridgeVizFolder(strategy: string, threshold: number, surv: BridgeSurvivalMonths): string {
  const suf = `${threshold}_surv${surv}mo`;
  return strategy === 'standard'
    ? `viz_data_age_bridge_${suf}`
    : `viz_data_age_bridge_targeting_${suf}`;
}

// Find config name from user inputs
export async function findConfigName(userInputs: UserInputs): Promise<string | null> {
  try {
    console.log('[Config Finder] Starting config lookup with inputs:', userInputs);

    const strategy = userInputs.targetingStrategy || 'standard';
    const threshold = userInputs.highCPRAThreshold;

    let configUrl: string;
    if (strategy === 'standard') {
      configUrl = `${SUPABASE_STORAGE_URL}/experiment_configs_v2.json`;
    } else {
      configUrl = `${SUPABASE_STORAGE_URL}/${targetingConfigsFile(threshold)}`;
    }

    // The config name is fully deterministic from (strategy, prop, relist,
    // death) — same encoding the Python runner uses. Compute it directly
    // and rely on the viz-fetch layer's live→backup→404 fallback for
    // existence checks. We used to also gate on the per-threshold
    // registry's `name_to_config` map, but that registry is written
    // per-machine by the runner, so during the multi-machine rerun it's
    // ALWAYS missing entries the other machine produced. Gating on it
    // would silently break the UI for any config not run on the machine
    // that last uploaded the registry.
    const configName = composeConfigName(
      'replacement',
      {
        xeno_n: userInputs.xeno_n,
        xenoGraftFailureRate: userInputs.xenoGraftFailureRate,
        postTransplantDeathRate: userInputs.postTransplantDeathRate,
      },
      strategy,
    );

    if (import.meta.env.DEV) {
      console.log('═══════════════════════════════════════════════════════════');
      console.log('[Config Finder] 🔍 CONFIG LOOKUP');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('  strategy:', strategy);
      console.log('  threshold:', threshold);
      console.log('  xeno_n (kidneys/yr):', userInputs.xeno_n);
      console.log('  xenoGraftFailureRate:', userInputs.xenoGraftFailureRate);
      console.log('  postTransplantDeathRate:', userInputs.postTransplantDeathRate);
      console.log('  → derived configName:', configName);
      console.log('═══════════════════════════════════════════════════════════');
    }

    // Best-effort registry fetch for dev-time diagnostics — the result no
    // longer affects the return value. Wrapped so a network error or
    // missing registry never breaks the UI.
    if (import.meta.env.DEV) {
      try {
        const r = await fetch(configUrl);
        if (r.ok) {
          const reg: ExperimentConfigs = await r.json();
          const present = !!reg.name_to_config?.[configName];
          console.log(`[Config Finder] registry membership check (informational): ${present ? '✓ in registry' : '✗ not in registry yet — will still attempt fetch'}`);
        } else {
          console.log(`[Config Finder] registry fetch returned HTTP ${r.status} (informational only)`);
        }
      } catch {
        /* ignore */
      }
    }

    return configName;
  } catch (error) {
    console.error('Error finding config name:', error);
    return null;
  }
}


// Backup prefix for the pre-rerun viz JSONs. While the Monte Carlo re-run
// is in flight, the original prefixes are emptied and the old data lives
// here. Once a config gets re-run, its fresh JSON lands at the original
// prefix and takes precedence; until then we transparently fall back so
// the website keeps working throughout the rerun.
const BACKUP_PREFIX_ROOT = '_backup_pre_rerun_2026_05_14';

// Compose the canonical config-name string for a (mode, strategy, params)
// triple. Single source of truth shared by the page + the Pareto loader.
// Supply is an ABSOLUTE count (kidneys/yr) encoded as `n{round(N)}`:
//
//   replacement-standard:  xeno_age_n{N}_relist{r}_death{d}
//   replacement-targeted:  {strategy}_n{N}_relist{r}_death{d}
//   bridge-standard:       xeno_age_n{N}_relist1p0_death{d}   (surv in folder)
//   bridge-targeted:       {strategy}_n{N}_relist1p0_death{d}
//
// The bridge variants HARD-CODE _relist1p0 because the bridge pickle already
// encodes per-age survival in `relisting_xeno`. The N=0 base case is deduped
// on every runner to the canonical `n0_relist1p0_death1p0` (no xenograft ever
// fires, so the multipliers are inert), so the frontend MUST compose the same
// canonical name at N=0 or it 404s. See supply_grid.py.
//
// `XENO_DEATH_MULTIPLIERS` is the canonical list of post-transplant death
// multipliers covered by the backend sweep, shared by both pages:
//   1.0  — xeno mortality equals human-kidney mortality (optimistic baseline)
//   1.2  — xeno mortality is 20% higher than human-kidney (slightly worse)
// `XENO_RELIST_MULTIPLIERS` is the replacement-only graft-failure grid.
// Frontend pickers MUST snap to these; backend runners MUST generate them.
export const XENO_DEATH_MULTIPLIERS = [1.0, 1.2] as const;
export const BRIDGE_DEATH_MULTIPLIERS = XENO_DEATH_MULTIPLIERS;
export type BridgeDeathMultiplier = (typeof XENO_DEATH_MULTIPLIERS)[number];
export type XenoDeathMultiplier = BridgeDeathMultiplier;

// Replacement-therapy relisting (graft-failure) multiplier grid. Must mirror
// RELISTING_MULTIPLIERS in run_age_experiments.py / run_all_targeting_experiments.py.
export const XENO_RELIST_MULTIPLIERS = [0.5, 0.8, 1.0, 1.2] as const;
export type XenoRelistMultiplier = (typeof XENO_RELIST_MULTIPLIERS)[number];

export interface ComposeNameParams {
  /** Absolute xeno supply in kidneys/yr (a value from the supply grid). */
  xeno_n: number;
  xenoGraftFailureRate?: number;     // replacement only; ignored in bridge mode
  /**
   * Post-transplant death multiplier (used by both modes).
   * - replacement: scales the post-tx death hazard on H_std recipients.
   * - bridge: scales the post-tx death hazard on H_xeno recipients only
   *   (the "mortality while bridged" lever — central to Task Group 2).
   * Defaults to 1.0 (the canonical baseline).
   */
  postTransplantDeathRate?: number;
}

export function composeConfigName(
  mode: TherapyMode,
  params: ComposeNameParams,
  strategy: string = 'standard',
): string {
  const base = strategy === 'standard' ? 'xeno_age' : strategy;
  const nTok = supplyToken(params.xeno_n);

  // N=0 base case: deduped on every runner to the canonical (relist1p0,
  // death1p0) since no xenograft fires and the multipliers are inert.
  if (Math.round(params.xeno_n) <= 0) {
    return `${base}_${nTok}_relist1p0_death1p0`;
  }

  // Bridge hard-codes relist1p0 (survival baked into the pickle); replacement
  // uses the user's graft-failure multiplier.
  const relist = mode === 'bridge' ? 1.0 : params.xenoGraftFailureRate ?? 1;
  const drate = params.postTransplantDeathRate ?? 1;
  return `${base}_${nTok}_relist${fmtMult(relist)}_death${fmtMult(drate)}`;
}

// Resolve the live and backup viz JSON URLs for a given (mode, strategy,
// threshold, optional surv). The backup URL is only meaningful in
// replacement therapy (the pre-rerun snapshot did not include bridge
// therapy data); for bridge mode the backup is null.
export function resolveVizUrls(
  configName: string,
  mode: TherapyMode,
  highCPRAThreshold: number,
  strategy: string = 'standard',
  surv?: BridgeSurvivalMonths,
): { primaryUrl: string; backupUrl: string | null; vizFolder: string } {
  let vizFolder: string;
  if (mode === 'bridge') {
    if (!surv) {
      throw new Error('resolveVizUrls(mode=bridge) requires a `surv` (graft survival in months).');
    }
    vizFolder = bridgeVizFolder(strategy, highCPRAThreshold, surv);
  } else if (strategy !== 'standard') {
    vizFolder = targetingVizFolder(highCPRAThreshold);
  } else {
    vizFolder = 'viz_data_age';
    if (highCPRAThreshold === 85) vizFolder = 'viz_data_age_85';
    else if (highCPRAThreshold === 99) vizFolder = 'viz_data_age_99';
  }

  const primaryUrl = `${SUPABASE_STORAGE_URL}/${vizFolder}/${configName}.json`;
  const backupUrl = mode === 'replacement'
    ? `${SUPABASE_STORAGE_URL}/${BACKUP_PREFIX_ROOT}/${vizFolder}/${configName}.json`
    : null;

  return { primaryUrl, backupUrl, vizFolder };
}

// Load visualization data from Supabase Storage (age-stratified version)
export interface LoadVizOptions {
  mode?: TherapyMode;          // defaults to 'replacement'
  surv?: BridgeSurvivalMonths; // required when mode === 'bridge'
}

export async function loadVisualizationData(
  configName: string,
  highCPRAThreshold: number = 95,
  targetingStrategy?: string,
  opts: LoadVizOptions = {},
) {
  const mode: TherapyMode = opts.mode || 'replacement';
  const strategy = targetingStrategy || 'standard';
  const { primaryUrl, backupUrl, vizFolder } = resolveVizUrls(
    configName, mode, highCPRAThreshold, strategy, opts.surv,
  );

  // Try the primary (live) prefix first; fall back to the pre-rerun backup
  // if the new viz hasn't landed yet for this config (replacement mode
  // only — bridge has no pre-rerun backup).
  try {
    console.log(`[Config Finder] Loading viz data from: ${primaryUrl} (cPRA ${highCPRAThreshold}%${mode === 'bridge' ? `, surv ${opts.surv}mo` : ''})`);
    const response = await fetch(primaryUrl);
    if (response.ok) {
      const data = await response.json();
      console.log('[Config Finder] ✓ loaded fresh viz data:', configName, `(cPRA ${highCPRAThreshold}%, mode=${mode})`,
                  'Series count:', data.waitlist_sizes?.series?.length);
      return data;
    }
    // Supabase Storage's PUBLIC endpoint returns HTTP 400 (with a JSON
    // body containing "not_found") when an object doesn't exist —
    // NOT 404. Treat both as "missing" and fall back to the backup.
    const missing = response.status === 404 || response.status === 400;
    if (!missing) {
      throw new Error(`Failed to load viz data for ${configName} (cPRA ${highCPRAThreshold}%) from primary path: HTTP ${response.status}`);
    }

    if (backupUrl) {
      console.log(`[Config Finder] primary missing (HTTP ${response.status}), trying backup: ${backupUrl}`);
      const backupResp = await fetch(backupUrl);
      if (backupResp.ok) {
        const data = await backupResp.json();
        console.log('[Config Finder] ✓ loaded BACKUP viz data (re-run not finished for this config):', configName);
        return data;
      }
    } else {
      console.log(`[Config Finder] primary missing (HTTP ${response.status}); no backup configured for mode=${mode}`);
    }

    throw new Error(
      `Visualization data for ${configName} (cPRA ${highCPRAThreshold}%${mode === 'bridge' ? `, surv ${opts.surv}mo` : ''}) is not yet available — re-run in progress.`
    );
  } catch (error) {
    console.error('Error loading visualization data:', error);
    throw error;
  }
}

