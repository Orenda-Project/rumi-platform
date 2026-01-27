/**
 * ElevenLabs API Health Service
 * Monitors ElevenLabs character usage and subscription limits
 */

const axios = require('axios');

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

let cache = {
  data: null,
  timestamp: null
};

/**
 * Get ElevenLabs subscription and usage data
 */
async function getElevenLabsHealth() {
  // Check cache
  if (cache.data && cache.timestamp && (Date.now() - cache.timestamp < CACHE_DURATION)) {
    return cache.data;
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return {
      service: 'ElevenLabs',
      status: 'error',
      usage: { current: 0, limit: 'unknown', unit: 'characters', percentage: 0 },
      cost: { current: 0, projected: 0, currency: 'USD' },
      details: { error: 'API key not configured' },
      lastUpdated: new Date().toISOString(),
      externalLink: 'https://elevenlabs.io/subscription'
    };
  }

  try {
    const response = await axios.get(`${ELEVENLABS_API_URL}/v1/user/subscription`, {
      headers: {
        'xi-api-key': apiKey
      }
    });

    const data = response.data;
    const currentChars = data.character_count || 0;
    const limitChars = data.character_limit || 10000;
    const percentage = (currentChars / limitChars) * 100;

    let status = 'healthy';
    if (percentage >= 90) status = 'critical';
    else if (percentage >= 75) status = 'warning';

    const result = {
      service: 'ElevenLabs',
      status,
      usage: {
        current: currentChars,
        limit: limitChars,
        unit: 'characters',
        percentage: Math.min(percentage, 100)
      },
      cost: {
        current: 0, // ElevenLabs doesn't provide cost in subscription endpoint
        projected: 0,
        currency: 'USD'
      },
      details: {
        canExtendCharacterLimit: data.can_extend_character_limit,
        allowedToExtend: data.allowed_to_extend_character_limit,
        nextResetUnix: data.next_character_count_reset_unix,
        nextResetDate: data.next_character_count_reset_unix
          ? new Date(data.next_character_count_reset_unix * 1000).toISOString()
          : null,
        voiceLimit: data.voice_limit,
        maxVoiceAdd: data.max_voice_add,
        voiceAddAllowed: data.voice_add_is_allowed
      },
      lastUpdated: new Date().toISOString(),
      externalLink: 'https://elevenlabs.io/subscription'
    };

    // Update cache
    cache = {
      data: result,
      timestamp: Date.now()
    };

    return result;
  } catch (error) {
    console.error('ElevenLabs API error:', error.response?.data || error.message);

    return {
      service: 'ElevenLabs',
      status: 'error',
      usage: { current: 0, limit: 'unknown', unit: 'characters', percentage: 0 },
      cost: { current: 0, projected: 0, currency: 'USD' },
      details: {
        error: error.response?.data?.detail?.message || error.message
      },
      lastUpdated: new Date().toISOString(),
      externalLink: 'https://elevenlabs.io/subscription'
    };
  }
}

module.exports = {
  getElevenLabsHealth
};
