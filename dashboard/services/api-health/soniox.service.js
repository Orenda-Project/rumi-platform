/**
 * Soniox API Health Service
 * Monitors Soniox transcription usage via local tracking
 * (No programmatic API for usage stats - tracks locally)
 */

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

let cache = {
  data: null,
  timestamp: null
};

/**
 * Get Soniox health data from local tracking
 * @param {Object} db - Supabase client instance
 */
async function getSonioxHealth(db) {
  // Check cache
  if (cache.data && cache.timestamp && (Date.now() - cache.timestamp < CACHE_DURATION)) {
    return cache.data;
  }

  if (!db) {
    return {
      service: 'Soniox',
      status: 'error',
      usage: { current: 0, limit: 'unknown', unit: 'hours', percentage: 0 },
      cost: { current: 0, projected: 0, currency: 'USD' },
      details: { error: 'Database connection not available' },
      lastUpdated: new Date().toISOString(),
      isEstimated: true,
      externalLink: 'https://console.soniox.com'
    };
  }

  try {
    // Query local tracking table for Soniox usage this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data: usageData, error } = await db
      .from('api_usage_log')
      .select('units_consumed, estimated_cost')
      .eq('service', 'soniox')
      .gte('created_at', startOfMonth.toISOString());

    if (error) {
      throw error;
    }

    // Calculate total hours and cost
    let totalHours = 0;
    let totalCost = 0;

    if (usageData && usageData.length > 0) {
      totalHours = usageData.reduce((sum, record) => sum + (record.units_consumed || 0), 0);
      totalCost = usageData.reduce((sum, record) => sum + (record.estimated_cost || 0), 0);
    }

    // Soniox pricing: $0.10 per hour
    const estimatedCost = totalHours * 0.10;

    // Assuming a monthly budget of $20 for Soniox
    const monthlyBudget = 20;
    const percentage = (estimatedCost / monthlyBudget) * 100;

    let status = 'healthy';
    if (percentage >= 90) status = 'critical';
    else if (percentage >= 75) status = 'warning';

    const result = {
      service: 'Soniox',
      status,
      usage: {
        current: totalHours.toFixed(2),
        limit: monthlyBudget / 0.10, // hours equivalent
        unit: 'hours',
        percentage: Math.min(percentage, 100)
      },
      cost: {
        current: estimatedCost.toFixed(2),
        projected: estimatedCost * 2,
        currency: 'USD'
      },
      details: {
        totalHours: totalHours.toFixed(2),
        estimatedCost: estimatedCost.toFixed(2),
        pricing: '$0.10/hour',
        callsThisMonth: usageData?.length || 0,
        trackingMethod: 'Local database tracking',
        note: 'No programmatic API - data estimated from local logs. Check console.soniox.com for actual balance.'
      },
      isEstimated: true,
      lastUpdated: new Date().toISOString(),
      externalLink: 'https://console.soniox.com'
    };

    // Update cache
    cache = {
      data: result,
      timestamp: Date.now()
    };

    return result;
  } catch (error) {
    console.error('Soniox local tracking error:', error.message);

    return {
      service: 'Soniox',
      status: 'error',
      usage: { current: 0, limit: 'unknown', unit: 'hours', percentage: 0 },
      cost: { current: 0, projected: 0, currency: 'USD' },
      details: {
        error: error.message,
        note: 'Check database table: api_usage_log'
      },
      isEstimated: true,
      lastUpdated: new Date().toISOString(),
      externalLink: 'https://console.soniox.com'
    };
  }
}

/**
 * Log a Soniox API call
 * Call this from your audio transcription service
 * @param {Object} db - Supabase client instance
 * @param {number} durationSeconds - Audio duration in seconds
 */
async function logSonioxUsage(db, durationSeconds) {
  try {
    const hours = durationSeconds / 3600;
    const cost = hours * 0.10;

    const { error } = await db
      .from('api_usage_log')
      .insert({
        service: 'soniox',
        operation_type: 'transcription',
        units_consumed: hours,
        estimated_cost: cost
      });

    if (error) {
      console.error('Failed to log Soniox usage:', error);
    }
  } catch (err) {
    console.error('Error logging Soniox usage:', err);
  }
}

module.exports = {
  getSonioxHealth,
  logSonioxUsage
};
