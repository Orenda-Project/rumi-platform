/**
 * Sprint 1 TDD: Taleemabad Content Stripping Tests (bd-233)
 *
 * Ensures no Taleemabad-specific content remains in source code,
 * except in LICENSE, docs, and config files where attribution is appropriate.
 */

const fs = require('fs');
const path = require('path');

const MONOREPO_ROOT = path.resolve(__dirname, '../../../');

function getAllJsFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      results.push(...getAllJsFiles(fullPath));
    } else if (entry.name.endsWith('.js') || entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      results.push(fullPath);
    }
  }
  return results;
}

describe('Taleemabad Content Stripping', () => {
  describe('no Taleemabad references in bot source code', () => {
    test('no hardcoded "Taleemabad" in bot/shared/**/*.js (except config/branding)', () => {
      const files = getAllJsFiles(path.join(MONOREPO_ROOT, 'bot/shared'));
      const violations = [];

      for (const file of files) {
        // Allow branding.js to mention it in default orgName
        if (file.includes('branding.js')) continue;
        // Allow feature-tiers.js
        if (file.includes('feature-tiers.js')) continue;
        // Allow version-check.js which references the upstream GitHub repo URL
        if (file.includes('version-check.js')) continue;
        // Allow registration-data.js which lists Taleemabad as a valid organization
        if (file.includes('registration-data.js')) continue;

        const content = fs.readFileSync(file, 'utf8');
        if (/taleemabad/i.test(content)) {
          const relPath = path.relative(MONOREPO_ROOT, file);
          violations.push(relPath);
        }
      }

      expect(violations).toEqual([]);
    });

    test('no internal Taleemabad URLs in source code', () => {
      const files = getAllJsFiles(path.join(MONOREPO_ROOT, 'bot'));
      const internalUrlPatterns = [
        /taleemabad\.com/i,
        /taleemabad\.pk/i,
        /oraan\.com/i,
        /internal\.taleemabad/i,
      ];
      const violations = [];

      for (const file of files) {
        if (file.includes('node_modules')) continue;
        const content = fs.readFileSync(file, 'utf8');
        for (const pattern of internalUrlPatterns) {
          if (pattern.test(content)) {
            violations.push({
              file: path.relative(MONOREPO_ROOT, file),
              pattern: pattern.source,
            });
          }
        }
      }

      expect(violations).toEqual([]);
    });

    test('no hardcoded Taleemabad phone numbers in source', () => {
      const files = getAllJsFiles(path.join(MONOREPO_ROOT, 'bot'));
      const phonePatterns = [
        /329\s*501\s*2345/,  // Production number
        /326\s*833\s*8870/,  // Staging number
        /326\s*833\s*8872/,  // E2E test number
      ];
      const violations = [];

      for (const file of files) {
        if (file.includes('node_modules')) continue;
        const content = fs.readFileSync(file, 'utf8');
        for (const pattern of phonePatterns) {
          if (pattern.test(content)) {
            violations.push({
              file: path.relative(MONOREPO_ROOT, file),
              pattern: pattern.source,
            });
          }
        }
      }

      expect(violations).toEqual([]);
    });
  });

  describe('branding.js does NOT hardcode Taleemabad as default', () => {
    test('default botName is "Rumi" not "Taleemabad"', () => {
      const branding = require(path.resolve(MONOREPO_ROOT, 'bot/shared/config/branding.js'));
      expect(branding.botName).not.toMatch(/taleemabad/i);
    });

    test('default orgName does not contain "Taleemabad"', () => {
      const branding = require(path.resolve(MONOREPO_ROOT, 'bot/shared/config/branding.js'));
      expect(branding.orgName).not.toMatch(/taleemabad/i);
    });
  });
});
