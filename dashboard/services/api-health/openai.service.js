/**
 * OpenAI API Health Service
 * Monitors OpenAI usage, billing, and credit grants
 */

const axios = require('axios');

const OPENAI_API_URL = 'https://api.openai.com';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

let cache = {
  data: null,
  timestamp: null
};

/**
 * Get OpenAI usage and billing data
 */
async function getOpenAIHealth() {
  // Check cache
  if (cache.data && cache.timestamp && (Date.now() - cache.timestamp < CACHE_DURATION)) {
    return cache.data;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      service: 'OpenAI',
      status: 'error',
      usage: { current: 0, limit: 'unknown', unit: 'USD', percentage: 0 },
      cost: { current: 0, projected: 0, currency: 'USD' },
      details: { error: 'API key not configured' },
      lastUpdated: new Date().toISOString(),
      externalLink: 'https://platform.openai.com/usage'
    };
  }

  try {
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    };

    // Try to get subscription info, usage, and credit grants
    let subscriptionData = null;
    let creditGrantsData = null;
    let totalUsage = 0;

    // Get subscription limits
    try {
      const subResponse = await axios.get(
        `${OPENAI_API_URL}/v1/dashboard/billing/subscription`,
        { headers }
      );
      subscriptionData = subResponse.data;
    } catch (err) {
      console.warn('Could not fetch OpenAI subscription data:', err.message);
    }

    // Get credit grants (requires session key, may fail with API key)
    try {
      const creditsResponse = await axios.get(
        `${OPENAI_API_URL}/v1/dashboard/billing/credit_grants`,
        { headers }
      );
      creditGrantsData = creditsResponse.data;
    } catch (err) {
      console.warn('Could not fetch OpenAI credit grants:', err.message);
    }

    // Get actual usage for current billing period
    try {
      // Get current month's usage
      const now = new Date();
      const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

      const usageResponse = await axios.get(
        `${OPENAI_API_URL}/v1/usage?start_date=${startDate}&end_date=${endDate}`,
        { headers }
      );

      // Sum up total usage in cents, convert to dollars
      if (usageResponse.data?.data) {
        totalUsage = usageResponse.data.data.reduce((sum, day) => sum + (day.n_generated_tokens_total || 0), 0);
        // Convert tokens to approximate cost (rough estimate: $0.01 per 1000 tokens for GPT-4)
        totalUsage = (totalUsage / 1000) * 0.01;
      }
    } catch (err) {
      console.warn('Could not fetch OpenAI usage data:', err.message);
    }

    // Calculate limits and percentage
    const hardLimit = subscriptionData?.hard_limit_usd || 100; // Default to $100 if unknown
    const percentage = (totalUsage / hardLimit) * 100;

    let status = 'healthy';
    if (percentage >= 90) status = 'critical';
    else if (percentage >= 75) status = 'warning';

    const result = {
      service: 'OpenAI',
      status,
      usage: {
        current: totalUsage,
        limit: hardLimit,
        unit: 'USD',
        percentage: Math.min(percentage, 100)
      },
      cost: {
        current: totalUsage,
        projected: totalUsage * 2, // Simple projection
        currency: 'USD'
      },
      details: {
        billingPlan: subscriptionData?.plan?.title || 'Unknown',
        softLimit: subscriptionData?.soft_limit_usd,
        hardLimit: subscriptionData?.hard_limit_usd,
        systemHardLimit: subscriptionData?.system_hard_limit_usd,
        accessUntil: subscriptionData?.access_until,
        creditGrants: creditGrantsData?.data || []
      },
      lastUpdated: new Date().toISOString(),
      externalLink: 'https://platform.openai.com/usage'
    };

    // Update cache
    cache = {
      data: result,
      timestamp: Date.now()
    };

    return result;
  } catch (error) {
    console.error('OpenAI API error:', error.response?.data || error.message);

    return {
      service: 'OpenAI',
      status: 'error',
      usage: { current: 0, limit: 'unknown', unit: 'USD', percentage: 0 },
      cost: { current: 0, projected: 0, currency: 'USD' },
      details: {
        error: error.response?.data?.error?.message || error.message
      },
      lastUpdated: new Date().toISOString(),
      externalLink: 'https://platform.openai.com/usage'
    };
  }
}

module.exports = {
  getOpenAIHealth
};
