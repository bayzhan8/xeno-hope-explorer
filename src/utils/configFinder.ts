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
  highCPRAThreshold: number; // 85 or 99
}

interface ExperimentConfigs {
  name_to_config: Record<string, any>;
}



// Supabase Storage base URL
const SUPABASE_STORAGE_URL = 'https://bkgpfnhbmkxzwtixiwnh.supabase.co/storage/v1/object/public/viz-data';

// Find config name from user inputs
// According to documentation: Match on MULTIPLIERS directly, not calculated rates
export async function findConfigName(userInputs: UserInputs): Promise<string | null> {
  try {
    // Load experiment_configs.json from Supabase Storage
    const response = await fetch(`${SUPABASE_STORAGE_URL}/experiment_configs.json`);
    if (!response.ok) {
      throw new Error('Failed to load experiment_configs.json from Supabase Storage');
    }
    const experimentConfigs: ExperimentConfigs = await response.json();
    
    // Determine keys based on CPRA threshold
    const lowKey = userInputs.highCPRAThreshold === 99 ? '0-99' : '0-85';
    const highKey = userInputs.highCPRAThreshold === 99 ? '99-100' : '85-100';
    
    // Special rule: If xeno_proportion is 0, always search for multipliers = 0
    // (base case - no xenotransplantation, so rates don't matter)
    const effectiveRelistingMultiplier = userInputs.xeno_proportion === 0 ? 0 : userInputs.xenoGraftFailureRate;
    const effectiveDeathMultiplier = userInputs.xeno_proportion === 0 ? 0 : userInputs.postTransplantDeathRate;
    
    // Debug: Log what we're searching for
    if (import.meta.env.DEV) {
      console.log('═══════════════════════════════════════════════════════════');
      console.log('[Config Finder] 🔍 SEARCHING FOR CONFIG');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('User Inputs:');
      console.log('  - xeno_proportion:', userInputs.xeno_proportion);
      console.log('  - relisting_xeno_multiplier (xenoGraftFailureRate):', userInputs.xenoGraftFailureRate);
      console.log('  - death with tx_xeno_multiplier (postTransplantDeathRate):', userInputs.postTransplantDeathRate);
      console.log('  - highCPRAThreshold:', userInputs.highCPRAThreshold);
      if (userInputs.xeno_proportion === 0) {
        console.log('');
        console.log('⚠️  SPECIAL RULE: xeno_proportion = 0');
        console.log('   → Overriding multipliers to 0 (base case)');
      }
      console.log('');
      console.log('Effective Search Values:');
      console.log('  - xeno_proportion:', userInputs.xeno_proportion);
      console.log('  - relisting_xeno_multiplier:', effectiveRelistingMultiplier);
      console.log('  - death with tx_xeno_multiplier:', effectiveDeathMultiplier);
      console.log('');
      console.log('Expected Keys:');
      console.log('  - low_key:', lowKey);
      console.log('  - high_key:', highKey);
      console.log('');
      console.log('Matching Strategy: Direct multiplier matching');
      console.log('═══════════════════════════════════════════════════════════');
    }
    
    // Search through all configurations - match on multipliers directly
    // The JSON already stores multipliers, so we just match them directly - NO CALCULATIONS!
    let checkedCount = 0;
    
    for (const [name, config] of Object.entries(experimentConfigs.name_to_config)) {
      checkedCount++;
      
      // Simple direct matching on multipliers - that's it!
      if (
        config.xeno_proportion === userInputs.xeno_proportion &&
        config.xeno_rates_base?.relisting_xeno_multiplier === effectiveRelistingMultiplier &&
        config.xeno_rates_base?.['death with tx_xeno_multiplier'] === effectiveDeathMultiplier &&
        config.low_key === lowKey &&
        config.high_key === highKey
      ) {
        if (import.meta.env.DEV) {
          console.log('═══════════════════════════════════════════════════════════');
          console.log('[Config Finder] ✅ FOUND MATCH:', name);
          console.log('═══════════════════════════════════════════════════════════');
        }
        return name;
      }
    }
    
    // No match found - log detailed debugging info
    if (import.meta.env.DEV) {
      console.warn('═══════════════════════════════════════════════════════════');
      console.warn('[Config Finder] ❌ NO MATCH FOUND');
      console.warn('═══════════════════════════════════════════════════════════');
      console.warn('Search Summary:');
      console.warn('  - Total configs checked:', checkedCount);
      console.warn('');
      console.warn('What we searched for:');
      console.warn('  - xeno_proportion:', userInputs.xeno_proportion);
      if (userInputs.xeno_proportion === 0) {
        console.warn('  - relisting_xeno_multiplier:', effectiveRelistingMultiplier, '(overridden to 0 for base case)');
        console.warn('  - death with tx_xeno_multiplier:', effectiveDeathMultiplier, '(overridden to 0 for base case)');
      } else {
        console.warn('  - relisting_xeno_multiplier:', effectiveRelistingMultiplier);
        console.warn('  - death with tx_xeno_multiplier:', effectiveDeathMultiplier);
      }
      console.warn('  - low_key:', lowKey);
      console.warn('  - high_key:', highKey);
      console.warn('');
      
      // Find configs with matching proportion and CPRA threshold
      const matchingProportionConfigs = Object.entries(experimentConfigs.name_to_config)
        .filter(([name, config]) => {
          const hasCorrectCPRA = config.low_key === lowKey && config.high_key === highKey;
          const hasMatchingProportion = config.xeno_proportion === userInputs.xeno_proportion;
          return hasCorrectCPRA && hasMatchingProportion;
        })
        .slice(0, 10);
      
      if (matchingProportionConfigs.length > 0) {
        console.warn(`Found ${matchingProportionConfigs.length} config(s) with matching proportion (${userInputs.xeno_proportion}) and CPRA threshold:`);
        matchingProportionConfigs.forEach(([name, config]) => {
          console.warn(`  📋 ${name}:`);
          console.warn('     relisting_xeno_multiplier:', config.xeno_rates_base?.relisting_xeno_multiplier, 
            config.xeno_rates_base?.relisting_xeno_multiplier === effectiveRelistingMultiplier ? '✅ MATCH' : '❌');
          console.warn('     death with tx_xeno_multiplier:', config.xeno_rates_base?.['death with tx_xeno_multiplier'],
            config.xeno_rates_base?.['death with tx_xeno_multiplier'] === effectiveDeathMultiplier ? '✅ MATCH' : '❌');
        });
      } else {
        console.warn('❌ No configs found with matching proportion and CPRA threshold!');
        console.warn('   This suggests the config may not exist in the database.');
      }
      
      console.warn('═══════════════════════════════════════════════════════════');
    }
    
    return null;
  } catch (error) {
    console.error('Error finding config name:', error);
    return null;
  }
}


// Load visualization data from Supabase Storage
export async function loadVisualizationData(configName: string) {
  try {
    const response = await fetch(`${SUPABASE_STORAGE_URL}/viz_data/${configName}.json`);
    if (!response.ok) {
      throw new Error(`Failed to load visualization data for ${configName} from Supabase Storage`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error loading visualization data:', error);
    throw error;
  }
}

