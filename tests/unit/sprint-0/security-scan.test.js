/**
 * Sprint 0: Security Scan Tests
 *
 * These tests verify the monorepo is safe for public release:
 * - No hardcoded credentials
 * - No exec_sql function
 * - No bugbuster code
 * - .gitignore covers all sensitive patterns
 * - Monorepo structure is correct
 *
 * @bead bd-220, bd-223, bd-224, bd-225, bd-234
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../../..');

// Helper: recursively get all files matching a glob pattern
function getAllFiles(dir, extensions = ['.js', '.ts', '.tsx', '.json', '.sql']) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (['node_modules', '.git', 'dist', 'build', 'coverage'].includes(item.name)) continue;
      results.push(...getAllFiles(fullPath, extensions));
    } else if (extensions.some(ext => item.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

describe('Security Scan', () => {

  describe('Monorepo Structure', () => {
    test('all required directories exist', () => {
      const requiredDirs = [
        'bot',
        'dashboard',
        'portal',
        'infrastructure',
        'docs',
        '.claude',
        'tests',
      ];
      requiredDirs.forEach(dir => {
        expect(fs.existsSync(path.join(ROOT, dir))).toBe(true);
      });
    });

    test('bot/ has key subdirectories', () => {
      const requiredBotDirs = [
        'bot/shared/config',
        'bot/shared/services',
        'bot/shared/handlers',
        'bot/workers',
      ];
      requiredBotDirs.forEach(dir => {
        expect(fs.existsSync(path.join(ROOT, dir))).toBe(true);
      });
    });

    test('infrastructure/ has supabase and railway dirs', () => {
      expect(fs.existsSync(path.join(ROOT, 'infrastructure/supabase'))).toBe(true);
      expect(fs.existsSync(path.join(ROOT, 'infrastructure/railway'))).toBe(true);
    });
  });

  describe('.gitignore Coverage', () => {
    let gitignore;

    beforeAll(() => {
      gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
    });

    test('.gitignore exists', () => {
      expect(gitignore).toBeDefined();
      expect(gitignore.length).toBeGreaterThan(0);
    });

    test('.gitignore covers all sensitive patterns', () => {
      const required = [
        '.env',
        'keys/',
        '*.pem',
        'temp/',
        'node_modules/',
        '.setup-state.json',
        '*.key',
        'credentials',
      ];
      required.forEach(pattern => {
        expect(gitignore).toContain(pattern);
      });
    });
  });

  describe('No Hardcoded Credentials', () => {
    const credentialPatterns = [
      // OpenAI API keys
      /sk-[a-zA-Z0-9]{20,}/,
      // Supabase service role keys (JWT format)
      /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/,
      // AWS access keys
      /AKIA[A-Z0-9]{16}/,
      // Generic long hex tokens (32+ chars)
      /['"][0-9a-f]{32,}['"]/,
    ];

    test('no hardcoded API keys in bot/ source files', () => {
      const files = getAllFiles(path.join(ROOT, 'bot/shared'));
      for (const file of files) {
        // Skip test files and fixtures
        if (file.includes('test') || file.includes('fixture') || file.includes('mock')) continue;
        const content = fs.readFileSync(file, 'utf8');
        credentialPatterns.forEach(pattern => {
          const match = content.match(pattern);
          if (match) {
            // Allow matches in comments or env var references
            const line = content.split('\n').find(l => l.includes(match[0]));
            if (line && !line.trim().startsWith('//') && !line.includes('process.env')) {
              fail(`Potential credential in ${file}: ${match[0].substring(0, 20)}...`);
            }
          }
        });
      }
    });

    test('no hardcoded API keys in dashboard/ source files', () => {
      const files = getAllFiles(path.join(ROOT, 'dashboard'));
      for (const file of files) {
        if (file.includes('test') || file.includes('fixture') || file.includes('mock')) continue;
        if (file.includes('node_modules')) continue;
        const content = fs.readFileSync(file, 'utf8');
        credentialPatterns.forEach(pattern => {
          const match = content.match(pattern);
          if (match) {
            const line = content.split('\n').find(l => l.includes(match[0]));
            if (line && !line.trim().startsWith('//') && !line.includes('process.env')) {
              fail(`Potential credential in ${file}: ${match[0].substring(0, 20)}...`);
            }
          }
        });
      }
    });
  });

  describe('exec_sql Removal', () => {
    test('no exec_sql RPC calls in any source file (except safe placeholder comment)', () => {
      const allFiles = [
        ...getAllFiles(path.join(ROOT, 'bot')),
        ...getAllFiles(path.join(ROOT, 'dashboard')),
        ...getAllFiles(path.join(ROOT, 'infrastructure')),
      ];

      for (const file of allFiles) {
        const content = fs.readFileSync(file, 'utf8');
        // Find actual exec_sql function calls (not comments)
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.includes('exec_sql') && !line.trim().startsWith('//') && !line.trim().startsWith('*') && !line.trim().startsWith('#')) {
            // Allow the safe AMA placeholder which mentions exec_sql in description only
            if (file.includes('ama.service.js') && line.includes('exec_sql RPC function')) continue;
            fail(`Active exec_sql reference found at ${file}:${i + 1}: ${line.trim()}`);
          }
        }
      }
    });

    test('no exec_sql SQL migration files exist', () => {
      const sqlFiles = getAllFiles(path.join(ROOT, 'infrastructure/supabase'), ['.sql']);
      for (const file of sqlFiles) {
        const content = fs.readFileSync(file, 'utf8');
        expect(content).not.toMatch(/CREATE.*FUNCTION.*exec_sql/i);
      }
    });
  });

  describe('Bugbuster Removal', () => {
    test('no bugbuster/ directory exists', () => {
      expect(fs.existsSync(path.join(ROOT, 'bot/bugbuster'))).toBe(false);
    });

    test('no bugbuster route files exist', () => {
      expect(fs.existsSync(path.join(ROOT, 'dashboard/routes/bugbuster.routes.js'))).toBe(false);
    });

    test('no bugbuster service files exist', () => {
      expect(fs.existsSync(path.join(ROOT, 'dashboard/services/bugbuster.service.js'))).toBe(false);
    });

    test('no bugbuster view files exist', () => {
      expect(fs.existsSync(path.join(ROOT, 'dashboard/views/bugbuster.ejs'))).toBe(false);
      expect(fs.existsSync(path.join(ROOT, 'dashboard/views/bugbuster-run.ejs'))).toBe(false);
    });

    test('no bugbuster SQL migration exists', () => {
      expect(fs.existsSync(path.join(ROOT, 'bot/database/migrations/20251219_bugbuster_tables.sql'))).toBe(false);
    });
  });

  describe('LICENSE', () => {
    test('LICENSE file exists at repo root', () => {
      expect(fs.existsSync(path.join(ROOT, 'LICENSE'))).toBe(true);
    });

    test('LICENSE contains Apache License, Version 2.0', () => {
      const license = fs.readFileSync(path.join(ROOT, 'LICENSE'), 'utf8');
      expect(license).toContain('Apache License');
      expect(license).toContain('Version 2.0');
    });

    test('LICENSE contains Taleemabad copyright', () => {
      const license = fs.readFileSync(path.join(ROOT, 'LICENSE'), 'utf8');
      expect(license).toContain('Taleemabad');
    });
  });
});
