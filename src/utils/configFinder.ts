// Fixed parameters that are the same for all configurations
const FIXED_PARAMS = {
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

// High CPRA rates for calculations
const HIGH_CPRA_RELISTING = 0.00015338345481403357;
const HIGH_CPRA_DEATH_WITH_TX = 0.0001128364690248253;

interface UserInputs {
  xeno_proportion: number;
  xenoGraftFailureRate: number; // multiplier (0, 0.5, 1, 1.5, 2)
  postTransplantDeathRate: number; // multiplier (0, 0.5, 1, 1.5, 2)
}

interface ExperimentConfigs {
  name_to_config: Record<string, any>;
}

// Build config object from user inputs
export function buildConfig(userInputs: UserInputs) {
  // If xeno_proportion is 0, use base case (both xeno rates are 0)
  // This matches the base_case_85 configuration
  const isBaseCase = userInputs.xeno_proportion === 0;
  
  const relisting_xeno = isBaseCase 
    ? 0 
    : HIGH_CPRA_RELISTING * userInputs.xenoGraftFailureRate;
  const death_with_tx_xeno = isBaseCase 
    ? 0 
    : HIGH_CPRA_DEATH_WITH_TX * userInputs.postTransplantDeathRate;
  
  return {
    rates_cpra: FIXED_PARAMS.rates_cpra,
    xeno_rates_base: {
      relisting_xeno,
      'death with tx_xeno': death_with_tx_xeno
    },
    xeno_proportion: userInputs.xeno_proportion,
    low_key: FIXED_PARAMS.low_key,
    high_key: FIXED_PARAMS.high_key,
    T: FIXED_PARAMS.T
  };
}

// Deep equality check for config objects
function configsEqual(config1: any, config2: any): boolean {
  if (config1 === config2) return true;
  if (config1 == null || config2 == null) return false;
  if (typeof config1 !== 'object' || typeof config2 !== 'object') return false;
  
  const keys1 = Object.keys(config1).sort();
  const keys2 = Object.keys(config2).sort();
  
  if (keys1.length !== keys2.length) return false;
  
  for (let i = 0; i < keys1.length; i++) {
    if (keys1[i] !== keys2[i]) return false;
    const val1 = config1[keys1[i]];
    const val2 = config2[keys1[i]];
    
    if (typeof val1 === 'number' && typeof val2 === 'number') {
      // Compare numbers with small epsilon for floating point
      if (Math.abs(val1 - val2) > 1e-10) return false;
    } else if (typeof val1 === 'object' && typeof val2 === 'object') {
      if (!configsEqual(val1, val2)) return false;
    } else if (val1 !== val2) {
      return false;
    }
  }
  
  return true;
}

// Find config name from user inputs
export async function findConfigName(userInputs: UserInputs): Promise<string | null> {
  try {
    // Load experiment_configs.json
    const response = await fetch('/experiment_configs.json');
    if (!response.ok) {
      throw new Error('Failed to load experiment_configs.json');
    }
    const experimentConfigs: ExperimentConfigs = await response.json();
    
    // Build config from user inputs
    const userConfig = buildConfig(userInputs);
    
    // Find matching config by comparing directly
    for (const [name, config] of Object.entries(experimentConfigs.name_to_config)) {
      if (configsEqual(userConfig, config)) {
        return name;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error finding config name:', error);
    return null;
  }
}

// Load visualization data
export async function loadVisualizationData(configName: string) {
  try {
    const response = await fetch(`/viz_data/${configName}.json`);
    if (!response.ok) {
      throw new Error(`Failed to load visualization data for ${configName}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error loading visualization data:', error);
    throw error;
  }
}

