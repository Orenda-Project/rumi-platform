/**
 * Railway API Health Service
 * Monitors Railway usage, billing, and project metrics
 */

const axios = require('axios');

const RAILWAY_API_URL = 'https://backboard.railway.com/graphql/v2';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

let cache = {
  data: null,
  timestamp: null
};

/**
 * Get Railway project usage and billing data
 */
async function getRailwayHealth() {
  // Check cache
  if (cache.data && cache.timestamp && (Date.now() - cache.timestamp < CACHE_DURATION)) {
    return cache.data;
  }

  // Railway billing API requires ACCOUNT token (not project token)
  const token = process.env.RAILWAY_ACCOUNT_TOKEN || process.env.RAILWAY_API_TOKEN;
  if (!token) {
    return {
      service: 'Railway',
      status: 'error',
      usage: { current: 0, limit: 'unknown', unit: 'USD', percentage: 0 },
      cost: { current: 0, projected: 0, currency: 'USD' },
      details: { error: 'API token not configured (need RAILWAY_ACCOUNT_TOKEN for billing access)' },
      lastUpdated: new Date().toISOString(),
      externalLink: 'https://railway.app/account/usage'
    };
  }

  try {
    // Railway API uses Bearer token for workspace tokens
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };

    // First, verify token works with basic query
    const basicQuery = `
      query {
        me {
          email
        }
      }
    `;

    const basicResponse = await axios.post(
      RAILWAY_API_URL,
      { query: basicQuery },
      { headers }
    );

    if (basicResponse.data.errors) {
      throw new Error(basicResponse.data.errors[0]?.message || 'Invalid API token');
    }

    // Try to get usage data (may not be available with workspace tokens)
    const usageQuery = `
      query {
        me {
          currentUsage {
            estimatedCost
            measurement
          }
        }
      }
    `;

    const usageResponse = await axios.post(
      RAILWAY_API_URL,
      { query: usageQuery },
      { headers }
    );

    // Check if usage data is accessible
    if (usageResponse.data.errors || !usageResponse.data.data?.me?.currentUsage) {
      // Token works but doesn't have access to billing/usage data
      return {
        service: 'Railway',
        status: 'warning',
        usage: { current: 0, limit: 'unknown', unit: 'USD', percentage: 0 },
        cost: { current: 0, projected: 0, currency: 'USD' },
        details: {
          message: 'Token authenticated but lacks billing permissions',
          email: basicResponse.data.data.me.email,
          recommendation: 'View usage manually at railway.app/account/usage'
        },
        lastUpdated: new Date().toISOString(),
        externalLink: 'https://railway.app/account/usage',
        isEstimated: true
      };
    }

    const data = usageResponse.data.data.me;
    const currentCost = parseFloat(data.currentUsage?.estimatedCost || 0);

    // Assuming $5/month hobby plan limit
    const monthlyLimit = 5;
    const percentage = (currentCost / monthlyLimit) * 100;

    let status = 'healthy';
    if (percentage >= 90) status = 'critical';
    else if (percentage >= 75) status = 'warning';

    const result = {
      service: 'Railway',
      status,
      usage: {
        current: currentCost,
        limit: monthlyLimit,
        unit: 'USD',
        percentage: Math.min(percentage, 100)
      },
      cost: {
        current: currentCost,
        projected: currentCost * 2, // Simple projection
        currency: 'USD'
      },
      details: {
        billingCycleStart: data.billingPeriod?.billingCycleStart,
        billingCycleEnd: data.billingPeriod?.billingCycleEnd,
        billingEmail: data.customer?.billingEmail,
        measurement: data.currentUsage?.measurement
      },
      lastUpdated: new Date().toISOString(),
      externalLink: 'https://railway.app/account/usage'
    };

    // Update cache
    cache = {
      data: result,
      timestamp: Date.now()
    };

    return result;
  } catch (error) {
    console.error('Railway API error:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });

    let errorMessage = error.message;
    if (error.response?.data?.errors) {
      errorMessage = error.response.data.errors[0]?.message || error.message;
    } else if (error.response?.data?.error) {
      errorMessage = error.response.data.error;
    }

    return {
      service: 'Railway',
      status: 'error',
      usage: { current: 0, limit: 'unknown', unit: 'USD', percentage: 0 },
      cost: { current: 0, projected: 0, currency: 'USD' },
      details: {
        error: errorMessage,
        statusCode: error.response?.status
      },
      lastUpdated: new Date().toISOString(),
      externalLink: 'https://railway.app/account/usage'
    };
  }
}

module.exports = {
  getRailwayHealth
};
