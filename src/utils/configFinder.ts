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
}

interface ExperimentConfigs {
  name_to_config: Record<string, any>;
}



// Supabase Storage base URL
const SUPABASE_STORAGE_URL = 'https://bkgpfnhbmkxzwtixiwnh.supabase.co/storage/v1/object/public/viz-data';

// Find config name from user inputs
// Age-stratified version: configs are simple (xeno_age_prop0, xeno_age_prop0p5, xeno_age_prop1, etc.)
export async function findConfigName(userInputs: UserInputs): Promise<string | null> {
  try {
    console.log('[Config Finder] Starting config lookup with inputs:', userInputs);

    // Load experiment_configs_v2.json from Supabase Storage (age-stratified version)
    const configUrl = `${SUPABASE_STORAGE_URL}/experiment_configs_v2.json`;
    console.log('[Config Finder] Fetching from:', configUrl);
    const response = await fetch(configUrl);
    if (!response.ok) {
      throw new Error('Failed to load experiment_configs_v2.json from Supabase Storage');
    }
    const experimentConfigs: ExperimentConfigs = await response.json();

    // Age-stratified configs have simple naming: xeno_age_prop{value}
    // where value is xeno_proportion with dots replaced by 'p'
    // Examples: xeno_age_prop0, xeno_age_prop0p5, xeno_age_prop1, xeno_age_prop1p5, xeno_age_prop2

    const propStr = userInputs.xeno_proportion.toString().replace('.', 'p');
    const configName = `xeno_age_prop${propStr}`;

    // Debug logging
    if (import.meta.env.DEV) {
      console.log('═══════════════════════════════════════════════════════════');
      console.log('[Config Finder] 🔍 AGE-STRATIFIED CONFIG LOOKUP');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('User Inputs:');
      console.log('  - xeno_proportion:', userInputs.xeno_proportion);
      console.log('  - Mapped to config:', configName);
      console.log('═══════════════════════════════════════════════════════════');
    }

    // Check if config exists
    if (experimentConfigs.name_to_config[configName]) {
      if (import.meta.env.DEV) {
        console.log('[Config Finder] ✅ FOUND:', configName);
      }
      return configName;
    }

    // No match found
    if (import.meta.env.DEV) {
      console.warn('[Config Finder] ❌ Config not found:', configName);
      console.warn('Available configs:', Object.keys(experimentConfigs.name_to_config));
    }

    return null;
  } catch (error) {
    console.error('Error finding config name:', error);
    return null;
  }
}


// Load visualization data from Supabase Storage (age-stratified version)
export async function loadVisualizationData(configName: string) {
  try {
    const vizUrl = `${SUPABASE_STORAGE_URL}/viz_data_age/${configName}.json`;
    console.log('[Config Finder] Loading viz data from:', vizUrl);
    const response = await fetch(vizUrl);
    if (!response.ok) {
      throw new Error(`Failed to load visualization data for ${configName} from Supabase Storage`);
    }
    const data = await response.json();
    console.log('[Config Finder] ✓ Successfully loaded viz data:', configName, 'Series count:', data.waitlist_sizes?.series?.length);
    return data;
  } catch (error) {
    console.error('Error loading visualization data:', error);
    throw error;
  }
}

