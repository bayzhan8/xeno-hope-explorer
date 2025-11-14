import os
import json
import hashlib
import uuid
import pickle


def manage_experiment_config(rates_cpra, xeno_rates_base, xeno_proportion, 
                           low_key="0-85", high_key="85-100", T=365*10, 
                           name=None, config_file="experiment_configs.json", overwrite=False):
    """
    Manage experiment configurations with bidirectional name-config mapping.
    
    Parameters:
    -----------
    rates_cpra : dict
        cPRA rates configuration
    xeno_rates_base : dict
        Xenotransplant rates configuration
    xeno_proportion : float
        Proportion of high cPRA recipients receiving xenotransplants
    low_key : str
        Key for low cPRA group (default: "0-85")
    high_key : str
        Key for high cPRA group (default: "85-100")
    T : int
        Time horizon in days (default: 365*10)
    name : str, optional
        Name for this configuration. If None, generates a random name.
    config_file : str
        Path to JSON file storing configurations (default: "experiment_configs.json")
    overwrite : bool
        If True, allow overwriting existing name with new configuration (default: False)
    
    Returns:
    --------
    str
        The name assigned to this configuration
    
    The function creates/updates a JSON file with bidirectional mapping:
    - name_to_config: maps names to full configurations
    - config_to_name: maps configuration hashes to names
    """
    
    # Create the configuration dictionary
    config = {
        'rates_cpra': rates_cpra,
        'xeno_rates_base': xeno_rates_base,
        'xeno_proportion': xeno_proportion,
        'low_key': low_key,
        'high_key': high_key,
        'T': T
    }
    
    # Generate a hash for the configuration to enable reverse lookup
    config_str = json.dumps(config, sort_keys=True)
    config_hash = hashlib.md5(config_str.encode()).hexdigest()
    
    # Load existing configurations or create new file
    if os.path.exists(config_file):
        with open(config_file, 'r') as f:
            data = json.load(f)
    else:
        data = {
            'name_to_config': {},
            'config_to_name': {}
        }
    
    # Generate name if not provided
    if name is None:
        # Generate a random name
        name = f"exp_{uuid.uuid4().hex[:8]}"
    
    # Check if this configuration already exists
    config_hash_exists = config_hash in data['config_to_name']
    name_exists = name in data['name_to_config']
    
    # Case 1: Config hash exists - check if it points to the requested name
    if config_hash_exists:
        existing_name = data['config_to_name'][config_hash]
        if existing_name == name:
            # Same config, same name - perfect match, nothing to do
            print(f"Configuration already exists with name: {name}")
            return name
        # Config exists but with different name
        if not overwrite:
            print(f"Configuration already exists with name: {existing_name}")
            return existing_name
        # overwrite=True: will update mapping below
    
    # Case 2: Name exists - check if it's the same config
    if name_exists:
        existing_config = data['name_to_config'][name]
        existing_config_str = json.dumps(existing_config, sort_keys=True)
        existing_config_hash = hashlib.md5(existing_config_str.encode()).hexdigest()
        
        if existing_config_hash == config_hash:
            # Same config, same name - already handled in Case 1, but just in case
            print(f"Configuration already exists with name: {name}")
            return name
        
        # Name exists but config is different
        if not overwrite:
            raise ValueError(f"Name '{name}' already exists. Please choose a different name or set overwrite=True.")
        
        # overwrite=True: remove old config_hash -> name mapping
        if existing_config_hash in data['config_to_name']:
            # Only remove if it points to this name (to avoid breaking other references)
            if data['config_to_name'][existing_config_hash] == name:
                del data['config_to_name'][existing_config_hash]
        print(f"Overwriting existing configuration for name '{name}'...")
    
    # Update/add the configuration mappings
    # If config_hash existed with a different name and overwrite=True, update it
    if config_hash_exists and overwrite:
        old_name = data['config_to_name'][config_hash]
        # The old name will now point to a different config (or be removed)
        # We'll update name_to_config below, which will leave old_name pointing to old config
        # This is fine - we're explicitly overwriting with the new name
    
    # Update the mappings
    data['name_to_config'][name] = config
    data['config_to_name'][config_hash] = name
    
    # Save to file
    with open(config_file, 'w') as f:
        json.dump(data, f, indent=2)
    
    if overwrite and name in data.get('name_to_config', {}):
        print(f"Configuration updated with name: {name}")
    else:
        print(f"Configuration saved with name: {name}")
    return name


def get_config_by_name(name, config_file="experiment_configs.json"):
    """
    Retrieve a configuration by its name.
    
    Parameters:
    -----------
    name : str
        Name of the configuration to retrieve
    config_file : str
        Path to JSON file storing configurations
        
    Returns:
    --------
    dict
        The configuration dictionary
    """
    if not os.path.exists(config_file):
        raise FileNotFoundError(f"Configuration file {config_file} not found.")
    
    with open(config_file, 'r') as f:
        data = json.load(f)
    
    if name not in data['name_to_config']:
        raise KeyError(f"Configuration with name '{name}' not found.")
    
    return data['name_to_config'][name]


def get_name_by_config(rates_cpra, xeno_rates_base, xeno_proportion, 
                      low_key="0-85", high_key="85-100", T=365*10,
                      config_file="experiment_configs.json"):
    """
    Get the name of a configuration if it exists.
    
    Parameters:
    -----------
    rates_cpra : dict
        cPRA rates configuration
    xeno_rates_base : dict
        Xenotransplant rates configuration
    xeno_proportion : float
        Proportion of high cPRA recipients receiving xenotransplants
    low_key : str
        Key for low cPRA group
    high_key : str
        Key for high cPRA group
    T : int
        Time horizon in days
    config_file : str
        Path to JSON file storing configurations
        
    Returns:
    --------
    str or None
        The name if configuration exists, None otherwise
    """
    config = {
        'rates_cpra': rates_cpra,
        'xeno_rates_base': xeno_rates_base,
        'xeno_proportion': xeno_proportion,
        'low_key': low_key,
        'high_key': high_key,
        'T': T
    }
    
    config_str = json.dumps(config, sort_keys=True)
    config_hash = hashlib.md5(config_str.encode()).hexdigest()
    
    if not os.path.exists(config_file):
        return None
    
    with open(config_file, 'r') as f:
        data = json.load(f)
    
    return data['config_to_name'].get(config_hash, None)


def list_all_configs(config_file="experiment_configs.json"):
    """
    List all stored configurations.
    
    Parameters:
    -----------
    config_file : str
        Path to JSON file storing configurations
        
    Returns:
    --------
    dict
        Dictionary with names as keys and configurations as values
    """
    if not os.path.exists(config_file):
        return {}
    
    with open(config_file, 'r') as f:
        data = json.load(f)
    
    return data['name_to_config']


def load_experiment_results(config_name, experiment_folder=None, base_folder="monte_carlo"):
    """
    Load all experiment results for a given configuration.
    
    Parameters:
    -----------
    config_name : str
        Name of the configuration
    experiment_folder : str, optional
        Path to experiment folder. If None, constructs from base_folder and config_name
    base_folder : str
        Base folder for Monte Carlo experiments
        
    Returns:
    --------
    list
        List of experiment outputs (tuples from run_system)
    """
    
    if experiment_folder is None:
        experiment_folder = os.path.join(base_folder, config_name)
    
    if not os.path.exists(experiment_folder):
        raise FileNotFoundError(f"Experiment folder {experiment_folder} not found.")
    
    # Load all experiment files
    experiments = []
    experiment_files = []
    
    for filename in os.listdir(experiment_folder):
        if filename.startswith(f"{config_name}_") and filename.endswith(".pkl"):
            experiment_files.append(filename)
    
    # Sort by experiment number
    experiment_files.sort(key=lambda x: int(x.split("_")[-1].split(".")[0]))
    
    for filename in experiment_files:
        filepath = os.path.join(experiment_folder, filename)
        with open(filepath, 'rb') as f:
            experiment_output = pickle.load(f)
            experiments.append(experiment_output)
    
    print(f"Loaded {len(experiments)} experiments for configuration '{config_name}'")
    return experiments


def get_experiment_summary(config_name, experiment_folder=None, base_folder="monte_carlo"):
    """
    Get summary statistics for all experiments of a configuration.
    
    Parameters:
    -----------
    config_name : str
        Name of the configuration
    experiment_folder : str, optional
        Path to experiment folder
    base_folder : str
        Base folder for Monte Carlo experiments
        
    Returns:
    --------
    dict
        Dictionary with summary statistics
    """
    
    experiments = load_experiment_results(config_name, experiment_folder, base_folder)
    
    if not experiments:
        return {}
    
    # Extract final values from each experiment
    final_values = []
    for exp in experiments:
        C_low, C_high, xeno_used, waitlist_deaths_low, waitlist_deaths_high, \
        post_tx_deaths_low, post_tx_deaths_high, total_deaths, H_low, H_high_std, H_high_xeno, times = exp
        
        final_values.append({
            'final_waitlist_low': C_low[-1],
            'final_waitlist_high': C_high[-1],
            'total_waitlist_deaths_low': waitlist_deaths_low[-1],
            'total_waitlist_deaths_high': waitlist_deaths_high[-1],
            'total_post_tx_deaths_low': post_tx_deaths_low[-1],
            'total_post_tx_deaths_high': post_tx_deaths_high[-1],
            'total_deaths': total_deaths[-1],
            'total_xeno_used': xeno_used[-1],
            'final_recipients_low': H_low[-1],
            'final_recipients_high_std': H_high_std[-1],
            'final_recipients_high_xeno': H_high_xeno[-1],
            'simulation_time': times[-1]
        })
    
    # Calculate summary statistics
    summary = {}
    for key in final_values[0].keys():
        values = [exp[key] for exp in final_values]
        summary[key] = {
            'mean': sum(values) / len(values),
            'std': (sum((x - sum(values)/len(values))**2 for x in values) / len(values))**0.5,
            'min': min(values),
            'max': max(values),
            'values': values
        }
    
    summary['num_experiments'] = len(experiments)
    
    return summary
