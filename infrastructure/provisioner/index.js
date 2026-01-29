/**
 * Rumi Provisioner Service
 * Auto-provisions Supabase + Railway + OpenRouter infrastructure for clone deployments
 *
 * bd-339: Express app scaffold with health endpoint
 * bd-343: Rate limiting middleware
 * bd-344: API key auth middleware
 * bd-349: OpenRouter key provisioning
 * bd-350: Soniox temp key provisioning (Tier 2+)
 * bd-351: ElevenLabs shared key passthrough (Tier 3)
 * bd-352: Azure Speech shared config passthrough (Tier 3)
 */

const express = require('express');
const rateLimit = require('express-rate-limit');

const app = express();

// Configuration
const PORT = process.env.PORT || 3000;
const PROVISIONER_API_KEY = process.env.PROVISIONER_API_KEY;
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX, 10) || 5;
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000;

// Middleware
app.use(express.json());

// Trust proxy for rate limiting by IP behind load balancers
app.set('trust proxy', 1);

// Rate limiting middleware (bd-343)
const provisionLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
  message: {
    success: false,
    error: 'rate_limit_exceeded',
    message: 'Too many provisioning requests. Please wait before trying again.',
    retry_after: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || req.headers['x-forwarded-for'] || 'unknown'
});

// API key auth middleware (bd-344)
const authMiddleware = (req, res, next) => {
  const providedKey = req.headers['x-provisioner-key'];

  if (!PROVISIONER_API_KEY) {
    console.error('PROVISIONER_API_KEY not configured');
    return res.status(500).json({
      success: false,
      error: 'server_error',
      message: 'Provisioner not configured'
    });
  }

  if (!providedKey || providedKey !== PROVISIONER_API_KEY) {
    return res.status(401).json({
      success: false,
      error: 'unauthorized',
      message: 'Invalid or missing API key'
    });
  }

  next();
};

// Health endpoint (bd-339) - no auth required
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'rumi-provisioner',
    version: require('./package.json').version,
    timestamp: new Date().toISOString()
  });
});

// Provision endpoint
app.post('/provision', provisionLimiter, authMiddleware, async (req, res) => {
  const { deployment_name, region = 'ap-south-1', tier = 'recommended' } = req.body;

  if (!deployment_name) {
    return res.status(400).json({
      success: false,
      error: 'validation_error',
      message: 'deployment_name is required'
    });
  }

  // Sanitize deployment name
  const sanitizedName = deployment_name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 30);

  try {
    const SupabaseProvisioner = require('./services/supabase-provisioner');
    const RailwayProvisioner = require('./services/railway-provisioner');

    const supabase = new SupabaseProvisioner();
    const railway = new RailwayProvisioner();

    console.log(`Provisioning infrastructure for: ${sanitizedName}`);

    // Initialize status tracking
    deploymentStatus.set(sanitizedName, {
      status: 'provisioning',
      step: 'started',
      created_at: new Date().toISOString()
    });

    // Step 1: Create Supabase project
    console.log('Creating Supabase project...');
    deploymentStatus.get(sanitizedName).step = 'creating_supabase';
    const supabaseProject = await supabase.createProject(sanitizedName, region);

    // Step 2: Wait for Supabase to be healthy
    console.log('Waiting for Supabase to be healthy...');
    deploymentStatus.get(sanitizedName).step = 'waiting_supabase_healthy';
    await supabase.waitForHealthy(supabaseProject.id);

    // Step 3: Get Supabase API keys
    console.log('Getting Supabase API keys...');
    deploymentStatus.get(sanitizedName).step = 'getting_api_keys';
    const supabaseKeys = await supabase.getApiKeys(supabaseProject.id);

    // Step 4: Create Railway project
    console.log('Creating Railway project...');
    deploymentStatus.get(sanitizedName).step = 'creating_railway';
    const railwayProject = await railway.createProject(sanitizedName);

    // Step 5: Add Redis plugin
    console.log('Adding Redis plugin...');
    deploymentStatus.get(sanitizedName).step = 'adding_redis';
    const redis = await railway.addRedisPlugin(railwayProject.id);

    // Step 6: Get Redis connection string
    console.log('Getting Redis connection string...');
    deploymentStatus.get(sanitizedName).step = 'getting_redis_url';
    const redisUrl = await railway.getRedisConnectionString(redis.serviceId, redis.environmentId, railwayProject.id);

    // Step 7: Create OpenRouter API key (if provisioning key is configured)
    let openrouterKey = null;
    if (process.env.OPENROUTER_PROVISIONING_KEY) {
      try {
        console.log('Creating OpenRouter API key...');
        deploymentStatus.get(sanitizedName).step = 'creating_openrouter_key';
        const OpenRouterProvisioner = require('./services/openrouter-provisioner');
        const openrouter = new OpenRouterProvisioner();
        openrouterKey = await openrouter.createKey(sanitizedName, {
          limit: 10,           // $10/month budget
          limitReset: 'monthly',
          expiresInDays: 180   // 6 months
        });
        console.log(`OpenRouter key created: ${openrouterKey.name} (expires: ${openrouterKey.expires_at})`);
      } catch (error) {
        console.error('OpenRouter key creation failed (non-fatal):', error.message);
        // Non-fatal: continue without OpenRouter key
      }
    }

    // Step 8: Create Soniox temp key for STT (Tier 2+: recommended or full)
    let sonioxKey = null;
    if ((tier === 'recommended' || tier === 'full') && process.env.SONIOX_MASTER_API_KEY) {
      try {
        console.log('Creating Soniox temp key...');
        deploymentStatus.get(sanitizedName).step = 'creating_soniox_key';
        const SonioxProvisioner = require('./services/soniox-provisioner');
        const soniox = new SonioxProvisioner();
        sonioxKey = await soniox.createTempKey(sanitizedName, {
          usageType: 'transcribe_websocket',
          expiresInSeconds: 86400  // 24 hours - clone should auto-refresh
        });
        console.log(`Soniox temp key created (expires: ${sonioxKey.expires_at})`);
      } catch (error) {
        console.error('Soniox key creation failed (non-fatal):', error.message);
        // Non-fatal: continue without Soniox key
      }
    }

    // Step 9: Pass shared ElevenLabs key (Tier 3: full only)
    let elevenlabsKey = null;
    if (tier === 'full' && process.env.ELEVENLABS_API_KEY) {
      console.log('Including shared ElevenLabs API key...');
      deploymentStatus.get(sanitizedName).step = 'adding_elevenlabs_key';
      elevenlabsKey = {
        api_key: process.env.ELEVENLABS_API_KEY,
        type: 'shared',
        note: 'Shared Pro plan key - usage is pooled across all Tier 3 deployments'
      };
    }

    // Step 10: Pass shared Azure Speech config (Tier 3: full only)
    let azureSpeechConfig = null;
    if (tier === 'full' && process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION) {
      console.log('Including shared Azure Speech config...');
      deploymentStatus.get(sanitizedName).step = 'adding_azure_speech';
      azureSpeechConfig = {
        key: process.env.AZURE_SPEECH_KEY,
        region: process.env.AZURE_SPEECH_REGION,
        type: 'shared',
        note: 'Shared Azure Cognitive Services key for pronunciation assessment'
      };
    }

    // Update final status
    deploymentStatus.set(sanitizedName, {
      status: 'completed',
      step: 'done',
      tier: tier,
      created_at: deploymentStatus.get(sanitizedName).created_at,
      completed_at: new Date().toISOString(),
      supabase_project_id: supabaseProject.id,
      railway_project_id: railwayProject.id,
      openrouter_key_hash: openrouterKey?.hash || null,
      has_soniox: !!sonioxKey,
      has_elevenlabs: !!elevenlabsKey,
      has_azure_speech: !!azureSpeechConfig
    });

    // Build response
    const response = {
      success: true,
      deployment_name: sanitizedName,
      supabase: {
        project_id: supabaseProject.id,
        url: `https://${supabaseProject.id}.supabase.co`,
        anon_key: supabaseKeys.anon_key,
        service_key: supabaseKeys.service_key,
        db_password: supabaseProject.db_password
      },
      railway: {
        project_id: railwayProject.id,
        project_url: railway.getProjectUrl(railwayProject.id),
        redis_url: redisUrl,
        deploy_command: `railway link ${railwayProject.id} && railway up`
      },
      next_steps: [
        'Add WhatsApp credentials to .env (WHATSAPP_TOKEN, PHONE_NUMBER_ID, WABA_ID)',
        `Run: railway link ${railwayProject.id}`,
        'Run: railway up'
      ]
    };

    // Include OpenRouter key if created
    if (openrouterKey) {
      response.openrouter = {
        api_key: openrouterKey.key,
        limit: `$${openrouterKey.limit}/month`,
        expires_at: openrouterKey.expires_at,
        key_hash: openrouterKey.hash
      };
    } else {
      response.next_steps.unshift('Add OpenRouter API key to .env (OPENROUTER_API_KEY)');
    }

    // Include Soniox temp key if created (Tier 2+)
    if (sonioxKey) {
      response.soniox = {
        api_key: sonioxKey.api_key,
        usage_type: sonioxKey.usage_type,
        expires_at: sonioxKey.expires_at,
        note: 'Key expires in 24 hours. Bot should auto-refresh using SONIOX_MASTER_API_KEY.'
      };
      response.next_steps.push('Configure SONIOX_MASTER_API_KEY for auto-refresh of temp keys');
    } else if (tier === 'recommended' || tier === 'full') {
      response.next_steps.push('Soniox STT not configured - add SONIOX_MASTER_API_KEY to provisioner');
    }

    // Include ElevenLabs shared key if available (Tier 3)
    if (elevenlabsKey) {
      response.elevenlabs = elevenlabsKey;
    } else if (tier === 'full') {
      response.next_steps.push('ElevenLabs TTS not configured - add ELEVENLABS_API_KEY to provisioner');
    }

    // Include Azure Speech shared config if available (Tier 3)
    if (azureSpeechConfig) {
      response.azure_speech = azureSpeechConfig;
    } else if (tier === 'full') {
      response.next_steps.push('Azure Speech not configured - add AZURE_SPEECH_KEY and AZURE_SPEECH_REGION to provisioner');
    }

    // Add tier info to response
    response.tier = tier;

    res.json(response);

  } catch (error) {
    console.error('Provisioning failed:', error);

    // Update status on failure
    if (deploymentStatus.has(sanitizedName)) {
      deploymentStatus.get(sanitizedName).status = 'failed';
      deploymentStatus.get(sanitizedName).error = error.message;
    }

    res.status(500).json({
      success: false,
      error: 'provisioning_failed',
      message: error.message
    });
  }
});

// In-memory store for deployment status (bd-348)
const deploymentStatus = new Map();

// Status endpoint (bd-348)
app.get('/status/:deployment_name', authMiddleware, (req, res) => {
  const { deployment_name } = req.params;
  const status = deploymentStatus.get(deployment_name);

  if (!status) {
    return res.status(404).json({
      success: false,
      error: 'not_found',
      message: `Deployment '${deployment_name}' not found`
    });
  }

  res.json({
    success: true,
    deployment_name,
    ...status
  });
});

// Helper to update deployment status
function updateDeploymentStatus(name, status) {
  deploymentStatus.set(name, {
    ...deploymentStatus.get(name),
    ...status,
    updated_at: new Date().toISOString()
  });
}

// Export for testing
app.updateDeploymentStatus = updateDeploymentStatus;
app.deploymentStatus = deploymentStatus;

// Only start server if not in test mode
if (process.env.NODE_ENV !== 'test' && require.main === module) {
  app.listen(PORT, () => {
    console.log(`Rumi Provisioner running on port ${PORT}`);
  });
}

module.exports = app;
