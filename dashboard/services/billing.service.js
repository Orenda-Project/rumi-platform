/**
 * Billing Service
 *
 * P5: API usage and billing checks for Observability Portal
 * Checks usage/quotas for Anthropic, WhatsApp, and OpenAI
 */

const https = require('https');

// API Keys from environment
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_WABA_ID = process.env.WHATSAPP_WABA_ID || '1383233296670749';

// Warning thresholds
const THRESHOLDS = {
  anthropic: { creditsLow: 10 },  // $10 remaining
  openai: { creditsLow: 5 },      // $5 remaining
  whatsapp: { quotaLow: 100 }     // 100 messages remaining in tier
};

/**
 * Make an HTTPS request and return JSON
 */
function httpsRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(body)
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: body,
            parseError: true
          });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

/**
 * Get Anthropic API usage/billing
 * Note: Anthropic doesn't have a public billing API, so we check if the API is responsive
 * @returns {Promise<Object>}
 */
async function getAnthropicUsage() {
  const result = {
    provider: 'anthropic',
    name: 'Anthropic (Claude)',
    available: false,
    status: 'unknown',
    message: '',
    warning: false,
    lastChecked: new Date().toISOString()
  };

  if (!ANTHROPIC_API_KEY) {
    result.status = 'no_key';
    result.message = 'API key not configured';
    return result;
  }

  try {
    // Make a minimal API call to check if the key is valid and has credits
    const response = await httpsRequest({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      timeout: 10000
    }, JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'hi' }]
    }));

    if (response.status === 200) {
      result.available = true;
      result.status = 'ok';
      result.message = 'API is operational';
    } else if (response.status === 401) {
      result.status = 'invalid_key';
      result.message = 'Invalid API key';
    } else if (response.status === 429) {
      result.status = 'rate_limited';
      result.message = 'Rate limited - may indicate high usage';
      result.warning = true;
    } else if (response.status === 402 || response.status === 400) {
      result.status = 'no_credits';
      result.message = 'No credits remaining or billing issue';
      result.warning = true;
    } else {
      result.status = 'error';
      result.message = `API returned ${response.status}`;
    }
  } catch (e) {
    result.status = 'error';
    result.message = e.message;
  }

  return result;
}

/**
 * Get WhatsApp Business API quota/tier info
 * @returns {Promise<Object>}
 */
async function getWhatsAppQuota() {
  const result = {
    provider: 'whatsapp',
    name: 'WhatsApp Business API',
    available: false,
    status: 'unknown',
    tier: 'unknown',
    dailyLimit: 0,
    message: '',
    warning: false,
    lastChecked: new Date().toISOString()
  };

  if (!WHATSAPP_TOKEN) {
    result.status = 'no_key';
    result.message = 'WhatsApp token not configured';
    return result;
  }

  try {
    // Get WABA info including messaging limits
    const response = await httpsRequest({
      hostname: 'graph.facebook.com',
      path: `/v18.0/${WHATSAPP_WABA_ID}?fields=message_template_namespace,account_review_status,business_verification_status`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`
      },
      timeout: 10000
    });

    if (response.status === 200) {
      result.available = true;
      result.status = 'ok';
      result.message = 'WhatsApp API is operational';

      // Try to infer tier from response
      const data = response.data;
      if (data.business_verification_status === 'verified') {
        result.tier = 'verified';
        result.dailyLimit = 100000; // Verified tier
      } else {
        result.tier = 'limited';
        result.dailyLimit = 1000;   // Unverified tier
      }
    } else if (response.status === 401) {
      result.status = 'invalid_token';
      result.message = 'Invalid or expired token';
      result.warning = true;
    } else {
      result.status = 'error';
      result.message = `API returned ${response.status}`;
    }
  } catch (e) {
    result.status = 'error';
    result.message = e.message;
  }

  return result;
}

/**
 * Get OpenAI API usage/billing
 * @returns {Promise<Object>}
 */
async function getOpenAIUsage() {
  const result = {
    provider: 'openai',
    name: 'OpenAI',
    available: false,
    status: 'unknown',
    message: '',
    warning: false,
    lastChecked: new Date().toISOString()
  };

  if (!OPENAI_API_KEY) {
    result.status = 'no_key';
    result.message = 'API key not configured';
    return result;
  }

  try {
    // Check if API is responsive with a simple models list request
    const response = await httpsRequest({
      hostname: 'api.openai.com',
      path: '/v1/models',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      timeout: 10000
    });

    if (response.status === 200) {
      result.available = true;
      result.status = 'ok';
      result.message = 'API is operational';
    } else if (response.status === 401) {
      result.status = 'invalid_key';
      result.message = 'Invalid API key';
    } else if (response.status === 429) {
      result.status = 'rate_limited';
      result.message = 'Rate limited';
      result.warning = true;
    } else {
      result.status = 'error';
      result.message = `API returned ${response.status}`;
    }
  } catch (e) {
    result.status = 'error';
    result.message = e.message;
  }

  return result;
}

/**
 * Get all billing data aggregated
 * @returns {Promise<Object>}
 */
async function getAllBillingData() {
  const [anthropic, whatsapp, openai] = await Promise.all([
    getAnthropicUsage(),
    getWhatsAppQuota(),
    getOpenAIUsage()
  ]);

  const providers = [anthropic, whatsapp, openai];
  const hasWarnings = providers.some(p => p.warning || p.status === 'error' || !p.available);

  return {
    providers,
    hasWarnings,
    lastChecked: new Date().toISOString(),
    summary: {
      total: providers.length,
      healthy: providers.filter(p => p.available && !p.warning).length,
      warnings: providers.filter(p => p.warning).length,
      errors: providers.filter(p => p.status === 'error' || !p.available).length
    }
  };
}

module.exports = {
  getAnthropicUsage,
  getWhatsAppQuota,
  getOpenAIUsage,
  getAllBillingData
};
