// Transform JSON visualization data to format expected by SimulationCharts

interface VizData {
  config_name: string;
  waitlist_sizes?: {
    x: number[];
    series: Array<{ label: string; y: number[]; color?: string; linestyle?: string }>;
  };
  recipients?: {
    x: number[];
    series: Array<{ label: string; y: number[]; color?: string }>;
  };
  cumulative_deaths?: {
    x: number[];
    series: Array<{ label: string; y: number[]; color?: string; linestyle?: string }>;
  };
  deaths_per_day?: {
    x: number[];
    series: Array<{ label: string; y: number[]; color?: string }>;
  };
  deaths_per_year?: {
    year_labels: string[];
    series: Array<{ label: string; values: number[]; color?: string }>;
  };
  net_deaths_prevented?: {
    year_labels: string[];
    series: Array<{ label: string; values: number[]; color?: string }>;
    total_net_deaths_prevented?: number;
    average_net_deaths_prevented?: number;
  };
  has_comparison?: boolean;
  highCPRAThreshold: number;
}

interface SimulationData {
  waitlistData: Array<{ year: number; total: number; lowCPRA: number; highCPRA: number }>;
  waitlistDeathsData: Array<{ year: number; waitlistDeaths: number }>;
  postTransplantDeathsData: Array<{ year: number; xenoPostTransplantDeaths: number; humanPostTransplantDeaths: number }>;
  netDeathsPreventedData: Array<{ year: number; netDeathsPrevented: number }>;
  graftFailuresData: Array<{ year: number; xenoGraftFailures: number; humanGraftFailures: number }>;
  transplantsData: Array<{ year: number; human: number; xeno: number }>;
  penetrationData: Array<{ year: number; proportion: number }>;
  waitingTimeData: Array<{ year: number; averageWaitingTime: number }>;
  recipientsData: Array<{ year: number; lowHuman: number; highHuman: number; highXeno: number }>;
  cumulativeDeathsData: Array<{ year: number; lowWaitlist: number; highWaitlist: number; lowPostTx: number; highPostTx: number; total: number }>;
  deathsPerYearData: Array<{ year: number; low: number; high: number; total: number }>;
  deathsPerDayData: Array<{ year: number; low: number; high: number; total: number }>;
  netDeathsPreventedPerYearData: Array<{ year: number; low: number; high: number; total: number }>;
}

// Convert days to years (assuming 365 days per year)
function daysToYears(days: number): number {
  return days / 365;
}

// Sample data at regular intervals to reduce size
function sampleData<T>(array: T[], targetPoints: number): T[] {
  if (array.length <= targetPoints) return array;
  const step = array.length / targetPoints;
  const sampled: T[] = [];
  for (let i = 0; i < array.length; i += step) {
    sampled.push(array[Math.floor(i)]);
  }
  // Always include the last point
  if (sampled[sampled.length - 1] !== array[array.length - 1]) {
    sampled.push(array[array.length - 1]);
  }
  return sampled;
}

// Convert days array to years array, sampling appropriately
function convertTimeAxis(daysArray: number[], targetResolution: 'yearly' | 'monthly' = 'monthly'): number[] {
  if (targetResolution === 'yearly') {
    // Extract yearly points (every 365 days)
    const yearly: number[] = [];
    let lastYear = -1;
    for (let i = 0; i < daysArray.length; i++) {
      const years = daysToYears(daysArray[i]);
      const currentYear = Math.floor(years);
      if (currentYear > lastYear) {
        yearly.push(years);
        lastYear = currentYear;
      }
    }
    return yearly;
  }
  // For monthly, sample to approximately 120 points per 10 years (monthly-ish)
  const maxDays = Math.max(...daysArray);
  const maxYears = daysToYears(maxDays);
  const targetMonthlyPoints = Math.ceil(maxYears * 12); // 12 points per year
  const sampledDays = sampleData(daysArray, targetMonthlyPoints);
  return sampledDays.map(daysToYears);
}

// Find series by label pattern (case-insensitive)
function findSeries(series: Array<{ label: string; y: number[] }>, patterns: string[]): number[] | null {
  for (const pattern of patterns) {
    const found = series.find(s => 
      s.label.toLowerCase().includes(pattern.toLowerCase())
    );
    if (found) return found.y;
  }
  return null;
}

export function transformVizDataToSimulationData(vizData: VizData): SimulationData {
  const result: SimulationData = {
    waitlistData: [],
    waitlistDeathsData: [],
    postTransplantDeathsData: [],
    netDeathsPreventedData: [],
    graftFailuresData: [],
    transplantsData: [],
    penetrationData: [],
    waitingTimeData: [],
    recipientsData: [],
    cumulativeDeathsData: [],
    deathsPerYearData: [],
    deathsPerDayData: [],
    netDeathsPreventedPerYearData: [],
  };

  // 1. Waitlist sizes
  if (vizData.waitlist_sizes) {
    const lowSeries = findSeries(vizData.waitlist_sizes.series, ['low cpra waitlist']);
    const highSeries = findSeries(vizData.waitlist_sizes.series, ['high cpra waitlist']);
    const totalSeries = findSeries(vizData.waitlist_sizes.series, ['total waitlist']);
    
    // Sample data to monthly resolution
    const maxDays = Math.max(...vizData.waitlist_sizes.x);
    const maxYears = daysToYears(maxDays);
    const targetPoints = Math.ceil(maxYears * 12); // Monthly sampling
    const sampledDays = sampleData(vizData.waitlist_sizes.x, targetPoints);
    const sampledLow = lowSeries ? sampleData(lowSeries, targetPoints) : [];
    const sampledHigh = highSeries ? sampleData(highSeries, targetPoints) : [];
    const sampledTotal = totalSeries ? sampleData(totalSeries, targetPoints) : [];
    const years = sampledDays.map(daysToYears);
    
    for (let i = 0; i < years.length; i++) {
      const low = sampledLow[i] || 0;
      const high = sampledHigh[i] || 0;
      const total = sampledTotal[i] || (low + high);
      
      result.waitlistData.push({
        year: Math.round(years[i] * 100) / 100,
        total,
        lowCPRA: low,
        highCPRA: high,
      });
    }
  }

  // 2. Recipients
  if (vizData.recipients) {
    const lowHuman = findSeries(vizData.recipients.series, ['low cpra recipients']);
    const highHuman = findSeries(vizData.recipients.series, ['high cpra standard recipients']);
    const highXeno = findSeries(vizData.recipients.series, ['high cpra xeno recipients']);
    
    // Sample to monthly resolution
    const maxDays = Math.max(...vizData.recipients.x);
    const maxYears = daysToYears(maxDays);
    const targetPoints = Math.ceil(maxYears * 12);
    const sampledDays = sampleData(vizData.recipients.x, targetPoints);
    const sampledLowHuman = lowHuman ? sampleData(lowHuman, targetPoints) : [];
    const sampledHighHuman = highHuman ? sampleData(highHuman, targetPoints) : [];
    const sampledHighXeno = highXeno ? sampleData(highXeno, targetPoints) : [];
    const years = sampledDays.map(daysToYears);
    
    for (let i = 0; i < years.length; i++) {
      result.recipientsData.push({
        year: Math.round(years[i] * 100) / 100,
        lowHuman: sampledLowHuman[i] || 0,
        highHuman: sampledHighHuman[i] || 0,
        highXeno: sampledHighXeno[i] || 0,
      });
    }
  }

  // 3. Cumulative deaths
  if (vizData.cumulative_deaths) {
    const lowWaitlist = findSeries(vizData.cumulative_deaths.series, ['low cpra waitlist deaths']);
    const highWaitlist = findSeries(vizData.cumulative_deaths.series, ['high cpra waitlist deaths']);
    const lowPostTx = findSeries(vizData.cumulative_deaths.series, ['low cpra post-tx deaths', 'low cpra post tx deaths']);
    const highPostTx = findSeries(vizData.cumulative_deaths.series, ['high cpra post-tx deaths', 'high cpra post tx deaths']);
    const total = findSeries(vizData.cumulative_deaths.series, ['total deaths']);
    
    // Sample to monthly resolution
    const maxDays = Math.max(...vizData.cumulative_deaths.x);
    const maxYears = daysToYears(maxDays);
    const targetPoints = Math.ceil(maxYears * 12);
    const sampledDays = sampleData(vizData.cumulative_deaths.x, targetPoints);
    const sampledLowWl = lowWaitlist ? sampleData(lowWaitlist, targetPoints) : [];
    const sampledHighWl = highWaitlist ? sampleData(highWaitlist, targetPoints) : [];
    const sampledLowPt = lowPostTx ? sampleData(lowPostTx, targetPoints) : [];
    const sampledHighPt = highPostTx ? sampleData(highPostTx, targetPoints) : [];
    const sampledTotal = total ? sampleData(total, targetPoints) : [];
    const years = sampledDays.map(daysToYears);
    
    for (let i = 0; i < years.length; i++) {
      const lowWl = sampledLowWl[i] || 0;
      const highWl = sampledHighWl[i] || 0;
      const lowPt = sampledLowPt[i] || 0;
      const highPt = sampledHighPt[i] || 0;
      const tot = sampledTotal[i] || (lowWl + highWl + lowPt + highPt);
      
      result.cumulativeDeathsData.push({
        year: Math.round(years[i] * 100) / 100,
        lowWaitlist: lowWl,
        highWaitlist: highWl,
        lowPostTx: lowPt,
        highPostTx: highPt,
        total: tot,
      });
    }
  }

  // 4. Deaths per day
  if (vizData.deaths_per_day) {
    const lowSeries = findSeries(vizData.deaths_per_day.series, ['low cpra deaths/day', 'low cpra deaths']);
    const highSeries = findSeries(vizData.deaths_per_day.series, ['high cpra deaths/day', 'high cpra deaths']);
    const totalSeries = findSeries(vizData.deaths_per_day.series, ['total deaths/day', 'total deaths']);
    
    // Sample to monthly resolution
    const maxDays = Math.max(...vizData.deaths_per_day.x);
    const maxYears = daysToYears(maxDays);
    const targetPoints = Math.ceil(maxYears * 12);
    const sampledDays = sampleData(vizData.deaths_per_day.x, targetPoints);
    const sampledLow = lowSeries ? sampleData(lowSeries, targetPoints) : [];
    const sampledHigh = highSeries ? sampleData(highSeries, targetPoints) : [];
    const sampledTotal = totalSeries ? sampleData(totalSeries, targetPoints) : [];
    const years = sampledDays.map(daysToYears);
    
    for (let i = 0; i < years.length; i++) {
      const low = sampledLow[i] || 0;
      const high = sampledHigh[i] || 0;
      const total = sampledTotal[i] || (low + high);
      
      result.deathsPerDayData.push({
        year: Math.round(years[i] * 100) / 100,
        low,
        high,
        total,
      });
    }
  }

  // 5. Deaths per year
  if (vizData.deaths_per_year) {
    const { year_labels, series } = vizData.deaths_per_year;
    const lowSeries = series.find(s => s.label.toLowerCase().includes('low cpra deaths'));
    const highSeries = series.find(s => s.label.toLowerCase().includes('high cpra deaths'));
    const totalSeries = series.find(s => s.label.toLowerCase().includes('total deaths'));
    
    for (let i = 0; i < year_labels.length; i++) {
      const year = parseInt(year_labels[i].replace('Y', '')) || i + 1;
      result.deathsPerYearData.push({
        year,
        low: lowSeries ? lowSeries.values[i] || 0 : 0,
        high: highSeries ? highSeries.values[i] || 0 : 0,
        total: totalSeries ? totalSeries.values[i] || 0 : 0,
      });
    }
  }

  // 6. Net deaths prevented per year
  if (vizData.net_deaths_prevented && vizData.has_comparison) {
    const { year_labels, series } = vizData.net_deaths_prevented;
    const lowSeries = series.find(s => s.label.toLowerCase().includes('low cpra net deaths prevented'));
    const highSeries = series.find(s => s.label.toLowerCase().includes('high cpra net deaths prevented'));
    const totalSeries = series.find(s => s.label.toLowerCase().includes('total net deaths prevented'));
    
    for (let i = 0; i < year_labels.length; i++) {
      const year = parseInt(year_labels[i].replace('Y', '')) || i + 1;
      result.netDeathsPreventedPerYearData.push({
        year,
        low: lowSeries ? lowSeries.values[i] || 0 : 0,
        high: highSeries ? highSeries.values[i] || 0 : 0,
        total: totalSeries ? totalSeries.values[i] || 0 : 0,
      });
    }
  }

  // Fill in other required fields with empty/default data
  // These might not be directly available in the JSON
  const maxYear = Math.max(
    ...result.waitlistData.map(d => d.year),
    ...result.recipientsData.map(d => d.year),
    ...result.cumulativeDeathsData.map(d => d.year),
    10
  );

  for (let year = 0; year <= maxYear; year++) {
    // Waitlist deaths (extract from cumulative if needed)
    if (!result.waitlistDeathsData.find(d => d.year === year)) {
      const cumData = result.cumulativeDeathsData.find(d => d.year === year);
      result.waitlistDeathsData.push({
        year,
        waitlistDeaths: cumData ? cumData.lowWaitlist + cumData.highWaitlist : 0,
      });
    }

    // Post-transplant deaths
    if (!result.postTransplantDeathsData.find(d => d.year === year)) {
      const cumData = result.cumulativeDeathsData.find(d => d.year === year);
      result.postTransplantDeathsData.push({
        year,
        xenoPostTransplantDeaths: 0, // Will need to extract from data if available
        humanPostTransplantDeaths: cumData ? cumData.lowPostTx + cumData.highPostTx : 0,
      });
    }

    // Net deaths prevented
    if (!result.netDeathsPreventedData.find(d => d.year === year)) {
      const netData = result.netDeathsPreventedPerYearData.find(d => d.year === year);
      result.netDeathsPreventedData.push({
        year,
        netDeathsPrevented: netData ? netData.total : 0,
      });
    }

    // Graft failures (not directly in JSON, set to 0)
    if (!result.graftFailuresData.find(d => d.year === year)) {
      result.graftFailuresData.push({
        year,
        xenoGraftFailures: 0,
        humanGraftFailures: 0,
      });
    }

    // Transplants (derive from recipients)
    if (!result.transplantsData.find(d => d.year === year)) {
      const recipients = result.recipientsData.find(d => d.year === year);
      const prevRecipients = result.recipientsData.find(d => d.year === year - 1);
      if (recipients && prevRecipients) {
        result.transplantsData.push({
          year,
          human: (recipients.lowHuman + recipients.highHuman) - (prevRecipients.lowHuman + prevRecipients.highHuman),
          xeno: recipients.highXeno - prevRecipients.highXeno,
        });
      } else {
        result.transplantsData.push({ year, human: 0, xeno: 0 });
      }
    }

    // Penetration rate
    if (!result.penetrationData.find(d => d.year === year)) {
      result.penetrationData.push({ year, proportion: 0 });
    }

    // Waiting time
    if (!result.waitingTimeData.find(d => d.year === year)) {
      result.waitingTimeData.push({ year, averageWaitingTime: 0 });
    }
  }

  return result;
}

// Calculate summary metrics from transformed data
export function calculateSummaryMetrics(data: SimulationData, horizon: number) {
  // Find data points within the horizon
  const relevantData = data.waitlistData.filter(d => d.year <= horizon);
  if (relevantData.length === 0) {
    return {
      waitlistReduction: 0,
      deathsPrevented: 0,
      totalTransplants: 0,
      xenoTransplants: 0,
      penetrationRate: 0,
    };
  }

  const initialWaitlist = relevantData[0]?.total || 0;
  const finalWaitlist = relevantData[relevantData.length - 1]?.total || 0;
  
  // Sum net deaths prevented up to horizon
  const totalDeathsPrevented = data.netDeathsPreventedPerYearData
    .filter(d => d.year <= horizon)
    .reduce((sum, d) => sum + d.total, 0);
  
  // Sum transplants up to horizon
  const totalTransplants = data.transplantsData
    .filter(d => d.year <= horizon)
    .reduce((sum, d) => sum + d.human + d.xeno, 0);
  
  const xenoTransplants = data.transplantsData
    .filter(d => d.year <= horizon)
    .reduce((sum, d) => sum + d.xeno, 0);
  
  // Calculate penetration rate (proportion of high CPRA patients who received xeno)
  const finalRecipients = data.recipientsData
    .filter(d => d.year <= horizon)
    .slice(-1)[0];
  const highCPRATotal = (finalRecipients?.highHuman || 0) + (finalRecipients?.highXeno || 0);
  const penetrationRate = highCPRATotal > 0 
    ? (finalRecipients?.highXeno || 0) / highCPRATotal 
    : 0;

  return {
    waitlistReduction: Math.max(0, initialWaitlist - finalWaitlist),
    deathsPrevented: totalDeathsPrevented,
    totalTransplants,
    xenoTransplants,
    penetrationRate,
  };
}

