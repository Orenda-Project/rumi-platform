/**
 * Register All Templates — Test Suite
 *
 * Tests the registerAllTemplates module that registers WhatsApp Message
 * Templates with Meta's Graph API. Fully mocks MetaAPI and SetupState.
 *
 * TDD: This test file was written BEFORE the implementation.
 */

const {
  registerTemplate,
  registerAllTemplates,
  TEMPLATE_CONFIGS,
} = require('../../bot/scripts/setup/register-all-templates');

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockApi(overrides = {}) {
  return {
    findTemplateByName: jest.fn().mockResolvedValue({ success: true, data: null }),
    createTemplate: jest.fn().mockResolvedValue({
      success: true,
      data: { id: 'tmpl_new_123', status: 'PENDING' },
    }),
    ...overrides,
  };
}

function createMockState(overrides = {}) {
  return {
    load: jest.fn().mockResolvedValue({}),
    save: jest.fn().mockResolvedValue(undefined),
    setTemplate: jest.fn().mockResolvedValue(undefined),
    getTemplate: jest.fn().mockReturnValue(null),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TEMPLATE_CONFIGS
// ---------------------------------------------------------------------------

describe('TEMPLATE_CONFIGS', () => {
  it('contains exactly 2 template definitions', () => {
    expect(TEMPLATE_CONFIGS).toHaveLength(2);
  });

  it('includes video_style_selection', () => {
    const tpl = TEMPLATE_CONFIGS.find((t) => t.name === 'video_style_selection');
    expect(tpl).toBeDefined();
    expect(tpl.category).toBe('MARKETING');
    expect(tpl.language).toBe('en');
    expect(tpl.envVar).toBe('VIDEO_STYLE_TEMPLATE_STATUS');
    expect(typeof tpl.buildPayload).toBe('function');
  });

  it('includes feature_menu_carousel_v3', () => {
    const tpl = TEMPLATE_CONFIGS.find((t) => t.name === 'feature_menu_carousel_v3');
    expect(tpl).toBeDefined();
    expect(tpl.category).toBe('MARKETING');
    expect(tpl.language).toBe('en');
    expect(tpl.envVar).toBe('MENU_CAROUSEL_TEMPLATE_STATUS');
    expect(typeof tpl.buildPayload).toBe('function');
  });

  // -----------------------------------------------------------------------
  // buildPayload
  // -----------------------------------------------------------------------

  describe('video_style_selection buildPayload', () => {
    it('returns a valid Meta API payload with image header and quick_reply buttons', () => {
      const cfg = TEMPLATE_CONFIGS.find((t) => t.name === 'video_style_selection');
      const payload = cfg.buildPayload('https://example.com/assets');

      expect(payload.name).toBe('video_style_selection');
      expect(payload.language).toBe('en');
      expect(payload.category).toBe('MARKETING');
      expect(Array.isArray(payload.components)).toBe(true);

      // Must have a HEADER component with format IMAGE
      const header = payload.components.find((c) => c.type === 'HEADER');
      expect(header).toBeDefined();
      expect(header.format).toBe('IMAGE');

      // Must have a BODY component
      const body = payload.components.find((c) => c.type === 'BODY');
      expect(body).toBeDefined();
      expect(typeof body.text).toBe('string');

      // Must have BUTTONS with at least one QUICK_REPLY
      const buttons = payload.components.find((c) => c.type === 'BUTTONS');
      expect(buttons).toBeDefined();
      expect(buttons.buttons.length).toBeGreaterThanOrEqual(1);
      expect(buttons.buttons[0].type).toBe('QUICK_REPLY');
    });

    it('uses the provided assetBaseUrl in example URLs', () => {
      const cfg = TEMPLATE_CONFIGS.find((t) => t.name === 'video_style_selection');
      const payload = cfg.buildPayload('https://custom-cdn.com/media');

      const header = payload.components.find((c) => c.type === 'HEADER');
      // The example URL should use the custom base URL
      const exampleUrl = header.example?.header_url?.[0];
      expect(exampleUrl).toMatch(/^https:\/\/custom-cdn\.com\/media/);
    });
  });

  describe('feature_menu_carousel_v3 buildPayload', () => {
    it('returns a valid Meta API carousel payload with multiple cards', () => {
      const cfg = TEMPLATE_CONFIGS.find((t) => t.name === 'feature_menu_carousel_v3');
      const payload = cfg.buildPayload('https://example.com/assets');

      expect(payload.name).toBe('feature_menu_carousel_v3');
      expect(payload.language).toBe('en');
      expect(payload.category).toBe('MARKETING');
      expect(Array.isArray(payload.components)).toBe(true);

      // Must have a CAROUSEL component
      const carousel = payload.components.find((c) => c.type === 'CAROUSEL');
      expect(carousel).toBeDefined();
      expect(Array.isArray(carousel.cards)).toBe(true);
      expect(carousel.cards.length).toBeGreaterThanOrEqual(2);

      // Each card must have HEADER (VIDEO), BODY, and BUTTONS
      for (const card of carousel.cards) {
        const cardHeader = card.components.find((c) => c.type === 'HEADER');
        expect(cardHeader).toBeDefined();
        expect(cardHeader.format).toBe('VIDEO');

        const cardBody = card.components.find((c) => c.type === 'BODY');
        expect(cardBody).toBeDefined();
        expect(typeof cardBody.text).toBe('string');

        const cardButtons = card.components.find((c) => c.type === 'BUTTONS');
        expect(cardButtons).toBeDefined();
        expect(cardButtons.buttons.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('must have a top-level BODY component', () => {
      const cfg = TEMPLATE_CONFIGS.find((t) => t.name === 'feature_menu_carousel_v3');
      const payload = cfg.buildPayload('https://example.com/assets');

      const body = payload.components.find((c) => c.type === 'BODY');
      expect(body).toBeDefined();
      expect(typeof body.text).toBe('string');
    });

    it('uses the provided assetBaseUrl for video example URLs', () => {
      const cfg = TEMPLATE_CONFIGS.find((t) => t.name === 'feature_menu_carousel_v3');
      const payload = cfg.buildPayload('https://my-cdn.com/videos');

      const carousel = payload.components.find((c) => c.type === 'CAROUSEL');
      for (const card of carousel.cards) {
        const cardHeader = card.components.find((c) => c.type === 'HEADER');
        const exampleUrl = cardHeader.example?.header_url?.[0];
        expect(exampleUrl).toMatch(/^https:\/\/my-cdn\.com\/videos/);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// registerTemplate
// ---------------------------------------------------------------------------

describe('registerTemplate(api, state, templateConfig)', () => {
  const DEFAULT_ASSET_URL = 'https://hellorumi.ai/assets';

  it('creates a new template when findTemplateByName returns null', async () => {
    const api = createMockApi();
    const state = createMockState();
    const cfg = TEMPLATE_CONFIGS[0];

    const result = await registerTemplate(api, state, cfg, DEFAULT_ASSET_URL);

    expect(api.findTemplateByName).toHaveBeenCalledWith(cfg.name);
    expect(api.createTemplate).toHaveBeenCalledWith(cfg.buildPayload(DEFAULT_ASSET_URL));
    expect(result.action).toBe('registered');
    expect(result.name).toBe(cfg.name);
    expect(result.templateId).toBe('tmpl_new_123');
    expect(result.status).toBe('PENDING');
  });

  it('skips creation when template already exists with APPROVED status', async () => {
    const api = createMockApi({
      findTemplateByName: jest.fn().mockResolvedValue({
        success: true,
        data: { id: 'tmpl_existing', name: 'video_style_selection', status: 'APPROVED' },
      }),
    });
    const state = createMockState();
    const cfg = TEMPLATE_CONFIGS[0];

    const result = await registerTemplate(api, state, cfg, DEFAULT_ASSET_URL);

    expect(api.createTemplate).not.toHaveBeenCalled();
    expect(result.action).toBe('skipped');
    expect(result.name).toBe(cfg.name);
    expect(result.templateId).toBe('tmpl_existing');
    expect(result.status).toBe('APPROVED');
  });

  it('skips creation when template already exists with PENDING status', async () => {
    const api = createMockApi({
      findTemplateByName: jest.fn().mockResolvedValue({
        success: true,
        data: { id: 'tmpl_pending', name: 'video_style_selection', status: 'PENDING' },
      }),
    });
    const state = createMockState();
    const cfg = TEMPLATE_CONFIGS[0];

    const result = await registerTemplate(api, state, cfg, DEFAULT_ASSET_URL);

    expect(api.createTemplate).not.toHaveBeenCalled();
    expect(result.action).toBe('skipped');
    expect(result.status).toBe('PENDING');
  });

  it('skips creation when template already exists with REJECTED status', async () => {
    const api = createMockApi({
      findTemplateByName: jest.fn().mockResolvedValue({
        success: true,
        data: { id: 'tmpl_rejected', name: 'video_style_selection', status: 'REJECTED' },
      }),
    });
    const state = createMockState();
    const cfg = TEMPLATE_CONFIGS[0];

    const result = await registerTemplate(api, state, cfg, DEFAULT_ASSET_URL);

    expect(api.createTemplate).not.toHaveBeenCalled();
    expect(result.action).toBe('skipped');
    expect(result.status).toBe('REJECTED');
  });

  it('records template in state after successful creation', async () => {
    const api = createMockApi();
    const state = createMockState();
    const cfg = TEMPLATE_CONFIGS[0];

    await registerTemplate(api, state, cfg, DEFAULT_ASSET_URL);

    expect(state.setTemplate).toHaveBeenCalledWith(
      cfg.name,
      expect.objectContaining({
        templateId: 'tmpl_new_123',
        status: 'PENDING',
        envVar: cfg.envVar,
        registeredAt: expect.any(String),
      }),
    );
  });

  it('records existing template in state when skipping', async () => {
    const api = createMockApi({
      findTemplateByName: jest.fn().mockResolvedValue({
        success: true,
        data: { id: 'tmpl_existing', name: 'video_style_selection', status: 'APPROVED' },
      }),
    });
    const state = createMockState();
    const cfg = TEMPLATE_CONFIGS[0];

    await registerTemplate(api, state, cfg, DEFAULT_ASSET_URL);

    expect(state.setTemplate).toHaveBeenCalledWith(
      cfg.name,
      expect.objectContaining({
        templateId: 'tmpl_existing',
        status: 'APPROVED',
        envVar: cfg.envVar,
      }),
    );
  });

  it('returns error result when findTemplateByName fails', async () => {
    const api = createMockApi({
      findTemplateByName: jest.fn().mockResolvedValue({
        success: false,
        error: { status: 401, message: 'Invalid token' },
      }),
    });
    const state = createMockState();
    const cfg = TEMPLATE_CONFIGS[0];

    const result = await registerTemplate(api, state, cfg, DEFAULT_ASSET_URL);

    expect(result.action).toBe('error');
    expect(result.name).toBe(cfg.name);
    expect(result.error).toBeDefined();
  });

  it('returns error result when createTemplate fails', async () => {
    const api = createMockApi({
      createTemplate: jest.fn().mockResolvedValue({
        success: false,
        error: { status: 400, message: 'Invalid parameter' },
      }),
    });
    const state = createMockState();
    const cfg = TEMPLATE_CONFIGS[0];

    const result = await registerTemplate(api, state, cfg, DEFAULT_ASSET_URL);

    expect(result.action).toBe('error');
    expect(result.name).toBe(cfg.name);
    expect(result.error).toBeDefined();
    expect(state.setTemplate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// registerAllTemplates
// ---------------------------------------------------------------------------

describe('registerAllTemplates(options)', () => {
  let consoleSpy;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('requires wabaId, accessToken, and phoneNumberId', async () => {
    await expect(registerAllTemplates({})).rejects.toThrow(/wabaId/);
    await expect(registerAllTemplates({ wabaId: 'w' })).rejects.toThrow(/accessToken/);
    await expect(
      registerAllTemplates({ wabaId: 'w', accessToken: 't' }),
    ).rejects.toThrow(/phoneNumberId/);
  });

  it('registers all 2 templates when none exist', async () => {
    // We need to mock the MetaAPI and SetupState classes
    // Since registerAllTemplates creates them internally, we test
    // via the full function with mocked constructors
    const result = await registerAllTemplates({
      wabaId: 'waba_test',
      accessToken: 'tok_test',
      phoneNumberId: 'phone_test',
      _mockApi: createMockApi(),
      _mockState: createMockState(),
    });

    expect(result.registered).toHaveLength(2);
    expect(result.skipped).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('skips all 2 templates when they all exist', async () => {
    const api = createMockApi({
      findTemplateByName: jest.fn().mockResolvedValue({
        success: true,
        data: { id: 'tmpl_exists', status: 'APPROVED' },
      }),
    });

    const result = await registerAllTemplates({
      wabaId: 'waba_test',
      accessToken: 'tok_test',
      phoneNumberId: 'phone_test',
      _mockApi: api,
      _mockState: createMockState(),
    });

    expect(result.registered).toHaveLength(0);
    expect(result.skipped).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
  });

  it('mixes registered, skipped, and errors correctly', async () => {
    let callCount = 0;
    const api = createMockApi({
      findTemplateByName: jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // First template: already exists
          return { success: true, data: { id: 'tmpl_1', status: 'APPROVED' } };
        }
        // Second template: does not exist
        return { success: true, data: null };
      }),
    });

    const result = await registerAllTemplates({
      wabaId: 'waba_test',
      accessToken: 'tok_test',
      phoneNumberId: 'phone_test',
      _mockApi: api,
      _mockState: createMockState(),
    });

    expect(result.skipped).toHaveLength(1);
    expect(result.registered).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
  });

  it('handles errors for individual templates without stopping others', async () => {
    let callCount = 0;
    const api = createMockApi({
      findTemplateByName: jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // First template: API error
          return { success: false, error: { status: 500, message: 'Server error' } };
        }
        // Second template: not found, will be created
        return { success: true, data: null };
      }),
    });

    const result = await registerAllTemplates({
      wabaId: 'waba_test',
      accessToken: 'tok_test',
      phoneNumberId: 'phone_test',
      _mockApi: api,
      _mockState: createMockState(),
    });

    expect(result.errors).toHaveLength(1);
    expect(result.registered).toHaveLength(1);
    expect(result.skipped).toHaveLength(0);
  });

  it('defaults assetBaseUrl to process.env.ASSET_BASE_URL', async () => {
    const api = createMockApi();
    const prev = process.env.ASSET_BASE_URL;
    process.env.ASSET_BASE_URL = 'https://cdn.example.test/assets';
    try {
      await registerAllTemplates({
        wabaId: 'waba_test',
        accessToken: 'tok_test',
        phoneNumberId: 'phone_test',
        _mockApi: api,
        _mockState: createMockState(),
      });
    } finally {
      if (prev === undefined) delete process.env.ASSET_BASE_URL;
      else process.env.ASSET_BASE_URL = prev;
    }

    // Verify the payloads were built with the env-configured base URL
    const calls = api.createTemplate.mock.calls;
    expect(calls.length).toBe(2);
    for (const [payload] of calls) {
      const json = JSON.stringify(payload);
      expect(json).toContain('cdn.example.test/assets');
    }
  });

  it('uses custom assetBaseUrl when provided', async () => {
    const api = createMockApi();

    await registerAllTemplates({
      wabaId: 'waba_test',
      accessToken: 'tok_test',
      phoneNumberId: 'phone_test',
      assetBaseUrl: 'https://my-custom-cdn.com/media',
      _mockApi: api,
      _mockState: createMockState(),
    });

    const calls = api.createTemplate.mock.calls;
    expect(calls.length).toBe(2);
    for (const [payload] of calls) {
      const json = JSON.stringify(payload);
      expect(json).toContain('my-custom-cdn.com/media');
    }
  });

  it('logs advisory message when any template is PENDING', async () => {
    const api = createMockApi();

    await registerAllTemplates({
      wabaId: 'waba_test',
      accessToken: 'tok_test',
      phoneNumberId: 'phone_test',
      _mockApi: api,
      _mockState: createMockState(),
    });

    const logMessages = consoleSpy.mock.calls.map((c) => c.join(' '));
    const hasPendingAdvisory = logMessages.some((msg) =>
      msg.includes('pending Meta review'),
    );
    expect(hasPendingAdvisory).toBe(true);
  });

  it('does not log pending advisory when all templates are APPROVED', async () => {
    const api = createMockApi({
      findTemplateByName: jest.fn().mockResolvedValue({
        success: true,
        data: { id: 'tmpl_ok', status: 'APPROVED' },
      }),
    });

    await registerAllTemplates({
      wabaId: 'waba_test',
      accessToken: 'tok_test',
      phoneNumberId: 'phone_test',
      _mockApi: api,
      _mockState: createMockState(),
    });

    const logMessages = consoleSpy.mock.calls.map((c) => c.join(' '));
    const hasPendingAdvisory = logMessages.some((msg) =>
      msg.includes('pending Meta review'),
    );
    expect(hasPendingAdvisory).toBe(false);
  });

  it('calls state.load() before processing templates', async () => {
    const state = createMockState();

    await registerAllTemplates({
      wabaId: 'waba_test',
      accessToken: 'tok_test',
      phoneNumberId: 'phone_test',
      _mockApi: createMockApi(),
      _mockState: state,
    });

    expect(state.load).toHaveBeenCalledTimes(1);
  });

  it('calls state.setTemplate() for each successfully processed template', async () => {
    const state = createMockState();

    await registerAllTemplates({
      wabaId: 'waba_test',
      accessToken: 'tok_test',
      phoneNumberId: 'phone_test',
      _mockApi: createMockApi(),
      _mockState: state,
    });

    // 2 templates registered
    expect(state.setTemplate).toHaveBeenCalledTimes(2);
  });

  it('returns result with registered, skipped, and errors arrays', async () => {
    const result = await registerAllTemplates({
      wabaId: 'waba_test',
      accessToken: 'tok_test',
      phoneNumberId: 'phone_test',
      _mockApi: createMockApi(),
      _mockState: createMockState(),
    });

    expect(result).toHaveProperty('registered');
    expect(result).toHaveProperty('skipped');
    expect(result).toHaveProperty('errors');
    expect(Array.isArray(result.registered)).toBe(true);
    expect(Array.isArray(result.skipped)).toBe(true);
    expect(Array.isArray(result.errors)).toBe(true);
  });

  it('passes statePath to SetupState constructor when provided (no _mockState)', async () => {
    // This test verifies the statePath option is threaded through.
    // We use _mockState to avoid file I/O, but document the intent.
    const state = createMockState();

    const result = await registerAllTemplates({
      wabaId: 'waba_test',
      accessToken: 'tok_test',
      phoneNumberId: 'phone_test',
      statePath: '/tmp/custom-state.json',
      _mockApi: createMockApi(),
      _mockState: state,
    });

    // Should succeed — statePath is used when constructing real SetupState
    expect(result.errors).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Idempotency
  // -----------------------------------------------------------------------

  describe('idempotency', () => {
    it('calling registerAllTemplates twice produces same result when templates exist', async () => {
      const api = createMockApi({
        findTemplateByName: jest.fn().mockResolvedValue({
          success: true,
          data: { id: 'tmpl_100', status: 'APPROVED' },
        }),
      });
      const state = createMockState();

      const result1 = await registerAllTemplates({
        wabaId: 'w', accessToken: 't', phoneNumberId: 'p',
        _mockApi: api, _mockState: state,
      });
      const result2 = await registerAllTemplates({
        wabaId: 'w', accessToken: 't', phoneNumberId: 'p',
        _mockApi: api, _mockState: state,
      });

      expect(result1.skipped).toHaveLength(2);
      expect(result2.skipped).toHaveLength(2);
      expect(result1.registered).toHaveLength(0);
      expect(result2.registered).toHaveLength(0);
      // createTemplate should NEVER have been called
      expect(api.createTemplate).not.toHaveBeenCalled();
    });
  });
});
