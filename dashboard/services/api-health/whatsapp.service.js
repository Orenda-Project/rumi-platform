/**
 * WhatsApp Cloud API Health Service
 * Monitors WhatsApp messaging limits, quality rating, and account status
 */

const axios = require('axios');

const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION || 'v21.0';
const WHATSAPP_API_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

let cache = {
  data: null,
  timestamp: null
};

/**
 * Get WhatsApp Cloud API health data
 */
async function getWhatsAppHealth() {
  // Check cache
  if (cache.data && cache.timestamp && (Date.now() - cache.timestamp < CACHE_DURATION)) {
    return cache.data;
  }

  const token = process.env.WHATSAPP_TOKEN;
  // Try both PHONE_NUMBER_ID and WABA_ID for flexibility
  const phoneNumberId = process.env.PHONE_NUMBER_ID || process.env.WABA_ID;

  if (!token || !phoneNumberId) {
    return {
      service: 'WhatsApp Cloud API',
      status: 'error',
      usage: { current: 0, limit: 'unknown', unit: 'messages', percentage: 0 },
      cost: { current: 0, projected: 0, currency: 'USD' },
      details: { error: 'API credentials not configured (need WHATSAPP_TOKEN and PHONE_NUMBER_ID or WABA_ID)' },
      lastUpdated: new Date().toISOString(),
      externalLink: 'https://business.facebook.com/wa/manage/home/'
    };
  }

  try {
    const response = await axios.get(
      `${WHATSAPP_API_URL}/${phoneNumberId}`,
      {
        params: {
          fields: 'messaging_limit_tier,quality_rating,display_phone_number,verified_name'
        },
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    const data = response.data;

    // Parse messaging limit tier
    const tierMap = {
      'TIER_1K': 1000,
      'TIER_10K': 10000,
      'TIER_100K': 100000,
      'TIER_UNLIMITED': 'unlimited'
    };

    const limitTier = data.messaging_limit_tier || 'TIER_1K';
    const limit = tierMap[limitTier] || 1000;

    // Quality rating affects status
    const qualityRating = data.quality_rating || 'UNKNOWN';
    let status = 'healthy';

    if (qualityRating === 'RED' || qualityRating === 'LOW') {
      status = 'critical';
    } else if (qualityRating === 'YELLOW' || qualityRating === 'MEDIUM') {
      status = 'warning';
    }

    const result = {
      service: 'WhatsApp Cloud API',
      status,
      usage: {
        current: 0, // WhatsApp doesn't provide current message count via API
        limit: limit,
        unit: 'messages/day',
        percentage: 0
      },
      cost: {
        current: 0, // Free tier, no cost tracking available
        projected: 0,
        currency: 'USD'
      },
      details: {
        messagingLimitTier: limitTier,
        qualityRating: qualityRating,
        displayPhoneNumber: data.display_phone_number,
        verifiedName: data.verified_name,
        rateLimit: '80 messages/second (can increase to 1000)',
        note: 'Message count not available via API - monitoring quality and limits only'
      },
      lastUpdated: new Date().toISOString(),
      externalLink: 'https://business.facebook.com/wa/manage/home/'
    };

    // Update cache
    cache = {
      data: result,
      timestamp: Date.now()
    };

    return result;
  } catch (error) {
    console.error('WhatsApp API error:', error.response?.data || error.message);

    return {
      service: 'WhatsApp Cloud API',
      status: 'error',
      usage: { current: 0, limit: 'unknown', unit: 'messages', percentage: 0 },
      cost: { current: 0, projected: 0, currency: 'USD' },
      details: {
        error: error.response?.data?.error?.message || error.message
      },
      lastUpdated: new Date().toISOString(),
      externalLink: 'https://business.facebook.com/wa/manage/home/'
    };
  }
}

module.exports = {
  getWhatsAppHealth
};
