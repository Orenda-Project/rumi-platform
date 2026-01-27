/**
 * Gamma AI API Health Service
 * Monitors Gamma AI credits and generation limits
 */

const axios = require('axios');

const GAMMA_API_URL = 'https://api.gamma.app';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

let cache = {
  data: null,
  timestamp: null
};

/**
 * Get Gamma AI health data
 * Note: Gamma doesn't have a dedicated credits endpoint,
 * so we need to track credits from generation responses
 */
async function getGammaHealth() {
  // Check cache
  if (cache.data && cache.timestamp && (Date.now() - cache.timestamp < CACHE_DURATION)) {
    return cache.data;
  }

  const apiKey = process.env.GAMMA_API_KEY;

  if (!apiKey) {
    return {
      service: 'Gamma AI',
      status: 'error',
      usage: { current: 0, limit: 'unknown', unit: 'credits', percentage: 0 },
      cost: { current: 0, projected: 0, currency: 'USD' },
      details: { error: 'API key not configured' },
      lastUpdated: new Date().toISOString(),
      externalLink: 'https://gamma.app/settings/billing'
    };
  }

  try {
    // Try to get user info or make a lightweight request
    // Note: Gamma's API structure may vary - this is a placeholder
    // You may need to adjust based on actual Gamma API documentation

    // For now, return a placeholder with estimated data
    // In production, you would track this from actual generation calls
    const estimatedCredits = 2850; // Placeholder
    const creditLimit = 3000; // Placeholder
    const percentage = (estimatedCredits / creditLimit) * 100;

    let status = 'healthy';
    if (percentage >= 90) status = 'critical';
    else if (percentage >= 75) status = 'warning';

    const result = {
      service: 'Gamma AI',
      status,
      usage: {
        current: estimatedCredits,
        limit: creditLimit,
        unit: 'credits',
        percentage: Math.min(percentage, 100)
      },
      cost: {
        current: 0,
        projected: 0,
        currency: 'USD'
      },
      details: {
        rateLimit: '50 generations/hour/user',
        note: 'Credits are tracked from generation responses. Implement local tracking for accurate data.',
        warning: 'This is estimated data - integrate with actual Gamma API calls for real-time tracking'
      },
      isEstimated: true,
      lastUpdated: new Date().toISOString(),
      externalLink: 'https://gamma.app/settings/billing'
    };

    // Update cache
    cache = {
      data: result,
      timestamp: Date.now()
    };

    return result;
  } catch (error) {
    console.error('Gamma API error:', error.message);

    return {
      service: 'Gamma AI',
      status: 'error',
      usage: { current: 0, limit: 'unknown', unit: 'credits', percentage: 0 },
      cost: { current: 0, projected: 0, currency: 'USD' },
      details: {
        error: error.message,
        note: 'Gamma credits need to be tracked from generation responses'
      },
      isEstimated: true,
      lastUpdated: new Date().toISOString(),
      externalLink: 'https://gamma.app/settings/billing'
    };
  }
}

module.exports = {
  getGammaHealth
};
