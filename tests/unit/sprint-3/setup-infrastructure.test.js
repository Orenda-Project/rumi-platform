/**
 * Sprint 3: Setup Infrastructure Tests (bd-242 to bd-250)
 *
 * Validates that the setup tooling exists and works:
 * - Environment validator
 * - Connection test script
 * - Claude Code configuration
 * - /setup skill
 * - .env.template completeness
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../');

describe('Setup Infrastructure', () => {
  describe('Environment Validator', () => {
    test('validate-env.js exists', () => {
      expect(fs.existsSync(path.join(ROOT, 'bot/scripts/validate-env.js'))).toBe(true);
    });

    test('exports validateEnv function', () => {
      const { validateEnv } = require(path.join(ROOT, 'bot/scripts/validate-env.js'));
      expect(typeof validateEnv).toBe('function');
    });

    test('validateEnv returns valid:false when required vars missing', () => {
      const originalTier = process.env.RUMI_TIER;
      const originalKey = process.env.OPENROUTER_API_KEY;
      process.env.RUMI_TIER = 'minimal';
      delete process.env.WHATSAPP_TOKEN;
      delete process.env.OPENROUTER_API_KEY;

      jest.resetModules();
      const { validateEnv } = require(path.join(ROOT, 'bot/scripts/validate-env.js'));
      const result = validateEnv();
      expect(result.valid).toBe(false);
      expect(result.missing.length).toBeGreaterThan(0);

      process.env.RUMI_TIER = originalTier;
      process.env.OPENROUTER_API_KEY = originalKey;
    });

    test('validateEnv returns tier name', () => {
      const { validateEnv } = require(path.join(ROOT, 'bot/scripts/validate-env.js'));
      const result = validateEnv();
      expect(result.tier).toBeDefined();
      expect(typeof result.tier).toBe('string');
    });
  });

  describe('Connection Test Script', () => {
    test('test-connections.js exists', () => {
      expect(fs.existsSync(path.join(ROOT, 'infrastructure/scripts/test-connections.js'))).toBe(true);
    });

    test('exports testSupabase, testRedis, testLLM functions', () => {
      const mod = require(path.join(ROOT, 'infrastructure/scripts/test-connections.js'));
      expect(typeof mod.testSupabase).toBe('function');
      expect(typeof mod.testRedis).toBe('function');
      expect(typeof mod.testLLM).toBe('function');
    });

    test('exports runTests function', () => {
      const mod = require(path.join(ROOT, 'infrastructure/scripts/test-connections.js'));
      expect(typeof mod.runTests).toBe('function');
    });
  });

  describe('Claude Code Configuration', () => {
    test('.claude/CLAUDE.md exists', () => {
      expect(fs.existsSync(path.join(ROOT, '.claude/CLAUDE.md'))).toBe(true);
    });

    test('CLAUDE.md mentions key project sections', () => {
      const content = fs.readFileSync(path.join(ROOT, '.claude/CLAUDE.md'), 'utf8');
      expect(content).toContain('bot/');
      expect(content).toContain('Feature Tiers');
      expect(content).toContain('branding.js');
    });

    test('.claude/settings.json exists with MCP config', () => {
      const settingsPath = path.join(ROOT, '.claude/settings.json');
      expect(fs.existsSync(settingsPath)).toBe(true);
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      expect(settings.mcpServers).toBeDefined();
      expect(settings.mcpServers.supabase).toBeDefined();
    });
  });

  describe('/setup Skill', () => {
    test('setup skill.md exists', () => {
      expect(fs.existsSync(path.join(ROOT, '.claude/skills/setup/skill.md'))).toBe(true);
    });

    test('skill.md describes the setup flow', () => {
      const content = fs.readFileSync(path.join(ROOT, '.claude/skills/setup/skill.md'), 'utf8');
      expect(content).toContain('/setup');
      expect(content).toContain('Tier');
      expect(content).toContain('Supabase');
      expect(content).toContain('Railway');
      expect(content).toContain('OpenRouter');
    });

    test('skill.md mentions resume capability', () => {
      const content = fs.readFileSync(path.join(ROOT, '.claude/skills/setup/skill.md'), 'utf8');
      expect(content).toContain('.setup-state.json');
    });
  });

  describe('.env.template Completeness', () => {
    let template;

    beforeAll(() => {
      template = fs.readFileSync(path.join(ROOT, '.env.template'), 'utf8');
    });

    test('.env.template exists', () => {
      expect(template).toBeDefined();
    });

    test('contains all core required variables', () => {
      const required = [
        'SUPABASE_URL',
        'SUPABASE_SERVICE_KEY',
        'REDIS_URL',
        'OPENROUTER_API_KEY',
        'WHATSAPP_TOKEN',
        'PHONE_NUMBER_ID',
        'WEBHOOK_VERIFY_TOKEN',
        'WABA_ID',
        'RUMI_TIER',
        'LLM_PROVIDER',
      ];
      for (const v of required) {
        expect(template).toContain(v);
      }
    });

    test('contains tier-specific variables', () => {
      expect(template).toContain('SONIOX_API_KEY');
      expect(template).toContain('ELEVENLABS_API_KEY');
      expect(template).toContain('GAMMA_API_KEY');
    });

    test('contains tier explanation comments', () => {
      expect(template).toContain('Tier 1');
      expect(template).toContain('Tier 2');
      expect(template).toContain('Tier 3');
    });

    test('does NOT contain real credentials', () => {
      expect(template).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
      expect(template).not.toMatch(/eyJhbGciOi/);
    });
  });
});
