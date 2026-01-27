/**
 * Sprint 4: Documentation Completeness Tests (bd-251 to bd-258)
 *
 * Validates that all required documentation files exist and
 * contain the expected content for clone users.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../');

describe('Documentation Completeness', () => {
  describe('README.md', () => {
    let readme;
    beforeAll(() => {
      readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
    });

    test('README.md exists at repo root', () => {
      expect(readme).toBeDefined();
    });

    test('contains project description', () => {
      expect(readme).toContain('AI Teaching Assistant');
      expect(readme).toContain('WhatsApp');
    });

    test('contains quick start instructions', () => {
      expect(readme).toContain('Quick Start');
      expect(readme).toContain('git clone');
    });

    test('describes feature tiers', () => {
      expect(readme).toContain('Minimal');
      expect(readme).toContain('Recommended');
      expect(readme).toContain('Full');
    });

    test('lists technology stack', () => {
      expect(readme).toContain('Node.js');
      expect(readme).toContain('Supabase');
      expect(readme).toContain('BullMQ');
      expect(readme).toContain('OpenRouter');
    });

    test('mentions /setup command', () => {
      expect(readme).toContain('/setup');
    });

    test('links to SETUP.md', () => {
      expect(readme).toContain('SETUP.md');
    });

    test('contains license info', () => {
      expect(readme).toContain('Apache');
    });
  });

  describe('SETUP.md', () => {
    let setup;
    beforeAll(() => {
      setup = fs.readFileSync(path.join(ROOT, 'SETUP.md'), 'utf8');
    });

    test('SETUP.md exists', () => {
      expect(setup).toBeDefined();
    });

    test('lists prerequisites', () => {
      expect(setup).toContain('Node.js');
      expect(setup).toContain('Supabase');
      expect(setup).toContain('Railway');
      expect(setup).toContain('OpenRouter');
    });

    test('has step-by-step instructions', () => {
      expect(setup).toContain('Step 1');
      expect(setup).toContain('Step 2');
    });

    test('mentions schema SQL files', () => {
      expect(setup).toContain('00_complete-schema.sql');
    });

    test('includes troubleshooting section', () => {
      expect(setup).toContain('Troubleshooting');
    });
  });

  describe('Procfile', () => {
    test('Procfile exists in infrastructure/railway/', () => {
      const procfile = fs.readFileSync(path.join(ROOT, 'infrastructure/railway/Procfile'), 'utf8');
      expect(procfile).toContain('web:');
      expect(procfile).toContain('worker:');
    });

    test('web process runs whatsapp-bot.js', () => {
      const procfile = fs.readFileSync(path.join(ROOT, 'infrastructure/railway/Procfile'), 'utf8');
      expect(procfile).toContain('whatsapp-bot.js');
    });

    test('worker process runs bullmq-worker.js', () => {
      const procfile = fs.readFileSync(path.join(ROOT, 'infrastructure/railway/Procfile'), 'utf8');
      expect(procfile).toContain('bullmq-worker.js');
    });
  });

  describe('Railway config', () => {
    test('railway.json exists', () => {
      const config = JSON.parse(
        fs.readFileSync(path.join(ROOT, 'infrastructure/railway/railway.json'), 'utf8')
      );
      expect(config.deploy).toBeDefined();
      expect(config.deploy.healthcheckPath).toBe('/health');
    });
  });

  describe('docs/ directory', () => {
    test('architecture.md exists', () => {
      expect(fs.existsSync(path.join(ROOT, 'docs/architecture.md'))).toBe(true);
    });

    test('customization.md exists', () => {
      expect(fs.existsSync(path.join(ROOT, 'docs/customization.md'))).toBe(true);
    });

    test('cost-guide.md exists', () => {
      expect(fs.existsSync(path.join(ROOT, 'docs/cost-guide.md'))).toBe(true);
    });

    test('architecture.md describes key services', () => {
      const arch = fs.readFileSync(path.join(ROOT, 'docs/architecture.md'), 'utf8');
      expect(arch).toContain('LLM Client');
      expect(arch).toContain('BullMQ');
      expect(arch).toContain('Supabase');
    });

    test('customization.md covers branding', () => {
      const custom = fs.readFileSync(path.join(ROOT, 'docs/customization.md'), 'utf8');
      expect(custom).toContain('BOT_NAME');
      expect(custom).toContain('branding.js');
    });
  });

  describe('.github/', () => {
    test('CONTRIBUTING.md exists', () => {
      expect(fs.existsSync(path.join(ROOT, '.github/CONTRIBUTING.md'))).toBe(true);
    });

    test('CONTRIBUTING.md has testing section', () => {
      const contrib = fs.readFileSync(path.join(ROOT, '.github/CONTRIBUTING.md'), 'utf8');
      expect(contrib).toContain('npm test');
    });
  });
});
