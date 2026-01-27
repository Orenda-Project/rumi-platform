/**
 * Uplift AI API Health Service
 * Monitors Uplift TTS usage via local tracking
 * (No public API documentation - tracks locally)
 */

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

let cache = {
  data: null,
  timestamp: null
};

/**
 * Get Uplift AI health data from local tracking
 * @param {Object} db - Supabase client instance
 */
async function getUpliftHealth(db) {
  // Check cache
  if (cache.data && cache.timestamp && (Date.now() - cache.timestamp < CACHE_DURATION)) {
    return cache.data;
  }

  if (!db) {
    return {
      service: 'Uplift AI',
      status: 'error',
      usage: { current: 0, limit: 'unknown', unit: 'characters', percentage: 0 },
      cost: { current: 0, projected: 0, currency: 'USD' },
      details: { error: 'Database connection not available' },
      lastUpdated: new Date().toISOString(),
      isEstimated: true,
      externalLink: 'https://uplift.ai'
    };
  }

  try {
    // Query local tracking table for Uplift usage this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data: usageData, error } = await db
      .from('api_usage_log')
      .select('units_consumed, estimated_cost')
      .eq('service', 'uplift')
      .gte('created_at', startOfMonth.toISOString());

    if (error) {
      throw error;
    }

    // Calculate total characters
    let totalChars = 0;

    if (usageData && usageData.length > 0) {
      totalChars = usageData.reduce((sum, record) => sum + (record.units_consumed || 0), 0);
    }

    // Assuming a character limit (placeholder - adjust based on actual plan)
    const characterLimit = 100000; // 100K characters per month estimate
    const percentage = (totalChars / characterLimit) * 100;

    let status = 'healthy';
    if (percentage >= 90) status = 'critical';
    else if (percentage >= 75) status = 'warning';

    const result = {
      service: 'Uplift AI',
      status,
      usage: {
        current: Math.round(totalChars),
        limit: characterLimit,
        unit: 'characters',
        percentage: Math.min(percentage, 100)
      },
      cost: {
        current: 0, // Unknown pricing
        projected: 0,
        currency: 'USD'
      },
      details: {
        totalCharacters: Math.round(totalChars),
        callsThisMonth: usageData?.length || 0,
        trackingMethod: 'Local database tracking',
        note: 'No public API documentation found. Contact Uplift support for actual usage and pricing.',
        warning: 'Character limit is estimated - verify with Uplift AI dashboard'
      },
      isEstimated: true,
      lastUpdated: new Date().toISOString(),
      externalLink: 'https://uplift.ai'
    };

    // Update cache
    cache = {
      data: result,
      timestamp: Date.now()
    };

    return result;
  } catch (error) {
    console.error('Uplift local tracking error:', error.message);

    return {
      service: 'Uplift AI',
      status: 'error',
      usage: { current: 0, limit: 'unknown', unit: 'characters', percentage: 0 },
      cost: { current: 0, projected: 0, currency: 'USD' },
      details: {
        error: error.message,
        note: 'Check database table: api_usage_log'
      },
      isEstimated: true,
      lastUpdated: new Date().toISOString(),
      externalLink: 'https://uplift.ai'
    };
  }
}

/**
 * Log an Uplift AI TTS call
 * Call this from your TTS service
 * @param {Object} db - Supabase client instance
 * @param {number} characterCount - Number of characters in TTS request
 */
async function logUpliftUsage(db, characterCount) {
  try {
    const { error } = await db
      .from('api_usage_log')
      .insert({
        service: 'uplift',
        operation_type: 'tts',
        units_consumed: characterCount,
        estimated_cost: 0 // Unknown pricing
      });

    if (error) {
      console.error('Failed to log Uplift usage:', error);
    }
  } catch (err) {
    console.error('Error logging Uplift usage:', err);
  }
}

module.exports = {
  getUpliftHealth,
  logUpliftUsage
};
