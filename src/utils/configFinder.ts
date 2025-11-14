// Base rates for each CPRA threshold
const BASE_RATES = {
  85: {
    base_relisting: 0.00015338345481403357,
    base_death_tx: 0.0001128364690248253,
    low_key: '0-85',
    high_key: '85-100'
  },
  99: {
    base_relisting: 0.0002291157296188794,
    base_death_tx: 0.00010857952771783283,
    low_key: '0-99',
    high_key: '99-100'
  }
};

interface UserInputs {
  xeno_proportion: number;
  xenoGraftFailureRate: number; // multiplier (0, 0.5, 1, 1.5, 2)
  postTransplantDeathRate: number; // multiplier (0, 0.5, 1, 1.5, 2)
  highCPRAThreshold: number; // 85 or 99
}

interface ExperimentConfigs {
  name_to_config: Record<string, any>;
}

// Calculate actual rates from multipliers
function calculateActualRates(
  cpraThreshold: number,
  relistingMultiplier: number,
  deathTxMultiplier: number
) {
  const baseRates = BASE_RATES[cpraThreshold as keyof typeof BASE_RATES];
  if (!baseRates) {
    throw new Error(`Invalid CPRA threshold: ${cpraThreshold}. Must be 85 or 99.`);
  }
  
  return {
    relisting_xeno: baseRates.base_relisting * relistingMultiplier,
    death_with_tx_xeno: baseRates.base_death_tx * deathTxMultiplier,
    low_key: baseRates.low_key,
    high_key: baseRates.high_key
  };
}

// Floating-point comparison with tolerance
function areEqual(a: number, b: number, tolerance: number = 1e-10): boolean {
  return Math.abs(a - b) < tolerance;
}

// Find config name from user inputs by searching parameter values
export async function findConfigName(userInputs: UserInputs): Promise<string | null> {
  try {
    // Load experiment_configs.json
    const response = await fetch('/experiment_configs.json');
    if (!response.ok) {
      throw new Error('Failed to load experiment_configs.json');
    }
    const experimentConfigs: ExperimentConfigs = await response.json();
    
    // Calculate actual rates from multipliers
    const actualRates = calculateActualRates(
      userInputs.highCPRAThreshold,
      userInputs.xenoGraftFailureRate,
      userInputs.postTransplantDeathRate
    );
    
    // Search through all configs
    for (const [configName, config] of Object.entries(experimentConfigs.name_to_config)) {
      // Match xeno_proportion (exact match)
      if (config.xeno_proportion !== userInputs.xeno_proportion) continue;
      
      // Match low_key and high_key (determines CPRA threshold)
      if (config.low_key !== actualRates.low_key || config.high_key !== actualRates.high_key) continue;
      
      // Match relisting_xeno (floating-point comparison with tolerance)
      if (!areEqual(config.xeno_rates_base?.relisting_xeno || 0, actualRates.relisting_xeno)) continue;
      
      // Match death_with_tx_xeno (floating-point comparison with tolerance)
      if (!areEqual(config.xeno_rates_base?.['death with tx_xeno'] || 0, actualRates.death_with_tx_xeno)) continue;
      
      // Match T (should always be 3650)
      if (config.T !== 3650) continue;
      
      // Found a match!
      return configName;
    }
    
    // No match found
    console.warn(
      `Configuration not found for: CPRA=${userInputs.highCPRAThreshold}, ` +
      `proportion=${userInputs.xeno_proportion}, ` +
      `relisting=${userInputs.xenoGraftFailureRate}, ` +
      `death=${userInputs.postTransplantDeathRate}`
    );
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

