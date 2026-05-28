/**
 * Register All WhatsApp Message Templates
 *
 * Registers both message templates (video_style_selection and
 * feature_menu_carousel_v3) with Meta's Graph API. Idempotent — skips
 * templates that already exist.
 *
 * Usage (programmatic):
 *   const { registerAllTemplates } = require('./register-all-templates');
 *   const result = await registerAllTemplates({
 *     wabaId: 'your_waba_id',
 *     accessToken: 'your_token',
 *     phoneNumberId: 'your_phone_id',
 *     assetBaseUrl: process.env.ASSET_BASE_URL,  // optional — public asset CDN
 *     statePath: '/path/to/.setup-state.json',       // optional
 *   });
 *
 * @module register-all-templates
 */

const { MetaAPI } = require('./meta-api');
const { SetupState } = require('./setup-state');

// ---------------------------------------------------------------------------
// Template configurations
// ---------------------------------------------------------------------------

const TEMPLATE_CONFIGS = [
  {
    name: 'video_style_selection',
    category: 'MARKETING',
    language: 'en',
    envVar: 'VIDEO_STYLE_TEMPLATE_STATUS',
    buildPayload(assetBaseUrl) {
      return {
        name: 'video_style_selection',
        language: 'en',
        category: 'MARKETING',
        components: [
          {
            type: 'HEADER',
            format: 'IMAGE',
            example: {
              header_url: [`${assetBaseUrl}/video_style_selection_header.png`],
            },
          },
          {
            type: 'BODY',
            text: 'Choose your preferred video style. Swipe to preview and tap to select!',
          },
          {
            type: 'FOOTER',
            text: 'Powered by Rumi',
          },
          {
            type: 'BUTTONS',
            buttons: [
              {
                type: 'QUICK_REPLY',
                text: 'Animated',
              },
              {
                type: 'QUICK_REPLY',
                text: 'Realistic',
              },
              {
                type: 'QUICK_REPLY',
                text: 'Whiteboard',
              },
            ],
          },
        ],
      };
    },
  },
  {
    name: 'feature_menu_carousel_v3',
    category: 'MARKETING',
    language: 'en',
    envVar: 'MENU_CAROUSEL_TEMPLATE_STATUS',
    buildPayload(assetBaseUrl) {
      return {
        name: 'feature_menu_carousel_v3',
        language: 'en',
        category: 'MARKETING',
        components: [
          {
            type: 'BODY',
            text: "Here's what I can help you with! Swipe to explore:",
          },
          {
            type: 'CAROUSEL',
            cards: [
              // Card 1: Lesson Plans
              {
                components: [
                  {
                    type: 'HEADER',
                    format: 'VIDEO',
                    example: {
                      header_url: [`${assetBaseUrl}/menu_lesson_plan.mp4`],
                    },
                  },
                  {
                    type: 'BODY',
                    text: 'Create lesson plans & presentations. Just tell me your topic and grade!',
                  },
                  {
                    type: 'BUTTONS',
                    buttons: [
                      {
                        type: 'QUICK_REPLY',
                        text: 'Lesson Plans',
                      },
                    ],
                  },
                ],
              },
              // Card 2: Video Generation
              {
                components: [
                  {
                    type: 'HEADER',
                    format: 'VIDEO',
                    example: {
                      header_url: [`${assetBaseUrl}/menu_video_generation.mp4`],
                    },
                  },
                  {
                    type: 'BODY',
                    text: 'Create educational videos on any topic. I generate animated explainers!',
                  },
                  {
                    type: 'BUTTONS',
                    buttons: [
                      {
                        type: 'QUICK_REPLY',
                        text: 'Create Video',
                      },
                    ],
                  },
                ],
              },
              // Card 3: Classroom Coaching
              {
                components: [
                  {
                    type: 'HEADER',
                    format: 'VIDEO',
                    example: {
                      header_url: [`${assetBaseUrl}/menu_coaching.mp4`],
                    },
                  },
                  {
                    type: 'BODY',
                    text: 'Upload classroom audio and get personalized teaching feedback.',
                  },
                  {
                    type: 'BUTTONS',
                    buttons: [
                      {
                        type: 'QUICK_REPLY',
                        text: 'Coaching',
                      },
                    ],
                  },
                ],
              },
              // Card 4: Reading Assessment
              {
                components: [
                  {
                    type: 'HEADER',
                    format: 'VIDEO',
                    example: {
                      header_url: [`${assetBaseUrl}/menu_reading.mp4`],
                    },
                  },
                  {
                    type: 'BODY',
                    text: 'Assess student reading fluency with WCPM scores and feedback.',
                  },
                  {
                    type: 'BUTTONS',
                    buttons: [
                      {
                        type: 'QUICK_REPLY',
                        text: 'Reading Test',
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };
    },
  },
];

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Register a single template. Idempotent — skips if template already exists.
 *
 * @param {MetaAPI}  api          Initialized MetaAPI instance
 * @param {SetupState} state      Initialized SetupState instance
 * @param {object}   templateConfig  Entry from TEMPLATE_CONFIGS
 * @param {string}   assetBaseUrl    Base URL for template assets
 * @returns {Promise<{ action: 'registered'|'skipped'|'error', name, templateId?, status?, error? }>}
 */
async function registerTemplate(api, state, templateConfig, assetBaseUrl) {
  const { name, envVar, buildPayload } = templateConfig;

  // 1. Check if template already exists
  const findResult = await api.findTemplateByName(name);
  if (!findResult.success) {
    return {
      action: 'error',
      name,
      error: findResult.error,
    };
  }

  // 2. If template exists, skip creation but record state
  if (findResult.data) {
    const existing = findResult.data;
    await state.setTemplate(name, {
      templateId: existing.id,
      status: existing.status,
      envVar,
      registeredAt: new Date().toISOString(),
    });

    return {
      action: 'skipped',
      name,
      templateId: existing.id,
      status: existing.status,
    };
  }

  // 3. Template does not exist — create it
  const payload = buildPayload(assetBaseUrl);
  const createResult = await api.createTemplate(payload);
  if (!createResult.success) {
    return {
      action: 'error',
      name,
      error: createResult.error,
    };
  }

  const { id: templateId, status } = createResult.data;
  const templateStatus = status || 'PENDING';

  // 4. Record in state
  await state.setTemplate(name, {
    templateId,
    status: templateStatus,
    envVar,
    registeredAt: new Date().toISOString(),
  });

  return {
    action: 'registered',
    name,
    templateId,
    status: templateStatus,
  };
}

/**
 * Register all message templates. Idempotent — skips templates that
 * already exist.
 *
 * @param {object}  options
 * @param {string}  options.wabaId         WhatsApp Business Account ID
 * @param {string}  options.accessToken    Meta Graph API access token
 * @param {string}  options.phoneNumberId  Phone number ID
 * @param {string} [options.assetBaseUrl]  Base URL for assets (defaults to process.env.ASSET_BASE_URL; required if any template has a video header)
 * @param {string} [options.statePath]     Path to .setup-state.json
 * @param {object} [options._mockApi]      (testing) Injected MetaAPI mock
 * @param {object} [options._mockState]    (testing) Injected SetupState mock
 * @returns {Promise<{ registered: object[], skipped: object[], errors: object[] }>}
 */
async function registerAllTemplates(options = {}) {
  const {
    wabaId,
    accessToken,
    phoneNumberId,
    // Asset base URL: prefer explicit option, else env ASSET_BASE_URL /
    // ASSETS_BASE_URL. Stays undefined if nothing is configured; the per-
    // template config decides whether that's fatal (video templates) or fine.
    assetBaseUrl = process.env.ASSET_BASE_URL || process.env.ASSETS_BASE_URL,
    statePath,
    _mockApi,
    _mockState,
  } = options;

  // Validate required options
  if (!wabaId) throw new Error('Missing required option: wabaId');
  if (!accessToken) throw new Error('Missing required option: accessToken');
  if (!phoneNumberId) throw new Error('Missing required option: phoneNumberId');

  // Initialize API client and state (allow injection for testing)
  const api = _mockApi || new MetaAPI({ wabaId, accessToken, phoneNumberId });
  const state = _mockState || new SetupState(statePath);

  // Load existing state
  await state.load();

  const registered = [];
  const skipped = [];
  const errors = [];

  // Process each template configuration
  for (const config of TEMPLATE_CONFIGS) {
    console.log(`Processing template: ${config.name}...`);

    const result = await registerTemplate(api, state, config, assetBaseUrl);

    switch (result.action) {
      case 'registered':
        console.log(`  Created: ${result.name} (id=${result.templateId}, status=${result.status})`);
        registered.push(result);
        break;
      case 'skipped':
        console.log(`  Skipped: ${result.name} (already exists, status=${result.status})`);
        skipped.push(result);
        break;
      case 'error':
        console.log(`  Error: ${result.name} — ${result.error?.message || 'Unknown error'}`);
        errors.push(result);
        break;
    }
  }

  // Advisory for pending templates
  const hasPending = [...registered, ...skipped].some((r) => r.status === 'PENDING');
  if (hasPending) {
    console.log('\nTemplates are pending Meta review (usually 1-24 hours)');
  }

  // Summary
  console.log(`\nDone: ${registered.length} registered, ${skipped.length} skipped, ${errors.length} errors`);

  return { registered, skipped, errors };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  TEMPLATE_CONFIGS,
  registerTemplate,
  registerAllTemplates,
};
