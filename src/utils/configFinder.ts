// Fixed parameters for 85% CPRA threshold
const FIXED_PARAMS_85 = {
  rates_cpra: {
    '0-85': {
      C_start: 77406,
      H_start: 229727,
      wl_removal: 0.0002721411438431126,
      'returned after removal': 0,
      relisting: 2.1923193403554697e-05,
      'death with tx': 0.00012645653972841005,
      arrival: 88.46301369863014,
      transplant: 61.63013698630137,
      'waitlist death': 0.00013868799389249342
    },
    '85-100': {
      C_start: 10900,
      H_start: 23402,
      wl_removal: 0.0002835907220782278,
      'returned after removal': 0,
      relisting: 0.00015338345481403357,
      'death with tx': 0.0001128364690248253,
      arrival: 6.6219178082191785,
      transplant: 8.035616438356165,
      'waitlist death': 0.0001239570098340096
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
      C_start: 80409,
      H_start: 238118,
      wl_removal: 0.0002720666007028558,
      'returned after removal': 0,
      relisting: 2.4513018943435112e-05,
      'death with tx': 0.00012624769571973772,
      arrival: 91.03835616438356,
      transplant: 64.7013698630137,
      'waitlist death': 0.00013855812207854242
    },
    '95-100': {
      C_start: 7897,
      H_start: 15011,
      wl_removal: 0.00028860543641315886,
      'returned after removal': 0,
      relisting: 0.00018666108260153154,
      'death with tx': 0.00010843080431823859,
      arrival: 4.046575342465753,
      transplant: 4.964383561643835,
      'waitlist death': 0.0001198657931209164
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
      C_start: 82864,
      H_start: 244614,
      wl_removal: 0.0002730779450763655,
      'returned after removal': 0,
      relisting: 2.735176965784718e-05,
      'death with tx': 0.00012577194925900294,
      arrival: 92.78904109589041,
      transplant: 66.79452054794521,
      'waitlist death': 0.00013831220594776955
    },
    '99-100': {
      C_start: 5442,
      H_start: 8515,
      wl_removal: 0.00028023007713538924,
      'returned after removal': 0,
      relisting: 0.0002291157296188794,
      'death with tx': 0.00010857952771783283,
      arrival: 2.2958904109589042,
      transplant: 2.871232876712329,
      'waitlist death': 0.00011538885529104263
    }
  },
  low_key: '0-99',
  high_key: '99-100',
  T: 3650
};

interface UserInputs {
  xeno_proportion: number;
  xenoGraftFailureRate: number; // multiplier (0, 0.5, 1, 1.5, 2)
  postTransplantDeathRate: number; // multiplier (0, 0.5, 1, 1.5, 2)
  highCPRAThreshold: number; // 85, 95, or 99
  targetingStrategy?: string; // NEW: "standard", "age60_cpraHigh", etc.
}

interface ExperimentConfigs {
  name_to_config: Record<string, any>;
}



// Supabase Storage base URL
const SUPABASE_STORAGE_URL = 'https://bkgpfnhbmkxzwtixiwnh.supabase.co/storage/v1/object/public/viz-data';

// Standard configs were generated with Python int list [0, 0.5, 1, 1.5, 2]
// so str(0) = "0", str(0.5) = "0p5", str(1) = "1"
function formatStandard(val: number): string {
  if (Number.isInteger(val)) return val.toString();
  return val.toString().replace('.', 'p');
}

// Targeting configs were generated with Python float list [0.0, 0.5, 1.0, 1.5, 2.0]
// so str(0.0) = "0.0" → "0p0", str(1.0) = "1.0" → "1p0"
function formatTargeting(val: number): string {
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
    let configName: string;
    if (strategy === 'standard') {
      const fmt = formatStandard;
      configName = `xeno_age_prop${fmt(userInputs.xeno_proportion)}_relist${fmt(userInputs.xenoGraftFailureRate)}_death${fmt(userInputs.postTransplantDeathRate)}`;
    } else {
      const fmt = formatTargeting;
      configName = `${strategy}_prop${fmt(userInputs.xeno_proportion)}_relist${fmt(userInputs.xenoGraftFailureRate)}_death${fmt(userInputs.postTransplantDeathRate)}`;
    }

    if (import.meta.env.DEV) {
      console.log('═══════════════════════════════════════════════════════════');
      console.log('[Config Finder] 🔍 CONFIG LOOKUP');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('  strategy:', strategy);
      console.log('  threshold:', threshold);
      console.log('  xeno_proportion:', userInputs.xeno_proportion);
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
//
//   replacement-standard:  xeno_age_prop{p}_relist{r}_death{d}
//   replacement-targeted:  {strategy}_prop{p}_relist{r}_death{d}
//   bridge-standard:       xeno_age_prop{p}_relist1p0_death1p0
//   bridge-targeted:       {strategy}_prop{p}_relist1p0_death1p0
//
// The bridge variants HARD-CODE _relist1p0_death1p0 because the bridge
// runner always passes those multipliers (the actual rates are pre-baked
// per-age into the input pickle — see make_bridge_inputs.py).
export interface ComposeNameParams {
  xeno_proportion: number;
  xenoGraftFailureRate?: number;     // replacement only; ignored in bridge mode
  postTransplantDeathRate?: number;  // replacement only; ignored in bridge mode
}

export function composeConfigName(
  mode: TherapyMode,
  params: ComposeNameParams,
  strategy: string = 'standard',
): string {
  if (mode === 'bridge') {
    // Bridge: targeting-style float formatting throughout (matches
    // run_bridge_experiments.py::config_name_for which always uses
    // str(float).replace(".", "p")).
    const fmt = formatTargeting;
    const propStr = fmt(params.xeno_proportion);
    const base = strategy === 'standard' ? 'xeno_age' : strategy;
    return `${base}_prop${propStr}_relist1p0_death1p0`;
  }

  // Replacement therapy — preserve historical formatting quirk: the
  // standard runner uses `str(int_or_float).replace(".", "p")` so 1 stays
  // "1" while 0.5 becomes "0p5". The targeting runner formats every value
  // as `f"{v:.1f}".replace(".", "p")` so 1.0 → "1p0".
  const xrate = params.xenoGraftFailureRate ?? 1;
  const drate = params.postTransplantDeathRate ?? 1;
  if (strategy === 'standard') {
    const fmt = formatStandard;
    return `xeno_age_prop${fmt(params.xeno_proportion)}_relist${fmt(xrate)}_death${fmt(drate)}`;
  }
  const fmt = formatTargeting;
  return `${strategy}_prop${fmt(params.xeno_proportion)}_relist${fmt(xrate)}_death${fmt(drate)}`;
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

