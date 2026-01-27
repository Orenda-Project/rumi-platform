/**
 * Supabase API Health Service
 * Monitors Supabase database size, disk usage, and compute
 */

const axios = require('axios');

const SUPABASE_MGMT_API = 'https://api.supabase.com/v1';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

let cache = {
  data: null,
  timestamp: null
};

/**
 * Get Supabase project health data
 */
async function getSupabaseHealth() {
  // Check cache
  if (cache.data && cache.timestamp && (Date.now() - cache.timestamp < CACHE_DURATION)) {
    return cache.data;
  }

  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  const projectRef = process.env.SUPABASE_PROJECT_REF;

  if (!accessToken || !projectRef) {
    return {
      service: 'Supabase',
      status: 'error',
      usage: { current: 0, limit: 'unknown', unit: 'MB', percentage: 0 },
      cost: { current: 0, projected: 0, currency: 'USD' },
      details: { error: 'API credentials not configured' },
      lastUpdated: new Date().toISOString(),
      externalLink: 'https://supabase.com/dashboard/project/_/settings/billing'
    };
  }

  try {
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    };

    // Get project settings which includes database size info
    const response = await axios.get(
      `${SUPABASE_MGMT_API}/projects/${projectRef}`,
      { headers }
    );

    const data = response.data;

    // Parse database size (in bytes) - Supabase free tier has 500MB limit
    const dbSizeBytes = data.database?.size_bytes || 0;
    const dbSizeMB = dbSizeBytes / (1024 * 1024);
    const limitMB = 500; // Free tier limit
    const percentage = (dbSizeMB / limitMB) * 100;

    let status = 'healthy';
    if (percentage >= 90) status = 'critical';
    else if (percentage >= 75) status = 'warning';

    const result = {
      service: 'Supabase',
      status,
      usage: {
        current: Math.round(dbSizeMB),
        limit: limitMB,
        unit: 'MB',
        percentage: Math.min(percentage, 100)
      },
      cost: {
        current: 0, // Free tier
        projected: 0,
        currency: 'USD'
      },
      details: {
        projectName: data.name,
        region: data.region,
        organizationId: data.organization_id,
        createdAt: data.created_at,
        plan: 'Free', // Adjust based on actual plan
        diskSizeMB: Math.round(dbSizeMB),
        addons: data.addons || []
      },
      lastUpdated: new Date().toISOString(),
      externalLink: `https://supabase.com/dashboard/project/${projectRef}/settings/billing`
    };

    // Update cache
    cache = {
      data: result,
      timestamp: Date.now()
    };

    return result;
  } catch (error) {
    console.error('Supabase API error:', error.response?.data || error.message);

    return {
      service: 'Supabase',
      status: 'error',
      usage: { current: 0, limit: 'unknown', unit: 'MB', percentage: 0 },
      cost: { current: 0, projected: 0, currency: 'USD' },
      details: {
        error: error.response?.data?.message || error.message,
        note: 'Ensure SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF are set'
      },
      lastUpdated: new Date().toISOString(),
      externalLink: 'https://supabase.com/dashboard/project/_/settings/billing'
    };
  }
}

module.exports = {
  getSupabaseHealth
};
